// O MOTIVO DA PARADA OBRIGATÓRIA na rota (field_route_stops.mandatory_reason): a etiqueta curta
// que o cartão da parada mostra. A montagem automática da "Rota do dia" (assembleDailyRoute,
// smartFill) que morava aqui não tinha mais chamador e saiu em 20/11/26.

export type MandatoryReason = 'sla' | 'relacionamento' | 'conta_alvo';

export const MANDATORY_BADGE: Record<MandatoryReason, string> = {
  sla: 'SLA',
  relacionamento: 'Relacionamento',
  conta_alvo: 'Conta Alvo',
};
