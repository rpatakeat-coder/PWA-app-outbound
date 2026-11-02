// A CONFERÊNCIA NA TELA DO MAPA NA RUA (prancha "Mapa na rua", 02/11/26).
//
// A faixa segura do texto não é uma conta de constantes: é o que está desenhado em volta do mapa
// AGORA — a fileira de busca, a faixa da vez quando existe ("Feriado · sem expediente", a pílula do
// placar, a hora das ligações), a fileira de lentes, a folha, os botões. Cada um desses elementos
// se marca com um `data-*` (as constantes abaixo) e aqui eles são medidos de verdade, na régua do
// mapa. Isso já inclui a área segura do iPhone, a barra de gestos do Android e a fonte do sistema
// a 130% — o que mudar a altura de uma barra muda a faixa sozinho.
//
// Os pinos também são medidos depois que o Google desenha (o marcador sai ~18 px fora da projeção
// linear, medido em 02/11/26 nas placas de bairro): `data-pino`, `data-cabeca` e `data-ponta` vêm
// do PinoP2. Com a geometria real, niveisDoMapa roda de novo e o que ela decidir é o que fica.
import type { Caixa } from '../utils/niveisDoMapa';

// dataSet é do react-native-web (vira data-*); o tipo do React Native não o declara
export const FAIXA_TOPO = { dataSet: { faixaTopo: '1' } } as object;
export const FAIXA_BAIXO = { dataSet: { faixaBaixo: '1' } } as object;
export const OBSTACULO_MAPA = { dataSet: { obstaculoMapa: '1' } } as object;

/** Respiro entre a faixa segura e o que a limita (a prancha: + 8 / − 8, e 8 das bordas). */
export const RESPIRO_FAIXA = 8;

const visivel = (r: DOMRect) => r.width > 0 && r.height > 0;

/** O mapa principal na tela (o `.gm-style` visível de maior área). */
export function mapaNaTela(): DOMRect | null {
  if (typeof document === 'undefined') return null;
  let melhor: DOMRect | null = null;
  document.querySelectorAll('.gm-style').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (visivel(r) && (!melhor || r.width * r.height > melhor.width * melhor.height)) melhor = r;
  });
  return melhor;
}

const relativa = (r: DOMRect, m: DOMRect): Caixa => ({ x0: r.left - m.left, y0: r.top - m.top, x1: r.right - m.left, y1: r.bottom - m.top });

/**
 * A faixa segura medida, na régua do mapa. `reserva` vale quando nada foi achado (antes da
 * primeira pintura): o topo e o fundo calculados pelas alturas exportadas das barras.
 */
export function faixaSeguraNaTela(m: DOMRect, reserva: { topo: number; fundo: number; esquerda: number; direita: number }): Caixa {
  let topo = -Infinity;
  document.querySelectorAll('[data-faixa-topo]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (visivel(r) && r.bottom > m.top && r.top < m.bottom) topo = Math.max(topo, r.bottom - m.top);
  });
  let fundo = Infinity;
  document.querySelectorAll('[data-faixa-baixo]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (visivel(r) && r.top < m.bottom && r.bottom > m.top) fundo = Math.min(fundo, r.top - m.top);
  });
  return {
    x0: RESPIRO_FAIXA + reserva.esquerda,
    x1: m.width - RESPIRO_FAIXA - reserva.direita,
    y0: Math.max(RESPIRO_FAIXA, (Number.isFinite(topo) ? topo : reserva.topo) + RESPIRO_FAIXA),
    y1: Math.min(m.height - RESPIRO_FAIXA, (Number.isFinite(fundo) ? fundo : reserva.fundo) - RESPIRO_FAIXA),
  };
}

/** Os botões do mapa (localização, "+") e o que mais se marcou como obstáculo. */
export function obstaculosNaTela(m: DOMRect): Caixa[] {
  const out: Caixa[] = [];
  document.querySelectorAll('[data-obstaculo-mapa]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (visivel(r)) out.push(relativa(r, m));
  });
  return out;
}

/** O centro da bolinha azul, na régua do mapa (null = fora do mapa ou ainda não desenhada). */
export function bolinhaNaTela(m: DOMRect): { x: number; y: number } | null {
  const el = document.querySelector('[data-bolinha]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!visivel(r)) return null;
  const x = (r.left + r.right) / 2 - m.left;
  const y = (r.top + r.bottom) / 2 - m.top;
  return x < 0 || y < 0 || x > m.width || y > m.height ? null : { x, y };
}

/** Ponta e cabeça de um pino desenhado, na régua do mapa. */
export function pinoNaTela(m: DOMRect, id: string): { x: number; y: number; cabeca: Caixa; nivel: number } | null {
  const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
  const el = document.querySelector(`[data-pino="${sel}"]`);
  const ponta = el?.querySelector('[data-ponta]');
  const cab = el?.querySelector('[data-cabeca]');
  if (!el || !ponta || !cab) return null;
  const p = ponta.getBoundingClientRect();
  const c = cab.getBoundingClientRect();
  if (!visivel(c)) return null;
  return { x: p.left - m.left, y: p.top - m.top, cabeca: relativa(c, m), nivel: Number(el.getAttribute('data-nivel') || 3) };
}

/* A régua do texto: um elemento escondido com a mesma fonte do rótulo. O navegador aplica nele a
   mesma escala de fonte do sistema que aplica no rótulo de verdade — é por isso que a medida pega
   os 130% sem o app precisar saber deles. */
let regua: HTMLSpanElement | null = null;
export function medirTextoNaTela(texto: string, px: number, peso: 600 | 700): { w: number; h: number } {
  if (typeof document === 'undefined') return { w: texto.length * px * 0.6, h: px * 1.3 };
  if (!regua || !regua.isConnected) {
    regua = document.createElement('span');
    Object.assign(regua.style, {
      position: 'fixed', left: '-9999px', top: '0', visibility: 'hidden', whiteSpace: 'nowrap', lineHeight: '1.3',
      fontFamily: 'Poppins, system-ui, sans-serif', letterSpacing: 'normal', pointerEvents: 'none',
    });
    regua.setAttribute('aria-hidden', 'true');
    (document.getElementById('root') ?? document.body).appendChild(regua);
  }
  regua.style.fontSize = `${px}px`;
  regua.style.fontWeight = String(peso);
  regua.textContent = texto;
  const r = regua.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

/** A escala da fonte que o navegador está aplicando (1 = 100%): 13 px medidos contra 13 × 1,3. */
export function escalaDaFonte(): number {
  const m = medirTextoNaTela('Mg', 13, 700);
  return m.h > 0 ? Math.round((m.h / (13 * 1.3)) * 100) / 100 : 1;
}
