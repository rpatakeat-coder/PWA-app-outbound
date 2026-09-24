-- 0083 — Unificação do Cockpit: modos de agir e combinados no formato do Cockpit
--
-- Por quê: mesma decisão da 0082. As telas do Cockpit (Semana e Raio X do
-- gestor) gravam o modo de agir por owner_id do HubSpot e o combinado da semana
-- com alvo_owner_ids, dono_rotulo, playbook_pagina, na_semanal e cumprimento
-- com cumpriu true/false. O APP tinha outro modelo (seller_id, cumprimento só
-- de quem cumpriu, created_by uuid).
--
-- As três tabelas estão VAZIAS nos dois bancos (medido em 24/09/2026), então
-- recriar não perde nada. A trava aborta se houver uma linha que seja no
-- formato antigo.
--
-- Esquema e políticas copiados do Cockpit (xitmahwxncpdzopmdook) em
-- 24/09/2026, traduzidos como na 0079: manager = is_field_admin(); o owner do
-- usuário = meu_owner_hubspot().
--
-- A gestão React antiga (gestao/src/dados/decisoes.ts) já trata erro nessas
-- leituras como "sem dado" — os blocos dela ficam vazios, a tela não cai. Ela
-- sai quando o Cockpit for servido em /gestao.
--
-- Reversível: formato anterior nas migrations 0066 (combinados) e 0069 (modos).

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['modos_de_agir','combinados_semana','combinados_cumprimento'] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t
                 and column_name in ('owner_id','alvo_owner_ids')) then
      continue;
    end if;
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception '0083 abortada: public.% tem % linha(s) no formato antigo', t, n;
      end if;
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'combinados_cumprimento' and column_name = 'seller_id') then
    drop table public.combinados_cumprimento;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'combinados_semana' and column_name = 'alvo_seller_ids') then
    drop table public.combinados_semana;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'modos_de_agir' and column_name = 'seller_id') then
    drop table public.modos_de_agir;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- modos_de_agir — a decisão do gestor sobre cada pessoa na semana
-- ---------------------------------------------------------------------------
create table if not exists public.modos_de_agir (
  id uuid primary key default gen_random_uuid(),
  data_segunda date not null,
  owner_id text not null,
  modo text not null,
  modo_sugerido text,
  definido_por text,
  definido_em timestamptz not null default now(),
  constraint modos_de_agir_data_segunda_owner_id_key unique (data_segunda, owner_id),
  constraint modos_valido check (modo = any (array['cobrar','destravar','campo','acompanhar','reconhecer'])),
  constraint modos_sugerido_valido check (modo_sugerido is null or modo_sugerido = any (
    array['cobrar','destravar','campo','acompanhar','reconhecer']))
);

create index if not exists modos_de_agir_semana_idx
  on public.modos_de_agir (data_segunda desc, owner_id);

alter table public.modos_de_agir enable row level security;

drop policy if exists modos_select_gestor on public.modos_de_agir;
create policy modos_select_gestor on public.modos_de_agir
  for select to authenticated using ((select public.is_field_admin()));
drop policy if exists modos_insert_gestor on public.modos_de_agir;
create policy modos_insert_gestor on public.modos_de_agir
  for insert to authenticated with check ((select public.is_field_admin()));
drop policy if exists modos_update_gestor on public.modos_de_agir;
create policy modos_update_gestor on public.modos_de_agir
  for update to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));
drop policy if exists modos_delete_gestor on public.modos_de_agir;
create policy modos_delete_gestor on public.modos_de_agir
  for delete to authenticated using ((select public.is_field_admin()));

-- ---------------------------------------------------------------------------
-- combinados_semana — o combinado do time na semana
-- ---------------------------------------------------------------------------
create table if not exists public.combinados_semana (
  id uuid primary key default gen_random_uuid(),
  data_segunda date not null,
  titulo text not null,
  justificativa text,
  origem_gargalo text,
  alvo_owner_ids text[] not null default '{}'::text[],
  dono_rotulo text,
  prazo date,
  playbook_pagina integer,
  status text not null default 'aberto',
  na_semanal boolean not null default false,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint combinados_semana_data_segunda_titulo_key unique (data_segunda, titulo),
  constraint combinados_status_valido check (status = any (array['aberto','cumprido','nao_cumprido'])),
  constraint combinados_gargalo_valido check (origem_gargalo is null or origem_gargalo = any (
    array['etapa','cadencia','boca_do_funil']))
);

create index if not exists combinados_semana_semana_idx
  on public.combinados_semana (data_segunda desc);

alter table public.combinados_semana enable row level security;

-- Combinado sem alvo é do time inteiro; com alvo, só o gestor e os alvos veem.
drop policy if exists combinados_select_gestor_ou_alvo on public.combinados_semana;
create policy combinados_select_gestor_ou_alvo on public.combinados_semana
  for select to authenticated
  using ((select public.is_field_admin())
         or cardinality(alvo_owner_ids) = 0
         or (select public.meu_owner_hubspot()) = any (alvo_owner_ids));
drop policy if exists combinados_insert_gestor on public.combinados_semana;
create policy combinados_insert_gestor on public.combinados_semana
  for insert to authenticated with check ((select public.is_field_admin()));
drop policy if exists combinados_update_gestor on public.combinados_semana;
create policy combinados_update_gestor on public.combinados_semana
  for update to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));
drop policy if exists combinados_delete_gestor on public.combinados_semana;
create policy combinados_delete_gestor on public.combinados_semana
  for delete to authenticated using ((select public.is_field_admin()));

-- ---------------------------------------------------------------------------
-- combinados_cumprimento — quem cumpriu (ou não) o combinado
-- ---------------------------------------------------------------------------
create table if not exists public.combinados_cumprimento (
  id uuid primary key default gen_random_uuid(),
  combinado_id uuid not null references public.combinados_semana(id) on delete cascade,
  owner_id text not null,
  cumpriu boolean not null,
  marcado_por text,
  marcado_em timestamptz not null default now(),
  constraint combinados_cumprimento_combinado_id_owner_id_key unique (combinado_id, owner_id)
);

create index if not exists combinados_cumprimento_combinado_idx
  on public.combinados_cumprimento (combinado_id);

alter table public.combinados_cumprimento enable row level security;

drop policy if exists cumprimento_select_gestor_ou_proprio on public.combinados_cumprimento;
create policy cumprimento_select_gestor_ou_proprio on public.combinados_cumprimento
  for select to authenticated
  using ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));
drop policy if exists cumprimento_insert_gestor on public.combinados_cumprimento;
create policy cumprimento_insert_gestor on public.combinados_cumprimento
  for insert to authenticated with check ((select public.is_field_admin()));
drop policy if exists cumprimento_update_gestor on public.combinados_cumprimento;
create policy cumprimento_update_gestor on public.combinados_cumprimento
  for update to authenticated
  using ((select public.is_field_admin())) with check ((select public.is_field_admin()));
drop policy if exists cumprimento_delete_gestor on public.combinados_cumprimento;
create policy cumprimento_delete_gestor on public.combinados_cumprimento
  for delete to authenticated using ((select public.is_field_admin()));
