-- Rota do dia (Fase 1): marca paradas OBRIGATORIAS e por que entraram.
--
-- A "Rota do dia" monta 3 visitas obrigatorias (1 de SLA estourado, 1 de
-- Relacionamento >1000 comandas, 1 de Conta Alvo) + ate 3 sugeridas. Esta
-- coluna guarda o MOTIVO de uma parada ser obrigatoria, pra a UI mostrar o
-- cadeado/etiqueta. NULL = parada normal (sugerida ou adicionada a mao).
--
-- Valores usados pelo app: 'sla' | 'relacionamento' | 'conta_alvo'.

ALTER TABLE public.field_route_stops
  ADD COLUMN IF NOT EXISTS mandatory_reason text;

COMMENT ON COLUMN public.field_route_stops.mandatory_reason IS
  'Motivo de a parada ser obrigatoria na Rota do dia: sla | relacionamento | conta_alvo. NULL = parada normal.';
