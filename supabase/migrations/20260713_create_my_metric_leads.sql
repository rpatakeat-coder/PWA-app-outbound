-- ============================================================================
-- my_metric_leads: leads por tras de cada metrica do PROPRIO usuario (drill-down
-- dos cards da tela "Meu Desempenho").
--
-- BUG QUE ISSO CORRIGE: o app chamava supabase.rpc('my_metric_leads', ...) ao
-- tocar num card (visitas, reunioes, notas, mudancas de etapa, pins criados,
-- fechados, atribuidos), mas a funcao nunca tinha sido criada no banco — so
-- existiam my_metrics (os numeros) e gestor_metric_leads (drill-down do gestor).
-- Resultado: os modais de "ver os pins por tras do numero" quebravam/vazios pra
-- todos os vendedores.
--
-- Espelha gestor_metric_leads, mas SEM guard de gestor e forcando o recorte ao
-- proprio vendedor: created/visited/meetings/follow_ups/stage_changes/notes por
-- <coluna>_by = auth.uid(); won/assigned por vendedor_id_hubspot = meu id_hubspot.
--
-- Aplicada via apply_migration 'create_my_metric_leads' em 2026-07-13.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.my_metric_leads(
  p_metric text,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_uid uuid := auth.uid();
  v_hid text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nao autenticado' USING ERRCODE='28000'; END IF;
  SELECT id_hubspot INTO v_hid FROM public.profiles WHERE id = v_uid;

  WITH rows AS (
    SELECT c.id AS client_id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome') AS name, c.status, c.created_at AS at, NULL::text AS note
    FROM public.clients c
    WHERE p_metric='created' AND c.created_by=v_uid
      AND (p_start IS NULL OR c.created_at>=p_start) AND (p_end IS NULL OR c.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, c.visited_at, NULL
    FROM public.clients c
    WHERE p_metric='visited' AND c.visited_by=v_uid
      AND (p_start IS NULL OR c.visited_at>=p_start) AND (p_end IS NULL OR c.visited_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, COALESCE(mt.scheduled_at,mt.created_at), NULL
    FROM public.client_meetings mt JOIN public.clients c ON c.id=mt.client_id
    WHERE p_metric IN ('meetings','follow_ups') AND mt.created_by=v_uid
      AND ((p_metric='follow_ups' AND mt.type='follow_up') OR (p_metric='meetings' AND mt.type<>'follow_up'))
      AND (p_start IS NULL OR mt.created_at>=p_start) AND (p_end IS NULL OR mt.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, s.created_at, s.to_stage
    FROM public.client_stage_changes s JOIN public.clients c ON c.id=s.client_id
    WHERE p_metric='stage_changes' AND s.created_by=v_uid
      AND (p_start IS NULL OR s.created_at>=p_start) AND (p_end IS NULL OR s.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, n.created_at, n.body
    FROM public.client_notes n JOIN public.clients c ON c.id=n.client_id
    WHERE p_metric='notes' AND n.created_by=v_uid
      AND (p_start IS NULL OR n.created_at>=p_start) AND (p_end IS NULL OR n.created_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, c.won_at, NULL
    FROM public.clients c
    WHERE p_metric='won' AND c.won_at IS NOT NULL AND v_hid IS NOT NULL AND c.vendedor_id_hubspot=v_hid
      AND (p_start IS NULL OR c.won_at>=p_start) AND (p_end IS NULL OR c.won_at<=p_end)
    UNION ALL
    SELECT c.id, COALESCE(NULLIF(btrim(c.empresa),''),NULLIF(btrim(c.nome),''),'Sem nome'), c.status, c.created_at, NULL
    FROM public.clients c
    WHERE p_metric='assigned' AND v_hid IS NOT NULL AND c.vendedor_id_hubspot=v_hid
      AND (p_status IS NULL OR c.status=p_status)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'client_id',client_id,'name',name,'status',status,'at',at,'note',note
  ) ORDER BY at DESC NULLS LAST),'[]'::jsonb) INTO v_result FROM rows;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.my_metric_leads(text, timestamptz, timestamptz, text) TO authenticated;
