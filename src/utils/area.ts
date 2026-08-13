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

// ===== Carregamento por área visível do mapa =====

export interface Bounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

// Quanto se busca ALÉM do que está na tela, em cada direção. 0.5 = meia tela
// de folga de cada lado (área buscada ≈ 2x a visível). É o que faz um
// arrastar curto não disparar busca nova: os pins do vizinho já vieram.
const PADDING_RATIO = 0.4;

// Grade em que a caixa é encaixada, em graus (~5.5 km). Sem isso, cada pixel
// de arraste geraria uma queryKey diferente e o cache nunca seria reusado.
// A caixa sempre cresce até a linha da grade — nunca encolhe — pra o
// encaixe não cortar pin da borda.
const SNAP_DEG = 0.05;

// Largura máxima que ainda vale buscar. Acima disso a caixa pegaria estados
// inteiros e o ganho de carregar por área desapareceria — é quando a tela
// pede "aproxime para carregar".
//
// 150 km foi escolhido pra caber uma região metropolitana inteira: em São
// Paulo essa caixa dá ~850 clientes (~1,3 MB), na mesma ordem do que o app
// carregava antes com o raio fixo. Abaixo disso o aviso aparecia já no zoom
// de "grande SP", que é um enquadramento de uso normal.
export const MAX_VIEWPORT_KM = 150;

/** Largura da caixa em km, medida na latitude central (onde ela é mais larga no Brasil). */
export function boundsWidthKm(b: Bounds): number {
  const latMid = (b.latMin + b.latMax) / 2;
  return (b.lonMax - b.lonMin) * 111 * Math.cos((latMid * Math.PI) / 180);
}

/** Altura da caixa em km. */
export function boundsHeightKm(b: Bounds): number {
  return (b.latMax - b.latMin) * 111;
}

/**
 * Região visível do mapa -> caixa a buscar, com folga e encaixada na grade.
 *
 * Devolve `null` quando a área é grande demais (ver MAX_VIEWPORT_KM): o
 * chamador usa isso pra não buscar e avisar o usuário.
 */
export function boundsFromRegion(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}): Bounds | null {
  const halfLat = (Math.abs(region.latitudeDelta) / 2) * (1 + PADDING_RATIO);
  const halfLon = (Math.abs(region.longitudeDelta) / 2) * (1 + PADDING_RATIO);

  const raw: Bounds = {
    latMin: region.latitude - halfLat,
    latMax: region.latitude + halfLat,
    lonMin: region.longitude - halfLon,
    lonMax: region.longitude + halfLon,
  };

  // Encaixa pra fora: floor no mínimo, ceil no máximo.
  const snapped: Bounds = {
    latMin: Math.floor(raw.latMin / SNAP_DEG) * SNAP_DEG,
    latMax: Math.ceil(raw.latMax / SNAP_DEG) * SNAP_DEG,
    lonMin: Math.floor(raw.lonMin / SNAP_DEG) * SNAP_DEG,
    lonMax: Math.ceil(raw.lonMax / SNAP_DEG) * SNAP_DEG,
  };

  if (boundsWidthKm(snapped) > MAX_VIEWPORT_KM || boundsHeightKm(snapped) > MAX_VIEWPORT_KM) {
    return null;
  }

  return snapped;
}

/**
 * Caixa de RENDERIZAÇÃO — o que vira pino na tela. Bem menor que a de busca.
 *
 * São coisas diferentes: buscamos com folga pra arrastar sem refazer a
 * consulta, mas DESENHAR tudo que veio é o que enche o DOM. Pior: acima do
 * `maxZoom` do clustering, a biblioteca anexa ao mapa todos os markers —
 * inclusive os fora da tela — e eles ficam lá. Recortar aqui torna a
 * contagem de pinos independente desse comportamento.
 *
 * Margem de 15% pra o pino não nascer bem na borda durante o arraste, e
 * encaixe numa grade de 0,01° (~1,1 km) pra a lista não mudar a cada pixel.
 */
export function boundsForRender(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}): Bounds {
  const GRID = 0.01;
  const halfLat = (Math.abs(region.latitudeDelta) / 2) * 1.15;
  const halfLon = (Math.abs(region.longitudeDelta) / 2) * 1.15;
  return {
    latMin: Math.floor((region.latitude - halfLat) / GRID) * GRID,
    latMax: Math.ceil((region.latitude + halfLat) / GRID) * GRID,
    lonMin: Math.floor((region.longitude - halfLon) / GRID) * GRID,
    lonMax: Math.ceil((region.longitude + halfLon) / GRID) * GRID,
  };
}

/** Chave estável pra queryKey — os valores já vêm encaixados na grade. */
export function boundsKey(b: Bounds): string {
  const f = (n: number) => n.toFixed(2);
  return `${f(b.latMin)},${f(b.latMax)},${f(b.lonMin)},${f(b.lonMax)}`;
}

/** true se `inner` está inteiramente dentro de `outer` — usado pra evitar buscar de novo. */
export function boundsContains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.latMin <= inner.latMin &&
    outer.latMax >= inner.latMax &&
    outer.lonMin <= inner.lonMin &&
    outer.lonMax >= inner.lonMax
  );
}
