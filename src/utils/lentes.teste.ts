// Teste das lentes e filtros do mapa novo.
//
// Rode com:  npx tsx src/utils/lentes.teste.ts
//
// Protege: "Meu dia" mostrando lead do colega; o plano de hoje virando ponto;
// Reconquista sem os ex-clientes; filtro de dois grupos somando em vez de
// cruzar; e a contagem do chip prometendo um número que o toque não entrega.
import type { Client } from '../types/client';
import { classificarPino, type ContextoPino } from './pinoP2';
import { contaAlvoDiscreta, contarChips, FILTROS_VAZIOS, passaNosFiltros, pontoDe, quantosFiltros, visitaDoFiltro, visivelNaLente, type FiltrosNovos } from './lentes';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const ctx: ContextoPino = {
  meuOwnerId: '1',
  donosDoTime: new Set(['1', '2']),
  tempoPorNegocio: new Map([['sla', { diasNaEtapa: 9, slaEstourado: true, ultimaInteracao: null }]]),
  etapaDePara: new Map<string, string | null>([['prospeccao', '1395880469'], ['negociacao', '1395880472'], ['demo/proposta', '1395880471'], ['perdido', '1396006164']]),
  limites: [7, 30],
  agora: new Date('2026-09-25T15:00:00Z'),
  // lp-novo abriu há 20 dias (recém-aberto); lp-velho há 400 (conta-alvo antiga da Casa dos Dados)
  aberturaPorLead: new Map([['lp-novo', '2026-09-05T00:00:00Z'], ['lp-velho', '2025-08-21T00:00:00Z']]),
};
const L = (x: Partial<Client>): Client => ({
  id: 'x', nome: 'x', empresa: null, status: 'lead', etapa: 'Prospecção', vendedor_id_hubspot: '1', id_hubspot: null,
  conta_alvo_place_id: null, geo_approximate: false, visited_at: null, origem_lead: 'hubspot', ...x,
} as unknown as Client);
const P = (x: Partial<Client>) => classificarPino(L(x), ctx);

// lentes (prancha "Mapa do Executivo", 15/10/26: a lente diz o que ENTRA; o resto não aparece nem como ponto)
const V = (l: Parameters<typeof visivelNaLente>[0], p: ReturnType<typeof P>, todos = false) => visivelNaLente(l, p, false, false, todos);
const meuQuente = P({ etapa: 'Negociação' });
const meuFrio = P({ etapa: 'Prospecção' });
const meuPerdido = P({ etapa: 'Perdido' });
const colegaQuente = P({ etapa: 'Negociação', vendedor_id_hubspot: '2' });
const cliente = P({ status: 'cliente' });
const ex = P({ status: 'churn' });
const novo = P({ lead_prospeccao_id: 'lp-novo', conta_alvo_place_id: 'm' } as Partial<Client>);
const novoColega = P({ lead_prospeccao_id: 'lp-novo', conta_alvo_place_id: 'm', vendedor_id_hubspot: '2' } as Partial<Client>);
const velho = P({ lead_prospeccao_id: 'lp-velho', conta_alvo_place_id: 'm' } as Partial<Client>);
const avaliado = P({ lead_prospeccao_id: 'lp-google', conta_alvo_place_id: 'g', conta_alvo_rating: 4.8 } as Partial<Client>);
const avaliadoBaixo = P({ lead_prospeccao_id: 'lp-google', conta_alvo_place_id: 'g', conta_alvo_rating: 4.1 } as Partial<Client>);
ok(meuQuente.familia === 'lead' && novo.familia === 'rec' && avaliado.familia === 'av' && cliente.familia === 'cli' && ex.familia === 'ex', 'famílias do pino');
ok(velho.familia === 'alvo' && avaliadoBaixo.familia === 'alvo', 'conta-alvo antiga e nota abaixo de 4,5 ficam sem família de lente');
ok(V('dia', meuQuente) && V('dia', meuFrio), 'Meu dia: meus leads com negócio, de toda temperatura');
ok(!V('dia', meuPerdido), 'Meu dia: negócio perdido não decide a próxima porta');
ok(!V('dia', colegaQuente), 'Meu dia: pino de colega não aparece');
// 15/10/26 (Julyan: "tirar tudo ficou meio ruim"): o cliente ativo volta ao Meu dia; o ex-cliente segue na Reconquista
ok(V('dia', cliente) && !V('dia', ex), 'Meu dia: cliente ativo aparece, ex-cliente não');
ok(V('dia', novo) && !V('dia', novoColega), 'Meu dia: meus recém-abertos, não os do colega');
/* SEM DONO TAMBÉM É MAPA (Julyan, 29/10/26). Eram 1.206 leads da Casa dos Dados e 634 do motor do
   Google invisíveis na lente de abertura, por não terem dono. Lead sem dono está na mesa; lead de
   colega não — e é essa diferença que estas quatro checagens seguram. */
const semDono = P({ etapa: 'Prospecção', vendedor_id_hubspot: null, origem_lead: 'casa_dos_dados' } as Partial<Client>);
const novoSemDono = P({ lead_prospeccao_id: 'lp-novo', conta_alvo_place_id: 'm', vendedor_id_hubspot: null } as Partial<Client>);
ok(semDono.dono === 'sem' && novoSemDono.dono === 'sem', 'sem vendedor, o pino é "sem dono"');
ok(V('dia', semDono), 'Meu dia: lead sem dono (Casa dos Dados) aparece — está na mesa para quem chegar');
ok(V('dia', novoSemDono), 'Meu dia: recém-aberto sem dono aparece');
ok(!V('dia', colegaQuente) && !V('dia', novoColega), 'Meu dia: o que é do colega continua fora — território é território');
ok(V('dia', avaliado) && V('dia', velho) && contaAlvoDiscreta('dia', avaliado) && contaAlvoDiscreta('dia', velho), 'Meu dia: as contas-alvo entram, discretas');
ok(!contaAlvoDiscreta('alvo', avaliado) && contaAlvoDiscreta('alvo', velho) && !contaAlvoDiscreta('dia', novo) && !contaAlvoDiscreta('dia', cliente), 'discreta: na lente Mais avaliados o avaliado é pino inteiro; recém-aberto e cliente nunca');
ok(!V('novos', velho) && !V('clientes', velho), 'conta-alvo antiga fora das outras lentes');
ok(visivelNaLente('dia', cliente, true, false) && visivelNaLente('dia', velho, false, true), 'qualquer lente: o plano e o pino aberto aparecem');
ok(V('novos', novo) && !V('novos', meuQuente) && !V('novos', novoColega), 'Recém-abertos: só os meus recém-abertos');
ok(V('novos', novoColega, true), 'Recém-abertos do gestor: os de todo mundo');
ok(V('carteira', meuFrio) && V('carteira', meuPerdido) && !V('carteira', colegaQuente) && !V('carteira', novo), 'Carteira: meus leads, perdidos inclusive');
ok(V('alvo', avaliado) && !V('alvo', avaliadoBaixo) && !V('alvo', novo), 'Mais avaliados: nota 4,5+');
ok(V('clientes', cliente) && !V('clientes', meuQuente), 'Clientes: só quem paga');
ok(V('rec', ex) && !V('rec', cliente), 'Reconquista: só ex-cliente');
ok(V('semdono', P({ vendedor_id_hubspot: '777' })) && !V('semdono', meuFrio), 'Sem dono: dono fora do time');
ok(!V('calor', meuQuente), 'Calor: nenhum pino');
ok(pontoDe(novo).forma === 'losango' && pontoDe(novo).cor === '#C8F31D' && pontoDe(novo, true).cor === '#C8F31D', 'zoom afastado: recém-aberto vira losango limão nos dois temas');
ok(pontoDe(meuQuente).tamanho === 10 && pontoDe(meuQuente).cor === meuQuente.cor, 'zoom afastado: lead vira ponto de 10 px na cor da temperatura');

// Em queda (clientes-sync, 0126): só cliente que está na lista de queda
{
  const ctxQ: ContextoPino = { ...ctx, quedaPorCliente: new Map([['q', { motivo: 'faturamento -35% no bimestre', faturamento: 120000, dono: '1' }]]) };
  const Q = (x: Partial<Client>) => classificarPino(L(x), ctxQ);
  ok(V('queda', Q({ id: 'q', status: 'cliente' })), 'Em queda: cliente da lista entra');
  ok(!V('queda', Q({ id: 'outro', status: 'cliente' })), 'Em queda: cliente fora da lista não entra');
  ok(!V('queda', Q({ id: 'q', status: 'lead' })), 'Em queda: lead com o mesmo id não entra');
  ok(Q({ id: 'q', status: 'cliente' }).etiqueta?.texto === 'em queda', 'Em queda: etiqueta no pino');
}

// filtros
const itens = [
  { c: L({ id: 'a', etapa: 'Negociação', origem_lead: 'cadastro_na_rua' }) },
  { c: L({ id: 'b', etapa: 'Prospecção', origem_lead: 'casa_dos_dados', id_hubspot: '900' }) },
  { c: L({ id: 'c', status: 'cliente', etapa: null, origem_lead: 'cadastro_na_rua' }) },
  { c: L({ id: 'd', status: 'churn', origem_lead: null }) },
  { c: L({ id: 'e', conta_alvo_place_id: 'x', origem_lead: 'google_maps_motor', lead_prospeccao_id: 'lp' }) },
  { c: L({ id: 'f', etapa: 'Perdido', origem_lead: 'indicacao' }) },
].map(({ c }) => ({ c, p: classificarPino(c, ctx) }));
const f = (x: Partial<FiltrosNovos>): FiltrosNovos => ({ ...FILTROS_VAZIOS, ...x });
const passam = (fx: FiltrosNovos) => itens.filter(({ c, p }) => passaNosFiltros(c, p, fx)).map(({ c }) => c.id).join('');

ok(passam(FILTROS_VAZIOS) === 'abcdef', 'sem filtro passa tudo');
ok(passam(f({ status: new Set(['lead']) })) === 'abf', 'Status Lead');
ok(passam(f({ status: new Set(['cliente', 'ex']) })) === 'cd', 'Cliente OU Ex-Cliente (mesmo grupo soma)');
ok(passam(f({ temp: new Set(['Q', 'F']) })) === 'ab', 'Quente OU Frio');
ok(passam(f({ temp: new Set(['fechado']) })) === 'c' && passam(f({ temp: new Set(['perdido']) })) === 'f', 'Fechado e Perdido');
ok(passam(f({ origem: new Set(['nao_informado']) })) === 'd', 'origem "Não informado" acha quem não tem origem');
ok(passam(f({ origem: new Set(['nao_informado']) })) === 'd' && !passam(f({ origem: new Set(['nao_informado']) })).includes('a'), 'origem "hubspot" derivada não existe na picklist: não vira origem inventada');
ok(passam(f({ status: new Set(['lead']), origem: new Set(['Rua']) })) === 'a', 'Lead E Rua (grupos cruzam)');
ok(quantosFiltros(f({ status: new Set(['lead']), temp: new Set(['Q', 'M']) })) === 3, 'Filtros · N conta cada chip');

// contagem do chip = o que o toque entrega
const ativo = f({ origem: new Set(['Rua']) });
const n = contarChips(itens, ativo);
ok(n.status.get('lead') === 1 && n.status.get('cliente') === 1, 'contagem de Status respeita a origem marcada');
ok(n.origem.get('Casa dos Dados') === 1 && n.origem.get('Rua') === 2, 'contagem de Origem ignora a própria origem marcada');
const toque = passam(f({ origem: new Set(['Rua']), status: new Set(['lead']) })).length;
ok(toque === n.status.get('lead'), 'tocar "Lead" entrega o número que o chip mostrava');

// dono, etapa e última visita (28/09/2026)
ok(passam(f({ etapa: new Set(['Negociação']) })) === 'a', 'Etapa Negociação');
ok(passam(f({ etapa: new Set(['Negociação', 'Prospecção']) })) === 'ab', 'Etapa Negociação OU Prospecção');
ok(passam(f({ visita: new Set(['nunca']) })).length === itens.length, 'sem visita registrada = nunca visitado');
{
  const agora = Date.parse('2026-09-28T12:00:00Z');
  ok(visitaDoFiltro(L({ id: 'v1', visited_at: '2026-09-25T12:00:00Z' }), agora) === 'semana', 'visitado há 3 dias = semana');
  ok(visitaDoFiltro(L({ id: 'v2', visited_at: '2026-09-10T12:00:00Z' }), agora) === 'mes', 'há 18 dias = 8 a 30');
  ok(visitaDoFiltro(L({ id: 'v3', visited_at: '2026-07-01T12:00:00Z' }), agora) === 'mais', 'há 3 meses = mais de 30');
}
ok(quantosFiltros(f({ etapa: new Set(['Visita']), dono: new Set(['meu']) })) === 2, 'Filtros · N conta os grupos novos');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nlentes e filtros: tudo certo');
