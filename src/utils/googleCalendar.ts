import { supabase } from '../integrations/supabase/client';

// Chama a edge google-calendar (cria/atualiza/deleta evento no Google Calendar).
// Usado SO' pra demo (reuniao) — o app vira o dono do evento; o Meeting no
// HubSpot acompanha via a sync nativa HubSpot<->Google. Follow up nao usa isso.
async function invokeGoogleCalendar(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('google-calendar', { body });
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

export type GoogleEventInput = {
  titulo: string;
  descricao: string | null;
  scheduled_at: string;    // ISO
  duration_minutes: number;
  attendees: string[];     // e-mails dos convidados (cliente + vendedor)
};

// Cria o evento e retorna o google_event_id (pra guardar em client_meetings).
export async function createGoogleEvent(input: GoogleEventInput): Promise<string | null> {
  const data = await invokeGoogleCalendar({
    type: 'create_event',
    titulo: input.titulo,
    descricao: input.descricao,
    start_at: input.scheduled_at,
    end_at: endFromStart(input.scheduled_at, input.duration_minutes),
    attendees: input.attendees,
  });
  return (data?.event_id as string | undefined) ?? null;
}

// Reagenda (novo horario/dados) o evento existente.
export async function updateGoogleEvent(input: {
  event_id: string;
  titulo: string;
  descricao: string | null;
  scheduled_at: string;
  duration_minutes: number;
  attendees: string[];
}): Promise<void> {
  await invokeGoogleCalendar({
    type: 'update_event',
    event_id: input.event_id,
    titulo: input.titulo,
    descricao: input.descricao,
    start_at: input.scheduled_at,
    end_at: endFromStart(input.scheduled_at, input.duration_minutes),
    attendees: input.attendees,
  });
}

// Cancela (deleta) o evento no Google.
export async function deleteGoogleEvent(eventId: string): Promise<void> {
  await invokeGoogleCalendar({ type: 'delete_event', event_id: eventId });
}
