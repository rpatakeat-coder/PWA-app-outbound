// A previsão honesta no app (handoff "Acelerar Field Sales v2", tela 4c, 01/11/26).
//
// Depois de salvar a ficha de demo, uma pergunta de um toque: qual a chance de fechar este mês? A
// resposta vai para previsoes_demo (0234), nunca para o HubSpot. O acerto é a MESMA conta do cockpit
// (GV2.rcDisse em template/cockpit.template.html): a chance média dita contra as demos que viraram
// cliente no mês. No time, a demo sem chance dita entra com a conversão do time no mês anterior.

export const CHANCES = [10, 30, 50, 70, 90] as const;

export type LinhaPrevisao = { demos: number; ditas: number; somaDita: number; fecharam: number; ditasFecharam?: number };

/** o mês da previsão em Brasília, no formato do banco (primeiro dia) */
export function mesDaPrevisao(agora: Date = new Date()): string {
  const b = new Date(agora.getTime() - 3 * 3600000);
  return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
}
/** o que o time disse: as chances ditas e, nas demos sem chance, a conversão do mês anterior */
export function disseDoTime(t: LinhaPrevisao, conv: number | null): number | null {
  if (!t.demos) return null;
  const resto = conv == null ? 0 : (t.demos - t.ditas) * conv;
  const base = conv == null ? t.ditas : t.demos;
  return base ? Math.round((t.somaDita + resto) / base) : null;
}
/** o meu acerto: só as demos em que EU disse a chance */
export function meuAcerto(eu: LinhaPrevisao): { disse: number; fechou: number; distancia: number } | null {
  if (!eu.ditas) return null;
  const disse = Math.round(eu.somaDita / eu.ditas);
  const fechou = Math.round(((eu.ditasFecharam ?? 0) / eu.ditas) * 100);
  return { disse, fechou, distancia: Math.abs(disse - fechou) };
}
export function distanciaDoTime(t: LinhaPrevisao, conv: number | null): number | null {
  const d = disseDoTime(t, conv);
  return d == null || !t.demos ? null : Math.abs(d - Math.round((t.fecharam / t.demos) * 100));
}
