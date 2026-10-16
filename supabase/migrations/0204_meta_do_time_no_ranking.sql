-- 0204 · A META DO TIME NO RANKING DO APP É A MESMA DO COCKPIT (auditoria 16/10/2026)
--
-- O ranking do app (FolhaRanking, "meta coletiva") somava a meta de cada pessoa: 48 em outubro.
-- O Cockpit do gestor mostra 52: a meta do time tem gordura de propósito (Julyan, 13/10/26:
-- "deixa 52 pra ter uma gordura"), e o robô grava esse total em
-- cockpit_snapshot('hubspot').kpis.metaMensalFechados junto com o mês (kpis.metasMes).
-- O executivo via "13 de 48 contratos" e o gestor "13 de 52".
--
-- A mesma expressão vive em três funções: _ranking_semana_bonus (a que responde com o placar do
-- bônus), ranking_executivo (o ramo antigo) e ranking_gestor. Troca só a expressão da meta, sobre a
-- definição que está no ar (não reescreve a função a partir de um arquivo antigo). Usa o total do
-- robô quando ele é DESTE mês (em Brasília); senão, a soma das pessoas, como antes.
-- Idempotente: a função já trocada é pulada.
do $migr$
declare
  f text;
  d text;
  antes constant text := $r$'meta', coalesce(sum(coalesce(nullif(rv.value->>'metaMensal', '')::int, 0)), 0))$r$;
  depois constant text := $r$'meta', coalesce((select nullif(s2.conteudo->'kpis'->>'metaMensalFechados', '')::int from public.cockpit_snapshot s2
          where s2.chave = 'hubspot' and s2.conteudo->'kpis'->>'metasMes' = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')),
        coalesce(sum(coalesce(nullif(rv.value->>'metaMensal', '')::int, 0)), 0)))$r$;
begin
  foreach f in array array['public._ranking_semana_bonus(text)', 'public.ranking_executivo(text)', 'public.ranking_gestor(text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('metaMensalFechados' in d) > 0 then
      raise notice '0204: % já trocada', f;
      continue;
    end if;
    if position(antes in d) = 0 then
      raise exception '0204: a expressão da meta mudou em %; conferir antes de aplicar', f;
    end if;
    execute replace(d, antes, depois);
  end loop;
end
$migr$;
