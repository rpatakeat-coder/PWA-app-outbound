-- ============================================================================
-- pdi_documentos + pdi_compromissos — o PDI, e os dois lados dele
-- ============================================================================
--
-- Vem de doc-cockpit/03-banco-supabase.md. A migration do `um_a_um`
-- (20260814) parou de proposito antes desta parte, com a anotacao: "precisa da
-- metade do vendedor, que vive no app de campo. Criar as tabelas agora
-- deixaria o gestor marcando compromisso que o vendedor nunca ve — pior que
-- nao ter, porque parece que funciona." Agora a metade do vendedor entra.
--
-- O DESENHO DO ESPELHO, que e' a parte delicada:
--   - o COMPROMISSO e' do vendedor. Ele marca, ele desmarca.
--   - o gestor NAO marca por ele. O gestor VALIDA (ou DEVOLVE com motivo).
-- Se o gestor pudesse marcar, o PDI viraria a lista do gestor sobre a pessoa,
-- e o "feito" deixaria de significar que a pessoa fez.
--
-- `validado_em` / `devolvido_em` sao timestamps separados, e `devolvido_motivo`
-- e' obrigatorio na devolucao (check abaixo): devolver sem motivo e' recusar
-- sem dizer por que, e a pessoa fica sem saber o que refazer.
-- ============================================================================

create table if not exists public.pdi_documentos (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.profiles(id) on delete cascade,
  titulo      text not null,
  -- Caminho no storage (mesmo padrao de um_a_um_documentos).
  arquivo_caminho text,
  -- Periodo a que o PDI se refere.
  vigente_de  date,
  vigente_ate date,
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pdi_documentos_seller_idx
  on public.pdi_documentos (seller_id, created_at desc);

create table if not exists public.pdi_compromissos (
  id          uuid primary key default gen_random_uuid(),
  pdi_id      uuid not null references public.pdi_documentos(id) on delete cascade,
  seller_id   uuid not null references public.profiles(id) on delete cascade,
  texto       text not null,
  ordem       integer not null default 0,

  -- ----- a metade do VENDEDOR -----
  feito_em    timestamptz,

  -- ----- a metade do GESTOR -----
  validado_em      timestamptz,
  validado_por     uuid references auth.users(id) on delete set null,
  devolvido_em     timestamptz,
  devolvido_por    uuid references auth.users(id) on delete set null,
  devolvido_motivo text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Devolver sem motivo e' recusar sem dizer por que. Ver o topo.
  constraint pdi_devolucao_tem_motivo
    check (devolvido_em is null or coalesce(btrim(devolvido_motivo), '') <> '')
);

create index if not exists pdi_compromissos_seller_idx
  on public.pdi_compromissos (seller_id, pdi_id, ordem);

alter table public.pdi_documentos enable row level security;
alter table public.pdi_compromissos enable row level security;

-- O PDI e' da pessoa: ela le' o proprio; o gestor le' todos.
drop policy if exists pdi_documentos_select on public.pdi_documentos;
create policy pdi_documentos_select on public.pdi_documentos
  for select to authenticated
  using (seller_id = auth.uid() or (select public.is_field_admin()));

-- Quem cria e edita o documento e' o gestor (e' ele quem monta o plano).
drop policy if exists pdi_documentos_escrita on public.pdi_documentos;
create policy pdi_documentos_escrita on public.pdi_documentos
  for all to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));

drop policy if exists pdi_compromissos_select on public.pdi_compromissos;
create policy pdi_compromissos_select on public.pdi_compromissos
  for select to authenticated
  using (seller_id = auth.uid() or (select public.is_field_admin()));

-- Criar/apagar compromisso e' do gestor (ele escreve o plano).
drop policy if exists pdi_compromissos_insert on public.pdi_compromissos;
create policy pdi_compromissos_insert on public.pdi_compromissos
  for insert to authenticated with check ((select public.is_field_admin()));

drop policy if exists pdi_compromissos_delete on public.pdi_compromissos;
create policy pdi_compromissos_delete on public.pdi_compromissos
  for delete to authenticated using ((select public.is_field_admin()));

-- UPDATE e' dos DOIS — e' aqui que o espelho acontece. A separacao de QUEM
-- pode mexer em QUAL coluna nao cabe em RLS (policy nao enxerga coluna);
-- fica na funcao abaixo, que e' por onde o app escreve.
drop policy if exists pdi_compromissos_update on public.pdi_compromissos;
create policy pdi_compromissos_update on public.pdi_compromissos
  for update to authenticated
  using (seller_id = auth.uid() or (select public.is_field_admin()))
  with check (seller_id = auth.uid() or (select public.is_field_admin()));

-- O vendedor marca/desmarca o PROPRIO compromisso, e so' isso. Existe como
-- funcao porque RLS nao restringe coluna: sem ela, a policy de update acima
-- deixaria o vendedor escrever `validado_em` em si mesmo.
create or replace function public.pdi_marcar_feito(p_compromisso uuid, p_feito boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pdi_compromissos
     set feito_em = case when p_feito then now() else null end,
         updated_at = now()
   where id = p_compromisso
     and seller_id = auth.uid();
  if not found then
    raise exception 'compromisso nao encontrado ou nao e seu';
  end if;
end;
$$;

revoke all on function public.pdi_marcar_feito(uuid, boolean) from public;
grant execute on function public.pdi_marcar_feito(uuid, boolean) to authenticated;

comment on table public.pdi_documentos is
  'PDI da pessoa. Ela le o proprio; gestor le e escreve todos.';
comment on table public.pdi_compromissos is
  'Compromissos do PDI. O VENDEDOR marca feito (via pdi_marcar_feito); o GESTOR valida ou devolve com motivo.';
