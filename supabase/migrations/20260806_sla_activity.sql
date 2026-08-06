-- Rota do dia (Fase 2): SLA estourado (regra do MD REGRA_SLA_ESTOURADO.md).
--
-- diasParado = floor(hoje - MAIOR(entrada na etapa, ultima atividade humana,
--              criacao)). Interacao humana RESETA o contador. NUNCA usar um
--              "ultima modificacao" generico (armadilha do MD).
-- breach     = diasParado > SLA_da_etapa.
-- SLA/etapa (dias): Prospeccao 5, Visita 5, Conversa com decisor 4,
--              Demo/Proposta 3, Negociacao 7, Ag. Pagamento 2, resto 999.
--
-- ISOLADO do motor de Tarefas do time (client_tasks/stage_sla usa outros
-- numeros e conta so' dias-na-etapa). Aqui e' so' pra ESCOLHER a visita de SLA
-- da Rota do dia.

-- ===== Colunas sincronizadas do HubSpot (edge hubspot-activity-sync) =====
-- hs_last_activity_at: HubSpot `hs_lastactivitydate` do deal (engagement-driven:
--   nota/ligacao/email/reuniao). NAO e' o hs_lastmodifieddate (armadilha).
-- hs_stage_entered_at: HubSpot `hs_date_entered_<etapaAtual>` — quando entrou na
--   etapa em que esta hoje.
alter table public.clients
  add column if not exists hs_last_activity_at timestamptz,
  add column if not exists hs_stage_entered_at timestamptz;

comment on column public.clients.hs_last_activity_at is
  'HubSpot hs_lastactivitydate do deal (ultima atividade humana). Sync diario hubspot-activity-sync. Base do "dias parado" do SLA da Rota do dia.';
comment on column public.clients.hs_stage_entered_at is
  'HubSpot hs_date_entered_<etapa> (entrada na etapa atual). Sync diario hubspot-activity-sync.';

-- ===== Gravacao em lote (a edge chama isto, 1x por lote) =====
create or replace function public.apply_hubspot_activity(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with rows as (
    select
      (r->>'id_hubspot') as id_hubspot,
      nullif(r->>'last_activity_at','')::timestamptz as last_activity_at,
      nullif(r->>'stage_entered_at','')::timestamptz as stage_entered_at
    from jsonb_array_elements(p_rows) as r
  )
  update public.clients c
     set hs_last_activity_at = rows.last_activity_at,
         hs_stage_entered_at = rows.stage_entered_at
    from rows
   where c.id_hubspot = rows.id_hubspot;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===== Candidatos de SLA estourado pra Rota do dia =====
-- Devolve os leads do vendedor com SLA estourado, do mais urgente (maior
-- diasParado/SLA) pro menos. O app pega o 1o que ainda nao esta na rota.
-- p_vendedor NULL = sem recorte (todos) — o app passa o id_hubspot do vendedor.
create or replace function public.sla_estourado_candidates(
  p_vendedor text default null,
  p_limit integer default 5
)
returns setof public.clients
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with scored as (
    select
      c.id,
      case upper(btrim(coalesce(c.etapa,'')))
        when 'PROSPECÇÃO' then 5
        when 'PROSPECCAO' then 5
        when 'VISITA' then 5
        when 'CONVERSA COM DECISOR' then 4
        when 'DIAGNÓSTICO' then 4
        when 'DIAGNOSTICO' then 4
        when 'DEMO/PROPOSTA' then 3
        when 'NEGOCIAÇÃO' then 7
        when 'NEGOCIACAO' then 7
        when 'AG. PAGAMENTO' then 2
        else 999
      end as sla_dias,
      floor(
        extract(epoch from (
          now() - greatest(c.hs_stage_entered_at, c.hs_last_activity_at, c.created_at)
        )) / 86400.0
      ) as dias_parado
    from public.clients c
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
$$;

-- Executa por qualquer autenticado (o app chama do cliente).
grant execute on function public.sla_estourado_candidates(text, integer) to authenticated;
