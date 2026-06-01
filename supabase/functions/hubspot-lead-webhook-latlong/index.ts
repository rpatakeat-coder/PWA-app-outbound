// Supabase Edge Function: hubspot-lead-webhook-latlong
// Variante da hubspot-lead-webhook que aceita o campo opcional `status` no
// payload (validado contra client_statuses). A lat/lon do RPA mostrou-se na
// pratica como centroide da cidade (vários leads acabavam empilhados no
// mesmo pin), então o geocoding por endereço via Nominatim tem prioridade —
// a lat/lon do payload só é usada como fallback quando Nominatim nao bate
// no endereço.
//
// Quando o RPA manda o lead sem logradouro (caso "Aleixo Restaurante" /
// "Zan Canto do Vinho"), o Nominatim costuma cair no centroide do CEP/
// bairro, empilhando 9+ clientes no mesmo pino. Por isso este webhook
// faz lookup do logradouro via ViaCEP/BrasilAPI quando o payload vier
// sem ele, e marca geo_approximate=true quando o hit do Nominatim parece
// ser centroide (postcode/suburb/road/etc.) — assim o cron de reparo
// pega esses casos no proximo ciclo.
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

type CepInfo = {
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
};

const MAX_BATCH = 50;
const NOMINATIM_THROTTLE_MS = 1100;
const FETCH_TIMEOUT_MS = 9000;
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

const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const cepIsGeneric = (cep: unknown): boolean => digits(cep).endsWith('000');

async function fetchJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn('[hubspot-lead-webhook-latlong] fetch non-ok', res.status, url);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[hubspot-lead-webhook-latlong] fetch failed', url, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupCep(cep: string | null): Promise<CepInfo | null> {
  const code = digits(cep);
  if (code.length !== 8 || cepIsGeneric(code)) return null;

  const viaCep = await fetchJson(`https://viacep.com.br/ws/${code}/json/`);
  if (viaCep && !viaCep.erro) {
    return {
      logradouro: trimOrNull(viaCep.logradouro),
      bairro: trimOrNull(viaCep.bairro),
      cidade: trimOrNull(viaCep.localidade),
      estado: trimOrNull(viaCep.uf),
    };
  }

  const brasilApi = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${code}`);
  if (brasilApi) {
    return {
      logradouro: trimOrNull(brasilApi.street),
      bairro: trimOrNull(brasilApi.neighborhood),
      cidade: trimOrNull(brasilApi.city),
      estado: trimOrNull(brasilApi.state),
    };
  }

  return null;
}

function normalizeHouseNumber(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^s\/?n$/i.test(trimmed)) return null;
  const numeric = trimmed.match(/\d+/)?.[0] ?? null;
  return numeric ? String(Number(numeric)) : trimmed;
}

// Recusa hits do Nominatim que aparentam ser centroides (postcode/suburb/
// road/cidade/etc.) — sao a causa de empilhamento de varios leads no mesmo
// pino quando o logradouro nao chega no payload.
function isPreciseNominatimHit(hit: any): boolean {
  const addresstype = String(hit?.addresstype ?? '').toLowerCase();
  const category = String(hit?.class ?? '').toLowerCase();
  const type = String(hit?.type ?? '').toLowerCase();
  const imprecise = new Set([
    'city',
    'town',
    'village',
    'municipality',
    'county',
    'state',
    'region',
    'country',
    'postcode',
    'suburb',
    'neighbourhood',
  ]);
  if (imprecise.has(addresstype) || imprecise.has(type)) return false;
  if (category === 'boundary' || category === 'place') return false;
  return true;
}

type GeocodeHit = { latitude: number; longitude: number; precise: boolean };

function parseHit(hit: any): GeocodeHit | null {
  const lat = parseFloat(hit?.lat);
  const lon = parseFloat(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { latitude: lat, longitude: lon, precise: isPreciseNominatimHit(hit) };
}

async function geocodeStructured(
  logradouro: string | null,
  numero: string | null,
  cidade: string | null,
  estado: string | null,
  cep: string | null,
): Promise<GeocodeHit | null> {
  if (!logradouro || !cidade || !estado) return null;
  const params = new URLSearchParams({
    street: [numero, logradouro].filter(Boolean).join(' '),
    city: cidade,
    state: estado,
    country: 'Brasil',
    format: 'jsonv2',
    addressdetails: '1',
    limit: '3',
    countrycodes: 'br',
  });
  if (cep) params.set('postalcode', cep);
  const data = await fetchJson(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if (!Array.isArray(data) || data.length === 0) return null;
  const hit = data.find(isPreciseNominatimHit) ?? data[0];
  return parseHit(hit);
}

async function geocodeFree(query: string): Promise<GeocodeHit | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query,
  )}&format=jsonv2&addressdetails=1&limit=3&countrycodes=br`;
  const data = await fetchJson(url);
  if (!Array.isArray(data) || data.length === 0) return null;
  const hit = data.find(isPreciseNominatimHit) ?? data[0];
  return parseHit(hit);
}

function buildAddressQuery(
  logradouro: string | null,
  numero: string | null,
  bairro: string | null,
  cidade: string | null,
  estado: string | null,
  cep: string | null,
): string | null {
  if (!cidade || !estado) return null;
  const linha1 = [logradouro, numero].filter(Boolean).join(', ');
  const parts = [linha1 || null, bairro, cidade, estado, cep, 'Brasil'].filter(
    (x): x is string => !!x && x.length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

type ResolvedGeo = {
  latitude: number | null;
  longitude: number | null;
  source: 'nominatim' | 'hubspot' | null;
  approximate: boolean;
  logradouroResolved: string | null;
  bairroResolved: string | null;
};

// Lat/lon do HubSpot/RPA na pratica vem como centroide da cidade — varios
// leads acabam empilhados no mesmo pin. Por isso geocoda primeiro pelo
// endereço via Nominatim e so cai pra lat/lon do payload quando o endereço
// nao bate em nada. Quando o payload nao traz logradouro, recorre ao
// ViaCEP/BrasilAPI pra descobrir a rua a partir do CEP antes de chamar o
// Nominatim — sem o logradouro o Nominatim devolve o centroide do CEP e
// varios clientes acabam no mesmo pino.
async function resolveGeo(
  p: HubspotPayload,
): Promise<ResolvedGeo> {
  const cepInfo = await lookupCep(trimOrNull(p.cep));

  const logradouro = trimOrNull(p.logradouro) ?? cepInfo?.logradouro ?? null;
  const numero = normalizeHouseNumber(trimOrNull(p.numero_do_local));
  const bairro = trimOrNull(p.bairro) ?? cepInfo?.bairro ?? null;
  const cidade = trimOrNull(p.cidade) ?? cepInfo?.cidade ?? null;
  const estado = trimOrNull(p.estado_uf) ?? cepInfo?.estado ?? null;
  const cep = trimOrNull(p.cep);

  const logradouroResolved = trimOrNull(p.logradouro) ?? cepInfo?.logradouro ?? null;
  const bairroResolved = trimOrNull(p.bairro) ?? cepInfo?.bairro ?? null;

  let hit = await geocodeStructured(logradouro, numero, cidade, estado, cep);
  if (!hit) {
    const query = buildAddressQuery(logradouro, numero, bairro, cidade, estado, cep);
    if (query) hit = await geocodeFree(query);
  }

  if (hit) {
    return {
      latitude: hit.latitude,
      longitude: hit.longitude,
      source: 'nominatim',
      approximate: !hit.precise,
      logradouroResolved,
      bairroResolved,
    };
  }

  const fallbackLat = toFloat(p.latitude);
  const fallbackLon = toFloat(p.longitude);
  if (fallbackLat !== null && fallbackLon !== null) {
    return {
      latitude: fallbackLat,
      longitude: fallbackLon,
      source: 'hubspot',
      approximate: true,
      logradouroResolved,
      bairroResolved,
    };
  }
  return {
    latitude: null,
    longitude: null,
    source: null,
    approximate: false,
    logradouroResolved,
    bairroResolved,
  };
}

const buildBaseFields = (p: HubspotPayload, geo: ResolvedGeo) => {
  const dealname = trimOrNull(p.dealname);
  return {
    nome: trimOrNull(p.nome) ?? extractEmpresa(dealname) ?? 'Lead HubSpot',
    email: trimOrNull(p.email),
    telefone: trimOrNull(p.celular),
    empresa: extractEmpresa(dealname),
    observacoes: trimOrNull(p.observacoes),
    endereco: trimOrNull(p.logradouro) ?? geo.logradouroResolved,
    numero: trimOrNull(p.numero_do_local),
    bairro: trimOrNull(p.bairro) ?? geo.bairroResolved,
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

  // Detecta id_hubspot repetido no mesmo batch (o RPA as vezes manda o
  // mesmo id mais de uma vez). Retorna 400 com a lista dos repetidos pra
  // o caller saber exatamente quais ids precisam ser corrigidos.
  const normalized: {
    idHubspot: string;
    payload: HubspotPayload;
    statusSlug: string | null;
  }[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const idHubspot = trimOrNull(items[i]?.id_hubspot);
    if (!idHubspot) {
      return json(400, { error: `id_hubspot is required (item index ${i})` });
    }
    if (seenIds.has(idHubspot)) {
      duplicateIds.add(idHubspot);
    } else {
      seenIds.add(idHubspot);
    }
    normalized.push({
      idHubspot,
      payload: items[i],
      statusSlug: trimOrNull(items[i]?.status),
    });
  }
  if (duplicateIds.size > 0) {
    return json(400, {
      error: 'id_hubspot duplicado dentro do batch',
      duplicated_ids: Array.from(duplicateIds),
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

  // Geocoda sequencialmente respeitando ~1 req/s do Nominatim.
  const geoByIdHubspot = new Map<string, ResolvedGeo>();
  for (let i = 0; i < normalized.length; i++) {
    const { idHubspot, payload } = normalized[i];
    const geo = await resolveGeo(payload);
    geoByIdHubspot.set(idHubspot, geo);
    if (i < normalized.length - 1) {
      await sleep(NOMINATIM_THROTTLE_MS);
    }
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
      // 23505 = unique_violation. O details do Postgres traz tipo:
      // "Key (id_hubspot)=(12345) already exists."
      const conflictId =
        error.code === '23505' && typeof error.details === 'string'
          ? error.details.match(/\((\d+)\)/)?.[1] ?? null
          : null;
      return json(error.code === '23505' ? 409 : 500, {
        error: error.message,
        ...(conflictId ? { conflict_id_hubspot: conflictId } : {}),
        ...(error.details ? { details: error.details } : {}),
      });
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
