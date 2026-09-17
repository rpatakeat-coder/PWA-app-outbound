-- ============================================================================
-- Metricas de TAREFAS por vendedor na aba Gestor.
--
-- gestor_task_metrics(p_start, p_end) -> [{ id_hubspot, pending, done }]
--   pending: snapshot ATUAL (status='pendente'), ignora periodo.
--   done: status='concluida' com resolved_at no periodo. 'dispensada' e
--   'resolvida_auto' NAO contam (nao foi acao de conclusao do vendedor).
--   Agrupado por client_tasks.vendedor_id_hubspot (= profiles.id_hubspot).
--
-- gestor_tasks_list(p_hubspot_id, p_status, p_start, p_end) -> lista detalhada
--   pro drill-down (title, cliente, severity, etapa, dias_na_etapa, resolved_at).
--
-- Ambas SECURITY DEFINER com gestor_metrics_guard(). Aplicadas via
-- apply_migration 'gestor_task_metrics_and_list' em 2026-07-16.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gestor_task_metrics(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.gestor_metrics_guard();
  WITH agg AS (
    SELECT
      t.vendedor_id_hubspot AS hid,
      count(*) FILTER (WHERE t.status = 'pendente') AS pending,
      count(*) FILTER (
        WHERE t.status = 'concluida'
          AND (p_start IS NULL OR t.resolved_at >= p_start)
          AND (p_end   IS NULL OR t.resolved_at <= p_end)
      ) AS done
    FROM public.client_tasks t
    GROUP BY t.vendedor_id_hubspot
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id_hubspot', hid, 'pending', pending, 'done', done
  )), '[]'::jsonb) INTO v_result
  FROM agg WHERE pending > 0 OR done > 0;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gestor_tasks_list(
  p_hubspot_id text,
  p_status text DEFAULT 'pendente',
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.gestor_metrics_guard();
  WITH rows AS (
    SELECT
      t.id AS task_id,
      t.client_id,
      COALESCE(NULLIF(btrim(c.empresa),''), NULLIF(btrim(c.nome),''), 'Sem nome') AS client_name,
      c.status AS client_status,
      t.title,
      t.task_type,
      t.severity,
      t.meta,
      (t.meta ->> 'days_in_stage') AS days_in_stage,
      (t.meta ->> 'etapa') AS etapa,
      t.created_at,
      t.resolved_at,
      CASE WHEN t.status = 'concluida' THEN t.resolved_at ELSE t.created_at END AS at
    FROM public.client_tasks t
    JOIN public.clients c ON c.id = t.client_id
    WHERE t.vendedor_id_hubspot IS NOT DISTINCT FROM p_hubspot_id
      AND t.status = p_status
      AND (
        p_status <> 'concluida'
        OR ((p_start IS NULL OR t.resolved_at >= p_start) AND (p_end IS NULL OR t.resolved_at <= p_end))
      )
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'task_id', task_id, 'client_id', client_id, 'client_name', client_name,
    'client_status', client_status, 'title', title, 'task_type', task_type,
    'severity', severity, 'days_in_stage', days_in_stage, 'etapa', etapa,
    'created_at', created_at, 'resolved_at', resolved_at, 'at', at
  ) ORDER BY at DESC NULLS LAST), '[]'::jsonb) INTO v_result
  FROM rows;
  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.gestor_task_metrics(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestor_tasks_list(text, text, timestamptz, timestamptz) TO authenticated;
