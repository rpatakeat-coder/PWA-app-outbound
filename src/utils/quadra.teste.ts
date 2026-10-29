// Teste do resumo de quadra: área, composição e melhor candidato.
//
// Rode com:  npx tsx src/utils/quadra.teste.ts
import { quadrasNaTela, resumoDaQuadra } from './quadra';
import type { Pino } from './pinoP2';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const pino = (x: Partial<Pino>): Pino => ({
  tipo: 'lead', temp: 'F', cor: '#fff', glifo: 'F', logo: false, dono: 'colega', aproximado: false,
  nome: '', etiqueta: null, opacidade: 1, origem: null, familia: x.tipo === 'alvo' ? 'alvo' : x.tipo === 'cliente' ? 'cli' : x.tipo === 'ex' ? 'ex' : 'lead', ...x,
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
const fechou = it('fechou', { tipo: 'alvo', temp: null }, { conta_alvo_rating: 4.9, conta_alvo_reviews: 900, motor_status: 'sumiu_google' }, null, 50);
ok(resumoDaQuadra([...base, fechou]).melhor?.id !== 'fechou', 'conta-alvo que o motor viu fechada nunca é o melhor candidato');

// cartões que se tocariam viram uma quadra só
const m = (pre: string, n: number) => Array.from({ length: n }, (_, i) => pre + i);
const q = quadrasNaTela([
  { lider: 'A', membros: m('a', 34), x: 200, y: 300 },
  { lider: 'B', membros: m('b', 12), x: 260, y: 320 },   // cartão bate no de A
  { lider: 'C', membros: m('c', 8), x: 200, y: 500 },    // longe
  { lider: 'D', membros: m('d', 3), x: 205, y: 300 },    // pilha pequena: nem entra
]);
ok([...q.quadras.keys()].join() === 'A,C' && q.quadras.get('A')!.length === 46, 'B se toca com A: vira uma quadra com 46; C fica sozinha');
ok(q.absorvida.get('B') === 'A' && !q.absorvida.has('D'), 'B absorvida por A; pilha pequena fica de fora');

// ── O CENTRÓIDE NÃO É QUADRA (Julyan, 28/10/26: "revise esse bug no mapa") ───────────────
/* O caso exato do print dele, reconstruído: 27 lugares amontoados num ponto só, no Estácio,
   com bairros de Jacarepaguá no meio. A tela dizia "Quadra · JACAREPAGUA · 27 pinos" e
   oferecia um melhor candidato "a 2,3 km" — que é a distância até o centro do Rio.
   Medido na base no mesmo dia: 777 leads em 69 coordenadas assim. */
{
  const BAIRROS_RJ = ['Anil', 'Taquara', 'Freguesia', 'Vargem Pequena', 'Centro', 'Tijuca',
    'Estácio', 'Botafogo', 'Méier', 'Madureira', 'Barra', 'Recreio', 'Bangu', 'Campo Grande',
    'Ipanema', 'Leblon'];
  const centroide = Array.from({ length: 27 }, (_, i) =>
    it(`c${i}`, { tipo: 'cliente' }, { bairro: BAIRROS_RJ[i % BAIRROS_RJ.length], cidade: 'Rio de Janeiro' }, null, 2300));
  const rc = resumoDaQuadra(centroide);
  ok(rc.semLugar, 'ponto com 16 bairros não é quarteirão');
  ok(!/jacarepagua|anil|taquara/i.test(rc.area), `a área não finge um bairro (veio "${rc.area}")`);
  ok(/Sem endereço exato/.test(rc.area), 'a área diz o que é: sem endereço exato');
  ok(/Rio de Janeiro/.test(rc.area), 'e diz a cidade, que é o que de fato se sabe');
  ok(/16 bairros/.test(rc.composicao), `a composição mostra a prova (veio "${rc.composicao}")`);
  ok(rc.melhor === null, 'sem melhor candidato: não se manda ninguém andar 2,3 km até um centróide');
  ok(!/km/.test(JSON.stringify(rc)), 'e a distância até o centróide não aparece em lugar nenhum');
}
/* E O QUARTEIRÃO DE VERDADE CONTINUA QUARTEIRÃO — inclusive o shopping, onde cinco
   restaurantes dividem a mesma coordenada de propósito. Sem esta checagem, o conserto teria
   apagado o melhor candidato do mapa inteiro. */
{
  const shopping = Array.from({ length: 8 }, (_, i) =>
    it(`s${i}`, { tipo: 'lead' }, { bairro: 'Praia do Canto', cidade: 'Vitória' }, null, 120));
  const rs = resumoDaQuadra(shopping);
  ok(!rs.semLugar, 'oito lugares no mesmo bairro seguem sendo uma quadra');
  ok(rs.area === 'Praia do Canto', 'e a quadra continua com o nome do bairro');
  ok(!!rs.melhor && /120 m/.test(rs.melhor.texto), 'e continua indicando o melhor candidato, com a distância');
  const doisBairros = [...shopping, it('x1', { tipo: 'lead' }, { bairro: 'Jardim da Penha', cidade: 'Vitória' })];
  ok(!resumoDaQuadra(doisBairros).semLugar, 'dois bairros ainda é quadra: rua de divisa existe');
  const tres = [...doisBairros, it('x2', { tipo: 'lead' }, { bairro: 'Mata da Praia', cidade: 'Vitória' })];
  ok(resumoDaQuadra(tres).semLugar, 'o terceiro bairro é a linha: aí não é mais quarteirão');
}
/* A base do topo deste arquivo tem dois bairros (Centro e Praia do Canto), então continua
   sendo quadra — e é por isso que as checagens de área e composição lá em cima seguem
   valendo. Se alguém mexer nos fixtures e cruzar a linha, esta checagem avisa antes. */
ok(!r.semLugar, 'o resumo do topo deste arquivo continua sendo uma quadra de verdade');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nquadra: tudo certo');
