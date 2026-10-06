// PÔR NO PLANO, PELO PINO (Claude Design "entrega-um-plano-so", 06/10/2026) — as leituras e as
// gravações. Uma parada é uma linha de field_route_stops na rota do dia (field_routes); o
// gatilho rota_para_plano (0150) e parada_acao_no_plano (0175) levam ao Planejamento do
// Cockpit com o chip (acao), o propósito e a hora do cadeado. O executivo também planeja
// pelo Cockpit: a faixa que veio de lá vira parada pelo plano_para_rota e aparece aqui igual.
import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';
import { porNoDia, tirarDoDia } from './paradaDoDia';
import { acaoPorId, type AcaoId } from './acoesDoPlano';
import { negocioAcao } from './negocioAcao';

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

/**
 * Grava o pedido do "Pôr no plano". Ordem: tira do dia antigo (mover nunca duplica) → põe no
 * dia (parada de rua) com o chip e o cadeado → HubSpot só com hora. Devolve a posição.
 */
export async function porNoPlano(p: PedidoDoPlano): Promise<{ ordem: number | null; hubspot: string | null; remarcadas: number; avisoHubspot: string | null }> {
  const a = acaoPorId(p.acao)!;
  if (p.antes && p.antes.dia !== p.dia && !p.antes.feita) await tirarDoDia(p.uid, p.antes.dia, p.client.id);
  let ordem: number | null = null;
  if (a.ehParada) {
    await porNoDia(p.uid, p.dia, p.client.id);
    const { data: rota } = await supabase.from('field_routes').select('id').eq('seller_id', p.uid).eq('route_date', p.dia).limit(1);
    const rid = rota && rota[0] ? (rota[0] as { id: string }).id : null;
    if (rid) {
      const { error } = await supabase.from('field_route_stops').update({ acao: p.acao, horario_fixo: p.hora })
        .eq('route_id', rid).eq('client_id', p.client.id);
      if (error) throw error;
      const { data: todas } = await supabase.from('field_route_stops').select('client_id, position, status').eq('route_id', rid).in('status', ['planned', 'done']);
      const lista = ((todas ?? []) as Array<{ client_id: string; position: number | null }>).sort((x, y) => (x.position ?? 999) - (y.position ?? 999));
      const i = lista.findIndex((x) => x.client_id === p.client.id);
      ordem = i >= 0 ? i + 1 : null;
    }
  }
  /* SEM HORA, NADA NOVO NO HUBSPOT. Com hora: Reunião e Demo viram reunião na Agenda do app
     (o Google do time e as métricas do gestor leem client_meetings); Ligar vira ligação na
     Agenda; e todo passo de negócio vira tarefa no HubSpot (o próximo passo com data, que
     é o que tira o negócio de "sem próximo passo" e do travado). */
  let hubspot: string | null = null;
  /* A TAREFA VAI JUNTO (auditoria 06/10/26): mover de dia, ou mudar a hora no mesmo dia, remarca
     a tarefa aberta do negócio que vencia no dia antigo (Edge fila-tarefas, op remarcar). Havendo
     o que remarcar, não se cria tarefa nova: o próximo passo é o mesmo, em outra data. Falhar
     aqui não desfaz o plano: volta como aviso. */
  let remarcadas = 0;
  let avisoHubspot: string | null = null;
  const mudouDia = !!p.antes && p.antes.dia !== p.dia && !p.antes.feita;
  const mudouHora = !!p.antes && p.antes.dia === p.dia && !!p.hora && p.hora !== p.antes.hora;
  if (p.client.id_hubspot && (mudouDia || mudouHora)) {
    try {
      const { data, error } = await supabase.functions.invoke('fila-tarefas', {
        body: { op: 'remarcar', dealId: String(p.client.id_hubspot), de: p.antes!.dia, para: p.dia, hora: p.hora },
      });
      if (error) throw error;
      remarcadas = Array.isArray((data as { remarcadas?: unknown[] })?.remarcadas) ? (data as { remarcadas: unknown[] }).remarcadas.length : 0;
    } catch (e) {
      avisoHubspot = `não remarquei a tarefa do HubSpot (${String((e as Error)?.message ?? e)})`;
    }
  }
  if (p.hora) {
    const quando = isoBRT(p.dia, p.hora);
    if ((p.acao === 'reuniao' || p.acao === 'demo' || p.acao === 'ligar') && p.criarCompromisso) {
      /* mover uma Demo com hora REMARCA a reunião que já existia; não cria a segunda */
      const remarcou = p.antes && p.remarcarCompromisso ? await p.remarcarCompromisso({ de: p.antes.dia, quando }) : false;
      if (!remarcou) await p.criarCompromisso({ tipo: p.acao === 'ligar' ? 'follow_up' : 'reuniao', acao: p.acao, quando });
    }
    if (p.client.id_hubspot && remarcadas > 0) {
      hubspot = `tarefa remarcada para ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} ${p.hora}`;
    } else if (p.client.id_hubspot) {
      await negocioAcao({ op: 'nota', tipoAcao: 'proximo-passo', dealId: String(p.client.id_hubspot), tipo: tipoDoPasso(p.acao),
        /* o servidor já prefixa o tipo ("Demo - "): o texto é só o nome */
        data: p.dia, hora: p.hora, texto: p.client.empresa?.trim() || p.client.nome });
      hubspot = `${a.hubspot} ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} ${p.hora}`;
    }
  } else if (p.acao === 'ligar' && p.criarCompromisso) {
    /* Ligar sem hora: a ligação do dia fica na Agenda (09:00 é a convenção do "sem hora") */
    await p.criarCompromisso({ tipo: 'follow_up', acao: 'ligar', quando: isoBRT(p.dia, '09:00') });
  }
  return { ordem, hubspot, remarcadas, avisoHubspot };
}

/** Tira do plano (o pino continua no mapa; parada feita não se tira). */
export async function tirarDoPlano(uid: string, clientId: string, dia: string): Promise<void> {
  await tirarDoDia(uid, dia, clientId);
}

// Quem mostra "onde está no plano" (o cartão do pino, a Agenda) relê quando o plano muda.
const ouvintes = new Set<() => void>();
export function aoMudarOPlano(f: () => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
export function avisarQueOPlanoMudou(): void { ouvintes.forEach((f) => { try { f(); } catch { /* um ouvinte não derruba os outros */ } }); }
