// Teste dos toques do Cockpit no servidor. Roda: npx tsx src/utils/toquesDoCockpit.teste.ts
// A regra foi validada contra a função do próprio Cockpit em 246 de 246 negócios abertos (04/10/26);
// este teste guarda os casos que decidem a conta.
import { criarToques, itensDoApp } from '../../supabase/functions/_compartilhado/toquesDoCockpit.js';

let falhas = 0;
const ok = (c: unknown, m: string) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

const { toquesDoLead, normalizar } = criarToques({ reps: [{ name: 'Bruno Martins', ownerId: '1' }] });
const passado = '2026-09-20T15:00:00.000Z';
const futuro = '2099-01-01T15:00:00.000Z';
const lead = { id: 'D1', name: 'Bar do Zé', ownerId: '1', notas: [] as Array<{ texto: string; data: string }>, ultimaInteracao: null as string | null };

const itens = [
  { hs_object_id: 't1', hs_task_subject: 'Visita - Bar do Zé', hs_task_status: 'COMPLETED', hs_timestamp: passado, hubspot_owner_id: '1', lead_deal_id: 'D1' },
  { hs_object_id: 't2', hs_task_subject: 'Ligar - Bar do Zé', hs_task_status: 'NOT_STARTED', hs_timestamp: passado, hubspot_owner_id: '1', lead_deal_id: 'D1' },
  { hs_object_id: 't3', hs_task_subject: 'Follow-up - Bar do Zé', hs_task_status: 'COMPLETED', hs_timestamp: futuro, hubspot_owner_id: '1', lead_deal_id: 'D1' },
  { hs_object_id: 't4', hs_task_subject: 'Daily - time', hs_task_status: 'COMPLETED', hs_timestamp: passado, hubspot_owner_id: '1', lead_deal_id: 'D1' },
  { hs_object_id: 'm1', hs_meeting_title: 'Reunião - Bar do Zé', hs_meeting_start_time: passado, hs_meeting_outcome: 'COMPLETED', hubspot_owner_id: '1' },
  { hs_object_id: 't5', hs_task_subject: 'Visita - Outro Bar', hs_task_status: 'COMPLETED', hs_timestamp: passado, hubspot_owner_id: '1', lead_deal_id: 'D9' },
  { hs_object_id: 't6', hs_task_subject: 'Visita - Bar do Zé', hs_task_status: 'COMPLETED', hs_timestamp: passado, hubspot_owner_id: '2', lead_deal_id: 'D1' },
];
const ev = normalizar(itens);
ok(toquesDoLead(ev, lead).total === 2, 'conta tarefa concluída e reunião concluída que já passaram (pelo negócio ou pelo nome)');
ok(toquesDoLead(ev, { ...lead, notas: [{ texto: 'Liguei e falei com o dono', data: passado }, { texto: 'Lembrete interno', data: passado }] }).total === 3, 'nota de contato conta; nota qualquer não');
ok(toquesDoLead([], { ...lead, ultimaInteracao: passado }).total === 1, 'sem toque registrado, a última interação vale 1 (como o Cockpit)');
ok(toquesDoLead([], lead).total === 0 && toquesDoLead([], lead).ultimo === null, 'sem nada: 0');
const t = toquesDoLead(ev, lead);
ok(t.ultimo === '2026-09-20T15:00:00.000Z', 'o último volta para a hora real');

// reuniões do app entram como o Cockpit junta (follow-up realizada = concluída)
const clientes = new Map([['c1', { nome: 'Bar do Zé', id_hubspot: 'D1' }]]);
const app = itensDoApp(
  [{ id: 'a1', client_id: 'c1', scheduled_at: passado, status: 'realizada', type: 'follow_up', created_by: 'p1' },
   { id: 'a2', client_id: 'c1', scheduled_at: passado, status: 'cancelada', type: 'follow_up', created_by: 'p1' }],
  [], clientes, new Map([['p1', '1']]), new Map([['D1', lead]]));
ok(app.length === 1 && app[0].hs_task_status === 'COMPLETED' && app[0].lead_deal_id === 'D1', 'follow-up do app realizado entra; cancelado não');
ok(toquesDoLead(normalizar([...itens, ...app]), lead).total === 3, 'com a reunião do app: 3');

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntoques do Cockpit: tudo certo');
