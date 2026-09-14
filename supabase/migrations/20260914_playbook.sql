-- ============================================================================
-- playbook_progresso + playbook_copias — o que o time estudou e o que usa
-- ============================================================================
--
-- Vem de doc-cockpit/03-banco-supabase.md. Duas perguntas diferentes:
--   progresso = "essa pessoa passou por este guia?"  (dela, e do gestor)
--   copias    = "qual script o time mais usa na rua?" (AGREGADO, de ninguem)
--
-- A SEGUNDA E' A DELICADA. Saber que o script X foi copiado 40 vezes ajuda a
-- decidir o que melhorar. Saber que a Fulana copiou o script de contorno de
-- objecao 12 vezes ontem e' vigilancia, e muda o comportamento: quem se sente
-- medido no uso do material para de usar o material.
--
-- Por isso `playbook_copias` NAO e' legivel por ninguem — nem pelo gestor. O
-- unico caminho de leitura e' a funcao `playbook_mais_copiadas`, que e'
-- SECURITY DEFINER (RLS nao restringe agregado) e devolve so' contagem. A
-- funcao exige que quem chama esteja em `profiles`, senao um token qualquer
-- leria o agregado.
-- ============================================================================

create table if not exists public.playbook_progresso (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references public.profiles(id) on delete cascade,
  guia_slug  text not null,
  tipo       text not null check (tipo in ('missao', 'leitura', 'prova')),
  concluido_em timestamptz not null default now(),
  unique (seller_id, guia_slug, tipo)
);

create index if not exists playbook_progresso_seller_idx
  on public.playbook_progresso (seller_id, concluido_em desc);

create table if not exists public.playbook_copias (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.profiles(id) on delete cascade,
  script_slug text not null,
  copiado_em  timestamptz not null default now()
);

create index if not exists playbook_copias_slug_idx
  on public.playbook_copias (script_slug, copiado_em desc);

alter table public.playbook_progresso enable row level security;
alter table public.playbook_copias enable row level security;

-- Progresso: a pessoa ve' o dela; o gestor ve' o time (e' o insumo do 1:1).
drop policy if exists playbook_progresso_select on public.playbook_progresso;
create policy playbook_progresso_select on public.playbook_progresso
  for select to authenticated
  using (seller_id = auth.uid() or (select public.is_field_admin()));

drop policy if exists playbook_progresso_insert on public.playbook_progresso;
create policy playbook_progresso_insert on public.playbook_progresso
  for insert to authenticated with check (seller_id = auth.uid());

drop policy if exists playbook_progresso_delete on public.playbook_progresso;
create policy playbook_progresso_delete on public.playbook_progresso
  for delete to authenticated using (seller_id = auth.uid());

-- Copias: escreve-se, nao se le'. RLS ligada, SELECT sem policy nenhuma — nem
-- pro gestor. Ver o comentario do topo.
drop policy if exists playbook_copias_insert on public.playbook_copias;
create policy playbook_copias_insert on public.playbook_copias
  for insert to authenticated with check (seller_id = auth.uid());

-- O unico caminho de leitura, e so' agregado.
create or replace function public.playbook_mais_copiadas(p_dias integer default 30)
returns table (script_slug text, copias bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sem isto, SECURITY DEFINER entregaria o agregado a qualquer token valido.
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'sem permissao';
  end if;
  return query
    select c.script_slug, count(*)::bigint
      from public.playbook_copias c
     where c.copiado_em >= now() - make_interval(days => greatest(p_dias, 1))
     group by c.script_slug
     order by count(*) desc;
end;
$$;

revoke all on function public.playbook_mais_copiadas(integer) from public;
grant execute on function public.playbook_mais_copiadas(integer) to authenticated;

comment on table public.playbook_copias is
  'Uso de script do playbook. NAO legivel por ninguem — so pelo agregado playbook_mais_copiadas(). Ver o comentario da migration.';
