// Regras puras do card e da folha do mapa novo (entrega 4), sem React: são
// testadas em cardNovo.teste.ts.
import type { Client } from '../types/client';
import type { Pino } from './pinoP2';

export type ItemFolha = { c: Client; p: Pino; plano: number | null; distanciaM: number | null; feito: boolean };

export function distanciaTexto(m: number | null): string | null {
  if (m == null) return null;
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`;
}

type Fato = { texto: string; aviso?: boolean };

export function fatosDoCard(d: { client: Client; pino: Pino; distanciaM: number | null }): Fato[] {
  const { client: c, pino } = d;
  const f: Fato[] = [];
  const dist = distanciaTexto(d.distanciaM);
  if (dist) f.push({ texto: dist });
  if (pino.etiqueta) f.push({ texto: pino.etiqueta.texto, aviso: pino.etiqueta.texto === 'cobrar' || pino.etiqueta.texto.includes('parado') });
  f.push(c.geo_approximate ? { texto: '≈ posição aproximada', aviso: true } : { texto: 'posição exata' });
  f.push(c.telefone?.trim() ? { texto: `☎ ${c.telefone.trim()}` } : { texto: 'sem telefone', aviso: true });
  if (c.conta_alvo_rating != null) {
    const nota = Number(c.conta_alvo_rating).toFixed(1).replace('.', ',');
    f.push({ texto: c.conta_alvo_reviews != null ? `${nota}★ · ${c.conta_alvo_reviews} no Google` : `${nota}★ no Google` });
  }
  if (pino.tipo === 'ex') f.push({ texto: 'data de saída desconhecida' });
  return f;
}

function peso(it: ItemFolha): number {
  if (it.plano && it.feito) return 5; // parada já feita vai para o fim, mesmo perto
  if (it.plano && !it.feito) return 0;
  if (it.p.etiqueta?.texto === 'cobrar') return 1;
  if (it.p.temp === 'Q') return 2;
  if (it.p.temp === 'M') return 3;
  return 4;
}

export function ordenarItens(itens: ItemFolha[], modo: 'prioridade' | 'distancia'): ItemFolha[] {
  const d = (x: ItemFolha) => x.distanciaM ?? Number.POSITIVE_INFINITY;
  return [...itens].sort((a, b) =>
    modo === 'distancia'
      ? d(a) - d(b)
      : peso(a) - peso(b) || (a.plano && b.plano ? a.plano - b.plano : 0) || d(a) - d(b));
}

