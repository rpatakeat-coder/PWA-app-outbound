// REPARADOR DE PINOS (cron repair-client-geocodes-every-10-hours).
//
// FONTE RECUPERADA DA PRODUÇÃO EM 29/10/26. Esta função rodava sem fonte no git
// (era uma das seis, ver supabase/AUDITORIA-reparador-de-pinos-29-10-26.md): o
// código vivia só no servidor e ninguém podia revisar o que escreve latitude e
// longitude na tabela `clients`. Agora está versionada.
//
// ─── O QUE MUDOU EM 29/10, E POR QUÊ ────────────────────────────────────────
//
// 1. A JANELA. A seleção era `.limit(500)` SEM `order by` — e há 7.119 linhas
//    elegíveis. O teto pegava 7% da base, sempre uma fatia arbitrária (o
//    PostgREST não promete ordem sem `order by`), e os filtros de pilha e de
//    já-tentados rodavam em JavaScript DEPOIS, sobre essas 500. Resultado
//    medido: dos 602 pinos empilhados elegíveis, 33 caíam na janela. Os outros
//    569 não eram "os próximos da fila" — eles não estavam na fila, e o cron
//    podia rodar mais um ano sem vê-los. O último reparo bem-sucedido foi
//    16/09. Agora a varredura é ordenada por id e paginada até o fim (8 idas
//    para as 7.119 linhas), e a contagem de coordenada repetida passa a ser
//    feita sobre a base INTEIRA, que é o único jeito de "está empilhado" querer
//    dizer alguma coisa.
//
// 2. O FLAG NÃO É ENFEITE — ELE DECIDE O RAIO DA PROVA DE VISITA. A função
//    gravava `geo_approximate: false` em todo acerto que passasse no seu teste
//    de precisão, e esse teste aceita acerto de RUA (`road`). Pino de rua
//    marcado como preciso recebe raio de 200 m em `_visitas_com_prova`, em vez
//    dos 500 m do aproximado — ou seja, afirmar precisão que ninguém conferiu
//    não é só impreciso: pode custar a visita provada do executivo, que é
//    dinheiro. É o mesmo pecado que a migration 0226 corrigiu no app. Agora o
//    flag segue o NÍVEL do acerto: porta (building, house, shop, amenity…) grava
//    preciso; rua grava aproximado, e continua sendo reparo — é melhor um pino
//    na rua certa, assumidamente aproximado, do que um pino na praça da cidade.
//
// 3. O GOOGLE NÃO ENTROU. Julyan, 29/10: "repare os pinos mas sem gasto". Só
//    Nominatim/OSM, que é de graça. Medido numa amostra de 20 empilhados: 55%
//    de acerto, o que aplicado aos 602 elegíveis recupera da ordem de 330 pinos
//    sem custo nenhum. Os demais seguem esperando uma decisão que custa.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

type ClientRow = { id: string; nome: string | null; endereco: string | null; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null; cep: string | null; latitude: string | number | null; longitude: string | number | null; geo_source: string | null; geo_approximate: boolean | null; };
type CepInfo = { logradouro: string | null; bairro: string | null; cidade: string | null; estado: string | null; };
type AttemptRow = { client_id: string; last_attempt_at: string; last_status: string; };

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const THROTTLE_MS = 1100;
const TIMEOUT_MS = 9000;
const USER_AGENT = 'TakeatClientMap-GeocodeRepair (contact: brittes@takeat.app)';
/** Tamanho da página da varredura e teto de páginas — 12 × 1000 cobre as 7.119 elegíveis com folga. */
const PAGINA = 1000;
const MAX_PAGINAS = 12;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value: unknown): string | null => { if (value === null || value === undefined) return null; const text = String(value).trim(); return text.length > 0 ? text : null; };
const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const cepIsGeneric = (cep: unknown): boolean => digits(cep).endsWith('000');

async function fetchJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.warn('[repair-client-geocodes] fetch failed', url, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupCep(cep: string | null): Promise<CepInfo | null> {
  const code = digits(cep);
  if (code.length !== 8 || cepIsGeneric(code)) return null;
  const viaCep = await fetchJson(`https://viacep.com.br/ws/${code}/json/`);
  if (viaCep && !viaCep.erro) return { logradouro: clean(viaCep.logradouro), bairro: clean(viaCep.bairro), cidade: clean(viaCep.localidade), estado: clean(viaCep.uf) };
  const brasilApi = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${code}`);
  if (brasilApi) return { logradouro: clean(brasilApi.street), bairro: clean(brasilApi.neighborhood), cidade: clean(brasilApi.city), estado: clean(brasilApi.state) };
  return null;
}

function buildAddress(row: ClientRow, cepInfo: CepInfo | null) {
  const logradouro = clean(row.endereco) ?? cepInfo?.logradouro ?? null;
  const numero = clean(row.numero);
  const bairro = clean(row.bairro) ?? cepInfo?.bairro ?? null;
  const cidade = clean(row.cidade) ?? cepInfo?.cidade ?? null;
  const estado = clean(row.estado) ?? cepInfo?.estado ?? null;
  const cep = clean(row.cep);
  if (!cidade || !estado) return { logradouro, bairro, cidade, estado, query: null };
  const line1 = [logradouro, numero].filter(Boolean).join(', ');
  const parts = [line1 || null, bairro, cidade, estado, cep, 'Brasil'].filter(Boolean);
  return { logradouro, bairro, cidade, estado, query: parts.join(', ') };
}

function normalizeHouseNumber(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^s\/?n$/i.test(trimmed)) return null;
  const numeric = trimmed.match(/\d+/)?.[0] ?? null;
  return numeric ? String(Number(numeric)) : trimmed;
}

/* O NÍVEL DO ACERTO, que é o que o flag passa a dizer.
   - 'porta'     : o ponto é o estabelecimento ou o número da casa → preciso.
   - 'rua'       : acertou a via, não a porta → reparo válido, mas APROXIMADO.
   - 'impreciso' : bairro, cidade, CEP, praça → não serve, segue pulado. */
function nivelDoAcerto(hit: any): 'porta' | 'rua' | 'impreciso' {
  const addresstype = String(hit?.addresstype ?? '').toLowerCase();
  const category = String(hit?.class ?? '').toLowerCase();
  const type = String(hit?.type ?? '').toLowerCase();
  const impreciso = new Set(['city', 'town', 'village', 'municipality', 'county', 'state', 'region', 'country', 'postcode', 'suburb', 'neighbourhood']);
  if (impreciso.has(addresstype) || impreciso.has(type)) return 'impreciso';
  if (category === 'boundary' || category === 'place') return 'impreciso';
  const naPorta = new Set(['building', 'house', 'house_number', 'shop', 'amenity', 'office', 'tourism', 'leisure', 'craft', 'healthcare']);
  if (naPorta.has(addresstype) || naPorta.has(category) || naPorta.has(type)) return 'porta';
  // 'road', 'highway' e o que mais passar daqui é via: acerta a rua, não a porta.
  return 'rua';
}

function lerAcerto(hit: any) {
  const lat = Number.parseFloat(hit?.lat);
  const lon = Number.parseFloat(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const nivel = nivelDoAcerto(hit);
  return { lat, lon, nivel, rawType: String(hit?.addresstype ?? hit?.type ?? 'unknown') };
}

function melhorAcerto(data: any) {
  if (!Array.isArray(data) || data.length === 0) return null;
  // Porta primeiro, rua depois; nunca um impreciso quando há algo melhor na lista.
  const porta = data.find((h: any) => nivelDoAcerto(h) === 'porta');
  const rua = data.find((h: any) => nivelDoAcerto(h) === 'rua');
  return lerAcerto(porta ?? rua ?? data[0]);
}

async function geocode(query: string) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=3&countrycodes=br`;
  return melhorAcerto(await fetchJson(url));
}

async function geocodeStructured(row: ClientRow, cepInfo: CepInfo | null) {
  const logradouro = clean(row.endereco) ?? cepInfo?.logradouro ?? null;
  const numero = normalizeHouseNumber(clean(row.numero));
  const cidade = clean(row.cidade) ?? cepInfo?.cidade ?? null;
  const estado = clean(row.estado) ?? cepInfo?.estado ?? null;
  const cep = clean(row.cep);
  if (!logradouro || !cidade || !estado) return null;
  const params = new URLSearchParams({ street: [numero, logradouro].filter(Boolean).join(' '), city: cidade, state: estado, country: 'Brasil', format: 'jsonv2', addressdetails: '1', limit: '3', countrycodes: 'br' });
  if (cep) params.set('postalcode', cep);
  return melhorAcerto(await fetchJson(`https://nominatim.openstreetmap.org/search?${params.toString()}`));
}

async function recordAttempt(supabase: any, row: ClientRow, status: 'repaired' | 'skipped' | 'failed', reason?: string, query?: string, error?: string) {
  await supabase.from('geocode_repair_attempts').upsert({
    client_id: row.id,
    attempts: 1,
    last_attempt_at: new Date().toISOString(),
    last_status: status,
    last_reason: reason ?? null,
    last_query: query ?? null,
    last_error: error ?? null,
    last_repaired_at: status === 'repaired' ? new Date().toISOString() : null,
  }, { onConflict: 'client_id', ignoreDuplicates: false });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const secret = Deno.env.get('REPAIR_GEOCODE_SECRET') ?? Deno.env.get('HUBSPOT_WEBHOOK_SECRET');
  if (!secret) return json(500, { error: 'Configure REPAIR_GEOCODE_SECRET or HUBSPOT_WEBHOOK_SECRET' });
  if (req.headers.get('x-repair-secret') !== secret && req.headers.get('x-webhook-secret') !== secret) return json(401, { error: 'Unauthorized' });

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run !== false;
  const onlyDuplicates = body.only_duplicates !== false;
  const onlyHubspotApprox = body.only_hubspot_approx !== false;
  const includeGenericCep = body.include_generic_cep === true;
  const limit = Math.min(Math.max(Number(body.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const offset = Math.max(Number(body.offset ?? 0), 0);
  const retryAfterDays = Math.max(Number(body.retry_after_days ?? 7), 0);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  /* VARREDURA ORDENADA E PAGINADA, em vez do `.limit(500)` sem ordem. É preciso ler TODAS as
     elegíveis antes de filtrar, porque "está empilhado" é uma propriedade da base inteira: com
     500 linhas ao acaso, dois irmãos de pilha quase nunca caem na mesma fatia. */
  const rows: ClientRow[] = [];
  let paginas = 0;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    let query = supabase.from('clients')
      .select('id,nome,endereco,numero,bairro,cidade,estado,cep,latitude,longitude,geo_source,geo_approximate')
      .not('latitude', 'is', null).not('longitude', 'is', null)
      .not('cep', 'is', null).not('numero', 'is', null)
      .order('id', { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (onlyHubspotApprox) query = query.eq('geo_source', 'hubspot').eq('geo_approximate', true);
    const { data, error } = await query;
    if (error) return json(500, { error: error.message });
    const lote = (data ?? []) as ClientRow[];
    rows.push(...lote);
    paginas = pagina + 1;
    if (lote.length < PAGINA) break;
  }

  const coordCounts = new Map<string, number>();
  for (const row of rows) coordCounts.set(`${row.latitude},${row.longitude}`, (coordCounts.get(`${row.latitude},${row.longitude}`) ?? 0) + 1);

  /* Os filtros que não dependem de rede, ANTES de perguntar pelas tentativas: assim o `.in()` das
     tentativas recebe centenas de ids em vez de milhares, e não estoura a URL. */
  const elegiveis = rows
    .filter((row) => !onlyDuplicates || (coordCounts.get(`${row.latitude},${row.longitude}`) ?? 0) > 1)
    .filter((row) => includeGenericCep || !cepIsGeneric(row.cep));

  const attemptsByClient = new Map<string, AttemptRow>();
  for (let i = 0; i < elegiveis.length; i += 200) {
    const ids = elegiveis.slice(i, i + 200).map((row) => row.id);
    const { data: attempts } = await supabase.from('geocode_repair_attempts').select('client_id,last_attempt_at,last_status').in('client_id', ids);
    for (const attempt of (attempts ?? []) as AttemptRow[]) attemptsByClient.set(attempt.client_id, attempt);
  }
  const retryCutoff = Date.now() - retryAfterDays * 24 * 60 * 60 * 1000;

  const naFila = elegiveis.filter((row) => {
    const attempt = attemptsByClient.get(row.id);
    if (!attempt) return true;
    return new Date(attempt.last_attempt_at).getTime() < retryCutoff;
  });
  const candidates = naFila.slice(offset, offset + limit);

  const repaired: unknown[] = [];
  const skipped: unknown[] = [];

  for (let index = 0; index < candidates.length; index++) {
    const row = candidates[index];
    const cepInfo = await lookupCep(row.cep);
    const address = buildAddress(row, cepInfo);
    if (!address.query) {
      skipped.push({ id: row.id, reason: 'insufficient_address' });
      if (!dryRun) await recordAttempt(supabase, row, 'skipped', 'insufficient_address');
    } else {
      const result = (await geocodeStructured(row, cepInfo)) ?? (await geocode(address.query));
      if (!result) {
        skipped.push({ id: row.id, reason: 'geocode_not_found', query: address.query });
        if (!dryRun) await recordAttempt(supabase, row, 'skipped', 'geocode_not_found', address.query);
      } else if (result.nivel === 'impreciso') {
        skipped.push({ id: row.id, reason: 'geocode_imprecise', query: address.query, raw_type: result.rawType });
        if (!dryRun) await recordAttempt(supabase, row, 'skipped', `geocode_imprecise:${result.rawType}`, address.query);
      } else {
        // O FLAG SEGUE O NÍVEL: rua é reparo aproximado, não reparo preciso.
        const aproximado = result.nivel === 'rua';
        const updateFields: Record<string, unknown> = { latitude: result.lat, longitude: result.lon, geo_source: 'nominatim', geo_approximate: aproximado, updated_at: new Date().toISOString() };
        if (!clean(row.endereco) && address.logradouro) updateFields.endereco = address.logradouro;
        if (!clean(row.bairro) && address.bairro) updateFields.bairro = address.bairro;
        if (!clean(row.cidade) && address.cidade) updateFields.cidade = address.cidade;
        if (!clean(row.estado) && address.estado) updateFields.estado = address.estado;
        if (!dryRun) {
          const { error: updateError } = await supabase.from('clients').update(updateFields).eq('id', row.id);
          if (updateError) {
            skipped.push({ id: row.id, reason: 'update_failed', error: updateError.message });
            await recordAttempt(supabase, row, 'failed', 'update_failed', address.query, updateError.message);
          } else {
            repaired.push({ id: row.id, nome: row.nome, from: [row.latitude, row.longitude], to: [result.lat, result.lon], nivel: result.nivel, aproximado, query: address.query });
            await recordAttempt(supabase, row, 'repaired', `nivel:${result.nivel}`, address.query);
          }
        } else repaired.push({ id: row.id, nome: row.nome, from: [row.latitude, row.longitude], to: [result.lat, result.lon], nivel: result.nivel, aproximado, query: address.query, dry_run: true });
      }
    }
    if (index < candidates.length - 1) await sleep(THROTTLE_MS);
  }

  return json(200, {
    ok: true, dry_run: dryRun, offset,
    // A varredura agora é auditável: quantas páginas, quantas elegíveis e quantas de fato na fila.
    varredura: { paginas, lidas: rows.length, elegiveis: elegiveis.length, na_fila: naFila.length },
    selected: candidates.length, repaired_count: repaired.length, skipped_count: skipped.length, repaired, skipped,
  });
});
