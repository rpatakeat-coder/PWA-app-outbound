// A aba Eu enxuta (handoff "App de rua · abas Hoje e Eu, enxutas", 03/11/26): os textos novos do topo.
// Nenhum número nasce aqui: as vendas, a meta e as faixas são as de desenvolvimento_quadro().variavel
// (as faixas vêm do banco, comissionamento.json do Cockpit); a semana é a de desenvolvimento_quadro().semana.
// A conta da próxima venda é a mesma de escadaDoVariavel (_compartilhado/desenvolvimentoV2.ts): retroativa.
import { faixaDe, mesNome, menorAcao, reais, totalDe, type Quadro } from '../../supabase/functions/_compartilhado/desenvolvimentoV2';

const prim = (nome: string | null | undefined) => String(nome || '').trim().split(/\s+/)[0] || '';
const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export type TopoDaVariavel = {
  fora: boolean;
  kicker: string;
  /** R$ do mês até aqui */
  rs: string;
  rsSub: string;
  /** um degrau por venda até a meta (ou até as vendas, se passou) */
  degraus: Array<'feita' | 'proxima' | 'futura'>;
  /** o que falta, em vermelho-no-escuro */
  falta: string;
  /** a grade 2×2 */
  mes: { v: string; s: string };
  proxima: { v: string; s: string };
};

export function topoDaVariavel(q: Quadro): TopoDaVariavel {
  const V = q.variavel;
  const mes = mesNome((V?.mes ?? q.hoje.slice(0, 7)) + '-01');
  const Mes = mes.charAt(0).toUpperCase() + mes.slice(1);
  if (!V) {
    const f = q.fontes.variavel || 'HubSpot';
    return { fora: true, kicker: `${Mes} · a variável`, rs: '—', rsSub: `${f} não respondeu`, degraus: [], falta: 'O variável volta quando a fonte responder. Nenhuma venda se perde.', mes: { v: '—', s: f }, proxima: { v: '—', s: f } };
  }
  const faixas = (V.faixas || []).slice().sort((a, b) => Number(a.de) - Number(b.de));
  const v = Number(V.vendas) || 0, meta = Number(V.meta) || 0, nx = v + 1;
  const vale = totalDe(faixas, nx) - totalDe(faixas, v);
  const fHoje = faixaDe(faixas, v), fProx = faixaDe(faixas, nx);
  const muda = !!(fHoje && fProx && fHoje !== fProx);
  /* a faixa em que a pessoa está: a da próxima venda enquanto não vendeu nada (o 1º degrau) */
  const fAtual = fHoje ?? fProx;
  const nFaixa = fAtual ? faixas.indexOf(fAtual) + 1 : 1;
  const seguinte = faixas.find((f) => Number(f.de) > nx);
  let falta: string;
  if (meta > 0 && v >= meta) falta = `Meta batida: ${v} de ${meta}. Cada venda a mais vale +${reais(vale)}.`;
  else if (muda && fProx) falta = `A próxima venda muda a faixa: +${reais(Number(fProx.porCliente))} por venda.`;
  else if (seguinte && (!meta || Number(seguinte.de) <= meta)) falta = `Faltam ${pl(Number(seguinte.de) - v, 'venda', 'vendas')} para a faixa ${faixas.indexOf(seguinte) + 1} · a próxima vale +${reais(vale)}.`;
  else falta = `A próxima venda vale +${reais(vale)}.`;
  const ate = Math.max(meta, v);
  const degraus: TopoDaVariavel['degraus'] = [];
  for (let k = 1; k <= ate; k++) degraus.push(k <= v ? 'feita' : k === nx ? 'proxima' : 'futura');
  return {
    fora: false,
    kicker: `${Mes} · faixa ${nFaixa} da variável`,
    rs: reais(totalDe(faixas, v)),
    rsSub: `${pl(v, 'venda', 'vendas')} · meta ${meta}`,
    degraus, falta,
    mes: { v: reais(totalDe(faixas, v)), s: `${pl(v, 'contrato', 'contratos')} de ${meta}` },
    proxima: { v: `+${reais(vale)}`, s: muda ? 'muda a faixa' : `faixa ${nFaixa}` },
  };
}

export type LinhaDaSemana = { fora: boolean; linha: string; sub: string; lider: boolean; pts: string; pos: string };
/** "37 pts · 3º · faltam 10 para passar Gama" + a menor ação; a mesma conta do faltam() da folha da manhã. */
export function linhaDaSemana(q: Quadro): LinhaDaSemana {
  const S = q.semana;
  if (!S) { const f = q.fontes.semana || 'placar_da_semana'; return { fora: true, linha: `— · ${f} não respondeu`, sub: 'os seus pontos continuam contando', lider: false, pts: '—', pos: '—' }; }
  const pts = `${S.pts} pts`;
  if (q.pessoa.fase === 'novato') return { fora: false, linha: `${pts} · na rampa`, sub: S.passada ? `você contra você · ${S.passada.pts} na passada` : 'você contra você · a primeira semana', lider: false, pts, pos: 'rampa' };
  if (S.pos == null) return { fora: false, linha: `${pts} · fora do placar do bônus`, sub: 'estes são os seus pontos da semana', lider: false, pts, pos: '—' };
  const lider = S.podio.find((x) => x.pos === 1);
  if (S.pts <= 0 || !lider || lider.pts <= 0) {
    const passa = S.acima ? ` · ${Math.ceil((S.acima.pts - S.pts + 1) / 3)} visitas passam ${prim(S.acima.nome)}` : '';
    return { fora: false, linha: '0 pts · semana zerada', sub: `a 1ª visita com prova vale 3${S.pts <= 0 ? passa : ''}`, lider: false, pts, pos: `${S.pos}º` };
  }
  if (S.pos === 1) {
    const vant = S.segundo ? S.pts - S.segundo.pts : null;
    return { fora: false, linha: `${pts} · 1º${vant != null ? ` · lidera por ${vant}` : ''}`, sub: '1 demo hoje = +25', lider: true, pts, pos: '1º' };
  }
  if (!S.acima) return { fora: false, linha: `${pts} · ${S.pos}º`, sub: 'cada visita com prova soma 3', lider: false, pts, pos: `${S.pos}º` };
  const falta = S.acima.pts - S.pts + 1;
  const acao = menorAcao(falta).replace(/\.$/, '');
  return { fora: false, linha: `${pts} · ${S.pos}º · faltam ${falta} para passar ${prim(S.acima.nome)}`, sub: acao.charAt(0).toLowerCase() + acao.slice(1), lider: false, pts, pos: `${S.pos}º` };
}
