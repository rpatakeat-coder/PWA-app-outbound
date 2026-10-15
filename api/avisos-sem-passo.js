// AVISO DIÁRIO NO GRUPO DO FIELD SALES: NEGÓCIOS SEM PRÓXIMO PASSO (15/10/26)
//
// Julyan: "essas mensagens de leads sem próximo passo quero enviar automaticamente no
// grupo do field sales todo dia às 18:00". A Vercel chama esta rota pelo cron do
// vercel.json (21:00 UTC = 18:00 de Brasília, segunda a sexta) e ela manda, pelo Uazapi,
// uma mensagem por executivo com os negócios dele que não têm próximo passo.
//
// A REGRA É A MESMA DO COCKPIT (gv2-dados.js, semPasso): negócio aberto de Visita a
// Negociação (Prospecção e Ag. Pagamento ficam fora), sem tarefa, reunião ou atividade
// com data de hoje em diante no HubSpot, e que não está no Planejamento (item c-<negócio>
// da grade, de hoje em diante) nem numa parada planejada da rota do app.
//
// Variáveis (o RPA sobe na Vercel; os NOMES são estes, os valores nunca vão para o git):
//   UAZAPI_URL                 ex.: https://suaempresa.uazapi.com (sem barra no fim)
//   UAZAPI_TOKEN               token da instância que está no grupo
//   UAZAPI_GRUPO_FIELD_SALES   id do grupo, terminado em @g.us
//   SUPABASE_SERVICE_ROLE_KEY  leitura do snapshot, do time e do plano (só no servidor)
//   CRON_SECRET                a Vercel manda como "Authorization: Bearer <valor>"
//
// Testar sem enviar: GET /api/avisos-sem-passo?teste=1 com o mesmo Authorization.
// Devolve as mensagens montadas e não manda nada.

const SUPABASE_URL = 'https://mxyjvijclhlxrlafqcrz.supabase.co';
const ETAPAS = [
  // [id do HubSpot, rótulo, ordem] — de Visita a Negociação, a mesma faixa do Cockpit
  ['1396005401', 'Visita', 1],
  ['1395880470', 'Decisor', 2],
  ['1395880471', 'Demo/Proposta', 3],
  ['1395880472', 'Negociação', 4],
];
/* todas as etapas abertas, na ordem do funil: entram só para juntar o restaurante repetido */
const ABERTAS = [['1395880469', 0], ['1396005401', 1], ['1395880470', 2], ['1395880471', 3], ['1395880472', 4], ['1395880473', 5]];

/* o dia de Brasília (UTC−3, sem horário de verão desde 2019) */
function diaBR(data) {
  const ms = data instanceof Date ? data.getTime() : Date.parse(data);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
}
function somaDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function segundaDe(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay() || 7;
  return somaDias(iso, 1 - dow);
}
const reais = (n) => 'R$ ' + Math.round(n).toLocaleString('pt-BR');

/** A conta inteira, sem rede: entra o que foi lido, sai uma mensagem por executivo.
 *  Exportada para o teste (e para conferir contra o Cockpit). */
function montarMensagens({ funilLeads, time, planos, paradas, hoje }) {
  const noPlano = new Set();
  (planos || []).forEach((p) => {
    (Array.isArray(p.grade) ? p.grade : []).forEach((dia, i) => {
      if (somaDias(String(p.data_segunda), i) < hoje || !Array.isArray(dia)) return;
      dia.forEach((s) => { const id = s ? String(s.id || '') : ''; if (id.startsWith('c-')) noPlano.add(id.slice(2)); }); // vaga vazia é null
    });
  });
  (paradas || []).forEach((s) => {
    const deal = s && s.clients && s.clients.id_hubspot;
    const dia = s && s.field_routes && s.field_routes.route_date;
    if (deal && dia && String(dia) >= hoje) noPlano.add(String(deal));
  });

  const temPasso = (l) => {
    const datas = [l.proximaAtividade, l.proximaReuniao]
      .concat((Array.isArray(l.tarefas) ? l.tarefas : []).map((t) => t && t.timestamp));
    return datas.some((d) => d && diaBR(d) && diaBR(d) >= hoje) || noPlano.has(String(l.id));
  };

  /* UM NEGÓCIO POR RESTAURANTE (a regra do Cockpit, GV2.dedupNegocios): o mesmo restaurante
     do mesmo dono em mais de um negócio aberto conta uma vez, no mais avançado (empate: mais
     dias na etapa). Por isso entram todas as etapas abertas, inclusive Prospecção e Ag.
     Pagamento, e só depois se aplica a faixa de Visita a Negociação. */
  const nomeNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(restaurante|bar|pizzaria|lanchonete)\b/g, '').replace(/[^a-z0-9]/g, '');
  const grupos = {};
  ABERTAS.forEach(([sid, ordem]) => {
    ((funilLeads || {})[sid] || []).forEach((l) => {
      if (!l || !time[String(l.ownerId)]) return;
      const nome = String(l.dealname || l.name || '').trim();
      if (!nome || /teste/i.test(nome)) return; // o Cockpit descarta "ZZ TESTE"
      const k = String(l.ownerId) + '|' + (nomeNorm(nome) || 'id:' + l.id);
      (grupos[k] = grupos[k] || []).push({ l, nome, ordem, dias: Number(l.dias) || 0 });
    });
  });
  const ROTULO = Object.fromEntries(ETAPAS.map(([, rotulo, ordem]) => [ordem, rotulo]));
  const porDono = {};
  Object.values(grupos).forEach((g) => {
    const { l, nome, ordem, dias } = g.slice().sort((x, y) => (y.ordem - x.ordem) || (y.dias - x.dias))[0];
    if (!ROTULO[ordem] || temPasso(l)) return;
    const mrr = Number(l.mrr || l.valor_de_mrr || l.valor || 0) || 0;
    (porDono[String(l.ownerId)] = porDono[String(l.ownerId)] || []).push({ nome, rotulo: ROTULO[ordem], ordem, mrr, dias });
  });

  const mensagens = [];
  Object.keys(time)
    .filter((o) => (porDono[o] || []).length)
    .sort((a, b) => porDono[b].length - porDono[a].length)
    .forEach((o) => {
      const lista = porDono[o].sort((a, b) => b.ordem - a.ordem || b.mrr - a.mrr || b.dias - a.dias);
      const prioridade = lista.filter((x) => x.ordem >= 3);
      const deEtapa = (ordem) => lista.filter((x) => x.ordem === ordem).map((x) => x.nome);
      const n = lista.length;
      const linhas = [
        `Fala, ${time[o].primeiro}! 👋`,
        '',
        `Fechamento do dia: *${n} ${n === 1 ? 'negócio' : 'negócios'} sem próximo passo marcado* (nada agendado no HubSpot, no Planejamento ou na rota do app).`,
      ];
      if (prioridade.length) {
        linhas.push('', '🔥 *Prioridade:*');
        prioridade.forEach((x) => linhas.push(`• *${x.nome}*: ${x.rotulo}${x.ordem === 4 ? ', quente' : ''}${x.mrr ? ', ' + reais(x.mrr) : ''}${x.dias >= 7 ? ` (${x.dias} dias parado)` : ''}`));
      }
      const dec = deEtapa(2), vis = deEtapa(1);
      if (dec.length) linhas.push('', '*Decisor:*', dec.join(', '));
      if (vis.length) linhas.push('', '*Visita:*', vis.join(', '));
      linhas.push('', 'Para contar como próximo passo: tarefa ou reunião com data no HubSpot, ou o negócio num dia do Planejamento. Valeu! 💪');
      mensagens.push({ dono: o, nome: time[o].nome, total: n, texto: linhas.join('\n') });
    });
  return mensagens;
}

async function lerSupabase(caminho, chave) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + caminho, { headers: { apikey: chave, Authorization: 'Bearer ' + chave } });
  if (!r.ok) throw new Error('Supabase ' + caminho.split('?')[0] + ': ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function lerTudo(chave, hoje) {
  const seg = segundaDe(hoje);
  const [snap, equipe, planos, paradas] = await Promise.all([
    lerSupabase('cockpit_snapshot?select=f:conteudo->funilLeads&chave=eq.hubspot', chave),
    lerSupabase('equipe_cockpit?select=profile_id,nome&papel=eq.rep&ativo=eq.true', chave),
    lerSupabase(`planos_semanais?select=owner_id,data_segunda,grade&data_segunda=in.(${seg},${somaDias(seg, 7)})`, chave),
    lerSupabase(`field_route_stops?select=status,clients(id_hubspot),field_routes!inner(route_date)&status=eq.planned&field_routes.route_date=gte.${hoje}&limit=5000`, chave),
  ]);
  const ids = equipe.map((e) => e.profile_id).filter(Boolean);
  const perfis = ids.length ? await lerSupabase(`profiles?select=id,id_hubspot,full_name&id=in.(${ids.join(',')})`, chave) : [];
  const time = {};
  perfis.forEach((p) => {
    if (!p.id_hubspot || /DESATIVADO/i.test(p.full_name || '')) return;
    const e = equipe.find((x) => x.profile_id === p.id) || {};
    const nome = String(e.nome || p.full_name || '').trim();
    time[String(p.id_hubspot)] = { nome, primeiro: nome.split(/\s+/)[0] || nome };
  });
  return { funilLeads: (snap[0] && snap[0].f) || {}, time, planos, paradas, hoje };
}

async function enviar(texto) {
  const url = String(process.env.UAZAPI_URL || '').replace(/\/+$/, '');
  const r = await fetch(url + '/send/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: process.env.UAZAPI_TOKEN },
    body: JSON.stringify({ number: process.env.UAZAPI_GRUPO_FIELD_SALES, text: texto }),
  });
  if (!r.ok) throw new Error('Uazapi ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function handler(req, res) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.authorization !== 'Bearer ' + segredo) return res.status(401).json({ erro: 'não autorizado' });
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const teste = String((req.query && req.query.teste) || '') === '1';
  const falta = ['SUPABASE_SERVICE_ROLE_KEY'].concat(teste ? [] : ['UAZAPI_URL', 'UAZAPI_TOKEN', 'UAZAPI_GRUPO_FIELD_SALES']).filter((k) => !process.env[k]);
  if (falta.length) return res.status(500).json({ erro: 'variáveis faltando: ' + falta.join(', ') });
  try {
    const hoje = diaBR(new Date());
    const mensagens = montarMensagens(await lerTudo(chave, hoje));
    if (teste) return res.status(200).json({ hoje, enviadas: 0, mensagens });
    let enviadas = 0;
    for (const m of mensagens) {
      await enviar(m.texto);
      enviadas++;
      await new Promise((ok) => setTimeout(ok, 1500)); // uma por vez: o WhatsApp não gosta de rajada
    }
    return res.status(200).json({ hoje, enviadas, por: mensagens.map((m) => m.nome + ' ' + m.total) });
  } catch (e) {
    console.error('avisos-sem-passo:', e);
    return res.status(500).json({ erro: String((e && e.message) || e) });
  }
}

module.exports = handler;
module.exports.montarMensagens = montarMensagens;
