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
import { ehErroDeRede, enfileirar, novoAcaoId } from './filaOffline';

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
    /* A AGENDA DO APP: a reunião só depois da parada (se entrasse antes, o gatilho dela poria a
       parada sozinho e esta bateria na duplicata). Mover uma Demo com hora REMARCA a reunião. */
    const agenda = (async () => {
      if (!p.criarCompromisso) return;
      if (p.hora && (p.acao === 'reuniao' || p.acao === 'demo' || p.acao === 'ligar')) {
        const quando = isoBRT(p.dia, p.hora);
        const remarcou = p.antes && p.remarcarCompromisso ? await p.remarcarCompromisso({ de: p.antes.dia, quando }) : false;
        if (!remarcou) await p.criarCompromisso({ tipo: p.acao === 'ligar' ? 'follow_up' : 'reuniao', acao: p.acao, quando });
      } else if (!p.hora && p.acao === 'ligar') {
        /* Ligar sem hora: a ligação do dia fica na Agenda (09:00 é a convenção do "sem hora") */
        await p.criarCompromisso({ tipo: 'follow_up', acao: 'ligar', quando: isoBRT(p.dia, '09:00') });
      }
    })().catch((e) => { avisos.push(`a Agenda do app não gravou o compromisso (${String((e as Error)?.message ?? e)})`); });
    /* O HUBSPOT: a tarefa aberta vai junto ao mudar de dia ou de hora (Edge fila-tarefas, op
       remarcar); sem o que remarcar e com hora, nasce o próximo passo. Sem hora, nada novo. */
    const crm = (async () => {
      if (!p.client.id_hubspot) return;
      if (mudouDia || mudouHora) {
        try {
          const { data, error } = await supabase.functions.invoke('fila-tarefas', {
            body: { op: 'remarcar', dealId: String(p.client.id_hubspot), de: p.antes!.dia, para: p.dia, hora: p.hora },
          });
          if (error) throw error;
          remarcadas = Array.isArray((data as { remarcadas?: unknown[] })?.remarcadas) ? (data as { remarcadas: unknown[] }).remarcadas.length : 0;
        } catch (e) {
          avisos.push(`não remarquei a tarefa do HubSpot (${String((e as Error)?.message ?? e)})`);
        }
      }
      if (!p.hora) return;
      if (remarcadas > 0) { hubspot = `tarefa remarcada para ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} ${p.hora}`; return; }
      const corpo = { op: 'nota', tipoAcao: 'proximo-passo', dealId: String(p.client.id_hubspot), tipo: tipoDoPasso(p.acao),
        /* o servidor já prefixa o tipo ("Demo - "): o texto é só o nome */
        data: p.dia, hora: p.hora, texto: p.client.empresa?.trim() || p.client.nome };
      try {
        await negocioAcao(corpo);
        hubspot = `${a.hubspot} ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} ${p.hora}`;
      } catch (e) {
        if (ehErroDeRede(e)) {
          await enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', payload: { corpo }, rotulo: `Próximo passo · ${p.client.empresa?.trim() || p.client.nome}` });
          hubspot = 'na fila: sobe quando o sinal voltar';
        } else avisos.push(`o HubSpot recusou o próximo passo (${String((e as Error)?.message ?? e)})`);
      }
    })();
    await Promise.all([agenda, crm]);
    return { hubspot, remarcadas, avisos };
  })();
  return { ordem, depois };
}

/** Tira do plano (o pino continua no mapa; parada feita não se tira). */
export async function tirarDoPlano(uid: string, clientId: string, dia: string): Promise<void> {
  await tirarDoDia(uid, dia, clientId);
}

// Quem mostra "onde está no plano" (o cartão do pino, a Agenda) relê quando o plano muda.
const ouvintes = new Set<() => void>();
export function aoMudarOPlano(f: () => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
export function avisarQueOPlanoMudou(): void { ouvintes.forEach((f) => { try { f(); } catch { /* um ouvinte não derruba os outros */ } }); }
