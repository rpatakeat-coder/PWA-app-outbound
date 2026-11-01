-- 0236 · O cliente que fica (handoff "Acelerar Field Sales v2", tela 6a)
--
-- Quem vendeu e quem ficou. O robô do cockpit traz do HubSpot as vendas ganhas que já fizeram 60
-- dias (clienteQueFica: negócio, dono, data e CNPJ); esta função cruza cada uma, pelo CNPJ, com os
-- clientes da Takeat (clientes_takeat, 0122) e devolve o que o cockpit precisa para o sinal:
--   situação no CS (ativo, em risco, ex), a última cobrança recebida no ASAAS e os dias com comanda
--   nos últimos 30 (a foto diária clientes_takeat_dia: cada dia guarda a data da última comanda, e
--   as datas distintas são os dias em que houve comanda).
-- POR QUE PELO CNPJ: o executivo de clientes_takeat é o dono do TERRITÓRIO (0125), não quem vendeu,
-- e o negócio de CS é outro negócio, sem ligação gravada com o de vendas. Com mais de um negócio de
-- CS no mesmo CNPJ, vale o de Sucesso, depois o de cobrança mais recente.
-- A regra (ativo = cobrança recebida há até 35 dias; uso real = comanda em 20 dos últimos 30) fica
-- no cockpit, em constantes. Só o gestor; só leitura; nada escreve no HubSpot nem no ASAAS.

create or replace function public.cliente_que_fica(p_vendas jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null or not coalesce((select public.eh_gestor_cockpit()), false) then
    return jsonb_build_object('erro', 'só o gestor');
  end if;
  return jsonb_build_object('hoje', v_hoje, 'lidoEm', now(), 'fotoDesde', (select min(dia) from public.clientes_takeat_dia), 'vendas', coalesce((
    with v as (
      select x->>'id' as id, nullif(regexp_replace(coalesce(x->>'cnpj', ''), '\D', '', 'g'), '') as cnpj
        from jsonb_array_elements(case jsonb_typeof(p_vendas) when 'array' then p_vendas else '[]'::jsonb end) x
    ), m as (
      select distinct on (v.id) v.id, ct.deal_id, ct.pipeline, ct.situacao, ct.etapa, ct.ultima_cobranca, ct.ultima_comanda
        from v
        join public.clientes_takeat ct on v.cnpj is not null and regexp_replace(coalesce(ct.cnpj, ''), '\D', '', 'g') = v.cnpj
       order by v.id, (ct.pipeline = 'Sucesso') desc, ct.ultima_cobranca desc nulls last
    )
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'achou', m.deal_id is not null, 'csDeal', m.deal_id, 'pipeline', m.pipeline, 'situacao', m.situacao, 'etapa', m.etapa,
             'ultimaCobranca', m.ultima_cobranca, 'ultimaComanda', m.ultima_comanda,
             'diasComanda', (select count(distinct d.ultima_comanda) from public.clientes_takeat_dia d
                              where d.deal_id = m.deal_id and d.dia >= v_hoje - 30 and d.ultima_comanda >= v_hoje - 29)))
      from v left join m on m.id = v.id), '[]'::jsonb));
end;
$function$;
revoke all on function public.cliente_que_fica(jsonb) from anon, public;
grant execute on function public.cliente_que_fica(jsonb) to authenticated;
