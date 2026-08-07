import type { Client } from '../types/client';

// SLA estourado (regra do MD REGRA_SLA_ESTOURADO.md) — versão client-side pra
// mostrar o status no card do lead. MESMOS números da RPC sla_estourado_candidates
// (mantê-los em sincronia; quando o painel de config do gestor existir, os dois
// passam a ler de lá). diasParado = hoje − max(entrada na etapa, última
// atividade humana, criação); breach = diasParado > SLA_da_etapa.

// SLA por etapa (dias), chaveado pelo LABEL normalizado (client.etapa é label).
const SLA_DAYS: Record<string, number> = {
  'PROSPECÇÃO': 5,
  'PROSPECCAO': 5,
  'VISITA': 5,
  'CONVERSA COM DECISOR': 4,
  'DIAGNÓSTICO': 4,
  'DIAGNOSTICO': 4,
  'DEMO/PROPOSTA': 3,
  'NEGOCIAÇÃO': 7,
  'NEGOCIACAO': 7,
  'AG. PAGAMENTO': 2,
};
const NO_SLA = 999;

const MS_DAY = 24 * 60 * 60 * 1000;

export function slaForStage(etapa: string | null | undefined): number {
  const key = (etapa ?? '').trim().toUpperCase();
  return SLA_DAYS[key] ?? NO_SLA;
}

export interface SlaStatus {
  diasParado: number;
  sla: number;
  breach: boolean;
  ratio: number; // diasParado / sla
  // Só faz sentido pra LEAD numa etapa com SLA definido (senão não exibe badge).
  applies: boolean;
}

export function slaStatus(client: Client, now = Date.now()): SlaStatus {
  const sla = slaForStage(client.etapa);
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
