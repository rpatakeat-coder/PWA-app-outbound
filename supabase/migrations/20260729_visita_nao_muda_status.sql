-- ============================================================================
-- Check-in NAO muda mais o status do lead (correcao de regressao).
--
-- Historico:
--   * 20260619_unify_lead_status_and_decouple_visit: a visita foi desacoplada
--     do status — a RPC passou a preencher so visited_at/coords/visited_by e
--     o slug 'lead_visitado' foi INATIVADO. Nenhum setor tem 'lead_visitado'
--     em sector_visibility desde entao.
--   * 20260727_client_visits_history: ao adicionar o historico de visitas, a
--     RPC foi reescrita a partir da versao ANTIGA (20260506/20260620) e voltou
--     a setar status='lead_visitado' — e de quebra perdeu o raio de 500m pra
--     pin aproximado (introduzido em 20260708/20260722). Ate o set_config do
--     trigger dropado em 20260619 voltou junto (copia de versao defasada).
--
-- Sintoma em producao: check-in mudava o status pra 'lead_visitado', que nao
-- passa no filtro .in('status', sector_visibility) do app — o lead SUMIA do
-- mapa e da busca pra todo mundo (vendedor, gestor e viewer). 43 leads
-- ficaram invisiveis entre 27/07 e 29/07 (ex.: "Decks Casa de Carne").
--
-- Correcoes nesta migration:
--   1) RPC mark_client_as_visited: mantem historico + contador (20260727) e o
--      raio dinamico 200m/500m (20260722), mas NAO toca no status.
--   2) Repara os leads presos: status 'lead_visitado' -> 'lead'.
--   3) gestor_metrics: card "Visitados" passa a contar visited_at IS NOT NULL
--      (contar por status='lead_visitado' voltaria a ser sempre zero).
--   4) guard_client_status_transition: UPDATE pra slug legado inativo
--      ('lead_nao_visitado'/'lead_visitado') passa a ser bloqueado — se a
--      regressao voltar, o check-in falha alto em vez de sumir lead em silencio.
-- ============================================================================

-- ===== 1) RPC: visita registra historico e metadata, status fica intocado ===
CREATE OR REPLACE FUNCTION public.mark_client_as_visited(
  p_client_id uuid,
  p_user_lat numeric,
  p_user_lon numeric
)
RETURNS public.clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client public.clients;
  v_distance_m numeric;
  v_caller uuid := auth.uid();
  v_max_distance_m numeric;
  v_etapa_anterior text;
  v_name text;
  v_email text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;

  IF p_user_lat IS NULL OR p_user_lon IS NULL THEN
    RAISE EXCEPTION 'Localização do usuário não informada' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_client.latitude IS NULL OR v_client.longitude IS NULL THEN
    RAISE EXCEPTION 'Lead sem coordenadas — impossível validar proximidade.' USING ERRCODE = 'P0001';
  END IF;

  -- Raio maior quando o pin e aproximado (geocoding de CEP sem numero exato).
  v_max_distance_m := CASE WHEN v_client.geo_approximate IS TRUE THEN 500 ELSE 200 END;

  -- Haversine em metros (raio da Terra = 6.371.000 m)
  v_distance_m := 2 * 6371000 * asin(sqrt(
    power(sin(radians((p_user_lat - v_client.latitude) / 2)), 2) +
    cos(radians(v_client.latitude)) * cos(radians(p_user_lat)) *
    power(sin(radians((p_user_lon - v_client.longitude) / 2)), 2)
  ));

  IF v_distance_m > v_max_distance_m THEN
    RAISE EXCEPTION 'Você está a % m do lead (limite: % m). Aproxime-se do local para marcar como visitado.',
      round(v_distance_m, 1), v_max_distance_m
      USING ERRCODE = 'P0001';
  END IF;

  v_etapa_anterior := v_client.etapa;

  SELECT full_name, email INTO v_name, v_email
    FROM public.profiles WHERE id = v_caller;

  INSERT INTO public.client_visits (
    client_id, visited_at, visited_at_lat, visited_at_lon, distance_m,
    visited_by, visited_by_name, visited_by_email, etapa_anterior
  ) VALUES (
    p_client_id, now(), p_user_lat, p_user_lon, round(v_distance_m, 1),
    v_caller, v_name, v_email, v_etapa_anterior
  );

  -- Visita NAO muda status (decisao de 20260619): a informacao "visitado"
  -- vive em visited_at/client_visits. Mudar o status aqui tirava o lead do
  -- recorte de sector_visibility e ele sumia do app.
  UPDATE public.clients
     SET visited_at     = now(),
         visited_at_lat = p_user_lat,
         visited_at_lon = p_user_lon,
         visited_by     = v_caller,
         visit_count    = COALESCE(visit_count, 0) + 1,
         updated_by     = v_caller,
         updated_at     = now()
   WHERE id = p_client_id
   RETURNING * INTO v_client;

  RETURN v_client;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_client_as_visited(uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_client_as_visited(uuid, numeric, numeric) TO authenticated;

COMMENT ON FUNCTION public.mark_client_as_visited(uuid, numeric, numeric) IS
  'Registra visita (check-in com GPS) a no máximo 200 m do lead (500 m se geo_approximate). Insere em client_visits, incrementa visit_count e preenche visited_at/coords/visited_by SEM alterar o status.';

-- ===== 2) Repara os leads que o bug deixou invisiveis =======================
-- Todos os 'lead_visitado' atuais vieram de check-ins entre 27/07 e 29/07
-- (conferido em client_visits; todos com etapa de funil de lead). O guard
-- vivo permite lead_visitado -> lead.
UPDATE public.clients
   SET status = 'lead',
       updated_at = now()
 WHERE status = 'lead_visitado';

-- ===== 3) gestor_metrics: "Visitados" conta por visited_at ==================
-- Unica mudanca em relacao a versao anterior: total_visited deixa de contar
-- status='lead_visitado' (que agora e' sempre zero) e passa a contar leads
-- com visited_at preenchido.
CREATE OR REPLACE FUNCTION public.gestor_metrics(
  p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.gestor_metrics_guard();
  WITH
  g AS (SELECT count(*) AS total_clients,
      count(*) FILTER (WHERE status='lead') AS total_leads,
      count(*) FILTER (WHERE visited_at IS NOT NULL) AS total_visited,
      count(*) FILTER (WHERE status='cliente') AS total_active_clients,
      count(*) FILTER (WHERE status='churn') AS total_churn,
      count(*) FILTER (WHERE created_by IS NOT NULL AND (p_start IS NULL OR created_at>=p_start) AND (p_end IS NULL OR created_at<=p_end)) AS created_in_period,
      count(*) FILTER (WHERE visited_by IS NOT NULL AND (p_start IS NULL OR visited_at>=p_start) AND (p_end IS NULL OR visited_at<=p_end)) AS visited_in_period,
      count(*) FILTER (WHERE won_at IS NOT NULL AND (p_start IS NULL OR won_at>=p_start) AND (p_end IS NULL OR won_at<=p_end)) AS won_in_period
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
  won_by_seller AS (SELECT vendedor_id_hubspot AS hid, count(*) AS n FROM public.clients
    WHERE won_at IS NOT NULL AND vendedor_id_hubspot IS NOT NULL
      AND (p_start IS NULL OR won_at>=p_start) AND (p_end IS NULL OR won_at<=p_end) GROUP BY vendedor_id_hubspot),
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
      COALESCE(wb.n,0) AS won_in_period,
      COALESCE(at.leads_assigned,0) AS leads_assigned, COALESCE(at.status_breakdown,'{}'::jsonb) AS status_breakdown
    FROM public.profiles p
    LEFT JOIN created_by_seller cb ON cb.sid=p.id LEFT JOIN visited_by_seller vb ON vb.sid=p.id
    LEFT JOIN meetings_by_seller mb ON mb.sid=p.id LEFT JOIN stage_by_seller sb ON sb.sid=p.id
    LEFT JOIN notes_by_seller nb ON nb.sid=p.id LEFT JOIN assigned_totals at ON at.hid=p.id_hubspot
    LEFT JOIN won_by_seller wb ON wb.hid=p.id_hubspot)
  SELECT jsonb_build_object(
    'global', jsonb_build_object(
      'total_clients',(SELECT total_clients FROM g),'total_leads',(SELECT total_leads FROM g),
      'total_visited',(SELECT total_visited FROM g),'total_active_clients',(SELECT total_active_clients FROM g),
      'total_churn',(SELECT total_churn FROM g),'created_in_period',(SELECT created_in_period FROM g),
      'visited_in_period',(SELECT visited_in_period FROM g),'won_in_period',(SELECT won_in_period FROM g),
      'meetings_in_period',(SELECT meetings_in_period FROM m),
      'follow_ups_in_period',(SELECT follow_ups_in_period FROM m),'stage_changes_in_period',(SELECT stage_changes_in_period FROM sc),
      'notes_in_period',(SELECT notes_in_period FROM nt)),
    'sellers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'seller_id',id,'full_name',full_name,'email',email,'id_hubspot',id_hubspot,'sector',sector,
      'created',created,'visited',visited,'meetings_scheduled',meetings_scheduled,'follow_ups_scheduled',follow_ups_scheduled,
      'stage_changes',stage_changes,'notes_created',notes_created,'won_in_period',won_in_period,
      'leads_assigned',leads_assigned,'status_breakdown',status_breakdown)) FROM sellers),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;

-- ===== 4) Guard: bloqueia UPDATE pra slug legado inativo =====================
-- Slugs 'lead_nao_visitado'/'lead_visitado' estao inativos desde 20260619 e
-- fora de todos os recortes de sector_visibility — um registro que caia neles
-- vira "fantasma" (existe no banco, invisivel no app). INSERT continua livre
-- (webhook valida contra client_statuses ativos); so a transicao via UPDATE
-- e' bloqueada.
CREATE OR REPLACE FUNCTION public.guard_client_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status IN ('cliente', 'churn') AND NEW.status = 'lead' THEN
      RAISE EXCEPTION
        'Cliente ativo ou ex-cliente nao pode voltar pra lead. Status atual: %, tentou ir pra: %',
        OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.status IN ('lead_nao_visitado', 'lead_visitado') THEN
      RAISE EXCEPTION
        'Status "%" e'' um slug legado inativo (unificado em "lead" desde 2026-06-19) — registro ficaria invisivel no app.',
        NEW.status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
