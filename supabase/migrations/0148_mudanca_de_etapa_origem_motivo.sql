-- 0148 · O histórico de etapa diz DE ONDE veio a mudança e POR QUÊ (01/10/26).
--
-- O kanban novo do Meu funil (Cockpit, docs/09-kanban-meu-funil.md) muda etapa por
-- arraste, pelo → e pelo painel. A escrita no HubSpot continua a mesma rota de sempre
-- (/api/negocio-acao, com as travas do servidor); esta linha é o complemento no app,
-- para o gestor saber que a mudança saiu do Cockpit e com que motivo (Perdido, volta
-- de etapa, data de retorno da Reciclagem, recado para o onboarding).
--
-- Só colunas novas e anuláveis: quem já grava aqui (o app) não muda nada. Nenhum
-- gatilho novo; o único que existe (guard_stage_change_only_for_lead) segue igual.

alter table public.client_stage_changes
  add column if not exists origem text,
  add column if not exists motivo text;

comment on column public.client_stage_changes.origem is
  'de onde veio a mudança: null = app (como sempre foi); cockpit-kanban = quadro do Meu funil';
comment on column public.client_stage_changes.motivo is
  'o motivo pedido na mudança: perda, volta de etapa, data de retorno, recado ao onboarding';
