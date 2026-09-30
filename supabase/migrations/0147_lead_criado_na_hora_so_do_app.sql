-- 0147 · "Lead criado na hora" só conta lead criado NO APP (30/09/2026)
--
-- Julyan: "tem que ser o lead criado no app, não no Cockpit, assim vamos medir com
-- exatidão". Lead criado no Cockpit ou importado tem o pino do ENDEREÇO (origem api/import,
-- geo_source google/hubspot/leads_prospeccao): o check-in perto dele é prova de verdade.
-- O caso que se mede é só o do app com o pino do GPS do celular: origem = manual e
-- geo_source = coords, criado pela mesma pessoa até 2 h antes do check-in (até 5 min
-- depois, para o cadastro que termina logo após o Cheguei). Medido em 45 dias: o número
-- não muda hoje (todos os casos já eram do app); a regra fica travada para o futuro.

create or replace function public.lead_criado_na_hora(p_client uuid, p_pessoa uuid, p_em timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients c
     where c.id = p_client
       and c.created_by = p_pessoa
       and c.origem = 'manual'
       and c.geo_source = 'coords'
       and c.created_at > p_em - interval '2 hours'
       and c.created_at <= p_em + interval '5 minutes');
$$;
revoke all on function public.lead_criado_na_hora(uuid, uuid, timestamptz) from public, anon, authenticated;

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
    select v.*, public.lead_criado_na_hora(v.client_id, v.visited_by, v.visited_at) as criado_na_hora
      from public.visitas_com_prova(p_segunda, v_sexta, null) v
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
      (select count(*) from vis where vis.owner_id = pe.dono and vis.dia = d.dia and vis.provada and vis.criado_na_hora) as provadas_lead_novo,
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
            'feitas', pd.feitas, 'provadas', pd.provadas, 'provadasLeadNovo', pd.provadas_lead_novo, 'fora', pd.fora, 'contatos', pd.contatos) order by pd.i)
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
    select v.*, cv.visited_at_lat as lat, cv.visited_at_lon as lng, cl.nome,
      public.lead_criado_na_hora(v.client_id, v.visited_by, v.visited_at) as criado_na_hora
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
          'foto', vv.foto_caminho, 'lat', vv.lat, 'lng', vv.lng, 'leadNovo', vv.criado_na_hora) end
      ) order by i.hora nulls last, i.vaga)
      from itens i
      left join lateral (select * from vis where vis.dia = p_dia and vis.client_id = i.client_id order by vis.visited_at limit 1) vv on true
    ), '[]'::jsonb),
    'fora', coalesce((select jsonb_agg(jsonb_build_object('nome', v.nome, 'em', v.visited_at, 'lat', v.lat, 'lng', v.lng,
        'provada', v.provada, 'motivo', v.motivo, 'distancia', v.distancia_m, 'foto', v.foto_caminho, 'leadNovo', v.criado_na_hora) order by v.visited_at)
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
