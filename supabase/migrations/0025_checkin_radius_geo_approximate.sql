-- ============================================================================
-- Check-in: raio dinamico conforme a precisao do pin + backfill do campo numero.
--
-- Contexto: cadastro via CEP concatenava o numero DENTRO de `endereco`
-- ("Rua X, 1086") e deixava a coluna `numero` vazia (aparecia "sem numero").
-- Alem disso, o Nominatim/OSM raramente tem o numero exato das casas no Brasil,
-- entao o pin caia no centroide da rua (~100-300m fora).
--
-- Correcoes:
--  1. mark_client_as_visited passa a usar raio de 500m quando
--     geo_approximate = true (pin impreciso), mantendo 50m quando preciso.
--  2. Backfill: extrai o numero do fim de `endereco` pra coluna `numero`,
--     limpa o `endereco`, e marca geo_approximate = true nesses registros.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_client_as_visited(p_client_id uuid, p_user_lat numeric, p_user_lon numeric)
RETURNS clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client public.clients;
  v_distance_m numeric;
  v_caller uuid := auth.uid();
  v_max_distance_m numeric;
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

  -- Raio maior quando o pin e aproximado (geocoding de CEP sem numero exato).
  v_max_distance_m := CASE WHEN v_client.geo_approximate IS TRUE THEN 500 ELSE 50 END;

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

-- Backfill unico dos leads com numero embutido no endereco.
UPDATE public.clients
SET
  numero = (regexp_match(endereco, ',\s*(\d+[A-Za-z]?)\s*$'))[1],
  endereco = btrim(regexp_replace(endereco, ',\s*\d+[A-Za-z]?\s*$', '')),
  geo_approximate = true,
  updated_at = now()
WHERE (numero is null or btrim(numero) = '')
  and endereco ~ ',\s*\d+[A-Za-z]?\s*$';
