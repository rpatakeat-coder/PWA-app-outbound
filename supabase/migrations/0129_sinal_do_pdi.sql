-- 0129 · O acordo do 1:1 também avisa (Cockpit v5, contrato linha 16, 28/09/2026)
--
-- Os acordos do 1:1 passaram a aparecer na aba Tarefas do app, com "feito". Quem marca
-- é o executivo (no app ou no Cockpit) e quem valida ou devolve é o gestor (Pessoas). Sem
-- sinal, um lado só via o outro na próxima carga. Mesmo esquema da 0128: um sinal pequeno
-- em sinais_ao_vivo, sem conteúdo; quem recebe relê pela própria sessão.

create or replace function public.tg_sinal_pdi() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform public.sinal_ao_vivo('pdi', null, null, new.owner_id); return null; end; $$;
drop trigger if exists sinal_pdi on public.pdi_compromissos;
create trigger sinal_pdi after insert or update on public.pdi_compromissos for each row execute function public.tg_sinal_pdi();
