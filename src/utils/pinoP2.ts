// Regra do pino "gota escura + anel" (mapa novo, entrega 2; prancha §6).
//
// Função pura: recebe o lead e o contexto (quem sou eu, quem é do time, o
// tempo parado do Cockpit, a tabela etapa_de_para) e devolve o que o
// desenho precisa. Fica fora do componente para ser testada sem mapa
// (pinoP2.teste.ts) — o erro caro aqui é pintar o lead do colega como meu, ou
// um negócio parado há 40 dias como "hoje".

import type { Client } from '../types/client';

export type TipoPino = 'lead' | 'cliente' | 'ex' | 'alvo';
export type Temperatura = 'Q' | 'M' | 'F' | 'X' | '?';
export type Dono = 'meu' | 'colega' | 'sem';

// etapaCodigo: a etapa do negócio no snapshot do Cockpit (0105) — vale quando o
// texto de clients.etapa está vazio ou não casa na etapa_de_para.
export type TempoDoNegocio = {
  diasNaEtapa: number | null; slaEstourado: boolean; ultimaInteracao: string | null; etapaCodigo?: string | null;
  /** Faixa da nota 0–100 do Cockpit (lib/temperatura.js): 'quente' | 'morno' | 'frio' (0107). */
  faixa?: string | null;
  /** Nota parcial (sem toque registrado): o pino mostra a letra com ponto, "F·". */
  parcial?: boolean;
  /** origem_do_lead do HubSpot (picklist oficial). */
  origemHs?: string | null;
};

// Origem = picklist origem_do_lead do HubSpot (prompt final corrigido). Sem o
// negócio no snapshot, a origem derivada no app (0102) é traduzida para o
// nome da picklist; "hubspot"/"inbound_site" não existem lá e viram vazio.
export type OrigemPick = 'Rua' | 'GoogleMaps' | 'Casa dos Dados' | 'Indicação' | 'Instagram' | 'Ads' | 'Familia' | 'Eventos';
const PICKLIST = new Set<string>(['Rua', 'GoogleMaps', 'Casa dos Dados', 'Indicação', 'Instagram', 'Ads', 'Familia', 'Eventos']);
const DERIVADA_PARA_PICKLIST: Record<string, OrigemPick> = {
  cadastro_na_rua: 'Rua', google_maps_motor: 'GoogleMaps', casa_dos_dados: 'Casa dos Dados', indicacao: 'Indicação',
};

export type ContextoPino = {
  meuOwnerId: string | null;
  donosDoTime: Set<string>;
  tempoPorNegocio: Map<string, TempoDoNegocio>;
  /** texto normalizado da etapa -> código canônico (null = "é origem, não etapa"). */
  etapaDePara: Map<string, string | null>;
  limites: [number, number];
  agora: Date;
  /** Quando o robô do Cockpit escreveu o snapshot de onde sai o tempo parado. */
  atualizadoEm?: string | null;
};

export type Pino = {
  tipo: TipoPino;
  temp: Temperatura | null; // null em cliente/ex/alvo (o anel diz por si)
  cor: string;              // cor do anel e da letra
  glifo: string;            // letra, '↺', '?' ou '' (logo/alvo)
  logo: boolean;
  dono: Dono;
  aproximado: boolean;
  nome: string;
  etiqueta: { texto: string; fundo: string; tinta: string } | null;
  opacidade: number;
  /** Origem na picklist do HubSpot; null = "origem não informada". */
  origem: OrigemPick | null;
  /** Nota do Google da conta-alvo (selo ★ do Disco Takeat). */
  nota?: number | null;
};

// Cores do Disco Takeat (prompt final §6 — a legenda de hoje). Dado, não
// tema: pintam o disco igual nos dois temas e no modo sol.
export const COR = {
  Q: '#E23B3B', M: '#F5A524', F: '#0EA5E9', X: '#4B5563', '?': '#6B7280',
  cliente: '#16A34A', ex: '#EC4899', alvo: '#8B5CF6', semDono: '#FACC15',
} as const;

// Etapas canônicas do Cockpit por temperatura.
const FRIO = new Set(['1395880469', '1396005401', '1396007427', '1398311191', '1413529973']);
const MORNO = new Set(['1395880470', '1395880471']);
const QUENTE = new Set(['1395880472', '1395880473']);
const GANHO = new Set(['1396006162', '1396006163']);
const PERDIDO = '1396006164';

// Mesma normalização de public.texto_normalizado (0102).
export function textoNormalizado(t: string | null | undefined): string | null {
  const s = (t ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  return s || null;
}

const DIA_MS = 86400000;

// Dia em Brasília (UTC-3, sem horário de verão desde 2019).
function diaBRT(d: Date): number {
  return Math.floor((d.getTime() - 3 * 3600000) / DIA_MS);
}

function diasDesde(iso: string | null | undefined, agora: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return Math.max(0, diaBRT(agora) - diaBRT(t));
}

export function etiquetaDeTempo(dias: number, limites: [number, number]): { texto: string; fundo: string; tinta: string } {
  if (dias === 0) return { texto: 'hoje', fundo: '#14532D', tinta: '#BBF7D0' };
  if (dias <= limites[0]) return { texto: `${dias}d`, fundo: '#2A2F38', tinta: '#E5E7EB' };
  if (dias <= limites[1]) return { texto: `${dias}d parado`, fundo: '#4A2A05', tinta: '#FCD34D' };
  return { texto: `${dias}d parado`, fundo: '#4B1C1C', tinta: '#FCA5A5' };
}

export function nomeCurto(nome: string): string {
  const n = nome.trim();
  return n.length > 16 ? `${n.slice(0, 15)}…` : n;
}

export function classificarPino(c: Client, ctx: ContextoPino): Pino {
  const codigo = (() => {
    const chave = textoNormalizado(c.etapa);
    const doTexto = chave && ctx.etapaDePara.has(chave) ? ctx.etapaDePara.get(chave) ?? null : undefined;
    if (doTexto) return doTexto;
    const doSnapshot = c.id_hubspot ? ctx.tempoPorNegocio.get(String(c.id_hubspot))?.etapaCodigo : null;
    return doSnapshot ?? doTexto;
  })();

  let tipo: TipoPino;
  if (c.status === 'cliente' || (codigo && GANHO.has(codigo))) tipo = 'cliente';
  else if (c.status === 'churn') tipo = 'ex';
  else if (c.conta_alvo_place_id && !c.id_hubspot) tipo = 'alvo';
  else tipo = 'lead';

  const tempoHs = c.id_hubspot ? ctx.tempoPorNegocio.get(String(c.id_hubspot)) : undefined;
  let temp: Temperatura | null = null;
  let parcial = false;
  if (tipo === 'lead') {
    // Temperatura = faixa da nota do Cockpit (Q ≥ 70 · M ≥ 55 · F). Perdido
    // continua X. Sem o negócio no snapshot, cai na etapa (regra anterior).
    const faixa = tempoHs?.faixa ?? null;
    if (codigo === PERDIDO) temp = 'X';
    else if (faixa === 'quente') temp = 'Q';
    else if (faixa === 'morno') temp = 'M';
    else if (faixa === 'frio') temp = 'F';
    if (temp && temp !== 'X' && faixa) parcial = !!tempoHs?.parcial;
  }
  if (tipo === 'lead' && !temp) {
    if (codigo && QUENTE.has(codigo)) temp = 'Q';
    else if (codigo && MORNO.has(codigo)) temp = 'M';
    else if (codigo && FRIO.has(codigo)) temp = 'F';
    else if (codigo === PERDIDO) temp = 'X';
    // Cadastro na rua que ainda não virou negócio no HubSpot: a prancha diz
    // que nasce em "Primeiro contato" (frio). Eram ~32 dos 37 "?" restantes
    // (25/09) — leads de rua sem negócio, a maioria de quem saiu do time.
    else if (codigo == null && !c.id_hubspot && c.origem_lead === 'cadastro_na_rua') temp = 'F';
    else temp = '?'; // sem etapa, texto que a tabela não conhece, ou "é origem"
  }

  const cor = tipo === 'cliente' ? COR.cliente : tipo === 'ex' ? COR.ex : tipo === 'alvo' ? COR.alvo : COR[temp ?? '?'];
  const glifo = tipo === 'ex' ? '↺' : tipo === 'lead' ? `${temp}${parcial ? '·' : ''}` : '';

  const owner = c.vendedor_id_hubspot ? String(c.vendedor_id_hubspot) : null;
  // Cliente é carteira da empresa: 3.066 dos 3.070 não têm vendedor no
  // cadastro (25/09). Pintá-los de "sem dono" (tracejado amarelo) fazia quase
  // todo pino parecer abandonado — C4 do prompt final. Cliente sem dono do
  // time leva anel sólido fino; ex-cliente sem dono segue tracejado (é o
  // sinal de "disponível para reconquista").
  const donoBruto: Dono = owner && ctx.meuOwnerId && owner === String(ctx.meuOwnerId)
    ? 'meu'
    : owner && ctx.donosDoTime.has(owner) ? 'colega' : 'sem';
  const dono: Dono = tipo === 'cliente' && donoBruto === 'sem' ? 'colega' : donoBruto;

  // Tempo sem toque: a última interação do Cockpit ou a última visita, o que
  // for mais recente. Cliente, conta-alvo e negócio perdido não têm relógio de funil.
  let etiqueta: Pino['etiqueta'] = null;
  let dias: number | null = null;
  if (tipo === 'lead' && temp !== 'X') {
    const t = tempoHs;
    const candidatos = [diasDesde(t?.ultimaInteracao, ctx.agora), diasDesde(c.visited_at, ctx.agora)]
      .filter((d): d is number => d != null);
    dias = candidatos.length ? Math.min(...candidatos) : (t?.diasNaEtapa ?? null);
    if (t?.slaEstourado) etiqueta = { texto: 'cobrar', fundo: '#7F1D1D', tinta: '#FECACA' };
    else if (dias != null) etiqueta = etiquetaDeTempo(dias, ctx.limites);
  }

  const opacidade = dias != null && dias > ctx.limites[1] ? 0.72 : dono === 'colega' ? 0.8 : 1;

  const origemHs = tempoHs?.origemHs && PICKLIST.has(tempoHs.origemHs) ? (tempoHs.origemHs as OrigemPick) : null;
  const origem: OrigemPick | null = origemHs ?? (c.origem_lead ? DERIVADA_PARA_PICKLIST[c.origem_lead] ?? null : null);

  return {
    origem,
    tipo, temp, cor, glifo, logo: tipo === 'cliente', dono,
    nota: tipo === 'alvo' && c.conta_alvo_rating != null ? Number(c.conta_alvo_rating) : null,
    aproximado: c.geo_approximate === true,
    nome: nomeCurto(c.empresa?.trim() || c.nome || ''),
    etiqueta, opacidade,
  };
}
