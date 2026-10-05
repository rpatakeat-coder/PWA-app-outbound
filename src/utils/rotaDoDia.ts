// A conta da rota do dia na Agenda do computador (prancha "Agenda no computador", 05/10/2026).
//
// A ORDEM MANDA. O horário sem cadeado é estimado: início do dia + caminho entre as paradas +
// 20 min por visita. O horário com cadeado (reunião, horário combinado) não muda; a parada pode
// estar em qualquer posição, e se a ordem fizer esperar mais de 20 min ou chegar mais de 10 min
// atrasado, a tela mostra o aviso com "Encaixar".
//
// Sem rota pelas ruas aqui: a distância é em linha reta × 1,3 a 25 km/h (a mesma conta da
// linha do tempo da Agenda do celular). É estimativa para planejar, não navegação.

export type Ponto = { latitude: number; longitude: number };
export type ParadaRota = { id: string; ponto: Ponto | null; fixo: number | null }; // fixo: minutos do dia (ex.: 15:00 → 900)

export const MIN_POR_VISITA = 20;
export const ESPERA_MAXIMA = 20;
export const ATRASO_MAXIMO = 10;
const VELOCIDADE_KMH = 25;
const FATOR_RUA = 1.3;

export function metros(a: Ponto, b: Ponto): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** O trecho entre duas paradas: metros pela rua (estimados) e minutos. Sem ponto, null. */
export function perna(a: Ponto | null, b: Ponto | null): { m: number; min: number } | null {
  if (!a || !b) return null;
  const m = metros(a, b) * FATOR_RUA;
  return { m, min: Math.max(1, Math.round((m / 1000 / VELOCIDADE_KMH) * 60)) };
}

export type Horario = { chega: number; espera: number; atraso: number; fixo: boolean };

/** Horário de cada parada na ordem dada, a partir de `inicio` (minutos do dia). */
export function horarios(paradas: ParadaRota[], inicio: number): Horario[] {
  const out: Horario[] = [];
  let t = inicio;
  paradas.forEach((p, i) => {
    if (i > 0) t += perna(paradas[i - 1].ponto, p.ponto)?.min ?? 10;
    let espera = 0, atraso = 0;
    if (p.fixo != null) {
      if (t < p.fixo) { espera = p.fixo - t; t = p.fixo; } else atraso = t - p.fixo;
    }
    out.push({ chega: t, espera, atraso, fixo: p.fixo != null });
    t += MIN_POR_VISITA;
  });
  return out;
}

/** Início do dia: o horário fixo mais cedo menos o caminho até ele, ou 09:00. */
export function inicioDoDia(paradas: ParadaRota[], padrao = 9 * 60): number {
  return paradas.length && paradas[0].fixo != null ? paradas[0].fixo : padrao;
}

/** O primeiro conflito da ordem atual: espera longa ou atraso numa parada fixa. */
export function conflito(paradas: ParadaRota[], hs: Horario[]): { indice: number; espera: number; atraso: number } | null {
  for (let i = 0; i < paradas.length; i++) {
    const h = hs[i];
    if (!h?.fixo) continue;
    if (h.espera > ESPERA_MAXIMA || h.atraso > ATRASO_MAXIMO) return { indice: i, espera: h.espera, atraso: h.atraso };
  }
  return null;
}

export function resumo(paradas: ParadaRota[], hs: Horario[]) {
  let m = 0;
  for (let i = 1; i < paradas.length; i++) m += perna(paradas[i - 1].ponto, paradas[i].ponto)?.m ?? 0;
  const ini = hs.length ? hs[0].chega : null;
  const fim = hs.length ? hs[hs.length - 1].chega + MIN_POR_VISITA : null;
  return { km: m / 1000, inicio: ini, fim, minutos: ini != null && fim != null ? fim - ini : 0 };
}

/** Onde uma parada nova entra com menos caminho a mais (índice de inserção) e o custo. */
export function melhorPosicao(paradas: ParadaRota[], novo: Ponto): { indice: number; minAMais: number; maisPerto: number | null; mPerto: number | null } {
  if (!paradas.length) return { indice: 0, minAMais: 0, maisPerto: null, mPerto: null };
  let melhor = { indice: paradas.length, custo: Infinity };
  for (let i = 0; i <= paradas.length; i++) {
    const a = i > 0 ? paradas[i - 1].ponto : null;
    const b = i < paradas.length ? paradas[i].ponto : null;
    const ida = a ? perna(a, novo)?.min ?? 0 : 0;
    const volta = b ? perna(novo, b)?.min ?? 0 : 0;
    const antes = a && b ? perna(a, b)?.min ?? 0 : 0;
    const custo = ida + volta - antes;
    if (custo < melhor.custo) melhor = { indice: i, custo };
  }
  let maisPerto: number | null = null, mPerto: number | null = null;
  paradas.forEach((p, i) => {
    if (!p.ponto) return;
    const m = metros(p.ponto, novo);
    if (mPerto == null || m < mPerto) { mPerto = m; maisPerto = i; }
  });
  return { indice: melhor.indice, minAMais: Math.max(0, Math.round(melhor.custo)) + MIN_POR_VISITA, maisPerto, mPerto };
}

/**
 * ENCAIXAR: refaz a ordem pelo caminho (vizinho mais próximo a partir da 1ª parada sem horário
 * fixo, ou da 1ª se todas forem fixas) e põe cada parada fixa na posição em que ela cumpre o
 * horário com menos espera. Devolve os ids na nova ordem.
 */
export function encaixar(paradas: ParadaRota[], inicio: number): string[] {
  const livres = paradas.filter((p) => p.fixo == null);
  const fixas = paradas.filter((p) => p.fixo != null).sort((a, b) => (a.fixo! - b.fixo!));
  // vizinho mais próximo entre as livres
  const ordem: ParadaRota[] = [];
  const resto = livres.slice();
  let atual: ParadaRota | undefined = resto.shift();
  while (atual) {
    ordem.push(atual);
    const de: ParadaRota = atual;
    let iMelhor = -1, mMelhor = Infinity;
    resto.forEach((p, i) => {
      const m = de.ponto && p.ponto ? metros(de.ponto, p.ponto) : Infinity;
      if (m < mMelhor) { mMelhor = m; iMelhor = i; }
    });
    atual = iMelhor >= 0 ? resto.splice(iMelhor, 1)[0] : resto.shift();
  }
  // cada fixa na posição de menor descompasso (espera + atraso×3: chegar atrasado custa mais)
  for (const f of fixas) {
    let melhor = { i: ordem.length, nota: Infinity };
    for (let i = 0; i <= ordem.length; i++) {
      const tentativa = [...ordem.slice(0, i), f, ...ordem.slice(i)];
      const hs = horarios(tentativa, inicio);
      const h = hs[i];
      const nota = h.espera + h.atraso * 3 + hs.reduce((s, x, k) => s + (tentativa[k].fixo != null && k !== i ? x.espera + x.atraso * 3 : 0), 0);
      if (nota < melhor.nota) melhor = { i, nota };
    }
    ordem.splice(melhor.i, 0, f);
  }
  return ordem.map((p) => p.id);
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
export const duracao = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`);
export const kmTexto = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`);
