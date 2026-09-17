-- Unifica lead_nao_visitado + lead_visitado num unico slug 'lead'.
-- A informacao de "visitado" passa a viver SO em visited_at (timestamp).
-- Cliente/churn tambem ganham permissao pra registrar visita (sem mudar status).

-- 1) Backfill defensivo: garante visited_at em qualquer lead_visitado que
--    por algum motivo ainda nao tenha (estado atual: 0 linhas, mas seguro).
UPDATE public.clients
SET visited_at = COALESCE(updated_at, now())
WHERE status = 'lead_visitado' AND visited_at IS NULL;

-- 2) Insere/atualiza o slug 'lead' (azul, vira o default novo).
INSERT INTO public.client_statuses (slug, label, color, sort_order, is_active, is_default_for_new_leads)
VALUES ('lead', 'Lead', '#3b82f6', 1, true, false)
ON CONFLICT (slug) DO UPDATE
SET label = EXCLUDED.label,
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

-- 3) Tira flag is_default_for_new_leads dos antigos.
UPDATE public.client_statuses
SET is_default_for_new_leads = false
WHERE slug IN ('lead_nao_visitado', 'lead_visitado');

-- 4) Promove 'lead' a default.
UPDATE public.client_statuses
SET is_default_for_new_leads = true
WHERE slug = 'lead';

-- 5) Migracao de dados: 341 linhas viram 'lead'. Desabilita triggers que
--    poderiam disparar guardas obsoletos durante a migracao.
ALTER TABLE public.clients DISABLE TRIGGER clients_block_visited_status_update;
ALTER TABLE public.clients DISABLE TRIGGER guard_client_status_transition;

UPDATE public.clients
SET status = 'lead'
WHERE status IN ('lead_nao_visitado', 'lead_visitado');

-- 6) Reabilita guard_client_status_transition com regra nova: cliente/churn
--    nao pode voltar pra 'lead' (mesma protecao de antes, slug novo).
CREATE OR REPLACE FUNCTION public.guard_client_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status IN ('cliente', 'churn')
     AND NEW.status = 'lead' THEN
    RAISE EXCEPTION
      'Cliente ativo ou ex-cliente nao pode voltar pra lead. Status atual: %, tentou ir pra: %',
      OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.clients ENABLE TRIGGER guard_client_status_transition;

-- 7) Drop trigger antigo de bloqueio de status='lead_visitado' direto.
--    Obsoleto: o status nao muda mais com a visita, so visited_at muda.
DROP TRIGGER IF EXISTS clients_block_visited_status_update ON public.clients;
DROP FUNCTION IF EXISTS public.clients_block_visited_status_update();

-- 8) Inativa slugs antigos (mantemos as linhas pra FK historico, mas
--    is_active=false faz sumir dos chips e do form).
UPDATE public.client_statuses
SET is_active = false
WHERE slug IN ('lead_nao_visitado', 'lead_visitado');

-- 9) Nova RPC mark_client_as_visited: nao muda mais o status. So preenche
--    visited_at, visited_at_lat, visited_at_lon, visited_by. Aceita
--    cliente/churn tambem (re-visita registrada). Mantem validacao de
--    auth + coords + 50m.
CREATE OR REPLACE FUNCTION public.mark_client_as_visited(
  p_client_id uuid, p_user_lat numeric, p_user_lon numeric
)
RETURNS clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client public.clients;
  v_distance_m numeric;
  v_caller uuid := auth.uid();
  v_max_distance_m constant numeric := 50;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = '28000';
  END IF;

  IF p_user_lat IS NULL OR p_user_lon IS NULL THEN
    RAISE EXCEPTION 'Localizacao do usuario nao informada' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_client.latitude IS NULL OR v_client.longitude IS NULL THEN
    RAISE EXCEPTION 'Cliente sem coordenadas - impossivel validar proximidade.' USING ERRCODE = 'P0001';
  END IF;

  v_distance_m := 2 * 6371000 * asin(sqrt(
    power(sin(radians((p_user_lat - v_client.latitude) / 2)), 2) +
    cos(radians(v_client.latitude)) * cos(radians(p_user_lat)) *
    power(sin(radians((p_user_lon - v_client.longitude) / 2)), 2)
  ));

  IF v_distance_m > v_max_distance_m THEN
    RAISE EXCEPTION 'Voce esta a % m do cliente (limite: % m). Aproxime-se do local para marcar como visitado.',
      round(v_distance_m, 1), v_max_distance_m
      USING ERRCODE = 'P0001';
  END IF;

  -- So preenche metadata de visita. Status fica intocado.
  UPDATE public.clients
     SET visited_at     = now(),
         visited_at_lat = p_user_lat,
         visited_at_lon = p_user_lon,
         visited_by     = v_caller,
         updated_by     = v_caller,
         updated_at     = now()
   WHERE id = p_client_id
   RETURNING * INTO v_client;

  RETURN v_client;
END;
$function$;

COMMENT ON FUNCTION public.mark_client_as_visited(uuid, numeric, numeric) IS
  'Registra visita ao cliente (qualquer status). Valida proximidade <=50m do cliente e auth. Preenche visited_at + coords + visited_by sem alterar status.';
