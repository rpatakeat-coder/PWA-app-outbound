-- ============================================================================
-- um_a_um — registro das conversas de 1:1 do gestor com cada vendedor
-- ============================================================================
--
-- E' o unico pedaco da "Fase 7" do doc de replicacao que da' pra entregar
-- inteiro agora, e a razao e' simples: ele e' de UM lado so'.
--
-- Os outros (pdi_compromissos com checkbox espelhado, comunicados com
-- confirmacao de leitura) precisam da metade do vendedor, que vive no app de
-- campo. Criar as tabelas agora deixaria o gestor marcando compromisso que o
-- vendedor nunca ve — pior que nao ter, porque parece que funciona.
--
-- Aqui nao: o historico do 1:1 e' a anotacao do gestor sobre a conversa. Ele
-- sozinho ja' responde "o que eu combinei com essa pessoa da ultima vez?", que
-- e' a pergunta que abre todo 1:1.
--
-- PRIVACIDADE: so' gestor le' e escreve. Anotacao de 1:1 nao e' documento
-- publico do time — se o vendedor pudesse ler, o gestor deixaria de registrar
-- o que importa, e a tabela morreria cheia de amenidade.
-- ============================================================================

create table if not exists public.um_a_um (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references public.profiles(id) on delete cascade,
  realizado_em timestamptz not null default now(),
  -- O que foi conversado. Texto livre de proposito: pauta de 1:1 nao cabe em
  -- campo estruturado, e estruturar cedo demais faz o gestor parar de escrever.
  pauta        text,
  -- O que ficou combinado. Separado da pauta porque e' o que se cobra na
  -- proxima conversa — a pergunta "o que combinamos?" tem resposta propria.
  combinado    text,
  created_by      uuid references auth.users(id) on delete set null,
  -- Snapshot do autor, mesmo padrao de client_notes: se o gestor sair ou trocar
  -- de nome, o registro antigo continua dizendo quem escreveu na epoca.
  created_by_name text,
  created_at   timestamptz not null default now()
);

create index if not exists um_a_um_seller_idx
  on public.um_a_um (seller_id, realizado_em desc);

alter table public.um_a_um enable row level security;

-- is_field_admin() e' a mesma funcao que ja' guarda seller_visit_goals e
-- route_config — nao inventamos um segundo conceito de "quem e' gestor".
drop policy if exists um_a_um_select on public.um_a_um;
create policy um_a_um_select on public.um_a_um
  for select to authenticated using ((select public.is_field_admin()));

drop policy if exists um_a_um_insert on public.um_a_um;
create policy um_a_um_insert on public.um_a_um
  for insert to authenticated with check ((select public.is_field_admin()));

drop policy if exists um_a_um_update on public.um_a_um;
create policy um_a_um_update on public.um_a_um
  for update to authenticated
  using ((select public.is_field_admin()))
  with check ((select public.is_field_admin()));

drop policy if exists um_a_um_delete on public.um_a_um;
create policy um_a_um_delete on public.um_a_um
  for delete to authenticated using ((select public.is_field_admin()));

comment on table public.um_a_um is
  'Historico de 1:1 do gestor com cada vendedor. Visivel SO para gestor (is_field_admin). Escrito pelo cockpit de gestao, aba Pessoas.';
