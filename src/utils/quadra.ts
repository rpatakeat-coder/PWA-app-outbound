// Resumo de quadra (prompt final, Parte A §5 "Densidade e zoom").
//
// Pinos amontoados viravam um pino com um número. O prompt proíbe isso
// ("nunca só um número num círculo"): o amontoado grande vira um resumo com
// o nome da área, a composição e o MELHOR CANDIDATO, e o toque abre a lista.
import type { Pino } from './pinoP2';

type Item = {
  c: { id: string; empresa?: string | null; nome: string; bairro?: string | null; cidade?: string | null; conta_alvo_rating?: number | null; conta_alvo_reviews?: number | null };
  p: Pino;
  plano: number | null;
  distanciaM: number | null;
};

/** A partir de quantos pinos amontoados a pilha vira resumo de quadra. */
export const MINIMO_QUADRA = 6;

const ROTULO: Record<Pino['tipo'], [string, string]> = {
  alvo: ['conta-alvo', 'contas-alvo'],
  ex: ['ex', 'ex'],
  lead: ['lead', 'leads'],
  cliente: ['cliente', 'clientes'],
};

const distTexto = (m: number | null) =>
  m == null ? null : m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`;

/** Prompt: plano de hoje › cobrança › minha carteira quente › conta-alvo ≥ 4,5★ e ≥ 100 avaliações › o resto (mais perto). */
function pesoMelhor(it: Item): number {
  if (it.plano != null) return 0;
  if (it.p.etiqueta?.texto === 'cobrar') return 1;
  if (it.p.dono === 'meu' && it.p.temp === 'Q') return 2;
  if (it.p.tipo === 'alvo' && (it.c.conta_alvo_rating ?? 0) >= 4.5 && (it.c.conta_alvo_reviews ?? 0) >= 100) return 3;
  return 4;
}

export type ResumoQuadra = {
  area: string;
  composicao: string;
  melhor: { id: string; texto: string } | null;
};

export function resumoDaQuadra(itens: Item[]): ResumoQuadra {
  // Área: o bairro que mais aparece (grafia do primeiro que o trouxe).
  const contagem = new Map<string, { n: number; grafia: string }>();
  for (const it of itens) {
    const b = (it.c.bairro ?? '').trim();
    if (!b) continue;
    const k = b.toLowerCase();
    const atual = contagem.get(k);
    contagem.set(k, { n: (atual?.n ?? 0) + 1, grafia: atual?.grafia ?? b });
  }
  const topo = [...contagem.values()].sort((a, b) => b.n - a.n)[0];
  const cidade = itens.map((it) => (it.c.cidade ?? '').trim()).find(Boolean);
  const area = topo?.grafia ?? cidade ?? 'Esta quadra';

  const porTipo = new Map<Pino['tipo'], number>();
  for (const it of itens) porTipo.set(it.p.tipo, (porTipo.get(it.p.tipo) ?? 0) + 1);
  const composicao = [...porTipo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, n]) => `${n} ${ROTULO[t][n === 1 ? 0 : 1]}`)
    .join(' · ');

  const d = (x: Item) => x.distanciaM ?? Number.POSITIVE_INFINITY;
  const melhorItem = [...itens].sort((a, b) => pesoMelhor(a) - pesoMelhor(b) || d(a) - d(b))[0];
  let melhor: ResumoQuadra['melhor'] = null;
  if (melhorItem) {
    const nome = melhorItem.c.empresa?.trim() || melhorItem.c.nome;
    const nota = melhorItem.p.tipo === 'alvo' && melhorItem.c.conta_alvo_rating != null
      ? `nota ${Number(melhorItem.c.conta_alvo_rating).toFixed(1).replace('.', ',')}` : null;
    const plano = melhorItem.plano != null ? `parada ${melhorItem.plano}` : null;
    const partes = [plano ?? nota ?? nome, distTexto(melhorItem.distanciaM)].filter(Boolean);
    melhor = { id: melhorItem.c.id, texto: `melhor: ${partes.join(' · ')}` };
  }
  return { area, composicao, melhor };
}

/**
 * O cartão tem ~160 × 64 px e a pilha junta pinos a 24 px: quadras vizinhas
 * sobrepunham os cartões. Aqui as quadras cujos cartões se tocariam na tela
 * viram uma só; a maior fica com o lugar. `absorvida` diz qual pilha foi
 * engolida por qual (quem desenha esconde o líder dela também).
 */
export function quadrasNaTela(
  pilhas: Array<{ lider: string; membros: string[]; x: number; y: number }>,
  larguraPx = 170,
  alturaPx = 72,
): { quadras: Map<string, string[]>; absorvida: Map<string, string> } {
  const caixa = (p: { x: number; y: number }) => ({ x0: p.x - larguraPx / 2, x1: p.x + larguraPx / 2, y0: p.y - alturaPx, y1: p.y });
  const bate = (a: ReturnType<typeof caixa>, b: ReturnType<typeof caixa>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const grandes = pilhas.filter((p) => p.membros.length >= MINIMO_QUADRA)
    .sort((a, b) => b.membros.length - a.membros.length || a.lider.localeCompare(b.lider));
  const aceitas: Array<{ lider: string; caixa: ReturnType<typeof caixa> }> = [];
  const quadras = new Map<string, string[]>();
  const absorvida = new Map<string, string>();
  for (const p of grandes) {
    const c = caixa(p);
    const dona = aceitas.find((a) => bate(a.caixa, c));
    if (dona) {
      quadras.get(dona.lider)!.push(...p.membros);
      absorvida.set(p.lider, dona.lider);
    } else {
      aceitas.push({ lider: p.lider, caixa: c });
      quadras.set(p.lider, [...p.membros]);
    }
  }
  return { quadras, absorvida };
}
