-- Conta Alvo (Rota do dia, Fase 3): restaurantes bem avaliados (nota >= 4,5 e
-- > 100 avaliacoes) perto do vendedor, ainda NAO clientes. A edge
-- `conta-alvo-nearby` busca no Serper Maps, cacheia por celula e materializa a
-- escolhida como LEAD no clients. O Deal no HubSpot so' e' criado no CHECK-IN
-- (quando o vendedor visita) — nao aqui.

-- ===== Cache de contas-alvo qualificadas por celula (~1,5 km) =====
-- fetched_at controla o TTL: a edge so' refaz a busca no Serper se a celula
-- passou de ~14 dias (segura o custo — 12 vendedores -> ~US$0).
create table if not exists public.target_accounts (
  id uuid primary key default gen_random_uuid(),
  place_id text not null unique,          -- id estavel do Google (via Serper)
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  rating numeric,
  reviews_count integer,
  category text,
  address text,
  source text not null default 'serper',
  cell_key text not null,                 -- celula da grade (dedup de busca)
  fetched_at timestamptz not null default now(),
  -- Quando vira lead de verdade, aponta pro clients.id materializado.
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists target_accounts_cell_idx
  on public.target_accounts (cell_key, fetched_at desc);
create index if not exists target_accounts_client_idx
  on public.target_accounts (client_id);

-- ===== Marca no clients a origem "conta alvo" + o place_id =====
-- origem: de onde o lead veio ('conta_alvo' pros materializados aqui). O
-- place_id serve pra (1) nao materializar 2x o mesmo lugar e (2) o check-in
-- identificar a conta-alvo pra criar o Deal no HubSpot so' na visita.
alter table public.clients
  add column if not exists origem text,
  add column if not exists conta_alvo_place_id text;
create unique index if not exists clients_conta_alvo_place_id_uidx
  on public.clients (conta_alvo_place_id) where conta_alvo_place_id is not null;

-- ===== RLS =====
-- Leitura liberada pra autenticado (mesma linha das outras tabelas de apoio do
-- app). Escrita SO' via service role (a edge) — sem policy de insert/update/
-- delete, o cliente autenticado nao escreve.
alter table public.target_accounts enable row level security;
drop policy if exists target_accounts_select on public.target_accounts;
create policy target_accounts_select on public.target_accounts
  for select to authenticated using (true);
