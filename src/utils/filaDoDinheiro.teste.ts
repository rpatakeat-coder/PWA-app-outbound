// Teste da fila do dinheiro (docs/10 §1). Roda: npx tsx src/utils/filaDoDinheiro.teste.ts
import {
  diasUteisEntre, feriadosNacionais, montarFila, montarProximos, pessoaDoCard, oQuePulou, proximoDiaUtil, textoUltimoContato, tipoDaTarefa, tituloDoCard,
  type Contexto, type NegocioEntrada, type TarefaEntrada,
} from '../../supabase/functions/_compartilhado/filaDoDinheiro';
import { dataDoChip, diaCurto, diasSugeridos, fraseDaVolta, notaDaFila, pedidoDaVolta, textoDoSalvar } from './registroDaFila';

let falhas = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log('OK   ', msg); else { falhas++; console.log('FALHA', msg); } };

const hoje = '2026-10-22'; // quinta (data do protótipo)
const fer = feriadosNacionais(2026);
const ctx = (x: Partial<Contexto> = {}): Contexto => ({
  hoje, feriados: fer, contatos: {}, decisorAlcancado: [], visitaHojeSemRegistro: {}, agendaHoje: {}, ...x,
});
const N = (x: Partial<NegocioEntrada>): NegocioEntrada => ({
  dealId: 'd1', nome: 'Cantina Dona Ana', etapaId: '1395880471', mrr: 429, temperatura: 78, diasNaEtapa: 1,
  pessoa: 'Ana', papel: 'Sócia', temTelefone: true, clientId: 'c1', lat: null, lng: null, ...x,
});
const T = (x: Partial<TarefaEntrada>): TarefaEntrada => ({ id: 't1', dealId: 'd1', assunto: 'Ligar - retorno', venceEm: null, ...x });

// 1 · um card por negócio
{
  const f = montarFila([N({})], [
    T({ id: 'a', venceEm: '2026-10-21T15:00:00Z' }),
    T({ id: 'b', venceEm: '2026-10-22T17:00:00Z' }),
    T({ id: 'c', venceEm: '2026-10-28T15:00:00Z' }),
  ], ctx({ contatos: { d1: { n: 3, ultimo: '2026-10-16T13:00:00Z' } } }));
  ok(f.length === 1, 'o mesmo negócio com 3 tarefas abertas aparece 1 vez');
  // 19/10/26: com passo de hoje, a vencida de ontem não faz o negócio "atrasado" (era a tarefa 'a')
  ok(f[0].tarefaId === 'b' && f[0].motivo === 'vence_hoje' && !f[0].venceu, 'comanda o passo de hoje, não a vencida antiga');
  ok(f[0].porque.startsWith('Follow-up de hoje'), 'o porquê vem do mapa do servidor');
  ok(tituloDoCard(f[0]) === 'Ligar para Ana (sócia)', 'título: verbo + pessoa (papel)');
  ok(f[0].contatos === 3 && textoUltimoContato(f[0].ultimoContato, hoje) === 'contato há 6 dias', 'contatos e último contato');
}
// 2 · os grupos e a ordem
{
  const negs = [
    N({ dealId: 'q', nome: 'Bistrô Ipiranga', etapaId: '1395880472', temperatura: 81, mrr: 600 }),          // quente sem passo
    N({ dealId: 'v', nome: 'Yakisoba', mrr: 300, temperatura: 50 }),                                       // vence hoje
    N({ dealId: 'p', nome: 'Proposta Velha', etapaId: '1395880471', temperatura: 60, diasNaEtapa: 6 }),   // proposta sem retorno
    N({ dealId: 'z', nome: 'Zé Bar', etapaId: '1396005401', temperatura: 30 }),                           // decisor
    N({ dealId: 'r', nome: 'Rei do Pastel', etapaId: '1395880472', temperatura: 40 }),                    // parado
    N({ dealId: 'f', nome: 'Futuro', etapaId: '1395880472', temperatura: 90 }),                           // passo marcado depois → fora
    N({ dealId: 'g', nome: 'Ganho', etapaId: '1396006162' }),                                             // fechado → fora
  ];
  const f = montarFila(negs, [
    T({ id: 'tv', dealId: 'v', assunto: 'WhatsApp - proposta', venceEm: '2026-10-22T17:00:00Z' }),
    T({ id: 'tf', dealId: 'f', venceEm: '2026-10-27T13:00:00Z' }),
  ], ctx({ contatos: { r: { n: 5, ultimo: '2026-10-01T13:00:00Z' }, z: { n: 1, ultimo: '2026-10-20T13:00:00Z' }, q: { n: 4, ultimo: '2026-10-21T13:00:00Z' }, p: { n: 4, ultimo: '2026-10-19T13:00:00Z' } } }));
  const ids = f.map((x) => x.dealId).join(',');
  ok(ids === 'v,q,p,z,r', `ordem por grupo e valor × urgência (${ids})`);
  ok(f.find((x) => x.dealId === 'v')?.verbo === 'WhatsApp' && f.find((x) => x.dealId === 'v')?.prazoTexto === 'vence hoje 14h', 'WhatsApp e "vence hoje 14h"');
  ok(f.find((x) => x.dealId === 'p')?.porque === 'Proposta enviada há 6 dias, sem retorno', 'proposta sem retorno');
  ok(f.find((x) => x.dealId === 'r')?.porque === 'Sem contato há 21 dias' && f.find((x) => x.dealId === 'r')?.grupo === 'reativar', 'parado há 21 dias vai para Reativar');
  ok(!f.some((x) => x.dealId === 'f'), 'negócio com próximo passo marcado para depois não entra');
  ok(!f.some((x) => x.dealId === 'g'), 'negócio fechado não entra');
}
// 3 · casos do card
{
  const semFone = montarFila([N({ temTelefone: false })], [T({ venceEm: '2026-10-21T15:00:00Z' })], ctx())[0];
  ok(semFone.verbo === 'Visitar', 'sem telefone no CRM o verbo vira Visitar');
  const visita = montarFila([N({})], [], ctx({ visitaHojeSemRegistro: { d1: '10h' }, agendaHoje: { d1: '10h' } }))[0];
  ok(visita.verbo === 'Registrar' && visita.porque === 'Visita das 10h ainda sem registro' && visita.agendaHoje === '10h', 'visita de hoje sem registro → Registrar, com selo da agenda');
  const v = montarFila([N({})], [T({ assunto: 'Visita - Cantina', venceEm: '2026-10-21T15:00:00Z' })], ctx())[0];
  ok(v.presencial && v.verbo === 'Visitar', 'tarefa de visita é presencial (o registro não conclui)');
  ok(tipoDaTarefa({ assunto: 'Cobrança Asaas' }) === 'cobranca', 'cobrança reconhecida pelo assunto');
}
// 4 · dias úteis e feriados
ok(proximoDiaUtil('2026-10-23', 1, fer) === '2026-10-26', 'sexta + 1 dia útil = segunda');
ok(proximoDiaUtil('2026-10-22', 3, fer) === '2026-10-27', 'quinta + 3 dias úteis = terça (pula o fim de semana)');
ok(proximoDiaUtil('2026-10-30', 1, fer) === '2026-11-03', 'sexta 30/10 + 1 = terça 03/11 (pula o feriado de 02/11)');
ok(oQuePulou('2026-10-30', '2026-11-03', fer) === 'pula o feriado de 02/11', 'diz qual feriado pulou');
ok(oQuePulou('2026-10-22', '2026-10-27', fer) === 'pula o fim de semana', 'diz que pulou o fim de semana');
ok(oQuePulou('2026-10-22', '2026-10-23', fer) === 'em dia útil', 'dia útil seguido');
ok(diasUteisEntre('2026-10-16', '2026-10-22', fer) === 4, 'dias úteis entre sexta e quinta = 4');
ok(fer.includes('2026-04-03') && fer.includes('2026-02-17') && fer.includes('2026-06-04'), 'Sexta Santa, Carnaval e Corpus Christi de 2026');

// 5 · o registro em 3 toques
{
  ok(diasSugeridos('pediu_retorno') === 3 && diasSugeridos('nao_atendeu') === 1 && diasSugeridos('decisor') === 2 && diasSugeridos('sem_interesse') === null,
    'sugestão do próximo passo: pediu retorno 3, não atendeu 1, decisor 2, sem interesse nenhum');
  const volta = dataDoChip(hoje, 3, fer);
  const f = fraseDaVolta(hoje, volta, fer);
  ok(f.frase === 'Volta em 27/10 (terça)' && f.pulo === 'pula o fim de semana', 'pediu retorno numa quinta: "Volta em 27/10 (terça)" + pula o fim de semana');
  ok(diaCurto(volta) === 'ter 27/10', 'dia curto da barra: "ter 27/10"');
  ok(textoDoSalvar({ comoFoi: null, volta: null, outroDia: false, motivo: null, detalhe: '' }).texto === 'Marque como foi', 'Salvar sem nada: "Marque como foi"');
  ok(textoDoSalvar({ comoFoi: 'decisor', volta: null, outroDia: true, motivo: null, detalhe: '' }).texto === 'Escolha o dia', 'Outro dia sem data: "Escolha o dia"');
  ok(textoDoSalvar({ comoFoi: 'sem_interesse', volta: null, outroDia: false, motivo: null, detalhe: '' }).texto === 'Escolha o motivo', 'sem interesse sem motivo: "Escolha o motivo"');
  ok(!textoDoSalvar({ comoFoi: 'sem_interesse', volta: null, outroDia: false, motivo: 'Outros', detalhe: ' ' }).pode, '"Outros" exige o texto');
  // 14/10/26: a mesma regra das outras telas — Funcionalidade também exige; Sem retorno não
  ok(textoDoSalvar({ comoFoi: 'sem_interesse', volta: null, outroDia: false, motivo: 'Funcionalidade', detalhe: '' }).texto === 'Escreva o que pesou', '"Funcionalidade" exige o texto');
  ok(textoDoSalvar({ comoFoi: 'sem_interesse', volta: null, outroDia: false, motivo: 'Sem retorno', detalhe: '' }).pode, '"Sem retorno": o texto é opcional');
  ok(textoDoSalvar({ comoFoi: 'pediu_retorno', volta, outroDia: false, motivo: null, detalhe: '' }).pode, 'com como foi e dia, salva');
  const nota = notaDaFila({ canal: 'ligacao', comoFoi: 'pediu_retorno', volta, assunto: 'Ligar - retorno' });
  ok(nota.startsWith('Ligação · Pediu retorno · Próximo: ligar em 27/10'), 'nota no negócio no formato da Agenda');
  const p = pedidoDaVolta({ dealId: 'd1', volta, pessoa: 'Ana', canal: 'ligacao' });
  ok(p.op === 'nota' && p.tipoAcao === 'proximo-passo' && p.data === '2026-10-27' && p.texto === 'Ligar Ana', 'próximo passo pela porta única, na data escolhida');
}

// A2 (handoff das abas, 04/10/26): o contato só vira título quando é confiável
ok(pessoaDoCard('Julyan', 'Julyan House', 'Julyan Ribeiro', null).pessoa === null && pessoaDoCard('Julyan', 'Julyan House', 'Julyan Ribeiro', null).porque === 'contato no CRM: "Julyan" · igual ao dono da conta', 'A2: contato = dono da conta → usa o negócio e diz por quê');
ok(pessoaDoCard('Teste', 'Teste', 'Bruno', null).porque?.endsWith('igual ao negócio'), 'A2: contato = negócio');
ok(pessoaDoCard('.', 'Bar do Zé', 'Bruno', null).pessoa === null && pessoaDoCard('.', 'Bar do Zé', 'Bruno', null).porque?.endsWith('sem nome'), 'A2: "." não é nome');
ok(pessoaDoCard('Ana Paula', 'Cantina', 'Bruno', null).pessoa === 'Ana' && pessoaDoCard('Ana Paula', 'Cantina', 'Bruno', null).porque === 'contato: Ana', 'A2: sem papel guarda a pessoa só como linha de apoio');
ok(pessoaDoCard('Ana', 'Cantina', 'Bruno', 'Sócia').porque === null, 'A2: com papel é confiável');
ok(pessoaDoCard(null, 'Cantina', 'Bruno', null).porque === null, 'A2: sem contato não explica nada');
ok(tituloDoCard({ verbo: 'Visitar', pessoa: 'Ana', papel: null, negocio: 'Cantina' }) === 'Visitar Cantina', 'A2: sem papel o título usa o negócio');

// O PRÓXIMO PASSO É O QUE CONTA (19/10/26, o caso do print: visita velha de 26/09 aberta + follow-up de 27/10)
{
  const velha = T({ id: 'tv', assunto: 'Visita - Visita', venceEm: '2026-09-26T12:00:00Z' });
  const futura = T({ id: 'tf', assunto: 'Follow-up - ligar', venceEm: '2026-10-27T14:00:00Z' });
  ok(montarFila([N({})], [velha, futura], ctx()).length === 0, 'vencida velha + passo futuro: não é atrasado nem sem passo (sai da fila)');
  const deHoje = T({ id: 'th', assunto: 'Ligar - hoje', venceEm: '2026-10-22T15:00:00Z' });
  const f2 = montarFila([N({})], [velha, deHoje], ctx())[0];
  ok(f2?.motivo === 'vence_hoje' && f2.tarefaId === 'th', 'vencida velha + tarefa de hoje: é de hoje, pela tarefa de hoje');
  const outraVencida = T({ id: 'tr', assunto: 'Ligar - recente', venceEm: '2026-10-20T15:00:00Z' });
  const f3 = montarFila([N({})], [velha, outraVencida], ctx())[0];
  ok(f3?.motivo === 'venceu' && f3.tarefaId === 'tr' && f3.prazo === '2026-10-20', 'só vencidas: vale a mais recente (o último passo combinado)');
  ok(montarFila([N({})], [velha], ctx({ passoFuturo: ['d1'] })).length === 0, 'vencida + negócio no plano futuro (rota/Planejamento/reunião): sai da fila');
  const f5 = montarFila([N({})], [velha], ctx({ agendaHoje: { d1: 'hoje' } }))[0];
  ok(f5?.motivo === 'vence_hoje' && f5.prazo === hoje && !f5.venceu, 'vencida + no plano de hoje: é trabalho de hoje, não atraso');
  ok(montarFila([N({ temperatura: 80 })], [], ctx({ passoFuturo: ['d1'] })).length === 0, 'quente sem tarefa mas no plano futuro: não é "sem próximo passo"');
}

// 20/10/26 · os próximos dias (Tarefas por dia): a próxima tarefa futura de quem não está na fila de hoje
{
  const negs = [N({ dealId: 'a', nome: 'Amanhã' }), N({ dealId: 'b', nome: 'Hoje' }), N({ dealId: 'c', nome: 'Sexta', mrr: 900 }), N({ dealId: 'd', nome: 'Ganho', etapaId: '1396006162' }), N({ dealId: 'e', nome: 'Sexta cedo', mrr: 100 })];
  const ts = [
    T({ id: 'ta', dealId: 'a', venceEm: '2026-10-23T12:00:00Z' }), T({ id: 'ta2', dealId: 'a', venceEm: '2026-10-30T12:00:00Z' }),
    T({ id: 'tb', dealId: 'b', venceEm: '2026-10-22T15:00:00Z' }), T({ id: 'tb2', dealId: 'b', venceEm: '2026-10-26T15:00:00Z' }),
    T({ id: 'tc', dealId: 'c', venceEm: '2026-10-23T18:00:00Z', assunto: 'WhatsApp - confirmar' }),
    T({ id: 'td', dealId: 'd', venceEm: '2026-10-23T12:00:00Z' }), T({ id: 'te', dealId: 'e', venceEm: '2026-10-23T11:00:00Z' }),
  ];
  const p = montarProximos(negs, ts, { hoje }, new Set(['x']));
  ok(!p.some((x) => x.dealId === 'b'), 'negócio com tarefa hoje não entra nos próximos dias (está na fila de hoje)');
  ok(!p.some((x) => x.dealId === 'd'), 'negócio fechado não entra');
  ok(p.filter((x) => x.dealId === 'a').length === 1 && p.find((x) => x.dealId === 'a')!.tarefaId === 'ta', 'um cartão por negócio: a próxima tarefa futura');
  ok(p.map((x) => x.dealId).join(',') === 'e,a,c', 'ordem: dia, depois o horário da tarefa');
  ok(p.find((x) => x.dealId === 'c')!.verbo === 'WhatsApp', 'o verbo segue a tarefa (WhatsApp)');
  ok(montarProximos(negs, ts, { hoje }, new Set(['a'])).every((x) => x.dealId !== 'a'), 'quem já está na fila de hoje fica fora');
}

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nfila do dinheiro: tudo certo');
