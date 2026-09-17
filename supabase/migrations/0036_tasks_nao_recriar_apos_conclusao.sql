-- ============================================================================
-- FIX: tarefa concluida/dispensada voltava a aparecer.
--
-- Causa: o dedup do generate_client_tasks() era so o indice parcial
-- (client_id, task_type) WHERE status='pendente'. Ao concluir/dispensar uma
-- tarefa, o lead continuava elegivel (mesma etapa, sem reuniao futura), entao
-- a proxima rodada do gerador (cron 30min ou abertura do app) INSERIA uma
-- tarefa pendente nova pro mesmo lead — pro usuario, "a tarefa voltou".
--
-- Correcao (nas duas regras: agendar_demo e SLAs da stage_sla):
--   Um lead com tarefa concluida/dispensada MANUALMENTE cujo resolved_at seja
--   >= a entrada na etapa atual (mesmo "episodio") fica fora da elegibilidade.
--   Se o lead sair da etapa e voltar depois (entered_at novo > resolved_at),
--   a regra volta a valer e uma nova tarefa pode ser criada.
--   'resolvida_auto' NAO bloqueia: se a condicao voltar (ex.: reuniao
--   desmarcada), a tarefa deve reaparecer.
--
-- A auto-resolucao usa a MESMA elegibilidade, entao tarefas pendentes
-- "fantasma" ja recriadas no banco sao marcadas resolvida_auto na primeira
-- rodada apos esta migration (chamada no final do arquivo).
-- ============================================================================

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
  -- REGRA: agendar_demo — leads em Diagnóstico, sem reuniao futura, D2/D5.
  -- ----------------------------------------------------------------------
  WITH stage_entry AS (
    SELECT client_id, max(created_at) AS entered_at
    FROM public.client_stage_changes WHERE to_stage = 'Diagnóstico' GROUP BY client_id
  ),
  eligible AS (
    SELECT c.id AS client_id, c.vendedor_id_hubspot,
      floor(extract(epoch FROM (now() - COALESCE(se.entered_at, greatest(c.created_at, v_activation)))) / 86400.0)::int AS days_in_stage
    FROM public.clients c LEFT JOIN stage_entry se ON se.client_id = c.id
    WHERE c.etapa = 'Diagnóstico' AND c.status = 'lead'
      AND NOT EXISTS (SELECT 1 FROM public.client_meetings m
        WHERE m.client_id = c.id AND m.type = 'reuniao' AND m.status = 'agendada' AND m.scheduled_at > now())
      -- FIX: concluida/dispensada neste episodio da etapa bloqueia recriacao.
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
    jsonb_build_object('days_in_stage', t.days_in_stage, 'etapa', 'Diagnóstico')
  FROM to_upsert t
  ON CONFLICT (client_id, task_type) WHERE (status = 'pendente')
  DO UPDATE SET severity = CASE WHEN EXCLUDED.severity='D5' THEN 'D5' ELSE public.client_tasks.severity END,
    title = CASE WHEN EXCLUDED.severity='D5' THEN 'D5 Agendar Demo' ELSE public.client_tasks.title END,
    vendedor_id_hubspot = EXCLUDED.vendedor_id_hubspot, meta = EXCLUDED.meta, updated_at = now();

  -- Auto-resolucao agendar_demo: pendente cujo lead nao esta mais elegivel
  -- (inclui o caso novo: alguem concluiu/dispensou neste episodio — limpa
  -- tarefas fantasma ja recriadas antes deste fix).
  UPDATE public.client_tasks ct SET status='resolvida_auto', resolved_at=now()
  WHERE ct.task_type='agendar_demo' AND ct.status='pendente'
    AND ct.client_id NOT IN (
      SELECT c.id FROM public.clients c
      LEFT JOIN (SELECT client_id, max(created_at) entered_at FROM public.client_stage_changes WHERE to_stage='Diagnóstico' GROUP BY client_id) se ON se.client_id=c.id
      WHERE c.etapa='Diagnóstico' AND c.status='lead'
        AND floor(extract(epoch FROM (now()-COALESCE(se.entered_at,greatest(c.created_at,v_activation))))/86400.0)::int >= 2
        AND NOT EXISTS (SELECT 1 FROM public.client_meetings m
          WHERE m.client_id=c.id AND m.type='reuniao' AND m.status='agendada' AND m.scheduled_at>now())
        AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
          WHERE r.client_id = c.id AND r.task_type = 'agendar_demo'
            AND r.status IN ('concluida','dispensada')
            AND r.resolved_at >= COALESCE(se.entered_at, greatest(c.created_at, v_activation)))
    );

  -- ----------------------------------------------------------------------
  -- REGRA: SLAs por etapa (stage_sla).
  -- ----------------------------------------------------------------------
  WITH sla AS (
    SELECT stage_id, stage_label, sla_days, task_title, task_type
    FROM public.stage_sla
    WHERE is_active AND sla_days IS NOT NULL AND task_type <> 'agendar_demo'
  ),
  entry AS (
    SELECT client_id, to_stage AS stage_label, max(created_at) AS entered_at
    FROM public.client_stage_changes GROUP BY client_id, to_stage
  ),
  eligible AS (
    SELECT c.id AS client_id, c.vendedor_id_hubspot, s.task_type, s.task_title, s.stage_label, s.sla_days,
      floor(extract(epoch FROM (now() - COALESCE(e.entered_at, greatest(c.created_at, v_activation)))) / 86400.0)::int AS days_in_stage,
      COALESCE(e.entered_at, greatest(c.created_at, v_activation)) + (s.sla_days || ' days')::interval AS due_date
    FROM public.clients c
    JOIN sla s ON s.stage_label = c.etapa
    LEFT JOIN entry e ON e.client_id = c.id AND e.stage_label = s.stage_label
    WHERE c.status = 'lead'
      -- FIX: concluida/dispensada neste episodio da etapa bloqueia recriacao.
      AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
        WHERE r.client_id = c.id AND r.task_type = s.task_type
          AND r.status IN ('concluida','dispensada')
          AND r.resolved_at >= COALESCE(e.entered_at, greatest(c.created_at, v_activation)))
  ),
  to_upsert AS (SELECT * FROM eligible WHERE days_in_stage >= sla_days)
  INSERT INTO public.client_tasks (client_id, task_type, severity, title, status, vendedor_id_hubspot, meta)
  SELECT t.client_id, t.task_type, 'SLA', t.task_title, 'pendente', t.vendedor_id_hubspot,
    jsonb_build_object('days_in_stage', t.days_in_stage, 'etapa', t.stage_label, 'sla_days', t.sla_days, 'due_date', t.due_date)
  FROM to_upsert t
  ON CONFLICT (client_id, task_type) WHERE (status = 'pendente')
  DO UPDATE SET vendedor_id_hubspot = EXCLUDED.vendedor_id_hubspot, meta = EXCLUDED.meta, updated_at = now();

  -- Auto-resolucao SLA: pendente sobrevive so se o lead segue elegivel E nao
  -- houve conclusao/dispensa manual neste episodio (limpa fantasmas).
  UPDATE public.client_tasks ct SET status='resolvida_auto', resolved_at=now()
  WHERE ct.severity = 'SLA' AND ct.status = 'pendente'
    AND NOT EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.stage_sla s ON s.stage_label = c.etapa AND s.task_type = ct.task_type
      LEFT JOIN LATERAL (
        SELECT max(sc.created_at) AS entered_at
        FROM public.client_stage_changes sc
        WHERE sc.client_id = c.id AND sc.to_stage = c.etapa
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

-- Roda uma vez pra limpar as tarefas pendentes "fantasma" ja recriadas.
SELECT public.generate_client_tasks();
