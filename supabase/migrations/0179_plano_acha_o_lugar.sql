-- 0179 · O plano acha o lugar do restaurante (07/10/2026)
--
-- Medido em 07/10, semana 05–09/10: 217 itens do Planejamento batiam com a rota do app e 23
-- não tinham lugar nenhum no app — o gestor cobrava 15 do André e o app mostrava 9.
--   · 6 eram o MESMO restaurante já no mapa do mesmo executivo, com outro negócio do HubSpot
--     (negócio duplicado: Top Gourmet tem dois pinos e o plano apontava um terceiro negócio).
--     O plano procurava só pelo id do negócio.
--   · 17 não têm endereço no HubSpot: o negocio-vira-ponto não inventa pino (de propósito).
--
-- O que muda:
--   1. plano_resolver_slot / itens_do_plano: sem cliente pelo id, procuram o restaurante pelo
--      NOME normalizado, só no mapa do mesmo dono (vendedor ou quem criou), com coordenada.
--      Nome exato depois de normalizar: "Rafa Burger" não casa com "RAFA BURGER EXPRESS".
--   2. espelhar_parada_no_plano: tirar a parada no app também tira o item do plano quando os
--      dois se acharam pelo nome (antes só pelo id do negócio).
--   3. planejamento_do_time: cada dia diz quantos itens do plano estão sem lugar no mapa.
--   4. meu_plano_sem_lugar(dia): a lista do executivo, para a Agenda do app mostrar o que o
--      gestor conta e o app não tem como pôr na rota.

create or replace function public.plano_nome_chave(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '', 'g'), '')
$$;

create or replace function public.plano_cliente_por_nome(p_owner text, p_nome text)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select c.id from public.clients c
   where public.plano_nome_chave(p_nome) is not null
     and not coalesce(c.is_archived, false) and c.latitude is not null
     and (c.vendedor_id_hubspot = p_owner
          or c.created_by in (select p.id from public.profiles p where p.id_hubspot = p_owner))
     and public.plano_nome_chave(coalesce(nullif(btrim(c.empresa), ''), c.nome)) = public.plano_nome_chave(p_nome)
   order by c.updated_at desc nulls last, c.id
   limit 1
$$;
revoke all on function public.plano_cliente_por_nome(text, text) from public, anon;

drop function if exists public.plano_resolver_slot(text);
create or replace function public.plano_resolver_slot(p_slot_id text, p_owner text default null)
returns uuid language plpgsql stable security definer set search_path to 'public' as $function$
declare v_resto text := substr(coalesce(p_slot_id, ''), 3); v_cli uuid; v_nome text;
begin
  if p_slot_id like 'c-%' or p_slot_id like 'r-%' then
    select id into v_cli from public.clients where id_hubspot = v_resto and not is_archived limit 1;
    if v_cli is null and p_owner is not null then
      select en.props ->> 'dealname' into v_nome from public.espelho_negocios en where en.deal_id = v_resto;
      v_cli := public.plano_cliente_por_nome(p_owner, v_nome);
    end if;
  elsif p_slot_id like 'n-%' and v_resto ~* '^[0-9a-f-]{36}$' then
    select id into v_cli from public.clients where lead_prospeccao_id = v_resto::uuid limit 1;
    if v_cli is null then
      select c.id into v_cli
        from public.leads_prospeccao l
        join public.clients c on c.id_hubspot = l.hubspot_deal_id and not c.is_archived
       where l.id = v_resto::uuid and nullif(l.hubspot_deal_id, '') is not null
       limit 1;
    end if;
    if v_cli is null and p_owner is not null then
      select l.nome into v_nome from public.leads_prospeccao l where l.id = v_resto::uuid;
      v_cli := public.plano_cliente_por_nome(p_owner, v_nome);
    end if;
  end if;
  return v_cli;
end;
$function$;
revoke all on function public.plano_resolver_slot(text, text) from public, anon;

create or replace function public.itens_do_plano(p_segunda date, p_donos text[])
returns table(owner_id text, dia date, vaga integer, item_id text, proposito text, hora text, client_id uuid, nome text, lat numeric, lng numeric, acao text)
language sql stable security definer set search_path to 'public' as $function$
  select ps.owner_id, p_segunda + (d.i - 1)::int, s.j::int, it.id, it.p, it.hora, coalesce(cl.id, cn.id),
    coalesce(nullif(btrim(cl.empresa), ''), nullif(btrim(cl.nome), ''), lp.nome, en.props->>'dealname',
             nullif(btrim(cn.empresa), ''), nullif(btrim(cn.nome), ''), 'sem nome'),
    coalesce(cl.latitude, lp.lat, cn.latitude), coalesce(cl.longitude, lp.lng, cn.longitude), it.a
  from public.planos_semanais ps
  cross join lateral jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) with ordinality d(v, i)
  cross join lateral jsonb_array_elements(case when jsonb_typeof(d.v) = 'array' then d.v else '[]'::jsonb end) with ordinality s(x, j)
  cross join lateral (
    select case when jsonb_typeof(s.x) = 'string' then s.x #>> '{}' else s.x->>'id' end as id,
           case when jsonb_typeof(s.x) = 'object' then s.x->>'p' end as p,
           case when jsonb_typeof(s.x) = 'object' then s.x->>'hora' end as hora,
           case when jsonb_typeof(s.x) = 'object' then s.x->>'a' end as a
  ) it
  left join lateral (
    select c.id, c.nome, c.empresa, c.latitude, c.longitude from public.clients c
     where not coalesce(c.is_archived, false)
       and ((left(it.id, 2) in ('c-', 'r-') and c.id_hubspot = substr(it.id, 3)) or (left(it.id, 2) = 'n-' and substr(it.id, 3) ~ '^[0-9a-f-]{36}$' and c.lead_prospeccao_id::text = substr(it.id, 3)))
     order by c.updated_at desc nulls last, c.id limit 1
  ) cl on true
  left join public.leads_prospeccao lp on left(it.id, 2) = 'n-' and substr(it.id, 3) ~ '^[0-9a-f-]{36}$' and lp.id::text = substr(it.id, 3)
  left join public.espelho_negocios en on left(it.id, 2) in ('c-', 'r-') and en.deal_id = substr(it.id, 3)
  left join lateral (
    select c.id, c.nome, c.empresa, c.latitude, c.longitude from public.clients c
     where c.id = (select public.plano_cliente_por_nome(ps.owner_id, coalesce(en.props->>'dealname', lp.nome)))
  ) cn on cl.id is null
  where ps.data_segunda = p_segunda and ps.owner_id = any(p_donos) and d.i <= 5 and jsonb_typeof(s.x) in ('object', 'string') and coalesce(it.id, '') <> '' and left(it.id, 2) <> '__';
$function$;

-- plano_para_rota: a única mudança é passar o dono ao resolver
create or replace function public.plano_para_rota(p_owner text, p_segunda date)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  v_seller uuid;
  v_grade jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date;
  v_slots jsonb;
  r record;
  t record;
  v_sid text;
  v_cli uuid;
  v_route uuid;
  v_hora text;
  v_quando timestamptz;
  v_ids text[];
  v_clis uuid[];
  v_n integer := 0;
begin
  select p.id into v_seller from public.profiles p where p.id_hubspot = p_owner limit 1;
  if v_seller is null then return 0; end if;
  select grade into v_grade from public.planos_semanais where owner_id = p_owner and data_segunda = p_segunda;

  for d in 0..4 loop
    v_dia := p_segunda + d;
    continue when v_dia < v_hoje;
    v_slots := case when jsonb_typeof(v_grade) = 'array' and jsonb_typeof(v_grade -> d) = 'array' then v_grade -> d else '[]'::jsonb end;
    v_ids := array[]::text[];
    v_clis := array[]::uuid[];

    for r in select e.value as slot, e.ordinality as ord from jsonb_array_elements(v_slots) with ordinality e loop
      v_sid := nullif(case jsonb_typeof(r.slot) when 'object' then r.slot ->> 'id' when 'string' then r.slot #>> '{}' end, '');
      continue when v_sid is null or v_sid like '\_\_%';
      v_ids := v_ids || v_sid;
      v_cli := public.plano_resolver_slot(v_sid, p_owner);
      if v_cli is not null then v_clis := v_clis || v_cli; end if;
      continue when exists (select 1 from public.plano_rota_sincronizado s
                            where s.owner_id = p_owner and s.dia = v_dia and s.slot_id = v_sid);
      continue when v_cli is null;

      insert into public.field_routes (seller_id, route_date, title, status, source, created_by)
      values (v_seller, v_dia, 'Plano do Cockpit', 'planned', 'manual', v_seller)
      on conflict (seller_id, route_date) do nothing;
      select id into v_route from public.field_routes where seller_id = v_seller and route_date = v_dia;

      v_hora := case when jsonb_typeof(r.slot) = 'object' then r.slot ->> 'hora' end;
      v_quando := case when v_hora ~ '^\d{1,2}:\d{2}$'
                       then ((v_dia::text || ' ' || v_hora)::timestamp at time zone 'America/Sao_Paulo') end;

      insert into public.field_route_stops (route_id, client_id, position, planned_at, status, mandatory_reason)
      values (v_route, v_cli, r.ord, v_quando, 'planned', 'plano_cockpit')
      on conflict (route_id, client_id) do update
        set status = case when field_route_stops.status = 'removed' then 'planned' else field_route_stops.status end,
            planned_at = coalesce(excluded.planned_at, field_route_stops.planned_at),
            updated_at = now();

      insert into public.plano_rota_sincronizado (owner_id, dia, slot_id, client_id, route_id)
      values (p_owner, v_dia, v_sid, v_cli, v_route)
      on conflict (owner_id, dia, slot_id) do nothing;
      v_n := v_n + 1;
    end loop;

    for t in select * from public.plano_rota_sincronizado s
             where s.owner_id = p_owner and s.dia = v_dia and not (s.slot_id = any (v_ids)) loop
      if not (t.client_id = any (v_clis)) then
        update public.field_route_stops
        set status = 'removed', updated_at = now()
        where route_id = t.route_id and client_id = t.client_id and status = 'planned';
      end if;
      delete from public.plano_rota_sincronizado
      where owner_id = t.owner_id and dia = t.dia and slot_id = t.slot_id;
    end loop;
  end loop;
  return v_n;
end;
$function$;

-- espelhar_parada_no_plano: os ids do item incluem o que o espelho já ligou a este cliente
-- (o item achado pelo nome tem o id de OUTRO negócio). Só esta linha muda.
do $$
declare v_def text; v_novo text;
begin
  v_def := pg_get_functiondef('public.espelhar_parada_no_plano(uuid, boolean)'::regprocedure);
  if position('-- 0179 ids do espelho' in v_def) > 0 then return; end if;
  v_novo := replace(v_def,
    '  v_extra := jsonb_strip_nulls(jsonb_build_object(''a'', st.acao, ''hora'', nullif(st.horario_fixo, '''')));',
    '  v_extra := jsonb_strip_nulls(jsonb_build_object(''a'', st.acao, ''hora'', nullif(st.horario_fixo, '''')));' || chr(10) ||
    '  -- 0179 ids do espelho: o item que se achou pelo nome tem o id de outro negócio' || chr(10) ||
    '  v_ids := v_ids || coalesce(array(select s.slot_id from public.plano_rota_sincronizado s where s.owner_id = v_owner and s.dia = v_dia and s.client_id = st.client_id and not (s.slot_id = any (v_ids))), array[]::text[]);');
  if v_novo = v_def then raise exception '0179: âncora do espelhar_parada_no_plano não encontrada'; end if;
  execute v_novo;
end $$;

-- planejamento_do_time: semLugar por dia (itens do plano sem lugar no mapa)
do $$
declare v_def text; v_novo text;
begin
  v_def := pg_get_functiondef('public.planejamento_do_time(date, text[], date)'::regprocedure);
  if position('sem_lugar' in v_def) > 0 then return; end if;
  v_novo := replace(v_def,
    '(select count(*) from itens i where i.owner_id = pe.dono and i.dia = d.dia) as planejadas,',
    '(select count(*) from itens i where i.owner_id = pe.dono and i.dia = d.dia) as planejadas,' || chr(10) ||
    '      (select count(*) from itens i where i.owner_id = pe.dono and i.dia = d.dia and i.client_id is null) as sem_lugar,');
  v_novo := replace(v_novo,
    '''planejadas'', pd.planejadas,',
    '''planejadas'', pd.planejadas, ''semLugar'', pd.sem_lugar,');
  if v_novo = v_def or position('''semLugar''' in v_novo) = 0 then raise exception '0179: âncora do planejamento_do_time não encontrada'; end if;
  execute v_novo;
end $$;

-- a lista do próprio executivo: o que está no plano do dia e não tem lugar no mapa
create or replace function public.meu_plano_sem_lugar(p_dia date)
returns table(item_id text, nome text, etapa text)
language sql stable security definer set search_path to 'public' as $function$
  select i.item_id, i.nome, en.dealstage
    from public.itens_do_plano(
           p_dia - (extract(isodow from p_dia)::int - 1),
           array(select p.id_hubspot from public.profiles p where p.id = (select auth.uid()) and p.id_hubspot is not null)) i
    left join public.espelho_negocios en on left(i.item_id, 2) in ('c-', 'r-') and en.deal_id = substr(i.item_id, 3)
   where i.dia = p_dia and i.client_id is null
   order by i.vaga
$function$;
revoke all on function public.meu_plano_sem_lugar(date) from public, anon;
grant execute on function public.meu_plano_sem_lugar(date) to authenticated;

-- a semana corrente volta a espelhar com o resolvedor novo (só hoje em diante; o passado fica)
select public.plano_para_rota(ps.owner_id, ps.data_segunda)
  from public.planos_semanais ps
 where ps.data_segunda = ((now() at time zone 'America/Sao_Paulo')::date - (extract(isodow from (now() at time zone 'America/Sao_Paulo')::date)::int - 1));
