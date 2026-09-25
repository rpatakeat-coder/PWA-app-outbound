// Supabase Edge Function: cockpit-dados
//
// PORTA de julyanrib/cockpit-unificado api/dados.js (25/09/2026). É por aqui que
// o Cockpit, servido em /gestao do APP, recebe os dados do CRM depois do login.
//
// O que mudou em relação ao original, e só isto:
//   - a sessão é a do APP (mesmo login do mapa), validada com auth.getUser;
//   - quem é da equipe e com que papel vem de equipe_cockpit + profiles (0091),
//     não de data/usuarios.json. O dono no HubSpot é profiles.id_hubspot;
//   - o snapshot é lido de public.cockpit_snapshot do APP (0089).
// A montagem e o recorte por papel (montar-dados.js) são os do Cockpit,
// conferidos contra o original: mesma entrada, mesma saída, pessoa por pessoa.
//
// FAIL-CLOSED, como o original: sem sessão válida ou sem cadastro ativo na
// equipe, nada sai. O snapshot é o CRM inteiro do time; o que sai daqui é só o
// recorte de quem pediu (gestor: tudo; executivo: o próprio funil + resumo
// agregado dos colegas).
//
// Recursos (?recurso=): playbook (sem o capítulo Liderança para executivo),
// precificacao, realizado-hoje (ao vivo no HubSpot).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  montarDadosCompletos, filtrarParaPapel, usarEquipe, usarConfig, usarSnapshot, temSnapshot, faltandoNoSnapshot,
} from './montar-dados.js';
import * as REALIZADO from './realizado.js';

const CAPITULO_DE_GESTOR = 'Liderança';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // Dado sensível por sessão — nunca em cache compartilhado.
  'Cache-Control': 'private, no-store',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Snapshot já baixado por esta instância (mesma lógica do original: guarda as
// FONTES cruas, nunca o dado montado, para o recorte por papel ter um lugar só).
const CACHE: { assinatura: string | null; fontes: Record<string, unknown> | null; atualizadoEm: string | null } =
  { assinatura: null, fontes: null, atualizadoEm: null };
// Configuração (public.cockpit_config, 0092): mesma ideia da assinatura — só
// baixa de novo quando alguma chave mudou.
const CONFIG: { assinatura: string | null; valores: Record<string, any> } = { assinatura: null, valores: {} };

async function lerConfig(svc: any): Promise<Record<string, any>> {
  const { data: ass } = await svc.from('cockpit_config').select('chave, atualizado_em');
  const assinatura = Array.isArray(ass) && ass.length
    ? ass.map((l: any) => String(l.chave) + '@' + String(l.atualizado_em)).sort().join('|') : null;
  if (assinatura && CONFIG.assinatura === assinatura) return CONFIG.valores;
  const { data: lin, error } = await svc.from('cockpit_config').select('chave, conteudo');
  if (error) throw new Error('cockpit_config: ' + error.message);
  const valores: Record<string, any> = {};
  (lin ?? []).forEach((l: any) => { valores[l.chave] = l.conteudo; });
  if (assinatura) { CONFIG.assinatura = assinatura; CONFIG.valores = valores; }
  return valores;
}

function removerNulosRecursivo(valor: any): any {
  if (Array.isArray(valor)) return valor.map(removerNulosRecursivo);
  if (valor && typeof valor === 'object') {
    const limpo: Record<string, unknown> = {};
    for (const chave in valor) {
      const v = valor[chave];
      if (v === null) continue;
      limpo[chave] = removerNulosRecursivo(v);
    }
    return limpo;
  }
  return valor;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json(405, { erro: 'Método não permitido' });

  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // ---- 1. sessão válida + quem está chamando ----
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { erro: 'Sem sessão. Faça login de novo.' });
  const { data: u, error: erroUser } = await svc.auth.getUser(token);
  if (erroUser || !u?.user) return json(401, { erro: 'Sessão inválida ou expirada. Faça login de novo.' });
  const emailLogado = String(u.user.email ?? '').toLowerCase();
  if (!emailLogado) return json(401, { erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. a equipe (equipe_cockpit + profiles) ----
  const { data: linhas, error: erroEquipe } = await svc
    .from('equipe_cockpit')
    .select('profile_id, papel, nome, ordem, ignorar_owner, so_acesso, ramp_stage, a_comecar, field_status, profiles!inner(email, full_name, id_hubspot)')
    .eq('ativo', true)
    .order('ordem', { ascending: true, nullsFirst: false });
  if (erroEquipe) return json(500, { erro: 'Não consegui ler a equipe: ' + erroEquipe.message });
  const cadastro = (linhas ?? []).map((l: any) => {
    const p = l.profiles ?? {};
    const x: Record<string, unknown> = {
      email: String(p.email ?? '').toLowerCase(),
      role: l.papel,
      // ignorar_owner (0094): no Cockpit esta pessoa não tem dono no HubSpot.
      ownerId: (l.ignorar_owner || l.so_acesso) ? null : (p.id_hubspot ?? null),
      // O nome do Cockpit (0093) é a chave dos arquivos de território: o recorte
      // do executivo casa a rota e as praças por ele.
      nome: l.nome ?? p.full_name ?? undefined,
    };
    if (l.ramp_stage) x.rampStage = l.ramp_stage;
    if (l.a_comecar) x.aComecar = true;
    if (l.field_status) x.fieldStatus = l.field_status;
    return { pessoa: x, soAcesso: !!l.so_acesso };
  });
  // so_acesso (0095): entra como gestor, mas fica FORA da equipe da montagem —
  // DATA.usuarios é denominador ("visto por X/N") e fonte do placar; quem só tem
  // acesso não pode mudar nenhum dos dois.
  const equipe = cadastro.filter((c) => !c.soAcesso).map((c) => c.pessoa);
  usarEquipe(equipe);
  const usuario: any = (cadastro.find((c) => c.pessoa.email === emailLogado) || {}).pessoa;
  if (!usuario) return json(403, { erro: 'Seu login não está na equipe do Cockpit. Fale com seu gestor.' });
  const url = new URL(req.url);
  const recurso = url.searchParams.get('recurso');

  let config: Record<string, any>;
  try { config = await lerConfig(svc); } catch (e) { return json(500, { erro: (e as Error).message }); }
  usarConfig(config);
  const PLAYBOOK = config.playbook ?? { paginas: [], categorias: [] };
  const PRECIFICACAO = config.precificacao ?? null;

  if (recurso === 'playbook') {
    if (usuario.role === 'manager') return json(200, { ok: true, playbook: PLAYBOOK, papel: 'manager' });
    const pb: any = PLAYBOOK;
    const semLideranca = Object.assign({}, pb, {
      paginas: (pb.paginas || []).filter((p: any) => p.categoria !== CAPITULO_DE_GESTOR),
      categorias: (pb.categorias || []).filter((c: any) => c !== CAPITULO_DE_GESTOR),
    });
    return json(200, { ok: true, playbook: semLideranca, papel: 'rep' });
  }
  if (recurso === 'precificacao') return json(200, { ok: true, precificacao: PRECIFICACAO });

  if (recurso === 'realizado-hoje') {
    const hsToken = Deno.env.get('HUBSPOT_TOKEN');
    if (!hsToken) return json(503, { erro: 'Servidor sem HUBSPOT_TOKEN — não é possível medir o cumprido agora.' });
    const ehGestor = String(usuario.role) === 'manager';
    const ownerPedido = url.searchParams.get('owner');
    if (ownerPedido && !ehGestor && ownerPedido !== String(usuario.ownerId)) {
      return json(403, { erro: 'Você só pode consultar o seu próprio dia.' });
    }
    const ownerId = ownerPedido || (usuario.ownerId != null ? String(usuario.ownerId) : null);
    if (!ownerId) {
      return json(200, { ok: true, semOwner: true, motivo: 'Sem owner no HubSpot ainda — o placar começa quando o funil começar.' });
    }
    const hsSearch = async (tipo: string, body: unknown) => {
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/' + tipo + '/search', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + hsToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('HubSpot ' + tipo + ' respondeu ' + r.status);
      return r.json();
    };
    try {
      const propsEtapa = (REALIZADO.ETAPAS_DE_AVANCO as string[])
        .concat([(REALIZADO.STAGES_REALIZADO as any).demoProposta])
        .map((id) => 'hs_v2_date_entered_' + id);
      const deals = await hsSearch('deals', {
        filterGroups: [{ filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: REALIZADO.PIPELINE_REALIZADO },
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
          { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(Date.now() - 48 * 3600 * 1000) },
        ] }],
        properties: ['dealname'].concat(propsEtapa),
        limit: 100,
      });
      const r = await (REALIZADO as any).realizadoDeHoje(hsSearch, ownerId, { negocios: deals.results || [] });
      return json(200, Object.assign({ ok: true, ownerId, medidoEm: new Date().toISOString() }, r));
    } catch (e) {
      return json(502, { erro: 'Não foi possível medir agora: ' + (e as Error).message });
    }
  }

  // ---- 3. snapshot (assinatura barata antes da leitura cara, como no original) ----
  async function lerSnapshot() {
    const { data: ass } = await svc.from('cockpit_snapshot').select('chave, atualizado_em');
    const assinatura = Array.isArray(ass) && ass.length
      ? ass.map((l: any) => String(l.chave) + '@' + String(l.atualizado_em)).sort().join('|')
      : null;
    if (assinatura && CACHE.assinatura === assinatura && CACHE.fontes) {
      const trocadasC = usarSnapshot(CACHE.fontes);
      const temHubspotC = trocadasC.indexOf('hubspot') >= 0;
      return { fonte: !trocadasC.length ? 'vazio' : (temHubspotC ? (trocadasC.length === 6 ? 'supabase' : 'supabase-parcial') : 'misto'),
        motivo: null, chaves: trocadasC, atualizadoEm: CACHE.atualizadoEm, reaproveitado: true };
    }
    const { data: lin, error } = await svc.from('cockpit_snapshot').select('chave, conteudo, atualizado_em');
    if (error) return { fonte: 'vazio', motivo: 'tabela respondeu erro: ' + error.message, chaves: [], atualizadoEm: null };
    if (!Array.isArray(lin) || !lin.length) return { fonte: 'vazio', motivo: 'tabela ainda vazia', chaves: [], atualizadoEm: null };
    const fontes: Record<string, unknown> = {};
    let maisRecente: string | null = null;
    lin.forEach((l: any) => {
      if (!l || !l.chave || l.conteudo == null) return;
      fontes[l.chave] = l.conteudo;
      if (!maisRecente || String(l.atualizado_em) > maisRecente) maisRecente = String(l.atualizado_em);
    });
    const trocadas = usarSnapshot(fontes);
    if (assinatura) { CACHE.assinatura = assinatura; CACHE.fontes = fontes; CACHE.atualizadoEm = maisRecente; }
    const temHubspot = trocadas.indexOf('hubspot') >= 0;
    return {
      fonte: !trocadas.length ? 'vazio' : (temHubspot ? (trocadas.length === 6 ? 'supabase' : 'supabase-parcial') : 'misto'),
      motivo: trocadas.length ? (temHubspot ? null : 'a tabela tem complementos, mas falta o funil') : 'tabela sem nenhuma chave conhecida',
      chaves: trocadas, atualizadoEm: maisRecente,
    };
  }

  try {
    const procedencia: any = await lerSnapshot();
    if (!temSnapshot()) {
      const faltando = faltandoNoSnapshot();
      return json(503, {
        erro: 'Falta ' + (faltando.join(' e ') || 'o snapshot do CRM') + ' agora (' +
          (procedencia.motivo || 'origem desconhecida') + '). A próxima carga do robô resolve; nada foi perdido.',
      });
    }
    const completo = montarDadosCompletos();
    const dados: any = removerNulosRecursivo(filtrarParaPapel(completo, usuario));
    const pwaDeepLink = String(Deno.env.get('PWA_DEEP_LINK') || '').trim();
    if (/^https?:\/\//i.test(pwaDeepLink)) dados.pwa = { deepLink: pwaDeepLink };
    return json(200, {
      sessao: { email: usuario.email, role: usuario.role, ownerId: usuario.ownerId, nome: usuario.nome, aComecar: !!usuario.aComecar },
      procedencia: { fonte: procedencia.fonte, motivo: procedencia.motivo || null,
        chaves: procedencia.chaves || [], atualizadoEm: procedencia.atualizadoEm || null },
      dados,
    });
  } catch (e) {
    return json(500, { erro: 'Falha ao montar os dados: ' + String((e as Error).message || e) });
  }
});
