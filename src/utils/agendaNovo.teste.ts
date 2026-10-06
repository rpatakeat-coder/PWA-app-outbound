// Teste da aba Agenda (mapa novo): faixa de dias úteis, próxima parada, compromissos.
//
// Rode com:  npx tsx src/utils/agendaNovo.teste.ts
import { compromissosDoDia, diasDaFaixa, estadoDasParadas, paradaParaCasar, rotuloDoDia, seloDoCompromisso, separarCompromissos, tituloUtil } from './agendaNovo';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

// Sexta 25/09/2026, 22h em Brasília (sábado em UTC).
const agora = new Date('2026-09-26T01:00:00Z');
const dias = diasDaFaixa(agora);
ok(dias.join() === '2026-09-25,2026-09-28,2026-09-29,2026-09-30,2026-10-01,2026-10-02', 'hoje (sexta, pelo dia de Brasília) + 5 dias úteis, pulando o fim de semana');
ok(rotuloDoDia('2026-09-25', '2026-09-25').semana === 'hoje' && rotuloDoDia('2026-09-28', '2026-09-25').semana === 'seg', 'rótulos "hoje" e "seg"');

const P = (id: string, status: string, visitadoHoje = false) => ({ id, status, visitadoHoje });
const e = estadoDasParadas([P('a', 'done'), P('b', 'planned', true), P('c', 'removed'), P('d', 'planned'), P('e', 'planned')]);
ok(e.map((x) => `${x.id}:${x.estado}`).join() === 'a:feito,b:feito,d:proxima,e:pendente', 'check-in fora da rota conta como feito; removida some; a primeira não feita é a próxima');
ok(estadoDasParadas([P('a', 'done')]).every((x) => x.estado === 'feito'), 'tudo feito: nenhuma "próxima"');

const tarefas = [
  { id: '1', assunto: 'Visita - Kadô', venceEm: '2026-09-25T18:15:00Z', tipo: 'visita' as const, clientId: 'c1', nomeDoCliente: 'Kadô' },
  { id: '2', assunto: 'Follow-up - Ligar', venceEm: '2026-09-25T12:00:00Z', tipo: 'follow_up' as const, clientId: 'c2', nomeDoCliente: 'Zé' },
  { id: '3', assunto: 'Visita - Plano', venceEm: '2026-09-25T13:00:00Z', tipo: 'visita' as const, clientId: 'c3', nomeDoCliente: 'Plano' },
  { id: '4', assunto: 'Reunião de demo', venceEm: '2026-09-28T14:00:00Z', tipo: 'outro' as const, clientId: 'c4', nomeDoCliente: 'Demo' },
];
const reunioes = [{ id: 'm1', client_id: 'c5', scheduled_at: '2026-09-25T16:00:00Z', type: 'reuniao', status: 'agendada' }];
const hoje = compromissosDoDia('2026-09-25', tarefas, reunioes, (id) => (id === 'c5' ? 'Bar' : null), new Set(['c3']));
ok(hoje.map((x) => `${x.hora} ${x.tipo} ${x.nome}`).join(' | ') === '09:00 retorno Zé | 13:00 reunião Bar | 15:15 visita Kadô',
  'pela hora de Brasília; visita do Planejamento de quem já é parada não repete; reunião do app entra');
ok(compromissosDoDia('2026-09-28', tarefas, reunioes, () => null)[0]?.tipo === 'reunião', 'segunda: a reunião de demo cai no dia dela');
ok(compromissosDoDia('2026-09-29', tarefas, reunioes, () => null).length === 0, 'dia sem nada: vazio');

ok(tituloUtil('Visita - Alemão pizzas', 'visita', 'Alemão Pizzas') === null, '"Visita - Alemão pizzas" não repete o nome na linha');
ok(tituloUtil('Follow-up - Identificar o nome do decisor', 'retorno', 'Ferro Xis') === 'Follow-up - Identificar o nome do decisor', 'assunto com a ação fica');


// ── UM PLANO SÓ (06/10/26): a Agenda nunca mostra a mesma coisa duas vezes ──────────────
{
  const dia = '2026-10-07';
  const paradas = [
    paradaParaCasar({ client_id: 'c-mada-cliente', client: { id_hubspot: null, empresa: 'Mada Restaurante e lanches', nome: 'Mada', bairro: 'Bom Fim' } }),
    paradaParaCasar({ client_id: 'c-armazem', client: { id_hubspot: '777', empresa: 'Armazém da Redenção', nome: 'x', bairro: 'Farroupilha' } }),
  ];
  const tarefas = [
    // follow-up do Armazém ligado ao NEGÓCIO, sem cadastro
    { id: 't1', assunto: 'Follow up - Armazém', venceEm: '2026-10-07T17:00:00Z', tipo: 'follow_up' as const, clientId: null, nomeDoCliente: 'Armazém', dealId: '777' },
    // tarefa de cobrança que não é parada: fora do plano
    { id: 't2', assunto: 'Cobrar pagamento - Purple', venceEm: '2026-10-07T18:30:00Z', tipo: 'outro' as const, clientId: 'c-purple', nomeDoCliente: 'Purple Drinkeria', dealId: '888' },
    // visita do Planejamento para quem já é parada: é a própria parada
    { id: 't3', assunto: 'Visita - Mada', venceEm: '2026-10-07T12:00:00Z', tipo: 'visita' as const, clientId: 'c-mada-cliente', nomeDoCliente: 'Mada', dealId: null },
  ];
  const reunioes = [
    // reunião do Mada no OUTRO cadastro (lead): casa pelo nome
    { id: 'r1', client_id: 'c-mada-lead', scheduled_at: '2026-10-07T18:00:00Z', type: 'reuniao', status: 'agendada', acao: 'demo' },
    // ligação: nunca vira parada nem selo
    { id: 'r2', client_id: 'c-armazem', scheduled_at: '2026-10-07T12:00:00Z', type: 'follow_up', status: 'agendada', acao: 'ligar' },
    // cancelada sai
    { id: 'r3', client_id: 'c-armazem', scheduled_at: '2026-10-07T19:00:00Z', type: 'reuniao', status: 'cancelada', acao: 'reuniao' },
  ];
  const nomes: Record<string, string> = { 'c-mada-lead': 'Mada Restaurante e Lanches', 'c-armazem': 'Armazém da Redenção' };
  const ks = compromissosDoDia(dia, tarefas, reunioes, (id) => nomes[id] ?? null, paradas);
  const sep = separarCompromissos(ks);
  ok((sep.casados.get('c-mada-cliente') ?? []).map((k) => k.id).join() === 'app-r1', 'Mada: a reunião do outro cadastro vira selo na parada (uma vez só)');
  ok((sep.casados.get('c-armazem') ?? []).map((k) => k.id).join() === 'hs-t1', 'Armazém: o follow-up ligado ao negócio vira selo na parada');
  ok(!ks.some((k) => k.id === 'hs-t3'), 'a visita do Planejamento de quem já é parada não aparece de novo');
  ok(sep.ligacoes.map((k) => k.id).join() === 'app-r2' && sep.ligacoes[0].casado === null, 'Ligar fica nas Ligações do dia, sem casar com parada (sem posição de rota)');
  ok(sep.fora.map((k) => k.id).join() === 'hs-t2' && sep.fora[0].acao === 'cobrar', 'a cobrança do HubSpot fica em Fora do plano, com o chip Cobrar pagamento');
  ok(!ks.some((k) => k.id === 'app-r3'), 'o cancelado sai do plano');
  ok(seloDoCompromisso(sep.casados.get('c-mada-cliente')![0], 'c-mada-cliente') === 'Demo 15:00 · Agenda do app · mesmo restaurante, outro cadastro', 'o selo diz o quê, a hora, a origem e o porquê do casamento');
  ok(seloDoCompromisso(sep.casados.get('c-armazem')![0], 'c-armazem') === 'Follow-up 14:00 · HubSpot · ligado pelo negócio', 'o selo do Armazém');
  const total = sep.ligacoes.length + sep.fora.length + [...sep.casados.values()].reduce((n, l) => n + l.length, 0);
  ok(total === ks.length, 'cada compromisso aparece em exatamente um lugar');
  // linhas antigas de client_meetings (sem acao): reunião continua reunião, follow_up continua follow-up
  const antigos = compromissosDoDia(dia, [], [{ id: 'v1', client_id: 'z', scheduled_at: '2026-10-07T13:00:00Z', type: 'reuniao', status: 'agendada' }, { id: 'v2', client_id: 'z', scheduled_at: '2026-10-07T14:00:00Z', type: 'follow_up', status: 'agendada' }], () => 'Z', []);
  ok(antigos.map((k) => k.acao).join() === 'reuniao,follow', 'client_meetings antigas (sem acao) continuam lidas certo');
}

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nagenda: tudo certo');
