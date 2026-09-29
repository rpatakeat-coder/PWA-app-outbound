-- 0144 · Planejamento do time (handoff v6 FINAL, docs/08) — 28/09/2026
--
-- A aba Daily do gestor vira Planejamento: o que cada executivo planejou e fez, dia a
-- dia, com o mapa do time e o dossiê de campo. Tudo aqui sai das funções de 0143
-- (visitas_com_prova, meta_visitas, demos_com_decisor): o número do cartão é o mesmo
-- da pílula do mapa e do Meu dia.
--
-- 1. contatos_de_campo — ligação e WhatsApp registrados no app. Até aqui o app só
--    concluía a tarefa no HubSpot e o contato não ficava em lugar nenhum com data e
--    canal; a tela diz "medindo desde" a primeira linha desta tabela.
-- 2. planejamento_do_time(segunda, donos, dia) — cartões, prometido × cumprido e o mapa
--    do time do dia escolhido (check-ins, calor da semana e paradas do plano).
-- 3. dossie_de_campo(dono, segunda, dia) — o dia em ordem (paradas do plano, check-ins
--    fora do plano, contatos) e as fotos da semana.
--
-- As duas funções são só do gestor: quem não é recebe erro, não uma lista vazia (uma
-- lista vazia leria como "ninguém planejou nada").
--
-- Resolução do item do plano (planos_semanais.grade, 5 dias × 15 vagas):
--   c-<deal> / r-<deal> → clients.id_hubspot
--   n-<uuid>            → clients.lead_prospeccao_id, senão leads_prospeccao (nome, lat, lng)
--   nome de reserva     → espelho_negocios.props.dealname
-- Parada FEITA = check-in do executivo no mesmo cliente, no mesmo dia (Brasília).
-- PULADA = dia que já passou sem check-in. Hoje e depois = pendente.

-- ---------------------------------------------------------------- 1. contatos
create table if not exists public.contatos_de_campo (
  id uuid primary key default gen_random_uuid(),
  acao_id uuid unique,
  seller_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  owner_id text,
  client_id uuid references public.clients(id) on delete set null,
  deal_id text,
  canal text not null check (canal in ('ligacao', 'whatsapp')),
  resultado text,
  ocorrido_em timestamptz not null default now()
);
create index if not exists contatos_de_campo_seller_em on public.contatos_de_campo (seller_id, ocorrido_em);

alter table public.contatos_de_campo enable row level security;
drop policy if exists contatos_de_campo_insere_o_seu on public.contatos_de_campo;
create policy contatos_de_campo_insere_o_seu on public.contatos_de_campo
  for insert to authenticated with check (seller_id = (select auth.uid()));
drop policy if exists contatos_de_campo_le on public.contatos_de_campo;
create policy contatos_de_campo_le on public.contatos_de_campo
  for select to authenticated using (
    seller_id = (select auth.uid()) or (select public.is_field_admin()) or (select public.eh_gestor_cockpit()));
revoke all on public.contatos_de_campo from anon;

create or replace function public.tg_sinal_contato()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.sinal_ao_vivo('contato', new.client_id, new.deal_id, new.owner_id);
  return null;
end; $function$;

drop trigger if exists sinal_contato on public.contatos_de_campo;
create trigger sinal_contato after insert on public.contatos_de_campo
  for each row execute function public.tg_sinal_contato();

-- ---------------------------------------------------------------- itens do plano
-- Uma linha por item marcado no plano da semana, já resolvido para cliente e posição.
create or replace function public.itens_do_plano(p_segunda date, p_donos text[])
returns table (owner_id text, dia date, vaga int, item_id text, proposito text, hora text,
               client_id uuid, nome text, lat numeric, lng numeric)
language sql
stable
security definer
set search_path = public
as $$
  select ps.owner_id, p_segunda + (d.i - 1)::int, s.j::int, s.x->>'id', s.x->>'p', s.x->>'hora',
    cl.id,
    coalesce(cl.nome, lp.nome, en.props->>'dealname', 'sem nome'),
    coalesce(cl.latitude, lp.lat), coalesce(cl.longitude, lp.lng)
  from public.planos_semanais ps
  cross join lateral jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) with ordinality d(v, i)
  cross join lateral jsonb_array_elements(case when jsonb_typeof(d.v) = 'array' then d.v else '[]'::jsonb end) with ordinality s(x, j)
  left join lateral (
    select c.id, c.nome, c.latitude, c.longitude from public.clients c
     where (left(s.x->>'id', 2) in ('c-', 'r-') and c.id_hubspot = substr(s.x->>'id', 3))
        or (left(s.x->>'id', 2) = 'n-' and substr(s.x->>'id', 3) ~ '^[0-9a-f-]{36}$'
            and c.lead_prospeccao_id::text = substr(s.x->>'id', 3))
     limit 1
  ) cl on true
  left join public.leads_prospeccao lp
    on left(s.x->>'id', 2) = 'n-' and lp.id::text = substr(s.x->>'id', 3)
  left join public.espelho_negocios en
    on left(s.x->>'id', 2) in ('c-', 'r-') and en.deal_id = substr(s.x->>'id', 3)
  where ps.data_segunda = p_segunda
    and ps.owner_id = any(p_donos)
    and d.i <= 5
    and jsonb_typeof(s.x) = 'object'
    and coalesce(s.x->>'id', '') <> '';
$$;
revoke all on function public.itens_do_plano(date, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. o time
create or replace function public.planejamento_do_time(p_segunda date, p_donos text[], p_dia date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date := coalesce(p_dia, least(greatest(v_hoje, p_segunda), p_segunda + 4));
  v_sexta date := p_segunda + 4;
  r jsonb;
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    raise exception 'planejamento_do_time é só do gestor' using errcode = '42501';
  end if;

  with pessoas as (
    select distinct on (p.id_hubspot) p.id_hubspot as dono, p.id as seller, p.full_name
      from public.profiles p where p.id_hubspot = any(p_donos)
     order by p.id_hubspot, (p.full_name ilike '%DESATIVADO%'), p.id
  ), dias as (
    select (p_segunda + g)::date as dia, g as i from generate_series(0, 4) g
  ), vis as (
    select v.* from public.visitas_com_prova(p_segunda, v_sexta, null) v
     where v.owner_id = any(p_donos)
  ), itens as (
    select * from public.itens_do_plano(p_segunda, p_donos)
  ), itens_feitos as (
    select i.*, exists (select 1 from vis where vis.owner_id = i.owner_id and vis.dia = i.dia and vis.client_id = i.client_id) as feita
      from itens i
  ), cont as (
    select c.seller_id, (c.ocorrido_em at time zone 'America/Sao_Paulo')::date as dia, count(*) n
      from public.contatos_de_campo c
     where c.ocorrido_em >= (p_segunda::timestamp at time zone 'America/Sao_Paulo')
       and c.ocorrido_em < ((v_sexta + 1)::timestamp at time zone 'America/Sao_Paulo')
     group by 1, 2
  ), por_dia as (
    select pe.dono, d.i, d.dia,
      public.meta_visitas(pe.seller, d.dia) as meta,
      (select count(*) from itens i where i.owner_id = pe.dono and i.dia = d.dia) as planejadas,
      (select count(*) from itens_feitos i where i.owner_id = pe.dono and i.dia = d.dia and i.feita) as feitas_do_plano,
      (select count(*) from vis where vis.owner_id = pe.dono and vis.dia = d.dia) as feitas,
      (select count(*) from vis where vis.owner_id = pe.dono and vis.dia = d.dia and vis.provada) as provadas,
      (select count(*) from vis where vis.owner_id = pe.dono and vis.dia = d.dia
          and not exists (select 1 from itens i where i.owner_id = pe.dono and i.dia = d.dia and i.client_id = vis.client_id)) as fora,
      coalesce((select n from cont where cont.seller_id = pe.seller and cont.dia = d.dia), 0) as contatos
    from pessoas pe cross join dias d
  )
  select jsonb_build_object(
    'segunda', p_segunda, 'hoje', v_hoje, 'dia', v_dia,
    'contatosDesde', (select min(ocorrido_em) from public.contatos_de_campo),
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object(
        'ownerId', pe.dono, 'seller', pe.seller,
        'dias', (select jsonb_agg(jsonb_build_object(
            'dia', pd.dia, 'meta', pd.meta, 'planejadas', pd.planejadas, 'feitasDoPlano', pd.feitas_do_plano,
            'feitas', pd.feitas, 'provadas', pd.provadas, 'fora', pd.fora, 'contatos', pd.contatos) order by pd.i)
            from por_dia pd where pd.dono = pe.dono),
        'plano', (select jsonb_build_object('fechadoEm', ps.fechado_em, 'promessa', ps.promessa,
                    'promessaDadaEm', ps.promessa_dada_em, 'promessaTravadaEm', ps.promessa_travada_em)
                    from public.planos_semanais ps where ps.owner_id = pe.dono and ps.data_segunda = p_segunda limit 1),
        'demos', public.demos_com_decisor(pe.seller, p_segunda, least(v_sexta, v_hoje)),
        'proxima', (select jsonb_build_object('nome', i.nome, 'hora', i.hora)
                      from itens_feitos i where i.owner_id = pe.dono and i.dia = v_hoje and not i.feita
                     order by i.hora nulls last, i.vaga limit 1),
        'ultimo', (select jsonb_build_object('em', cv.visited_at, 'lat', cv.visited_at_lat, 'lng', cv.visited_at_lon)
                     from public.client_visits cv where cv.visited_by = pe.seller and cv.visited_at_lat is not null
                    order by cv.visited_at desc limit 1),
        'fila', (select jsonb_build_object('pendentes', f.pendentes, 'falhas', f.falhas, 'desde', f.ultima_tentativa)
                   from public.fila_pwa f where f.seller_id = pe.seller and f.dia = v_hoje and (f.pendentes > 0 or f.falhas > 0) limit 1)
      )) from pessoas pe), '[]'::jsonb),
    'mapa', jsonb_build_object(
      'checkins', coalesce((select jsonb_agg(jsonb_build_object('ownerId', v.owner_id, 'em', v.visited_at,
          'lat', cv.visited_at_lat, 'lng', cv.visited_at_lon, 'provada', v.provada, 'foto', v.foto_id is not null,
          'motivo', v.motivo, 'nome', cl.nome) order by v.visited_at)
        from vis v join public.client_visits cv on cv.id = v.visit_id left join public.clients cl on cl.id = v.client_id
        where v.dia = v_dia and cv.visited_at_lat is not null), '[]'::jsonb),
      'calor', coalesce((select jsonb_agg(jsonb_build_array(round(cv.visited_at_lat, 4), round(cv.visited_at_lon, 4)))
        from vis v join public.client_visits cv on cv.id = v.visit_id where cv.visited_at_lat is not null), '[]'::jsonb),
      'plano', coalesce((select jsonb_agg(jsonb_build_object('ownerId', i.owner_id, 'lat', i.lat, 'lng', i.lng,
          'nome', i.nome, 'hora', i.hora, 'feita', i.feita, 'vaga', i.vaga))
        from itens_feitos i where i.dia = v_dia and i.lat is not null), '[]'::jsonb)
    )
  ) into r;
  return r;
end;
$$;
revoke all on function public.planejamento_do_time(date, text[], date) from public, anon;
grant execute on function public.planejamento_do_time(date, text[], date) to authenticated;

-- ---------------------------------------------------------------- 3. o dossiê
create or replace function public.dossie_de_campo(p_dono text, p_segunda date, p_dia date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seller uuid;
  r jsonb;
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    raise exception 'dossie_de_campo é só do gestor' using errcode = '42501';
  end if;
  select p.id into v_seller from public.profiles p where p.id_hubspot = p_dono
   order by (p.full_name ilike '%DESATIVADO%'), p.id limit 1;

  with vis as (
    select v.*, cv.visited_at_lat as lat, cv.visited_at_lon as lng, cl.nome
      from public.visitas_com_prova(p_segunda, p_segunda + 4, v_seller) v
      join public.client_visits cv on cv.id = v.visit_id
      left join public.clients cl on cl.id = v.client_id
     where v_seller is not null
  ), itens as (
    select * from public.itens_do_plano(p_segunda, array[p_dono]) where dia = p_dia
  )
  select jsonb_build_object(
    'ownerId', p_dono, 'dia', p_dia, 'hoje', v_hoje, 'temLogin', v_seller is not null,
    'paradas', coalesce((select jsonb_agg(jsonb_build_object(
        'vaga', i.vaga, 'nome', i.nome, 'hora', i.hora, 'proposito', i.proposito, 'lat', i.lat, 'lng', i.lng,
        'estado', case when vv.visit_id is not null then 'feita' when p_dia < v_hoje then 'pulada' else 'pendente' end,
        'visita', case when vv.visit_id is null then null else jsonb_build_object(
          'em', vv.visited_at, 'provada', vv.provada, 'motivo', vv.motivo, 'distancia', vv.distancia_m,
          'foto', vv.foto_caminho, 'lat', vv.lat, 'lng', vv.lng) end
      ) order by i.hora nulls last, i.vaga)
      from itens i
      left join lateral (select * from vis where vis.dia = p_dia and vis.client_id = i.client_id order by vis.visited_at limit 1) vv on true
    ), '[]'::jsonb),
    'fora', coalesce((select jsonb_agg(jsonb_build_object('nome', v.nome, 'em', v.visited_at, 'lat', v.lat, 'lng', v.lng,
        'provada', v.provada, 'motivo', v.motivo, 'distancia', v.distancia_m, 'foto', v.foto_caminho) order by v.visited_at)
      from vis v where v.dia = p_dia and not exists (select 1 from itens i where i.client_id = v.client_id)), '[]'::jsonb),
    'contatos', coalesce((select jsonb_agg(jsonb_build_object('em', c.ocorrido_em, 'canal', c.canal, 'resultado', c.resultado,
        'nome', cl.nome, 'lat', cl.latitude, 'lng', cl.longitude) order by c.ocorrido_em)
      from public.contatos_de_campo c
      left join lateral (select x.nome, x.latitude, x.longitude from public.clients x
                          where x.id = c.client_id or (c.client_id is null and x.id_hubspot = c.deal_id) limit 1) cl on true
      where c.seller_id = v_seller and (c.ocorrido_em at time zone 'America/Sao_Paulo')::date = p_dia), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('caminho', f.caminho, 'em', f.criado_em, 'nome', cl.nome) order by f.criado_em desc)
      from public.fotos_visita f left join public.clients cl on cl.id = f.client_id
      where f.criado_por = v_seller
        and f.criado_em >= (p_segunda::timestamp at time zone 'America/Sao_Paulo')
        and f.criado_em < ((p_segunda + 5)::timestamp at time zone 'America/Sao_Paulo')), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;
revoke all on function public.dossie_de_campo(text, date, date) from public, anon;
grant execute on function public.dossie_de_campo(text, date, date) to authenticated;
