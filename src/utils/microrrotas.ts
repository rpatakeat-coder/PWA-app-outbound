// Rota automática com microrrotas (28/09/2026, Julyan: "a rota automática com
// microrrotas, pra ficar mais perto").
//
// MICRORROTA = um punhado de portas que se faz A PÉ: cada porta a até `raioPe`
// (300 m) de outra do grupo. O dia é uma sequência de microrrotas: de carro entre
// elas, a pé dentro delas. É o que a folha do mapa já chama de "portas boas a pé".
//
// 1. Agrupar: a porta de maior peso ainda solta é a semente; o grupo cresce por
//    vizinhança (qualquer membro a até `raioPe`), pelas de maior peso, até
//    `maxPorMicro`.
// 2. Escolher: os grupos com parada OBRIGATÓRIA (o que o Cockpit já planejou para
//    hoje) entram sempre. Depois, a partir de onde a pessoa está, o grupo que mais
//    vale pelo deslocamento — peso ÷ (1 + km/2) — até bater a meta. O último grupo
//    entra inteiro (não se corta uma quadra ao meio) até meta + folga.
// 3. Ordenar: grupos pelo mais próximo do ponto atual (encadeado); dentro do grupo,
//    a porta mais perto da anterior.
//
// Puro: não lê banco nem tela, para dar para testar sozinho (microrrotas.teste.ts).

export type Candidata = {
  id: string;
  lat: number;
  lng: number;
  /** Quanto vale visitar hoje (SLA, tarefa, etapa, conta-alvo…). */
  peso: number;
  /** Já está no plano de hoje: entra sempre. */
  obrigatoria?: boolean;
};

export type Microrrota = { ids: string[]; centro: { lat: number; lng: number }; peso: number; obrigatoria: boolean };

export type Resultado = {
  /** Ids na ordem de visita. */
  ordem: string[];
  micros: Microrrota[];
  /** Metros de deslocamento entre microrrotas (linha reta, do ponto de partida). */
  metrosEntreMicros: number;
};

const toRad = (d: number) => (d * Math.PI) / 180;
export function metros(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function montarMicrorrotas(
  candidatas: Candidata[],
  base: { lat: number; lng: number },
  opts: { meta: number; raioPe?: number; maxPorMicro?: number; folga?: number },
): Resultado {
  const raioPe = opts.raioPe ?? 300;
  const maxPorMicro = opts.maxPorMicro ?? 6;
  const teto = Math.max(1, opts.meta) + (opts.folga ?? 3);
  const vistas = new Map<string, Candidata>();
  for (const c of candidatas) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const ja = vistas.get(c.id);
    if (!ja || (c.obrigatoria && !ja.obrigatoria)) vistas.set(c.id, c);
  }
  const pool = [...vistas.values()].sort((a, b) => Number(!!b.obrigatoria) - Number(!!a.obrigatoria) || b.peso - a.peso);

  // 1. agrupar
  const livre = new Set(pool.map((c) => c.id));
  const grupos: Candidata[][] = [];
  for (const semente of pool) {
    if (!livre.has(semente.id)) continue;
    livre.delete(semente.id);
    const g = [semente];
    let cresceu = true;
    while (cresceu && g.length < maxPorMicro) {
      cresceu = false;
      const vizinhas = pool.filter((c) => livre.has(c.id) && g.some((m) => metros(m.lat, m.lng, c.lat, c.lng) <= raioPe));
      if (!vizinhas.length) break;
      vizinhas.sort((a, b) => Number(!!b.obrigatoria) - Number(!!a.obrigatoria) || b.peso - a.peso);
      for (const v of vizinhas) {
        if (g.length >= maxPorMicro) break;
        livre.delete(v.id); g.push(v); cresceu = true;
      }
    }
    grupos.push(g);
  }
  const micros: Microrrota[] = grupos.map((g) => ({
    ids: g.map((c) => c.id),
    centro: { lat: g.reduce((s, c) => s + c.lat, 0) / g.length, lng: g.reduce((s, c) => s + c.lng, 0) / g.length },
    peso: g.reduce((s, c) => s + c.peso, 0),
    obrigatoria: g.some((c) => c.obrigatoria),
  }));

  // 2. escolher (obrigatórias sempre; o resto pelo que vale por km, encadeado)
  const escolhidas: Microrrota[] = micros.filter((m) => m.obrigatoria);
  let total = escolhidas.reduce((s, m) => s + m.ids.length, 0);
  const restantes = micros.filter((m) => !m.obrigatoria);
  let ponto = base;
  while (total < opts.meta && restantes.length) {
    let melhor = -1, nota = -Infinity;
    restantes.forEach((m, i) => {
      if (total + m.ids.length > teto && total > 0) return;
      const km = metros(ponto.lat, ponto.lng, m.centro.lat, m.centro.lng) / 1000;
      const v = m.peso / (1 + km / 2);
      if (v > nota) { nota = v; melhor = i; }
    });
    if (melhor < 0) break;
    const m = restantes.splice(melhor, 1)[0];
    escolhidas.push(m); total += m.ids.length; ponto = m.centro;
  }

  // 3. ordenar: grupos encadeados pelo mais perto; portas pela mais perto da anterior
  const porId = new Map(pool.map((c) => [c.id, c]));
  const ordem: string[] = [];
  const faltam = [...escolhidas];
  let aqui = base;
  let metrosEntreMicros = 0;
  const ordenadas: Microrrota[] = [];
  while (faltam.length) {
    let i = 0, d = Infinity;
    faltam.forEach((m, k) => { const x = metros(aqui.lat, aqui.lng, m.centro.lat, m.centro.lng); if (x < d) { d = x; i = k; } });
    const m = faltam.splice(i, 1)[0];
    metrosEntreMicros += d;
    const portas = m.ids.map((id) => porId.get(id)!).filter(Boolean);
    const dentro: string[] = [];
    let p = aqui;
    while (portas.length) {
      let j = 0, dj = Infinity;
      portas.forEach((c, k) => { const x = metros(p.lat, p.lng, c.lat, c.lng); if (x < dj) { dj = x; j = k; } });
      const c = portas.splice(j, 1)[0];
      dentro.push(c.id); p = { lat: c.lat, lng: c.lng };
    }
    ordem.push(...dentro);
    ordenadas.push({ ...m, ids: dentro });
    aqui = p;
  }
  return { ordem, micros: ordenadas, metrosEntreMicros: Math.round(metrosEntreMicros) };
}
