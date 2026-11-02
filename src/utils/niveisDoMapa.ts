// O MAPA NA RUA (prancha "Mapa na rua", 02/11/26): uma porta fala alto, três falam baixo, o resto
// espera o toque.
//
// No zoom de rua todo pino falava ao mesmo tempo (print das 13:53: 6 nomes, 4 segundas linhas, 12
// selos, o halo por cima da bolinha azul, "aberto há 63 dias" cortado pela faixa). Esta função
// decide, para UMA cena, quem é cada nível:
//
//   N1 · a próxima porta: pino 40, anel sólido de 52 px, rótulo de duas linhas. Nunca mais de uma.
//   N2 · quem pede ação a até 400 m a pé: até 3 nomes de uma linha.
//   N3 · o resto: pino 4 px menor, sem nome, sem segunda linha.
//
// É PURA e DETERMINÍSTICA: mesma cena, mesmos nomes (niveisDoMapa.teste.ts). Arrastar não muda a
// fila — a fila só depende da distância a pé (da posição dele), da lente/filtro e do zoom. O que
// pode mudar ao arrastar é o LUGAR do rótulo: a geometria (onde cada pino está na tela, a faixa
// segura, os botões) entra pronta, medida por quem chama. No app ela é medida no DOM depois que o
// Google desenha (o Google põe o marcador ~18 px fora da projeção linear; medido em 02/11/26) e a
// mesma função roda de novo com a medida real.
//
// O desenho da colisão é o da prancha (função scene/place): rótulo à direita › à esquerda (›
// acima, só no N1), nunca fora da faixa segura, nunca em cima da bolinha (zona de 24 px), de
// outro rótulo, da cabeça de um pino N1/N2 ou dos botões do mapa. Não coube: o N2 pula para o
// próximo da fila; para em 3, mesmo sobrando espaço. A fonte do sistema maior (até 130%) cresce
// o rótulo e a colisão derruba nomes — nunca se reduz a fonte para caber.

export type Caixa = { x0: number; y0: number; x1: number; y1: number };

export type ZoomDoMapa = 'rua' | 'bairro' | 'afastado';
/** plano: há parada do plano por fazer · sem_plano: N1 = a porta sugerida · feriado: sem N1 ·
 *  lente_recem: a lente Recém-abertos manda no N2. */
export type ModoDoMapa = 'plano' | 'sem_plano' | 'feriado' | 'lente_recem';
export type LadoRotulo = 'dir' | 'esq' | 'acima';
export type Selo = '!' | '↓';
export type Nivel = 1 | 2 | 3;

/** A partir de quantos metros a pé o nome e o selo saem do mapa (5 min a 80 m/min). */
export const RAIO_N2_M = 400;
/** Até quantos nomes além da próxima porta. */
export const MAX_N2 = 3;
/** Recém-aberto que ganha nome e número dentro do losango. */
export const DIAS_RECEM_NOME = 30;
/** Zona livre em volta da bolinha azul (meia largura). */
export const ZONA_BOLINHA = 24;
/** Metros por minuto a pé (a mesma conta da folha e do cartão). */
export const METROS_POR_MINUTO = 80;

export type PinoDaCena = {
  id: string;
  /** Ponta do pino na tela (px, no referencial do mapa). */
  x: number;
  y: number;
  /** A caixa da cabeça do pino (o círculo, ou o losango girado), sem a ponta. */
  cabeca: Caixa;
  /** Metros a pé da posição dele; null = sem GPS ou sem coordenada (fica fora do N2 e do selo). */
  distanciaM: number | null;
  nome: string;
  familia: 'lead' | 'rec' | 'av' | 'cli' | 'ex' | 'alvo';
  /** Número da parada no plano de hoje (null = fora do plano). */
  plano: number | null;
  /** A parada do plano já foi feita (ou o pino foi visitado hoje). */
  feito: boolean;
  /** A porta sugerida quando não há plano (a 1ª da proposta): o N1 do dia sem plano. */
  sugerida?: boolean;
  /** Faz parte da proposta do dia sem plano (a 2ª opção da porta sugerida). */
  proposta?: boolean;
  /** Passo vencido / sem toque (a regra de hoje: etiqueta "cobrar"). */
  cobrar: boolean;
  /** Cliente em queda. */
  queda: boolean;
  /** Dias de CNPJ do recém-aberto (null = não é recém-aberto). */
  abertoHa: number | null;
  /** Pilha: quantos pinos este representa (o rótulo vira "Nome +1"). */
  pilhaN?: number;
};

export type OpcoesDaCena = {
  zoom: ZoomDoMapa;
  modo: ModoDoMapa;
  /** A bolinha azul na tela (null = sem GPS na tela). */
  posicao: { x: number; y: number } | null;
  /** Onde texto pode ser desenhado: entre a base da busca (ou da faixa da vez) + 8 e o topo da
   *  fileira de lentes − 8, e a 8 px das bordas. */
  faixaSegura: Caixa;
  /** Escala da fonte do sistema (1 = 100%, 1,3 = 130%). Os rótulos crescem com ela. */
  fonte: number;
  /** Os botões do mapa (localização, "+") e o que mais não pode ser coberto por texto. */
  obstaculos?: Caixa[];
  /** A 2ª linha do N1 depois da distância ("proposta pronta", "passo vencido"…). */
  motivoN1?: string | null;
  /** Mede o texto (largura e altura em px). Sem ela, a conta da prancha (0,6 × px por letra). */
  medir?: (texto: string, px: number, peso: 600 | 700) => { w: number; h: number };
};

export type RotuloColocado = { id: string; lado: LadoRotulo; caixa: Caixa; nome: string; linha2: string | null };

export type NiveisDaCena = {
  /** A próxima porta. null no feriado, sem plano e sem sugestão, ou fora do zoom de rua/bairro. */
  n1: { id: string; rotulo: RotuloColocado | null } | null;
  n2: RotuloColocado[];
  /** Todos os outros ids, na ordem de entrada. */
  n3: string[];
  /** Quantos rótulos a fila tentou e a colisão ou a faixa segura derrubou. */
  rotulosDescartados: number;
  /** No máximo 1 selo por pino, só de ação, só a até 400 m. */
  selos: Record<string, Selo>;
  /** Nível de cada id (1, 2 ou 3). */
  nivel: Record<string, Nivel>;
};

const bate = (a: Caixa, b: Caixa) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** A conta da prancha: Poppins 700 ~0,6 × px por letra; 600 ~0,56. */
export function medirPelaPrancha(texto: string, px: number, peso: 600 | 700): { w: number; h: number } {
  return { w: texto.length * px * (peso === 700 ? 0.6 : 0.56), h: px * 1.3 };
}

/** "120 m" / "1,2 km" — a mesma grafia da folha. */
export function metrosTexto(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(Math.round(m / 100) / 10).toString().replace('.', ',')} km`;
}

/** Minutos a pé (80 m/min), no mínimo 1. */
export function minutosAPe(m: number): number {
  return Math.max(1, Math.round(m / METROS_POR_MINUTO));
}

/** Quem é o N1 da cena, pela regra do modo. Fora da tela não importa: quem chama já filtrou. */
export function escolherN1(pinos: PinoDaCena[], modo: ModoDoMapa): PinoDaCena | null {
  if (modo === 'feriado') return null;
  const pendentes = pinos.filter((p) => p.plano != null && !p.feito).sort((a, b) => (a.plano! - b.plano!) || a.id.localeCompare(b.id));
  if (pendentes.length) return pendentes[0];
  return pinos.find((p) => p.sugerida && !p.feito) ?? null;
}

/** A fila do N2: só a até 400 m e só quem pede ação. -1 = não entra. */
export function rankN2(p: PinoDaCena, modo: ModoDoMapa): number {
  if (p.distanciaM == null || p.distanciaM > RAIO_N2_M || p.feito) return -1;
  const rec30 = p.familia === 'rec' && p.abertoHa != null && p.abertoHa <= DIAS_RECEM_NOME;
  if (modo === 'feriado' || modo === 'lente_recem') return rec30 ? 2 : -1;
  if (p.plano != null || p.proposta) return 0;
  if (p.cobrar) return 1;
  if (rec30) return 2;
  if (p.queda) return 3;
  return -1;
}

export function niveisDoMapa(pinos: PinoDaCena[], o: OpcoesDaCena): NiveisDaCena {
  const medir = o.medir ?? medirPelaPrancha;
  const fonte = Math.max(1, o.fonte || 1);
  const faixa = o.faixaSegura;
  const obst: Caixa[] = [...(o.obstaculos ?? [])];
  if (o.posicao) obst.push({ x0: o.posicao.x - ZONA_BOLINHA, y0: o.posicao.y - ZONA_BOLINHA, x1: o.posicao.x + ZONA_BOLINHA, y1: o.posicao.y + ZONA_BOLINHA });
  // a ordem de entrada não pode mudar a saída: tudo é ordenado por id antes de qualquer decisão
  const todos = [...pinos].sort((a, b) => a.id.localeCompare(b.id));
  const nivel: Record<string, Nivel> = {};
  const selos: Record<string, Selo> = {};
  let descartados = 0;

  const cabecaComPonta = (p: PinoDaCena): Caixa => ({ x0: p.cabeca.x0 - 2, y0: p.cabeca.y0 - 2, x1: p.cabeca.x1 + 2, y1: Math.max(p.cabeca.y1, p.y) + 2 });

  const colocar = (p: PinoDaCena, nome: string, linha2: string | null, f1: number, f2: number, maxNome: number, lados: LadoRotulo[]): RotuloColocado | null => {
    const m1 = medir(nome, f1, 700);
    const m2 = linha2 ? medir(linha2, f2, 600) : { w: 0, h: 0 };
    // padding 4 × 10 e borda de 1 (a pílula da prancha): +22 na largura, +10 na altura
    const w = Math.max(Math.min(maxNome, m1.w) + 22, linha2 ? Math.min(240, m2.w) + 22 : 0);
    const h = m1.h + (linha2 ? m2.h : 0) + 10;
    const meia = (p.cabeca.x1 - p.cabeca.x0) / 2;
    const cx = (p.cabeca.x0 + p.cabeca.x1) / 2;
    const yc = (p.cabeca.y0 + p.cabeca.y1) / 2;
    const gap = meia + 7;
    for (const lado of lados) {
      const r: Caixa = lado === 'dir' ? { x0: cx + gap, x1: cx + gap + w, y0: yc - h / 2, y1: yc + h / 2 }
        : lado === 'esq' ? { x0: cx - gap - w, x1: cx - gap, y0: yc - h / 2, y1: yc + h / 2 }
          : { x0: cx - w / 2, x1: cx + w / 2, y0: p.cabeca.y0 - 8 - h, y1: p.cabeca.y0 - 8 };
      if (r.x0 < faixa.x0 || r.x1 > faixa.x1 || r.y0 < faixa.y0 || r.y1 > faixa.y1) continue;
      if (obst.some((b) => bate(b, r))) continue;
      obst.push(r);
      return { id: p.id, lado, caixa: r, nome, linha2 };
    }
    return null;
  };

  // ── N1 ──────────────────────────────────────────────────────────────────────────────────────
  const emRuaOuBairro = o.zoom === 'rua' || o.zoom === 'bairro';
  const n1p = emRuaOuBairro ? escolherN1(todos, o.modo) : null;
  let n1: NiveisDaCena['n1'] = null;
  if (n1p) {
    nivel[n1p.id] = 1;
    obst.push(cabecaComPonta(n1p));
    const d = n1p.distanciaM != null ? metrosTexto(n1p.distanciaM) : null;
    const linha2 = o.zoom === 'rua'
      ? [n1p.sugerida && n1p.plano == null ? 'sugestão' : null, d, o.motivoN1 || null].filter(Boolean).join(' · ') || null
      : d;
    const rot = colocar(n1p, n1p.nome, linha2, 14 * fonte, 12 * fonte, 200, ['dir', 'esq', 'acima']);
    if (!rot) descartados += 1;
    n1 = { id: n1p.id, rotulo: rot };
  }

  // ── N2 ──────────────────────────────────────────────────────────────────────────────────────
  const n2: RotuloColocado[] = [];
  if (o.zoom === 'rua') {
    const fila = todos.filter((p) => p !== n1p && rankN2(p, o.modo) >= 0);
    const dist = (p: PinoDaCena) => p.distanciaM ?? Infinity;
    fila.sort((a, b) => (o.modo === 'lente_recem'
      ? ((a.abertoHa ?? 999) - (b.abertoHa ?? 999)) || dist(a) - dist(b)
      : (rankN2(a, o.modo) - rankN2(b, o.modo)) || dist(a) - dist(b)) || a.id.localeCompare(b.id));
    for (const p of fila) {
      if (n2.length >= MAX_N2) break;
      const nome = (p.pilhaN ?? 1) > 1 ? `${p.nome} +${(p.pilhaN ?? 1) - 1}` : p.nome;
      const rot = colocar(p, nome, null, 13 * fonte, 0, 150, ['dir', 'esq']);
      if (!rot) { descartados += 1; continue; }
      n2.push(rot);
      nivel[p.id] = 2;
      obst.push(cabecaComPonta(p));
    }
  }

  // ── N3 e selos ──────────────────────────────────────────────────────────────────────────────
  const n3: string[] = [];
  for (const p of pinos) if (!nivel[p.id]) { nivel[p.id] = 3; n3.push(p.id); }
  Object.assign(selos, selosDaCena(todos, o.zoom, o.modo, n1p?.id ?? null));

  return { n1, n2, n3, rotulosDescartados: descartados, selos, nivel };
}

/** Os selos não dependem da geometria: no máximo 1 por pino, só `!` (cobrar) e `↓` (em queda),
 *  só a até 400 m, nunca no N1, nenhum no feriado nem fora do zoom de rua. */
export function selosDaCena(
  pinos: Pick<PinoDaCena, 'id' | 'distanciaM' | 'familia' | 'cobrar' | 'queda'>[], zoom: ZoomDoMapa, modo: ModoDoMapa, idN1: string | null,
): Record<string, Selo> {
  const selos: Record<string, Selo> = {};
  if (zoom !== 'rua' || modo === 'feriado') return selos;
  for (const p of pinos) {
    if (p.id === idN1 || p.distanciaM == null || p.distanciaM > RAIO_N2_M || p.familia === 'rec') continue;
    if (p.cobrar) selos[p.id] = '!';
    else if (p.queda) selos[p.id] = '↓';
  }
  return selos;
}

/** A assinatura de uma cena, para quem guarda o resultado só quando ele muda. */
export function assinaturaDosNiveis(r: NiveisDaCena): string {
  const rot = (x: RotuloColocado | null) => (x ? `${x.id}:${x.lado}` : '-');
  return [r.n1 ? `${r.n1.id}/${rot(r.n1.rotulo)}` : '-', r.n2.map(rot).join(','), Object.keys(r.selos).sort().map((k) => k + r.selos[k]).join(',')].join('|');
}
