-- Config da Rota do dia editável pelo gestor (raio/nota/avaliações da Conta
-- Alvo, meta de visitas/dia, SLAs por etapa). Uma linha só (id=1). A edge
-- conta-alvo-nearby e a RPC sla_estourado_candidates passam a LER daqui; o app
-- lê a meta + SLAs. Assim mudar os números vira editar no app (sem publicar).

create table if not exists public.route_config (
  id integer primary key default 1 check (id = 1),
  -- Conta Alvo
  conta_alvo_raio_m       integer not null default 2000,
  conta_alvo_nota_min     numeric not null default 4.5,
  conta_alvo_reviews_min  integer not null default 100,
  -- Rota do dia
  meta_visitas_dia        integer not null default 6,
  -- SLA por etapa (dias) — regra do MD
  sla_prospeccao          integer not null default 5,
  sla_visita              integer not null default 5,
  sla_conversa            integer not null default 4,
  sla_demo                integer not null default 3,
  sla_negociacao          integer not null default 7,
  sla_ag_pagamento        integer not null default 2,
  updated_at              timestamptz not null default now(),
  updated_by              uuid
);

-- Linha única semeada com os defaults.
insert into public.route_config (id) values (1) on conflict (id) do nothing;

-- RLS: qualquer autenticado LÊ (edge/app precisam aplicar); só gestor EDITA.
alter table public.route_config enable row level security;
drop policy if exists route_config_select on public.route_config;
create policy route_config_select on public.route_config
  for select to authenticated using (true);
drop policy if exists route_config_update on public.route_config;
create policy route_config_update on public.route_config
  for update to authenticated
  using ((select public.is_field_admin()))
  with check ((select public.is_field_admin()));

-- ===== RPC de SLA passa a ler os prazos da route_config =====
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
      floor(
        extract(epoch from (
          now() - greatest(c.hs_stage_entered_at, c.hs_last_activity_at, c.created_at)
        )) / 86400.0
      ) as dias_parado
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
$$;

grant execute on function public.sla_estourado_candidates(text, integer) to authenticated;
