// Carregador unico da Google Maps JavaScript API.
//
// Por que singleton: cada `new Loader().load()` que baixa o script conta como
// um carregamento de biblioteca, e — mais importante — instanciar
// `google.maps.Map` duas vezes cobra DOIS "map loads" no SKU Dynamic Maps
// (10.000/mes gratis, depois US$ 7/1.000). O app tem TRES superficies de mapa
// (principal, navegacao, editar localizacao); se cada uma criasse a propria
// instancia a cada montagem, o consumo saltaria de ~5k pra ~26k eventos/mes.
// Aqui o script carrega uma vez so; a reutilizacao da INSTANCIA do mapa fica
// a cargo do pool em ./instancePool.
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

// Chaves EXPO_PUBLIC_* sao inlinadas no bundle — ou seja, ficam publicas.
// Isso e' inerente a qualquer mapa no browser: a key de browser SEMPRE viaja
// pro cliente. A protecao correta nao e' esconder, e' restringir no console do
// Google Cloud (HTTP referrer = seu dominio + apenas Maps JavaScript API).
// NUNCA reutilizar aqui a GOOGLE_GEOCODING_API_KEY, que e' secret de servidor
// na Edge Function `geocode` e nao tem restricao de referrer.
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

// Map ID e' obrigatorio pra usar AdvancedMarkerElement (os markers custom do
// app sao views React inteiras, nao icones — so o Advanced aceita HTML).
// Um Map ID de tipo VECTOR tambem e' o que habilita heading/tilt, usados no
// modo navegacao (animateCamera com pitch/heading). Com raster, o mapa
// funciona mas ignora a inclinacao.
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID';

export const GOOGLE_MAP_ID = MAP_ID;

export function hasApiKey(): boolean {
  return API_KEY.length > 0;
}

let loadPromise: Promise<typeof google.maps> | null = null;

/**
 * Resolve quando a API estiver pronta. Chamadas concorrentes compartilham a
 * mesma promise — montar os tres mapas junto nao dispara tres downloads.
 */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (loadPromise) return loadPromise;

  if (!API_KEY) {
    loadPromise = Promise.reject(
      new Error(
        'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY nao configurada. Defina no .env.local ' +
          '(dev) e nas Environment Variables da Vercel (producao).',
      ),
    );
    return loadPromise;
  }

  // API funcional do @googlemaps/js-api-loader v2 — a classe Loader (com
  // .load()) foi depreciada e removida da superficie publica na v2.
  setOptions({
    key: API_KEY,
    v: 'weekly',
    language: 'pt-BR',
    region: 'BR',
  });

  // 'maps' traz Map/Polyline/Circle; 'marker' traz AdvancedMarkerElement e
  // PinElement. Depois que ambas resolvem, o namespace global `google.maps`
  // esta completo — e' ele que o resto da camada consome.
  loadPromise = Promise.all([importLibrary('maps'), importLibrary('marker')]).then(
    () => google.maps,
  );
  return loadPromise;
}
