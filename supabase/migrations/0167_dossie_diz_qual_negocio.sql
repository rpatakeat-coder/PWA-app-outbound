-- O DOSSIÊ DIZ QUAL NEGÓCIO É CADA PARADA (Julyan, 05/10/2026: "eu como gestor tenho que poder
-- clicar nesses leads e abrir o card"). As paradas do dossiê de campo vinham só com nome, hora e
-- pino: a tela não tinha como abrir a ficha. Agora cada parada leva o item da grade
-- ('c-<negócio>', 'r-<negócio>' do cliente, 'n-<conta-alvo>') e o client_id do app.
-- O resto da função é o mesmo.
create or replace function public.dossie_de_campo(p_dono text, p_segunda date, p_dia date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
        'item', i.item_id, 'clientId', i.client_id,
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
$function$;
