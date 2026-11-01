// Teste da habilidade do mês no app: a mesma conta do cockpit (GV2.HB).
//
// Rode com:  npx tsx src/utils/habilidadeDoMes.teste.ts
import { daPessoa, doTime, fmt, qualMostrar, uteis, veredito, type DiaHab, type LinhaHab, type QuadroHab } from './habilidadeDoMes';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const dia = (d: string, o: Partial<DiaHab>): DiaHab => ({ d, p: 0, f: 0, o: 0, m: 0, c: 0, ...o });
// outubro: 80 visitas, 80 fichas, 20 com o dono (25%), 16 demos (20%), 4 clientes (25%)
const out = ['2026-10-06', '2026-10-14', '2026-10-21', '2026-10-28'].map((d) => dia(d, { p: 20, f: 20, o: 5, m: 4, c: 1 }));
const bia: LinhaHab = {
  pessoa: 'bia', nome: 'Bia', emRampa: false,
  dias: [...out, dia('2026-11-03', { p: 10, f: 10, o: 3, m: 2 }), dia('2026-11-10', { p: 10, f: 10, o: 4, m: 1, c: 1 }), dia('2026-11-16', { p: 2, f: 2, o: 1 })],
  habilidade: { taxa: 'dono', antes: 25, meta: 50, combinadaEm: '2026-11-02' },
};
const q: QuadroHab = {
  mes: '2026-11-01', anterior: '2026-10-01', ate: '2026-11-16', hoje: '2026-11-16',
  time: { anterior: { p: 468, f: 393, o: 195, m: 98, c: 40, pessoas: 6 }, atual: { p: 200, f: 180, o: 90, m: 40, c: 15, pessoas: 6 } },
  pessoas: [bia],
};

ok(uteis('2026-10-01', '2026-10-31') === 22, 'outubro de 2026 tem 22 dias úteis (seg a sex)');
ok(daPessoa(q, bia, 'dono', 'anterior').v === 25 && daPessoa(q, bia, 'demo', 'anterior').v === 20 && daPessoa(q, bia, 'fechar', 'anterior').v === 25, 'outubro da pessoa: 25%, 20% e 25%');
ok(daPessoa(q, bia, 'volume', 'anterior').v === 18, 'volume: 80 visitas em 22 dias úteis = 18 por semana');
ok(doTime(q, 'dono', 'anterior').v === 50 && doTime(q, 'demo', 'anterior').v === 21 && doTime(q, 'fechar', 'anterior').v === 41 && doTime(q, 'volume', 'anterior').v === 18,
  'o time em outubro: 50%, 21%, 41% e 18 por pessoa por semana (os mesmos números do cockpit)');
const agora = daPessoa(q, bia, 'dono', 'atual');
ok(agora.v === 36 && agora.n === 8 && agora.den === 22, 'novembro até 16/11: 8 de 22 fichas com o dono = 36%');
ok(veredito(bia.habilidade!, 36) === 'subiu' && veredito(bia.habilidade!, 50) === 'melhorou' && veredito(bia.habilidade!, 20) === 'nao_melhorou' && veredito(bia.habilidade!, null) === null,
  'veredito: bateu a meta, subiu sem bater, não melhorou');
ok(fmt('dono', 36) === '36%' && fmt('volume', 18) === '18' && fmt('fechar', null) === '—', 'formato: % nas taxas, número no volume, traço sem base');
const dia1: QuadroHab = { ...q, ate: '2026-11-01', hoje: '2026-11-01', time: { ...q.time, atual: { p: 0, f: 0, o: 0, m: 0, c: 0, pessoas: 0 } } };
ok(qualMostrar(dia1, { ...bia, dias: out }) === 'anterior' && qualMostrar(q, bia) === 'atual', 'no dia 1, sem nenhuma visita no mês, as taxas mostram o mês anterior inteiro');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nhabilidade do mês: tudo certo');
