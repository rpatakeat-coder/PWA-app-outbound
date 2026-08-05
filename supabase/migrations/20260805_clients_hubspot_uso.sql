-- ============================================================================
-- clients: dados de USO do produto puxados do HubSpot (1x por semana).
--
-- Quem e' "cliente" aqui NAO vem do status local: vem das pipelines de
-- Sucesso e Onboarding no HubSpot (menos as etapas excluidas). A edge function
-- hubspot-usage-sync varre essas pipelines e grava aqui, casando pelo
-- id_hubspot (id do deal).
--
-- Serve pra responder em campo "quem e' cliente/ex-cliente mas na pratica nao
-- usa": o vendedor abre o pin e ve ha quanto tempo saiu a ultima comanda.
--
-- Tipo date (nao timestamptz) de proposito: as duas propriedades sao DATA no
-- HubSpot (meia-noite UTC). Guardar como timestamptz faria o app em BRT (UTC-3)
-- exibir o dia ANTERIOR.
-- ============================================================================

alter table public.clients
  add column if not exists hs_ultima_comanda_em date,
  add column if not exists hs_cancelamento_solicitado_em date,
  add column if not exists hs_uso_sincronizado_em timestamptz;

comment on column public.clients.hs_ultima_comanda_em is
  'HubSpot data_da_ultima_comanda_emitida (deal). Preenchido pela edge hubspot-usage-sync toda segunda. NULL = nunca emitiu comanda ou o deal nao esta nas pipelines de Sucesso/Onboarding.';

comment on column public.clients.hs_cancelamento_solicitado_em is
  'HubSpot data_solicitacao_cancelamento (deal). Preenchido pela edge hubspot-usage-sync toda segunda.';

comment on column public.clients.hs_uso_sincronizado_em is
  'Quando a edge hubspot-usage-sync leu este cliente pela ultima vez. Distingue "sem comanda" (colunas NULL, mas sincronizado) de "nunca sincronizado" (esta coluna NULL).';

-- O sync casa deal -> cliente por este campo; sem indice e' um seq scan por
-- deal retornado da busca no HubSpot.
create index if not exists clients_id_hubspot_idx
  on public.clients (id_hubspot)
  where id_hubspot is not null;

-- ===== Gravacao em lote =====================================================
-- A edge manda ~3 mil linhas por execucao. Um UPDATE por cliente seria o mesmo
-- numero de round-trips e estouraria o tempo da function — aqui e' um UPDATE
-- ... FROM por lote (a edge manda 500 de cada vez).
--
-- SECURITY DEFINER: quem chama e' a edge com service role. Nao ha caminho pelo
-- app (o grant e' so' pro service_role).
create or replace function public.apply_hubspot_uso(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with dados as (
    select *
      from jsonb_to_recordset(p_rows) as x(
        id_hubspot     text,
        ultima_comanda date,
        cancelamento   date
      )
     where x.id_hubspot is not null
  ), atualizados as (
    update public.clients c
       set hs_ultima_comanda_em          = d.ultima_comanda,
           hs_cancelamento_solicitado_em = d.cancelamento,
           hs_uso_sincronizado_em        = now()
      from dados d
     where c.id_hubspot = d.id_hubspot
    returning 1
  )
  select count(*) into v_count from atualizados;

  return v_count;
end;
$$;

-- ATENCAO ao revoke do anon: o Supabase tem ALTER DEFAULT PRIVILEGES no schema
-- public que da EXECUTE pra anon/authenticated em TODA function nova. Esse
-- grant e' DIRETO no role, entao "revoke from public" NAO o remove — sem a
-- linha do anon, qualquer um com a anon key (que e' publica, vai dentro do
-- app) conseguiria chamar esta function SECURITY DEFINER e sobrescrever as
-- colunas de uso de qualquer cliente.
revoke all on function public.apply_hubspot_uso(jsonb) from public;
revoke all on function public.apply_hubspot_uso(jsonb) from anon;
revoke all on function public.apply_hubspot_uso(jsonb) from authenticated;
grant execute on function public.apply_hubspot_uso(jsonb) to service_role;

comment on function public.apply_hubspot_uso(jsonb) is
  'Gravacao em lote dos dados de uso vindos do HubSpot (edge hubspot-usage-sync). p_rows = [{id_hubspot, ultima_comanda, cancelamento}]. Devolve quantas linhas de clients casaram.';
