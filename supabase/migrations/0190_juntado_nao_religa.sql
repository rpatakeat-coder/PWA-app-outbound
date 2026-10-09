-- 0190 (09/10/26): a junção da 0189 não se desfaz na rodada da madrugada.
-- gravar_clientes_takeat acha o pino pelo id_hubspot, arquivado incluído. O pino do robô
-- arquivado pela 0189 ainda tem o id_hubspot do negócio: às 03:00 a lista voltaria a apontar
-- para ele. Agora, se o pino achado foi juntado (pinos_juntados), vale o que ficou.

do $mig$
declare d text;
begin
  select pg_get_functiondef('public.gravar_clientes_takeat(jsonb)'::regprocedure) into d;
  if position('(select c.id from public.clients c where c.id_hubspot = q.deal_id order by c.is_archived nulls first limit 1)' in d) = 0 then
    raise exception '0190: gravar_clientes_takeat mudou; revisar à mão';
  end if;
  d := replace(d, '(select c.id from public.clients c where c.id_hubspot = q.deal_id order by c.is_archived nulls first limit 1)',
    '(select coalesce(j.mantido, c.id) from public.clients c left join public.pinos_juntados j on j.removido = c.id where c.id_hubspot = q.deal_id order by c.is_archived nulls first limit 1)');
  execute d;
end
$mig$;
