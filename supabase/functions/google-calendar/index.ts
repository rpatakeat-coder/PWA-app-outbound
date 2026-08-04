// Supabase Edge Function: google-calendar
// Cria / atualiza / deleta eventos no Google Calendar direto da API (substitui
// o que o n8n fazia). Assim o app controla o compromisso ponta a ponta:
// agendar/reagendar/cancelar uma DEMO reflete no Google Calendar — e o Meeting
// no HubSpot acompanha via a sync nativa HubSpot<->Google (bidirectional).
//
// Follow up NAO passa por aqui (fica so como Task no HubSpot, via hubspot-sync).
//
// Auth: verify_jwt LIGADO (so o app logado chama).
//
// Body JSON (type):
//   create_event { titulo, descricao, start_at, end_at, attendees:[email] }
//     -> { ok, event_id, htmlLink }
//   update_event { event_id, titulo?, descricao?, start_at?, end_at?, attendees? }
//     -> { ok, event_id }
//   delete_event { event_id } -> { ok }
//
// Secrets:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//   GOOGLE_CALENDAR_ID (opcional; default = calendario Comercial - Outbound)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GCAL = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_CALENDAR = '6c1b583d8af5964ed5b89f49fabe59dda2c4cd86e31a140cc779d1d64a3bb9a7@group.calendar.google.com';
const TZ = 'America/Sao_Paulo';
const FETCH_TIMEOUT_MS = 12_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const trimOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
};

async function fetchTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// refresh_token -> access_token (curto). Nao cacheia: cada invocacao e' isolada.
async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Secrets do Google ausentes (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN)');
  }
  const res = await fetchTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(`Google token falhou: ${data?.error_description ?? data?.error ?? `status ${res.status}`}`);
  }
  return data.access_token as string;
}

const calendarPath = () =>
  `${GCAL}/calendars/${encodeURIComponent(Deno.env.get('GOOGLE_CALENDAR_ID') ?? DEFAULT_CALENDAR)}/events`;

// Monta o corpo do evento no formato do Google Calendar. attendees = lista de
// e-mails (convidados). start_at/end_at em ISO 8601 (o app manda o instante).
function eventBody(body: Record<string, unknown>): Record<string, unknown> {
  const attendees = Array.isArray(body.attendees)
    ? (body.attendees as unknown[])
        .map((e) => trimOrNull(e))
        .filter((e): e is string => !!e && e.includes('@'))
        .map((email) => ({ email }))
    : [];
  const ev: Record<string, unknown> = {
    summary: trimOrNull(body.titulo) ?? 'Reunião',
    description: trimOrNull(body.descricao) ?? '',
    reminders: { useDefault: true },
  };
  const start = trimOrNull(body.start_at);
  const end = trimOrNull(body.end_at);
  if (start) ev.start = { dateTime: start, timeZone: TZ };
  if (end) ev.end = { dateTime: end, timeZone: TZ };
  if (attendees.length) ev.attendees = attendees;
  return ev;
}

async function gcalFetch(
  token: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetchTimeout(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  // DELETE devolve 204 sem corpo.
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    console.warn('[google-calendar]', method, res.status, JSON.stringify(body)?.slice(0, 400));
  }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'Body JSON invalido' }); }
  const type = trimOrNull(body.type);

  // `?sendUpdates=all` => Google dispara o convite/atualizacao por e-mail.
  const suffix = '?sendUpdates=all';

  try {
    const token = await getAccessToken();

    if (type === 'create_event') {
      const start = trimOrNull(body.start_at);
      const end = trimOrNull(body.end_at);
      if (!start || !end) return json(400, { error: 'start_at e end_at sao obrigatorios' });
      const res = await gcalFetch(token, 'POST', `${calendarPath()}${suffix}`, eventBody(body));
      if (!res.ok) return json(502, { error: 'Google recusou criar o evento', detail: res.body?.error?.message ?? `status ${res.status}` });
      return json(200, { ok: true, event_id: res.body?.id ?? null, htmlLink: res.body?.htmlLink ?? null });
    }

    if (type === 'update_event') {
      const eventId = trimOrNull(body.event_id);
      if (!eventId) return json(400, { error: 'event_id e obrigatorio' });
      // PATCH: so' os campos enviados sao alterados.
      const res = await gcalFetch(token, 'PATCH', `${calendarPath()}/${encodeURIComponent(eventId)}${suffix}`, eventBody(body));
      if (!res.ok) return json(502, { error: 'Google recusou atualizar o evento', detail: res.body?.error?.message ?? `status ${res.status}` });
      return json(200, { ok: true, event_id: eventId });
    }

    if (type === 'delete_event') {
      const eventId = trimOrNull(body.event_id);
      if (!eventId) return json(400, { error: 'event_id e obrigatorio' });
      const res = await gcalFetch(token, 'DELETE', `${calendarPath()}/${encodeURIComponent(eventId)}${suffix}`);
      // 204 = deletado; 404/410 = ja nao existe (idempotente) -> trata como ok.
      if (res.ok || res.status === 404 || res.status === 410) return json(200, { ok: true, event_id: eventId });
      return json(502, { error: 'Google recusou deletar o evento', detail: res.body?.error?.message ?? `status ${res.status}` });
    }

    return json(400, { error: `type nao suportado: ${type ?? '(vazio)'}` });
  } catch (err) {
    console.error('[google-calendar] erro', type, err);
    return json(500, { error: 'Erro interno', detail: String((err as Error)?.message ?? err) });
  }
});
