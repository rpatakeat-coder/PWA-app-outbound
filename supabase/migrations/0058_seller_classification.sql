-- Classificação de usuário definida pelo gestor: quem é vendedor ativo, quem é
-- usuário comum (sem meta) e quem não é vendedor. Substitui a heurística
-- (role/id_hubspot) por uma escolha explícita. Sem linha = 'ativo' (default,
-- preserva o comportamento atual até o gestor curar).
--
--   ativo         -> rankings + metas + filtros de vendedor
--   sem_meta      -> aparece nos rankings/histórico, mas sem meta
--   nao_vendedor  -> sumido dos rankings/metas/filtros
create table if not exists public.seller_classification (
  seller_id  uuid primary key references public.profiles(id) on delete cascade,
  status     text not null default 'ativo' check (status in ('ativo','sem_meta','nao_vendedor')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- RLS: qualquer autenticado LÊ (o app aplica); só gestor EDITA.
alter table public.seller_classification enable row level security;

drop policy if exists seller_classification_select on public.seller_classification;
create policy seller_classification_select on public.seller_classification
  for select to authenticated using (true);

drop policy if exists seller_classification_insert on public.seller_classification;
create policy seller_classification_insert on public.seller_classification
  for insert to authenticated with check ((select public.is_field_admin()));

drop policy if exists seller_classification_update on public.seller_classification;
create policy seller_classification_update on public.seller_classification
  for update to authenticated
  using ((select public.is_field_admin()))
  with check ((select public.is_field_admin()));

drop policy if exists seller_classification_delete on public.seller_classification;
create policy seller_classification_delete on public.seller_classification
  for delete to authenticated using ((select public.is_field_admin()));
