-- 0178 · Pausa o motor das contas-alvo (0110/0111) — sem data para voltar
--
-- Por que: em 07/10/2026 o Google desligou a cobrança do projeto que paga o
-- Maps e o Places, e o mapa do app caiu para todo mundo. O motor era o maior
-- consumidor de Places: conferia 120 contas-alvo por dia, 3.600 a 7.000
-- chamadas por mês (commit bf0c5b0). A busca de contas-alvo vai mudar para
-- outra API; até lá, o motor fica parado.
--
-- O commit bf0c5b0 diz que "o cron do motor ficou pausado", mas nenhuma
-- migration fazia isso — se foi feito, foi à mão no SQL Editor, e o repositório
-- continuava dizendo que o job roda todo dia às 04:00. Este arquivo é o
-- registro, e é idempotente: se o job já tiver sido removido, não faz nada.
--
-- O que NÃO muda: a Edge Function `motor-contas-alvo` e a função
-- `public.invocar_motor_contas_alvo` continuam existindo — só não há mais
-- ninguém chamando. As colunas motor_* das contas-alvo ficam com o último
-- valor conferido; nada é apagado.
--
-- Para religar (quando a nova API substituir o Places, ou se a cobrança do
-- Google voltar e a decisão for usar o Places de novo): reaplicar a
-- 0111_agenda_motor_contas_alvo.sql, que recria o mesmo agendamento.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'motor-contas-alvo-diario') then
    perform cron.unschedule('motor-contas-alvo-diario');
  end if;
end $$;
