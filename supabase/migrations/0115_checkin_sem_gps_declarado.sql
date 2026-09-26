-- 0115 · Check-in sem GPS nenhum, como visita declarada (26/09/2026)
--
-- POR QUÊ: com a localização negada no celular não existe coordenada, e a RPC
-- recusava ('Localização do usuário não informada'). O handoff v4.1 §9 pede que a
-- visita declarada continue disponível com GPS negado, e o Julyan decidiu (26/09):
-- quando o GPS falha, a visita entra com FOTO obrigatória como prova — a foto é
-- exigida pelo app antes de chamar esta função e vai para fotos_visita.
--
-- O QUE MUDA, e só isto: coordenada nula passa a ser aceita QUANDO p_declarada.
-- A visita entra com declarada = true, sem lugar (visited_at_lat/lon nulos) e sem
-- distância. Sem p_declarada, coordenada nula continua sendo recusada. O resto
-- da função é o mesmo da 0113 (idempotência por acao_id, uma visita por dia,
-- correção de pino, raio de 200/500 m).
create or replace function public.mark_client_as_visited(
  p_client_id uuid, p_user_lat numeric, p_user_lon numeric,
  p_accuracy_m numeric default null, p_acao_id uuid default null,
  p_feito_em timestamptz default null, p_corrigir_pino boolean default false,
  p_declarada boolean default false)
returns public.clients
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_client public.clients; v_distance_m numeric; v_caller uuid := auth.uid(); v_max_distance_m numeric;
  v_etapa_anterior text; v_name text; v_email text; v_quando timestamptz; v_confirmado boolean;
  v_corrigido_de numeric; v_ant_lat numeric; v_ant_lon numeric; v_declarada boolean := false;
  v_sem_gps boolean := false;
begin
  if v_caller is null then raise exception 'Usuário não autenticado' using errcode = '28000'; end if;
  if p_acao_id is not null and exists (select 1 from public.client_visits where acao_id = p_acao_id) then
    select * into v_client from public.clients where id = p_client_id; return v_client;
  end if;
  if p_user_lat is null or p_user_lon is null then
    -- 0115: sem GPS só como visita declarada (a foto de prova é do app).
    if not coalesce(p_declarada, false) then
      raise exception 'Localização do usuário não informada' using errcode = 'P0001';
    end if;
    v_sem_gps := true;
  end if;
  select * into v_client from public.clients where id = p_client_id;
  if not found then raise exception 'Lead não encontrado' using errcode = 'P0002'; end if;

  if v_sem_gps then
    v_declarada := true;
    v_distance_m := null;
  else
    if v_client.latitude is null or v_client.longitude is null then raise exception 'Lead sem coordenadas — impossível validar proximidade.' using errcode = 'P0001'; end if;
    v_max_distance_m := case when v_client.geo_approximate is true then 500 else 200 end;
    v_distance_m := 2 * 6371000 * asin(sqrt(
      power(sin(radians((p_user_lat - v_client.latitude) / 2)), 2) +
      cos(radians(v_client.latitude)) * cos(radians(p_user_lat)) *
      power(sin(radians((p_user_lon - v_client.longitude) / 2)), 2)));
    if v_distance_m > v_max_distance_m then
      v_confirmado := v_client.geo_source in ('checkin', 'coords') and not coalesce(v_client.geo_approximate, false);
      if p_declarada and not p_corrigir_pino then
        v_declarada := true;
      elsif p_corrigir_pino and not v_confirmado and p_accuracy_m is not null and p_accuracy_m <= 40 and v_distance_m <= 2000 then
        v_corrigido_de := round(v_distance_m, 1); v_ant_lat := v_client.latitude; v_ant_lon := v_client.longitude;
        update public.clients set latitude = p_user_lat, longitude = p_user_lon, geo_source = 'checkin', geo_approximate = false,
               updated_by = v_caller, updated_at = now() where id = p_client_id returning * into v_client;
        v_distance_m := 0;
      elsif p_corrigir_pino and v_confirmado then
        raise exception 'Este pino já foi confirmado na porta por GPS e está a % m de você. Se o lugar mudou, use "Mover pino".', round(v_distance_m) using errcode = 'P0001';
      elsif p_corrigir_pino and (p_accuracy_m is null or p_accuracy_m > 40) then
        raise exception 'GPS ainda impreciso (±% m). Aguarde o GPS firmar e toque de novo.', coalesce(round(p_accuracy_m), 0) using errcode = 'P0001';
      elsif p_corrigir_pino then
        raise exception 'Você está a % m do pino — longe demais para ser a porta. Use "Mover pino" se o lugar é outro.', round(v_distance_m) using errcode = 'P0001';
      else
        raise exception 'Você está a % m do lead (limite: % m). Aproxime-se do local para marcar como visitado.', round(v_distance_m, 1), v_max_distance_m using errcode = 'P0001';
      end if;
    end if;
  end if;

  v_quando := case when p_feito_em is null or p_feito_em > now() or p_feito_em < now() - interval '48 hours' then now() else p_feito_em end;
  -- 0113: mesmo vendedor, mesmo lead, mesmo dia (Brasília) = a mesma visita.
  if exists (
    select 1 from public.client_visits
     where client_id = p_client_id
       and visited_by = v_caller
       and (visited_at at time zone 'America/Sao_Paulo')::date = (v_quando at time zone 'America/Sao_Paulo')::date
  ) then
    return v_client;
  end if;

  v_etapa_anterior := v_client.etapa;
  select full_name, email into v_name, v_email from public.profiles where id = v_caller;
  begin
    insert into public.client_visits (client_id, visited_at, visited_at_lat, visited_at_lon, distance_m, visited_by, visited_by_name, visited_by_email, etapa_anterior, accuracy_m, acao_id, pino_corrigido_de_m, pino_anterior_lat, pino_anterior_lon, declarada)
    values (p_client_id, v_quando, p_user_lat, p_user_lon, round(v_distance_m, 1), v_caller, coalesce(public.vendedor_nome(v_caller), v_name), v_email, v_etapa_anterior, round(p_accuracy_m, 1), p_acao_id, v_corrigido_de, v_ant_lat, v_ant_lon, v_declarada);
  exception when unique_violation then return v_client;
  end;
  update public.clients
     set visited_at = greatest(coalesce(visited_at, v_quando), v_quando),
         visited_at_lat = case when v_declarada then visited_at_lat else p_user_lat end,
         visited_at_lon = case when v_declarada then visited_at_lon else p_user_lon end,
         visited_by = v_caller, visit_count = coalesce(visit_count, 0) + 1, updated_by = v_caller, updated_at = now()
   where id = p_client_id returning * into v_client;
  return v_client;
end;
$function$;
