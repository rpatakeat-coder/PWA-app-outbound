// Raio fixo do filtro "minha área". Por enquanto hardcoded — quando
// quiser configurável por setor ou por usuário, expor via DB.
export const AREA_RADIUS_KM = 200;

// Bounding box quadrado em volta de um ponto. Aproximação suficiente
// pra um filtro de "uns 200 km": a diferença entre quadrado e círculo
// real (PostGIS ST_DWithin) só importa nas bordas do raio e não justifica
// instalar PostGIS pra esse caso.
//
// Δlat constante: 1° ≈ 111 km em qualquer latitude.
// Δlon depende da latitude: 1° = 111 * cos(lat) km (mais estreito perto
// dos polos). Pro Brasil entre -33° e +5° dá uma variação real.
export function bboxAround(lat: number, lon: number, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    latMin: lat - dLat,
    latMax: lat + dLat,
    lonMin: lon - dLon,
    lonMax: lon + dLon,
  };
}

// Arredonda coordenadas pra estabilizar a queryKey do React Query.
// 2 casas decimais ≈ 1 km de precisão — jitter de GPS parado não
// invalida cache, mas deslocamento real (>~1 km) sim.
export function roundCoordsForKey(lat: number, lon: number) {
  return {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
  };
}
