-- 0213 · O DIA DO PLANO NÃO TEM LIMITE DE VAGAS (16/10/2026)
--
-- Julyan, 16/10: "não podemos limitar as visitas dele, pode ser ilimitadas, tanto no slot do
-- planejamento também". As duas funções que levam o plano do app ao Planejamento do Cockpit
-- (plano_poe_slot, do "Marcar o próximo passo", e espelhar_parada_no_plano, da rota) procuravam
-- uma vaga vazia entre as 15 do dia e, sem vaga, devolviam null: a parada ficava na rota do app e
-- SUMIA do Planejamento, sem aviso. Medido hoje: 5 dias nos últimos 60 passaram de 15 paradas
-- (o maior, 26).
--
-- Agora, sem vaga vazia, o item entra no FIM da coluna (jsonb_set com índice = tamanho acrescenta).
-- A mudança é só essa linha, nas duas funções; o resto do corpo é o que está no banco.
do $$
declare
  f text;
  def text;
  novo text;
begin
  foreach f in array array['plano_poe_slot', 'espelhar_parada_no_plano'] loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if def is null then raise exception 'função % não encontrada', f; end if;
    novo := replace(def,
      'if v_livre is null then return null; end if;',
      'if v_livre is null then v_livre := jsonb_array_length(v_col); end if;  -- 0213: dia sem limite, entra no fim');
    if novo = def and position('0213: dia sem limite' in def) = 0 then
      raise exception 'trecho da vaga não encontrado em %', f;
    end if;
    if novo <> def then execute novo; end if;
  end loop;
end $$;
