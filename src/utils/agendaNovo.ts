// Aba Agenda do mapa novo (prompt final, Parte B §B3): regra pura, testável.
//
// As mesmas três fontes da Agenda de hoje, sem dado próprio: as paradas da
// rota do dia (field_route_stops), as tarefas do HubSpot (é por elas que o
// Planejamento do Cockpit põe visita e retorno na semana) e as reuniões e
// follow-ups agendados pelo app (client_meetings).
import { diaBRT } from './abaTarefas';

export type EstadoParada = 'feito' | 'proxima' | 'pendente';

/** Hoje + os próximos dias úteis (sábado e domingo ficam fora da faixa). */
export function diasDaFaixa(agora: Date, n = 6): string[] {
  const hoje = diaBRT(agora)!;
  const [a, m, d] = hoje.split('-').map(Number);
  const dias = [hoje];
  for (let i = 1; dias.length < n && i < 30; i++) {
    const t = new Date(Date.UTC(a, m - 1, d + i));
    const dow = t.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    dias.push(t.toISOString().slice(0, 10));
  }
  return dias;
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export function rotuloDoDia(dia: string, hoje: string): { semana: string; numero: string } {
  const [a, m, d] = dia.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return { semana: dia === hoje ? 'hoje' : SEMANA[dow], numero: String(d) };
}

/**
 * Estado de cada parada na ordem do plano: a primeira ainda não feita é a
 * "próxima". Feita = marcada na rota OU check-in hoje (o check-in fora do fluxo
 * da rota também conta — é a mesma visita).
 */
export function estadoDasParadas<T extends { status: string; visitadoHoje: boolean }>(paradas: T[]): Array<T & { estado: EstadoParada }> {
  let achouProxima = false;
  return paradas
    .filter((p) => p.status !== 'removed' && p.status !== 'skipped')
    .map((p) => {
      if (p.status === 'done' || p.visitadoHoje) return { ...p, estado: 'feito' as const };
      if (!achouProxima) { achouProxima = true; return { ...p, estado: 'proxima' as const }; }
      return { ...p, estado: 'pendente' as const };
    });
}

export type Compromisso = {
  id: string;
  quando: string | null;
  hora: string | null;
  tipo: 'reunião' | 'retorno' | 'visita';
  /** O assunto, quando ele diz algo além de "Tipo - Nome do lead". */
  titulo: string | null;
  clientId: string | null;
  nome: string | null;
  fonte: 'hubspot' | 'app';
};

type TarefaMin = { id: string; assunto: string; venceEm: string | null; tipo: 'visita' | 'follow_up' | 'outro'; clientId: string | null; nomeDoCliente: string | null };
type ReuniaoMin = { id: string; client_id: string; scheduled_at: string; type: string; status: string };

const sem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** "Visita - Kadô" com nome "Kadô" não diz nada que a linha já não diga. */
export function tituloUtil(assunto: string, tipo: string, nome: string | null): string | null {
  let resto = sem(assunto);
  if (nome) resto = resto.replace(sem(nome), '').trim();
  if (!resto || resto === sem(tipo) || /^(visita|follow up|retorno|reuniao|rota)$/.test(resto)) return null;
  return assunto;
}

const horaBRT = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
};

/**
 * Reuniões e retornos de um dia, pela hora. `jaNoPlano` são os leads que já
 * são parada da rota: a visita do Planejamento para o mesmo lead não aparece
 * duas vezes (a parada já é ela).
 */
export function compromissosDoDia(
  dia: string,
  tarefas: TarefaMin[],
  reunioes: ReuniaoMin[],
  nomeDoLead: (clientId: string) => string | null,
  jaNoPlano: Set<string> = new Set(),
): Compromisso[] {
  const itens: Compromisso[] = [];
  for (const t of tarefas) {
    if (!t.venceEm || diaBRT(t.venceEm) !== dia) continue;
    if (t.tipo === 'visita' && t.clientId && jaNoPlano.has(t.clientId)) continue;
    const tipo = t.tipo === 'visita' ? 'visita' : /reuni|demo/i.test(t.assunto) ? 'reunião' : 'retorno';
    itens.push({ id: `hs-${t.id}`, quando: t.venceEm, hora: horaBRT(t.venceEm), tipo, titulo: tituloUtil(t.assunto, tipo, t.nomeDoCliente), clientId: t.clientId, nome: t.nomeDoCliente, fonte: 'hubspot' });
  }
  for (const r of reunioes) {
    if (r.status === 'cancelada' || r.status === 'cancelled' || r.status === 'canceled') continue;
    if (diaBRT(r.scheduled_at) !== dia) continue;
    const tipo = r.type === 'follow_up' ? 'retorno' : 'reunião';
    itens.push({ id: `app-${r.id}`, quando: r.scheduled_at, hora: horaBRT(r.scheduled_at), tipo, titulo: null, clientId: r.client_id, nome: nomeDoLead(r.client_id), fonte: 'app' });
  }
  return itens.sort((a, b) => (a.quando ? Date.parse(a.quando) : 0) - (b.quando ? Date.parse(b.quando) : 0));
}
