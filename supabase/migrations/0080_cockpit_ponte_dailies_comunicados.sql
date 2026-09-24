-- 0080 — Unificação do Cockpit: dailies, comunicados e comunicados_lidos
--          passam a aceitar o formato do Cockpit, sem deixar de aceitar o do APP
--
-- Por quê: as três tabelas existem nos dois sistemas com o mesmo nome e
-- formatos diferentes, e o app de campo usa as três hoje (card Minha Daily e
-- aviso de comunicados). Em vez de trocar uma pela outra — o que derrubaria o
-- app em campo —, cada tabela passa a guardar as colunas dos dois lados, e um
-- gatilho completa a identidade que faltar:
--
--   - quem grava pelo Cockpit manda o owner do HubSpot (owner_id) ou o e-mail;
--   - quem grava pelo APP manda o usuário (seller_id / leitor_id);
--   - o gatilho preenche o outro lado a partir de profiles.
--
-- Fica UMA tabela por assunto. Quando o Cockpit assumir o /gestao, as colunas
-- que só um lado usa são revistas.
--
-- Conferido antes (24/09/2026):
--   - os 15 owners das 469 dailies do Cockpit têm perfil no APP;
--   - profiles não repete id_hubspot nem e-mail (senão o gatilho escolheria
--     uma pessoa ao acaso);
--   - o maior prometido_visitas do Cockpit é 10, dentro do CHECK 0..50 daqui;
--   - nem o app nem o /gestao usam comunicados.tipo para desenhar a tela, então
--     o 'atualizacao' do Cockpit não cai em ramo desconhecido.
--
-- Não copia dado: a carga vem depois, conferida por contagem.
-- Idempotente: pode rodar duas vezes.

-- ---------------------------------------------------------------------------
-- dailies
-- ---------------------------------------------------------------------------
alter table public.dailies
  add column if not exists owner_id text,
  add column if not exists prometido_avancos integer,
  add column if not exists prometido_propostas integer,
  add column if not exists prometido_fechamentos integer,
  add column if not exists realizado_visitas integer,
  add column if not exists realizado_avancos integer,
  add column if not exists realizado_propostas integer,
  add column if not exists realizado_fechamentos integer,
  add column if not exists compromisso_amanha text,
  add column if not exists criado_por text;

comment on column public.dailies.owner_id is
  'owner do HubSpot (formato do Cockpit). Preenchido pelo gatilho dailies_ponte_identidade a partir de seller_id, e vice-versa.';
comment on column public.dailies.realizado_visitas is
  'Realizado gravado pelo robô do Cockpit a partir das tarefas do HubSpot. O /gestao atual continua derivando o realizado de client_visits.';

create or replace function public.dailies_ponte_identidade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
begin
  if new.owner_id is not null then
    select p.id into v_seller from public.profiles p where p.id_hubspot = new.owner_id;
  end if;

  if new.seller_id is null then
    new.seller_id := v_seller;
  elsif v_seller is not null and v_seller <> new.seller_id then
    raise exception 'dailies: owner_id % e seller_id % são de pessoas diferentes', new.owner_id, new.seller_id;
  end if;

  if new.owner_id is null and new.seller_id is not null then
    select p.id_hubspot into new.owner_id from public.profiles p where p.id = new.seller_id;
  end if;

  return new;
end
$$;

drop trigger if exists dailies_ponte_identidade on public.dailies;
create trigger dailies_ponte_identidade
  before insert or update on public.dailies
  for each row execute function public.dailies_ponte_identidade();

-- As linhas que já existem ganham o owner.
update public.dailies d
   set owner_id = p.id_hubspot
  from public.profiles p
 where p.id = d.seller_id
   and d.owner_id is null
   and p.id_hubspot is not null;

-- O Cockpit grava com upsert on conflict (owner_id, data).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dailies_owner_id_data_key') then
    alter table public.dailies add constraint dailies_owner_id_data_key unique (owner_id, data);
  end if;
end
$$;

-- No Cockpit o gestor também grava a daily do executivo (rodada da Daily).
drop policy if exists dailies_insert on public.dailies;
create policy dailies_insert on public.dailies
  for insert to authenticated
  with check (seller_id = auth.uid() or (select public.is_field_admin()));

drop policy if exists dailies_update on public.dailies;
create policy dailies_update on public.dailies
  for update to authenticated
  using (seller_id = auth.uid() or (select public.is_field_admin()))
  with check (seller_id = auth.uid() or (select public.is_field_admin()));

-- ---------------------------------------------------------------------------
-- comunicados
-- ---------------------------------------------------------------------------
alter table public.comunicados
  add column if not exists autor text,
  add column if not exists imagem_caminho text,
  add column if not exists resumo_ia text;

comment on column public.comunicados.autor is
  'Autor em texto (formato do Cockpit). Espelha created_by_name pelo gatilho comunicados_ponte.';
comment on column public.comunicados.imagem_caminho is
  'Caminho no bucket comunicados-imagens (formato do Cockpit).';

create or replace function public.comunicados_ponte()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- O Cockpit não tem rascunho: o que ele grava sai publicado. Linha do
  -- Cockpit se reconhece por chegar com autor e sem publicado_em.
  if tg_op = 'INSERT' and new.autor is not null and new.publicado_em is null then
    new.publicado_em := coalesce(new.created_at, now());
  end if;

  -- O Cockpit aceita comunicado sem texto (só imagem); o APP exige texto.
  new.mensagem := coalesce(new.mensagem, '');

  if new.created_by_name is null then
    new.created_by_name := new.autor;
  end if;
  if new.autor is null then
    new.autor := new.created_by_name;
  end if;

  return new;
end
$$;

drop trigger if exists comunicados_ponte on public.comunicados;
create trigger comunicados_ponte
  before insert or update on public.comunicados
  for each row execute function public.comunicados_ponte();

update public.comunicados set autor = created_by_name where autor is null;

-- ---------------------------------------------------------------------------
-- comunicados_lidos
-- ---------------------------------------------------------------------------
alter table public.comunicados_lidos
  add column if not exists email_leitor text;

comment on column public.comunicados_lidos.email_leitor is
  'Leitor por e-mail (formato do Cockpit). O gatilho comunicados_lidos_ponte preenche leitor_id a partir dele, e vice-versa.';

create or replace function public.comunicados_lidos_ponte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.leitor_id is null and new.email_leitor is not null then
    select p.id into new.leitor_id from public.profiles p where lower(p.email) = lower(new.email_leitor);
  end if;
  if new.email_leitor is null and new.leitor_id is not null then
    select p.email into new.email_leitor from public.profiles p where p.id = new.leitor_id;
  end if;
  return new;
end
$$;

drop trigger if exists comunicados_lidos_ponte on public.comunicados_lidos;
create trigger comunicados_lidos_ponte
  before insert or update on public.comunicados_lidos
  for each row execute function public.comunicados_lidos_ponte();

update public.comunicados_lidos l
   set email_leitor = p.email
  from public.profiles p
 where p.id = l.leitor_id
   and l.email_leitor is null;
