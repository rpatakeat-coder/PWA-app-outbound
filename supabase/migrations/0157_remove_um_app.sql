-- 0157 · Remove o "um app só" (04/10/2026). O Julyan não gostou e pediu para voltar ao que era.
-- Tira o que a 0156 criou: placar_executivo(), meus_recursos() e a tabela feature_flags
-- (só tinha as duas linhas da chave um_app, já desligadas). Nada mais no banco dependia delas:
-- o app e o Cockpit voltaram ao código de antes no mesmo dia.
-- Idempotente.
drop function if exists public.placar_executivo();
drop function if exists public.meus_recursos();
drop table if exists public.feature_flags;
