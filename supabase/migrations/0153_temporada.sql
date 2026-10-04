-- 0153 · A temporada (gamificação) — docs/10 §2, handoff de 22/10 (aplicada em 04/10/2026)
--
-- Julyan: "vamos gamificar esse cockpit... não quero deixar o clima pesado entre a equipe,
-- a ideia é animar eles a venderem mais... estou pensando em até bonificar o melhor da semana".
--
-- PEÇAS
--   pontos_eventos     o livro: uma linha por fato, chave única (tipo, origem_id). Nada se
--                      calcula no cliente. Estorno = linha negativa no mesmo livro.
--   sincronizar_pontos visita provada 20 (_visitas_com_prova, a régua de 02 §0), demo
--                      realizada 50 (entrou em Demo/Proposta, 1× por negócio; robô:
--                      reps[id].demosRealizadasLista) e contrato 200 (vendasMes do robô:
--                      negócio que foi para Ganho/Onboarding — só o Asaas move para Ganho).
--                      Cron a cada 10 min. NÃO pontuam: decisor, reunião marcada, declarada.
--   temporadas         semana de segunda 9h a segunda 9h; o cron de segunda 9h fecha a
--                      anterior (vencedor = 1º que bate o piso; foto das posições para a seta)
--                      e abre a próxima. Prêmio: texto opcional, só o gestor escreve.
--   meta em pontos     seller_visit_goals.meta_pts_semana (vazio = 1.000 para meta de 8
--                      clientes, 500 para iniciante — D14, Julyan 04/10/26). Mês = 4×.
--   ranking_executivo  pódio (top 3) + a própria linha + 4 destaques + meta coletiva +
--                      campeão da última semana. NUNCA a lista completa nem cliente de colega.
--   ranking_gestor     a lista completa, com declaradas, piso e evolução. Confere o papel.
--
-- Diferenças da especificação, ditas aqui para não parecerem esquecidas:
--   * não há `cobrancas` neste banco (o Asaas mora no projeto do RPA, que não se toca):
--     o contrato vem do Ganho/Onboarding do HubSpot, que só o Asaas move;
--   * a demo vem do robô, não de client_stage_changes (que só vê o que o app mudou);
--   * os feriados são os nacionais, calculados (decisão do Julyan), sem tabela.
-- Idempotente.

-- ---------------------------------------------------------------- o livro
create table if not exists public.pontos_eventos (
  id bigint generated always as identity primary key,
  owner_id text not null,
  pessoa uuid,
  tipo text not null check (tipo in ('visita_provada', 'demo_realizada', 'contrato', 'estorno')),
  negocio_id text,
  pts integer not null,
  valor numeric,
  origem_id text not null,
  ref_em timestamptz not null,
  criado_em timestamptz not null default now(),
  unique (tipo, origem_id)
);
create index if not exists pontos_eventos_ref on public.pontos_eventos (ref_em);
create index if not exists pontos_eventos_owner on public.pontos_eventos (owner_id, ref_em);
alter table public.pontos_eventos enable row level security;
drop policy if exists pontos_eventos_le_os_seus on public.pontos_eventos;
create policy pontos_eventos_le_os_seus on public.pontos_eventos for select to authenticated
  using (
    owner_id = (select p.id_hubspot from public.profiles p where p.id = (select auth.uid()))
    or (select public.is_field_admin()) or (select public.eh_gestor_cockpit())
  );
-- ninguém escreve pelo cliente: só as funções abaixo (security definer)

-- ---------------------------------------------------------------- meta em pontos
alter table public.seller_visit_goals add column if not exists meta_pts_semana integer;

-- ---------------------------------------------------------------- temporadas
create table if not exists public.temporadas (
  semana date primary key,               -- a segunda-feira em que a temporada abre
  inicio timestamptz not null,
  fim timestamptz not null,
  vencedor_owner text,
  snapshot jsonb,                        -- posições finais {owner: {pos, pct, pts, ...}}
  premio_texto text,
  fechada_em timestamptz,
  atualizado_por uuid
);
alter table public.temporadas enable row level security;
drop policy if exists temporadas_le_o_time on public.temporadas;
create policy temporadas_le_o_time on public.temporadas for select to authenticated using (true);
drop policy if exists temporadas_gestor_escreve_premio on public.temporadas;
create policy temporadas_gestor_escreve_premio on public.temporadas for update to authenticated
  using ((select public.is_field_admin()) or (select public.eh_gestor_cockpit()))
  with check ((select public.is_field_admin()) or (select public.eh_gestor_cockpit()));

-- o início da temporada que contém `ts`: a segunda 9h (Brasília) mais recente
create or replace function public._temporada_inicio(ts timestamptz)
returns timestamptz language sql immutable set search_path to 'public' as $$
  select case
    when (ts at time zone 'America/Sao_Paulo') >= date_trunc('week', ts at time zone 'America/Sao_Paulo') + interval '9 hours'
      then (date_trunc('week', ts at time zone 'America/Sao_Paulo') + interval '9 hours') at time zone 'America/Sao_Paulo'
    else (date_trunc('week', ts at time zone 'America/Sao_Paulo') - interval '7 days' + interval '9 hours') at time zone 'America/Sao_Paulo'
  end;
$$;

-- ---------------------------------------------------------------- sincronização do livro
create or replace function public.sincronizar_pontos()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_novas int := 0; v_demos int := 0; v_contratos int := 0; v_estornos int := 0; n int;
  v_de date := ((now() at time zone 'America/Sao_Paulo')::date - 40);
  v_ate date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- visitas provadas de quem é do time
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

  -- estorno: a visita pontuada deixou de ser provada (ou sumiu) — linha negativa, uma vez
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

  -- demos realizadas (1× por negócio) e contratos, do snapshot do robô
  with snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  demos as (
    select r.key as owner, d->>'id' as deal, (d->>'em')::timestamptz as em
      from snap, jsonb_each(snap.conteudo->'reps') r,
           jsonb_array_elements(case jsonb_typeof(r.value->'demosRealizadasLista') when 'array' then r.value->'demosRealizadasLista' else '[]'::jsonb end) d
     where d->>'id' is not null and d->>'em' is not null
  ), ins as (
    insert into public.pontos_eventos (owner_id, pessoa, tipo, pts, origem_id, ref_em, negocio_id)
    select dm.owner, (select p.id from public.profiles p where p.id_hubspot = dm.owner limit 1), 'demo_realizada', 50, dm.deal, dm.em, dm.deal
      from demos dm
    on conflict (tipo, origem_id) do nothing
    returning 1
  ) select count(*) into v_demos from ins;

  with snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  vendas as (
    select x->>'ownerId' as owner, x->>'id' as deal, (x->>'closedate')::timestamptz as em, nullif(x->>'mrr', '')::numeric as mrr
      from snap, jsonb_array_elements(case jsonb_typeof(snap.conteudo->'vendasMes') when 'array' then snap.conteudo->'vendasMes' else '[]'::jsonb end) x
     where x->>'id' is not null and x->>'ownerId' is not null and x->>'closedate' is not null
  ), ins as (
    insert into public.pontos_eventos (owner_id, pessoa, tipo, pts, valor, origem_id, ref_em, negocio_id)
    select vd.owner, (select p.id from public.profiles p where p.id_hubspot = vd.owner limit 1), 'contrato', 200, vd.mrr, vd.deal, vd.em, vd.deal
      from vendas vd
    on conflict (tipo, origem_id) do nothing
    returning 1
  ) select count(*) into v_contratos from ins;

  -- a temporada corrente existe
  insert into public.temporadas (semana, inicio, fim)
  select (public._temporada_inicio(now()) at time zone 'America/Sao_Paulo')::date, public._temporada_inicio(now()), public._temporada_inicio(now()) + interval '7 days'
  on conflict (semana) do nothing;

  return jsonb_build_object('visitas', v_novas, 'demos', v_demos, 'contratos', v_contratos, 'estornos', v_estornos);
end $$;
revoke all on function public.sincronizar_pontos() from public, anon, authenticated;

-- ---------------------------------------------------------------- as linhas do ranking (interno)
create or replace function public._linhas_ranking(p_de timestamptz, p_ate timestamptz, p_mensal boolean)
returns table(owner_id text, pessoa uuid, nome text, avatar_url text, pts integer, provadas integer, declaradas integer,
  demos integer, contratos integer, mrr numeric, meta_pts integer, pct numeric)
language sql stable security definer set search_path to 'public' as $$
  with snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  time_ as (
    select p.id as pessoa, p.id_hubspot as owner_id, coalesce(nullif(e.nome, ''), p.full_name) as nome, p.avatar_url,
      coalesce(g.meta_pts_semana,
        case when coalesce(nullif(snap.conteudo->'reps'->p.id_hubspot->>'metaMensal', '')::int, 0) >= 8 then 1000 else 500 end) as meta_semana
    from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id cross join snap
    left join public.seller_visit_goals g on g.seller_id = p.id
    where e.ativo and e.papel = 'rep' and p.id_hubspot is not null
      and not coalesce(e.so_acesso, false) and not coalesce(e.ignorar_owner, false)
  ), ev as (
    select pe.owner_id,
      sum(pe.pts)::int as pts,
      (count(*) filter (where pe.tipo = 'visita_provada') - count(*) filter (where pe.tipo = 'estorno' and pe.origem_id like 'visita_provada:%'))::int as provadas,
      count(*) filter (where pe.tipo = 'demo_realizada')::int as demos,
      count(*) filter (where pe.tipo = 'contrato')::int as contratos,
      coalesce(sum(pe.valor) filter (where pe.tipo = 'contrato'), 0) as mrr
    from public.pontos_eventos pe where pe.ref_em >= p_de and pe.ref_em < p_ate group by pe.owner_id
  ), decl as (
    select x.visited_by as pessoa, count(*)::int as n
      from public._visitas_com_prova(((p_de at time zone 'America/Sao_Paulo')::date), ((p_ate at time zone 'America/Sao_Paulo')::date), null) x
     where not x.provada and x.visited_at >= p_de and x.visited_at < p_ate group by x.visited_by
  )
  select t.owner_id, t.pessoa, t.nome, t.avatar_url,
    coalesce(ev.pts, 0), coalesce(ev.provadas, 0), coalesce(decl.n, 0), coalesce(ev.demos, 0), coalesce(ev.contratos, 0), coalesce(ev.mrr, 0),
    (t.meta_semana * case when p_mensal then 4 else 1 end)::int,
    round(100.0 * coalesce(ev.pts, 0) / nullif(t.meta_semana * case when p_mensal then 4 else 1 end, 0), 1)
  from time_ t left join ev on ev.owner_id = t.owner_id left join decl on decl.pessoa = t.pessoa;
$$;
revoke all on function public._linhas_ranking(timestamptz, timestamptz, boolean) from public, anon, authenticated;

-- janela do período ('semana' = temporada corrente; 'mes' = mês civil) e a anterior
create or replace function public._janela(p_periodo text, p_deslocar int default 0)
returns table(de timestamptz, ate timestamptz)
language sql stable set search_path to 'public' as $$
  select case when p_periodo = 'mes'
      then ((date_trunc('month', now() at time zone 'America/Sao_Paulo') - make_interval(months => p_deslocar)) at time zone 'America/Sao_Paulo')
      else public._temporada_inicio(now()) - make_interval(days => 7 * p_deslocar) end,
    case when p_periodo = 'mes'
      then ((date_trunc('month', now() at time zone 'America/Sao_Paulo') - make_interval(months => p_deslocar) + interval '1 month') at time zone 'America/Sao_Paulo')
      else public._temporada_inicio(now()) - make_interval(days => 7 * p_deslocar) + interval '7 days' end;
$$;

-- a tabela ordenada (% da meta, desempate contratos, MRR) com evolução e movimento
create or replace function public._ranking_ordenado(p_periodo text)
returns table(pos integer, owner_id text, pessoa uuid, nome text, avatar_url text, pts integer, provadas integer, declaradas integer,
  demos integer, contratos integer, mrr numeric, meta_pts integer, pct numeric, evolucao numeric, movimento integer, no_piso boolean, falta_piso text)
language sql stable security definer set search_path to 'public' as $$
  with j as (select * from public._janela(p_periodo, 0)), ja as (select * from public._janela(p_periodo, 1)),
  agora as (select l.* from j, public._linhas_ranking(j.de, j.ate, p_periodo = 'mes') l),
  antes as (select l.owner_id, l.pct from ja, public._linhas_ranking(ja.de, ja.ate, p_periodo = 'mes') l),
  ultima as (select t.snapshot from public.temporadas t where t.fechada_em is not null order by t.semana desc limit 1),
  ord as (
    select row_number() over (order by a.pct desc nulls last, a.contratos desc, a.mrr desc, a.nome)::int as pos, a.*
    from agora a
  )
  select o.pos, o.owner_id, o.pessoa, o.nome, o.avatar_url, o.pts, o.provadas, o.declaradas, o.demos, o.contratos, o.mrr, o.meta_pts, o.pct,
    o.pct - coalesce(an.pct, 0),
    case when p_periodo = 'semana' then ((select (u.snapshot->o.owner_id->>'pos')::int from ultima u) - o.pos) end,
    (o.provadas >= 10 and o.demos >= 1),
    case when o.provadas >= 10 and o.demos >= 1 then 'no piso'
      when o.provadas < 10 and o.demos < 1 then 'falta ' || (10 - o.provadas) || ' visita' || case when 10 - o.provadas > 1 then 's' else '' end || ' e 1 demo'
      when o.provadas < 10 then 'falta ' || (10 - o.provadas) || ' visita' || case when 10 - o.provadas > 1 then 's' else '' end
      else 'falta 1 demo' end
  from ord o left join antes an on an.owner_id = o.owner_id;
$$;
revoke all on function public._ranking_ordenado(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- RPC do executivo
create or replace function public.ranking_executivo(p_periodo text default 'semana')
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_owner text; v_pode boolean; v_j record; v_eu record; v_acima record; v_res jsonb; v_falta int; v_txt text; v_proximo text; v_rk jsonb;
begin
  select p.id_hubspot into v_owner from public.profiles p where p.id = (select auth.uid());
  v_pode := (select public.is_field_admin()) or (select public.eh_gestor_cockpit())
    or exists (select 1 from public.equipe_cockpit e where e.profile_id = (select auth.uid()) and e.ativo);
  if not v_pode then return jsonb_build_object('erro', 'Sem acesso ao ranking.'); end if;
  select * into v_j from public._janela(p_periodo, 0);

  -- a tabela inteira fica SÓ aqui dentro: sai o pódio, a minha linha e os destaques
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rk from public._ranking_ordenado(p_periodo) x;

  select * into v_eu from jsonb_to_recordset(v_rk) as r(pos int, owner_id text, nome text, avatar_url text, pts int, provadas int, declaradas int, demos int, contratos int, mrr numeric, meta_pts int, pct numeric, evolucao numeric, movimento int) where r.owner_id = v_owner;
  if v_eu.pos is not null and v_eu.pos > 1 then
    select * into v_acima from jsonb_to_recordset(v_rk) as r(pos int, owner_id text, nome text, avatar_url text, pts int, provadas int, declaradas int, demos int, contratos int, mrr numeric, meta_pts int, pct numeric, evolucao numeric, movimento int) where r.pos = v_eu.pos - 1;
    -- pontos que faltam para passar a % de quem está logo acima, na MINHA meta
    v_falta := greatest(1, floor(coalesce(v_acima.pct, 0) / 100.0 * v_eu.meta_pts)::int + 1 - v_eu.pts);
    v_txt := 'Faltam ' || v_falta || ' pts para o ' || (v_eu.pos - 1) || 'º';
    v_proximo := case
      when v_falta <= 20 then '1 visita provada te leva ao ' || (v_eu.pos - 1) || 'º'
      when v_falta <= 50 then '1 demo realizada ou ' || ceil(v_falta / 20.0)::int || ' visitas provadas te levam ao ' || (v_eu.pos - 1) || 'º'
      when v_falta <= 200 then '1 contrato ou ' || ceil(v_falta / 20.0)::int || ' visitas provadas te levam ao ' || (v_eu.pos - 1) || 'º'
      else ceil(v_falta / 200.0)::int || ' contratos ou ' || ceil(v_falta / 20.0)::int || ' visitas provadas te levam ao ' || (v_eu.pos - 1) || 'º' end;
  elsif v_eu.pos = 1 then
    select * into v_acima from jsonb_to_recordset(v_rk) as r(pos int, owner_id text, nome text, avatar_url text, pts int, provadas int, declaradas int, demos int, contratos int, mrr numeric, meta_pts int, pct numeric, evolucao numeric, movimento int) where r.pos = 2;
    v_txt := 'Você lidera' || case when v_acima.pos is not null then ' · ' || greatest(0, v_eu.pts - floor(coalesce(v_acima.pct, 0) / 100.0 * v_eu.meta_pts)::int) || ' pts à frente do 2º' else '' end;
    v_proximo := 'Mantenha o ritmo: cada visita provada vale 20';
  end if;

  select jsonb_build_object(
    'periodo', p_periodo, 'de', v_j.de, 'ate', v_j.ate,
    'podio', coalesce((select jsonb_agg(jsonb_build_object('pos', r.pos, 'nome', r.nome, 'avatar_url', r.avatar_url, 'pct', r.pct, 'pts', r.pts) order by r.pos) from jsonb_to_recordset(v_rk) as r(pos int, owner_id text, nome text, avatar_url text, pts int, provadas int, declaradas int, demos int, contratos int, mrr numeric, meta_pts int, pct numeric, evolucao numeric, movimento int) where r.pos <= 3), '[]'::jsonb),
    'eu', case when v_eu.pos is null then null else jsonb_build_object(
      'pos', v_eu.pos, 'total', jsonb_array_length(v_rk), 'movimento', v_eu.movimento, 'pct', v_eu.pct, 'pts', v_eu.pts, 'meta_pts', v_eu.meta_pts,
      'faltam', v_txt, 'proximo', v_proximo, 'provadas', v_eu.provadas, 'declaradas', v_eu.declaradas, 'demos', v_eu.demos,
      'contratos', v_eu.contratos, 'mrr', v_eu.mrr) end,
    'destaques', jsonb_build_array(
      (select jsonb_build_object('titulo', 'Mais visitas provadas', 'nome', r.nome, 'valor', r.provadas) from jsonb_to_recordset(v_rk) as r(pos int, owner_id text, nome text, avatar_url text, pts int, provadas int, declaradas int, demos int, contratos int, mrr numeric, meta_pts int, pct numeric, evolucao numeric, movimento int) where r.provadas > 0 order by r.provadas desc, r.nome limit 1),
      (select jsonb_build_object('titulo', 'Mais demos realizadas', 'nome', r.nome, 'valor', r.demos) from jsonb_to_recordset(v_rk) as r(pos int, owner_id text, nome text, avatar_url text, pts int, provadas int, declaradas int, demos int, contratos int, mrr numeric, meta_pts int, pct numeric, evolucao numeric, movimento int) where r.demos > 0 order by r.demos desc, r.nome limit 1),
      (select jsonb_build_object('titulo', 'Mais contratos', 'nome', r.nome, 'valor', r.contratos, 'mrr', r.mrr) from jsonb_to_recordset(v_rk) as r(pos int, owner_id text, nome text, avatar_url text, pts int, provadas int, declaradas int, demos int, contratos int, mrr numeric, meta_pts int, pct numeric, evolucao numeric, movimento int) where r.contratos > 0 order by r.contratos desc, r.mrr desc, r.nome limit 1),
      (select jsonb_build_object('titulo', 'Quem mais evoluiu', 'nome', r.nome, 'valor', round(r.evolucao)) from jsonb_to_recordset(v_rk) as r(pos int, owner_id text, nome text, avatar_url text, pts int, provadas int, declaradas int, demos int, contratos int, mrr numeric, meta_pts int, pct numeric, evolucao numeric, movimento int) where r.evolucao > 0 order by r.evolucao desc, r.nome limit 1)),
    'meta_coletiva', (select jsonb_build_object(
        'feitos', coalesce(sum(coalesce((rv.value->>'fechadosNoMes')::int, 0)), 0),
        'meta', coalesce(sum(coalesce(nullif(rv.value->>'metaMensal', '')::int, 0)), 0))
      from public.cockpit_snapshot s, jsonb_each(s.conteudo->'reps') rv where s.chave = 'hubspot'),
    'campeao', (select jsonb_build_object('semana', t.semana, 'inicio', t.inicio, 'fim', t.fim, 'fechada_em', t.fechada_em,
        'nome', t.snapshot->t.vencedor_owner->>'nome', 'pct', t.snapshot->t.vencedor_owner->'pct', 'pts', t.snapshot->t.vencedor_owner->'pts',
        'contratos', t.snapshot->t.vencedor_owner->'contratos', 'premio_texto', nullif(trim(coalesce(t.premio_texto, '')), ''),
        'minha_pos', t.snapshot->v_owner->'pos', 'meu_pct', t.snapshot->v_owner->'pct')
      from public.temporadas t where t.fechada_em is not null and t.vencedor_owner is not null order by t.semana desc limit 1)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.ranking_executivo(text) from public, anon;
grant execute on function public.ranking_executivo(text) to authenticated;

-- ---------------------------------------------------------------- RPC do gestor
create or replace function public.ranking_gestor(p_periodo text default 'semana')
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_j record;
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    return jsonb_build_object('erro', 'Só a gestão vê a lista completa.');
  end if;
  select * into v_j from public._janela(p_periodo, 0);
  return jsonb_build_object(
    'periodo', p_periodo, 'de', v_j.de, 'ate', v_j.ate,
    'linhas', coalesce((select jsonb_agg(to_jsonb(r) - 'pessoa' order by r.pos) from public._ranking_ordenado(p_periodo) r), '[]'::jsonb),
    'temporada', (select to_jsonb(t) - 'snapshot' from public.temporadas t where t.semana = (public._temporada_inicio(now()) at time zone 'America/Sao_Paulo')::date),
    'meta_coletiva', (select jsonb_build_object(
        'feitos', coalesce(sum(coalesce((rv.value->>'fechadosNoMes')::int, 0)), 0),
        'meta', coalesce(sum(coalesce(nullif(rv.value->>'metaMensal', '')::int, 0)), 0))
      from public.cockpit_snapshot s, jsonb_each(s.conteudo->'reps') rv where s.chave = 'hubspot'));
end $$;
revoke all on function public.ranking_gestor(text) from public, anon;
grant execute on function public.ranking_gestor(text) to authenticated;

-- ---------------------------------------------------------------- fechar a semana (seg 9h)
create or replace function public.fechar_temporada()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_ini timestamptz := public._temporada_inicio(now()) - interval '7 days'; v_snap jsonb; v_venc text;
begin
  perform public.sincronizar_pontos();
  select jsonb_object_agg(l.owner_id, jsonb_build_object('pos', l.pos, 'nome', l.nome, 'pct', l.pct, 'pts', l.pts, 'provadas', l.provadas,
      'demos', l.demos, 'contratos', l.contratos, 'mrr', l.mrr, 'no_piso', l.no_piso))
    into v_snap
    from (
      select row_number() over (order by x.pct desc nulls last, x.contratos desc, x.mrr desc, x.nome)::int as pos, x.*,
        (x.provadas >= 10 and x.demos >= 1) as no_piso
      from public._linhas_ranking(v_ini, v_ini + interval '7 days', false) x
    ) l;
  select k into v_venc from jsonb_each(coalesce(v_snap, '{}'::jsonb)) e(k, v)
   where (e.v->>'no_piso')::boolean order by (e.v->>'pos')::int limit 1;
  insert into public.temporadas (semana, inicio, fim) values ((v_ini at time zone 'America/Sao_Paulo')::date, v_ini, v_ini + interval '7 days')
  on conflict (semana) do nothing;
  update public.temporadas set snapshot = v_snap, vencedor_owner = v_venc, fechada_em = now()
   where semana = (v_ini at time zone 'America/Sao_Paulo')::date;
  insert into public.temporadas (semana, inicio, fim)
  values ((public._temporada_inicio(now()) at time zone 'America/Sao_Paulo')::date, public._temporada_inicio(now()), public._temporada_inicio(now()) + interval '7 days')
  on conflict (semana) do nothing;
  return jsonb_build_object('semana', (v_ini at time zone 'America/Sao_Paulo')::date, 'vencedor', v_venc);
end $$;
revoke all on function public.fechar_temporada() from public, anon, authenticated;

-- ---------------------------------------------------------------- os relógios
select cron.unschedule(jobid) from cron.job where jobname in ('temporada-pontos-10min', 'temporada-fecha-segunda-9h');
select cron.schedule('temporada-pontos-10min', '*/10 * * * *', 'select public.sincronizar_pontos();');
-- segunda 9h em Brasília = 12h UTC (sem horário de verão desde 2019)
select cron.schedule('temporada-fecha-segunda-9h', '1 12 * * 1', 'select public.fechar_temporada();');
