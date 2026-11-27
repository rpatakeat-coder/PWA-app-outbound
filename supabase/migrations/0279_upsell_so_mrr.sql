-- 0279 — Upsell soma MRR e não conta como venda (Julyan, 27/11/26: "Só o MRR, não venda").
--
-- O caso: o Bruno ganhou um negócio "Upsell" do Melhor Parada (cliente desde 12/2025, +R$ 119 de
-- MRR, Pacote contratado = 'Upsell') e ele contou como cliente novo: +1 contrato na meta, +100 no
-- placar da semana, +1 degrau na variável.
--
-- A partir do robô (cockpit-unificado, lib/realizado.js ehUpsell) cada item de vendasLivro/vendasMes
-- do snapshot traz `upsell: true` quando o pacote é Upsell. Aqui, toda conta de VENDA pula esse item;
-- toda soma de MRR continua com ele:
--   * pontos_da_semana — vendas do placar e do bônus;
--   * placar_detalhe — a lista de vendas do placar;
--   * sincronizar_pontos — não cria evento 'contrato' (Temporada, ranking do mês, meu_desempenho,
--     Desenvolvimento › clientes, resultados_mensais leem esse evento);
--   * _desenvolvimento_de — vendas do mês da variável;
--   * meu_desempenho — fechados do mês;
--   * _calc_vendas_do_mes — conta vendas sem o upsell; o MRR e o valor somam com ele; o item
--     sai com upsell: true para a tela poder dizer.
-- E o contrato que já tinha nascido do upsell do Bruno (68715515936) recebe estorno.
--
-- Idempotente: cada troca só roda onde ainda não há 'upsell'; o estorno usa on conflict.

do $$
declare
  r record; def text; novo text; fn oid;
  f text := 'not coalesce((x->>''upsell'')::boolean, false)';
  trocas jsonb := jsonb_build_array(
    jsonb_build_array('pontos_da_semana',
      'where x->>''closedate'' is not null' || chr(10),
      'where x->>''closedate'' is not null and ' || f || chr(10), 2),
    jsonb_build_array('placar_detalhe',
      'where x->>''closedate'' is not null' || chr(10),
      'where x->>''closedate'' is not null and ' || f || chr(10), 2),
    jsonb_build_array('sincronizar_pontos',
      'where x->>''id'' is not null and x->>''ownerId'' is not null and x->>''closedate'' is not null',
      'where x->>''id'' is not null and x->>''ownerId'' is not null and x->>''closedate'' is not null and ' || f, 1),
    jsonb_build_array('_desenvolvimento_de',
      'where x->>''ownerId'' = v_owner and coalesce(x->>''mesDeCompetencia''',
      'where x->>''ownerId'' = v_owner and ' || f || ' and coalesce(x->>''mesDeCompetencia''', 1),
    jsonb_build_array('meu_desempenho',
      'where x ->> ''ownerId'' = v_owner and coalesce(x ->> ''mesDeCompetencia''',
      'where x ->> ''ownerId'' = v_owner and ' || f || ' and coalesce(x ->> ''mesDeCompetencia''', 1),
    jsonb_build_array('_calc_vendas_do_mes',
      'nullif(x->>''ajustado'', '''') as ajustado',
      'nullif(x->>''ajustado'', '''') as ajustado, coalesce((x->>''upsell'')::boolean, false) as upsell', 1),
    jsonb_build_array('_calc_vendas_do_mes',
      'count(*)::int as vendas, sum(mrr) as mrr',
      'count(*) filter (where not upsell)::int as vendas, sum(mrr) as mrr', 1),
    jsonb_build_array('_calc_vendas_do_mes',
      'jsonb_build_object(''vendas'', count(*), ''mrr''',
      'jsonb_build_object(''vendas'', count(*) filter (where not upsell), ''mrr''', 1),
    jsonb_build_array('_calc_vendas_do_mes',
      '''ajustado'', ajustado)',
      '''ajustado'', ajustado, ''upsell'', upsell)', 1)
  );
  t jsonb; n int;
begin
  for r in select distinct t2->>0 as nome from jsonb_array_elements(trocas) t2 loop
    select p.oid into strict fn from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = r.nome and p.prokind = 'f';
    def := pg_get_functiondef(fn);
    if def like '%upsell%' then raise notice '0279: % já pula o upsell', r.nome; continue; end if;
    novo := def;
    for t in select x from jsonb_array_elements(trocas) x where x->>0 = r.nome loop
      n := (length(novo) - length(replace(novo, t->>1, ''))) / greatest(length(t->>1), 1);
      if n <> (t->>3)::int then
        raise exception '0279: em % o trecho casou % vez(es), esperava %: %', r.nome, n, t->>3, t->>1;
      end if;
      novo := replace(novo, t->>1, t->>2);
    end loop;
    execute novo;
    raise notice '0279: % passa a pular o upsell', r.nome;
  end loop;
end $$;

-- o contrato que já tinha nascido do upsell do Bruno sai da conta (mesmo formato de estorno da casa)
insert into public.pontos_eventos (owner_id, pessoa, tipo, pts, origem_id, ref_em, negocio_id, negocio_nome)
select pe.owner_id, pe.pessoa, 'estorno', -pe.pts, 'contrato:' || pe.origem_id, pe.ref_em, pe.negocio_id, pe.negocio_nome
  from public.pontos_eventos pe
 where pe.tipo = 'contrato' and pe.negocio_id = '68715515936'
on conflict (tipo, origem_id) do nothing;
