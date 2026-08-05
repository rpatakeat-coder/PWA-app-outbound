import { supabase } from '../integrations/supabase/client';
import { CHANGE_STAGE_WEBHOOK } from '../constants/stages';
import type { MeetingType } from '../types/client';

// Ponto unico de saida dos eventos que antes iam TODOS pro webhook do n8n.
// Tipos com integracao HubSpot pura vao pra edge function hubspot-sync (rapida,
// sem intermediario); se ela ainda nao estiver deployada/configurada, cai
// automaticamente pro n8n com o MESMO payload — migracao sem quebra.
//
// reuniao/followup (Google Calendar via credencial OAuth do n8n) e visited
// (sem rota de HubSpot) NAO tem branch na edge: vao sempre direto pro n8n.
const EDGE_TYPES = new Set(['change_stage', 'update', 'create_pin', 'get_stages', 'create_note']);

// Tipos NAO idempotentes: reexecutar cria um segundo deal/nota. Pra esses, so
// caimos pro n8n quando temos CERTEZA de que a edge nao executou nada (function
// ausente/nao configurada) — nunca num erro de rede ambiguo (a edge pode ter
// criado o recurso e a resposta se perdeu).
const NON_IDEMPOTENT = new Set(['create_pin', 'create_note']);

// A edge devolve 503 quando HUBSPOT_TOKEN nao esta setado e a plataforma
// devolve 404 quando a function nem existe. Nesses casos ela comprovadamente
// nao tocou o HubSpot, entao o fallback pro n8n e' seguro mesmo pros tipos
// nao idempotentes.
function edgeDefinitelyDidNotRun(error: any): boolean {
  const status = error?.context?.status ?? error?.status;
  return status === 404 || status === 503;
}

async function postToN8n(payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(CHANGE_STAGE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Webhook respondeu ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function sendHubspotEvent(payload: Record<string, unknown>): Promise<unknown> {
  const type = String(payload.type ?? '');

  if (!EDGE_TYPES.has(type)) {
    // reuniao/followup/visited: sempre n8n.
    return postToN8n(payload);
  }

  try {
    const { data, error } = await supabase.functions.invoke('hubspot-sync', { body: payload });
    if (!error) return data;

    // Edge retornou erro. Decide se e' seguro cair pro n8n.
    if (NON_IDEMPOTENT.has(type) && !edgeDefinitelyDidNotRun(error)) {
      // Erro ambiguo num tipo que duplica se reexecutado (create_pin/create_note):
      // NAO reenvia pro n8n — a edge pode ter criado o recurso. Propaga o erro;
      // quem chama trata (no create_pin o app re-consulta o id_hubspot que a
      // edge grava server-side).
      throw new Error(`hubspot-sync falhou (${type}): ${error.message ?? error}`);
    }
    console.warn(`[hubspot-sync] edge indisponivel (${type}), caindo pro n8n:`, error.message ?? error);
    return postToN8n(payload);
  } catch (err) {
    // Exception do invoke (rede/timeout). Mesma regra: nao reexecuta tipo
    // nao idempotente por conta de erro ambiguo.
    if (NON_IDEMPOTENT.has(type)) {
      throw err;
    }
    console.warn(`[hubspot-sync] edge indisponivel (${type}), caindo pro n8n:`, err);
    return postToN8n(payload);
  }
}

// ============================================================================
// Agenda -> HubSpot (Observacao pra follow up, Meeting pra demo).
//
// Chamam a edge hubspot-sync DIRETO (sem passar pelo sendHubspotEvent). O
// fallback pro n8n desses tipos seria PERIGOSO: a rota default do Switch do n8n
// cria um deal. Entao aqui, se a edge falhar, o erro sobe e quem chama so' loga
// (o agendamento em si nao quebra) — nunca reenvia pro n8n.
// ============================================================================
async function invokeHubspotSync(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('hubspot-sync', { body });
  if (error) {
    const ctx = (error as any)?.context;
    let detail = error.message;
    try {
      const b = await ctx?.json?.();
      if (b?.error) detail = b.detail ? `${b.error}: ${b.detail}` : b.error;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
  return data;
}

// Duracao (min) -> fim ISO a partir do inicio.
const endFromStart = (startIso: string, durationMin: number) =>
  new Date(new Date(startIso).getTime() + durationMin * 60_000).toISOString();

// dd/mm/aaaa hh:mm no fuso do aparelho — mesmo formato que a agenda mostra.
const formatBr = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

// Corpo da Observacao do follow up. Diferente da Task, a nota nao tem campo de
// vencimento — entao a data agendada precisa estar NO TEXTO, senao quem le a
// timeline do deal nao sabe pra quando o follow up ficou.
const followUpNoteBody = (titulo: string, descricao: string | null, scheduledAt: string) => {
  const linhas = [titulo, `Agendado para: ${formatBr(scheduledAt)}`];
  const obs = descricao?.trim();
  if (obs) linhas.push('', obs);
  return linhas.join('\n');
};

export type AgendaEngagementInput = {
  meetingType: MeetingType;    // 'reuniao' (demo) | 'follow_up'
  id_hubspot: string;          // id do deal
  titulo: string;
  descricao: string | null;
  scheduled_at: string;        // ISO
  duration_minutes: number;
  owner_id: string | null;     // hubspot_owner_id do vendedor
  autor_nome?: string | null;  // assina a Observacao do follow up na timeline
};

// Cria a Observacao (follow up) ou a Meeting (demo) no HubSpot. Retorna o id do
// engagement (pra guardar em client_meetings.hs_engagement_id) ou null.
export async function createAgendaEngagement(input: AgendaEngagementInput): Promise<string | null> {
  const isFollowUp = input.meetingType === 'follow_up';
  const body = isFollowUp
    ? {
        type: 'create_note', id_hubspot: input.id_hubspot,
        body: followUpNoteBody(input.titulo, input.descricao, input.scheduled_at),
        autor_nome: input.autor_nome ?? null,
      }
    : {
        type: 'create_meeting', id_hubspot: input.id_hubspot,
        titulo: input.titulo, descricao: input.descricao,
        start_at: input.scheduled_at,
        end_at: endFromStart(input.scheduled_at, input.duration_minutes),
        owner_id: input.owner_id,
      };
  const data = await invokeHubspotSync(body);
  // create_note responde note_id; create_meeting responde engagement_id.
  return ((data?.note_id ?? data?.engagement_id) as string | undefined) ?? null;
}

// Reagenda (novo horario) o engagement ja criado.
export async function rescheduleAgendaEngagement(input: {
  meetingType: MeetingType;
  engagement_id: string;
  titulo: string;
  descricao: string | null;
  scheduled_at: string;
  duration_minutes: number;
}): Promise<void> {
  const isFollowUp = input.meetingType === 'follow_up';
  const body = isFollowUp
    ? {
        type: 'update_note', engagement_id: input.engagement_id,
        body: followUpNoteBody(input.titulo, input.descricao, input.scheduled_at),
        // titulo/descricao/due_at so' servem pros follow ups da regra ANTIGA,
        // cujo hs_engagement_id e' de Task: a edge detecta (404 na nota) e cai
        // pro update da task com esses campos.
        titulo: input.titulo, descricao: input.descricao, due_at: input.scheduled_at,
      }
    : {
        type: 'update_meeting', engagement_id: input.engagement_id,
        titulo: input.titulo, descricao: input.descricao,
        start_at: input.scheduled_at,
        end_at: endFromStart(input.scheduled_at, input.duration_minutes),
      };
  await invokeHubspotSync(body);
}

// Cancela o engagement — usado ao remover no app. Follow up: marca a Observacao
// como cancelada (o texto fica, e' registro de timeline). Demo: cancela a Meeting.
export async function cancelAgendaEngagement(input: {
  meetingType: MeetingType;
  engagement_id: string;
}): Promise<void> {
  const body = input.meetingType === 'follow_up'
    ? { type: 'update_note', engagement_id: input.engagement_id, cancelar: true }
    : { type: 'update_meeting', engagement_id: input.engagement_id, cancelar: true };
  await invokeHubspotSync(body);
}
