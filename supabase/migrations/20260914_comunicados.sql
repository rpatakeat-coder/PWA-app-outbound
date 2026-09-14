-- ============================================================================
-- comunicados + comunicados_lidos — recado do gestor, com confirmacao
-- ============================================================================
--
-- Vem de doc-cockpit/03-banco-supabase.md. O que distingue isto da
-- `pauta_do_lider` (que e' o caderno do gestor, so' dele) e' a segunda tabela:
-- aqui existe confirmacao de leitura. Um recado sem confirmacao e' um recado
-- que o gestor acha que deu.
--
-- A REGRA QUE IMPORTA: quem confirma e' o proprio leitor, e so' por si mesmo.
-- O `with check (leitor_id = auth.uid())` impede que alguem marque como lido
-- por outra pessoa — inclusive o gestor. "Fulano leu" precisa vir do Fulano,
-- senao o numero de leitura vira enfeite.
--
-- AUSENCIA DE LINHA E' "NAO LEU", E ISSO E' VERDADE, nao "nao medido": a linha
-- so' nasce por acao do leitor. E' o unico lugar destas migrations onde a
-- ausencia pode virar um numero, e vale dizer por que: nao ha' caminho em que
-- a leitura aconteca sem gravar. Nos outros casos (fila do app, carteira sem
-- owner) a ausencia significa que nao conseguimos medir, e ai' vira '—'.
-- ============================================================================

create table if not exists public.comunicados (
  id          uuid primary key default gen_random_uuid(),
  -- 'aviso' | 'comemoracao' | 'processo' — texto livre: tipo novo nao deve
  -- exigir migration.
  tipo        text not null default 'aviso',
  titulo      text not null,
  mensagem    text not null,
  imagem_url  text,
  -- Publicado = visivel pro time. Rascunho fica so' com o gestor.
  publicado_em timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists comunicados_publicados_idx
  on public.comunicados (publicado_em desc nulls last);

create table if not exists public.comunicados_lidos (
  comunicado_id uuid not null references public.comunicados(id) on delete cascade,
  leitor_id     uuid not null references public.profiles(id) on delete cascade,
  lido_em       timestamptz not null default now(),
  primary key (comunicado_id, leitor_id)
);

alter table public.comunicados enable row level security;
alter table public.comunicados_lidos enable row level security;

-- Time le' so' o que foi PUBLICADO; gestor le' tudo, inclusive rascunho.
drop policy if exists comunicados_select on public.comunicados;
create policy comunicados_select on public.comunicados
  for select to authenticated
  using (publicado_em is not null or (select public.is_field_admin()));

drop policy if exists comunicados_escrita on public.comunicados;
create policy comunicados_escrita on public.comunicados
  for all to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));

-- Leitura do agregado: o gestor precisa saber quem leu. Cada pessoa tambem ve'
-- as proprias confirmacoes (pra tela saber o que ja' mostrou).
drop policy if exists comunicados_lidos_select on public.comunicados_lidos;
create policy comunicados_lidos_select on public.comunicados_lidos
  for select to authenticated
  using (leitor_id = auth.uid() or (select public.is_field_admin()));

-- SO' o proprio leitor confirma. Ver o comentario do topo.
drop policy if exists comunicados_lidos_insert on public.comunicados_lidos;
create policy comunicados_lidos_insert on public.comunicados_lidos
  for insert to authenticated with check (leitor_id = auth.uid());

comment on table public.comunicados is
  'Recado do gestor pro time. Rascunho (publicado_em null) so o gestor ve.';
comment on table public.comunicados_lidos is
  'Confirmacao de leitura. SO o proprio leitor insere — nem o gestor marca por outro.';
