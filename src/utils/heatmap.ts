// Mapa de calor de visitas (gestor). Como o app usa Apple Maps no iOS (nao
// setamos PROVIDER_GOOGLE), o componente <Heatmap> nativo do react-native-maps
// — que so roda com Google Maps — nao serve. Em vez dele, desenhamos <Circle>
// translucidos agregados numa GRADE: funciona igual em Apple e Google Maps.
//
// A grade evita renderizar milhares de circulos: cada celula (~HEAT_CELL_M de
// lado) vira um circulo cuja cor/opacidade/raio cresce com a contagem de
// visitas dentro dela.

// Lado da celula da grade, em metros. ~180m ≈ um par de quarteiroes: junta
// check-ins do mesmo ponto/rua sem borrar bairros vizinhos.
export const HEAT_CELL_M = 180;

// Teto de circulos desenhados. MapKit aguenta algumas centenas de overlays;
// acima disso o pan/zoom trava. Passando do teto, mantemos so as celulas mais
// quentes (as com mais visitas) — que sao as que importam num mapa de calor.
export const HEAT_MAX_CIRCLES = 300;

export interface HeatCell {
  lat: number;
  lon: number;
  n: number; // visitas nesta celula
}

// Metro -> grau. Latitude e ~constante (111.32 km/grau); longitude encolhe com
// cos(lat), entao usamos a latitude media dos pontos como referencia (a area de
// atuacao de um time cabe numa faixa curta de latitude, o erro e' desprezivel).
export function buildHeatCells(
  points: { lat: number; lon: number }[],
): { cells: HeatCell[]; max: number } {
  if (points.length === 0) return { cells: [], max: 0 };

  const refLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const latStep = HEAT_CELL_M / 111320;
  const lonStep = HEAT_CELL_M / (111320 * Math.cos((refLat * Math.PI) / 180));

  const grid = new Map<string, { latSum: number; lonSum: number; n: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const gi = Math.round(p.lat / latStep);
    const gj = Math.round(p.lon / lonStep);
    const key = `${gi}:${gj}`;
    const c = grid.get(key);
    if (c) {
      c.latSum += p.lat;
      c.lonSum += p.lon;
      c.n += 1;
    } else {
      grid.set(key, { latSum: p.lat, lonSum: p.lon, n: 1 });
    }
  }

  let cells: HeatCell[] = [];
  for (const c of grid.values()) {
    cells.push({ lat: c.latSum / c.n, lon: c.lonSum / c.n, n: c.n });
  }

  const max = cells.reduce((m, c) => Math.max(m, c.n), 0);

  // Estourou o teto? Fica so com as celulas mais quentes.
  if (cells.length > HEAT_MAX_CIRCLES) {
    cells = cells.sort((a, b) => b.n - a.n).slice(0, HEAT_MAX_CIRCLES);
  }

  return { cells, max };
}

// Intensidade normalizada [0,1] de uma celula. Curva de potencia (0.6) em vez de
// linear: sem ela, com um ou dois pontos MUITO quentes o resto do mapa ficaria
// todo verde. Assim os niveis intermediarios aparecem melhor.
export function heatIntensity(n: number, max: number): number {
  if (max <= 1) return 1;
  return Math.pow(n / max, 0.6);
}

// Escala de densidade de visita: UMA familia de cor, quatro degraus. t em [0,1].
//
// POR QUE NAO O ARCO-IRIS QUE ESTAVA AQUI
// Verde -> amarelo -> laranja -> vermelho e' a escala de TEMPERATURA DO FUNIL
// (src/constants/stages.ts), onde vermelho quer dizer quente/urgente e verde,
// frio. No mapa de calor vermelho significava MUITA visita, que e' bom, e verde
// pouca, que e' ruim — a mesma paleta dizendo o contrario do que diz no resto
// do app, sobre o mesmo mapa em que os pins usam a outra leitura. Quem aprendeu
// que vermelho e' lead quente lia o calor invertido.
//
// O teal e' a mesma familia do heatmap do cockpit do gestor, entao densidade de
// visita passa a ter uma cor so' no app inteiro, e nao colide com o funil.
// Mais escuro = mais visita, sem ambiguidade.
export function heatColor(t: number, alpha: number): string {
  const stops = [
    [214, 242, 236], // #D6F2EC  (poucas visitas)
    [143, 224, 213], // #8FE0D5
    [63, 191, 173], // #3FBFAD
    [29, 150, 136], // #1D9688  (muitas visitas)
  ];
  const clamped = Math.max(0, Math.min(1, t));
  const x = clamped * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgba(${r},${g},${bl},${alpha})`;
}

// Cores fixas da legenda (menos -> mais), pra desenhar a barra sem depender do
// MapView. Sao 24 passos, e nao os 4 degraus, porque o StyleSheet do RN nao tem
// linear-gradient: a barra e' uma fila de <View> de cor solida, e com poucos
// passos ela vira faixa listrada em vez de gradiente. Interpolar aqui mantem a
// legenda descrevendo exatamente a mesma rampa que heatColor() pinta no mapa.
export const HEAT_LEGEND_STOPS = Array.from({ length: 24 }, (_, i) =>
  heatColor(i / 23, 1),
);
