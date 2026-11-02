// DESENVOLVIMENTO v2, O JOGO DA CARREIRA (handoff de 01/11/26) — a parte que só FORMATA.
//
// Os números vêm prontos de desenvolvimento_quadro() (migração 0240): placar, missão, sequências,
// variável, habilidade, carreira, coleção. Aqui eles viram as frases e os estados de cada bloco do
// "Meu desempenho" do app; a push-fila usa as mesmas funções para os pushes de segunda 08:00 e sexta
// 17:00. O Cockpit tem a MESMA lógica em JS (DV2, no gv2-js do template do cockpit-unificado), e as
// duas suítes rodam a mesma fixture contra a mesma saída esperada (desenvolvimentoV2.esperado.json):
// se um lado mudar uma frase ou uma conta e o outro não, uma das suítes cai.
//
// Regras que moram aqui: ninguém aparece como pior (só pódio e "o próximo a passar"), novato é "você
// contra você", fonte fora do ar é "—" com o nome da fonte (nunca 0), nenhum bloco vazio (o convite do
// README no lugar), zero emoji. Sem import de React, Node ou Deno: roda no app, na Edge e no teste.

// ── o que o banco devolve (o formato de desenvolvimento_quadro) ────────────────────────────────
export type Faixa = { de: number; ate: number | null; porCliente: number };
export type LinhaPodio = { pos: number; nome: string; pts: number; eu: boolean };
export type DiaSeq = { d: string; feriado: string | null; rua: boolean; fila: boolean };
export type DiaMissao = { d: string; feriado: string | null; util: boolean; ok: boolean };
export type Soma = { p: number; f: number; o: number; m: number; c: number };
export type Ganha = { id: string; em: string; detalhe?: Record<string, unknown> | null; vista: boolean };
export type Quadro = {
  erro?: string;
  hoje: string;
  hora: string;
  pessoa: { id: string; ownerId: string | null; nome: string | null; fase: 'novato' | 'pleno' };
  umAUm: { ultimo: string | null; proximo: string; hora: string } | null;
  semana: {
    segunda: string; sexta: string; uteis: number; pts: number; pos: number | null; total: number;
    vendas: number; demos: number; visitas: number; podio: LinhaPodio[];
    acima: { nome: string; pts: number } | null; segundo: { nome: string; pts: number } | null;
    passada: { pts: number; pos: number } | null; recorde: { pts: number; segunda: string } | null;
  } | null;
  missao: { id: string; alvo: number; n: number; prazo: string; cumpridaEm: string | null; dias: DiaMissao[]; restam: number; uteis: number } | null;
  sequencias: {
    rua: { atual: number; recorde: number };
    fila: { atual: number; recorde: number; medido: boolean };
    dias: DiaSeq[];
  } | null;
  variavel: { mes: string; vendas: number; meta: number; faixas: Faixa[] } | null;
  habilidade: {
    habilidade: { taxa: string; antes: number | null; meta: number; combinadaEm: string; combinadaPor?: string | null } | null;
    agora: number | null;
    total: { anterior: Soma; atual: Soma } | null;
    time: { anterior: Soma & { pessoas: number }; atual: Soma & { pessoas: number } } | null;
    uteis?: { anterior: number; atual: number } | null;
    ganhaEm: string | null;
  } | null;
  carreira: {
    rampa: {
      dia: number; inicio: string; padrinhoNome: string | null;
      fases: Record<string, { aprovadaEm: string | null; aprovadaPor?: string | null } | undefined>;
      medido?: { clientes?: number } | null;
    } | null;
    lider: {
      meses: Array<{ mes: string; provadas: number; uteis: number }>;
      conv: { demos: number; clientes: number } | null;
      registro: { n: number; ultima: string | null } | null;
      afilhados: Array<{ pessoa: string; nome: string; inicio: string; fases: Record<string, { aprovadaEm: string | null } | undefined> }>;
    } | null;
    timeConv: { demos: number; clientes: number } | null;
    formadaEm: string | null;
  } | null;
  playbook: Array<{ slug: string; em: string }> | null;
  colecao: {
    ganhas: Ganha[];
    progresso: { na_rua: number; fila_zerada: number; demo_seguidas: number; quentes: { n: number; de: number; medido: boolean } | null };
    reconhecimento: { combinado: number; pct: number; n: number; den: number; segunda: string; sexta: string } | null;
  } | null;
  vsVoce: { diaDoMes: number; vendasMes: number; vendasMesAnterior: number } | null;
  aberturas?: { semana: number; ultima: string | null } | null;
  fontes: Record<string, string>;
};
export type Capitulo = { titulo: string; paginas: string[] };
export type Tom = 'ok' | 'av' | 'rota' | 'acao' | 'mute' | 'dim';

// ── datas e números (Brasília; as datas chegam em ISO do banco) ───────────────────────────────
export const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dia = (iso: string) => String(iso || '').slice(0, 10);
export const dow = (iso: string) => new Date(dia(iso) + 'T12:00:00Z').getUTCDay();
export const ddmm = (iso: string) => dia(iso).slice(8, 10) + '/' + dia(iso).slice(5, 7);
export const diaCurto = (iso: string) => DIAS[dow(iso)] + ' ' + ddmm(iso);
export const somaDias = (iso: string, n: number) => { const d = new Date(dia(iso) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(dia(ate) + 'T12:00:00Z') - Date.parse(dia(de) + 'T12:00:00Z')) / 86400000);
export const mesNome = (iso: string) => MESES[Number(String(iso).slice(5, 7)) - 1];
export const reais = (v: number) => 'R$ ' + String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const virg = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
export const pl = (n: number, um: string, varios: string) => n + ' ' + (n === 1 ? um : varios);
const NUM = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const Cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const prim = (nome: string | null | undefined) => String(nome || '').trim().split(/\s+/)[0] || '';
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

// ── 2 · a semana: a disputa dos R$ 250 ────────────────────────────────────────────────────────
/** A menor ação que passa quem está acima: uma visita com prova vale 3, uma demo 25 (a regra do placar). */
export function menorAcao(falta: number): string {
  if (falta <= 3) return 'Uma visita com prova já passa.';
  if (falta <= 25) {
    const v = Math.ceil(falta / 3);
    return v <= 2 ? Cap(NUM[v]) + ' visitas com prova passam.' : 'Uma demo (25) já passa.';
  }
  const d = Math.floor(falta / 25), r = falta - 25 * d, v = Math.ceil(r / 3);
  const dT = d === 1 ? 'Uma demo' : Cap(NUM[Math.min(d, 10)]) + ' demos';
  if (r <= 0) return dT + (d > 1 ? ' passam.' : ' passa.');
  if (v > 2) return Cap(NUM[Math.min(d + 1, 10)]) + ' demos passam.';
  return dT + ' e ' + (v === 1 ? 'uma visita' : NUM[v] + ' visitas') + ' passam.';
}

export type VMSemana = {
  fora: boolean; fonte: string | null; kicker: string; ate: string; ateCurto: string;
  pts: string; posTexto: string; posTom: Tom; podio: Array<{ nome: string; pts: string; lugar: string; eu: boolean; altura: number }>;
  proximo: string; regra: Array<{ v: string; t: string }>; nota: string;
};
export function semanaDoExecutivo(q: Quadro): VMSemana {
  const regra = [{ v: '100', t: 'venda' }, { v: '25', t: 'demo' }, { v: '3', t: 'visita com prova' }];
  const nota = 'ponto só nasce de prova: GPS ou foto na visita, HubSpot na demo e na venda';
  const kicker = 'A SEMANA · DISPUTA DOS R$ 250';
  const S = q.semana;
  if (!S) return { fora: true, fonte: q.fontes.semana || 'placar_da_semana', kicker, ate: '', ateCurto: '', pts: '—', posTexto: '— · ' + (q.fontes.semana || 'placar_da_semana') + ' não respondeu', posTom: 'mute', podio: [], proximo: 'O placar volta assim que a fonte responder. Os seus pontos continuam contando.', regra, nota };
  /* a semana do bônus é de segunda a sexta 23:59 (0191): o texto diz até que dia, sem hora inventada */
  const ate = 'até ' + diaCurto(S.sexta) + (S.uteis < 5 ? ' · ' + pl(S.uteis, 'dia útil', 'dias úteis') : '');
  const novato = q.pessoa.fase === 'novato';
  const lider = S.podio.find((x) => x.pos === 1);
  const comecou = !lider || lider.pts <= 0;
  let posTexto: string, proximo: string;
  let podio: VMSemana['podio'] = [];
  if (novato) {
    posTexto = 'na rampa · placar de você contra você';
    proximo = 'Na rampa, a sua disputa é com você: ' + S.pts + ' pts nesta semana' + (S.passada ? ', ' + S.passada.pts + ' na passada.' : '.');
  } else if (S.pos == null) {
    posTexto = 'fora do placar do bônus';
    proximo = 'Você não disputa o placar do bônus: estes são os seus pontos da semana.';
  } else if (comecou) {
    posTexto = 'a semana começou';
    proximo = 'A semana começou: todo mundo com 0. A 1ª visita com prova de hoje já põe você no placar.';
  } else {
    posTexto = S.pos + 'º no placar da praça';
    /* o pódio em 2º · 1º · 3º; só o top 3 e "o próximo a passar", nunca a lista (regra 3 do README) */
    const ordem = [2, 1, 3], alturas = [44, 62, 34];
    ordem.forEach((p, i) => {
      const x = S.podio.find((y) => y.pos === p);
      if (x) podio.push({ nome: x.eu ? 'você' : prim(x.nome), pts: String(x.pts), lugar: p + 'º', eu: x.eu, altura: alturas[i] });
    });
    if (S.pos === 1) proximo = S.segundo ? 'Você lidera com ' + (S.pts - S.segundo.pts) + ' pts de vantagem sobre ' + prim(S.segundo.nome) + '.' : 'Você lidera a semana.';
    else if (S.acima) { const falta = S.acima.pts - S.pts + 1; proximo = 'Faltam ' + falta + ' pts para passar ' + prim(S.acima.nome) + '. ' + menorAcao(falta); }
    else proximo = 'Cada visita com prova soma 3 pts.';
  }
  return { fora: false, fonte: null, kicker, ate, ateCurto: diaCurto(S.sexta), pts: String(S.pts), posTexto, posTom: !novato && S.pos === 1 && !comecou ? 'ok' : 'mute', podio, proximo, regra, nota };
}

// ── 3 · a missão da semana ────────────────────────────────────────────────────────────────────
/* O texto de cada missão (README §6.1). O banco escolhe entre as de prova diária (porta, fila, naHora,
   dono) e a do novato; registro, plano e rituais ficam no catálogo para quando entrarem na escolha. */
export const MISSOES: Record<string, { combinado: string; titulo: string; unidade: string; selo: string; icone: string; prova: string }> = {
  porta: { combinado: 'A porta é provada', titulo: 'Toda visita com GPS ou foto', unidade: 'dias com todas as visitas provadas', selo: 'Porta provada', icone: 'map-pin', prova: 'o GPS no pino ou a foto da visita' },
  fila: { combinado: 'Próximo passo e data', titulo: 'Zerar a fila sem próximo passo antes das 18h', unidade: 'dias com a fila zerada', selo: 'Fila zerada', icone: 'check-circle', prova: 'a fila zerada antes das 18h' },
  naHora: { combinado: 'Ficha na hora', titulo: 'Registrar o como foi antes de ligar o carro', unidade: 'dias com 100% em até 15 min', selo: 'Registro na hora', icone: 'clock', prova: 'a hora da ficha contra a hora do check-in' },
  dono: { combinado: 'Visita com o dono', titulo: 'Marcar a volta em toda ausência do dono', unidade: 'dias com a volta marcada', selo: 'Volta marcada', icone: 'users', prova: 'a ficha "dono ausente" com a volta marcada' },
  registro: { combinado: 'Registro verdadeiro', titulo: 'Passar a auditoria de sexta sem divergência', unidade: 'auditoria sem divergência', selo: 'Registro verdadeiro', icone: 'shield-check', prova: 'a auditoria de sexta' },
  plano: { combinado: 'Dia planejado', titulo: 'Fechar 4 dias com 70% ou mais do plano feito', unidade: 'dias com 70% do plano', selo: 'Plano cumprido', icone: 'calendar', prova: 'o plano contra as visitas feitas' },
  rituais: { combinado: 'Rituais', titulo: 'Daily e 1:1 da semana sem faltar', unidade: 'rituais da semana', selo: 'Ritual em dia', icone: 'users', prova: 'a presença nos rituais' },
  novato: { combinado: 'Rampa', titulo: 'Fazer 4 visitas com prova por dia útil', unidade: 'dias com 4 ou mais', selo: 'Primeira semana no ritmo', icone: 'map-pin', prova: 'o GPS ou a foto da visita' },
};
export type VMMissao = {
  fora: boolean; fonte: string | null; id: string; kicker: string; prazo: string; titulo: string; n: number; alvo: number; contagem: string; unidade: string;
  passos: boolean[]; premio: string; selo: string; icone: string; nota: string; cumprida: boolean; cumpridaEm: string | null; celebra: string;
};
export function missaoDaSemana(q: Quadro): VMMissao {
  const M = q.missao;
  if (!M) {
    const f = q.fontes.missao || 'visitas e fichas';
    return { fora: true, fonte: f, id: '', kicker: 'MISSÃO DA SEMANA', prazo: '', titulo: '—', n: 0, alvo: 0, contagem: '—', unidade: f + ' não respondeu', passos: [], premio: '', selo: '', icone: 'target', nota: 'A missão volta quando a fonte responder. A prova que você fizer hoje continua valendo.', cumprida: false, cumpridaEm: null, celebra: '' };
  }
  const T = MISSOES[M.id] || MISSOES.naHora;
  const cumprida = !!M.cumpridaEm;
  const prazo = 'até ' + diaCurto(M.prazo);
  const fer = (M.dias || []).find((x) => !!x.feriado);
  let nota: string;
  if (cumprida) nota = 'Fechou sozinha ' + (M.cumpridaEm === q.hoje ? 'hoje' : diaCurto(M.cumpridaEm!)) + ', com ' + T.prova + '.';
  else if (fer) nota = 'O feriado de ' + diaCurto(fer.d) + ' não conta: o prazo é ' + diaCurto(M.prazo) + ', com ' + pl(M.uteis, 'dia útil', 'dias úteis') + '.';
  else if (M.n === 0 && q.hoje === (q.semana ? q.semana.segunda : '')) nota = 'Missão nova, escolhida pelo hábito em que você está mais longe do time. Fecha sozinha quando a prova chega.';
  else if (M.id === 'novato') nota = 'A missão do novato vem da fase da rampa. Fecha sozinha com o GPS ou a foto da visita.';
  else nota = 'Fecha sozinha quando a prova chega: ' + T.prova + '. Feriado e fim de semana não contam.';
  return {
    fora: false, fonte: null, id: M.id, kicker: cumprida ? 'MISSÃO CUMPRIDA' : 'MISSÃO DA SEMANA', prazo, titulo: T.titulo,
    n: M.n, alvo: M.alvo, contagem: M.n + ' de ' + M.alvo, unidade: T.unidade,
    passos: Array.from({ length: M.alvo }, (_, i) => i < M.n),
    premio: 'Cumpra ' + prazo + ' e ganhe o selo ' + T.selo, selo: T.selo, icone: T.icone, nota, cumprida, cumpridaEm: M.cumpridaEm,
    celebra: 'O selo ' + T.selo + ' entrou na sua coleção.',
  };
}

// ── 4 · as sequências ─────────────────────────────────────────────────────────────────────────
/* A RÉGUA DA SEQUÊNCIA, a mesma do banco (_sequencia_util da 0239 e _dv2_recorde_util da 0240), escrita
   aqui para o teste provar a regra 2 do README com datas de verdade: só dia útil conta, hoje ainda pode
   acontecer, e fim de semana e feriado não quebram. O banco é quem conta; isto é a especificação. */
const ehUtil = (iso: string, feriados: string[]) => { const w = dow(iso); return w >= 1 && w <= 5 && feriados.indexOf(iso) < 0; };
export function sequenciaUtil(dias: string[], hoje: string, feriados: string[]): number {
  let d = hoje, n = 0, tolerancia = true;
  for (let i = 0; i < 60; i++) {
    if (ehUtil(d, feriados)) {
      if (dias.indexOf(d) >= 0) { n++; tolerancia = false; } else if (tolerancia) tolerancia = false; else break;
    }
    d = somaDias(d, -1);
  }
  return n;
}
export function recordeUtil(dias: string[], feriados: string[]): number {
  const proximoUtil = (iso: string) => { let d = somaDias(iso, 1); while (!ehUtil(d, feriados)) d = somaDias(d, 1); return d; };
  let ant: string | null = null, run = 0, max = 0;
  dias.filter((x, i, a) => a.indexOf(x) === i && ehUtil(x, feriados)).sort().forEach((d) => {
    run = ant && d === proximoUtil(ant) ? run + 1 : 1;
    max = Math.max(max, run);
    ant = d;
  });
  return max;
}
export type VMSequencias = {
  fora: boolean; fonte: string | null;
  itens: Array<{ id: 'rua' | 'fila'; titulo: string; sub: string; acesa: boolean; icone: string; dias: Array<{ rotulo: string; st: 'ok' | 'hoje' | 'nao' | 'fer' }> }>;
  nota: string; notaTom: Tom;
};
export function sequencias(q: Quadro): VMSequencias {
  const S = q.sequencias;
  if (!S) { const f = q.fontes.sequencias || 'visitas com prova'; return { fora: true, fonte: f, itens: [], nota: '— · ' + f + ' não respondeu. A chama não apaga por falta de leitura.', notaTom: 'dim' }; }
  const tira = (k: 'rua' | 'fila') => (S.dias || []).map((x) => {
    const feito = k === 'rua' ? x.rua : x.fila;
    const st: 'ok' | 'hoje' | 'nao' | 'fer' = feito ? 'ok' : x.feriado ? 'fer' : x.d === q.hoje ? 'hoje' : 'nao';
    return { rotulo: st === 'fer' ? 'feriado' : DIAS[dow(x.d)] + ' ' + x.d.slice(8, 10), st };
  });
  const r = S.rua, f = S.fila;
  const itens: VMSequencias['itens'] = [
    { id: 'rua', titulo: r.atual > 0 ? 'Na rua há ' + pl(r.atual, 'dia seguido', 'dias seguidos') : 'Na rua: 0 dias',
      sub: 'recorde ' + pl(r.recorde, 'dia', 'dias') + ' · ' + (r.atual === 0 ? 'a chama acende na 1ª visita com prova' : r.atual === r.recorde ? 'é o seu recorde' : 'visita com prova em todo dia útil'),
      acesa: r.atual > 0, icone: 'flame', dias: tira('rua') },
    { id: 'fila', titulo: f.atual > 0 ? 'Fila zerada há ' + pl(f.atual, 'dia', 'dias') : 'Fila zerada: 0 dias',
      sub: f.medido ? 'recorde ' + pl(f.recorde, 'dia', 'dias') + ' · nenhum lead sem próximo passo às 18h' : 'ainda sem dia de fila zerada · zere a fila de Tarefas antes das 18h',
      acesa: f.atual > 0, icone: 'check-circle', dias: tira('fila') },
  ];
  const fer = (S.dias || []).find((x) => !!x.feriado);
  return {
    fora: false, fonte: null, itens,
    nota: fer ? 'Feriado não conta: ' + diaCurto(fer.d) + ' (' + fer.feriado + ') não apagou a sua sequência.' : 'A chama só apaga se um dia útil passar sem fazer. Fim de semana e feriado não apagam.',
    notaTom: fer ? 'av' : 'dim',
  };
}

// ── 5 · o mês: a escada do variável ───────────────────────────────────────────────────────────
/* O modelo é RETROATIVO (data/comissionamento.json do Cockpit): ao entrar numa faixa, o valor novo vale
   para todos os clientes do mês. "A 6ª venda vale +R$ 550" = 6 × 300 − 5 × 250. É a mesma conta do
   proxima_venda de meu_desempenho() (0159). Nenhum valor mora aqui: as faixas vêm do banco. */
export const faixaDe = (faixas: Faixa[], n: number) => faixas.find((f) => n >= Number(f.de || 0) && (f.ate == null || n <= Number(f.ate))) || null;
export const totalDe = (faixas: Faixa[], n: number) => { const f = faixaDe(faixas, n); return f ? n * Number(f.porCliente) : 0; };
export type VMVariavel = {
  fora: boolean; fonte: string | null; titulo: string; sub: string;
  faixas: Array<{ rotulo: string; atual: boolean; degraus: Array<{ n: number; st: 'feita' | 'proxima' | 'futura' }> }>;
  rodape: string; meta: string; proximaVale: number | null;
};
export function escadaDoVariavel(q: Quadro): VMVariavel {
  const V = q.variavel;
  if (!V) { const f = q.fontes.variavel || 'HubSpot'; return { fora: true, fonte: f, titulo: '—', sub: f + ' não respondeu: o variável volta quando a fonte responder. Nenhuma venda se perde.', faixas: [], rodape: '— · ' + f, meta: '', proximaVale: null }; }
  const faixas = (V.faixas || []).slice().sort((a, b) => Number(a.de) - Number(b.de));
  const v = Number(V.vendas) || 0, meta = Number(V.meta) || 0, nx = v + 1;
  const vale = totalDe(faixas, nx) - totalDe(faixas, v);
  const fHoje = faixaDe(faixas, v), fProx = faixaDe(faixas, nx);
  const muda = !!(fHoje && fProx && fHoje !== fProx);
  const mes = mesNome(V.mes + '-01');
  let titulo: string, sub: string;
  if (meta > 0 && v >= meta) { titulo = 'Meta batida: ' + v + ' de ' + meta + '.'; sub = 'Cada venda a mais vale +' + reais(vale) + '.'; }
  else if (muda) { titulo = 'A ' + nx + 'ª venda muda a faixa: +' + reais(vale) + '.'; sub = 'Falta 1 venda. Hoje cada venda vale +' + reais(fHoje!.porCliente) + '; a partir da ' + nx + 'ª, +' + reais(fProx!.porCliente) + '.'; }
  else {
    titulo = 'A ' + nx + 'ª venda vale +' + reais(vale) + '.';
    const seguinte = faixas.find((f) => Number(f.de) > nx);
    sub = v === 0 ? Cap(mes) + ' começou. A escada sobe a cada contrato fechado no HubSpot.'
      : seguinte && (!meta || Number(seguinte.de) <= meta) ? 'Faltam ' + pl(Number(seguinte.de) - v, 'venda', 'vendas') + ' para a faixa de +' + reais(seguinte.porCliente) + ' por venda.'
      : 'Faltam ' + pl(Math.max(0, meta - v), 'venda', 'vendas') + ' para a meta.';
  }
  /* um degrau por venda até a meta (ou até as vendas, se passou), agrupado por faixa */
  const ate = Math.max(meta, v);
  const grupos: VMVariavel['faixas'] = [];
  for (let k = 1; k <= ate; k++) {
    const f = faixaDe(faixas, k);
    const rot = f ? '+' + reais(f.porCliente) + ' por venda' : 'sem faixa';
    let g = grupos[grupos.length - 1];
    if (!g || g.rotulo !== rot) { g = { rotulo: rot, atual: false, degraus: [] }; grupos.push(g); }
    g.degraus.push({ n: k, st: k <= v ? 'feita' : k === nx ? 'proxima' : 'futura' });
  }
  grupos.forEach((g) => { g.atual = g.degraus.some((d) => d.n === nx) || (v >= ate && g.degraus.some((d) => d.n === v)); });
  return {
    fora: false, fonte: null, titulo, sub, faixas: grupos,
    rodape: (v ? reais(totalDe(faixas, v)) + ' em ' + mes + ' até aqui' : mes + ' começou') + ' · comissionamento.json',
    meta: 'meta ' + meta + (q.pessoa.fase === 'novato' ? ' · novato' : ''), proximaVale: vale,
  };
}

// ── 6 · a habilidade do mês (o chefão) ────────────────────────────────────────────────────────
export const TAXAS: Record<string, { t: string; pct: boolean; un: string }> = {
  dono: { t: 'Sair com o dono', pct: true, un: 'pontos' },
  demo: { t: 'Virar demo', pct: true, un: 'pontos' },
  fechar: { t: 'Fechar', pct: true, un: 'pontos' },
  volume: { t: 'Volume', pct: false, un: 'visitas por semana' },
};
/* a mesma conta do valor() de src/utils/habilidadeDoMes.ts (e do GV2.HB do Cockpit) */
export function valorTaxa(k: string, s: Soma | null | undefined, uteis: number, pessoas = 1): number | null {
  if (!s) return null;
  if (k === 'dono') return pct(s.o, s.f);
  if (k === 'demo') return pct(s.m, s.p);
  if (k === 'fechar') return pct(Math.max(0, s.c), s.m);
  const sem = uteis / 5;
  return sem > 0 && pessoas > 0 ? Math.round(s.p / pessoas / sem) : null;
}
const fmtTaxa = (k: string, v: number | null) => (v == null ? '—' : TAXAS[k] && TAXAS[k].pct ? v + '%' : String(v));
const FASES = [
  { k: 's1', t: 'S1 · Conhecer o produto e a praça', curto: 'S1', dia: 1, hab: 'Na S1, é conhecer o produto e a praça: o Playbook e a primeira semana com o padrinho.' },
  { k: 's23', t: 'S2–3 · Ir junto com o padrinho', curto: 'S2–3', dia: 8, hab: 'Na S2–3, é ir junto com o padrinho e anotar as objeções. A habilidade do mês começa depois da formatura.' },
  { k: 's4', t: 'S4–6 · Rua com o padrinho de longe', curto: 'S4–6', dia: 22, hab: 'Na S4–6, é a rua com o padrinho de longe: 4 visitas com prova por dia útil.' },
  { k: 'rua', t: 'S7–8 · Rua sozinho e formatura', curto: 'S7–8', dia: 43, hab: 'Na S7–8, é a rua sozinho até a formatura: 3 clientes no mês.' },
];
const faseAtual = (R: NonNullable<NonNullable<Quadro['carreira']>['rampa']>) => FASES.find((f) => !(R.fases && R.fases[f.k] && R.fases[f.k]!.aprovadaEm)) || null;
export type VMHabilidade = {
  modo: 'ativa' | 'convite' | 'novato' | 'fora'; fonte: string | null; nome: string; com: string;
  caixas: Array<{ rotulo: string; valor: string; tom: Tom }>; bateu: boolean; falta: string;
  barra: { agora: number; antes: number | null; meta: number } | null; conviteT: string; conviteS: string;
};
export function habilidadeDoMes(q: Quadro): VMHabilidade {
  const vazio: VMHabilidade = { modo: 'convite', fonte: null, nome: '', com: '', caixas: [], bateu: false, falta: '', barra: null, conviteT: '', conviteS: '' };
  if (q.pessoa.fase === 'novato') {
    const R = q.carreira && q.carreira.rampa, f = R ? faseAtual(R) : null;
    return Object.assign(vazio, { modo: 'novato' as const, conviteT: 'Na rampa, a habilidade é a da fase.', conviteS: f ? f.hab : 'A habilidade do mês começa depois da formatura.' });
  }
  const H = q.habilidade;
  if (!H) { const f = q.fontes.habilidade || 'habilidade_quadro'; return Object.assign(vazio, { modo: 'fora' as const, fonte: f, conviteT: '—', conviteS: f + ' não respondeu agora.' }); }
  const h = H.habilidade;
  if (!h) {
    const um = q.umAUm ? DIAS_LONGOS[dow(q.umAUm.proximo)] : 'próximo';
    /* a sugestão: o maior gap contra o time no mês (o anterior, antes da primeira visita do mês) */
    const qual = H.total && (H.total.atual.p + H.total.atual.f + H.total.atual.m > 0) ? 'atual' : 'anterior';
    const ut = H.uteis ? H.uteis[qual] : 0;
    let sug: { k: string; eu: number; time: number; gap: number } | null = null;
    Object.keys(TAXAS).forEach((k) => {
      const eu = valorTaxa(k, H.total ? H.total[qual] : null, ut);
      const tm = H.time ? valorTaxa(k, H.time[qual], ut, Number(H.time[qual].pessoas) || 0) : null;
      if (eu == null || tm == null || tm <= 0 || eu >= tm) return;
      const gap = (tm - eu) / tm;
      if (!sug || gap > sug.gap) sug = { k, eu, time: tm, gap };
    });
    const s = sug as { k: string; eu: number; time: number; gap: number } | null;
    return Object.assign(vazio, { modo: 'convite' as const, conviteT: 'Combine a habilidade do mês no 1:1 de ' + um + '.',
      conviteS: 'Escolha uma só, com antes e meta.' + (s ? ' Sugestão pelo seu maior gap com o time: ' + TAXAS[s.k].t + ' (você ' + fmtTaxa(s.k, s.eu) + ', time ' + fmtTaxa(s.k, s.time) + ').' : '') });
  }
  const T = TAXAS[h.taxa] || { t: h.taxa, pct: true, un: 'pontos' };
  const agora = H.agora, meta = Number(h.meta), antes = h.antes == null ? null : Number(h.antes);
  const bateu = agora != null && agora >= meta;
  const por = prim(h.combinadaPor);
  return {
    modo: 'ativa', fonte: null, nome: T.t,
    com: 'combinada' + (por && por.indexOf('@') < 0 ? ' com ' + por : '') + ' no 1:1 de ' + ddmm(h.combinadaEm),
    caixas: [{ rotulo: 'Antes', valor: fmtTaxa(h.taxa, antes), tom: 'dim' }, { rotulo: 'Meta', valor: fmtTaxa(h.taxa, meta), tom: 'mute' }, { rotulo: 'Agora', valor: fmtTaxa(h.taxa, agora), tom: bateu ? 'ok' : 'av' }],
    bateu,
    falta: bateu ? 'Bateu a meta. A medalha "' + T.t + ' · ' + fmtTaxa(h.taxa, meta) + '" entrou na coleção.'
      : agora == null ? 'Ainda sem dado no mês: a primeira visita do mês já mostra o agora.'
      : 'Faltam ' + pl(Math.round(meta - agora), T.un === 'pontos' ? 'ponto' : 'visita por semana', T.un) + '. No dia em que bater, vira medalha.',
    barra: agora == null ? null : { agora, antes, meta }, conviteT: '', conviteS: '',
  };
}

// ── 7 · a carreira e o Playbook ───────────────────────────────────────────────────────────────
export type Criterio = { ok: boolean; t: string; s: string };
export type Degrau = { t: string; s: string; st: 'feito' | 'atual' | 'futuro'; crit: Criterio[]; barra: { pct: number; t: string } | null; proximo: string | null };
export type VMCarreira = { fora: boolean; fonte: string | null; onde: string; degraus: Degrau[]; liderN: number };
export function criteriosDeLider(q: Quadro): Criterio[] {
  const C = q.carreira, L = C && C.lider;
  if (!L) return [];
  const fechados = (L.meses || []).filter((m) => m.mes.slice(0, 7) < q.hoje.slice(0, 7)).slice(-3);
  const media = (m: { provadas: number; uteis: number }) => (m.uteis ? m.provadas / m.uteis : 0);
  const noRitmo = fechados.filter((m) => media(m) >= 6);
  const pior = fechados.slice().reverse().find((m) => media(m) < 6);
  const c1: Criterio = { ok: fechados.length === 3 && noRitmo.length === 3, t: '3 meses no ritmo de 6 visitas com prova por dia útil',
    s: fechados.length === 3 && noRitmo.length === 3 ? fechados.map((m) => mesNome(m.mes) + ' ' + virg(media(m))).join(' · ') + ' · cumprido'
      : noRitmo.length + ' de 3 · falta ' + pl(3 - noRitmo.length, 'mês', 'meses') + (pior ? ': ' + mesNome(pior.mes) + ' ficou em ' + virg(media(pior)) : '') };
  const eu = L.conv && L.conv.demos ? pct(L.conv.clientes, L.conv.demos) : null;
  const tm = C!.timeConv && C!.timeConv.demos ? pct(C!.timeConv.clientes, C!.timeConv.demos) : null;
  const c2: Criterio = { ok: eu != null && tm != null && eu > tm, t: 'Demo vira cliente acima do time',
    s: eu == null ? 'sem demo nos 3 meses fechados' : eu + '% × time ' + (tm == null ? '—' : tm + '%') + (eu != null && tm != null && eu > tm ? ' · cumprido' : '') };
  const nReg = L.registro ? Number(L.registro.n) || 0 : 0;
  const c3: Criterio = { ok: nReg === 0, t: 'Registro verdadeiro',
    s: nReg === 0 ? 'nenhuma ocorrência de registro · cumprido' : pl(nReg, 'ocorrência', 'ocorrências') + ' de registro' + (L.registro && L.registro.ultima ? ' · a última em ' + ddmm(L.registro.ultima) : '') };
  const afs = L.afilhados || [];
  const formado = afs.find((a) => a.fases && a.fases.rua && a.fases.rua.aprovadaEm);
  const aberto = afs.find((a) => !(a.fases && a.fases.rua && a.fases.rua.aprovadaEm));
  const c4: Criterio = { ok: !!formado, t: 'Padrinho de um novato que se formou',
    s: formado ? prim(formado.nome) + ' se formou em ' + ddmm(formado.fases.rua!.aprovadaEm!) + ' · cumprido'
      : aberto ? prim(aberto.nome) + ', seu afilhado, está no dia ' + Math.min(60, diasEntre(aberto.inicio, q.hoje) + 1) + ' de 60'
      : 'sem afilhado ainda · o gestor indica o padrinho na Rampa' };
  return [c1, c2, c3, c4];
}
export function carreira(q: Quadro): VMCarreira {
  const C = q.carreira;
  if (!C) { const f = q.fontes.carreira || 'rampa_quadro'; return { fora: true, fonte: f, onde: '—', degraus: [], liderN: 0 }; }
  const vendas = q.variavel ? q.variavel.vendas : null, meta = q.variavel ? q.variavel.meta : null;
  const mes = mesNome(q.hoje);
  if (q.pessoa.fase === 'novato') {
    const R = C.rampa;
    if (!R) return { fora: true, fonte: 'rampa_quadro', onde: 'rampa', degraus: [], liderN: 0 };
    const atual = faseAtual(R);
    const formatura = somaDias(R.inicio, 59);
    const crit = FASES.map((f) => {
      const a = R.fases && R.fases[f.k] && R.fases[f.k]!.aprovadaEm;
      const por = R.fases && R.fases[f.k] && R.fases[f.k]!.aprovadaPor;
      return { ok: !!a, t: f.t, s: a ? 'aprovada' + (por && String(por).indexOf('@') < 0 ? ' por ' + prim(String(por)) : '') + ' em ' + ddmm(a)
        : atual && atual.k === f.k ? 'em curso' : f.k === 'rua' ? 'dia 60 · ' + (meta || 3) + ' clientes no mês' : 'começa em ' + ddmm(somaDias(R.inicio, f.dia - 1)) };
    });
    const idx = atual ? FASES.indexOf(atual) : -1;
    const fimFase = idx >= 0 && idx < FASES.length - 1 ? somaDias(R.inicio, FASES[idx + 1].dia - 2) : formatura;
    return {
      fora: false, fonte: null, onde: 'rampa · dia ' + R.dia + ' de 60', liderN: 0,
      degraus: [
        { t: 'Rampa', s: 'dia ' + R.dia + ' de 60' + (R.padrinhoNome ? ' · padrinho: ' + prim(R.padrinhoNome) : '') + ' · meta ' + (meta || 3) + ' clientes em ' + mes, st: 'atual', crit,
          barra: { pct: Math.max(0, Math.min(100, Math.round((R.dia / 60) * 100))), t: 'dia ' + R.dia + ' de 60 · formatura em ' + ddmm(formatura) },
          proximo: atual ? 'Próximo passo: fechar a ' + atual.curto + (R.padrinhoNome ? ' com ' + prim(R.padrinhoNome) : '') + ' até ' + ddmm(fimFase) + '.' : 'Próximo passo: a formatura no dia 60.' },
        { t: 'Pleno', s: 'depois da formatura · meta de 8 clientes', st: 'futuro', crit: [], barra: null, proximo: null },
        { t: 'Líder de praça', s: '4 critérios, medidos todo mês', st: 'futuro', crit: [], barra: null, proximo: null },
      ],
    };
  }
  const crit = criteriosDeLider(q);
  const n = crit.filter((c) => c.ok).length;
  const falta = crit.find((c) => !c.ok);
  return {
    fora: false, fonte: null, onde: 'pleno · líder em ' + n + ' de 4', liderN: n,
    degraus: [
      { t: 'Rampa', s: C.formadaEm ? 'formada em ' + ddmm(C.formadaEm) : 'formada', st: 'feito', crit: [], barra: null, proximo: null },
      { t: 'Pleno', s: 'meta de ' + (meta == null ? '—' : meta) + ' clientes · ' + (vendas == null ? '—' : vendas) + ' de ' + (meta == null ? '—' : meta) + ' em ' + mes, st: 'atual', crit: [], barra: null, proximo: null },
      { t: 'Líder de praça · ' + n + ' de 4', s: n === 3 ? 'Falta 1 critério.' : 'Os critérios são os mesmos que o gestor vê.', st: 'futuro', crit, barra: null,
        proximo: !crit.length ? null : falta ? 'Próximo passo: ' + falta.s + '.' : 'Próximo passo: os 4 critérios estão cumpridos; a promoção é conversa do 1:1.' },
    ],
  };
}
export type VMPlaybook = { fora: boolean; nivel: number; total: number; completa: boolean; feitos: boolean[]; titulo: string; sub: string; proximo: string | null; ganhoEm: string | null };
/* o nível é o capítulo em que a pessoa está (o mesmo "Nível N" da Pessoas do gestor): capítulo feito =
   quiz aprovado em todas as páginas dele. Ler sem passar no quiz não sobe. */
export function nivelPlaybook(q: Quadro, capitulos: Capitulo[]): VMPlaybook {
  if (!q.playbook || !capitulos || !capitulos.length) return { fora: true, nivel: 0, total: 0, completa: false, feitos: [], titulo: 'Playbook · —', sub: (q.fontes.playbook || 'playbook_progresso') + ' não respondeu', proximo: null, ganhoEm: null };
  const em: Record<string, string> = {};
  q.playbook.forEach((x) => { em[x.slug] = x.em; });
  const feitos = capitulos.map((c) => c.paginas.length > 0 && c.paginas.every((p) => !!em[p]));
  let nivel = feitos.indexOf(false); nivel = nivel < 0 ? capitulos.length + 1 : nivel + 1;
  const completa = nivel > capitulos.length;
  /* o dia em que subiu: a última prova do capítulo que fechou o nível atual */
  const ult = nivel > 1 ? capitulos[nivel - 2].paginas.map((p) => em[p]).filter(Boolean).sort().pop() || null : null;
  const prox = completa ? null : capitulos[nivel - 1].titulo;
  return {
    fora: false, nivel, total: capitulos.length, completa, feitos,
    titulo: completa ? 'Playbook · trilha completa' : 'Playbook · nível ' + nivel + ' de ' + capitulos.length,
    sub: completa ? 'todos os capítulos com o quiz aprovado' : 'próximo capítulo: ' + prox + ' · quiz de 5 min · passar sobe o nível e ele aparece no seu perfil',
    proximo: prox, ganhoEm: ult ? dia(ult) : null,
  };
}

// ── 8 · a coleção ─────────────────────────────────────────────────────────────────────────────
const NOME_COMBINADO: Record<number, { t: string; como: string }> = {
  1: { t: 'A porta é provada', como: 'das visitas com prova' },
  3: { t: 'Ficha na hora', como: 'em até 15 min' },
  4: { t: 'Visita com o dono', como: 'das ausências com volta marcada' },
};
export type Medalha = { id: string; t: string; icone: string; ganha: boolean; nova: boolean; em: string | null; d: string; progresso: string; pctProgresso: number };
export type VMColecao = { fora: boolean; fonte: string | null; n: string; itens: Medalha[]; reconhecimento: string | null };
const ultimaCom = (G: Ganha[], prefixo: string) => G.filter((g) => g.id === prefixo || g.id.indexOf(prefixo + ':') === 0).sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0))[0] || null;
export function colecao(q: Quadro, capitulos: Capitulo[]): VMColecao {
  const C = q.colecao;
  if (!C) { const f = q.fontes.colecao || 'conquistas'; return { fora: true, fonte: f, n: '—', itens: [], reconhecimento: null }; }
  const G = C.ganhas || [], P = C.progresso, M = q.missao, H = q.habilidade, pb = nivelPlaybook(q, capitulos);
  const novato = q.pessoa.fase === 'novato';
  const mes = q.hoje.slice(0, 7);
  const seq = (n: number, alvo: number) => ({ progresso: Math.min(n, alvo) + ' de ' + alvo + ' dias', pctProgresso: Math.round((Math.min(n, alvo) / alvo) * 100) });
  const missao = (id: string) => (M && M.id === id ? { progresso: M.n + ' de ' + M.alvo + ' dias', pctProgresso: Math.round((M.n / M.alvo) * 100) } : { progresso: 'quando for a missão da semana', pctProgresso: 0 });
  const h = H && H.habilidade;
  const L = q.carreira && q.carreira.lider;
  const afAberto = L ? (L.afilhados || []).find((a) => !(a.fases && a.fases.rua && a.fases.rua.aprovadaEm)) : null;
  const dest = ultimaCom(G, 'destaque');
  const destComb = dest && dest.detalhe ? NOME_COMBINADO[Number(dest.detalhe.combinado)] : null;
  type Def = { id: string; t: string; icone: string; g: Ganha | null; ganhoEm?: string | null; prog: { progresso: string; pctProgresso: number }; mostrar?: boolean };
  const defs: Def[] = [
    { id: 'na_rua', t: 'Na rua 5 dias seguidos', icone: 'flame', g: ultimaCom(G, 'na_rua'), prog: seq(P.na_rua, 5) },
    { id: 'primeiro_contrato', t: 'Primeiro contrato do mês', icone: 'trophy', g: G.find((x) => x.id === 'primeiro_contrato:' + mes) || null, prog: { progresso: '0 de 1 venda em ' + mesNome(q.hoje), pctProgresso: 0 } },
    { id: 'destaque', t: 'Destaque da sexta' + (destComb ? ' · ' + destComb.t : ''), icone: 'star', g: dest, prog: { progresso: 'ainda não', pctProgresso: 0 } },
    { id: 'missao:porta', t: 'Porta provada', icone: 'map-pin', g: ultimaCom(G, 'missao:porta'), prog: missao('porta') },
    { id: 'playbook', t: 'Playbook nível ' + Math.max(2, pb.nivel), icone: 'book', g: null, ganhoEm: pb.nivel >= 2 ? pb.ganhoEm : null,
      prog: { progresso: pb.fora ? '—' : 'passe no quiz do capítulo ' + Math.max(1, pb.nivel), pctProgresso: 0 } },
    { id: 'missao:naHora', t: 'Registro na hora', icone: 'clock', g: ultimaCom(G, 'missao:naHora'), prog: missao('naHora') },
    { id: 'fila_zerada', t: 'Fila zerada 5 dias', icone: 'check-circle', g: ultimaCom(G, 'fila_zerada'), prog: seq(P.fila_zerada, 5) },
    { id: 'missao:fila', t: 'Fila zerada na semana', icone: 'check-circle', g: ultimaCom(G, 'missao:fila'), prog: missao('fila') },
    { id: 'missao:dono', t: 'Volta marcada', icone: 'users', g: ultimaCom(G, 'missao:dono'), prog: missao('dono') },
    { id: 'quentes_4', t: '4 contatos em todos os quentes', icone: 'users', g: ultimaCom(G, 'quentes_4'),
      prog: !P.quentes ? { progresso: '—', pctProgresso: 0 } : !P.quentes.medido || !P.quentes.de ? { progresso: 'sem quentes', pctProgresso: 0 } : { progresso: P.quentes.n + ' de ' + P.quentes.de + ' quentes', pctProgresso: Math.round((P.quentes.n / P.quentes.de) * 100) } },
    { id: 'demo_seguidas', t: 'Demo 3 dias seguidos', icone: 'zap', g: ultimaCom(G, 'demo_seguidas'), prog: seq(P.demo_seguidas, 3) },
    { id: 'missao:novato', t: 'Primeira semana no ritmo', icone: 'map-pin', g: ultimaCom(G, 'missao:novato'), prog: missao('novato'), mostrar: novato || !!ultimaCom(G, 'missao:novato') },
    { id: 'habilidade', t: h ? (TAXAS[h.taxa] ? TAXAS[h.taxa].t : h.taxa) + ' · ' + fmtTaxa(h.taxa, Number(h.meta)) : 'Habilidade do mês batida', icone: 'target', g: G.find((x) => x.id === 'habilidade:' + mes) || null,
      prog: novato ? { progresso: 'depois da formatura', pctProgresso: 0 } : !h ? { progresso: 'sem habilidade combinada', pctProgresso: 0 }
        : H!.agora == null ? { progresso: '— de ' + fmtTaxa(h.taxa, Number(h.meta)), pctProgresso: 0 }
        : { progresso: fmtTaxa(h.taxa, H!.agora) + ' de ' + fmtTaxa(h.taxa, Number(h.meta)), pctProgresso: Math.min(100, Math.round((H!.agora / Math.max(1, Number(h.meta))) * 100)) } },
    { id: 'padrinho', t: 'Padrinho de um formado', icone: 'shield-check', g: ultimaCom(G, 'padrinho'),
      prog: novato ? { progresso: 'depois de formado', pctProgresso: 0 } : afAberto ? { progresso: prim(afAberto.nome) + ' no dia ' + Math.min(60, diasEntre(afAberto.inicio, q.hoje) + 1) + ' de 60', pctProgresso: Math.round((Math.min(60, diasEntre(afAberto.inicio, q.hoje) + 1) / 60) * 100) } : { progresso: 'sem afilhado', pctProgresso: 0 } },
  ];
  const itens: Medalha[] = defs.filter((x) => x.mostrar !== false).map((x) => {
    const em = x.g ? dia(x.g.em) : x.ganhoEm || null;
    const ganha = !!em;
    const nova = !!(x.g && !x.g.vista);
    return { id: x.id, t: x.t, icone: x.icone, ganha, nova, em,
      d: !ganha ? '' : nova && em === q.hoje ? 'novo · hoje' : nova ? 'novo · ganha em ' + ddmm(em!) : 'ganha em ' + ddmm(em!),
      progresso: ganha ? '' : x.prog.progresso, pctProgresso: ganha ? 0 : x.prog.pctProgresso };
  });
  /* as ganhas primeiro; dentro de cada grupo, a ordem do catálogo */
  const ordenadas = itens.filter((x) => x.ganha).concat(itens.filter((x) => !x.ganha));
  const R = C.reconhecimento, nc = R ? NOME_COMBINADO[R.combinado] : null;
  return {
    fora: false, fonte: null, n: ordenadas.filter((x) => x.ganha).length + ' de ' + ordenadas.length + ' ganhas', itens: ordenadas,
    reconhecimento: R && nc ? 'Você foi o destaque da semana em ' + nc.t + ' (' + R.pct + '% ' + nc.como + ') · ' + diaCurto(R.sexta) : null,
  };
}
/** As conquistas que a pessoa ainda não viu (o toast e o selo "1 nova"), com o nome da coleção. */
export function conquistasNovas(q: Quadro, capitulos: Capitulo[]): Array<{ id: string; titulo: string }> {
  const C = q.colecao;
  if (!C) return [];
  const col = colecao(q, capitulos);
  return (C.ganhas || []).filter((g) => !g.vista).map((g) => {
    const base = g.id.indexOf('missao:') === 0 ? g.id.split(':').slice(0, 2).join(':') : g.id.split(':')[0];
    const m = col.itens.find((x) => x.id === base);
    const nome = m ? m.t : base;
    return { id: g.id, titulo: (base.indexOf('missao:') === 0 ? 'Selo ' : 'Medalha ') + nome };
  });
}
export const toastDaConquista = (n: { titulo: string }) => ({ kicker: 'CONQUISTA DESBLOQUEADA', titulo: n.titulo, acao: 'ver a coleção' });

// ── 1 · o 1:1 em uma linha ────────────────────────────────────────────────────────────────────
export type VMUmAUm = { convite: boolean; texto: string; itens: Array<{ tom: Tom; t: string }> };
export function umAUmLinha(q: Quadro, capitulos: Capitulo[]): VMUmAUm {
  const U = q.umAUm;
  if (!U) return { convite: true, texto: '— · ' + (q.fontes.umAUm || 'um_a_um') + ' não respondeu', itens: [] };
  const quando = U.proximo === q.hoje ? 'hoje ' + U.hora : DIAS_LONGOS[dow(U.proximo)] + ' ' + ddmm(U.proximo) + ' ' + U.hora;
  if (!U.ultimo) return { convite: true, texto: 'Ainda sem 1:1 registrado. Combine o primeiro com o seu gestor na ' + DIAS_LONGOS[dow(U.proximo)] + ': ele começa pelo que você conquistou.', itens: [] };
  /* o 1:1 começa pelo que a pessoa conquistou: as medalhas desde o último, a missão e a habilidade */
  const col = q.colecao ? colecao(q, capitulos) : null;
  const desde = col ? col.itens.filter((m) => m.ganha && m.em && m.em > dia(U.ultimo!)) : [];
  const mi = missaoDaSemana(q);
  const itens: VMUmAUm['itens'] = desde.map((m) => ({ tom: 'ok' as Tom, t: m.t + ' · ganha em ' + ddmm(m.em!) }));
  if (!mi.fora) itens.push({ tom: mi.cumprida ? 'ok' : 'rota', t: 'Missão da semana · ' + mi.selo + ' · ' + (mi.cumprida ? 'cumprida' : mi.contagem) });
  const nMed = desde.filter((m) => m.id.indexOf('missao:') !== 0).length;
  const nMis = desde.filter((m) => m.id.indexOf('missao:') === 0).length + (mi.cumprida && !desde.some((m) => m.id === 'missao:' + mi.id) ? 1 : 0);
  const partes = [nMed ? pl(nMed, 'medalha', 'medalhas') : '', nMis ? pl(nMis, 'missão cumprida', 'missões cumpridas') : !mi.fora ? '1 missão em curso' : ''].filter(Boolean);
  return { convite: false, texto: 'Seu 1:1 é ' + quando + ' · leve: ' + (partes.length ? partes.join(' · ') : 'a semana'), itens };
}

// ── 9 · você contra você ──────────────────────────────────────────────────────────────────────
export type VMVs = Array<{ v: string; t: string; s: string }>;
export function vsVoce(q: Quadro): VMVs {
  const S = q.semana, Q = q.sequencias, V = q.vsVoce, X = q.variavel;
  const rec = Q ? Q.rua.recorde : null;
  if (q.pessoa.fase === 'novato') {
    return [
      { v: S ? S.pts + ' pts' : '—', t: 'esta semana', s: S ? (S.passada ? S.passada.pts + ' na passada' : 'a primeira semana') : (q.fontes.semana || 'placar_da_semana') },
      { v: rec == null ? '—' : pl(rec, 'dia', 'dias'), t: 'sua maior sequência na rua', s: Q && Q.rua.atual > 0 && Q.rua.atual === Q.rua.recorde ? 'é agora' : '' },
      { v: X ? X.vendas + ' de ' + X.meta : '—', t: 'clientes no mês', s: 'meta de ' + mesNome(q.hoje) },
    ];
  }
  const segunda = !!(S && q.hoje === S.segunda);
  const ant = MESES[(Number(q.hoje.slice(5, 7)) + 10) % 12];
  return [
    { v: S && S.recorde ? S.recorde.pts + ' pts' : '—', t: segunda && S && S.recorde ? 'sua melhor semana: dá para bater' : 'sua melhor semana', s: S && S.recorde ? 'semana de ' + ddmm(S.recorde.segunda) : 'ainda sem semana fechada' },
    { v: rec == null ? '—' : pl(rec, 'dia', 'dias'), t: 'seu recorde de sequência na rua', s: Q ? (Q.rua.atual > 0 && Q.rua.atual === rec ? 'é agora' : 'agora: ' + pl(Q.rua.atual, 'dia', 'dias')) : (q.fontes.sequencias || '') },
    V ? { v: V.vendasMes + ' × ' + V.vendasMesAnterior, t: 'vendas: ' + mesNome(q.hoje) + ' × ' + ant, s: 'até o ' + V.diaDoMes + 'º dia do mês' } : { v: '—', t: 'vendas no mês', s: q.fontes.vsVoce || 'pontos_eventos' },
  ];
}

// ── as entradas: a pílula do Hoje e os pushes da semana ───────────────────────────────────────
export function pilula(q: Quadro): string {
  const M = q.missao, S = q.sequencias;
  const a = !M ? 'Missão —' : M.cumpridaEm ? 'Missão cumprida' : 'Missão ' + M.n + ' de ' + M.alvo;
  const b = !S ? 'Na rua —' : 'Na rua ' + pl(S.rua.atual, 'dia', 'dias');
  return a + ' · ' + b;
}
export function pushSegunda(q: Quadro): { titulo: string; texto: string } | null {
  const M = q.missao;
  if (!M) return null;
  const T = MISSOES[M.id] || MISSOES.naHora;
  return { titulo: 'Sua missão da semana', texto: T.titulo + ' · ' + pl(M.alvo, 'dia', 'dias') + ' · selo ' + T.selo };
}
/* abaixo do 3º, o push diz a posição e o recorde; nunca "último" (regra 3 do README) */
export function pushSexta(q: Quadro): { titulo: string; texto: string } | null {
  const S = q.semana;
  if (!S) return null;
  const novato = q.pessoa.fase === 'novato';
  const rec = S.recorde ? S.recorde.pts : null;
  const fim = rec != null && S.pts > rec ? ' · é o seu novo recorde' : rec != null ? ' · seu recorde é ' + rec : '';
  if (novato || S.pos == null) return { titulo: 'A sua semana fechou', texto: 'Você fechou a semana com ' + S.pts + ' pts' + (S.passada ? ' · na passada foram ' + S.passada.pts : '') + fim };
  return { titulo: 'A sua semana fechou', texto: 'Você fechou a semana com ' + S.pts + ' pts, ' + S.pos + 'º' + fim };
}

// ── a tela inteira ────────────────────────────────────────────────────────────────────────────
export type VM = {
  cab: { sub: string; selos: Array<{ t: string; tom: 'pri' | 'rota' }> };
  umAUm: VMUmAUm; semana: VMSemana; missao: VMMissao; sequencias: VMSequencias; variavel: VMVariavel;
  habilidade: VMHabilidade; carreira: VMCarreira; playbook: VMPlaybook; colecao: VMColecao; vs: VMVs;
  pilula: string; novas: Array<{ id: string; titulo: string }>;
};
export function montarDesenvolvimento(q: Quadro, capitulos: Capitulo[]): VM {
  const pb = nivelPlaybook(q, capitulos);
  const R = q.carreira && q.carreira.rampa;
  return {
    cab: {
      sub: (prim(q.pessoa.nome) || 'Você') + ' · onde você está, o que ganha a seguir e quanto falta',
      selos: [{ t: q.pessoa.fase === 'novato' ? (R ? 'Rampa · dia ' + R.dia + ' de 60' : 'Rampa') : 'Pleno', tom: 'pri' },
        { t: pb.fora ? 'Playbook —' : pb.completa ? 'Playbook completo' : 'Playbook nível ' + pb.nivel, tom: 'rota' }],
    },
    umAUm: umAUmLinha(q, capitulos), semana: semanaDoExecutivo(q), missao: missaoDaSemana(q), sequencias: sequencias(q),
    variavel: escadaDoVariavel(q), habilidade: habilidadeDoMes(q), carreira: carreira(q), playbook: pb,
    colecao: colecao(q, capitulos), vs: vsVoce(q), pilula: pilula(q), novas: conquistasNovas(q, capitulos),
  };
}
