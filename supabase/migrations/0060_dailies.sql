-- ============================================================================
-- dailies — a promessa do dia, declarada pelo proprio vendedor
-- ============================================================================
--
-- O placar do gestor ja' comparava feito x planejado usando as paradas da Rota
-- do dia. Isso media PLANEJAMENTO. Esta tabela mede COMPROMISSO: montar rota e'
-- organizar o dia; dizer "hoje faco 8" e' dar a palavra. A Daily do documento
-- de referencia e' um ritual gamificado (pontos, sequencia, "palavra e'
-- palavra") e essa parte so' funciona se a pessoa DECLARA.
--
-- A rota continua valendo como piso. A ordem de precedencia no placar passa a
-- ser:  prometido declarado  ->  paradas da rota  ->  meta padrao.
--
-- RLS DIFERENTE DO RESTO DO 1:1
-- `um_a_um` e seus documentos sao do GESTOR (conversa sobre a pessoa). Isto
-- aqui e' DA PESSOA: ela escreve, ela le', e o gestor le' junto. Por isso o
-- vendedor tem insert/update do proprio dia — e so' do proprio.
--
-- `realizado` NAO existe como coluna, de proposito. O feito e' derivado de
-- client_visits, que e' check-in com GPS. Um campo digitavel de "quantas fiz"
-- seria um numero que compete com a operacao real e sempre perde.
-- ============================================================================

create table if not exists public.dailies (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references public.profiles(id) on delete cascade,
  -- DATE, nao timestamptz: e' o dia civil de Brasilia, e a promessa de terca
  -- nao pode virar de segunda por causa de fuso.
  data       date not null,
  -- Quantas visitas a pessoa se comprometeu a fazer. NULL = ainda nao declarou.
  prometido_visitas integer check (prometido_visitas is null or prometido_visitas between 0 and 50),
  -- "o que travou / o que rendeu" — escrito no fim do dia. Vira insumo do 1:1.
  nota_campo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um registro por pessoa por dia. E' o que deixa o upsert simples e impede
  -- duas promessas concorrentes pro mesmo dia.
  unique (seller_id, data)
);

create index if not exists dailies_data_idx on public.dailies (data desc);

alter table public.dailies enable row level security;

-- LEITURA: a propria pessoa, e o gestor (que precisa montar o placar do time).
drop policy if exists dailies_select on public.dailies;
create policy dailies_select on public.dailies
  for select to authenticated
  using (seller_id = auth.uid() or (select public.is_field_admin()));

-- ESCRITA: SO' a propria pessoa. O gestor NAO promete no lugar de ninguem —
-- se pudesse, a promessa deixaria de ser palavra dada e viraria meta imposta
-- com outro nome, e o placar mediria a coisa errada.
drop policy if exists dailies_insert on public.dailies;
create policy dailies_insert on public.dailies
  for insert to authenticated with check (seller_id = auth.uid());

drop policy if exists dailies_update on public.dailies;
create policy dailies_update on public.dailies
  for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

comment on table public.dailies is
  'Promessa diaria do vendedor (quantas visitas fara hoje) e a nota de campo. O REALIZADO nao mora aqui: vem de client_visits.';
