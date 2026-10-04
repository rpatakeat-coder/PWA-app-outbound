// Supabase Edge Function: fila-tarefas — "a fila do dinheiro" da aba Tarefas (docs/10 §1).
//
// Devolve UM registro por negócio que precisa de ação, já com grupo, porquê, verbo,
// prazo e ordem. A REGRA mora em ../_compartilhado/filaDoDinheiro.ts (módulo puro, com
// teste em src/utils/filaDoDinheiro.teste.ts); aqui só se busca e se cruza o dado:
//   - tarefas abertas do HubSpot do dono (ao vivo) + o negócio de cada uma;
//   - negócios abertos do dono: lista do snapshot do robô (temperatura, dias na etapa)
//     com a ETAPA conferida ao vivo no HubSpot (o que foi para Perdido hoje não aparece);
//   - pessoa e telefone do lead (clients), contatos (contatos_de_campo + client_visits),
//     quem já falou com o decisor (fichas_de_rua), visita de hoje sem registro e agenda.
// Leitura, e uma escrita: op desfazer (ver desfazer()). Feriados: nacionais (decisão do Julyan, 03/10/26), calculados no módulo.
//
// Deploy: verify_jwt LIGADO. Secrets: HUBSPOT_TOKEN; SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY vêm da plataforma.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  feriadosNacionais, montarFila, ORDEM_GRUPOS, ROTULO_GRUPO, textoUltimoContato, tituloDoCard,
  type NegocioEntrada, type TarefaEntrada,
} from '../_compartilhado/filaDoDinheiro.ts';

const HS = 'https://api.hubapi.com';
const PIPELINE = '916011864';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const hojeBRT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const horaBRT = (iso: string) => {
  const b = new Date(new Date(iso).getTime() - 3 * 3600000);
  const h = b.getUTCHours(); const m = b.getUTCMinutes();
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

async function hs(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(HS + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, dados };
}

// ---- desfazer um registro da fila depois dos 5 s (0155, 04/10/2026) ----------------------
// O app grava em fila_feitas os ids que o registro criou no HubSpot. Aqui cada id é
// conferido contra o NEGÓCIO (associação) e o DONO antes de mexer: a linha é do cliente,
// e um id trocado não pode arquivar a nota de outra pessoa. Só no mesmo dia (Brasília).
// Nota e próximo passo são ARQUIVADOS (o HubSpot guarda 90 dias), nunca apagados de vez.
// Perdido volta para a etapa anterior — exceto Ag. Pagamento e as de ganho: a entrada em
// Ag. Pagamento dispara a cobrança automática, e isso o app não refaz.
const VOLTA_PERMITIDA = new Set(['1395880469', '1396005401', '1395880470', '1395880471', '1395880472']);
const PERDIDO_ID = '1396006164';
const diaBRTde = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : null;

async function associadoAo(token: string, tipo: 'notes' | 'tasks', id: string, dealId: string) {
  const a = await hs(token, 'GET', `/crm/v4/objects/${tipo}/${id}/associations/deals`);
  return a.ok && (a.dados?.results ?? []).some((r: { toObjectId?: string | number }) => String(r.toObjectId) === dealId);
}

// deno-lint-ignore no-explicit-any
async function desfazer(svc: any, token: string, uid: string, owner: string, id: string): Promise<Response> {
  if (!id) return json(400, { erro: 'Falta o id do registro.' });
  const { data: f } = await svc.from('fila_feitas').select('*').eq('id', id).eq('user_id', uid).maybeSingle();
  if (!f) return json(404, { erro: 'Registro não encontrado.' });
  if (f.estado === 'desfeita') return json(200, { ok: true, jaDesfeito: true });
  if (f.estado !== 'gravada') return json(409, { erro: 'Este registro ainda está subindo. Tente de novo em instantes.' });
  if (f.dia !== hojeBRT()) return json(409, { erro: 'Só dá para desfazer no mesmo dia. Corrija pelo HubSpot.' });
  const dealId = String(f.deal_id);
  const d = await hs(token, 'GET', `/crm/v3/objects/deals/${dealId}?properties=hubspot_owner_id,dealstage`);
  if (!d.ok) return json(502, { erro: 'O HubSpot não respondeu sobre o negócio. Tente de novo.' });
  if (String(d.dados?.properties?.hubspot_owner_id ?? '') !== owner) return json(403, { erro: 'Este negócio não está mais com você.' });
  const feito: string[] = []; const falhou: string[] = [];

  if (f.perdido) {
    const anterior = f.etapa_anterior ? String(f.etapa_anterior) : '';
    if (!VOLTA_PERMITIDA.has(anterior)) return json(409, { erro: 'Este negócio estava numa etapa que o app não reabre (pagamento ou ganho). Reabra pelo HubSpot.' });
    if (String(d.dados?.properties?.dealstage ?? '') === PERDIDO_ID) {
      const m = await hs(token, 'PATCH', `/crm/v3/objects/deals/${dealId}`, { properties: { dealstage: anterior } });
      if (m.ok) feito.push('etapa'); else return json(502, { erro: 'O HubSpot recusou reabrir o negócio: ' + (m.dados?.message ?? m.status) });
    }
  }
  if (f.nota_id && await associadoAo(token, 'notes', String(f.nota_id), dealId)) {
    const n = await hs(token, 'GET', `/crm/v3/objects/notes/${f.nota_id}?properties=hs_createdate`);
    if (n.ok && diaBRTde(n.dados?.properties?.hs_createdate ?? n.dados?.createdAt) === f.dia) {
      const x = await hs(token, 'DELETE', `/crm/v3/objects/notes/${f.nota_id}`);
      (x.ok || x.status === 204 ? feito : falhou).push('nota');
    }
  }
  if (f.proximo_id && !f.proximo_ja_existia && await associadoAo(token, 'tasks', String(f.proximo_id), dealId)) {
    const t = await hs(token, 'GET', `/crm/v3/objects/tasks/${f.proximo_id}?properties=hs_task_status,hs_createdate`);
    if (t.ok && t.dados?.properties?.hs_task_status === 'NOT_STARTED' && diaBRTde(t.dados?.properties?.hs_createdate ?? t.dados?.createdAt) === f.dia) {
      const x = await hs(token, 'DELETE', `/crm/v3/objects/tasks/${f.proximo_id}`);
      (x.ok || x.status === 204 ? feito : falhou).push('próximo passo');
    }
  }
  if (f.concluiu_tarefa && f.tarefa_id && /^\d+$/.test(String(f.tarefa_id)) && await associadoAo(token, 'tasks', String(f.tarefa_id), dealId)) {
    const t = await hs(token, 'GET', `/crm/v3/objects/tasks/${f.tarefa_id}?properties=hs_task_status`);
    if (t.ok && t.dados?.properties?.hs_task_status === 'COMPLETED') {
      const x = await hs(token, 'PATCH', `/crm/v3/objects/tasks/${f.tarefa_id}`, { properties: { hs_task_status: 'NOT_STARTED' } });
      (x.ok ? feito : falhou).push('tarefa reaberta');
    }
  }
  if (f.acao_id) await svc.from('contatos_de_campo').delete().eq('acao_id', f.acao_id).eq('seller_id', uid);
  await svc.from('fila_feitas').update({ estado: 'desfeita', desfeita_em: new Date().toISOString() }).eq('id', id);
  return json(200, { ok: true, feito, falhou });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { erro: 'Método não permitido' });
  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return json(503, { erro: 'HUBSPOT_TOKEN não configurado' });
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quem } = await svc.auth.getUser(jwt);
  const uid = quem?.user?.id;
  if (!uid) return json(401, { erro: 'Sessão inválida. Entre de novo.' });
  const { data: perfil } = await svc.from('profiles').select('id, id_hubspot').eq('id', uid).maybeSingle();
  const owner = perfil?.id_hubspot ? String(perfil.id_hubspot) : null;
  if (!owner) return json(200, { itens: [], semMedicao: 'Seu usuário não está ligado a um dono no HubSpot: não há carteira para montar a fila.' });
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* sem corpo: é a leitura da fila */ }
  if (corpo?.op === 'desfazer') return await desfazer(svc, token, uid, owner, String(corpo.id ?? ''));

  const hoje = hojeBRT();
  const ano = Number(hoje.slice(0, 4));
  const feriados = [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)];

  // 1) tarefas abertas do dono
  const tarefas: TarefaEntrada[] = [];
  let after: string | undefined;
  for (let p = 0; p < 6; p++) {
    const r = await hs(token, 'POST', '/crm/v3/objects/tasks/search', {
      filterGroups: [{ filters: [
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: owner },
        { propertyName: 'hs_task_status', operator: 'EQ', value: 'NOT_STARTED' },
      ] }],
      properties: ['hs_task_subject', 'hs_task_body', 'hs_timestamp'],
      limit: 100, ...(after ? { after } : {}),
    });
    if (!r.ok) { if (tarefas.length) break; return json(502, { erro: 'O HubSpot recusou a busca de tarefas.', detalhe: r.dados?.message }); }
    for (const t of r.dados?.results ?? []) {
      tarefas.push({ id: String(t.id), dealId: null, assunto: t.properties?.hs_task_subject ?? '', corpo: t.properties?.hs_task_body ?? '', venceEm: t.properties?.hs_timestamp ?? null });
    }
    after = r.dados?.paging?.next?.after;
    if (!after) break;
  }
  for (let i = 0; i < tarefas.length; i += 100) {
    const lote = tarefas.slice(i, i + 100);
    const a = await hs(token, 'POST', '/crm/v4/associations/tasks/deals/batch/read', { inputs: lote.map((t) => ({ id: t.id })) });
    if (!a.ok) break;
    const mapa = new Map<string, string>();
    for (const r of a.dados?.results ?? []) {
      const de = r?.from?.id ?? r?._from?.id; const para = (r?.to ?? [])[0]?.toObjectId;
      if (de && para) mapa.set(String(de), String(para));
    }
    for (const t of lote) t.dealId = mapa.get(t.id) ?? null;
  }

  // 2) negócios abertos: snapshot (temperatura, dias) + etapa ao vivo
  const { data: snap } = await svc.from('cockpit_snapshot').select('conteudo, atualizado_em').eq('chave', 'hubspot').maybeSingle();
  const doSnap = new Map<string, { name?: string; stageId?: string; dias?: number; mrr?: number | string; temperatura?: number | string }>();
  const abertos = (snap?.conteudo as { reps?: Record<string, { abertos?: unknown[] }> } | null)?.reps?.[owner]?.abertos ?? [];
  for (const d of abertos as Array<{ id?: string | number }>) if (d?.id != null) doSnap.set(String(d.id), d as never);
  const ids = Array.from(new Set([...doSnap.keys(), ...tarefas.map((t) => t.dealId).filter(Boolean) as string[]]));
  const vivos = new Map<string, { nome: string; etapa: string; mrr: number | null; owner: string | null; pipeline: string | null; entrada: string | null }>();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await hs(token, 'POST', '/crm/v3/objects/deals/batch/read', {
      inputs: ids.slice(i, i + 100).map((id) => ({ id })),
      properties: ['dealname', 'dealstage', 'valor_de_mrr', 'hubspot_owner_id', 'pipeline'],
    });
    if (!r.ok) continue;
    for (const d of r.dados?.results ?? []) {
      const p = d.properties ?? {};
      vivos.set(String(d.id), { nome: p.dealname ?? '', etapa: String(p.dealstage ?? ''), mrr: Number(p.valor_de_mrr) || null, owner: p.hubspot_owner_id ? String(p.hubspot_owner_id) : null, pipeline: p.pipeline ? String(p.pipeline) : null, entrada: null });
    }
  }
  // fora do funil do Field Sales ou de outro dono não entra na fila desta pessoa
  const meus = ids.filter((id) => { const v = vivos.get(id); return v && v.pipeline === PIPELINE && v.owner === owner; });

  // 3) o lead de cada negócio, contatos, decisor, visitas de hoje
  const { data: clientes } = meus.length
    ? await svc.from('clients').select('id, id_hubspot, nome, telefone, latitude, longitude').in('id_hubspot', meus)
    : { data: [] as Array<Record<string, unknown>> };
  const clientePorDeal = new Map<string, { id: string; nome: string | null; telefone: string | null; lat: number | null; lng: number | null }>();
  for (const c of clientes ?? []) clientePorDeal.set(String(c.id_hubspot), { id: String(c.id), nome: (c.nome as string) ?? null, telefone: (c.telefone as string) ?? null, lat: c.latitude != null ? Number(c.latitude) : null, lng: c.longitude != null ? Number(c.longitude) : null });
  const dealPorCliente = new Map<string, string>();
  for (const [d, c] of clientePorDeal) dealPorCliente.set(c.id, d);
  const clienteIds = Array.from(dealPorCliente.keys());

  const desde = new Date(Date.now() - 120 * 86400000).toISOString();
  const contatos: Record<string, { n: number; ultimo: string | null }> = {};
  const soma = (deal: string | undefined | null, em: string | null) => {
    if (!deal || !em) return;
    const c = contatos[deal] ?? (contatos[deal] = { n: 0, ultimo: null });
    c.n++; if (!c.ultimo || em > c.ultimo) c.ultimo = em;
  };
  if (meus.length) {
    const { data: cc } = await svc.from('contatos_de_campo').select('deal_id, client_id, ocorrido_em').in('deal_id', meus).gte('ocorrido_em', desde);
    for (const x of cc ?? []) soma(String(x.deal_id), x.ocorrido_em as string);
  }
  let visitasHoje: Array<{ client_id: string; visited_at: string }> = [];
  if (clienteIds.length) {
    const { data: vv } = await svc.from('client_visits').select('client_id, visited_at').in('client_id', clienteIds).gte('visited_at', desde);
    for (const v of vv ?? []) soma(dealPorCliente.get(String(v.client_id)), v.visited_at as string);
    visitasHoje = (vv ?? []).filter((v) => new Date(new Date(v.visited_at as string).getTime() - 3 * 3600000).toISOString().slice(0, 10) === hoje) as never;
  }
  const decisorAlcancado: string[] = [];
  const comFichaHoje = new Set<string>();
  if (meus.length) {
    const { data: ff } = await svc.from('fichas_de_rua').select('deal_id, como_foi, ocorrido_em, criado_em').in('deal_id', meus);
    for (const f of ff ?? []) {
      if (f.como_foi === 'falou_com_decisor') decisorAlcancado.push(String(f.deal_id));
      if (String(f.criado_em ?? '').length && new Date(new Date(f.criado_em as string).getTime() - 3 * 3600000).toISOString().slice(0, 10) === hoje) comFichaHoje.add(String(f.deal_id));
    }
    const { data: cd } = await svc.from('contatos_de_campo').select('deal_id').in('deal_id', meus).eq('resultado', 'decisor');
    for (const x of cd ?? []) decisorAlcancado.push(String(x.deal_id));
  }
  const visitaHojeSemRegistro: Record<string, string> = {};
  for (const v of visitasHoje) {
    const d = dealPorCliente.get(String(v.client_id));
    if (d && !comFichaHoje.has(d)) visitaHojeSemRegistro[d] = horaBRT(v.visited_at);
  }
  // agenda de hoje: paradas da rota de hoje ainda não feitas
  const agendaHoje: Record<string, string> = {};
  const { data: rotas } = await svc.from('field_routes').select('id').eq('seller_id', uid).eq('route_date', hoje);
  const idsRota = (rotas ?? []).map((r: { id: string }) => r.id);
  if (idsRota.length) {
    const { data: paradas } = await svc.from('field_route_stops').select('client_id, planned_at, status').in('route_id', idsRota).neq('status', 'removed');
    for (const p of paradas ?? []) {
      const d = dealPorCliente.get(String(p.client_id));
      if (d && p.status !== 'done') agendaHoje[d] = p.planned_at ? horaBRT(p.planned_at as string) : 'hoje';
    }
  }

  // 4) a fila
  const negocios: NegocioEntrada[] = meus.map((id) => {
    const v = vivos.get(id)!; const s = doSnap.get(id); const c = clientePorDeal.get(id);
    const temp = s?.temperatura != null ? Number(s.temperatura) : null;
    const pessoa = c?.nome && c.nome.trim() && c.nome.trim().toLowerCase() !== v.nome.trim().toLowerCase() ? c.nome.trim().split(/\s+/)[0] : null;
    return {
      dealId: id, nome: v.nome || s?.name || 'Negócio', etapaId: v.etapa, mrr: v.mrr ?? (Number(s?.mrr) || null),
      temperatura: Number.isFinite(temp as number) ? temp : null, diasNaEtapa: s?.stageId === v.etapa && s?.dias != null ? Number(s.dias) : null,
      pessoa, papel: null, temTelefone: !!(c?.telefone && String(c.telefone).replace(/\D/g, '').length >= 10),
      clientId: c?.id ?? null, lat: c?.lat ?? null, lng: c?.lng ?? null,
    };
  });
  const itens = montarFila(negocios, tarefas.filter((t) => t.dealId && meus.includes(t.dealId)), {
    hoje, feriados, contatos, decisorAlcancado, visitaHojeSemRegistro, agendaHoje,
  }).map((i) => ({ ...i, titulo: tituloDoCard(i), ultimoContatoTexto: textoUltimoContato(i.ultimoContato, hoje),
    telefone: i.temTelefone ? clientePorDeal.get(i.dealId)?.telefone ?? null : null }));

  return json(200, {
    itens,
    grupos: ORDEM_GRUPOS.map((g) => ({ id: g, rotulo: ROTULO_GRUPO[g] })),
    mrrEmJogo: itens.reduce((s, i) => s + (i.mrr ?? 0), 0),
    hoje,
    feriados: feriados.filter((f) => f >= hoje).slice(0, 20),
    snapshotLidoEm: snap?.atualizado_em ?? null,
  });
});
