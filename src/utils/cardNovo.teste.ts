// Teste das regras do card e da folha do mapa novo.
//
// Rode com:  npx tsx src/utils/cardNovo.teste.ts
//
// Protege: a próxima parada não ser a do plano; a lista por Prioridade
// passando lead frio perto na frente da cobrança; o card dizendo "0 m" ou
// "posição exata" quando não sabe; e telefone ausente sem aviso.
import type { Client } from '../types/client';
import { distanciaTexto, fatosDoCard, ordenarItens, type ItemFolha } from './cardNovo';
import type { Pino } from './pinoP2';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const pino = (x: Partial<Pino>): Pino => ({
  tipo: 'lead', temp: 'F', cor: '#60A5FA', glifo: 'F', logo: false, dono: 'meu', aproximado: false, nome: 'x', etiqueta: null, opacidade: 1, ...x,
});
const cli = (x: Partial<Client>): Client => ({ id: 'x', nome: 'x', telefone: null, geo_approximate: false, conta_alvo_rating: null, conta_alvo_reviews: null, ...x } as unknown as Client);
const it = (id: string, x: Partial<ItemFolha> & { p?: Partial<Pino> }): ItemFolha => ({
  c: cli({ id }), plano: null, distanciaM: 500, feito: false, ...x, p: pino(x.p ?? {}),
});

// ordem
const itens = [
  it('frio-perto', { distanciaM: 50 }),
  it('quente', { distanciaM: 900, p: { temp: 'Q' } }),
  it('cobrar', { distanciaM: 2000, p: { etiqueta: { texto: 'cobrar', fundo: '', tinta: '' } } }),
  it('plano2', { plano: 2, distanciaM: 3000 }),
  it('plano1', { plano: 1, distanciaM: 4000 }),
  it('plano-feito', { plano: 3, feito: true, distanciaM: 10 }),
  it('morno', { distanciaM: 800, p: { temp: 'M' } }),
];
const prio = ordenarItens(itens, 'prioridade').map((x) => x.c.id).join(',');
ok(prio === 'plano1,plano2,cobrar,quente,morno,frio-perto,plano-feito', `Prioridade: plano › cobrança › quente › morno › distância (${prio})`);
ok(ordenarItens(itens, 'distancia')[0].c.id === 'plano-feito', 'Distância: o mais perto primeiro');
ok(ordenarItens([it('sem', { distanciaM: null }), it('com', { distanciaM: 5000 })], 'distancia')[0].c.id === 'com', 'sem GPS vai para o fim, não vira 0 m');

// fatos
ok(distanciaTexto(null) === null && distanciaTexto(1234) === '1,2 km' && distanciaTexto(87) === '90 m', 'distância em m/km, nula sem GPS');
const semGps = fatosDoCard({ client: cli({}), pino: pino({}), distanciaM: null }).map((f) => f.texto);
ok(!semGps.some((t) => /\d+ m$/.test(t)), 'sem GPS o card não inventa distância');
ok(semGps.includes('sem telefone'), 'sem telefone vira aviso');
ok(fatosDoCard({ client: cli({ geo_approximate: true }), pino: pino({}), distanciaM: 10 }).some((f) => f.texto === '≈ posição aproximada' && f.aviso), 'aproximada vira aviso');
ok(fatosDoCard({ client: cli({ conta_alvo_rating: 4.5 as never, conta_alvo_reviews: 475 as never }), pino: pino({ tipo: 'alvo' }), distanciaM: null })
  .some((f) => f.texto === '4,5★ · 475 no Google'), 'nota do Google no formato da prancha');
ok(fatosDoCard({ client: cli({}), pino: pino({ tipo: 'ex' }), distanciaM: null }).some((f) => f.texto === 'data de saída desconhecida'),
  'ex-cliente sem data diz "desconhecida", nunca "há 0 dias"');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\ncard e folha: tudo certo');
