-- ============================================================================
-- pauta_do_lider — o que o gestor decidiu fazer, e com quem
-- ============================================================================
--
-- Vem de doc-cockpit/03-banco-supabase.md. O cockpit hoje mostra muito bem
-- ONDE doi (funil travado, gargalo por etapa, quem esta' sem registro) e nada
-- sobre o que o gestor DECIDIU a respeito. Na pratica a decisao vive no
-- caderno dele, e a semana seguinte comeca sem memoria da anterior.
--
-- A `chave` e' o coracao da tabela, e ela e' unique de proposito: a mesma
-- decisao tomada duas vezes e' UMA decisao. O padrao e'
-- `<tipo>:<alvo>:<dia>`, por exemplo `cobranca_daily:<uuid>:2026-09-14`.
-- Clicar de novo no mesmo item DELETA a linha — e' assim que o botao vira um
-- interruptor idempotente em vez de empilhar duplicata a cada toque.
--
-- `alvo_seller_id` nulo significa "o time todo". Nao inventamos uma linha por
-- pessoa nesse caso: o gestor decidiu uma coisa so'.
--
-- CHAVE POR `profiles(id)`, NAO POR `hubspot_owner_id`: o pacote original usa
-- o owner do CRM, mas aqui quem esta' sem `id_hubspot` e' justamente quem mais
-- precisa aparecer na pauta do lider (foi o defeito da onda 1 — a pessoa sem
-- owner sumia do quadro). `profiles.id` existe sempre.
-- ============================================================================

create table if not exists public.pauta_do_lider (
  id             uuid primary key default gen_random_uuid(),
  -- Idempotencia: ver o comentario do topo.
  chave          text not null unique,
  tipo           text not null,
  -- null = time todo.
  alvo_seller_id uuid references public.profiles(id) on delete cascade,
  titulo         text not null,
  detalhe        text,
  -- Em que ritual isso nasceu: 'daily' | 'semana' | 'um_a_um' | 'campo'.
  -- Texto livre e' proposital: ritual novo nao deve exigir migration.
  ritual         text,
  feito          boolean not null default false,
  feito_em       timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists pauta_do_lider_alvo_idx
  on public.pauta_do_lider (alvo_seller_id, created_at desc);
create index if not exists pauta_do_lider_aberta_idx
  on public.pauta_do_lider (feito, created_at desc);

alter table public.pauta_do_lider enable row level security;

-- So' gestor, nos quatro verbos. A pauta do lider e' o caderno dele: se o
-- vendedor lesse, viraria comunicado — e comunicado tem tabela propria, com
-- confirmacao de leitura, porque as duas coisas sao diferentes.
drop policy if exists pauta_do_lider_select on public.pauta_do_lider;
create policy pauta_do_lider_select on public.pauta_do_lider
  for select to authenticated using ((select public.is_field_admin()));

drop policy if exists pauta_do_lider_insert on public.pauta_do_lider;
create policy pauta_do_lider_insert on public.pauta_do_lider
  for insert to authenticated with check ((select public.is_field_admin()));

drop policy if exists pauta_do_lider_update on public.pauta_do_lider;
create policy pauta_do_lider_update on public.pauta_do_lider
  for update to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));

drop policy if exists pauta_do_lider_delete on public.pauta_do_lider;
create policy pauta_do_lider_delete on public.pauta_do_lider
  for delete to authenticated using ((select public.is_field_admin()));

comment on table public.pauta_do_lider is
  'Decisoes do gestor, idempotentes pela coluna chave (clicar de novo deleta). So gestor le e escreve.';
