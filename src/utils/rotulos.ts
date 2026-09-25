// Quais pinos ganham nome na tela (mapa novo, entrega 3).
//
// Critério de aceite da prancha: "nenhum rótulo se sobrepõe". Com 200 pinos
// no Centro, desenhar todos os nomes vira uma massa ilegível (foi o que se
// viu em Porto Alegre em 25/09/2026). Aqui cada nome é uma caixa na tela, à
// direita do pino; na ordem de prioridade (empate: mais perto do centro da
// tela), só entra a caixa que não bate em outra caixa já aceita.
//
// O nome PODE passar por cima do corpo de um pino vizinho: exigir o contrário
// recusava quase todos no Centro (132 contas-alvo, 0 nomes visíveis, medido
// em 25/09). Quem tem nome sobe de camada e a sombra do texto garante a leitura.

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

// Geometria do PinoP2: o nome começa 18 px à direita da ponta e ocupa
// ~120 × 28 px (nome + etiqueta de tempo).
const NOME = { dx0: 18, dx1: 140, dy0: -40, dy1: -10 };

export function projetar(lat: number, lng: number, j: Janela): { x: number; y: number } {
  const x = ((lng - (j.longitude - j.longitudeDelta / 2)) / j.longitudeDelta) * j.larguraPx;
  const y = (((j.latitude + j.latitudeDelta / 2) - lat) / j.latitudeDelta) * j.alturaPx;
  return { x, y };
}

/** Ids que podem mostrar o nome sem sobrepor outro nome. */
export function rotulosSemSobrepor(cands: Candidato[], j: Janela): Set<string> {
  const cx = j.larguraPx / 2;
  const cy = j.alturaPx / 2;
  const pos = cands
    .map((c) => ({ c, ...projetar(c.lat, c.lng, j) }))
    // fora da tela não gasta nome: senão o nome aceito fica onde ninguém vê
    .filter((p) => p.x >= -20 && p.y >= 0 && p.x <= j.larguraPx && p.y <= j.alturaPx + 40);
  const dist = (p: { x: number; y: number }) => (p.x - cx) ** 2 + (p.y - cy) ** 2;
  pos.sort((a, b) => a.c.prioridade - b.c.prioridade || dist(a) - dist(b));
  const aceitos: Caixa[] = [];
  const saida = new Set<string>();
  for (const p of pos) {
    const caixa: Caixa = { x0: p.x + NOME.dx0, x1: p.x + NOME.dx1, y0: p.y + NOME.dy0, y1: p.y + NOME.dy1 };
    if (aceitos.some((a) => bate(a, caixa))) continue;
    aceitos.push(caixa);
    saida.add(p.c.id);
  }
  return saida;
}
