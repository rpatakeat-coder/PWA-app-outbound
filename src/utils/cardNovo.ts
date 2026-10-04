// Regras puras do card e da folha do mapa novo (entrega 4), sem React: são
// testadas em cardNovo.teste.ts.
import type { Client } from '../types/client';
import type { Pino } from './pinoP2';

export type ItemFolha = { c: Client; p: Pino; plano: number | null; distanciaM: number | null; feito: boolean };

export function distanciaTexto(m: number | null): string | null {
  if (m == null) return null;
  // de 100 km para cima a casa decimal é ruído ("1408,0 km" → "1.408 km")
  if (m >= 100000) return `${Math.round(m / 1000).toLocaleString('pt-BR')} km`;
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`;
}

type Fato = { texto: string; aviso?: boolean };

// O pino diz só "hoje / 5d / 12d parado" (cabe ao lado do nome); no card o
// mesmo número ganha o que ele mede — dias SEM TOQUE — porque logo abaixo o
// alerta de SLA fala em dias NA ETAPA, e "hoje" ao lado de "78 dias parado"
// parecia contradição (medido na ficha do JULYAN HOUSE, 25/09).
export function textoDoToque(t: string): string {
  if (t === 'cobrar') return 'cobrança vencida';
  if (t === 'hoje') return 'tocado hoje';
  const n = t.match(/^(\d+)d/);
  return n ? `${n[1]}d sem toque` : t;
}

/** `aproximado`: a MESMA conta do alerta de localização do card (não só geo_approximate). */
export function fatosDoCard(d: { client: Client; pino: Pino; distanciaM: number | null; aproximado?: boolean }): Fato[] {
  const { client: c, pino } = d;
  const f: Fato[] = [];
  const dist = distanciaTexto(d.distanciaM);
  if (dist) f.push({ texto: dist });
  if (pino.etiqueta && !pino.queda) f.push({ texto: textoDoToque(pino.etiqueta.texto), aviso: pino.etiqueta.texto === 'cobrar' || pino.etiqueta.texto.includes('parado') });
  f.push((d.aproximado ?? c.geo_approximate) ? { texto: '≈ posição aproximada', aviso: true } : { texto: 'posição exata' });
  f.push(c.telefone?.trim() ? { texto: c.telefone.trim() } : { texto: 'sem telefone', aviso: true });
  if (c.conta_alvo_rating != null) {
    const nota = Number(c.conta_alvo_rating).toFixed(1).replace('.', ',');
    f.push({ texto: c.conta_alvo_reviews != null ? `${nota}★ · ${c.conta_alvo_reviews} no Google` : `${nota}★ no Google` });
  }
  if (pino.tipo === 'ex') f.push({ texto: 'data de saída desconhecida' });
  return f;
}

/** "R$ 1,1 mi", "R$ 240 mil", "R$ 8 mil" — o tamanho do cliente numa palavra. */
export function faturamentoTexto(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)} mil`;
  return `R$ ${Math.round(v)}`;
}

/** Na linha da lista (cabe na etiqueta a 375 px): "−38% · R$ 651 mil" ou "7d sem comanda · R$ 80 mil". */
export function quedaCurta(q: { motivo: string; faturamento: number | null }): string {
  const pct = q.motivo.match(/-?\d+%/);
  const dias = q.motivo.match(/há (\d+) dias/);
  // A variação chega da fonte e às vezes vem impossível ("-1160437100%", 62 clientes em
  // 28/09): queda além de −100% não existe. Aí vale "queda forte", sem o número.
  const pctTexto = pct ? (Math.abs(parseInt(pct[0], 10)) > 100 ? 'queda forte' : pct[0].replace('-', '−')) : null;
  return [pctTexto, dias ? `${dias[1]}d sem comanda` : null,
    q.faturamento ? faturamentoTexto(q.faturamento) : null].filter(Boolean).join(' · ') || 'em queda';
}

/**
 * Linha do cliente na espiada do cartão (Julyan 27/09: "cliente, ex-cliente, quantas
 * comandas e em queda"). Vem da clientes-sync (0122): hs_situacao, hs_etapa_uso,
 * hs_qtd_comandas, hs_ultima_comanda_em, hs_cancelamento_solicitado_em. Lead não tem linha.
 * `tom`: 'ok' verde, 'aviso' vermelho, 'ex' rosa, nada = neutro.
 */
export type SinalCliente = { texto: string; tom?: 'ok' | 'aviso' | 'ex' };
export function sinaisDoCliente(c: Client, pino: Pino, hojeISO: string): SinalCliente[] {
  if (pino.tipo !== 'cliente' && pino.tipo !== 'ex') return [];
  const s: SinalCliente[] = [];
  const dia = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const diasDesde = (iso: string) => Math.round((Date.parse(`${hojeISO}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86400000);
  const etapa = c.hs_etapa_uso?.trim() || null;
  if (pino.tipo === 'ex') {
    const saiu = dia(c.hs_cancelamento_solicitado_em);
    s.push({ texto: saiu ? `Ex-cliente · cancelou em ${ddmm(saiu)}` : 'Ex-cliente', tom: 'ex' });
  } else if (etapa && /cancel|parada|risco/i.test(etapa)) {
    s.push({ texto: `Em risco · ${etapa}`, tom: 'aviso' });
  } else {
    s.push({ texto: etapa ? `Cliente ativo · ${etapa}` : 'Cliente ativo', tom: 'ok' });
  }
  if (c.hs_qtd_comandas != null) s.push({ texto: `${Number(c.hs_qtd_comandas).toLocaleString('pt-BR')} comandas` });
  const ult = dia(c.hs_ultima_comanda_em);
  if (ult) {
    const n = diasDesde(ult);
    s.push({ texto: n <= 0 ? 'comanda hoje' : n === 1 ? 'última comanda ontem' : `última comanda há ${n} dias`, tom: pino.tipo === 'cliente' && n >= 5 ? 'aviso' : undefined });
  } else if (pino.tipo === 'cliente') {
    s.push({ texto: 'sem comanda registrada' });
  }
  if (pino.queda) {
    const pct = pino.queda.motivo.match(/-?\d+%/);
    // variação impossível (< −100%) vira "queda forte", como na linha da folha
    if (pct) s.push({ texto: `↓ ${Math.abs(parseInt(pct[0], 10)) > 100 ? 'queda forte' : pct[0].replace('-', '−')} no bimestre${pino.queda.faturamento ? ` · ${faturamentoTexto(pino.queda.faturamento)}/mês` : ''}`, tom: 'aviso' });
    else if (pino.queda.faturamento) s.push({ texto: `${faturamentoTexto(pino.queda.faturamento)}/mês` });
  }
  return s;
}

function peso(it: ItemFolha): number {
  if (it.plano && it.feito) return 5; // parada já feita vai para o fim, mesmo perto
  if (it.plano && !it.feito) return 0;
  if (it.p.etiqueta?.texto === 'cobrar') return 1;
  if (it.p.queda) return 2; // cliente perdendo volume: o maior primeiro (desempate abaixo)
  if (it.p.temp === 'Q') return 2;
  if (it.p.temp === 'M') return 3;
  return 4;
}

export function ordenarItens(itens: ItemFolha[], modo: 'prioridade' | 'distancia'): ItemFolha[] {
  const d = (x: ItemFolha) => x.distanciaM ?? Number.POSITIVE_INFINITY;
  return [...itens].sort((a, b) =>
    modo === 'distancia'
      ? d(a) - d(b)
      : peso(a) - peso(b) || (a.plano && b.plano ? a.plano - b.plano : 0)
        || (b.p.queda?.faturamento ?? 0) - (a.p.queda?.faturamento ?? 0) || d(a) - d(b));
}

