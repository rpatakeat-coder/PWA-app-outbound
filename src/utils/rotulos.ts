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
// Prompt final C1: à direita; se não couber, à esquerda. No máximo 8 por tela.
const NOME_ESQ = { dx0: -140, dx1: -18, dy0: -40, dy1: -10 };
export const MAX_NOMES = 8;
export type Lado = 'dir' | 'esq';

export function projetar(lat: number, lng: number, j: Janela): { x: number; y: number } {
  const x = ((lng - (j.longitude - j.longitudeDelta / 2)) / j.longitudeDelta) * j.larguraPx;
  const y = (((j.latitude + j.latitudeDelta / 2) - lat) / j.latitudeDelta) * j.alturaPx;
  return { x, y };
}

/** Ids que podem mostrar o nome sem sobrepor outro nome, e de que lado. */
export function rotulosSemSobrepor(cands: Candidato[], j: Janela): Map<string, Lado> {
  const cx = j.larguraPx / 2;
  const cy = j.alturaPx / 2;
  const pos = cands
    .map((c) => ({ c, ...projetar(c.lat, c.lng, j) }))
    // fora da tela não gasta nome: senão o nome aceito fica onde ninguém vê
    .filter((p) => p.x >= -20 && p.y >= 0 && p.x <= j.larguraPx && p.y <= j.alturaPx + 40);
  const dist = (p: { x: number; y: number }) => (p.x - cx) ** 2 + (p.y - cy) ** 2;
  pos.sort((a, b) => a.c.prioridade - b.c.prioridade || dist(a) - dist(b));
  const aceitos: Caixa[] = [];
  const saida = new Map<string, Lado>();
  for (const p of pos) {
    if (saida.size >= MAX_NOMES) break;
    for (const [lado, g] of [['dir', NOME], ['esq', NOME_ESQ]] as const) {
      const caixa: Caixa = { x0: p.x + g.dx0, x1: p.x + g.dx1, y0: p.y + g.dy0, y1: p.y + g.dy1 };
      // o nome tem de caber na tela (senão o lado não serve)
      if (caixa.x0 < 0 || caixa.x1 > j.larguraPx + 10) continue;
      if (aceitos.some((a) => bate(a, caixa))) continue;
      aceitos.push(caixa);
      saida.set(p.c.id, lado);
      break;
    }
  }
  return saida;
}

// ---- Pilhas (prompt final C11) --------------------------------------------
// Pinos cujos corpos se sobrepõem na tela (centros a menos de 24 px) viram UM
// pino com o número; o mais prioritário lidera (cor do anel e nome "Fulano
// +N"). Coordenada idêntica sempre empilha, em qualquer zoom — o leque abre ao
// tocar.

export type Pilha = { lider: string; membros: string[] };

export function pilhasNaTela(cands: Candidato[], j: Janela, raioPx = 24): Pilha[] {
  const pos = cands.map((c) => ({ c, ...projetar(c.lat, c.lng, j) }))
    .sort((a, b) => a.c.prioridade - b.c.prioridade || a.c.id.localeCompare(b.c.id));
  const usados = new Set<string>();
  const pilhas: Pilha[] = [];
  for (const p of pos) {
    if (usados.has(p.c.id)) continue;
    usados.add(p.c.id);
    const membros = [p.c.id];
    for (const q of pos) {
      if (usados.has(q.c.id)) continue;
      // coordenada idêntica dá 0 px: empilha em qualquer zoom sem regra à parte
      if (Math.hypot(q.x - p.x, q.y - p.y) < raioPx) {
        usados.add(q.c.id);
        membros.push(q.c.id);
      }
    }
    pilhas.push({ lider: p.c.id, membros });
  }
  return pilhas;
}

/** Posições do leque: arco acima do ponto, abrindo para os lados. */
export function posicoesDoLeque(n: number): { dx: number; dy: number }[] {
  if (n <= 1) return [{ dx: 0, dy: 0 }];
  const abertura = Math.min(Math.PI * 0.9, (n - 1) * 0.55); // até ~160°
  // 40–56 px no caso comum; com muitos, o raio cresce para manter ~34 px
  // entre vizinhos (o pino tem 32 px de largura), até 120 px.
  const raio = Math.min(120, Math.max(40, Math.min(56, 40 + (n - 2) * 4), ((n - 1) * 34) / abertura));
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 - abertura / 2 + (abertura * i) / (n - 1);
    return { dx: Math.round(Math.cos(a) * raio), dy: Math.round(Math.sin(a) * raio) };
  });
}
