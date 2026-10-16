-- 0205 · MEU DESEMPENHO: A SEMANA DO PLACAR, O MÊS EM BRASÍLIA E SEM META INVENTADA (auditoria 16/10/2026)
--
-- Três números do Meu desempenho do app que não batiam com o resto:
--   1. A semana (cartão "Esta semana", as barras do dia e o histórico de 4 semanas) usava a janela
--      da temporada antiga, de segunda 9h a segunda 9h (_janela('semana')). Desde a 0192 a semana é
--      a do placar do bônus, que começa segunda 00:00 em Brasília: a visita de segunda às 8h saía
--      desta semana e entrava na passada. Agora é segunda 00:00 → segunda seguinte 00:00 (Brasília).
--      A _janela não muda (o ranking antigo ainda a usa).
--   2. A venda sem mesDeCompetencia caía no mês pelo left(closedate, 7) — o closedate é UTC, e a
--      venda das 22h do dia 31 em Brasília contava no mês seguinte. Agora o mês é o de Brasília.
--   3. Sem metaMensal no snapshot a meta virava 10 ("0 contratos de 10"), uma meta que ninguém deu.
--      Agora fica null e a tela diz só os contratos do mês.
--
-- Troca só as expressões, sobre a definição que está no ar. Idempotente: com a marca 0205 no corpo,
-- não faz nada; se alguma expressão sumiu, para sem trocar nada.
do $migr$
declare
  d text;
  trocas text[][] := array[
    array[$a$select j.de, j.ate into v_de, v_ate from public._janela('semana', 0) j;$a$,
          $b$select (date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
         ((date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '7 days') at time zone 'America/Sao_Paulo')
    into v_de, v_ate; -- 0205: a semana do placar (segunda 00:00 em Brasília)$b$],
    array[$a$lateral public._janela('semana', k) j$a$,
          $b$lateral (select ((date_trunc('week', now() at time zone 'America/Sao_Paulo') - make_interval(days => 7 * k)) at time zone 'America/Sao_Paulo') as de,
                         ((date_trunc('week', now() at time zone 'America/Sao_Paulo') - make_interval(days => 7 * k) + interval '7 days') at time zone 'America/Sao_Paulo') as ate) j$b$],
    array[$a$coalesce(x ->> 'mesDeCompetencia', left(x ->> 'closedate', 7)) = v_mes$a$,
          $b$coalesce(x ->> 'mesDeCompetencia', to_char(nullif(x ->> 'closedate', '')::timestamptz at time zone 'America/Sao_Paulo', 'YYYY-MM')) = v_mes$b$],
    array[$a$v_meta_mes := coalesce(nullif(v_rep ->> 'metaMensal', '')::int, 10);$a$,
          $b$v_meta_mes := nullif(v_rep ->> 'metaMensal', '')::int;$b$]
  ];
  i int;
begin
  d := pg_get_functiondef('public.meu_desempenho()'::regprocedure);
  if position('0205:' in d) > 0 then
    raise notice '0205: já aplicada';
    return;
  end if;
  for i in 1 .. array_length(trocas, 1) loop
    if (length(d) - length(replace(d, trocas[i][1], ''))) / length(trocas[i][1]) <> 1 then
      raise exception '0205: a expressão % não está (ou está mais de uma vez) em meu_desempenho: %', i, trocas[i][1];
    end if;
    d := replace(d, trocas[i][1], trocas[i][2]);
  end loop;
  execute d;
end
$migr$;
