-- 0112 · Motor das contas-alvo confere o CNPJ (prompt final §8.1: "para CNPJ, se
-- está ativo"; motor_status ganha cnpj_baixado).
--
-- Por quê: 1.476 das 1.486 contas-alvo da munição têm CNPJ em
-- leads_prospeccao.cnpj. A primeira rodada do motor (26/09) não achou 45 de 120
-- no Google porque buscava pela razão social ("E. F. DOS SANTOS REFEICAO E
-- ALIMENTACAO LTDA"), que não é o nome da fachada. A Receita (BrasilAPI) dá a
-- situação cadastral — baixado/inapto vira alerta sem gastar consulta do
-- Google — e o nome fantasia, que é com o que o Google acha o lugar.
-- Idempotente.

alter table public.clients drop constraint if exists clients_motor_status_check;
alter table public.clients add constraint clients_motor_status_check
  check (motor_status is null or motor_status in ('ok', 'sumiu_google', 'fechado_temporario', 'nao_achado', 'cnpj_baixado'));

comment on column public.clients.motor_status is
  'Motor mensal das contas-alvo (0110/0112): ok | sumiu_google (fechado de vez) | fechado_temporario | nao_achado (a busca não achou o lugar perto do pino) | cnpj_baixado (Receita: baixado/inapto/suspenso).';
