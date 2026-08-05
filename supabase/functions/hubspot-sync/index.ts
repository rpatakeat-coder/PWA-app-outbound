// Supabase Edge Function: hubspot-sync
// Substitui o webhook do n8n (workflow "Webhook App") falando DIRETO com a API
// do HubSpot. O app chama via supabase.functions.invoke('hubspot-sync') com o
// MESMO payload que mandava pro n8n — a migracao e' transparente e o app tem
// fallback automatico pro n8n se esta function retornar erro.
//
// Types tratados (mesmo switch do n8n):
//   change_stage — PATCH do deal (dealstage + sub_values). Responde NA HORA;
//                  a reconciliacao que o n8n fazia (Wait 10s -> re-le o deal ->
//                  grava etapa canonica + owner em clients) roda em background
//                  via EdgeRuntime.waitUntil.
//   update       — PATCH do contato associado + PATCH do deal (mesmos campos
//                  do ramo "Update" do n8n).
//   create_pin   — POST contato (trata conflito "Existing ID") -> POST deal ->
//                  associacao deal<->contato -> grava id_hubspot/url_hubspot em
//                  clients -> responde { id_hubspot, url_hubspot } (mesmo shape
//                  que o n8n respondia).
//   get_stages   — GET das etapas do pipeline; responde { results: [...] }.
//   create_note  — cria engagement de nota no deal (timeline do HubSpot).
//                  Usado pelas notas do lead E pelo follow up agendado.
//   update_note  — reescreve o corpo da nota (reagendar o follow up) ou marca
//                  como cancelada (cancelar:true).
//   create_task / update_task       — LEGADO. Follow up virava Task ate a regra
//                                      mudar pra Observacao; os handlers ficam
//                                      pros follow ups antigos, que tem id de
//                                      Task gravado em hs_engagement_id.
//   create_meeting / update_meeting  — Meeting no deal (demo agendada).
//                                      update: reagendar (start/end) ou cancelar.
//   -> devolvem { engagement_id }; o app guarda em
//      client_meetings.hs_engagement_id pra reagendar/concluir/cancelar depois.
//
// reuniao/followup (Google Calendar) CONTINUAM no n8n — dependem da credencial
// OAuth do Google que vive la. type=visited tambem segue pro n8n (sem rota de
// HubSpot). O helper src/utils/hubspotSync.ts no app faz esse roteamento.
// IMPORTANTE: os types da agenda NAO tem fallback pro n8n (o Switch de la
// criaria um deal na rota default). O app chama a edge direto p/ esses.
//
// Deploy (verify_jwt LIGADO — so o app logado chama):
//   supabase functions deploy hubspot-sync
//
// Secrets necessarios:
//   HUBSPOT_TOKEN             — token do private app do HubSpot (o mesmo valor
//                               da credencial "HS API KEY" do n8n).
//                               supabase secrets set HUBSPOT_TOKEN=pat-...
//   SUPABASE_URL              — preenchido automaticamente pela plataforma
//   SUPABASE_SERVICE_ROLE_KEY — preenchido automaticamente pela plataforma

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const HS = 'https://api.hubapi.com';
const FETCH_TIMEOUT_MS = 12_000;

// IDs herdados do workflow do n8n — manter sincronizados com o HubSpot.
const CREATE_PIN_PIPELINE_ID = '118032977';
const CREATE_PIN_STAGE_ID = '1319906944';
const GET_STAGES_PIPELINE_ID = '916011864';
const HUBSPOT_PORTAL_ID = '24373118';
// Associacoes HUBSPOT_DEFINED: 3 = deal -> contact, 214 = note -> deal,
// 212 = meeting -> deal, 216 = task -> deal (ids default do HubSpot).
const ASSOC_DEAL_TO_CONTACT = 3;
const ASSOC_NOTE_TO_DEAL = 214;
const ASSOC_MEETING_TO_DEAL = 212;
const ASSOC_TASK_TO_DEAL = 216;

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

const str = (v: unknown): string => trimOrNull(v) ?? '';

// Escapa texto que vai virar rich text (hs_note_body) — HubSpot renderiza HTML
// nas notas, entao qualquer campo controlado pelo usuario (body, nome do autor)
// precisa ser neutralizado pra nao injetar links/imagens na timeline do CRM.
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mantem a function viva depois do Response pra terminar trabalho em
// background (reconciliacao do change_stage). Se o runtime nao expor
// EdgeRuntime (ex.: teste local antigo), degrada pra fire-and-forget.
const waitUntil = (p: Promise<unknown>) => {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else p.catch((err) => console.warn('[hubspot-sync] background falhou', err));
};

type HsResult = { ok: boolean; status: number; body: any };

async function hsFetch(
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  payload?: unknown,
): Promise<HsResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${HS}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: ctrl.signal,
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      console.warn('[hubspot-sync] HubSpot', method, path, '->', res.status, JSON.stringify(body)?.slice(0, 400));
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    console.warn('[hubspot-sync] HubSpot fetch falhou', method, path, err);
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

// sub_values chegam do app com multi-select como array e boolean nativo.
// HubSpot (v3) espera multi-select como string "a;b" — o resto passa direto.
function normalizeProperties(sub: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sub)) {
    out[k] = Array.isArray(v) ? v.join(';') : v;
  }
  return out;
}

// Campos do deal replicados do app — mesmo corpo dos nodes "HTTP Request4"/
// "Atualizar deal" do n8n. cep vai so com alfanumericos (o n8n fazia o mesmo
// replace). id_pin_app_outbound = uuid do client no app (body.id).
//
// withOwner: SO' o create_pin manda hubspot_owner_id. No update, mandar o owner
// significava "quem editou o cadastro vira dono do negocio" — editar telefone/
// endereco de um lead alheio roubava o lead no HubSpot (caso "Acaraje da Pri",
// 2026-07-29: uma edicao de cadastro reatribuiu o deal pro editor). Quem muda
// dono e' o HubSpot, nao uma edicao de pin.
function dealPropertiesFromBody(
  body: Record<string, unknown>,
  opts: { withOwner: boolean },
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    dealname: str(body.dealname),
    bairro: str(body.bairro),
    celular: str(body.celular),
    cep: str(body.cep).replace(/[^a-zA-Z0-9]/g, ''),
    cidade: str(body.cidade),
    email: str(body.email),
    estado_uf: str(body.estado_uf),
    latitude: str(body.latitude),
    logradouro: str(body.logradouro),
    longitude: str(body.longitude),
    numero_do_local: str(body.numero_do_local),
    observacoes: str(body.observacoes),
    id_pin_app_outbound: str(body.id ?? body.id_pin),
  };
  if (opts.withOwner) props.hubspot_owner_id = str(body.vendedor_id);
  return props;
}

const dealUrl = (dealId: string) =>
  `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${dealId}`;

// ===== change_stage =====
// Caminho quente: o vendedor esta com o modal aberto esperando. PATCH no deal
// e responde. A parte lenta do n8n (Wait 10s -> GET deal -> GET stage label ->
// UPDATE clients com etapa canonica/owner/atualizacao_diaria) roda depois da
// resposta, em background.
async function handleChangeStage(token: string, body: Record<string, unknown>) {
  const idHubspot = trimOrNull(body.id_hubspot);
  const stageId = trimOrNull(body.stage_id);
  const clientId = trimOrNull(body.id);
  if (!idHubspot || !stageId) {
    return json(400, { error: 'id_hubspot e stage_id sao obrigatorios' });
  }

  const sub =
    body.sub_values && typeof body.sub_values === 'object' && !Array.isArray(body.sub_values)
      ? (body.sub_values as Record<string, unknown>)
      : {};
  const properties = { ...normalizeProperties(sub), dealstage: stageId };

  const patch = await hsFetch(token, 'PATCH', `/crm/v3/objects/deals/${idHubspot}`, { properties });
  if (!patch.ok) {
    return json(502, {
      error: 'HubSpot recusou a mudanca de etapa',
      detail: patch.body?.message ?? `status ${patch.status}`,
    });
  }

  if (clientId) {
    waitUntil(reconcileStageChange(token, idHubspot, clientId));
  }

  return json(200, { ok: true, id_hubspot: idHubspot, dealstage: stageId });
}

// Reproduz o pos-processamento do n8n: espera o HubSpot assentar (workflows
// internos podem re-mover o deal), le o estado canonico e grava em clients.
async function reconcileStageChange(token: string, idHubspot: string, clientId: string) {
  try {
    await sleep(10_000);

    const deal = await hsFetch(
      token,
      'GET',
      `/crm/v3/objects/deals/${idHubspot}?properties=dealstage,pipeline,hubspot_owner_id`,
    );
    if (!deal.ok) return;
    const props = deal.body?.properties ?? {};
    const pipeline = trimOrNull(props.pipeline);
    const dealstage = trimOrNull(props.dealstage);
    const ownerId = trimOrNull(props.hubspot_owner_id);
    if (!pipeline || !dealstage) return;

    const stage = await hsFetch(
      token,
      'GET',
      `/crm/v3/pipelines/deals/${pipeline}/stages/${dealstage}`,
    );
    const label = trimOrNull(stage.body?.label);
    if (!label) return;

    const update: Record<string, unknown> = {
      etapa: label,
      atualizacao_diaria: true,
    };
    if (ownerId) update.vendedor_id_hubspot = ownerId;

    const { error } = await serviceClient().from('clients').update(update).eq('id', clientId);
    if (error) console.warn('[hubspot-sync] reconcile clients falhou', error.message);
  } catch (err) {
    console.warn('[hubspot-sync] reconcile falhou', err);
  }
}

// ===== update =====
// Ramo "Update" do n8n: atualiza o contato associado (se houver) e o deal.
async function handleUpdate(token: string, body: Record<string, unknown>) {
  const idHubspot = trimOrNull(body.id_hubspot);
  if (!idHubspot) return json(400, { error: 'id_hubspot e obrigatorio' });

  // Busca o contato associado — falha aqui nao bloqueia (onError: continue).
  const assoc = await hsFetch(token, 'GET', `/crm/v4/objects/deals/${idHubspot}/associations/contacts`);
  const contactId = trimOrNull(assoc.body?.results?.[0]?.toObjectId);

  // Sem hubspot_owner_id aqui tambem: o contato acompanha o deal — reatribuir o
  // contato por causa de uma edicao de cadastro tem o mesmo efeito indesejado.
  if (contactId) {
    await hsFetch(token, 'PATCH', `/crm/objects/2026-03/contacts/${contactId}`, {
      properties: {
        email: str(body.email),
        firstname: str(body.nome),
        state: str(body.estado_uf),
        city: str(body.cidade),
      },
    });
  }

  const deal = await hsFetch(token, 'PATCH', `/crm/objects/2026-03/deals/${idHubspot}`, {
    properties: dealPropertiesFromBody(body, { withOwner: false }),
  });
  if (!deal.ok) {
    return json(502, {
      error: 'HubSpot recusou o update do deal',
      detail: deal.body?.message ?? `status ${deal.status}`,
    });
  }

  return json(200, { ok: true, id_hubspot: idHubspot, contact_id: contactId });
}

// ===== create_pin =====
// Ramo "Pin Criado" do n8n: cria contato (ou acha o existente via mensagem de
// conflito), cria o deal no pipeline/etapa de entrada, associa os dois e
// devolve { id_hubspot, url_hubspot }. Aqui tambem ja gravamos id_hubspot no
// clients direto (o app mantem o proprio UPDATE como redundancia inofensiva).
async function handleCreatePin(token: string, body: Record<string, unknown>) {
  const clientId = trimOrNull(body.id);

  // Dedupe: se este pin ja tem id_hubspot gravado (retry/fallback reenviando o
  // mesmo payload apos a resposta se perder), NAO cria um segundo deal —
  // devolve o que ja existe. Sem isso, uma queda de rede entre "deal criado" e
  // "resposta recebida" gera deals duplicados no HubSpot.
  if (clientId) {
    const { data: existing } = await serviceClient()
      .from('clients')
      .select('id_hubspot, url_hubspot')
      .eq('id', clientId)
      .maybeSingle();
    const existingId = trimOrNull(existing?.id_hubspot);
    if (existingId) {
      return json(200, {
        id_hubspot: existingId,
        url_hubspot: trimOrNull(existing?.url_hubspot) ?? dealUrl(existingId),
        deduped: true,
      });
    }
  }

  const contact = await hsFetch(token, 'POST', '/crm/objects/2026-03/contacts', {
    properties: {
      email: str(body.email),
      firstname: str(body.nome),
      state: str(body.estado_uf),
      city: str(body.cidade),
      hubspot_owner_id: str(body.vendedor_id),
    },
  });

  // Conflito de contato existente: a mensagem vem como "... Existing ID: 123".
  let contactId: string | null = null;
  if (contact.ok) {
    contactId = trimOrNull(contact.body?.id);
  } else {
    contactId = contact.body?.message?.match(/Existing ID:\s*(\d+)/)?.[1] ?? null;
  }

  // withOwner: true — na CRIACAO o vendedor que cadastrou o pin e' o dono
  // legitimo do lead novo. E' o unico ponto que define hubspot_owner_id.
  const deal = await hsFetch(token, 'POST', '/crm/v3/objects/deals', {
    properties: {
      ...dealPropertiesFromBody(body, { withOwner: true }),
      dealstage: CREATE_PIN_STAGE_ID,
      pipeline: CREATE_PIN_PIPELINE_ID,
    },
  });
  const dealId = trimOrNull(deal.body?.id);
  if (!deal.ok || !dealId) {
    return json(502, {
      error: 'HubSpot recusou a criacao do deal',
      detail: deal.body?.message ?? `status ${deal.status}`,
    });
  }

  if (contactId) {
    await hsFetch(
      token,
      'PUT',
      `/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: ASSOC_DEAL_TO_CONTACT }],
    );
  }

  const urlHubspot = dealUrl(dealId);

  if (clientId) {
    const { error } = await serviceClient()
      .from('clients')
      .update({ id_hubspot: dealId, url_hubspot: urlHubspot })
      .eq('id', clientId);
    if (error) console.warn('[hubspot-sync] gravar id_hubspot falhou', error.message);
  }

  return json(200, { id_hubspot: dealId, url_hubspot: urlHubspot });
}

// ===== get_stages =====
async function handleGetStages(token: string) {
  const res = await hsFetch(token, 'GET', `/crm/v3/pipelines/deals/${GET_STAGES_PIPELINE_ID}/stages`);
  if (!res.ok || !Array.isArray(res.body?.results)) {
    return json(502, { error: 'HubSpot nao devolveu as etapas', detail: `status ${res.status}` });
  }
  return json(200, { results: res.body.results });
}

// ===== create_note =====
// Nota na timeline do deal. O n8n atual trata isso numa versao mais nova do
// workflow; aqui criamos o engagement direto via API.
async function handleCreateNote(token: string, body: Record<string, unknown>) {
  const idHubspot = trimOrNull(body.id_hubspot);
  const noteBody = trimOrNull(body.body);
  if (!idHubspot || !noteBody) {
    return json(400, { error: 'id_hubspot e body sao obrigatorios' });
  }

  const autor = trimOrNull(body.autor_nome);
  const escaped = escapeHtml(noteBody).replace(/\n/g, '<br>');
  // autor_nome e' controlado pelo usuario (profile.full_name) — escapa tambem,
  // senao um nome com <a>/<img> injeta HTML na timeline lida pelos gestores.
  const hsBody = autor
    ? `${escaped}<br><br>— ${escapeHtml(autor)} (via App Outbound)`
    : escaped;

  const criadoEm = trimOrNull(body.criado_em);
  const timestamp = criadoEm && !Number.isNaN(new Date(criadoEm).getTime())
    ? new Date(criadoEm).toISOString()
    : new Date().toISOString();

  const note = await hsFetch(token, 'POST', '/crm/v3/objects/notes', {
    properties: { hs_timestamp: timestamp, hs_note_body: hsBody },
    associations: [
      {
        to: { id: idHubspot },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: ASSOC_NOTE_TO_DEAL }],
      },
    ],
  });
  if (!note.ok) {
    return json(502, {
      error: 'HubSpot recusou a nota',
      detail: note.body?.message ?? `status ${note.status}`,
    });
  }

  return json(200, { ok: true, note_id: note.body?.id ?? null });
}

// ===== Agenda -> HubSpot (Observacao pra follow up, Meeting pra demo) =====
// Reflete o compromisso na timeline do deal. O evento no Google Calendar
// continua no n8n; aqui criamos/atualizamos o engagement no CRM e devolvemos
// o engagement_id (o app guarda em client_meetings.hs_engagement_id pra depois
// reagendar/concluir/cancelar o MESMO engagement em vez de duplicar).

// Normaliza pra ISO 8601; null se ausente/invalido.
function toIso(v: unknown): string | null {
  const s = trimOrNull(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// observacoes viram rich text no HubSpot — escapa e troca \n por <br>.
function richBody(v: unknown): string {
  const s = trimOrNull(v);
  return s ? escapeHtml(s).replace(/\n/g, '<br>') : '';
}

// ---- Follow up -> Observacao (note) ----
// A criacao reusa o create_note (mesmo handler das notas do lead); aqui so' o
// update. Reagendar reescreve o corpo; cancelar prefixa o marcador MANTENDO o
// texto — nota e' registro de timeline, apagar/limpar perderia o historico.
const NOTE_CANCEL_MARKER = '[Follow Up cancelado]';

async function handleUpdateNote(token: string, body: Record<string, unknown>) {
  const id = trimOrNull(body.engagement_id);
  if (!id) return json(400, { error: 'engagement_id e obrigatorio' });
  const cancelar = body.cancelar === true;

  let novoCorpo: string | null = cancelar ? null : richBody(body.body) || null;

  if (cancelar) {
    // Precisa do corpo atual pra prefixar o marcador sem perder o texto.
    const atual = await hsFetch(token, 'GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body`);
    // 404 = follow up da regra antiga (o id e' de Task, nao de Note).
    if (atual.status === 404) return await handleUpdateTask(token, { ...body, concluir: true });
    // Sem o corpo atual em maos, NAO patcheia: sobrescreveria a observacao do
    // vendedor com so' o marcador.
    if (!atual.ok) {
      return json(502, {
        error: 'HubSpot nao devolveu a observacao',
        detail: atual.body?.message ?? `status ${atual.status}`,
      });
    }
    const anterior = str(atual.body?.properties?.hs_note_body);
    novoCorpo = anterior.startsWith(NOTE_CANCEL_MARKER)
      ? anterior
      : `${NOTE_CANCEL_MARKER}${anterior ? `<br>${anterior}` : ''}`;
  }

  if (!novoCorpo) return json(200, { ok: true, noop: true });

  const res = await hsFetch(token, 'PATCH', `/crm/v3/objects/notes/${id}`, {
    properties: { hs_note_body: novoCorpo },
  });
  if (res.status === 404) return await handleUpdateTask(token, body);
  if (!res.ok) {
    return json(502, {
      error: 'HubSpot recusou o update da observacao',
      detail: res.body?.message ?? `status ${res.status}`,
    });
  }
  return json(200, { ok: true, engagement_id: id });
}

// ---- LEGADO: follow up -> Task ----
// A regra mudou (follow up agora vira Observacao), mas os follow ups criados
// antes tem id de Task em hs_engagement_id: o handleUpdateNote cai aqui quando
// o HubSpot devolve 404 pro id como nota.
async function handleCreateTask(token: string, body: Record<string, unknown>) {
  const idHubspot = trimOrNull(body.id_hubspot);
  const due = toIso(body.due_at);
  if (!idHubspot || !due) return json(400, { error: 'id_hubspot e due_at sao obrigatorios' });

  const props: Record<string, unknown> = {
    hs_timestamp: due,
    hs_task_subject: trimOrNull(body.titulo) ?? 'Follow Up',
    hs_task_body: richBody(body.descricao),
    hs_task_status: 'NOT_STARTED',
    hs_task_type: 'TODO',
    hs_task_priority: 'MEDIUM',
  };
  const owner = trimOrNull(body.owner_id);
  if (owner) props.hubspot_owner_id = owner;

  const res = await hsFetch(token, 'POST', '/crm/v3/objects/tasks', {
    properties: props,
    associations: [{
      to: { id: idHubspot },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: ASSOC_TASK_TO_DEAL }],
    }],
  });
  if (!res.ok) return json(502, { error: 'HubSpot recusou a task', detail: res.body?.message ?? `status ${res.status}` });
  return json(200, { ok: true, engagement_id: res.body?.id ?? null });
}

// Reagendar (novo due) ou concluir (concluir:true -> status COMPLETED).
async function handleUpdateTask(token: string, body: Record<string, unknown>) {
  const id = trimOrNull(body.engagement_id);
  if (!id) return json(400, { error: 'engagement_id e obrigatorio' });

  const props: Record<string, unknown> = {};
  if (body.concluir === true) props.hs_task_status = 'COMPLETED';
  const due = toIso(body.due_at);
  if (due) props.hs_timestamp = due;
  const titulo = trimOrNull(body.titulo);
  if (titulo) props.hs_task_subject = titulo;
  if (body.descricao !== undefined) props.hs_task_body = richBody(body.descricao);
  if (Object.keys(props).length === 0) return json(200, { ok: true, noop: true });

  const res = await hsFetch(token, 'PATCH', `/crm/v3/objects/tasks/${id}`, { properties: props });
  if (!res.ok) return json(502, { error: 'HubSpot recusou o update da task', detail: res.body?.message ?? `status ${res.status}` });
  return json(200, { ok: true, engagement_id: id });
}

// ---- Demo/reuniao -> Meeting ----
async function handleCreateMeeting(token: string, body: Record<string, unknown>) {
  const idHubspot = trimOrNull(body.id_hubspot);
  const start = toIso(body.start_at);
  if (!idHubspot || !start) return json(400, { error: 'id_hubspot e start_at sao obrigatorios' });
  const end = toIso(body.end_at) ?? start;

  const props: Record<string, unknown> = {
    hs_timestamp: start,
    hs_meeting_title: trimOrNull(body.titulo) ?? 'Reunião',
    hs_meeting_body: richBody(body.descricao),
    hs_meeting_start_time: start,
    hs_meeting_end_time: end,
    hs_meeting_outcome: 'SCHEDULED',
  };
  const owner = trimOrNull(body.owner_id);
  if (owner) props.hubspot_owner_id = owner;

  const res = await hsFetch(token, 'POST', '/crm/v3/objects/meetings', {
    properties: props,
    associations: [{
      to: { id: idHubspot },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: ASSOC_MEETING_TO_DEAL }],
    }],
  });
  if (!res.ok) return json(502, { error: 'HubSpot recusou a meeting', detail: res.body?.message ?? `status ${res.status}` });
  return json(200, { ok: true, engagement_id: res.body?.id ?? null });
}

// Reagendar (novo start/end) ou cancelar (cancelar:true -> outcome CANCELED).
async function handleUpdateMeeting(token: string, body: Record<string, unknown>) {
  const id = trimOrNull(body.engagement_id);
  if (!id) return json(400, { error: 'engagement_id e obrigatorio' });

  const props: Record<string, unknown> = {};
  if (body.cancelar === true) props.hs_meeting_outcome = 'CANCELED';
  const start = toIso(body.start_at);
  if (start) { props.hs_timestamp = start; props.hs_meeting_start_time = start; }
  const end = toIso(body.end_at);
  if (end) props.hs_meeting_end_time = end;
  const titulo = trimOrNull(body.titulo);
  if (titulo) props.hs_meeting_title = titulo;
  if (body.descricao !== undefined) props.hs_meeting_body = richBody(body.descricao);
  if (Object.keys(props).length === 0) return json(200, { ok: true, noop: true });

  const res = await hsFetch(token, 'PATCH', `/crm/v3/objects/meetings/${id}`, { properties: props });
  if (!res.ok) return json(502, { error: 'HubSpot recusou o update da meeting', detail: res.body?.message ?? `status ${res.status}` });
  return json(200, { ok: true, engagement_id: id });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) {
    // 503 proposital: o app interpreta como "function ainda nao configurada"
    // e cai no fallback do n8n sem alarde.
    return json(503, { error: 'HUBSPOT_TOKEN not configured' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const type = trimOrNull(body?.type);
  try {
    switch (type) {
      case 'change_stage':
        return await handleChangeStage(token, body);
      case 'update':
        return await handleUpdate(token, body);
      case 'create_pin':
        return await handleCreatePin(token, body);
      case 'get_stages':
        return await handleGetStages(token);
      case 'create_note':
        return await handleCreateNote(token, body);
      case 'update_note':
        return await handleUpdateNote(token, body);
      case 'create_task':
        return await handleCreateTask(token, body);
      case 'update_task':
        return await handleUpdateTask(token, body);
      case 'create_meeting':
        return await handleCreateMeeting(token, body);
      case 'update_meeting':
        return await handleUpdateMeeting(token, body);
      default:
        return json(400, { error: `type nao suportado: ${type ?? '(vazio)'}` });
    }
  } catch (err) {
    console.error('[hubspot-sync] erro inesperado', type, err);
    return json(500, { error: 'Erro interno', detail: String(err) });
  }
});
