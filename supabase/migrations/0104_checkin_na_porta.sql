-- 0104 — Check-in que funciona na porta (mapa novo, entrega 5)
--
-- O gargalo nº 1 do campo (Julyan, 25/09/2026): "o app fala que o executivo
-- está longe sendo que ele está na porta". Medido no banco no mesmo dia:
--   - pino que nasceu do GPS do executivo (geo_source 'coords'): 1.032 pinos,
--     709 já visitados com check-in (69%);
--   - pino que nasceu de endereço convertido pelo OpenStreetMap ('nominatim'):
--     4.143 pinos, 26 visitados (0,7%) — e marcados como EXATOS, então caem
--     no raio curto de 200 m. 874 deles têm a mesma coordenada de outro lead
--     (centro da rua / do CEP). HubSpot: 406 repetidos; munição: 518.
-- O problema não é o GPS nem o raio: é o pino no lugar errado.
--
-- 1. "Estou na porta": mark_client_as_visited ganha p_corrigir_pino. Com
--    distância acima do raio, o pino NUNCA confirmado na porta e o GPS firme
--    (precisão ≤ 40 m), o pino vai para a posição do GPS e o check-in entra
--    no mesmo toque. Teto de 2 km (acima disso é outro lugar: mover à mão).
--    Fica registrado de onde o pino saiu e quantos metros andou
--    (client_visits.pino_corrigido_de_m / pino_anterior_lat/lon), para o
--    gestor auditar.
-- 2. Posição confirmada vence: o webhook do HubSpot recalcula a coordenada
--    pelo endereço a cada atualização do negócio e sobrescrevia o pino. Um
--    gatilho mantém a posição quando ela foi confirmada por GPS ('checkin' ou
--    'coords' exato) e a nova vem de conversão de endereço.

alter table public.client_visits
  add column if not exists pino_corrigido_de_m numeric,
  add column if not exists pino_anterior_lat numeric,
  add column if not exists pino_anterior_lon numeric;
comment on column public.client_visits.pino_corrigido_de_m is
  'Check-in "Estou na porta" (0104): o pino estava a esta distância e foi para o GPS do executivo. Nulo = pino não mudou.';

-- ---------------------------------------------------------------- posição confirmada vence
create or replace function public.clients_protege_posicao_confirmada()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if (old.latitude is distinct from new.latitude or old.longitude is distinct from new.longitude)
     and old.geo_source in ('checkin', 'coords') and not coalesce(old.geo_approximate, false)
     and old.latitude is not null
     and coalesce(new.geo_source, '') not in ('checkin', 'coords') then
    new.latitude := old.latitude;
    new.longitude := old.longitude;
    new.geo_source := old.geo_source;
    new.geo_approximate := old.geo_approximate;
  end if;
  return new;
end $$;

drop trigger if exists clients_protege_posicao_confirmada on public.clients;
create trigger clients_protege_posicao_confirmada before update of latitude, longitude, geo_source
  on public.clients for each row execute function public.clients_protege_posicao_confirmada();

-- ---------------------------------------------------------------- check-in
drop function if exists public.mark_client_as_visited(uuid, numeric, numeric, numeric, uuid, timestamptz);
create or replace function public.mark_client_as_visited(
  p_client_id uuid, p_user_lat numeric, p_user_lon numeric,
  p_accuracy_m numeric default null, p_acao_id uuid default null, p_feito_em timestamptz default null,
  p_corrigir_pino boolean default false)
returns public.clients
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_client public.clients;
  v_distance_m numeric;
  v_caller uuid := auth.uid();
  v_max_distance_m numeric;
  v_etapa_anterior text;
  v_name text;
  v_email text;
  v_quando timestamptz;
  v_confirmado boolean;
  v_corrigido_de numeric;
  v_ant_lat numeric;
  v_ant_lon numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;

  -- Fila offline: a mesma ação já gravada devolve o lead sem gravar de novo.
  IF p_acao_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.client_visits WHERE acao_id = p_acao_id) THEN
    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
    RETURN v_client;
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
    -- "Estou na porta": só pino que nunca foi confirmado por GPS exato, só com
    -- GPS firme e só até 2 km (acima disso é outro lugar — mover à mão).
    v_confirmado := v_client.geo_source IN ('checkin', 'coords') AND NOT coalesce(v_client.geo_approximate, false);
    IF p_corrigir_pino AND NOT v_confirmado AND p_accuracy_m IS NOT NULL AND p_accuracy_m <= 40 AND v_distance_m <= 2000 THEN
      v_corrigido_de := round(v_distance_m, 1);
      v_ant_lat := v_client.latitude;
      v_ant_lon := v_client.longitude;
      UPDATE public.clients
         SET latitude = p_user_lat, longitude = p_user_lon,
             geo_source = 'checkin', geo_approximate = false,
             updated_by = v_caller, updated_at = now()
       WHERE id = p_client_id
       RETURNING * INTO v_client;
      v_distance_m := 0;
    ELSIF p_corrigir_pino AND v_confirmado THEN
      RAISE EXCEPTION 'Este pino já foi confirmado na porta por GPS e está a % m de você. Se o lugar mudou, use "Mover pino".',
        round(v_distance_m) USING ERRCODE = 'P0001';
    ELSIF p_corrigir_pino AND (p_accuracy_m IS NULL OR p_accuracy_m > 40) THEN
      RAISE EXCEPTION 'GPS ainda impreciso (±% m). Aguarde o GPS firmar e toque de novo.', coalesce(round(p_accuracy_m), 0)
        USING ERRCODE = 'P0001';
    ELSIF p_corrigir_pino THEN
      RAISE EXCEPTION 'Você está a % m do pino — longe demais para ser a porta. Use "Mover pino" se o lugar é outro.',
        round(v_distance_m) USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'Você está a % m do lead (limite: % m). Aproxime-se do local para marcar como visitado.',
        round(v_distance_m, 1), v_max_distance_m
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Hora do toque (check-in que esperou sinal): nunca no futuro nem mais de 48 h atrás.
  v_quando := CASE WHEN p_feito_em IS NULL OR p_feito_em > now() OR p_feito_em < now() - interval '48 hours'
                   THEN now() ELSE p_feito_em END;

  v_etapa_anterior := v_client.etapa;

  SELECT full_name, email INTO v_name, v_email
    FROM public.profiles WHERE id = v_caller;

  BEGIN
    INSERT INTO public.client_visits (
      client_id, visited_at, visited_at_lat, visited_at_lon, distance_m,
      visited_by, visited_by_name, visited_by_email, etapa_anterior, accuracy_m, acao_id,
      pino_corrigido_de_m, pino_anterior_lat, pino_anterior_lon
    ) VALUES (
      p_client_id, v_quando, p_user_lat, p_user_lon, round(v_distance_m, 1),
      v_caller, coalesce(public.vendedor_nome(v_caller), v_name), v_email, v_etapa_anterior,
      round(p_accuracy_m, 1), p_acao_id,
      v_corrigido_de, v_ant_lat, v_ant_lon
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN v_client;
  END;

  -- Visita NAO muda status (decisao de 20260619).
  UPDATE public.clients
     SET visited_at     = greatest(coalesce(visited_at, v_quando), v_quando),
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
$function$;

revoke all on function public.mark_client_as_visited(uuid, numeric, numeric, numeric, uuid, timestamptz, boolean) from public, anon;
grant execute on function public.mark_client_as_visited(uuid, numeric, numeric, numeric, uuid, timestamptz, boolean) to authenticated, service_role;
