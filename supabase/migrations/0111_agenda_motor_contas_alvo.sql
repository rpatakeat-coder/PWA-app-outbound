-- 0111 · Agenda o motor das contas-alvo (0110) — todo dia às 04:00 de Brasília
--
-- Testado antes de agendar (26/09/2026, simulação com 8): 6 abertas com nota e
-- avaliações atualizadas, 2 não achadas (munição com razão social, que não é o
-- nome da fachada — ficam "nao_achado", sem alerta). A chave do Google tem a
-- Places API (New) ligada.
--
-- 120 por rodada: as 2.734 contas-alvo passam em ~23 dias, e cada uma volta a
-- ser conferida quando faz 30 dias. 07:00 UTC = 04:00 BRT, longe do uso na rua.
-- Idempotente: remove o agendamento de mesmo nome antes de criar.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'motor-contas-alvo-diario') then
    perform cron.unschedule('motor-contas-alvo-diario');
  end if;
end $$;

select cron.schedule(
  'motor-contas-alvo-diario',
  '0 7 * * *',
  $$select public.invocar_motor_contas_alvo(false, 120);$$
);
