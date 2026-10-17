// Supabase Edge Function: push-fila
//
// A FILA VAI ATÉ O EXECUTIVO (handoff "Tarefas do App", P6, 17/10/2026). Web push, sem biblioteca:
// a assinatura VAPID (ES256) e a cifra aes128gcm (RFC 8291) são feitas com o WebCrypto do Deno.
//
// Ops com a sessão do executivo (Authorization: Bearer <jwt do app>):
//   { op: 'chave' }                                   → { publica }  (cria o par VAPID na 1ª vez)
//   { op: 'inscrever', endpoint, p256dh, auth, plataforma }
//   { op: 'desinscrever', endpoint }
//   { op: 'testar' }                                  → manda um aviso de teste para os aparelhos dele
// Op do robô (x-cron-secret = vault 'push_fila', chamada por public.invocar_push_fila):
//   { op: 'rodar', momento: '0830' | '1230' | '1730' | '1805', dry_run? }
//
// Regras do P6: no máximo 4 avisos por pessoa por dia; o quente das 08:30 nunca repete o negócio
// no mesmo dia; nada depois das 19h, no fim de semana, no feriado, com a fila zerada ou com um
// Cheguei aberto (check-in nos últimos 40 min sem o Como foi). A fila é a da Edge fila-tarefas,
// pela mesma regra da tela. cockpit_config.push_fila = { ligado, so_para }: desligado, o robô só
// ensaia (dry_run) — liga depois do primeiro aviso conferido no celular do Julyan.
//
// Deploy: verify_jwt DESLIGADO (o robô entra com o segredo; as ops do app conferem o jwt aqui).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { feriadosNacionais, ehDiaUtil, secaoDoItem, quenteEsfriando } from '../_compartilhado/filaDoDinheiro.ts';
import { b64u, cifrarWebPush, jwtVapid } from '../_compartilhado/webPush.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const URL_SUPA = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const CONTATO_VAPID = 'https://pwa-app-outbound.vercel.app';
const LIMITE_DIA = 4;

// ---- chaves VAPID -----------------------------------------------------------------------
type Chaves = { publica: string; privada: CryptoKey };
async function chaves(svc: ReturnType<typeof createClient>): Promise<Chaves> {
  let { data } = await svc.from('push_chaves').select('publica, privada_jwk').eq('id', 1).maybeSingle();
  if (!data) {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const publica = b64u(await crypto.subtle.exportKey('raw', par.publicKey));
    const privada_jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
    // dois pedidos juntos na 1ª vez: o segundo não sobrescreve, relê o que ficou
    await svc.from('push_chaves').upsert({ id: 1, publica, privada_jwk }, { onConflict: 'id', ignoreDuplicates: true });
    ({ data } = await svc.from('push_chaves').select('publica, privada_jwk').eq('id', 1).maybeSingle());
  }
  if (!data) throw new Error('não consegui ler as chaves do push');
  const privada = await crypto.subtle.importKey('jwk', data.privada_jwk as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return { publica: String(data.publica), privada };
}
type Inscricao = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; falhas: number };
type Aviso = { titulo: string; texto: string; tag: string; url: string; acoes: Array<{ acao: string; titulo: string; url: string }> };

async function enviar(svc: ReturnType<typeof createClient>, ins: Inscricao, aviso: Aviso, k: Chaves): Promise<boolean> {
  const aud = new URL(ins.endpoint).origin;
  const corpo = await cifrarWebPush(JSON.stringify(aviso), ins.p256dh, ins.auth);
  const r = await fetch(ins.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${await jwtVapid(aud, k.privada, CONTATO_VAPID)}, k=${k.publica}`,
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high',
    },
    body: corpo,
  }).catch(() => null);
  if (r && (r.status === 201 || r.status === 200 || r.status === 202)) {
    await svc.from('push_inscricoes').update({ ultimo_ok_em: new Date().toISOString(), falhas: 0 }).eq('id', ins.id);
    return true;
  }
  // 404/410: o aparelho cancelou a inscrição; some daqui. Outros erros: conta e desiste em 5.
  if (r && (r.status === 404 || r.status === 410)) await svc.from('push_inscricoes').delete().eq('id', ins.id);
  else if (ins.falhas + 1 >= 5) await svc.from('push_inscricoes').delete().eq('id', ins.id);
  else await svc.from('push_inscricoes').update({ falhas: ins.falhas + 1 }).eq('id', ins.id);
  return false;
}

// ---- datas de Brasília ---------------------------------------------------------------------
const agoraBRT = () => new Date(Date.now() - 3 * 3600000);
const hojeBRT = () => agoraBRT().toISOString().slice(0, 10);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 86400000);
const DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemana = (iso: string) => DIA[new Date(iso + 'T12:00:00Z').getUTCDay()];
const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// a URL que o aviso abre: o app decide (abre a fila, disca ou abre o WhatsApp e, na volta, o Como foi)
const urlApp = (acao: string, deal?: string) => `/?fila=${acao}${deal ? `&deal=${encodeURIComponent(deal)}` : ''}&origem=push`;

type Item = { dealId: string; negocio: string; titulo?: string; etapaId: string; venceu: boolean; prazo: string | null; motivo: string; grupo: string; porque: string; score: number; telefone?: string | null };

async function filaDe(uid: string, segredo: string): Promise<{ itens: Item[]; hoje: string } | null> {
  const r = await fetch(`${URL_SUPA}/functions/v1/fila-tarefas?forceFunctionRegion=us-west-2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON, 'x-cron-secret': segredo },
    body: JSON.stringify({ uid }),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const d = await r.json().catch(() => null);
  return d && Array.isArray(d.itens) ? { itens: d.itens as Item[], hoje: String(d.hoje ?? hojeBRT()) } : null;
}

function montarAviso(momento: string, f: { itens: Item[]; hoje: string }, combinados: number, pct: { meu: number | null; media: number | null }, jaMandados: Set<string>): { aviso: Aviso; tipo: string; ref: string } | null {
  const { itens, hoje } = f;
  const abertos = itens.filter((i) => secaoDoItem(i as never) !== 'sem_passo');
  const nAbertos = abertos.length + combinados;
  const quentes = itens.filter((i) => quenteEsfriando(i as never, hoje)).sort((a, b) => b.score - a.score);
  const topo = quentes[0] ?? abertos[0] ?? null;
  const nomeDe = (i: Item) => i.negocio || i.titulo || 'o primeiro da fila';
  const ligar = (i: Item | null) => i ? [{ acao: 'ligar', titulo: `Ligar ${nomeDe(i)}`.slice(0, 40), url: urlApp('ligar', i.dealId) }] : [];
  const abrir = { acao: 'fila', titulo: 'Abrir a fila', url: urlApp('fila') };
  if (nAbertos === 0) return null; // fila zerada: nada

  if (momento === '0830') {
    const q = quentes.find((i) => !jaMandados.has(`quente:${i.dealId}`));
    if (!q) return null;
    const venc = q.prazo ? (q.venceu ? `Venceu ${diaSemana(q.prazo)} ${ddmm(q.prazo)}, há ${pl(diasEntre(q.prazo, hoje), 'dia', 'dias')}.` : 'Vence hoje.') : '';
    return {
      tipo: 'quente', ref: q.dealId,
      aviso: { titulo: `${nomeDe(q)} está esfriando`, texto: `${venc} ${q.porque || ''}`.trim(), tag: `quente-${q.dealId}`, url: urlApp('cartao', q.dealId),
        acoes: [{ acao: 'ligar', titulo: 'Ligar agora', url: urlApp('ligar', q.dealId) }, { acao: 'whatsapp', titulo: 'WhatsApp', url: urlApp('whatsapp', q.dealId) }] },
    };
  }
  if (momento === '1230') {
    return {
      tipo: 'janela', ref: '1230',
      aviso: { titulo: 'Hora das ligações · 15 min', texto: `${pl(nAbertos, 'follow-up', 'follow-ups')}, ${pl(quentes.length, 'quente', 'quentes')}.${topo ? ` Comece pelo ${nomeDe(topo)}.` : ''}`,
        tag: 'janela', url: urlApp('fila'), acoes: [...ligar(topo), abrir] },
    };
  }
  if (momento === '1730') {
    const gestor = pct.meu != null ? `Seu gestor vê ${pct.meu}% dos follow-ups de hoje.` : '';
    const media = pct.media != null ? ` A média do time é ${pct.media}%.` : '';
    return {
      tipo: 'faltam', ref: '1730',
      aviso: { titulo: `Faltam ${nAbertos} para zerar a fila`, texto: `${gestor}${media}`.trim() || 'Feche o dia com a fila zerada.',
        tag: 'janela', url: urlApp('fila'), acoes: [abrir, ...ligar(topo)] },
    };
  }
  if (momento === '1805') {
    const atrasados = itens.filter((i) => secaoDoItem(i as never) === 'atrasados').length;
    const velho = itens.filter((i) => i.venceu && i.prazo).sort((a, b) => String(a.prazo).localeCompare(String(b.prazo)))[0];
    const extra = velho?.prazo ? ` ${nomeDe(velho)} faz ${pl(diasEntre(velho.prazo, hoje), 'dia', 'dias')} sem resposta.` : '';
    return {
      tipo: 'naozerou', ref: '1805',
      aviso: { titulo: 'A fila não zerou hoje', texto: `Amanhã começa com ${pl(atrasados, 'atrasado', 'atrasados')}.${extra}`,
        tag: 'fim-do-dia', url: urlApp('fila'), acoes: [{ acao: 'fila', titulo: 'Resolver agora · 5 min', url: urlApp('fila') }, { acao: 'fechar', titulo: 'Amanhã às 08:00', url: '' }] },
    };
  }
  return null;
}

async function rodar(svc: ReturnType<typeof createClient>, momento: string, dryRun: boolean, segredo: string, ignorarHorario = false) {
  const { data: cfgLinha } = await svc.from('cockpit_config').select('conteudo').eq('chave', 'push_fila').maybeSingle();
  const cfg = (cfgLinha?.conteudo ?? {}) as { ligado?: boolean; so_para?: string[] };
  const ensaio = dryRun || cfg.ligado !== true;
  const hoje = hojeBRT();
  const ano = Number(hoje.slice(0, 4));
  const feriados = [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)];
  const hora = agoraBRT().getUTCHours();
  // ignorarHorario só vale no ensaio: deixa testar no fim de semana e à noite sem mandar nada
  const pularRelogio = ignorarHorario && dryRun;
  if (!pularRelogio && !ehDiaUtil(hoje, feriados)) return { ok: true, momento, pulou: 'não é dia útil' };
  if (!pularRelogio && hora >= 19) return { ok: true, momento, pulou: 'depois das 19h' };

  // so_acesso nulo conta como falso (neq('so_acesso', true) deixaria o nulo de fora)
  const { data: equipe } = await svc.from('equipe_cockpit').select('profile_id, papel').eq('ativo', true).or('so_acesso.is.null,so_acesso.eq.false');
  const soPara = new Set((cfg.so_para ?? []).map(String));
  const alvo = Array.from(new Set([
    ...(equipe ?? []).filter((e: { papel: string }) => e.papel === 'rep').map((e: { profile_id: string }) => String(e.profile_id)),
    ...soPara,
  ]));
  const { data: inscritas } = await svc.from('push_inscricoes').select('id, user_id, endpoint, p256dh, auth, falhas').in('user_id', alvo);
  const porUser = new Map<string, Inscricao[]>();
  for (const i of (inscritas ?? []) as Inscricao[]) (porUser.get(i.user_id) ?? porUser.set(i.user_id, []).get(i.user_id)!).push(i);

  const k = await chaves(svc);
  const relatorio: Array<Record<string, unknown>> = [];
  // a fila de TODOS os executivos é lida (a leitura grava fila_do_dia: é o denominador do % do gestor);
  // o aviso só vai a quem tem aparelho inscrito — e, enquanto testa, só a quem está em so_para
  const filas = new Map<string, { itens: Item[]; hoje: string } | null>();
  await Promise.all(alvo.map(async (uid) => { filas.set(uid, await filaDe(uid, segredo)); }));
  const { data: pcts } = await svc.rpc('percentual_followups', { p_dia: hoje });
  const pctPor = new Map<string, number | null>(((pcts ?? []) as Array<{ user_id: string; pct: number | null }>).map((p) => [String(p.user_id), p.pct]));
  const validos = Array.from(pctPor.values()).filter((x): x is number => x != null);
  const media = validos.length ? Math.round(validos.reduce((a, b) => a + b, 0) / validos.length) : null;

  for (const uid of alvo) {
    const linha: Record<string, unknown> = { uid };
    relatorio.push(linha);
    const f = filas.get(uid);
    if (!f) { linha.pulou = 'fila não lida'; continue; }
    const aparelhos = porUser.get(uid) ?? [];
    if (!aparelhos.length) { linha.pulou = 'sem aparelho inscrito'; continue; }
    if (soPara.size && !soPara.has(uid)) { linha.pulou = 'fora de so_para (teste)'; continue; }
    const { data: enviados } = await svc.from('push_enviados').select('tipo, ref').eq('user_id', uid).eq('dia', hoje);
    if ((enviados ?? []).length >= LIMITE_DIA) { linha.pulou = 'já recebeu 4 hoje'; continue; }
    // Cheguei aberto: check-in nos últimos 40 min sem Como foi depois dele
    const desde = new Date(Date.now() - 40 * 60000).toISOString();
    const { data: visita } = await svc.from('client_visits').select('visited_at').eq('visited_by', uid).gte('visited_at', desde).order('visited_at', { ascending: false }).limit(1);
    if (visita && visita.length) {
      const { data: ficha } = await svc.from('fichas_de_rua').select('id').eq('criado_por', uid).gte('criado_em', String(visita[0].visited_at)).limit(1);
      if (!ficha || !ficha.length) { linha.pulou = 'no meio de uma visita'; continue; }
    }
    const { data: fd } = await svc.from('fila_do_dia').select('combinados').eq('user_id', uid).eq('dia', hoje).maybeSingle();
    const ja = new Set(((enviados ?? []) as Array<{ tipo: string; ref: string }>).map((e) => `${e.tipo}:${e.ref}`));
    const m = montarAviso(momento, f, Number(fd?.combinados ?? 0), { meu: pctPor.get(uid) ?? null, media }, ja);
    if (!m) { linha.pulou = 'nada a avisar (fila zerada ou sem quente)'; continue; }
    linha.aviso = m.aviso.titulo; linha.texto = m.aviso.texto;
    if (ensaio) { linha.ensaio = true; continue; }
    // reserva antes de mandar: dois robôs juntos não mandam duas vezes
    const { error: reservou } = await svc.from('push_enviados').insert({ user_id: uid, dia: hoje, tipo: m.tipo, ref: m.ref });
    if (reservou) { linha.pulou = 'já mandado'; continue; }
    let algum = false;
    for (const a of aparelhos) algum = (await enviar(svc, a, m.aviso, k)) || algum;
    linha.enviado = algum;
  }
  return { ok: true, momento, ensaio, media, relatorio };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { erro: 'Método não permitido' });
  const svc = createClient(URL_SUPA, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* sem corpo */ }

  const segredo = req.headers.get('x-cron-secret');
  if (segredo) {
    const { data: ok } = await svc.rpc('segredo_confere', { p_nome: 'push_fila', p_valor: segredo });
    if (ok !== true) return json(403, { erro: 'segredo' });
    if (corpo.op !== 'rodar') return json(400, { erro: 'O robô só roda.' });
    const momento = String(corpo.momento ?? '');
    if (!['0830', '1230', '1730', '1805'].includes(momento)) return json(400, { erro: 'momento inválido' });
    try { return json(200, await rodar(svc, momento, corpo.dry_run === true, segredo, corpo.ignorar_horario === true)); }
    catch (e) { return json(500, { erro: (e as Error).message }); }
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quem } = await svc.auth.getUser(jwt);
  const uid = quem?.user?.id;
  if (!uid) return json(401, { erro: 'Sessão inválida. Entre de novo.' });

  if (corpo.op === 'chave') return json(200, { publica: (await chaves(svc)).publica });
  if (corpo.op === 'inscrever') {
    const endpoint = String(corpo.endpoint ?? ''), p256dh = String(corpo.p256dh ?? ''), auth = String(corpo.auth ?? '');
    if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return json(400, { erro: 'Inscrição incompleta.' });
    // o mesmo aparelho com outra pessoa logada: a inscrição passa a ser de quem está agora
    await svc.from('push_inscricoes').delete().eq('endpoint', endpoint);
    const { error } = await svc.from('push_inscricoes').insert({ user_id: uid, endpoint, p256dh, auth, plataforma: String(corpo.plataforma ?? '').slice(0, 60) || null });
    return error ? json(500, { erro: error.message }) : json(200, { ok: true });
  }
  if (corpo.op === 'desinscrever') {
    await svc.from('push_inscricoes').delete().eq('endpoint', String(corpo.endpoint ?? '')).eq('user_id', uid);
    return json(200, { ok: true });
  }
  if (corpo.op === 'testar') {
    const { data: ins } = await svc.from('push_inscricoes').select('id, user_id, endpoint, p256dh, auth, falhas').eq('user_id', uid);
    if (!ins || !ins.length) return json(404, { erro: 'Nenhum aparelho inscrito.' });
    const k = await chaves(svc);
    let n = 0;
    for (const a of ins as Inscricao[]) if (await enviar(svc, a, {
      titulo: 'Avisos da fila ligados', texto: 'É assim que a hora das ligações e os quentes esfriando vão chegar.', tag: 'teste', url: urlApp('fila'),
      acoes: [{ acao: 'fila', titulo: 'Abrir a fila', url: urlApp('fila') }],
    }, k)) n++;
    return json(200, { ok: n > 0, aparelhos: ins.length, entregues: n });
  }
  return json(400, { erro: 'op desconhecida' });
});
