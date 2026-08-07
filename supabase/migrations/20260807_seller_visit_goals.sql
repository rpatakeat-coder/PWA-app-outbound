-- Meta DIÁRIA de visitas por vendedor (editável pelo gestor). Usada no ranking
-- de rotas pra comparar feito (check-ins) vs meta no período. Se um vendedor não
-- tiver meta própria, o app usa a meta global (route_config.meta_visitas_dia).
--
-- Obs.: a antiga seller_goals (por período, com vários alvos) foi dropada em
-- 20260620; esta é enxuta e por-vendedor (1 linha por seller).

create table if not exists public.seller_visit_goals (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  meta_visitas_dia integer not null default 6,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- RLS: qualquer autenticado LÊ (o ranking aplica); só gestor EDITA.
alter table public.seller_visit_goals enable row level security;

drop policy if exists seller_visit_goals_select on public.seller_visit_goals;
create policy seller_visit_goals_select on public.seller_visit_goals
  for select to authenticated using (true);

drop policy if exists seller_visit_goals_insert on public.seller_visit_goals;
create policy seller_visit_goals_insert on public.seller_visit_goals
  for insert to authenticated with check ((select public.is_field_admin()));

drop policy if exists seller_visit_goals_update on public.seller_visit_goals;
create policy seller_visit_goals_update on public.seller_visit_goals
  for update to authenticated
  using ((select public.is_field_admin()))
  with check ((select public.is_field_admin()));

drop policy if exists seller_visit_goals_delete on public.seller_visit_goals;
create policy seller_visit_goals_delete on public.seller_visit_goals
  for delete to authenticated using ((select public.is_field_admin()));
