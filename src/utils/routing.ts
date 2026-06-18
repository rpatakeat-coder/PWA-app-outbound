// Roteamento por estradas via OSRM (Open Source Routing Machine).
// Instancia publica gratuita, sem API key. Rate limit nao publicado mas
// generoso pra uso normal. Pra prod em escala, considerar:
//  - Google Directions API ($5/1000 chamadas, com transito real)
//  - Mapbox Directions (free tier maior que Google)
//  - Self-hosted OSRM (zero custo, controle de SLA)
const OSRM_BASE = 'https://router.project-osrm.org';
const OSRM_URL = `${OSRM_BASE}/route/v1/driving`;
const OSRM_TRIP_URL = `${OSRM_BASE}/trip/v1/driving`;

export type RoutePoint = { latitude: number; longitude: number };

export type RouteGeometry = {
  coordinates: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
};

export async function fetchRouteGeometry(points: RoutePoint[]): Promise<RouteGeometry> {
  if (points.length < 2) {
    return { coordinates: [], distanceMeters: 0, durationSeconds: 0 };
  }

  // OSRM espera "lon,lat;lon,lat;..." (atencao: longitude PRIMEIRO).
  const coordsStr = points
    .map(p => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(';');
  const url = `${OSRM_URL}/${coordsStr}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM respondeu HTTP ${res.status}`);
  }
  const data = await res.json();
  const route = data?.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) {
    throw new Error('OSRM nao retornou geometria');
  }

  return {
    // GeoJSON eh [lon, lat]; convertendo pro formato do react-native-maps.
    coordinates: coords.map((c: [number, number]) => ({
      longitude: c[0],
      latitude: c[1],
    })),
    distanceMeters: Math.round(route.distance ?? 0),
    durationSeconds: Math.round(route.duration ?? 0),
  };
}

export type OptimizedTrip = {
  // Ordem dos waypoints de entrada apos otimizacao. Ex.: input [base, A, B, C]
  // pode virar inputOrder=[0, 2, 1, 3] = visita base, B, A, C.
  inputOrderToVisit: number[];
  coordinates: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
};

// Resolve TSP usando rede viaria real (OSRM /trip). Source fixo no primeiro
// ponto (base/GPS do vendedor) e destination livre — algoritmo escolhe o
// melhor endpoint pra minimizar duracao total. roundtrip=false porque
// vendedor nao precisa voltar pro ponto inicial no fim do dia.
//
// OSRM otimiza por duracao (tempo); como em rotas urbanas isso correlaciona
// fortemente com distancia, atende o pedido de "menor distancia E menor tempo".
export async function fetchOptimizedTrip(points: RoutePoint[]): Promise<OptimizedTrip> {
  if (points.length < 2) {
    return { inputOrderToVisit: [], coordinates: [], distanceMeters: 0, durationSeconds: 0 };
  }

  const coordsStr = points
    .map(p => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(';');
  const url = `${OSRM_TRIP_URL}/${coordsStr}?source=first&destination=any&roundtrip=false&overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM Trip HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`OSRM Trip respondeu code=${data.code}`);

  const trip = data?.trips?.[0];
  const coords = trip?.geometry?.coordinates;
  if (!Array.isArray(coords)) throw new Error('OSRM Trip sem geometria');

  // OSRM devolve um array waypoints em ordem de INPUT; cada um tem
  // waypoint_index = posicao na rota otimizada. Inverte pra obter
  // [posicaoOtimizada] -> indiceNoInput.
  const waypoints: Array<{ waypoint_index: number }> = data?.waypoints ?? [];
  const inputOrderToVisit: number[] = new Array(waypoints.length).fill(-1);
  waypoints.forEach((wp, inputIdx) => {
    if (typeof wp.waypoint_index === 'number' && wp.waypoint_index >= 0) {
      inputOrderToVisit[wp.waypoint_index] = inputIdx;
    }
  });

  return {
    inputOrderToVisit,
    coordinates: coords.map((c: [number, number]) => ({ longitude: c[0], latitude: c[1] })),
    distanceMeters: Math.round(trip.distance ?? 0),
    durationSeconds: Math.round(trip.duration ?? 0),
  };
}
