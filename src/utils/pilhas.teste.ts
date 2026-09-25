// Teste das pilhas e do leque (prompt final C11).
//
// Rode com:  npx tsx src/utils/pilhas.teste.ts
import { pilhasNaTela, posicoesDoLeque, type Janela } from './rotulos';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const j: Janela = { latitude: -20.32, longitude: -40.34, latitudeDelta: 0.006, longitudeDelta: 0.004, larguraPx: 390, alturaPx: 600 };
const em = (x: number, y: number) => ({ lat: j.latitude + j.latitudeDelta / 2 - (y * j.latitudeDelta) / j.alturaPx, lng: j.longitude - j.longitudeDelta / 2 + (x * j.longitudeDelta) / j.larguraPx });

const p = pilhasNaTela([
  { id: 'frio', ...em(100, 100), prioridade: 6 },
  { id: 'plano', ...em(110, 105), prioridade: 1 },
  { id: 'longe', ...em(300, 400), prioridade: 3 },
], j);
ok(p.length === 2, 'dois colados viram uma pilha, o longe fica sozinho');
const pilha = p.find((x) => x.membros.length === 2);
ok(pilha?.lider === 'plano', 'o mais prioritário lidera a pilha (plano antes do frio)');

const mesmo = em(200, 200);
const iguais = pilhasNaTela([{ id: 'a', ...mesmo, prioridade: 2 }, { id: 'b', ...mesmo, prioridade: 2 }, { id: 'c', ...mesmo, prioridade: 2 }], { ...j, latitudeDelta: 0.00001, longitudeDelta: 0.00001 });
ok(iguais.length === 1 && iguais[0].membros.length === 3, 'mesma coordenada empilha mesmo no zoom máximo');

ok(pilhasNaTela([{ id: 'x', ...em(100, 100), prioridade: 1 }, { id: 'y', ...em(130, 100), prioridade: 1 }], j).length === 2, 'a 30 px (corpos sem sobrepor) não empilha');

for (const n of [2, 3, 5, 10]) {
  const l = posicoesDoLeque(n);
  let menor = Infinity;
  for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) menor = Math.min(menor, Math.hypot(l[a].dx - l[b].dx, l[a].dy - l[b].dy));
  const raio = Math.hypot(l[0].dx, l[0].dy);
  ok(l.every((q) => q.dy < 0) && menor >= 30 && raio >= 39 && raio <= 121, `leque de ${n}: acima do ponto, vizinhos a ${Math.round(menor)} px, raio ${Math.round(raio)} px`);
}

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\npilhas: tudo certo');
