-- Aumenta o raio aceito pra marcar um lead como visitado de 20m para 50m.
-- Substitui a função mark_client_as_visited mantendo a mesma assinatura.

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
  v_max_distance_m constant numeric := 50;
  v_visited_slug constant text := 'lead_visitado';
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

  PERFORM set_config('app.allow_visit_status_update', 'on', true);

  UPDATE public.clients
     SET status         = v_visited_slug,
         visited_at     = now(),
         visited_at_lat = p_user_lat,
         visited_at_lon = p_user_lon,
         visited_by     = v_caller,
         updated_by     = v_caller,
         updated_at     = now()
   WHERE id = p_client_id
   RETURNING * INTO v_client;

  RETURN v_client;
END;
$$;

COMMENT ON FUNCTION public.mark_client_as_visited(uuid, numeric, numeric) IS
  'Marca um lead como visitado se o usuário autenticado estiver a no máximo 50 m das coordenadas do lead (Haversine). Único caminho válido para a transição -> lead_visitado.';
