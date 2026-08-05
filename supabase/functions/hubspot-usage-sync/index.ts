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
// Fluxo (1 execucao/dia):
//   1) Uma busca por etapa (dealstage EQ), paginada de 100 em 100. Filtrar na
//      QUERY (e nao no codigo) e' o que segura o custo: so' vem quem interessa.
//   2) Grava em lotes de 500 via RPC apply_hubspot_uso (1 chamada por lote, em
//      vez de 1 UPDATE por cliente).
//
// Custo com ~3 mil clientes nas etapas: ~30 chamadas ao HubSpot + ~6 ao banco.
// Teto de seguranca: a Search API do HubSpot devolve no maximo 10k resultados
// por query — por isso a busca e' POR ETAPA (30k de folga), nao uma so.
//
// Roda 1x ao dia, agendada pelo Cron do Supabase:
//   Dashboard -> Integrations -> Cron -> Create job
//     Name:     hubspot-usage-sync-daily
//     Schedule: 0 9 * * *            (06:00 BRT = 09:00 UTC, todo dia)
//     Type:     Supabase Edge Function -> hubspot-usage-sync
//   O Cron manda a service role key no Authorization, entao o verify_jwt
//   continua LIGADO (a function nao fica aberta pra internet).
//
// Deploy:
//   supabase functions deploy hubspot-usage-sync
//
// Secrets (os mesmos da hubspot-sync — ja configurados no projeto):
//   HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
// A Search API tem limite proprio (~4 req/s por portal), bem mais apertado que
// o resto da API. As buscas ja sao sequenciais; esta pausa da a folga.
const SEARCH_PAUSE_MS = 250;
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

async function hsFetch(token: string, path: string, payload: unknown): Promise<HsResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${HS}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      console.warn('[usage-sync] HubSpot', path, '->', res.status, JSON.stringify(body)?.slice(0, 400));
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    console.warn('[usage-sync] HubSpot fetch falhou', path, err);
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
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
    if (paginas > 0) await sleep(SEARCH_PAUSE_MS);
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

  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return json(503, { error: 'HUBSPOT_TOKEN not configured' });

  const inicio = Date.now();
  try {
    const todos: DealUso[] = [];
    const porEtapa: Record<string, unknown>[] = [];
    const erros: string[] = [];
    let chamadasHubspot = 0;

    for (const stage of STAGES) {
      const { deals, paginas, truncado, erro } = await buscarEtapa(token, stage);
      chamadasHubspot += paginas;
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
      chamadas_hubspot: chamadasHubspot,
      chamadas_banco: Math.ceil(unicos.length / DB_BATCH_SIZE),
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
