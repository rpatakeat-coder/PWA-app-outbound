// HOJE v3 · O DIA QUE O EXECUTIVO USA DE VERDADE (handoff de 01/11/26, design_handoff_hoje_v3).
//
// "Vamos refazer a aba Hoje? Será que estão usando de verdade? Preciso que eles usem isso." Em 30 dias:
// 548 check-ins, 1 fecho do dia e 2,6% das paradas vindas do Cockpit. O executivo vive no mapa do app,
// então o dia vai até ele em 3 momentos (manhã, durante, fim) e o Hoje do Cockpit vira espelho.
//
// POR QUE ESTE ARQUIVO. A regra 1 do handoff é "uma função por número, usada no app e no Cockpit". Os dois
// repositórios não importam um do outro, então a prova é a mesma do Desenvolvimento v2: esta montagem (o
// texto da pílula, da folha, do fecho, dos toasts e dos pushes, e os 3 blocos do Hoje do Cockpit) existe
// aqui em TS e no HJ3 do gv2-js do Cockpit, e as duas suítes formatam a MESMA fixture
// (src/utils/hojeV3.fixture.json = scripts/fixtures/hoje-v3/fixture.json) e comparam com a MESMA saída
// esperada. Se um lado mudar uma frase ou uma conta e o outro não, uma das suítes cai.
//
// Módulo PURO, sem import de tela, banco ou relógio: tudo chega por argumento. A Edge push-fila usa os
// textos dos pushes daqui; a folha da manhã, a pílula, os toasts e o fecho do app também.
//
// O que mora aqui:
//   · semProximoPassoDaFila: "Sem próximo passo" = o passo que venceu + o que nunca teve passo, Ag.
//     Pagamento fora. É o número da aba Tarefas, da folha da manhã e do push das 8h, e é o mesmo do
//     GV2.semProximoPasso do Cockpit (a suíte prova com negócios e tarefas de verdade, pela montarFila);
//   · sugestoes: o atalho "+ Pôr em qui 12/11 · sugerido", a MESMA regra do PLV3.sugestoes do
//     Planejamento v3 (porta linha a linha; a suíte do Cockpit roda a original sobre a mesma fixture);
//   · chipsDeDia: amanhã · sex 13 · seg 16 (os próximos dias úteis, feriado pulado);
//   · diaDoExecutivo: o dia inteiro em texto, a partir do que as fontes já dão.

export type EstadoParada = 'pendente' | 'com_prova' | 'sem_prova' | 'nao_visitada';
export type Parada = {
  id: string; nome: string; etapa: string | null; hora: string | null; estado: EstadoParada;
  /** "ligar 12:30" quando a conta tem um passo que vence hoje */
  venceHoje: string | null;
  /** distância até a porta, em metros (só a próxima porta usa) */
  metros: number | null;
};
export type LinhaSemPasso = {
  id: string; nome: string; etapaIdx: number; quente: boolean;
  /** "venceu ter 10/11" quando o passo marcado venceu sem ser feito */
  venc: string | null;
  /** o atalho do Planejamento v3: o dia sugerido ("qui 12/11") e se é o mesmo bairro do dia */
  sugestao: { dia: string; mesmo: boolean } | null;
  /** "passo em qui 12/11 · salvo" depois do toque */
  feito: string | null;
};
export type EntradaDoDia = {
  hoje: string;
  agora: string;
  /** nome do feriado de hoje, ou null */
  feriado: string | null;
  /** dia útil (falso no fim de semana e no feriado) */
  util: boolean;
  nome: string | null;
  meta: number;
  /** o bairro do dia (o da 1ª parada) */
  bairro: string | null;
  /** null = o plano não respondeu (a tela diz "—" e o nome da fonte, nunca 0) */
  paradas: Parada[] | null;
  vencemHoje: Array<{ acao: string; nome: string; hora: string | null }>;
  /** o número da regra única; null = a fila não respondeu */
  semPasso: number | null;
  topSemPasso: LinhaSemPasso[];
  /** o placar da semana (desenvolvimento_quadro().semana): pts, posição e quem está logo acima */
  placar: { pts: number; pos: number | null; acima: { nome: string; pts: number } | null } | null;
  sequencia: number | null;
  missao: { n: number; alvo: number; cumprida: boolean } | null;
  /** ontem ficou sem fechar: os visitados ontem que seguem sem próximo passo */
  ontem: { dia: string; pendentes: Array<{ id: string; nome: string }> } | null;
  fechouOntem: boolean | null;
  /** visitadas hoje que seguem sem próximo passo (o fecho) */
  pendentesFecho: Array<{ id: string; nome: string }>;
  /** quantas portas o "Montar o dia" proporia, sem plano */
  propostas: number;
  /** visitas COM PROVA de hoje FORA do plano (auditoria do servidor, 02/11/26). O "X de 6 com prova" é a
   *  meta de visita do dia, não do plano: a porta provada que não estava na Agenda conta, como o Cockpit
   *  passa a contar dv5.fora. Ausente/null = 0 (a entrada de antes dá a mesma saída). */
  foraComProva?: number | null;
};

export const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dia = (iso: string) => String(iso || '').slice(0, 10);
export const dow = (iso: string) => new Date(dia(iso) + 'T12:00:00Z').getUTCDay();
export const ddmm = (iso: string) => dia(iso).slice(8, 10) + '/' + dia(iso).slice(5, 7);
export const diaCurto = (iso: string) => DIAS[dow(iso)] + ' ' + ddmm(iso);
export const somaDias = (iso: string, n: number) => { const d = new Date(dia(iso) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const pl = (n: number, um: string, varios: string) => n + ' ' + (n === 1 ? um : varios);
const util = (iso: string, feriados: string[]) => { const w = dow(iso); return w > 0 && w < 6 && feriados.indexOf(iso) < 0; };

// ── 1 · Sem próximo passo: um número só ─────────────────────────────────────────────────────────
/** O item da fila (fila-tarefas) no que a regra precisa: o motivo, a seção e a etapa. */
export type ItemParaContar = { motivo: string; venceu: boolean; grupo: string; etapaId: string; dealId?: string };
export const ETAPA_PAGAMENTO = '1395880473';
/**
 * "Sem próximo passo" = nada marcado de hoje em diante: o passo que venceu (motivo 'venceu') + o negócio
 * sem passo nenhum (a seção sem_passo da fila), com Ag. Pagamento fora (quem age ali é o financeiro). O
 * Cheguei sem Como foi (visita_sem_registro) é trabalho de hoje, não "sem passo". É a regra que a aba
 * Tarefas usa desde a auditoria de 01/11/26, agora num lugar só para a folha da manhã e o push das 8h.
 */
export function semProximoPassoDaFila(itens: ItemParaContar[]): { total: number; vencido: number; nunca: number; ids: string[] } {
  const fora = (i: ItemParaContar) => i.etapaId !== ETAPA_PAGAMENTO;
  const secao = (i: ItemParaContar) => (i.venceu || i.motivo === 'visita_sem_registro' ? 'atrasados' : i.grupo === 'agora' ? 'hoje' : 'sem_passo');
  const venc = (itens || []).filter((i) => i.motivo === 'venceu' && fora(i));
  const nunca = (itens || []).filter((i) => secao(i) === 'sem_passo' && i.motivo !== 'visita_sem_registro' && fora(i));
  return { total: venc.length + nunca.length, vencido: venc.length, nunca: nunca.length, ids: venc.concat(nunca).map((i) => String(i.dealId ?? '')) };
}

// ── 2 · a sugestão de dia: a regra do Planejamento v3 (PLV3.sugestoes), linha a linha ─────────────
export type DiaSug = { iso: string; feriado: string; passou: boolean; hoje: boolean };
export type LeadSug = { ref: string; nome: string; etapaIdx: number; bairro: string | null; semEnd: boolean; quente: boolean };
export type EntradaSug = {
  meta: number; dias: DiaSug[]; cont: number[]; bDia: Array<string | null>; bSel: Array<string | null>;
  usados?: Record<string, number | boolean>; fila: LeadSug[]; alvos?: LeadSug[]; antesDas10: boolean; revisando?: boolean;
};
export type SaidaSug = {
  porDia: Record<number, Array<{ ref: string; nome: string; etapaIdx: number; bairro: string | null; origem: string; mesmo: boolean }>>;
  deLead: Record<string, { dia: number; mesmo: boolean }>;
  quentesSem: LeadSug[];
  elegiveis: number[];
};
export const elegivel = (d: DiaSug | undefined, antesDas10: boolean) => !!d && !d.feriado && !d.passou && (!d.hoje || !!antesDas10);
/**
 * Os dias com vaga recebem, nesta ordem: 1. os quentes sem passo (o dia do mesmo bairro; senão o 1º dia
 * com vaga em automático), sem limite de 3; 2. os outros sem passo, só no mesmo bairro, até 3 por dia;
 * 3. as contas-alvo, só no mesmo bairro, até 3 por dia. Conta sem endereço nunca é sugerida para visita.
 */
export function sugestoes(o: EntradaSug): SaidaSug {
  const meta = Number(o.meta) || 6;
  const dias = o.dias || [];
  const cont = o.cont || [];
  const bDia = o.bDia || [];
  const bSel = o.bSel || [];
  const usados = o.usados || {};
  const elig = o.revisando ? [] : dias.map((d, i) => (elegivel(d, o.antesDas10) ? i : -1)).filter((i) => i >= 0);
  const livre: Record<number, number> = {};
  const porDia: SaidaSug['porDia'] = {};
  const deLead: SaidaSug['deLead'] = {};
  dias.forEach((_d, i) => { porDia[i] = []; });
  elig.forEach((i) => { livre[i] = Math.max(0, meta - (Number(cont[i]) || 0)); });
  const pegar = (l: LeadSug, i: number, origem: string) => {
    porDia[i].push({ ref: l.ref, nome: l.nome, etapaIdx: l.etapaIdx, bairro: l.bairro, origem, mesmo: bDia[i] === l.bairro });
    livre[i]--;
    deLead[l.ref] = { dia: i, mesmo: bDia[i] === l.bairro };
  };
  const cand = (o.fila || []).filter((l) => l && !l.semEnd && l.bairro && !usados[l.ref]);
  const quentesSem: LeadSug[] = [];
  cand.filter((l) => l.quente).forEach((l) => {
    let i: number | undefined = elig.filter((j) => livre[j] > 0 && bDia[j] === l.bairro)[0];
    if (i === undefined) i = elig.filter((j) => livre[j] > 0 && !bSel[j])[0];
    if (i === undefined) { quentesSem.push(l); return; }
    pegar(l, i, 'quente');
  });
  cand.filter((l) => !l.quente).forEach((l) => {
    const i = elig.filter((j) => livre[j] > 0 && bDia[j] === l.bairro && porDia[j].length < 3)[0];
    if (i !== undefined) pegar(l, i, 'fila');
  });
  (o.alvos || []).filter((a) => a && !a.semEnd && a.bairro && !usados[a.ref] && !deLead[a.ref]).forEach((a) => {
    const i = elig.filter((j) => livre[j] > 0 && bDia[j] === a.bairro && porDia[j].length < 3)[0];
    if (i !== undefined) pegar(a, i, 'alvo');
  });
  (o.fila || []).forEach((l) => { if (l && l.quente && !l.semEnd && !l.bairro && !usados[l.ref]) quentesSem.push(l); });
  return { porDia, deLead, quentesSem, elegiveis: elig };
}

/**
 * A fila "por dinheiro" do Planejamento v3 (PLV3.ordemPorDinheiro): Negociação → Demo → Decisor → Visita →
 * Prospecção; dentro da etapa, primeiro o passo vencido e o que ficou para trás; depois, mais dias na etapa.
 * Os "3 primeiros" da folha da manhã são os 3 primeiros desta ordem.
 */
export type LeadOrdem = { nome: string; etapaIdx: number; dias?: number | null; venc?: string | null; ficou?: string | null; tirado?: string | null };
export function ordemPorDinheiro<T extends LeadOrdem>(fila: T[]): T[] {
  const urg = (l: LeadOrdem) => (l.venc || l.ficou || l.tirado ? 1 : 0);
  return (fila || []).slice().sort((a, b) => ((Number(b.etapaIdx) || 0) - (Number(a.etapaIdx) || 0)) || (urg(b) - urg(a)) || ((Number(b.dias) || 0) - (Number(a.dias) || 0))
    || String(a.nome || '').localeCompare(String(b.nome || '')));
}

// ── 3 · os chips de dia: amanhã · sex 13 · seg 16 ─────────────────────────────────────────────────
/**
 * Os próximos 3 dias úteis depois de hoje (feriado e fim de semana pulados). O 1º se chama "amanhã" quando
 * é amanhã mesmo. Com comHoje (as pendências de ontem, de manhã), o 1º chip é "hoje" e vêm mais 2.
 */
export function chipsDeDia(hoje: string, feriados: string[], comHoje = false): Array<{ rot: string; iso: string }> {
  const out: Array<{ rot: string; iso: string }> = [];
  if (comHoje) out.push({ rot: 'hoje', iso: hoje });
  let d = hoje;
  for (let k = 0; k < 30 && out.length < 3; k++) {
    d = somaDias(d, 1);
    if (!util(d, feriados)) continue;
    out.push({ rot: !comHoje && d === somaDias(hoje, 1) ? 'amanhã' : DIAS[dow(d)] + ' ' + Number(d.slice(8, 10)), iso: d });
  }
  return out;
}

// ── 4 · o dia do executivo ────────────────────────────────────────────────────────────────────────
const metrosTexto = (m: number) => (m < 1000 ? Math.round(m / 10) * 10 + ' m' : (Math.round(m / 100) / 10).toFixed(1).replace('.', ',') + ' km');
export type Contagem = { total: number; comProva: number; semProva: number; pendentes: number; naoVisitadas: number; portas: number; proxima: number };
export function contar(paradas: Parada[] | null): Contagem {
  const p = paradas || [];
  const n = (e: EstadoParada) => p.filter((x) => x.estado === e).length;
  const comProva = n('com_prova'), semProva = n('sem_prova');
  return { total: p.length, comProva, semProva, pendentes: n('pendente'), naoVisitadas: n('nao_visitada'), portas: comProva + semProva, proxima: p.findIndex((x) => x.estado === 'pendente') };
}
/**
 * "Faltam N" = os pontos de quem está logo acima − os seus + 1, do placar da semana (a mesma conta da
 * semana do Desenvolvimento v2). Curto para a pílula ("faltam 10 para passar o 2º"), longo para o Cockpit
 * ("Faltam 10 pts para passar Marco.").
 */
export function faltam(placar: EntradaDoDia['placar']): { n: number | null; curto: string | null; longo: string | null } {
  if (!placar) return { n: null, curto: null, longo: null };
  if (placar.pos === 1) return { n: 0, curto: 'você lidera a semana', longo: 'Você lidera a semana.' };
  if (!placar.acima || placar.pos == null) return { n: null, curto: null, longo: placar.pts ? null : 'O 1º check-in com prova põe você no placar.' };
  const n = placar.acima.pts - placar.pts + 1;
  const prim = String(placar.acima.nome || '').trim().split(/\s+/)[0] || 'o de cima';
  return { n, curto: 'faltam ' + n + ' para passar o ' + (placar.pos - 1) + 'º', longo: 'Faltam ' + n + ' pts para passar ' + prim + '.' };
}
const seqTexto = (s: number | null) => (s == null ? null : 'sequência ' + pl(s, 'dia', 'dias'));
const missaoTexto = (m: EntradaDoDia['missao']) => (!m ? null : m.cumprida ? 'missão cumprida' : 'missão ' + m.n + ' de ' + m.alvo);
const juntar = (xs: Array<string | null | undefined | false>) => xs.filter(Boolean).join(' · ');

export type VMDia = ReturnType<typeof diaDoExecutivo>;
export function diaDoExecutivo(e: EntradaDoDia) {
  const c = contar(e.paradas);
  /* o "X de 6 com prova" é a meta de visita do DIA: as paradas provadas do plano + as visitas provadas fora
     dele (a contagem do plano, c, fica como era: é a lista da Agenda) */
  const foraComProva = Math.max(0, Number(e.foraComProva) || 0);
  const comProvaDia = c.comProva + foraComProva;
  const plano = e.paradas;
  const prox = c.proxima >= 0 && plano ? plano[c.proxima] : null;
  const f = faltam(e.placar);
  const expediente = !!e.util;
  const feriado = expediente ? null : {
    titulo: 'Sem expediente hoje',
    texto: (e.feriado ? 'Feriado · ' + e.feriado + '.' : 'Fim de semana.') + ' Sem folha da manhã, sem push e sem cobrança. A sequência não apaga.',
  };

  /* a pílula-placar do mapa: o número grande é a visita COM PROVA (o mesmo da pílula de hoje) */
  let pilula: { n: string; tom: 'ok' | 'acao' | 'mute'; l1: string; l2: string };
  if (!expediente) pilula = { n: '—', tom: 'mute', l1: (e.feriado ? 'Feriado' : 'Fim de semana') + ' · sem expediente', l2: 'nada é cobrado hoje · a sequência não apaga' };
  else if (!c.portas && !foraComProva) pilula = { n: '0', tom: 'mute', l1: juntar(['0 de ' + e.meta + ' com prova', plano == null ? 'plano —' : pl(c.total, 'parada', 'paradas') + ' hoje']), l2: juntar([seqTexto(e.sequencia), missaoTexto(e.missao)]) || 'o 1º check-in com prova abre o placar' };
  else pilula = { n: String(comProvaDia), tom: comProvaDia >= e.meta ? 'ok' : 'acao', l1: juntar([comProvaDia + ' de ' + e.meta + ' com prova', c.semProva ? c.semProva + ' sem prova' : null, e.placar ? e.placar.pts + ' pts na semana' : null]), l2: juntar([f.curto, seqTexto(e.sequencia)]) || 'cada visita com prova soma 3 pts' };

  /* o cartão da próxima porta, com o passo que vence hoje */
  const porta = !expediente || !prox ? null : {
    kicker: 'PRÓXIMA PORTA · ' + (c.proxima + 1) + ' DE ' + c.total,
    nome: prox.nome,
    sub: juntar([prox.etapa, prox.hora ? '≈ ' + prox.hora : null, prox.metros != null ? metrosTexto(prox.metros) : null]),
    vence: prox.venceHoje ? 'passo vence hoje · ' + prox.venceHoje : null,
  };

  /* a folha da manhã: até 3 linhas */
  const linhaPlano = plano == null
    ? { titulo: 'O plano de hoje não respondeu', sub: 'abra a Agenda para ver as paradas', montar: null as string | null }
    : !c.total
      ? { titulo: 'Nada no plano de hoje', sub: e.propostas ? 'monte o dia com ' + pl(e.propostas, 'sugestão', 'sugestões') + (e.bairro ? ' perto de ' + e.bairro : '') : 'abra a Agenda para montar o dia', montar: e.propostas ? 'Montar o dia · ' + pl(e.propostas, 'sugestão', 'sugestões') : null }
      : { titulo: 'Plano de hoje: ' + pl(c.total, 'parada', 'paradas'), sub: juntar([plano[0].hora ? '1ª às ' + plano[0].hora + (e.bairro ? ' em ' + e.bairro : '') : e.bairro, plano[0].nome]), montar: null };
  const nv = (e.vencemHoje || []).length;
  const linhaVencem = !nv ? null : {
    titulo: nv === 1 ? '1 passo vence hoje' : nv + ' passos vencem hoje',
    sub: juntar(e.vencemHoje.slice(0, 2).map((v) => v.acao + ' ' + v.nome + (v.hora ? ' às ' + v.hora : '')).concat(nv > 2 ? ['+' + (nv - 2)] : [])),
  };
  const linhaSem = e.semPasso == null
    ? { titulo: '— sem próximo passo', sub: 'a fila não respondeu · abra as Tarefas', linhas: [] as Array<Record<string, unknown>>, mais: null as string | null }
    : !e.semPasso ? null : {
      titulo: e.semPasso + ' sem próximo passo',
      sub: 'dar data agora · 1 toque cada · comece pelos quentes',
      linhas: (e.topSemPasso || []).slice(0, 3).map((l) => ({
        id: l.id, nome: l.nome, etapaIdx: l.etapaIdx, quente: l.quente, venc: l.venc, feito: l.feito,
        sugT: l.sugestao ? 'Pôr em ' + l.sugestao.dia : null,
        sugS: l.sugestao ? 'sugerido · ' + (l.sugestao.mesmo ? 'mesmo bairro do dia' : 'dia com vaga mais cedo') : null,
      })),
      mais: e.semPasso > 3 ? '+ ' + (e.semPasso - 3) + ' no Planejamento e no Hoje do Cockpit · o mesmo número' : null,
    };
  const ontemN = e.ontem ? e.ontem.pendentes.length : 0;
  const ontem = !e.ontem || !ontemN ? null : {
    titulo: 'Ontem (' + diaCurto(e.ontem.dia) + ') ficou sem fechar: ' + ontemN + ' sem próximo passo',
    linhas: e.ontem.pendentes.map((p) => ({ id: p.id, nome: p.nome, sub: 'visitado ontem' })),
  };
  const emOrdem = expediente && plano != null && c.total > 0 && !nv && e.semPasso === 0 && !ontem;
  const folha = {
    mostra: expediente,
    kicker: 'SEU DIA EM 30 SEGUNDOS',
    titulo: e.nome ? 'Bom dia, ' + e.nome + '.' : 'Bom dia.',
    plano: linhaPlano, vencem: linhaVencem, sem: linhaSem, ontem,
    emOrdem, emOrdemTexto: 'Dia em ordem · vá para a rua',
    ir: 'Ir para a rua', depois: 'depois',
  };

  /* o fecho do dia e o check-out */
  const nP = (e.pendentesFecho || []).length;
  const portas = pl(c.portas, 'porta', 'portas');
  const fecho = {
    kicker: 'FECHO DO DIA · ' + diaCurto(e.hoje).toUpperCase(),
    titulo: nP ? portas + ' · ' + nP + ' sem próximo passo' : portas + ' · todas com próximo passo',
    sub: nP ? 'Marque o passo de cada uma (1 toque) e feche o dia.' : 'Pronto para fechar.',
    botao: nP ? 'fechar mesmo assim' : 'Fechar o dia',
    botaoTom: nP ? 'contorno' : 'acao',
    naoVisitada: 'não visitada · volta para a fila do Planejamento',
  };
  const checkout = {
    titulo: 'Dia fechado',
    texto: nP ? portas + ' · ' + nP + (nP > 1 ? ' ficaram sem passo e voltam' : ' ficou sem passo e volta') + ' amanhã às 8h' : juntar([portas, 'todas com próximo passo', seqTexto(e.sequencia)]),
    chips: [e.placar ? e.placar.pts + ' pts na semana' : null, seqTexto(e.sequencia), missaoTexto(e.missao)].filter(Boolean) as string[],
    rodape: 'Conta para a missão e as medalhas do Meu desempenho',
    botao: 'ver no Meu desempenho',
  };

  /* os pushes: só em dia útil; o das 18h só para quem foi à rua (fechar o nada é pedir um toque sem motivo) */
  const semTxt = e.semPasso == null ? null : pl(e.semPasso, 'lead sem passo', 'leads sem passo');
  const push08 = !expediente ? null : c.total
    ? { titulo: juntar([pl(c.total, 'parada', 'paradas') + ' hoje', semTxt]), texto: juntar([plano && plano[0].hora ? '1ª às ' + plano[0].hora + (e.bairro ? ' em ' + e.bairro : '') : null, 'toque para ver o seu dia em 30 segundos']) }
    : { titulo: juntar(['Nada no plano de hoje', semTxt]), texto: e.propostas ? 'monte o dia com ' + pl(e.propostas, 'sugestão', 'sugestões') + ' em 1 toque' : 'toque para ver o seu dia em 30 segundos' };
  const push18 = !expediente || !c.portas ? null : nP
    ? { titulo: 'Feche o dia: ' + portas + ' · ' + nP + ' sem próximo passo', texto: 'leva 1 minuto · conta para a sequência' }
    : { titulo: 'Feche o dia: ' + portas + ' · todas com próximo passo', texto: juntar(['1 toque', seqTexto(e.sequencia)]) };

  /* os 3 blocos do Hoje do Cockpit (o espelho) */
  const ckPlano = {
    kicker: 'PLANO DE HOJE',
    contagem: comProvaDia + ' de ' + e.meta + ' com prova',
    titulo: plano == null ? 'O plano não respondeu' : prox ? 'Próxima porta: ' + prox.nome + (prox.hora ? ' · ≈ ' + prox.hora : '') : c.total ? 'Dia feito · ' + c.comProva + ' com prova' : 'Nada no plano de hoje',
    sub: juntar([diaCurto(e.hoje), e.bairro, plano == null ? 'plano —' : pl(c.total, 'parada', 'paradas')]),
    linhas: (plano || []).map((p, i) => ({
      marca: p.estado === 'com_prova' ? 'ok' : p.estado === 'sem_prova' ? 'av' : p.estado === 'nao_visitada' ? 'x' : String(i + 1),
      hora: p.hora, nome: p.nome,
      s: p.estado === 'com_prova' ? 'com prova · check-in' : p.estado === 'sem_prova' ? 'sem prova · fora do raio' : p.estado === 'nao_visitada' ? 'não visitada' : juntar([p.etapa, p.venceHoje ? 'passo vence hoje' : null]),
      tom: p.estado === 'com_prova' ? 'ok' : p.estado === 'sem_prova' || (p.estado === 'pendente' && p.venceHoje) ? 'av' : 'dim',
      proxima: i === c.proxima,
    })),
    vencem: linhaVencem ? { titulo: linhaVencem.titulo, linhas: e.vencemHoje.map((v) => v.nome + ' · ' + v.acao + (v.hora ? ' às ' + v.hora : '')) } : null,
    rodape: 'abrir no app · a ordem e o horário são de lá',
  };
  const ckSem = {
    kicker: 'SEM PRÓXIMO PASSO',
    sub: 'o mesmo componente do Planejamento · o mesmo número do app',
    n: e.semPasso == null ? '—' : String(e.semPasso),
    zero: e.semPasso === 0,
    zeroTitulo: 'Todo lead com próximo passo.',
    zeroTexto: 'conta para a sequência Fila zerada e para a missão da semana',
    mais: e.semPasso != null && e.semPasso > 5 ? '+ ' + (e.semPasso - 5) + ' na lista · a mesma do Planejamento e da folha da manhã do app' : null,
  };
  const ckPlacar = {
    kicker: 'PLACAR DO DIA',
    pts: e.placar ? String(e.placar.pts) : '—',
    unidade: 'pts na semana',
    prox: !e.placar ? 'o placar não respondeu (desenvolvimento_quadro)' : f.longo || 'Cada visita com prova soma 3 pts.',
    linhas: [
      { v: e.sequencia == null ? 'Na rua —' : 'Na rua há ' + pl(e.sequencia, 'dia', 'dias'), t: 'sequência · feriado não apaga' },
      { v: !e.missao ? 'Missão —' : e.missao.cumprida ? 'Missão cumprida' : 'Missão ' + e.missao.n + ' de ' + e.missao.alvo, t: 'a missão da semana do Meu desempenho' },
      { v: 'Fechou o dia ontem: ' + (e.fechouOntem == null ? '—' : e.fechouOntem ? 'sim' : 'não'), t: 'o fecho conta para a sequência e a missão' },
    ],
    rodape: 'ponto só nasce de prova · os 5 números do gestor estão na Desenvolvimento',
  };

  return { expediente, feriado, contagem: c, pilula, porta, folha, fecho, checkout, push08, push18, cockpit: { plano: ckPlano, sem: ckSem, placar: ckPlacar } };
}

// ── 5 · os toasts pós-visita ──────────────────────────────────────────────────────────────────────
/** Depois do Cheguei. Os pontos só aparecem quando o placar vai contá-los (com prova, 1ª vez na semana). */
export function toastCheguei(o: { comProva: boolean; pontos: number; metros: number | null; sequencia: number | null }): { titulo: string; texto: string; tom: 'ok' | 'av' } {
  if (!o.comProva) return { titulo: 'Check-in sem prova · fora do raio', texto: 'não conta ponto · tire uma foto da fachada para provar', tom: 'av' };
  return {
    titulo: juntar([o.pontos ? '+' + o.pontos + ' pts' : 'Check-in com prova', seqTexto(o.sequencia)]),
    texto: juntar(['check-in com prova', o.metros != null ? 'GPS a ' + Math.round(o.metros) + ' m' : null, 'agora a ficha']),
    tom: 'ok',
  };
}
/** Depois de salvar a ficha: com passo, a confirmação; sem passo, o pedido de 1 toque (é aqui que ele morre). */
export function toastFicha(o: { nome: string; dia: string | null }): { titulo: string; texto: string; tom: 'ok' | 'acao'; chips: boolean } {
  if (o.dia) return { titulo: 'Passo em ' + o.dia + ' · salvo no HubSpot', texto: o.nome + ' · aparece na Agenda do app e no Cockpit', tom: 'ok', chips: false };
  return { titulo: o.nome + ' ficou sem próximo passo', texto: 'marcar agora · 1 toque · vira tarefa no HubSpot', tom: 'acao', chips: true };
}
