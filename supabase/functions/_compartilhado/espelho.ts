// Espelho ao vivo do HubSpot no banco (migration 0116).
//
// espelharNegocio(dealId) relê do HubSpot o negócio com as propriedades que o card
// do funil usa (PROPS_DO_CARD, a mesma lista do robô), as tarefas e reuniões
// associadas (as mesmas propriedades da agenda do robô), e grava em
// espelho_negocios / espelho_agenda. O cockpit-dados aplica por cima do snapshot o
// que for mais novo que ele.
//
// Chamado DEPOIS de cada escrita do app (hubspot-sync, cockpit-api), sem segurar a
// resposta de quem escreveu (EdgeRuntime.waitUntil). Falhar aqui nunca desfaz nem
// atrasa a escrita: o pior caso é o gestor ver a mudança na próxima rodada do robô,
// como era antes.
import {
  PROPS_DO_ESPELHO, STAGES, OPEN_STAGES,
  montarLeadDoFunil, montarCardPerdido, montarCardGanho, montarCardOnboarding,
} from './lead-do-funil.js';
import { CONFIG_PADRAO } from './temperatura.js';

const HS = 'https://api.hubapi.com';
// As da agenda do robô (scripts/fetch-hubspot.js, fetchAgenda).
const PROPS_TAREFA = ['hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_task_type', 'hs_timestamp', 'hubspot_owner_id', 'hs_createdate'];
const PROPS_REUNIAO = ['hs_meeting_title', 'hs_meeting_body', 'hs_meeting_start_time', 'hs_meeting_end_time',
  'hs_meeting_outcome', 'hs_meeting_location', 'hubspot_owner_id', 'hs_createdate'];

// deno-lint-ignore no-explicit-any
type Svc = { from: (t: string) => any };

// O rótulo que o app grava em clients.etapa (src/utils/fichaDeRua.ts ROTULO_ETAPA) e que
// a etapa_de_para reconhece. Só as etapas do funil Field Sales.
const PIPELINE_DO_FUNIL = '916011864';
const ROTULO_DA_ETAPA: Record<string, string> = {
  '1395880469': 'Prospecção', '1396005401': 'Visita', '1395880470': 'Conversa com decisor', '1395880471': 'Demo/Proposta',
  '1395880472': 'Negociação', '1395880473': 'Ag. Pagamento', '1396006163': 'Enviado Onboarding', '1398311191': 'Reciclagem',
  '1396006162': 'Ganho', '1396006164': 'Perdido', '1396007427': 'Backlog', '1413529973': 'Conta Alvo',
};

async function hs(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(HS + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try { json = await r.json(); } catch { /* sem corpo */ }
  return { ok: r.ok, status: r.status, body: json };
}

const soComValor = (p: Record<string, unknown> | undefined) =>
  Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== ''));

async function associados(token: string, dealId: string, tipo: 'tasks' | 'meetings'): Promise<string[]> {
  const r = await hs(token, 'GET', `/crm/v4/objects/deals/${dealId}/associations/${tipo}?limit=100`);
  return ((r.body?.results ?? []) as { toObjectId?: string | number }[]).map((x) => String(x.toObjectId ?? '')).filter(Boolean);
}

async function lerEmLote(token: string, tipo: 'tasks' | 'meetings', ids: string[], props: string[]) {
  if (!ids.length) return [];
  const r = await hs(token, 'POST', `/crm/v3/objects/${tipo}/batch/read`, { properties: props, inputs: ids.slice(0, 100).map((id) => ({ id })) });
  return (r.body?.results ?? []) as { id: string; properties?: Record<string, unknown> }[];
}

/* O card de QUALQUER coluna, montado pelo código do robô (lib/lead-do-funil.js).
   null = etapa que o Cockpit não desenha (Backlog, Reciclagem, Conta-alvo). Usado ao
   gravar o espelho (o mapa lê o card pronto) e pelo cockpit-dados, que remonta com os
   nomes dos executivos e os dias de agora. */
// deno-lint-ignore no-explicit-any
export function montarCardDoEspelho(dealId: string, stageId: string, props: Record<string, any>, tarefas: any[], nomes: Record<string, string>, cfg: any) {
  const d = { id: String(dealId), properties: { ...props, dealstage: stageId } };
  if ((OPEN_STAGES as string[]).includes(stageId)) return montarLeadDoFunil(d, stageId, { ownerNameById: nomes, tarefas, configTemperatura: cfg });
  if (stageId === STAGES.perdido) return montarCardPerdido(d, { ownerNameById: nomes, tarefas });
  if (stageId === STAGES.ganho1) return montarCardGanho(d, { ownerNameById: nomes, tarefas });
  if (stageId === STAGES.ganho2) return montarCardOnboarding(d, { ownerNameById: nomes });
  return null;
}

async function configTemperatura(svc: Svc) {
  try {
    const { data } = await svc.from('cockpit_config').select('conteudo').eq('chave', 'temperatura').maybeSingle();
    return (data && data.conteudo) || CONFIG_PADRAO;
  } catch { return CONFIG_PADRAO; }
}

export async function espelharNegocio(token: string, svc: Svc, dealId: string, origem: 'app' | 'periodico' = 'app') {
  const d = await hs(token, 'GET', `/crm/v3/objects/deals/${dealId}?properties=${PROPS_DO_ESPELHO.join(',')}`);
  if (!d.ok) return { ok: false, motivo: `negocio ${d.status}` };
  const props = soComValor(d.body?.properties);
  const owner = (props.hubspot_owner_id as string) ?? null;
  const nome = (props.dealname as string) ?? null;

  const [idsT, idsR] = await Promise.all([associados(token, dealId, 'tasks'), associados(token, dealId, 'meetings')]);
  const [tarefas, reunioes] = await Promise.all([
    lerEmLote(token, 'tasks', idsT, PROPS_TAREFA),
    lerEmLote(token, 'meetings', idsR, PROPS_REUNIAO),
  ]);

  // As abertas no formato do card (o mesmo de hsTarefasAbertasDosNegocios do robô).
  const abertas = tarefas
    .map((t) => t.properties ?? {})
    .filter((p) => p.hs_task_status === 'NOT_STARTED' && p.hs_task_subject)
    .map((p) => ({ subject: p.hs_task_subject, timestamp: p.hs_timestamp || null }))
    .sort((a: any, b: any) => ((a.timestamp || '9999') < (b.timestamp || '9999') ? -1 : 1));

  const agora = new Date().toISOString();
  // A visita do app também é toque (0164, 05/10/26): sem ela o card recém-espelhado voltava a
  // dizer "estourado" logo depois do check-in, por cima do snapshot que já sabia da visita.
  try {
    const { data: uv } = await svc.from('ultima_visita_por_negocio').select('ultima_visita').eq('deal_id', String(dealId)).maybeSingle();
    if (uv?.ultima_visita) (props as Record<string, unknown>)._ultima_visita_app = uv.ultima_visita;
  } catch { /* sem a visita, a conta segue a do HubSpot */ }
  // O card pronto (0118): o mapa lê daqui a etapa, os dias parado e a temperatura.
  let card = null;
  try {
    card = montarCardDoEspelho(String(dealId), String(props.dealstage ?? ''), props, abertas, {}, await configTemperatura(svc));
  } catch (e) { console.warn('[espelho] card', dealId, (e as Error).message); }
  const { error: e1 } = await svc.from('espelho_negocios').upsert({
    deal_id: String(dealId), owner_id: owner, dealstage: (props.dealstage as string) ?? null,
    pipeline: (props.pipeline as string) ?? null, props, tarefas: abertas, origem, atualizado_em: agora,
    card, card_em: agora,
  });
  if (e1) return { ok: false, motivo: 'espelho_negocios: ' + e1.message };

  // A ETAPA NO LEAD DO MAPA (27/09/26). O pino e o cartão leem clients.etapa primeiro;
  // quem gravava era só o app, do celular, e falhava calado (o Restaurante Dona Ba ficou
  // sem etapa depois do check-in que criou o negócio em Visita, e o cartão escondeu o
  // botão de avançar). Toda releitura do negócio — escrita do app, do Cockpit, check-in
  // ou mudança direto no HubSpot pelo espelho periódico — grava a etapa real no lead.
  const rotulo = ROTULO_DA_ETAPA[String(props.dealstage ?? '')];
  if (rotulo && (props.pipeline ?? PIPELINE_DO_FUNIL) === PIPELINE_DO_FUNIL) {
    const { error: e3 } = await svc.from('clients').update({ etapa: rotulo })
      .eq('id_hubspot', String(dealId)).or(`etapa.is.null,etapa.neq."${rotulo}"`);
    if (e3) console.warn('[espelho] etapa no lead', dealId, e3.message);
  }

  const linhas = [
    ...tarefas.map((t) => ({ hs_object_id: String(t.id), tipo: 'tarefa', props: { ...soComValor(t.properties), hs_object_id: String(t.id) } })),
    ...reunioes.map((m) => ({ hs_object_id: String(m.id), tipo: 'reuniao', props: { ...soComValor(m.properties), hs_object_id: String(m.id) } })),
  ].map((l) => ({
    ...l, deal_id: String(dealId), owner_id: (l.props.hubspot_owner_id as string) ?? owner, atualizado_em: agora,
    // Como enriquecerAgendaComNegocio do robô: o item da agenda carrega o negócio.
    props: { ...l.props, lead_nome: nome, lead_deal_id: String(dealId), lead_owner_id: owner },
  }));
  if (linhas.length) {
    const { error: e2 } = await svc.from('espelho_agenda').upsert(linhas);
    if (e2) return { ok: false, motivo: 'espelho_agenda: ' + e2.message };
  }
  return { ok: true, tarefas: tarefas.length, reunioes: reunioes.length };
}

/* ══ ESPELHO PERIÓDICO (0117) ═════════════════════════════════════════════════════
   O que muda DIRETO no HubSpot (fora do app) entra no espelho quando alguém abre o
   Cockpit: busca os negócios do time alterados desde a última rodada e espelha, no
   máximo a cada 5 min e até 25 por rodada, com pausa entre eles (cada negócio custa ~5
   chamadas; o HubSpot aceita ~10/s). hs_lastmodifieddate pode ser tocado em massa pelo
   HubSpot — o teto de 25 é o que impede isso de virar uma avalanche. */
const PIPELINE_FIELD_SALES = '916011864';
export async function espelharRecentes(token: string, svc: Svc, owners: string[], desdePadrao: string | null) {
  if (!token || !owners.length) return { pulou: 'sem token ou sem donos' };
  const { data: ult } = await svc.from('espelho_rodadas').select('rodou_em').order('rodou_em', { ascending: false }).limit(1);
  const ultima = ult && ult[0] ? Date.parse(ult[0].rodou_em) : 0;
  if (Date.now() - ultima < 5 * 60 * 1000) return { pulou: 'rodou há menos de 5 min' };
  const desdeMs = Math.max(ultima || 0, desdePadrao ? Date.parse(desdePadrao) || 0 : 0) || (Date.now() - 2 * 3600 * 1000);
  const { data: rod } = await svc.from('espelho_rodadas').insert({ desde: new Date(desdeMs).toISOString() }).select('id').single();
  try {
    const r = await hs(token, 'POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_FIELD_SALES },
        { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(desdeMs) },
        { propertyName: 'hubspot_owner_id', operator: 'IN', values: owners.slice(0, 100) },
      ] }],
      properties: ['dealname'],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      limit: 100,
    });
    if (!r.ok) throw new Error('busca ' + r.status);
    const ids = ((r.body?.results ?? []) as { id: string }[]).map((x) => String(x.id)).slice(0, 25);
    for (const id of ids) {
      await espelharNegocio(token, svc, id, 'periodico');
      await new Promise((ok) => setTimeout(ok, 400));
    }
    if (rod) await svc.from('espelho_rodadas').update({ negocios: ids.length }).eq('id', rod.id);
    return { negocios: ids.length };
  } catch (e) {
    if (rod) await svc.from('espelho_rodadas').update({ erro: String((e as Error).message) }).eq('id', rod.id);
    return { erro: String((e as Error).message) };
  }
}

/** Dispara sem segurar a resposta (Edge Runtime), e engole erro: o espelho nunca derruba a escrita. */
export function espelharDepois(token: string, svc: Svc, dealId: string | null | undefined) {
  if (!dealId) return;
  // DUAS LEITURAS: agora, e 20 s depois. O HubSpot recalcula sozinho, segundos depois
  // da escrita, os campos derivados (notes_last_updated, que decide os "dias parado");
  // a primeira leitura pega a etapa na hora, a segunda pega esses campos já certos.
  const id = String(dealId);
  const p = espelharNegocio(token, svc, id)
    .then(() => new Promise((r) => setTimeout(r, 20000)))
    .then(() => espelharNegocio(token, svc, id))
    .catch((e) => console.warn('[espelho]', dealId, (e as Error).message));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(p);
}
