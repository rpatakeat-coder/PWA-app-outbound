// PÔR NO PLANO, PELO PINO (Claude Design "entrega-um-plano-so", 06/10/2026) — as leituras e as
// gravações. Uma parada é uma linha de field_route_stops na rota do dia (field_routes); o
// gatilho rota_para_plano (0150) e parada_acao_no_plano (0175) levam ao Planejamento do
// Cockpit com o chip (acao), o propósito e a hora do cadeado. O executivo também planeja
// pelo Cockpit: a faixa que veio de lá vira parada pelo plano_para_rota e aparece aqui igual.
import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';
import { tirarDoDia } from './paradaDoDia';
import { acaoPorId, type AcaoId } from './acoesDoPlano';
import { negocioAcao } from './negocioAcao';
import { descartar, ehErroDeRede, enfileirar, liberar, novoAcaoId } from './filaOffline';

export type ParadaLida = { clientId: string; position: number | null; status: string; acao: string | null; horarioFixo: string | null; lat: number | null; lng: number | null };
export type PlanoLido = { contagem: Record<string, number>; paradas: Record<string, ParadaLida[]> };

/** As paradas dele nos dias pedidos (planejadas e feitas contam; tirada e pulada não). */
export async function lerPlanoDosDias(uid: string, dias: string[]): Promise<PlanoLido> {
  const { data, error } = await supabase.from('field_routes')
    .select('route_date, field_route_stops(client_id, position, status, acao, horario_fixo, clients(latitude, longitude))')
    .eq('seller_id', uid).in('route_date', dias);
  if (error) throw error;
  const contagem: Record<string, number> = {};
  const paradas: Record<string, ParadaLida[]> = {};
  for (const d of dias) { contagem[d] = 0; paradas[d] = []; }
  type Linha = { client_id: string; position: number | null; status: string; acao: string | null; horario_fixo: string | null; clients: { latitude: number | string | null; longitude: number | string | null } | null };
  for (const r of (data ?? []) as unknown as Array<{ route_date: string; field_route_stops: Linha[] | null }>) {
    const vivas = (r.field_route_stops ?? []).filter((s) => s.status === 'planned' || s.status === 'done')
      .map((s) => ({ clientId: s.client_id, position: s.position, status: s.status, acao: s.acao, horarioFixo: s.horario_fixo,
        lat: s.clients?.latitude != null ? Number(s.clients.latitude) : null, lng: s.clients?.longitude != null ? Number(s.clients.longitude) : null }))
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    paradas[r.route_date] = vivas;
    contagem[r.route_date] = vivas.length;
  }
  return { contagem, paradas };
}

export type OndeEsta = { dia: string; ordem: number; acao: string | null; hora: string | null; feita: boolean };

/** Onde o pino já está no plano (o primeiro dia, a partir de hoje). */
export function ondeEsta(clientId: string, plano: PlanoLido, dias: string[]): OndeEsta | null {
  for (const d of dias) {
    const lista = plano.paradas[d] ?? [];
    const i = lista.findIndex((p) => p.clientId === clientId);
    if (i >= 0) return { dia: d, ordem: i + 1, acao: lista[i].acao, hora: lista[i].horarioFixo, feita: lista[i].status === 'done' };
  }
  return null;
}

/** O tipo de próximo passo que o servidor do Cockpit aceita (criar-nota-negocio.js). */
function tipoDoPasso(a: AcaoId): string {
  if (a === 'prosp' || a === 'rel') return 'visita';
  if (a === 'reuniao') return 'reuniao';
  if (a === 'demo') return 'demo';
  return 'follow-up';
}

export type PedidoDoPlano = {
  uid: string;
  client: Client;
  dia: string;
  acao: AcaoId;
  /** 'HH:MM' com cadeado, ou null (entra na ordem da rota). */
  hora: string | null;
  /** onde ele já estava (mover tira de lá). */
  antes: OndeEsta | null;
  /** cria a reunião/ligação na Agenda do app (useMeetings.addMeeting), quando é o caso. */
  criarCompromisso?: (p: { tipo: 'reuniao' | 'follow_up'; acao: AcaoId; quando: string }) => Promise<void>;
  /** remarca o compromisso que já existe no dia antigo (true = remarcou; aí não se cria outro). */
  remarcarCompromisso?: (p: { de: string; quando: string }) => Promise<boolean>;
};

const isoBRT = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

/** O que vai ao HubSpot e à Agenda do app depois que o plano já está gravado. */
export type DepoisDoPlano = { hubspot: string | null; remarcadas: number; avisos: string[] };

/* A PARADA EM DUAS IDAS AO BANCO (velocidade, 06/10/26: o salvar com hora levava 8 s, e 2,4 s
   eram seis pedidos em fila só para gravar a parada). Rota e paradas do dia vêm numa leitura; a
   parada entra (ou volta) já com o chip e o cadeado, e a posição sai da lista lida. */
async function gravarParada(uid: string, dia: string, clientId: string, acao: AcaoId, hora: string | null): Promise<number | null> {
  const ler = () => supabase.from('field_routes').select('id, field_route_stops(client_id, position, status)')
    .eq('seller_id', uid).eq('route_date', dia).limit(1);
  let { data, error } = await ler();
  if (error) throw error;
  if (!data || !data[0]) {
    const { error: e2 } = await supabase.from('field_routes').upsert({
      seller_id: uid, route_date: dia, title: 'Rota do dia', status: 'planned', source: 'manual', priority_mode: 'manual', created_by: uid,
    }, { onConflict: 'seller_id,route_date', ignoreDuplicates: true });
    if (e2) throw e2;
    ({ data, error } = await ler());
    if (error) throw error;
    if (!data || !data[0]) throw new Error('Não consegui criar a rota desse dia.');
  }
  const rota = data[0] as unknown as { id: string; field_route_stops: Array<{ client_id: string; position: number | null; status: string }> | null };
  const linhas = rota.field_route_stops ?? [];
  const minha = linhas.find((l) => l.client_id === clientId);
  const viva = !!minha && (minha.status === 'planned' || minha.status === 'done');
  const posicao = viva ? minha!.position : linhas.reduce((m, l) => Math.max(m, l.position ?? 0), 0) + 1;
  if (minha) {
    const { error: e } = await supabase.from('field_route_stops')
      .update(viva ? { acao, horario_fixo: hora } : { status: 'planned', position: posicao, planned_at: new Date().toISOString(), acao, horario_fixo: hora })
      .eq('route_id', rota.id).eq('client_id', clientId);
    if (e) throw e;
  } else {
    const { error: e } = await supabase.from('field_route_stops').insert({
      route_id: rota.id, client_id: clientId, position: posicao, planned_at: new Date().toISOString(), status: 'planned', acao, horario_fixo: hora,
    });
    if (e) throw e;
  }
  const vivas = linhas.filter((l) => (l.status === 'planned' || l.status === 'done') && l.client_id !== clientId)
    .map((l) => l.position ?? 999);
  return vivas.filter((x) => x < (posicao ?? 999)).length + 1;
}

/**
 * Grava o pedido do "Pôr no plano". Espera só o PLANO (tirar do dia antigo e pôr no novo, em
 * paralelo); reunião, Google e HubSpot seguem em `depois`, em paralelo entre si, e a tela
 * avisa se algum falhar ("obrigatório é avisar"). Sem sinal, o próximo passo do HubSpot entra
 * na fila do app, que sobe sozinha.
 */
export async function porNoPlano(p: PedidoDoPlano): Promise<{ ordem: number | null; depois: Promise<DepoisDoPlano> }> {
  const a = acaoPorId(p.acao)!;
  const mudouDia = !!p.antes && p.antes.dia !== p.dia && !p.antes.feita;
  const mudouHora = !!p.antes && p.antes.dia === p.dia && !!p.hora && p.hora !== p.antes.hora;
  const [, ordem] = await Promise.all([
    mudouDia ? tirarDoDia(p.uid, p.antes!.dia, p.client.id) : Promise.resolve(0),
    a.ehParada ? gravarParada(p.uid, p.dia, p.client.id, p.acao, p.hora) : Promise.resolve(null),
  ]);

  const depois = (async (): Promise<DepoisDoPlano> => {
    const avisos: string[] = [];
    let remarcadas = 0;
    let hubspot: string | null = null;
    /* À PROVA DE FECHAR O APP (06/10/26): o que vai à Agenda do app e ao HubSpot entra na fila do
       aparelho ANTES de sair, em voo. Terminou, sai; caiu o sinal, espera o sinal; o app fechou no
       meio (medido no Chrome: recarregar 0,7 s depois perdia a tarefa E a reunião), sobe ao reabrir
       pelo executor 'plano' do App.tsx, que confere o que já existe antes de escrever. */
    const pedido: PedidoDepois = { crm: pedidoCrm(p, mudouDia || mudouHora), reuniao: p.criarCompromisso ? reuniaoDoPedido(p) : null };
    const acaoId = novoAcaoId();
    const guardado = !!(pedido.crm || pedido.reuniao);
    if (guardado) {
      await enfileirar({ acaoId, tipo: 'plano', payload: pedido as unknown as Record<string, unknown>,
        rotulo: `Próximo passo · ${p.client.empresa?.trim() || p.client.nome}`,
        naoAntesDe: new Date(Date.now() + 2 * 60_000).toISOString() }).catch(() => undefined);
    }
    /* A AGENDA DO APP: a reunião só depois da parada (se entrasse antes, o gatilho dela poria a
       parada sozinho e esta bateria na duplicata). Mover uma Demo com hora REMARCA a reunião. */
    let agendaSemSinal = false;
    const agenda = (async () => {
      const r = pedido.reuniao;
      if (!r || !p.criarCompromisso) return;
      const remarcou = r.de && p.remarcarCompromisso ? await p.remarcarCompromisso({ de: r.de, quando: r.quando }) : false;
      if (!remarcou) await p.criarCompromisso({ tipo: r.tipo, acao: r.acao, quando: r.quando });
    })().catch((e) => {
      if (ehErroDeRede(e)) { agendaSemSinal = true; return; }
      avisos.push(`a Agenda do app não gravou o compromisso (${String((e as Error)?.message ?? e)})`);
    });
    let crmSemSinal = false;
    const crm = (async () => {
      if (!pedido.crm) return;
      const r = await crmDoPlano(pedido.crm, false);
      remarcadas = r.remarcadas;
      avisos.push(...r.avisos);
      if (r.semSinal) { crmSemSinal = true; hubspot = 'na fila: sobe quando o sinal voltar'; return; }
      hubspot = r.hubspot;
    })().catch((e) => { avisos.push(`o HubSpot não recebeu o próximo passo (${String((e as Error)?.message ?? e)})`); });
    await Promise.all([agenda, crm]);
    if (guardado) {
      if (agendaSemSinal || crmSemSinal) {
        await liberar(acaoId, { crm: crmSemSinal ? pedido.crm : null, reuniao: agendaSemSinal ? pedido.reuniao : null } as unknown as Record<string, unknown>).catch(() => undefined);
      } else await descartar(acaoId).catch(() => undefined);
    }
    return { hubspot, remarcadas, avisos };
  })();
  return { ordem, depois };
}

/** A reunião (ou ligação) da Agenda do app que o pedido cria ou remarca. */
export type ReuniaoDoPlano = { clientId: string; tipo: 'reuniao' | 'follow_up'; acao: AcaoId; quando: string; de: string | null };
/** O que a fila guarda e reenvia (sem nada da tela). */
export type PedidoDepois = { crm: PedidoCrm | null; reuniao: ReuniaoDoPlano | null };

function reuniaoDoPedido(p: PedidoDoPlano): ReuniaoDoPlano | null {
  const de = p.antes ? p.antes.dia : null;
  if (p.hora && (p.acao === 'reuniao' || p.acao === 'demo' || p.acao === 'ligar')) {
    return { clientId: p.client.id, tipo: p.acao === 'ligar' ? 'follow_up' : 'reuniao', acao: p.acao, quando: isoBRT(p.dia, p.hora), de };
  }
  /* Ligar sem hora: a ligação do dia fica na Agenda (09:00 é a convenção do "sem hora") */
  if (!p.hora && p.acao === 'ligar') return { clientId: p.client.id, tipo: 'follow_up', acao: 'ligar', quando: isoBRT(p.dia, '09:00'), de: null };
  return null;
}

const faixaDoDia = (dia: string) => [new Date(`${dia}T00:00:00-03:00`).toISOString(), new Date(`${dia}T23:59:59-03:00`).toISOString()];

/** Retomada da Agenda: se já existe a reunião no dia novo, nada; se existe no antigo, move; senão, cria. */
async function garantirReuniao(r: ReuniaoDoPlano): Promise<void> {
  const { data: sessao } = await supabase.auth.getSession();
  const uid = sessao.session?.user?.id;
  if (!uid) throw new Error('JWT expired');
  const diaNovo = new Date(new Date(r.quando).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const achar = async (dia: string) => {
    const [a, b] = faixaDoDia(dia);
    const { data, error } = await supabase.from('client_meetings').select('id').eq('client_id', r.clientId).eq('created_by', uid)
      .eq('status', 'agendada').gte('scheduled_at', a).lte('scheduled_at', b).limit(1);
    if (error) throw error;
    return (data ?? [])[0] as { id: string } | undefined;
  };
  if (await achar(diaNovo)) return;
  const velha = r.de && r.de !== diaNovo ? await achar(r.de) : undefined;
  if (velha) {
    const { error } = await supabase.from('client_meetings').update({ scheduled_at: r.quando }).eq('id', velha.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('client_meetings').insert({ client_id: r.clientId, scheduled_at: r.quando, duration_minutes: 30,
    observacoes: null, type: r.tipo, acao: r.acao, created_by: uid });
  if (error) throw error;
}

/** O que vai ao HubSpot, sem nada da tela. */
export type PedidoCrm = { dealId: string; nome: string; acao: AcaoId; de: string | null; para: string; hora: string | null };

function pedidoCrm(p: PedidoDoPlano, mudou: boolean): PedidoCrm | null {
  if (!p.client.id_hubspot) return null;
  if (!mudou && !p.hora) return null;
  return { dealId: String(p.client.id_hubspot), nome: p.client.empresa?.trim() || p.client.nome, acao: p.acao,
    de: mudou ? p.antes!.dia : null, para: p.dia, hora: p.hora };
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * A tarefa aberta vai junto ao mudar de dia ou de hora (Edge fila-tarefas, op remarcar); sem o que
 * remarcar e com hora, nasce o próximo passo. Sem hora, nada novo.
 * RETOMADA (a fila reenviando depois do app fechar no meio): a remarcação já pode ter andado, e aí
 * não sobra nada no dia antigo. Se o dia novo já tem tarefa aberta dele, é ela; não cria outra. O
 * próximo passo novo é seguro de repetir: o servidor recusa a gêmea (mesmo assunto, mesmo dia).
 */
export async function crmDoPlano(c: PedidoCrm, retomada: boolean): Promise<DepoisDoPlano & { semSinal: boolean }> {
  const avisos: string[] = [];
  let remarcadas = 0;
  let jaNoDia = 0;
  if (c.de) {
    try {
      const { data, error } = await supabase.functions.invoke('fila-tarefas', {
        body: { op: 'remarcar', dealId: c.dealId, de: c.de, para: c.para, hora: c.hora },
      });
      if (error) throw error;
      const d = data as { remarcadas?: unknown[]; jaNoDia?: number } | null;
      remarcadas = Array.isArray(d?.remarcadas) ? d!.remarcadas!.length : 0;
      jaNoDia = Number(d?.jaNoDia ?? 0) || 0;
    } catch (e) {
      if (ehErroDeRede(e)) return { hubspot: null, remarcadas: 0, avisos, semSinal: true };
      avisos.push(`não remarquei a tarefa do HubSpot (${String((e as Error)?.message ?? e)})`);
    }
  }
  if (!c.hora) return { hubspot: null, remarcadas, avisos, semSinal: false };
  if (remarcadas > 0) return { hubspot: `tarefa remarcada para ${ddmm(c.para)} ${c.hora}`, remarcadas, avisos, semSinal: false };
  if (retomada && c.de && jaNoDia > 0) return { hubspot: `tarefa já em ${ddmm(c.para)}`, remarcadas, avisos, semSinal: false };
  const corpo = { op: 'nota', tipoAcao: 'proximo-passo', dealId: c.dealId, tipo: tipoDoPasso(c.acao),
    /* o servidor já prefixa o tipo ("Demo - "): o texto é só o nome */
    data: c.para, hora: c.hora, texto: c.nome };
  try {
    await negocioAcao(corpo);
    return { hubspot: `${acaoPorId(c.acao)?.hubspot ?? 'Próximo passo'} ${ddmm(c.para)} ${c.hora}`, remarcadas, avisos, semSinal: false };
  } catch (e) {
    if (ehErroDeRede(e)) return { hubspot: null, remarcadas, avisos, semSinal: true };
    avisos.push(`o HubSpot recusou o próximo passo (${String((e as Error)?.message ?? e)})`);
    return { hubspot: null, remarcadas, avisos, semSinal: false };
  }
}

/** Executor da fila para o tipo 'plano': sem sinal continua na fila; recusa vira "falhou" com o motivo. */
export async function subirPlanoDaFila(payload: Record<string, unknown>): Promise<void> {
  // item do primeiro formato (só o HubSpot, publicado no mesmo dia): ainda sobe
  const ped = ((payload as { dealId?: string }).dealId ? { crm: payload, reuniao: null } : payload) as unknown as PedidoDepois;
  // a reunião primeiro: a parada já existe, e o gatilho dela não duplica
  if (ped.reuniao) await garantirReuniao(ped.reuniao);
  if (ped.crm) {
    const r = await crmDoPlano(ped.crm, true);
    if (r.semSinal) throw new Error('Failed to fetch');
    if (r.avisos.length) throw new Error(r.avisos.join(' e '));
  }
  avisarQueOPlanoMudou();
}

/** Tira do plano (o pino continua no mapa; parada feita não se tira). */
export async function tirarDoPlano(uid: string, clientId: string, dia: string): Promise<void> {
  await tirarDoDia(uid, dia, clientId);
}

// Quem mostra "onde está no plano" (o cartão do pino, a Agenda) relê quando o plano muda.
const ouvintes = new Set<() => void>();
export function aoMudarOPlano(f: () => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
export function avisarQueOPlanoMudou(): void { ouvintes.forEach((f) => { try { f(); } catch { /* um ouvinte não derruba os outros */ } }); }
