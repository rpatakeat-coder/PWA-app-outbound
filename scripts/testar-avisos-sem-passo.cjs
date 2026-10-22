// Teste da mensagem das 18h (quentes sem próximo passo no grupo do Field Sales).
//
// Rode com:  node scripts/testar-avisos-sem-passo.cjs
//
// Protege: só quente vai para o grupo (Decisor em diante); negócio com tarefa futura ou no
// Planejamento não é cobrado; "ZZ TESTE" não vai ao grupo; o placar de ontem → hoje conta quem
// resolveu e não zera quando a rota roda de novo no mesmo dia.
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
    neg('12', '2', 'Pizza Norte', 64),                                                        // Negociação, nunca teve passo
  ],
  '1395880471': [neg('20', '2', 'Café Azul', 71, { mrr: 300 })],                              // quente em Demo
  '1395880470': [neg('30', '1', 'Lanche Bom', 50), neg('31', '2', 'Grill Leste', 30)],             // Decisor: quente pela etapa
  '1396005401': [neg('40', '1', 'Padaria Sul', 40, { tarefas: [{ timestamp: '2026-10-14T21:00:00Z' }] }), neg('41', '1', 'ZZ TESTE grupo', 90), neg('42', '2', 'Bar Novo', 30)],
};
const planos = [{ data_segunda: '2026-10-12', grade: [null, null, null, null, [{ id: 'c-30' }], null, null] }];

const [m] = montarMensagens({ funilLeads, time, planos, paradas: [], hoje });
const t = m ? m.texto : '';
console.log('\n' + t + '\n');

ok(/^🔥 \*Quentes sem próximo passo · 16\/10\*/.test(t), 'o título é dos quentes, com a data');
ok(/^4 negócios · R\$ 700\/mês parados\. Marque o próximo passo hoje\.$/m.test(t), 'conta 4 quentes (Cantina Sol, Pizza Norte, Café Azul, Grill Leste) e soma o MRR parado');
ok(!/Padaria Sul|Bar Novo/.test(t), 'Visita não vai mais para a mensagem');
ok(!/Bar do Porto/.test(t), 'quente com tarefa futura não é cobrado');
ok(!/Lanche Bom/.test(t), 'negócio no Planejamento de hoje em diante não é cobrado');
ok(!/ZZ TESTE/.test(t), 'teste não vai ao grupo');
ok(t.indexOf('*Bia (3)*') > -1 && t.indexOf('*Bia (3)*') < t.indexOf('*Ana (1)*'), 'um bloco por pessoa, de quem tem mais para quem tem menos');
ok(/\*Ana \(1\)\*\n• Cantina Sol · Negociação R\$ 400 · venceu 13\/10/.test(t), 'a linha diz etapa, MRR e a data mais recente que venceu (13/10, não 08/10)');
ok(t.indexOf('Pizza Norte') < t.indexOf('Café Azul') && t.indexOf('Café Azul') < t.indexOf('Grill Leste'), 'dentro do bloco: Negociação, Demo, Decisor');
ok(/• Pizza Norte · Negociação$/m.test(t), 'quem nunca teve passo não leva "venceu"');
ok(/fieldtakeat\.vercel\.app/.test(t), 'o rodapé leva o endereço do app');
ok(!/eram/.test(t), 'sem lista de ontem não há placar');
ok(m.estado && m.estado.dia === hoje && m.estado.porDono['2'].length === 3, 'devolve a lista de hoje para gravar');

// o placar: ontem a Ana tinha 2 (um saiu) e a Bia 3 (os mesmos)
{
  const ontem = { dia: '2026-10-15', porDono: { '1': ['10', '99'], '2': ['12', '20', '31'] } };
  const [m2] = montarMensagens({ funilLeads, time, planos, paradas: [], hoje, ontem });
  ok(/^Ontem eram 5 → hoje 4\. Resolveram: Ana 1 ✅$/m.test(m2.texto), 'o placar conta quem saiu da lista desde ontem');
  // rodou de novo no mesmo dia: a base continua a de ontem
  const [m3] = montarMensagens({ funilLeads, time, planos, paradas: [], hoje, ontem: m2.estado });
  ok(/^Ontem eram 5 → hoje 4\. Resolveram: Ana 1 ✅$/m.test(m3.texto), 'rodar de novo no mesmo dia não zera o placar');
  const [m4] = montarMensagens({ funilLeads, time, planos, paradas: [], hoje, ontem: { dia: '2026-10-15', porDono: { '2': ['12', '20', '31'] } } });
  ok(/Ninguém resolveu nenhum\./.test(m4.texto), 'ninguém resolveu: o placar diz isso');
}

// zerou: manda o parabéns com o placar; sem nada para cobrar e sem ontem, não manda
{
  const vazio = { '1395880472': [neg('11', '2', 'Bar do Porto', 75, { tarefas: [{ timestamp: '2026-10-20T12:00:00Z' }] })] };
  const [z] = montarMensagens({ funilLeads: vazio, time, planos, paradas: [], hoje, ontem: { dia: '2026-10-15', porDono: { '2': ['11'] } } });
  ok(z && /Nenhum quente sem próximo passo/.test(z.texto) && /Resolveram: Bia 1 ✅/.test(z.texto), 'zerou: manda o parabéns e o placar');
  ok(montarMensagens({ funilLeads: vazio, time, planos, paradas: [], hoje }).length === 0, 'nada a cobrar e sem ontem: não manda nada');
}

// 19/10/26: visita já FEITA hoje fica na grade (feito: true), mas não é próximo passo
{
  const p2 = [{ data_segunda: '2026-10-12', grade: [null, null, null, null, [{ id: 'c-30', feito: true, fora: true }], null, null] }];
  const [m2] = montarMensagens({ funilLeads, time, planos: p2, paradas: [], hoje });
  ok(/Lanche Bom/.test(m2 ? m2.texto : ''), 'visita feita hoje na grade não tira o negócio da lista');
}

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\navisos das 18h: tudo certo');
