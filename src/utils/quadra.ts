// Resumo de quadra (prompt final, Parte A §5 "Densidade e zoom").
//
// Pinos amontoados viravam um pino com um número. O prompt proíbe isso
// ("nunca só um número num círculo"): o amontoado grande vira um resumo com
// o nome da área, a composição e o MELHOR CANDIDATO, e o toque abre a lista.
import type { Pino } from './pinoP2';

type Item = {
  c: { id: string; empresa?: string | null; nome: string; bairro?: string | null; cidade?: string | null; conta_alvo_rating?: number | null; conta_alvo_reviews?: number | null; motor_status?: string | null };
  p: Pino;
  plano: number | null;
  distanciaM: number | null;
};

/** A partir de quantos pinos amontoados a pilha vira resumo de quadra. */
export const MINIMO_QUADRA = 6;

/* o recém-aberto é tipo 'alvo' no banco, mas na quadra conta como recém-aberto (15/10/26) */
type Grupo = Pino['tipo'] | 'rec';
const ROTULO: Record<Grupo, [string, string]> = {
  rec: ['recém-aberto', 'recém-abertos'],
  alvo: ['conta-alvo', 'contas-alvo'],
  ex: ['ex', 'ex'],
  lead: ['lead', 'leads'],
  cliente: ['cliente', 'clientes'],
};

const distTexto = (m: number | null) =>
  m == null ? null : m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`;

/** Prompt: plano de hoje › cobrança › minha carteira quente › conta-alvo ≥ 4,5★ e ≥ 100 avaliações › o resto (mais perto). */
function pesoMelhor(it: Item): number {
  // O motor (0110) viu que fechou: nunca é o "melhor" — seria mandar alguém a porta fechada.
  if (it.c.motor_status === 'sumiu_google' || it.c.motor_status === 'fechado_temporario' || it.c.motor_status === 'cnpj_baixado') return 9;
  if (it.plano != null) return 0;
  if (it.p.etiqueta?.texto === 'cobrar') return 1;
  if (it.p.dono === 'meu' && it.p.temp === 'Q') return 2;
  // recém-aberto ainda escolhendo sistema: a melhor porta depois do quente
  if (it.p.familia === 'rec') return 3;
  if (it.p.tipo === 'alvo' && (it.c.conta_alvo_rating ?? 0) >= 4.5 && (it.c.conta_alvo_reviews ?? 0) >= 100) return 3;
  return 4;
}

export type ResumoQuadra = {
  area: string;
  composicao: string;
  melhor: { id: string; texto: string } | null;
  /** true quando a pilha não é um quarteirão, e sim um centróide. Ver `ehCentroide`. */
  semLugar: boolean;
};

/* QUARTEIRÃO DE VERDADE TEM UM BAIRRO (Julyan, 28/10/26: "revise esse bug no mapa").
   Ele mandou um print com "Quadra · JACAREPAGUA · 27 pinos" desenhada em cima do Estácio, e
   todos os leads da lista a "2,3 km" — a mesma distância, porque é o mesmo ponto. Medido na
   base no mesmo dia: 777 leads empilhados em 69 coordenadas que são CENTRÓIDE DE CIDADE
   (75 no centro de SP, 61 em Brasília, 50 no Rio, 25 no centro do Brasil). O geocodificador
   responde "centro da cidade" quando não entende o endereço, em vez de dizer que não sabe.

   O que denuncia não é a quantidade — cinco restaurantes dividem a coordenada de um shopping
   de verdade —, é a DISPERSÃO: um ponto só servindo três bairros não é um quarteirão. É a
   mesma regra que a migration 0226 usou para marcar essas linhas como aproximadas, de
   propósito: duas regras diferentes para o mesmo fato divergem na primeira mudança.

   Chamar isso de quadra custa caro de três jeitos: promete um "melhor candidato a 2,3 km" que
   é a distância até o centro da cidade; esconde 27 lugares atrás de um número que parece
   endereço; e manda o executivo andar até uma porta que não existe. */
export const BAIRROS_PARA_NAO_SER_QUADRA = 3;
export function ehCentroide(bairrosDistintos: number): boolean {
  return bairrosDistintos >= BAIRROS_PARA_NAO_SER_QUADRA;
}

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
  const semLugar = ehCentroide(contagem.size);
  /* O NOME DA ÁREA SÓ VALE SE A ÁREA FOR UMA. Com três bairros no mesmo ponto, escrever o
     bairro mais frequente é dizer "Jacarepaguá" sobre um amontoado no Estácio. */
  const area = semLugar
    ? (cidade ? `Sem endereço exato · ${cidade}` : 'Sem endereço exato')
    : (topo?.grafia ?? cidade ?? 'Esta quadra');

  const porTipo = new Map<Grupo, number>();
  for (const it of itens) { const g: Grupo = it.p.familia === 'rec' ? 'rec' : it.p.tipo; porTipo.set(g, (porTipo.get(g) ?? 0) + 1); }
  const porTipos = [...porTipo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, n]) => `${n} ${ROTULO[t][n === 1 ? 0 : 1]}`)
    .join(' · ');
  /* O NÚMERO DE BAIRROS É A PROVA na tela: "16 bairros" explica, sozinho, por que não há
     uma porta para onde andar — e é o que faz o executivo abrir a lista em vez de ir. */
  const composicao = semLugar
    ? `${porTipos} · ${contagem.size} bairros`
    : porTipos;

  const d = (x: Item) => x.distanciaM ?? Number.POSITIVE_INFINITY;
  const melhorItem = [...itens].sort((a, b) => pesoMelhor(a) - pesoMelhor(b) || d(a) - d(b))[0];
  let melhor: ResumoQuadra['melhor'] = null;
  /* SEM MELHOR CANDIDATO. "melhor: Gellato Churros · 2,3 km" é a distância até o centro da
     cidade, e mandaria alguém andar 2,3 km até um ponto onde não há restaurante nenhum. */
  if (melhorItem && !semLugar) {
    const nome = melhorItem.c.empresa?.trim() || melhorItem.c.nome;
    const nota = melhorItem.p.tipo === 'alvo' && melhorItem.p.familia !== 'rec' && melhorItem.c.conta_alvo_rating != null
      ? `nota ${Number(melhorItem.c.conta_alvo_rating).toFixed(1).replace('.', ',')}` : null;
    const plano = melhorItem.plano != null ? `parada ${melhorItem.plano}` : null;
    const partes = [plano ?? nota ?? nome, distTexto(melhorItem.distanciaM)].filter(Boolean);
    melhor = { id: melhorItem.c.id, texto: `melhor: ${partes.join(' · ')}` };
  }
  return { area, composicao, melhor, semLugar };
}

/**
 * O cartão tem ~160 × 64 px e a pilha junta pinos a 24 px: quadras vizinhas
 * sobrepunham os cartões. Aqui as quadras cujos cartões se tocariam na tela
 * viram uma só; a maior fica com o lugar. `absorvida` diz qual pilha foi
 * engolida por qual (quem desenha esconde o líder dela também).
 */
export function quadrasNaTela(
  pilhas: Array<{ lider: string; membros: string[]; x: number; y: number }>,
  larguraPx = 180,
  alturaPx = 88, // 3 linhas + ponta + folga: 72 deixava dois cartões encostando (26/09)
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
