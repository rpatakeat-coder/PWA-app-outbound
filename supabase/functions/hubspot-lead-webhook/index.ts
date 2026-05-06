// Supabase Edge Function: hubspot-lead-webhook
// Recebe payload do HubSpot, normaliza e faz upsert na tabela `clients`
// usando `id_hubspot` como chave de conflito.
//
// Deploy:
//   supabase functions deploy hubspot-lead-webhook --no-verify-jwt
//
// Secrets necessários:
//   HUBSPOT_WEBHOOK_SECRET — segredo compartilhado, validado via header `x-webhook-secret`
//   SUPABASE_URL           — preenchido automaticamente pela plataforma
//   SUPABASE_SERVICE_ROLE_KEY — preenchido automaticamente pela plataforma

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

type HubspotPayload = {
  bairro?: string | null;
  celular?: string | null;
  cep?: string | null;
  cidade?: string | null;
  dealname?: string | null;
  email?: string | null;
  estado_uf?: string | null;
  id_hubspot?: string | number | null;
  latitude?: string | number | null;
  logradouro?: string | null;
  longitude?: string | number | null;
  nome?: string | null;
  numero_do_local?: string | null;
  observacoes?: string | null;
  url?: string | null;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const toFloat = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const trimOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
};

// "Oportunidade - MPS LANCHONETE..." -> "MPS LANCHONETE..."
const extractEmpresa = (dealname: string | null): string | null => {
  if (!dealname) return null;
  const idx = dealname.indexOf(' - ');
  return idx >= 0 ? dealname.slice(idx + 3).trim() : dealname.trim();
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  const expectedSecret = Deno.env.get('HUBSPOT_WEBHOOK_SECRET');
  if (!expectedSecret) {
    return json(500, { error: 'HUBSPOT_WEBHOOK_SECRET not configured' });
  }
  if (req.headers.get('x-webhook-secret') !== expectedSecret) {
    return json(401, { error: 'Unauthorized' });
  }

  let payload: HubspotPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const idHubspot = trimOrNull(payload.id_hubspot);
  if (!idHubspot) {
    return json(400, { error: 'id_hubspot is required' });
  }

  const latitude = toFloat(payload.latitude);
  const longitude = toFloat(payload.longitude);

  const baseFields = {
    nome: trimOrNull(payload.nome) ?? extractEmpresa(trimOrNull(payload.dealname)) ?? 'Lead HubSpot',
    email: trimOrNull(payload.email),
    telefone: trimOrNull(payload.celular),
    empresa: extractEmpresa(trimOrNull(payload.dealname)),
    observacoes: trimOrNull(payload.observacoes),
    endereco: trimOrNull(payload.logradouro),
    numero: trimOrNull(payload.numero_do_local),
    bairro: trimOrNull(payload.bairro),
    cidade: trimOrNull(payload.cidade),
    estado: trimOrNull(payload.estado_uf),
    cep: trimOrNull(payload.cep),
    latitude,
    longitude,
    url_hubspot: trimOrNull(payload.url),
    geo_source: latitude !== null && longitude !== null ? 'hubspot' : null,
    geo_approximate: false,
    updated_at: new Date().toISOString(),
  };

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Verifica se o lead já existe — se sim, NÃO sobrescreve o status
  // (preserva o que o time alterou no app, ex.: 'lead_visitado').
  const { data: existing, error: selectError } = await supabase
    .from('clients')
    .select('id, status')
    .eq('id_hubspot', idHubspot)
    .maybeSingle();

  if (selectError) {
    console.error('[hubspot-lead-webhook] select failed', selectError);
    return json(500, { error: selectError.message });
  }

  let row: Record<string, unknown>;
  if (existing) {
    row = { ...baseFields, id_hubspot: idHubspot };
  } else {
    // Status default vem do banco — admin escolhe pela UI marcando
    // is_default_for_new_leads na tabela client_statuses.
    const { data: defaultStatus, error: statusError } = await supabase
      .from('client_statuses')
      .select('slug')
      .eq('is_default_for_new_leads', true)
      .eq('is_active', true)
      .maybeSingle();

    if (statusError) {
      console.error('[hubspot-lead-webhook] default status lookup failed', statusError);
      return json(500, { error: statusError.message });
    }
    if (!defaultStatus?.slug) {
      return json(500, {
        error: 'Nenhum status marcado como is_default_for_new_leads em client_statuses',
      });
    }

    row = { ...baseFields, id_hubspot: idHubspot, status: defaultStatus.slug };
  }

  const { data, error } = await supabase
    .from('clients')
    .upsert(row, { onConflict: 'id_hubspot' })
    .select()
    .single();

  if (error) {
    console.error('[hubspot-lead-webhook] upsert failed', error);
    return json(500, { error: error.message });
  }

  return json(200, { ok: true, client: data });
});
