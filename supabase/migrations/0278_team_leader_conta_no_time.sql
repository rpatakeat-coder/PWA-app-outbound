-- 0278 — Team leader conta no time; demo reciclada também quando só a SAÍDA de Perdido ficou registrada
-- (Julyan, 26/11/26: "Bruno relatou 3 e Rodrigo 2, preciso auditoria em tudo e consertar isso";
--  "bruno é team leader, por isso dei acesso master").
--
-- 1) O TEAM LEADER SUMIU DO TIME
--    Em 25/11 o Bruno virou master pela aba Acessos (criar-usuario op:'papel' → equipe_cockpit.papel
--    = 'manager') para conduzir a daily. Onze contas do banco definem "o time" por
--    `e.papel = 'rep'` e ele saiu de todas: placar da semana e bônus (pontos_da_semana — foi o
--    campeão de 16–22/11 com 758), ranking, Desenvolvimento (variável), disputa, líder, habilidade,
--    combinados, previsão, resultados mensais, time na rua e voltas. As 4 demos dele de 23–29/11
--    estavam em pontos_eventos; só não apareciam.
--    Agora: coluna `equipe_cockpit.conta_no_time` — master que também vende. O papel continua
--    'manager' (Daily do gestor, telas de gestor), e as onze contas passam a ler
--    `(e.papel = 'rep' or e.conta_no_time)`. Hoje só o Bruno tem a marca.
--
-- 2) DEMO RECICLADA PERDIDA (Adega da Onça, Sérgio)
--    A 0227 dá uma 2ª demo ao negócio que passou por Perdido/Reciclagem antes de voltar a Demo,
--    contando em client_stage_changes as linhas que ENTRAM numa etapa perdida. O Adega foi para
--    Perdido em 18/11 direto no HubSpot (sem linha de entrada); o app só registrou a SAÍDA
--    (from_stage 'Perdido', 24/11) e a demo refeita em 24/11 bateu no on conflict da 1ª (12/11).
--    Agora uma passagem por etapa perdida é: uma linha que entra nela, OU uma linha que sai dela
--    sem entrada registrada desde a saída anterior. Só para demos que entraram de 23/11/26 em
--    diante — semanas já premiadas não mudam (havia mais 4 casos antigos: 3 do Bruno, 1 do Sandro,
--    entre 06/10 e 13/11; ficam como estão).
--
-- Idempotente: add column if not exists; a troca nas onze funções só roda onde ainda não há
-- conta_no_time; create or replace mantém as permissões.

alter table public.equipe_cockpit add column if not exists conta_no_time boolean not null default false;
comment on column public.equipe_cockpit.conta_no_time is
  'Master (papel manager) que também vende — o team leader. Conta como executivo no placar, no ranking, no Desenvolvimento e nas listas do time; o papel manager segue valendo para as telas de gestor. 0278.';

update public.equipe_cockpit e set conta_no_time = true
  from public.profiles p
 where p.id = e.profile_id and p.id_hubspot = '86100506' and e.papel = 'manager' and not e.conta_no_time;

do $$
declare r record; def text; novo text;
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('_calc_combinados_quadro', '_calc_disputa_quadro', '_desenvolvimento_de', '_linhas_ranking',
                         'habilidade_quadro', 'lider_quadro', 'pontos_da_semana', 'previsao_honesta',
                         'resultados_mensais', 'time_na_rua', 'voltas_do_time')
       and p.prosrc like '%e.papel = ''rep''%' and p.prosrc not like '%conta_no_time%'
  loop
    def := pg_get_functiondef(r.oid);
    novo := replace(def, 'e.papel = ''rep''', '(e.papel = ''rep'' or e.conta_no_time)');
    execute novo;
    raise notice '0278: % passa a contar o team leader', r.proname;
  end loop;
end $$;

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
  entrada as (
    select db.deal,
      (select max(s.created_at) from public.clients c join public.client_stage_changes s on s.client_id = c.id
        where c.id_hubspot = db.deal and s.to_stage_id in ('1395880471', '209405288')) as entrou_demo
    from (select distinct deal from demos_brutas) db
  ),
  voltas as (
    select e.deal, e.entrou_demo,
      (case when e.entrou_demo is null then 0 else
        (select count(*) from public.clients c join public.client_stage_changes s on s.client_id = c.id
          where c.id_hubspot = e.deal and s.created_at < e.entrou_demo
            and (s.to_stage_id in ('1398311191', '1396006164', '209405293')
                 -- 0278: a saída de etapa perdida sem a entrada registrada também é uma passagem
                 --       (só para demos de 23/11/26 em diante)
                 or (e.entrou_demo >= timestamptz '2026-11-23 00:00 America/Sao_Paulo'
                     and s.from_stage in ('Perdido', 'Reciclagem', 'NEGÓCIO PERDIDO')
                     and not exists (
                       select 1 from public.client_stage_changes s2
                        where s2.client_id = s.client_id and s2.created_at < s.created_at
                          and s2.to_stage_id in ('1398311191', '1396006164', '209405293')
                          and s2.created_at > coalesce((select max(s3.created_at) from public.client_stage_changes s3
                                                         where s3.client_id = s.client_id and s3.created_at < s.created_at
                                                           and s3.from_stage in ('Perdido', 'Reciclagem', 'NEGÓCIO PERDIDO')), '-infinity'::timestamptz)))
                )) end)::int as n
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
