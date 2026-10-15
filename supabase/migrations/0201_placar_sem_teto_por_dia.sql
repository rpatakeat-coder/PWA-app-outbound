-- PLACAR SEM TETO DE VISITAS POR DIA (14/10/2026, Julyan: "não temos teto de visita, se passou
-- das 6, vai contabilizar"). JÁ APLICADO EM PRODUÇÃO em 14/10/2026 pelo SQL Editor; este arquivo
-- registra a regra no repositório (a 0200 ainda tem o least(…, 6)).
-- Troca só as duas linhas de regra; as colunas de saída ficam iguais (visitas_fora_do_teto e
-- foraDoTeto passam a valer 0). Cada restaurante continua contando uma vez por semana.
-- Idempotente: se a regra antiga não está lá (já aplicado), não faz nada.
do $$
declare f text;
begin
  f := pg_get_functiondef('public.pontos_da_semana'::regproc);
  if position('sum(least(validas, 6))::int as n, sum(greatest(validas - 6, 0))::int as fora' in f) > 0 then
    execute replace(f, 'sum(least(validas, 6))::int as n, sum(greatest(validas - 6, 0))::int as fora', 'sum(validas)::int as n, 0::int as fora');
  end if;

  f := pg_get_functiondef('public.placar_detalhe'::regproc);
  if position('''pontuadas'', least(restaurantes, 6),' in f) > 0 then
    execute replace(f, '''pontuadas'', least(restaurantes, 6),
             ''foraDoTeto'', greatest(restaurantes - 6, 0)', '''pontuadas'', restaurantes,
             ''foraDoTeto'', 0');
  end if;
end $$;
