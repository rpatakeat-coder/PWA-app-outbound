// Supabase Edge Function: motor-contas-alvo
//
// Motor mensal das contas-alvo (prompt final, Parte A §8.1; migration 0110).
// Objetivo: a rota não mandar o executivo a restaurante que fechou — cada
// visita perdida é uma venda a menos.
//
// Cada rodada pega as contas-alvo mais antigas na fila (nunca conferidas, ou
// conferidas há 30+ dias), confere no Google Places (New) e grava:
//   motor_conferido_em, motor_status (ok | sumiu_google | fechado_temporario |
//   nao_achado), motor_google_place_id, motor_detalhe, e a nota/avaliações da
//   conta-alvo (colunas do motor — nada que a rua preencheu é tocado).
// place_id do Google (ChIJ…) → Place Details. Munição ("municao:…") → busca
// por nome + endereço perto do pino; só aceita o achado a até 150 m.
//
// Chamada pelo pg_cron via public.invocar_motor_contas_alvo (header
// x-cron-secret conferido por public.segredo_confere). verify_jwt DESLIGADO:
// quem chama é o banco, e o segredo é a trava.
// Secrets: GOOGLE_PLACES_API_KEY (ou GOOGLE_GEOCODING_API_KEY, mesmo projeto
// GCP com a Places API (New) ligada).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PLACES = 'https://places.googleapis.com/v1';
const RAIO_ACEITE_M = 150;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function distM(a: number, b: number, c: number, d: number) {
  const r = 6371000, t = Math.PI / 180;
  const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

type Achado = { status: 'ok' | 'sumiu_google' | 'fechado_temporario' | 'nao_achado'; placeId: string | null; rating: number | null; reviews: number | null; detalhe: string };

const statusDe = (b: string | undefined): Achado['status'] =>
  b === 'CLOSED_PERMANENTLY' ? 'sumiu_google' : b === 'CLOSED_TEMPORARILY' ? 'fechado_temporario' : 'ok';

async function porPlaceId(key: string, id: string): Promise<Achado> {
  const r = await fetch(`${PLACES}/places/${encodeURIComponent(id)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,businessStatus,rating,userRatingCount' },
  });
  if (r.status === 404) return { status: 'sumiu_google', placeId: null, rating: null, reviews: null, detalhe: 'o Google não tem mais este lugar' };
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Places ${r.status}: ${d?.error?.message ?? 'sem mensagem'}`);
  return {
    status: statusDe(d.businessStatus), placeId: d.id ?? id,
    rating: typeof d.rating === 'number' ? d.rating : null,
    reviews: typeof d.userRatingCount === 'number' ? d.userRatingCount : null,
    detalhe: d.businessStatus ?? 'sem status',
  };
}

async function porBusca(key: string, c: { empresa: string | null; nome: string; endereco: string | null; cidade: string | null; latitude: number; longitude: number }): Promise<Achado> {
  const texto = [c.empresa?.trim() || c.nome, c.endereco, c.cidade].filter(Boolean).join(', ');
  const r = await fetch(`${PLACES}/places:searchText`, {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': key, 'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'places.id,places.displayName,places.businessStatus,places.rating,places.userRatingCount,places.location',
    },
    body: JSON.stringify({
      textQuery: texto, languageCode: 'pt-BR', maxResultCount: 5,
      locationBias: { circle: { center: { latitude: c.latitude, longitude: c.longitude }, radius: 300 } },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Places ${r.status}: ${d?.error?.message ?? 'sem mensagem'}`);
  const perto = (d.places ?? [])
    .map((p: any) => ({ p, m: p.location ? distM(c.latitude, c.longitude, p.location.latitude, p.location.longitude) : Infinity }))
    .filter((x: any) => x.m <= RAIO_ACEITE_M)
    .sort((a: any, b: any) => a.m - b.m)[0];
  if (!perto) return { status: 'nao_achado', placeId: null, rating: null, reviews: null, detalhe: `nada a até ${RAIO_ACEITE_M} m para "${texto}"` };
  const p = perto.p;
  return {
    status: statusDe(p.businessStatus), placeId: p.id ?? null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    reviews: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    detalhe: `${p.displayName?.text ?? '?'} a ${Math.round(perto.m)} m · ${p.businessStatus ?? 'sem status'}`,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const segredo = req.headers.get('x-cron-secret') ?? '';
  const { data: ok } = await svc.rpc('segredo_confere', { p_nome: 'motor_contas_alvo', p_valor: segredo });
  if (ok !== true) return json(403, { error: 'segredo' });

  const key = Deno.env.get('GOOGLE_PLACES_API_KEY') || Deno.env.get('GOOGLE_GEOCODING_API_KEY') || '';
  if (!key) return json(503, { error: 'sem chave do Google Places' });

  const corpo = await req.json().catch(() => ({}));
  const dryRun = corpo?.dry_run === true;
  const limite = Math.max(1, Math.min(300, Number(corpo?.limite) || 120));
  const antes = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: fila, error } = await svc.from('clients')
    .select('id, empresa, nome, endereco, cidade, latitude, longitude, conta_alvo_place_id, motor_google_place_id, conta_alvo_dismissed, is_teste')
    .not('conta_alvo_place_id', 'is', null)
    .eq('status', 'lead')
    // um .or() só: descartado e teste saem logo abaixo, no código
    .or(`motor_conferido_em.is.null,motor_conferido_em.lt.${antes}`)
    .not('latitude', 'is', null)
    .order('motor_conferido_em', { ascending: true, nullsFirst: true })
    .limit(limite * 2);
  if (error) return json(500, { error: error.message });

  const contagem: Record<string, number> = { ok: 0, sumiu_google: 0, fechado_temporario: 0, nao_achado: 0, erro: 0 };
  const amostra: unknown[] = [];
  let primeiroErro: string | null = null;
  // Regra do prompt: descartado não se reconfere (nem se recria); teste fica fora.
  const lista = ((fila ?? []) as any[]).filter((c) => !c.conta_alvo_dismissed && !c.is_teste).slice(0, limite);

  // 5 por vez: rápido o bastante para caber no tempo da função, sem martelar a cota.
  for (let i = 0; i < lista.length; i += 5) {
    await Promise.all(lista.slice(i, i + 5).map(async (c) => {
      try {
        const id = String(c.motor_google_place_id || c.conta_alvo_place_id);
        const a = id.startsWith('ChIJ') || id.startsWith('Ei') || id.startsWith('Gh')
          ? await porPlaceId(key, id)
          : await porBusca(key, { ...c, latitude: Number(c.latitude), longitude: Number(c.longitude) });
        contagem[a.status]++;
        if (amostra.length < 8) amostra.push({ empresa: c.empresa ?? c.nome, ...a });
        if (!dryRun) {
          await svc.from('clients').update({
            motor_conferido_em: new Date().toISOString(),
            motor_status: a.status,
            motor_detalhe: a.detalhe.slice(0, 300),
            ...(a.placeId ? { motor_google_place_id: a.placeId } : {}),
            ...(a.rating != null ? { conta_alvo_rating: a.rating } : {}),
            ...(a.reviews != null ? { conta_alvo_reviews: a.reviews } : {}),
          }).eq('id', c.id);
        }
      } catch (e) {
        contagem.erro++;
        primeiroErro = primeiroErro ?? String((e as Error).message || e);
      }
    }));
    // Chave recusada (API desligada, cota): para a rodada em vez de gastar a fila inteira em erro.
    if (contagem.erro >= 5 && contagem.erro === i + 5) break;
  }

  return json(200, { ok: true, dryRun, conferidas: lista.length, contagem, primeiroErro, amostra });
});
