-- 0109 · Visita declarada (prompt final, Parte A §8.2.2)
--
-- Pino exato e o executivo a mais de 200 m (500 m se aproximado): hoje o app
-- só diz "Aproxime-se" e a visita não existe em lugar nenhum. O prompt pede a
-- saída "Registrar como visita declarada": a visita entra, MARCADA como sem
-- GPS no local, com a distância real guardada — nunca disfarçada de check-in.
--
-- O que muda:
--   1. client_visits.declarada (default false: as 100% linhas atuais são GPS).
--   2. mark_client_as_visited ganha p_declarada. Com ele, a distância não
--      barra; nada de corrigir pino; o GPS lido e a distância ficam gravados;
--      o lead NÃO recebe visited_at_lat/lon (a posição da visita não é o lugar).
--
-- Quem lê client_visits e passa a ver a declarada como visita comum (decisão
-- do Julyan se ela conta no placar): gestao/src/dados daily, semana, pessoas,
-- equipe; src/hooks useMinhaDaily, useVisitsHeatmap; export-report.
--
-- Idempotente. Reverter: drop a função de 8 args, recriar a de 7 (0104) e
-- drop column declarada.

alter table public.client_visits
  add column if not exists declarada boolean not null default false;

comment on column public.client_visits.declarada is
  'Visita registrada fora do raio (sem GPS no local): o executivo declarou que esteve lá. distance_m guarda a distância real no toque.';

-- A de 7 argumentos sai: com a de 8 (p_declarada default false) as duas
-- casariam a mesma chamada e o PostgREST recusaria por ambiguidade.
drop function if exists public.mark_client_as_visited(uuid, numeric, numeric, numeric, uuid, timestamptz, boolean);

create or replace function public.mark_client_as_visited(
  p_client_id uuid, p_user_lat numeric, p_user_lon numeric,
  p_accuracy_m numeric default null, p_acao_id uuid default null, p_feito_em timestamptz default null,
  p_corrigir_pino boolean default false, p_declarada boolean default false)
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
  v_declarada boolean := false;
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

  v_max_distance_m := CASE WHEN v_client.geo_approximate IS TRUE THEN 500 ELSE 200 END;

  v_distance_m := 2 * 6371000 * asin(sqrt(
    power(sin(radians((p_user_lat - v_client.latitude) / 2)), 2) +
    cos(radians(v_client.latitude)) * cos(radians(p_user_lat)) *
    power(sin(radians((p_user_lon - v_client.longitude) / 2)), 2)
  ));

  IF v_distance_m > v_max_distance_m THEN
    v_confirmado := v_client.geo_source IN ('checkin', 'coords') AND NOT coalesce(v_client.geo_approximate, false);
    IF p_declarada AND NOT p_corrigir_pino THEN
      -- Declarada: entra, marcada, com a distância real. Não mexe no pino.
      v_declarada := true;
    ELSIF p_corrigir_pino AND NOT v_confirmado AND p_accuracy_m IS NOT NULL AND p_accuracy_m <= 40 AND v_distance_m <= 2000 THEN
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

  v_quando := CASE WHEN p_feito_em IS NULL OR p_feito_em > now() OR p_feito_em < now() - interval '48 hours'
                   THEN now() ELSE p_feito_em END;

  v_etapa_anterior := v_client.etapa;

  SELECT full_name, email INTO v_name, v_email
    FROM public.profiles WHERE id = v_caller;

  BEGIN
    INSERT INTO public.client_visits (
      client_id, visited_at, visited_at_lat, visited_at_lon, distance_m,
      visited_by, visited_by_name, visited_by_email, etapa_anterior, accuracy_m, acao_id,
      pino_corrigido_de_m, pino_anterior_lat, pino_anterior_lon, declarada
    ) VALUES (
      p_client_id, v_quando, p_user_lat, p_user_lon, round(v_distance_m, 1),
      v_caller, coalesce(public.vendedor_nome(v_caller), v_name), v_email, v_etapa_anterior,
      round(p_accuracy_m, 1), p_acao_id,
      v_corrigido_de, v_ant_lat, v_ant_lon, v_declarada
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN v_client;
  END;

  -- Visita NAO muda status (decisao de 20260619). Declarada não grava a
  -- posição da visita no lead: ela não é o lugar.
  UPDATE public.clients
     SET visited_at     = greatest(coalesce(visited_at, v_quando), v_quando),
         visited_at_lat = CASE WHEN v_declarada THEN visited_at_lat ELSE p_user_lat END,
         visited_at_lon = CASE WHEN v_declarada THEN visited_at_lon ELSE p_user_lon END,
         visited_by     = v_caller,
         visit_count    = COALESCE(visit_count, 0) + 1,
         updated_by     = v_caller,
         updated_at     = now()
   WHERE id = p_client_id
   RETURNING * INTO v_client;

  RETURN v_client;
END;
$function$;

revoke all on function public.mark_client_as_visited(uuid, numeric, numeric, numeric, uuid, timestamptz, boolean, boolean) from public, anon;
grant execute on function public.mark_client_as_visited(uuid, numeric, numeric, numeric, uuid, timestamptz, boolean, boolean) to authenticated, service_role;
