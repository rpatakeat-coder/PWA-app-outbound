-- 0223 · O FEITO PELA AGENDA (handoff "Tarefas por dia", 20/10/26, 2.6).
-- A tarefa de ligar ou WhatsApp agora aparece na lista do dia da Agenda; tocar nela abre o cartão
-- na aba Tarefas, e o registro feito por esse caminho ganha o selo "pela Agenda" no Feito hoje.
-- A origem é só mais um valor permitido: nenhuma linha existente muda.
alter table public.fila_feitas drop constraint if exists fila_feitas_origem_valida;
alter table public.fila_feitas add constraint fila_feitas_origem_valida
  check (origem in ('fila', 'cheguei', 'ligacao_app', 'whatsapp_app', 'desfecho', 'agenda'));
