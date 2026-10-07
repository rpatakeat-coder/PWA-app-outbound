// Teste das regras do card e da folha do mapa novo.
//
// Rode com:  npx tsx src/utils/cardNovo.teste.ts
//
// Protege: a próxima parada não ser a do plano; a lista por Prioridade
// passando lead frio perto na frente da cobrança; o card dizendo "0 m" ou
// "posição exata" quando não sabe; e telefone ausente sem aviso.
import type { Client } from '../types/client';
import { distanciaTexto, faturamentoTexto, fatosDoCard, ordenarItens, quedaCurta, sinaisDoCliente, telefoneTexto, textoDoToque, type ItemFolha } from './cardNovo';
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

// clientes em queda (lente "Em queda"): o maior faturamento primeiro, depois do plano
{
  const q = (motivo: string, faturamento: number | null) => ({ tipo: 'cliente' as const, temp: null, queda: { motivo, faturamento, dono: null } });
  const lista = [
    it('pequeno-perto', { distanciaM: 10, p: q('sem comanda há 6 dias', 8000) }),
    it('grande-longe', { distanciaM: 9000, p: q('faturamento -35% no bimestre', 1093775) }),
    it('medio', { distanciaM: 500, p: q('faturamento -21% no bimestre', 240000) }),
    it('plano', { plano: 1, distanciaM: 7000 }),
  ];
  const ordem = ordenarItens(lista, 'prioridade').map((x) => x.c.id).join(',');
  ok(ordem === 'plano,grande-longe,medio,pequeno-perto', `Em queda: plano › maior faturamento (${ordem})`);
  ok(quedaCurta({ motivo: 'faturamento -35% no bimestre', faturamento: 1093775 }) === '−35% · R$ 1,1 mi', 'linha: queda e tamanho');
  ok(quedaCurta({ motivo: 'sem comanda há 7 dias', faturamento: 80400 }) === '7d sem comanda · R$ 80 mil', 'linha: dias sem comanda');
  ok(quedaCurta({ motivo: 'faturamento -20% no bimestre · sem comanda há 5 dias', faturamento: null }) === '−20% · 5d sem comanda', 'linha: os dois motivos, sem faturamento');
  ok(quedaCurta({ motivo: 'faturamento -1160437100% no bimestre', faturamento: 264845 }).startsWith('queda forte'), 'linha: variação impossível vira "queda forte"');
  ok(faturamentoTexto(240540) === 'R$ 241 mil' && faturamentoTexto(950) === 'R$ 950', 'faturamento em uma palavra');
}

// linha do cliente na espiada
{
  const hoje = '2026-09-28';
  const txt = (c: Partial<Client>, p: Partial<Pino>) => sinaisDoCliente(cli(c), pino(p), hoje).map((x) => `${x.tom ?? '-'}:${x.texto}`).join(' | ');
  ok(txt({}, { tipo: 'lead' }) === '', 'lead não tem linha de cliente');
  const ativo = txt({ hs_etapa_uso: 'Saudável', hs_qtd_comandas: 23124, hs_ultima_comanda_em: '2026-09-26' },
    { tipo: 'cliente', queda: { motivo: 'faturamento -26% no bimestre', faturamento: 65610, dono: null } });
  ok(ativo === 'ok:Cliente ativo · Saudável | -:23.124 comandas | -:última comanda há 2 dias | aviso:↓ −26% no bimestre · R$ 66 mil/mês', `cliente ativo em queda (${ativo})`);
  const parado = txt({ hs_etapa_uso: 'Risco', hs_qtd_comandas: 900, hs_ultima_comanda_em: '2026-09-20' },
    { tipo: 'cliente', queda: { motivo: 'sem comanda há 8 dias', faturamento: 716129, dono: null } });
  ok(parado === 'aviso:Em risco · Risco | -:900 comandas | aviso:última comanda há 8 dias | -:R$ 716 mil/mês', `cliente parado (${parado})`);
  const ex = txt({ hs_etapa_uso: 'Churn', hs_qtd_comandas: 2980, hs_ultima_comanda_em: '2026-08-17', hs_cancelamento_solicitado_em: '2026-07-24' }, { tipo: 'ex' });
  ok(ex === 'ex:Ex-cliente · cancelou em 24/07 | -:2.980 comandas | -:última comanda há 42 dias', `ex-cliente (${ex})`);
  ok(txt({ hs_etapa_uso: 'Setup' }, { tipo: 'cliente' }) === 'ok:Cliente ativo · Setup | -:sem comanda registrada', 'cliente novo sem comanda');
}

// fatos
ok(distanciaTexto(null) === null && distanciaTexto(1234) === '1,2 km' && distanciaTexto(87) === '90 m' && distanciaTexto(1408012) === '1.408 km', 'distância em m/km, nula sem GPS');
const semGps = fatosDoCard({ client: cli({}), pino: pino({}), distanciaM: null }).map((f) => f.texto);
ok(!semGps.some((t) => /\d+ m$/.test(t)), 'sem GPS o card não inventa distância');
ok(semGps.includes('sem telefone'), 'sem telefone vira aviso');
// telefone legível (auditoria 06/10: o chip mostrava "27996183875")
ok(telefoneTexto('27996183875') === '(27) 99618-3875', 'celular com DDD formatado');
ok(telefoneTexto('+55 21 3333-4444') === '(21) 3333-4444', 'fixo com +55 formatado');
ok(telefoneTexto('5521999998888') === '(21) 99999-8888', '55 colado tirado');
ok(telefoneTexto('ramal 12') === 'ramal 12', 'o que não é telefone fica como veio');
ok(fatosDoCard({ client: cli({ geo_approximate: true }), pino: pino({}), distanciaM: 10 }).some((f) => f.texto === '≈ posição aproximada' && f.aviso), 'aproximada vira aviso');
ok(fatosDoCard({ client: cli({ conta_alvo_rating: 4.5 as never, conta_alvo_reviews: 475 as never }), pino: pino({ tipo: 'alvo' }), distanciaM: null })
  .some((f) => f.texto === '4,5★ · 475 no Google'), 'nota do Google no formato da prancha');
ok(fatosDoCard({ client: cli({}), pino: pino({ tipo: 'ex' }), distanciaM: null }).some((f) => f.texto === 'data de saída desconhecida'),
  'ex-cliente sem data diz "desconhecida", nunca "há 0 dias"');

// contradições vistas na ficha do JULYAN HOUSE (25/09)
const f1 = fatosDoCard({ client: cli({ geo_approximate: false }), pino: pino({}), distanciaM: null, aproximado: true }).map((f) => f.texto);
ok(f1.includes('≈ posição aproximada') && !f1.includes('posição exata'), 'chip de posição segue o alerta do card, não só geo_approximate');
ok(textoDoToque('hoje') === 'tocado hoje' && textoDoToque('12d parado') === '12d sem toque' && textoDoToque('5d') === '5d sem toque'
  && textoDoToque('cobrar') === 'cobrança vencida', 'no card o tempo diz o que mede (sem toque), não conflita com "dias na etapa"');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\ncard e folha: tudo certo');
