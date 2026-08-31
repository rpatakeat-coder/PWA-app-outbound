import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  useMyMetrics,
  useMyMetricLeads,
  type GestorPeriod,
  type GestorPeriodPreset,
  type MetricLead,
  type MyMetricLeadsParams,
} from '../hooks/useGestorMetrics';
import { MinhaDailyCard } from './MinhaDailyCard';
import { SellerGoalsCard } from './SellerGoalsCard';
import { useLayout } from '../hooks/useLayout';
import { useMinhaDaily } from '../hooks/useMinhaDaily';

interface Props {
  enabled: boolean;
  /** Pendencias do proprio vendedor — mesmo numero do badge da nav. */
  tarefasPendentes?: number;
  aoAbrirTarefas?: () => void;
}

const PERIOD_OPTIONS: { value: GestorPeriodPreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'all', label: 'Tudo' },
];

const STATUS_COLOR: Record<string, string> = {
  lead: '#3b82f6', lead_visitado: '#a855f7', cliente: '#22c55e',
  em_integracao: '#f97316', churn: '#E03A41', ex_cliente: '#E03A41',
};
const STATUS_LABEL: Record<string, string> = {
  lead: 'Leads', lead_visitado: 'Visitados', cliente: 'Clientes',
  em_integracao: 'Em integração', churn: 'Churn', ex_cliente: 'Ex-cliente',
};

function formatLeadDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Modal com os leads por trás de uma métrica (carregado sob demanda).
function LeadsModal({
  title, params, enabled, onClose,
}: { title: string; params: MyMetricLeadsParams | null; enabled: boolean; onClose: () => void }) {
  const q = useMyMetricLeads(params, enabled);
  const layoutModal = useLayout();
  const leads = q.data ?? [];
  return (
    <Modal visible={params !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalPanel, layoutModal.ehLargo && styles.modalPanelWeb]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle} numberOfLines={2}>{title}</Text>
              <Text style={styles.modalSubtitle}>
                {q.isLoading ? 'Carregando...' : `${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`}
              </Text>
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={leads}
            keyExtractor={(item, i) => `${item.client_id}-${i}`}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={q.isLoading
              ? <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color="var(--brand-text)" /></View>
              : <Text style={styles.modalEmpty}>Nenhum lead nesse recorte.</Text>}
            renderItem={({ item }) => {
              const when = formatLeadDate(item.at);
              return (
                <View style={styles.leadRow}>
                  <View style={[styles.leadDot, { backgroundColor: (item.status && STATUS_COLOR[item.status]) || '#94a3b8' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leadName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.leadMeta}>
                      {(item.status && (STATUS_LABEL[item.status] ?? item.status)) || 'Sem status'}
                      {when ? ` • ${when}` : ''}
                    </Text>
                    {item.note?.trim() ? <Text style={styles.leadNote}>{item.note.trim()}</Text> : null}
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

// Anatomia de KPI do M6, compartilhada com o Gestor: rotulo 12/16/0.5 peso
// 600 --text-faint sobre valor 18/24 peso 700 tabular-nums. O 28/36 do
// desktop nao cabe em meia largura de 390.
function Kpi({ rotulo, valor, sub, corValor, onPress }: {
  rotulo: string; valor: string; sub?: string; corValor?: string; onPress?: () => void;
}) {
  const corpo = (
    <>
      <Text style={styles.kpiRotulo}>{rotulo}</Text>
      <Text style={[styles.kpiValor, corValor ? { color: corValor } : null]}>{valor}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </>
  );
  if (!onPress) return <View style={styles.kpiCartao}>{corpo}</View>;
  return (
    <TouchableOpacity accessibilityRole="button" style={styles.kpiCartao} onPress={onPress} activeOpacity={0.85}>
      {corpo}
    </TouchableOpacity>
  );
}

function Stat({ value, label, color, onPress }: { value: number; label: string; color: string; onPress?: () => void }) {
  const inner = (
    <>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  if (onPress && value > 0) {
    return <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  }
  return <View style={styles.statCard}>{inner}</View>;
}

export function MeuDesempenhoScreen({ enabled, tarefasPendentes, aoAbrirTarefas }: Props) {
  const layout = useLayout();
  const [preset, setPreset] = useState<GestorPeriodPreset>('30d');
  const [modal, setModal] = useState<{ title: string; params: MyMetricLeadsParams } | null>(null);

  const period = useMemo<GestorPeriod>(() => ({ preset: preset === 'custom' ? '30d' : preset }), [preset]);
  const query = useMyMetrics(period, enabled);
  const m = query.data;
  // Banner web (handoff, tela 7): a promessa de HOJE em destaque — e' a
  // pergunta que a aba responde. Mesmos dados do MinhaDailyCard.
  // Antes so' carregava no desktop (pro banner). O heatmap da semana do
  // celular sai do mesmo `daily.semana`, entao passa a carregar sempre.
  const { daily } = useMinhaDaily(enabled);

  const open = (title: string, metric: MyMetricLeadsParams['metric']) =>
    setModal({ title, params: { metric, period } });

  const periodLabel =
    preset === 'all' ? 'no total'
    : preset === 'today' ? 'de hoje'
    : `nos últimos ${preset === '7d' ? '7' : '30'} dias`;

  const statusEntries = m ? Object.entries(m.status_breakdown).sort((a, b) => b[1] - a[1]) : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, layout.ehLargo && estilosWeb.contentWeb]}
      refreshControl={<RefreshControl refreshing={query.isFetching && !query.isLoading} onRefresh={() => query.refetch()} />}
    >
      {/* A Daily fica SEPARADA do seletor de periodo de proposito: ela e'
          sempre de HOJE, e ficaria mentindo se parecesse responder ao filtro
          de 7/30 dias. No desktop ela ancora a coluna esquerda; as metricas
          historicas ficam a direita. No celular: Daily em cima, como sempre. */}
      {layout.ehLargo && daily?.souDeCampo && daily.hoje && (
        <View style={estilosWeb.banner}>
          <View style={{ flexShrink: 1, minWidth: 220, gap: 4 }}>
            <Text style={estilosWeb.bannerKicker}>Promessa de hoje</Text>
            <Text style={estilosWeb.bannerTitulo}>
              {daily.hoje.prometido == null
                ? `${daily.hoje.visitas} ${daily.hoje.visitas === 1 ? 'visita feita' : 'visitas feitas'} — sem promessa declarada`
                : `${daily.hoje.visitas} de ${daily.hoje.prometido} visitas`}
            </Text>
            <Text style={estilosWeb.bannerSub}>
              {daily.hoje.prometido == null
                ? 'Declare a promessa do dia no cartão da Daily aqui embaixo.'
                : daily.hoje.cumpriu
                  ? 'Palavra cumprida. O que passar daqui é saldo.'
                  : `Faltam ${Math.max(daily.hoje.prometido - daily.hoje.visitas, 0)} pra cumprir a palavra.`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 32 }}>
            {daily.hoje.prometido != null && (
              <View style={estilosWeb.bannerNumeroBloco}>
                <Text style={estilosWeb.bannerNumero}>
                  {`${Math.min(Math.round((daily.hoje.visitas / Math.max(daily.hoje.prometido, 1)) * 100), 999)}%`}
                </Text>
                <Text style={estilosWeb.bannerNumeroRotulo}>da promessa</Text>
              </View>
            )}
            <View style={estilosWeb.bannerNumeroBloco}>
              <Text style={estilosWeb.bannerNumero}>{daily.sequencia}</Text>
              <Text style={estilosWeb.bannerNumeroRotulo}>{daily.sequencia === 1 ? 'dia seguido' : 'dias seguidos'}</Text>
            </View>
          </View>
        </View>
      )}

      {layout.ehLargo && m && (
        <View style={estilosWeb.kpis}>
          {/* Os quatro do prompt 10: Visitas, Demos, conversao (fechados /
              visitados — dado real) e tarefas pendentes (mesmo numero do
              badge da nav). Fechamentos continua acessivel no modal de
              Visitas/na lista abaixo. */}
          <TouchableOpacity style={estilosWeb.kpiCartao} onPress={() => open('Visitas', 'visited')}>
            <Text style={estilosWeb.kpiRotulo}>{`Visitas ${periodLabel}`}</Text>
            <Text style={estilosWeb.kpiValor}>{m.visited.toLocaleString('pt-BR')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilosWeb.kpiCartao} onPress={() => open('Demos agendadas', 'meetings')}>
            <Text style={estilosWeb.kpiRotulo}>{`Demos ${periodLabel}`}</Text>
            <Text style={estilosWeb.kpiValor}>{m.meetings_scheduled.toLocaleString('pt-BR')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilosWeb.kpiCartao} onPress={() => open('Fechamentos', 'won')}>
            <Text style={estilosWeb.kpiRotulo}>{`Conversão ${periodLabel}`}</Text>
            <Text style={estilosWeb.kpiValor}>
              {m.visited > 0 ? `${Math.round((m.won_in_period / m.visited) * 100)}%` : '—'}
            </Text>
            <Text style={estilosWeb.kpiSub}>{`${m.won_in_period} ${m.won_in_period === 1 ? 'fechado' : 'fechados'} / ${m.visited} visitados`}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={estilosWeb.kpiCartao}
            disabled={!aoAbrirTarefas}
            onPress={aoAbrirTarefas}
          >
            <Text style={estilosWeb.kpiRotulo}>Tarefas pendentes</Text>
            <Text style={[estilosWeb.kpiValor, (tarefasPendentes ?? 0) > 0 && { color: 'var(--tint-red-text)' }]}>
              {(tarefasPendentes ?? 0).toLocaleString('pt-BR')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Coluna unica (prompt 10c): banner, KPIs, Daily como bloco, e as
          metricas historicas abaixo. A composicao de duas colunas era o
          layout antigo e brigava com o teto de 1200px. */}
      <View>
      {/* No DESKTOP a Daily ancora o topo (e' a promessa de hoje, e a coluna
          esquerda existe pra ela). No CELULAR ela desce pra depois do
          heatmap: em cima, empurrava os KPIs e o calor — que sao a resposta
          da tela — pra fora da primeira dobra. */}
      {layout.ehLargo && (
        <View style={{ gap: 16 }}>
          <MinhaDailyCard enabled={enabled} />
        </View>
      )}
      <View>

      <View style={[styles.periodRow, layout.ehLargo && estilosWeb.periodoLinha]}>
        {PERIOD_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.periodChip, layout.ehLargo && estilosWeb.periodoChip, preset === opt.value && styles.periodChipActive]}
            onPress={() => setPreset(opt.value)}
          >
            <Text style={[styles.periodChipText, preset === opt.value && styles.periodChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ---- M6: KPIs 2x2 + heatmap da semana (so' no celular) ---- */}
      {!layout.ehLargo && m && (
        <View style={styles.kpiGrade}>
          <Kpi rotulo={`Visitas ${periodLabel}`} valor={m.visited.toLocaleString('pt-BR')} onPress={() => open('Minhas visitas', 'visited')} />
          <Kpi rotulo={`Demos ${periodLabel}`} valor={m.meetings_scheduled.toLocaleString('pt-BR')} onPress={() => open('Minhas reuniões', 'meetings')} />
          <Kpi
            rotulo={`Conversão ${periodLabel}`}
            valor={m.visited > 0 ? `${Math.round((m.won_in_period / m.visited) * 100)}%` : '—'}
            sub={`${m.won_in_period} / ${m.visited} visitados`}
            onPress={() => open('Clientes que fechei', 'won')}
          />
          {/* O numero e' o de tarefas PENDENTES (o mesmo do badge da barra) —
              "atrasadas" nao existe como campo separado; ver relatorio. */}
          <Kpi
            rotulo="Tarefas pendentes"
            valor={(tarefasPendentes ?? 0).toLocaleString('pt-BR')}
            corValor={(tarefasPendentes ?? 0) > 0 ? 'var(--tint-red-text)' : undefined}
            onPress={aoAbrirTarefas}
          />
        </View>
      )}

      {!layout.ehLargo && daily?.souDeCampo && daily.semana.length > 0 && (() => {
        const total = daily.semana.reduce((n, d) => n + d.visitas, 0);
        return (
          <View style={styles.calorCartao}>
            <View style={styles.calorCabecalho}>
              <Text style={styles.calorTitulo}>VISITAS NA SEMANA</Text>
              <Text style={styles.calorTotal}>{total}</Text>
            </View>
            {/* Celulas FLUIDAS (aspect-ratio 1), nao os 28px fixos do desktop.
                A serie e' `daily.semana`: os ultimos dias UTEIS, entao sao 5 e
                nao os 7 do desenho — nao ha' dado de fim de semana, e desenhar
                sabado e domingo vazios faria "nao medido" parecer "zero". */}
            <View style={styles.calorGrade}>
              {daily.semana.map((d) => {
                const ehHoje = d.dia === daily.hoje.dia;
                const vazio = d.visitas === 0;
                const claro = d.visitas >= 1 && d.visitas <= 2;
                const cor = vazio ? 'var(--surface-3)' : claro ? '#8FE0D5' : '#1D9688';
                return (
                  <View
                    key={d.dia}
                    style={[
                      styles.calorCelula,
                      { backgroundColor: cor },
                      // Hoje ainda sem visita: tracejado, pra distinguir "dia
                      // que nao teve" de "dia que ainda pode ter".
                      ehHoje && vazio && styles.calorCelulaHoje,
                    ]}
                  >
                    {/* O numero dentro da celula: a cor sozinha diz "muito ou
                        pouco", nao "quantas". Escuro sobre o teal claro,
                        branco sobre o escuro. */}
                    {!vazio && (
                      <Text style={[styles.calorCelulaNumero, { color: claro ? '#0C3B36' : '#FFFFFF' }]}>
                        {d.visitas}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={styles.calorLegenda}>
              {daily.semana.map((d) => {
                const ehHoje = d.dia === daily.hoje.dia;
                return (
                  <Text key={d.dia} style={[styles.calorDia, ehHoje && styles.calorDiaHoje]}>
                    {new Date(`${d.dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                  </Text>
                );
              })}
            </View>
            {/* Sem a legenda os dois tons de teal nao se explicam. */}
            <View style={styles.calorEscala}>
              {[
                { cor: 'var(--surface-3)', rotulo: 'nenhuma' },
                { cor: '#8FE0D5', rotulo: '1–2' },
                { cor: '#1D9688', rotulo: '3+' },
              ].map((degrau) => (
                <View key={degrau.rotulo} style={styles.calorEscalaItem}>
                  <View style={[styles.calorEscalaAmostra, { backgroundColor: degrau.cor }]} />
                  <Text style={styles.calorEscalaTexto}>{degrau.rotulo}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })()}

      {/* F · auxiliares, DEPOIS do heatmap. Nenhum sai de cena: a Daily e' a
          promessa do dia e o SellerGoalsCard traz a meta — que ate' o M6 so'
          o Gestor via. */}
      {!layout.ehLargo && (
        <View style={{ gap: 16 }}>
          <MinhaDailyCard enabled={enabled} />
          <SellerGoalsCard />
        </View>
      )}

      {query.isLoading ? (
        <View style={styles.loadingBlock}><ActivityIndicator size="large" color="var(--brand-text)" /><Text style={styles.loadingText}>Carregando...</Text></View>
      ) : query.isError ? (
        <View style={styles.loadingBlock}>
          <Text style={styles.errorText}>Erro ao carregar suas métricas.</Text>
          <TouchableOpacity style={styles.retry} onPress={() => query.refetch()}><Text style={styles.retryText}>Tentar novamente</Text></TouchableOpacity>
        </View>
      ) : m ? (
        <>
          <Text style={styles.sectionTitle}>Minha atividade {periodLabel}</Text>
          <View style={styles.grid}>
            <Stat value={m.visited} label="Visitas (check-in)" color="#a855f7" onPress={() => open('Minhas visitas', 'visited')} />
            <Stat value={m.created} label="Pins criados" color="#3b82f6" onPress={() => open('Pins que criei', 'created')} />
            <Stat value={m.meetings_scheduled} label="Reuniões" color="#f97316" onPress={() => open('Minhas reuniões', 'meetings')} />
            <Stat value={m.follow_ups_scheduled} label="Follow ups" color="#0891b2" onPress={() => open('Meus follow ups', 'follow_ups')} />
            <Stat value={m.stage_changes} label="Mudanças etapa" color="#0ea5e9" onPress={() => open('Mudanças de etapa', 'stage_changes')} />
            <Stat value={m.notes_created} label="Notas" color="#FFD966" onPress={() => open('Minhas notas', 'notes')} />
            <Stat value={m.won_in_period} label="Fechados" color="#16a34a" onPress={() => open('Clientes que fechei', 'won')} />
          </View>

          <Text style={styles.sectionTitle}>Meus leads (snapshot atual)</Text>
          <View style={styles.assignedCard}>
            <TouchableOpacity disabled={m.leads_assigned === 0} onPress={() => open('Meus leads atribuídos', 'assigned')}>
              <Text style={styles.assignedNumber}>{m.leads_assigned}</Text>
              <Text style={styles.assignedLabel}>{m.leads_assigned === 1 ? 'lead atribuído a mim' : 'leads atribuídos a mim'}</Text>
            </TouchableOpacity>
            {statusEntries.length > 0 && (
              <View style={styles.statusBreakdown}>
                {statusEntries.map(([status, count]) => (
                  <View key={status} style={styles.statusChip}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] ?? '#94a3b8' }]} />
                    <Text style={styles.statusChipText}>{STATUS_LABEL[status] ?? status} {count}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <Text style={styles.footerHint}>Toque num número pra ver os leads por trás dele. Puxe pra baixo pra atualizar.</Text>
        </>
      ) : null}

      <LeadsModal
        title={modal?.title ?? ''}
        params={modal?.params ?? null}
        enabled={enabled}
        onClose={() => setModal(null)}
      />
      </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ---- KPI e heatmap (M6) ----
  kpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCartao: {
    // 1fr 1fr com gap 12: em 390 (menos 32 de padding) cada um fica com ~173.
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  kpiRotulo: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-faint)' },
  // 18/24 e' o maior tipo do celular. 28/36 e' desktop.
  kpiValor: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: 'var(--text)',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  kpiSub: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-faint)', marginTop: 2 },
  calorCartao: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    gap: 8,
  },
  calorTitulo: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '700', color: 'var(--text-muted)' },
  calorCabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  calorTotal: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)', fontVariant: ['tabular-nums'] },
  calorGrade: { flexDirection: 'row', gap: 4 },
  calorCelulaNumero: { fontSize: 12, lineHeight: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  calorDiaHoje: { color: 'var(--tint-red-text)', fontWeight: '700' },
  calorEscala: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  calorEscalaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  calorEscalaAmostra: { width: 12, height: 12, borderRadius: 4 },
  calorEscalaTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, color: 'var(--text-faint)' },
  // `aspectRatio: 1` com `flex: 1`: a celula acompanha a largura da tela em
  // vez dos 28px fixos do desktop.
  calorCelula: { flex: 1, aspectRatio: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  calorCelulaHoje: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C8131B' },
  calorLegenda: { flexDirection: 'row', gap: 4 },
  calorDia: { flex: 1, textAlign: 'center', fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-faint)' },
  container: { flex: 1, backgroundColor: 'var(--bg)' },
  // Sem barra inferior nesta tela (nao e' aba; chega pelo menu do perfil e
  // sai pelo arrow_back), entao nao ha' o que reservar: 16, nao 120.
  content: { padding: 16, paddingBottom: 16, gap: 16 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  // 48 de altura e raio 12: era ~36 com raio 10, os dois fora da escala.
  periodChip: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'var(--surface)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  periodChipActive: { backgroundColor: '#C8131B', borderColor: '#C8131B' },
  periodChipText: { fontSize: 13, fontWeight: '600', color: 'var(--text-muted)' },
  periodChipTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCard: { flexBasis: '48%', flexGrow: 1, backgroundColor: 'var(--surface)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'var(--border)' },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontWeight: '600' },
  assignedCard: { backgroundColor: 'var(--surface)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'var(--border)' },
  assignedNumber: { fontSize: 28, fontWeight: '800', color: 'var(--text)' },
  assignedLabel: { fontSize: 13, color: 'var(--text-muted)', fontWeight: '600' },
  statusBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  statusChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'var(--surface-2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: 11, color: 'var(--text-muted)', fontWeight: '600' },
  loadingBlock: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  loadingText: { color: 'var(--text-muted)', fontSize: 13 },
  errorText: { color: 'var(--brand-text)', fontSize: 15, fontWeight: '700' },
  retry: { marginTop: 12, backgroundColor: '#222222', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  footerHint: { marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-subtle)', fontStyle: 'italic' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  // Web: o sheet de leads vira painel de largura contida, nao full-bleed.
  modalPanelWeb: { width: '100%', maxWidth: 640, alignSelf: 'center', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  modalPanel: { maxHeight: '75%', backgroundColor: 'var(--surface)', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  modalSubtitle: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  modalClose: { backgroundColor: 'var(--surface-2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  modalCloseText: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  modalEmpty: { textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingVertical: 24 },
  leadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)' },
  leadDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  leadName: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  leadMeta: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  leadNote: { fontSize: 13, color: 'var(--text)', marginTop: 6, lineHeight: 18, backgroundColor: 'var(--bg)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, borderLeftWidth: 3, borderLeftColor: '#FFD966' },
});

// Estilos da superficie web (handoff, tela 7). O banner e' o UNICO bloco
// vermelho chapado da tela — nao repetir o padrao.
const estilosWeb = StyleSheet.create({
  contentWeb: { padding: 24, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  periodoLinha: { flexWrap: 'wrap', marginBottom: 12 },
  periodoChip: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    width: 'auto',
    height: 36,
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 24,
    padding: 24,
    borderRadius: 8,
    backgroundColor: '#C8131B',
    marginBottom: 24,
  },
  bannerKicker: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.3,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.75)',
  },
  bannerTitulo: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: '#FFFFFF' },
  bannerSub: { fontSize: 14, lineHeight: 20, letterSpacing: 0.25, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  bannerNumeroBloco: { alignItems: 'flex-end', gap: 2 },
  bannerNumero: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  bannerNumeroRotulo: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  kpis: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginBottom: 24 },
  kpiCartao: {
    flex: 1,
    minWidth: 170,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    padding: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  kpiRotulo: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '500', color: 'var(--text-muted)' },
  kpiValor: { fontSize: 24, lineHeight: 32, fontWeight: '600', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  kpiSub: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, color: 'var(--text-faint)' },
});
