-- 0240 · Desenvolvimento v2, o jogo da carreira (handoff de 01/11/26, design_handoff_desenvolvimento_v2)
--
-- "Eu tenho certeza que ninguém clica na aba Desenvolvimento. Tem que gamificar." A tela responde em 5 s:
-- onde eu estou, o que eu ganho a seguir e quanto falta. O app (Meu desempenho) e o Cockpit (aba
-- Desenvolvimento do executivo) leem a MESMA função, desenvolvimento_quadro(); cada lado só formata
-- (supabase/functions/_compartilhado/desenvolvimentoV2.ts no app, DV2 no gv2-js do Cockpit, testados com
-- a mesma fixture e a mesma saída esperada).
--
-- POR QUE UMA FUNÇÃO SÓ. Os dois repositórios não importam um do outro. Se cada lado juntasse os
-- blocos sozinho (placar, sequências, variável, habilidade, rampa, líder), a regra de paridade
-- ("o que a pessoa vê no celular, vê igual no computador") dependeria de duas montagens andarem
-- juntas. Aqui elas não andam separadas: os números saem prontos do banco, e o que os lados fazem
-- é só texto e layout.
--
-- Regras do handoff que moram aqui:
--   · ponto só nasce de prova: o placar é pontos_da_semana() (0191), sem mudança; a medalha nasce da
--     visita com prova (_visitas_com_prova), do HubSpot (pontos_eventos) ou do que o gestor gravou
--     (habilidades_mes, rampa_fases, auditorias_semana). Abrir a tela, ler ou clicar não grava ponto;
--   · feriado e fim de semana não quebram sequência nem missão: tudo passa por eh_dia_util() (0239);
--   · ninguém é exposto como pior: devolve só o pódio (top 3), quem está logo acima e a própria linha;
--   · novato (rampa aberta) não compete em degrau: o placar dele é "você contra você";
--   · fonte fora do ar: cada bloco roda num begin/exception e, se cair, vem null com o nome da fonte em
--     "fontes" — a tela mostra "—" e o nome, nunca 0.
--
-- Tabelas novas:
--   missoes_semana       a missão da semana de cada pessoa, escolhida uma vez (na 1ª leitura da semana)
--                        pelo hábito de maior distância para o time na semana anterior, e o dia em que
--                        a prova a fechou. Escolher uma vez é o que impede a missão de trocar no meio da
--                        semana quando o time muda.
--   conquistas_ganhas    a medalha e o DIA em que nasceu ("ganha em 24/10"). É gravada aqui, quando a
--                        prova aparece, e nunca apagada: a sequência que quebra depois não tira a medalha.
--   conquistas_vistas    a pessoa viu a conquista nova (toast ou coleção): some o selo "1 nova" do menu.
--   aberturas_de_tela    quem abriu o Meu desempenho (app) e a Desenvolvimento (Cockpit), quando e por
--                        onde (toast, pílula, push_seg, push_sex, menu, selo_menu). É a medição do aceite.
-- Nada aqui lê ou escreve no HubSpot. NÃO APLICADA: entra pelo fluxo de migrations de sempre.

-- ── as tabelas ───────────────────────────────────────────────────────────────────────────────

create table if not exists public.missoes_semana (
  pessoa uuid not null references auth.users(id),
  segunda date not null check (extract(isodow from segunda) = 1),
  missao text not null check (missao in ('porta', 'fila', 'naHora', 'dono', 'novato')),
  alvo smallint not null check (alvo between 1 and 5),
  escolhida_em timestamptz not null default now(),
  /* o porquê da escolha (as taxas da semana anterior, minha e do time), para o gestor conferir */
  motivo jsonb not null default '{}'::jsonb,
  cumprida_em date,
  primary key (pessoa, segunda)
);
comment on table public.missoes_semana is
  'A missão da semana (Desenvolvimento v2): escolhida uma vez por semana pelo hábito de maior distância para o time, fechada pela prova.';

create table if not exists public.conquistas_ganhas (
  pessoa uuid not null references auth.users(id),
  conquista text not null check (length(conquista) between 3 and 120),
  ganha_em date not null,
  detalhe jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  primary key (pessoa, conquista)
);
comment on table public.conquistas_ganhas is
  'As medalhas do Desenvolvimento v2 e o dia em que cada uma nasceu da prova. Gravadas só pelo servidor.';

create table if not exists public.conquistas_vistas (
  pessoa uuid not null default auth.uid() references auth.users(id),
  conquista text not null check (length(conquista) between 3 and 120),
  vista_em timestamptz not null default now(),
  onde text check (onde in ('toast', 'colecao', 'menu')),
  primary key (pessoa, conquista)
);
comment on table public.conquistas_vistas is
  'A pessoa viu a conquista nova (toast ou coleção). Desliga o selo "1 nova" do menu do Cockpit.';

create table if not exists public.aberturas_de_tela (
  id bigint generated always as identity primary key,
  pessoa uuid not null default auth.uid() references auth.users(id),
  tela text not null check (tela in ('meu_desempenho', 'desenvolvimento')),
  origem text not null check (origem in ('toast', 'pilula', 'push_seg', 'push_sex', 'menu', 'selo_menu')),
  quando timestamptz not null default now()
);
create index if not exists aberturas_de_tela_pessoa_quando on public.aberturas_de_tela (pessoa, quando desc);
comment on table public.aberturas_de_tela is
  'Medição do Desenvolvimento v2: cada abertura do Meu desempenho (app) e da Desenvolvimento (Cockpit), com a origem.';

alter table public.missoes_semana enable row level security;
alter table public.conquistas_ganhas enable row level security;
alter table public.conquistas_vistas enable row level security;
alter table public.aberturas_de_tela enable row level security;

/* missão e medalha: cada um lê as suas; o gestor lê todas. Ninguém escreve pelo cliente: quem grava é
   desenvolvimento_quadro() (security definer), com a prova na mão. */
drop policy if exists missoes_semana_select on public.missoes_semana;
create policy missoes_semana_select on public.missoes_semana for select to authenticated
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists conquistas_ganhas_select on public.conquistas_ganhas;
create policy conquistas_ganhas_select on public.conquistas_ganhas for select to authenticated
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));

/* vista e abertura: cada um grava e lê as suas; o gestor lê todas (o selo "abriu esta semana") */
drop policy if exists conquistas_vistas_select on public.conquistas_vistas;
create policy conquistas_vistas_select on public.conquistas_vistas for select to authenticated
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists conquistas_vistas_insert on public.conquistas_vistas;
create policy conquistas_vistas_insert on public.conquistas_vistas for insert to authenticated
  with check (pessoa = (select auth.uid()));
drop policy if exists aberturas_de_tela_select on public.aberturas_de_tela;
create policy aberturas_de_tela_select on public.aberturas_de_tela for select to authenticated
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists aberturas_de_tela_insert on public.aberturas_de_tela;
create policy aberturas_de_tela_insert on public.aberturas_de_tela for insert to authenticated
  with check (pessoa = (select auth.uid()));

revoke all on table public.missoes_semana, public.conquistas_ganhas, public.conquistas_vistas, public.aberturas_de_tela from anon, public;
grant select on table public.missoes_semana, public.conquistas_ganhas to authenticated;
grant select, insert on table public.conquistas_vistas, public.aberturas_de_tela to authenticated;
-- RLS nao protege TRUNCATE: os default privileges do Supabase dao TRUNCATE a authenticated.
revoke truncate, references, trigger on table public.missoes_semana, public.conquistas_ganhas, public.conquistas_vistas, public.aberturas_de_tela from authenticated;
grant all on table public.missoes_semana, public.conquistas_ganhas, public.conquistas_vistas, public.aberturas_de_tela to service_role;

-- ── os ajudantes ─────────────────────────────────────────────────────────────────────────────

/* o nome do feriado, para a nota "qui 20/11 (Consciência Negra) não apagou a sua sequência" */
create or replace function public._dv2_nome_feriado(p_dia date)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when not public.eh_feriado_nacional(p_dia) then null
    when to_char(p_dia, 'MM-DD') = '01-01' then 'Ano Novo'
    when to_char(p_dia, 'MM-DD') = '04-21' then 'Tiradentes'
    when to_char(p_dia, 'MM-DD') = '05-01' then 'Dia do Trabalho'
    when to_char(p_dia, 'MM-DD') = '09-07' then 'Independência'
    when to_char(p_dia, 'MM-DD') = '10-12' then 'Nossa Senhora Aparecida'
    when to_char(p_dia, 'MM-DD') = '11-02' then 'Finados'
    when to_char(p_dia, 'MM-DD') = '11-15' then 'Proclamação da República'
    when to_char(p_dia, 'MM-DD') = '11-20' then 'Consciência Negra'
    when to_char(p_dia, 'MM-DD') = '12-25' then 'Natal'
    when p_dia = public.pascoa(extract(year from p_dia)::int) - 2 then 'Sexta-feira Santa'
    when p_dia = public.pascoa(extract(year from p_dia)::int) + 60 then 'Corpus Christi'
    else 'Carnaval'
  end
$function$;

/* o recorde de uma sequência de dias úteis: o "dia seguinte" esperado é o próximo dia útil, a mesma
   regra da sequencia_da_fila_zerada (0239) — de sexta para segunda, e por cima do feriado */
create or replace function public._dv2_recorde_util(p_dias date[])
 returns integer
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare v_d date; v_ant date := null; v_run int := 0; v_max int := 0;
begin
  for v_d in select distinct x from unnest(coalesce(p_dias, '{}'::date[])) x where public.eh_dia_util(x) order by 1 loop
    if v_ant is not null and v_d = public.proximo_dia_util(v_ant) then v_run := v_run + 1; else v_run := 1; end if;
    v_max := greatest(v_max, v_run);
    v_ant := v_d;
  end loop;
  return v_max;
end $function$;

/* o PRIMEIRO dia em que uma sequência de dias úteis chegou a p_n: é a data da medalha ("ganha em") */
create or replace function public._dv2_dia_da_sequencia(p_dias date[], p_n int)
 returns date
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare v_d date; v_ant date := null; v_run int := 0;
begin
  for v_d in select distinct x from unnest(coalesce(p_dias, '{}'::date[])) x where public.eh_dia_util(x) order by 1 loop
    if v_ant is not null and v_d = public.proximo_dia_util(v_ant) then v_run := v_run + 1; else v_run := 1; end if;
    if v_run >= p_n then return v_d; end if;
    v_ant := v_d;
  end loop;
  return null;
end $function$;

/* AS PORTAS DE CADA DIA, com a régua dos 7 combinados (combinados_quadro, 0238): a mesma porta no mesmo
   dia é uma; com prova = GPS no pino ou foto; na hora = ficha até 15 min depois do check-in; dono
   ausente = ficha sem Dono/Sócio e sem motivo de perdido; volta marcada = horário do dono ou próximo
   passo de visita/reunião. É daqui que saem a missão (escolha e progresso) e o destaque da sexta. */
create or replace function public._dv2_portas(p_pessoa uuid, p_owner text, p_de date, p_ate date)
 returns table (dia date, portas int, provadas int, na_hora int, ausentes int, voltas int)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with portas as (
    select v.client_id, v.dia, min(v.visited_at) as em, bool_or(v.provada) as provada
      from public._visitas_com_prova(p_de, p_ate, p_pessoa) v
     group by v.client_id, v.dia
  ), fx as (
    select f.client_id, (coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::date as dia,
           min(coalesce(f.ocorrido_em, f.criado_em)) as em
      from public.fichas_de_rua f
     where f.owner_id = p_owner
       and coalesce(f.ocorrido_em, f.criado_em) >= (p_de::timestamp at time zone 'America/Sao_Paulo')
       and coalesce(f.ocorrido_em, f.criado_em) < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
     group by 1, 2
  ), pv as (
    select pt.dia, count(*)::int as portas, count(*) filter (where pt.provada)::int as provadas,
           count(*) filter (where fx.em is not null and fx.em <= pt.em + interval '15 minutes')::int as na_hora
      from portas pt left join fx on fx.client_id = pt.client_id and fx.dia = pt.dia
     group by pt.dia
  ), au as (
    select (coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::date as dia,
           count(*) filter (where coalesce(f.decisor_papel, '') not in ('Dono', 'Sócio') and f.motivo_perdido is null)::int as ausentes,
           count(*) filter (where coalesce(f.decisor_papel, '') not in ('Dono', 'Sócio') and f.motivo_perdido is null
             and (nullif(btrim(coalesce(f.horario_dono, '')), '') is not null or (f.proximo_em is not null and f.proximo_tipo in ('visita', 'reuniao'))))::int as voltas
      from public.fichas_de_rua f
     where f.owner_id = p_owner
       and coalesce(f.ocorrido_em, f.criado_em) >= (p_de::timestamp at time zone 'America/Sao_Paulo')
       and coalesce(f.ocorrido_em, f.criado_em) < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
     group by 1
  )
  select coalesce(pv.dia, au.dia), coalesce(pv.portas, 0), coalesce(pv.provadas, 0), coalesce(pv.na_hora, 0),
         coalesce(au.ausentes, 0), coalesce(au.voltas, 0)
    from pv full join au on au.dia = pv.dia;
$function$;
revoke all on function public._dv2_portas(uuid, text, date, date) from public, anon, authenticated;

/* OS 4 CRITÉRIOS DE LÍDER DE UMA PESSOA. Era o corpo do laço de lider_quadro() (0235), que só o gestor
   recebe; o Desenvolvimento v2 mostra os critérios ao próprio executivo ("hoje só o gestor vê"). Para
   os dois não divergirem, o corpo virou esta função e o lider_quadro() passa a chamá-la, sem mudar o
   que devolve. */
create or replace function public._lider_pessoa(p_pessoa uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_de date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '3 months')::date;
  r record;
  v_meses jsonb;
  v_conv jsonb;
begin
  select e.profile_id as pessoa, p.id_hubspot as owner_id, coalesce(e.nome, p.full_name) as nome, e.criado_em,
         coalesce(e.ramp_stage, '') = 'preparacao'
           or exists (select 1 from public.rampa_pessoas rp where rp.pessoa = e.profile_id and rp.encerrada_em is null) as em_rampa
    into r
    from public.equipe_cockpit e
    join public.profiles p on p.id = e.profile_id
   where e.profile_id = p_pessoa;
  if r.pessoa is null then return null; end if;

  /* visitas com prova por mês: os 3 fechados e o corrente (a mesma porta no mesmo dia conta uma vez) */
  with v as (
    select distinct x.client_id, x.dia from public._visitas_com_prova(v_de, v_hoje, r.pessoa) x where x.provada
  ), m as (
    select date_trunc('month', v.dia)::date as mes, count(*) as n from v group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('mes', g::date, 'provadas', coalesce(m.n, 0),
           'uteis', (select count(*) from generate_series(g::date, least((g + interval '1 month' - interval '1 day')::date, v_hoje), interval '1 day') d
                      where public.eh_dia_util(d::date))) order by g), '[]'::jsonb)
    into v_meses
    from generate_series(v_de, v_mes, interval '1 month') g left join m on m.mes = g::date;

  /* demos e clientes nos 3 meses fechados */
  select jsonb_build_object(
           'demos', count(*) filter (where pe.tipo = 'demo_realizada'),
           'clientes', greatest(count(*) filter (where pe.tipo = 'contrato') - count(*) filter (where pe.tipo = 'estorno' and pe.negocio_id is not null), 0))
    into v_conv
    from public.pontos_eventos pe
   where pe.owner_id = r.owner_id and pe.tipo in ('demo_realizada', 'contrato', 'estorno')
     and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date >= v_de
     and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date < v_mes;

  return jsonb_build_object(
    'pessoa', r.pessoa, 'ownerId', r.owner_id, 'nome', r.nome, 'emRampa', r.em_rampa, 'desde', (r.criado_em at time zone 'America/Sao_Paulo')::date,
    'meses', v_meses, 'conv', v_conv,
    'registro', (select jsonb_build_object('n', count(*), 'ultima', max(o.dia))
                   from public.ocorrencias o where o.pessoa = r.pessoa and (o.combinado = 5 or o.registro_falso)),
    'afilhados', coalesce((select jsonb_agg(jsonb_build_object(
                   'pessoa', rp.pessoa, 'nome', coalesce(ea.nome, pa.full_name), 'inicio', rp.inicio, 'turma', rp.turma, 'encerradaEm', rp.encerrada_em,
                   'fases', coalesce((select jsonb_object_agg(f.fase, jsonb_build_object('aprovadaEm', f.aprovada_em, 'estendidaAte', f.estendida_ate))
                                        from public.rampa_fases f where f.pessoa = rp.pessoa), '{}'::jsonb),
                   'decisao', (select jsonb_build_object('decisao', d.decisao, 'novaData', d.nova_data) from public.rampa_decisao_d45 d where d.pessoa = rp.pessoa))
                   order by rp.turma desc)
                 from public.rampa_pessoas rp
                 join public.profiles pa on pa.id = rp.pessoa
                 left join public.equipe_cockpit ea on ea.profile_id = rp.pessoa
                where rp.padrinho = r.pessoa), '[]'::jsonb));
end;
$function$;
revoke all on function public._lider_pessoa(uuid) from public, anon, authenticated;

/* lider_quadro() continua só do gestor e devolve o mesmo de antes (0235), agora pelo corpo único.
   ("uteis" por mês é campo novo e não atrapalha quem já lê.) */
create or replace function public.lider_quadro()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_de date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '3 months')::date;
  v_out jsonb := '[]'::jsonb;
  r record;
begin
  if auth.uid() is null or not coalesce((select public.eh_gestor_cockpit()), false) then
    return jsonb_build_object('erro', 'só o gestor');
  end if;
  for r in
    select e.profile_id as pessoa
      from public.equipe_cockpit e
      join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false)
     order by coalesce(e.nome, p.full_name)
  loop
    v_out := v_out || jsonb_build_array(public._lider_pessoa(r.pessoa));
  end loop;
  return jsonb_build_object('hoje', v_hoje, 'mes', v_mes, 'de', v_de, 'pessoas', v_out, 'lidoEm', now());
end;
$function$;
revoke all on function public.lider_quadro() from anon, public;
grant execute on function public.lider_quadro() to authenticated;

/* grava a medalha uma vez (o dia em que nasceu não muda) */
create or replace function public._dv2_ganhar(p_pessoa uuid, p_conquista text, p_dia date, p_detalhe jsonb default '{}'::jsonb)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.conquistas_ganhas (pessoa, conquista, ganha_em, detalhe)
  select p_pessoa, p_conquista, p_dia, coalesce(p_detalhe, '{}'::jsonb)
   where p_pessoa is not null and p_conquista is not null and p_dia is not null
  on conflict (pessoa, conquista) do nothing;
$function$;
revoke all on function public._dv2_ganhar(uuid, text, date, jsonb) from public, anon, authenticated;

-- ── O QUADRO ─────────────────────────────────────────────────────────────────────────────────
/* _desenvolvimento_de(pessoa): todos os blocos da tela para uma pessoa. Interna (o push-fila chama com
   a service role); o app e o Cockpit chamam desenvolvimento_quadro(), que confere quem pode ver quem.
   Cada bloco é um begin/exception: o que cair vira null e o nome da fonte vai para "fontes". */
create or replace function public._desenvolvimento_de(p_pessoa uuid)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := p_pessoa;
  v_eu_mesmo boolean := (p_pessoa = (select auth.uid()));
  v_agora timestamptz := now();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_hora time := (now() at time zone 'America/Sao_Paulo')::time;
  v_seg date := v_hoje - ((extract(isodow from v_hoje)::int) - 1);
  v_sex date := v_seg + 4;
  v_mes date := date_trunc('month', v_hoje)::date;
  v_owner text; v_nome text; v_email text; v_rampa record; v_novato boolean := false;
  v_fontes jsonb := '{}'::jsonb;
  v_pessoa jsonb; v_semana jsonb; v_missao jsonb; v_seqs jsonb; v_var jsonb; v_hab jsonb; v_car jsonb;
  v_pb jsonb; v_col jsonb; v_um jsonb; v_vs jsonb; v_abert jsonb;
  -- semana
  v_eu record; v_linhas jsonb; v_total int; v_passada record;
  -- sequências
  v_rua date[]; v_fila date[]; v_demo date[]; v_tira jsonb;
  v_rua_atual int := 0; v_rua_rec int := 0; v_fila_atual int := 0; v_fila_rec int := 0; v_demo_atual int := 0;
  -- missão
  v_m record; v_prazo date; v_dias_m jsonb; v_n int := 0; v_cumprida date;
  v_me jsonb; v_time jsonb; v_gap numeric; v_best text; v_best_gap numeric;
  t record; v_alvos constant jsonb := '{"porta":3,"fila":2,"naHora":2,"dono":2,"novato":3}'::jsonb;
  -- variável
  v_snap jsonb; v_snap_em timestamptz; v_rep jsonb; v_cfg jsonb; v_vendas int; v_meta int;
  -- habilidade
  v_hq jsonb; v_hp jsonb; v_h jsonb; v_tot jsonb; v_agora_h numeric; v_uteis_mes int; v_tq jsonb;
  -- carreira
  v_rq jsonb; v_rp jsonb; v_lid jsonb; v_tconv jsonb;
  -- coleção
  v_ganhas jsonb; v_progresso jsonb := '{}'::jsonb; v_quentes jsonb; v_rec jsonb; v_seg_rec date; v_aud boolean;
  v_primeiro date; v_d date; k text;
begin
  if v_uid is null then return jsonb_build_object('erro', 'sem pessoa'); end if;
  select p.id_hubspot, coalesce(nullif(e.nome, ''), p.full_name), u.email
    into v_owner, v_nome, v_email
    from public.profiles p
    left join public.equipe_cockpit e on e.profile_id = p.id
    left join auth.users u on u.id = p.id
   where p.id = v_uid;
  select rp.* into v_rampa from public.rampa_pessoas rp where rp.pessoa = v_uid and rp.encerrada_em is null;
  v_novato := v_rampa.pessoa is not null
    or exists (select 1 from public.equipe_cockpit e where e.profile_id = v_uid and coalesce(e.ramp_stage, '') = 'preparacao');
  v_pessoa := jsonb_build_object('id', v_uid, 'ownerId', v_owner, 'nome', v_nome, 'fase', case when v_novato then 'novato' else 'pleno' end);

  /* ── 2 · a semana: o placar do bônus (0191), sem nada novo ── */
  begin
    select x.* into v_eu from public.pontos_da_semana(v_seg) x where x.pessoa = v_uid;
    select count(*) into v_total from public.pontos_da_semana(v_seg) x;
    select coalesce(jsonb_agg(jsonb_build_object('pos', x.pos, 'nome', x.nome, 'pts', x.pontos, 'eu', x.pessoa = v_uid) order by x.pos), '[]'::jsonb)
      into v_linhas from public.pontos_da_semana(v_seg) x where x.pos <= 3;
    select x.* into v_passada from public.pontos_da_semana(v_seg - 7) x where x.pessoa = v_uid;
    v_semana := jsonb_build_object(
      'segunda', v_seg, 'sexta', v_sex,
      'uteis', (select count(*) from generate_series(v_seg, v_sex, interval '1 day') d where public.eh_dia_util(d::date)),
      'pts', coalesce(v_eu.pontos, 0), 'pos', v_eu.pos, 'total', v_total,
      'vendas', coalesce(v_eu.vendas, 0), 'demos', coalesce(v_eu.reunioes, 0), 'visitas', coalesce(v_eu.visitas, 0),
      'podio', v_linhas,
      /* só quem está logo acima (o "próximo a passar") e, para quem lidera, o 2º; nunca a lista */
      'acima', (select jsonb_build_object('nome', x.nome, 'pts', x.pontos) from public.pontos_da_semana(v_seg) x where v_eu.pos is not null and x.pos = v_eu.pos - 1),
      'segundo', (select jsonb_build_object('nome', x.nome, 'pts', x.pontos) from public.pontos_da_semana(v_seg) x where v_eu.pos = 1 and x.pos = 2),
      'passada', case when v_passada.pessoa is null then null else jsonb_build_object('pts', v_passada.pontos, 'pos', v_passada.pos) end,
      /* o recorde: as semanas gravadas no bônus (bonus_semanal guarda as linhas de todos) e a passada */
      'recorde', (select jsonb_build_object('pts', y.pts, 'segunda', y.semana) from (
                    select (l->>'pontos')::int as pts, b.semana from public.bonus_semanal b, jsonb_array_elements(b.detalhe->'linhas') l
                     where l->>'pessoa' = v_uid::text and b.semana < v_seg
                    union all select v_passada.pontos, v_seg - 7 where v_passada.pessoa is not null
                  ) y where y.pts > 0 order by y.pts desc, y.semana desc limit 1));
  exception when others then
    v_semana := null; v_fontes := v_fontes || jsonb_build_object('semana', 'placar_da_semana');
  end;

  /* ── 4 · as sequências: na rua (dia útil com visita com prova) e fila zerada (0 sem passo às 18h) ── */
  begin
    select coalesce(array_agg(distinct x.dia), '{}'::date[]) into v_rua
      from public._visitas_com_prova(v_hoje - 120, v_hoje, v_uid) x where x.provada;
    select coalesce(array_agg(z.dia order by z.dia), '{}'::date[]) into v_fila
      from public.fila_zerada_dias z
     where z.pessoa = v_uid and public.eh_dia_util(z.dia) and (z.criado_em at time zone 'America/Sao_Paulo')::time < time '18:00';
    select coalesce(array_agg(distinct (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date), '{}'::date[]) into v_demo
      from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo = 'demo_realizada'
       and coalesce(pe.ref_em, pe.criado_em) >= ((v_hoje - 120)::timestamp at time zone 'America/Sao_Paulo');
    v_rua_atual := public._sequencia_util(v_rua);
    v_rua_rec := greatest(public._dv2_recorde_util(v_rua), v_rua_atual);
    v_fila_atual := public._sequencia_util(v_fila);
    v_fila_rec := greatest(public._dv2_recorde_util(v_fila), v_fila_atual);
    v_demo_atual := public._sequencia_util(v_demo);
    /* a tira: os 5 últimos dias de semana (seg a sex) até hoje; o feriado entra marcado, não pula */
    select coalesce(jsonb_agg(jsonb_build_object('d', d.dia, 'feriado', public._dv2_nome_feriado(d.dia),
             'rua', d.dia = any(v_rua), 'fila', d.dia = any(v_fila)) order by d.dia), '[]'::jsonb)
      into v_tira
      from (select g::date as dia from generate_series(v_hoje - 9, v_hoje, interval '1 day') g
             where extract(isodow from g) < 6 order by g desc limit 5) d;
    v_seqs := jsonb_build_object(
      'rua', jsonb_build_object('atual', v_rua_atual, 'recorde', v_rua_rec),
      'fila', jsonb_build_object('atual', v_fila_atual, 'recorde', v_fila_rec, 'medido', exists (select 1 from public.fila_zerada_dias z where z.pessoa = v_uid)),
      'dias', v_tira);
  exception when others then
    v_seqs := null; v_fontes := v_fontes || jsonb_build_object('sequencias', 'visitas com prova');
  end;

  /* ── 3 · a missão da semana: escolhida uma vez, fechada pela prova ── */
  begin
    select * into v_m from public.missoes_semana m where m.pessoa = v_uid and m.segunda = v_seg;
    if v_m.pessoa is null then
      if v_novato then
        v_best := 'novato'; v_me := '{}'::jsonb; v_time := '{}'::jsonb;
      else
        /* as taxas da semana passada: a minha e a do time (sem quem está em rampa) */
        select jsonb_build_object('portas', coalesce(sum(x.portas), 0), 'provadas', coalesce(sum(x.provadas), 0), 'naHora', coalesce(sum(x.na_hora), 0),
                 'ausentes', coalesce(sum(x.ausentes), 0), 'voltas', coalesce(sum(x.voltas), 0),
                 'fila', (select count(*) from public.fila_zerada_dias z where z.pessoa = v_uid and z.dia between v_seg - 7 and v_seg - 3
                           and public.eh_dia_util(z.dia) and (z.criado_em at time zone 'America/Sao_Paulo')::time < time '18:00'))
          into v_me from public._dv2_portas(v_uid, v_owner, v_seg - 7, v_seg - 3) x;
        v_time := jsonb_build_object('portas', 0, 'provadas', 0, 'naHora', 0, 'ausentes', 0, 'voltas', 0, 'fila', 0, 'pessoas', 0);
        for t in
          select e.profile_id as pessoa, p.id_hubspot as owner_id
            from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
           where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false) and p.id_hubspot is not null
             and coalesce(e.ramp_stage, '') <> 'preparacao'
             and not exists (select 1 from public.rampa_pessoas rp where rp.pessoa = e.profile_id and rp.encerrada_em is null)
        loop
          select v_time || jsonb_build_object(
                   'portas', (v_time->>'portas')::int + coalesce(sum(x.portas), 0), 'provadas', (v_time->>'provadas')::int + coalesce(sum(x.provadas), 0),
                   'naHora', (v_time->>'naHora')::int + coalesce(sum(x.na_hora), 0), 'ausentes', (v_time->>'ausentes')::int + coalesce(sum(x.ausentes), 0),
                   'voltas', (v_time->>'voltas')::int + coalesce(sum(x.voltas), 0), 'pessoas', (v_time->>'pessoas')::int + 1,
                   'fila', (v_time->>'fila')::int + (select count(*) from public.fila_zerada_dias z where z.pessoa = t.pessoa and z.dia between v_seg - 7 and v_seg - 3
                             and public.eh_dia_util(z.dia) and (z.criado_em at time zone 'America/Sao_Paulo')::time < time '18:00'))
            into v_time from public._dv2_portas(t.pessoa, t.owner_id, v_seg - 7, v_seg - 3) x;
        end loop;
        /* a distância (pontos percentuais) em cada hábito; só conta onde eu estou abaixo do time */
        v_best := null; v_best_gap := 0;
        foreach k in array array['porta', 'fila', 'naHora', 'dono'] loop
          v_gap := case k
            when 'porta' then case when (v_me->>'portas')::int > 0 and (v_time->>'portas')::int > 0
                               then (v_time->>'provadas')::numeric / (v_time->>'portas')::int - (v_me->>'provadas')::numeric / (v_me->>'portas')::int end
            when 'naHora' then case when (v_me->>'portas')::int > 0 and (v_time->>'portas')::int > 0
                               then (v_time->>'naHora')::numeric / (v_time->>'portas')::int - (v_me->>'naHora')::numeric / (v_me->>'portas')::int end
            when 'dono' then case when (v_me->>'ausentes')::int > 0 and (v_time->>'ausentes')::int > 0
                               then (v_time->>'voltas')::numeric / (v_time->>'ausentes')::int - (v_me->>'voltas')::numeric / (v_me->>'ausentes')::int end
            else case when (v_time->>'pessoas')::int > 0
                      then ((v_time->>'fila')::numeric / (v_time->>'pessoas')::int - (v_me->>'fila')::numeric) / 5 end
          end;
          if v_gap is not null and v_gap > v_best_gap then v_best := k; v_best_gap := v_gap; end if;
        end loop;
        /* ninguém abaixo do time (ou semana passada sem dado): a missão é a ficha na hora, a que mais
           puxa as outras (registro antes de ligar o carro) */
        v_best := coalesce(v_best, 'naHora');
      end if;
      insert into public.missoes_semana (pessoa, segunda, missao, alvo, motivo)
      values (v_uid, v_seg, v_best, (v_alvos->>v_best)::int, jsonb_build_object('eu', v_me, 'time', v_time, 'distancia', round(coalesce(v_best_gap, 0) * 100)))
      on conflict (pessoa, segunda) do nothing;
      select * into v_m from public.missoes_semana m where m.pessoa = v_uid and m.segunda = v_seg;
    end if;

    /* o progresso: os dias ÚTEIS da semana em que a prova fechou o dia. A semana inteira vem na lista
       (o futuro com ok = false), para a tela poder dizer "o feriado de sex 20/11 não conta" antes dele. */
    select coalesce(jsonb_agg(jsonb_build_object('d', d.dia, 'feriado', public._dv2_nome_feriado(d.dia), 'util', public.eh_dia_util(d.dia), 'ok', d.ok) order by d.dia), '[]'::jsonb),
           count(*) filter (where d.ok)
      into v_dias_m, v_n
      from (
        select g::date as dia,
               g::date <= v_hoje and public.eh_dia_util(g::date) and case v_m.missao
                 when 'porta' then coalesce(x.portas, 0) > 0 and x.provadas = x.portas
                 when 'naHora' then coalesce(x.portas, 0) > 0 and x.na_hora = x.portas
                 when 'dono' then coalesce(x.ausentes, 0) > 0 and x.voltas = x.ausentes
                 when 'novato' then coalesce(x.provadas, 0) >= 4
                 else exists (select 1 from public.fila_zerada_dias z where z.pessoa = v_uid and z.dia = g::date
                               and (z.criado_em at time zone 'America/Sao_Paulo')::time < time '18:00')
               end as ok
          from generate_series(v_seg, v_sex, interval '1 day') g
          left join public._dv2_portas(v_uid, v_owner, v_seg, least(v_sex, v_hoje)) x on x.dia = g::date
      ) d;
    /* o dia em que fechou: o dia útil em que a contagem chegou ao alvo */
    v_cumprida := v_m.cumprida_em;
    if v_cumprida is null and v_n >= v_m.alvo then
      select (e->>'d')::date into v_cumprida from (
        select e, sum(case when (e->>'ok')::boolean then 1 else 0 end) over (order by (e->>'d')::date) as acc
          from jsonb_array_elements(v_dias_m) e) z
       where z.acc >= v_m.alvo order by (e->>'d')::date limit 1;
      update public.missoes_semana set cumprida_em = v_cumprida where pessoa = v_uid and segunda = v_seg and cumprida_em is null;
    end if;
    if v_cumprida is not null then
      perform public._dv2_ganhar(v_uid, 'missao:' || v_m.missao || ':' || v_seg, v_cumprida, jsonb_build_object('missao', v_m.missao, 'segunda', v_seg));
    end if;
    /* o prazo: a sexta, ou o último dia útil da semana se a sexta for feriado */
    select max(g::date) into v_prazo from generate_series(v_seg, v_sex, interval '1 day') g where public.eh_dia_util(g::date);
    v_missao := jsonb_build_object('id', v_m.missao, 'alvo', v_m.alvo, 'n', least(v_n, v_m.alvo), 'prazo', coalesce(v_prazo, v_sex),
      'cumpridaEm', v_cumprida, 'dias', v_dias_m,
      'uteis', (select count(*) from generate_series(v_seg, v_sex, interval '1 day') g where public.eh_dia_util(g::date)),
      'restam', (select count(*) from generate_series(v_hoje, coalesce(v_prazo, v_sex), interval '1 day') g where public.eh_dia_util(g::date)));
  exception when others then
    v_missao := null; v_fontes := v_fontes || jsonb_build_object('missao', 'visitas e fichas');
  end;

  /* ── 5 · o mês: vendas Ganho do HubSpot (vendasMes) × a tabela do variável (comissionamento) ── */
  begin
    select s.conteudo, s.atualizado_em into v_snap, v_snap_em from public.cockpit_snapshot s where s.chave = 'hubspot';
    select c.conteudo into v_cfg from public.cockpit_config c where c.chave = 'comissionamento';
    if v_snap is null or v_cfg is null or jsonb_typeof(v_cfg->'faixas') <> 'array' then
      v_var := null;
      v_fontes := v_fontes || jsonb_build_object('variavel', case when v_snap is null then 'HubSpot' else 'comissionamento.json' end);
    else
      v_rep := v_snap->'reps'->v_owner;
      select count(*) into v_vendas
        from jsonb_array_elements(case jsonb_typeof(v_snap->'vendasMes') when 'array' then v_snap->'vendasMes' else '[]'::jsonb end) x
       where x->>'ownerId' = v_owner and coalesce(x->>'mesDeCompetencia', left(x->>'closedate', 7)) = to_char(v_hoje, 'YYYY-MM');
      v_meta := coalesce(nullif(v_rep->>'metaMensal', '')::int, case when v_novato then 3 else 8 end);
      v_var := jsonb_build_object('mes', to_char(v_hoje, 'YYYY-MM'), 'vendas', v_vendas, 'meta', v_meta, 'faixas', v_cfg->'faixas', 'hubspotEm', v_snap_em);
    end if;
  exception when others then
    v_var := null; v_fontes := v_fontes || jsonb_build_object('variavel', 'HubSpot');
  end;

  /* ── 6 · a habilidade do mês: habilidade_quadro() (0233), a mesma do cartão de hoje ── */
  begin
    if v_eu_mesmo or coalesce((select public.eh_gestor_cockpit()), false) then
      v_hq := public.habilidade_quadro(null);
      select x into v_hp from jsonb_array_elements(v_hq->'pessoas') x where (x->>'pessoa')::uuid = v_uid;
    end if;
    if v_hq is null or v_hq ? 'erro' then
      v_hab := null; v_fontes := v_fontes || jsonb_build_object('habilidade', 'habilidade_quadro');
    else
      v_h := v_hp->'habilidade';
      v_tot := v_hp->'total'->'atual';
      select count(*) into v_uteis_mes from generate_series(v_mes, v_hoje, interval '1 day') d where public.eh_dia_util(d::date);
      /* o "agora" com a conta do habilidadeDoMes.ts (valor): dono = o ÷ f, demo = m ÷ p, fechar = c ÷ m,
         volume = p por semana (dias úteis ÷ 5) */
      v_agora_h := case v_h->>'taxa'
        when 'dono' then case when (v_tot->>'f')::int > 0 then round((v_tot->>'o')::numeric * 100 / (v_tot->>'f')::int) end
        when 'demo' then case when (v_tot->>'p')::int > 0 then round((v_tot->>'m')::numeric * 100 / (v_tot->>'p')::int) end
        when 'fechar' then case when (v_tot->>'m')::int > 0 then round(greatest((v_tot->>'c')::int, 0)::numeric * 100 / (v_tot->>'m')::int) end
        when 'volume' then case when v_uteis_mes > 0 then round((v_tot->>'p')::numeric / (v_uteis_mes / 5.0)) end
      end;
      if v_h is not null and v_agora_h is not null and v_agora_h >= (v_h->>'meta')::numeric then
        perform public._dv2_ganhar(v_uid, 'habilidade:' || to_char(v_mes, 'YYYY-MM'), v_hoje,
          jsonb_build_object('taxa', v_h->>'taxa', 'meta', v_h->'meta', 'agora', v_agora_h));
      end if;
      /* a sugestão para quem ainda não combinou: o maior gap contra o time no mês (ou no anterior) */
      v_tq := v_hq->'time';
      /* os dias úteis (sem feriado) de cada janela: o volume por semana do time sai daqui, sem que cada
         lado tenha de saber de feriado */
      v_hab := jsonb_build_object('habilidade', v_h, 'agora', v_agora_h, 'total', v_hp->'total', 'time', v_tq,
        'uteis', jsonb_build_object('atual', v_uteis_mes,
                   'anterior', (select count(*) from generate_series((v_mes - interval '1 month')::date, v_mes - 1, interval '1 day') d where public.eh_dia_util(d::date))),
        'ultimoUmAUm', v_hp->'ultimoUmAUm', 'mes', v_hq->'mes', 'anterior', v_hq->'anterior', 'ate', v_hq->'ate',
        'ganhaEm', (select g.ganha_em from public.conquistas_ganhas g where g.pessoa = v_uid and g.conquista = 'habilidade:' || to_char(v_mes, 'YYYY-MM')));
    end if;
  exception when others then
    v_hab := null; v_fontes := v_fontes || jsonb_build_object('habilidade', 'habilidade_quadro');
  end;

  /* ── 7 · a carreira: a rampa (rampa_quadro, 0231/0239) e os 4 critérios de líder (_lider_pessoa) ── */
  begin
    if v_novato and (v_eu_mesmo or coalesce((select public.eh_gestor_cockpit()), false)) then
      v_rq := public.rampa_quadro();
      select x into v_rp from jsonb_array_elements(v_rq->'pessoas') x where (x->>'pessoa')::uuid = v_uid;
    end if;
    v_lid := public._lider_pessoa(v_uid);
    /* o time no critério 2: clientes ÷ demos dos 3 meses fechados, sem quem está em rampa — a mesma conta
       do conv de _lider_pessoa, somada direto em pontos_eventos (chamar _lider_pessoa por pessoa leria
       3 meses de visitas de cada um só para jogar fora) */
    select jsonb_build_object(
             'demos', count(*) filter (where pe.tipo = 'demo_realizada'),
             'clientes', greatest(count(*) filter (where pe.tipo = 'contrato') - count(*) filter (where pe.tipo = 'estorno' and pe.negocio_id is not null), 0))
      into v_tconv
      from public.pontos_eventos pe
     where pe.tipo in ('demo_realizada', 'contrato', 'estorno')
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date >= (v_mes - interval '3 months')::date
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date < v_mes
       and pe.owner_id in (
         select p.id_hubspot from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
          where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false) and p.id_hubspot is not null
            and coalesce(e.ramp_stage, '') <> 'preparacao'
            and not exists (select 1 from public.rampa_pessoas rp where rp.pessoa = e.profile_id and rp.encerrada_em is null));
    /* o afilhado formado é medalha (e o 4º critério): a fase "rua" aprovada */
    for t in select a from jsonb_array_elements(coalesce(v_lid->'afilhados', '[]'::jsonb)) a loop
      if (t.a->'fases'->'rua'->>'aprovadaEm') is not null then
        perform public._dv2_ganhar(v_uid, 'padrinho:' || (t.a->>'pessoa'), (t.a->'fases'->'rua'->>'aprovadaEm')::date, jsonb_build_object('afilhado', t.a->>'nome'));
      end if;
    end loop;
    v_car := jsonb_build_object('rampa', v_rp, 'lider', v_lid, 'timeConv', v_tconv,
      'formadaEm', (select f.aprovada_em from public.rampa_fases f join public.rampa_pessoas rp on rp.pessoa = f.pessoa
                     where f.pessoa = v_uid and f.fase = 'rua' and rp.encerrada_em is not null));
  exception when others then
    v_car := null; v_fontes := v_fontes || jsonb_build_object('carreira', 'rampa_quadro');
  end;

  /* ── o Playbook: as provas (quiz) aprovadas; o nível sai dos capítulos de cada lado ── */
  begin
    select coalesce(jsonb_agg(jsonb_build_object('slug', pp.guia_slug, 'em', pp.concluido_em) order by pp.concluido_em), '[]'::jsonb)
      into v_pb from public.playbook_progresso pp
     where lower(pp.user_email) = lower(v_email) and pp.tipo = 'prova';
  exception when others then
    v_pb := null; v_fontes := v_fontes || jsonb_build_object('playbook', 'playbook_progresso');
  end;

  /* ── 8 · a coleção: grava o que a prova acabou de fechar e devolve tudo, com a data ── */
  begin
    if v_seqs is not null then
      perform public._dv2_ganhar(v_uid, 'na_rua', public._dv2_dia_da_sequencia(v_rua, 5));
      perform public._dv2_ganhar(v_uid, 'fila_zerada', public._dv2_dia_da_sequencia(v_fila, 5));
      perform public._dv2_ganhar(v_uid, 'demo_seguidas', public._dv2_dia_da_sequencia(v_demo, 3));
    end if;
    /* o 1º contrato do mês (contrato menos o estorno do mesmo negócio) */
    select min((coalesce(c.ref_em, c.criado_em) at time zone 'America/Sao_Paulo')::date) into v_primeiro
      from public.pontos_eventos c
     where c.owner_id = v_owner and c.tipo = 'contrato'
       and (coalesce(c.ref_em, c.criado_em) at time zone 'America/Sao_Paulo')::date >= v_mes
       and not exists (select 1 from public.pontos_eventos s where s.tipo = 'estorno' and s.negocio_id is not null and s.negocio_id = c.negocio_id);
    perform public._dv2_ganhar(v_uid, 'primeiro_contrato:' || to_char(v_mes, 'YYYY-MM'), v_primeiro);
    /* 4 contatos em todos os quentes: a conta de minhas_conquistas() (0154), que só sabe do próprio */
    if v_eu_mesmo then
      select x into v_quentes from jsonb_array_elements(public.minhas_conquistas()) x where x->>'id' = 'quentes_4';
      if coalesce((v_quentes->>'feito')::boolean, false) then
        perform public._dv2_ganhar(v_uid, 'quentes_4:' || v_seg, v_hoje);
      end if;
    end if;
    /* o reconhecimento da sexta: a semana que fechou (de sexta a domingo, a corrente). Só com a auditoria
       de sexta registrada (auditorias_semana): reconhecimento é de número conferido. A régua é a do
       GV2.rcDestaques do Cockpit para os combinados 1 (porta provada), 3 (ficha na hora) e 4 (dono):
       no mínimo 10 visitas (3 ausências no 4) e quem tiver a maior taxa do time, sem a rampa. */
    v_seg_rec := case when extract(isodow from v_hoje) >= 5 then v_seg else v_seg - 7 end;
    v_aud := exists (select 1 from public.auditorias_semana a where a.segunda = v_seg_rec);
    v_rec := null;
    if v_aud and not v_novato then
      with tt as (
        select e.profile_id as pessoa, sum(x.portas) as portas, sum(x.provadas) as provadas, sum(x.na_hora) as na_hora,
               sum(x.ausentes) as ausentes, sum(x.voltas) as voltas
          from public.equipe_cockpit e
          join public.profiles p on p.id = e.profile_id
          cross join lateral public._dv2_portas(e.profile_id, p.id_hubspot, v_seg_rec, v_seg_rec + 4) x
         where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false) and p.id_hubspot is not null
           and coalesce(e.ramp_stage, '') <> 'preparacao'
           and not exists (select 1 from public.rampa_pessoas rp where rp.pessoa = e.profile_id and rp.encerrada_em is null)
         group by e.profile_id
      ), tx as (
        select pessoa, 1 as comb, round(provadas * 100.0 / portas)::int as pct, provadas as n, portas as den from tt where portas >= 10
        union all select pessoa, 3, round(na_hora * 100.0 / portas)::int, na_hora, portas from tt where portas >= 10
        union all select pessoa, 4, round(voltas * 100.0 / ausentes)::int, voltas, ausentes from tt where ausentes >= 3
      ), mx as (select comb, max(pct) as m from tx group by comb)
      select jsonb_build_object('combinado', tx.comb, 'pct', tx.pct, 'n', tx.n, 'den', tx.den, 'segunda', v_seg_rec, 'sexta', v_seg_rec + 4)
        into v_rec
        from tx join mx on mx.comb = tx.comb and mx.m = tx.pct
       where tx.pessoa = v_uid
       order by tx.pct desc, tx.comb limit 1;
      if v_rec is not null then
        perform public._dv2_ganhar(v_uid, 'destaque:' || v_seg_rec || ':' || (v_rec->>'combinado'), v_seg_rec + 4, v_rec);
      end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('id', g.conquista, 'em', g.ganha_em, 'detalhe', g.detalhe,
             'vista', exists (select 1 from public.conquistas_vistas cv where cv.pessoa = g.pessoa and cv.conquista = g.conquista))
             order by g.ganha_em, g.conquista), '[]'::jsonb)
      into v_ganhas from public.conquistas_ganhas g where g.pessoa = v_uid;
    v_progresso := jsonb_build_object(
      'na_rua', v_rua_atual, 'fila_zerada', v_fila_atual, 'demo_seguidas', v_demo_atual,
      'quentes', case when v_quentes is null then null else jsonb_build_object('n', v_quentes->'progresso', 'de', v_quentes->'alvo', 'medido', coalesce((v_quentes->>'medido')::boolean, true)) end);
    v_col := jsonb_build_object('ganhas', v_ganhas, 'progresso', v_progresso, 'reconhecimento', v_rec);
  exception when others then
    v_col := null; v_fontes := v_fontes || jsonb_build_object('colecao', 'conquistas');
  end;

  /* ── 1 · o 1:1 em uma linha: o último registrado e o próximo pela cadência do gestor
     (GV2.PESSOAS.HORA_1A1 = 'segunda 08:30'; o feriado empurra para o próximo dia útil, como o
     DV.proximo1a1 do Cockpit) ── */
  begin
    v_d := case when extract(isodow from v_hoje) = 1 and v_hora < time '08:30' then v_hoje else v_hoje + (8 - extract(isodow from v_hoje)::int) end;
    if not public.eh_dia_util(v_d) then v_d := public.proximo_dia_util(v_d); end if;
    v_um := jsonb_build_object('ultimo', (select max(u.data) from public.um_a_um u where u.owner_id = v_owner and u.data <= v_hoje),
      'proximo', v_d, 'hora', '08:30');
  exception when others then
    v_um := null; v_fontes := v_fontes || jsonb_build_object('umAUm', 'um_a_um');
  end;

  /* ── 9 · você contra você ── */
  begin
    v_vs := jsonb_build_object(
      'diaDoMes', extract(day from v_hoje)::int,
      'vendasMes', (select count(*) filter (where pe.tipo = 'contrato') - count(*) filter (where pe.tipo = 'estorno' and pe.negocio_id is not null)
                      from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo in ('contrato', 'estorno')
                       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date between v_mes and v_hoje),
      'vendasMesAnterior', (select count(*) filter (where pe.tipo = 'contrato') - count(*) filter (where pe.tipo = 'estorno' and pe.negocio_id is not null)
                      from public.pontos_eventos pe where pe.owner_id = v_owner and pe.tipo in ('contrato', 'estorno')
                       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date
                           between (v_mes - interval '1 month')::date
                               and least((v_mes - interval '1 month')::date + (extract(day from v_hoje)::int - 1), v_mes - 1)));
  exception when others then
    v_vs := null; v_fontes := v_fontes || jsonb_build_object('vsVoce', 'pontos_eventos');
  end;

  /* ── a medição: quantas vezes abriu esta semana (o selo da Pessoas do gestor) ── */
  v_abert := jsonb_build_object(
    'semana', (select count(*) from public.aberturas_de_tela a where a.pessoa = v_uid and a.quando >= (v_seg::timestamp at time zone 'America/Sao_Paulo')),
    'ultima', (select max(a.quando) from public.aberturas_de_tela a where a.pessoa = v_uid));

  return jsonb_build_object('hoje', v_hoje, 'agora', v_agora, 'hora', to_char(v_hora, 'HH24:MI'), 'pessoa', v_pessoa,
    'umAUm', v_um, 'semana', v_semana, 'missao', v_missao, 'sequencias', v_seqs, 'variavel', v_var,
    'habilidade', v_hab, 'carreira', v_car, 'playbook', v_pb, 'colecao', v_col, 'vsVoce', v_vs,
    'aberturas', v_abert, 'fontes', v_fontes, 'lidoEm', now());
end;
$function$;
revoke all on function public._desenvolvimento_de(uuid) from public, anon, authenticated;
grant execute on function public._desenvolvimento_de(uuid) to service_role;

/* o que o app e o Cockpit chamam: sem p_pessoa, a própria pessoa; com p_pessoa, só o gestor */
create or replace function public.desenvolvimento_quadro(p_pessoa uuid default null)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare v_eu uuid := (select auth.uid());
begin
  if v_eu is null then return jsonb_build_object('erro', 'sem sessão'); end if;
  if p_pessoa is not null and p_pessoa <> v_eu and not coalesce((select public.eh_gestor_cockpit()), false) then
    return jsonb_build_object('erro', 'só o gestor vê outra pessoa');
  end if;
  return public._desenvolvimento_de(coalesce(p_pessoa, v_eu));
end;
$function$;
revoke all on function public.desenvolvimento_quadro(uuid) from public, anon;
grant execute on function public.desenvolvimento_quadro(uuid) to authenticated;

/* a abertura da tela (a medição); a origem é uma das 6 do handoff */
create or replace function public.registrar_abertura(p_tela text, p_origem text)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.aberturas_de_tela (pessoa, tela, origem)
  select (select auth.uid()), p_tela, p_origem
   where (select auth.uid()) is not null
     and p_tela in ('meu_desempenho', 'desenvolvimento')
     and p_origem in ('toast', 'pilula', 'push_seg', 'push_sex', 'menu', 'selo_menu');
$function$;
revoke all on function public.registrar_abertura(text, text) from public, anon;
grant execute on function public.registrar_abertura(text, text) to authenticated;

/* a conquista nova foi mostrada (toast ou coleção): só as que existem e são da pessoa */
create or replace function public.marcar_conquistas_vistas(p_ids text[], p_onde text default 'colecao')
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_n int;
begin
  if (select auth.uid()) is null then return 0; end if;
  insert into public.conquistas_vistas (pessoa, conquista, onde)
  select g.pessoa, g.conquista, case when p_onde in ('toast', 'colecao', 'menu') then p_onde else 'colecao' end
    from public.conquistas_ganhas g
   where g.pessoa = (select auth.uid()) and g.conquista = any(coalesce(p_ids, '{}'::text[]))
  on conflict (pessoa, conquista) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;
revoke all on function public.marcar_conquistas_vistas(text[], text) from public, anon;
grant execute on function public.marcar_conquistas_vistas(text[], text) to authenticated;

/* o sinal ao vivo quando nasce uma medalha: o app e o Cockpit (sinais_ao_vivo, 0128) releem o quadro e
   mostram o toast. Só tipo e dono, sem conteúdo, como os outros sinais. */
create or replace function public._dv2_sinal_conquista()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  /* sinal_ao_vivo (0128) já engole o erro: o sinal nunca derruba a gravação da medalha */
  perform public.sinal_ao_vivo('conquista', null, null, (select p.id_hubspot from public.profiles p where p.id = new.pessoa));
  return new;
end;
$function$;
drop trigger if exists conquistas_ganhas_sinal on public.conquistas_ganhas;
create trigger conquistas_ganhas_sinal after insert on public.conquistas_ganhas
  for each row execute function public._dv2_sinal_conquista();

-- ── os pushes da semana pelo push-fila (seg 08:00 e sex 17:00 de Brasília = 11:00 e 20:00 UTC) ──
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('push-desenvolvimento-seg', 'push-desenvolvimento-sex');
  perform cron.schedule('push-desenvolvimento-seg', '0 11 * * 1', $c$select public.invocar_push_fila('seg0800')$c$);
  perform cron.schedule('push-desenvolvimento-sex', '0 20 * * 5', $c$select public.invocar_push_fila('sex1700')$c$);
end $$;
