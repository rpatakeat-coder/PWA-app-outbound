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
//   { op: 'rodar', momento: 'manha0800' | 'fecho1800' }   o Hoje v3 (01/11/26): o dia em 30 segundos e o fecho
//
// Regras do P6: no máximo 4 avisos da fila por pessoa por dia e, desde 02/11/26, um teto único de 6 somando
// tudo (fila, Hoje, Desenvolvimento e recado; TETO_DIA); na segunda, o 08:00 é um push só; o quente das 08:30 nunca repete o negócio
// no mesmo dia; nada depois das 19h, no fim de semana, no feriado, com a fila zerada ou com um
// Cheguei aberto (check-in nos últimos 40 min sem o Como foi). A fila é a da Edge fila-tarefas,
// pela mesma regra da tela. cockpit_config.push_fila = { ligado, so_para }: desligado, o robô só
// ensaia (dry_run) — liga depois do primeiro aviso conferido no celular do Julyan.
//
// Deploy: verify_jwt DESLIGADO (o robô entra com o segredo; as ops do app conferem o jwt aqui).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { feriadosNacionais, ehDiaUtil, secaoDoItem, quenteEsfriando, tituloDoCard } from '../_compartilhado/filaDoDinheiro.ts';
import { b64u, cifrarWebPush, jwtVapid } from '../_compartilhado/webPush.ts';
import { pushSegunda, pushSexta, type Quadro } from '../_compartilhado/desenvolvimentoV2.ts';
import { diaDoExecutivo, semProximoPassoDaFila, type EntradaDoDia, type Parada } from '../_compartilhado/hojeV3.ts';
import { avisoDasVoltas, type VoltasDe } from '../_compartilhado/voltas.ts';

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
/* O TETO ÚNICO DO DIA (auditoria do servidor, 02/11/26). Cada robô tinha o seu limite e nenhum via o outro:
   a fila contava só os dela (4), o Hoje e o Desenvolvimento não contavam, e o recado do gestor nem gravava
   em push_enviados. Somados, um dia podia passar de 8 avisos. Agora todo aviso grava em push_enviados e
   NENHUM sai depois do 6º do dia (os 4 da fila + os 2 do Hoje); a fila continua com o sublimite de 4. */
const TETO_DIA = 6;
const TIPOS_FORA_DA_FILA = ['desenvolvimento', 'hoje', 'recado'];
async function enviadosHoje(svc: ReturnType<typeof createClient>, uid: string, hoje: string): Promise<{ total: number; fila: number; ja: Array<{ tipo: string; ref: string }> } | null> {
  const { data, error } = await svc.from('push_enviados').select('tipo, ref').eq('user_id', uid).eq('dia', hoje);
  if (error) return null; // sem saber quantos já foram, não manda (falha fechada)
  const ja = (data ?? []) as Array<{ tipo: string; ref: string }>;
  return { total: ja.length, fila: ja.filter((e) => !TIPOS_FORA_DA_FILA.includes(e.tipo)).length, ja };
}

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

type Item = { dealId: string; clientId?: string | null; negocio: string; titulo?: string; etapaId: string; venceu: boolean; prazo: string | null; motivo: string; grupo: string; porque: string; score: number; telefone?: string | null; verbo?: string; pessoa?: string | null; papel?: string | null };

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

/* O AVISO QUE FAZ FAZER (Julyan, 19/10/26: "tem que ser algo melhor, que faça eles fazerem as
   tarefas"). Antes o aviso contava ("Faltam 6 para zerar a fila", "Seu gestor vê 0%, a média do
   time é 5%") e o executivo não sabia o que fazer ao ler. Agora cada aviso é UM negócio: o título
   diz qual restaurante e o que fazer ("Misses Cakes · Ligar para Patricia"), o texto diz por quê
   em uma linha, e o toque abre o cartão dele na fila, pronto para os 3 toques. A contagem vira
   rodapé, e a comparação com o gestor e com o time saiu (ela constrange, não move). */
function montarAviso(momento: string, f: { itens: Item[]; hoje: string }, combinados: number, _pct: { meu: number | null; media: number | null }, jaMandados: Set<string>): { aviso: Aviso; tipo: string; ref: string } | null {
  const { itens, hoje } = f;
  const abertos = itens.filter((i) => secaoDoItem(i as never) !== 'sem_passo');
  const semPasso = itens.length - abertos.length;
  const nTotal = abertos.length + combinados + semPasso;
  if (nTotal === 0) return null; // fila zerada: nada
  const quentes = itens.filter((i) => quenteEsfriando(i as never, hoje)).sort((a, b) => b.score - a.score);
  const atrasados = itens.filter((i) => secaoDoItem(i as never) === 'atrasados').sort((a, b) => String(a.prazo).localeCompare(String(b.prazo)));
  // quem vem primeiro: o quente esfriando, depois o atrasado mais antigo, depois a ordem do servidor
  const topo = quentes[0] ?? atrasados[0] ?? abertos[0] ?? itens[0] ?? null;
  if (!topo) return null;
  const nome = (i: Item) => (i.negocio || i.titulo || 'o primeiro da fila').trim();
  const fazer = (i: Item) => tituloDoCard({ verbo: (i.verbo ?? 'Ligar') as never, pessoa: i.pessoa ?? null, papel: i.papel ?? null, negocio: nome(i) });
  const curto = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
  const tituloDe = (i: Item) => curto(`${nome(i)} · ${fazer(i)}`, 64);
  const porque = (i: Item) => (i.porque || '').replace(/\.$/, '');
  const resto = (n: number) => (n > 0 ? ` Depois dele, mais ${pl(n, 'negócio', 'negócios')} na fila.` : ' É o último da fila.');
  const botoes = (i: Item) => [
    { acao: 'ligar', titulo: 'Ligar agora', url: urlApp('ligar', i.dealId) },
    { acao: 'whatsapp', titulo: 'WhatsApp', url: urlApp('whatsapp', i.dealId) },
  ];

  if (momento === '0830') {
    // o quente que esfria, um por dia por negócio; sem quente, o atrasado mais antigo
    const q = quentes.find((i) => !jaMandados.has(`quente:${i.dealId}`)) ?? atrasados.find((i) => !jaMandados.has(`quente:${i.dealId}`));
    if (!q) return null;
    return {
      tipo: 'quente', ref: q.dealId,
      aviso: { titulo: tituloDe(q), texto: curto(`Comece o dia por ele: ${porque(q).charAt(0).toLowerCase()}${porque(q).slice(1)}.`, 140), tag: `quente-${q.dealId}`, url: urlApp('cartao', q.dealId), acoes: botoes(q) },
    };
  }
  if (momento === '1230') {
    return {
      tipo: 'janela', ref: '1230',
      aviso: { titulo: tituloDe(topo), texto: curto(`Hora das ligações. ${porque(topo)}.${resto(nTotal - 1)}`, 140), tag: 'janela', url: urlApp('cartao', topo.dealId), acoes: botoes(topo) },
    };
  }
  if (momento === '1730') {
    return {
      tipo: 'faltam', ref: '1730',
      aviso: { titulo: tituloDe(topo), texto: curto(`Antes de sair. ${porque(topo)}.${resto(nTotal - 1)}`, 140), tag: 'janela', url: urlApp('cartao', topo.dealId), acoes: botoes(topo) },
    };
  }
  if (momento === '1805') {
    const velho = atrasados[0] ?? topo;
    const dias = velho.prazo ? diasEntre(velho.prazo, hoje) : 0;
    const quanto = dias > 0 ? `${pl(dias, 'dia', 'dias')} sem resposta` : porque(velho);
    return {
      tipo: 'naozerou', ref: '1805',
      aviso: { titulo: tituloDe(velho), texto: curto(`Ainda dá tempo: ${quanto}. Se ficar para amanhã, a fila começa com ${pl(Math.max(atrasados.length, 1), 'atrasado', 'atrasados')}.`, 140),
        tag: 'fim-do-dia', url: urlApp('cartao', velho.dealId), acoes: botoes(velho) },
    };
  }
  return null;
}

/* O RECADO DO GESTOR VIRA PUSH (Julyan, 19/10/26: "isso tinha que ir pra notificação via push
   tbm"). Tudo o que o cockpit manda ao executivo (o Cobrar, os avisos) é uma linha em
   sugestoes_planos, que o app mostra na tela inicial; o gatilho 0219 chama esta op a cada linha
   nova. Não conta no limite de 4 avisos da fila (é o gestor falando) e sai a qualquer hora.
   FORA DO TETO DO DIA (Julyan, 04/11/26: "quero que apareça lá, que ele veja"): entrava no TETO_DIA
   (6) junto com os avisos do robô, que já mandam ~4 por pessoa; cobrar no fim da tarde não tocava o
   celular. Continua gravando em push_enviados (conta para o teto dos OUTROS avisos e não repete). */
async function recado(svc: ReturnType<typeof createClient>, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, pulou: 'id inválido' };
  const { data: linha } = await svc.from('sugestoes_planos').select('id, owner_id, texto, autor').eq('id', id).maybeSingle();
  if (!linha) return { ok: false, pulou: 'recado não encontrado' };
  const { data: perfis } = await svc.from('profiles').select('id').eq('id_hubspot', String(linha.owner_id));
  const uids = (perfis ?? []).map((p: { id: string }) => p.id);
  if (!uids.length) return { ok: true, pulou: 'dono sem perfil no app' };
  const { data: ins } = await svc.from('push_inscricoes').select('id, user_id, endpoint, p256dh, auth, falhas').in('user_id', uids);
  if (!ins || !ins.length) return { ok: true, pulou: 'sem aparelho inscrito' };
  const quem = String(linha.autor ?? '').trim().split(/\s+/)[0] || 'gestor';
  const texto = String(linha.texto ?? '').replace(/\s+/g, ' ').trim();
  const daFila = /pr[oó]ximo passo|tarefa/i.test(texto);
  const aviso: Aviso = {
    titulo: `Recado do ${quem}`, texto: texto.length > 220 ? texto.slice(0, 217) + '…' : texto, tag: `recado-${linha.id}`,
    url: daFila ? urlApp('fila') : '/',
    acoes: daFila ? [{ acao: 'fila', titulo: 'Abrir a fila', url: urlApp('fila') }] : [],
  };
  const k = await chaves(svc);
  const hoje = hojeBRT();
  let entregues = 0;
  const pulados: Array<{ uid: string; pulou: string }> = [];
  // o recado grava em push_enviados (a reserva impede o mesmo recado duas vezes) e não respeita o teto do dia
  for (const uid of uids) {
    const meus = (ins as Inscricao[]).filter((a) => String(a.user_id) === String(uid));
    if (!meus.length) continue;
    const { error: reservou } = await svc.from('push_enviados').insert({ user_id: uid, dia: hoje, tipo: 'recado', ref: String(linha.id) });
    if (reservou) { pulados.push({ uid, pulou: 'já mandado' }); continue; }
    for (const a of meus) if (await enviar(svc, a, aviso, k)) entregues++;
  }
  return { ok: true, aparelhos: ins.length, entregues, pulados };
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
  // os executivos sempre (a leitura grava fila_do_dia) e, desde 17/10/26 ("automático pra geral"),
  // qualquer pessoa ativa da equipe com aparelho inscrito — o gestor que vende também recebe
  const daEquipe = new Set((equipe ?? []).map((e: { profile_id: string }) => String(e.profile_id)));
  const { data: todasInscritas } = await svc.from('push_inscricoes').select('id, user_id, endpoint, p256dh, auth, falhas');
  const alvo = Array.from(new Set([
    ...(equipe ?? []).filter((e: { papel: string }) => e.papel === 'rep').map((e: { profile_id: string }) => String(e.profile_id)),
    ...((todasInscritas ?? []) as Inscricao[]).map((i) => String(i.user_id)).filter((u) => daEquipe.has(u)),
    ...soPara,
  ]));
  const inscritas = ((todasInscritas ?? []) as Inscricao[]).filter((i) => alvo.includes(String(i.user_id)));
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
    // os pushes da semana do Desenvolvimento v2, os do Hoje v3 (8h e 18h) e o recado não gastam o limite de
    // 4 da fila, mas tudo junto não passa do teto único do dia
    const env = await enviadosHoje(svc, uid, hoje);
    if (!env) { linha.pulou = 'push_enviados não lido'; continue; }
    const enviados = env.ja.filter((e) => !TIPOS_FORA_DA_FILA.includes(e.tipo));
    if (env.fila >= LIMITE_DIA) { linha.pulou = 'já recebeu 4 da fila hoje'; continue; }
    if (env.total >= TETO_DIA) { linha.pulou = `já recebeu ${TETO_DIA} hoje (teto do dia)`; continue; }
    /* Hoje v3 (01/11/26): quem recebeu o "Feche o dia" das 18h não recebe o "ainda dá tempo" das 18:05,
       que diria a mesma coisa cinco minutos depois */
    if (momento === '1805') {
      const { data: fecho } = await svc.from('push_enviados').select('ref').eq('user_id', uid).eq('dia', hoje).eq('tipo', 'hoje').eq('ref', 'fecho1800').limit(1);
      if (fecho && fecho.length) { linha.pulou = 'já recebeu o fecho das 18h'; continue; }
    }
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

/* OS PUSHES DA SEMANA DO DESENVOLVIMENTO v2 (handoff de 01/11/26, README §5). Um por semana cada:
     seg 08:00  "Sua missão da semana · <a missão> · <N> dias · selo <selo>"  → abre a missão
     sex 17:00  "Você fechou a semana com <pts> pts, <pos>º · seu recorde é <rec>" → abre a semana
   O texto sai de _compartilhado/desenvolvimentoV2.ts (o mesmo do app e do Cockpit) sobre o quadro de
   _desenvolvimento_de(pessoa) (0240) — que, na segunda, também é quem escolhe a missão da semana.
   Abaixo do 3º, o push diz a posição e o recorde; nunca "último". Não conta no limite de 4 da fila, não
   sai no feriado e segue o mesmo cockpit_config.push_fila (desligado = ensaio). */
async function rodarSemana(svc: ReturnType<typeof createClient>, momento: 'seg0800' | 'sex1700', dryRun: boolean, ignorarHorario: boolean) {
  const { data: cfgLinha } = await svc.from('cockpit_config').select('conteudo').eq('chave', 'push_fila').maybeSingle();
  const cfg = (cfgLinha?.conteudo ?? {}) as { ligado?: boolean; so_para?: string[] };
  const ensaio = dryRun || cfg.ligado !== true;
  const hoje = hojeBRT();
  const ano = Number(hoje.slice(0, 4));
  const feriados = [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)];
  if (!(ignorarHorario && dryRun) && !ehDiaUtil(hoje, feriados)) return { ok: true, momento, pulou: 'não é dia útil' };
  /* A SEGUNDA DAS 08:00 ERA DOIS PUSHES NO MESMO MINUTO (auditoria do servidor, 02/11/26): o seg0800 (cron 24)
     e o manha0800 (cron 26) disparam juntos às 11:00 UTC. A missão da semana agora vai DENTRO do push da
     manhã de segunda (rodarDia); este momento só sobra para o ensaio. A 0242 tira o cron 24. */
  if (momento === 'seg0800' && !dryRun) return { ok: true, momento, pulou: 'vai junto do manha0800 da segunda' };
  const { data: equipe } = await svc.from('equipe_cockpit').select('profile_id, papel').eq('ativo', true).eq('papel', 'rep').or('so_acesso.is.null,so_acesso.eq.false');
  const soPara = new Set((cfg.so_para ?? []).map(String));
  const alvo = (equipe ?? []).map((e: { profile_id: string }) => String(e.profile_id));
  const { data: inscritas } = await svc.from('push_inscricoes').select('id, user_id, endpoint, p256dh, auth, falhas').in('user_id', alvo.length ? alvo : ['-']);
  const k = await chaves(svc);
  const relatorio: Array<Record<string, unknown>> = [];
  for (const uid of alvo) {
    const linha: Record<string, unknown> = { uid };
    relatorio.push(linha);
    const aparelhos = ((inscritas ?? []) as Inscricao[]).filter((i) => String(i.user_id) === uid);
    if (!aparelhos.length) { linha.pulou = 'sem aparelho inscrito'; continue; }
    if (soPara.size && !soPara.has(uid)) { linha.pulou = 'fora de so_para (teste)'; continue; }
    const env = await enviadosHoje(svc, uid, hoje);
    if (!env) { linha.pulou = 'push_enviados não lido'; continue; }
    if (env.total >= TETO_DIA) { linha.pulou = `já recebeu ${TETO_DIA} hoje (teto do dia)`; continue; }
    const { data: q, error } = await svc.rpc('_desenvolvimento_de', { p_pessoa: uid });
    if (error || !q || (q as Quadro).erro) { linha.pulou = 'quadro não lido'; continue; }
    const t = momento === 'seg0800' ? pushSegunda(q as Quadro) : pushSexta(q as Quadro);
    if (!t) { linha.pulou = 'fonte fora (missão ou placar)'; continue; }
    const aviso: Aviso = { titulo: t.titulo, texto: t.texto, tag: `desenvolvimento-${momento}`, url: `/?desenvolvimento=${momento === 'seg0800' ? 'seg' : 'sex'}`, acoes: [] };
    linha.aviso = aviso.titulo; linha.texto = aviso.texto;
    if (ensaio) { linha.ensaio = true; continue; }
    const { error: reservou } = await svc.from('push_enviados').insert({ user_id: uid, dia: hoje, tipo: 'desenvolvimento', ref: momento });
    if (reservou) { linha.pulou = 'já mandado'; continue; }
    let algum = false;
    for (const a of aparelhos) algum = (await enviar(svc, a, aviso, k)) || algum;
    linha.enviado = algum;
  }
  return { ok: true, momento, ensaio, relatorio };
}

/* OS DOIS MOMENTOS DO HOJE v3 (handoff de 01/11/26, README §6). Um por dia útil cada, pelo mesmo robô:
     08:00  "7 paradas hoje · 12 leads sem passo" / "1ª às 09:00 em Madureira · toque para ver o seu dia em
            30 segundos"  → abre a folha da manhã (?hoje=manha)
     18:00  "Feche o dia: 6 portas · 2 sem próximo passo" / "leva 1 minuto · conta para a sequência"
            → abre o fecho (?hoje=fecho); só para quem foi à rua e ainda não fechou o dia
   O texto sai de diaDoExecutivo (_compartilhado/hojeV3.ts), a mesma montagem da folha do app e do Hoje do
   Cockpit, e o "sem passo" é semProximoPassoDaFila sobre a fila da Edge fila-tarefas (a mesma da tela).
   Feriado e fim de semana: nada. No máximo 1 por momento por dia (push_enviados tipo 'hoje', ref o
   momento). Não gasta o limite de 4 da fila e segue o mesmo cockpit_config.push_fila (desligado = ensaio). */
async function rodarDia(svc: ReturnType<typeof createClient>, momento: 'manha0800' | 'fecho1800', dryRun: boolean, segredo: string, ignorarHorario: boolean) {
  const { data: cfgLinha } = await svc.from('cockpit_config').select('conteudo').eq('chave', 'push_fila').maybeSingle();
  const cfg = (cfgLinha?.conteudo ?? {}) as { ligado?: boolean; so_para?: string[] };
  const ensaio = dryRun || cfg.ligado !== true;
  const hoje = hojeBRT();
  const ano = Number(hoje.slice(0, 4));
  const feriados = [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)];
  if (!(ignorarHorario && dryRun) && !ehDiaUtil(hoje, feriados)) return { ok: true, momento, pulou: 'não é dia útil' };
  const { data: equipe } = await svc.from('equipe_cockpit').select('profile_id, papel').eq('ativo', true).eq('papel', 'rep').or('so_acesso.is.null,so_acesso.eq.false');
  const soPara = new Set((cfg.so_para ?? []).map(String));
  const alvo = (equipe ?? []).map((e: { profile_id: string }) => String(e.profile_id));
  const { data: inscritas } = await svc.from('push_inscricoes').select('id, user_id, endpoint, p256dh, auth, falhas').in('user_id', alvo.length ? alvo : ['-']);
  const k = await chaves(svc);
  const relatorio: Array<Record<string, unknown>> = [];
  for (const uid of alvo) {
    const linha: Record<string, unknown> = { uid };
    relatorio.push(linha);
    const aparelhos = ((inscritas ?? []) as Inscricao[]).filter((i) => String(i.user_id) === uid);
    if (!aparelhos.length) { linha.pulou = 'sem aparelho inscrito'; continue; }
    if (soPara.size && !soPara.has(uid)) { linha.pulou = 'fora de so_para (teste)'; continue; }
    const env = await enviadosHoje(svc, uid, hoje);
    if (!env) { linha.pulou = 'push_enviados não lido'; continue; }
    if (env.total >= TETO_DIA) { linha.pulou = `já recebeu ${TETO_DIA} hoje (teto do dia)`; continue; }
    if (momento === 'fecho1800') {
      const { data: fechou } = await svc.from('fecho_do_dia').select('dia').eq('pessoa', uid).eq('dia', hoje).limit(1);
      if (fechou && fechou.length) { linha.pulou = 'já fechou o dia'; continue; }
    }
    const f = await filaDe(uid, segredo);
    const [rota, vis] = await Promise.all([
      svc.from('field_routes').select('field_route_stops(client_id, status, position, horario_fixo, clients(empresa, nome, bairro, etapa))').eq('seller_id', uid).eq('route_date', hoje).limit(1),
      svc.rpc('_visitas_com_prova', { p_de: hoje, p_ate: hoje, p_pessoa: uid }),
    ]);
    type Stop = { client_id: string; status: string; position: number | null; horario_fixo: string | null; clients: { empresa: string | null; nome: string | null; bairro: string | null; etapa: string | null } | null };
    const stops = (((rota.data ?? [])[0] as { field_route_stops?: Stop[] } | undefined)?.field_route_stops ?? [])
      .filter((x) => x.status === 'planned' || x.status === 'done').sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    const visitas = vis.error ? [] : (vis.data ?? []) as Array<{ client_id: string | null; provada: boolean }>;
    const provada = new Set(visitas.filter((v) => v.provada).map((v) => String(v.client_id)));
    const visitada = new Set(visitas.map((v) => String(v.client_id)));
    // a visita com prova fora do plano conta no "X de 6 com prova" (auditoria do servidor, 02/11/26)
    const noPlano = new Set(stops.map((x) => String(x.client_id)));
    const foraComProva = vis.error ? null : [...provada].filter((id) => !noPlano.has(id)).length;
    const paradas: Parada[] | null = rota.error ? null : stops.map((x) => ({
      id: x.client_id, nome: (x.clients?.empresa || x.clients?.nome || 'parada').trim(), etapa: x.clients?.etapa ?? null,
      hora: x.horario_fixo ? String(x.horario_fixo).slice(0, 5) : null,
      estado: (provada.has(x.client_id) ? 'com_prova' : visitada.has(x.client_id) || x.status === 'done' ? 'sem_prova' : momento === 'fecho1800' ? 'nao_visitada' : 'pendente') as Parada['estado'],
      venceHoje: null, metros: null,
    }));
    const conta = f ? semProximoPassoDaFila(f.itens as never) : null;
    const semIds = new Set(conta ? conta.ids : []);
    const pendentesFecho = (f?.itens ?? []).filter((i) => !!i.clientId && visitada.has(String(i.clientId))
      && (semIds.has(i.dealId) || i.motivo === 'visita_sem_registro')).map((i) => ({ id: i.dealId, nome: i.negocio }));
    let sequencia: number | null = null;
    if (momento === 'fecho1800' && !pendentesFecho.length) {
      const { data: q } = await svc.rpc('_desenvolvimento_de', { p_pessoa: uid });
      const Q = q as Quadro | null;
      sequencia = Q && !Q.erro && Q.sequencias ? Q.sequencias.rua.atual : null;
    }
    const e: EntradaDoDia = {
      hoje, agora: momento === 'manha0800' ? '08:00' : '18:00', feriado: null, util: true, nome: null, meta: 6,
      bairro: stops[0]?.clients?.bairro?.trim() || null, paradas, vencemHoje: [],
      semPasso: conta ? conta.total : null, topSemPasso: [], placar: null, sequencia, missao: null,
      ontem: null, fechouOntem: null, pendentesFecho, propostas: 0, foraComProva,
    };
    const vm = diaDoExecutivo(e);
    const t = momento === 'manha0800' ? vm.push08 : vm.push18;
    if (!t) { linha.pulou = momento === 'fecho1800' ? 'não foi à rua hoje' : 'sem expediente'; continue; }
    const aviso: Aviso = { titulo: t.titulo, texto: t.texto, tag: `hoje-${momento}`, url: `/?hoje=${momento === 'manha0800' ? 'manha' : 'fecho'}`, acoes: [] };
    /* a VOLTA no título das 8h (13/11/26): com volta para hoje ou volta vencida, o aviso nomeia o
       restaurante em vez de contar paradas. Se a leitura falhar, o aviso de sempre segue como está. */
    if (momento === 'manha0800') {
      const { data: vd, error: ve } = await svc.rpc('voltas_de', { p_pessoa: uid });
      const av = ve ? null : avisoDasVoltas(vd as VoltasDe | null, { titulo: t.titulo, texto: t.texto });
      if (av) { aviso.titulo = av.titulo; aviso.texto = av.texto; linha.volta = true; }
      else if (ve) linha.voltasErro = ve.message;
    }
    /* segunda 08:00: um push só (02/11/26). A missão da semana (o que era o seg0800) vai na linha de baixo do
       push da manhã. */
    let comSemana = false;
    if (momento === 'manha0800' && new Date(hoje + 'T12:00:00Z').getUTCDay() === 1) {
      const { data: q, error } = await svc.rpc('_desenvolvimento_de', { p_pessoa: uid });
      const s = !error && q && !(q as Quadro).erro ? pushSegunda(q as Quadro) : null;
      if (s) {
        const junto = `${t.texto} · ${s.titulo}: ${s.texto}`;
        aviso.texto = junto.length > 200 ? junto.slice(0, 199).trimEnd() + '…' : junto;
        comSemana = true;
      }
    }
    linha.aviso = aviso.titulo; linha.texto = aviso.texto;
    if (ensaio) { linha.ensaio = true; continue; }
    const { error: reservou } = await svc.from('push_enviados').insert({ user_id: uid, dia: hoje, tipo: 'hoje', ref: momento });
    if (reservou) { linha.pulou = 'já mandado'; continue; }
    // não grava uma 2ª linha (desenvolvimento/seg0800): ela gastaria teto por um push que é um só; o
    // seg0800 fora do ensaio já não manda nada (rodarSemana)
    linha.comSemana = comSemana;
    let algum = false;
    for (const a of aparelhos) algum = (await enviar(svc, a, aviso, k)) || algum;
    linha.enviado = algum;
  }
  return { ok: true, momento, ensaio, relatorio };
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
    if (corpo.op === 'recado') {
      try { return json(200, await recado(svc, String(corpo.id ?? ''))); }
      catch (e) { return json(500, { erro: (e as Error).message }); }
    }
    if (corpo.op !== 'rodar') return json(400, { erro: 'O robô só roda.' });
    const momento = String(corpo.momento ?? '');
    if (momento === 'manha0800' || momento === 'fecho1800') {
      try { return json(200, await rodarDia(svc, momento, corpo.dry_run === true, segredo, corpo.ignorar_horario === true)); }
      catch (e) { return json(500, { erro: (e as Error).message }); }
    }
    if (momento === 'seg0800' || momento === 'sex1700') {
      try { return json(200, await rodarSemana(svc, momento, corpo.dry_run === true, corpo.ignorar_horario === true)); }
      catch (e) { return json(500, { erro: (e as Error).message }); }
    }
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
    /* o mesmo aparelho com outra pessoa logada: a inscrição passa a ser de quem está agora. ANTES apagava
       qualquer linha com aquele endpoint, de qualquer usuário (auditoria do servidor, 02/11/26): bastava
       conhecer o endpoint de alguém para desligar os avisos dele. Agora só sai a linha do próprio usuário,
       ou a de outro quando quem pede apresenta as MESMAS chaves (p256dh e auth) — só o navegador que tem a
       inscrição as tem. Chave diferente para o mesmo endpoint: recusa, e a inscrição do outro fica. */
    const { data: doEndpoint, error: lerErro } = await svc.from('push_inscricoes').select('id, user_id, p256dh, auth').eq('endpoint', endpoint);
    if (lerErro) return json(500, { erro: lerErro.message });
    const outra = (doEndpoint ?? []).find((r: { user_id: string }) => String(r.user_id) !== uid) as { id: string; p256dh: string; auth: string } | undefined;
    if (outra && (outra.p256dh !== p256dh || outra.auth !== auth)) return json(409, { erro: 'Este aparelho está inscrito por outra conta.' });
    const apagar = (doEndpoint ?? []).map((r: { id: string }) => String(r.id));
    if (apagar.length) await svc.from('push_inscricoes').delete().in('id', apagar);
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
