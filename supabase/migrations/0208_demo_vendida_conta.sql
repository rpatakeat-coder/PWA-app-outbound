-- 0208 · DEMO QUE VIROU VENDA CONTA AS DUAS (Julyan, 16/10/2026)
--
-- A 0200 (13/10) fazia o negócio que teve demo e fechou na mesma semana contar só a venda (100), para
-- não somar 25 + 100. O Julyan reverteu: "andre fez a demonstração e vendeu na hora, tem que contar a
-- pontuação, isso atrapalha o ranking". A demo (25) volta a contar junto com a venda (100).
-- Semana de 12/10: André 233 → 283, Marco 289 → 314 (Rascal Lounge); os outros não mudam.
-- A outra regra da 0200 (cada restaurante pontua uma vez na semana) continua.
--
-- Tira só a linha que excluía a demo vendida, sobre a definição que está no ar. Idempotente.
do $migr$
declare
  d text;
  antes constant text := E'\n       and not exists (select 1 from vendidos vd where vd.owner_id = pe.owner_id and vd.id = pe.negocio_id)';
begin
  d := pg_get_functiondef('public.pontos_da_semana(date)'::regprocedure);
  if position('0208:' in d) > 0 then
    raise notice '0208: já aplicada';
    return;
  end if;
  if (length(d) - length(replace(d, antes, ''))) / length(antes) <> 1 then
    raise exception '0208: a linha da demo vendida não está (ou está mais de uma vez) em pontos_da_semana';
  end if;
  execute replace(d, antes, E'\n       -- 0208: demo de negócio vendido na semana conta (25) junto com a venda (100)');
end
$migr$;
