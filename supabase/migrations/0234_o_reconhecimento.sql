-- 0234 · Reconhecimento e disputa (handoff "Acelerar Field Sales v2", telas 4a, 4b e 4c)
--
--   disputas            a disputa da vez: nome, a taxa medida (uma que já existe no cockpit), por praça,
--                       início e fim (até 2 semanas). Uma por vez: o banco recusa datas que se cruzam.
--   auditorias_semana   a auditoria de sexta, uma por semana: quando, quem e o que foi corrigido. O placar
--                       da disputa e o reconhecimento da sexta só ganham o selo com ela. É do gestor.
--   previsoes_demo      a chance de fechar no mês que o executivo diz depois de salvar a ficha de demo
--                       no app (4c). Pular é não gravar. Não vai para o HubSpot.
--
-- POR QUE A AUDITORIA É UMA TABELA DA SEMANA E NÃO UMA COLUNA DA DISPUTA. O handoff põe `auditada_em`
-- na disputa, mas uma disputa de 2 semanas tem 2 sextas, e o reconhecimento da sexta também precisa do
-- selo quando não há disputa nenhuma. A auditoria é da semana; a disputa lê a da última sexta dela.
--
-- A PRAÇA não está no banco (vem de data/narrativas.json do cockpit), então as funções devolvem por
-- pessoa e o cockpit soma por praça. Nada aqui escreve no HubSpot.

create table if not exists public.disputas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) >= 3),
  taxa text not null check (taxa in ('provada', 'passo', 'naHora', 'dono', 'demo', 'volume')),
  times text not null default 'praca' check (times in ('praca')),
  inicio date not null,
  fim date not null,
  criada_por text,
  criado_em timestamptz not null default now(),
  cancelada_em timestamptz,
  /* curta: até 2 semanas */
  constraint disputas_ate_2_semanas check (fim >= inicio and fim - inicio <= 13),
  /* uma por vez */
  constraint disputas_uma_por_vez exclude using gist (daterange(inicio, fim, '[]') with &&) where (cancelada_em is null)
);
comment on table public.disputas is
  'A disputa por praça: um comportamento que o cockpit já mede, até 2 semanas, uma por vez.';

create table if not exists public.auditorias_semana (
  segunda date primary key check (extract(isodow from segunda) = 1),
  auditada_em timestamptz not null default now(),
  auditada_por text,
  nota text
);
comment on table public.auditorias_semana is
  'A auditoria de sexta: o gestor conferiu as visitas da semana (as divergências dos combinados) antes do placar e do reconhecimento.';

create table if not exists public.previsoes_demo (
  deal_id text not null,
  mes date not null check (extract(day from mes) = 1),
  pessoa uuid not null default auth.uid() references auth.users(id),
  owner_id text,
  chance smallint not null check (chance between 0 and 100),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (deal_id, mes)
);
comment on table public.previsoes_demo is
  'A chance de fechar no mês dita pelo executivo depois da ficha de demo (previsão honesta). Não vai para o HubSpot.';

alter table public.disputas enable row level security;
alter table public.auditorias_semana enable row level security;
alter table public.previsoes_demo enable row level security;

/* disputa e auditoria: o time lê (é do time), só o gestor escreve */
drop policy if exists disputas_select on public.disputas;
create policy disputas_select on public.disputas for select using ((select auth.uid()) is not null);
drop policy if exists disputas_insert on public.disputas;
create policy disputas_insert on public.disputas for insert with check ((select public.eh_gestor_cockpit()));
drop policy if exists disputas_update on public.disputas;
create policy disputas_update on public.disputas for update
  using ((select public.eh_gestor_cockpit())) with check ((select public.eh_gestor_cockpit()));

drop policy if exists auditorias_semana_select on public.auditorias_semana;
create policy auditorias_semana_select on public.auditorias_semana for select using ((select auth.uid()) is not null);
drop policy if exists auditorias_semana_insert on public.auditorias_semana;
create policy auditorias_semana_insert on public.auditorias_semana for insert with check ((select public.eh_gestor_cockpit()));
drop policy if exists auditorias_semana_update on public.auditorias_semana;
create policy auditorias_semana_update on public.auditorias_semana for update
  using ((select public.eh_gestor_cockpit())) with check ((select public.eh_gestor_cockpit()));
/* DELETE existe para desfazer uma auditoria marcada por engano */
drop policy if exists auditorias_semana_delete on public.auditorias_semana;
create policy auditorias_semana_delete on public.auditorias_semana for delete using ((select public.eh_gestor_cockpit()));

/* a previsão é de quem disse: grava e corrige a própria; o gestor lê todas */
drop policy if exists previsoes_demo_select on public.previsoes_demo;
create policy previsoes_demo_select on public.previsoes_demo for select
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists previsoes_demo_insert on public.previsoes_demo;
create policy previsoes_demo_insert on public.previsoes_demo for insert with check (pessoa = (select auth.uid()));
drop policy if exists previsoes_demo_update on public.previsoes_demo;
create policy previsoes_demo_update on public.previsoes_demo for update
  using (pessoa = (select auth.uid())) with check (pessoa = (select auth.uid()));

revoke all on table public.disputas, public.auditorias_semana, public.previsoes_demo from anon, public;
grant select, insert, update on table public.disputas to authenticated;
grant select, insert, update, delete on table public.auditorias_semana to authenticated;
grant select, insert, update on table public.previsoes_demo to authenticated;
-- RLS nao protege TRUNCATE: os default privileges do Supabase dao TRUNCATE a authenticated.
revoke truncate, references, trigger on table public.disputas, public.auditorias_semana, public.previsoes_demo from authenticated;
grant all on table public.disputas, public.auditorias_semana, public.previsoes_demo to service_role;

/* O PLACAR DA DISPUTA (só o gestor): as disputas recentes, as auditorias e, por pessoa, as contagens de
   cada dia das últimas 6 semanas — o que cobre a disputa de 2 semanas, os 14 dias antes dela (onde
   cada praça começou) e a que acabou. Por dia, com a mesma régua dos 7 combinados:
     v  visitas (a mesma porta no mesmo dia é uma)    p  com prova (GPS no pino ou foto)
     cp com próximo passo e data                       nh com a ficha até 15 min depois do check-in
     f  fichas (porta por dia)                         o  fichas em que falou com quem decide
     m  demos (demo_realizada)                                                                     */
create or replace function public.disputa_quadro()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_de date := (now() at time zone 'America/Sao_Paulo')::date - 42;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_dias jsonb;
begin
  if auth.uid() is null or not coalesce((select public.eh_gestor_cockpit()), false) then
    return jsonb_build_object('erro', 'só o gestor');
  end if;
  for r in
    select e.profile_id as pessoa, p.id_hubspot as owner_id, coalesce(e.nome, p.full_name) as nome,
           coalesce(e.ramp_stage, '') = 'preparacao'
             or exists (select 1 from public.rampa_pessoas rp where rp.pessoa = e.profile_id and rp.encerrada_em is null) as em_rampa
      from public.equipe_cockpit e
      join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false)
     order by coalesce(e.nome, p.full_name)
  loop
    with portas as (
      select v.client_id, v.dia, min(v.visited_at) as em, bool_or(v.provada) as provada
        from public._visitas_com_prova(v_de, v_hoje, r.pessoa) v group by v.client_id, v.dia
    ), fx as (
      select f.client_id, (coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::date as dia,
             min(coalesce(f.ocorrido_em, f.criado_em)) as em,
             bool_or(f.proximo_em is not null or f.motivo_perdido is not null) as com_passo,
             bool_or(f.como_foi = 'falou_com_decisor') as dono
        from public.fichas_de_rua f
       where f.owner_id = r.owner_id
         and coalesce(f.ocorrido_em, f.criado_em) >= (v_de::timestamp at time zone 'America/Sao_Paulo')
         and coalesce(f.ocorrido_em, f.criado_em) < ((v_hoje + 1)::timestamp at time zone 'America/Sao_Paulo')
       group by 1, 2
    ), pv as (
      select pt.dia, count(*) as v, count(*) filter (where pt.provada) as p,
             count(*) filter (where fx.com_passo) as cp,
             count(*) filter (where fx.em is not null and fx.em <= pt.em + interval '15 minutes') as nh
        from portas pt left join fx on fx.client_id = pt.client_id and fx.dia = pt.dia
       group by pt.dia
    ), pf as (
      select fx.dia, count(*) as f, count(*) filter (where fx.dono) as o from fx group by fx.dia
    ), pm as (
      select (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date as dia, count(*) as m
        from public.pontos_eventos pe
       where pe.owner_id = r.owner_id and pe.tipo = 'demo_realizada'
         and coalesce(pe.ref_em, pe.criado_em) >= (v_de::timestamp at time zone 'America/Sao_Paulo')
         and coalesce(pe.ref_em, pe.criado_em) < ((v_hoje + 1)::timestamp at time zone 'America/Sao_Paulo')
       group by 1
    ), d as (
      select g::date as dia from generate_series(v_de, v_hoje, interval '1 day') g
    )
    select coalesce(jsonb_agg(jsonb_build_object('d', d.dia, 'v', coalesce(pv.v, 0), 'p', coalesce(pv.p, 0), 'cp', coalesce(pv.cp, 0),
             'nh', coalesce(pv.nh, 0), 'f', coalesce(pf.f, 0), 'o', coalesce(pf.o, 0), 'm', coalesce(pm.m, 0)) order by d.dia)
             filter (where pv.dia is not null or pf.dia is not null or pm.dia is not null), '[]'::jsonb)
      into v_dias
      from d left join pv on pv.dia = d.dia left join pf on pf.dia = d.dia left join pm on pm.dia = d.dia;

    v_out := v_out || jsonb_build_array(jsonb_build_object('pessoa', r.pessoa, 'ownerId', r.owner_id, 'nome', r.nome, 'emRampa', r.em_rampa, 'dias', v_dias));
  end loop;
  return jsonb_build_object('hoje', v_hoje, 'de', v_de,
    'disputas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'taxa', x.taxa, 'times', x.times, 'inicio', x.inicio, 'fim', x.fim,
                   'criadaPor', x.criada_por) order by x.inicio desc)
                 from public.disputas x where x.cancelada_em is null and x.fim >= v_hoje - 35), '[]'::jsonb),
    'auditorias', coalesce((select jsonb_agg(jsonb_build_object('segunda', a.segunda, 'em', a.auditada_em, 'por', a.auditada_por, 'nota', a.nota) order by a.segunda desc)
                 from public.auditorias_semana a where a.segunda >= v_hoje - 56), '[]'::jsonb),
    'pessoas', v_out, 'lidoEm', now());
end;
$function$;
revoke all on function public.disputa_quadro() from anon, public;
grant execute on function public.disputa_quadro() to authenticated;

/* A PREVISÃO HONESTA DO MÊS: por pessoa, as demos do mês (uma por negócio), quantas tiveram a chance
   dita no app, a soma das chances ditas e quantas viraram cliente no próprio mês (contrato menos estorno
   do mesmo negócio). O time é a soma sem quem está em rampa; convAnterior é a conversão de demo em
   cliente do time no mês anterior, o que vale para a demo em que ninguém disse a chance (handoff).
   O gestor recebe todo mundo; o executivo, a própria linha e o time (o "seu acerto" do app). */
create or replace function public.previsao_honesta(p_mes date default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_gestor boolean := coalesce((select public.eh_gestor_cockpit()), false);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date))::date;
  v_ant date := (date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date)) - interval '1 month')::date;
  v_out jsonb := '[]'::jsonb;
  v_t_demos int := 0; v_t_ditas int := 0; v_t_soma int := 0; v_t_fech int := 0;
  v_a_demos int := 0; v_a_cli int := 0;
  r record;
  x record;
  y record;
begin
  if auth.uid() is null then
    return jsonb_build_object('erro', 'sem sessão');
  end if;
  for r in
    select e.profile_id as pessoa, p.id_hubspot as owner_id, coalesce(e.nome, p.full_name) as nome,
           coalesce(e.ramp_stage, '') = 'preparacao'
             or exists (select 1 from public.rampa_pessoas rp where rp.pessoa = e.profile_id and rp.encerrada_em is null) as em_rampa
      from public.equipe_cockpit e
      join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false)
     order by coalesce(e.nome, p.full_name)
  loop
    with dem as (
      select pe.negocio_id as deal
        from public.pontos_eventos pe
       where pe.owner_id = r.owner_id and pe.tipo = 'demo_realizada' and pe.negocio_id is not null
         and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date >= v_mes
         and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date < (v_mes + interval '1 month')::date
       group by pe.negocio_id
    ), j as (
      select dem.deal, pd.chance,
             (select count(*) filter (where c.tipo = 'contrato') - count(*) filter (where c.tipo = 'estorno')
                from public.pontos_eventos c
               where c.negocio_id = dem.deal and c.tipo in ('contrato', 'estorno')
                 and (coalesce(c.ref_em, c.criado_em) at time zone 'America/Sao_Paulo')::date >= v_mes
                 and (coalesce(c.ref_em, c.criado_em) at time zone 'America/Sao_Paulo')::date < (v_mes + interval '1 month')::date) > 0 as fechou
        from dem left join public.previsoes_demo pd on pd.deal_id = dem.deal::text and pd.mes = v_mes
    )
    select count(*) as demos, count(j.chance) as ditas, coalesce(sum(j.chance), 0) as soma,
           count(*) filter (where j.fechou) as fecharam,
           coalesce(sum(j.chance) filter (where j.fechou), 0) as soma_fecharam,
           count(*) filter (where j.chance is not null and j.fechou) as ditas_fecharam
      into x from j;

    /* a conversão do mês anterior: clientes ÷ demos, a régua do "Fechar" da habilidade do mês */
    select count(*) filter (where pe.tipo = 'demo_realizada') as demos,
           count(*) filter (where pe.tipo = 'contrato') - count(*) filter (where pe.tipo = 'estorno' and pe.negocio_id is not null) as cli
      into y
      from public.pontos_eventos pe
     where pe.owner_id = r.owner_id and pe.tipo in ('demo_realizada', 'contrato', 'estorno')
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date >= v_ant
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date < v_mes;

    if not r.em_rampa then
      v_t_demos := v_t_demos + x.demos; v_t_ditas := v_t_ditas + x.ditas; v_t_soma := v_t_soma + x.soma; v_t_fech := v_t_fech + x.fecharam;
      v_a_demos := v_a_demos + y.demos; v_a_cli := v_a_cli + greatest(y.cli, 0);
    end if;
    if v_gestor or r.pessoa = auth.uid() then
      v_out := v_out || jsonb_build_array(jsonb_build_object('pessoa', r.pessoa, 'ownerId', r.owner_id, 'nome', r.nome, 'emRampa', r.em_rampa,
        'demos', x.demos, 'ditas', x.ditas, 'somaDita', x.soma, 'fecharam', x.fecharam, 'ditasFecharam', x.ditas_fecharam));
    end if;
  end loop;
  return jsonb_build_object('mes', v_mes, 'anterior', v_ant, 'hoje', v_hoje, 'gestor', v_gestor,
    'time', jsonb_build_object('demos', v_t_demos, 'ditas', v_t_ditas, 'somaDita', v_t_soma, 'fecharam', v_t_fech),
    'convAnterior', case when v_a_demos > 0 then round(v_a_cli * 100.0 / v_a_demos) else null end,
    'pessoas', v_out, 'lidoEm', now());
end;
$function$;
revoke all on function public.previsao_honesta(date) from anon, public;
grant execute on function public.previsao_honesta(date) to authenticated;
