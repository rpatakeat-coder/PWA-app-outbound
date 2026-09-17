-- ============================================================================
-- clients: guarda a ETAPA do HubSpot de onde o dado de uso veio.
--
-- Motivo: data_solicitacao_cancelamento registra que HOUVE um pedido, nao que
-- o cliente saiu. Na primeira execucao do sync apareceram 56 clientes em etapa
-- ATIVA (Acompanhamento/Saudavel) com pedido de cancelamento — o mais antigo
-- de 05/01/2026, ou seja, gente que pediu, foi retida e segue emitindo
-- comanda. Sem saber a etapa, o app trataria todos como ex-cliente.
--
-- hs_situacao e' o que a UI consome ('ativo' | 'churn'); quem classifica e' a
-- edge (flag churn na constante STAGES), entao incluir uma nova etapa de saida
-- amanha nao exige mexer no app.
-- hs_etapa_uso guarda o rotulo cru — serve pra responder "por que este cliente
-- aparece assim?" sem abrir o HubSpot.
-- ============================================================================

alter table public.clients
  add column if not exists hs_etapa_uso text,
  add column if not exists hs_situacao text;

comment on column public.clients.hs_etapa_uso is
  'Rotulo da etapa do HubSpot de onde o sync leu este cliente (ex.: "Churn (Sucesso)"). Preenchido pela edge hubspot-usage-sync.';

comment on column public.clients.hs_situacao is
  'Classificacao da etapa pela edge hubspot-usage-sync: ''ativo'' ou ''churn''. E'' o que decide se o app trata o cliente como ex-cliente — nao confundir com clients.status, que e'' marcacao manual.';

-- ===== RPC de gravacao: agora carrega etapa e situacao ======================
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
        cancelamento   date,
        etapa          text,
        situacao       text
      )
     where x.id_hubspot is not null
  ), atualizados as (
    update public.clients c
       set hs_ultima_comanda_em          = d.ultima_comanda,
           hs_cancelamento_solicitado_em = d.cancelamento,
           hs_etapa_uso                  = d.etapa,
           hs_situacao                   = d.situacao,
           hs_uso_sincronizado_em        = now()
      from dados d
     where c.id_hubspot = d.id_hubspot
    returning 1
  )
  select count(*) into v_count from atualizados;

  return v_count;
end;
$$;

-- CREATE OR REPLACE preserva os grants existentes, mas re-emitir e' barato e
-- fecha a porta caso a function tenha sido recriada do zero em algum momento:
-- o Supabase mantem ALTER DEFAULT PRIVILEGES dando EXECUTE pra anon em toda
-- function nova do schema public (foi assim que a versao anterior nasceu
-- chamavel pela anon key, que e' publica).
revoke all on function public.apply_hubspot_uso(jsonb) from public;
revoke all on function public.apply_hubspot_uso(jsonb) from anon;
revoke all on function public.apply_hubspot_uso(jsonb) from authenticated;
grant execute on function public.apply_hubspot_uso(jsonb) to service_role;
