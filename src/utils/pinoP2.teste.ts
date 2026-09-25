// Teste da regra do pino "gota escura + anel".
//
// Rode com:  npx tsx src/utils/pinoP2.teste.ts
//
// Protege o que custa caro errar na rua: lead do colega pintado como meu,
// dono que saiu do time (Wericles) sem o anel amarelo, negócio parado há 40
// dias mostrando "hoje", "cobrar" sumindo, e a etapa em texto livre
// ("NEGÓCIO PERDIDO", "CASA DOS DADOS") virando temperatura inventada.
import type { Client } from '../types/client';
import { classificarPino, etiquetaDeTempo, nomeCurto, textoNormalizado, type ContextoPino } from './pinoP2';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const agora = new Date('2026-09-25T15:00:00Z'); // 12h em Brasília
const ctx: ContextoPino = {
  meuOwnerId: '91477292',                                   // Kelly
  donosDoTime: new Set(['91477292', '97978276', '83893603']), // Kelly, Sérgio, outro
  tempoPorNegocio: new Map([
    ['111', { diasNaEtapa: 12, slaEstourado: false, ultimaInteracao: '2026-09-25T13:00:00Z' }],
    ['222', { diasNaEtapa: 50, slaEstourado: false, ultimaInteracao: '2026-08-10T12:00:00Z' }],
    ['333', { diasNaEtapa: 9, slaEstourado: true, ultimaInteracao: '2026-09-20T12:00:00Z' }],
    ['444', { diasNaEtapa: 18, slaEstourado: false, ultimaInteracao: null }],
    ['555', { diasNaEtapa: 3, slaEstourado: false, ultimaInteracao: null, etapaCodigo: '1395880472' }],
  ]),
  etapaDePara: new Map<string, string | null>([
    ['prospeccao', '1395880469'], ['negociacao', '1395880472'], ['demo/proposta', '1395880471'],
    ['perdido', '1396006164'], ['negocio perdido', '1396006164'], ['ganho', '1396006162'],
    ['casa dos dados', null],
  ]),
  limites: [7, 30],
  agora,
};

const base = (x: Partial<Client>): Client => ({
  id: 'x', nome: 'Bar do Zé', empresa: null, status: 'lead', etapa: 'Prospecção',
  vendedor_id_hubspot: '91477292', id_hubspot: null, conta_alvo_place_id: null,
  geo_approximate: false, visited_at: null, ...x,
} as unknown as Client);

// temperatura pela etapa canônica, com texto livre
ok(classificarPino(base({ etapa: 'NEGOCIAÇÃO' }), ctx).temp === 'Q', 'NEGOCIAÇÃO em caixa alta é quente');
ok(classificarPino(base({ etapa: 'Demo/Proposta' }), ctx).temp === 'M', 'Demo/Proposta é morno');
ok(classificarPino(base({ etapa: 'prospecção' }), ctx).temp === 'F', 'prospecção é frio');
ok(classificarPino(base({ etapa: 'NEGÓCIO PERDIDO' }), ctx).temp === 'X', '"NEGÓCIO PERDIDO" é Perdido, igual a "Perdido"');
ok(classificarPino(base({ etapa: 'CASA DOS DADOS' }), ctx).temp === '?', '"CASA DOS DADOS" é origem: pino "?" cinza, não temperatura');
ok(classificarPino(base({ etapa: 'Acompanhamento' }), ctx).temp === '?', 'etapa que a tabela não conhece vira "?"');
ok(classificarPino(base({ etapa: null }), ctx).glifo === '?', 'sem etapa vira "?"');
ok(classificarPino(base({ etapa: null, id_hubspot: '555' }), ctx).temp === 'Q', 'sem etapa no app: usa a etapa do snapshot do Cockpit (0105)');
ok(classificarPino(base({ etapa: 'Prospecção', id_hubspot: '555' }), ctx).temp === 'F', 'etapa do app reconhecida vale mais que o snapshot');

// tipo
const cli = classificarPino(base({ status: 'cliente', etapa: null }), ctx);
ok(cli.tipo === 'cliente' && cli.logo && cli.cor === '#E51A31' && cli.etiqueta === null, 'cliente: anel vermelho + logo, sem relógio');
ok(classificarPino(base({ status: 'lead', etapa: 'Ganho' }), ctx).tipo === 'cliente', 'etapa Ganho conta como cliente');
const ex = classificarPino(base({ status: 'churn' }), ctx);
ok(ex.tipo === 'ex' && ex.glifo === '↺' && ex.cor === '#F472B6', 'ex-cliente: anel rosa + ↺');
ok(classificarPino(base({ conta_alvo_place_id: 'municao:1' }), ctx).tipo === 'alvo', 'munição sem negócio é conta-alvo');
ok(classificarPino(base({ conta_alvo_place_id: 'abc', id_hubspot: '111' }), ctx).tipo === 'lead', 'conta-alvo que virou negócio vira lead');

// dono
ok(classificarPino(base({}), ctx).dono === 'meu', 'meu lead');
const colega = classificarPino(base({ vendedor_id_hubspot: '97978276' }), ctx);
ok(colega.dono === 'colega' && colega.opacidade === 0.8, 'lead do Sérgio: colega, opacidade 0,8');
ok(classificarPino(base({ vendedor_id_hubspot: '86100505' }), ctx).dono === 'sem', 'dono fora do time (saiu): sem dono');
ok(classificarPino(base({ vendedor_id_hubspot: null }), ctx).dono === 'sem', 'sem vendedor: sem dono');
ok(classificarPino(base({ status: 'cliente', vendedor_id_hubspot: null }), ctx).dono !== 'sem', 'cliente sem vendedor NÃO é tracejado amarelo (C4)');
ok(classificarPino(base({ status: 'churn', vendedor_id_hubspot: null }), ctx).dono === 'sem', 'ex-cliente sem dono segue tracejado (reconquista)');
ok(classificarPino(base({}), { ...ctx, meuOwnerId: null }).dono === 'colega', 'sem owner próprio (gestor sem id): nada é "meu"');

// tempo
ok(classificarPino(base({ id_hubspot: '111' }), ctx).etiqueta?.texto === 'hoje', 'interação hoje em Brasília: "hoje"');
const velho = classificarPino(base({ id_hubspot: '222' }), ctx);
ok(velho.etiqueta?.texto === '46d parado' && velho.opacidade === 0.72, '46 dias sem toque: vermelho e pino a 0,72');
ok(classificarPino(base({ id_hubspot: '222', visited_at: '2026-09-23T14:00:00Z' }), ctx).etiqueta?.texto === '2d',
  'visita mais recente que a interação manda: "2d"');
ok(classificarPino(base({ id_hubspot: '333' }), ctx).etiqueta?.texto === 'cobrar', 'SLA estourado: "cobrar"');
ok(classificarPino(base({ id_hubspot: '444' }), ctx).etiqueta?.texto === '18d parado', 'sem interação: dias na etapa');
ok(classificarPino(base({}), ctx).etiqueta === null, 'lead fora do Cockpit e nunca visitado: sem etiqueta (não inventa "hoje")');
ok(classificarPino(base({ visited_at: '2026-09-25T02:00:00Z' }), ctx).etiqueta?.texto === '1d',
  'visita às 23h de ontem em Brasília é "1d", não "hoje"');

// faixas e nome
ok(etiquetaDeTempo(7, [7, 30]).texto === '7d' && etiquetaDeTempo(8, [7, 30]).texto === '8d parado', 'limite 7 dias');
ok(etiquetaDeTempo(30, [7, 30]).fundo === '#4A2A05' && etiquetaDeTempo(31, [7, 30]).fundo === '#4B1C1C', 'limite 30 dias');
ok(nomeCurto('Restaurante Sabor da Terra') === 'Restaurante Sab…' && nomeCurto('Bar do Zé') === 'Bar do Zé', 'nome até 15 + …');
ok(textoNormalizado('  NEGÓCIO   PERDIDO ') === 'negocio perdido', 'normaliza igual ao banco');
ok(classificarPino(base({ geo_approximate: true }), ctx).aproximado, 'posição aproximada liga o halo');
ok(classificarPino(base({ etapa: 'Perdido', id_hubspot: '222' }), ctx).etiqueta === null, 'negócio perdido não tem relógio (nem 46d parado)');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\npino P2: tudo certo');
