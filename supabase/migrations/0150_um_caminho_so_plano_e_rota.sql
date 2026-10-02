-- 0150 · Um caminho só entre o Planejamento do Cockpit e a rota do app — 02/10/2026
--
-- Julyan: "tem que ser as duas coisas, tudo um caminho só". As duas pontes já existiam
-- (planos_semanais -> plano_para_rota -> field_route_stops e field_route_stops ->
-- rota_para_plano -> planos_semanais), mas, medido hoje, o app e o Cockpit discordavam em
-- três pontos. Esta migração fecha os três:
--
--   1. O "Cheguei" fora do plano não chegava ao Planejamento: o app grava a parada já
--      'done' e o gatilho só olhava 'planned' e 'removed' (Kelly com 9 visitas assim hoje,
--      Bruno 6, Marco e André 4). Agora a visita entra na grade, marcada {fora:true,
--      feito:true}, para o gestor ver o que foi feito além do planejado.
--   2. Quando o item JÁ estava na grade, a ponte saía sem registrar o vínculo
--      (plano_rota_sincronizado). Tirar o item no Cockpit depois deixava a parada do app
--      órfã — foi o caso de duas paradas do Marco. Agora o vínculo é gravado sempre.
--   3. Item planejado antes de ter pino (o pino nasce depois, pelo negocio-vira-ponto ou
--      pela prospecção) nunca virava parada, porque plano_para_rota só roda quando a grade
--      muda. Agora o pino novo chama a ponte das semanas que já o planejavam. E o slot de
--      prospecção (n-<lead>) também acha o pino pelo negócio que o lead virou.
--
-- Nada aqui apaga parada nem visita, e nada fala com o HubSpot. A grade só ganha itens.

-- ── o resolvedor: n-<lead> também acha o pino pelo negócio do lead ─────────────────────
create or replace function public.plano_resolver_slot(p_slot_id text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_resto text := substr(coalesce(p_slot_id, ''), 3); v_cli uuid;
begin
  if p_slot_id like 'c-%' or p_slot_id like 'r-%' then
    select id into v_cli from public.clients where id_hubspot = v_resto and not is_archived limit 1;
  elsif p_slot_id like 'n-%' and v_resto ~* '^[0-9a-f-]{36}$' then
    select id into v_cli from public.clients where lead_prospeccao_id = v_resto::uuid limit 1;
    if v_cli is null then
      select c.id into v_cli
        from public.leads_prospeccao l
        join public.clients c on c.id_hubspot = l.hubspot_deal_id and not c.is_archived
       where l.id = v_resto::uuid and nullif(l.hubspot_deal_id, '') is not null
       limit 1;
    end if;
  end if;
  return v_cli;
end;
$$;

-- ── o miolo da ponte app -> Cockpit, numa função só (gatilho e acerto usam a mesma) ─────
create or replace function public.espelhar_parada_no_plano(p_stop uuid, p_fora boolean default false)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  st record;
  v_seller uuid; v_dia date; v_owner text;
  v_hs text; v_prosp uuid; v_status text;
  v_sid text; v_p text; v_ids text[];
  v_d int; v_seg date; v_grade jsonb; v_col jsonb; v_i int; v_livre int; v_el jsonb; v_el_id text;
  v_vazia jsonb; v_mudou boolean := false; v_achou text;
begin
  select * into st from public.field_route_stops where id = p_stop;
  if st.id is null then return null; end if;
  select r.seller_id, r.route_date into v_seller, v_dia from public.field_routes r where r.id = st.route_id;
  if v_seller is null or v_dia < v_hoje then return null; end if;
  v_d := extract(isodow from v_dia)::int - 1;
  if v_d > 4 then return null; end if;
  select nullif(p.id_hubspot, '') into v_owner from public.profiles p where p.id = v_seller;
  if v_owner is null then return null; end if;

  select nullif(c.id_hubspot, ''), c.lead_prospeccao_id, c.status into v_hs, v_prosp, v_status
    from public.clients c where c.id = st.client_id;
  if v_hs is not null then
    v_sid := case when v_status in ('cliente', 'ganho_fs') then 'r-' else 'c-' end || v_hs;
    v_p := case when v_status in ('cliente', 'ganho_fs') then 'relac' else 'funil' end;
    v_ids := array['c-' || v_hs, 'r-' || v_hs];
    if v_prosp is not null then v_ids := v_ids || ('n-' || v_prosp::text); end if;
  elsif v_prosp is not null then
    v_sid := 'n-' || v_prosp::text; v_p := 'nova'; v_ids := array[v_sid];
  else
    return null;
  end if;

  v_seg := v_dia - v_d;
  select grade into v_grade from public.planos_semanais where owner_id = v_owner and data_segunda = v_seg for update;
  v_col := case when jsonb_typeof(v_grade) = 'array' and jsonb_typeof(v_grade -> v_d) = 'array' then v_grade -> v_d end;

  if st.status = 'removed' then
    delete from public.plano_rota_sincronizado where owner_id = v_owner and dia = v_dia and slot_id = any (v_ids);
    if v_col is null then return null; end if;
    for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
      v_el := v_col -> v_i;
      v_el_id := case jsonb_typeof(v_el) when 'object' then v_el ->> 'id' when 'string' then v_el #>> '{}' end;
      if v_el_id = any (v_ids) then
        v_grade := jsonb_set(v_grade, array[v_d::text, v_i::text], 'null'::jsonb);
        v_mudou := true;
      end if;
    end loop;
    if v_mudou then
      update public.planos_semanais set grade = v_grade, atualizado_em = now() where owner_id = v_owner and data_segunda = v_seg;
    end if;
    return null;
  end if;

  -- JÁ NA GRADE: o vínculo é gravado assim mesmo (antes saía sem ele, e tirar o item no
  -- Cockpit deixava a parada do app órfã)
  if v_col is not null then
    for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
      v_el := v_col -> v_i;
      v_el_id := case jsonb_typeof(v_el) when 'object' then v_el ->> 'id' when 'string' then v_el #>> '{}' end;
      if v_el_id = any (v_ids) then v_achou := v_el_id; exit; end if;
    end loop;
  end if;
  if v_achou is not null then
    insert into public.plano_rota_sincronizado (owner_id, dia, slot_id, client_id, route_id)
    values (v_owner, v_dia, v_achou, st.client_id, st.route_id)
    on conflict (owner_id, dia, slot_id) do nothing;
    return v_achou;
  end if;

  v_vazia := (select jsonb_agg(null::jsonb) from generate_series(1, 15));
  if v_grade is null or jsonb_typeof(v_grade) <> 'array' or jsonb_array_length(v_grade) < 5 then
    v_grade := coalesce(case when jsonb_typeof(v_grade) = 'array' then v_grade end, '[]'::jsonb);
    while jsonb_array_length(v_grade) < 5 loop v_grade := v_grade || jsonb_build_array(v_vazia); end loop;
  end if;
  if jsonb_typeof(v_grade -> v_d) <> 'array' then
    v_grade := jsonb_set(v_grade, array[v_d::text], v_vazia);
  end if;
  v_col := v_grade -> v_d;

  v_livre := null;
  for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
    if jsonb_typeof(v_col -> v_i) = 'null' then v_livre := v_i; exit; end if;
  end loop;
  if v_livre is null then return null; end if;  -- dia cheio: o Cockpit continua com o que tem

  insert into public.plano_rota_sincronizado (owner_id, dia, slot_id, client_id, route_id)
  values (v_owner, v_dia, v_sid, st.client_id, st.route_id)
  on conflict (owner_id, dia, slot_id) do nothing;

  v_grade := jsonb_set(v_grade, array[v_d::text, v_livre::text],
    jsonb_build_object('id', v_sid, 'p', v_p, 'origem', 'app')
    || case when p_fora then jsonb_build_object('fora', true, 'feito', true) else '{}'::jsonb end);
  insert into public.planos_semanais (owner_id, data_segunda, grade)
  values (v_owner, v_seg, v_grade)
  on conflict (owner_id, data_segunda) do update set grade = excluded.grade, atualizado_em = now();
  return v_sid;
end;
$$;
revoke all on function public.espelhar_parada_no_plano(uuid, boolean) from public, anon, authenticated;

-- ── o gatilho vira uma casca fina sobre o miolo ─────────────────────────────────────────
create or replace function public.rota_para_plano()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 2 then return null; end if;
  -- a parada que o plano_para_rota acabou de criar: a faixa já está na grade
  if tg_op = 'INSERT' and coalesce(new.mandatory_reason, '') = 'plano_cockpit' then return null; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  -- planejada que virou feita: já está na grade, nada a espelhar
  if tg_op = 'UPDATE' and new.status = 'done' then return null; end if;
  perform public.espelhar_parada_no_plano(new.id, tg_op = 'INSERT' and new.status = 'done');
  return null;
exception when others then
  -- o espelho nunca derruba a parada que o executivo acabou de mexer
  raise warning 'rota_para_plano: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists rota_para_plano on public.field_route_stops;
create trigger rota_para_plano
  after insert or update of status on public.field_route_stops
  for each row when (new.status = any (array['planned', 'removed', 'done']))
  execute function public.rota_para_plano();

-- ── pino que nasce depois: as semanas que já o planejavam criam a parada ───────────────
create or replace function public.pino_novo_para_rota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seg date := (now() at time zone 'America/Sao_Paulo')::date
                - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1);
  v_ids text[] := array[]::text[];
  r record;
begin
  if pg_trigger_depth() > 2 then return null; end if;
  if nullif(new.id_hubspot, '') is not null then
    v_ids := v_ids || ('c-' || new.id_hubspot) || ('r-' || new.id_hubspot);
    v_ids := v_ids || coalesce((select array_agg('n-' || l.id::text) from public.leads_prospeccao l
                                where l.hubspot_deal_id = new.id_hubspot), array[]::text[]);
  end if;
  if new.lead_prospeccao_id is not null then v_ids := v_ids || ('n-' || new.lead_prospeccao_id::text); end if;
  if cardinality(v_ids) = 0 then return null; end if;
  for r in
    select ps.owner_id, ps.data_segunda from public.planos_semanais ps
     where ps.data_segunda >= v_seg
       and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) dia,
                                 jsonb_array_elements(case when jsonb_typeof(dia) = 'array' then dia else '[]'::jsonb end) el
                    where (case jsonb_typeof(el) when 'object' then el ->> 'id' when 'string' then el #>> '{}' end) = any (v_ids))
  loop
    perform public.plano_para_rota(r.owner_id, r.data_segunda);
  end loop;
  return null;
exception when others then
  raise warning 'pino_novo_para_rota: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists pino_novo_para_rota on public.clients;
create trigger pino_novo_para_rota
  after insert or update of id_hubspot, lead_prospeccao_id on public.clients
  for each row execute function public.pino_novo_para_rota();

-- ── acerto do que já divergiu: as rotas de hoje em diante ──────────────────────────────
do $$
declare s record; v_n int := 0;
begin
  for s in
    select st.id, st.status, st.mandatory_reason, st.created_at, st.updated_at
      from public.field_route_stops st
      join public.field_routes r on r.id = st.route_id
     where r.route_date >= (now() at time zone 'America/Sao_Paulo')::date
       and st.status in ('planned', 'done')
     order by st.created_at
  loop
    perform public.espelhar_parada_no_plano(
      s.id,
      s.status = 'done' and s.mandatory_reason is null and s.created_at = s.updated_at);
    v_n := v_n + 1;
  end loop;
  raise notice '0150: % paradas conferidas', v_n;
end $$;

-- e os itens planejados cujo pino já existe agora (o slot n- que achou o pino pelo negócio)
do $$
declare r record;
begin
  for r in select owner_id, data_segunda from public.planos_semanais
            where data_segunda >= (now() at time zone 'America/Sao_Paulo')::date
                                   - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1)
  loop
    perform public.plano_para_rota(r.owner_id, r.data_segunda);
  end loop;
end $$;
