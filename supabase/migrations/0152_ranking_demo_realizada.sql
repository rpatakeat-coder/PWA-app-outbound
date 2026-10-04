-- 0152 · Ranking do time: só a demo REALIZADA pontua — 03/10/2026
--
-- Julyan: "pode pontuar só a demo realizada... não quero deixar o clima pesado entre a
-- equipe, a ideia é animar eles a venderem mais".
--
-- Medido antes: no primeiro ranking (0151) a Renata liderava com 12 "demos" e 6 visitas;
-- metade eram reuniões cadastradas num mesmo dia para a mesma quinta, ainda "agendada".
-- Reunião marcada não prova demo: em 60 dias as 132 reuniões do app estavam todas
-- "agendada" — ninguém marca realizada. O que só existe com a demo feita é o negócio
-- ENTRAR em Demo/Proposta (o HubSpot exige plano, MRR e data da reunião). O robô passou a
-- contar isso por executivo (cockpit-unificado #694): reps[id].demosRealizadasSemana e
-- reps[id].demosRealizadasMes no snapshot 'hubspot'.
--
-- Muda só a coluna `demos` (e os pontos que dependem dela). O resto da 0151 fica igual.
-- Idempotente.

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
      coalesce(nullif(snap.conteudo->'reps'->t.id_hubspot->>
        (case when p_periodo = 'mes' then 'demosRealizadasMes' else 'demosRealizadasSemana' end), '')::int, 0) as demos,
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
