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
import { STAGES, PROP_ENTRADA_ONBOARDING } from '../_compartilhado/lead-do-funil.js';
import { espelharRecentes, montarCardDoEspelho } from '../_compartilhado/espelho.ts';

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
const CACHE: { assinatura: string | null; fontes: Record<string, unknown> | null; atualizadoEm: string | null; hubspotEm: string | null } =
  { assinatura: null, fontes: null, atualizadoEm: null, hubspotEm: null };

/* ══ ESPELHO AO VIVO POR CIMA DO SNAPSHOT (0116, 26/09/2026) ══════════════════════
   O snapshot é do robô (a cada 2 h, nada no fim de semana). Tudo o que o app escreve
   no HubSpot relê o negócio e grava em espelho_negocios / espelho_agenda. Aqui, o que
   for MAIS NOVO que o snapshot entra por cima: o card sai do funil onde estava e entra
   na etapa nova, montado por lib/lead-do-funil.js — o MESMO código do robô, portado
   (supabase/functions/_compartilhado/) —, e tarefas/reuniões entram na agenda.
   Sem espelho mais novo, nada muda: o Cockpit é exatamente o do snapshot.
   Não mexe no CACHE: devolve fontes novas só para esta resposta. */
const PIPELINE_FIELD_SALES = '916011864';
// As colunas de desfecho: ordenadas por "quando foi" (mais recente primeiro).
const FECHADAS: string[] = [STAGES.perdido, STAGES.ganho1, STAGES.ganho2];
async function aplicarEspelho(svc: any, fontes: any, desde: string | null, equipe: any[]) {
  const hub = fontes && fontes.hubspot;
  if (!hub || !desde) return null;
  const [n, a] = await Promise.all([
    svc.from('espelho_negocios').select('deal_id, owner_id, dealstage, pipeline, props, tarefas, atualizado_em').gt('atualizado_em', desde).limit(1000),
    svc.from('espelho_agenda').select('hs_object_id, tipo, props, atualizado_em').gt('atualizado_em', desde).limit(3000),
  ]);
  const negs: any[] = n.data ?? [];
  const ags: any[] = a.data ?? [];
  if (!negs.length && !ags.length) return null;

  const funil: Record<string, any[]> = {};
  Object.entries(hub.funilLeads || {}).forEach(([k, v]) => { funil[k] = Array.isArray(v) ? (v as any[]).slice() : []; });
  // Os donos que o robô desenha e o nome de cada um: os que JÁ têm card no snapshot
  // (é a lista REPS do robô, com o nome que ele usa) + os executivos da equipe, para
  // quem ainda não tem card nenhum.
  const nomes: Record<string, string> = {};
  (equipe || []).forEach((u: any) => { if (u && u.role === 'rep' && u.ownerId) nomes[String(u.ownerId)] = String(u.nome || ''); });
  Object.values(funil).forEach((lista) => lista.forEach((c: any) => {
    if (c && c.ownerId && c.vendedor && c.vendedor !== '—') nomes[String(c.ownerId)] = String(c.vendedor);
  }));
  const cfg = CONFIG.valores && CONFIG.valores.temperatura;
  let negocios = 0;
  for (const e of negs) {
    if (e.pipeline && e.pipeline !== PIPELINE_FIELD_SALES) continue;
    if (!nomes[String(e.owner_id)]) continue;
    // Os mesmos que o robô descarta (nome com "teste", ids excluídos): nunca entram.
    if ((REALIZADO as any).ehNegocioExcluido({ id: String(e.deal_id), properties: e.props || {} })) continue;
    let antigo: any = null;
    for (const k of Object.keys(funil)) {
      const i = funil[k].findIndex((c: any) => String(c && c.id) === String(e.deal_id));
      if (i >= 0) { antigo = funil[k][i]; funil[k].splice(i, 1); }
    }
    const st = String(e.dealstage || '');
    const p = e.props || {};
    let card: any = montarCardDoEspelho(String(e.deal_id), st, p, e.tarefas || [], nomes, cfg);
    // COLUNA FECHADA TEM JANELA NO ROBÔ (datas de corte): só entra por aqui quem já estava
    // no funil do snapshot ou fechou DEPOIS dele — nunca uma venda ou perda antiga só
    // porque alguém editou o negócio e o espelho periódico o trouxe.
    if (card && FECHADAS.includes(st) && !antigo) {
      const quando = Date.parse(String((st === STAGES.ganho2 ? p[PROP_ENTRADA_ONBOARDING] : p.closedate) || ''));
      if (!(quando > Date.parse(desde) - 86400000)) card = null;
    }
    if (card) {
      if (antigo && antigo.notas) card.notas = antigo.notas;   // as notas do app vêm do robô
      // Onboarding: o robô clona TODAS as propriedades; o espelho só as do card.
      if (st === STAGES.ganho2 && antigo && antigo.props) card.props = { ...antigo.props, ...card.props };
      (funil[st] = funil[st] || []).push(card);
    }
    if (card || antigo) negocios++;
  }
  Object.keys(funil).forEach((k) => {
    funil[k].sort((x: any, y: any) => (FECHADAS.includes(k) ? (x.dias - y.dias) : (y.dias - x.dias)));
  });

  // Agenda: a mesma janela do robô (60 dias atrás, 90 à frente), trocando pelo id.
  const ini = Date.now() - 60 * 86400000, fim = Date.now() + 90 * 86400000;
  const itens: any[] = Array.isArray(hub.agenda && hub.agenda.itens) ? hub.agenda.itens.slice() : [];
  const pos = new Map(itens.map((it: any, i: number) => [String(it && it.hs_object_id), i]));
  let agenda = 0;
  for (const g of ags) {
    const p = g.props || {};
    if (!nomes[String(p.hubspot_owner_id || '')]) continue;
    const quando = Date.parse(p.hs_timestamp || p.hs_meeting_start_time || '');
    if (!Number.isFinite(quando) || quando < ini || quando > fim) continue;
    const i = pos.get(String(g.hs_object_id));
    if (i != null) itens[i] = { ...itens[i], ...p }; else itens.push(p);
    agenda++;
  }
  if (!negocios && !agenda) return null;
  return {
    fontes: { ...fontes, hubspot: { ...hub, funilLeads: funil, agenda: { ...(hub.agenda || {}), itens } } },
    contagem: { negocios, agenda, desde },
  };
}
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

  /* ══ AO VIVO (Cockpit v5, fase 2, 28/09/2026) ══════════════════════════════════
     O Cockpit recebe pelo Realtime um sinal "o negócio X mudou" (0128) e pede aqui só
     os cards desses negócios, montados pelo MESMO montarCardDoEspelho do carregamento.
     O executivo só recebe os dele; negócio de fora do Field Sales ou excluído pelo robô
     volta como `fora`, e a tela o tira do funil. Máximo de 50 por pedido. */
  if (recurso === 'negocios') {
    const ids = String(url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter((s) => /^\d{1,20}$/.test(s)).slice(0, 50);
    if (!ids.length) return json(400, { erro: 'Passe ids=1,2,3.' });
    const { data: rows, error } = await svc.from('espelho_negocios')
      .select('deal_id, owner_id, dealstage, pipeline, props, tarefas, atualizado_em').in('deal_id', ids);
    if (error) return json(500, { erro: 'Não consegui ler o espelho: ' + error.message });
    const nomes: Record<string, string> = {};
    (equipe || []).forEach((p: any) => { if (p && p.ownerId) nomes[String(p.ownerId)] = String(p.nome || ''); });
    const cfg = config.temperatura;
    const ehGestor = String(usuario.role) === 'manager';
    const negocios = (rows || []).map((e: any) => {
      const id = String(e.deal_id);
      if (!ehGestor && String(e.owner_id) !== String(usuario.ownerId)) return { id, fora: true };
      if (e.pipeline && e.pipeline !== PIPELINE_FIELD_SALES) return { id, fora: true };
      if (!nomes[String(e.owner_id)]) return { id, fora: true };
      if ((REALIZADO as any).ehNegocioExcluido({ id, properties: e.props || {} })) return { id, fora: true };
      const st = String(e.dealstage || '');
      const card = montarCardDoEspelho(id, st, e.props || {}, e.tarefas || [], nomes, cfg);
      if (!card) return { id, fora: true };
      return { id, stageId: st, fechada: FECHADAS.includes(st), atualizadoEm: e.atualizado_em, card: removerNulosRecursivo(card) };
    });
    return json(200, { ok: true, negocios });
  }

  /* ══ PINO DO NEGÓCIO (28/09/2026) ══════════════════════════════════════════════
     "Ele tem endereço mas não vai no mapa" (Julyan). Medido: 144 de 532 negócios do
     funil sem pino — os criados pelo Cockpit ("Criar em Prospecção" só com texto) e as
     contas-alvo que viraram negócio sem o id voltar ao pino. O "Abrir no mapa" chama
     aqui quando não acha o pino:
       1. já tem pino → devolve;
       2. UM pino sem negócio com o mesmo nome (a conta-alvo) → liga ao negócio;
       3. senão devolve o endereço do negócio; o app geocodifica e chama de novo com
          lat/lng, e o pino nasce no dono do negócio, com posição aproximada.
     Só o dono (ou o gestor) e só Field Sales. Não cria nada no HubSpot. */
  if (recurso === 'pino-do-negocio') {
    const deal = String(url.searchParams.get('deal') || '').trim();
    if (!/^\d{1,20}$/.test(deal)) return json(400, { erro: 'Passe deal=<id>.' });
    const ja = await svc.from('clients').select('id').eq('id_hubspot', deal).limit(1).maybeSingle();
    if (ja.data) return json(200, { ok: true, clientId: (ja.data as any).id, como: 'ja-tinha' });
    const hsTok = Deno.env.get('HUBSPOT_TOKEN');
    if (!hsTok) return json(500, { erro: 'Sem o token do HubSpot na função.' });
    const campos = 'dealname,hubspot_owner_id,pipeline,logradouro,numero,bairro,cidade,estado,cep,celular';
    const rh = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${deal}?properties=${campos}`, { headers: { Authorization: `Bearer ${hsTok}` } });
    if (!rh.ok) return json(404, { erro: 'Não achei esse negócio no HubSpot.' });
    const p: any = ((await rh.json()) as any).properties || {};
    if (p.pipeline && p.pipeline !== PIPELINE_FIELD_SALES) return json(200, { ok: false, erro: 'Esse negócio não é do funil Field Sales.' });
    const dono = String(p.hubspot_owner_id || '');
    if (String(usuario.role) !== 'manager' && dono !== String(usuario.ownerId)) return json(403, { erro: 'Esse negócio é de outra pessoa.' });
    const nome = String(p.dealname || '').trim();
    if (nome) {
      const padrao = nome.replace(/[\\%_]/g, (m) => '\\' + m);
      const [a, b] = await Promise.all([
        svc.from('clients').select('id, vendedor_id_hubspot').is('id_hubspot', null).eq('is_archived', false).ilike('empresa', padrao).limit(5),
        svc.from('clients').select('id, vendedor_id_hubspot').is('id_hubspot', null).eq('is_archived', false).ilike('nome', padrao).limit(5),
      ]);
      const vistos = new Map<string, any>();
      [...(a.data || []), ...(b.data || [])].forEach((c: any) => vistos.set(String(c.id), c));
      const cands = [...vistos.values()].filter((c: any) => !c.vendedor_id_hubspot || String(c.vendedor_id_hubspot) === dono);
      if (cands.length === 1) {
        const up = await svc.from('clients').update({ id_hubspot: deal, vendedor_id_hubspot: dono || null }).eq('id', cands[0].id).is('id_hubspot', null).select('id');
        if (!up.error && (up.data || []).length) return json(200, { ok: true, clientId: cands[0].id, como: 'ligou' });
      }
    }
    const logradouro = [p.logradouro, p.numero].filter(Boolean).join(', ');
    const endereco = [logradouro, p.bairro, p.cidade, p.estado, p.cep].filter(Boolean).join(', ');
    const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return json(200, { ok: true, precisaPosicao: true, nome, endereco, cep: p.cep || null, temEndereco: !!(logradouro || p.cep) });
    }
    if (!nome) return json(200, { ok: false, erro: 'O negócio está sem nome no HubSpot.' });
    const prof = dono ? await svc.from('profiles').select('id').eq('id_hubspot', dono).limit(1).maybeSingle() : { data: null };
    const ins = await svc.from('clients').insert({
      nome, empresa: nome, endereco: logradouro || null, bairro: p.bairro || null, cidade: p.cidade || null,
      estado: p.estado || null, cep: p.cep || null, telefone: p.celular || null,
      latitude: lat, longitude: lng, geo_source: 'nominatim', geo_approximate: true,
      status: 'lead', origem: 'api', tags: ['pino_do_negocio'], id_hubspot: deal,
      vendedor_id_hubspot: dono || null, created_by: (prof.data as any)?.id ?? null,
    }).select('id').single();
    if (ins.error) return json(500, { erro: 'Não consegui criar o pino: ' + ins.error.message });
    return json(200, { ok: true, clientId: (ins.data as any).id, como: 'criou' });
  }

  /* ══ O MEU PDI NO APP (28/09/2026) ═════════════════════════════════════════════
     Desde a 0082 o PDI é o do Cockpit: os acordos são texto da análise semanal
     (narrativas.reps[owner].compromissos, na POSIÇÃO) e o estado de cada um vive em
     pdi_compromissos (owner_id + versao_analise, arrays pelo mesmo índice). O app lia o
     formato antigo (pdi_id, texto, feito_em) e quebrava com 42703. Aqui ele recebe os
     dois juntos, só os dele. */
  if (recurso === 'meu-pdi') {
    if (!usuario.ownerId) return json(200, { ok: true, semOwner: true });
    await lerSnapshot();
    const narr: any = (CACHE.fontes && (CACHE.fontes as any).narrativas) || {};
    const n: any = (narr.reps || {})[String(usuario.ownerId)] || {};
    const versao = String(narr._atualizado_em || 'v1');
    const { data: est } = await svc.from('pdi_compromissos')
      .select('checked, validado_em, devolvido_em, devolvido_motivo, treino_foco, treino_feito_em, data_um_a_um')
      .eq('owner_id', String(usuario.ownerId)).eq('versao_analise', versao).maybeSingle();
    return json(200, {
      ok: true, versaoAnalise: versao,
      compromissos: Array.isArray(n.compromissos) ? n.compromissos : [],
      prazos: Array.isArray(n.compromissosPrazo) ? n.compromissosPrazo : [],
      estado: est || null,
    });
  }

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
    const linhaHub = Array.isArray(ass) ? ass.find((l: any) => l && l.chave === 'hubspot') : null;
    CACHE.hubspotEm = linhaHub ? String(linhaHub.atualizado_em) : null;
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
    // Espelho ao vivo por cima do snapshot (ver aplicarEspelho). Falhar aqui nunca
    // derruba o Cockpit: sem espelho, sai o snapshot como sempre.
    try {
      const esp = await aplicarEspelho(svc, CACHE.fontes, CACHE.hubspotEm, equipe);
      if (esp) { usarSnapshot(esp.fontes); procedencia.espelho = esp.contagem; }
    } catch (e) { console.warn('[cockpit-dados] espelho não aplicado:', (e as Error).message); }
    // Espelho periódico em segundo plano (0117): o que mudou direto no HubSpot entra
    // no espelho para a PRÓXIMA abertura do Cockpit. Não segura esta resposta.
    try {
      const donos = (equipe || []).map((u: any) => u && u.ownerId).filter(Boolean).map(String);
      const tarefa = espelharRecentes(Deno.env.get('HUBSPOT_TOKEN') ?? '', svc, donos, CACHE.hubspotEm)
        .catch((e) => console.warn('[cockpit-dados] espelho periódico:', (e as Error).message));
      const rt = (globalThis as any).EdgeRuntime;
      if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(tarefa);
    } catch { /* nunca derruba o Cockpit */ }
    const completo = montarDadosCompletos();
    const dados: any = removerNulosRecursivo(filtrarParaPapel(completo, usuario));
    const pwaDeepLink = String(Deno.env.get('PWA_DEEP_LINK') || '').trim();
    if (/^https?:\/\//i.test(pwaDeepLink)) dados.pwa = { deepLink: pwaDeepLink };
    return json(200, {
      sessao: { email: usuario.email, role: usuario.role, ownerId: usuario.ownerId, nome: usuario.nome, aComecar: !!usuario.aComecar },
      procedencia: { fonte: procedencia.fonte, motivo: procedencia.motivo || null,
        chaves: procedencia.chaves || [], atualizadoEm: procedencia.atualizadoEm || null,
        espelho: procedencia.espelho || null },
      dados,
    });
  } catch (e) {
    return json(500, { erro: 'Falha ao montar os dados: ' + String((e as Error).message || e) });
  }
});
