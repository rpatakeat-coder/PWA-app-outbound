-- 0086 — Unificação do Cockpit: plano da semana no formato do Cockpit
--
-- Por quê: o Julyan decidiu que o plano da semana do app de campo sai e o
-- Planejamento do Cockpit vence. A tela do app já tinha saído da Agenda em
-- 15/09/2026 (commit 5c5a774); sobrou a tabela no formato do APP (seller_id,
-- regioes por dia, leads_por_dia, dias_bloqueados). O Cockpit grava owner_id,
-- regioes em lista, grade, promessa e as travas da promessa.
--
-- As 4 linhas do APP (medido em 24/09/2026: conta de teste do RPA, Marco e
-- Guilherme com plano vazio, Whell com duas regiões — todas da semana de
-- 14/09) ficam guardadas em _backup_planos_semanais_app_20260924, com RLS
-- ligada e sem política: só o dono do banco lê. A trava confere que o backup
-- tem exatamente as linhas da tabela antes de derrubá-la.
--
-- Regras copiadas do Cockpit (xitmahwxncpdzopmdook) em 24/09/2026: o
-- executivo cria e edita o PRÓPRIO plano; o gestor lê todos e não escreve.

do $$
declare n_orig bigint; n_bkp bigint;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'planos_semanais' and column_name = 'seller_id') then
    create table if not exists public._backup_planos_semanais_app_20260924 as
      select * from public.planos_semanais;
    select count(*) into n_orig from public.planos_semanais;
    select count(*) into n_bkp from public._backup_planos_semanais_app_20260924 b
      where exists (select 1 from public.planos_semanais p where p.id = b.id);
    if n_orig <> n_bkp then
      raise exception '0086 abortada: backup tem % de % linha(s)', n_bkp, n_orig;
    end if;
    drop table public.planos_semanais;
  end if;
end $$;

alter table if exists public._backup_planos_semanais_app_20260924 enable row level security;
revoke all on table public._backup_planos_semanais_app_20260924 from anon, authenticated;

create table if not exists public.planos_semanais (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  data_segunda date not null,
  regioes jsonb not null default '[]'::jsonb,
  grade jsonb not null default '[]'::jsonb,
  fechado_em timestamptz,
  fechado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  promessa jsonb,
  promessa_dada_em timestamptz,
  promessa_dada_por text,
  promessa_travada_em timestamptz,
  promessa_travada_por text,
  constraint planos_semanais_owner_id_data_segunda_key unique (owner_id, data_segunda)
);

create index if not exists planos_semanais_owner_idx
  on public.planos_semanais (owner_id, data_segunda desc);
create index if not exists planos_semanais_promessa_idx
  on public.planos_semanais (data_segunda desc) where promessa is not null;

alter table public.planos_semanais enable row level security;

drop policy if exists planos_semanais_select_por_owner on public.planos_semanais;
create policy planos_semanais_select_por_owner on public.planos_semanais
  for select to authenticated
  using ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));

drop policy if exists planos_semanais_insert_dono on public.planos_semanais;
create policy planos_semanais_insert_dono on public.planos_semanais
  for insert to authenticated
  with check (owner_id = (select public.meu_owner_hubspot()));

drop policy if exists planos_semanais_update_dono on public.planos_semanais;
create policy planos_semanais_update_dono on public.planos_semanais
  for update to authenticated
  using (owner_id = (select public.meu_owner_hubspot()))
  with check (owner_id = (select public.meu_owner_hubspot()));
