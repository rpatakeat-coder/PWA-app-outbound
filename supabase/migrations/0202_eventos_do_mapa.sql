-- 0202 · A medição do mapa do executivo (prancha "Mapa do Executivo", Claude Design, 15/10/26).
--
-- §4c e decisões 5 e 6: o que diz se o mapa novo vende mais.
--   primeiro_toque   · do mapa aberto até o 1º Ir ou Cheguei (dados: acao, ms) — meta < 3 s
--   fala_aberta      · tocou em "Fala pronta ›" / "Playbook ›" (dados: gatilho_id 1–9)
--   halo_sugerido    · a porta sugerida depois do plano (dados: porta, pontos, parcelas)
--   halo_aceito      · Cheguei nessa porta em até 30 min (dados: porta, minutos)
--   referencia_tocada· tocou em "N clientes Takeat a 300 m" (dados: n)
-- Abaixo de 40% de halo aceito, recalibrar os pesos (versão futura, com base nestes eventos).
--
-- Só ADICIONA: tabela nova, nenhuma linha de outra tabela é tocada. O app grava sem esperar e,
-- sem esta tabela, perde o evento em silêncio (src/utils/eventosDoMapa.ts).
-- Quem lê: o gestor (is_field_admin). Quem grava: cada um, só como si mesmo.

create table if not exists public.eventos_do_mapa (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('primeiro_toque', 'fala_aberta', 'halo_sugerido', 'halo_aceito', 'referencia_tocada')),
  dados jsonb not null default '{}'::jsonb
);

create index if not exists eventos_do_mapa_tipo_criado on public.eventos_do_mapa (tipo, criado_em desc);
create index if not exists eventos_do_mapa_user_criado on public.eventos_do_mapa (user_id, criado_em desc);

alter table public.eventos_do_mapa enable row level security;

drop policy if exists eventos_do_mapa_grava_o_proprio on public.eventos_do_mapa;
create policy eventos_do_mapa_grava_o_proprio on public.eventos_do_mapa
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists eventos_do_mapa_le_o_proprio_ou_gestor on public.eventos_do_mapa;
create policy eventos_do_mapa_le_o_proprio_ou_gestor on public.eventos_do_mapa
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_field_admin()));

grant insert, select on public.eventos_do_mapa to authenticated;

-- Conferência depois de aplicar (leitura):
--   select tipo, count(*) from public.eventos_do_mapa group by 1 order by 1;
