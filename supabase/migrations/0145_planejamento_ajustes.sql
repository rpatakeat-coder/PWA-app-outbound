-- 0145 · Planejamento do time: ajustes da revisão de 29/09/2026
--
-- 1. itens_do_plano: as vagas de bloqueio (__b), rua (__rua) e relacionamento (__rel) do
--    Planejamento entravam como parada "sem nome", impossível de fazer: somavam em
--    planejadas, escondiam o "sem plano hoje" e viravam parada pulada. Saem. Slot guardado
--    como texto (formato antigo, que pl6SlotId aceita) passa a contar. O cliente do item é
--    o ativo (not is_archived), como em plano_resolver_slot.
-- 2. contatos: WhatsApp aberto duas vezes para o mesmo cliente no mesmo dia conta um.

create or replace function public.itens_do_plano(p_segunda date, p_donos text[])
returns table (owner_id text, dia date, vaga int, item_id text, proposito text, hora text,
               client_id uuid, nome text, lat numeric, lng numeric)
language sql
stable
security definer
set search_path = public
as $$
  select ps.owner_id, p_segunda + (d.i - 1)::int, s.j::int, it.id, it.p, it.hora,
    cl.id,
    coalesce(cl.nome, lp.nome, en.props->>'dealname', 'sem nome'),
    coalesce(cl.latitude, lp.lat), coalesce(cl.longitude, lp.lng)
  from public.planos_semanais ps
  cross join lateral jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) with ordinality d(v, i)
  cross join lateral jsonb_array_elements(case when jsonb_typeof(d.v) = 'array' then d.v else '[]'::jsonb end) with ordinality s(x, j)
  -- a vaga pode ser {id, p, hora} ou só o id em texto (formato antigo que pl6SlotId aceita)
  cross join lateral (
    select case when jsonb_typeof(s.x) = 'string' then s.x #>> '{}' else s.x->>'id' end as id,
           case when jsonb_typeof(s.x) = 'object' then s.x->>'p' end as p,
           case when jsonb_typeof(s.x) = 'object' then s.x->>'hora' end as hora
  ) it
  left join lateral (
    select c.id, c.nome, c.latitude, c.longitude from public.clients c
     where not coalesce(c.is_archived, false)
       and ((left(it.id, 2) in ('c-', 'r-') and c.id_hubspot = substr(it.id, 3))
         or (left(it.id, 2) = 'n-' and substr(it.id, 3) ~ '^[0-9a-f-]{36}$'
             and c.lead_prospeccao_id::text = substr(it.id, 3)))
     order by c.updated_at desc nulls last, c.id
     limit 1
  ) cl on true
  left join public.leads_prospeccao lp
    on left(it.id, 2) = 'n-' and lp.id::text = substr(it.id, 3)
  left join public.espelho_negocios en
    on left(it.id, 2) in ('c-', 'r-') and en.deal_id = substr(it.id, 3)
  where ps.data_segunda = p_segunda
    and ps.owner_id = any(p_donos)
    and d.i <= 5
    and jsonb_typeof(s.x) in ('object', 'string')
    and coalesce(it.id, '') <> ''
    -- bloqueio (__b), rua (__rua) e relacionamento (__rel) são vagas do Planejamento, não paradas
    and left(it.id, 2) <> '__';
$$;
revoke all on function public.itens_do_plano(date, text[]) from public, anon, authenticated;

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
    select c.seller_id, (c.ocorrido_em at time zone 'America/Sao_Paulo')::date as dia,
      count(distinct case when c.canal = 'whatsapp' then 'w:' || coalesce(c.client_id::text, c.deal_id, c.id::text) else c.id::text end) n
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
        'planoIds', coalesce((select jsonb_agg(distinct i.item_id) from itens i where i.owner_id = pe.dono), '[]'::jsonb),
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
