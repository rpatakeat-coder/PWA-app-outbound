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
  const times = [client.hs_stage_entered_at, client.hs_last_activity_at, client.created_at]
    .map((v) => (v ? new Date(v).getTime() : NaN))
    .filter((t) => Number.isFinite(t)) as number[];
  const base = times.length ? Math.max(...times) : now;

  const diasParado = Math.max(0, Math.floor((now - base) / MS_DAY));
  const breach = applies && diasParado > sla;
  const ratio = sla > 0 ? diasParado / sla : 0;
  return { diasParado, sla, breach, ratio, applies };
}
