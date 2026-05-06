// Supabase Edge Function: hubspot-lead-webhook
// Recebe payload do HubSpot (objeto único ou array), normaliza e faz upsert
// na tabela `clients` usando `id_hubspot` como chave de conflito.
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

const MAX_BATCH = 500;

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

const buildBaseFields = (p: HubspotPayload) => {
  const latitude = toFloat(p.latitude);
  const longitude = toFloat(p.longitude);
  const dealname = trimOrNull(p.dealname);
  return {
    nome: trimOrNull(p.nome) ?? extractEmpresa(dealname) ?? 'Lead HubSpot',
    email: trimOrNull(p.email),
    telefone: trimOrNull(p.celular),
    empresa: extractEmpresa(dealname),
    observacoes: trimOrNull(p.observacoes),
    endereco: trimOrNull(p.logradouro),
    numero: trimOrNull(p.numero_do_local),
    bairro: trimOrNull(p.bairro),
    cidade: trimOrNull(p.cidade),
    estado: trimOrNull(p.estado_uf),
    cep: trimOrNull(p.cep),
    latitude,
    longitude,
    url_hubspot: trimOrNull(p.url),
    geo_source: latitude !== null && longitude !== null ? 'hubspot' : null,
    geo_approximate: false,
    updated_at: new Date().toISOString(),
  };
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const isBatch = Array.isArray(raw);
  const items: HubspotPayload[] = isBatch ? (raw as HubspotPayload[]) : [raw as HubspotPayload];

  if (items.length === 0) {
    return json(400, { error: 'Empty payload' });
  }
  if (items.length > MAX_BATCH) {
    return json(413, { error: `Batch too large (max ${MAX_BATCH})` });
  }

  // Valida e normaliza id_hubspot de cada item
  const normalized: { idHubspot: string; payload: HubspotPayload }[] = [];
  for (let i = 0; i < items.length; i++) {
    const idHubspot = trimOrNull(items[i]?.id_hubspot);
    if (!idHubspot) {
      return json(400, { error: `id_hubspot is required (item index ${i})` });
    }
    normalized.push({ idHubspot, payload: items[i] });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const ids = normalized.map((n) => n.idHubspot);

  // Busca todos os existentes em uma query só
  const { data: existingRows, error: selectError } = await supabase
    .from('clients')
    .select('id_hubspot')
    .in('id_hubspot', ids);

  if (selectError) {
    console.error('[hubspot-lead-webhook] select failed', selectError);
    return json(500, { error: selectError.message });
  }

  const existingSet = new Set((existingRows ?? []).map((r) => r.id_hubspot as string));
  const hasNewLeads = normalized.some((n) => !existingSet.has(n.idHubspot));

  // Resolve status default uma única vez (só se houver leads novos no batch)
  let defaultStatusSlug: string | null = null;
  if (hasNewLeads) {
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
    defaultStatusSlug = defaultStatus.slug;
  }

  // Monta as rows: leads existentes preservam status; leads novos recebem o default
  const rows = normalized.map(({ idHubspot, payload }) => {
    const base = buildBaseFields(payload);
    if (existingSet.has(idHubspot)) {
      return { ...base, id_hubspot: idHubspot };
    }
    return { ...base, id_hubspot: idHubspot, status: defaultStatusSlug };
  });

  const { data, error } = await supabase
    .from('clients')
    .upsert(rows, { onConflict: 'id_hubspot' })
    .select();

  if (error) {
    console.error('[hubspot-lead-webhook] upsert failed', error);
    return json(500, { error: error.message });
  }

  if (isBatch) {
    return json(200, { ok: true, count: data?.length ?? 0, clients: data });
  }
  return json(200, { ok: true, client: data?.[0] ?? null });
});
