-- ============================================================================
-- Correcao das RPCs do Gestor: SECURITY INVOKER -> SECURITY DEFINER + guard.
--
-- Sintoma: no app os dados do Gestor nao carregavam (tudo zerado / vazio).
-- Causa: com SECURITY INVOKER a agregacao rodava com a RLS do chamador. A
-- policy de `profiles` so deixa o proprio perfil visivel (exceto admin /
-- can_view_metrics), entao o ranking de vendedores vinha vazio pra quem nao
-- e admin — e o agregado inteiro degradava.
--
-- Correcao: SECURITY DEFINER (le todas as linhas, ignora RLS) + guard
-- can_view_metrics() pra so admin/gestores executarem. O guard usa
-- "IS NOT TRUE" porque can_view_metrics() retorna NULL pra anon (jwt nulo),
-- e "NOT NULL" = NULL nao dispararia a excecao (brecha de seguranca).
-- ============================================================================

-- Helper de guard reaproveitado pelas duas RPCs. IS NOT TRUE trata false E null.
CREATE OR REPLACE FUNCTION public.gestor_metrics_guard()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.can_view_metrics() IS NOT TRUE THEN
    RAISE EXCEPTION 'sem permissao para ver metricas' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.gestor_metrics(
  p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.gestor_metrics_guard();
  WITH
  g AS (SELECT count(*) AS total_clients,
      count(*) FILTER (WHERE status='lead') AS total_leads,
      count(*) FILTER (WHERE status='lead_visitado') AS total_visited,
      count(*) FILTER (WHERE status='cliente') AS total_active_clients,
      count(*) FILTER (WHERE status='churn') AS total_churn,
      count(*) FILTER (WHERE created_by IS NOT NULL AND (p_start IS NULL OR created_at>=p_start) AND (p_end IS NULL OR created_at<=p_end)) AS created_in_period,
      count(*) FILTER (WHERE visited_by IS NOT NULL AND (p_start IS NULL OR visited_at>=p_start) AND (p_end IS NULL OR visited_at<=p_end)) AS visited_in_period
    FROM public.clients),
  m AS (SELECT count(*) FILTER (WHERE type<>'follow_up') AS meetings_in_period,
      count(*) FILTER (WHERE type='follow_up') AS follow_ups_in_period
    FROM public.client_meetings WHERE created_by IS NOT NULL
      AND (p_start IS NULL OR created_at>=p_start) AND (p_end IS NULL OR created_at<=p_end)),
  sc AS (SELECT count(*) AS stage_changes_in_period FROM public.client_stage_changes
    WHERE created_by IS NOT NULL AND (p_start IS NULL OR created_at>=p_start) AND (p_end IS NULL OR created_at<=p_end)),
  nt AS (SELECT count(*) AS notes_in_period FROM public.client_notes
    WHERE created_by IS NOT NULL AND (p_start IS NULL OR created_at>=p_start) AND (p_end IS NULL OR created_at<=p_end)),
  created_by_seller AS (SELECT created_by AS sid, count(*) AS n FROM public.clients
    WHERE created_by IS NOT NULL AND (p_start IS NULL OR created_at>=p_start) AND (p_end IS NULL OR created_at<=p_end) GROUP BY created_by),
  visited_by_seller AS (SELECT visited_by AS sid, count(*) AS n FROM public.clients
    WHERE visited_by IS NOT NULL AND (p_start IS NULL OR visited_at>=p_start) AND (p_end IS NULL OR visited_at<=p_end) GROUP BY visited_by),
  meetings_by_seller AS (SELECT created_by AS sid,
      count(*) FILTER (WHERE type<>'follow_up') AS meetings, count(*) FILTER (WHERE type='follow_up') AS follow_ups
    FROM public.client_meetings WHERE created_by IS NOT NULL AND (p_start IS NULL OR created_at>=p_start) AND (p_end IS NULL OR created_at<=p_end) GROUP BY created_by),
  stage_by_seller AS (SELECT created_by AS sid, count(*) AS n FROM public.client_stage_changes
    WHERE created_by IS NOT NULL AND (p_start IS NULL OR created_at>=p_start) AND (p_end IS NULL OR created_at<=p_end) GROUP BY created_by),
  notes_by_seller AS (SELECT created_by AS sid, count(*) AS n FROM public.client_notes
    WHERE created_by IS NOT NULL AND (p_start IS NULL OR created_at>=p_start) AND (p_end IS NULL OR created_at<=p_end) GROUP BY created_by),
  assigned_by_hubspot AS (SELECT vendedor_id_hubspot AS hid, status, count(*) AS n FROM public.clients
    WHERE vendedor_id_hubspot IS NOT NULL GROUP BY vendedor_id_hubspot, status),
  assigned_totals AS (SELECT hid, sum(n) AS leads_assigned, jsonb_object_agg(status,n) AS status_breakdown FROM assigned_by_hubspot GROUP BY hid),
  sellers AS (SELECT p.id,p.full_name,p.email,p.id_hubspot,p.sector,
      COALESCE(cb.n,0) AS created, COALESCE(vb.n,0) AS visited,
      COALESCE(mb.meetings,0) AS meetings_scheduled, COALESCE(mb.follow_ups,0) AS follow_ups_scheduled,
      COALESCE(sb.n,0) AS stage_changes, COALESCE(nb.n,0) AS notes_created,
      COALESCE(at.leads_assigned,0) AS leads_assigned, COALESCE(at.status_breakdown,'{}'::jsonb) AS status_breakdown
    FROM public.profiles p
    LEFT JOIN created_by_seller cb ON cb.sid=p.id LEFT JOIN visited_by_seller vb ON vb.sid=p.id
    LEFT JOIN meetings_by_seller mb ON mb.sid=p.id LEFT JOIN stage_by_seller sb ON sb.sid=p.id
    LEFT JOIN notes_by_seller nb ON nb.sid=p.id LEFT JOIN assigned_totals at ON at.hid=p.id_hubspot)
  SELECT jsonb_build_object(
    'global', jsonb_build_object(
      'total_clients',(SELECT total_clients FROM g),'total_leads',(SELECT total_leads FROM g),
      'total_visited',(SELECT total_visited FROM g),'total_active_clients',(SELECT total_active_clients FROM g),
      'total_churn',(SELECT total_churn FROM g),'created_in_period',(SELECT created_in_period FROM g),
      'visited_in_period',(SELECT visited_in_period FROM g),'meetings_in_period',(SELECT meetings_in_period FROM m),
      'follow_ups_in_period',(SELECT follow_ups_in_period FROM m),'stage_changes_in_period',(SELECT stage_changes_in_period FROM sc),
      'notes_in_period',(SELECT notes_in_period FROM nt)),
    'sellers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'seller_id',id,'full_name',full_name,'email',email,'id_hubspot',id_hubspot,'sector',sector,
      'created',created,'visited',visited,'meetings_scheduled',meetings_scheduled,'follow_ups_scheduled',follow_ups_scheduled,
      'stage_changes',stage_changes,'notes_created',notes_created,'leads_assigned',leads_assigned,'status_breakdown',status_breakdown)) FROM sellers),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.gestor_metric_leads(
  p_metric text, p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL, p_hubspot_id text DEFAULT NULL, p_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.gestor_metrics_guard();
  WITH rows AS (
    SELECT c.id AS client_id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome') AS name, c.status, c.created_at AS at, NULL::text AS note
    FROM public.clients c WHERE p_metric='created' AND c.created_by IS NOT NULL
      AND (p_seller_id IS NULL OR c.created_by=p_seller_id) AND (p_start IS NULL OR c.created_at>=p_start) AND (p_end IS NULL OR c.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, c.visited_at, NULL
    FROM public.clients c WHERE p_metric='visited' AND c.visited_by IS NOT NULL
      AND (p_seller_id IS NULL OR c.visited_by=p_seller_id) AND (p_start IS NULL OR c.visited_at>=p_start) AND (p_end IS NULL OR c.visited_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, COALESCE(mt.scheduled_at,mt.created_at), NULL
    FROM public.client_meetings mt JOIN public.clients c ON c.id=mt.client_id
    WHERE p_metric IN ('meetings','follow_ups') AND mt.created_by IS NOT NULL
      AND ((p_metric='follow_ups' AND mt.type='follow_up') OR (p_metric='meetings' AND mt.type<>'follow_up'))
      AND (p_seller_id IS NULL OR mt.created_by=p_seller_id) AND (p_start IS NULL OR mt.created_at>=p_start) AND (p_end IS NULL OR mt.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, s.created_at, NULL
    FROM public.client_stage_changes s JOIN public.clients c ON c.id=s.client_id
    WHERE p_metric='stage_changes' AND s.created_by IS NOT NULL
      AND (p_seller_id IS NULL OR s.created_by=p_seller_id) AND (p_start IS NULL OR s.created_at>=p_start) AND (p_end IS NULL OR s.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, n.created_at, n.body
    FROM public.client_notes n JOIN public.clients c ON c.id=n.client_id
    WHERE p_metric='notes' AND n.created_by IS NOT NULL
      AND (p_seller_id IS NULL OR n.created_by=p_seller_id) AND (p_start IS NULL OR n.created_at>=p_start) AND (p_end IS NULL OR n.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, c.created_at, NULL
    FROM public.clients c WHERE p_metric='assigned' AND (p_hubspot_id IS NULL OR c.vendedor_id_hubspot=p_hubspot_id) AND (p_status IS NULL OR c.status=p_status)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, c.created_at, NULL
    FROM public.clients c WHERE p_metric IN ('status','all') AND (p_metric='all' OR c.status=p_status))
  SELECT COALESCE(jsonb_agg(jsonb_build_object('client_id',client_id,'name',name,'status',status,'at',at,'note',note) ORDER BY at DESC NULLS LAST),'[]'::jsonb) INTO v_result FROM rows;
  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.gestor_metrics_guard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestor_metrics(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestor_metric_leads(text, timestamptz, timestamptz, uuid, text, text) TO authenticated;
