// PLANEJAR PELO MAPA (28/09/2026). Julyan: "quero algo ali pra ajudar o planejamento
// deles, escolhendo direto do mapa (...) app e Cockpit têm que ser um só". O executivo
// escolhe o dia e toca nos pinos: cada toque põe ou tira a parada da rota daquele dia, e
// o gatilho rota_para_plano (0131/0136) leva ao Planejamento do Cockpit. Aqui ficam as
// regras puras: quais dias dá para planejar e o que o Cockpit consegue mostrar.

export type DiaPlanejavel = { iso: string; curto: string; rotulo: string; hoje: boolean };

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function partes(iso: string) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

function isoDe(dt: Date) {
  return dt.toISOString().slice(0, 10);
}

/** "ter 30/09" de um dia YYYY-MM-DD, sem fuso (o dia já vem em Brasília). */
export function rotuloDoDia(iso: string) {
  const dt = partes(iso);
  return `${SEMANA[dt.getUTCDay()]} ${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Os próximos `quantos` dias úteis a partir de hoje (hoje entra se for dia útil).
 *  A grade do Cockpit é de segunda a sexta: sábado e domingo não entram. */
export function diasPlanejaveis(hojeIso: string, quantos = 10): DiaPlanejavel[] {
  const out: DiaPlanejavel[] = [];
  const dt = partes(hojeIso);
  while (out.length < quantos) {
    const dow = dt.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      const iso = isoDe(dt);
      out.push({ iso, curto: SEMANA[dow], rotulo: rotuloDoDia(iso), hoje: iso === hojeIso });
    }
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return out;
}

/** O dia que o modo abre: hoje até o meio-dia (ainda dá para ir), senão o próximo útil. */
export function diaInicial(hojeIso: string, horaBrasilia: number): string {
  const dias = diasPlanejaveis(hojeIso, 2);
  if (dias[0].hoje && horaBrasilia < 12) return dias[0].iso;
  return dias.find((d) => !d.hoje)?.iso ?? dias[0].iso;
}

/** O Cockpit mostra na grade quem tem negócio (funil ou relacionamento) ou é conta-alvo
 *  da munição; pino sem os dois fica só na rota do app. Espelha o rota_para_plano. */
export function vaiAoCockpit(c: { id_hubspot?: string | null; lead_prospeccao_id?: string | null }) {
  return !!(c.id_hubspot && String(c.id_hubspot).trim()) || !!c.lead_prospeccao_id;
}

/** A grade do Cockpit tem 15 faixas por dia; da 16a em diante fica só no app. */
export const FAIXAS_POR_DIA = 15;
