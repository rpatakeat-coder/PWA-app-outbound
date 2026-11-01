// Teste da previsão honesta no app: a mesma conta do cockpit (GV2.rcDisse).
//
// Rode com:  npx tsx src/utils/previsaoDemo.teste.ts
import { CHANCES, disseDoTime, distanciaDoTime, mesAnterior, mesDaPrevisao, meuAcerto } from './previsaoDemo';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

ok(CHANCES.join() === '10,30,50,70,90', 'os 5 botões: 10, 30, 50, 70 e 90%');
// 31/10 às 23h em Brasília = 01/11 02h UTC: a demo ainda é de outubro
ok(mesDaPrevisao(new Date('2026-11-01T02:00:00Z')) === '2026-10-01', '23h de 31/10 em Brasília ainda é outubro');
ok(mesDaPrevisao(new Date('2026-11-01T03:30:00Z')) === '2026-11-01', '00h30 de 01/11 já é novembro');
ok(mesAnterior('2026-11-01') === '2026-10-01' && mesAnterior('2027-01-01') === '2026-12-01', 'o mês anterior, virando o ano');
const t = { demos: 10, ditas: 4, somaDita: 240, fecharam: 3 };
ok(disseDoTime(t, 40) === 48, 'o time disse 48%: 4 chances ditas (240) + 6 demos com a conversão de 40%');
ok(distanciaDoTime(t, 40) === 18, 'fechou 30%: a distância do time é 18 pts');
ok(disseDoTime({ demos: 0, ditas: 0, somaDita: 0, fecharam: 0 }, 40) === null, 'sem demo, sem previsão');
const eu = meuAcerto({ demos: 6, ditas: 4, somaDita: 280, fecharam: 2, ditasFecharam: 1 });
ok(!!eu && eu.disse === 70 && eu.fechou === 25 && eu.distancia === 45, 'o meu acerto conta só as demos em que eu disse: 70% contra 25% = 45 pts');
ok(meuAcerto({ demos: 3, ditas: 0, somaDita: 0, fecharam: 1 }) === null, 'sem nenhuma chance dita, o acerto não aparece');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nprevisão da demo: tudo certo');
