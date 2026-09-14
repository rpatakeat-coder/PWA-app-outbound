-- ============================================================================
-- combinados_semana + combinados_cumprimento — o combinado da semana
-- ============================================================================
--
-- Vem de doc-cockpit/03-banco-supabase.md e da tela Semana. A ideia: o gargalo
-- numero 1 da semana vira UM combinado, escrito, com prazo e com nome de quem
-- ele vale. Sem isso a leitura semanal termina em "precisamos melhorar
-- Negociacao" e a semana seguinte encontra o mesmo gargalo intacto.
--
-- `justificativa` guarda os NUMEROS que motivaram o combinado ("21 de 26
-- passaram do prazo de 5 dias"). Guardar o numero junto e' o que permite, na
-- semana seguinte, dizer se mudou — um combinado sem a medida de origem nao
-- tem como ser avaliado, so' lembrado.
--
-- `alvo_seller_ids` e' array e pode ser vazio: vazio significa "vale pro time
-- todo", nao "ninguem". A diferenca importa porque a tela conta gente.
--
-- O CUMPRIMENTO E' TABELA SEPARADA, e o unique e' (combinado, pessoa). Marcar
-- duas vezes e' marcar uma. E quem marcou fica registrado: "cumpriu" e' uma
-- afirmacao sobre o trabalho de alguem, entao ela tem autor.
-- ============================================================================

create table if not exists public.combinados_semana (
  id              uuid primary key default gen_random_uuid(),
  -- Segunda-feira da semana, em Brasilia. Mesma chave de tudo que e' semanal.
  data_segunda    date not null,
  titulo          text not null,
  -- Os numeros que motivaram. Ver o comentario do topo.
  justificativa   text,
  -- De qual gargalo saiu (etapa do funil, ou texto livre).
  origem_gargalo  text,
  -- Vazio = time todo.
  alvo_seller_ids uuid[] not null default '{}',
  prazo           date,
  status          text not null default 'aberto'
                  check (status in ('aberto', 'cumprido', 'nao_cumprido')),
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (data_segunda, titulo)
);

create index if not exists combinados_semana_semana_idx
  on public.combinados_semana (data_segunda desc);

create table if not exists public.combinados_cumprimento (
  id           uuid primary key default gen_random_uuid(),
  combinado_id uuid not null references public.combinados_semana(id) on delete cascade,
  seller_id    uuid not null references public.profiles(id) on delete cascade,
  marcado_em   timestamptz not null default now(),
  -- "Cumpriu" e' uma afirmacao sobre o trabalho de alguem: tem autor.
  marcado_por      uuid references auth.users(id) on delete set null,
  marcado_por_nome text,
  unique (combinado_id, seller_id)
);

alter table public.combinados_semana enable row level security;
alter table public.combinados_cumprimento enable row level security;

-- Combinado da semana o TIME pode ler: e' o contrato coletivo, e um contrato
-- que so' o gestor enxerga nao e' contrato. Escrita continua so' do gestor.
drop policy if exists combinados_semana_select on public.combinados_semana;
create policy combinados_semana_select on public.combinados_semana
  for select to authenticated using (true);

drop policy if exists combinados_semana_escrita on public.combinados_semana;
create policy combinados_semana_escrita on public.combinados_semana
  for all to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));

drop policy if exists combinados_cumprimento_select on public.combinados_cumprimento;
create policy combinados_cumprimento_select on public.combinados_cumprimento
  for select to authenticated using (true);

drop policy if exists combinados_cumprimento_escrita on public.combinados_cumprimento;
create policy combinados_cumprimento_escrita on public.combinados_cumprimento
  for all to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));

comment on table public.combinados_semana is
  'O combinado da semana, derivado do gargalo n1. Time le; so gestor escreve.';
comment on table public.combinados_cumprimento is
  'Quem cumpriu o combinado, com autor da marcacao. Unique (combinado, pessoa) = idempotente.';
