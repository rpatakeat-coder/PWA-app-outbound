// Supabase Edge Function: motor-contas-alvo
//
// Motor mensal das contas-alvo (prompt final, Parte A §8.1; migrations 0110/0112).
// Objetivo: a rota não mandar o executivo a restaurante que fechou — cada
// visita perdida é uma venda a menos.
//
// Cada rodada pega as contas-alvo mais antigas na fila (nunca conferidas, ou
// conferidas há 30+ dias), confere e grava motor_conferido_em, motor_status
// (ok | sumiu_google | fechado_temporario | nao_achado | cnpj_baixado),
// motor_google_place_id, motor_detalhe e a nota/avaliações da conta-alvo
// (colunas do motor — nada que a rua preencheu é tocado).
// place_id do Google (ChIJ…) → Place Details. Munição ("municao:…") → Receita
// pelo CNPJ (BrasilAPI) e, se ativo, busca no Google pelo nome fantasia perto
// do pino; só aceita lugar com o mesmo nome (palavras próprias) e na mesma cidade.
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
const RAIO_COM_NOME_M = 1500;
// Razão social atrapalha a busca do Google ("1968 BURGUER LTDA"): sai o tipo da empresa.
const SUFIXOS = /\b(LTDA|EIRELI|EPP|ME|S\/?A|MEI)\b\.?/gi;
const limparNome = (s: string) => s.replace(SUFIXOS, '').replace(/\s{2,}/g, ' ').trim();
// Palavras que não identificam o lugar: tipo de empresa e genéricas do ramo. Com
// elas o motor casava "1968 BURGUER" com "Villa Burguer" e "SERENZZA GELATO" com
// "Dezato Gelato" (26/09) — e dizer "aberto" pelo vizinho esconde o fechamento.
const IGNORAR = new Set(['ltda', 'eireli', 'restaurante', 'restaurantes', 'comercio', 'alimentacao', 'alimentos', 'refeicoes',
  'lanchonete', 'lanches', 'bares', 'pizzaria', 'pizza', 'pizzas', 'servicos', 'empresa', 'industria', 'distribuidora', 'brasil',
  'grill', 'cozinha', 'burguer', 'burger', 'burgers', 'hamburgueria', 'gelato', 'gelateria', 'sorveteria', 'cafe', 'cafes',
  'cafeteria', 'coffee', 'sushi', 'temakeria', 'poke', 'casa', 'nova', 'novo', 'shopping', 'gourmet', 'deli', 'bistro',
  'doces', 'doceria', 'bolos', 'padaria', 'panificadora', 'pastelaria', 'pastel', 'esfiharia', 'esfiha', 'acai', 'espetinho',
  'churrascaria', 'rotisseria', 'marmitaria', 'food', 'foods', 'express', 'delivery', 'house', 'point', 'espaco', 'center',
  'central', 'sabor', 'sabores', 'mais', 'filial', 'unidade', 'matriz', 'zona', 'norte', 'leste', 'oeste']);
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function distM(a: number, b: number, c: number, d: number) {
  const r = 6371000, t = Math.PI / 180;
  const x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

type Achado = { status: 'ok' | 'sumiu_google' | 'fechado_temporario' | 'nao_achado' | 'cnpj_baixado'; placeId: string | null; rating: number | null; reviews: number | null; detalhe: string };

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

// Receita (BrasilAPI, gratuita): situação cadastral e nome fantasia (0112).
async function receita(cnpj: string): Promise<{ situacao: string | null; fantasia: string | null } | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!r.ok) return null;
    const d = await r.json();
    return { situacao: d?.descricao_situacao_cadastral ?? null, fantasia: (d?.nome_fantasia || '').trim() || null };
  } catch { return null; }
}

async function porBusca(key: string, c: { empresa: string | null; nome: string; endereco: string | null; cidade: string | null; bairro?: string | null; latitude: number; longitude: number }, nomeBusca?: string | null): Promise<Achado> {
  const texto = [limparNome(nomeBusca || c.empresa?.trim() || c.nome), c.endereco, c.cidade].filter(Boolean).join(', ');
  const r = await fetch(`${PLACES}/places:searchText`, {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': key, 'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.businessStatus,places.rating,places.userRatingCount,places.location',
    },
    body: JSON.stringify({
      textQuery: texto, languageCode: 'pt-BR', maxResultCount: 5,
      locationBias: { circle: { center: { latitude: c.latitude, longitude: c.longitude }, radius: 300 } },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Places ${r.status}: ${d?.error?.message ?? 'sem mensagem'}`);
  // Aceite (estrito): o NOME tem de bater — pelo menos metade das palavras
  // próprias do nome buscado aparecem no nome achado (genéricas do ramo não
  // contam) — e o endereço achado é da mesma cidade. Perto sem nome não basta:
  // a 1ª versão aceitava o vizinho a até 150 m ("MIX GOURMET" virou "Café Inglês").
  // O pino da munição veio de endereço convertido e pode estar longe da porta,
  // então com nome e cidade batendo aceita até 1,5 km.
  const palavras = (s: string) => new Set(semAcento(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !IGNORAR.has(w)));
  // Palavra da cidade/bairro no nome ("POINT SUZANO") casaria com qualquer lugar dali.
  const local = new Set([...palavras(c.cidade ?? ''), ...palavras(c.bairro ?? '')]);
  const alvo = new Set([...palavras(nomeBusca || c.empresa || c.nome)].filter((w) => !local.has(w)));
  const bateNome = (n: string) => {
    if (!alvo.size) return false;
    const achado = palavras(n);
    let em = 0;
    for (const w of alvo) if (achado.has(w)) em++;
    // Nome de 2+ palavras próprias exige 2 batendo ("Varanda Poke" não é "Varanda Verde").
    return em >= Math.min(2, alvo.size) && em / alvo.size >= 0.5;
  };
  const cidade = c.cidade ? semAcento(c.cidade).trim() : '';
  const mesmaCidade = (end: string | undefined) => !cidade || !end || semAcento(end).includes(cidade);
  const cands = (d.places ?? [])
    .map((p: any) => ({ p, m: p.location ? distM(c.latitude, c.longitude, p.location.latitude, p.location.longitude) : Infinity }))
    .filter((x: any) => x.m <= RAIO_COM_NOME_M && bateNome(x.p.displayName?.text ?? '') && mesmaCidade(x.p.formattedAddress))
    .sort((a: any, b: any) => a.m - b.m);
  const perto = cands[0];
  if (!perto) return { status: 'nao_achado', placeId: null, rating: null, reviews: null, detalhe: `nenhum lugar com o mesmo nome na mesma cidade a até ${RAIO_COM_NOME_M} m para "${texto}"` };
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
    .select('id, empresa, nome, endereco, bairro, cidade, latitude, longitude, conta_alvo_place_id, motor_google_place_id, conta_alvo_dismissed, is_teste, lead_prospeccao_id')
    .not('conta_alvo_place_id', 'is', null)
    .eq('status', 'lead')
    // um .or() só: descartado e teste saem logo abaixo, no código
    .or(`motor_conferido_em.is.null,motor_conferido_em.lt.${antes}`)
    .not('latitude', 'is', null)
    .order('motor_conferido_em', { ascending: true, nullsFirst: true })
    .limit(limite * 2);
  if (error) return json(500, { error: error.message });

  const contagem: Record<string, number> = { ok: 0, sumiu_google: 0, fechado_temporario: 0, nao_achado: 0, cnpj_baixado: 0, erro: 0 };
  const amostra: unknown[] = [];
  let primeiroErro: string | null = null;
  // Regra do prompt: descartado não se reconfere (nem se recria); teste fica fora.
  const lista = ((fila ?? []) as any[]).filter((c) => !c.conta_alvo_dismissed && !c.is_teste).slice(0, limite);
  // CNPJ da munição (leads_prospeccao.cnpj): uma consulta para a rodada toda.
  const idsLp = [...new Set(lista.map((c) => c.lead_prospeccao_id).filter(Boolean))];
  const cnpjDe = new Map<string, string>();
  if (idsLp.length) {
    const { data: lps } = await svc.from('leads_prospeccao').select('id, cnpj').in('id', idsLp);
    for (const l of (lps ?? []) as { id: string; cnpj: string | null }[]) {
      const so = String(l.cnpj ?? '').replace(/[^0-9]/g, '');
      if (so.length === 14) cnpjDe.set(l.id, so);
    }
  }

  // 5 por vez: rápido o bastante para caber no tempo da função, sem martelar a cota.
  for (let i = 0; i < lista.length; i += 5) {
    await Promise.all(lista.slice(i, i + 5).map(async (c) => {
      try {
        const id = String(c.motor_google_place_id || c.conta_alvo_place_id);
        let a: Achado;
        if (id.startsWith('ChIJ') || id.startsWith('Ei') || id.startsWith('Gh')) {
          a = await porPlaceId(key, id);
        } else {
          // Munição: primeiro a Receita. Baixado/inapto já é o alerta (sem gastar Google);
          // ativo dá o nome fantasia, que é como o Google conhece o lugar.
          const cnpj = c.lead_prospeccao_id ? cnpjDe.get(c.lead_prospeccao_id) : undefined;
          const rf = cnpj ? await receita(cnpj) : null;
          if (rf?.situacao && !/ATIVA/i.test(rf.situacao)) {
            a = { status: 'cnpj_baixado', placeId: null, rating: null, reviews: null, detalhe: `Receita: ${rf.situacao}` };
          } else {
            const pos = { ...c, latitude: Number(c.latitude), longitude: Number(c.longitude) };
            a = await porBusca(key, pos, rf?.fantasia);
            if (a.status === 'nao_achado' && rf?.fantasia) a = await porBusca(key, pos);
          }
        }
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
