-- 0233 · A habilidade do mês (handoff "Acelerar Field Sales v2", telas 3a a 3d)
--
-- Uma habilidade por mês e por pessoa, escolhida pelo número, entre 4 taxas:
--   dono    Sair com o dono   fichas em que falou com quem decide ÷ fichas (a mesma porta no mesmo dia conta uma vez)
--   demo    Virar demo        demos (demo_realizada) ÷ visitas com prova
--   fechar  Fechar            clientes (contrato − estorno do negócio) ÷ demos
--   volume  Volume            visitas com prova por semana (dias úteis do mês ÷ 5)
-- Os contratos do livro de pontos são as vendas oficiais do HubSpot (vendasMes, com a competência):
-- em 31/10 batiam pessoa a pessoa. Nada aqui lê ou escreve no HubSpot.
--
-- POR QUE DIA A DIA. O quadro devolve as contagens de cada dia do mês anterior e do mês corrente, e a
-- tela soma: o mês (antes e agora), as semanas (3a e 3b) e a média do time saem da mesma linha.
-- A média do time é do time inteiro (soma ÷ soma), sem quem está em rampa (rampa_pessoas aberta ou
-- equipe_cockpit.ramp_stage = 'preparacao', o mesmo "em rampagem" do cockpit): o executivo recebe a
-- própria linha e a média do time, nunca a linha de outra pessoa.
--
-- O antes e a meta ficam GRAVADOS em habilidades_mes no dia em que a habilidade é combinada: o mês
-- anterior não muda depois disso, e a meta é decisão do 1:1. O veredito é gravado pelo gestor no fim
-- do mês (Próxima habilidade / Mudar o plano), com o valor que a tela mostrava.

create table if not exists public.habilidades_mes (
  pessoa uuid not null references auth.users(id),
  mes date not null check (extract(day from mes) = 1),
  taxa text not null check (taxa in ('dono', 'demo', 'fechar', 'volume')),
  antes numeric,
  meta numeric not null check (meta >= 0),
  como_treinar text,
  combinada_em date not null,
  combinada_por text,
  veredito text check (veredito in ('melhorou', 'subiu', 'nao_melhorou')),
  veredito_valor numeric,
  veredito_em date,
  veredito_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (pessoa, mes)
);
comment on table public.habilidades_mes is
  'A habilidade do mês de cada pessoa: a taxa, o antes (mês anterior), a meta, como treinar e o veredito do fim do mês.';

alter table public.habilidades_mes enable row level security;

/* a pessoa lê a própria (o cartão Meu desempenho do app); só o gestor escreve (conferido no servidor) */
drop policy if exists habilidades_mes_select on public.habilidades_mes;
create policy habilidades_mes_select on public.habilidades_mes for select
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists habilidades_mes_insert on public.habilidades_mes;
create policy habilidades_mes_insert on public.habilidades_mes for insert
  with check ((select public.eh_gestor_cockpit()));
drop policy if exists habilidades_mes_update on public.habilidades_mes;
create policy habilidades_mes_update on public.habilidades_mes for update
  using ((select public.eh_gestor_cockpit())) with check ((select public.eh_gestor_cockpit()));
/* DELETE existe para desfazer uma habilidade combinada por engano */
drop policy if exists habilidades_mes_delete on public.habilidades_mes;
create policy habilidades_mes_delete on public.habilidades_mes for delete
  using ((select public.eh_gestor_cockpit()));

revoke all on table public.habilidades_mes from anon, public;
grant select, insert, update, delete on table public.habilidades_mes to authenticated;
-- RLS nao protege TRUNCATE: os default privileges do Supabase dao TRUNCATE a authenticated.
revoke truncate, references, trigger on table public.habilidades_mes from authenticated;
grant all on table public.habilidades_mes to service_role;

/* O QUADRO DA HABILIDADE (mês de p_mes; sem ele, o mês corrente, e o anterior junto).
   Por pessoa: os dias com alguma contagem (d, p = visitas com prova, f = fichas, o = com o dono,
   m = demos, c = clientes), se está em rampa, a habilidade deste mês, a do anterior e a do seguinte,
   e o último 1:1.
   O time: as somas de cada mês e quantas pessoas visitaram, sem quem está em rampa. */
create or replace function public.habilidade_quadro(p_mes date default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_gestor boolean := coalesce((select public.eh_gestor_cockpit()), false);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', coalesce(p_mes, v_hoje))::date;
  v_ant date := (v_mes - interval '1 month')::date;
  v_fim date := (v_mes + interval '1 month' - interval '1 day')::date;
  v_ate date := least((v_mes + interval '1 month' - interval '1 day')::date, v_hoje);
  v_out jsonb := '[]'::jsonb;
  v_time jsonb := jsonb_build_object(
    'anterior', jsonb_build_object('p', 0, 'f', 0, 'o', 0, 'm', 0, 'c', 0, 'pessoas', 0),
    'atual', jsonb_build_object('p', 0, 'f', 0, 'o', 0, 'm', 0, 'c', 0, 'pessoas', 0));
  r record;
  v_dias jsonb;
  v_rampa boolean;
  v_tot jsonb;
  k text;
begin
  if auth.uid() is null then
    return jsonb_build_object('erro', 'sem sessão');
  end if;

  for r in
    select e.profile_id as pessoa, p.id_hubspot as owner_id, coalesce(e.nome, p.full_name) as nome, e.ramp_stage
      from public.equipe_cockpit e
      join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false)
     order by coalesce(e.nome, p.full_name)
  loop
    with portas as (
      select v.dia, count(distinct v.client_id) as n
        from public._visitas_com_prova(v_ant, v_ate, r.pessoa) v
       where v.provada
       group by v.dia
    ), fichas as (
      select x.dia, count(*) as f, count(*) filter (where x.dono) as o
        from (select f.client_id, (coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::date as dia,
                     bool_or(f.como_foi = 'falou_com_decisor') as dono
                from public.fichas_de_rua f
               where f.owner_id = r.owner_id
                 and coalesce(f.ocorrido_em, f.criado_em) >= (v_ant::timestamp at time zone 'America/Sao_Paulo')
                 and coalesce(f.ocorrido_em, f.criado_em) < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
               group by 1, 2) x
       group by x.dia
    ), pontos as (
      select (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date as dia,
             count(*) filter (where pe.tipo = 'demo_realizada') as m,
             count(*) filter (where pe.tipo = 'contrato') - count(*) filter (where pe.tipo = 'estorno' and pe.negocio_id is not null) as c
        from public.pontos_eventos pe
       where pe.owner_id = r.owner_id and pe.tipo in ('demo_realizada', 'contrato', 'estorno')
         and coalesce(pe.ref_em, pe.criado_em) >= (v_ant::timestamp at time zone 'America/Sao_Paulo')
         and coalesce(pe.ref_em, pe.criado_em) < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
       group by 1
    ), d as (
      select g::date as dia from generate_series(v_ant, v_ate, interval '1 day') g
    ), j as (
      select d.dia, coalesce(pt.n, 0) as p, coalesce(fi.f, 0) as f, coalesce(fi.o, 0) as o, coalesce(po.m, 0) as m, coalesce(po.c, 0) as c
        from d left join portas pt on pt.dia = d.dia left join fichas fi on fi.dia = d.dia left join pontos po on po.dia = d.dia
    )
    select coalesce(jsonb_agg(jsonb_build_object('d', j.dia, 'p', j.p, 'f', j.f, 'o', j.o, 'm', j.m, 'c', j.c) order by j.dia)
                      filter (where j.p + j.f + j.o + j.m + j.c <> 0), '[]'::jsonb),
           jsonb_build_object(
             'anterior', jsonb_build_object('p', coalesce(sum(j.p) filter (where j.dia < v_mes), 0), 'f', coalesce(sum(j.f) filter (where j.dia < v_mes), 0),
                           'o', coalesce(sum(j.o) filter (where j.dia < v_mes), 0), 'm', coalesce(sum(j.m) filter (where j.dia < v_mes), 0),
                           'c', coalesce(sum(j.c) filter (where j.dia < v_mes), 0)),
             'atual', jsonb_build_object('p', coalesce(sum(j.p) filter (where j.dia >= v_mes), 0), 'f', coalesce(sum(j.f) filter (where j.dia >= v_mes), 0),
                           'o', coalesce(sum(j.o) filter (where j.dia >= v_mes), 0), 'm', coalesce(sum(j.m) filter (where j.dia >= v_mes), 0),
                           'c', coalesce(sum(j.c) filter (where j.dia >= v_mes), 0)))
      into v_dias, v_tot
      from j;

    v_rampa := coalesce(r.ramp_stage, '') = 'preparacao'
      or exists (select 1 from public.rampa_pessoas rp where rp.pessoa = r.pessoa and rp.encerrada_em is null);

    /* a média do time: soma ÷ soma, sem quem está em rampa; "pessoas" = quem teve visita com prova no mês */
    if not v_rampa then
      foreach k in array array['anterior', 'atual'] loop
        v_time := jsonb_set(v_time, array[k], jsonb_build_object(
          'p', (v_time -> k ->> 'p')::int + (v_tot -> k ->> 'p')::int,
          'f', (v_time -> k ->> 'f')::int + (v_tot -> k ->> 'f')::int,
          'o', (v_time -> k ->> 'o')::int + (v_tot -> k ->> 'o')::int,
          'm', (v_time -> k ->> 'm')::int + (v_tot -> k ->> 'm')::int,
          'c', (v_time -> k ->> 'c')::int + (v_tot -> k ->> 'c')::int,
          'pessoas', (v_time -> k ->> 'pessoas')::int + case when (v_tot -> k ->> 'p')::int > 0 then 1 else 0 end));
      end loop;
    end if;

    if v_gestor or r.pessoa = auth.uid() then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'pessoa', r.pessoa, 'ownerId', r.owner_id, 'nome', r.nome, 'emRampa', v_rampa,
        'dias', v_dias, 'total', v_tot,
        'habilidade', (select jsonb_build_object('taxa', h.taxa, 'antes', h.antes, 'meta', h.meta, 'comoTreinar', h.como_treinar,
                         'combinadaEm', h.combinada_em, 'combinadaPor', h.combinada_por, 'veredito', h.veredito, 'vereditoValor', h.veredito_valor, 'vereditoEm', h.veredito_em)
                       from public.habilidades_mes h where h.pessoa = r.pessoa and h.mes = v_mes),
        'habilidadeAnterior', (select jsonb_build_object('taxa', h.taxa, 'antes', h.antes, 'meta', h.meta, 'comoTreinar', h.como_treinar,
                         'combinadaEm', h.combinada_em, 'combinadaPor', h.combinada_por, 'veredito', h.veredito, 'vereditoValor', h.veredito_valor, 'vereditoEm', h.veredito_em)
                       from public.habilidades_mes h where h.pessoa = r.pessoa and h.mes = v_ant),
        /* a do mês seguinte: no fim do mês, "Próxima habilidade" já combinada some do botão */
        'habilidadeSeguinte', (select jsonb_build_object('taxa', h.taxa, 'antes', h.antes, 'meta', h.meta, 'comoTreinar', h.como_treinar,
                         'combinadaEm', h.combinada_em, 'combinadaPor', h.combinada_por)
                       from public.habilidades_mes h where h.pessoa = r.pessoa and h.mes = (v_mes + interval '1 month')::date),
        'ultimoUmAUm', (select max(u.data) from public.um_a_um u where u.owner_id = r.owner_id and u.data <= v_hoje)
      ));
    end if;
  end loop;

  return jsonb_build_object('mes', v_mes, 'anterior', v_ant, 'fim', v_fim, 'ate', v_ate, 'hoje', v_hoje, 'gestor', v_gestor,
    'ultimoUmAUmTime', (select max(u.data) from public.um_a_um u where u.data <= v_hoje),
    'time', v_time, 'pessoas', v_out, 'lidoEm', now());
end;
$function$;

revoke all on function public.habilidade_quadro(date) from anon, public;
grant execute on function public.habilidade_quadro(date) to authenticated;
