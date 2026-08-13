// Conversoes entre o vocabulario do react-native-maps (Region com deltas) e o
// da Google Maps JS API (center + zoom, ou LatLngBounds).
//
// Manter isso isolado e' o que permite o App.tsx continuar falando em
// `{ latitude, longitude, latitudeDelta, longitudeDelta }` sem saber que por
// baixo virou Google Maps.

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Region -> LatLngBounds. O delta e' a LARGURA TOTAL, entao vai metade pra cada lado. */
export function regionToBounds(region: Region): google.maps.LatLngBoundsLiteral {
  const halfLat = Math.abs(region.latitudeDelta) / 2;
  const halfLng = Math.abs(region.longitudeDelta) / 2;
  return {
    north: region.latitude + halfLat,
    south: region.latitude - halfLat,
    east: region.longitude + halfLng,
    west: region.longitude - halfLng,
  };
}

/** Bounds reais do mapa -> Region. Exato: e' so a diferenca dos cantos. */
export function boundsToRegion(bounds: google.maps.LatLngBounds): Region {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const north = ne.lat();
  const south = sw.lat();
  let east = ne.lng();
  const west = sw.lng();

  // Antimeridiano: quando o viewport cruza a linha de data, east < west e a
  // subtracao daria delta negativo. Nao acontece no Brasil, mas o mapa aceita
  // pan livre e um delta negativo quebraria o fitBounds seguinte.
  if (east < west) east += 360;

  return {
    latitude: (north + south) / 2,
    longitude: (east + west) / 2,
    latitudeDelta: north - south,
    longitudeDelta: east - west,
  };
}

/**
 * Zoom equivalente a um longitudeDelta, dada a largura do viewport.
 *
 * No esquema de tiles do Google o mundo tem 256px de largura no zoom 0 e
 * dobra a cada nivel: largura_px = 256 * 2^zoom. Se `width` pixels cobrem
 * `lngDelta` graus, entao 360 graus cobririam 360/lngDelta * width pixels.
 * Igualando as duas e isolando o zoom chega-se na formula abaixo.
 *
 * Usado so na criacao do mapa (antes disso nao ha bounds pra medir); depois
 * o caminho preferido e' fitBounds, que e' exato.
 */
export function zoomForLongitudeDelta(lngDelta: number, width: number): number {
  if (!(lngDelta > 0) || !(width > 0)) return 14;
  const zoom = Math.log2((360 * width) / (256 * lngDelta));
  // Clamp no intervalo aceito pela API; fora dele o setZoom e' ignorado.
  return Math.min(22, Math.max(1, zoom));
}

/** Converte o LatLng do app pro literal da Google. */
export function toLatLngLiteral(p: LatLng): google.maps.LatLngLiteral {
  return { lat: p.latitude, lng: p.longitude };
}

/** Bounds que cobrem todos os pontos. Retorna null se a lista vier vazia. */
export function boundsForCoordinates(
  coords: LatLng[],
  maps: typeof google.maps,
): google.maps.LatLngBounds | null {
  const valid = coords.filter(
    (c) => c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
  );
  if (valid.length === 0) return null;

  const bounds = new maps.LatLngBounds();
  valid.forEach((c) => bounds.extend(toLatLngLiteral(c)));

  // Um ponto so (ou varios identicos) gera bounds de area zero — o fitBounds
  // reagiria com zoom maximo. Abre uma janela minima de ~2km em volta.
  if (valid.length === 1 || bounds.getNorthEast().equals(bounds.getSouthWest())) {
    const p = valid[0];
    const pad = 0.01;
    bounds.extend({ lat: p.latitude + pad, lng: p.longitude + pad });
    bounds.extend({ lat: p.latitude - pad, lng: p.longitude - pad });
  }

  return bounds;
}
