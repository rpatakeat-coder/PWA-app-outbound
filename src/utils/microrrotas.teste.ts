// npx tsx src/utils/microrrotas.teste.ts
import { metros, montarMicrorrotas, type Candidata } from './microrrotas';

let falhas = 0;
const ok = (c: boolean, m: string) => { if (c) console.log('ok  ', m); else { falhas++; console.log('FALHA', m); } };

// ~0,0009° de latitude ≈ 100 m
const base = { lat: -23.55, lng: -46.63 };
const perto = (dLat: number, dLng: number) => ({ lat: base.lat + dLat, lng: base.lng + dLng });
const C = (id: string, dLat: number, dLng: number, peso: number, obrigatoria = false): Candidata => ({ id, ...perto(dLat, dLng), peso, obrigatoria });

// Quadra A (a 1 km): 3 portas a 100 m uma da outra. Quadra B (a 5 km): 3 portas.
// Uma porta solta, pesada, a 12 km.
const cand = [
  C('a1', 0.009, 0, 10), C('a2', 0.0099, 0, 10), C('a3', 0.0108, 0, 10),
  C('b1', 0.045, 0, 12), C('b2', 0.0459, 0, 12), C('b3', 0.0468, 0, 12),
  C('longe', 0.108, 0, 30),
];

const r = montarMicrorrotas(cand, base, { meta: 6 });
ok(r.ordem.length === 6, `meta 6 dá 6 paradas (deu ${r.ordem.length}: ${r.ordem.join(',')})`);
ok(r.micros.length === 2, `duas microrrotas (deu ${r.micros.length})`);
ok(r.ordem.slice(0, 3).every((id) => id.startsWith('a')), 'a quadra mais perto vem primeiro');
ok(!r.ordem.includes('longe'), 'a porta solta a 12 km não entra quando duas quadras batem a meta');
ok(r.micros.every((m) => m.ids.every((id, i) => i === 0 || (() => {
  const a = cand.find((c) => c.id === m.ids[i - 1])!, b = cand.find((c) => c.id === id)!;
  return metros(a.lat, a.lng, b.lat, b.lng) <= 300;
})())), 'dentro da microrrota, porta seguinte a pé (≤ 300 m)');

// Obrigatória longe entra mesmo assim
const r2 = montarMicrorrotas([...cand, C('plano', 0.2, 0, 1, true)], base, { meta: 6 });
ok(r2.ordem.includes('plano'), 'a parada que o Cockpit planejou entra sempre');

// Quadra não é cortada ao meio: meta 4 com quadras de 3 → 6 (folga), não 4
const r3 = montarMicrorrotas(cand, base, { meta: 4 });
ok(r3.micros.every((m) => m.ids.length === 3), `a última quadra entra inteira (${r3.micros.map((m) => m.ids.length).join('+')})`);

// Sem coordenada fica de fora; id repetido conta uma vez
const r4 = montarMicrorrotas([C('x', 0.001, 0, 5), { id: 'semgps', lat: NaN, lng: NaN, peso: 99 }, C('x', 0.001, 0, 5)], base, { meta: 3 });
ok(r4.ordem.join() === 'x', 'sem coordenada sai, repetido conta uma vez');

console.log(falhas ? `${falhas} falha(s)` : 'microrrotas: tudo certo');
if (falhas) process.exitCode = 1;
