-- 0082 — Unificação do Cockpit: PDI, pauta do líder e playbook no formato do Cockpit
--
-- Por quê: as telas do Cockpit (que passam a viver em /gestao) leem e gravam
-- estas cinco tabelas por owner_id do HubSpot e por e-mail, com colunas que o
-- APP nunca teve (pdi_compromissos guarda checked[] por versão da análise;
-- pdi_documentos guarda os compromissos em jsonb; pauta_do_lider usa
-- alvo_owner_id/criado_em; o playbook usa user_email). O Julyan decidiu que o
-- formato do Cockpit é o que vale.
--
-- Por que recriar em vez de adaptar: as cinco tabelas do APP estão VAZIAS
-- (medido em 24/09/2026: 0 linhas em cada uma) e os modelos não conversam —
-- o PDI do APP é uma linha por compromisso, o do Cockpit é uma linha por
-- pessoa e versão. Adaptar deixaria duas verdades na mesma tabela. A trava
-- abaixo garante o "vazio": com uma linha que seja, a migration inteira
-- aborta sem tocar em nada.
--
-- Esquema copiado do banco do Cockpit (xitmahwxncpdzopmdook), lido em
-- 24/09/2026 por information_schema, pg_constraint, pg_indexes e pg_policies.
-- Políticas traduzidas como na 0079: "manager em mapa_usuarios" virou
-- is_field_admin(); "mu.owner_id = X" virou X = meu_owner_hubspot(); o
-- cruzamento por e-mail do playbook continua por e-mail do JWT.
--
-- Cai junto (só servia ao formato antigo, sem uso com as tabelas vazias):
--   pdi_marcar_feito(uuid, boolean) e playbook_mais_copiadas(integer).
--
-- Fica para depois: um_a_um, modos_de_agir e combinados_* (têm par no APP
-- com recursos próprios, como o áudio do 1:1) e planos_semanais (4 linhas no
-- APP, salvar antes de trocar).
--
-- Reversível: as tabelas antigas estavam vazias; o formato anterior está nas
-- migrations 0071 (pdi), 0070 (pauta) e 0073 (playbook).

-- ---------------------------------------------------------------------------
-- Trava: só segue se as cinco tabelas do APP estiverem vazias
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['pdi_documentos','pdi_compromissos','pauta_do_lider',
                           'playbook_progresso','playbook_copias'] loop
    -- Já no formato do Cockpit = migration rodou antes; pode ter dado copiado.
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t
                 and column_name in ('owner_id','alvo_owner_id','user_email')) then
      continue;
    end if;
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception '0082 abortada: public.% tem % linha(s) no formato antigo', t, n;
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Sai o formato antigo (vazio). Só derruba o que ainda está no formato do APP.
-- ---------------------------------------------------------------------------
drop function if exists public.pdi_marcar_feito(uuid, boolean);
drop function if exists public.playbook_mais_copiadas(integer);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'pdi_compromissos' and column_name = 'pdi_id') then
    drop table public.pdi_compromissos;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'pdi_documentos' and column_name = 'seller_id') then
    drop table public.pdi_documentos;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'pauta_do_lider' and column_name = 'alvo_seller_id') then
    drop table public.pauta_do_lider;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'playbook_progresso' and column_name = 'seller_id') then
    drop table public.playbook_progresso;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'playbook_copias' and column_name = 'seller_id') then
    drop table public.playbook_copias;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- pdi_documentos — o PDI escrito pelo gestor (10 linhas no Cockpit)
-- ---------------------------------------------------------------------------
create table if not exists public.pdi_documentos (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  titulo text not null,
  caminho_arquivo text not null,
  nome_arquivo text not null,
  autor text not null,
  data date not null default current_date,
  created_at timestamptz not null default now(),
  compromissos jsonb not null default '[]'::jsonb
);

alter table public.pdi_documentos enable row level security;

drop policy if exists pdi_documentos_select_proprio_ou_gestor on public.pdi_documentos;
create policy pdi_documentos_select_proprio_ou_gestor on public.pdi_documentos
  for select to authenticated
  using (owner_id = (select public.meu_owner_hubspot()) or (select public.is_field_admin()));

drop policy if exists pdi_documentos_insert_gestor on public.pdi_documentos;
create policy pdi_documentos_insert_gestor on public.pdi_documentos
  for insert to authenticated
  with check ((select public.is_field_admin()));

drop policy if exists pdi_documentos_delete_gestor on public.pdi_documentos;
create policy pdi_documentos_delete_gestor on public.pdi_documentos
  for delete to authenticated
  using ((select public.is_field_admin()));

-- ---------------------------------------------------------------------------
-- pdi_compromissos — o que a pessoa marcou, por versão da análise (9 linhas)
-- ---------------------------------------------------------------------------
create table if not exists public.pdi_compromissos (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  versao_analise text not null,
  checked boolean[] not null default '{}'::boolean[],
  data_um_a_um text,
  atualizado_por text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  treino_feito_em timestamptz,
  treino_foco text,
  validado_em timestamptz[],
  validado_por text[],
  devolvido_em timestamptz[],
  devolvido_motivo text[],
  constraint pdi_compromissos_owner_id_versao_analise_key unique (owner_id, versao_analise)
);

alter table public.pdi_compromissos enable row level security;

drop policy if exists pdi_compromissos_select_por_owner on public.pdi_compromissos;
create policy pdi_compromissos_select_por_owner on public.pdi_compromissos
  for select to authenticated
  using ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));

drop policy if exists pdi_compromissos_insert_por_owner on public.pdi_compromissos;
create policy pdi_compromissos_insert_por_owner on public.pdi_compromissos
  for insert to authenticated
  with check ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));

drop policy if exists pdi_compromissos_update_por_owner on public.pdi_compromissos;
create policy pdi_compromissos_update_por_owner on public.pdi_compromissos
  for update to authenticated
  using ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()))
  with check ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));

-- ---------------------------------------------------------------------------
-- pauta_do_lider — o que o gestor leva ao ritual (6 linhas no Cockpit)
-- ---------------------------------------------------------------------------
create table if not exists public.pauta_do_lider (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  alvo_owner_id text,
  titulo text not null,
  detalhe text,
  ritual text not null default 'daily',
  chave text not null,
  feito boolean not null default false,
  criado_por text,
  criado_em timestamptz not null default now(),
  constraint pauta_do_lider_chave_key unique (chave)
);

create index if not exists pauta_do_lider_ritual_idx
  on public.pauta_do_lider (ritual, criado_em desc);
create index if not exists pauta_do_lider_alvo_idx
  on public.pauta_do_lider (alvo_owner_id, criado_em desc);

alter table public.pauta_do_lider enable row level security;

drop policy if exists pauta_select_gestor_ou_alvo on public.pauta_do_lider;
create policy pauta_select_gestor_ou_alvo on public.pauta_do_lider
  for select to authenticated
  using ((select public.is_field_admin())
         or alvo_owner_id is null
         or alvo_owner_id = (select public.meu_owner_hubspot()));

drop policy if exists pauta_insert_gestor on public.pauta_do_lider;
create policy pauta_insert_gestor on public.pauta_do_lider
  for insert to authenticated
  with check ((select public.is_field_admin()));

-- O executivo pode pedir pauta para si mesmo (e retirar o pedido), nada além.
drop policy if exists pauta_insert_executivo on public.pauta_do_lider;
create policy pauta_insert_executivo on public.pauta_do_lider
  for insert to authenticated
  with check (tipo = 'pedido_do_executivo'
              and alvo_owner_id = (select public.meu_owner_hubspot()));

drop policy if exists pauta_update_gestor on public.pauta_do_lider;
create policy pauta_update_gestor on public.pauta_do_lider
  for update to authenticated
  using ((select public.is_field_admin()))
  with check ((select public.is_field_admin()));

drop policy if exists pauta_delete_gestor on public.pauta_do_lider;
create policy pauta_delete_gestor on public.pauta_do_lider
  for delete to authenticated
  using ((select public.is_field_admin()));

drop policy if exists pauta_delete_executivo on public.pauta_do_lider;
create policy pauta_delete_executivo on public.pauta_do_lider
  for delete to authenticated
  using (tipo = 'pedido_do_executivo'
         and alvo_owner_id = (select public.meu_owner_hubspot()));

-- ---------------------------------------------------------------------------
-- playbook_progresso — guia concluído por pessoa (99 linhas no Cockpit)
-- ---------------------------------------------------------------------------
create table if not exists public.playbook_progresso (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  guia_slug text not null,
  tipo text not null,
  concluido_em timestamptz not null default now(),
  constraint playbook_progresso_user_email_guia_slug_key unique (user_email, guia_slug),
  constraint playbook_progresso_tipo_check check (tipo = any (array['missao', 'leitura', 'prova']))
);

create index if not exists playbook_progresso_user_idx
  on public.playbook_progresso (user_email);

alter table public.playbook_progresso enable row level security;

drop policy if exists playbook_progresso_select_proprio_ou_gestor on public.playbook_progresso;
create policy playbook_progresso_select_proprio_ou_gestor on public.playbook_progresso
  for select to authenticated
  using (lower(user_email) = lower((select auth.jwt()) ->> 'email')
         or (select public.is_field_admin()));

drop policy if exists playbook_progresso_insert_proprio on public.playbook_progresso;
create policy playbook_progresso_insert_proprio on public.playbook_progresso
  for insert to authenticated
  with check (lower(user_email) = lower((select auth.jwt()) ->> 'email'));

drop policy if exists playbook_progresso_update_proprio on public.playbook_progresso;
create policy playbook_progresso_update_proprio on public.playbook_progresso
  for update to authenticated
  using (lower(user_email) = lower((select auth.jwt()) ->> 'email'))
  with check (lower(user_email) = lower((select auth.jwt()) ->> 'email'));

-- ---------------------------------------------------------------------------
-- playbook_copias — script copiado do playbook (1 linha no Cockpit)
-- ---------------------------------------------------------------------------
create table if not exists public.playbook_copias (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  guia_slug text not null,
  copiado_em timestamptz not null default now()
);

create index if not exists playbook_copias_slug_data
  on public.playbook_copias (guia_slug, copiado_em desc);

alter table public.playbook_copias enable row level security;

drop policy if exists playbook_copias_select_proprio_ou_gestor on public.playbook_copias;
create policy playbook_copias_select_proprio_ou_gestor on public.playbook_copias
  for select to authenticated
  using (lower(user_email) = lower((select auth.jwt()) ->> 'email')
         or (select public.is_field_admin()));

drop policy if exists playbook_copias_insert_proprio on public.playbook_copias;
create policy playbook_copias_insert_proprio on public.playbook_copias
  for insert to authenticated
  with check (lower(user_email) = lower((select auth.jwt()) ->> 'email'));
