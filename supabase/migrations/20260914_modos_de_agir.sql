-- ============================================================================
-- modos_de_agir — como o gestor escolheu agir com cada pessoa, nesta semana
-- ============================================================================
--
-- Vem de doc-cockpit/03-banco-supabase.md. Cinco modos: cobrar, destravar,
-- campo, acompanhar, reconhecer. O cockpit ja' sabe SUGERIR (o semaforo da
-- tela Pessoas ordena a fila do 1:1); o que falta e' guardar o que o gestor
-- decidiu de fato.
--
-- A COLUNA QUE FAZ ESTA TABELA VALER A PENA E' `modo_sugerido`.
-- Ela guarda o que o sistema propunha QUANDO o gestor escolheu outra coisa.
-- Sem ela nao ha' como saber se o semaforo esta' calibrado: um semaforo que o
-- gestor contraria toda semana esta' errado, e sem o registro da divergencia
-- isso nunca aparece — a ferramenta seguiria sugerindo e sendo ignorada em
-- silencio.
--
-- Unique (data_segunda, seller_id): uma decisao por pessoa por semana. Mudar
-- de ideia sobrescreve, nao empilha.
-- ============================================================================

create table if not exists public.modos_de_agir (
  id            uuid primary key default gen_random_uuid(),
  data_segunda  date not null,
  seller_id     uuid not null references public.profiles(id) on delete cascade,
  modo          text not null
                check (modo in ('cobrar', 'destravar', 'campo', 'acompanhar', 'reconhecer')),
  -- O que o sistema propunha. Ver o comentario do topo — e' o motivo da tabela.
  -- Null = nao havia sugestao (pessoa nao medida, por exemplo).
  modo_sugerido text
                check (modo_sugerido is null or
                       modo_sugerido in ('cobrar', 'destravar', 'campo', 'acompanhar', 'reconhecer')),
  nota          text,
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (data_segunda, seller_id)
);

create index if not exists modos_de_agir_semana_idx
  on public.modos_de_agir (data_segunda desc, seller_id);

alter table public.modos_de_agir enable row level security;

-- So' gestor. "Vou cobrar o fulano" e' anotacao de gestao, nao recado — se o
-- vendedor lesse, o gestor pararia de registrar o modo verdadeiro, e a coluna
-- `modo_sugerido` perderia justamente o valor que justifica a tabela.
drop policy if exists modos_de_agir_select on public.modos_de_agir;
create policy modos_de_agir_select on public.modos_de_agir
  for select to authenticated using ((select public.is_field_admin()));

drop policy if exists modos_de_agir_escrita on public.modos_de_agir;
create policy modos_de_agir_escrita on public.modos_de_agir
  for all to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));

comment on table public.modos_de_agir is
  'Como o gestor decidiu agir com cada pessoa na semana. modo_sugerido guarda o que o sistema propunha, para medir se o semaforo esta calibrado. So gestor.';
