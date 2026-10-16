// A FILA DO DINHEIRO (docs/10 §1, 03/10/2026) — a regra da aba Tarefas.
//
// Julyan: "eu quero uma reformulação na aba tarefas... o que fica melhor para o
// executivo?". A Agenda responde QUANDO e ONDE; Tarefas responde QUAL NEGÓCIO PRECISA
// DE MIM AGORA. Um card por negócio, ordenado por valor × urgência, nunca por data.
//
// Módulo PURO, sem import: a Edge Function `fila-tarefas` usa este arquivo e o teste
// (src/utils/filaDoDinheiro.teste.ts) roda o mesmo. Regra em Deno não se testa nesta
// casa — por isso a regra mora aqui e a função só busca os dados.

export type Grupo = 'agora' | 'proteger' | 'destravar' | 'reativar';
export type Verbo = 'Ligar' | 'Visitar' | 'WhatsApp' | 'Registrar';
export type Motivo =
  | 'venceu' | 'vence_hoje' | 'visita_sem_registro' | 'cobranca'
  | 'quente_sem_passo' | 'proposta_sem_retorno'
  | 'decisor' | 'poucos_contatos'
  | 'parado';

export type TarefaEntrada = {
  id: string;
  dealId: string | null;
  assunto: string;
  corpo?: string | null;
  /** ISO do HubSpot (hs_timestamp) ou null. */
  venceEm: string | null;
};

export type NegocioEntrada = {
  dealId: string;
  nome: string;
  etapaId: string;
  mrr: number | null;
  /** 0–100 (temperatura do robô) ou null. */
  temperatura: number | null;
  /** Dias corridos na etapa atual. */
  diasNaEtapa: number | null;
  pessoa: string | null;
  papel: string | null;
  /** Por que o título usa o negócio e não o contato (A2, handoff das abas 04/10/26). */
  tituloPorque?: string | null;
  temTelefone: boolean;
  clientId: string | null;
  lat: number | null;
  lng: number | null;
};

export type Contexto = {
  /** Hoje em Brasília, AAAA-MM-DD. */
  hoje: string;
  /** Agora em Brasília, HH:MM (para "vence hoje 14h" já passado). */
  agoraHHMM?: string;
  feriados: string[];
  /** dealId → quantos contatos e o último (ISO). */
  contatos: Record<string, { n: number; ultimo: string | null }>;
  /** Negócios em que alguém já falou com quem decide. */
  decisorAlcancado: string[];
  /** dealId → hora da visita de hoje já passada e sem registro ("10h"). */
  visitaHojeSemRegistro: Record<string, string>;
  /** dealId → hora na Agenda de hoje ("16h"): vira o selo "na agenda de hoje". */
  agendaHoje: Record<string, string>;
};

export type ItemFila = {
  dealId: string;
  clientId: string | null;
  grupo: Grupo;
  motivo: Motivo;
  porque: string;
  verbo: Verbo;
  pessoa: string | null;
  papel: string | null;
  tituloPorque: string | null;
  negocio: string;
  etapaId: string;
  temperatura: number | null;
  mrr: number | null;
  ultimoContato: string | null;
  contatos: number;
  /** AAAA-MM-DD do prazo da tarefa que comanda o card, ou null. */
  prazo: string | null;
  prazoTexto: string;
  venceu: boolean;
  agendaHoje: string | null;
  temTelefone: boolean;
  tarefaId: string | null;
  /** Visita/reunião: o registro não conclui a tarefa (só o Cheguei prova visita). */
  presencial: boolean;
  lat: number | null;
  lng: number | null;
  score: number;
};

export const ORDEM_GRUPOS: Grupo[] = ['agora', 'proteger', 'destravar', 'reativar'];
export const ROTULO_GRUPO: Record<Grupo, string> = {
  agora: 'Agora', proteger: 'Proteger os quentes', destravar: 'Destravar', reativar: 'Reativar',
};

const ETAPA = {
  prospeccao: '1395880469', visita: '1396005401', decisor: '1395880470', demo: '1395880471',
  negociacao: '1395880472', pagamento: '1395880473',
};
const ABERTAS = new Set(Object.values(ETAPA));
const QUENTE = 70;
const MINIMO_CONTATOS = 4;
const DIAS_PARADO = 14;
const DIAS_PROPOSTA = 3;

// ---- datas ------------------------------------------------------------------
const ehFimDeSemana = (d: string) => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w === 0 || w === 6; };
const mais = (d: string, n: number) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const ehDiaUtil = (d: string, feriados: string[] = []) => !ehFimDeSemana(d) && !feriados.includes(d);

/** `n` dias ÚTEIS depois de `de` (pula fim de semana e feriado). n ≥ 1. */
export function proximoDiaUtil(de: string, n: number, feriados: string[] = []): string {
  let d = de; let andados = 0;
  for (let i = 0; i < n * 3 + 15 && andados < Math.max(1, n); i++) { d = mais(d, 1); if (ehDiaUtil(d, feriados)) andados++; }
  return d;
}
/** Dias úteis entre duas datas (de < ate), contando `ate`. */
export function diasUteisEntre(de: string, ate: string, feriados: string[] = []): number {
  let n = 0; let d = de;
  for (let i = 0; i < 400 && d < ate; i++) { d = mais(d, 1); if (ehDiaUtil(d, feriados)) n++; }
  return n;
}
/** O que o pulo da data atravessou: "pula o fim de semana", "pula o feriado de 02/11" ou "em dia útil". */
export function oQuePulou(de: string, alvo: string, feriados: string[] = []): string {
  let fds = false; let feriado: string | null = null; let d = de;
  for (let i = 0; i < 60 && d < alvo; i++) {
    d = mais(d, 1);
    if (d === alvo) break;
    if (feriados.includes(d) && !ehFimDeSemana(d)) feriado = feriado ?? d;
    else if (ehFimDeSemana(d)) fds = true;
  }
  if (feriado) return `pula o feriado de ${feriado.slice(8, 10)}/${feriado.slice(5, 7)}`;
  return fds ? 'pula o fim de semana' : 'em dia útil';
}

const diaDe = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  return new Date(t.getTime() - 3 * 3600000).toISOString().slice(0, 10);
};
const horaDe = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  const b = new Date(t.getTime() - 3 * 3600000);
  const h = b.getUTCHours(); const m = b.getUTCMinutes();
  // 00:00 e 09:00/12:00 cravados pelo HubSpot sem hora escolhida não viram "14h"
  if ((h === 0 || h === 9 || h === 12) && m === 0) return null;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};
const diasEntre = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 86400000);

export function textoUltimoContato(ultimo: string | null, hoje: string): string {
  const d = diaDe(ultimo);
  if (!d) return 'sem contato registrado';
  const n = diasEntre(d, hoje);
  if (n <= 0) { const h = horaDe(ultimo); return h ? `contato hoje ${h}` : 'contato hoje'; }
  if (n === 1) return 'contato há 1 dia';
  return `contato há ${n} dias`;
}

function prazoTexto(dia: string | null, hora: string | null, ctx: Contexto): { texto: string; venceu: boolean; peso: number } {
  if (!dia) return { texto: 'sem prazo', venceu: false, peso: 1.2 };
  const n = diasEntre(ctx.hoje, dia);
  if (n < 0) return { texto: n === -1 ? 'venceu ontem' : `venceu há ${-n} dias`, venceu: true, peso: 3 };
  if (n === 0) return { texto: hora ? `vence hoje ${hora}` : 'vence hoje', venceu: false, peso: 2 };
  if (dia === proximoDiaUtil(ctx.hoje, 1, ctx.feriados) || n === 1) return { texto: 'vence amanhã', venceu: false, peso: 1.5 };
  return { texto: `vence ${dia.slice(8, 10)}/${dia.slice(5, 7)}`, venceu: false, peso: 1 };
}

// ---- tipo da tarefa ------------------------------------------------------------
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function tipoDaTarefa(t: Pick<TarefaEntrada, 'assunto' | 'corpo'>): 'visita' | 'reuniao' | 'whatsapp' | 'cobranca' | 'ligar' {
  const a = norm(`${t.assunto} ${t.corpo ?? ''}`);
  if (/^\s*visita\b/.test(norm(t.assunto)) || /:visita:/.test(a)) return 'visita';
  if (/^\s*reuniao\b|^\s*demo\b|:reuniao:/.test(a)) return 'reuniao';
  if (/whats|wpp|zap\b/.test(a)) return 'whatsapp';
  if (/cobran|boleto|pagamento|asaas/.test(a)) return 'cobranca';
  return 'ligar';
}

// ---- os textos do porquê (o mapa no servidor) -----------------------------------
type Fatos = { assunto?: string; quando?: string; hora?: string; dias?: number; n?: number };
const curto = (s: string, max = 60) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);
export const PORQUE: Record<Motivo, (f: Fatos) => string> = {
  venceu: (f) => `Combinou retorno ${f.quando} e ainda não falou`,
  vence_hoje: (f) => `Follow-up de hoje: ${curto((f.assunto ?? '').replace(/^\s*(ligar|follow[- ]?up|retorno)\s*[-:·]\s*/i, '') || 'próximo contato')}`,
  visita_sem_registro: (f) => `Visita das ${f.hora} ainda sem registro`,
  cobranca: (f) => `Cobrança vence ${f.quando} e ainda não houve contato`,
  quente_sem_passo: () => 'Quente e sem próximo passo marcado',
  proposta_sem_retorno: (f) => `Proposta enviada há ${f.dias} dias, sem retorno`,
  decisor: () => 'Ainda não falou com quem decide',
  poucos_contatos: (f) => `Só ${f.n} de 4 contatos antes de desistir`,
  parado: (f) => `Sem contato há ${f.dias} dias`,
};

// ---- a fila --------------------------------------------------------------------
/**
 * Um registro por negócio aberto que precisa de ação. Negócio com próximo passo
 * marcado para depois de hoje (e nada vencido) NÃO entra: ele já tem plano.
 * Se o negócio tem várias tarefas abertas, comanda a mais urgente (a de prazo mais cedo).
 */
export function montarFila(negocios: NegocioEntrada[], tarefas: TarefaEntrada[], ctx: Contexto): ItemFila[] {
  const porNegocio = new Map<string, TarefaEntrada[]>();
  for (const t of tarefas) {
    if (!t.dealId) continue;
    const l = porNegocio.get(t.dealId) ?? [];
    l.push(t); porNegocio.set(t.dealId, l);
  }
  const decisor = new Set(ctx.decisorAlcancado);
  const amanhaUtil = proximoDiaUtil(ctx.hoje, 1, ctx.feriados);
  const vistos = new Set<string>();
  const itens: ItemFila[] = [];

  for (const n of negocios) {
    if (!ABERTAS.has(n.etapaId) || vistos.has(n.dealId)) continue;
    vistos.add(n.dealId);
    const abertas = (porNegocio.get(n.dealId) ?? []).slice().sort((a, b) =>
      (a.venceEm ? Date.parse(a.venceEm) : Infinity) - (b.venceEm ? Date.parse(b.venceEm) : Infinity));
    const t = abertas[0] ?? null;
    const diaT = t ? diaDe(t.venceEm) : null;
    const horaT = t ? horaDe(t.venceEm) : null;
    const tipoT = t ? tipoDaTarefa(t) : null;
    const c = ctx.contatos[n.dealId] ?? { n: 0, ultimo: null };
    const diaUltimo = diaDe(c.ultimo);
    const diasSemContato = diaUltimo ? diasEntre(diaUltimo, ctx.hoje) : null;
    const temPassoFuturo = !!diaT && diaT > ctx.hoje;

    let grupo: Grupo | null = null; let motivo: Motivo | null = null; const f: Fatos = {};
    if (diaT && diaT < ctx.hoje) {
      grupo = 'agora'; motivo = 'venceu';
      const atraso = diasEntre(diaT, ctx.hoje);
      f.quando = atraso === 1 ? 'ontem' : `há ${atraso} dias`;
    } else if (diaT === ctx.hoje) {
      grupo = 'agora'; motivo = tipoT === 'cobranca' ? 'cobranca' : 'vence_hoje'; f.assunto = t?.assunto; f.quando = 'hoje';
    } else if (ctx.visitaHojeSemRegistro[n.dealId]) {
      grupo = 'agora'; motivo = 'visita_sem_registro'; f.hora = ctx.visitaHojeSemRegistro[n.dealId];
    } else if (n.etapaId === ETAPA.pagamento && diaT && diaT <= amanhaUtil) {
      grupo = 'agora'; motivo = 'cobranca'; f.quando = 'amanhã';
    } else if (!temPassoFuturo && (n.temperatura ?? 0) >= QUENTE && !t) {
      grupo = 'proteger'; motivo = 'quente_sem_passo';
    } else if (!temPassoFuturo && n.etapaId === ETAPA.demo && (n.diasNaEtapa ?? 0) >= DIAS_PROPOSTA) {
      grupo = 'proteger'; motivo = 'proposta_sem_retorno'; f.dias = n.diasNaEtapa ?? DIAS_PROPOSTA;
    } else if (!temPassoFuturo && !decisor.has(n.dealId) && (n.etapaId === ETAPA.prospeccao || n.etapaId === ETAPA.visita)) {
      grupo = 'destravar'; motivo = 'decisor';
    } else if (!temPassoFuturo && c.n < MINIMO_CONTATOS) {
      grupo = 'destravar'; motivo = 'poucos_contatos'; f.n = c.n;
    } else if (!temPassoFuturo && diasSemContato != null && diasSemContato >= DIAS_PARADO) {
      grupo = 'reativar'; motivo = 'parado'; f.dias = diasSemContato;
    }
    if (!grupo || !motivo) continue;

    const presencial = tipoT === 'visita' || tipoT === 'reuniao';
    let verbo: Verbo = motivo === 'visita_sem_registro' ? 'Registrar'
      : tipoT === 'visita' ? 'Visitar' : tipoT === 'whatsapp' ? 'WhatsApp' : 'Ligar';
    if (!n.temTelefone && (verbo === 'Ligar' || verbo === 'WhatsApp')) verbo = 'Visitar';

    const prazoDia = motivo === 'visita_sem_registro' ? ctx.hoje : diaT;
    const p = prazoTexto(prazoDia, motivo === 'visita_sem_registro' ? null : horaT, ctx);
    itens.push({
      dealId: n.dealId, clientId: n.clientId, grupo, motivo, porque: PORQUE[motivo](f), verbo,
      pessoa: n.pessoa, papel: n.papel, tituloPorque: n.tituloPorque ?? null, negocio: n.nome, etapaId: n.etapaId, temperatura: n.temperatura,
      mrr: n.mrr, ultimoContato: c.ultimo, contatos: Math.min(MINIMO_CONTATOS, c.n),
      prazo: prazoDia, prazoTexto: p.texto, venceu: p.venceu,
      agendaHoje: ctx.agendaHoje[n.dealId] ?? null, temTelefone: n.temTelefone,
      tarefaId: t?.id ?? null, presencial, lat: n.lat, lng: n.lng,
      score: (n.mrr && n.mrr > 0 ? n.mrr : 100) * p.peso,
    });
  }
  return itens.sort((a, b) =>
    ORDEM_GRUPOS.indexOf(a.grupo) - ORDEM_GRUPOS.indexOf(b.grupo) || b.score - a.score || a.negocio.localeCompare(b.negocio));
}

/** O contato do CRM só vira título quando é confiável (A2, handoff das abas 04/10/26): tem
 *  letra, não repete o negócio, não é o dono da conta e tem papel (Dono, Sócio, Gerente).
 *  Fora disso o título usa o negócio, e `porque` diz o motivo quando há algo a explicar. */
export function pessoaDoCard(contato: string | null | undefined, negocio: string, dono: string | null | undefined, papel: string | null | undefined):
  { pessoa: string | null; porque: string | null } {
  const c = (contato ?? '').trim();
  if (!c) return { pessoa: null, porque: null };
  const baixo = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const primeiro = c.split(/\s+/)[0];
  const cita = `contato no CRM: "${c.length > 24 ? c.slice(0, 23) + '…' : c}"`;
  if (!/[A-Za-zÀ-ÿ]/.test(c)) return { pessoa: null, porque: `${cita} · sem nome` };
  const n = baixo(negocio);
  const d = baixo((dono ?? '').split(/\s+/)[0] ?? '');
  if (d && baixo(primeiro) === d) return { pessoa: null, porque: `${cita} · igual ao dono da conta` };
  if (baixo(c) === n || n.startsWith(baixo(c) + ' ') || baixo(primeiro) === n) return { pessoa: null, porque: `${cita} · igual ao negócio` };
  if (!papel || !papel.trim()) return { pessoa: primeiro, porque: `contato: ${primeiro}` };
  return { pessoa: primeiro, porque: null };
}

/** A frase do card: "Ligar para Ana (sócia)", "Registrar visita · Joana (dona)". Sem papel,
 *  o contato não é confiável e o título usa o negócio ("Visitar Julyan House"). */
export function tituloDoCard(i: Pick<ItemFila, 'verbo' | 'pessoa' | 'papel' | 'negocio'>): string {
  const quem = i.pessoa && i.papel ? `${i.pessoa} (${i.papel.toLowerCase()})` : i.negocio;
  if (i.verbo === 'Registrar') return `Registrar visita · ${quem}`;
  if (i.verbo === 'WhatsApp') return `WhatsApp para ${quem}`;
  if (i.verbo === 'Visitar') return `Visitar ${quem}`;
  return `Ligar para ${quem}`;
}

/** Feriados nacionais de um ano (fixos + móveis pela Páscoa). */
export function feriadosNacionais(ano: number): string[] {
  // Páscoa (algoritmo de Meeus/Jones/Butcher)
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((x) => `${ano}-${x}`);
  return [...fixos, mais(pascoa, -48), mais(pascoa, -47), mais(pascoa, -2), mais(pascoa, 60)].sort();
}
