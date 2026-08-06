// "Rota do dia": monta 3 visitas OBRIGATORIAS + completa ate a meta com
// sugestoes inteligentes. As obrigatorias sao 1 por regra, sempre clientes
// DISTINTOS, escolhendo o mais proximo/urgente da base (GPS do vendedor):
//   1. SLA estourado      -> provider async (Fase 2: RPC sla_estourado_candidates)
//   2. Relacionamento     -> cliente ativo do vendedor com > 1000 comandas (pronto)
//   3. Conta Alvo         -> provider async (Fase 3: edge conta-alvo-nearby, 2km)
// Regra que nao acha candidato hoje entra em `missing` (o app avisa) e o slot
// e' preenchido por uma sugestao normal. A ordenacao final (TSP) e a gravacao
// ficam no App; aqui e' so' a SELECAO (puro, testavel).

import type { Client } from '../types/client';

export type MandatoryReason = 'sla' | 'relacionamento' | 'conta_alvo';

export const MANDATORY_LABEL: Record<MandatoryReason, string> = {
  sla: 'SLA estourado',
  relacionamento: 'Relacionamento (+1000 comandas)',
  conta_alvo: 'Conta Alvo',
};

// Cadeado/etiqueta curta por regra, pro card da parada.
export const MANDATORY_BADGE: Record<MandatoryReason, string> = {
  sla: '🔒 SLA',
  relacionamento: '🔒 Relacionamento',
  conta_alvo: '🔒 Conta Alvo',
};

export const DAILY_GOAL = 6;
export const HS_COMANDAS_MIN = 1000;
const VISIT_RECENT_MS = 14 * 24 * 60 * 60 * 1000;

type LatLon = { latitude: number; longitude: number };

// Haversine local (metros). Duplicado de propósito pra este util ficar puro,
// sem importar de hooks (evita ciclo).
const toRad = (d: number) => (d * Math.PI) / 180;
function distMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}

// vendor null = sem recorte de vendedor (admin "todos"); senao casa por
// vendedor_id_hubspot (mesma semantica do suggestRoute).
const matchesVendor = (c: Client, vendor: string | null) =>
  vendor === null ? true : c.vendedor_id_hubspot === vendor;

const hasCoords = (c: Client): c is Client & { latitude: number; longitude: number } =>
  c.latitude != null && c.longitude != null;

// ===== Relacionamento: cliente ativo do vendedor com > 1000 comandas =====
// Escolhe o mais interessante de visitar: primeiro quem NAO foi visitado nos
// ultimos 14 dias, depois o mais proximo da base.
export function pickRelacionamento(
  clients: Client[],
  base: LatLon,
  vendor: string | null,
  exclude: Set<string>,
  now = Date.now(),
): Client | null {
  const cands = clients.filter(
    (c) =>
      !exclude.has(c.id) &&
      hasCoords(c) &&
      (c.hs_qtd_comandas ?? 0) > HS_COMANDAS_MIN &&
      c.hs_situacao !== 'churn' &&
      matchesVendor(c, vendor),
  );
  if (cands.length === 0) return null;

  const rank = (c: Client) => {
    const visitedRecently = c.visited_at
      ? now - new Date(c.visited_at).getTime() < VISIT_RECENT_MS
      : false;
    const d = distMeters(base.latitude, base.longitude, c.latitude as number, c.longitude as number);
    return { visitedRecently, d };
  };
  return [...cands].sort((a, b) => {
    const ka = rank(a);
    const kb = rank(b);
    if (ka.visitedRecently !== kb.visitedRecently) return ka.visitedRecently ? 1 : -1;
    return ka.d - kb.d;
  })[0];
}

// ===== Preenchimento inteligente (mesma formula do suggestRoute) =====
const statusWeight = (s: string) =>
  s === 'lead' ? 0 : s === 'cliente' ? 6 : s === 'churn' ? 9 : 4;
const potentialScore = (c: Client) =>
  Math.min(1, (c.id_hubspot ? 0.6 : 0) + (c.empresa?.trim() ? 0.4 : 0));

export function smartFill(
  clients: Client[],
  base: LatLon,
  vendor: string | null,
  exclude: Set<string>,
  n: number,
): Client[] {
  if (n <= 0) return [];
  const elig = clients.filter((c) => !exclude.has(c.id) && hasCoords(c) && matchesVendor(c, vendor));
  if (elig.length === 0) return [];
  const withM = elig.map((c) => ({
    c,
    m: distMeters(base.latitude, base.longitude, c.latitude as number, c.longitude as number),
  }));
  const maxM = Math.max(1, ...withM.map((x) => x.m));
  return withM
    .map(({ c, m }) => ({
      c,
      score: 0.5 * (m / maxM) + 0.3 * (statusWeight(c.status) / 9) + 0.2 * (1 - potentialScore(c)),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, n)
    .map((x) => x.c);
}

// Provider de uma obrigatoria que depende de backend (SLA, Conta Alvo). Recebe
// o conjunto ja usado pra nao repetir cliente. Fase 1: ambos retornam null.
export type MandatoryProvider = (excludeIds: Set<string>) => Promise<Client | null>;

export interface DailyProviders {
  sla: MandatoryProvider;
  contaAlvo: MandatoryProvider;
}

export interface DailyAssembly {
  // Candidatos na ordem obrigatorias-primeiro (o TSP reordena depois).
  candidates: Client[];
  // client.id -> por que e' obrigatoria (pra gravar mandatory_reason + UI).
  reasonByClientId: Map<string, MandatoryReason>;
  // Regras que nao acharam candidato hoje (o app avisa).
  missing: MandatoryReason[];
}

// Monta o conjunto do dia. Ordem das obrigatorias: SLA, Relacionamento, Conta
// Alvo. Cada uma exclui as ja escolhidas (clientes distintos). Completa ate
// `goal` com smartFill.
export async function assembleDailyRoute(opts: {
  clients: Client[];
  base: LatLon;
  vendor: string | null;
  excludeIds: Set<string>;
  providers: DailyProviders;
  goal?: number;
  now?: number;
}): Promise<DailyAssembly> {
  const { clients, base, vendor, providers } = opts;
  const goal = opts.goal ?? DAILY_GOAL;
  const now = opts.now ?? Date.now();

  const used = new Set(opts.excludeIds);
  const reasonByClientId = new Map<string, MandatoryReason>();
  const missing: MandatoryReason[] = [];
  const mandatory: Client[] = [];

  const take = (c: Client | null, reason: MandatoryReason) => {
    if (c && !used.has(c.id)) {
      used.add(c.id);
      mandatory.push(c);
      reasonByClientId.set(c.id, reason);
    } else {
      missing.push(reason);
    }
  };

  take(await providers.sla(used), 'sla');
  take(pickRelacionamento(clients, base, vendor, used, now), 'relacionamento');
  take(await providers.contaAlvo(used), 'conta_alvo');

  const fill = smartFill(clients, base, vendor, used, Math.max(0, goal - mandatory.length));
  return { candidates: [...mandatory, ...fill], reasonByClientId, missing };
}
