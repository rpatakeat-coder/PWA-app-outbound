// Teste dos rótulos sem sobreposição.
//
// Rode com:  npx tsx src/utils/rotulos.teste.ts
import { projetar, rotulosSemSobrepor, type Janela } from './rotulos';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

// Janela de 390 × 600 px sobre ~0,005° (zoom de rua no Centro).
const j: Janela = { latitude: -20.32, longitude: -40.34, latitudeDelta: 0.006, longitudeDelta: 0.004, larguraPx: 390, alturaPx: 600 };
const pxLng = j.longitudeDelta / j.larguraPx;
const pxLat = j.latitudeDelta / j.alturaPx;
const em = (x: number, y: number) => ({ lat: j.latitude + j.latitudeDelta / 2 - y * pxLat, lng: j.longitude - j.longitudeDelta / 2 + x * pxLng });

const p = projetar(em(100, 200).lat, em(100, 200).lng, j);
ok(Math.abs(p.x - 100) < 0.01 && Math.abs(p.y - 200) < 0.01, 'projeção ida e volta');

// dois pinos colados: só o mais importante ganha nome
const colados = rotulosSemSobrepor([
  { id: 'frio', ...em(200, 200), prioridade: 5 },
  { id: 'plano', ...em(210, 205), prioridade: 1 },
], j);
ok(colados.get('plano') === 'dir' && colados.get('frio') === 'esq', 'colados: o plano fica à direita, o outro vai para a esquerda');

// um em cima do outro (15 px): os nomes batem
const empilhados = rotulosSemSobrepor([{ id: 'cima', ...em(200, 200), prioridade: 2 }, { id: 'baixo', ...em(200, 215), prioridade: 4 }], j);
ok(empilhados.get('cima') === 'dir' && empilhados.get('baixo') === 'esq', 'nomes empilhados: o segundo vai para a esquerda');
const tres = rotulosSemSobrepor([{ id: 'a', ...em(200, 200), prioridade: 1 }, { id: 'b', ...em(200, 212), prioridade: 2 }, { id: 'c', ...em(200, 224), prioridade: 3 }], j);
// perto da borda esquerda o nome não pode ir para a esquerda (sairia da tela)
const borda = rotulosSemSobrepor([{ id: 'x', ...em(60, 200), prioridade: 1 }, { id: 'y', ...em(60, 212), prioridade: 2 }], j);
ok(borda.get('x') === 'dir' && !borda.has('y'), 'na borda: o segundo fica sem nome em vez de sair da tela');
ok(tres.size === 2 && !tres.has('c'), 'três empilhados: direita, esquerda, e o terceiro sem nome');

// longe: os dois ganham
const longe = rotulosSemSobrepor([{ id: 'a', ...em(50, 100), prioridade: 3 }, { id: 'b', ...em(50, 300), prioridade: 3 }], j);
ok(longe.size === 2, 'longe: os dois nomes');

// empate de prioridade: ganha o mais perto do centro da tela
const empate = rotulosSemSobrepor([{ id: 'borda', ...em(20, 305), prioridade: 6 }, { id: 'meio', ...em(40, 300), prioridade: 6 }], j);
ok(empate.has('meio') && !empate.has('borda'), 'empate: o mais perto do centro fica com o nome');

// pino fora da tela não gasta nome (no Centro sobravam nomes aceitos fora da vista)
const fora = rotulosSemSobrepor([{ id: 'fora', ...em(200, 700), prioridade: 1 }, { id: 'dentro', ...em(200, 300), prioridade: 5 }], j);
ok(!fora.has('fora') && fora.has('dentro'), 'fora da tela não ganha nome');

// Centro denso (132 pinos colados, como em Porto Alegre): tem de sobrar nome legível
const denso = Array.from({ length: 132 }, (_, i) => ({ id: `d${i}`, ...em(60 + (i % 12) * 25, 150 + Math.floor(i / 12) * 30), prioridade: 6 }));
const nDenso = rotulosSemSobrepor(denso, j).size;
ok(nDenso === 8, `Centro denso: ${nDenso} nomes (o teto de 8 por tela)`);

// 200 pinos espalhados: nenhuma caixa aceita se sobrepõe
const muitos = Array.from({ length: 200 }, (_, i) => ({ id: String(i), ...em(20 + (i * 37) % 350, 60 + (i * 53) % 520), prioridade: i % 6 }));
const aceitos = rotulosSemSobrepor(muitos, j);
const caixas = [...aceitos].map(([id, lado]) => { const m = muitos[Number(id)]; const q = projetar(m.lat, m.lng, j); return lado === 'dir' ? { x0: q.x + 18, x1: q.x + 140, y0: q.y - 40, y1: q.y - 10 } : { x0: q.x - 140, x1: q.x - 18, y0: q.y - 40, y1: q.y - 10 }; });
let sobrepoe = 0;
for (let a = 0; a < caixas.length; a++) for (let b = a + 1; b < caixas.length; b++) {
  const A = caixas[a], B = caixas[b];
  if (A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1) sobrepoe++;
}
ok(sobrepoe === 0 && aceitos.size > 0 && aceitos.size <= 8, `200 pinos: ${aceitos.size} nomes, ${sobrepoe} sobreposições`);

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nrótulos: tudo certo');
