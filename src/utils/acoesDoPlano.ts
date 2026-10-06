// UM PLANO SÓ, MONTADO NO MAPA (Claude Design "entrega-um-plano-so", 06/10/2026).
//
// Julyan: "tem que ser um plano só… ele tem que planejar pelo mapa… o agendar é de reunião,
// tem que ser de prospecção também, follow, outras coisas". E: "o executivo também planeja
// pelo Cockpit". Aqui ficam as regras puras, testadas em acoesDoPlano.teste.ts:
//   · a tabela §2.1 — o chip do "o que vai fazer" é o MESMO rótulo no app, no Planejamento
//     do Cockpit e na Rua › Rotas (o banco guarda o id em field_route_stops.acao e na faixa
//     da grade, 0175);
//   · o chip sugerido pela etapa do negócio;
//   · o casamento compromisso ↔ parada, para a Agenda nunca mostrar a mesma coisa duas vezes.

import { ETAPA } from './fichaDeRua';

export type AcaoId = 'prosp' | 'follow' | 'reuniao' | 'demo' | 'ligar' | 'cobrar' | 'rel';

export type Acao = {
  id: AcaoId;
  rotulo: string;
  /** O propósito da grade do Planejamento (rótulo do Cockpit). */
  proposito: string;
  /** O que vai ao HubSpot quando tem hora. */
  hubspot: string;
  /** Ligar não é parada de rua: não ganha posição na rota. */
  ehParada: boolean;
};

export const ACOES: Acao[] = [
  { id: 'prosp', rotulo: 'Visita de prospecção', proposito: 'Prospecção de rua', hubspot: 'tarefa de visita', ehParada: true },
  { id: 'follow', rotulo: 'Follow-up', proposito: 'Follow-up', hubspot: 'tarefa de follow-up', ehParada: true },
  { id: 'reuniao', rotulo: 'Reunião', proposito: 'Avançar o funil', hubspot: 'reunião', ehParada: true },
  { id: 'demo', rotulo: 'Demo', proposito: 'Avançar o funil', hubspot: 'reunião de Demo', ehParada: true },
  { id: 'ligar', rotulo: 'Ligar', proposito: 'Follow-up', hubspot: 'tarefa de ligação', ehParada: false },
  { id: 'cobrar', rotulo: 'Cobrar pagamento', proposito: 'Cobrar pagamento', hubspot: 'tarefa de cobrança', ehParada: true },
  { id: 'rel', rotulo: 'Visita de relacionamento', proposito: 'Visita de relacionamento', hubspot: 'tarefa de visita', ehParada: true },
];

export function acaoPorId(id: string | null | undefined): Acao | null {
  return ACOES.find((a) => a.id === id) ?? null;
}

/** O propósito da grade, como o banco calcula (plano_proposito, 0175). */
export function propositoDaAcao(id: AcaoId, contaAlvo: boolean): string {
  if (id === 'prosp') return contaAlvo ? 'Prospecção de conta nova' : 'Prospecção de rua';
  return acaoPorId(id)!.proposito;
}

/** O chip da faixa que veio do Cockpit sem chip: sai do propósito da grade. */
export function acaoDoProposito(p: string | null | undefined): AcaoId | null {
  switch (p) {
    case 'rua': case 'nova': return 'prosp';
    case 'follow': return 'follow';
    case 'cobrar': return 'cobrar';
    case 'relac': return 'rel';
    case 'funil': return 'reuniao';
    default: return null;
  }
}

/** O sugerido pela etapa (§4.2): conta-alvo → prospecção; Visita → follow-up; Decisor/Demo →
 *  Demo; Negociação → follow-up; Ag. Pagamento → cobrar; cliente → relacionamento. */
export function acaoSugerida(p: { etapa: string | null; tipoPino: string | null; cliente: boolean }): { id: AcaoId; motivo: string } {
  if (p.cliente || p.tipoPino === 'cliente') return { id: 'rel', motivo: 'Cliente Takeat → Visita de relacionamento' };
  if (p.tipoPino === 'alvo' || !p.etapa) return { id: 'prosp', motivo: 'Conta-alvo → Visita de prospecção' };
  switch (p.etapa) {
    case ETAPA.prospeccao: return { id: 'prosp', motivo: 'Prospecção → Visita de prospecção' };
    case ETAPA.visita: return { id: 'follow', motivo: 'Visita → Follow-up' };
    case ETAPA.decisor: return { id: 'demo', motivo: 'Conversa com decisor → Demo' };
    case ETAPA.demo: return { id: 'demo', motivo: 'Demo/Proposta → Demo' };
    case ETAPA.negociacao: return { id: 'follow', motivo: 'Negociação → Follow-up' };
    case ETAPA.pagamento: return { id: 'cobrar', motivo: 'Ag. Pagamento → Cobrar pagamento' };
    default: return { id: 'follow', motivo: 'Follow-up' };
  }
}

export const LIMITE_DO_DIA = 15;

/** O dia mais perto com espaço, a partir do escolhido (o cheio nunca grava a 16ª). */
export function diaComEspaco(dias: string[], contagem: Record<string, number>, escolhido: string): string | null {
  const i = Math.max(0, dias.indexOf(escolhido));
  const ordem = [...dias.slice(i + 1), ...dias.slice(0, i).reverse()];
  return ordem.find((d) => (contagem[d] ?? 0) < LIMITE_DO_DIA) ?? null;
}

// ── O CASAMENTO COMPROMISSO ↔ PARADA (§2.3) ───────────────────────────────────────────────
// Um compromisso que já é parada não aparece de novo. A ordem para no primeiro que casar:
// 1. o negócio (id do HubSpot); 2. sem negócio, o nome normalizado no mesmo bairro; 3. o
// cadastro. Foi o caso do Mada (mesmo restaurante, outro cadastro) e do Armazém (follow-up
// ligado ao negócio, não ao cadastro), medidos em 07/10.

const RUIDO = /\b(restaurante|restaurant|bar|ltda|me|eireli|lanchonete|pizzaria|e|do|da|de|dos|das)\b/g;
export function nomeNormalizado(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(RUIDO, ' ').replace(/\s+/g, ' ').trim();
}

export type ParadaParaCasar = { clientId: string; dealId: string | null; nome: string | null; bairro: string | null };
export type CompromissoParaCasar = { clientId: string | null; dealId: string | null; nome: string | null; bairro: string | null };
export type Casamento = { clientId: string; motivo: 'negocio' | 'nome' | 'cadastro' };

export function casarCompromisso(k: CompromissoParaCasar, paradas: ParadaParaCasar[]): Casamento | null {
  if (k.dealId) {
    const p = paradas.find((x) => x.dealId && x.dealId === k.dealId);
    if (p) return { clientId: p.clientId, motivo: 'negocio' };
  }
  const nk = nomeNormalizado(k.nome);
  if (nk) {
    const bk = nomeNormalizado(k.bairro);
    const p = paradas.find((x) => nomeNormalizado(x.nome) === nk && (!bk || !x.bairro || nomeNormalizado(x.bairro) === bk));
    if (p) return { clientId: p.clientId, motivo: 'nome' };
  }
  if (k.clientId) {
    const p = paradas.find((x) => x.clientId === k.clientId);
    if (p) return { clientId: p.clientId, motivo: 'cadastro' };
  }
  return null;
}

export function motivoDoCasamento(m: Casamento['motivo'], mesmoCadastro: boolean): string {
  if (m === 'negocio') return 'ligado pelo negócio';
  if (m === 'nome') return mesmoCadastro ? 'mesmo cadastro' : 'mesmo restaurante, outro cadastro';
  return 'mesmo cadastro';
}

/** Distância em metros entre dois pontos (haversine). */
export function metrosEntre(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * O dia sugerido (§4.2): o dia com espaço cuja rota passa mais perto do pino (até 2 km) —
 * "a rota de quinta passa a 450 m"; senão o primeiro dia vazio a partir de amanhã; senão o
 * primeiro com espaço. Hoje só entra antes do meio-dia.
 */
export function diaSugerido(p: {
  dias: string[]; hoje: string; horaBRT: number; ponto: { lat: number; lng: number } | null;
  contagem: Record<string, number>; pontosDoDia: Record<string, Array<{ lat: number | null; lng: number | null }>>;
}): { dia: string; motivo: string } | null {
  const candidatos = p.dias.filter((d) => (d !== p.hoje || p.horaBRT < 12) && (p.contagem[d] ?? 0) < LIMITE_DO_DIA);
  if (!candidatos.length) return null;
  if (p.ponto) {
    let melhor: { dia: string; m: number } | null = null;
    for (const d of candidatos) {
      for (const q of p.pontosDoDia[d] ?? []) {
        if (q.lat == null || q.lng == null) continue;
        const m = metrosEntre(p.ponto, { lat: q.lat, lng: q.lng });
        if (m <= 2000 && (!melhor || m < melhor.m)) melhor = { dia: d, m };
      }
    }
    if (melhor) return { dia: melhor.dia, motivo: `a rota passa a ${melhor.m < 1000 ? Math.round(melhor.m / 10) * 10 + ' m' : (melhor.m / 1000).toFixed(1).replace('.', ',') + ' km'}` };
  }
  const vazio = candidatos.find((d) => d !== p.hoje && !(p.contagem[d] ?? 0));
  if (vazio) return { dia: vazio, motivo: 'está vazio' };
  return { dia: candidatos[0], motivo: 'tem espaço' };
}
