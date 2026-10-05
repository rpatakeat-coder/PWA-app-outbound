-- 0162 — SLA estourado conta só dia útil (Julyan, 05/10/2026: "não pode contar os finais de semana").
--
-- sla_estourado_candidates (a lista de leads que a rota do dia sugere como "SLA estourado") contava
-- dia corrido: now() - base em segundos / 86400. O Cockpit conta dia útil desde 10/08
-- (lib/lead-do-funil.js, diasUteisEntre) e o cartão do lead no app passou a contar igual em
-- 05/10 (src/utils/sla.ts). Esta é a terceira cópia da mesma regra, agora com a mesma conta:
-- os dias úteis em (dia da base, hoje], por data de Brasília. Feriado conta, como no robô.
--
-- Medido antes de aplicar: 321 leads estourados pela conta corrida, 316 pela útil.
-- Fora a conta dos dias, a função é a mesma de 0054/0057 (mesma assinatura, filtros e ordem).

create or replace function public.dias_uteis_entre(p_inicio timestamptz, p_fim timestamptz)
returns integer
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select case when p_inicio is null or p_fim is null or p_inicio >= p_fim then 0 else (
    select count(*)::int
      from generate_series((p_inicio at time zone 'America/Sao_Paulo')::date + 1,
                           (p_fim at time zone 'America/Sao_Paulo')::date,
                           interval '1 day') g
     where extract(isodow from g) < 6
  ) end
$$;

revoke all on function public.dias_uteis_entre(timestamptz, timestamptz) from public, anon;
grant execute on function public.dias_uteis_entre(timestamptz, timestamptz) to authenticated, service_role;

create or replace function public.sla_estourado_candidates(p_vendedor text default null::text, p_limit integer default 5)
returns setof clients
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with cfg as (select * from public.route_config where id = 1),
  scored as (
    select
      c.id,
      case upper(btrim(coalesce(c.etapa,'')))
        when 'PROSPECÇÃO' then cfg.sla_prospeccao
        when 'PROSPECCAO' then cfg.sla_prospeccao
        when 'VISITA' then cfg.sla_visita
        when 'CONVERSA COM DECISOR' then cfg.sla_conversa
        when 'DIAGNÓSTICO' then cfg.sla_conversa
        when 'DIAGNOSTICO' then cfg.sla_conversa
        when 'DEMO/PROPOSTA' then cfg.sla_demo
        when 'NEGOCIAÇÃO' then cfg.sla_negociacao
        when 'NEGOCIACAO' then cfg.sla_negociacao
        when 'AG. PAGAMENTO' then cfg.sla_ag_pagamento
        else 999
      end as sla_dias,
      public.dias_uteis_entre(greatest(c.hs_stage_entered_at, c.hs_last_activity_at, c.created_at), now()) as dias_parado
    from public.clients c
    cross join cfg
    where c.status = 'lead'
      and c.latitude is not null
      and c.longitude is not null
      and (p_vendedor is null or c.vendedor_id_hubspot = p_vendedor)
  ),
  breached as (
    select id, (dias_parado::numeric / nullif(sla_dias,0)) as ratio
    from scored
    where sla_dias < 999
      and dias_parado > sla_dias
  )
  select c.*
  from public.clients c
  join breached b on b.id = c.id
  order by b.ratio desc nulls last
  limit greatest(1, coalesce(p_limit, 5));
$function$;
