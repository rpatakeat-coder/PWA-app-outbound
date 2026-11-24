// O HOJE DO EXECUTIVO NO CELULAR = O HOJE DO COCKPIT (Julyan, 24/11/26: "a aba Hoje do executivo no celular
// tem que ser a mesma da aba Hoje do Cockpit: comissão, visitas, etc."). As contas abaixo são as do módulo
// GV2.H5 do template do cockpit-unificado (bloco "h5:js"), linha a linha, sobre as fontes que o app já lê:
//   · o dia: as paradas de hoje (field_route_stops) e as visitas com prova (visitas_com_prova);
//   · o dinheiro e a meta: desenvolvimento_quadro().variavel (as faixas são o comissionamento.json do Cockpit);
//   · a missão e a sequência: desenvolvimento_quadro() pelas mesmas funções do Cockpit (_compartilhado);
//   · o que cobrar: a fila (semProximoPassoDaFila, a regra canônica do "sem próximo passo") por etapa;
//   · a semana: placar_da_semana, a mesma leitura do Cockpit.
// Nada aqui lê nem grava: é conta pura, provada em hojeComoCockpit.teste.ts.
import { faixaDe, menorAcao, reais, totalDe, type Faixa } from '../../supabase/functions/_compartilhado/desenvolvimentoV2';

export const META_DEMO = 1;
export const VISTAS = 5;
export const COBRAR = 4;
export const FECHO_MIN = 18 * 60;
export type Hora = 'antes' | 'rua' | 'fecho';
export const HORAS: Array<[Hora, string]> = [['antes', 'Antes de sair'], ['rua', 'Na rua'], ['fecho', 'Fecho']];

const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const prim = (nome: string | null | undefined) => String(nome || '').split(' ')[0];
const lista = (xs: string[]) => (xs.length <= 1 ? xs[0] || '' : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]);
export const ord = (n: number) => `${n}ª`;
/** "14:30" vira "14h30"; "16:00" vira "16h" */
export const hh = (h: string | null | undefined) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? Number(m[1]) + 'h' + (m[2] === '00' ? '' : m[2]) : ''; };
const minDe = (h: string | null | undefined) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const somaDias = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00Z').getUTCDay();
export const ehUtil = (iso: string, feriados: string[]) => { const w = dow(iso); return w > 0 && w < 6 && feriados.indexOf(iso) < 0; };
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// ── o mês: dias úteis, o esperado até hoje e o ritmo (H5.mes) ──────────────────────────────────
export type Mes = { cli: number; meta: number; uteis: number; ate: number; esperado: number; falta: number; restam: number; ritmo: { k: 'ok' | 'av'; t: string } | null; pct: number; pctEsp: number };
export function mes(cli: number, meta: number, hoje: string, feriados: string[]): Mes {
  let uteis = 0, ate = 0;
  for (let d = hoje.slice(0, 8) + '01'; d.slice(0, 7) === hoje.slice(0, 7); d = somaDias(d, 1)) { if (!ehUtil(d, feriados)) continue; uteis++; if (d <= hoje) ate++; }
  const esperado = uteis ? Math.round(meta * ate / uteis) : meta;
  const falta = Math.max(0, meta - cli), restam = Math.max(0, uteis - ate);
  const ritmo = !meta ? null : cli >= meta ? { k: 'ok' as const, t: 'meta batida' } : cli >= esperado ? { k: 'ok' as const, t: 'no ritmo' } : { k: 'av' as const, t: 'abaixo do ritmo' };
  return { cli, meta, uteis, ate, esperado, falta, restam, ritmo, pct: meta ? Math.min(100, Math.round(100 * cli / meta)) : 0, pctEsp: meta ? Math.min(100, Math.round(100 * esperado / meta)) : 0 };
}

// ── a hora e as paradas (H5.horaAuto, H5.proxima, H5.paradas, H5.rodape) ───────────────────────
export const horaAuto = (min: number, visitasHoje: number): Hora => (min >= FECHO_MIN ? 'fecho' : visitasHoje > 0 ? 'rua' : 'antes');
export type ParadaIn = { id: string; nome: string; sub: string; feita: boolean; hora: string | null };
export type Parada = { n: number; id: string; nome: string; sub: string; feita: boolean; fixa: string | null; est: { k: 'ok' | 'av' | 'prox' | 'fixo' | 'nd'; t: string } };
/** A próxima: a 1ª que falta, na ordem do plano; o horário fixo fura a ordem quando a 1ª que falta também tem
 *  hora (vale a mais cedo) ou quando um horário fixo está a menos de uma hora (ou já passou). */
export function proxima(plano: ParadaIn[], min: number | null): number {
  const falta = plano.map((c, i) => ({ i, m: minDe(c.hora), feita: c.feita })).filter((x) => !x.feita);
  if (!falta.length) return -1;
  const fixas = falta.filter((x) => x.m != null).sort((a, b) => a.m! - b.m! || a.i - b.i);
  if (fixas.length && (falta[0].m != null || (min != null && fixas[0].m! - min <= 60))) return fixas[0].i;
  return falta[0].i;
}
export function paradas(plano: ParadaIn[], hora: Hora, min: number): Parada[] {
  const prox = hora === 'rua' ? proxima(plano, min) : -1;
  return plano.map((c, i) => {
    const fixa = c.hora || null;
    let est: Parada['est'];
    if (c.feita) est = { k: 'ok', t: 'feita no app' };
    else if (hora === 'fecho') est = { k: 'av', t: 'ficou para trás' };
    else if (i === prox) est = { k: 'prox', t: 'a próxima' + (fixa ? ' · ' + hh(fixa) : '') };
    else if (fixa) est = { k: 'fixo', t: 'horário fixo · ' + hh(fixa) };
    else est = { k: 'nd', t: 'a fazer' };
    return { n: i + 1, id: c.id, nome: c.nome, sub: c.sub, feita: c.feita, fixa, est };
  });
}
export function rodape(ps: Parada[], hora: Hora): { rot: string; tom: 'av' | 'nd'; t: string } {
  const curto = (p: Parada) => p.nome + ' às ' + hh(p.fixa);
  if (hora === 'fecho') {
    const ficou = ps.filter((p) => !p.feita);
    return { rot: 'para fechar', tom: 'av', t: !ficou.length ? 'Dia fechado: nada para registrar.' : ficou.length === 1 ? 'A que ficou para trás volta para a fila de amanhã.' : 'As ' + ficou.length + ' que ficaram para trás voltam para a fila de amanhã.' };
  }
  const fix = ps.filter((p) => !p.feita && p.fixa).sort((a, b) => (minDe(a.fixa) || 0) - (minDe(b.fixa) || 0));
  if (!fix.length) return { rot: 'vence hoje', tom: 'nd', t: 'Nenhum horário fixo hoje.' };
  if (hora === 'rua' || fix.length === 1) return { rot: 'vence hoje', tom: 'nd', t: curto(fix[0]) + ', horário fixo.' + (fix.length > 1 ? ' Depois, ' + lista(fix.slice(1).map(curto)) + '.' : '') };
  return { rot: 'vence hoje', tom: 'nd', t: fix.length + ' horários fixos: ' + lista(fix.map(curto)) + '.' };
}

// ── o dinheiro (H5.dinheiro + comissaoDe): só o variável, sempre cheio ─────────────────────────
export type Dinheiro = {
  total: number; clientes: number; porCliente: number; proxima: number; proximaN: number; meta: number;
  degrau: { clientes: number; porCliente: number; total: number; salto: number } | null;
  naMeta: { clientes: number; total: number; rende: number } | null;
  escada: Array<{ n: number; k: 'feita' | 'prox' | 'futura' }>;
};
export function dinheiro(V: { vendas: number; meta: number; faixas: Faixa[] } | null | undefined): Dinheiro | null {
  if (!V || !Array.isArray(V.faixas) || !V.faixas.length) return null;
  const faixas = V.faixas.slice().sort((a, b) => Number(a.de) - Number(b.de));
  const n = Math.max(0, Math.floor(Number(V.vendas) || 0)), meta = Number(V.meta) || 0;
  const total = (k: number) => totalDe(faixas, k);
  const f = faixaDe(faixas, n) ?? faixaDe(faixas, n + 1);
  let degrau: Dinheiro['degrau'] = null;
  for (const x of faixas) {
    const de = Number(x.de) || 0;
    if (de > n && (degrau == null || de < degrau.clientes)) degrau = { clientes: de, porCliente: Number(x.porCliente) || 0, total: total(de), salto: total(de) - total(de - 1) };
  }
  const topo = Math.max(meta, n + 1);
  const escada: Dinheiro['escada'] = [];
  for (let i = 1; i <= Math.min(topo, 16); i++) escada.push({ n: i, k: i <= n ? 'feita' : i === n + 1 ? 'prox' : 'futura' });
  return {
    total: total(n), clientes: n, porCliente: f ? Number(f.porCliente) || 0 : 0, proxima: total(n + 1) - total(n), proximaN: n + 1, meta, degrau,
    naMeta: meta && n < meta ? { clientes: meta, total: total(meta), rende: total(meta) - total(meta - 1) } : null, escada,
  };
}
export function legendaDoDinheiro(x: Dinheiro): string {
  return x.clientes
    ? pl(x.clientes, 'cliente', 'clientes') + ' a ' + reais(x.porCliente) + (x.degrau ? ' · na ' + ord(x.degrau.clientes) + ' a faixa sobe para todos' : ' · você está na última faixa')
    : 'cada cliente vale ' + reais(x.porCliente) + (x.degrau ? ' · na ' + ord(x.degrau.clientes) + ' a faixa sobe para todos' : '');
}

// ── a meta em ação (H5.metaHTML + GV2.cvProjecao) ─────────────────────────────────────────────
export type Projecao = { faltam: number; meta: number; semTaxa?: boolean; portas?: number; demos?: number } | null;
export function projecao(portas: number | null, demos: number | null, fechado: number, meta: number): Projecao {
  const cli = Number(fechado) || 0, m = Number(meta) || 0;
  if (!m) return null;
  const faltam = Math.max(0, m - cli);
  if (!faltam) return { faltam: 0, meta: m };
  if (!cli) return { faltam, meta: m, semTaxa: true };
  return { faltam, meta: m, portas: Math.ceil(faltam * (Number(portas) || 0) / cli), demos: Math.ceil(faltam * (Number(demos) || 0) / cli) };
}
export function textoDaMeta(m: Mes, J: Projecao, contaPronta: boolean): { l1: string; l2: string; legenda: string } {
  if (!m.meta) return { l1: pl(m.cli, 'cliente', 'clientes') + ' no mês', l2: 'sem meta neste mês', legenda: '' };
  const l1 = m.falta ? (m.falta === 1 ? 'Falta 1 cliente' : 'Faltam ' + m.falta + ' clientes') + ' em ' + pl(m.restam, 'dia útil', 'dias úteis') + '.' : 'Meta batida: ' + m.cli + ' de ' + m.meta + '.';
  let l2: string;
  if (!m.falta) l2 = 'O que vier agora já sobe a faixa da comissão.';
  else if (J && J.faltam && !J.semTaxa && J.portas != null) l2 = 'No seu ritmo, isso pede ' + pl(J.portas, 'porta', 'portas') + ' e ' + pl(J.demos ?? 0, 'demo', 'demos') + '.';
  else if (J && J.semTaxa) l2 = 'Pelo playbook, isso pede ' + (J.faltam * 15) + ' portas e ' + Math.ceil(J.faltam * 2.5) + ' demos.';
  else l2 = contaPronta ? 'A conta de portas e demos está na aba Eu.' : '';
  return { l1, l2, legenda: m.cli + ' de ' + m.meta + ' · o risco é o esperado até hoje (' + m.esperado + ')' };
}

// ── a frase do topo (H5.frase) ──────────────────────────────────────────────────────────────
export type DiaDaFrase = { visitas: number; meta: number; demos: number; metaDemo: number; semPlano: boolean; paradas: Parada[] };
export function frase(hora: Hora, d: DiaDaFrase, m: Mes, din: Dinheiro | null): string {
  const faltaV = Math.max(0, d.meta - d.visitas), faltaD = Math.max(0, d.metaDemo - d.demos);
  const oDia = () => [faltaV ? pl(faltaV, 'visita', 'visitas') : '', faltaD ? (faltaD === 1 ? 'a demo de hoje' : faltaD + ' demos') : ''].filter(Boolean);
  if (hora === 'fecho') {
    const ficou = d.paradas.filter((p) => !p.feita).length;
    const resto = ficou ? (ficou === 1 ? '1 parada ficou para trás' : ficou + ' paradas ficaram para trás') : '';
    const fechou = d.visitas > d.meta ? 'O dia fechou com ' + d.visitas + ' visitas, acima da meta de ' + d.meta + '.' : 'O dia fechou com ' + d.visitas + ' de ' + d.meta + (d.meta === 1 ? ' visita' : ' visitas') + '.';
    return fechou + (resto ? ' ' + resto + '.' : '');
  }
  if (hora === 'rua') {
    const prox = d.paradas.find((p) => p.est.k === 'prox');
    const f = oDia();
    const a = prox ? 'A próxima é ' + prox.nome + (prox.fixa ? ', às ' + hh(prox.fixa) : '') + '.' : d.semPlano ? 'Sem plano para hoje.' : 'Todas as paradas do plano estão feitas.';
    return a + (f.length ? ' ' + (f.length === 2 ? 'Faltam ' + f.join(' e ') : (faltaV === 1 || (!faltaV && faltaD === 1) ? 'Falta ' : 'Faltam ') + f[0]) + '.' : ' A meta do dia está batida.');
  }
  const mesT = !m.meta ? '' : m.falta ? (m.falta === 1 ? 'Falta 1 cliente' : 'Faltam ' + m.falta + ' clientes') + ' em ' + pl(m.restam, 'dia útil', 'dias úteis') + '. ' : 'Meta do mês batida. ';
  return mesT + 'Hoje: ' + pl(d.meta, 'visita', 'visitas') + ' e ' + pl(d.metaDemo, 'demo', 'demos') + '.' + (din ? ' Sua próxima venda vale ' + reais(din.proxima) + '.' : '');
}

// ── o que cobrar, por etapa (H5.cobrar + HJ4.etapas) ─────────────────────────────────────────
/** índice da etapa: 0 Prospecção · 1 Visita · 2 Decisor · 3 Demo · 4 Negociação · 5 Ag. Pagamento */
export type NegocioDaEtapa = { etapaIdx: number; dias: number | null; regua: number | null; combinadoFuturo: boolean; /** a slaBreach do robô (a que o Cockpit lê); null = sem ela, vale a régua */ travado?: boolean | null };
export type Etapas = { por: Array<{ idx: number; total: number; parados: number; regua: number | null }>; pior: number | null; abertos: number; parados: number };
/** travado = passou da régua e não tem data combinada à frente (estadoDaRegua do robô); Ag. Pagamento fora */
export function etapas(negocios: NegocioDaEtapa[]): Etapas {
  const por = [0, 1, 2, 3, 4, 5].map((idx) => ({ idx, total: 0, parados: 0, regua: null as number | null }));
  for (const n of negocios) {
    const e = por[n.etapaIdx];
    if (!e) continue;
    e.total++;
    if (n.regua != null) e.regua = n.regua;
    const parado = typeof n.travado === 'boolean' ? n.travado : n.dias != null && n.regua != null && n.dias > n.regua && !n.combinadoFuturo;
    if (n.etapaIdx !== 5 && parado) e.parados++;
  }
  let pior: (typeof por)[number] | null = null;
  for (const e of por) { if (e.idx === 5 || !e.parados) continue; if (!pior || e.parados >= pior.parados) pior = e; }
  return { por, pior: pior ? pior.idx : null, abertos: negocios.length, parados: por.reduce((a, e) => a + (e.idx === 5 ? 0 : e.parados), 0) };
}
export type LeadACobrar<T> = { etapaIdx: number; item: T };
export type LinhaACobrar<T> = { idx: number; n: number; parados: number; regua: number | null; pior: boolean; primeiro: T };
export function cobrar<T>(leads: Array<LeadACobrar<T>>, E: Etapas | null): { total: number; linhas: Array<LinhaACobrar<T>>; mais: number } {
  const por: Record<number, T[]> = {};
  for (const l of leads) { const i = l.etapaIdx; if (!(i >= 0 && i <= 4)) continue; (por[i] = por[i] || []).push(l.item); }
  const linhas = [4, 3, 2, 1, 0].filter((i) => por[i] && por[i].length).map((i) => {
    const e = E ? E.por[i] : null;
    return { idx: i, n: por[i].length, parados: e ? e.parados : 0, regua: e ? e.regua : null, pior: !!(E && E.pior === i), primeiro: por[i][0] };
  });
  return { total: leads.length, linhas: linhas.slice(0, COBRAR), mais: Math.max(0, linhas.length - COBRAR) };
}

// ── a semana (H5.semana) ─────────────────────────────────────────────────────────────────────
export type LinhaDoPlacar = { pos: number; nome: string; pontos: number; euMesmo?: boolean; visitas?: number; visitasForaDoTeto?: number };
export type Placar = { segunda: string; sexta?: string; domingo?: string; premio?: number | null; linhas: LinhaDoPlacar[] };
export type Semana = { eu: LinhaDoPlacar | null; acima: LinhaDoPlacar | null; n: number; todosZero: boolean; linhas: LinhaDoPlacar[]; todas: LinhaDoPlacar[]; premio: number | null; segunda: string; fim: string; falta: number | null };
export function semana(P: Placar | null | undefined): Semana | null {
  if (!P || !Array.isArray(P.linhas)) return null;
  const L = P.linhas, eu = L.find((x) => x.euMesmo) || null;
  const acima = eu && eu.pos > 1 ? L.find((x) => x.pos === eu.pos - 1) || L[eu.pos - 2] || null : null;
  const todosZero = !L.some((x) => Number(x.pontos) > 0);
  const top = L.slice(0, 5);
  const fim = P.domingo || (P.sexta ? somaDias(P.sexta, 2) : somaDias(P.segunda, 6));
  return { eu, acima, n: L.length, todosZero, linhas: eu && eu.pos > 5 ? top.concat([eu]) : top, todas: L, premio: P.premio ?? null, segunda: P.segunda, fim,
    falta: eu && acima ? Math.max(1, (Number(acima.pontos) || 0) - (Number(eu.pontos) || 0) + 1) : null };
}
export function periodoDaSemana(S: Semana): string {
  const d = (iso: string) => DIAS[dow(iso)] + ' ' + iso.slice(8, 10);
  return d(S.segunda) + ' a ' + d(S.fim) + '/' + S.fim.slice(5, 7);
}
export function topoDaSemana(S: Semana): { pts: string; t: string } {
  const eu = S.eu;
  if (!eu) return { pts: '—', t: 'você não está no placar do time desta semana' };
  return { pts: eu.pontos + ' pts', t: S.todosZero ? 'a semana começou: todos em 0' : eu.pos + 'º de ' + S.n + (S.acima ? ' · o ' + S.acima.pos + 'º é ' + prim(S.acima.nome) + ', com ' + S.acima.pontos : ' · você lidera') };
}
/** a linha do bônus dentro de Meu dinheiro (V.bonus do Cockpit) */
export function textoDoBonus(S: Semana | null): string | null {
  if (!S || !S.eu) return null;
  const eu = S.eu;
  const t = S.todosZero ? 'a semana começou: a 1ª visita com prova já põe você no placar.'
    : eu.pos === 1 ? 'você lidera a semana' + (S.todas[1] ? ', ' + ((Number(eu.pontos) || 0) - (Number(S.todas[1].pontos) || 0)) + ' pts à frente de ' + prim(S.todas[1].nome) + '.' : '.')
      : S.acima ? (S.falta === 1 ? 'falta 1 pt' : 'faltam ' + S.falta + ' pts') + ' para passar ' + prim(S.acima.nome) + '. ' + menorAcao(S.falta ?? 1) : '';
  if (!t) return null;
  return 'Bônus da semana' + (S.premio != null ? ', ' + reais(S.premio) : '') + ': ' + t;
}
export function textoDoAcumulo(E: Etapas, rotulo: (idx: number) => string): string {
  return E.pior != null ? rotulo(E.pior) + ' é a mais entupida · ' + E.parados + (E.parados === 1 ? ' parado de ' : ' parados de ') + E.abertos : 'nenhuma entupida · ' + pl(E.abertos, 'aberto', 'abertos');
}
