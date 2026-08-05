// Supabase Edge Function: hubspot-usage-sync
//
// Puxa do HubSpot os dados de USO do produto e grava em public.clients:
//   data_da_ultima_comanda_emitida -> clients.hs_ultima_comanda_em
//   data_solicitacao_cancelamento  -> clients.hs_cancelamento_solicitado_em
//
// Quem entra: os deals que estao numa das ETAPAS de STAGES (allowlist) — e' o
// recorte de "cliente de verdade", nao o status local do app. Deal -> cliente
// casa por clients.id_hubspot.
//
// Fluxo (1 execucao por semana):
//   1) Uma busca por etapa (dealstage EQ), paginada de 100 em 100. Filtrar na
//      QUERY (e nao no codigo) e' o que segura o custo: so' vem quem interessa.
//   2) Grava em lotes de 500 via RPC apply_hubspot_uso (1 chamada por lote, em
//      vez de 1 UPDATE por cliente).
//
// Custo com ~3 mil clientes nas etapas: ~30 chamadas ao HubSpot + ~6 ao banco,
// espalhadas em ~30s (1 req/s). O portal tem varios outros fluxos disputando o
// limite por segundo — ver MIN_INTERVAL_MS e o retry de 429 no hsFetch.
// Teto de seguranca: a Search API do HubSpot devolve no maximo 10k resultados
// por query — por isso a busca e' POR ETAPA (30k de folga), nao uma so.
//
// Roda toda SEGUNDA de madrugada, agendada pelo Cron do Supabase:
//   Dashboard -> Integrations -> Cron -> Create job
//     Name:     hubspot-usage-sync-semanal
//     Schedule: 0 7 * * 1            (segunda, 04:00 BRT = 07:00 UTC)
//     Type:     Supabase Edge Function -> hubspot-usage-sync
//   O cron do Supabase e' em UTC — dai o 7, nao o 4.
//   O Cron manda a service role key no Authorization, entao o verify_jwt
//   continua LIGADO (a function nao fica aberta pra internet).
//
// Deploy:
//   supabase functions deploy hubspot-usage-sync
//
// Secrets:
//   HUBSPOT_TOKEN_USAGE       — token do private app DEDICADO a este sync. O
//                               limite da Search API (4 req/s) e' por TOKEN,
//                               entao um app so' pra ca nao disputa segundo a
//                               segundo com o n8n/RPA/app. OPCIONAL.
//   HUBSPOT_TOKEN             — fallback, o mesmo da hubspot-sync.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — automaticos da plataforma.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const HS = 'https://api.hubapi.com';
const FETCH_TIMEOUT_MS = 20_000;

// Propriedades lidas do deal.
const PROP_ULTIMA_COMANDA = 'data_da_ultima_comanda_emitida';
const PROP_CANCELAMENTO = 'data_solicitacao_cancelamento';

// Etapas que definem "cliente" pra este sync. IDs do HubSpot — manter
// sincronizado com o CRM (mesma convencao dos ids em hubspot-sync).
// Pipelines: Onboarding = 87106112, Sucesso = 87367429.
const STAGES = [
  { id: '175135768', label: 'Acompanhamento (Onboarding)' },
  { id: '162508353', label: 'Acompanhamento (Sucesso)' },
  { id: '171389297', label: 'Saudável (Sucesso)' },
];

// Teto por pagina na Search API.
const SEARCH_PAGE_SIZE = 100;
// A Search API do HubSpot corta em 10k resultados por query (100 paginas).
const MAX_PAGES_PER_STAGE = 100;

// ===== Convivencia com os outros fluxos do portal =====
// O limite por SEGUNDO e' do portal inteiro, nao desta function: n8n, RPA e
// workflows disputam o mesmo balde. Como este sync roda 1x por semana e nao
// tem ninguem esperando, ele anda devagar de proposito — 1 req/s ocupa ~1 dos
// ~4 slots/s da Search API e deixa o resto livre.
const MIN_INTERVAL_MS = 1_000;
// 429 (secondly/daily limit) e 5xx: espera o Retry-After do HubSpot e tenta de
// novo. Sem isso, uma rajada de outro fluxo derrubaria a execucao inteira.
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;

// Linhas por chamada da RPC de gravacao.
const DB_BATCH_SIZE = 500;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const trimOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type HsResult = { ok: boolean; status: number; body: any };

// Relogio do rate limit: garante MIN_INTERVAL_MS entre DUAS chamadas quaisquer
// desta execucao, independente de qual etapa/pagina disparou.
let proximaChamadaEm = 0;
async function aguardarVez() {
  const espera = proximaChamadaEm - Date.now();
  if (espera > 0) await sleep(espera);
  proximaChamadaEm = Date.now() + MIN_INTERVAL_MS;
}

// Quanto esperar depois de um 429/5xx. O HubSpot manda Retry-After (segundos)
// no 429 — obedecer isso e' melhor que qualquer chute nosso.
function esperaDoRetry(res: Response | null, tentativa: number): number {
  const header = res?.headers.get('Retry-After');
  const segundos = header ? Number(header) : NaN;
  if (Number.isFinite(segundos) && segundos > 0) return Math.min(segundos * 1000, BACKOFF_MAX_MS);
  return Math.min(BACKOFF_BASE_MS * 2 ** tentativa, BACKOFF_MAX_MS);
}

// Contadores da execucao, pro resumo dizer se o portal esta apertado.
const stats = { chamadas: 0, retries429: 0, retries5xx: 0, esperaMs: 0 };

async function hsFetch(token: string, path: string, payload: unknown): Promise<HsResult> {
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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      stats.chamadas++;
      status = res.status;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (res.ok) return { ok: true, status, body };
    } catch (err) {
      console.warn('[usage-sync] HubSpot fetch falhou', path, err);
    } finally {
      clearTimeout(timer);
    }

    // 429 = limite (por segundo ou diario). 5xx/rede = instabilidade. Nos dois
    // casos vale re-tentar; 4xx (400/401/403) e' erro nosso, nao adianta.
    const vaiTentarDeNovo = status === 429 || status >= 500 || status === 0;
    if (!vaiTentarDeNovo || tentativa >= MAX_RETRIES) {
      console.warn('[usage-sync] HubSpot', path, '->', status, JSON.stringify(body)?.slice(0, 400));
      return { ok: false, status, body };
    }

    const espera = esperaDoRetry(res, tentativa);
    if (status === 429) stats.retries429++;
    else stats.retries5xx++;
    stats.esperaMs += espera;
    console.warn(`[usage-sync] ${status} em ${path} — esperando ${espera}ms (tentativa ${tentativa + 1}/${MAX_RETRIES})`);
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

// Propriedade DATA do HubSpot chega como epoch em ms ("1754352000000") ou como
// "2026-08-05". Devolve 'YYYY-MM-DD' em UTC — o mesmo dia que o HubSpot mostra.
function toDateOnly(v: unknown): string | null {
  const s = trimOrNull(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ms = /^-?\d+$/.test(s) ? Number(s) : Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

type DealUso = {
  id_hubspot: string;
  ultima_comanda: string | null;
  cancelamento: string | null;
};

// Todos os deals de UMA etapa, paginado. O filtro vai na query — o HubSpot so'
// devolve quem esta na etapa, entao nao ha descarte no cliente.
async function buscarEtapa(
  token: string,
  stage: { id: string; label: string },
): Promise<{ deals: DealUso[]; paginas: number; truncado: boolean; erro?: string }> {
  const deals: DealUso[] = [];
  let after: string | undefined;
  let paginas = 0;

  for (let page = 0; page < MAX_PAGES_PER_STAGE; page++) {
    // O ritmo (1 req/s) e o retry de 429 vivem no hsFetch — aqui e' so' a
    // paginacao, sequencial de proposito.
    const res = await hsFetch(token, '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealstage', operator: 'EQ', value: stage.id }] }],
      properties: [PROP_ULTIMA_COMANDA, PROP_CANCELAMENTO],
      // Ordenacao estavel: sem ela a paginacao pode repetir/pular registros.
      sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
      limit: SEARCH_PAGE_SIZE,
      ...(after ? { after } : {}),
    });
    paginas++;

    if (!res.ok) {
      return {
        deals,
        paginas,
        truncado: false,
        erro: `busca da etapa "${stage.label}" falhou: ${res.body?.message ?? `status ${res.status}`}`,
      };
    }

    for (const d of res.body?.results ?? []) {
      const id = trimOrNull(d?.id);
      if (!id) continue;
      const props = d?.properties ?? {};
      deals.push({
        id_hubspot: id,
        ultima_comanda: toDateOnly(props[PROP_ULTIMA_COMANDA]),
        cancelamento: toDateOnly(props[PROP_CANCELAMENTO]),
      });
    }

    after = trimOrNull(res.body?.paging?.next?.after) ?? undefined;
    if (!after) return { deals, paginas, truncado: false };
  }

  // Saiu pelo teto de paginas com "after" ainda pendente: a etapa passou de 10k
  // deals e o HubSpot nao pagina alem disso. Reportado alto, nao em silencio.
  return { deals, paginas, truncado: true };
}

// Grava em lotes via RPC (1 chamada por lote). Um UPDATE por cliente daria
// ~3 mil round-trips e estouraria o tempo da function.
async function gravar(deals: DealUso[]): Promise<{ atualizados: number; erros: string[] }> {
  const db = serviceClient();
  const erros: string[] = [];
  let atualizados = 0;

  for (let i = 0; i < deals.length; i += DB_BATCH_SIZE) {
    const lote = deals.slice(i, i + DB_BATCH_SIZE);
    const { data, error } = await db.rpc('apply_hubspot_uso', { p_rows: lote });
    if (error) {
      erros.push(`gravacao do lote ${i / DB_BATCH_SIZE + 1} falhou: ${error.message}`);
      continue;
    }
    atualizados += Number(data ?? 0);
  }

  return { atualizados, erros };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(405, { error: 'Method Not Allowed' });
  }

  // Token PROPRIO deste sync quando existir. O limite da Search API (4 req/s)
  // e' por TOKEN, entao um private app so' pra ca isola esta varredura dos
  // outros fluxos do portal. Sem o secret, cai no token geral e funciona igual.
  const token = Deno.env.get('HUBSPOT_TOKEN_USAGE') ?? Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return json(503, { error: 'HUBSPOT_TOKEN_USAGE/HUBSPOT_TOKEN not configured' });
  const tokenProprio = !!Deno.env.get('HUBSPOT_TOKEN_USAGE');

  const inicio = Date.now();
  try {
    const todos: DealUso[] = [];
    const porEtapa: Record<string, unknown>[] = [];
    const erros: string[] = [];

    for (const stage of STAGES) {
      const { deals, paginas, truncado, erro } = await buscarEtapa(token, stage);
      if (erro) erros.push(erro);
      if (truncado) erros.push(`etapa "${stage.label}" passou de 10k deals — a busca foi truncada`);
      todos.push(...deals);
      porEtapa.push({ etapa: stage.label, stage_id: stage.id, deals: deals.length, paginas, truncado });
    }

    // Um deal so' pode estar numa etapa, mas se o HubSpot devolver repetido
    // (paginacao concorrente com movimentacao) o ultimo vence.
    const unicos = [...new Map(todos.map((d) => [d.id_hubspot, d])).values()];

    const { atualizados, erros: errosDb } = await gravar(unicos);
    erros.push(...errosDb);

    const resumo = {
      ok: erros.length === 0,
      deals_encontrados: unicos.length,
      clientes_atualizados: atualizados,
      // Deals sem pin no app (nunca cadastrados por aqui) — normal.
      deals_sem_pin_no_app: unicos.length - atualizados,
      // false = rodando no token geral (compartilha os 4 req/s da Search API
      // com os outros fluxos). true = private app dedicado.
      token_dedicado: tokenProprio,
      chamadas_hubspot: stats.chamadas,
      chamadas_banco: Math.ceil(unicos.length / DB_BATCH_SIZE),
      // Se retries_429 vier alto, o portal estava apertado na hora — vale
      // mover o horario do cron pra longe dos outros fluxos.
      retries_429: stats.retries429,
      retries_5xx: stats.retries5xx,
      espera_por_limite_ms: stats.esperaMs,
      duracao_ms: Date.now() - inicio,
      etapas: porEtapa,
      ...(erros.length ? { erros } : {}),
    };
    console.log('[usage-sync]', JSON.stringify(resumo));
    return json(erros.length ? 207 : 200, resumo);
  } catch (err) {
    console.error('[usage-sync] erro inesperado', err);
    return json(500, { error: 'Erro interno', detail: String(err) });
  }
});
