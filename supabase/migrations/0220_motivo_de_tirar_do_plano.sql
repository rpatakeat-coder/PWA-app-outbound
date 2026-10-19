-- 0220 · O MOTIVO DE TIRAR DO PLANO (19/10/2026, handoff "Agenda do App" §2.2)
--
-- O "Tirar do plano" da próxima parada pergunta o motivo (Fechado / Sem tempo hoje / Passar para outro
-- dia). A parada continua saindo como sempre (status 'removed', que o espelho 0150 leva ao
-- Planejamento do Cockpit); o motivo fica na própria linha, para o gestor ler.
alter table public.field_route_stops add column if not exists motivo_remocao text;
comment on column public.field_route_stops.motivo_remocao is
  'Por que o executivo tirou a parada do plano pela Agenda: fechado | sem_tempo | outro_dia (0220).';
