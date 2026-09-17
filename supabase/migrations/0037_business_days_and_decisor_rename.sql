-- ============================================================================
-- 1) Tarefas passam a contar prazos em DIAS UTEIS (seg-sex, fuso Sao Paulo).
--    Lead que entra na etapa sexta a noite so "faz 2 dias" na terca — fim de
--    semana nao conta pro D2/D5 nem pros SLAs por etapa.
-- 2) FIX: etapa 1395880470 foi renomeada no HubSpot de "Diagnóstico" pra
--    "Conversa com decisor" (mesmo id). stage_sla e o gerador ainda filtravam
--    pelo label antigo, entao leads na etapa renomeada NAO geravam a tarefa
--    "Agendar Demo". Atualiza stage_sla, os leads com label velho e o gerador
--    (que passa a aceitar os dois labels por robustez).
-- ============================================================================

-- Dias uteis (seg-sex) COMPLETOS entre dois instantes, no fuso de Sao Paulo.
-- Conta os dias d em (data(inicio), data(fim)] com isodow < 6. Ex.: entrou
-- sexta -> sabado/domingo 0, segunda 1, terca 2.
CREATE OR REPLACE FUNCTION public.business_days_between(t_start timestamptz, t_end timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::int
  FROM generate_series(
    ((t_start AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp,
    ((t_end   AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp,
    interval '1 day'
  ) AS d
  WHERE extract(isodow FROM d) < 6;
$$;

-- Soma N dias uteis a um instante (retorna meia-noite local do dia resultante).
-- Usado pro due_date exibido no meta das tarefas de SLA.
CREATE OR REPLACE FUNCTION public.add_business_days(t_start timestamptz, n integer)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  d date := (t_start AT TIME ZONE 'America/Sao_Paulo')::date;
  added integer := 0;
BEGIN
  WHILE added < COALESCE(n, 0) LOOP
    d := d + 1;
    IF extract(isodow FROM d) < 6 THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN (d::timestamp) AT TIME ZONE 'America/Sao_Paulo';
END;
$$;

-- Rename: stage_sla e leads com o label antigo.
UPDATE public.stage_sla
   SET stage_label = 'Conversa com decisor'
 WHERE stage_id = '1395880470';

UPDATE public.clients
   SET etapa = 'Conversa com decisor', updated_at = now()
 WHERE etapa = 'Diagnóstico';

-- Gerador: dias uteis + labels novos (aceita 'Diagnóstico' residual no
-- historico de client_stage_changes, que nao e' reescrito).
CREATE OR REPLACE FUNCTION public.generate_client_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending integer;
  v_activation constant timestamptz := timestamptz '2026-07-08 00:00:00+00';
BEGIN
  -- ----------------------------------------------------------------------
  -- REGRA: agendar_demo — leads em Conversa com decisor (ex-Diagnóstico),
  -- sem reuniao futura, D2/D5 em dias uteis.
  -- ----------------------------------------------------------------------
  WITH stage_entry AS (
    SELECT client_id, max(created_at) AS entered_at
    FROM public.client_stage_changes
    WHERE to_stage IN ('Conversa com decisor','Diagnóstico')
    GROUP BY client_id
  ),
  eligible AS (
    SELECT c.id AS client_id, c.vendedor_id_hubspot,
      public.business_days_between(COALESCE(se.entered_at, greatest(c.created_at, v_activation)), now()) AS days_in_stage
    FROM public.clients c LEFT JOIN stage_entry se ON se.client_id = c.id
    WHERE c.etapa IN ('Conversa com decisor','Diagnóstico') AND c.status = 'lead'
      AND NOT EXISTS (SELECT 1 FROM public.client_meetings m
        WHERE m.client_id = c.id AND m.type = 'reuniao' AND m.status = 'agendada' AND m.scheduled_at > now())
      -- Concluida/dispensada neste episodio da etapa bloqueia recriacao.
      AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
        WHERE r.client_id = c.id AND r.task_type = 'agendar_demo'
          AND r.status IN ('concluida','dispensada')
          AND r.resolved_at >= COALESCE(se.entered_at, greatest(c.created_at, v_activation)))
  ),
  targeted AS (
    SELECT client_id, vendedor_id_hubspot, days_in_stage,
      CASE WHEN days_in_stage >= 5 THEN 'D5' WHEN days_in_stage >= 2 THEN 'D2' ELSE NULL END AS severity
    FROM eligible
  ),
  to_upsert AS (SELECT * FROM targeted WHERE severity IS NOT NULL)
  INSERT INTO public.client_tasks (client_id, task_type, severity, title, status, vendedor_id_hubspot, meta)
  SELECT t.client_id, 'agendar_demo', t.severity, t.severity || ' Agendar Demo', 'pendente', t.vendedor_id_hubspot,
    jsonb_build_object('days_in_stage', t.days_in_stage, 'etapa', 'Conversa com decisor', 'dias_uteis', true)
  FROM to_upsert t
  ON CONFLICT (client_id, task_type) WHERE (status = 'pendente')
  DO UPDATE SET severity = CASE WHEN EXCLUDED.severity='D5' THEN 'D5' ELSE public.client_tasks.severity END,
    title = CASE WHEN EXCLUDED.severity='D5' THEN 'D5 Agendar Demo' ELSE public.client_tasks.title END,
    vendedor_id_hubspot = EXCLUDED.vendedor_id_hubspot, meta = EXCLUDED.meta, updated_at = now();

  -- Auto-resolucao agendar_demo: pendente cujo lead nao esta mais elegivel.
  UPDATE public.client_tasks ct SET status='resolvida_auto', resolved_at=now()
  WHERE ct.task_type='agendar_demo' AND ct.status='pendente'
    AND ct.client_id NOT IN (
      SELECT c.id FROM public.clients c
      LEFT JOIN (SELECT client_id, max(created_at) entered_at FROM public.client_stage_changes
                 WHERE to_stage IN ('Conversa com decisor','Diagnóstico') GROUP BY client_id) se ON se.client_id=c.id
      WHERE c.etapa IN ('Conversa com decisor','Diagnóstico') AND c.status='lead'
        AND public.business_days_between(COALESCE(se.entered_at, greatest(c.created_at, v_activation)), now()) >= 2
        AND NOT EXISTS (SELECT 1 FROM public.client_meetings m
          WHERE m.client_id=c.id AND m.type='reuniao' AND m.status='agendada' AND m.scheduled_at>now())
        AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
          WHERE r.client_id = c.id AND r.task_type = 'agendar_demo'
            AND r.status IN ('concluida','dispensada')
            AND r.resolved_at >= COALESCE(se.entered_at, greatest(c.created_at, v_activation)))
    );

  -- ----------------------------------------------------------------------
  -- REGRA: SLAs por etapa (stage_sla) — prazos em dias uteis.
  -- ----------------------------------------------------------------------
  WITH sla AS (
    SELECT stage_id, stage_label, sla_days, task_title, task_type
    FROM public.stage_sla
    WHERE is_active AND sla_days IS NOT NULL AND task_type <> 'agendar_demo'
  ),
  entry AS (
    -- Normaliza o label antigo no historico pro novo, pra entrada na etapa
    -- renomeada continuar valendo.
    SELECT client_id,
           CASE WHEN to_stage = 'Diagnóstico' THEN 'Conversa com decisor' ELSE to_stage END AS stage_label,
           max(created_at) AS entered_at
    FROM public.client_stage_changes
    GROUP BY client_id, CASE WHEN to_stage = 'Diagnóstico' THEN 'Conversa com decisor' ELSE to_stage END
  ),
  eligible AS (
    SELECT c.id AS client_id, c.vendedor_id_hubspot, s.task_type, s.task_title, s.stage_label, s.sla_days,
      public.business_days_between(COALESCE(e.entered_at, greatest(c.created_at, v_activation)), now()) AS days_in_stage,
      public.add_business_days(COALESCE(e.entered_at, greatest(c.created_at, v_activation)), s.sla_days) AS due_date
    FROM public.clients c
    JOIN sla s ON s.stage_label = c.etapa
    LEFT JOIN entry e ON e.client_id = c.id AND e.stage_label = s.stage_label
    WHERE c.status = 'lead'
      AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
        WHERE r.client_id = c.id AND r.task_type = s.task_type
          AND r.status IN ('concluida','dispensada')
          AND r.resolved_at >= COALESCE(e.entered_at, greatest(c.created_at, v_activation)))
  ),
  to_upsert AS (SELECT * FROM eligible WHERE days_in_stage >= sla_days)
  INSERT INTO public.client_tasks (client_id, task_type, severity, title, status, vendedor_id_hubspot, meta)
  SELECT t.client_id, t.task_type, 'SLA', t.task_title, 'pendente', t.vendedor_id_hubspot,
    jsonb_build_object('days_in_stage', t.days_in_stage, 'etapa', t.stage_label, 'sla_days', t.sla_days, 'due_date', t.due_date, 'dias_uteis', true)
  FROM to_upsert t
  ON CONFLICT (client_id, task_type) WHERE (status = 'pendente')
  DO UPDATE SET vendedor_id_hubspot = EXCLUDED.vendedor_id_hubspot, meta = EXCLUDED.meta, updated_at = now();

  -- Auto-resolucao SLA: pendente sobrevive so se o lead segue elegivel E nao
  -- houve conclusao/dispensa manual neste episodio.
  UPDATE public.client_tasks ct SET status='resolvida_auto', resolved_at=now()
  WHERE ct.severity = 'SLA' AND ct.status = 'pendente'
    AND NOT EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.stage_sla s ON s.stage_label = c.etapa AND s.task_type = ct.task_type
      LEFT JOIN LATERAL (
        SELECT max(sc.created_at) AS entered_at
        FROM public.client_stage_changes sc
        WHERE sc.client_id = c.id
          AND (sc.to_stage = c.etapa OR (c.etapa = 'Conversa com decisor' AND sc.to_stage = 'Diagnóstico'))
      ) e ON true
      WHERE c.id = ct.client_id AND c.status = 'lead' AND s.is_active
        AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
          WHERE r.client_id = c.id AND r.task_type = ct.task_type
            AND r.status IN ('concluida','dispensada')
            AND r.resolved_at >= COALESCE(e.entered_at, greatest(c.created_at, v_activation)))
    );

  SELECT count(*) INTO v_pending FROM public.client_tasks WHERE status = 'pendente';
  RETURN v_pending;
END;
$$;

-- Roda uma vez: cria as tarefas dos leads em "Conversa com decisor" que
-- estavam invisiveis pro gerador e reavalia pendentes pela regra de dias uteis.
SELECT public.generate_client_tasks();
