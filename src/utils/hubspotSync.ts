import { supabase } from '../integrations/supabase/client';
import { CHANGE_STAGE_WEBHOOK } from '../constants/stages';
import type { MeetingType } from '../types/client';

// Ponto unico de saida dos eventos que antes iam TODOS pro webhook do n8n.
// Tipos com integracao HubSpot pura vao pra edge function hubspot-sync (rapida,
// sem intermediario); se ela ainda nao estiver deployada/configurada, cai
// automaticamente pro n8n com o MESMO payload — migracao sem quebra.
//
// reuniao/followup (Google Calendar via credencial OAuth do n8n) e visited
// (sem rota de HubSpot) NAO tem branch na edge: vao sempre direto pro n8n.
const EDGE_TYPES = new Set(['change_stage', 'update', 'create_pin', 'get_stages', 'create_note']);

// Tipos NAO idempotentes: reexecutar cria um segundo deal/nota. Pra esses, so
// caimos pro n8n quando temos CERTEZA de que a edge nao executou nada (function
// ausente/nao configurada) — nunca num erro de rede ambiguo (a edge pode ter
// criado o recurso e a resposta se perdeu).
const NON_IDEMPOTENT = new Set(['create_pin', 'create_note']);

// Extrai o motivo REAL de dentro do erro da edge. A edge responde
// { error, detail } — `detail` e' a mensagem do proprio HubSpot ("Property
// values were not valid", a lista de campos que faltou). Sem isso o app so'
// tem o texto generico do invoke, e quem esta' na rua nao descobre o que
// corrigir.
async function motivoDaEdge(error: any): Promise<string | null> {
  try {
    const corpo = await error?.context?.json?.();
    if (!corpo?.error) return null;
    return corpo.detail ? `${corpo.error}: ${corpo.detail}` : corpo.error;
  } catch {
    return null;
  }
}

// A edge devolve 503 quando HUBSPOT_TOKEN nao esta setado e a plataforma
// devolve 404 quando a function nem existe. Nesses casos ela comprovadamente
// nao tocou o HubSpot, entao o fallback pro n8n e' seguro mesmo pros tipos
// nao idempotentes.
function edgeDefinitelyDidNotRun(error: any): boolean {
  const status = error?.context?.status ?? error?.status;
  return status === 404 || status === 503;
}

async function postToN8n(payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(CHANGE_STAGE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Webhook respondeu ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function sendHubspotEvent(payload: Record<string, unknown>): Promise<unknown> {
  const type = String(payload.type ?? '');

  if (!EDGE_TYPES.has(type)) {
    // reuniao/followup/visited: sempre n8n.
    return postToN8n(payload);
  }

  try {
    const { data, error } = await supabase.functions.invoke('hubspot-sync', { body: payload });
    if (!error) return data;

    // A edge RODOU e o HubSpot recusou? Entao o n8n nao resolve: ele fala com o
    // mesmo HubSpot, que vai recusar igual — e no caminho o motivo se perde e
    // vira "sem conexao?" na cara de quem esta' na rua.
    //
    // Em 14/09/2026 isso custou caro: uma vendedora tentou mover um negocio pra
    // Ag. Pagamento, o HubSpot recusou por propriedade invalida, o app disse
    // "sem conexao?" e ela ficou conferindo o sinal do celular.
    //
    // So' caimos pro n8n quando a edge COMPROVADAMENTE nao executou nada (404 =
    // function ausente, 503 = sem HUBSPOT_TOKEN).
    if (!edgeDefinitelyDidNotRun(error)) {
      const motivo = await motivoDaEdge(error);
      throw new Error(motivo ?? `hubspot-sync falhou (${type}): ${error.message ?? error}`);
    }
    console.warn(`[hubspot-sync] edge indisponivel (${type}), caindo pro n8n:`, error.message ?? error);
    return postToN8n(payload);
  } catch (err) {
    // Exception do invoke (rede/timeout). Mesma regra: nao reexecuta tipo
    // nao idempotente por conta de erro ambiguo.
    if (NON_IDEMPOTENT.has(type)) {
      throw err;
    }
    console.warn(`[hubspot-sync] edge indisponivel (${type}), caindo pro n8n:`, err);
    return postToN8n(payload);
  }
}

// ============================================================================
// Agenda -> HubSpot (Observacao pra follow up, Meeting pra demo).
//
// Chamam a edge hubspot-sync DIRETO (sem passar pelo sendHubspotEvent). O
// fallback pro n8n desses tipos seria PERIGOSO: a rota default do Switch do n8n
// cria um deal. Entao aqui, se a edge falhar, o erro sobe e quem chama so' loga
// (o agendamento em si nao quebra) — nunca reenvia pro n8n.
// ============================================================================
async function invokeHubspotSync(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('hubspot-sync', { body });
  if (error) {
    const ctx = (error as any)?.context;
    let detail = error.message;
    try {
      const b = await ctx?.json?.();
      if (b?.error) detail = b.detail ? `${b.error}: ${b.detail}` : b.error;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
  return data;
}

// Duracao (min) -> fim ISO a partir do inicio.
const endFromStart = (startIso: string, durationMin: number) =>
  new Date(new Date(startIso).getTime() + durationMin * 60_000).toISOString();

// dd/mm/aaaa hh:mm no fuso do aparelho — mesmo formato que a agenda mostra.
const formatBr = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

// Corpo da Observacao do follow up. Diferente da Task, a nota nao tem campo de
// vencimento — entao a data agendada precisa estar NO TEXTO, senao quem le a
// timeline do deal nao sabe pra quando o follow up ficou.
const followUpNoteBody = (titulo: string, descricao: string | null, scheduledAt: string) => {
  const linhas = [titulo, `Agendado para: ${formatBr(scheduledAt)}`];
  const obs = descricao?.trim();
  if (obs) linhas.push('', obs);
  return linhas.join('\n');
};

export type AgendaEngagementInput = {
  meetingType: MeetingType;    // 'reuniao' (demo) | 'follow_up'
  id_hubspot: string;          // id do deal
  titulo: string;
  descricao: string | null;
  scheduled_at: string;        // ISO
  duration_minutes: number;
  owner_id: string | null;     // hubspot_owner_id do vendedor
  autor_nome?: string | null;  // assina a Observacao do follow up na timeline
};

// Cria a Observacao (follow up) ou a Meeting (demo) no HubSpot. Retorna o id do
// engagement (pra guardar em client_meetings.hs_engagement_id) ou null.
export async function createAgendaEngagement(input: AgendaEngagementInput): Promise<string | null> {
  const isFollowUp = input.meetingType === 'follow_up';
  const body = isFollowUp
    ? {
        type: 'create_note', id_hubspot: input.id_hubspot,
        body: followUpNoteBody(input.titulo, input.descricao, input.scheduled_at),
        autor_nome: input.autor_nome ?? null,
      }
    : {
        type: 'create_meeting', id_hubspot: input.id_hubspot,
        titulo: input.titulo, descricao: input.descricao,
        start_at: input.scheduled_at,
        end_at: endFromStart(input.scheduled_at, input.duration_minutes),
        owner_id: input.owner_id,
      };
  const data = await invokeHubspotSync(body);
  // create_note responde note_id; create_meeting responde engagement_id.
  return ((data?.note_id ?? data?.engagement_id) as string | undefined) ?? null;
}

// Reagenda (novo horario) o engagement ja criado.
export async function rescheduleAgendaEngagement(input: {
  meetingType: MeetingType;
  engagement_id: string;
  titulo: string;
  descricao: string | null;
  scheduled_at: string;
  duration_minutes: number;
}): Promise<void> {
  const isFollowUp = input.meetingType === 'follow_up';
  const body = isFollowUp
    ? {
        type: 'update_note', engagement_id: input.engagement_id,
        body: followUpNoteBody(input.titulo, input.descricao, input.scheduled_at),
        // titulo/descricao/due_at so' servem pros follow ups da regra ANTIGA,
        // cujo hs_engagement_id e' de Task: a edge detecta (404 na nota) e cai
        // pro update da task com esses campos.
        titulo: input.titulo, descricao: input.descricao, due_at: input.scheduled_at,
      }
    : {
        type: 'update_meeting', engagement_id: input.engagement_id,
        titulo: input.titulo, descricao: input.descricao,
        start_at: input.scheduled_at,
        end_at: endFromStart(input.scheduled_at, input.duration_minutes),
      };
  await invokeHubspotSync(body);
}

// ============================================================================
// Check-in de visita -> Task no HubSpot.
//
// Vale pros DOIS botoes ("Marcar como visitado" e "Re-marcar visita") — cada
// check-in gera a sua Task, ja CONCLUIDA e datada na hora do check-in: a visita
// e' fato consumado, entao a task e' registro de atividade, nao pendencia (nao
// entra na fila do vendedor). Sem update/cancel — por isso o id nao vai pro banco.
// ============================================================================
export async function createVisitTask(input: {
  id_hubspot: string;
  lead_nome: string;            // empresa (ou nome, se nao houver empresa)
  visited_at: string;           // ISO do check-in
  visita_numero: number | null; // contador da RPC (1 = primeira visita)
  vendedor_nome: string | null;
  owner_id: string | null;      // hubspot_owner_id do vendedor
}): Promise<string | null> {
  const linhas = [`Check-in em ${formatBr(input.visited_at)}`];
  if (input.visita_numero) linhas.push(`Visita nº ${input.visita_numero}`);
  if (input.vendedor_nome) linhas.push(`Vendedor: ${input.vendedor_nome}`);

  const data = await invokeHubspotSync({
    type: 'create_task',
    id_hubspot: input.id_hubspot,
    titulo: `Visita - ${input.lead_nome}`,
    descricao: linhas.join('\n'),
    due_at: input.visited_at,
    owner_id: input.owner_id,
    concluida: true,
  });
  return (data?.engagement_id as string | undefined) ?? null;
}

// Cancela o engagement — usado ao remover no app. Follow up: marca a Observacao
// como cancelada (o texto fica, e' registro de timeline). Demo: cancela a Meeting.
export async function cancelAgendaEngagement(input: {
  meetingType: MeetingType;
  engagement_id: string;
}): Promise<void> {
  const body = input.meetingType === 'follow_up'
    ? { type: 'update_note', engagement_id: input.engagement_id, cancelar: true }
    : { type: 'update_meeting', engagement_id: input.engagement_id, cancelar: true };
  await invokeHubspotSync(body);
}

// ============================================================================
// Desfecho da visita -> tres escritas no HubSpot.
//
// O check-in ja' registrava que a visita ACONTECEU (Task concluida). Isto
// registra o que aconteceu NELA, nos tres lugares que o Cockpit le':
//
//   1. propriedades de qualificacao no deal  (rota `qualificar`)
//   2. nota com o bloco DESFECHO_VISITA v1   (rota `create_note`)
//   3. tarefa do proximo passo               (rota `create_task`)
//
// AS TRES SAO INDEPENDENTES, E FALHAM SEPARADO. A visita ja' esta' gravada no
// Supabase antes de qualquer uma delas — nenhuma falha aqui desfaz visita. E
// uma falhar nao pode cancelar as outras duas: se o HubSpot recusar o gargalo,
// a nota com a dor do cliente continua valendo. Por isso o retorno diz o que
// entrou e o que nao entrou, em vez de lancar no primeiro erro.
// ============================================================================
import {
  montarBlocoDesfecho,
  vencimentoDoDia,
  tituloDoProximoPasso,
  decisorDoDesfecho,
  type Desfecho,
  type Gargalo,
  type ProximoPasso,
} from './desfechoVisita';

export type ResultadoDesfecho = {
  qualificacao: 'gravada' | 'nada_a_gravar' | 'falhou';
  nota: 'gravada' | 'falhou';
  tarefa: 'criada' | 'sem_proximo_passo' | 'falhou';
  /** Mensagens legiveis, uma por escrita que falhou. Vazio = tudo entrou. */
  erros: string[];
};

export type EntradaDesfechoVisita = {
  id_hubspot: string;
  cliente: string;
  /** ISO do check-in — a nota e' datada no momento da visita, nao no do envio. */
  ocorridoEm: string;
  desfecho: Desfecho;
  nomeDoSistema: string | null;
  gargalo: Gargalo | null;
  proximoPasso: ProximoPasso | null;
  observacao: string | null;
  ownerId: string | null;
};

export async function enviarDesfechoDaVisita(
  e: EntradaDesfechoVisita,
): Promise<ResultadoDesfecho> {
  const erros: string[] = [];
  const motivo = (err: unknown) => (err as Error)?.message ?? String(err);

  // 1) Qualificacao. Campo em branco nao vai: a rota `qualificar` ignora vazio
  //    de proposito, mas nem vale a viagem se os dois estiverem em branco.
  let qualificacao: ResultadoDesfecho['qualificacao'] = 'nada_a_gravar';
  const propriedades: Record<string, string> = {};
  if (e.nomeDoSistema?.trim()) propriedades.nome_do_sistema = e.nomeDoSistema.trim();
  if (e.gargalo) propriedades.gargalo_operacional = e.gargalo;
  if (Object.keys(propriedades).length > 0) {
    try {
      await invokeHubspotSync({ type: 'qualificar', id_hubspot: e.id_hubspot, propriedades });
      qualificacao = 'gravada';
    } catch (err) {
      qualificacao = 'falhou';
      erros.push(`Qualificação: ${motivo(err)}`);
    }
  }

  // 2) A nota. SEM `autor_nome` de proposito: a edge anexa "— Fulano (via App
  //    Outbound)" depois do corpo, e o bloco precisa ser o corpo INTEIRO —
  //    linha solta depois dele nao e' `chave: valor` e confunde o parser. Quem
  //    visitou ja' esta' na Task de check-in e no dono do negocio.
  let nota: ResultadoDesfecho['nota'] = 'gravada';
  try {
    await invokeHubspotSync({
      type: 'create_note',
      id_hubspot: e.id_hubspot,
      body: montarBlocoDesfecho({
        cliente: e.cliente,
        ocorridoEm: e.ocorridoEm,
        canal: 'visita',
        desfecho: e.desfecho,
        decisorAlcancado: decisorDoDesfecho(e.desfecho),
        observacao: e.observacao,
        proximoPasso: e.proximoPasso,
      }),
      criado_em: e.ocorridoEm,
    });
  } catch (err) {
    nota = 'falhou';
    erros.push(`Nota do desfecho: ${motivo(err)}`);
  }

  // 3) A tarefa do proximo passo. So' existe se o vendedor PROMETEU alguma
  //    coisa — tarefa auto-gerada enche o CRM de item que ninguem assumiu, e
  //    o Cockpit mede tarefa do HubSpot como pendencia real da pessoa.
  //    `concluida: false`: esta e' pendencia, diferente da Task do check-in.
  let tarefa: ResultadoDesfecho['tarefa'] = 'sem_proximo_passo';
  if (e.proximoPasso && e.proximoPasso.acao.trim()) {
    try {
      await invokeHubspotSync({
        type: 'create_task',
        id_hubspot: e.id_hubspot,
        titulo: tituloDoProximoPasso(e.proximoPasso.canal, e.cliente),
        descricao: e.proximoPasso.acao.trim(),
        due_at: vencimentoDoDia(e.proximoPasso.dia),
        owner_id: e.ownerId,
        concluida: false,
      });
      tarefa = 'criada';
    } catch (err) {
      tarefa = 'falhou';
      erros.push(`Tarefa do próximo passo: ${motivo(err)}`);
    }
  }

  return { qualificacao, nota, tarefa, erros };
}
