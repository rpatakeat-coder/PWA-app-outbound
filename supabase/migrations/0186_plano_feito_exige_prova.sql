-- 0186 (09/10/26): "Plano x de y" — o x é visita COM PROVA numa parada do plano.
-- planejamento_do_time marcava a parada como feita com qualquer check-in no cliente (até o
-- declarado, sem GPS/foto). Resultado medido em 09/10: Marco "Plano 3 de 3" no Hoje/Pessoas e
-- "2 de 3" na Rua; o time "plano 5 de 47" com "visitas 4 de 42" (mais plano feito que visita).
-- Troca só a condição de itens_feitos.feita; o resto da função fica idêntico ao que está no banco.
do $mig$
declare d text;
begin
  select pg_get_functiondef('public.planejamento_do_time(date,text[],date)'::regprocedure) into d;
  if position('and vis.client_id = i.client_id) as feita' in d) = 0 then
    raise exception '0186: a condição de feita mudou; revisar à mão';
  end if;
  d := replace(d, 'and vis.client_id = i.client_id) as feita', 'and vis.client_id = i.client_id and vis.provada) as feita');
  execute d;
end
$mig$;
