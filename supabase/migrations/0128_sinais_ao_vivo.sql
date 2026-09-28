-- 0128 · O canal ao vivo entre o mapa e o Cockpit (Cockpit v5, fase 2)
--
-- O contrato Mapa ⇄ Cockpit pede "o outro lado vê em até 5 s". Hoje o Realtime do
-- projeto publica só snapshot_farol: nada do que o executivo faz no mapa chega ao
-- Cockpit antes do próximo carregamento, e vice-versa.
--
-- Em vez de publicar as tabelas de negócio (clients recebe milhares de updates por dia
-- de sincronização, e cada assinante pagaria a RLS de cada linha), cada tabela que
-- importa grava aqui um SINAL pequeno — o que mudou e de quem — e só esta tabela entra
-- no Realtime. Quem recebe o sinal relê o que precisa com a própria sessão, pela RLS de
-- sempre. O sinal não carrega conteúdo: só tipo e ids.
--
-- Guarda 48 h (cron de hora em hora apaga o resto).

create table if not exists public.sinais_ao_vivo (
  id bigint generated always as identity primary key,
  tipo text not null,            -- visita | foto | ficha | negocio | pino | pino-novo | parada | plano | comunicado | recado
  client_id uuid,
  deal_id text,
  owner_id text,
  criado_em timestamptz not null default now()
);
create index if not exists sinais_ao_vivo_criado_em on public.sinais_ao_vivo (criado_em);

alter table public.sinais_ao_vivo enable row level security;
drop policy if exists sinais_ao_vivo_le_o_time on public.sinais_ao_vivo;
create policy sinais_ao_vivo_le_o_time on public.sinais_ao_vivo
  for select to authenticated
  using (
    public.is_field_admin()
    or exists (select 1 from public.equipe_cockpit e where e.profile_id = auth.uid() and e.ativo)
  );
-- ninguém grava direto: só os gatilhos abaixo (security definer)

create or replace function public.sinal_ao_vivo(p_tipo text, p_client uuid, p_deal text, p_owner text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.sinais_ao_vivo (tipo, client_id, deal_id, owner_id) values (p_tipo, p_client, p_deal, p_owner);
exception when others then
  -- o sinal nunca derruba a escrita que o originou
  null;
end;
$$;
revoke all on function public.sinal_ao_vivo(text, uuid, text, text) from public, anon, authenticated;

-- dono e negócio do pino, para quem só conhece o client_id
create or replace function public.sinal_do_pino(p_tipo text, p_client uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_deal text; v_owner text;
begin
  select c.id_hubspot, c.vendedor_id_hubspot into v_deal, v_owner from public.clients c where c.id = p_client;
  perform public.sinal_ao_vivo(p_tipo, p_client, v_deal, v_owner);
end;
$$;
revoke all on function public.sinal_do_pino(text, uuid) from public, anon, authenticated;

-- 1–2 · check-in (com GPS ou declarado)
create or replace function public.tg_sinal_visita() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform public.sinal_do_pino('visita', new.client_id); return null; end; $$;
drop trigger if exists sinal_visita on public.client_visits;
create trigger sinal_visita after insert on public.client_visits for each row execute function public.tg_sinal_visita();

-- 3 · foto da visita
create or replace function public.tg_sinal_foto() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform public.sinal_ao_vivo('foto', new.client_id, new.deal_id, new.owner_id); return null; end; $$;
drop trigger if exists sinal_foto on public.fotos_visita;
create trigger sinal_foto after insert on public.fotos_visita for each row execute function public.tg_sinal_foto();

-- 4 · ficha de rua
create or replace function public.tg_sinal_ficha() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform public.sinal_ao_vivo('ficha', new.client_id, new.deal_id, new.owner_id); return null; end; $$;
drop trigger if exists sinal_ficha on public.fichas_de_rua;
create trigger sinal_ficha after insert or update on public.fichas_de_rua for each row execute function public.tg_sinal_ficha();

-- 5/14 · o negócio mudou (etapa, dono ou card relido do HubSpot)
create or replace function public.tg_sinal_negocio() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE'
     and new.dealstage is not distinct from old.dealstage
     and new.owner_id is not distinct from old.owner_id
     and new.card is not distinct from old.card then
    return null;
  end if;
  perform public.sinal_ao_vivo('negocio', null, new.deal_id, new.owner_id);
  return null;
end; $$;
drop trigger if exists sinal_negocio on public.espelho_negocios;
create trigger sinal_negocio after insert or update on public.espelho_negocios for each row execute function public.tg_sinal_negocio();

-- 8/11/14 · o pino mudou de etapa, situação, dono ou lugar (ou nasceu)
create or replace function public.tg_sinal_pino() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE'
     and new.etapa is not distinct from old.etapa
     and new.status is not distinct from old.status
     and new.vendedor_id_hubspot is not distinct from old.vendedor_id_hubspot
     and new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    return null;
  end if;
  -- pino-novo: quem escuta relê a base (pino que ainda não está em cache nenhum);
  -- pino: basta reler a linha e trocar no cache.
  perform public.sinal_ao_vivo(case when tg_op = 'INSERT' then 'pino-novo' else 'pino' end, new.id, new.id_hubspot, new.vendedor_id_hubspot);
  return null;
end; $$;
drop trigger if exists sinal_pino on public.clients;
create trigger sinal_pino after insert or update on public.clients for each row execute function public.tg_sinal_pino();

-- 9/10 · parada do plano (feita, criada, removida)
create or replace function public.tg_sinal_parada() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_owner text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select p.id_hubspot into v_owner from public.field_routes fr join public.profiles p on p.id = fr.seller_id where fr.id = r.route_id;
  perform public.sinal_ao_vivo('parada', r.client_id, null, v_owner);
  return null;
end; $$;
drop trigger if exists sinal_parada on public.field_route_stops;
create trigger sinal_parada after insert or update or delete on public.field_route_stops for each row execute function public.tg_sinal_parada();

-- 10 · a semana planejada
create or replace function public.tg_sinal_plano() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform public.sinal_ao_vivo('plano', null, null, new.owner_id); return null; end; $$;
drop trigger if exists sinal_plano on public.planos_semanais;
create trigger sinal_plano after insert or update on public.planos_semanais for each row execute function public.tg_sinal_plano();

-- 12 · comunicado publicado (o sino dos dois lados)
create or replace function public.tg_sinal_comunicado() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform public.sinal_ao_vivo('comunicado', null, null, null); return null; end; $$;
drop trigger if exists sinal_comunicado on public.comunicados;
create trigger sinal_comunicado after insert on public.comunicados for each row execute function public.tg_sinal_comunicado();

-- 12 · recado do gestor para UMA pessoa (sugestoes_planos) — o sino do app dela
create or replace function public.tg_sinal_recado() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform public.sinal_ao_vivo('recado', null, null, new.owner_id); return null; end; $$;
drop trigger if exists sinal_recado on public.sugestoes_planos;
create trigger sinal_recado after insert on public.sugestoes_planos for each row execute function public.tg_sinal_recado();

-- entra no Realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sinais_ao_vivo') then
    alter publication supabase_realtime add table public.sinais_ao_vivo;
  end if;
end $$;

-- 48 h e fora
select cron.unschedule('sinais-ao-vivo-limpa') where exists (select 1 from cron.job where jobname = 'sinais-ao-vivo-limpa');
select cron.schedule('sinais-ao-vivo-limpa', '17 * * * *', $$delete from public.sinais_ao_vivo where criado_em < now() - interval '48 hours'$$);
