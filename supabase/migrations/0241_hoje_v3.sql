-- 0241 · Hoje v3, o dia que o executivo usa de verdade (handoff de 01/11/26, design_handoff_hoje_v3)
--
-- "Vamos refazer a aba Hoje? Será que estão usando de verdade? Preciso que eles usem isso." Em 30 dias:
-- 548 check-ins, 1 fecho do dia e 2,6% das paradas vindas do Cockpit. O dia vai até o executivo no app
-- (folha da manhã, pílula e toasts no mapa, fecho das 18h) e o Hoje do Cockpit vira espelho.
--
-- O que esta migração faz (nada de tabela nova, nada de HubSpot):
--   1. A MEDIÇÃO (README §7) entra na aberturas_de_tela do Desenvolvimento v2 (0240), e não numa tabela
--      paralela: as telas folha_manha, toast_pos_visita, fecho_dia e hoje_cockpit, as origens app,
--      push_08 e push_18, e a coluna nova `acao` (vista, ir_para_rua, depois, fechada_sem_acao,
--      passo_marcado, marcou_passo, ignorou, aberto, fechado, fechado_com_pendencia). As linhas antigas
--      (Meu desempenho e Desenvolvimento) ficam com acao nula.
--   2. registrar_abertura ganha o 3º argumento (p_acao, opcional). A versão de 2 argumentos sai, porque as
--      duas juntas deixariam a chamada com 2 argumentos ambígua; quem chamava com p_tela e p_origem (o
--      Meu desempenho do app e a Desenvolvimento do Cockpit) continua funcionando igual.
--   3. O selo "abriu esta semana" do gestor (0240, _desenvolvimento_de → aberturas) passa a contar só as
--      telas do Desenvolvimento: sem isto, abrir a folha da manhã contaria como "abriu o Meu desempenho".
--      A função é a da 0240 inteira, com essa única troca (a contagem e a última abertura filtradas por
--      tela in ('meu_desempenho', 'desenvolvimento')).
--   4. Os dois pushes do dia pelo push-fila, de segunda a sexta (o feriado a Edge decide e não manda):
--      08:00 de Brasília (11:00 UTC) "o seu dia em 30 segundos" e 18:00 (21:00 UTC) "feche o dia". Um por
--      momento por dia (push_enviados tipo 'hoje'), fora do limite de 4 da fila.
-- NÃO APLICADA: entra pelo fluxo de migrations de sempre, junto com o deploy do push-fila.

-- ── 1 · a medição ───────────────────────────────────────────────────────────────────────────────
alter table public.aberturas_de_tela add column if not exists acao text;
alter table public.aberturas_de_tela drop constraint if exists aberturas_de_tela_tela_check;
alter table public.aberturas_de_tela add constraint aberturas_de_tela_tela_check
  check (tela in ('meu_desempenho', 'desenvolvimento', 'folha_manha', 'toast_pos_visita', 'fecho_dia', 'hoje_cockpit'));
alter table public.aberturas_de_tela drop constraint if exists aberturas_de_tela_origem_check;
alter table public.aberturas_de_tela add constraint aberturas_de_tela_origem_check
  check (origem in ('toast', 'pilula', 'push_seg', 'push_sex', 'menu', 'selo_menu', 'app', 'push_08', 'push_18'));
alter table public.aberturas_de_tela drop constraint if exists aberturas_de_tela_acao_check;
alter table public.aberturas_de_tela add constraint aberturas_de_tela_acao_check
  check (acao is null or acao in ('vista', 'ir_para_rua', 'depois', 'fechada_sem_acao', 'passo_marcado', 'marcou_passo', 'ignorou',
    'aberto', 'fechado', 'fechado_com_pendencia'));
create index if not exists aberturas_de_tela_tela_quando on public.aberturas_de_tela (tela, quando desc);
comment on column public.aberturas_de_tela.acao is
  'Hoje v3 (0241): o que a pessoa fez na tela (folha da manhã, toast pós-visita, fecho do dia, Hoje do Cockpit). Nulo nas aberturas do Desenvolvimento v2.';

-- ── 2 · registrar_abertura com a ação ───────────────────────────────────────────────────────────
drop function if exists public.registrar_abertura(text, text);
create or replace function public.registrar_abertura(p_tela text, p_origem text, p_acao text default null)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.aberturas_de_tela (pessoa, tela, origem, acao)
  select (select auth.uid()), p_tela, p_origem, p_acao
   where (select auth.uid()) is not null
     and p_tela in ('meu_desempenho', 'desenvolvimento', 'folha_manha', 'toast_pos_visita', 'fecho_dia', 'hoje_cockpit')
     and p_origem in ('toast', 'pilula', 'push_seg', 'push_sex', 'menu', 'selo_menu', 'app', 'push_08', 'push_18')
     and (p_acao is null or p_acao in ('vista', 'ir_para_rua', 'depois', 'fechada_sem_acao', 'passo_marcado', 'marcou_passo', 'ignorou',
       'aberto', 'fechado', 'fechado_com_pendencia'));
$function$;
revoke all on function public.registrar_abertura(text, text, text) from public, anon;
grant execute on function public.registrar_abertura(text, text, text) to authenticated;

-- ── 3 · o selo "abriu esta semana" conta só o Desenvolvimento (a função da 0240, uma linha trocada) ──
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
    'semana', (select count(*) from public.aberturas_de_tela a where a.pessoa = v_uid and a.tela in ('meu_desempenho', 'desenvolvimento') and a.quando >= (v_seg::timestamp at time zone 'America/Sao_Paulo')),
    'ultima', (select max(a.quando) from public.aberturas_de_tela a where a.pessoa = v_uid and a.tela in ('meu_desempenho', 'desenvolvimento')));

  return jsonb_build_object('hoje', v_hoje, 'agora', v_agora, 'hora', to_char(v_hora, 'HH24:MI'), 'pessoa', v_pessoa,
    'umAUm', v_um, 'semana', v_semana, 'missao', v_missao, 'sequencias', v_seqs, 'variavel', v_var,
    'habilidade', v_hab, 'carreira', v_car, 'playbook', v_pb, 'colecao', v_col, 'vsVoce', v_vs,
    'aberturas', v_abert, 'fontes', v_fontes, 'lidoEm', now());
end;
$function$;
revoke all on function public._desenvolvimento_de(uuid) from public, anon, authenticated;
grant execute on function public._desenvolvimento_de(uuid) to service_role;

-- ── 4 · os pushes do dia pelo push-fila (08:00 e 18:00 de Brasília = 11:00 e 21:00 UTC, seg a sex) ──
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('push-hoje-manha', 'push-hoje-fecho');
  perform cron.schedule('push-hoje-manha', '0 11 * * 1-5', $c$select public.invocar_push_fila('manha0800')$c$);
  perform cron.schedule('push-hoje-fecho', '0 21 * * 1-5', $c$select public.invocar_push_fila('fecho1800')$c$);
end $$;
