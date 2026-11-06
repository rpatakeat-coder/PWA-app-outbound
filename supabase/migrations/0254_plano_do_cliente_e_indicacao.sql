-- 0254 · O PLANO DO CLIENTE NO PINO e A PERGUNTA DA VISITA DE RELACIONAMENTO (06/11/26)
--
-- Julyan: "quando for cliente, poderia aparecer na ficha dele o plano atual, comandas, etc,
-- pro executivo já saber quando for fazer relacionamento" e "nas visitas de relacionamento
-- colocar uma pergunta obrigatória: pediu indicação?".
--
-- 1. PLANO E ASSINATURA. A clientes-sync passa a ler do negócio de Onboarding/Sucesso duas
--    propriedades do HubSpot que já existem e estão cheias (amostra de 60 do Sucesso em 06/11:
--    "Plano Contratado" pacote_contratado em 60, "Assinatura" periodo_contratado em 59). Elas
--    vão para clientes_takeat e para o pino (clients.hs_plano / hs_assinatura), pelo mesmo
--    caminho de hs_qtd_comandas. "Plano Atual" (plano_atual) ficou de fora: só metade tem, e às
--    vezes discorda do contratado.
--
-- 2. PEDIU INDICAÇÃO? Uma resposta por visita a cliente, em visitas_relacionamento. "Obrigatório"
--    é aviso, não trava (regra do Julyan): a visita conta sempre; a visita a cliente SEM linha
--    aqui é "não respondeu", e é isso que o gestor cobra. Só quem fez a visita responde, pela
--    responder_relacionamento (a tabela não aceita escrita direta).

alter table public.clientes_takeat
  add column if not exists plano text,
  add column if not exists assinatura text;

alter table public.clients
  add column if not exists hs_plano text,
  add column if not exists hs_assinatura text;

create or replace function public.gravar_clientes_takeat(p_rows jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
      churn_motivo_macro text, churn_motivo_micro text, churn_motivo_texto text, churn_setor text,
      plano text, assinatura text)
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
      churn_motivo_macro, churn_motivo_micro, churn_motivo_texto, churn_setor, plano, assinatura)
    select q.deal_id, q.nome, q.pipeline, q.etapa_id, q.etapa, q.situacao, q.dono_cs_owner_id, q.ultima_comanda,
      q.ultima_comanda_takeat, q.ultima_comanda_integracoes, q.comandas_total, q.faturamento_mes0, q.faturamento_mes1,
      q.faturamento_mes2, q.faturamento_mes3, q.variacao_bimestre, q.cancelamento_pedido, q.ultimo_caixa,
      q.ultima_cobranca, q.cnpj, q.celular, q.logradouro, q.numero, q.bairro, q.cidade, q.estado, q.cep,
      q.latitude, q.longitude, q.em_queda, q.motivo,
      (select coalesce(j.mantido, c.id) from public.clients c left join public.pinos_juntados j on j.removido = c.id where c.id_hubspot = q.deal_id order by c.is_archived nulls first limit 1),
      q.hs_modificado_em, now(),
      q.churn_motivo_macro, q.churn_motivo_micro, q.churn_motivo_texto, q.churn_setor, q.plano, q.assinatura
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
      churn_motivo_texto = excluded.churn_motivo_texto, churn_setor = excluded.churn_setor,
      plano = excluded.plano, assinatura = excluded.assinatura
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
      hs_churn_motivo_macro = case when q.situacao = 'ex' then q.churn_motivo_macro end,
      hs_churn_motivo_micro = case when q.situacao = 'ex' then q.churn_motivo_micro end,
      hs_churn_motivo_texto = case when q.situacao = 'ex' then q.churn_motivo_texto end,
      hs_churn_setor = case when q.situacao = 'ex' then q.churn_setor end,
      hs_plano = q.plano,
      hs_assinatura = q.assinatura,
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
        or c.hs_churn_setor is distinct from (case when q.situacao = 'ex' then q.churn_setor end)
        or c.hs_plano is distinct from q.plano
        or c.hs_assinatura is distinct from q.assinatura)
    returning 1
  )
  select (select count(*) from pinos) into v_pinos;
  return v_pinos;
end;
$function$;

-- ── 2 · pediu indicação? ──
create table if not exists public.visitas_relacionamento (
  visita_id uuid primary key references public.client_visits(id) on delete cascade,
  client_id uuid not null,
  pessoa uuid not null,
  resposta text not null check (resposta in ('indicou', 'nao_indicou', 'nao_pediu')),
  indicado_nome text,
  indicado_telefone text,
  respondido_em timestamptz not null default now()
);
create index if not exists visitas_relacionamento_pessoa_idx on public.visitas_relacionamento (pessoa, respondido_em desc);

alter table public.visitas_relacionamento enable row level security;
drop policy if exists visitas_relacionamento_select on public.visitas_relacionamento;
create policy visitas_relacionamento_select on public.visitas_relacionamento for select to authenticated
  using (pessoa = auth.uid() or public.is_field_admin() or public.eh_gestor_cockpit());

-- A visita é a do check-in (acao_id); sem ela (o check-in ainda na fila), a última visita de hoje
-- desta pessoa neste cliente. Só quem visitou responde, e a resposta pode ser trocada.
create or replace function public.responder_relacionamento(p_acao_id uuid, p_client_id uuid, p_resposta text, p_nome text default null, p_telefone text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_visita uuid; v_client uuid;
begin
  if auth.uid() is null then return jsonb_build_object('erro', 'sem sessão'); end if;
  if p_resposta not in ('indicou', 'nao_indicou', 'nao_pediu') then return jsonb_build_object('erro', 'resposta inválida'); end if;
  select v.id, v.client_id into v_visita, v_client from public.client_visits v
   where v.visited_by = auth.uid() and p_acao_id is not null and v.acao_id = p_acao_id
   order by v.visited_at desc limit 1;
  if v_visita is null then
    select v.id, v.client_id into v_visita, v_client from public.client_visits v
     where v.visited_by = auth.uid() and v.client_id = p_client_id
       and (v.visited_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
     order by v.visited_at desc limit 1;
  end if;
  if v_visita is null then return jsonb_build_object('erro', 'a visita ainda não chegou ao servidor'); end if;
  insert into public.visitas_relacionamento (visita_id, client_id, pessoa, resposta, indicado_nome, indicado_telefone)
  values (v_visita, v_client, auth.uid(), p_resposta,
          case when p_resposta = 'indicou' then nullif(btrim(coalesce(p_nome, '')), '') end,
          case when p_resposta = 'indicou' then nullif(btrim(coalesce(p_telefone, '')), '') end)
  on conflict (visita_id) do update set resposta = excluded.resposta, indicado_nome = excluded.indicado_nome,
    indicado_telefone = excluded.indicado_telefone, respondido_em = now();
  return jsonb_build_object('ok', true, 'visita', v_visita);
end;
$function$;

revoke all on function public.responder_relacionamento(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.responder_relacionamento(uuid, uuid, text, text, text) to authenticated;

-- a tabela só se lê (pela regra acima) e só se escreve pela função
revoke all on table public.visitas_relacionamento from anon;
revoke insert, update, delete, truncate on table public.visitas_relacionamento from authenticated;
