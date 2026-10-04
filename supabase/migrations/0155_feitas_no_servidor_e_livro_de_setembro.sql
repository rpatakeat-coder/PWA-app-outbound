-- 0155 · o que ficou de fora do handoff Tarefas e Temporada (04/10/2026)
--
-- 1. pontos_eventos.negocio_nome — o cartão "Contrato fechado" da aba Tarefas não dizia
--    qual negócio. sincronizar_pontos grava o nome (vendas e demos do robô) e preenche
--    as linhas antigas.
-- 2. sincronizar_pontos lê vendasLivro (contratos desde o mês ANTERIOR, robô de 04/10).
--    O livro só tinha outubro: o ranking do Mês comparava com um setembro vazio e
--    "quem mais evoluiu" saía inflado. A lista de demos do robô também passou a vir
--    desde o mês anterior. Idempotente pelo unique (tipo, origem_id).
-- 3. fila_feitas — as "Feitas hoje" da aba Tarefas no servidor (antes: localStorage, uma
--    lista por aparelho). Guarda também os ids que o registro criou no HubSpot (nota,
--    próximo passo, tarefa concluída, etapa anterior): é com eles que a Edge fila-tarefas
--    (op desfazer) desfaz um registro depois dos 5 s, no mesmo dia. O cliente grava e lê
--    só as suas; o desfazer confere cada id contra o negócio e o dono no HubSpot.
--
-- Idempotente.

alter table public.pontos_eventos add column if not exists negocio_nome text;

create table if not exists public.fila_feitas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dia date not null,
  deal_id text not null,
  negocio text,
  hora text,
  resultado text,
  volta date,
  perdido text,
  acao_id uuid unique,
  etapa_anterior text,
  tarefa_id text,
  concluiu_tarefa boolean not null default false,
  nota_id text,
  proximo_id text,
  proximo_ja_existia boolean not null default false,
  estado text not null default 'pendente' check (estado in ('pendente', 'gravada', 'desfeita')),
  criada_em timestamptz not null default now(),
  desfeita_em timestamptz
);
create index if not exists fila_feitas_user_dia on public.fila_feitas (user_id, dia);
alter table public.fila_feitas enable row level security;
drop policy if exists fila_feitas_le_as_suas on public.fila_feitas;
create policy fila_feitas_le_as_suas on public.fila_feitas for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists fila_feitas_grava_as_suas on public.fila_feitas;
create policy fila_feitas_grava_as_suas on public.fila_feitas for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists fila_feitas_atualiza_as_suas on public.fila_feitas;
create policy fila_feitas_atualiza_as_suas on public.fila_feitas for update to authenticated
  using (user_id = (select auth.uid()) and estado <> 'desfeita') with check (user_id = (select auth.uid()) and estado <> 'desfeita');
drop policy if exists fila_feitas_apaga_as_suas on public.fila_feitas;
create policy fila_feitas_apaga_as_suas on public.fila_feitas for delete to authenticated using (user_id = (select auth.uid()) and estado = 'pendente');
revoke all on public.fila_feitas from anon;

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
    select r.key as owner, d->>'id' as deal, (d->>'em')::timestamptz as em, d->>'nome' as nome
      from snap, jsonb_each(snap.conteudo->'reps') r,
           jsonb_array_elements(case jsonb_typeof(r.value->'demosRealizadasLista') when 'array' then r.value->'demosRealizadasLista' else '[]'::jsonb end) d
     where d->>'id' is not null and d->>'em' is not null
  ), ins as (
    insert into public.pontos_eventos (owner_id, pessoa, tipo, pts, origem_id, ref_em, negocio_id, negocio_nome)
    select dm.owner, (select p.id from public.profiles p where p.id_hubspot = dm.owner limit 1), 'demo_realizada', 50, dm.deal, dm.em, dm.deal, dm.nome
      from demos dm
    on conflict (tipo, origem_id) do nothing
    returning 1
  ) select count(*) into v_demos from ins;

  with snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  vendas as (
    select x->>'ownerId' as owner, x->>'id' as deal, (x->>'closedate')::timestamptz as em, nullif(x->>'mrr', '')::numeric as mrr, x->>'nome' as nome
      -- vendasLivro (04/10/26) traz o mês anterior junto; sem ela (robô antigo), vendasMes
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

  -- o nome do negócio nas linhas gravadas antes da coluna existir (cartão de contrato do app)
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

  -- a temporada corrente existe
  insert into public.temporadas (semana, inicio, fim)
  select (public._temporada_inicio(now()) at time zone 'America/Sao_Paulo')::date, public._temporada_inicio(now()), public._temporada_inicio(now()) + interval '7 days'
  on conflict (semana) do nothing;

  return jsonb_build_object('visitas', v_novas, 'demos', v_demos, 'contratos', v_contratos, 'estornos', v_estornos);
end $$;
revoke all on function public.sincronizar_pontos() from public, anon, authenticated;
