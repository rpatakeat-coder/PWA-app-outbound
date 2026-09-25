-- 0089 — Unificação do Cockpit: snapshot do CRM, farol e caches do servidor
--
-- Por quê: o Cockpit não lê o HubSpot na hora de abrir. Um robô monta o
-- snapshot do CRM (cockpit_snapshot: chaves hubspot, narrativas,
-- resumo-semanal, weekly-raw, sync-status, hubspot-previous,
-- historico-semanal-mes) e incrementa snapshot_farol, que a tela escuta pelo
-- Realtime para saber que há dado novo. Para o Cockpit viver em /gestao do
-- APP, essas tabelas precisam existir aqui, com o mesmo formato.
--
-- Junto vêm as tabelas de apoio que as telas e rotas do Cockpit usam:
--   perfis             avatar por e-mail (a tela grava em avatares/<email>/)
--   noticias_setor     radar semanal de notícias do setor
--   novidades_mercado  cache da Casa dos Dados (servidor)
--   restaurantes_osm   cache do OpenStreetMap (servidor)
--   webhook_cooldown   trava de 30 min do webhook do HubSpot (servidor)
--
-- Esquema e políticas copiados do Cockpit (xitmahwxncpdzopmdook) em 24/09/2026.
-- As tabelas "de servidor" ficam com RLS ligada e SEM política, como lá: só o
-- service_role (Edge Functions) lê e grava. perfis perdeu a FK para
-- mapa_usuarios, que não existe no APP (a identidade aqui é profiles).
-- fila_pwa já existe no APP com outro formato e fica para uma migration-ponte.
--
-- Aditiva e idempotente: não toca tabela existente.

create table if not exists public.cockpit_snapshot (
  chave text primary key,
  conteudo jsonb,
  bytes integer,
  atualizado_em timestamptz not null default now(),
  origem text
);
alter table public.cockpit_snapshot enable row level security;

create table if not exists public.snapshot_farol (
  chave text primary key,
  versao bigint not null default 1,
  atualizado_em timestamptz not null default now(),
  origem text
);
alter table public.snapshot_farol enable row level security;
drop policy if exists "farol legivel por quem esta logado" on public.snapshot_farol;
create policy "farol legivel por quem esta logado" on public.snapshot_farol
  for select to authenticated using (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'snapshot_farol') then
    alter publication supabase_realtime add table public.snapshot_farol;
  end if;
end $$;

create table if not exists public.perfis (
  email text primary key,
  foto_caminho text,
  updated_at timestamptz not null default now()
);
alter table public.perfis enable row level security;
drop policy if exists "leitura perfis" on public.perfis;
create policy "leitura perfis" on public.perfis
  for select to authenticated using (true);
drop policy if exists "criar proprio perfil" on public.perfis;
create policy "criar proprio perfil" on public.perfis
  for insert to authenticated with check (lower(email) = lower((select auth.email())));
drop policy if exists "atualizar proprio perfil" on public.perfis;
create policy "atualizar proprio perfil" on public.perfis
  for update to authenticated
  using (lower(email) = lower((select auth.email())))
  with check (lower(email) = lower((select auth.email())));

create table if not exists public.noticias_setor (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  fonte text,
  origem text,
  url text,
  publicado_em timestamptz,
  tema text,
  praca text,
  data_semana date,
  coletado_em timestamptz not null default now(),
  relevancia integer,
  relevancia_motivo text,
  constraint noticias_setor_url_key unique (url)
);
create index if not exists noticias_setor_semana_idx
  on public.noticias_setor (data_semana desc, publicado_em desc);
create index if not exists noticias_setor_relevancia_idx
  on public.noticias_setor (data_semana desc, relevancia desc nulls last, publicado_em desc);
alter table public.noticias_setor enable row level security;
drop policy if exists "noticias legiveis por quem esta logado" on public.noticias_setor;
create policy "noticias legiveis por quem esta logado" on public.noticias_setor
  for select to authenticated using (true);

create table if not exists public.novidades_mercado (
  chave text primary key,
  itens jsonb not null default '[]'::jsonb,
  buscado_em timestamptz not null default now()
);
create index if not exists novidades_mercado_buscado_em_idx
  on public.novidades_mercado (buscado_em desc);
alter table public.novidades_mercado enable row level security;

create table if not exists public.restaurantes_osm (
  chave text primary key,
  lat double precision,
  lng double precision,
  raio_m integer,
  itens jsonb not null default '[]'::jsonb,
  buscado_em timestamptz not null default now()
);
create index if not exists restaurantes_osm_buscado_em_idx
  on public.restaurantes_osm (buscado_em desc);
alter table public.restaurantes_osm enable row level security;

create table if not exists public.webhook_cooldown (
  id integer primary key,
  ultimo_disparo_em timestamptz not null default '2000-01-01 00:00:00+00'
);
alter table public.webhook_cooldown enable row level security;
insert into public.webhook_cooldown (id) values (1) on conflict (id) do nothing;
