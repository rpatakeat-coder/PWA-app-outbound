-- ============================================================================
-- fila_pwa — quanto o app de campo ainda nao conseguiu subir
-- ============================================================================
--
-- Vem de doc-cockpit/03-banco-supabase.md, e a regra dela e' a lei zero do
-- pacote na forma mais pura:
--
--   AUSENCIA DE LINHA = "NAO SABEMOS", NUNCA ZERO.
--
-- Se o app nao reportou, a tela do gestor tem que dizer "sem relato do app",
-- nao "0 pendentes". Zero pendente e' uma afirmacao forte — significa "esta
-- tudo sincronizado" — e ela seria falsa justamente no caso pior: o aparelho
-- sem rede, que e' quando a fila cresce e o app nao consegue contar que
-- cresceu.
--
-- Por isso NAO ha' default em `pendentes`: a coluna e' not null e quem
-- escreve e' o app, com o numero que ele mediu. Nao existe linha "vazia".
-- ============================================================================

create table if not exists public.fila_pwa (
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  -- Dia de Brasilia.
  dia             date not null,
  -- Sem default de proposito. Ver o comentario do topo.
  pendentes       integer not null check (pendentes >= 0),
  falhas          integer not null default 0 check (falhas >= 0),
  ultima_tentativa timestamptz,
  versao_app      text,
  atualizado_em   timestamptz not null default now(),
  primary key (seller_id, dia)
);

alter table public.fila_pwa enable row level security;

drop policy if exists fila_pwa_select on public.fila_pwa;
create policy fila_pwa_select on public.fila_pwa
  for select to authenticated
  using (seller_id = auth.uid() or (select public.is_field_admin()));

-- O app reporta a PROPRIA fila. Ninguem reporta pelo aparelho de outro.
drop policy if exists fila_pwa_upsert on public.fila_pwa;
create policy fila_pwa_upsert on public.fila_pwa
  for insert to authenticated with check (seller_id = auth.uid());

drop policy if exists fila_pwa_update on public.fila_pwa;
create policy fila_pwa_update on public.fila_pwa
  for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());

comment on table public.fila_pwa is
  'Fila offline do app de campo. AUSENCIA DE LINHA = nao sabemos, nunca zero — ver o comentario da migration.';
