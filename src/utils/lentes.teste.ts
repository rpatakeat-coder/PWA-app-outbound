// Teste das lentes e filtros do mapa novo.
//
// Rode com:  npx tsx src/utils/lentes.teste.ts
//
// Protege: "Meu dia" mostrando lead do colega; o plano de hoje virando ponto;
// Reconquista sem os ex-clientes; filtro de dois grupos somando em vez de
// cruzar; e a contagem do chip prometendo um número que o toque não entrega.
import type { Client } from '../types/client';
import { classificarPino, type ContextoPino } from './pinoP2';
import { contarChips, FILTROS_VAZIOS, noFoco, passaNosFiltros, quantosFiltros, type FiltrosNovos } from './lentes';

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
};
const L = (x: Partial<Client>): Client => ({
  id: 'x', nome: 'x', empresa: null, status: 'lead', etapa: 'Prospecção', vendedor_id_hubspot: '1', id_hubspot: null,
  conta_alvo_place_id: null, geo_approximate: false, visited_at: null, origem_lead: 'hubspot', ...x,
} as unknown as Client);
const P = (x: Partial<Client>) => classificarPino(L(x), ctx);

// lentes
ok(noFoco('dia', P({ etapa: 'Negociação' }), null), 'Meu dia: meu quente');
ok(noFoco('dia', P({ etapa: 'Demo/Proposta' }), null), 'Meu dia: meu morno');
ok(!noFoco('dia', P({ etapa: 'Prospecção' }), null), 'Meu dia: meu frio sem cobrança vira ponto');
ok(noFoco('dia', P({ etapa: 'Prospecção', id_hubspot: 'sla' }), null), 'Meu dia: cobrança vencida');
ok(noFoco('dia', P({ status: 'cliente' }), null), 'Meu dia: meu cliente');
ok(!noFoco('dia', P({ etapa: 'Negociação', vendedor_id_hubspot: '2' }), null), 'Meu dia: quente do colega vira ponto');
ok(noFoco('dia', P({ etapa: 'Prospecção', vendedor_id_hubspot: '2' }), 3), 'Meu dia: parada do plano sempre inteira');
ok(noFoco('carteira', P({ etapa: 'Prospecção' }), null) && !noFoco('carteira', P({ vendedor_id_hubspot: '2' }), null), 'Carteira: só o que é meu');
ok(noFoco('alvo', P({ conta_alvo_place_id: 'a' }), null) && !noFoco('alvo', P({}), null), 'Contas-alvo: só conta-alvo');
ok(noFoco('rec', P({ status: 'churn' }), null) && !noFoco('rec', P({ status: 'cliente' }), null), 'Reconquista: só ex-cliente');
ok(noFoco('semdono', P({ vendedor_id_hubspot: '777' }), null) && !noFoco('semdono', P({}), null), 'Sem dono: dono fora do time');
ok(!noFoco('calor', P({ etapa: 'Negociação' }), 1), 'Calor: nenhum pino');

// filtros
const itens = [
  { c: L({ id: 'a', etapa: 'Negociação', origem_lead: 'cadastro_na_rua' }) },
  { c: L({ id: 'b', etapa: 'Prospecção', origem_lead: 'casa_dos_dados' }) },
  { c: L({ id: 'c', status: 'cliente', etapa: null, origem_lead: 'cadastro_na_rua' }) },
  { c: L({ id: 'd', status: 'churn', origem_lead: null }) },
  { c: L({ id: 'e', conta_alvo_place_id: 'x', origem_lead: 'google_maps_motor' }) },
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

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nlentes e filtros: tudo certo');
