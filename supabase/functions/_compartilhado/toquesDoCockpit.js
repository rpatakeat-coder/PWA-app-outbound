// OS TOQUES DO COCKPIT, NO SERVIDOR (auditoria do Cockpit do gestor, 04/10/2026).
//
// O cartão da fila de Tarefas dizia "x de 4 contatos" contando visitas do app e registros de
// campo; o Cockpit (Pessoas, Raio X, "piso de 4 toques") conta tarefas e reuniões concluídas no
// HubSpot, notas de contato e a última interação. 7 de 25 negócios do Bruno divergiam em 1. O
// gestor cobra pelo número dele, então a fila passa a contar igual.
//
// É a MESMA regra de public/index.html do cockpit-unificado (touchpointsDoLead + toquesDoLead +
// agendaNormalizar + agendaDoHubspot/Task/Nota/App + tpNotaEhContato), reescrita sem DOM e sem
// estado global, alimentada pelo snapshot (cockpit_snapshot.conteudo: agenda.itens e o lead do
// funil). Validada contra a função do Cockpit em todos os negócios abertos do time.

const AGENDA_INTERNOS = /^(daily|reuni[ãa]o\s*interna|interno|treinamento|roleplay|1:1|feedback|alinhamento)\b/i;
const AGENDA_RE_TITULO = /^\s*(follow[\s-]*up|reuni[aã]o|demo|rota|revisita|visita|interno)\s*[-–—:]\s*(.*)$/i;
const TP_NOTA_DE_CONTATO = /\b(falei|conversei|liguei|liga(ç|c)[ãa]o|whats|visitei|visita|passei|atendeu|reuni[ãa]o|demo|apresent|proposta|enviei|mandei|follow[\s-]*up|retorno|decisor)\b/i;
const TP_DESFECHO_RE_CABECALHO = /^\s*DESFECHO_VISITA\s+v(\d+)\s*$/im;

const AGENDA_ROTULOS_COCKPIT = /^((follow[\s-]*up|revisita|visita|rota|ligar|liga[çc][ãa]o|oportunidade\s*\d*|perdido|ganho|d\s*\d+|retorno|contato|cobran[çc]a|cobrar|proposta|whats(app)?|e-?mail|reuni[ãa]o|interno|tarefa|undefined|null)|(cobrar|enviar|mandar|fazer|refazer|retomar|agendar)\s+\S+)$/i;

export function criarToques({ agendaRotulos = AGENDA_ROTULOS_COCKPIT, reps = [] } = {}) {
  const AGENDA_ROTULOS = agendaRotulos;
  const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const agendaNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const paraBRT = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : new Date(d.getTime() - 3 * 3600 * 1000); };
  const tipoDoTexto = (t) => { const s = String(t || '').toLowerCase(); if (/follow[\s-]*up/.test(s)) return 'follow_up'; if (/^(rota|revisita|visita)/.test(s)) return 'rota'; if (/^interno/.test(s)) return 'interno'; return 'reuniao'; };
  function nomeDoLead(texto) {
    let s = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (AGENDA_INTERNOS.test(s)) return null;
    let partes = s.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
    while (partes.length > 1 && AGENDA_ROTULOS.test(partes[0])) partes.shift();
    s = partes.join(' - ').replace(/[.;,\s]+$/, '').trim();
    if (!s) return null;
    if (AGENDA_ROTULOS.test(s)) return null;
    if (/^retomar\b/i.test(s)) return null;
    if (s.length < 3) return null;
    return s;
  }
  const nomeNormalizado = (nome) => (nome ? norm(nomeDoLead(nome) || nome) : '');
  function mesmoCliente(a0, b0) {
    if (!a0 || !b0) return false;
    const a = norm(nomeDoLead(a0) || a0), b = norm(nomeDoLead(b0) || b0);
    if (!a || !b) return false;
    return a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0;
  }

  function doMeeting(it, i) {
    const titulo = it.hs_meeting_title || '';
    const m = titulo.match(AGENDA_RE_TITULO);
    let tipo = 'reuniao', empresa = titulo.trim();
    if (m) {
      tipo = tipoDoTexto(m[1]);
      const resto = m[2] || '';
      const corte = resto.lastIndexOf(' - ');
      empresa = corte > 0 ? resto.slice(corte + 3).trim() : resto.trim();
    }
    if (AGENDA_INTERNOS.test(titulo.trim())) tipo = 'interno';
    const corpo = String(it.hs_meeting_body || '').replace(/<[^>]*>/g, ' ');
    const gE = corpo.match(/Empresa:\s*(.*)/);
    if (gE && gE[1].trim()) empresa = gE[1].trim();
    return { id: 'hm' + (it.hs_object_id || i), ownerId: it.hubspot_owner_id ? String(it.hubspot_owner_id) : null, tipo,
      inicio: paraBRT(it.hs_meeting_start_time || it.hs_timestamp), criadoEm: paraBRT(it.hs_createdate), cliente: empresa || 'Sem nome', desfecho: it.hs_meeting_outcome || null };
  }
  function doTask(it, i) {
    const assunto = it.hs_task_subject || '';
    const m = assunto.match(AGENDA_RE_TITULO);
    const tipo = AGENDA_INTERNOS.test(assunto.trim()) ? 'interno' : (m ? tipoDoTexto(m[1]) : 'follow_up');
    return { id: 'ht' + (it.hs_object_id || i), ownerId: it.hubspot_owner_id ? String(it.hubspot_owner_id) : null, tipo,
      inicio: paraBRT(it.hs_timestamp), criadoEm: paraBRT(it.hs_createdate), cliente: (m && m[2] ? m[2] : assunto).trim() || 'Sem nome',
      desfecho: it.hs_task_status === 'COMPLETED' ? 'COMPLETED' : null };
  }
  function doNota(it, i) {
    const texto = String(it.hs_note_body || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ');
    const linhas = texto.split('\n').map((s) => s.trim()).filter(Boolean);
    const m1 = (linhas[0] || '').match(/^follow[\s-]*up\s*[-–:]\s*(.*)$/i);
    if (!m1) return null;
    const mData = texto.match(/agendado\s+para:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2})[:h](\d{2})/i);
    if (!mData) return null;
    const inicio = new Date(Date.UTC(+mData[3], +mData[2] - 1, +mData[1], +mData[4], +mData[5]));
    let ownerId = it.hubspot_owner_id ? String(it.hubspot_owner_id) : null;
    if (!ownerId) {
      const mAss = texto.match(/[—–-]\s*([^\n(]+?)\s*\(\s*via\s+app\s+outbound\s*\)/i);
      if (mAss && Array.isArray(reps)) {
        const alvo = agendaNorm(mAss[1]);
        const rep = reps.find((r) => { const nome = agendaNorm(r.name); return nome === alvo || nome.indexOf(alvo) === 0 || alvo.indexOf(nome) === 0; });
        if (rep) ownerId = String(rep.ownerId);
      }
    }
    return { id: 'hn' + (it.hs_object_id || i), ownerId, tipo: 'follow_up', inicio, criadoEm: paraBRT(it.hs_createdate), cliente: m1[1].trim() || 'Sem nome', desfecho: null };
  }
  function doApp(it, i) {
    return { id: it.meeting_id || ('ag' + i), ownerId: it.vendedor_id_hubspot ? String(it.vendedor_id_hubspot) : null,
      tipo: it.tipo === 'reuniao' ? 'reuniao' : (it.tipo === 'rota' ? 'rota' : (it.tipo === 'interno' ? 'interno' : 'follow_up')),
      inicio: paraBRT(it.quando), criadoEm: paraBRT(it.criado_em || it.created_at), cliente: String(it.empresa || it.cliente || 'Sem nome').trim(), desfecho: null };
  }

  /** agendaNormalizar do Cockpit, sem os agendados locais da tela (não existem no servidor). */
  function normalizar(itens) {
    const out = [];
    (itens || []).forEach((it, i) => {
      let e;
      if (it.hs_meeting_start_time || it.hs_meeting_title !== undefined) e = doMeeting(it, i);
      else if (it.hs_task_subject !== undefined) e = doTask(it, i);
      else if (it.hs_note_body !== undefined) e = doNota(it, i);
      else e = doApp(it, i);
      if (!e) return;
      if (e.cliente) e.cliente = String(e.cliente).replace(/^(undefined|null)\s*[-–—]\s*/i, '').trim() || e.cliente;
      const statusDaTarefa = it.hs_task_status || (it.properties && it.properties.hs_task_status) || null;
      e.registro = !!(e.inicio && e.criadoEm && Math.abs(e.inicio - e.criadoEm) < 90000) && statusDaTarefa !== 'NOT_STARTED';
      if (it.lead_nome) e.cliente = it.lead_nome;
      if (!e.ownerId && it.lead_owner_id) e.ownerId = String(it.lead_owner_id);
      if (it.lead_deal_id) e.dealId = String(it.lead_deal_id);
      if (e.inicio && e.ownerId) out.push(e);
    });
    return out;
  }

  // índice por dono, preso à lista de eventos que o gerou (outra lista, outro índice)
  const porLista = new WeakMap();
  function indiceDoDono(eventos, ownerId) {
    if (!porLista.has(eventos)) porLista.set(eventos, new Map());
    const indices = porLista.get(eventos);
    const k = String(ownerId || '');
    if (indices.has(k)) return indices.get(k);
    const porDeal = new Map(), porNome = new Map();
    for (const e of eventos) {
      if (String(e.ownerId || '') !== k) continue;
      if (e.dealId) { const d = String(e.dealId); if (!porDeal.has(d)) porDeal.set(d, []); porDeal.get(d).push(e); }
      const nome = nomeNormalizado(e.cliente);
      if (nome) { if (!porNome.has(nome)) porNome.set(nome, []); porNome.get(nome).push(e); }
    }
    const idx = { porDeal, porNome };
    indices.set(k, idx);
    return idx;
  }

  const notaEhContato = (nota) => {
    const texto = String((nota && nota.texto) || '');
    if (!texto.trim()) return false;
    const bruto = texto.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ');
    if (TP_DESFECHO_RE_CABECALHO.test(bruto)) return true;
    if (/via\s+pwa/i.test(texto) || /via\s+app\s+outbound/i.test(texto) || /via\s+expogo/i.test(texto)) return true;
    return TP_NOTA_DE_CONTATO.test(texto);
  };

  /** Os toques realizados de um lead do funil (o "x de 4" do Cockpit) e o último. */
  const toquesDoLead = function (eventos, lead, agora = Date.now()) {
    const ownerId = lead.ownerId || null;
    const idx = indiceDoDono(eventos, ownerId);
    const vistos = new Set(); const cand = [];
    const juntar = (l) => (l || []).forEach((e) => { if (!vistos.has(e.id)) { vistos.add(e.id); cand.push(e); } });
    if (lead.id != null) juntar(idx.porDeal.get(String(lead.id)));
    const nomeLead = nomeNormalizado(lead.name);
    if (nomeLead) juntar(idx.porNome.get(nomeLead));
    if (cand.length === 0 && nomeLead) idx.porNome.forEach((l, nome) => { if (nome.indexOf(nomeLead) === 0 || nomeLead.indexOf(nome) === 0) juntar(l); });
    const realizados = [];
    for (const e of cand) {
      if (!e.inicio) continue;
      const casa = (e.dealId && String(e.dealId) === String(lead.id)) || mesmoCliente(e.cliente, lead.name);
      if (!casa || e.tipo === 'interno') continue;
      const passou = e.inicio.getTime() <= agora;
      const concluido = e.desfecho === 'COMPLETED' || e.registro === true;
      // a conta é a do Cockpit; a data volta para a hora real (inicio está em Brasília "como UTC")
      if (passou && concluido) realizados.push(new Date(e.inicio.getTime() + 3 * 3600 * 1000).toISOString());
    }
    for (const nota of Array.isArray(lead.notas) ? lead.notas : []) if (notaEhContato(nota)) realizados.push(nota.data || null);
    let ultimo = realizados.filter(Boolean).sort().pop() || null;
    if (lead.ultimaInteracao) { const ui = new Date(lead.ultimaInteracao); if (!isNaN(ui.getTime()) && (!ultimo || ui > new Date(ultimo))) ultimo = lead.ultimaInteracao; }
    return { total: Math.max(realizados.length, ultimo ? 1 : 0), ultimo };
  };
  return { toquesDoLead, normalizar };
}

/** carregarAgendaDoApp do Cockpit: as reuniões e follow-ups do app (client_meetings, 60 dias
 *  para trás e para frente) entram na agenda no formato do robô, como a tela do Cockpit faz.
 *  `itensDoRobo` evita contar duas vezes o follow-up que o robô já trouxe do HubSpot. */
export function itensDoApp(meetings, itensDoRobo, clientePorId, donoPorProfile, leadPorDeal) {
  const doRobo = new Set((itensDoRobo || []).filter((it) => it && !it.origem_app && it.hs_object_id).map((it) => String(it.hs_object_id)));
  return (meetings || []).filter((m) => m.status !== 'cancelada' && !(m.type === 'follow_up' && m.hs_engagement_id && doRobo.has(String(m.hs_engagement_id))))
    .map((m) => {
      const cl = clientePorId.get(String(m.client_id));
      if (!cl || !cl.id_hubspot) return null;
      const deal = String(cl.id_hubspot);
      const lead = leadPorDeal.get(deal) || null;
      const quem = donoPorProfile.get(String(m.created_by)) || (lead && lead.ownerId ? String(lead.ownerId) : null);
      const nome = cl.nome || (lead && lead.name) || 'Lead';
      const base = { hs_object_id: 'app-' + m.id, origem_app: true, hubspot_owner_id: quem, lead_deal_id: deal,
        lead_nome: nome, lead_owner_id: lead && lead.ownerId ? String(lead.ownerId) : quem };
      if (m.type === 'follow_up') {
        return Object.assign(base, { hs_task_subject: 'Follow-up · ' + nome, hs_task_status: m.status === 'realizada' ? 'COMPLETED' : 'NOT_STARTED',
          hs_task_type: 'TODO', hs_timestamp: m.scheduled_at, hs_task_body: m.observacoes || null });
      }
      const fim = new Date(Date.parse(m.scheduled_at) + (Number(m.duration_minutes) || 30) * 60000).toISOString();
      return Object.assign(base, { hs_meeting_title: 'Reunião · ' + nome, hs_meeting_start_time: m.scheduled_at,
        hs_meeting_end_time: fim, hs_meeting_body: m.observacoes || null });
    }).filter(Boolean);
}
