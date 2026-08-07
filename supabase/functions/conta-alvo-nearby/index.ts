// Supabase Edge Function: conta-alvo-nearby
//
// "Conta Alvo" da Rota do dia: dado o GPS do vendedor, acha 1 restaurante bem
// avaliado (nota >= 4,5 e > 100 avaliacoes) num raio de 2 km, que AINDA NAO
// seja cliente, e materializa como LEAD no clients (origem='conta_alvo'). O
// Deal no HubSpot NAO e' criado aqui — so' no check-in (quando o vendedor
// visita), pra nao poluir o CRM com lugares nunca visitados.
//
// Fonte: Serper Maps (google.serper.dev/maps) — devolve rating, ratingCount,
// latitude, longitude, placeId. Custo baixissimo; cacheamos por celula (~1,5km)
// por ~14 dias em target_accounts pra 12 vendedores ficar ~US$0.
//
// Reuso: se o vendedor ja tem uma conta-alvo NAO visitada perto, devolve ela
// (nao cria outra a cada "Gerar rota").
//
// Deploy:   supabase functions deploy conta-alvo-nearby
// Secrets:  SERPER_API_KEY  (obrigatorio)
//           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automaticos)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Marcador de versao — aparece em toda resposta pra confirmar qual bundle esta
// no ar (o deploy do Supabase as vezes serve versao cacheada).
const VERSION = 'ca-v5-dismiss';

const SERPER_URL = 'https://google.serper.dev/maps';
const FETCH_TIMEOUT_MS = 15_000;

// Regra do negocio — DEFAULTS. Os valores efetivos vem da tabela route_config
// (editavel pelo gestor); caem nestes se a tabela/linha nao existir.
const DEFAULT_RATING = 4.5;
const DEFAULT_REVIEWS = 100;
const DEFAULT_RADIUS_M = 2000;

// Grade de cache ~1,5 km (0,0135 graus). Uma celula = uma busca no Serper por
// ~14 dias.
const CELL_DEG = 0.0135;
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Um lugar a menos de 80 m de um cliente existente = ja esta no CRM, nao
// prospecta de novo.
const NEAR_CLIENT_M = 80;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const toRad = (d: number) => (d * Math.PI) / 180;
function distMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}

const cellKey = (lat: number, lon: number) =>
  `${Math.round(lat / CELL_DEG)}:${Math.round(lon / CELL_DEG)}`;

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

type Place = {
  place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  reviews_count: number | null;
  category: string | null;
  address: string | null;
};

// Busca no Serper Maps e filtra pela regra (nota/avaliacoes/raio) — os limites
// vem da config (route_config), passados aqui.
async function serperNearby(
  lat: number, lon: number,
  minRating: number, minReviews: number, radiusM: number,
): Promise<Place[]> {
  const key = Deno.env.get('SERPER_API_KEY');
  if (!key) throw new Error('SERPER_API_KEY nao configurado');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(SERPER_URL, {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'restaurantes', ll: `@${lat},${lon},15z` }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Serper ${res.status}`);
    const body = await res.json();
    const places = Array.isArray(body?.places) ? body.places : [];
    const out: Place[] = [];
    for (const p of places) {
      const pid = p?.placeId ?? p?.cid;
      const plat = Number(p?.latitude);
      const plon = Number(p?.longitude);
      const rating = p?.rating != null ? Number(p.rating) : null;
      const reviews = p?.ratingCount != null ? Number(p.ratingCount) : null;
      if (!pid || !Number.isFinite(plat) || !Number.isFinite(plon)) continue;
      if (rating == null || reviews == null) continue;
      if (rating < minRating || reviews <= minReviews) continue;
      if (distMeters(lat, lon, plat, plon) > radiusM) continue;
      out.push({
        place_id: String(pid),
        name: String(p?.title ?? 'Restaurante'),
        latitude: plat,
        longitude: plon,
        rating,
        reviews_count: reviews,
        category: p?.type ? String(p.type) : null,
        address: p?.address ? String(p.address) : null,
      });
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let payload: { lat?: number; lon?: number; vendedor_id_hubspot?: string | null; created_by?: string | null };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'JSON invalido' });
  }
  const lat = Number(payload?.lat);
  const lon = Number(payload?.lon);
  const vendor = payload?.vendedor_id_hubspot ?? null;
  // clients.created_by e' NOT NULL (FK auth.users). A edge roda como service
  // role (sem usuario), entao o app manda o auth uid do vendedor logado.
  const createdBy = payload?.created_by ?? null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json(400, { error: 'lat/lon obrigatorios' });
  }

  const db = serviceClient();

  try {
    // Config editavel pelo gestor (route_config). Fallback pros defaults.
    const { data: cfg } = await db
      .from('route_config')
      .select('conta_alvo_raio_m, conta_alvo_nota_min, conta_alvo_reviews_min')
      .eq('id', 1)
      .maybeSingle();
    const radiusM = Number(cfg?.conta_alvo_raio_m) || DEFAULT_RADIUS_M;
    const minRating = Number(cfg?.conta_alvo_nota_min) || DEFAULT_RATING;
    const minReviews = Number(cfg?.conta_alvo_reviews_min) || DEFAULT_REVIEWS;
    // Bbox de dedup acompanha o raio (+~330m de folga) pra nao perder clientes.
    const bboxDeg = radiusM / 111320 + 0.003;

    // Clientes proximos (bbox ~ raio) — pra (1) reusar conta-alvo nao visitada e
    // (2) excluir lugares que ja sao clientes.
    const { data: nearRows, error: nearErr } = await db
      .from('clients')
      .select('id, nome, empresa, latitude, longitude, status, etapa, id_hubspot, vendedor_id_hubspot, visited_at, origem, conta_alvo_place_id, conta_alvo_dismissed')
      .gte('latitude', lat - bboxDeg).lte('latitude', lat + bboxDeg)
      .gte('longitude', lon - bboxDeg).lte('longitude', lon + bboxDeg)
      .not('latitude', 'is', null).not('longitude', 'is', null);
    if (nearErr) throw nearErr;
    const near = nearRows ?? [];

    // 1) Reuso: conta-alvo do vendedor, ainda NAO virou deal e NAO visitada,
    // dentro do raio -> devolve ela (nao cria outra a cada "Gerar rota").
    const reusable = near
      .filter((c: any) =>
        c.conta_alvo_place_id &&
        !c.conta_alvo_dismissed &&
        !c.id_hubspot &&
        !c.visited_at &&
        (vendor === null || c.vendedor_id_hubspot === vendor) &&
        distMeters(lat, lon, c.latitude, c.longitude) <= radiusM)
      .sort((a: any, b: any) =>
        distMeters(lat, lon, a.latitude, a.longitude) - distMeters(lat, lon, b.latitude, b.longitude));
    if (reusable.length > 0) {
      return json(200, { client: reusable[0], reused: true });
    }

    // 2) Candidatos: cache da celula (fresco) ou busca nova no Serper.
    const ck = cellKey(lat, lon);
    const freshSince = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    let candidates: Place[] = [];
    const { data: cached } = await db
      .from('target_accounts')
      .select('place_id, name, latitude, longitude, rating, reviews_count, category, address')
      .eq('cell_key', ck)
      .gte('fetched_at', freshSince);
    if (cached && cached.length > 0) {
      candidates = cached as Place[];
    } else {
      candidates = await serperNearby(lat, lon, minRating, minReviews, radiusM);
      if (candidates.length > 0) {
        const now = new Date().toISOString();
        await db.from('target_accounts').upsert(
          candidates.map((p) => ({ ...p, source: 'serper', cell_key: ck, fetched_at: now })),
          { onConflict: 'place_id' },
        );
      }
    }

    // 3) Exclui os que ja sao clientes: mesmo place_id, ou a < 80 m de qualquer
    // cliente existente.
    const usedPlaceIds = new Set(near.map((c: any) => c.conta_alvo_place_id).filter(Boolean));
    const isNearExistingClient = (p: Place) =>
      near.some((c: any) => distMeters(p.latitude, p.longitude, c.latitude, c.longitude) <= NEAR_CLIENT_M);
    const fresh = candidates
      .filter((p) => !usedPlaceIds.has(p.place_id) && !isNearExistingClient(p))
      .sort((a, b) => distMeters(lat, lon, a.latitude, a.longitude) - distMeters(lat, lon, b.latitude, b.longitude));

    if (fresh.length === 0) {
      return json(200, { client: null, reason: 'sem_conta_alvo' });
    }
    const pick = fresh[0];

    // 4) Materializa como LEAD (sem deal — o deal nasce no check-in). status
    // 'lead' pra bater com o isLead do markAsVisited (move pra "Visita" e cria
    // o deal na visita). Se o portal usar outro slug de lead, ajustar aqui.
    const status = 'lead';

    // Corrida: se o place_id ja foi materializado por outra chamada, reusa.
    const { data: existing } = await db
      .from('clients')
      .select('*')
      .eq('conta_alvo_place_id', pick.place_id)
      .maybeSingle();
    let client = existing;
    if (!client) {
      // created_by e' NOT NULL — sem o auth uid do vendedor nao da pra materializar.
      if (!createdBy) {
        return json(400, { error: 'created_by obrigatorio pra materializar a conta-alvo' });
      }
      const { data: inserted, error: insErr } = await db
        .from('clients')
        .insert({
          nome: pick.name,
          empresa: pick.name,
          latitude: pick.latitude,
          longitude: pick.longitude,
          endereco: pick.address,
          status,
          // NAO seta `origem`: e' coluna pre-existente com CHECK de valores
          // fixos. O marcador de conta-alvo e' conta_alvo_place_id (not null).
          conta_alvo_place_id: pick.place_id,
          conta_alvo_rating: pick.rating,
          conta_alvo_reviews: pick.reviews_count,
          vendedor_id_hubspot: vendor,
          geo_source: 'coords', // coords precisas do Google/Serper (raio normal de check-in)
          created_by: createdBy,
        })
        .select()
        .single();
      if (insErr) {
        // Provavel conflito de unique (place_id) numa corrida — tenta reusar.
        const { data: retry } = await db
          .from('clients').select('*').eq('conta_alvo_place_id', pick.place_id).maybeSingle();
        if (!retry) throw insErr;
        client = retry;
      } else {
        client = inserted;
      }
    }

    // Linka o cache -> cliente materializado.
    await db.from('target_accounts')
      .update({ client_id: client.id })
      .eq('place_id', pick.place_id);

    return json(200, { client, place: pick, ver: VERSION });
  } catch (err) {
    // Erros do supabase-js sao OBJETOS ({message,code,details,hint}) — String()
    // vira "[object Object]". Serializa os campos uteis pra depurar.
    const e = err as any;
    const detail =
      (e && (e.message || e.error_description || e.msg)) ||
      (typeof e === 'object' ? JSON.stringify(e) : String(e));
    console.error('[conta-alvo-nearby] erro', JSON.stringify(e));
    return json(500, {
      error: 'Erro interno',
      ver: VERSION,
      detail,
      code: e?.code ?? null,
      hint: e?.hint ?? null,
      details: e?.details ?? null,
    });
  }
});
