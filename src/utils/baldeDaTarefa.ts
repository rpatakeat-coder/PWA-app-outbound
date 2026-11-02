// Os baldes de vencimento (atrasadas / hoje / próximas) que a sublinha do cabeçalho de Tarefas usa.
// Moravam em src/screens/TarefasScreen.tsx (a aba Tarefas do mapa antigo); saíram para cá antes de a
// tela sair (auditoria 02/11/26), com a mesma regra.
import type { ClientTask } from '../types/client';

export type BaldeDeTarefa = 'atrasadas' | 'hoje' | 'proximas';

// ---- Vencimento ----
// Campo real: meta.due_date (gerado pelo cron de SLA como entrada na etapa +
// sla_days em dias uteis — migration 0040_revert_task_followup_generation.sql).
// D2/D5 nao gravam o campo, mas o vencimento e' a MESMA aritmetica do gerador:
// a tarefa vence quando days_in_stage cruza o limite (2 ou 5). Nada aqui
// inventa criterio — e' o calculo que o SQL usa, feito no cliente.
const diaBRTde = (iso: unknown): string | null =>
  typeof iso === 'string' && iso
    ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    : null;

// Calculado por CHAMADA, nao no import: um PWA aberto atravessando a meia-noite
// continuaria classificando pelo dia de ontem.
const hojeEmBRT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export const baldeDeVencimento = (task: ClientTask): BaldeDeTarefa => {
  const meta = (task.meta ?? {}) as { due_date?: unknown; days_in_stage?: unknown; sla_days?: unknown };
  const hojeBRT = hojeEmBRT();
  const due = diaBRTde(meta.due_date);
  if (due) return due < hojeBRT ? 'atrasadas' : due === hojeBRT ? 'hoje' : 'proximas';
  const dias = typeof meta.days_in_stage === 'number' ? meta.days_in_stage : null;
  const limite =
    task.severity === 'D5' ? 5
    : task.severity === 'D2' ? 2
    : typeof meta.sla_days === 'number' ? meta.sla_days : null;
  if (dias !== null && limite !== null) return dias > limite ? 'atrasadas' : 'hoje';
  // Sem vencimento derivavel (ex.: follow-up avulso): e' acao de agora.
  return 'hoje';
};

// Mesmo papel do `baldeDeVencimento` acima, para a tarefa que vive no HubSpot.
export const baldeDaTarefaDoCrm = (t: { venceEm: string | null }): BaldeDeTarefa => {
  if (!t.venceEm) return 'hoje';
  const diaStr = diaBRTde(t.venceEm);
  if (!diaStr) return 'hoje';
  const hoje = hojeEmBRT();
  return diaStr < hoje ? 'atrasadas' : diaStr === hoje ? 'hoje' : 'proximas';
};
