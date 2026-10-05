import type { Client } from '../types/client';

// SLA estourado (regra do MD REGRA_SLA_ESTOURADO.md) — versão client-side pra
// mostrar o status no card do lead. MESMOS números da RPC sla_estourado_candidates
// (mantê-los em sincronia; quando o painel de config do gestor existir, os dois
// passam a ler de lá). diasParado = hoje − max(entrada na etapa, última
// atividade humana, criação); breach = diasParado > SLA_da_etapa.

// SLA por etapa (dias). Defaults do MD; podem vir da route_config (gestor edita).
export interface SlaDays {
  prospeccao: number;
  visita: number;
  conversa: number;
  demo: number;
  negociacao: number;
  ag_pagamento: number;
}
export const DEFAULT_SLA: SlaDays = {
  prospeccao: 5,
  visita: 5,
  conversa: 4,
  demo: 3,
  negociacao: 7,
  ag_pagamento: 2,
};
const NO_SLA = 999;

const MS_DAY = 24 * 60 * 60 * 1000;

/** Dias úteis entre dois instantes, contados por data de Brasília: os úteis em (início, fim]. */
export function diasUteisEntre(inicioMs: number, fimMs: number): number {
  if (!(inicioMs < fimMs)) return 0;
  const dia = (ms: number) => Math.floor((ms - 3 * 3600000) / MS_DAY); // dia BRT, em dias desde 1970
  let n = 0;
  for (let d = dia(inicioMs) + 1; d <= dia(fimMs); d++) {
    const dow = (d + 4) % 7; // 01/01/1970 foi quinta (4)
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

export function slaForStage(etapa: string | null | undefined, sla: SlaDays = DEFAULT_SLA): number {
  const key = (etapa ?? '').trim().toUpperCase();
  switch (key) {
    case 'PROSPECÇÃO':
    case 'PROSPECCAO':
      return sla.prospeccao;
    case 'VISITA':
      return sla.visita;
    case 'CONVERSA COM DECISOR':
    case 'DIAGNÓSTICO':
    case 'DIAGNOSTICO':
      return sla.conversa;
    case 'DEMO/PROPOSTA':
      return sla.demo;
    case 'NEGOCIAÇÃO':
    case 'NEGOCIACAO':
      return sla.negociacao;
    case 'AG. PAGAMENTO':
      return sla.ag_pagamento;
    default:
      return NO_SLA;
  }
}

export interface SlaStatus {
  diasParado: number;
  sla: number;
  breach: boolean;
  ratio: number; // diasParado / sla
  // Só faz sentido pra LEAD numa etapa com SLA definido (senão não exibe badge).
  applies: boolean;
}

export function slaStatus(client: Client, slaDays: SlaDays = DEFAULT_SLA, now = Date.now()): SlaStatus {
  const sla = slaForStage(client.etapa, slaDays);
  const applies = sla < NO_SLA && client.status === 'lead';

  // Data mais recente entre entrada na etapa, última atividade humana e criação
  // (ignora nulos). Interação humana reseta o contador.
  // A visita pelo app também é toque (05/10/26): o cartão dizia "SLA estourado — 44 dias parado"
  // num lead visitado havia 3 dias, porque hs_last_activity_at chega atrasado do HubSpot.
  const times = [client.hs_stage_entered_at, client.hs_last_activity_at, client.created_at, client.visited_at]
    .map((v) => (v ? new Date(v).getTime() : NaN))
    .filter((t) => Number.isFinite(t)) as number[];
  const base = times.length ? Math.max(...times) : now;

  // Só dia útil (Julyan, 05/10/26: "não pode contar os finais de semana"), em Brasília —
  // a mesma conta do robô do Cockpit (diasUteisEntre): sexta → segunda é 1 dia, não 3.
  const diasParado = Math.max(0, diasUteisEntre(base, now));
  const breach = applies && diasParado > sla;
  const ratio = sla > 0 ? diasParado / sla : 0;
  return { diasParado, sla, breach, ratio, applies };
}
