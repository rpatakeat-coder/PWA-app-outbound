// Roteamento e otimizacao TSP. Suporta dois provedores via env:
//   - openrouteservice (ORS): free tier 2000 directions + 500 optimization/dia.
//     Requer EXPO_PUBLIC_ORS_API_KEY setado em .env.local.
//   - osrm publico (fallback): instancia demo gratuita, sem SLA.
//
// O app detecta automaticamente: se a chave ORS estiver setada, usa ORS;
// senao, cai pro OSRM. Trocar de provedor sem mudar codigo do app fora
// daqui.

const ORS_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY?.trim() || '';
const PROVIDER: 'ors' | 'osrm' = ORS_KEY ? 'ors' : 'osrm';

const OSRM_BASE = 'https://router.project-osrm.org';
const ORS_BASE = 'https://api.openrouteservice.org';

export type RoutePoint = { latitude: number; longitude: number };

export type RouteGeometry = {
  coordinates: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
};

export type OptimizedTrip = {
  // Ordem dos waypoints de entrada apos otimizacao. Ex.: input [base, A, B, C]
  // pode virar inputOrderToVisit=[0, 2, 1, 3] = visita base, B, A, C.
  inputOrderToVisit: number[];
  coordinates: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
};

export function getRoutingProvider(): 'ors' | 'osrm' {
  return PROVIDER;
}

// ============================================================
// Polyline ponto-a-ponto (mantem a ordem de entrada). Usado pelo
// hook useQuery em App.tsx pra visualizar a rota persistida.
// ============================================================
export async function fetchRouteGeometry(points: RoutePoint[]): Promise<RouteGeometry> {
  if (points.length < 2) {
    return { coordinates: [], distanceMeters: 0, durationSeconds: 0 };
  }
  return PROVIDER === 'ors' ? orsRoute(points) : osrmRoute(points);
}

async function osrmRoute(points: RoutePoint[]): Promise<RouteGeometry> {
  const coordsStr = points
    .map(p => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = await res.json();
  const route = data?.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords)) throw new Error('OSRM sem geometria');
  return {
    coordinates: coords.map((c: [number, number]) => ({ longitude: c[0], latitude: c[1] })),
    distanceMeters: Math.round(route.distance ?? 0),
    durationSeconds: Math.round(route.duration ?? 0),
  };
}

async function orsRoute(points: RoutePoint[]): Promise<RouteGeometry> {
  // ORS Directions v2 — POST com coordenadas no body. Mais eficiente que
  // o GET com query string (URL fica curta independente do nro de stops).
  const url = `${ORS_BASE}/v2/directions/driving-car/geojson`;
  const body = {
    // ORS espera [lon, lat] (mesma convencao GeoJSON).
    coordinates: points.map(p => [p.longitude, p.latitude]),
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': ORS_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/geo+json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`ORS HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  const feature = data?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords)) throw new Error('ORS sem geometria');
  const summary = feature?.properties?.summary ?? {};
  return {
    coordinates: coords.map((c: [number, number]) => ({ longitude: c[0], latitude: c[1] })),
    distanceMeters: Math.round(summary.distance ?? 0),
    durationSeconds: Math.round(summary.duration ?? 0),
  };
}

// ============================================================
// TSP — resolve "ordem otima" pelos pontos. Vendedor parte do primeiro
// ponto (GPS), nao precisa voltar ao inicio.
// ============================================================
export async function fetchOptimizedTrip(points: RoutePoint[]): Promise<OptimizedTrip> {
  if (points.length < 2) {
    return { inputOrderToVisit: [], coordinates: [], distanceMeters: 0, durationSeconds: 0 };
  }
  return PROVIDER === 'ors' ? orsOptimization(points) : osrmTrip(points);
}

async function osrmTrip(points: RoutePoint[]): Promise<OptimizedTrip> {
  const coordsStr = points
    .map(p => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(';');
  const url = `${OSRM_BASE}/trip/v1/driving/${coordsStr}?source=first&destination=any&roundtrip=false&overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM Trip HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`OSRM Trip code=${data.code}`);
  const trip = data?.trips?.[0];
  const coords = trip?.geometry?.coordinates;
  if (!Array.isArray(coords)) throw new Error('OSRM Trip sem geometria');
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

// ORS Optimization v1 (powered by VROOM). Modelo de problema:
//   - 1 veiculo partindo do "start" (GPS)
//   - N "jobs" (leads a visitar) com servico=0 (tempo de parada zero,
//     o que interessa eh so a ordem de visita)
//   - sem time windows, sem skills (pode adicionar depois)
async function orsOptimization(points: RoutePoint[]): Promise<OptimizedTrip> {
  const [start, ...stops] = points;
  const url = `${ORS_BASE}/optimization`;
  const body = {
    jobs: stops.map((p, idx) => ({
      id: idx + 1, // ids dos jobs comecam em 1 (idx 0 fica reservado pro start)
      location: [p.longitude, p.latitude],
    })),
    vehicles: [{
      id: 1,
      profile: 'driving-car',
      start: [start.longitude, start.latitude],
      // sem 'end' → vendedor termina onde o ultimo job estiver (open-ended)
    }],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': ORS_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`ORS Optimization HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route?.steps?.length) throw new Error('ORS Optimization sem rota');

  // Steps inclui 'start', N 'job' e 'end' (se houver). Filtra pra pegar
  // so a ordem dos jobs.
  const visitedJobIds: number[] = route.steps
    .filter((s: any) => s.type === 'job')
    .map((s: any) => s.id as number);

  // Mapa pro formato do app: inputOrderToVisit[0] = 0 (start sempre primeiro),
  // [1..N] = indice no array de input de cada job na ordem visitada.
  const inputOrderToVisit: number[] = [0, ...visitedJobIds];

  // ORS Optimization NAO devolve a polyline detalhada — so a ordem.
  // Fazemos uma segunda chamada ao Directions com a ordem ja decidida
  // pra ter o polyline pra desenhar no mapa.
  const orderedPoints: RoutePoint[] = [start, ...visitedJobIds.map(id => stops[id - 1])];
  let geom: RouteGeometry;
  try {
    geom = await orsRoute(orderedPoints);
  } catch {
    // Se Directions falhar (raro), devolve linha reta entre os pontos
    geom = {
      coordinates: orderedPoints,
      distanceMeters: route.distance ?? 0,
      durationSeconds: route.duration ?? 0,
    };
  }

  return {
    inputOrderToVisit,
    coordinates: geom.coordinates,
    distanceMeters: geom.distanceMeters || route.distance || 0,
    durationSeconds: geom.durationSeconds || route.duration || 0,
  };
}
