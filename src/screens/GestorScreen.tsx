import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../components/Alert';
import {
  IconBarGraph,
  IconText,
} from '../components/icons';
import {
  useGestorMetrics,
  useMetricLeads,
  useGestorTaskMetrics,
  useGestorTasksList,
  exportReport,
  periodRange,
  type GestorPeriod,
  type GestorPeriodPreset,
  type MetricLead,
  type MetricLeadsParams,
  type SellerMetrics,
  type SellerTaskCounts,
  type GestorTaskItem,
  type GestorTaskStatus,
} from '../hooks/useGestorMetrics';
import { RouteConfigCard } from './RouteConfigCard';
import { SellerClassificationCard } from './SellerClassificationCard';
import { SellerGoalsCard } from './SellerGoalsCard';
import { DismissedContaAlvoCard } from './DismissedContaAlvoCard';
import { RouteHistorySection } from './RouteHistorySection';
import { MinhaDailyCard } from './MinhaDailyCard';

interface Props {
  enabled: boolean;
  // Abre o detalhe (ClientBottomSheet) de um lead ao toca-lo no drill-down.
  // O App resolve o clientId -> Client (com fallback de fetch sob demanda).
  onOpenClient?: (clientId: string) => void;
}

const PERIOD_OPTIONS: { value: GestorPeriodPreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'all', label: 'Tudo' },
];

const STATUS_COLOR: Record<string, string> = {
  lead: '#3b82f6',
  lead_visitado: '#a855f7',
  cliente: '#22c55e',
  em_integracao: '#f97316',
  churn: '#E03A41',
  ex_cliente: '#E03A41',
};

const STATUS_LABEL: Record<string, string> = {
  lead: 'Leads',
  lead_visitado: 'Visitados',
  cliente: 'Clientes',
  em_integracao: 'Em integração',
  churn: 'Churn',
  ex_cliente: 'Ex-cliente',
};

// Conteúdo do modal "quais leads compõem esse número". Em vez de carregar a
// lista junto com as métricas, guardamos só os parâmetros da consulta e o
// modal busca os leads sob demanda (useMetricLeads) ao abrir.
interface LeadModalState {
  title: string;
  params: MetricLeadsParams;
}

// Drill-down de tarefas de um vendedor (pendentes ou concluidas).
interface TaskModalState {
  title: string;
  hubspotId: string | null;
  status: GestorTaskStatus;
}

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const fmtShort = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

// Calendário de intervalo pro período personalizado: 1º toque marca o início,
// 2º toque o fim (toque antes do início reinicia a seleção). Dias futuros
// ficam desabilitados — métrica é sempre retroativa.
function RangeCalendarModal({
  initialStart,
  initialEnd,
  onApply,
  onClose,
}: {
  initialStart: Date | null;
  initialEnd: Date | null;
  onApply: (start: Date, end: Date) => void;
  onClose: () => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [start, setStart] = useState<Date | null>(initialStart);
  const [end, setEnd] = useState<Date | null>(initialEnd);
  const [view, setView] = useState(() => {
    const base = initialStart ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const pick = (day: Date) => {
    if (!start || (start && end)) {
      setStart(day);
      setEnd(null);
      return;
    }
    if (day.getTime() < start.getTime()) {
      setStart(day);
      return;
    }
    setEnd(day);
  };

  const inRange = (day: Date) => {
    if (!start) return false;
    const to = end ?? start;
    return day.getTime() >= start.getTime() && day.getTime() <= to.getTime();
  };

  const summary = start
    ? end
      ? `${fmtShort(start)} até ${fmtShort(end)}`
      : `${fmtShort(start)} — toque no dia final`
    : 'Toque no dia inicial';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={rangeStyles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={rangeStyles.panel}>
          <Text style={rangeStyles.title}>Período personalizado</Text>
          <Text style={rangeStyles.summary}>{summary}</Text>

          <View style={rangeStyles.calHeader}>
            <TouchableOpacity style={rangeStyles.navBtn} onPress={() => setView(new Date(year, month - 1, 1))}>
              <Text style={rangeStyles.navTxt}>‹</Text>
            </TouchableOpacity>
            <Text style={rangeStyles.calTitle}>{MESES[month]} {year}</Text>
            <TouchableOpacity style={rangeStyles.navBtn} onPress={() => setView(new Date(year, month + 1, 1))}>
              <Text style={rangeStyles.navTxt}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={rangeStyles.weekRow}>
            {DIAS_SEMANA.map((d, i) => (
              <Text key={i} style={rangeStyles.weekDay}>{d}</Text>
            ))}
          </View>
          <View style={rangeStyles.grid}>
            {cells.map((day, idx) => {
              if (day == null) return <View key={idx} style={rangeStyles.cellEmpty} />;
              const cellDate = new Date(year, month, day);
              const isFuture = cellDate.getTime() > today.getTime();
              const isEdge = (start && sameDay(cellDate, start)) || (end && sameDay(cellDate, end));
              const isBetween = !isEdge && inRange(cellDate);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    rangeStyles.cell,
                    isBetween && rangeStyles.cellBetween,
                    isEdge && rangeStyles.cellEdge,
                    isFuture && rangeStyles.cellFuture,
                  ]}
                  disabled={isFuture}
                  onPress={() => pick(cellDate)}
                >
                  <Text
                    style={[
                      rangeStyles.cellTxt,
                      isFuture && rangeStyles.cellTxtFuture,
                      isBetween && rangeStyles.cellTxtActive,
                      isEdge && rangeStyles.cellTxtEdge,
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={rangeStyles.actionsRow}>
            <TouchableOpacity style={rangeStyles.cancelBtn} onPress={onClose}>
              <Text style={rangeStyles.cancelTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[rangeStyles.applyBtn, !start && rangeStyles.applyBtnDisabled]}
              disabled={!start}
              onPress={() => {
                if (!start) return;
                onApply(start, end ?? start);
              }}
            >
              <Text style={rangeStyles.applyTxt}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatLeadDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function LeadListModal({ state, onClose, onOpenClient }: {
  state: LeadModalState | null;
  onClose: () => void;
  onOpenClient?: (clientId: string) => void;
}) {
  // Busca a lista sob demanda a partir dos parâmetros do card tocado. A RPC
  // já devolve ordenado por data desc; enabled só quando o modal está aberto.
  const leadsQuery = useMetricLeads(state?.params ?? null, state !== null);
  const leads = leadsQuery.data ?? [];

  return (
    <Modal visible={state !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle} numberOfLines={2}>{state?.title}</Text>
              <Text style={styles.modalSubtitle}>
                {leadsQuery.isLoading
                  ? 'Carregando...'
                  : `${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`}
              </Text>
            </View>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={leads}
            keyExtractor={(item, idx) => `${item.client_id}-${idx}`}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              leadsQuery.isLoading ? (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <ActivityIndicator color="var(--brand-text)" />
                </View>
              ) : (
                <Text style={styles.modalEmpty}>Nenhum lead nesse recorte.</Text>
              )
            }
            renderItem={({ item }) => {
              const when = formatLeadDate(item.at);
              // Executivo a mostrar: quem FEZ a acao (actor) tem prioridade;
              // senao o responsavel pelo lead. Evita repetir se forem iguais.
              const exec = item.actor_name?.trim() || item.responsavel_nome?.trim() || null;
              const body = (
                <>
                  <View style={[styles.modalLeadDot, { backgroundColor: (item.status && STATUS_COLOR[item.status]) || '#94a3b8' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLeadName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.modalLeadMeta}>
                      {(item.status && (STATUS_LABEL[item.status] ?? item.status)) || 'Sem status'}
                      {when ? ` • ${when}` : ''}
                    </Text>
                    {exec ? (
                      <Text style={styles.modalLeadExec} numberOfLines={1}>👤 {exec}</Text>
                    ) : null}
                    {item.note?.trim() ? (
                      <Text style={styles.modalLeadNote}>{item.note.trim()}</Text>
                    ) : null}
                  </View>
                  {onOpenClient ? <Text style={styles.modalLeadChevron}>›</Text> : null}
                </>
              );
              if (onOpenClient) {
                return (
                  <TouchableOpacity
                    style={styles.modalLeadRow}
                    activeOpacity={0.6}
                    onPress={() => { onOpenClient(item.client_id); onClose(); }}
                  >
                    {body}
                  </TouchableOpacity>
                );
              }
              return <View style={styles.modalLeadRow}>{body}</View>;
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

// Cor do badge de severidade da tarefa (mesma convencao da aba Tarefas).
const taskSevColor = (s: string | null) =>
  s === 'D5' ? '#C8131B' : s === 'D2' ? '#FFB32F' : s === 'SLA' ? '#2563eb' : '#64748b';

function TasksModal({ state, period, onClose, onOpenClient }: {
  state: TaskModalState | null;
  period: GestorPeriod;
  onClose: () => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const q = useGestorTasksList(
    state ? { hubspotId: state.hubspotId, status: state.status, period } : null,
    state !== null,
  );
  const tasks = q.data ?? [];
  return (
    <Modal visible={state !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle} numberOfLines={2}>{state?.title}</Text>
              <Text style={styles.modalSubtitle}>
                {q.isLoading
                  ? 'Carregando...'
                  : `${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'}`}
              </Text>
            </View>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={tasks}
            keyExtractor={(item, idx) => `${item.task_id}-${idx}`}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              q.isLoading ? (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <ActivityIndicator color="var(--brand-text)" />
                </View>
              ) : (
                <Text style={styles.modalEmpty}>Nenhuma tarefa nesse recorte.</Text>
              )
            }
            renderItem={({ item }) => {
              const when = formatLeadDate(item.at);
              const dias = item.days_in_stage != null ? Number(item.days_in_stage) : null;
              const badge = item.severity === 'SLA'
                ? (Number.isFinite(dias) ? `${dias}d` : 'SLA')
                : (item.severity ?? '•');
              const body = (
                <>
                  <View style={[styles.taskBadge, { backgroundColor: taskSevColor(item.severity) }]}>
                    <Text style={styles.taskBadgeText}>{badge}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLeadName} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.modalLeadMeta} numberOfLines={1}>{item.client_name}</Text>
                    <Text style={styles.modalLeadMeta}>
                      {item.etapa ? `${item.etapa}` : ''}
                      {Number.isFinite(dias) ? `${item.etapa ? ' • ' : ''}${dias} dia(s) na etapa` : ''}
                      {when ? ` • ${when}` : ''}
                    </Text>
                  </View>
                  {onOpenClient ? <Text style={styles.modalLeadChevron}>›</Text> : null}
                </>
              );
              if (onOpenClient) {
                return (
                  <TouchableOpacity
                    style={styles.modalLeadRow}
                    activeOpacity={0.6}
                    onPress={() => { onOpenClient(item.client_id); onClose(); }}
                  >
                    {body}
                  </TouchableOpacity>
                );
              }
              return <View style={styles.modalLeadRow}>{body}</View>;
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  onPress,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.statCard}>{content}</View>;
}

function MetricBox({
  value,
  label,
  color,
  onPress,
}: {
  value: number;
  label: string;
  color: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </>
  );
  // Só vira botão quando tem lead por trás — 0 não abre modal vazio.
  if (onPress && value > 0) {
    return (
      <TouchableOpacity style={styles.metricBox} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.metricBox}>{content}</View>;
}

function SellerCard({
  seller,
  rank,
  period,
  onOpenLeads,
  taskCounts,
  onOpenTasks,
}: {
  seller: SellerMetrics;
  rank: number;
  period: GestorPeriod;
  onOpenLeads: (title: string, params: MetricLeadsParams) => void;
  taskCounts: { pending: number; done: number };
  onOpenTasks: (title: string, hubspotId: string | null, status: GestorTaskStatus) => void;
}) {
  const displayName = seller.full_name?.trim() || seller.email || 'Sem nome';
  const initials = (seller.full_name?.trim() || seller.email || '?')
    .split(/\s+/)
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const totalActivity =
    seller.visited + seller.created + seller.meetings_scheduled + seller.follow_ups_scheduled + seller.stage_changes + seller.notes_created;

  // Distribuicao de status apenas dos leads sob responsabilidade.
  const statusEntries = Object.entries(seller.status_breakdown).sort((a, b) => b[1] - a[1]);

  // Abre o modal pedindo os leads da métrica desse vendedor (filtra por seller_id).
  const open = (metricLabel: string, params: Partial<MetricLeadsParams> & { metric: MetricLeadsParams['metric'] }) =>
    onOpenLeads(`${metricLabel} — ${displayName}`, {
      period,
      sellerId: seller.seller_id,
      ...params,
    });

  return (
    <View style={styles.sellerCard}>
      <View style={styles.sellerHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankBadgeText}>#{rank}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sellerName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.sellerEmail} numberOfLines={1}>
            {seller.email}{seller.sector ? ` • ${seller.sector}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <MetricBox value={seller.visited} label="Visitados" color="#a855f7" onPress={() => open('Visitados', { metric: 'visited' })} />
        <MetricBox value={seller.created} label="Criados" color="#3b82f6" onPress={() => open('Criados', { metric: 'created' })} />
        <MetricBox value={seller.meetings_scheduled} label="Reuniões" color="#f97316" onPress={() => open('Reuniões', { metric: 'meetings' })} />
      </View>
      <View style={styles.metricsRow}>
        <MetricBox value={seller.follow_ups_scheduled} label="Follow ups" color="#0891b2" onPress={() => open('Follow ups', { metric: 'follow_ups' })} />
        <MetricBox value={seller.stage_changes} label="Mudanças" color="#0ea5e9" onPress={() => open('Mudanças de etapa', { metric: 'stage_changes' })} />
        <MetricBox value={seller.notes_created} label="Notas" color="#FFD966" onPress={() => open('Notas', { metric: 'notes' })} />
      </View>

      <View style={styles.assignedRow}>
        <TouchableOpacity
          disabled={seller.leads_assigned === 0}
          onPress={() => open('Leads atribuídos', { metric: 'assigned', hubspotId: seller.id_hubspot, sellerId: null })}
        >
          <Text style={[styles.assignedLabel, seller.leads_assigned > 0 && styles.assignedLabelLink]}>
            {seller.leads_assigned} {seller.leads_assigned === 1 ? 'lead atribuído' : 'leads atribuídos'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.totalActivityText}>{totalActivity} ações no período</Text>
      </View>

      {/* Tarefas: pendentes = agora; concluidas = no periodo. */}
      <Text style={styles.taskSectionLabel}>Tarefas</Text>
      <View style={styles.metricsRow}>
        <MetricBox
          value={taskCounts.pending}
          label="Pendentes"
          color="var(--brand-text)"
          onPress={() => onOpenTasks(`Tarefas pendentes — ${displayName}`, seller.id_hubspot, 'pendente')}
        />
        <MetricBox
          value={taskCounts.done}
          label="Concluídas"
          color="#16a34a"
          onPress={() => onOpenTasks(`Tarefas concluídas — ${displayName}`, seller.id_hubspot, 'concluida')}
        />
      </View>

      {statusEntries.length > 0 ? (
        <View style={styles.statusBreakdown}>
          {statusEntries.map(([status, count]) => (
            <TouchableOpacity
              key={status}
              style={styles.statusChip}
              onPress={() =>
                open(STATUS_LABEL[status] ?? status, {
                  metric: 'assigned',
                  hubspotId: seller.id_hubspot,
                  status,
                  sellerId: null,
                })
              }
            >
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] ?? '#94a3b8' }]} />
              <Text style={styles.statusChipText}>
                {STATUS_LABEL[status] ?? status} {count}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function GestorScreen({ enabled, onOpenClient }: Props) {
  const [preset, setPreset] = useState<GestorPeriodPreset>('30d');
  // Intervalo do período personalizado (dias locais, início/fim inclusivos).
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [leadModal, setLeadModal] = useState<LeadModalState | null>(null);
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null);
  const [exporting, setExporting] = useState<null | 'last_week' | 'period'>(null);

  const period = useMemo<GestorPeriod>(() => {
    if (preset === 'custom' && customStart && customEnd) {
      const endOfDay = new Date(
        customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate(),
        23, 59, 59, 999,
      );
      return { preset, startISO: customStart.toISOString(), endISO: endOfDay.toISOString() };
    }
    // 'custom' sem intervalo definido não acontece (o preset só vira custom
    // no Aplicar do calendário), mas o fallback evita query aberta por engano.
    return { preset: preset === 'custom' ? '30d' : preset };
  }, [preset, customStart, customEnd]);

  const query = useGestorMetrics(period, enabled);
  const taskQuery = useGestorTaskMetrics(period, enabled);

  // Mapa id_hubspot -> { pending, done } pra cada SellerCard cruzar direto.
  const taskCountsByHubspot = useMemo(() => {
    const m = new Map<string, { pending: number; done: number }>();
    for (const t of taskQuery.data ?? []) {
      if (t.id_hubspot != null) m.set(t.id_hubspot, { pending: t.pending, done: t.done });
    }
    return m;
  }, [taskQuery.data]);

  const openLeads = (title: string, params: MetricLeadsParams) => setLeadModal({ title, params });
  const openTasks = (title: string, hubspotId: string | null, status: GestorTaskStatus) =>
    setTaskModal({ title, hubspotId, status });

  // Gera o CSV (semana anterior ou o periodo atual da tela) e abre o link.
  const runExport = async (which: 'last_week' | 'period') => {
    if (exporting) return;
    setExporting(which);
    try {
      // 'period' usa o range atual da tela; 'last_week' manda vazio (a function
      // resolve a semana anterior seg-dom). Presets relativos viram range aqui.
      let range: { start: string; end: string } | null = null;
      if (which === 'period') {
        const r = periodRange(period);
        range = { start: r.start ?? new Date(0).toISOString(), end: r.end ?? new Date().toISOString() };
      }
      const res = await exportReport(range);
      const c = res.rows;
      const resumo = c
        ? `${c.leads} leads · ${c.tarefas} tarefas · ${c.visitas} visitas · ${c.reunioes} reuniões · ${c.follow_ups} follow-ups · ${c.mudancas_etapa} etapas · ${c.notas} notas`
        : '';
      Alert.alert(
        'Exportação pronta 📊',
        `Período ${res.period.label.replace(/_/g, ' ')}.\n${resumo}\n\nToque em Abrir para baixar o .json (abre no navegador). Depois é só jogar na IA.`,
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'Abrir', onPress: () => Linking.openURL(res.url) },
        ],
      );
    } catch (err: any) {
      Alert.alert('Erro ao exportar', err?.message ?? 'Tente novamente.');
    } finally {
      setExporting(null);
    }
  };

  const periodLabel =
    preset === 'all' ? 'total'
    : preset === 'today' ? 'de hoje'
    : preset === 'custom' && customStart && customEnd
      ? `de ${fmtShort(customStart)} até ${fmtShort(customEnd)}`
    : `nos últimos ${preset === '7d' ? '7' : '30'} dias`;

  // Filtra vendedores totalmente inativos quando periodo != 'all' pra reduzir ruido.
  // Em 'all' mostra todos.
  const visibleSellers = useMemo(() => {
    if (!query.data) return [];
    return query.data.sellers.filter(s =>
      preset === 'all'
        ? true
        : s.visited > 0 ||
          s.created > 0 ||
          s.meetings_scheduled > 0 ||
          s.follow_ups_scheduled > 0 ||
          s.stage_changes > 0 ||
          s.notes_created > 0 ||
          s.leads_assigned > 0,
    );
  }, [query.data, preset]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={query.isFetching && !query.isLoading} onRefresh={() => query.refetch()} />
      }
    >
      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.periodChip, preset === opt.value && styles.periodChipActive]}
            onPress={() => setPreset(opt.value)}
          >
            <Text style={[styles.periodChipText, preset === opt.value && styles.periodChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.customChip, preset === 'custom' && styles.periodChipActive]}
        onPress={() => setRangePickerOpen(true)}
      >
        <Text style={[styles.periodChipText, preset === 'custom' && styles.periodChipTextActive]}>
          📅 {preset === 'custom' && customStart && customEnd
            ? `${fmtShort(customStart)} até ${fmtShort(customEnd)} — toque pra alterar`
            : 'Período personalizado'}
        </Text>
      </TouchableOpacity>

      {/* A promessa do dia de QUEM ESTA OLHANDO.
          A navegacao e' ou/ou: quem e' gestor ve a aba "Gestor" e nunca a aba
          "Meu". Sem este cartao aqui, um gestor que faz campo — e existe pelo
          menos um, com 9 rotas em 90 dias — apareceria no placar da Daily sendo
          cobrado por uma palavra que o app nao deixava ele dar.
          O cartao se esconde sozinho pra quem esta marcado como nao-vendedor. */}
      <MinhaDailyCard enabled={enabled} />

      {/* Quem é vendedor ativo / comum sem meta / não é vendedor. */}
      <SellerClassificationCard />

      {/* Config da Rota do dia (raio/nota/avaliações Conta Alvo, meta/dia, SLAs). */}
      <RouteConfigCard />

      {/* Meta diária de visitas por vendedor (usada no ranking). */}
      <SellerGoalsCard />

      {/* Contas Alvo dispensadas ("Não interessa") — quem/quando + restaurar. */}
      <DismissedContaAlvoCard />

      {/* Ranking + histórico de rotas (planejado + check-ins) no período. */}
      <RouteHistorySection
        range={periodRange(period)}
        enabled={enabled}
      />

      {/* Exportacao de dados (CSV com atividade por vendedor). */}
      <View style={styles.exportCard}>
        <IconText Icone={IconBarGraph} style={styles.exportTitle} tone="onSurface">Exportar TUDO (JSON p/ IA)</IconText>
        <Text style={styles.exportHint}>
          Exporta tudo do período — leads (dados completos), tarefas, visitas, reuniões,
          follow-ups, mudanças de etapa (com motivos) e notas, cada um com o vendedor.
          Um único arquivo .json pra jogar numa IA analisar.
        </Text>
        <View style={styles.exportRow}>
          <TouchableOpacity
            style={[styles.exportBtn, styles.exportBtnPrimary, exporting && styles.exportBtnDisabled]}
            onPress={() => runExport('last_week')}
            disabled={!!exporting}
          >
            {exporting === 'last_week'
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.exportBtnPrimaryText}>Semana anterior</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, styles.exportBtnGhost, exporting && styles.exportBtnDisabled]}
            onPress={() => runExport('period')}
            disabled={!!exporting}
          >
            {exporting === 'period'
              ? <ActivityIndicator color="var(--text)" />
              : <Text style={styles.exportBtnGhostText}>Período selecionado</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {query.isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color="var(--brand-text)" />
          <Text style={styles.loadingText}>Carregando métricas...</Text>
        </View>
      ) : query.isError ? (
        <View style={styles.loadingBlock}>
          <Text style={styles.errorText}>Erro ao carregar métricas.</Text>
          <Text style={styles.errorSub}>{(query.error as Error)?.message ?? 'Tente novamente.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => query.refetch()}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : query.data ? (
        <>
          {/* Resumo global de status (snapshot atual). */}
          <Text style={styles.sectionTitle}>Visão geral (snapshot atual)</Text>
          <View style={styles.statsGrid}>
            <StatCard
              label="Total de leads"
              value={query.data.global.total_clients}
              color="var(--text)"
              onPress={() => openLeads('Todos os leads', { metric: 'all', period })}
            />
            <StatCard
              label="Leads"
              value={query.data.global.total_leads}
              color={STATUS_COLOR.lead}
              onPress={() => openLeads('Leads', { metric: 'status', period, status: 'lead' })}
            />
            <StatCard
              label="Visitados"
              value={query.data.global.total_visited}
              color={STATUS_COLOR.lead_visitado}
              // Visita e' desacoplada do status desde 20260619: o card conta
              // clients.visited_at IS NOT NULL (all time), entao o drill-down
              // usa a metrica 'visited' sem recorte de periodo — filtrar por
              // status='lead_visitado' (slug legado inativo) voltaria vazio.
              onPress={() => openLeads('Visitados', { metric: 'visited', period: { preset: 'all' } })}
            />
            <StatCard
              label="Clientes"
              value={query.data.global.total_active_clients}
              color={STATUS_COLOR.cliente}
              onPress={() => openLeads('Clientes', { metric: 'status', period, status: 'cliente' })}
            />
            <StatCard
              label="Churn"
              value={query.data.global.total_churn}
              color={STATUS_COLOR.churn}
              onPress={() => openLeads('Churn', { metric: 'status', period, status: 'churn' })}
            />
          </View>

          {/* Atividade no periodo selecionado. */}
          <Text style={styles.sectionTitle}>
            Atividade {periodLabel}
          </Text>
          <View style={styles.statsGrid}>
            <StatCard
              label="Visitados"
              value={query.data.global.visited_in_period}
              color="#a855f7"
              onPress={() => openLeads('Visitados no período', { metric: 'visited', period })}
            />
            <StatCard
              label="Criados"
              value={query.data.global.created_in_period}
              color="#3b82f6"
              onPress={() => openLeads('Criados no período', { metric: 'created', period })}
            />
            <StatCard
              label="Reuniões"
              value={query.data.global.meetings_in_period}
              color="#f97316"
              onPress={() => openLeads('Reuniões no período', { metric: 'meetings', period })}
            />
            <StatCard
              label="Follow ups"
              value={query.data.global.follow_ups_in_period}
              color="#0891b2"
              onPress={() => openLeads('Follow ups no período', { metric: 'follow_ups', period })}
            />
            <StatCard
              label="Mudanças etapa"
              value={query.data.global.stage_changes_in_period}
              color="#0ea5e9"
              onPress={() => openLeads('Mudanças de etapa no período', { metric: 'stage_changes', period })}
            />
            <StatCard
              label="Notas"
              value={query.data.global.notes_in_period}
              color="#FFD966"
              onPress={() => openLeads('Notas no período', { metric: 'notes', period })}
            />
          </View>

          {/* Ranking de vendedores. */}
          <Text style={styles.sectionTitle}>
            Vendedores ({visibleSellers.length}) {preset !== 'all' ? '— ativos no período' : ''}
          </Text>
          {visibleSellers.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyText}>Nenhuma atividade registrada no período.</Text>
            </View>
          ) : (
            visibleSellers.map((seller, idx) => (
              <SellerCard
                key={seller.seller_id}
                seller={seller}
                rank={idx + 1}
                period={period}
                onOpenLeads={openLeads}
                taskCounts={
                  (seller.id_hubspot && taskCountsByHubspot.get(seller.id_hubspot)) || { pending: 0, done: 0 }
                }
                onOpenTasks={openTasks}
              />
            ))
          )}

          <Text style={styles.footerHint}>
            Toque em qualquer número pra ver os leads por trás dele. Puxe pra baixo pra atualizar.
          </Text>
        </>
      ) : null}

      <LeadListModal state={leadModal} onClose={() => setLeadModal(null)} onOpenClient={onOpenClient} />
      <TasksModal state={taskModal} period={period} onClose={() => setTaskModal(null)} onOpenClient={onOpenClient} />

      {rangePickerOpen && (
        <RangeCalendarModal
          initialStart={customStart}
          initialEnd={customEnd}
          onClose={() => setRangePickerOpen(false)}
          onApply={(s, e) => {
            setCustomStart(startOfDay(s));
            setCustomEnd(startOfDay(e));
            setPreset('custom');
            setRangePickerOpen(false);
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'var(--bg)' },
  content: { padding: 16, paddingBottom: 120 },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  customChip: {
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'var(--surface)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'var(--border)',
    marginBottom: 16,
  },
  exportCard: {
    backgroundColor: 'var(--surface)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'var(--border)', marginBottom: 16,
  },
  exportTitle: { fontSize: 14, fontWeight: '800', color: 'var(--text)' },
  exportHint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginBottom: 10, lineHeight: 15 },
  exportRow: { flexDirection: 'row', gap: 8 },
  exportBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  exportBtnPrimary: { backgroundColor: '#222222' },
  exportBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  exportBtnGhost: { backgroundColor: 'var(--surface-2)', borderWidth: 1, borderColor: 'var(--border)' },
  exportBtnGhostText: { color: 'var(--text)', fontSize: 13, fontWeight: '700' },
  exportBtnDisabled: { opacity: 0.6 },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'var(--surface)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  periodChipActive: {
    backgroundColor: '#C8131B',
    borderColor: '#C8131B',
  },
  periodChipText: { fontSize: 13, fontWeight: '600', color: 'var(--text-muted)' },
  periodChipTextActive: { color: '#fff' },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'var(--text-subtle)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 10,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: 'var(--surface)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: 'var(--text)' },
  statLabel: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontWeight: '600' },
  statSub: { fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 },

  sellerCard: {
    backgroundColor: 'var(--surface)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  sellerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  rankBadge: {
    minWidth: 32,
    paddingHorizontal: 6,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'var(--tint-red)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: 'var(--brand-text)', fontSize: 14, fontWeight: '800' },
  sellerName: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  sellerEmail: { fontSize: 12, color: 'var(--text-muted)', marginTop: 1 },

  metricsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: 'var(--bg)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricLabel: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: '600' },

  taskSectionLabel: {
    fontSize: 11, fontWeight: '700', color: 'var(--text-subtle)',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 6,
  },
  taskBadge: {
    minWidth: 34, height: 24, paddingHorizontal: 6, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  taskBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  assignedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'var(--border-soft)',
  },
  assignedLabel: { fontSize: 12, color: 'var(--text-muted)', fontWeight: '600' },
  assignedLabelLink: { textDecorationLine: 'underline' },
  totalActivityText: { fontSize: 11, color: 'var(--text-subtle)' },

  statusBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'var(--surface-2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: 11, color: 'var(--text-muted)', fontWeight: '600' },

  loadingBlock: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  loadingText: { color: 'var(--text-muted)', fontSize: 13 },
  errorText: { color: 'var(--brand-text)', fontSize: 15, fontWeight: '700' },
  errorSub: { color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
  retryButton: {
    marginTop: 12,
    backgroundColor: '#222222',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  emptyBlock: {
    backgroundColor: 'var(--surface)',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  emptyText: { color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' },

  footerHint: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 11,
    color: 'var(--text-subtle)',
    fontStyle: 'italic',
  },

  // ===== Modal "leads por trás do número" =====
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalPanel: {
    maxHeight: '75%',
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border-soft)',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  modalSubtitle: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  modalCloseButton: {
    backgroundColor: 'var(--surface-2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modalCloseText: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  modalEmpty: { textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingVertical: 24 },
  modalLeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border-soft)',
  },
  modalLeadDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  modalLeadName: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  modalLeadMeta: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  modalLeadExec: { fontSize: 11, color: 'var(--info-text)', fontWeight: '700', marginTop: 2 },
  modalLeadChevron: { fontSize: 22, color: 'var(--text-faint)', fontWeight: '700', marginLeft: 4, alignSelf: 'center' },
  modalLeadNote: {
    fontSize: 13,
    color: 'var(--text)',
    marginTop: 6,
    lineHeight: 18,
    backgroundColor: 'var(--bg)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#FFD966',
  },
});

// ===== Modal do período personalizado =====
const rangeStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
  },
  title: { fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  summary: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginBottom: 12 },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'var(--bg)', borderWidth: 1, borderColor: 'var(--border)',
  },
  navTxt: { fontSize: 22, color: 'var(--text)', marginTop: -2, fontWeight: '700' },
  calTitle: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  weekRow: { flexDirection: 'row' },
  weekDay: {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '700', color: 'var(--text-muted)',
    paddingVertical: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1.15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  cellEmpty: { width: `${100 / 7}%`, aspectRatio: 1.15 },
  cellEdge: { backgroundColor: '#C8131B' },
  cellBetween: { backgroundColor: 'var(--tint-red)' },
  cellFuture: { opacity: 0.35 },
  cellTxt: { fontSize: 14, color: 'var(--text)', fontWeight: '600' },
  cellTxtFuture: { color: 'var(--text-subtle)' },
  cellTxtActive: { fontWeight: '800', color: 'var(--tint-red-text)' },
  cellTxtEdge: { fontWeight: '800', color: '#fff' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'var(--surface-2)',
  },
  cancelTxt: { fontSize: 14, fontWeight: '700', color: 'var(--text-muted)' },
  applyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#C8131B',
  },
  applyBtnDisabled: { opacity: 0.5 },
  applyTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
