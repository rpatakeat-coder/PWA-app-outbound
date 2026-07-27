import { supabase } from '../integrations/supabase/client';
import { CHANGE_STAGE_WEBHOOK } from '../constants/stages';

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
