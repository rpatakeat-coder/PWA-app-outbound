// Supabase Edge Function: hubspot-activity-sync
//
// Alimenta o SLA da Rota do dia (Fase 2). Puxa dos deals das etapas do FUNIL:
//   hs_lastactivitydate        -> clients.hs_last_activity_at (ultima atividade
//                                 HUMANA: nota/ligacao/email/reuniao — NAO e' o
//                                 hs_lastmodifieddate, que e' a armadilha do MD)
//   hs_date_entered_<etapa>     -> clients.hs_stage_entered_at (entrada na etapa)
//
// Busca POR ETAPA (dealstage EQ) como o hubspot-usage-sync — segura o teto de
// 10k da Search API e permite pedir o hs_date_entered_<id> daquela etapa. Grava
// em lote via RPC apply_hubspot_activity (casa por clients.id_hubspot).
//
// Roda 1x/dia de madrugada (o SLA e' em dias). Cron do Supabase:
//   Schedule: 0 8 * * *   (05:00 BRT = 08:00 UTC)  Type: Edge Function
//
// Deploy:   supabase functions deploy hubspot-activity-sync
// Secrets:  HUBSPOT_TOKEN_USAGE (ou HUBSPOT_TOKEN); SUPABASE_URL,
//           SUPABASE_SERVICE_ROLE_KEY (automaticos)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const HS = 'https://api.hubapi.com';
const FETCH_TIMEOUT_MS = 20_000;

// Etapas do funil COM SLA (as demais = 999, nao entram). id = deal stage id.
const SLA_STAGES = [
  { id: '1395880469', label: 'Prospecção' },
  { id: '1396005401', label: 'Visita' },
  { id: '1395880470', label: 'Conversa com decisor' },
  { id: '1395880471', label: 'Demo/Proposta' },
  { id: '1395880472', label: 'Negociação' },
  { id: '1395880473', label: 'Ag. Pagamento' },
];

const PROP_LAST_ACTIVITY = 'hs_lastactivitydate';

const SEARCH_PAGE_SIZE = 100;
const MAX_PAGES_PER_STAGE = 100;
const MIN_INTERVAL_MS = 1_000;
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
const DB_BATCH_SIZE = 500;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const trimOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Propriedade DATA do HubSpot: epoch ms ("1754352000000") ou ISO. Devolve ISO
// (timestamptz) ou null.
function toTimestamp(v: unknown): string | null {
  const s = trimOrNull(v);
  if (!s) return null;
  const ms = /^-?\d+$/.test(s) ? Number(s) : Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

let proximaChamadaEm = 0;
async function aguardarVez() {
  const espera = proximaChamadaEm - Date.now();
  if (espera > 0) await sleep(espera);
  proximaChamadaEm = Date.now() + MIN_INTERVAL_MS;
}

function esperaDoRetry(res: Response | null, tentativa: number): number {
  const header = res?.headers.get('Retry-After');
  const segundos = header ? Number(header) : NaN;
  if (Number.isFinite(segundos) && segundos > 0) return Math.min(segundos * 1000, BACKOFF_MAX_MS);
  return Math.min(BACKOFF_BASE_MS * 2 ** tentativa, BACKOFF_MAX_MS);
}

const stats = { chamadas: 0, retries429: 0, retries5xx: 0 };

async function hsFetch(token: string, path: string, payload: unknown): Promise<{ ok: boolean; status: number; body: any }> {
  for (let tentativa = 0; ; tentativa++) {
    await aguardarVez();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response | null = null;
    let body: any = null;
    let status = 0;
    try {
      res = await fetch(`${HS}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      stats.chamadas++;
      status = res.status;
      try { body = await res.json(); } catch { body = null; }
      if (res.ok) return { ok: true, status, body };
    } catch (err) {
      console.warn('[activity-sync] fetch falhou', path, err);
    } finally {
      clearTimeout(timer);
    }
    const vaiTentarDeNovo = status === 429 || status >= 500 || status === 0;
    if (!vaiTentarDeNovo || tentativa >= MAX_RETRIES) {
      return { ok: false, status, body };
    }
    const espera = esperaDoRetry(res, tentativa);
    if (status === 429) stats.retries429++; else stats.retries5xx++;
    await sleep(espera);
  }
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

type ActivityRow = {
  id_hubspot: string;
  last_activity_at: string | null;
  stage_entered_at: string | null;
};

async function buscarEtapa(
  token: string,
  stage: { id: string; label: string },
): Promise<{ rows: ActivityRow[]; paginas: number; truncado: boolean; erro?: string }> {
  const rows: ActivityRow[] = [];
  const enteredProp = `hs_date_entered_${stage.id}`;
  let after: string | undefined;
  let paginas = 0;

  for (let page = 0; page < MAX_PAGES_PER_STAGE; page++) {
    const res = await hsFetch(token, '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealstage', operator: 'EQ', value: stage.id }] }],
      properties: [PROP_LAST_ACTIVITY, enteredProp],
      sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
      limit: SEARCH_PAGE_SIZE,
      ...(after ? { after } : {}),
    });
    paginas++;
    if (!res.ok) {
      return { rows, paginas, truncado: false, erro: `busca "${stage.label}" falhou: ${res.body?.message ?? `status ${res.status}`}` };
    }
    for (const d of res.body?.results ?? []) {
      const id = trimOrNull(d?.id);
      if (!id) continue;
      const props = d?.properties ?? {};
      rows.push({
        id_hubspot: id,
        last_activity_at: toTimestamp(props[PROP_LAST_ACTIVITY]),
        stage_entered_at: toTimestamp(props[enteredProp]),
      });
    }
    after = trimOrNull(res.body?.paging?.next?.after) ?? undefined;
    if (!after) return { rows, paginas, truncado: false };
  }
  return { rows, paginas, truncado: true };
}

async function gravar(rows: ActivityRow[]): Promise<{ atualizados: number; erros: string[] }> {
  const db = serviceClient();
  const erros: string[] = [];
  let atualizados = 0;
  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const lote = rows.slice(i, i + DB_BATCH_SIZE);
    const { data, error } = await db.rpc('apply_hubspot_activity', { p_rows: lote });
    if (error) { erros.push(`lote ${i / DB_BATCH_SIZE + 1}: ${error.message}`); continue; }
    atualizados += Number(data ?? 0);
  }
  return { atualizados, erros };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json(405, { error: 'Method Not Allowed' });

  const token = Deno.env.get('HUBSPOT_TOKEN_USAGE') ?? Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return json(503, { error: 'HUBSPOT_TOKEN_USAGE/HUBSPOT_TOKEN not configured' });

  const inicio = Date.now();
  try {
    const todos: ActivityRow[] = [];
    const porEtapa: Record<string, unknown>[] = [];
    const erros: string[] = [];

    for (const stage of SLA_STAGES) {
      const { rows, paginas, truncado, erro } = await buscarEtapa(token, stage);
      if (erro) erros.push(erro);
      if (truncado) erros.push(`etapa "${stage.label}" passou de 10k deals — truncada`);
      todos.push(...rows);
      porEtapa.push({ etapa: stage.label, deals: rows.length, paginas, truncado });
    }

    // Um deal so' esta numa etapa; se vier repetido, o ultimo vence.
    const unicos = [...new Map(todos.map((r) => [r.id_hubspot, r])).values()];
    const { atualizados, erros: errosDb } = await gravar(unicos);
    erros.push(...errosDb);

    // Se NENHUM deal trouxe last_activity, provavelmente o nome da propriedade
    // esta errado — grita em vez de gravar null em massa em silencio.
    const semLastActivity = unicos.length > 0 && !unicos.some((r) => r.last_activity_at !== null);

    const resumo = {
      ok: erros.length === 0,
      deals_encontrados: unicos.length,
      clientes_atualizados: atualizados,
      ...(semLastActivity ? { aviso: 'nenhum deal trouxe hs_lastactivitydate — conferir nome da propriedade' } : {}),
      chamadas_hubspot: stats.chamadas,
      retries_429: stats.retries429,
      retries_5xx: stats.retries5xx,
      duracao_ms: Date.now() - inicio,
      etapas: porEtapa,
      ...(erros.length ? { erros } : {}),
    };
    console.log('[activity-sync]', JSON.stringify(resumo));
    return json(erros.length ? 207 : 200, resumo);
  } catch (err) {
    console.error('[activity-sync] erro inesperado', err);
    return json(500, { error: 'Erro interno', detail: String(err) });
  }
});
