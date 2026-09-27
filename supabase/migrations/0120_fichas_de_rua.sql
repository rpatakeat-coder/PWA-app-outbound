-- 0120 · A ficha de rua também no banco (27/09/2026)
--
-- A ficha que o executivo preenche depois do check-in (como foi, e agora, quem decide,
-- horário do dono, sistema, dor, tipo de lugar) só existia como texto de nota no
-- HubSpot (bloco DESFECHO_VISITA v1). O Cockpit v5 pede o funil de porta (porta ->
-- decisor -> demo), o bairro e o horário que convertem e a qualidade do registro: sem
-- a ficha no banco, nada disso tem de onde sair — só lendo e interpretando nota.
--
-- O app grava UMA linha por ficha salva, com acao_id único (a mesma ficha subindo
-- duas vezes pela fila offline grava uma). A nota no HubSpot continua igual.
--
-- Quem lê: o próprio executivo (as dele) e o gestor (is_field_admin, todas). Quem
-- escreve: só o próprio, e só como ele mesmo. Não tem update nem delete pelo app.

create table if not exists public.fichas_de_rua (
  id             uuid primary key default gen_random_uuid(),
  acao_id        text not null unique,
  criado_por     uuid not null default auth.uid() references auth.users (id),
  owner_id       text,                      -- id_hubspot de quem registrou
  client_id      uuid references public.clients (id) on delete set null,
  deal_id        text,
  ocorrido_em    timestamptz not null,      -- hora do check-in
  declarada      boolean not null default false,  -- check-in sem GPS
  como_foi       text not null check (como_foi in ('falou_com_decisor', 'decisor_ausente', 'sem_interesse', 'estabelecimento_fechado')),
  proximo        text check (proximo in ('reuniao', 'voltar7', 'ligar_amanha', 'sem_interesse', 'voltar_horario', 'voltar_amanha')),
  proximo_em     date,
  proximo_tipo   text,                      -- reuniao | visita | follow-up
  etapa_antes    text,
  etapa_depois   text,                      -- a que a ficha pediu (null = não mudou)
  decisor_nome   text,
  decisor_papel  text,
  horario_dono   text,
  sistema        text,
  dor            text,
  tipo_lugar     text,
  motivo_perdido text,
  com_foto       boolean not null default false,
  bairro         text,
  cidade         text,
  criado_em      timestamptz not null default now()
);
create index if not exists fichas_de_rua_ocorrido on public.fichas_de_rua (ocorrido_em desc);
create index if not exists fichas_de_rua_owner on public.fichas_de_rua (owner_id, ocorrido_em desc);
create index if not exists fichas_de_rua_client on public.fichas_de_rua (client_id);

alter table public.fichas_de_rua enable row level security;

drop policy if exists fichas_de_rua_insere_a_propria on public.fichas_de_rua;
create policy fichas_de_rua_insere_a_propria on public.fichas_de_rua
  for insert to authenticated
  with check (criado_por = auth.uid());

drop policy if exists fichas_de_rua_le_a_propria_ou_gestor on public.fichas_de_rua;
create policy fichas_de_rua_le_a_propria_ou_gestor on public.fichas_de_rua
  for select to authenticated
  using (criado_por = auth.uid() or public.is_field_admin());
