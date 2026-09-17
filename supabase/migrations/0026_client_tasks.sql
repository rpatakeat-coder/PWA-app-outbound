-- ============================================================================
-- Aba de Tarefas — tarefas geradas automaticamente pros vendedores a partir
-- do estado dos leads/clientes deles.
--
-- Fonte da verdade: tabela client_tasks no banco (nao no app). Uma funcao
-- generate_client_tasks() aplica as REGRAS e faz upsert/auto-resolucao das
-- tarefas. Ela pode ser chamada:
--   - por um cron (pg_cron) — recomendado em producao;
--   - manualmente pelo app na abertura (rpc), pra refletir rapido.
--
-- Regra inicial (v1):
--   Lead em QUALIFICAÇÃO ha >= 2 dias E sem reuniao ('reuniao') futura
--   agendada  ->  tarefa "Agendar Demo".
--     - >= 2 dias  -> severidade D2  (title "D2 Agendar Demo")
--     - >= 5 dias  -> severidade D5  (escala a mesma tarefa de D2 pra D5)
--   Se o lead ganhar reuniao futura OU sair da etapa QUALIFICAÇÃO, a tarefa
--   pendente eh auto-resolvida (status 'resolvida_auto'). Tarefas ja
--   concluidas/dispensadas pelo usuario nao sao mexidas.
--
-- Adicionar novas regras no futuro = novo bloco dentro de generate_client_tasks
-- com um task_type proprio. O app le tudo de client_tasks sem saber das regras.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- Identificador da REGRA que gerou a tarefa. Um lead so pode ter 1 tarefa
  -- "aberta" por task_type (unique parcial abaixo). Ex.: 'agendar_demo'.
  task_type    text NOT NULL,
  -- Severidade/urgencia da tarefa no momento. 'D2' | 'D5' pro agendar_demo.
  -- Generico o suficiente pra outras regras usarem seus proprios niveis.
  severity     text,
  -- Titulo exibido pro usuario (ex.: "D5 Agendar Demo"). Recomputado a cada
  -- geracao pra refletir a severidade atual.
  title        text NOT NULL,
  -- Estado da tarefa:
  --   pendente        -> aparece pro usuario, conta na notificacao
  --   concluida       -> usuario marcou como feita
  --   dispensada      -> usuario descartou manualmente
  --   resolvida_auto  -> a condicao que gerou deixou de valer (ganhou reuniao,
  --                      saiu da etapa). Nao conta como pendente nem como
  --                      "feita pelo vendedor".
  status       text NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente','concluida','dispensada','resolvida_auto')),
  -- Responsavel pela tarefa: id_hubspot do vendedor dono do lead. Permite a
  -- notificacao/aba filtrar "minhas tarefas" igual o resto do app.
  vendedor_id_hubspot text,
  -- Snapshot de contexto pra UI e auditoria (dias na etapa, etapa, etc.).
  meta         jsonb,
  -- Quando a tarefa foi criada pela primeira vez.
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Ultima vez que a geracao tocou a linha (recalculo de severidade, etc.).
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Quando saiu de 'pendente' (concluida/dispensada/resolvida_auto).
  resolved_at  timestamptz,
  -- Quem concluiu/dispensou manualmente (null quando resolvida_auto/pendente).
  resolved_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Um lead so pode ter UMA tarefa aberta (pendente) por regra. Isso impede
-- duplicacao mesmo se a funcao rodar concorrente (cron + app ao mesmo tempo).
-- Tarefas ja resolvidas (concluida/dispensada/resolvida_auto) nao entram no
-- indice, entao o historico acumula normalmente.
CREATE UNIQUE INDEX IF NOT EXISTS client_tasks_open_unique
  ON public.client_tasks (client_id, task_type)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS client_tasks_status_idx
  ON public.client_tasks (status);
CREATE INDEX IF NOT EXISTS client_tasks_vendedor_idx
  ON public.client_tasks (vendedor_id_hubspot);
CREATE INDEX IF NOT EXISTS client_tasks_client_idx
  ON public.client_tasks (client_id);

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

-- Leitura: todo autenticado le todas as tarefas (mesma abordagem de
-- client_meetings/stage_changes; o recorte "minhas" e feito no app).
DROP POLICY IF EXISTS client_tasks_select ON public.client_tasks;
CREATE POLICY client_tasks_select ON public.client_tasks
  FOR SELECT TO authenticated USING (true);

-- Update: autenticado pode concluir/dispensar tarefas (marca resolved_by).
-- A criacao/auto-resolucao vem da funcao SECURITY DEFINER, nao do usuario,
-- entao nao ha policy de INSERT pra role authenticated (evita forjar tarefa).
DROP POLICY IF EXISTS client_tasks_update ON public.client_tasks;
CREATE POLICY client_tasks_update ON public.client_tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- updated_at automatico
CREATE OR REPLACE FUNCTION public.client_tasks_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_tasks_set_updated_at ON public.client_tasks;
CREATE TRIGGER client_tasks_set_updated_at
BEFORE UPDATE ON public.client_tasks
FOR EACH ROW EXECUTE FUNCTION public.client_tasks_set_updated_at();

-- ============================================================================
-- Motor de regras. Idempotente: pode rodar quantas vezes quiser.
-- Retorna a quantidade de tarefas pendentes apos rodar (util pro app).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_client_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending integer;
  -- Ancora de ativacao da feature. Leads SEM historico de mudanca de etapa
  -- contam a partir desta data (nao do created_at antigo) — evita gerar
  -- tarefas retroativas pra leads que ja estavam parados ha dias quando a
  -- feature subiu. Assim que o lead passar pelo modal de etapa, o registro
  -- real em client_stage_changes (entered_at, prioritario) assume.
  v_activation constant timestamptz := timestamptz '2026-07-08 00:00:00+00';
BEGIN
  -- ----------------------------------------------------------------------
  -- REGRA: agendar_demo
  -- Leads em QUALIFICAÇÃO, sem reuniao futura, com >= 2 dias na etapa.
  -- ----------------------------------------------------------------------

  -- (a) CTE com os leads elegiveis + dias na etapa + severidade alvo.
  WITH stage_entry AS (
    -- Data de entrada na etapa QUALIFICAÇÃO: ultima mudanca registrada
    -- pra essa etapa. Fallback (COALESCE mais abaixo) quando nao ha historico.
    SELECT client_id, max(created_at) AS entered_at
    FROM public.client_stage_changes
    WHERE to_stage = 'QUALIFICAÇÃO'
    GROUP BY client_id
  ),
  eligible AS (
    SELECT
      c.id AS client_id,
      c.vendedor_id_hubspot,
      -- Dias inteiros desde a entrada na etapa. Sem historico de mudanca de
      -- etapa, conta a partir de max(created_at, ancora de ativacao) — ou seja,
      -- nunca antes da data em que a feature subiu. NAO usamos updated_at
      -- (ruidoso). Assim que o lead passar pelo modal de etapa, entered_at
      -- (prioritario) vira a data real de entrada.
      floor(
        extract(epoch FROM (now() - COALESCE(se.entered_at, greatest(c.created_at, v_activation))))
        / 86400.0
      )::int AS days_in_stage
    FROM public.clients c
    LEFT JOIN stage_entry se ON se.client_id = c.id
    WHERE c.etapa = 'QUALIFICAÇÃO'
      AND c.status = 'lead'
      -- Sem reuniao ('reuniao') futura agendada pro cliente.
      AND NOT EXISTS (
        SELECT 1 FROM public.client_meetings m
        WHERE m.client_id = c.id
          AND m.type = 'reuniao'
          AND m.status = 'agendada'
          AND m.scheduled_at > now()
      )
  ),
  targeted AS (
    SELECT
      client_id,
      vendedor_id_hubspot,
      days_in_stage,
      CASE
        WHEN days_in_stage >= 5 THEN 'D5'
        WHEN days_in_stage >= 2 THEN 'D2'
        ELSE NULL
      END AS severity
    FROM eligible
  ),
  to_upsert AS (
    SELECT * FROM targeted WHERE severity IS NOT NULL
  )
  -- (b) Upsert das tarefas pendentes. ON CONFLICT no indice parcial de
  -- (client_id, task_type) WHERE pendente: se ja existe pendente, so
  -- atualiza severidade/titulo/meta (escala D2 -> D5, nunca desce D5 -> D2
  -- pra nao "aliviar" uma tarefa que ja passou de 5 dias).
  INSERT INTO public.client_tasks
    (client_id, task_type, severity, title, status, vendedor_id_hubspot, meta)
  SELECT
    t.client_id,
    'agendar_demo',
    t.severity,
    t.severity || ' Agendar Demo',
    'pendente',
    t.vendedor_id_hubspot,
    jsonb_build_object('days_in_stage', t.days_in_stage, 'etapa', 'QUALIFICAÇÃO')
  FROM to_upsert t
  ON CONFLICT (client_id, task_type) WHERE (status = 'pendente')
  DO UPDATE SET
    severity = CASE
                 WHEN EXCLUDED.severity = 'D5' THEN 'D5'
                 ELSE public.client_tasks.severity
               END,
    title = CASE
              WHEN EXCLUDED.severity = 'D5' THEN 'D5 Agendar Demo'
              ELSE public.client_tasks.title
            END,
    vendedor_id_hubspot = EXCLUDED.vendedor_id_hubspot,
    meta = EXCLUDED.meta,
    updated_at = now();

  -- (c) Auto-resolucao: tarefas agendar_demo pendentes cujo lead NAO esta
  -- mais elegivel (ganhou reuniao futura, saiu da etapa, virou cliente/churn,
  -- ou caiu abaixo de 2 dias — o que na pratica nao acontece, mas cobre o
  -- caso de correcao manual de data). Marca resolvida_auto.
  UPDATE public.client_tasks ct
  SET status = 'resolvida_auto', resolved_at = now()
  WHERE ct.task_type = 'agendar_demo'
    AND ct.status = 'pendente'
    AND ct.client_id NOT IN (SELECT client_id FROM (
      -- recomputa elegiveis (mesma logica do bloco a) — mantido inline
      -- pra funcao ser autocontida.
      WITH stage_entry AS (
        SELECT client_id, max(created_at) AS entered_at
        FROM public.client_stage_changes
        WHERE to_stage = 'QUALIFICAÇÃO'
        GROUP BY client_id
      )
      SELECT c.id AS client_id
      FROM public.clients c
      LEFT JOIN stage_entry se ON se.client_id = c.id
      WHERE c.etapa = 'QUALIFICAÇÃO'
        AND c.status = 'lead'
        AND floor(extract(epoch FROM (now() - COALESCE(se.entered_at, greatest(c.created_at, v_activation)))) / 86400.0)::int >= 2
        AND NOT EXISTS (
          SELECT 1 FROM public.client_meetings m
          WHERE m.client_id = c.id
            AND m.type = 'reuniao'
            AND m.status = 'agendada'
            AND m.scheduled_at > now()
        )
    ) still_eligible);

  SELECT count(*) INTO v_pending
  FROM public.client_tasks WHERE status = 'pendente';

  RETURN v_pending;
END;
$$;

-- Permite o app (role authenticated) disparar a geracao via rpc.
GRANT EXECUTE ON FUNCTION public.generate_client_tasks() TO authenticated;

COMMENT ON TABLE public.client_tasks IS
  'Tarefas geradas automaticamente por generate_client_tasks(). Fonte da verdade das tarefas; o app so le e conclui/dispensa.';
COMMENT ON FUNCTION public.generate_client_tasks() IS
  'Aplica as regras de geracao de tarefas (v1: agendar_demo D2/D5 pra leads em QUALIFICAÇÃO sem reuniao futura). Idempotente. Retorna qtd de tarefas pendentes.';

-- ============================================================================
-- Cron (opcional / producao). Descomente se pg_cron estiver habilitado.
-- Roda a cada 30 min pra manter as tarefas em dia sem depender do app.
-- ============================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('generate_client_tasks_every_30min', '*/30 * * * *',
--   $$SELECT public.generate_client_tasks();$$);
