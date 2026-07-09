import { supabase } from '../integrations/supabase/client';

const DEFAULT_TIMEOUT_MS = 8000;
const NOMINATIM_UA = 'TakeatRPA-App (contact: brittes@takeat.app)';

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export class GeocodingError extends Error {
  constructor(message: string, public kind: 'timeout' | 'network' | 'not_found' | 'rate_limit' | 'unknown') {
    super(message);
    this.name = 'GeocodingError';
  }
}

function toGeocodingError(err: unknown): GeocodingError {
  if (err instanceof GeocodingError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === 'AbortError') {
    return new GeocodingError('Tempo limite excedido', 'timeout');
  }
  if (/network|fetch/i.test(message)) {
    return new GeocodingError('Falha de rede', 'network');
  }
  return new GeocodingError(message, 'unknown');
}

type CepResult = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  isGeneric: boolean;
};

// Fallback: BrasilAPI (agrega varias bases de CEP). Cobre CEPs que o ViaCEP
// nao conhece (ex.: 90560-004 existe mas o ViaCEP retorna erro). Retorna null
// se nem a BrasilAPI achar; lanca so em falha tecnica de rede.
async function fetchCepBrasilApi(cleanCep: string): Promise<CepResult | null> {
  try {
    const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
    if (res.status === 404) return null; // CEP realmente nao existe em nenhuma base
    if (!res.ok) return null;            // outra falha: nao trava o cadastro
    const data = await res.json();
    if (!data?.city) return null;
    const logradouro = data.street || '';
    return {
      cep: `${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}`,
      logradouro,
      bairro: data.neighborhood || '',
      cidade: data.city,
      estado: data.state,
      isGeneric: !logradouro,
    };
  } catch {
    return null;
  }
}

/**
 * Busca CEP: ViaCEP primeiro, BrasilAPI como fallback (o ViaCEP tem buracos —
 * ha CEPs validos que ele nao conhece). Retorna null so quando NENHUMA das
 * bases acha; lanca GeocodingError apenas em falha tecnica (rede/timeout).
 */
export async function fetchCepData(cep: string): Promise<CepResult | null> {
  const cleanCep = cep.replace(/\D/g, '');
  if (cleanCep.length !== 8) return null;

  try {
    const res = await fetchWithTimeout(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!res.ok) throw new GeocodingError(`ViaCEP ${res.status}`, 'unknown');
    const data = await res.json();
    // ViaCEP nao achou -> tenta a BrasilAPI antes de dizer "nao encontrado".
    if (data.erro) return await fetchCepBrasilApi(cleanCep);

    return {
      cep: `${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}`,
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      cidade: data.localidade,
      estado: data.uf,
      isGeneric: !data.logradouro,
    };
  } catch (err) {
    // ViaCEP fora do ar / timeout: ainda tenta a BrasilAPI antes de falhar.
    const fromFallback = await fetchCepBrasilApi(cleanCep);
    if (fromFallback) return fromFallback;
    throw toGeocodingError(err);
  }
}

// Tipos de resultado que NÃO são o ponto exato do endereço — quando o
// Nominatim cai num desses, o pin fica no centroide da rua/bairro/cidade, não
// na casa. Usado pra marcar geo_approximate. Mesma lista da edge function
// repair-client-geocodes (manter em sincronia).
const IMPRECISE_TYPES = new Set([
  'city', 'town', 'village', 'municipality', 'county', 'state',
  'region', 'country', 'postcode', 'suburb', 'neighbourhood', 'road',
]);

function isPreciseHit(hit: any): boolean {
  const addresstype = String(hit?.addresstype ?? '').toLowerCase();
  const category = String(hit?.class ?? '').toLowerCase();
  const type = String(hit?.type ?? '').toLowerCase();
  if (IMPRECISE_TYPES.has(addresstype) || IMPRECISE_TYPES.has(type)) return false;
  if (category === 'boundary' || category === 'place') return false;
  return true;
}

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  // false quando o Nominatim retornou o número exato da casa; true quando caiu
  // no centroide da rua/bairro (limite do OSM no Brasil). Alimenta
  // clients.geo_approximate pra sinalizar "pin pode estar impreciso".
  approximate: boolean;
};

/**
 * Geocodifica endereço livre -> lat/lng via Nominatim (busca por texto `q`).
 * Retorna null se não encontrou; lança GeocodingError em falhas.
 * Marca approximate=true quando o hit não é um ponto de endereço exato.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=jsonv2&addressdetails=1&limit=3&countrycodes=br`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': NOMINATIM_UA } });
    if (res.status === 429) throw new GeocodingError('Nominatim rate limit', 'rate_limit');
    if (!res.ok) throw new GeocodingError(`Nominatim ${res.status}`, 'unknown');
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    // Prefere o primeiro hit preciso (número de casa); senão usa o primeiro.
    const hit = data.find(isPreciseHit) ?? data[0];
    return {
      latitude: parseFloat(hit.lat),
      longitude: parseFloat(hit.lon),
      approximate: !isPreciseHit(hit),
    };
  } catch (err) {
    throw toGeocodingError(err);
  }
}

/**
 * Geocodificação ESTRUTURADA via Nominatim (street/city/state separados). É a
 * forma que dá mais chance de casar o número exato da casa no Brasil. Faz
 * fallback pra busca livre quando a estruturada não acha nada.
 * `numero` vai junto do logradouro no campo `street` (formato esperado: "1086 Rua X").
 */
export async function geocodeStructured(params: {
  logradouro: string;
  numero?: string | null;
  cidade: string;
  estado: string;
  cep?: string | null;
  bairro?: string | null;
}): Promise<GeocodeResult | null> {
  const { logradouro, numero, cidade, estado, cep } = params;
  if (!logradouro || !cidade || !estado) return null;

  // Fonte primária: Edge Function `geocode` (Google Geocoding no servidor, com
  // a API key protegida; cai no Nominatim do lado servidor se o Google falhar).
  // O app nunca vê a key. Se a própria function estiver fora (rede/deploy),
  // cai no fallback local do Nominatim mais abaixo.
  try {
    const { data, error } = await supabase.functions.invoke('geocode', {
      body: {
        logradouro,
        numero: numero ?? null,
        bairro: params.bairro ?? null,
        cidade,
        estado,
        cep: cep ?? null,
      },
    });
    if (!error && data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        approximate: data.approximate === true,
      };
    }
  } catch (err) {
    console.warn('[geocode] edge function indisponível, usando Nominatim local:', err);
  }

  // Fallback local (Nominatim direto do app) — só quando a Edge Function não
  // respondeu. Normaliza o número e tenta busca estruturada, depois livre.
  const numTrim = (numero ?? '').trim();
  const numClean = /^s\/?n$/i.test(numTrim) ? '' : (numTrim.match(/\d+/)?.[0] ?? '');
  try {
    const qs = new URLSearchParams({
      street: [numClean, logradouro].filter(Boolean).join(' '),
      city: cidade,
      state: estado,
      country: 'Brasil',
      format: 'jsonv2',
      addressdetails: '1',
      limit: '3',
      countrycodes: 'br',
    });
    if (cep) qs.set('postalcode', cep.replace(/\D/g, ''));

    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?${qs.toString()}`,
      { headers: { 'User-Agent': NOMINATIM_UA } },
    );
    if (res.status === 429) throw new GeocodingError('Nominatim rate limit', 'rate_limit');
    if (!res.ok) throw new GeocodingError(`Nominatim ${res.status}`, 'unknown');
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const hit = data.find(isPreciseHit) ?? data[0];
      return {
        latitude: parseFloat(hit.lat),
        longitude: parseFloat(hit.lon),
        approximate: !isPreciseHit(hit),
      };
    }
  } catch (err) {
    if (err instanceof GeocodingError && err.kind === 'rate_limit') throw err;
  }

  const line1 = [logradouro, numClean].filter(Boolean).join(', ');
  const freeQuery = [line1, params.bairro, cidade, estado, cep, 'Brasil'].filter(Boolean).join(', ');
  return geocodeAddress(freeQuery);
}

/**
 * Reverse geocoding via Nominatim. Retorna null em "não encontrado"; lança GeocodingError em falhas.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<{
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': NOMINATIM_UA } });
    if (res.status === 429) throw new GeocodingError('Nominatim rate limit', 'rate_limit');
    if (!res.ok) throw new GeocodingError(`Nominatim ${res.status}`, 'unknown');
    const data = await res.json();
    if (data.error) return null;

    const addr = data.address || {};
    return {
      endereco: addr.road || '',
      numero: addr.house_number || '',
      bairro: addr.suburb || addr.neighbourhood || '',
      cidade: addr.city || addr.town || addr.village || '',
      estado: addr.state || '',
      cep: (addr.postcode || '').replace(/\D/g, ''),
    };
  } catch (err) {
    throw toGeocodingError(err);
  }
}

