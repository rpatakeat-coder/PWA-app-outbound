// Teste da mensagem das 18h (negócios sem próximo passo no grupo do Field Sales).
//
// Rode com:  node scripts/testar-avisos-sem-passo.cjs
//
// Protege: o quente (nota 70+) sem passo sumindo no meio da lista; o quente aparecendo duas vezes;
// negócio com tarefa futura ou no Planejamento sendo cobrado; e o "ZZ TESTE" indo para o grupo.
const { montarMensagens } = require('../api/avisos-sem-passo.js');

let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

const hoje = '2026-10-16';
const time = { '1': { nome: 'Ana Lima', primeiro: 'Ana' }, '2': { nome: 'Bia Rocha', primeiro: 'Bia' } };
const neg = (id, ownerId, name, temp, extra) => Object.assign({ id, ownerId, name, temp, dias: 3, tarefas: [] }, extra || {});
const funilLeads = {
  '1395880472': [
    neg('10', '1', 'Cantina Sol', 82, { mrr: 400, dias: 9, tarefas: [{ timestamp: '2026-10-13T12:00:00Z' }, { timestamp: '2026-10-08T12:00:00Z' }] }), // quente, passo venceu 13/10
    neg('11', '2', 'Bar do Porto', 75, { tarefas: [{ timestamp: '2026-10-20T12:00:00Z' }] }), // quente, COM passo
    neg('12', '2', 'Pizza Norte', 64),                                                        // Negociação morna
  ],
  '1395880471': [neg('20', '2', 'Café Azul', 71, { mrr: 300 })],                              // quente em Demo
  '1395880470': [neg('30', '1', 'Lanche Bom', 50)],
  '1396005401': [neg('40', '1', 'Padaria Sul', 40, { tarefas: [{ timestamp: '2026-10-14T21:00:00Z' }] }), neg('41', '1', 'ZZ TESTE grupo', 90), neg('42', '2', 'Bar Novo', 30)],
};
const planos = [{ data_segunda: '2026-10-12', grade: [null, null, null, null, [{ id: 'c-30' }], null, null] }];

const [m] = montarMensagens({ funilLeads, time, planos, paradas: [], hoje });
const t = m ? m.texto : '';
console.log('\n' + t + '\n');

const iQ = t.indexOf('Quentes sem próximo passo');
ok(iQ > -1 && iQ < t.indexOf('*Ana Lima'), 'o bloco dos quentes vem no topo, antes dos executivos');
ok(/Quentes sem próximo passo \(2\)/.test(t), 'conta 2 quentes sem passo (Cantina Sol e Café Azul)');
ok(t.indexOf('Cantina Sol') < t.indexOf('Café Azul'), 'Negociação antes de Demo');
ok((t.match(/Cantina Sol/g) || []).length === 1, 'o quente não se repete no bloco do executivo');
ok(/Cantina Sol\* ⏰13\/10 · Ana · Negociação, R\$ 400 \(9 dias parado\)/.test(t), 'a linha do quente diz dono, etapa, MRR e dias parado');
ok(!/Bar do Porto/.test(t), 'quente com tarefa futura não é cobrado');
ok(!/Lanche Bom/.test(t), 'negócio no Planejamento de hoje em diante não é cobrado');
ok(!/ZZ TESTE/.test(t), 'teste não vai ao grupo');
ok(/Pizza Norte/.test(t) && !/🔥[^\n]*Pizza Norte/.test(t), 'Negociação abaixo de 70 fica no bloco do executivo, sem 🔥');
ok(/\*Ana Lima \(2, 1 quente acima\)\*/.test(t), 'o cabeçalho do executivo conta o total e avisa o quente que está acima');
// os vencidos (16/10/26): "venceu" ≠ "nunca teve"
ok(/Cantina Sol\* ⏰13\/10 · Ana/.test(t), 'o quente vencido leva ⏰ e a data mais recente que venceu (13/10, não 08/10)');
ok(/\*Visita:\* Padaria Sul ⏰14\/10/.test(t), 'o negócio da lista leva ⏰ e a data');
ok(/\*Ana Lima[^\n]*\n⏰ 2 venceram sem ser feitos/.test(t), 'o executivo tem a contagem dos que venceram logo abaixo do nome');
ok(/Bar Novo/.test(t) && !/Bar Novo ⏰/.test(t) && !/\*Bia Rocha[^\n]*\n⏰/.test(t), 'quem nunca teve passo não leva ⏰, e quem não tem vencido não ganha a linha');
ok(/Outro dia" aceita qualquer data/.test(t), 'o rodapé diz que retorno longe também é passo');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\navisos das 18h: tudo certo');
