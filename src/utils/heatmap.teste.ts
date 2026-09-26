// Teste do "Ninguém foi" da lente Calor.
//
// Rode com:  npx tsx src/utils/heatmap.teste.ts
import { celulasNinguemFoi } from './heatmap';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const lat0 = -30.03;
const perto = (dLatM: number, dLonM: number) => ({ lat: lat0 + dLatM / 111320, lon: -51.22 + dLonM / (111320 * Math.cos((lat0 * Math.PI) / 180)) });
// área A: 4 pinos juntos, nenhuma visita; área B: 4 pinos a 2 km, com uma visita no meio; área C: 2 pinos sem visita
const A = [perto(0, 0), perto(10, 10), perto(-10, 5), perto(5, -10)];
const B = [perto(2000, 0), perto(2010, 5), perto(1995, -5), perto(2005, 10)];
const C = [perto(0, 3000), perto(10, 3010)];
const r = celulasNinguemFoi([...A, ...B, ...C], [perto(2000, 2)], lat0);
ok(r.length === 1 && r[0].pinos === 4, 'só a área sem visita e com 3+ pinos vira "ninguém foi"');
ok(Math.abs(r[0].lat - lat0) < 0.001, 'o anel fica no meio dos pinos da área');
ok(celulasNinguemFoi(A, [perto(3, 3)], lat0).length === 0, 'uma visita na área apaga o anel');
ok(celulasNinguemFoi([...A, ...C], [], lat0, 2).length === 2, 'minPinos configurável');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nheatmap: tudo certo');
