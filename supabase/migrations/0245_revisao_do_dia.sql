-- 0245 · Revisão das mudanças de 02/11/26 (auditoria do servidor, só o que ela confirmou)
--
--   1. desenvolvimento_quadro() chegou a 7,99 s (pg_stat_statements: 67 chamadas, média 1,3 s) e estourou o
--      statement_timeout de 8 s três vezes às 15:56 UTC, parado em _visitas_com_prova(120 dias) e no
--      eh_feriado_nacional chamado dentro dos laços de sequência (_dv2_recorde_util, _dv2_dia_da_sequencia,
--      proximo_dia_util). Duas trocas: a Páscoa sai uma vez por chamada (eram 4 chamadas à pascoa() a cada
--      dia conferido), e o quadro ganha 15 s de teto, para o pico de carga não derrubar a tela nem o push.
--   2. reconhecimentos_gestor (0244) herdou INSERT/UPDATE/DELETE para authenticated dos privilégios padrão
--      do schema. A RLS já barrava; fica explícito: só SELECT, e a escrita é só reconhecer_destaque().
--   3. As 5 tabelas que a 0243 moveu para `arquivo` mantinham os grants de anon/authenticated (sem efeito,
--      o schema não é exposto, mas não deve ficar).

-- ── 1 · o feriado sem 4 Páscoas por dia, e o teto do quadro ──────────────────────────────────────
create or replace function public.eh_feriado_nacional(p_dia date)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select to_char(p_dia, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25')
      or exists (select 1 from (select public.pascoa(extract(year from p_dia)::int) as p) x
                  where p_dia in (x.p - 48, x.p - 47, x.p - 2, x.p + 60))
$function$;

alter function public.desenvolvimento_quadro(uuid, text) set statement_timeout = '15s';

-- ── 2 · reconhecimentos_gestor: só leitura direta ────────────────────────────────────────────────
revoke insert, update, delete on table public.reconhecimentos_gestor from authenticated;

-- ── 3 · o schema arquivo sem grants de anon/authenticated ────────────────────────────────────────
revoke all on all tables in schema arquivo from anon, authenticated;

-- ── 4 · o mês a mês da pessoa (pedido do gestor em 02/11/26: "clicar no mês e ver todos os resultados,
--        para comparar o crescimento") ─────────────────────────────────────────────────────────────
-- A mesma fonte do "clientes · pontos do HubSpot" do Funil: pontos_eventos (contrato menos o estorno do
-- mesmo negócio, demo_realizada, visita_provada), por mês de Brasília, com o MRR da venda (valor do
-- contrato; o estorno desconta o MRR do contrato que ele estorna) e os dias úteis de cada mês. Ao lado,
-- a média por pessoa do time ativo (sem quem está em rampa), para comparar. Só o gestor lê de qualquer um;
-- o executivo, só o dele.
create or replace function public.resultados_mensais(p_owner text, p_meses integer default 6)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini date;
  v_meses int := least(greatest(coalesce(p_meses, 6), 1), 12);
  v_time text[];
begin
  if p_owner is null then return jsonb_build_object('erro', 'sem pessoa'); end if;
  if not ((select public.eh_gestor_cockpit()) or p_owner = (select public.meu_owner_hubspot())) then
    raise exception 'só o gestor ou a própria pessoa' using errcode = '42501';
  end if;
  v_ini := (date_trunc('month', v_hoje) - make_interval(months => v_meses - 1))::date;
  select coalesce(array_agg(p.id_hubspot), '{}') into v_time
    from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
   where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false) and p.id_hubspot is not null
     and coalesce(e.ramp_stage, '') <> 'preparacao'
     and not exists (select 1 from public.rampa_pessoas rp where rp.pessoa = e.profile_id and rp.encerrada_em is null);
  return (
    with ev as (
      select pe.owner_id, pe.tipo, pe.negocio_id, pe.valor,
             date_trunc('month', coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date as mes
        from public.pontos_eventos pe
       where pe.tipo in ('contrato', 'estorno', 'demo_realizada', 'visita_provada')
         and coalesce(pe.ref_em, pe.criado_em) >= (v_ini::timestamp at time zone 'America/Sao_Paulo')
         and (pe.owner_id = p_owner or pe.owner_id = any (v_time))
    ), mrr_do_negocio as (
      select negocio_id, max(valor) as valor from public.pontos_eventos where tipo = 'contrato' and negocio_id is not null group by negocio_id
    ), por as (
      select ev.owner_id, ev.mes,
             count(*) filter (where ev.tipo = 'contrato') - count(*) filter (where ev.tipo = 'estorno' and ev.negocio_id is not null) as vendas,
             coalesce(sum(ev.valor) filter (where ev.tipo = 'contrato'), 0)
               - coalesce(sum(m.valor) filter (where ev.tipo = 'estorno'), 0) as mrr,
             count(*) filter (where ev.tipo = 'demo_realizada') as demos,
             count(*) filter (where ev.tipo = 'visita_provada') as visitas
        from ev left join mrr_do_negocio m on ev.tipo = 'estorno' and m.negocio_id = ev.negocio_id
       group by ev.owner_id, ev.mes
    ), meses as (
      select g::date as mes,
             (select count(*) from generate_series(g::date, least((g + interval '1 month - 1 day')::date, v_hoje), interval '1 day') d
               where public.eh_dia_util(d::date)) as uteis
        from generate_series(v_ini, date_trunc('month', v_hoje)::date, interval '1 month') g
    )
    select jsonb_build_object('owner', p_owner, 'hoje', v_hoje, 'pessoasNoTime', coalesce(array_length(v_time, 1), 0),
      'meses', coalesce(jsonb_agg(jsonb_build_object(
        'mes', to_char(ms.mes, 'YYYY-MM'), 'uteis', ms.uteis, 'corrente', ms.mes = date_trunc('month', v_hoje)::date,
        'eu', jsonb_build_object('vendas', coalesce(e.vendas, 0), 'mrr', coalesce(e.mrr, 0), 'demos', coalesce(e.demos, 0), 'visitas', coalesce(e.visitas, 0)),
        'time', jsonb_build_object(
          'vendas', round(coalesce((select sum(t.vendas) from por t where t.mes = ms.mes and t.owner_id = any (v_time)), 0)::numeric / greatest(coalesce(array_length(v_time, 1), 0), 1), 1),
          'mrr', round(coalesce((select sum(t.mrr) from por t where t.mes = ms.mes and t.owner_id = any (v_time)), 0)::numeric / greatest(coalesce(array_length(v_time, 1), 0), 1)),
          'demos', round(coalesce((select sum(t.demos) from por t where t.mes = ms.mes and t.owner_id = any (v_time)), 0)::numeric / greatest(coalesce(array_length(v_time, 1), 0), 1), 1),
          'visitas', round(coalesce((select sum(t.visitas) from por t where t.mes = ms.mes and t.owner_id = any (v_time)), 0)::numeric / greatest(coalesce(array_length(v_time, 1), 0), 1), 1))
      ) order by ms.mes), '[]'::jsonb))
      from meses ms left join por e on e.mes = ms.mes and e.owner_id = p_owner
  );
end;
$function$;
revoke all on function public.resultados_mensais(text, integer) from public, anon;
grant execute on function public.resultados_mensais(text, integer) to authenticated;
