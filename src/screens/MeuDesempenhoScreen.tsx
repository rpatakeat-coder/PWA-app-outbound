// Meu desempenho — "Como estou indo e o que muda o meu mês?" (handoff "Abas do app",
// 04/10/2026, prancha D1 e docs/12 §6). UMA tela só: substitui o "Meu dia em números" e o
// "Meu desempenho" antigo.
//
// Tudo vem de meu_desempenho() (0159), com as definições do Cockpit e da temporada — o gestor
// cobra pelo número dele, então o executivo vê o mesmo número:
//   visita provada = GPS perto do pino ou foto (ao vivo) · demo realizada = o negócio entrou em
//   Demo/Proposta · contrato = negócio ganho · variável = clientes do mês × a faixa da tabela de
//   comissão (retroativa) · piso = 10 provadas + 1 demo realizada na semana da temporada.
// O que saiu: a Minha Daily (a promessa é pedida só na Agenda), "demos marcadas"/reuniões (viraram
// demo realizada) e as metas por vendedor (são do gestor, no Cockpit).
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { useLayout } from '../hooks/useLayout';
import { IconCheck, IconChevronRight, IconTrophy, useIconColors } from '../components/icons';
import FolhaRanking, { Avatar } from './FolhaRanking';

type Dia = { dia: string; provadas: number; demos: number; contratos: number };
type Desempenho = {
  erro?: string;
  sem_carteira?: boolean;
  hoje?: { provadas: number; sem_prova: number; meta: number; dia: string };
  semana?: { de: string; ate: string; provadas: number; meta: number; demos: number; contratos: number; pts: number; meta_pts: number; piso_faltam_provadas: number; piso_faltam_demos: number };
  mes?: { fechados: number; meta: number; variavel: number | null; por_cliente: number | null; proxima_venda: number | null; degrau: { clientes: number; faltam: number; por_cliente: number; extra: number } | null };
  temporada?: { pos: number | null; total: number | null; pct: number | null; pts: number | null; faltam: string | null; proximo: string | null; podio: Array<{ pos: number; nome: string; avatar_url: string | null; pct: number; pts: number }> } | null;
  dias?: Dia[];
  historico?: { semanas: Array<{ de: string; provadas: number; demos: number; contratos: number }>; meses: Array<{ mes: string; provadas: number; demos: number; contratos: number }> };
  hubspot_em?: string | null;
};

type Props = {
  enabled: boolean;
  /** Mantidos por compatibilidade com o App (a fila e o gestor não aparecem mais aqui). */
  tarefasPendentes?: number;
  aoAbrirTarefas?: () => void;
  ehGestor?: boolean;
};

const reais = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function MeuDesempenhoScreen({ enabled }: Props) {
  const layout = useLayout();
  const cores = useIconColors();
  const duas = layout.ehDesktop;
  const [periodo, setPeriodo] = useState<'7' | '30' | 'tudo'>('7');
  const [rankingAberto, setRankingAberto] = useState(false);
  const q = useQuery<Desempenho>({
    queryKey: ['meu_desempenho'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meu_desempenho');
      if (error) throw error;
      return data as Desempenho;
    },
  });
  const d = q.data;
  const mesNome = MESES[new Date(Date.now() - 3 * 3600000).getUTCMonth()];

  if (q.isLoading) {
    return (
      <View style={st.tela}>
        <View style={st.conteudo}>
          <Text style={st.fraco}>Somando os números do Cockpit…</Text>
          {[120, 96, 120, 96].map((h, i) => <View key={i} style={[st.esqueleto, { height: h }]} />)}
        </View>
      </View>
    );
  }
  if (q.isError || !d || d.erro) {
    return (
      <View style={[st.tela, st.centro]}>
        <Text style={st.vazioTitulo}>Não carreguei seus números agora</Text>
        <Text style={st.fraco}>Nada foi perdido: o placar do Cockpit continua contando.</Text>
        <Pressable accessibilityRole="button" style={st.botao} onPress={() => void q.refetch()}><Text style={st.botaoTexto}>Tentar de novo</Text></Pressable>
      </View>
    );
  }
  if (d.sem_carteira) {
    return (
      <View style={[st.tela, st.centro]}>
        <Text style={st.vazioTitulo}>Sem carteira para medir</Text>
        <Text style={st.fraco}>Seu usuário não está ligado a um dono no HubSpot. Fale com o gestor.</Text>
      </View>
    );
  }

  const mes = d.mes!;
  const sem = d.semana!;
  const hoje = d.hoje!;
  const tmp = d.temporada ?? null;
  const noPiso = sem.piso_faltam_provadas === 0 && sem.piso_faltam_demos === 0;
  const textoPiso = noPiso ? 'no piso da semana'
    : `falta${sem.piso_faltam_provadas + sem.piso_faltam_demos > 1 ? 'm' : ''} ${[
      sem.piso_faltam_provadas ? plural(sem.piso_faltam_provadas, 'visita provada', 'visitas provadas') : null,
      sem.piso_faltam_demos ? plural(sem.piso_faltam_demos, 'demo realizada', 'demos realizadas') : null,
    ].filter(Boolean).join(' e ')} para o piso`;

  // ---- 1 · o variável ----
  const variavel = (
    <View style={[st.faixa, !duas && { flexDirection: 'column' }]}>
      <View style={{ flex: duas ? 1 : undefined, minWidth: 0, gap: 4 }}>
        <Text style={st.faixaRotulo}>{`VARIÁVEL DE ${mesNome.toUpperCase()}`}</Text>
        <Text style={st.faixaValor}>{mes.variavel == null ? 'não medido' : reais(mes.variavel)}</Text>
        <Text style={st.faixaSub}>
          {`${plural(mes.fechados, 'contrato', 'contratos')} de ${mes.meta} no mês${mes.por_cliente ? ` · faixa de ${reais(mes.por_cliente)} por cliente` : ''}`}
        </Text>
      </View>
      {mes.proxima_venda != null && (
        <View style={st.proxima}>
          <Text style={st.faixaRotulo}>PRÓXIMA VENDA</Text>
          <Text style={st.proximaValor}>{`+${reais(mes.proxima_venda)}`}</Text>
          {mes.degrau && mes.degrau.faltam > 1 && (
            <Text style={st.faixaSub}>{`a ${mes.degrau.clientes}ª muda a faixa: +${reais(mes.degrau.extra - (mes.proxima_venda ?? 0) * (mes.degrau.faltam - 1))}`}</Text>
          )}
          {mes.degrau && mes.degrau.faltam === 1 && <Text style={st.faixaSub}>muda a sua faixa</Text>}
        </View>
      )}
    </View>
  );

  // ---- 2 · hoje ----
  const blocoHoje = (
    <View style={st.cartao}>
      <Text style={st.secao}>HOJE</Text>
      <Text style={st.linhaGrande}><Text style={st.numero}>{`${hoje.provadas} de ${hoje.meta}`}</Text><Text style={st.fraco}>  visitas provadas</Text></Text>
      <View style={st.tracos}>{Array.from({ length: Math.max(1, Math.min(hoje.meta, 12)) }, (_, i) => <View key={i} style={[st.traco, i < hoje.provadas && { backgroundColor: 'var(--verde-acao)' }]} />)}</View>
      {hoje.sem_prova > 0 && <Text style={st.fraco}>{`${plural(hoje.sem_prova, 'visita sem prova', 'visitas sem prova')} hoje: longe do pino e sem foto não conta`}</Text>}
    </View>
  );

  // ---- 3 · semana ----
  const blocoSemana = (
    <View style={st.cartao}>
      <Text style={st.secao}>SEMANA DA TEMPORADA</Text>
      <View style={{ flexDirection: 'row' }}>
        <View style={[st.selo, noPiso ? st.seloOk : st.seloAviso, { flexShrink: 1 }]}>
          {noPiso && <IconCheck width={12} height={12} fill="var(--tint-green-text)" />}
          <Text style={[st.seloTexto, { flexShrink: 1, color: noPiso ? 'var(--tint-green-text)' : 'var(--tint-amber-text)' }]}>{textoPiso}</Text>
        </View>
      </View>
      <View style={st.tres}>
        {[[sem.provadas, sem.provadas === 1 ? 'visita provada' : 'visitas provadas'], [sem.demos, sem.demos === 1 ? 'demo realizada' : 'demos realizadas'], [sem.contratos, sem.contratos === 1 ? 'contrato' : 'contratos']].map(([v, r]) => (
          <View key={String(r)} style={st.kpi}><Text style={st.kpiValor}>{String(v)}</Text><Text style={st.kpiRotulo}>{String(r)}</Text></View>
        ))}
      </View>
      <Text style={st.nota}>Piso: 10 visitas provadas e 1 demo realizada. Visita declarada sem GPS perto do pino ou foto não conta.</Text>
    </View>
  );

  // ---- 4 · temporada ----
  const blocoTemporada = tmp?.pos ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir o ranking da temporada" style={st.cartao} onPress={() => setRankingAberto(true)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconTrophy width={20} height={20} fill={cores.onSurface} />
        <Text style={[st.secao, { flex: 1 }]}>TEMPORADA</Text>
        <IconChevronRight width={20} height={20} fill={cores.muted} />
      </View>
      <Text style={st.linhaGrande}><Text style={st.numero}>{`${tmp.pos}º`}</Text><Text style={st.fraco}>{`  de ${tmp.total ?? '—'} · ${tmp.pts ?? 0} pts`}</Text></Text>
      {!!tmp.faltam && <Text style={st.texto}>{tmp.faltam}</Text>}
      {!!tmp.proximo && <Text style={st.fraco}>{tmp.proximo}</Text>}
      <View style={{ gap: 6, marginTop: 4 }}>
        {(tmp.podio ?? []).map((p) => (
          <View key={p.pos} style={[st.podio, p.pos === tmp.pos && st.podioEu]}>
            <Text style={st.podioPos}>{`${p.pos}º`}</Text>
            <Avatar nome={p.nome} url={p.avatar_url} tamanho={28} />
            <Text style={[st.texto, { flex: 1 }]} numberOfLines={1}>{p.pos === tmp.pos ? 'Você' : p.nome}</Text>
            <Text style={st.fraco}>{`${p.pts} pts`}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  ) : null;

  // ---- 5 · histórico (7 dias = a semana da temporada, dia a dia: soma igual ao bloco 3) ----
  const barras: Array<{ r: string; v: number; destaque?: boolean }> = periodo === '7'
    ? (d.dias ?? []).map((x) => ({ r: SEM[new Date(`${x.dia}T12:00:00Z`).getUTCDay()], v: x.provadas }))
    : periodo === '30'
      ? [...(d.historico?.semanas ?? []).map((w) => ({ r: `${w.de.slice(8, 10)}/${w.de.slice(5, 7)}`, v: w.provadas })), { r: 'esta', v: sem.provadas, destaque: true }]
      : (d.historico?.meses ?? []).map((m, i, a) => ({ r: MES_CURTO[Number(m.mes.slice(5, 7)) - 1], v: m.provadas, destaque: i === a.length - 1 }));
  const totais = periodo === '7'
    ? { p: sem.provadas, d: sem.demos, c: sem.contratos }
    : periodo === '30'
      ? (d.historico?.semanas ?? []).reduce((a, w) => ({ p: a.p + w.provadas, d: a.d + w.demos, c: a.c + w.contratos }), { p: sem.provadas, d: sem.demos, c: sem.contratos })
      : (d.historico?.meses ?? []).reduce((a, m) => ({ p: a.p + m.provadas, d: a.d + m.demos, c: a.c + m.contratos }), { p: 0, d: 0, c: 0 });
  const max = Math.max(1, ...barras.map((b) => b.v));
  const blocoHistorico = (
    <View style={st.cartao}>
      <Text style={st.secao}>HISTÓRICO</Text>
      <View style={st.seg}>
        {([['7', 'Esta semana'], ['30', '5 semanas'], ['tudo', '5 meses']] as const).map(([k, r]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: periodo === k }} style={[st.segItem, periodo === k && st.segAtivo]} onPress={() => setPeriodo(k)}>
            <Text style={[st.segTexto, periodo !== k && { color: 'var(--text-muted)' }]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      <View style={st.tres}>
        {[[totais.p, 'provadas'], [totais.d, 'demos realizadas'], [totais.c, 'contratos']].map(([v, r]) => (
          <View key={String(r)} style={st.kpi}><Text style={st.kpiValor}>{String(v)}</Text><Text style={st.kpiRotulo}>{String(r)}</Text></View>
        ))}
      </View>
      <View style={st.barras}>
        {barras.map((b, i) => (
          <View key={i} style={st.barraCol}>
            <Text style={st.barraValor}>{b.v ? String(b.v) : ''}</Text>
            <View style={[st.barra, { height: Math.max(4, Math.round((b.v / max) * 56)), backgroundColor: b.destaque ? 'var(--vermelho-acao)' : b.v ? 'var(--verde-acao)' : 'var(--border)' }]} />
            <Text style={st.barraRotulo}>{b.r}</Text>
          </View>
        ))}
      </View>
      <Text style={st.nota}>{periodo === '7' ? 'Visitas provadas por dia, ao vivo. A soma é a mesma da semana acima.' : 'Pelo livro da temporada, o mesmo do ranking do Cockpit.'}</Text>
    </View>
  );

  return (
    <ScrollView style={st.tela} contentContainerStyle={[st.conteudo, duas && st.conteudoLargo]}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {variavel}
      {duas ? (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 12 }}>{blocoHoje}{blocoSemana}</View>
          <View style={{ flex: 1, gap: 12 }}>{blocoTemporada}{blocoHistorico}</View>
        </View>
      ) : (
        <>{blocoHoje}{blocoSemana}{blocoTemporada}{blocoHistorico}</>
      )}
      <Text style={st.nota}>Os mesmos números do Cockpit. Contratos e demos atualizam a cada 10 min; visitas, na hora.</Text>
      <FolhaRanking visivel={rankingAberto} aoFechar={() => setRankingAberto(false)} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  centro: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  conteudo: { padding: 16, paddingBottom: 40, gap: 12 },
  conteudoLargo: { padding: 28, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  esqueleto: { borderRadius: 16, backgroundColor: 'var(--surface-2)' },
  faixa: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 18, borderRadius: 18, backgroundColor: '#111418' },
  faixaRotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.6)' },
  faixaValor: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  faixaSub: { fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.72)' },
  proxima: { minWidth: 150, gap: 4, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  proximaValor: { fontSize: 22, fontWeight: '800', color: '#7BE0A6', fontVariant: ['tabular-nums'] },
  cartao: { padding: 16, gap: 8, borderRadius: 16, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  secao: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--text-faint)' },
  linhaGrande: { color: 'var(--text)' },
  numero: { fontSize: 24, fontWeight: '800', color: 'var(--text)' },
  texto: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: 'var(--text)' },
  fraco: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  nota: { fontSize: 12, lineHeight: 17, color: 'var(--text-faint)' },
  tracos: { flexDirection: 'row', gap: 4 },
  traco: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'var(--border)' },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, minHeight: 26, borderRadius: 13 },
  seloOk: { backgroundColor: 'var(--tint-green)' },
  seloAviso: { backgroundColor: 'var(--tint-amber)' },
  seloTexto: { fontSize: 12, fontWeight: '700' },
  tres: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, minWidth: 0, padding: 12, borderRadius: 12, backgroundColor: 'var(--surface-2)', gap: 2 },
  kpiValor: { fontSize: 24, fontWeight: '800', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  kpiRotulo: { fontSize: 12, color: 'var(--text-muted)' },
  podio: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent' },
  podioEu: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)' },
  podioPos: { width: 28, fontSize: 14, fontWeight: '800', color: 'var(--text)' },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: 'var(--surface-2)' },
  segItem: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  segAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)' },
  segTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  barras: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, minHeight: 96, marginTop: 4 },
  barraCol: { flex: 1, alignItems: 'center', gap: 4 },
  barra: { width: '70%', borderRadius: 4 },
  barraValor: { fontSize: 11, fontWeight: '700', color: 'var(--text-muted)' },
  barraRotulo: { fontSize: 11, color: 'var(--text-muted)' },
  vazioTitulo: { fontSize: 17, fontWeight: '700', color: 'var(--text)', textAlign: 'center' },
  botao: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center', marginTop: 8 },
  botaoTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
});
