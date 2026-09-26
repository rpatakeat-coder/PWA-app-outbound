// Teste do resumo de quadra: área, composição e melhor candidato.
//
// Rode com:  npx tsx src/utils/quadra.teste.ts
import { resumoDaQuadra } from './quadra';
import type { Pino } from './pinoP2';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const pino = (x: Partial<Pino>): Pino => ({
  tipo: 'lead', temp: 'F', cor: '#fff', glifo: 'F', logo: false, dono: 'colega', aproximado: false,
  nome: '', etiqueta: null, opacidade: 1, origem: null, ...x,
});
const it = (id: string, p: Partial<Pino>, extra: Record<string, unknown> = {}, plano: number | null = null, distanciaM: number | null = 500) =>
  ({ c: { id, nome: id, bairro: 'Centro', cidade: 'Vitória', ...extra }, p: pino(p), plano, distanciaM });

const alvos = Array.from({ length: 31 }, (_, i) => it(`a${i}`, { tipo: 'alvo', temp: null }, { conta_alvo_rating: 4.2, conta_alvo_reviews: 50 }, null, 900 + i));
const base = [
  ...alvos,
  it('e1', { tipo: 'ex' }), it('e2', { tipo: 'ex' }), it('e3', { tipo: 'ex' }), it('e4', { tipo: 'ex' }),
  it('l1', { tipo: 'lead' }), it('l2', { tipo: 'lead' }), it('l3', { tipo: 'lead' }, { bairro: 'Praia do Canto' }),
];
const r = resumoDaQuadra(base);
ok(r.composicao === '31 contas-alvo · 4 ex · 3 leads', 'composição do prompt: "31 contas-alvo · 4 ex · 3 leads"');
ok(r.area === 'Centro', 'área = o bairro que mais aparece');

const comBoa = [...base, it('boa', { tipo: 'alvo', temp: null }, { conta_alvo_rating: 4.8, conta_alvo_reviews: 475 }, null, 600)];
ok(resumoDaQuadra(comBoa).melhor?.texto === 'melhor: nota 4,8 · 600 m', 'conta-alvo ≥ 4,5★ e ≥ 100 avaliações: "melhor: nota 4,8 · 600 m"');
ok(resumoDaQuadra([...comBoa, it('q', { dono: 'meu', temp: 'Q' }, { empresa: 'Bar do Zé' }, null, 2000)]).melhor?.texto === 'melhor: Bar do Zé · 2,0 km', 'minha carteira quente vence a conta-alvo bem avaliada');
ok(resumoDaQuadra([...comBoa, it('c', { etiqueta: { texto: 'cobrar', fundo: '', tinta: '' } }, { empresa: 'Kadô' })]).melhor?.id === 'c', 'cobrança vence carteira e conta-alvo');
ok(resumoDaQuadra([...comBoa, it('p', {}, {}, 3, 3000)]).melhor?.texto === 'melhor: parada 3 · 3,0 km', 'plano de hoje vence tudo');
ok(resumoDaQuadra([it('x', {}, { bairro: null, cidade: 'Serra' })]).area === 'Serra', 'sem bairro: a cidade');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nquadra: tudo certo');
