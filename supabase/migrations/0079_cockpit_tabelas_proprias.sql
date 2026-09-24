-- 0079 — Unificação do Cockpit: as tabelas que só existem no Cockpit
--
-- Por quê: em 24/09/2026 o Julyan decidiu que o Cockpit Field Sales
-- (repositório julyanrib/cockpit-unificado, Supabase xitmahwxncpdzopmdook)
-- passa a viver dentro do APP Outbound, e que as regras do Cockpit são as que
-- valem. Esta migration cria aqui as tabelas que NÃO têm par no APP, com o
-- esquema copiado do banco do Cockpit (lido em 24/09 via information_schema e
-- pg_constraint, não das migrations dele — as duas coisas divergem).
--
-- O que ela NÃO faz:
--   - não altera nenhuma tabela existente do APP (as tabelas com nome repetido,
--     como dailies e planos_semanais, ficam para uma migration própria);
--   - não copia dado nenhum (a carga vem depois, conferida por contagem);
--   - não toca o Cockpit, que continua no ar até a última fatia.
--
-- Identidade: no Cockpit, toda política cruzava o e-mail do JWT com
-- mapa_usuarios (owner_id do HubSpot + papel manager/rep). Aqui a mesma
-- pergunta se responde com profiles: o owner é profiles.id_hubspot e o gestor
-- é is_field_admin() (role = 'gestor', migration 0042). As colunas owner_id
-- continuam texto com o owner do HubSpot, como no Cockpit, porque é assim que
-- as telas dele leem e gravam.
--
-- Idempotente: pode rodar duas vezes.

-- ---------------------------------------------------------------------------
-- Quem sou eu no HubSpot (o owner_id do usuário logado)
-- ---------------------------------------------------------------------------
create or replace function public.meu_owner_hubspot()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.id_hubspot from public.profiles p where p.id = auth.uid()
$$;

comment on function public.meu_owner_hubspot() is
  'owner_id do HubSpot do usuário logado (profiles.id_hubspot). Substitui o cruzamento por e-mail com mapa_usuarios que o Cockpit fazia. NULL para quem não tem owner — e aí a política nega, nunca libera.';

revoke all on function public.meu_owner_hubspot() from public;
grant execute on function public.meu_owner_hubspot() to authenticated;

-- ---------------------------------------------------------------------------
-- planos_diarios — plano do dia do executivo (22 linhas no Cockpit)
-- ---------------------------------------------------------------------------
create table if not exists public.planos_diarios (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  data date not null,
  criado_por text,
  prioridades jsonb not null default '[]'::jsonb,
  contas_alvo jsonb not null default '[]'::jsonb,
  agenda_resumo jsonb not null default '[]'::jsonb,
  daily_snapshot jsonb,
  bloqueios text,
  observacao text,
  status text not null default 'rascunho',
  versao integer not null default 1,
  fechado_em timestamptz,
  sincronizado_em timestamptz,
  recebido_expogo_em timestamptz,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  local_atuacao text,
  local_atuacao_lat double precision,
  local_atuacao_lng double precision,
  constraint planos_diarios_owner_id_data_key unique (owner_id, data),
  constraint planos_diarios_status_check check (status = any (array[
    'rascunho', 'pronto_para_revisar', 'plano_fechado', 'aguardando_sincronizacao',
    'sincronizado', 'recebido_expogo', 'em_execucao', 'concluido']))
);

alter table public.planos_diarios enable row level security;

drop policy if exists planos_diarios_select on public.planos_diarios;
create policy planos_diarios_select on public.planos_diarios
  for select to authenticated
  using ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));

drop policy if exists planos_diarios_insert on public.planos_diarios;
create policy planos_diarios_insert on public.planos_diarios
  for insert to authenticated
  with check ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));

drop policy if exists planos_diarios_update on public.planos_diarios;
create policy planos_diarios_update on public.planos_diarios
  for update to authenticated
  using ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()))
  with check ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));

-- ---------------------------------------------------------------------------
-- sugestoes_planos — sugestão do gestor para o plano do executivo
-- ---------------------------------------------------------------------------
create table if not exists public.sugestoes_planos (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  texto text not null,
  autor text not null,
  created_at timestamptz not null default now()
);

alter table public.sugestoes_planos enable row level security;

drop policy if exists sugestoes_planos_select on public.sugestoes_planos;
create policy sugestoes_planos_select on public.sugestoes_planos
  for select to authenticated
  using ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));

drop policy if exists sugestoes_planos_insert on public.sugestoes_planos;
create policy sugestoes_planos_insert on public.sugestoes_planos
  for insert to authenticated
  with check ((select public.is_field_admin()));

-- ---------------------------------------------------------------------------
-- analise_individual_semanal / _mensal — leitura da semana por pessoa.
-- Só o gestor lê; quem escreve é o job semanal, com service_role.
-- ---------------------------------------------------------------------------
create table if not exists public.analise_individual_semanal (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  semana_label text not null,
  numero_semana_mes integer not null,
  mes_ano text not null,
  gargalo_semana text,
  como_agir text,
  tendencia text,
  created_at timestamptz not null default now()
);

alter table public.analise_individual_semanal enable row level security;

drop policy if exists analise_individual_semanal_select on public.analise_individual_semanal;
create policy analise_individual_semanal_select on public.analise_individual_semanal
  for select to authenticated
  using ((select public.is_field_admin()));

create table if not exists public.analise_individual_mensal (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  mes_ano text not null,
  resumo_mes text,
  acoes_recomendadas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analise_individual_mensal enable row level security;

drop policy if exists analise_individual_mensal_select on public.analise_individual_mensal;
create policy analise_individual_mensal_select on public.analise_individual_mensal
  for select to authenticated
  using ((select public.is_field_admin()));

-- ---------------------------------------------------------------------------
-- registros_rodada — o que o gestor registrou na rodada da Daily.
-- O CHECK é o do banco do Cockpit em 24/09. ATENÇÃO: a tela do Cockpit também
-- grava tipo 'g14_...', que este CHECK recusa — por isso a tabela está vazia
-- lá. Mantido igual de propósito: corrigir é decisão à parte, não efeito
-- colateral da migração.
-- ---------------------------------------------------------------------------
create table if not exists public.registros_rodada (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  owner_id text not null,
  data date not null,
  gestor_email text not null,
  detalhe text,
  criado_em timestamptz not null default now(),
  constraint registros_rodada_tipo_owner_id_data_key unique (tipo, owner_id, data),
  constraint registros_rodada_tipo_check check (tipo = any (array['cobranca_plano', 'reconhecimento']))
);

create index if not exists registros_rodada_owner_data on public.registros_rodada (owner_id, data);

alter table public.registros_rodada enable row level security;

drop policy if exists registros_rodada_select on public.registros_rodada;
create policy registros_rodada_select on public.registros_rodada
  for select to authenticated
  using ((select public.is_field_admin()) or owner_id = (select public.meu_owner_hubspot()));

drop policy if exists registros_rodada_escrita on public.registros_rodada;
create policy registros_rodada_escrita on public.registros_rodada
  for all to authenticated
  using ((select public.is_field_admin()) and lower(gestor_email) = lower((select auth.jwt() ->> 'email')))
  with check ((select public.is_field_admin()) and lower(gestor_email) = lower((select auth.jwt() ->> 'email')));

-- ---------------------------------------------------------------------------
-- leads_prospeccao — base de prospecção do Cockpit (3.319 linhas lá).
-- A carga NÃO vem nesta migration: antes, separar o que já existe em clients.
-- ---------------------------------------------------------------------------
create table if not exists public.leads_prospeccao (
  id uuid primary key default gen_random_uuid(),
  place_id text,
  fonte text not null,
  nome text not null,
  categoria text,
  endereco text,
  bairro text,
  cidade text not null,
  estado text,
  telefone text,
  telefone_normalizado text,
  nota numeric,
  avaliacoes integer,
  lat double precision,
  lng double precision,
  presencial boolean default true,
  delivery boolean default false,
  horario_funcionamento text,
  responsavel_owner_id text,
  status text not null default 'pendente',
  data_rota date,
  ja_existe_hubspot boolean default false,
  hubspot_company_id text,
  criado_por text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  socio text,
  cnpj text,
  data_abertura timestamptz,
  hubspot_deal_id text
);

create unique index if not exists leads_prospeccao_place_id_uniq
  on public.leads_prospeccao (place_id) where place_id is not null;
create unique index if not exists leads_prospeccao_telefone_uniq
  on public.leads_prospeccao (telefone_normalizado)
  where telefone_normalizado is not null and telefone_normalizado <> '';
create index if not exists leads_prospeccao_responsavel_idx on public.leads_prospeccao (responsavel_owner_id);
create index if not exists leads_prospeccao_data_rota_idx on public.leads_prospeccao (data_rota);

alter table public.leads_prospeccao enable row level security;

drop policy if exists leads_prospeccao_select on public.leads_prospeccao;
create policy leads_prospeccao_select on public.leads_prospeccao
  for select to authenticated
  using ((select public.is_field_admin()) or responsavel_owner_id = (select public.meu_owner_hubspot()));

drop policy if exists leads_prospeccao_insert on public.leads_prospeccao;
create policy leads_prospeccao_insert on public.leads_prospeccao
  for insert to authenticated
  with check (
    ((select public.is_field_admin()) or responsavel_owner_id = (select public.meu_owner_hubspot()))
    and (criado_por is null
         or lower(criado_por) = lower((select auth.jwt() ->> 'email'))
         or (select public.is_field_admin()))
  );

drop policy if exists leads_prospeccao_update on public.leads_prospeccao;
create policy leads_prospeccao_update on public.leads_prospeccao
  for update to authenticated
  using ((select public.is_field_admin()) or responsavel_owner_id = (select public.meu_owner_hubspot()))
  with check ((select public.is_field_admin()) or responsavel_owner_id = (select public.meu_owner_hubspot()));

-- ---------------------------------------------------------------------------
-- radar_pracas — radar semanal por praça. Qualquer logado lê; o job escreve
-- com service_role.
-- ---------------------------------------------------------------------------
create table if not exists public.radar_pracas (
  id uuid primary key default gen_random_uuid(),
  praca text not null,
  municipio text not null,
  uf text not null,
  data_semana date not null,
  tam integer,
  tam_fonte text not null default 'nao_medido',
  tam_detalhe text,
  tocado integer,
  pct_tocado numeric(5,2),
  clientes integer,
  leitura text,
  atualizado_em timestamptz not null default now(),
  constraint radar_pracas_praca_data_semana_key unique (praca, data_semana),
  constraint radar_tam_fonte_valida check (tam_fonte = any (array['contagem_api', 'piso_paginado', 'nao_medido']))
);

create index if not exists radar_pracas_semana_idx on public.radar_pracas (data_semana desc, praca);

alter table public.radar_pracas enable row level security;

drop policy if exists radar_pracas_select on public.radar_pracas;
create policy radar_pracas_select on public.radar_pracas
  for select to authenticated
  using (true);
