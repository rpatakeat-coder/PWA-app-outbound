// Supabase Edge Function: hubspot-lead-webhook-latlong
// Mesma lógica de `hubspot-lead-webhook`, porém PRIORIZA latitude/longitude
// vindas no payload. Só cai pro Nominatim (geocoding por endereço) quando
// não vier lat/lon no payload. Útil quando o RPA já manda coordenadas
// confiáveis e queremos evitar o reverse/geocode aproximado por endereço.
//
// Deploy:
//   supabase functions deploy hubspot-lead-webhook-latlong --no-verify-jwt
//
// Secrets necessários (compartilha com a outra função):
//   HUBSPOT_WEBHOOK_SECRET
//   HUBSPOT_WEBHOOK_USER_ID (opcional)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (automáticos)

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
  status?: string | null;
  url?: string | null;
};

const MAX_BATCH = 50;
const NOMINATIM_THROTTLE_MS = 1100;
const NOMINATIM_TIMEOUT_MS = 8000;
const NOMINATIM_UA = 'TakeatRPA-HubSpotWebhook (contact: brittes@takeat.app)';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const buildAddressQuery = (p: HubspotPayload): string | null => {
  const logradouro = trimOrNull(p.logradouro);
  const numero = trimOrNull(p.numero_do_local);
  const bairro = trimOrNull(p.bairro);
  const cidade = trimOrNull(p.cidade);
  const estado = trimOrNull(p.estado_uf);
  const cep = trimOrNull(p.cep);

  if (!cidade || !estado) return null;

  const linha1 = [logradouro, numero].filter(Boolean).join(', ');
  const parts = [linha1, bairro, cidade, estado, cep, 'Brasil'].filter(
    (x) => x && x.length > 0,
  );
  return parts.join(', ');
};

async function geocodeNominatim(
  query: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query,
    )}&format=json&limit=1&countrycodes=br`;
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn('[hubspot-lead-webhook-latlong] nominatim non-ok', res.status, query);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { latitude: lat, longitude: lon };
  } catch (err) {
    console.warn('[hubspot-lead-webhook-latlong] nominatim error', err, query);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type ResolvedGeo = {
  latitude: number | null;
  longitude: number | null;
  source: 'nominatim' | 'hubspot' | null;
  approximate: boolean;
};

const buildBaseFields = (p: HubspotPayload, geo: ResolvedGeo) => {
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
    latitude: geo.latitude,
    longitude: geo.longitude,
    url_hubspot: trimOrNull(p.url),
    geo_source: geo.source,
    geo_approximate: geo.approximate,
    updated_at: new Date().toISOString(),
  };
};

// Diferente da função original: lat/lon do payload vence. Nominatim só
// entra em cena se o RPA não conseguiu coordenadas — nesse caso marca como
// approximate=true porque foi geocoding por endereço.
async function resolveGeo(p: HubspotPayload): Promise<ResolvedGeo> {
  const payloadLat = toFloat(p.latitude);
  const payloadLon = toFloat(p.longitude);
  if (payloadLat !== null && payloadLon !== null) {
    return {
      latitude: payloadLat,
      longitude: payloadLon,
      source: 'hubspot',
      approximate: false,
    };
  }
  const query = buildAddressQuery(p);
  if (query) {
    const found = await geocodeNominatim(query);
    if (found) {
      return { ...found, source: 'nominatim', approximate: true };
    }
  }
  return { latitude: null, longitude: null, source: null, approximate: false };
}

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

  const normalized: {
    idHubspot: string;
    payload: HubspotPayload;
    statusSlug: string | null;
  }[] = [];
  for (let i = 0; i < items.length; i++) {
    const idHubspot = trimOrNull(items[i]?.id_hubspot);
    if (!idHubspot) {
      return json(400, { error: `id_hubspot is required (item index ${i})` });
    }
    normalized.push({
      idHubspot,
      payload: items[i],
      statusSlug: trimOrNull(items[i]?.status),
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let webhookUserId = Deno.env.get('HUBSPOT_WEBHOOK_USER_ID') ?? null;
  if (!webhookUserId) {
    const { data: firstUser, error: userError } = await supabase
      .schema('auth')
      .from('users')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (userError) {
      console.error('[hubspot-lead-webhook-latlong] auth.users lookup failed', userError);
      return json(500, { error: userError.message });
    }
    webhookUserId = firstUser?.id ?? null;
  }
  if (!webhookUserId) {
    return json(500, {
      error:
        'Não foi possível determinar created_by: configure o secret HUBSPOT_WEBHOOK_USER_ID com um auth.users.id válido',
    });
  }

  // Valida status (opcional) contra client_statuses. Aceita slugs ativos.
  const requestedStatusSlugs = Array.from(
    new Set(normalized.map((n) => n.statusSlug).filter((s): s is string => !!s)),
  );
  if (requestedStatusSlugs.length > 0) {
    const { data: validStatuses, error: vErr } = await supabase
      .from('client_statuses')
      .select('slug')
      .in('slug', requestedStatusSlugs)
      .eq('is_active', true);
    if (vErr) {
      console.error('[hubspot-lead-webhook-latlong] status validation failed', vErr);
      return json(500, { error: vErr.message });
    }
    const validSet = new Set((validStatuses ?? []).map((r) => r.slug as string));
    const invalid = requestedStatusSlugs.filter((s) => !validSet.has(s));
    if (invalid.length > 0) {
      return json(400, {
        error: `status inválido(s): ${invalid.join(', ')}`,
        valid_hint: 'consulte client_statuses (is_active=true)',
      });
    }
  }

  const ids = normalized.map((n) => n.idHubspot);

  const { data: existingRows, error: selectError } = await supabase
    .from('clients')
    .select('id_hubspot')
    .in('id_hubspot', ids);

  if (selectError) {
    console.error('[hubspot-lead-webhook-latlong] select failed', selectError);
    return json(500, { error: selectError.message });
  }

  const existingSet = new Set((existingRows ?? []).map((r) => r.id_hubspot as string));
  const newLeads = normalized.filter((n) => !existingSet.has(n.idHubspot));
  const updates = normalized.filter((n) => existingSet.has(n.idHubspot));

  let defaultStatusSlug: string | null = null;
  if (newLeads.length > 0) {
    const { data: defaultStatus, error: statusError } = await supabase
      .from('client_statuses')
      .select('slug')
      .eq('is_default_for_new_leads', true)
      .eq('is_active', true)
      .maybeSingle();

    if (statusError) {
      console.error('[hubspot-lead-webhook-latlong] default status lookup failed', statusError);
      return json(500, { error: statusError.message });
    }
    if (!defaultStatus?.slug) {
      return json(500, {
        error: 'Nenhum status marcado como is_default_for_new_leads em client_statuses',
      });
    }
    defaultStatusSlug = defaultStatus.slug;
  }

  // Só faz throttle entre chamadas que de fato batem no Nominatim.
  const geoByIdHubspot = new Map<string, ResolvedGeo>();
  let lastHitNominatim = false;
  for (let i = 0; i < normalized.length; i++) {
    const { idHubspot, payload } = normalized[i];
    const hasPayloadCoords =
      toFloat(payload.latitude) !== null && toFloat(payload.longitude) !== null;
    if (!hasPayloadCoords && lastHitNominatim) {
      await sleep(NOMINATIM_THROTTLE_MS);
    }
    const geo = await resolveGeo(payload);
    geoByIdHubspot.set(idHubspot, geo);
    lastHitNominatim = geo.source === 'nominatim';
  }

  const results: unknown[] = [];

  if (newLeads.length > 0) {
    const insertRows = newLeads.map(({ idHubspot, payload, statusSlug }) => ({
      ...buildBaseFields(payload, geoByIdHubspot.get(idHubspot)!),
      id_hubspot: idHubspot,
      status: statusSlug ?? defaultStatusSlug,
      created_by: webhookUserId,
      updated_by: webhookUserId,
    }));
    const { data, error } = await supabase.from('clients').insert(insertRows).select();
    if (error) {
      console.error('[hubspot-lead-webhook-latlong] insert failed', error);
      return json(500, { error: error.message });
    }
    if (data) results.push(...data);
  }

  if (updates.length > 0) {
    const updateResults = await Promise.all(
      updates.map(async ({ idHubspot, payload, statusSlug }) => {
        const fields: Record<string, unknown> = {
          ...buildBaseFields(payload, geoByIdHubspot.get(idHubspot)!),
          id_hubspot: idHubspot,
          updated_by: webhookUserId,
        };
        if (statusSlug) fields.status = statusSlug;
        const { data, error } = await supabase
          .from('clients')
          .update(fields)
          .eq('id_hubspot', idHubspot)
          .select()
          .maybeSingle();
        return { idHubspot, data, error };
      }),
    );
    const failed = updateResults.find((r) => r.error);
    if (failed?.error) {
      console.error('[hubspot-lead-webhook-latlong] update failed', failed.idHubspot, failed.error);
      return json(500, { error: failed.error.message, id_hubspot: failed.idHubspot });
    }
    for (const r of updateResults) {
      if (r.data) results.push(r.data);
    }
  }

  if (isBatch) {
    return json(200, { ok: true, count: results.length, clients: results });
  }
  return json(200, { ok: true, client: results[0] ?? null });
});
