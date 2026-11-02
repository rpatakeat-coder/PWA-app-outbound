// HOJE v3 NO APP (handoff de 01/11/26): o que liga as fontes que o app já lê ao dia montado em
// _compartilhado/hojeV3.ts. Aqui não nasce número: o plano é o de field_route_stops, a prova é a de
// visitas_com_prova (0143, a mesma do Cockpit), o "sem próximo passo" é o da fila (semProximoPassoDaFila),
// o placar, a sequência e a missão são os de desenvolvimento_quadro() (0240).
//
// A VOLTA AO ANTERIOR: localStorage['hoje-v2'] = '1' desliga a folha da manhã nova, a pílula, os toasts e o
// fecho novo no aparelho (a mesma chave que devolve o Hoje anterior no Cockpit). O dia volta a ser o de
// antes: a FolhaPlanoDoDia e a FolhaFechoDoDia da espinha do dia.
import { supabase } from '../integrations/supabase/client';
import type { Quadro } from '../../supabase/functions/_compartilhado/desenvolvimentoV2';
import {
  DIAS, diaCurto, dow, ordemPorDinheiro, semProximoPassoDaFila, sugestoes,
  type DiaSug, type EntradaDoDia, type LeadSug, type LinhaSemPasso, type Parada,
} from '../../supabase/functions/_compartilhado/hojeV3';
import { negocioAcao } from './negocioAcao';
import { porNoPlano } from './planoDoPino';
import type { Client } from '../types/client';

export function hojeV3Ligado(): boolean {
  try { return typeof window === 'undefined' || window.localStorage.getItem('hoje-v2') !== '1'; } catch { return true; }
}

/** "sex 13": o rótulo curto dos chips e do toast ("Passo em sex 13 · salvo no HubSpot"). */
export const rotuloCurto = (iso: string) => DIAS[dow(iso)] + ' ' + Number(String(iso).slice(8, 10));

/** O nome do feriado nacional ("Sem expediente hoje · Feriado · Consciência Negra"), ou null. */
export function nomeDoFeriado(iso: string, feriados: string[]): string | null {
  if (feriados.indexOf(iso) < 0) return null;
  const fixos: Record<string, string> = {
    '01-01': 'Confraternização', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '09-07': 'Independência', '10-12': 'Nossa Senhora Aparecida',
    '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal',
  };
  if (fixos[iso.slice(5)]) return fixos[iso.slice(5)];
  /* os que saem da Páscoa, pelo dia da semana: carnaval é segunda e terça, a Paixão é sexta, Corpus Christi é quinta */
  const w = new Date(iso + 'T12:00:00Z').getUTCDay();
  return w === 5 ? 'Sexta-feira Santa' : w === 4 ? 'Corpus Christi' : 'Carnaval';
}

/* ── a medição (README §7), em aberturas_de_tela ──────────────────────────────────────────────── */
export type TelaHoje = 'folha_manha' | 'toast_pos_visita' | 'fecho_dia';
export type AcaoHoje = 'vista' | 'ir_para_rua' | 'depois' | 'fechada_sem_acao' | 'passo_marcado' | 'marcou_passo' | 'ignorou' | 'aberto' | 'fechado' | 'fechado_com_pendencia';
export type OrigemHoje = 'app' | 'push_08' | 'push_18';
/** Fogo e esquece: a medição nunca derruba a tela (sem a 0241 aplicada, o banco recusa e nada acontece). */
export function registrarHoje(tela: TelaHoje, acao: AcaoHoje, origem: OrigemHoje = 'app'): void {
  void Promise.resolve(supabase.rpc('registrar_abertura', { p_tela: tela, p_origem: origem, p_acao: acao })).then(() => undefined, () => undefined);
}

/* ── o push das 8h e o das 18h abrem o app com ?hoje=manha | ?hoje=fecho ─────────────────────── */
export function lerHojeDaUrl(href: string): 'manha' | 'fecho' | null {
  try {
    const v = new URL(href).searchParams.get('hoje');
    return v === 'manha' || v === 'fecho' ? v : null;
  } catch { return null; }
}
export function limparHojeDaUrl() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('hoje')) return;
    u.searchParams.delete('hoje');
    window.history.replaceState(window.history.state, '', u.pathname + (u.search ? u.search : '') + u.hash);
  } catch { /* sem history */ }
}

/* ── marcar o passo em 1 toque: a tarefa no HubSpot ANTES de qualquer gravação local ─────────────
   O corpo é o de sempre da porta única (op nota / proximo-passo, o mesmo da ficha e da fila). Com
   visita (o "Pôr em" da folha da manhã), a parada entra no plano DEPOIS que o HubSpot aceitou, e sem
   hora: porNoPlano não manda outro próximo passo (pedidoCrm só vai com hora ou mudança de dia). */
export async function marcarPassoRapido(o: { dealId: string; nome: string; iso: string; visita?: { uid: string; clientId: string } | null }): Promise<void> {
  await negocioAcao({
    op: 'nota', tipoAcao: 'proximo-passo', dealId: o.dealId, data: o.iso,
    tipo: o.visita ? 'visita' : 'follow-up', texto: o.visita ? 'Visita' : 'Ligar',
  });
  if (o.visita) {
    const cli = { id: o.visita.clientId, nome: o.nome, empresa: o.nome } as unknown as Client;
    await porNoPlano({ uid: o.visita.uid, client: cli, dia: o.iso, acao: 'follow', hora: null, antes: null });
  }
}

/* ── as fontes, no formato que a montagem entende ──────────────────────────────────────────────── */
export type ItemDaFilaV3 = {
  dealId: string; clientId: string | null; negocio: string; etapaId: string; motivo: string; venceu: boolean; grupo: string;
  prazo: string | null; horaPrazo?: string | null; verbo?: string; diasNaEtapa?: number | null; lat: number | null; lng: number | null;
};
export type VisitaV3 = { client_id: string | null; dia: string; provada: boolean; distancia_m: number | null; visited_at: string };
export type ParadaDoApp = { clientId: string; dealId: string | null; nome: string; etapa: string | null; status: string; hora: string | null; bairro: string | null; lat: number | null; lng: number | null };

const ETAPAS = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473'];
export const etapaIdxDe = (etapaId: string | null | undefined) => Math.max(0, ETAPAS.indexOf(String(etapaId ?? '')));
/** A chave do bairro: o texto, sem acento e sem caixa (o que o app tem do bairro é o texto do cadastro). */
export const chaveBairro = (b: string | null | undefined) => {
  const t = String(b ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return t ? 'b:' + t : null;
};
const verboCurto = (v: string | undefined) => (v === 'WhatsApp' ? 'WhatsApp' : String(v || 'Ligar').toLowerCase());
const metros = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, R = 6371000;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** O dia sugerido para cada lead sem passo (a regra do Planejamento v3, nos 5 dias úteis a partir de hoje). */
export function sugerirDias(o: {
  dias: Array<{ iso: string; hoje: boolean }>; cont: Record<string, number>; bairrosDoDia: Record<string, Array<string | null>>;
  leads: Array<{ dealId: string; nome: string; etapaIdx: number; bairro: string | null; semEnd: boolean }>; antesDas10: boolean; meta: number;
}): Record<string, { dia: string; mesmo: boolean; iso: string }> {
  const dias: DiaSug[] = o.dias.map((d) => ({ iso: d.iso, feriado: '', passou: false, hoje: d.hoje }));
  const maisComum = (xs: Array<string | null>) => {
    const n: Record<string, number> = {};
    xs.forEach((x) => { if (x) n[x] = (n[x] || 0) + 1; });
    return Object.keys(n).sort((a, b) => n[b] - n[a])[0] ?? null;
  };
  const fila: LeadSug[] = o.leads.map((l) => ({ ref: l.dealId, nome: l.nome, etapaIdx: l.etapaIdx, bairro: chaveBairro(l.bairro), semEnd: l.semEnd, quente: l.etapaIdx >= 2 }));
  const s = sugestoes({
    meta: o.meta, dias, cont: dias.map((d) => o.cont[d.iso] ?? 0), bDia: dias.map((d) => maisComum(o.bairrosDoDia[d.iso] ?? [])),
    bSel: dias.map(() => null), fila, antesDas10: o.antesDas10,
  });
  const out: Record<string, { dia: string; mesmo: boolean; iso: string }> = {};
  Object.keys(s.deLead).forEach((ref) => { const x = s.deLead[ref]; out[ref] = { dia: diaCurto(dias[x.dia].iso), mesmo: x.mesmo, iso: dias[x.dia].iso }; });
  return out;
}

/** A lista "sem próximo passo" da fila, na ordem por dinheiro (a da folha da manhã e do Planejamento). */
export function semPassoPorDinheiro(fila: ItemDaFilaV3[]): ItemDaFilaV3[] {
  const ids = new Set(semProximoPassoDaFila(fila).ids);
  const lista = fila.filter((i) => ids.has(String(i.dealId))).map((i) => ({
    i, nome: i.negocio, etapaIdx: etapaIdxDe(i.etapaId), dias: i.diasNaEtapa ?? 0, venc: i.motivo === 'venceu' ? 'venceu' : null,
  }));
  return ordemPorDinheiro(lista).map((x) => x.i);
}

export function montarEntradaDoDia(o: {
  hoje: string; agora: string; util: boolean; feriado: string | null; nome: string | null; meta: number;
  paradas: ParadaDoApp[] | null; visitas: VisitaV3[] | null; fila: ItemDaFilaV3[] | null;
  sugestao: Record<string, { dia: string; mesmo: boolean }>; feitos: Record<string, string>;
  quadro: Quadro | null; ontem: { dia: string; fechou: boolean | null } | null; propostas: number;
  aqui: { lat: number; lng: number } | null;
}): EntradaDoDia {
  const deHoje = (o.visitas ?? []).filter((v) => v.dia === o.hoje);
  const provada = new Set(deHoje.filter((v) => v.provada).map((v) => String(v.client_id)));
  const visitada = new Set(deHoje.map((v) => String(v.client_id)));
  const fila = o.fila;
  const vencePorDeal: Record<string, string> = {};
  (fila ?? []).forEach((i) => { if (i.motivo === 'vence_hoje' && i.prazo === o.hoje) vencePorDeal[i.dealId] = verboCurto(i.verbo) + (i.horaPrazo ? ' ' + i.horaPrazo : ''); });
  const depoisDas18 = o.agora >= '18:00';
  let primeiraPendente = true;
  const paradas: Parada[] | null = o.paradas == null ? null : o.paradas.map((p) => {
    const estado = provada.has(p.clientId) ? 'com_prova' : visitada.has(p.clientId) || p.status === 'done' ? 'sem_prova' : depoisDas18 ? 'nao_visitada' : 'pendente';
    const ehProx = estado === 'pendente' && primeiraPendente;
    if (ehProx) primeiraPendente = false;
    return {
      id: p.clientId, nome: p.nome, etapa: p.etapa, hora: p.hora, estado,
      venceHoje: p.dealId ? vencePorDeal[p.dealId] ?? null : null,
      metros: ehProx && o.aqui && p.lat != null && p.lng != null ? Math.round(metros(o.aqui, { lat: p.lat, lng: p.lng })) : null,
    };
  });
  const vencemHoje = (fila ?? []).filter((i) => i.motivo === 'vence_hoje' && i.prazo === o.hoje)
    .map((i) => ({ acao: verboCurto(i.verbo), nome: i.negocio, hora: i.horaPrazo ?? null }));
  const conta = fila ? semProximoPassoDaFila(fila) : null;
  const semIds = new Set(conta ? conta.ids : []);
  const top: LinhaSemPasso[] = fila ? semPassoPorDinheiro(fila).slice(0, 3).map((i) => ({
    id: i.dealId, nome: i.negocio, etapaIdx: etapaIdxDe(i.etapaId), quente: etapaIdxDe(i.etapaId) >= 2,
    venc: i.motivo === 'venceu' && i.prazo ? 'venceu ' + diaCurto(i.prazo) : null,
    sugestao: o.sugestao[i.dealId] ? { dia: o.sugestao[i.dealId].dia, mesmo: o.sugestao[i.dealId].mesmo } : null,
    feito: o.feitos[i.dealId] ?? null,
  })) : [];
  /* o fecho: visitadas hoje que seguem sem próximo passo (ou com o Cheguei sem Como foi) */
  const pendentesFecho = (fila ?? []).filter((i) => i.clientId && visitada.has(String(i.clientId)) && (semIds.has(i.dealId) || i.motivo === 'visita_sem_registro'))
    .map((i) => ({ id: i.dealId, nome: i.negocio }));
  /* ontem sem fechar: os visitados ontem que seguem sem passo hoje */
  const visOntem = new Set((o.visitas ?? []).filter((v) => o.ontem && v.dia === o.ontem.dia).map((v) => String(v.client_id)));
  const ontemPend = o.ontem && o.ontem.fechou === false
    ? (fila ?? []).filter((i) => i.clientId && visOntem.has(String(i.clientId)) && semIds.has(i.dealId)).map((i) => ({ id: i.dealId, nome: i.negocio }))
    : [];
  const S = o.quadro && !o.quadro.erro ? o.quadro.semana : null;
  const M = o.quadro && !o.quadro.erro ? o.quadro.missao : null;
  const Q = o.quadro && !o.quadro.erro ? o.quadro.sequencias : null;
  return {
    hoje: o.hoje, agora: o.agora, feriado: o.feriado, util: o.util, nome: o.nome, meta: o.meta,
    bairro: o.paradas && o.paradas[0] ? o.paradas[0].bairro : null,
    paradas, vencemHoje, semPasso: conta ? conta.total : null, topSemPasso: top,
    placar: S ? { pts: S.pts, pos: S.pos, acima: S.acima ? { nome: S.acima.nome, pts: S.acima.pts } : null } : null,
    sequencia: Q ? Q.rua.atual : null,
    missao: M ? { n: M.n, alvo: M.alvo, cumprida: !!M.cumpridaEm } : null,
    ontem: o.ontem && ontemPend.length ? { dia: o.ontem.dia, pendentes: ontemPend } : null,
    fechouOntem: o.ontem ? o.ontem.fechou : null,
    pendentesFecho, propostas: o.propostas,
  };
}
