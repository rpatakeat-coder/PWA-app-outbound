// Quais pinos ganham nome na tela (mapa novo, entrega 3).
//
// Critério de aceite da prancha: "nenhum rótulo se sobrepõe". Com 200 pinos
// no Centro, desenhar todos os nomes vira uma massa ilegível (foi o que se
// viu em Porto Alegre em 25/09/2026). Aqui cada nome é uma caixa na tela, à
// direita do pino; na ordem de prioridade, só entra a caixa que não bate em
// outra caixa já aceita nem no corpo de outro pino em foco.

export type Candidato = {
  id: string;
  lat: number;
  lng: number;
  /** Menor = mais importante (selecionado 0, plano 1, cobrar 2, quente 3...). */
  prioridade: number;
};

export type Janela = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
  larguraPx: number;
  alturaPx: number;
};

type Caixa = { x0: number; y0: number; x1: number; y1: number };
const bate = (a: Caixa, b: Caixa) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Geometria do PinoP2: corpo de 32 px acima da ponta; nome começa 18 px à
// direita e ocupa ~120 × 28 px (nome + etiqueta de tempo).
const CORPO = { dx0: -17, dx1: 17, dy0: -46, dy1: 2 };
const NOME = { dx0: 18, dx1: 140, dy0: -40, dy1: -10 };

export function projetar(lat: number, lng: number, j: Janela): { x: number; y: number } {
  const x = ((lng - (j.longitude - j.longitudeDelta / 2)) / j.longitudeDelta) * j.larguraPx;
  const y = (((j.latitude + j.latitudeDelta / 2) - lat) / j.latitudeDelta) * j.alturaPx;
  return { x, y };
}

/** Ids que podem mostrar o nome sem sobrepor. */
export function rotulosSemSobrepor(cands: Candidato[], j: Janela): Set<string> {
  const pos = cands.map((c) => ({ c, ...projetar(c.lat, c.lng, j) }));
  const corpos: Caixa[] = pos.map(({ x, y }) => ({ x0: x + CORPO.dx0, x1: x + CORPO.dx1, y0: y + CORPO.dy0, y1: y + CORPO.dy1 }));
  const aceitos: Caixa[] = [];
  const saida = new Set<string>();
  const ordem = pos.map((p, i) => ({ ...p, i })).sort((a, b) => a.c.prioridade - b.c.prioridade);
  for (const p of ordem) {
    const caixa: Caixa = { x0: p.x + NOME.dx0, x1: p.x + NOME.dx1, y0: p.y + NOME.dy0, y1: p.y + NOME.dy1 };
    if (aceitos.some((a) => bate(a, caixa))) continue;
    if (corpos.some((b, k) => k !== p.i && bate(b, caixa))) continue;
    aceitos.push(caixa);
    saida.add(p.c.id);
  }
  return saida;
}
