-- ============================================================================
-- Troca de pipeline do HubSpot (2026-07-13).
--
-- Pipeline novo: Backlog (entrada) -> Prospecção -> Visita -> Diagnóstico ->
-- Demo/Proposta -> Negociação -> Ag. Pagamento -> Negócio Fechado ->
-- Enviado Onboarding | Perdido.
--
-- IDs novos (get_stages via n8n, pipeline configurado la):
--   Backlog            1396007427  (entrada; nunca destino no app)
--   Prospecção         1395880469
--   Visita             1396005401
--   Diagnóstico        1395880470  (herdou gargalo_operacional + agendar_demo)
--   Demo/Proposta      1395880471
--   Negociação         1395880472
--   Ag. Pagamento      1395880473
--   Negócio Fechado    1396006162  (won)
--   Enviado Onboarding 1396006163  (won)
--   Perdido            1396006164  (lost)
--
-- 1) stage_sla: re-seed com os stage_ids/labels novos. A antiga QUALIFICAÇÃO
--    virou Visita + Diagnóstico; o SLA de 2d (agendar_demo) foi herdado pelo
--    Diagnóstico. Visita fica sem SLA por ora.
-- 2) generate_client_tasks(): label da regra especial agendar_demo trocado
--    de 'QUALIFICAÇÃO' pra 'Diagnóstico'.
-- 3) clients.etapa: ponte de labels antigos -> novos pro app resolver a etapa
--    atual corretamente ate o RPA re-sincronizar com o HubSpot. Etapas
--    laterais antigas (CASA DOS DADOS, RECICLAGEM etc.) ficam como estao:
--    o app trata label desconhecido como "reentra pela 1a etapa do funil".
-- ============================================================================

-- 1) stage_sla ---------------------------------------------------------------
DELETE FROM public.stage_sla;
INSERT INTO public.stage_sla (stage_id, stage_label, sla_days, task_title, task_type, is_active) VALUES
  ('1395880469', 'Prospecção',    3, 'Qualificar lead',    'sla_prospeccao', true),
  ('1395880470', 'Diagnóstico',   2, 'Agendar Demo',       'agendar_demo',   true),
  ('1395880471', 'Demo/Proposta', 3, 'Enviar proposta',    'sla_demo',       true),
  ('1395880472', 'Negociação',    5, 'Fechar negociação',  'sla_negociacao', true),
  ('1395880473', 'Ag. Pagamento', 3, 'Confirmar pagamento','sla_aguardando', true);

-- 2) generate_client_tasks: regra especial agendar_demo agora olha Diagnóstico
CREATE OR REPLACE FUNCTION public.generate_client_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pending integer;
  v_activation constant timestamptz := timestamptz '2026-07-08 00:00:00+00';
BEGIN
  -- ===== REGRA ESPECIAL: agendar_demo (Diagnóstico, sem reuniao, D2/D5) =====
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

  UPDATE public.client_tasks ct SET status='resolvida_auto', resolved_at=now()
  WHERE ct.task_type='agendar_demo' AND ct.status='pendente'
    AND ct.client_id NOT IN (SELECT c.id FROM public.clients c
      LEFT JOIN (SELECT client_id, max(created_at) entered_at FROM public.client_stage_changes WHERE to_stage='Diagnóstico' GROUP BY client_id) se ON se.client_id=c.id
      WHERE c.etapa='Diagnóstico' AND c.status='lead'
        AND floor(extract(epoch FROM (now()-COALESCE(se.entered_at,greatest(c.created_at,v_activation))))/86400.0)::int >= 2
        AND NOT EXISTS (SELECT 1 FROM public.client_meetings m WHERE m.client_id=c.id AND m.type='reuniao' AND m.status='agendada' AND m.scheduled_at>now()));

  -- ===== REGRA GENERICA: SLA por etapa (tabela stage_sla) =====
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
  ),
  to_upsert AS (SELECT * FROM eligible WHERE days_in_stage >= sla_days)
  INSERT INTO public.client_tasks (client_id, task_type, severity, title, status, vendedor_id_hubspot, meta)
  SELECT t.client_id, t.task_type, 'SLA', t.task_title, 'pendente', t.vendedor_id_hubspot,
    jsonb_build_object('days_in_stage', t.days_in_stage, 'etapa', t.stage_label, 'sla_days', t.sla_days, 'due_date', t.due_date)
  FROM to_upsert t
  ON CONFLICT (client_id, task_type) WHERE (status = 'pendente')
  DO UPDATE SET vendedor_id_hubspot = EXCLUDED.vendedor_id_hubspot, meta = EXCLUDED.meta, updated_at = now();

  UPDATE public.client_tasks ct SET status='resolvida_auto', resolved_at=now()
  WHERE ct.severity = 'SLA' AND ct.status = 'pendente'
    AND NOT EXISTS (
      SELECT 1 FROM public.clients c
      JOIN public.stage_sla s ON s.stage_label = c.etapa AND s.task_type = ct.task_type
      WHERE c.id = ct.client_id AND c.status = 'lead' AND s.is_active
    );

  SELECT count(*) INTO v_pending FROM public.client_tasks WHERE status = 'pendente';
  RETURN v_pending;
END;
$function$;

-- 3) Ponte de labels antigos -> novos em clients.etapa ------------------------
UPDATE public.clients SET etapa = CASE etapa
  WHEN 'PROSPECÇÃO (PAP)' THEN 'Prospecção'
  WHEN 'QUALIFICAÇÃO'     THEN 'Diagnóstico'
  WHEN 'DEMO/PROPOSTA'    THEN 'Demo/Proposta'
  WHEN 'NEGOCIAÇÃO'       THEN 'Negociação'
  WHEN 'NEGÓCIO PERDIDO'  THEN 'Perdido'
  ELSE etapa END
WHERE etapa IN ('PROSPECÇÃO (PAP)','QUALIFICAÇÃO','DEMO/PROPOSTA','NEGOCIAÇÃO','NEGÓCIO PERDIDO');
