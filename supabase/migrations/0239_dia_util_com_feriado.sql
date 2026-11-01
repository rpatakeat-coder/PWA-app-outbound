-- 0239 · Dia útil é seg a sex FORA feriado nacional, também no banco (auditoria de 01/11/26)
--
-- O app (ehDiaUtil, desfechoVisita.ts) e o Cockpit (GV2.util) já pulavam feriado; o banco contava
-- "isodow < 6". Na semana de Finados (02/11) isso dava: a rampa dividindo 24 visitas por 5 dias
-- (4,8/dia, "não bate 6"), a sequência de dias zerando na terça, a tarefa gerada vencendo no feriado
-- e o SLA contando o feriado como dia parado. As funções que só acham a SEGUNDA da semana (isodow - 1)
-- estão certas e não mudam.
--
-- A lista de feriados é a mesma do app (feriadosNacionais em _compartilhado/filaDoDinheiro.ts):
-- fixos 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12 e, pela Páscoa, Carnaval
-- (seg e ter), Sexta-feira Santa e Corpus Christi.

create or replace function public.pascoa(p_ano int)
 returns date
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; v_mes int; v_dia int;
begin
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  v_mes := (h + l - 7 * m + 114) / 31; v_dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_ano, v_mes, v_dia);
end $function$;

create or replace function public.eh_feriado_nacional(p_dia date)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select to_char(p_dia, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25')
      or p_dia in (public.pascoa(extract(year from p_dia)::int) - 48, public.pascoa(extract(year from p_dia)::int) - 47,
                   public.pascoa(extract(year from p_dia)::int) - 2, public.pascoa(extract(year from p_dia)::int) + 60)
$function$;

create or replace function public.eh_dia_util(p_dia date)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select extract(isodow from p_dia) < 6 and not public.eh_feriado_nacional(p_dia)
$function$;

create or replace function public.proximo_dia_util(p_dia date)
 returns date
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare d date := p_dia + 1;
begin
  while not public.eh_dia_util(d) loop d := d + 1; end loop;
  return d;
end $function$;

create or replace function public.anterior_dia_util(p_dia date)
 returns date
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare d date := p_dia - 1;
begin
  while not public.eh_dia_util(d) loop d := d - 1; end loop;
  return d;
end $function$;

-- ── as que contavam dia útil ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._sequencia_util(p_dias date[])
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare d date := (now() at time zone 'America/Sao_Paulo')::date; n int := 0; tolerancia boolean := true;
begin
  for i in 1..60 loop
    if public.eh_dia_util(d) then
      if d = any(p_dias) then n := n + 1; tolerancia := false;
      elsif tolerancia then tolerancia := false;
      else exit; end if;
    end if;
    d := d - 1;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.add_business_days(t_start timestamp with time zone, n integer)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  d date := (t_start AT TIME ZONE 'America/Sao_Paulo')::date;
  added integer := 0;
BEGIN
  WHILE added < COALESCE(n, 0) LOOP
    d := d + 1;
    IF public.eh_dia_util(d) THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN (d::timestamp) AT TIME ZONE 'America/Sao_Paulo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.business_days_between(t_start timestamp with time zone, t_end timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT count(*)::int
  FROM generate_series(
    ((t_start AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp,
    ((t_end   AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp,
    interval '1 day'
  ) AS d
  WHERE public.eh_dia_util(d::date);
$function$;

CREATE OR REPLACE FUNCTION public.dias_uteis_entre(p_inicio timestamp with time zone, p_fim timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when p_inicio is null or p_fim is null or p_inicio >= p_fim then 0 else (
    select count(*)::int
      from generate_series((p_inicio at time zone 'America/Sao_Paulo')::date + 1,
                           (p_fim at time zone 'America/Sao_Paulo')::date,
                           interval '1 day') g
     where public.eh_dia_util(g::date)
  ) end
$function$;

/* a sequência da fila zerada: o "dia seguinte" esperado é o próximo dia útil (de sexta para segunda,
   e de sexta 30/10 para terça 03/11 por cima de Finados) */
CREATE OR REPLACE FUNCTION public.sequencia_da_fila_zerada()
 RETURNS TABLE(atual integer, recorde integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_eu uuid := (select auth.uid());
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias date[];
  v_d date; v_ant date := null; v_run int := 0; v_max int := 0; v_atual int := 0;
  v_esperado date;
begin
  if v_eu is null then return; end if;
  select coalesce(array_agg(z.dia order by z.dia), '{}') into v_dias
    from public.fila_zerada_dias z
   where z.pessoa = v_eu and public.eh_dia_util(z.dia)
     and (z.criado_em at time zone 'America/Sao_Paulo')::time < time '18:00';
  foreach v_d in array v_dias loop
    v_esperado := case when v_ant is null then null else public.proximo_dia_util(v_ant) end;
    if v_ant is not null and v_d = v_esperado then v_run := v_run + 1; else v_run := 1; end if;
    v_max := greatest(v_max, v_run);
    v_ant := v_d;
  end loop;
  v_esperado := public.anterior_dia_util(v_hoje);
  if v_ant is not null and (v_ant = v_hoje or v_ant = v_esperado) then v_atual := v_run; end if;
  return query select v_atual, v_max;
end $function$;

/* a rampa: "uteis" da semana sem feriado (a média de visitas por dia do card "Minha rampa") */
CREATE OR REPLACE FUNCTION public.rampa_quadro()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gestor boolean := coalesce((select public.eh_gestor_cockpit()), false);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seg date := v_hoje - ((extract(isodow from v_hoje)::int) - 1);
  v_out jsonb := '[]'::jsonb;
  r record;
  v_s4 date;
  v_demos int;
  v_clientes int;
  v_base int;
  v_prosp int;
  v_prosp_dias jsonb;
  v_semanas jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('erro', 'sem sessão');
  end if;
  for r in
    select rp.*, p.id_hubspot, coalesce(e.nome, p.full_name) as nome,
           pp.id_hubspot as padrinho_owner, coalesce(ep.nome, pp.full_name) as padrinho_nome, pp.phone as padrinho_fone
      from public.rampa_pessoas rp
      join public.profiles p on p.id = rp.pessoa
      left join public.equipe_cockpit e on e.profile_id = rp.pessoa
      left join public.profiles pp on pp.id = rp.padrinho
      left join public.equipe_cockpit ep on ep.profile_id = rp.padrinho
     where rp.encerrada_em is null
       and coalesce(e.ativo, true)
       and (v_gestor or rp.pessoa = auth.uid())
     order by rp.turma desc, coalesce(e.nome, p.full_name)
  loop
    v_s4 := null;
    select f.aprovada_em into v_s4 from public.rampa_fases f
     where f.pessoa = r.pessoa and f.fase = 's4' and f.aprovada_em is not null;

    select count(*) into v_demos from public.pontos_eventos pe
     where pe.owner_id = r.id_hubspot and pe.tipo = 'demo_realizada'
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date >= r.inicio;

    /* clientes desde o dia 1: contrato menos o estorno do mesmo negócio (o estorno de visita não tem negócio) */
    select count(*) filter (where pe.tipo = 'contrato') - count(*) filter (where pe.tipo = 'estorno' and pe.negocio_id is not null)
      into v_clientes from public.pontos_eventos pe
     where pe.owner_id = r.id_hubspot and pe.tipo in ('contrato', 'estorno')
       and (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date >= r.inicio;

    with v as (
      select vp.dia, vp.provada, c.status
        from public._visitas_com_prova(r.inicio, v_hoje, r.pessoa) vp
        left join public.clients c on c.id = vp.client_id
    )
    select
      count(*) filter (where v.provada and v.status in ('cliente', 'ganho_fs')),
      count(*) filter (where v.status = 'lead' and v.dia < coalesce(v_s4, v_hoje + 1)),
      coalesce(jsonb_agg(distinct v.dia) filter (where v.status = 'lead' and v.dia < coalesce(v_s4, v_hoje + 1)), '[]'::jsonb),
      (select coalesce(jsonb_agg(jsonb_build_object(
                'segunda', s.seg,
                'provadas', (select count(*) from v v2 where v2.provada and v2.dia between s.seg and s.seg + 4),
                'uteis', (select count(*) from generate_series(greatest(s.seg, r.inicio), least(s.seg + 4, v_hoje), interval '1 day') d
                           where public.eh_dia_util(d::date)))
              order by s.seg), '[]'::jsonb)
         from (select (v_seg - 7 * k)::date as seg from generate_series(0, 2) k) s
        where s.seg + 4 >= r.inicio)
      into v_base, v_prosp, v_prosp_dias, v_semanas
      from v;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'pessoa', r.pessoa, 'ownerId', r.id_hubspot, 'nome', r.nome,
      'inicio', r.inicio, 'turma', r.turma,
      'padrinho', r.padrinho, 'padrinhoOwnerId', r.padrinho_owner, 'padrinhoNome', r.padrinho_nome, 'padrinhoTelefone', r.padrinho_fone,
      'dia', (v_hoje - r.inicio) + 1,
      'fases', coalesce((select jsonb_object_agg(f.fase, jsonb_build_object(
                  'aprovadaEm', f.aprovada_em, 'aprovadaPor', f.aprovada_por, 'evidencia', f.evidencia,
                  'realizado', f.realizado, 'motivo', f.motivo, 'estendidaAte', f.estendida_ate))
                from public.rampa_fases f where f.pessoa = r.pessoa), '{}'::jsonb),
      'decisao', (select jsonb_build_object('decisao', d.decisao, 'motivo', d.motivo, 'plano', d.plano,
                  'novaData', d.nova_data, 'decididaEm', d.decidida_em, 'decididaPor', d.decidida_por)
                from public.rampa_decisao_d45 d where d.pessoa = r.pessoa),
      'medido', jsonb_build_object('demos', v_demos, 'clientes', greatest(v_clientes, 0), 'visitasBase', v_base,
                  'prospeccao', v_prosp, 'prospeccaoDias', v_prosp_dias, 'semanas', v_semanas)
    ));
  end loop;
  return jsonb_build_object('hoje', v_hoje, 'gestor', v_gestor, 'pessoas', v_out, 'lidoEm', now());
end;
$function$;
