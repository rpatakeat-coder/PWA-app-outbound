-- ============================================================================
-- Painel do Gestor: responsavel/autor no drill-down + infra de exportacao.
--
-- 1) gestor_metric_leads passa a devolver responsavel_nome (vendedor dono do
--    lead via vendedor_id_hubspot) e actor_name (quem executou a acao, via
--    created_by/visited_by). Uteis no drill-down dos cards GLOBAIS que
--    misturam vendedores.
-- 2) Bucket privado 'exports' pros CSVs gerados pela Edge Function export-report
--    (acesso so via signed URL).
--
-- Aplicada via apply_migration 'gestor_metric_leads_add_responsavel_actor' e
-- INSERT em storage.buckets em 2026-07-16.
-- ============================================================================

-- (1) Bucket de exportacoes (privado).
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false)
ON CONFLICT (id) DO NOTHING;

-- (2) gestor_metric_leads: + responsavel_nome + actor_name.
CREATE OR REPLACE FUNCTION public.gestor_metric_leads(
  p_metric text,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_hubspot_id text DEFAULT NULL,
  p_status text DEFAULT NULL
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
    SELECT c.id AS client_id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome') AS name,
           c.status, c.created_at AS at, NULL::text AS note,
           c.vendedor_id_hubspot AS resp_hid, c.created_by AS actor_uid
    FROM public.clients c WHERE p_metric='created' AND c.created_by IS NOT NULL
      AND (p_seller_id IS NULL OR c.created_by=p_seller_id) AND (p_start IS NULL OR c.created_at>=p_start) AND (p_end IS NULL OR c.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, c.visited_at, NULL,
           c.vendedor_id_hubspot, c.visited_by
    FROM public.clients c WHERE p_metric='visited' AND c.visited_by IS NOT NULL
      AND (p_seller_id IS NULL OR c.visited_by=p_seller_id) AND (p_start IS NULL OR c.visited_at>=p_start) AND (p_end IS NULL OR c.visited_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, COALESCE(mt.scheduled_at,mt.created_at), NULL,
           c.vendedor_id_hubspot, mt.created_by
    FROM public.client_meetings mt JOIN public.clients c ON c.id=mt.client_id
    WHERE p_metric IN ('meetings','follow_ups') AND mt.created_by IS NOT NULL
      AND ((p_metric='follow_ups' AND mt.type='follow_up') OR (p_metric='meetings' AND mt.type<>'follow_up'))
      AND (p_seller_id IS NULL OR mt.created_by=p_seller_id) AND (p_start IS NULL OR mt.created_at>=p_start) AND (p_end IS NULL OR mt.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, s.created_at, NULL,
           c.vendedor_id_hubspot, s.created_by
    FROM public.client_stage_changes s JOIN public.clients c ON c.id=s.client_id
    WHERE p_metric='stage_changes' AND s.created_by IS NOT NULL
      AND (p_seller_id IS NULL OR s.created_by=p_seller_id) AND (p_start IS NULL OR s.created_at>=p_start) AND (p_end IS NULL OR s.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, n.created_at, n.body,
           c.vendedor_id_hubspot, n.created_by
    FROM public.client_notes n JOIN public.clients c ON c.id=n.client_id
    WHERE p_metric='notes' AND n.created_by IS NOT NULL
      AND (p_seller_id IS NULL OR n.created_by=p_seller_id) AND (p_start IS NULL OR n.created_at>=p_start) AND (p_end IS NULL OR n.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, c.created_at, NULL,
           c.vendedor_id_hubspot, NULL::uuid
    FROM public.clients c WHERE p_metric='assigned' AND (p_hubspot_id IS NULL OR c.vendedor_id_hubspot=p_hubspot_id) AND (p_status IS NULL OR c.status=p_status)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, c.created_at, NULL,
           c.vendedor_id_hubspot, NULL::uuid
    FROM public.clients c WHERE p_metric IN ('status','all') AND (p_metric='all' OR c.status=p_status)
  ),
  enriched AS (
    SELECT r.*, pr_resp.full_name AS resp_name, COALESCE(pa.full_name, pa.email) AS actor_name
    FROM rows r
    LEFT JOIN public.profiles pr_resp ON pr_resp.id_hubspot = r.resp_hid
    LEFT JOIN public.profiles pa ON pa.id = r.actor_uid
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'client_id', client_id, 'name', name, 'status', status, 'at', at, 'note', note,
    'responsavel_nome', resp_name, 'actor_name', actor_name
  ) ORDER BY at DESC NULLS LAST), '[]'::jsonb) INTO v_result FROM enriched;
  RETURN v_result;
END;
$function$;
