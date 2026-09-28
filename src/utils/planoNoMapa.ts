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

// ── A GRADE DO COCKPIT, LIDA DE VERDADE (auditoria 28/09) ─────────────────────────────
// A tela dizia "vai para o Cockpit" contando posição (a 16a ficava de fora). Mas o
// gatilho ocupa a primeira faixa LIVRE, e a grade tem coisas que a rota não tem (visita
// marcada, faixa sem pino). Agora a folha lê a coluna do dia e diz o que está lá.

export type FaixaDoPlano = { id: string; origem?: string; p?: string; hora?: string };

/** A segunda-feira da semana do dia (a chave de planos_semanais) e o índice 0–4 do dia. */
export function semanaDoDia(iso: string): { segunda: string; indice: number } {
  const dt = partes(iso);
  const indice = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - indice);
  return { segunda: isoDe(dt), indice };
}

/** As faixas de um dia da grade, em objeto (a grade guarda também texto simples).
 *  Marcações internas ("__rua", "__b", "__rel") não são lead e ficam fora. */
export function colunaDoDia(grade: unknown, indice: number): FaixaDoPlano[] {
  const col = Array.isArray(grade) && Array.isArray(grade[indice]) ? (grade[indice] as unknown[]) : [];
  const out: FaixaDoPlano[] = [];
  for (const v of col) {
    const f = typeof v === 'string' ? { id: v } : v && typeof v === 'object' ? (v as FaixaDoPlano) : null;
    if (f && typeof f.id === 'string' && f.id && !f.id.startsWith('__')) out.push(f);
  }
  return out;
}

/** Os ids com que o Cockpit pode ter guardado este lead (os mesmos do rota_para_plano). */
export function idsDoLead(c: { id_hubspot?: string | null; lead_prospeccao_id?: string | null }): string[] {
  const hs = c.id_hubspot && String(c.id_hubspot).trim();
  const ids = hs ? [`c-${hs}`, `r-${hs}`] : [];
  if (c.lead_prospeccao_id) ids.push(`n-${c.lead_prospeccao_id}`);
  return ids;
}

export function faixaDoLead(col: FaixaDoPlano[], c: { id_hubspot?: string | null; lead_prospeccao_id?: string | null }) {
  const ids = idsDoLead(c);
  return col.find((f) => ids.includes(f.id)) ?? null;
}

/** Faixa que é compromisso marcado (visita da Agenda do app, próximo passo do CRM):
 *  tirar do dia pelo mapa não desmarca a reunião, então o mapa não tira. */
export function ehCompromisso(f: FaixaDoPlano | null) {
  return !!f && (f.origem === 'app-agenda' || f.origem === 'passo' || f.p === 'follow');
}
