-- ============================================================================
-- clients: quantidade de comandas emitidas ate o momento (HubSpot).
--
-- Complementa hs_ultima_comanda_em: a data diz QUANDO parou, o contador diz
-- QUANTO usou. Junto respondem "cliente que nunca engrenou" (poucas comandas)
-- vs "cliente que usava muito e parou" (muitas comandas + data antiga).
--
-- Propriedade no HubSpot: numero_de_comandas_ate_o_momento_number (NUMBER).
-- ============================================================================

alter table public.clients
  add column if not exists hs_qtd_comandas integer;

comment on column public.clients.hs_qtd_comandas is
  'HubSpot numero_de_comandas_ate_o_momento_number (deal). Preenchido pela edge hubspot-usage-sync toda segunda. NULL = propriedade vazia no deal ou cliente fora do recorte do sync.';

-- ===== RPC de gravacao: agora carrega tambem a quantidade ===================
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
        qtd_comandas   integer,
        etapa          text,
        situacao       text
      )
     where x.id_hubspot is not null
  ), atualizados as (
    update public.clients c
       set hs_ultima_comanda_em          = d.ultima_comanda,
           hs_cancelamento_solicitado_em = d.cancelamento,
           hs_qtd_comandas               = d.qtd_comandas,
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

-- Mesmo cuidado das versoes anteriores: o Supabase mantem ALTER DEFAULT
-- PRIVILEGES dando EXECUTE pra anon em toda function nova do schema public, e
-- a anon key e' publica (vai dentro do app).
revoke all on function public.apply_hubspot_uso(jsonb) from public;
revoke all on function public.apply_hubspot_uso(jsonb) from anon;
revoke all on function public.apply_hubspot_uso(jsonb) from authenticated;
grant execute on function public.apply_hubspot_uso(jsonb) to service_role;
