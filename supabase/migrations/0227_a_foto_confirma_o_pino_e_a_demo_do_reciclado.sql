-- 0227 · A foto confirma o pino em vez de dispensar, e a demo do reciclado volta a contar
--
-- Auditoria de 29/10/26 (supabase/AUDITORIA-prova-de-visita-e-demo-29-10-26.md).
--
-- 1. _visitas_com_prova: a foto vinha PRIMEIRO no or e dispensava o GPS. A
--    coordenada da propria foto existia em fotos_visita.lat/lng e nunca era
--    lida. Em outubro, 23 das 113 visitas provadas por foto tinham a foto FORA
--    do raio, a pior a 33 km. Agora, foto COM coordenada tem de estar dentro do
--    mesmo limite. Foto SEM coordenada segue valendo como antes, senao as 23
--    sem coordenada virariam injustica retroativa.
--
--    VALE DE 01/11/26 EM DIANTE, e a trava de data nao e' enfeite:
--    sincronizar_pontos olha 40 dias para tras e ESTORNA visita que deixou de
--    valer. Sem o corte, mexer nesta funcao tiraria pontos de tres semanas de
--    bonus ja gravadas em bonus_semanal (05/10, 12/10, 19/10) — dinheiro ja
--    pago. Outubro fica exatamente como esta.
--
-- 2. O rotulo para de mentir. Das 47 declaradas de outubro, 23 carregavam GPS
--    preciso (media de 9 m no mes) e o motivo gravado era "declarada sem GPS,
--    sem foto". `declarada` quer dizer "a pessoa escolheu declarar", nao "o
--    aparelho nao localizou". Havendo coordenada, o motivo passa a dizer a
--    distancia.
--
-- 3. sincronizar_pontos: a demo so contava UMA vez por negocio para sempre,
--    porque origem_id era o id do negocio cru e o `on conflict (tipo,
--    origem_id)` derrubava a segunda. Era o caso do Paladare: pontuou em 08/10,
--    voltou para Reciclagem em 21/10, o Andre refez a demo em 27/10 e moveu de
--    volta em 29/10 sem ganhar nada. Agora, demo depois de uma passagem por
--    Reciclagem ou Perdido e' um ciclo novo e tem chave propria (deal:c1).
--
--    NAO se chaveia por (negocio, `em`): `em` e' a hora do SNAPSHOT, nao a data
--    da etapa (medido: 11:37 de 29/10 para um negocio movido em 08/10). Chavear
--    por ele pagaria a mesma demo de novo a cada rodada do robo. O ciclo vem do
--    historico real em client_stage_changes.
--
--    Medido antes de aplicar: so 2 negocios se qualificam (Paladare e Maika'i
--    Poke), e os dois caem na semana aberta de 26/10. Nenhuma semana de bonus
--    ja fechada se mexe.
--
--    Limite conhecido: client_stage_changes so registra o que passa pelo app e
--    pelo Cockpit. Negocio reciclado direto no HubSpot nao aparece, e nesse
--    caso o ciclo fica 0 e o comportamento e' o de hoje. Erra para menos, nunca
--    para mais.

-- A coluna foto_distancia_m muda o tipo de retorno, e `create or replace` nao
-- troca tipo de retorno (42P13). Logo: drop e recria. Drop apaga as permissoes
-- e funcao nova nasce com execute para PUBLIC, entao elas sao devolvidas no fim
-- deste arquivo, iguais as de 29/10/26 (0216_banco_enxuto_e_seguro):
--   _visitas_com_prova  -> so service_role (interna, nao vai ao cliente)
--   visitas_com_prova   -> authenticated + service_role
drop function if exists public.visitas_com_prova(date, date, uuid);
drop function if exists public._visitas_com_prova(date, date, uuid);

create or replace function public._visitas_com_prova(p_de date, p_ate date, p_pessoa uuid DEFAULT NULL::uuid)
 returns table(visit_id uuid, client_id uuid, visited_by uuid, owner_id text, visited_at timestamp with time zone, dia date, declarada boolean, distancia_m numeric, limite_m integer, pino_movido_m numeric, serie boolean, foto_id uuid, foto_caminho text, provada boolean, motivo text, foto_distancia_m numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with v as (
    select cv.*,
      (cv.visited_at at time zone 'America/Sao_Paulo')::date as dia_brt,
      lag(cv.client_id)      over w as ant_client,
      lag(cv.visited_at)     over w as ant_em,
      lag(cv.visited_at_lat) over w as ant_lat,
      lag(cv.visited_at_lon) over w as ant_lon
    from public.client_visits cv
    where cv.visited_at >= (p_de::timestamp at time zone 'America/Sao_Paulo') - interval '10 minutes'
      and cv.visited_at <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (p_pessoa is null or cv.visited_by = p_pessoa)
    window w as (partition by cv.visited_by order by cv.visited_at)
  ), c as (
    select v.*,
      case when cl.geo_approximate is true then 500 else 200 end as limite,
      (v.ant_client is not null and v.ant_client <> v.client_id
        and v.visited_at - v.ant_em < interval '3 minutes'
        and v.visited_at_lat is not null and v.ant_lat is not null
        and 2 * 6371000 * asin(sqrt(
              power(sin(radians((v.visited_at_lat - v.ant_lat) / 2)), 2) +
              cos(radians(v.ant_lat)) * cos(radians(v.visited_at_lat)) *
              power(sin(radians((v.visited_at_lon - v.ant_lon) / 2)), 2))) < 50) as em_serie,
      f.id as f_id, f.caminho as f_caminho,
      -- A COORDENADA DA FOTO, que existia e nunca era lida (auditoria 29/10/26).
      case when f.lat is not null and f.lng is not null and cl.latitude is not null and cl.longitude is not null
           then 2 * 6371000 * asin(sqrt(
                  power(sin(radians((f.lat - cl.latitude) / 2)), 2) +
                  cos(radians(cl.latitude)) * cos(radians(f.lat)) *
                  power(sin(radians((f.lng - cl.longitude) / 2)), 2)))
      end as foto_dist,
      p.id_hubspot as dono,
      vv.visit_id as vv_id
    from v
    left join public.visitas_validadas vv on vv.visit_id = v.id
    left join public.clients cl on cl.id = v.client_id
    left join public.profiles p on p.id = v.visited_by
    left join lateral (
      select fv.id, fv.caminho, fv.lat, fv.lng from public.fotos_visita fv
       where fv.client_id = v.client_id and fv.criado_por = v.visited_by
         and fv.criado_em >= v.visited_at - interval '30 minutes'
         and fv.criado_em <= v.visited_at + interval '2 hours'
       order by abs(extract(epoch from fv.criado_em - v.visited_at)) limit 1
    ) f on true
    where v.dia_brt between p_de and p_ate
  ), j as (
    select c.*,
      -- A foto CONFIRMA em vez de dispensar, de 01/11/26 em diante.
      (c.f_id is not null and (
         c.dia_brt < date '2026-11-01'
         or c.foto_dist is null
         or c.foto_dist <= c.limite)) as foto_vale,
      (not coalesce(c.declarada, false) and c.pino_corrigido_de_m is null and c.distance_m is not null
         and c.distance_m <= c.limite and not c.em_serie) as gps_vale
    from c
  )
  select j.id, j.client_id, j.visited_by, j.dono, j.visited_at, j.dia_brt,
    coalesce(j.declarada, false), j.distance_m, j.limite, j.pino_corrigido_de_m, j.em_serie,
    j.f_id, j.f_caminho,
    (j.foto_vale or j.vv_id is not null or j.gps_vale) as provada,
    case
      when j.foto_vale and j.foto_dist is not null then 'foto a ' || round(j.foto_dist) || ' m do pino'
      when j.foto_vale then 'foto sem coordenada'
      when j.gps_vale then 'gps'
      when j.vv_id is not null then 'validada pelo gestor'
      when j.f_id is not null and j.foto_dist is not null
        then 'foto a ' || round(j.foto_dist) || ' m do pino (limite ' || j.limite || ' m)'
      when j.em_serie then 'em serie (outro lead no mesmo ponto, < 3 min)'
      when j.pino_corrigido_de_m is not null then 'pino movido na hora (' || round(j.pino_corrigido_de_m) || ' m), sem foto'
      -- O ROTULO PARA DE MENTIR: declarada nao quer dizer "sem GPS".
      when coalesce(j.declarada, false) and j.distance_m is not null
        then 'declarada a ' || round(j.distance_m) || ' m do pino'
             || case when j.accuracy_m is not null then ' (GPS de ' || round(j.accuracy_m) || ' m)' else '' end
      when coalesce(j.declarada, false) then 'declarada sem GPS, sem foto'
      when j.distance_m is not null and j.distance_m > j.limite then 'a ' || round(j.distance_m) || ' m do pino (limite ' || j.limite || ' m), sem foto'
      else 'sem prova'
    end as motivo,
    j.foto_dist
  from j
  order by j.visited_at;
$function$;

-- Acompanha a coluna nova (faz `select *` da de cima).
create or replace function public.visitas_com_prova(p_de date, p_ate date, p_pessoa uuid DEFAULT NULL::uuid)
 returns table(visit_id uuid, client_id uuid, visited_by uuid, owner_id text, visited_at timestamp with time zone, dia date, declarada boolean, distancia_m numeric, limite_m integer, pino_movido_m numeric, serie boolean, foto_id uuid, foto_caminho text, provada boolean, motivo text, foto_distancia_m numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select * from public._visitas_com_prova(p_de, p_ate,
    case when (select public.is_field_admin()) or (select public.eh_gestor_cockpit()) then p_pessoa else (select auth.uid()) end);
$function$;

-- A demo do negocio reciclado volta a contar.
create or replace function public.sincronizar_pontos()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_novas int := 0; v_demos int := 0; v_contratos int := 0; v_estornos int := 0; n int;
  v_de date := ((now() at time zone 'America/Sao_Paulo')::date - 40);
  v_ate date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  with v as (
    select x.visit_id, x.visited_by, x.visited_at, x.provada, p.id_hubspot
      from public._visitas_com_prova(v_de, v_ate, null) x
      join public.profiles p on p.id = x.visited_by
      join public.equipe_cockpit e on e.profile_id = x.visited_by and e.ativo
     where p.id_hubspot is not null
  ), ins as (
    insert into public.pontos_eventos (owner_id, pessoa, tipo, pts, origem_id, ref_em, negocio_id)
    select v.id_hubspot, v.visited_by, 'visita_provada', 20, v.visit_id::text, v.visited_at, null
      from v where v.provada
    on conflict (tipo, origem_id) do nothing
    returning 1
  ) select count(*) into v_novas from ins;

  with pontuadas as (
    select pe.* from public.pontos_eventos pe
     where pe.tipo = 'visita_provada' and pe.ref_em >= (v_de::timestamp at time zone 'America/Sao_Paulo')
       and not exists (select 1 from public.pontos_eventos e2 where e2.tipo = 'estorno' and e2.origem_id = 'visita_provada:' || pe.origem_id)
  ), vale as (
    select x.visit_id::text as id from public._visitas_com_prova(v_de, v_ate, null) x where x.provada
  ), ins as (
    insert into public.pontos_eventos (owner_id, pessoa, tipo, pts, origem_id, ref_em, negocio_id)
    select pp.owner_id, pp.pessoa, 'estorno', -pp.pts, 'visita_provada:' || pp.origem_id, pp.ref_em, pp.negocio_id
      from pontuadas pp where pp.origem_id not in (select id from vale)
    on conflict (tipo, origem_id) do nothing
    returning 1
  ) select count(*) into v_estornos from ins;

  with snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  demos_brutas as (
    select r.key as owner, d->>'id' as deal, (d->>'em')::timestamptz as em, d->>'nome' as nome
      from snap, jsonb_each(snap.conteudo->'reps') r,
           jsonb_array_elements(case jsonb_typeof(r.value->'demosRealizadasLista') when 'array' then r.value->'demosRealizadasLista' else '[]'::jsonb end) d
     where d->>'id' is not null and d->>'em' is not null
  ),
  -- O CICLO: quantas passagens por Reciclagem/Perdido houve ANTES da ultima
  -- entrada em Demo/Proposta. Ciclo 0 mantem a chave antiga, intocada — nenhum
  -- ponto ja gravado muda de lugar.
  entrada as (
    select db.deal,
      (select max(s.created_at) from public.clients c join public.client_stage_changes s on s.client_id = c.id
        where c.id_hubspot = db.deal and s.to_stage_id in ('1395880471', '209405288')) as entrou_demo
    from (select distinct deal from demos_brutas) db
  ),
  voltas as (
    select e.deal, e.entrou_demo,
      case when e.entrou_demo is null then 0 else
        (select count(*) from public.clients c join public.client_stage_changes s on s.client_id = c.id
          where c.id_hubspot = e.deal and s.to_stage_id in ('1398311191', '1396006164', '209405293')
            and s.created_at < e.entrou_demo) end::int as n
    from entrada e
  ),
  demos as (
    select db.owner, db.deal, db.nome,
      case when vo.n > 0 then db.deal || ':c' || vo.n else db.deal end as chave,
      case when vo.n > 0 then coalesce(vo.entrou_demo, db.em) else db.em end as em
      from demos_brutas db join voltas vo on vo.deal = db.deal
  ), ins as (
    insert into public.pontos_eventos (owner_id, pessoa, tipo, pts, origem_id, ref_em, negocio_id, negocio_nome)
    select dm.owner, (select p.id from public.profiles p where p.id_hubspot = dm.owner limit 1), 'demo_realizada', 50, dm.chave, dm.em, dm.deal, dm.nome
      from demos dm
    on conflict (tipo, origem_id) do nothing
    returning 1
  ) select count(*) into v_demos from ins;

  with snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  vendas as (
    select x->>'ownerId' as owner, x->>'id' as deal, (x->>'closedate')::timestamptz as em, nullif(x->>'mrr', '')::numeric as mrr, x->>'nome' as nome
      from snap, jsonb_array_elements(case when jsonb_typeof(snap.conteudo->'vendasLivro') = 'array' then snap.conteudo->'vendasLivro'
                                           when jsonb_typeof(snap.conteudo->'vendasMes') = 'array' then snap.conteudo->'vendasMes' else '[]'::jsonb end) x
     where x->>'id' is not null and x->>'ownerId' is not null and x->>'closedate' is not null
  ), ins as (
    insert into public.pontos_eventos (owner_id, pessoa, tipo, pts, valor, origem_id, ref_em, negocio_id, negocio_nome)
    select vd.owner, (select p.id from public.profiles p where p.id_hubspot = vd.owner limit 1), 'contrato', 200, vd.mrr, vd.deal, vd.em, vd.deal, vd.nome
      from vendas vd
    on conflict (tipo, origem_id) do nothing
    returning 1
  ) select count(*) into v_contratos from ins;

  with snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  nomes as (
    select x->>'id' as deal, max(x->>'nome') as nome
      from snap, jsonb_array_elements(coalesce(case when jsonb_typeof(snap.conteudo->'vendasLivro') = 'array' then snap.conteudo->'vendasLivro' end, '[]'::jsonb)
                                      || coalesce(case when jsonb_typeof(snap.conteudo->'vendasMes') = 'array' then snap.conteudo->'vendasMes' end, '[]'::jsonb)) x
     group by 1
    union all
    select d->>'id', max(d->>'nome')
      from snap, jsonb_each(snap.conteudo->'reps') r,
           jsonb_array_elements(case jsonb_typeof(r.value->'demosRealizadasLista') when 'array' then r.value->'demosRealizadasLista' else '[]'::jsonb end) d
     group by 1
  )
  update public.pontos_eventos pe set negocio_nome = n.nome
    from nomes n
   where pe.negocio_nome is null and pe.negocio_id = n.deal and n.nome is not null;

  insert into public.temporadas (semana, inicio, fim)
  select (public._temporada_inicio(now()) at time zone 'America/Sao_Paulo')::date, public._temporada_inicio(now()), public._temporada_inicio(now()) + interval '7 days'
  on conflict (semana) do nothing;

  return jsonb_build_object('visitas', v_novas, 'demos', v_demos, 'contratos', v_contratos, 'estornos', v_estornos);
end $function$;

-- As permissoes de volta, iguais as de antes do drop.
--
-- CUIDADO, custou um vazamento aqui em 29/10/26: `revoke from public` NAO basta.
-- O Supabase tem default privileges no schema public que dao execute para anon,
-- authenticated e service_role em TODA funcao nova. Depois do drop+create as
-- duas nasceram com `anon` — e _visitas_com_prova aceita p_pessoa sem o filtro
-- de gestor, enquanto visitas_com_prova, chamada por anon, teria auth.uid()
-- nulo e portanto p_pessoa nulo, que na funcao de baixo quer dizer "todo mundo".
-- Por isso o revoke nomeia anon e authenticated, nao so' public.
revoke all on function public._visitas_com_prova(date, date, uuid) from anon, authenticated, public;
revoke all on function public.visitas_com_prova(date, date, uuid) from anon, public;
grant execute on function public._visitas_com_prova(date, date, uuid) to service_role;
grant execute on function public.visitas_com_prova(date, date, uuid) to authenticated, service_role;
