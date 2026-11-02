-- 0247 · A origem do pino separa o que foi CONFIRMADO NA PORTA do que foi APONTADO NO MAPA (02/11/26)
--
-- NÃO APLICADA. O app (branch fix/pino-porta-ou-endereco) funciona sem ela; ela tira as amarras do
-- banco de hoje. Auditoria de 02/11/26: 70 de 439 leads visitados com GPS de ±40 m estão a mais de
-- 100 m do pino; 53 deles são 'coords'. 'coords' era ao mesmo tempo "GPS de alguém na porta" e "a mira
-- no mapa" (Posicionar, Mover pino, cadastro feito do escritório), e o banco tratava os dois como
-- confirmados: a mark_client_as_visited recusava o "Estou na porta" e o gatilho
-- clients_protege_posicao_confirmada impedia a correção. Pino posto errado ficava errado para sempre.
--
-- As origens a partir do app novo (src/utils/precisaoDoPino.ts):
--   'checkin'  GPS de ±40 m na porta (cadastro na porta, ou correção no Cheguei) — o ÚNICO confirmado;
--   'mapa'     apontado no mapa por gente: na porta com GPS ruim (exato) ou pelo Mover pino (aproximado);
--   'geocode'  pelo endereço digitado ("Não estou lá"), sempre aproximado;
--   'coords'   os 1.450 pinos de antes (não confirmados daqui em diante; nada é reescrito).
--
-- O que muda:
--   1. geo_source NÃO tem check constraint (conferido em 02/11/26: pg_constraint de clients sem
--      geo_source; a 0242 só trocou grafias). 'mapa' já entra; aqui fica só o comentário da coluna.
--   2. clients_protege_posicao_confirmada protege só 'checkin' exato, e só um GPS novo ('checkin') o move.
--   3. mark_client_as_visited: v_confirmado só 'checkin'; e um ramo novo — CORREÇÃO DENTRO DO RAIO:
--      com p_corrigir_pino, GPS de ±40 m e o pino dentro do raio, o pino vem para o GPS ('checkin') e a
--      visita guarda o pino de ANTES (pino_lat/pino_lng/pino_aproximado) sem pino_corrigido_de_m — a
--      prova do GPS fica, porque a distância medida (dentro do raio) é até o pino de antes. O app de
--      hoje não depende deste ramo (move o pino por update DEPOIS da visita gravada); ele existe para o
--      caminho atômico, quando o app passar a usá-lo.
--   4. lead_criado_na_hora e clients_origem_lead reconhecem as origens novas do cadastro pelo app
--      (sem isto, o lead criado na porta com 'checkin'/'mapa' deixa de contar como "lead criado na
--      rua" no bônus da semana; o app já manda origem_lead = 'cadastro_na_rua' no insert).

-- ── 1 · a coluna ────────────────────────────────────────────────────────────────────────────────
comment on column public.clients.geo_source is
  'Origem do pino. checkin = GPS de ±40 m na porta (o único confirmado); mapa = apontado no mapa por gente '
  '(exato quando na porta, aproximado no Mover pino); geocode = endereço digitado; coords = legado (antes de '
  '0247: GPS ou mira, sem distinção); nominatim/google/hubspot/google_place/leads_prospeccao/address = automáticos.';

-- ── 2 · o gatilho que protege a posição confirmada ──────────────────────────────────────────────
create or replace function public.clients_protege_posicao_confirmada()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- (0247) só o 'checkin' exato é confirmado, e só outro GPS na porta ('checkin') o move
  if (old.latitude is distinct from new.latitude or old.longitude is distinct from new.longitude)
     and old.geo_source = 'checkin' and not coalesce(old.geo_approximate, false)
     and old.latitude is not null
     and coalesce(new.geo_source, '') <> 'checkin' then
    new.latitude := old.latitude;
    new.longitude := old.longitude;
    new.geo_source := old.geo_source;
    new.geo_approximate := old.geo_approximate;
  end if;
  return new;
end $function$;

-- ── 3 · o Cheguei ───────────────────────────────────────────────────────────────────────────────
-- A função de produção (pg_get_functiondef em 02/11/26) com duas trocas, o resto igual:
--   a. v_confirmado só 'checkin';
--   b. o ramo "corrigir dentro do raio" (v_distance_m <= v_max_distance_m).
create or replace function public.mark_client_as_visited(p_client_id uuid, p_user_lat numeric, p_user_lon numeric, p_accuracy_m numeric default null::numeric, p_acao_id uuid default null::uuid, p_feito_em timestamp with time zone default null::timestamp with time zone, p_corrigir_pino boolean default false, p_declarada boolean default false)
returns clients
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_client public.clients; v_distance_m numeric; v_caller uuid := auth.uid(); v_max_distance_m numeric;
  v_etapa_anterior text; v_name text; v_email text; v_quando timestamptz; v_confirmado boolean;
  v_corrigido_de numeric; v_ant_lat numeric; v_ant_lon numeric; v_declarada boolean := false;
  v_sem_gps boolean := false;
  -- (0247) o pino da visita quando ele foi corrigido dentro do raio: o de ANTES
  v_pino_lat numeric; v_pino_lng numeric; v_pino_aprox boolean;
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
    -- (0247 a) só o GPS na porta confirma
    v_confirmado := v_client.geo_source = 'checkin' and not coalesce(v_client.geo_approximate, false);
    if v_distance_m > v_max_distance_m then
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
    elsif p_corrigir_pino and p_accuracy_m is not null and p_accuracy_m <= 40 and not coalesce(p_declarada, false) then
      -- (0247 b) CORREÇÃO DENTRO DO RAIO: a visita é medida (e provada) contra o pino de antes, que
      -- ela guarda; o pino passa a ser o GPS de agora. Sem pino_corrigido_de_m: o GPS segue provando.
      v_pino_lat := v_client.latitude; v_pino_lng := v_client.longitude; v_pino_aprox := v_client.geo_approximate;
      v_ant_lat := v_client.latitude; v_ant_lon := v_client.longitude;
      update public.clients set latitude = p_user_lat, longitude = p_user_lon, geo_source = 'checkin', geo_approximate = false,
             updated_by = v_caller, updated_at = now() where id = p_client_id returning * into v_client;
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
    -- (0247 b) pino_lat/pino_lng/pino_aproximado só vão preenchidos na correção dentro do raio; nulos,
    -- o gatilho congela_pino_da_visita (0242) grava o pino atual, como antes
    insert into public.client_visits (client_id, visited_at, visited_at_lat, visited_at_lon, distance_m, visited_by, visited_by_name, visited_by_email, etapa_anterior, accuracy_m, acao_id, pino_corrigido_de_m, pino_anterior_lat, pino_anterior_lon, declarada, pino_lat, pino_lng, pino_aproximado)
    values (p_client_id, v_quando, p_user_lat, p_user_lon, round(v_distance_m, 1), v_caller, coalesce(public.vendedor_nome(v_caller), v_name), v_email, v_etapa_anterior, round(p_accuracy_m, 1), p_acao_id, v_corrigido_de, v_ant_lat, v_ant_lon, v_declarada, v_pino_lat, v_pino_lng, v_pino_aprox);
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

-- ── 4 · o lead criado pelo app ──────────────────────────────────────────────────────────────────
create or replace function public.lead_criado_na_hora(p_client uuid, p_pessoa uuid, p_em timestamp with time zone)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.clients c
     where c.id = p_client
       and c.created_by = p_pessoa
       and c.origem = 'manual'
       -- (0247) as origens do cadastro NA PORTA: o legado 'coords' e as novas 'checkin'/'mapa'. O
       -- 'geocode' é o "Não estou lá" (endereço digitado de longe): não é lead criado na rua.
       and c.geo_source in ('coords', 'checkin', 'mapa')
       and c.created_at > p_em - interval '2 hours'
       and c.created_at <= p_em + interval '5 minutes');
$function$;

create or replace function public.clients_origem_lead()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fonte text;
  v_entrou timestamptz;
begin
  if new.origem_lead is not null then
    return new;
  end if;
  if new.lead_prospeccao_id is not null then
    select lp.fonte, lp.created_at into v_fonte, v_entrou
      from public.leads_prospeccao lp where lp.id = new.lead_prospeccao_id;
    new.origem_lead := public.origem_lead_da_fonte(v_fonte);
    new.origem_detalhe := coalesce(new.origem_detalhe, v_fonte);
    new.entrou_em := coalesce(new.entrou_em, v_entrou);
  end if;
  if new.origem_lead is null then
    new.origem_lead := case
      when new.origem = 'conta_alvo' then 'google_maps_motor'
      -- (0247) o cadastro pelo app grava 'checkin'/'mapa'/'geocode' além do legado 'coords'
      when new.origem = 'manual' and new.geo_source in ('coords', 'checkin', 'mapa', 'geocode') then 'cadastro_na_rua'
      when new.id_hubspot is not null then 'hubspot'
    end;
  end if;
  if tg_op = 'INSERT' then
    new.entrou_em := coalesce(new.entrou_em, new.created_at, now());
  end if;
  return new;
end $function$;
