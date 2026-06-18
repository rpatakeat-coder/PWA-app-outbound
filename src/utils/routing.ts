// Roteamento por estradas via OSRM (Open Source Routing Machine).
// Instancia publica gratuita, sem API key. Rate limit nao publicado mas
// generoso pra uso normal. Pra prod em escala, considerar:
//  - Google Directions API ($5/1000 chamadas, com transito real)
//  - Mapbox Directions (free tier maior que Google)
//  - Self-hosted OSRM (zero custo, controle de SLA)
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

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
