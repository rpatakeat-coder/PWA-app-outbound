-- 0151 · Ranking do time (gamificação) — 03/10/2026
--
-- Julyan: "vamos gamificar esse cockpit, com quem teve mais visitas, mais leads quentes,
-- mais contratos". E, perguntado se o executivo pode ver os totais dos colegas: "sim".
--
-- O QUE O EXECUTIVO PASSA A VER DOS COLEGAS: só totais por pessoa (visitas provadas e
-- declaradas, demos com decisor, quentes na carteira, contratos, MRR, % da meta e pontos).
-- Nunca cliente, negócio, endereço ou foto de colega.
--
-- POR QUE AS DUAS FUNÇÕES SE PARTEM EM DUAS. visitas_com_prova e demos_com_decisor trocam o
-- alvo para quem chama quando quem chama não é gestor — é a privacidade de hoje, e ela
-- continua. O ranking precisa contar o time inteiro, então a CONTA mora numa função interna
-- (_visitas_com_prova, _demos_com_decisor) que ninguém de fora executa; as públicas viram
-- uma casca com a mesma troca de alvo de antes, e o resultado delas não muda em nada.
-- Uma verdade só (0143): a régua de "provada" continua escrita uma vez.
--
-- PONTOS: visita provada 20 · demo com decisor 50 · contrato 200 (os eixos do placar do
-- gestor, D4_EIXOS). Visita declarada não pontua: premiar declaração ensina a declarar.
-- Ranking principal = % da própria meta do mês (rampa 2, pleno 8 — comparação justa).
--
-- FONTE DE CADA NÚMERO:
--   visitas  → _visitas_com_prova (client_visits, a mesma régua do app e do Cockpit)
--   demos    → _demos_com_decisor (fichas_de_rua + client_meetings)
--   quentes  → cockpit_snapshot 'hubspot', reps[id].quentes (temperatura ≥ 70, estado atual)
--   contratos/MRR → cockpit_snapshot 'hubspot', vendasMes (closedate); semana = closedate ≥ segunda
--   meta     → cockpit_snapshot 'hubspot', reps[id].metaMensal (data/metas.json)
--   time     → equipe_cockpit ativo, papel rep, com id_hubspot
-- Idempotente.

-- 1 · a conta das visitas, sem troca de alvo (p_pessoa nulo = todos)
create or replace function public._visitas_com_prova(p_de date, p_ate date, p_pessoa uuid default null)
returns table(visit_id uuid, client_id uuid, visited_by uuid, owner_id text, visited_at timestamp with time zone, dia date,
  declarada boolean, distancia_m numeric, limite_m integer, pino_movido_m numeric, serie boolean, foto_id uuid,
  foto_caminho text, provada boolean, motivo text)
language sql stable security definer set search_path to 'public'
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
      p.id_hubspot as dono
    from v
    left join public.clients cl on cl.id = v.client_id
    left join public.profiles p on p.id = v.visited_by
    left join lateral (
      select fv.id, fv.caminho from public.fotos_visita fv
       where fv.client_id = v.client_id and fv.criado_por = v.visited_by
         and fv.criado_em >= v.visited_at - interval '30 minutes'
         and fv.criado_em <= v.visited_at + interval '2 hours'
       order by abs(extract(epoch from fv.criado_em - v.visited_at)) limit 1
    ) f on true
    where v.dia_brt between p_de and p_ate
  )
  select c.id, c.client_id, c.visited_by, c.dono, c.visited_at, c.dia_brt,
    coalesce(c.declarada, false), c.distance_m, c.limite, c.pino_corrigido_de_m, c.em_serie,
    c.f_id, c.f_caminho,
    (c.f_id is not null
      or (not coalesce(c.declarada, false) and c.pino_corrigido_de_m is null and c.distance_m is not null
          and c.distance_m <= c.limite and not c.em_serie)) as provada,
    case
      when c.f_id is not null then 'foto'
      when not coalesce(c.declarada, false) and c.pino_corrigido_de_m is null and c.distance_m is not null
           and c.distance_m <= c.limite and not c.em_serie then 'gps'
      when c.em_serie then 'em série (outro lead no mesmo ponto, < 3 min)'
      when c.pino_corrigido_de_m is not null then 'pino movido na hora (' || round(c.pino_corrigido_de_m) || ' m), sem foto'
      when coalesce(c.declarada, false) then 'declarada sem GPS, sem foto'
      when c.distance_m is not null and c.distance_m > c.limite then 'a ' || round(c.distance_m) || ' m do pino (limite ' || c.limite || ' m), sem foto'
      else 'sem prova'
    end as motivo
  from c
  order by c.visited_at;
$function$;

-- 2 · a pública: a MESMA troca de alvo de antes (não-gestor só vê a si)
create or replace function public.visitas_com_prova(p_de date, p_ate date, p_pessoa uuid default null)
returns table(visit_id uuid, client_id uuid, visited_by uuid, owner_id text, visited_at timestamp with time zone, dia date,
  declarada boolean, distancia_m numeric, limite_m integer, pino_movido_m numeric, serie boolean, foto_id uuid,
  foto_caminho text, provada boolean, motivo text)
language sql stable security definer set search_path to 'public'
as $function$
  select * from public._visitas_com_prova(p_de, p_ate,
    case when (select public.is_field_admin()) or (select public.eh_gestor_cockpit()) then p_pessoa else (select auth.uid()) end);
$function$;

-- 3 · demos com decisor, mesma separação
create or replace function public._demos_com_decisor(p_pessoa uuid, p_de date, p_ate date)
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int from (
    select f.client_id from public.fichas_de_rua f
     where f.criado_por = p_pessoa and f.como_foi = 'falou_com_decisor' and f.proximo = 'reuniao'
       and (f.ocorrido_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    union
    select m.client_id from public.client_meetings m
     where m.created_by = p_pessoa and m.type = 'reuniao' and coalesce(m.status, '') <> 'cancelada'
       and (m.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ) x;
$function$;

create or replace function public.demos_com_decisor(p_pessoa uuid, p_de date, p_ate date)
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select public._demos_com_decisor(
    case when (select public.is_field_admin()) or (select public.eh_gestor_cockpit()) then p_pessoa else (select auth.uid()) end,
    p_de, p_ate);
$function$;

-- as internas não são chamáveis de fora
revoke all on function public._visitas_com_prova(date, date, uuid) from public, anon, authenticated;
revoke all on function public._demos_com_decisor(uuid, date, date) from public, anon, authenticated;

-- 4 · o ranking: só totais, só para quem é do time (ou gestor)
create or replace function public.ranking_do_time(p_periodo text default 'semana')
returns table(owner_id text, nome text, avatar_url text, patamar text, eh_voce boolean,
  visitas_provadas integer, visitas_declaradas integer, demos integer, quentes integer,
  contratos integer, mrr numeric, meta_contratos integer, pct_meta numeric, pontos integer)
language sql stable security definer set search_path to 'public'
as $function$
  with quem as (
    select (select auth.uid()) as uid,
      ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())
        or exists (select 1 from public.equipe_cockpit e where e.profile_id = (select auth.uid()) and e.ativo)) as pode
  ), lim as (
    select ((now() at time zone 'America/Sao_Paulo')::date) as hoje,
      ((now() at time zone 'America/Sao_Paulo')::date
        - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1)) as segunda,
      date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as mes
  ), per as (
    select lim.hoje as ate, case when p_periodo = 'mes' then lim.mes else lim.segunda end as de from lim
  ), snap as (
    select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'
  ), equipe_t as (
    select p.id as pessoa, p.id_hubspot, coalesce(nullif(e.nome, ''), p.full_name) as nome, p.avatar_url
    from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id, quem
    where quem.pode and e.ativo and e.papel = 'rep' and p.id_hubspot is not null
      and not coalesce(e.so_acesso, false) and not coalesce(e.ignorar_owner, false)
  ), vis as (
    select v.visited_by, count(*) filter (where v.provada)::int as provadas,
      count(*) filter (where not v.provada)::int as declaradas
    from per, public._visitas_com_prova(per.de, per.ate, null) v
    where v.visited_by in (select pessoa from equipe_t)
    group by v.visited_by
  ), vendas as (
    select x->>'ownerId' as owner, count(*)::int as n, sum(coalesce(nullif(x->>'mrr', '')::numeric, 0)) as mrr
    from snap, per, jsonb_array_elements(case jsonb_typeof(snap.conteudo->'vendasMes') when 'array' then snap.conteudo->'vendasMes' else '[]'::jsonb end) x
    where ((x->>'closedate')::timestamptz at time zone 'America/Sao_Paulo')::date between per.de and per.ate
    group by 1
  ), linhas as (
    select t.id_hubspot, t.nome, t.avatar_url,
      (snap.conteudo->'reps'->t.id_hubspot->>'patamarMeta') as patamar,
      t.pessoa = (select uid from quem) as eh_voce,
      coalesce(vis.provadas, 0) as provadas, coalesce(vis.declaradas, 0) as declaradas,
      (select public._demos_com_decisor(t.pessoa, per.de, per.ate) from per) as demos,
      coalesce(jsonb_array_length(case jsonb_typeof(snap.conteudo->'reps'->t.id_hubspot->'quentes') when 'array'
        then snap.conteudo->'reps'->t.id_hubspot->'quentes' else '[]'::jsonb end), 0) as quentes,
      coalesce(vendas.n, 0) as contratos, coalesce(vendas.mrr, 0) as mrr,
      nullif(snap.conteudo->'reps'->t.id_hubspot->>'metaMensal', '')::int as meta,
      coalesce((snap.conteudo->'reps'->t.id_hubspot->>'fechadosNoMes')::int, 0) as fechados_mes
    from equipe_t t cross join snap
    left join vis on vis.visited_by = t.pessoa
    left join vendas on vendas.owner = t.id_hubspot
  )
  select l.id_hubspot, l.nome, l.avatar_url, l.patamar, l.eh_voce,
    l.provadas, l.declaradas, l.demos, l.quentes, l.contratos, l.mrr, l.meta,
    case when coalesce(l.meta, 0) > 0 then round(100.0 * l.fechados_mes / l.meta, 1) end as pct_meta,
    (l.provadas * 20 + l.demos * 50 + l.contratos * 200) as pontos
  from linhas l
  order by 14 desc, 2;
$function$;

revoke all on function public.ranking_do_time(text) from public, anon;
grant execute on function public.ranking_do_time(text) to authenticated;
