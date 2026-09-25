-- 0101 — Agenda a localização da munição (0100), depois da rodada de teste
--
-- De hora em hora, no minuto 3: o negocio-vira-ponto (0, 15, 30, 45) já acha a
-- coordenada nova para o pin do negócio, e o unificacao-reconciliar (7, 22, ...)
-- leva a visita planejada para a rota.

select cron.unschedule(jobid) from cron.job where jobname = 'localizar-municao-hora';
select cron.schedule('localizar-municao-hora', '3 * * * *', 'select public.invocar_localizar_municao(false, 20);');
