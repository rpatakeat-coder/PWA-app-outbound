// Supabase Edge Function: geocode
// Geocodifica um endereco estruturado usando o Google Geocoding API como fonte
// primaria (tem os numeros das casas no Brasil) e o Nominatim/OSM como fallback
// gratuito quando o Google falha, nao acha, ou nao esta configurado.
//
// A API key do Google fica SO no servidor (secret GOOGLE_GEOCODING_API_KEY) —
// nunca vai pro app. O app chama via supabase.functions.invoke('geocode', ...)
// com o JWT do usuario logado (verify-jwt ligado).
//
// Deploy:
//   supabase functions deploy geocode
//
// Secret necessario:
//   GOOGLE_GEOCODING_API_KEY — chave do Google Cloud com Geocoding API ativa.
//   (Sem ela, a function ainda responde usando so o Nominatim.)
//
// Request  (POST, JSON): {
//   logradouro: string, numero?: string|null, bairro?: string|null,
//   cidade: string, estado: string, cep?: string|null
// }
// Response (JSON): { latitude, longitude, approximate, provider } | { error }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const TIMEOUT_MS = 9000;
const NOMINATIM_UA = 'TakeatRPA-Geocode (contact: brittes@takeat.app)';

async function fetchJson(url: string, init: RequestInit = {}): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[geocode] fetch falhou', url, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const clean = (v: unknown): string => (v == null ? '' : String(v).trim());

// Numero: "s/n" -> vazio; extrai digitos ("1086-A" -> "1086").
function normalizeNumero(numero: string): string {
  const t = numero.trim();
  if (/^s\/?n$/i.test(t)) return '';
  return t.match(/\d+/)?.[0] ?? '';
}

type GeoInput = {
  logradouro: string;
  numero?: string | null;
  bairro?: string | null;
  cidade: string;
  estado: string;
  cep?: string | null;
};

type GeoResult = {
  latitude: number;
  longitude: number;
  approximate: boolean;
  provider: 'google' | 'nominatim';
};

// ---- Google Geocoding ----
// location_type: ROOFTOP = ponto exato do endereco; RANGE_INTERPOLATED =
// interpolado na quadra (bem proximo). GEOMETRIC_CENTER / APPROXIMATE = centro
// da rua/regiao (impreciso). approximate = qualquer coisa que nao seja rooftop
// nem interpolacao.
async function geocodeGoogle(input: GeoInput, apiKey: string): Promise<GeoResult | null> {
  const numero = normalizeNumero(clean(input.numero));
  const line1 = [numero, input.logradouro].filter(Boolean).join(' ');
  const parts = [line1, input.bairro, input.cidade, input.estado, input.cep, 'Brasil']
    .map(clean)
    .filter(Boolean);
  const address = parts.join(', ');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address,
  )}&region=br&language=pt-BR&key=${apiKey}`;

  const data = await fetchJson(url);
  if (!data) return null;
  if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
    // OVER_QUERY_LIMIT / REQUEST_DENIED etc. -> deixa cair no fallback.
    if (data.status && data.status !== 'ZERO_RESULTS') {
      console.warn('[geocode] Google status', data.status, data.error_message ?? '');
    }
    return null;
  }

  const hit = data.results[0];
  const loc = hit.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;

  const locType = String(hit.geometry?.location_type ?? '');
  const precise = locType === 'ROOFTOP' || locType === 'RANGE_INTERPOLATED';

  return {
    latitude: loc.lat,
    longitude: loc.lng,
    approximate: !precise,
    provider: 'google' as const,
  };
}

// ---- Nominatim (fallback) ----
const IMPRECISE = new Set([
  'city', 'town', 'village', 'municipality', 'county', 'state',
  'region', 'country', 'postcode', 'suburb', 'neighbourhood', 'road',
]);
function nominatimPrecise(hit: any): boolean {
  const at = String(hit?.addresstype ?? '').toLowerCase();
  const cat = String(hit?.class ?? '').toLowerCase();
  const ty = String(hit?.type ?? '').toLowerCase();
  if (IMPRECISE.has(at) || IMPRECISE.has(ty)) return false;
  if (cat === 'boundary' || cat === 'place') return false;
  return true;
}

async function geocodeNominatim(input: GeoInput): Promise<GeoResult | null> {
  const numero = normalizeNumero(clean(input.numero));
  const qs = new URLSearchParams({
    street: [numero, input.logradouro].filter(Boolean).join(' '),
    city: clean(input.cidade),
    state: clean(input.estado),
    country: 'Brasil',
    format: 'jsonv2',
    addressdetails: '1',
    limit: '3',
    countrycodes: 'br',
  });
  const cepDigits = clean(input.cep).replace(/\D/g, '');
  if (cepDigits) qs.set('postalcode', cepDigits);

  let data = await fetchJson(
    `https://nominatim.openstreetmap.org/search?${qs.toString()}`,
    { headers: { 'User-Agent': NOMINATIM_UA } },
  );

  // Fallback livre se a estruturada nao achou.
  if (!Array.isArray(data) || data.length === 0) {
    const line1 = [input.logradouro, numero].filter(Boolean).join(', ');
    const free = [line1, input.bairro, input.cidade, input.estado, input.cep, 'Brasil']
      .map(clean).filter(Boolean).join(', ');
    data = await fetchJson(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(free)}&format=jsonv2&addressdetails=1&limit=3&countrycodes=br`,
      { headers: { 'User-Agent': NOMINATIM_UA } },
    );
  }

  if (!Array.isArray(data) || data.length === 0) return null;
  const hit = data.find(nominatimPrecise) ?? data[0];
  const lat = Number.parseFloat(hit.lat);
  const lon = Number.parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    latitude: lat,
    longitude: lon,
    approximate: !nominatimPrecise(hit),
    provider: 'nominatim' as const,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  let body: GeoInput | null = null;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body precisa ser JSON' });
  }
  if (!body || !clean(body.logradouro) || !clean(body.cidade) || !clean(body.estado)) {
    return json(400, { error: 'logradouro, cidade e estado sao obrigatorios' });
  }

  const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY') ?? '';

  // 1) Google (se configurado). 2) Nominatim como fallback.
  let result = apiKey ? await geocodeGoogle(body, apiKey) : null;
  if (!result) result = await geocodeNominatim(body);

  if (!result) return json(404, { error: 'Endereco nao localizado' });
  return json(200, result);
});
