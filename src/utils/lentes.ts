// Lentes e filtros do mapa novo (entrega 3; prancha §5 e §8.9).
//
// "Hierarquia, não filtro": a lente não esconde ninguém — decide quem ganha
// pino inteiro (pede decisão agora) e quem vira ponto de 7 px. Quem tira do
// mapa são os Filtros, que o vendedor escolhe e vê contados.

import type { Client } from '../types/client';
import type { OrigemPick, Pino } from './pinoP2';

export type Lente = 'dia' | 'carteira' | 'alvo' | 'rec' | 'semdono' | 'calor';

export const LENTES: { id: Lente; rotulo: string }[] = [
  { id: 'dia', rotulo: 'Meu dia' },
  { id: 'carteira', rotulo: 'Carteira' },
  { id: 'alvo', rotulo: 'Contas-alvo' },
  { id: 'rec', rotulo: 'Reconquista' },
  { id: 'semdono', rotulo: 'Sem dono' },
  { id: 'calor', rotulo: 'Calor' },
];

/** Pino inteiro nesta lente? (o resto vira ponto). Calor não mostra pino. */
export function noFoco(lente: Lente, p: Pino, planoNumero: number | null | undefined): boolean {
  if (lente === 'calor') return false;
  if (planoNumero) return lente === 'dia' || lente === 'carteira' || p.dono === 'meu';
  switch (lente) {
    case 'dia':
      return p.dono === 'meu' && (p.etiqueta?.texto === 'cobrar' || p.temp === 'Q' || p.temp === 'M' || p.tipo === 'cliente');
    case 'carteira':
      return p.dono === 'meu';
    case 'alvo':
      return p.tipo === 'alvo';
    case 'rec':
      return p.tipo === 'ex';
    case 'semdono':
      return p.dono === 'sem';
  }
}

// ---- Filtros -------------------------------------------------------------

export type StatusFiltro = 'lead' | 'cliente' | 'ex' | 'alvo' | 'ganho_fs';
export type TempFiltro = 'Q' | 'M' | 'F' | 'fechado' | 'perdido' | 'alvo';
export type OrigemFiltro = OrigemPick | 'nao_informado';

export type FiltrosNovos = {
  status: Set<StatusFiltro>;
  temp: Set<TempFiltro>;
  origem: Set<OrigemFiltro>;
};

export const FILTROS_VAZIOS: FiltrosNovos = { status: new Set(), temp: new Set(), origem: new Set() };

export const ROTULO_STATUS: Record<StatusFiltro, string> = {
  lead: 'Lead', cliente: 'Cliente', ex: 'Ex-Cliente', alvo: 'Conta Alvo', ganho_fs: 'Ganho - Field Sales',
};
export const ROTULO_TEMP: Record<TempFiltro, string> = {
  Q: 'Quente', M: 'Morno', F: 'Frio', fechado: 'Fechado', perdido: 'Perdido', alvo: 'Conta Alvo',
};

// Picklist origem_do_lead do HubSpot, com as cores do prompt final (fundo / texto).
export const ORIGEM: Record<OrigemFiltro, { rotulo: string; fundo: string; tinta: string }> = {
  Rua: { rotulo: 'Rua', fundo: '#3F1D1D', tinta: '#FECACA' },
  'Casa dos Dados': { rotulo: 'Casa dos Dados', fundo: '#1E3A5F', tinta: '#BFDBFE' },
  GoogleMaps: { rotulo: 'Google Maps · motor', fundo: '#3B2A0B', tinta: '#FDE68A' },
  'Indicação': { rotulo: 'Indicação', fundo: '#14532D', tinta: '#BBF7D0' },
  Instagram: { rotulo: 'Instagram', fundo: '#3B1D3A', tinta: '#F5D0FE' },
  Ads: { rotulo: 'Ads', fundo: '#312E81', tinta: '#C7D2FE' },
  Familia: { rotulo: 'Família', fundo: '#1F3A34', tinta: '#A7F3D0' },
  Eventos: { rotulo: 'Eventos', fundo: '#3A2410', tinta: '#FDBA74' },
  nao_informado: { rotulo: 'Origem não informada', fundo: '#2A2F38', tinta: '#C9CED6' },
};

export function statusDoFiltro(c: Client, p: Pino): StatusFiltro {
  if (c.status === 'ganho_fs') return 'ganho_fs';
  if (p.tipo === 'alvo') return 'alvo';
  if (p.tipo === 'ex') return 'ex';
  if (c.status === 'cliente') return 'cliente';
  return 'lead';
}

export function tempDoFiltro(p: Pino): TempFiltro | null {
  if (p.tipo === 'alvo') return 'alvo';
  if (p.tipo === 'cliente') return 'fechado';
  if (p.temp === 'X') return 'perdido';
  if (p.temp === 'Q' || p.temp === 'M' || p.temp === 'F') return p.temp;
  return null; // ex-cliente e etapa desconhecida não têm temperatura
}

export function origemDoFiltro(p: Pino): OrigemFiltro {
  return p.origem ?? 'nao_informado';
}

/** Cada grupo marcado é um OU dentro dele; grupos diferentes se somam (E). */
export function passaNosFiltros(c: Client, p: Pino, f: FiltrosNovos): boolean {
  if (f.status.size && !f.status.has(statusDoFiltro(c, p))) return false;
  if (f.temp.size) {
    const t = tempDoFiltro(p);
    if (!t || !f.temp.has(t)) return false;
  }
  if (f.origem.size && !f.origem.has(origemDoFiltro(p))) return false;
  return true;
}

export function quantosFiltros(f: FiltrosNovos): number {
  return f.status.size + f.temp.size + f.origem.size;
}

/**
 * Contagem de cada chip: quantos passariam se o chip fosse o único do seu
 * grupo, respeitando os OUTROS grupos (é o número que o chip entrega ao tocar).
 */
export function contarChips(itens: { c: Client; p: Pino }[], f: FiltrosNovos) {
  const semStatus = { ...f, status: new Set<StatusFiltro>() };
  const semTemp = { ...f, temp: new Set<TempFiltro>() };
  const semOrigem = { ...f, origem: new Set<OrigemFiltro>() };
  const status = new Map<StatusFiltro, number>();
  const temp = new Map<TempFiltro, number>();
  const origem = new Map<OrigemFiltro, number>();
  for (const { c, p } of itens) {
    if (passaNosFiltros(c, p, semStatus)) { const k = statusDoFiltro(c, p); status.set(k, (status.get(k) ?? 0) + 1); }
    if (passaNosFiltros(c, p, semTemp)) { const k = tempDoFiltro(p); if (k) temp.set(k, (temp.get(k) ?? 0) + 1); }
    if (passaNosFiltros(c, p, semOrigem)) { const k = origemDoFiltro(p); origem.set(k, (origem.get(k) ?? 0) + 1); }
  }
  return { status, temp, origem };
}

/** Como o lead aparece fora da lente: ponto de 7 px na cor e forma da categoria. */
export function pontoDe(p: Pino): { cor: string; forma: 'bola' | 'quadrado' | 'anel' | 'tracejado'; opacidade: number } {
  if (p.tipo === 'alvo') return { cor: '#C084FC', forma: 'anel', opacidade: 0.6 };
  if (p.dono === 'sem') return { cor: '#FACC15', forma: 'tracejado', opacidade: 0.55 };
  if (p.tipo === 'ex') return { cor: p.cor, forma: 'quadrado', opacidade: 0.55 };
  return { cor: p.cor, forma: 'bola', opacidade: 0.55 };
}
