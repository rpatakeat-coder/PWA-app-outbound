-- 0194 (09/10/26): o check-in com GPS basta, inclusive em lead criado na hora (Julyan: "se ele der
-- check-in, se foi na rua não precisa de foto. Só entrega foto se não conseguir o GPS").
-- pontos_da_semana deixa de tirar do placar a visita em lead criado na hora sem foto; o teto de 6 por
-- dia e um restaurante por dia continuam. A coluna visitas_lead_novo_sem_foto fica (sempre 0) para
-- não quebrar quem lê.
do $mig$
declare d text;
begin
  select pg_get_functiondef('public.pontos_da_semana(date)'::regprocedure) into d;
  if position('count(*) filter (where not lead_novo or tem_foto)::int as validas' in d) = 0 then
    if position('count(*)::int as validas' in d) > 0 then return; end if;
    raise exception '0194: pontos_da_semana mudou; revisar à mão';
  end if;
  d := replace(d, 'count(*) filter (where not lead_novo or tem_foto)::int as validas', 'count(*)::int as validas');
  d := replace(d, 'count(*) filter (where lead_novo and not tem_foto)::int as lead_sem_foto', '0::int as lead_sem_foto');
  execute d;
end
$mig$;
