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

/**
 * Busca CEP no ViaCEP. Retorna null se o CEP não existe; lança GeocodingError em falhas técnicas.
 */
export async function fetchCepData(cep: string) {
  const cleanCep = cep.replace(/\D/g, '');
  if (cleanCep.length !== 8) return null;

  try {
    const res = await fetchWithTimeout(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!res.ok) throw new GeocodingError(`ViaCEP ${res.status}`, 'unknown');
    const data = await res.json();
    if (data.erro) return null;

    return {
      cep: `${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}`,
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      cidade: data.localidade,
      estado: data.uf,
      isGeneric: !data.logradouro,
    };
  } catch (err) {
    throw toGeocodingError(err);
  }
}

/**
 * Geocodifica endereço -> lat/lng via Nominatim. Retorna null se não encontrou; lança GeocodingError em falhas.
 */
export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': NOMINATIM_UA } });
    if (res.status === 429) throw new GeocodingError('Nominatim rate limit', 'rate_limit');
    if (!res.ok) throw new GeocodingError(`Nominatim ${res.status}`, 'unknown');
    const data = await res.json();
    if (data.length > 0) {
      return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
    }
    return null;
  } catch (err) {
    throw toGeocodingError(err);
  }
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

