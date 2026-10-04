-- 0161 · Planejamento do gestor com demos REALIZADAS (Julyan, 04/10/2026).
--
-- O topo do Planejamento dizia "Demos marcadas" (demos_com_decisor: reunião agendada ou ficha
-- com decisor) ao lado da Semana, que conta demos realizadas — duas contas de "demo" em telas
-- vizinhas, e o app só usa a realizada. Acrescenta 'demosRealizadas' por pessoa: o livro da
-- temporada (pontos_eventos 'demo_realizada', o negócio entrou em Demo/Proposta) na janela da
-- temporada daquela semana (segunda 9h a segunda 9h, Brasília) — o MESMO número da Semana e do
-- Meu desempenho do app. 'demos' (marcadas) continua no retorno para quem ainda lê.
-- Só leitura. Idempotente.
create or replace function public.planejamento_do_time(p_segunda date, p_donos text[], p_dia date default null::date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date := coalesce(p_dia, least(greatest(v_hoje, p_segunda), p_segunda + 4));
  v_sexta date := p_segunda + 4;
  v_temp_de timestamptz := ((p_segunda::timestamp + interval '9 hours') at time zone 'America/Sao_Paulo');
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
        'demosRealizadas', (select count(*) from public.pontos_eventos ev
                             where ev.owner_id = pe.dono and ev.tipo = 'demo_realizada'
                               and ev.ref_em >= v_temp_de and ev.ref_em < v_temp_de + interval '7 days'),
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
$function$;
