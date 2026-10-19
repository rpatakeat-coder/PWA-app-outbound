-- 0221 · O MOTIVO DO CANCELAMENTO NA FICHA DO EX-CLIENTE (19/10/26)
--
-- Julyan: "quero que esse motivo esteja na ficha dos leads que estão em ex-clientes para
-- meus executivos saberem e já atuarem em cima disso". O Sucesso e o Onboarding já
-- registram o motivo no negócio do HubSpot (N1 macro, N2 micro, N3 observação e o setor
-- onde o cancelamento nasceu); a clientes-sync só não os lia. Agora lê, guarda em
-- clientes_takeat e copia para o pino (clients.hs_churn_*), como já faz com comandas e a
-- data do pedido de cancelamento. Só leitura do HubSpot: nada muda no CRM.
--
-- A "Data - Parou de Gerar Receita" (data_do_cancelamento) NÃO entra: vem preenchida em 2027
-- em boa parte dos negócios (medido em 19/10). A data que a ficha usa continua a do pedido.

alter table public.clientes_takeat
  add column if not exists churn_motivo_macro text,
  add column if not exists churn_motivo_micro text,
  add column if not exists churn_motivo_texto text,
  add column if not exists churn_setor text;

alter table public.clients
  add column if not exists hs_churn_motivo_macro text,
  add column if not exists hs_churn_motivo_micro text,
  add column if not exists hs_churn_motivo_texto text,
  add column if not exists hs_churn_setor text;

CREATE OR REPLACE FUNCTION public.gravar_clientes_takeat(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_pinos integer;
begin
  with d as (
    select * from jsonb_to_recordset(p_rows) as x(
      deal_id text, nome text, pipeline text, etapa_id text, etapa text, situacao text,
      dono_cs_owner_id text, ultima_comanda date, ultima_comanda_takeat date, ultima_comanda_integracoes date,
      comandas_total integer, faturamento_mes0 numeric, faturamento_mes1 numeric, faturamento_mes2 numeric,
      faturamento_mes3 numeric, variacao_bimestre numeric, cancelamento_pedido date, ultimo_caixa date,
      ultima_cobranca date, cnpj text, celular text, logradouro text, numero text, bairro text, cidade text,
      estado text, cep text, latitude double precision, longitude double precision, hs_modificado_em timestamptz,
      churn_motivo_macro text, churn_motivo_micro text, churn_motivo_texto text, churn_setor text)
    where x.deal_id is not null
  ), q as (
    select d.*,
      (d.situacao in ('ativo', 'em_risco') and (
         (d.variacao_bimestre is not null and d.variacao_bimestre <= -0.20)
         or (d.ultima_comanda is not null and d.ultima_comanda <= (now() at time zone 'America/Sao_Paulo')::date - 5))) as em_queda,
      nullif(concat_ws(' · ',
        case when d.variacao_bimestre is not null and d.variacao_bimestre <= -0.20
             then 'faturamento ' || round(d.variacao_bimestre * 100)::text || '% no bimestre' end,
        case when d.ultima_comanda is not null and d.ultima_comanda <= (now() at time zone 'America/Sao_Paulo')::date - 5
             then 'sem comanda há ' || ((now() at time zone 'America/Sao_Paulo')::date - d.ultima_comanda)::text || ' dias' end), '') as motivo
    from d
  ), up as (
    insert into public.clientes_takeat as t (
      deal_id, nome, pipeline, etapa_id, etapa, situacao, dono_cs_owner_id, ultima_comanda, ultima_comanda_takeat,
      ultima_comanda_integracoes, comandas_total, faturamento_mes0, faturamento_mes1, faturamento_mes2, faturamento_mes3,
      variacao_bimestre, cancelamento_pedido, ultimo_caixa, ultima_cobranca, cnpj, celular, logradouro, numero, bairro,
      cidade, estado, cep, latitude, longitude, em_queda, motivo_queda, client_id, hs_modificado_em, sincronizado_em,
      churn_motivo_macro, churn_motivo_micro, churn_motivo_texto, churn_setor)
    select q.deal_id, q.nome, q.pipeline, q.etapa_id, q.etapa, q.situacao, q.dono_cs_owner_id, q.ultima_comanda,
      q.ultima_comanda_takeat, q.ultima_comanda_integracoes, q.comandas_total, q.faturamento_mes0, q.faturamento_mes1,
      q.faturamento_mes2, q.faturamento_mes3, q.variacao_bimestre, q.cancelamento_pedido, q.ultimo_caixa,
      q.ultima_cobranca, q.cnpj, q.celular, q.logradouro, q.numero, q.bairro, q.cidade, q.estado, q.cep,
      q.latitude, q.longitude, q.em_queda, q.motivo,
      (select coalesce(j.mantido, c.id) from public.clients c left join public.pinos_juntados j on j.removido = c.id where c.id_hubspot = q.deal_id order by c.is_archived nulls first limit 1),
      q.hs_modificado_em, now(),
      q.churn_motivo_macro, q.churn_motivo_micro, q.churn_motivo_texto, q.churn_setor
    from q
    on conflict (deal_id) do update set
      nome = excluded.nome, pipeline = excluded.pipeline, etapa_id = excluded.etapa_id, etapa = excluded.etapa,
      situacao = excluded.situacao, dono_cs_owner_id = excluded.dono_cs_owner_id, ultima_comanda = excluded.ultima_comanda,
      ultima_comanda_takeat = excluded.ultima_comanda_takeat, ultima_comanda_integracoes = excluded.ultima_comanda_integracoes,
      comandas_total = excluded.comandas_total, faturamento_mes0 = excluded.faturamento_mes0,
      faturamento_mes1 = excluded.faturamento_mes1, faturamento_mes2 = excluded.faturamento_mes2,
      faturamento_mes3 = excluded.faturamento_mes3, variacao_bimestre = excluded.variacao_bimestre,
      cancelamento_pedido = excluded.cancelamento_pedido, ultimo_caixa = excluded.ultimo_caixa,
      ultima_cobranca = excluded.ultima_cobranca, cnpj = excluded.cnpj, celular = excluded.celular,
      logradouro = excluded.logradouro, numero = excluded.numero, bairro = excluded.bairro, cidade = excluded.cidade,
      estado = excluded.estado, cep = excluded.cep, latitude = excluded.latitude, longitude = excluded.longitude,
      em_queda = excluded.em_queda, motivo_queda = excluded.motivo_queda, client_id = coalesce(excluded.client_id, t.client_id),
      hs_modificado_em = excluded.hs_modificado_em, sincronizado_em = now(),
      churn_motivo_macro = excluded.churn_motivo_macro, churn_motivo_micro = excluded.churn_motivo_micro,
      churn_motivo_texto = excluded.churn_motivo_texto, churn_setor = excluded.churn_setor
    returning 1
  ), foto as (
    insert into public.clientes_takeat_dia (deal_id, dia, situacao, ultima_comanda, comandas_total, faturamento_mes0, faturamento_mes1, variacao_bimestre)
    select q.deal_id, (now() at time zone 'America/Sao_Paulo')::date, q.situacao, q.ultima_comanda, q.comandas_total,
           q.faturamento_mes0, q.faturamento_mes1, q.variacao_bimestre
    from q
    on conflict (deal_id, dia) do update set situacao = excluded.situacao, ultima_comanda = excluded.ultima_comanda,
      comandas_total = excluded.comandas_total, faturamento_mes0 = excluded.faturamento_mes0,
      faturamento_mes1 = excluded.faturamento_mes1, variacao_bimestre = excluded.variacao_bimestre
    returning 1
  ), pinos as (
    update public.clients c set
      hs_ultima_comanda_em = q.ultima_comanda,
      hs_cancelamento_solicitado_em = q.cancelamento_pedido,
      hs_qtd_comandas = q.comandas_total,
      hs_etapa_uso = q.etapa,
      hs_situacao = case when q.situacao = 'ex' then 'churn' else 'ativo' end,
      -- o motivo só vale para quem saiu: cliente ativo com motivo antigo preenchido não o carrega
      hs_churn_motivo_macro = case when q.situacao = 'ex' then q.churn_motivo_macro end,
      hs_churn_motivo_micro = case when q.situacao = 'ex' then q.churn_motivo_micro end,
      hs_churn_motivo_texto = case when q.situacao = 'ex' then q.churn_motivo_texto end,
      hs_churn_setor = case when q.situacao = 'ex' then q.churn_setor end,
      hs_uso_sincronizado_em = now()
    from q
    where (c.id_hubspot = q.deal_id or c.id = (select t2.client_id from public.clientes_takeat t2 where t2.deal_id = q.deal_id))
      and (c.hs_ultima_comanda_em is distinct from q.ultima_comanda
        or c.hs_cancelamento_solicitado_em is distinct from q.cancelamento_pedido
        or c.hs_qtd_comandas is distinct from q.comandas_total
        or c.hs_etapa_uso is distinct from q.etapa
        or c.hs_situacao is distinct from (case when q.situacao = 'ex' then 'churn' else 'ativo' end)
        or c.hs_churn_motivo_macro is distinct from (case when q.situacao = 'ex' then q.churn_motivo_macro end)
        or c.hs_churn_motivo_micro is distinct from (case when q.situacao = 'ex' then q.churn_motivo_micro end)
        or c.hs_churn_motivo_texto is distinct from (case when q.situacao = 'ex' then q.churn_motivo_texto end)
        or c.hs_churn_setor is distinct from (case when q.situacao = 'ex' then q.churn_setor end))
    returning 1
  )
  select (select count(*) from pinos) into v_pinos;
  return v_pinos;
end;
$function$;
