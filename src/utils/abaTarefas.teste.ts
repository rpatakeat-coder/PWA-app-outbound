// Teste da aba Tarefas (mapa novo): grupos por dia em Brasília, chips, selo.
//
// Rode com:  npx tsx src/utils/abaTarefas.teste.ts
import { acaoRapida, agrupar, chipsDaTarefa, grupoDaTarefa, seloDasTarefas } from './abaTarefas';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

// Sexta, 25/09/2026, 22h em Brasília = sábado 01h UTC. É a hora que pega quem
// usa toISOString: o "hoje" em UTC já é sábado.
const agora = new Date('2026-09-26T01:00:00Z');

ok(grupoDaTarefa('2026-09-25T12:00:00Z', agora) === 'hoje', '22h em Brasília: tarefa de sexta ainda é "hoje" (não atrasada pelo UTC)');
ok(grupoDaTarefa('2026-09-24T12:00:00Z', agora) === 'atrasadas', 'quinta = atrasada');
ok(grupoDaTarefa('2026-09-26T12:00:00Z', agora) === 'amanha', 'sábado = amanhã');
ok(grupoDaTarefa('2026-09-27T12:00:00Z', agora) === 'semana', 'domingo = esta semana');
ok(grupoDaTarefa('2026-09-28T12:00:00Z', agora) === 'depois', 'segunda seguinte = mais à frente, não some');
ok(grupoDaTarefa(null, agora) === 'hoje', 'sem data: prazo é hoje');
ok(grupoDaTarefa('2026-09-26T02:30:00Z', agora) === 'hoje', '23h30 de sexta em Brasília (sábado em UTC) = hoje');

const T = (assunto: string, venceEm: string | null, tipo: 'visita' | 'follow_up' | 'outro' = 'follow_up', origem: string | null = null) => ({ assunto, venceEm, tipo, origem });
const c1 = chipsDaTarefa(T('SLA Visita — Bar do Zé', '2026-09-24T12:00:00Z', 'outro'), agora);
ok(c1.tipo === 'Cobrança' && c1.origem === 'SLA estourado há 1 dia' && c1.alerta, 'cobrança atrasada: "SLA estourado há 1 dia"');
const c2 = chipsDaTarefa(T('Follow-up - Ligar', '2026-09-26T12:00:00Z', 'follow_up', 'ficha'), agora);
ok(c2.tipo === 'Ligação' && c2.origem === 'criada pela ficha de rua' && !c2.alerta, '"Ligar amanhã" da ficha: Ligação · criada pela ficha de rua');
ok(chipsDaTarefa(T('Visita - Kadô', '2026-09-25T15:00:00Z', 'visita', 'planejamento'), agora).origem === 'do Planejamento', 'visita do Planejamento');

ok(acaoRapida(T('Follow-up - Ligar', null)) === 'liguei', 'follow-up tem Liguei');
ok(acaoRapida(T('Visita - Kadô', null, 'visita')) === null, 'visita não tem Liguei (é Cheguei, no mapa)');
ok(acaoRapida(T('Reunião de demo', null, 'outro')) === null, 'reunião não tem Liguei');

const itens = [
  T('b', '2026-09-24T15:00:00Z'), T('a', '2026-09-24T12:00:00Z'), T('c', '2026-09-25T12:00:00Z'), T('d', '2026-09-26T12:00:00Z'),
];
const g = agrupar(itens, agora);
ok(g.map((x) => x.grupo.id).join() === 'atrasadas,hoje,amanha', 'grupo vazio não aparece, ordem do prompt');
ok(g[0].itens.map((x) => x.assunto).join() === 'a,b', 'dentro do grupo, pela hora');
ok(seloDasTarefas(itens, agora) === 3, 'selo = atrasadas + hoje, sem o futuro');
ok(seloDasTarefas([], agora) === 0, 'sem tarefa, selo 0 (a tela não desenha)');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\naba tarefas: tudo certo');
