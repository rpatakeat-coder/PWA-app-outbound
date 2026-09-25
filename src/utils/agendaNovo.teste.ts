// Teste da aba Agenda (mapa novo): faixa de dias úteis, próxima parada, compromissos.
//
// Rode com:  npx tsx src/utils/agendaNovo.teste.ts
import { compromissosDoDia, diasDaFaixa, estadoDasParadas, rotuloDoDia } from './agendaNovo';

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

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nagenda: tudo certo');
