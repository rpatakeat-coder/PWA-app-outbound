// Supabase Edge Function: cockpit-api
//
// As rotas de servidor do Cockpit Field Sales (mudar etapa, criar e desfazer
// negocio, nota, tarefa de rota, MRR, sugestao do gestor, empresa da prospeccao,
// restaurantes proximos, novidades de mercado, importar e buscar leads), servidas
// pelo APP. O codigo das
// rotas e o do Cockpit, byte a byte, em cockpit.js (gerado por
// scripts/portar-cockpit-api.cjs). Este arquivo so faz a ponte:
//
//   /functions/v1/cockpit-api/<rota>  ->  api/<rota>.js do Cockpit
//
//   - process.env: os segredos do APP. SUPABASE_URL/ANON_KEY sao os do APP, entao
//     a checagem de sessao que cada rota faz em /auth/v1/user valida o login do
//     mapa. SUPABASE_SERVICE_KEY e a service role do APP (as tabelas que as rotas
//     escrevem — leads_prospeccao, novidades_mercado, restaurantes_osm — existem
//     aqui no formato do Cockpit, 0089);
//   - data/usuarios.json: equipe_cockpit + profiles, lida a cada chamada. E dela
//     que cada rota tira o papel (gestor/executivo) e o ownerId da pessoa — a
//     trava "so o dono ou um gestor mexe no negocio";
//   - territorios, leads-referencia, redes-excluidas, maptiler, cadencias,
//     comissionamento, temperatura: public.cockpit_config; supabase-config: o APP.
//
// Publicado duas vezes (ver modoRobo): cockpit-api com verify_jwt ligado, para a
// tela; cockpit-robo com verify_jwt desligado e SO importar-leads, para os robos.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
// O pacote vem do proprio repositorio, FIXADO NO HASH do commit que o gerou: o que
// roda e, por construcao, o arquivo versionado — sem copia manual no deploy.
// Gerou de novo? Commit, e troque o hash aqui pelo do commit novo.
import { carregador, ROTAS, ORIGEM } from 'https://raw.githubusercontent.com/rpatakeat-coder/PWA-app-outbound/7421944e8ab6685576974041838f214a35b18e17/supabase/functions/cockpit-api/cockpit.js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// ---- process.env das rotas ----
const env: Record<string, string> = {};
const segredo = (nome: string, de = nome) => { const v = Deno.env.get(de); if (v) env[nome] = v; };
segredo('HUBSPOT_TOKEN');
segredo('SUPABASE_URL');
segredo('SUPABASE_ANON_KEY');
segredo('SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
segredo('CASADOSDADOS_TOKEN');
segredo('SERPER_API_KEY');
segredo('PWA_DEEP_LINK');
// A porta dos robos de leads (x-import-secret), o mesmo segredo do GitHub.
segredo('IMPORT_SECRET');

// ---- os .json, vivos ----
// Os modulos do Cockpit guardam a referencia no carregamento
// (USUARIOS = Array.isArray(raw) ? raw : raw.usuarios), entao o que se entrega e
// SEMPRE O MESMO objeto, com o conteudo trocado no lugar a cada chamada.
const USUARIOS: any[] = [];
const CHAVE_CONFIG: Record<string, string> = {
  'data/redes-excluidas.json': 'redes-excluidas',
  'data/maptiler-config.json': 'maptiler-config',
  'data/territorios.json': 'territorios',
  'data/leads-referencia.json': 'leads-referencia',
  'data/cadencias.json': 'cadencias',
  'data/comissionamento.json': 'comissionamento',
  'data/temperatura.json': 'temperatura',
};
const CONFIG_JSON: Record<string, any> = Object.fromEntries(Object.keys(CHAVE_CONFIG).map((k) => [k, {}]));
// A configuracao do Supabase do Cockpit e a do APP (o banco onde tudo vive agora).
const SUPABASE_CONFIG = { url: Deno.env.get('SUPABASE_URL'), anonKey: Deno.env.get('SUPABASE_ANON_KEY') };
// fs: so o modo linha de comando do backfill usa (require.main === module, que no
// pacote nunca e verdade). Qualquer uso real cai aqui e falha alto.
const FS_SUBSTITUTO = {
  existsSync: () => false,
  appendFileSync: () => {},
  readFileSync: () => { throw new Error('fs indisponivel na Edge Function'); },
  writeFileSync: () => { throw new Error('fs indisponivel na Edge Function'); },
};
function trocarNoLugar(alvo: any, novo: any) {
  Object.keys(alvo).forEach((k) => delete alvo[k]);
  Object.assign(alvo, novo || {});
}

let assinaturaConfig: string | null = null;
async function atualizarConfig() {
  const { data: ass } = await svc.from('cockpit_config').select('chave, atualizado_em');
  const assinatura = (ass ?? []).map((l: any) => l.chave + '@' + l.atualizado_em).sort().join('|');
  if (assinatura && assinatura === assinaturaConfig) return;
  const { data, error } = await svc.from('cockpit_config').select('chave, conteudo')
    .in('chave', Object.values(CHAVE_CONFIG));
  if (error) throw new Error('cockpit_config: ' + error.message);
  const porChave: Record<string, any> = {};
  (data ?? []).forEach((l: any) => { porChave[l.chave] = l.conteudo; });
  Object.entries(CHAVE_CONFIG).forEach(([arquivo, chave]) => trocarNoLugar(CONFIG_JSON[arquivo], porChave[chave]));
  assinaturaConfig = assinatura;
}

async function atualizarEquipe() {
  const { data, error } = await svc
    .from('equipe_cockpit')
    .select('papel, nome, ordem, ignorar_owner, so_acesso, ramp_stage, a_comecar, field_status, profiles!inner(email, full_name, id_hubspot)')
    .eq('ativo', true)
    .order('ordem', { ascending: true, nullsFirst: false });
  if (error) throw new Error('equipe_cockpit: ' + error.message);
  // Mesmo mapeamento da cockpit-dados. Quem e so_acesso entra (tem papel de
  // gestor para agir), mas sem dono no HubSpot — nada e criado em nome dele.
  const lista = (data ?? []).map((l: any) => {
    const p = l.profiles ?? {};
    const x: Record<string, unknown> = {
      email: String(p.email ?? '').toLowerCase(),
      role: l.papel,
      ownerId: (l.ignorar_owner || l.so_acesso) ? null : (p.id_hubspot ?? null),
      nome: l.nome ?? p.full_name ?? undefined,
    };
    if (l.ramp_stage) x.rampStage = l.ramp_stage;
    if (l.a_comecar) x.aComecar = true;
    if (l.field_status) x.fieldStatus = l.field_status;
    return x;
  });
  USUARIOS.splice(0, USUARIOS.length, ...lista);
}

const carregar = carregador({
  process: { env },
  json(caminho: string) {
    if (caminho === 'data/usuarios.json') return USUARIOS;
    if (caminho === 'data/supabase-config.json') return SUPABASE_CONFIG;
    if (CONFIG_JSON[caminho]) return CONFIG_JSON[caminho];
    // snapshot (hubspot.json, narrativas.json...): o Cockpit pede com requireOpcional
    // e, sem o arquivo, segue com null — o mesmo comportamento da Vercel.
    throw new Error('json do Cockpit nao servido: ' + caminho);
  },
  externo(nome: string) {
    if (nome === 'fs') return FS_SUBSTITUTO;
    throw new Error('modulo externo nao servido: ' + nome);
  },
});

// ---- req/res da Vercel sobre Request/Response ----
async function executar(handler: any, request: Request, url: URL): Promise<Response> {
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const texto = request.method === 'GET' || request.method === 'OPTIONS' ? '' : await request.text();
  let body: unknown = undefined;
  if (texto) { try { body = JSON.parse(texto); } catch { body = texto; } }
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });
  const req = { method: request.method, headers, body, query, url: url.pathname + url.search };

  const saidaHeaders: Record<string, string> = { ...CORS };
  let status = 200;
  let resolver!: (r: Response) => void;
  const pronto = new Promise<Response>((r) => { resolver = r; });
  let respondido = false;
  const finalizar = (corpo: BodyInit | null) => {
    if (respondido) return;
    respondido = true;
    resolver(new Response(status === 204 || status === 304 ? null : corpo, { status, headers: saidaHeaders }));
  };
  const res: any = {
    get statusCode() { return status; },
    set statusCode(n: number) { status = n; },
    status(n: number) { status = n; return res; },
    setHeader(k: string, v: string) { saidaHeaders[k] = String(v); return res; },
    getHeader(k: string) { return saidaHeaders[k]; },
    json(o: unknown) { saidaHeaders['Content-Type'] = 'application/json; charset=utf-8'; finalizar(JSON.stringify(o)); return res; },
    send(x: unknown) {
      if (x !== null && typeof x === 'object') return res.json(x);
      finalizar(x == null ? null : String(x)); return res;
    },
    end(x?: unknown) { finalizar(x == null ? null : String(x)); return res; },
  };

  try {
    await handler(req, res);
  } catch (e) {
    if (!respondido) { status = 500; res.json({ erro: 'Falha na rota: ' + String((e as Error)?.message || e) }); }
  }
  if (!respondido) { status = 500; res.json({ erro: 'A rota terminou sem responder.' }); }
  return pronto;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  // Duas publicacoes deste mesmo arquivo:
  //   cockpit-api  (verify_jwt ligado): a tela, com a sessao do usuario;
  //   cockpit-robo (verify_jwt desligado): SO importar-leads, a porta dos robos
  //     do GitHub, que se identificam por x-import-secret e nao tem JWT. A rota
  //     do Cockpit valida o segredo (ou a sessao) por conta propria — fail-closed.
  const modoRobo = /\/cockpit-robo(\/|$)/.test(url.pathname);
  const permitidas = modoRobo ? ['importar-leads'] : ROTAS;
  // Os robos montam `${COCKPIT_URL}/api/importar-leads`: o prefixo api/ cai aqui.
  const rota = url.pathname.replace(/^.*\/cockpit-(api|robo)\/?/, '').replace(/^api\//, '').replace(/\/+$/, '');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!rota) {
    return new Response(JSON.stringify({ ok: true, origem: 'cockpit-unificado@' + ORIGEM, rotas: permitidas }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (!permitidas.includes(rota)) {
    return new Response(JSON.stringify({ erro: 'Rota do Cockpit ainda não trazida para o APP: ' + rota }),
      { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  try {
    await Promise.all([atualizarEquipe(), atualizarConfig()]);
  } catch (e) {
    return new Response(JSON.stringify({ erro: 'Não consegui ler a equipe/configuração: ' + (e as Error).message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  return executar(carregar('api/' + rota + '.js'), request, url);
});
