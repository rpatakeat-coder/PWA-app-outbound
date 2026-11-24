-- 0277 (24/11/26): o app passa a guardar quanto cada cliente paga (MRR do negócio).
--
-- Achado na auditoria de clientes de 24/11: clientes_takeat tinha plano e assinatura,
-- mas nenhum valor. A clientes-sync passa a ler a propriedade `mrr` do negócio
-- (Onboarding/Sucesso) e manda no pacote; aqui a coluna nasce e a gravar_clientes_takeat
-- passa a gravá-la. Só leitura do HubSpot: não toca em amount/mrr da etapa
-- Ag. Pagamento do Field, nem em automação nenhuma.
--
-- A função é a mesma, com `mrr` acrescentado em quatro pontos. Para não transcrever à
-- mão uma função de 100 linhas, a troca é feita sobre a definição viva, e cada ponto
-- tem de casar exatamente uma vez (senão a migration aborta sem mudar nada).
-- A versão anterior está em arquivo.copias. create or replace mantém dono, security
-- definer e o proacl ({postgres=X/postgres,service_role=X/postgres}).

alter table public.clientes_takeat add column if not exists mrr numeric;
comment on column public.clientes_takeat.mrr is 'MRR do negócio no HubSpot (propriedade mrr), lido pela clientes-sync. Valor de contrato, não a cobrança do Asaas.';

do $migr$
declare
  v_def text;
  v_novo text;
  trocas text[][] := array[
    array[E'plano text, assinatura text)\n    where x.deal_id',
          E'plano text, assinatura text, mrr numeric)\n    where x.deal_id'],
    array[E'churn_setor, plano, assinatura)\n    select q.deal_id',
          E'churn_setor, plano, assinatura, mrr)\n    select q.deal_id'],
    array[E'q.churn_setor, q.plano, q.assinatura\n    from q',
          E'q.churn_setor, q.plano, q.assinatura, q.mrr\n    from q'],
    array[E'plano = excluded.plano, assinatura = excluded.assinatura\n    returning 1',
          E'plano = excluded.plano, assinatura = excluded.assinatura, mrr = excluded.mrr\n    returning 1']
  ];
  i int;
  n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.oid = 'public.gravar_clientes_takeat(jsonb)'::regprocedure;
  if strpos(v_def, 'mrr numeric') > 0 then
    raise notice '0277: gravar_clientes_takeat já grava mrr; nada a fazer';
    return;
  end if;
  v_novo := v_def;
  for i in 1 .. array_length(trocas, 1) loop
    n := (length(v_novo) - length(replace(v_novo, trocas[i][1], ''))) / length(trocas[i][1]);
    if n <> 1 then
      raise exception '0277: o ponto % casou % vezes (esperado 1); nada mudou', i, n;
    end if;
    v_novo := replace(v_novo, trocas[i][1], trocas[i][2]);
  end loop;
  execute v_novo;
end
$migr$;

revoke all on function public.gravar_clientes_takeat(jsonb) from public, anon, authenticated;
