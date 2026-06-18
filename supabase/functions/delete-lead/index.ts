// Supabase Edge Function: delete-lead
// Apaga um cliente pelo id_hubspot. CASCADE no banco apaga tudo relacionado
// (client_notes, client_meetings, client_status_history, field_route_stops,
// geocode_repair_attempts). Linhas em import_logs perdem a FK (SET NULL).
//
// Autenticacao: header x-delete-secret deve bater com o env DELETE_LEAD_SECRET.
//
// Deploy:
//   supabase functions deploy delete-lead --no-verify-jwt
//
// Secrets necessarios:
//   DELETE_LEAD_SECRET — segredo compartilhado, validado via header `x-delete-secret`
//   SUPABASE_URL           — preenchido automaticamente pela plataforma
//   SUPABASE_SERVICE_ROLE_KEY — preenchido automaticamente pela plataforma

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return json(405, { error: 'Use POST ou DELETE' });
  }

  const expectedSecret = Deno.env.get('DELETE_LEAD_SECRET');
  if (!expectedSecret) {
    return json(500, { error: 'DELETE_LEAD_SECRET nao configurado no servidor' });
  }
  const providedSecret = req.headers.get('x-delete-secret');
  if (providedSecret !== expectedSecret) {
    return json(401, { error: 'Secret invalido' });
  }

  let body: { id_hubspot?: string | number | null } | null = null;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body precisa ser JSON com { id_hubspot: "..." }' });
  }

  const rawId = body?.id_hubspot;
  if (rawId === null || rawId === undefined || String(rawId).trim() === '') {
    return json(400, { error: 'Campo id_hubspot eh obrigatorio' });
  }
  const idHubspot = String(rawId).trim();

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) {
    return json(500, { error: 'Supabase env vars ausentes' });
  }
  const supabase = createClient(supabaseUrl, serviceRole);

  // Busca antes pra confirmar que existe + retornar info do apagado
  const { data: existing, error: fetchError } = await supabase
    .from('clients')
    .select('id, nome, empresa, status, id_hubspot')
    .eq('id_hubspot', idHubspot)
    .maybeSingle();

  if (fetchError) {
    return json(500, { error: 'Erro consultando o lead', detail: fetchError.message });
  }
  if (!existing) {
    return json(404, { error: `Nenhum lead encontrado com id_hubspot=${idHubspot}` });
  }

  const { error: deleteError, count } = await supabase
    .from('clients')
    .delete({ count: 'exact' })
    .eq('id_hubspot', idHubspot);

  if (deleteError) {
    return json(500, { error: 'Falha ao deletar', detail: deleteError.message });
  }

  return json(200, {
    ok: true,
    deleted_count: count ?? 0,
    deleted: existing,
    cascade_note: 'client_notes, client_meetings, client_status_history, field_route_stops e geocode_repair_attempts foram apagados em cascata.',
  });
});
