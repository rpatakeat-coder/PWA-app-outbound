-- 0123 · Agenda a clientes-sync (0122) todo dia, e desliga a agenda antiga que nunca funcionou
--
-- Testada antes de agendar (27/09/2026, rodada 1): 6.082 negócios de Onboarding + Sucesso
-- lidos em 54 s, 4.884 pinos do mapa atualizados (estavam congelados desde 05/08).
--
-- 06:00 UTC = 03:00 BRT: depois da atualização da madrugada que o sistema da Takeat faz nos
-- negócios do HubSpot (~21:00–00:40 UTC), longe do uso na rua.
--
-- hubspot-usage-sync-semanal (job antigo) mandava "Bearer SUA_SERVICE_ROLE_KEY" literal e
-- nunca autenticou; a clientes-sync substitui a função inteira. Sai o agendamento; a
-- função velha fica publicada, sem ninguém chamando, até ser removida pelo painel.
-- Idempotente.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hubspot-usage-sync-semanal') then
    perform cron.unschedule('hubspot-usage-sync-semanal');
  end if;
  if exists (select 1 from cron.job where jobname = 'clientes-sync-diario') then
    perform cron.unschedule('clientes-sync-diario');
  end if;
end $$;

select cron.schedule(
  'clientes-sync-diario',
  '0 6 * * *',
  $$select public.invocar_clientes_sync();$$
);
