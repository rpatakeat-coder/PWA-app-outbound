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
  Pressable,
} from 'react-native';
import { Alert } from '../components/Alert';
import {
  IconBarGraph,
  IconText,
  IconCalendar,
  IconUser,
  IconTrendingUp,
  IconTrendingDown,
  IconDownload,
  IconLocationFilled,
  IconStore,
  IconCall,
  IconPencil,
  IconSettings,
  IconClose,
  IconChevronRight,
  useIconColors,
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
  type SellerMetricKey,
  type SellerTaskCounts,
  type GestorTaskItem,
  type GestorTaskStatus,
} from '../hooks/useGestorMetrics';
import { RouteConfigCard } from './RouteConfigCard';
import { SellerClassificationCard } from './SellerClassificationCard';
import { SellerGoalsCard } from './SellerGoalsCard';
import { useSellerGoals } from '../hooks/useSellerGoals';
import { DismissedContaAlvoCard } from './DismissedContaAlvoCard';
import { RouteHistorySection } from './RouteHistorySection';
import { MinhaDailyCard } from './MinhaDailyCard';
import { useLayout } from '../hooks/useLayout';
import { useAuth } from '../context/AuthContext';

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
  const layoutModal = useLayout();
  const leads = leadsQuery.data ?? [];

  return (
    <Modal visible={state !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, layoutModal.ehLargo && styles.modalBackdropWeb]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalPanel, layoutModal.ehLargo && styles.modalPanelWeb]}>
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
                      <IconText Icone={IconUser} size={12} style={styles.modalLeadExec} tone="muted">{exec}</IconText>
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
  const layoutModal = useLayout();
  const q = useGestorTasksList(
    state ? { hubspotId: state.hubspotId, status: state.status, period } : null,
    state !== null,
  );
  const tasks = q.data ?? [];
  return (
    <Modal visible={state !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, layoutModal.ehLargo && styles.modalBackdropWeb]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalPanel, layoutModal.ehLargo && styles.modalPanelWeb]}>
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
  metaDia,
  aberto = false,
  aoAlternar,
}: {
  seller: SellerMetrics;
  rank: number;
  period: GestorPeriod;
  onOpenLeads: (title: string, params: MetricLeadsParams) => void;
  taskCounts: { pending: number; done: number };
  onOpenTasks: (title: string, hubspotId: string | null, status: GestorTaskStatus) => void;
  /** Meta DIARIA de visitas (seller_visit_goals). Nao ha' meta mensal. */
  metaDia?: number;
  aberto?: boolean;
  aoAlternar?: () => void;
}) {
  const layout = useLayout();
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

  // Badge de meta. O que existe e' `meta_visitas_dia` — meta DIARIA. Nao ha'
  // meta mensal nem % de atingimento em lugar nenhum, entao o badge diz o
  // alvo do dia em vez de fingir uma porcentagem.
  const metaBadge = metaDia != null && metaDia > 0 ? (
    <View style={[styles.metaBadge, seller.visited >= metaDia ? styles.metaBadgeOk : styles.metaBadgeAbaixo]}>
      <Text style={[styles.metaBadgeTexto, seller.visited >= metaDia ? styles.metaBadgeTextoOk : styles.metaBadgeTextoAbaixo]}>
        {`meta ${metaDia}/dia`}
      </Text>
    </View>
  ) : null;

  // Abre o modal pedindo os leads da métrica desse vendedor (filtra por seller_id).
  const open = (metricLabel: string, params: Partial<MetricLeadsParams> & { metric: MetricLeadsParams['metric'] }) =>
    onOpenLeads(`${metricLabel} — ${displayName}`, {
      period,
      sellerId: seller.seller_id,
      ...params,
    });

  // No celular a tabela de 7 colunas do desktop nao cabe em 390px: cada
  // vendedor vira uma LINHA de duas alturas com as duas metricas que importam
  // (visitas e fechados) e a meta. O detalhe — com TODOS os drill-downs por
  // metrica — continua existindo: a linha inteira e' o alvo e abre o resto.
  if (!layout.ehLargo) {
    return (
      <View style={styles.timeLinhaCasca}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: aberto }}
          accessibilityLabel={`${displayName}, ${seller.visited} visitas, ${seller.won_in_period} fechados`}
          style={styles.timeLinha}
          onPress={() => aoAlternar?.()}
          activeOpacity={0.85}
        >
          <View style={styles.timeAvatar}>
            <Text style={styles.timeAvatarTexto}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.timeNome} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.timeMetricas} numberOfLines={1}>
              {`${seller.visited} ${seller.visited === 1 ? 'visita' : 'visitas'} · ${seller.won_in_period} ${seller.won_in_period === 1 ? 'fechado' : 'fechados'}`}
            </Text>
          </View>
          {metaBadge}
        </TouchableOpacity>
        {aberto && (
          <View style={styles.timeDetalhe}>
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
            <View style={styles.metricsRow}>
              <MetricBox
                value={taskCounts.pending}
                label="Tarefas pendentes"
                color="var(--brand-text)"
                onPress={() => onOpenTasks(`Tarefas pendentes — ${displayName}`, seller.id_hubspot, 'pendente')}
              />
              <MetricBox
                value={taskCounts.done}
                label="Tarefas concluídas"
                color="#16a34a"
                onPress={() => onOpenTasks(`Tarefas concluídas — ${displayName}`, seller.id_hubspot, 'concluida')}
              />
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={seller.leads_assigned === 0}
              onPress={() => open('Leads atribuídos', { metric: 'assigned', hubspotId: seller.id_hubspot, sellerId: null })}
            >
              <Text style={[styles.assignedLabel, seller.leads_assigned > 0 && styles.assignedLabelLink]}>
                {seller.leads_assigned} {seller.leads_assigned === 1 ? 'lead atribuído' : 'leads atribuídos'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

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
  const layout = useLayout();
  const [preset, setPreset] = useState<GestorPeriodPreset>('30d');
  // Intervalo do período personalizado (dias locais, início/fim inclusivos).
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [leadModal, setLeadModal] = useState<LeadModalState | null>(null);
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null);
  const [exporting, setExporting] = useState<null | 'last_week' | 'period'>(null);
  // 09e: qual card do rail esta aberto no drawer de 480px.
  const [railAberto, setRailAberto] = useState<null | 'usuarios' | 'rota' | 'metas' | 'contas' | 'historico'>(null);
  // Qual vendedor esta' expandido na lista do celular. A linha compacta e' o
  // resumo; o detalhe guarda os drill-downs por metrica que ja' existiam.
  const [vendedorAberto, setVendedorAberto] = useState<string | null>(null);
  // Meta DIARIA de visitas por vendedor. E' a unica meta que existe.
  const { goals: metasPorVendedor } = useSellerGoals(enabled);
  const { profile: meuPerfil } = useAuth();
  const iconColors = useIconColors();

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
        'Exportação pronta',
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
      <View style={[styles.periodRow, layout.ehLargo && estilosWeb.periodoLinha]}>
        {PERIOD_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.periodChip, layout.ehLargo && estilosWeb.periodoChip, preset === opt.value && styles.periodChipActive]}
            onPress={() => setPreset(opt.value)}
          >
            <Text style={[styles.periodChipText, preset === opt.value && styles.periodChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.customChip, layout.ehLargo && estilosWeb.periodoChip, layout.ehLargo && estilosWeb.periodoCustom, preset === 'custom' && styles.periodChipActive]}
        onPress={() => setRangePickerOpen(true)}
      >
        <IconText Icone={IconCalendar} style={[styles.periodChipText, preset === 'custom' && styles.periodChipTextActive]} tone="onSurface">{preset === 'custom' && customStart && customEnd
            ? `${fmtShort(customStart)} até ${fmtShort(customEnd)} — toque pra alterar`
            : 'Período personalizado'}</IconText>
      </TouchableOpacity>

      {(() => {
        // A MESMA tela, DOIS layouts de verdade:
        //   celular  -> a pilha original, na ordem original, intocada;
        //   desktop  -> dashboard: METRICAS na frente (sao a razao de ser da
        //               tela e estavam ATRAS das configuracoes), ranking
        //               embaixo, e um trilho lateral de 380px com Daily,
        //               configuracoes e exportacao — o 8+4 do grid oficial.
        // Os blocos sao os MESMOS nas duas composicoes: nada duplica.
        const cartoesConfig = (
          <>
            <MinhaDailyCard enabled={enabled} />
            <SellerClassificationCard />
            <RouteConfigCard />
            <SellerGoalsCard />
            <DismissedContaAlvoCard />
          </>
        );
        const ranking = (
          <RouteHistorySection range={periodRange(period)} enabled={enabled} />
        );
        const exportar = (
          <>
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
          </>
        );
        const g = query.data?.global ?? null;
        const carregandoOuErro = query.isLoading ? (
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
        ) : null;

        // ---- 09b: barra de composicao da base (um card, nao cinco) ----
        const barraComposicao = g && (() => {
          const partes = [
            { chave: 'lead', rotulo: 'Leads', n: g.total_leads, cor: '#0ea5e9' },
            { chave: 'cliente', rotulo: 'Clientes', n: g.total_active_clients, cor: '#16a34a' },
            { chave: 'churn', rotulo: 'Churn', n: g.total_churn, cor: '#475569' },
          ];
          const total = Math.max(g.total_clients, 1);
          return (
            <View style={nw.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, gap: 16 }}>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Text style={nw.kicker}>Composição da base</Text>
                  <Text style={nw.notinha}>Snapshot atual, independente do período</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={nw.numeroGrande}>{g.total_clients.toLocaleString('pt-BR')}</Text>
                  <Text style={nw.rotulinho}>registros</Text>
                </View>
              </View>
              <View style={nw.barraTrilha}>
                {partes.map(pt => {
                  const pct = (pt.n / total) * 100;
                  return (
                    <View key={pt.chave} style={[nw.barraSegmento, { width: `${pct}%`, backgroundColor: pt.cor }]}>
                      {pct >= 8 && (
                        <Text style={nw.barraPct} numberOfLines={1}>{`${Math.round(pct)}%`}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
                {partes.map(pt => (
                  <TouchableOpacity
                    key={pt.chave}
                    accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                    onPress={() => openLeads(pt.rotulo, { metric: 'status', period, status: pt.chave })}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pt.cor }} />
                    <Text style={nw.numeroMedio}>{pt.n.toLocaleString('pt-BR')}</Text>
                    <Text style={nw.rotulinho}>{pt.rotulo}</Text>
                  </TouchableOpacity>
                ))}
                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'var(--border)' }} />
                <TouchableOpacity
                  accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  onPress={() => openLeads('Visitados', { metric: 'visited', period: { preset: 'all' } })}
                >
                  <IconLocationFilled width={20} height={20} fill={iconColors.muted} />
                  <Text style={nw.numeroMedio}>{g.total_visited.toLocaleString('pt-BR')}</Text>
                  <Text style={nw.rotulinho}>já visitados</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })();

        // ---- 09c: atividade no periodo (6 cards clicaveis) ----
        const CARDS_ATIVIDADE = g
          ? ([
              { rotulo: 'Visitados', n: g.visited_in_period, metric: 'visited' as const, Icone: IconLocationFilled },
              { rotulo: 'Criados', n: g.created_in_period, metric: 'created' as const, Icone: IconStore },
              { rotulo: 'Reuniões', n: g.meetings_in_period, metric: 'meetings' as const, Icone: IconCalendar },
              { rotulo: 'Follow-ups', n: g.follow_ups_in_period, metric: 'follow_ups' as const, Icone: IconCall },
              { rotulo: 'Mudanças', n: g.stage_changes_in_period, metric: 'stage_changes' as const, Icone: IconTrendingUp },
              { rotulo: 'Notas', n: g.notes_in_period, metric: 'notes' as const, Icone: IconPencil },
            ])
          : [];
        const faixaAtividade = g && (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 16 }}>
              <Text style={nw.kicker}>{`Atividade no período · ${visibleSellers.length} vendedores`}</Text>
              <Text style={nw.notinha}>Snapshot lido agora · atividade no período</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {CARDS_ATIVIDADE.map(c => (
                <TouchableOpacity
                  key={c.metric}
                  accessibilityRole="button"
                  style={nw.cardAtividade}
                  onPress={() => openLeads(`${c.rotulo} no período`, { metric: c.metric, period })}
                >
                  <c.Icone width={20} height={20} fill={iconColors.muted} />
                  <Text style={nw.numeroCard}>{c.n.toLocaleString('pt-BR')}</Text>
                  <Text style={nw.rotulinho}>{c.rotulo}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

        // ---- 09d: ranking em TABELA (era ~500px por vendedor) ----
        const pontuacao = (s: SellerMetrics) =>
          s.visited * 3 + s.created * 2 + s.meetings_scheduled + s.follow_ups_scheduled + s.stage_changes + s.notes_created;
        const maiorPontuacao = Math.max(...visibleSellers.map(pontuacao), 1);
        const COLS_VEND: Array<{ rotulo: string; metric: SellerMetricKey; campo: (s: SellerMetrics) => number }> = [
          { rotulo: 'Visitados', metric: 'visited', campo: s => s.visited },
          { rotulo: 'Criados', metric: 'created', campo: s => s.created },
          { rotulo: 'Reuniões', metric: 'meetings', campo: s => s.meetings_scheduled },
          { rotulo: 'Follow-ups', metric: 'follow_ups', campo: s => s.follow_ups_scheduled },
          { rotulo: 'Mudanças', metric: 'stage_changes', campo: s => s.stage_changes },
          { rotulo: 'Notas', metric: 'notes', campo: s => s.notes_created },
        ];
        const tabelaVendedores = g && (
          <View style={[nw.card, { padding: 0, overflow: 'hidden' }]}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: 'var(--border)' }}>
              <Text style={nw.tituloCard}>Vendedores</Text>
              <Text style={nw.notinha}>Ordenado por atividade ponderada · clique numa célula para ver os leads</Text>
            </View>
            <View style={nw.thLinha}>
              <Text style={[nw.th, { width: 32, flex: 0, textAlign: 'left' }]}>#</Text>
              <Text style={[nw.th, { flexGrow: 2, flexBasis: 200, textAlign: 'left' }]}>Vendedor</Text>
              {COLS_VEND.map(c => (
                <Text key={c.metric} style={nw.th}>{c.rotulo}</Text>
              ))}
              <Text style={[nw.th, { width: 96, flex: 0 }]}>Tarefas</Text>
              <Text style={[nw.th, { width: 88, flex: 0 }]}>Ações</Text>
            </View>
            {visibleSellers.map((s, idx) => {
              const nome = s.full_name || s.email || '—';
              const iniciais = nome.trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
              const souEu = meuPerfil?.id === s.seller_id;
              const tarefas = s.id_hubspot ? taskCountsByHubspot.get(s.id_hubspot) : undefined;
              const score = pontuacao(s);
              const top3 = idx < 3;
              return (
                <View key={s.seller_id} style={nw.tdLinha} {...({ dataSet: { hover: 'surface2', trans: '1' } } as Record<string, unknown>)}>
                  <Text style={[nw.tdRank, top3 && { color: '#C8131B' }]}>{`#${idx + 1}`}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={{ flexGrow: 2, flexBasis: 200, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={() => openLeads(`Leads atribuídos — ${nome}`, { metric: 'assigned', period, hubspotId: s.id_hubspot, sellerId: null })}
                  >
                    <View style={[nw.avatar, souEu && { backgroundColor: 'var(--tint-red)' }]}>
                      <Text style={[nw.avatarTexto, souEu && { color: 'var(--tint-red-text)' }]}>{iniciais}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={nw.tdNome} numberOfLines={1}>{nome}</Text>
                      <Text style={nw.notinha} numberOfLines={1}>
                        {[s.sector, `${s.leads_assigned.toLocaleString('pt-BR')} leads`].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {COLS_VEND.map(c => (
                    <TouchableOpacity
                      key={c.metric}
                      accessibilityRole="button"
                      style={{ flex: 1, minWidth: 76 }}
                      onPress={() => openLeads(`${c.rotulo} — ${nome}`, { metric: c.metric, period, sellerId: s.seller_id })}
                    >
                      <Text style={[nw.td, c.metric === 'visited' && s.visited > 0 && { color: 'var(--text)' }]}>
                        {c.campo(s).toLocaleString('pt-BR')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={{ width: 96 }}
                    disabled={!s.id_hubspot}
                    onPress={() => s.id_hubspot && openTasks(`Tarefas — ${nome}`, s.id_hubspot, 'pendente')}
                  >
                    {tarefas ? (
                      <Text style={[nw.td, { fontSize: 12 }]}>
                        <Text style={(tarefas.pending >= 5 && { color: 'var(--tint-red-text)' }) || undefined}>
                          {tarefas.pending}
                        </Text>
                        <Text style={{ color: 'var(--text-disabled)' }}> / </Text>
                        {tarefas.done}
                      </Text>
                    ) : (
                      <Text style={[nw.td, { color: 'var(--text-disabled)' }]}>—</Text>
                    )}
                  </TouchableOpacity>
                  <View style={{ width: 88, alignItems: 'flex-end', gap: 4 }}>
                    <View style={nw.scoreTrilha}>
                      <View
                        style={[
                          nw.scoreBarra,
                          { width: `${Math.max((score / maiorPontuacao) * 100, 4)}%`, backgroundColor: top3 ? '#C8131B' : 'var(--stroke-strong)' },
                        ]}
                      />
                    </View>
                    <Text style={nw.rotulinho}>{score.toLocaleString('pt-BR')}</Text>
                  </View>
                </View>
              );
            })}
            <View style={{ padding: 12, paddingHorizontal: 16 }}>
              <Text style={nw.notinha}>
                {`${visibleSellers.length} vendedores ativos no período · contas de automação (RPA) ficam fora do ranking`}
              </Text>
            </View>
          </View>
        );

        // ---- 09e: rail de 320px — cards-link que abrem o drawer de 480 ----
        const CARDS_RAIL: Array<{ chave: typeof railAberto & string; titulo: string; desc: string; badge: string | null }> = [
          { chave: 'usuarios', titulo: 'Vendedores e usuários', desc: 'Criar conta, papel e id do HubSpot', badge: String(visibleSellers.length) },
          { chave: 'rota', titulo: 'Config Rota do dia', desc: 'Raio, nota mínima e avaliações', badge: null },
          { chave: 'metas', titulo: 'Metas por vendedor', desc: 'Alvo mensal de cada um', badge: null },
          { chave: 'contas', titulo: 'Contas Alvo dispensadas', desc: 'Descartadas pelos vendedores', badge: null },
          { chave: 'historico', titulo: 'Histórico de rotas', desc: 'Rotas geradas no período', badge: null },
        ];
        const railNovo = (
          <View style={{ width: layout.largura >= 1280 ? 320 : undefined, gap: 12 }}>
            <MinhaDailyCard enabled={enabled} />
            {CARDS_RAIL.map(c => (
              <TouchableOpacity
                key={c.chave}
                accessibilityRole="button"
                style={nw.cardLink}
                {...({ dataSet: { hover: 'borda', trans: '1' } } as Record<string, unknown>)}
                onPress={() => setRailAberto(c.chave)}
              >
                <View style={nw.quadroIcone}>
                  <IconSettings width={20} height={20} fill={iconColors.muted} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={nw.tdNome} numberOfLines={1}>{c.titulo}</Text>
                  <Text style={nw.notinha} numberOfLines={1}>{c.desc}</Text>
                </View>
                {c.badge && (
                  <View style={nw.badgeRail}>
                    <Text style={nw.badgeRailTexto}>{c.badge}</Text>
                  </View>
                )}
                <IconChevronRight width={20} height={20} fill="var(--text-disabled)" />
              </TouchableOpacity>
            ))}
            {exportar}
          </View>
        );

        const drawerRail = railAberto && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setRailAberto(null)}>
            <View style={nw.drawerFundo}>
              <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setRailAberto(null)} accessibilityLabel="Fechar" />
              <View style={nw.drawerPainel}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'var(--border)' }}>
                  <Text style={nw.tituloCard}>{CARDS_RAIL.find(c => c.chave === railAberto)?.titulo}</Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar" style={nw.drawerFechar} onPress={() => setRailAberto(null)}>
                    <IconClose width={20} height={20} fill={iconColors.muted} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                  {railAberto === 'usuarios' && <SellerClassificationCard />}
                  {railAberto === 'rota' && <RouteConfigCard />}
                  {railAberto === 'metas' && <SellerGoalsCard />}
                  {railAberto === 'contas' && <DismissedContaAlvoCard />}
                  {railAberto === 'historico' && <RouteHistorySection range={periodRange(period)} enabled={enabled} />}
                </ScrollView>
              </View>
            </View>
          </Modal>
        );

        const metricas = (
          <>
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

          {/* CELULAR (M6): quatro KPIs 2x2 com o que a fase 1 confirmou —
              visitas, demos, fechamentos e criados. "MRR novo" nao existe em
              hook nenhum e "contagem por etapa do funil" tambem nao
              (status_breakdown e' por STATUS, nao por etapa): os dois blocos
              ficaram de fora em vez de virar numero inventado. */}
          {!layout.ehLargo && (
            <View style={styles.kpiGrade}>
              <TouchableOpacity style={styles.kpiCartao} onPress={() => openLeads('Visitados no período', { metric: 'visited', period })}>
                <Text style={styles.kpiRotulo}>{`Visitas ${periodLabel}`}</Text>
                <Text style={styles.kpiValor}>{query.data.global.visited_in_period.toLocaleString('pt-BR')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.kpiCartao} onPress={() => openLeads('Reuniões no período', { metric: 'meetings', period })}>
                <Text style={styles.kpiRotulo}>{`Demos ${periodLabel}`}</Text>
                <Text style={styles.kpiValor}>{query.data.global.meetings_in_period.toLocaleString('pt-BR')}</Text>
              </TouchableOpacity>
              <View style={styles.kpiCartao}>
                <Text style={styles.kpiRotulo}>{`Fechamentos ${periodLabel}`}</Text>
                <Text style={styles.kpiValor}>{query.data.global.won_in_period.toLocaleString('pt-BR')}</Text>
              </View>
              <TouchableOpacity style={styles.kpiCartao} onPress={() => openLeads('Criados no período', { metric: 'created', period })}>
                <Text style={styles.kpiRotulo}>{`Criados ${periodLabel}`}</Text>
                <Text style={styles.kpiValor}>{query.data.global.created_in_period.toLocaleString('pt-BR')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Ranking de vendedores. */}
          <Text style={styles.sectionTitle}>
            {layout.ehLargo ? 'Vendedores' : 'Time'} ({visibleSellers.length}) {preset !== 'all' ? '— ativos no período' : ''}
          </Text>
          {visibleSellers.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyText}>Nenhuma atividade registrada no período.</Text>
            </View>
          ) : (
            <View style={!layout.ehLargo ? styles.timeCartao : undefined}>
              {visibleSellers.map((seller, idx) => (
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
                  metaDia={metasPorVendedor.get(seller.seller_id)}
                  aberto={vendedorAberto === seller.seller_id}
                  aoAlternar={() => setVendedorAberto(v => (v === seller.seller_id ? null : seller.seller_id))}
                />
              ))}
            </View>
          )}

          <Text style={styles.footerHint}>
            Toque em qualquer número pra ver os leads por trás dele. Puxe pra baixo pra atualizar.
          </Text>
        </>
      ) : null}
          </>
        );
        return layout.ehDesktop ? (
          /* Layout novo do Gestor (09b-09e): composicao da base, atividade,
             tabela de vendedores na coluna principal; rail de 320 com
             cards-link que abrem o drawer. Abaixo de 1280 o rail desce. */
          carregandoOuErro ?? (
            <>
              <View
                style={
                  layout.largura >= 1280
                    ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' }
                    : { gap: 24 }
                }
              >
                <View style={{ flex: 1, minWidth: 0, gap: 24 }}>
                  {barraComposicao}
                  {faixaAtividade}
                  {tabelaVendedores}
                </View>
                {railNovo}
              </View>
              {drawerRail}
            </>
          )
        ) : (
          <>
            {cartoesConfig}
            {ranking}
            {exportar}
            {metricas}
          </>
        );
      })()}

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
  // ---- Time, no celular (M6) ----
  // A tabela de 7 colunas do desktop nao cabe em 390px: cada vendedor e' uma
  // linha de duas alturas. A linha INTEIRA e' o alvo e abre o detalhe, onde
  // vivem todos os drill-downs por metrica que ja' existiam.
  timeLinhaCasca: { borderBottomWidth: 1, borderBottomColor: 'var(--border)' },
  timeLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 48 },
  timeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeAvatarTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '700', color: 'var(--text-muted)' },
  timeNome: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)' },
  timeMetricas: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, color: 'var(--text-faint)' },
  timeDetalhe: { gap: 8, paddingBottom: 12 },
  metaBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  // Tinta clara nos dois temas: e' superficie propria, nao herda o tema.
  metaBadgeOk: { backgroundColor: '#EAF7EE' },
  metaBadgeAbaixo: { backgroundColor: '#FFF8EB' },
  metaBadgeTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600' },
  metaBadgeTextoOk: { color: '#167532' },
  metaBadgeTextoAbaixo: { color: '#99670F' },
  timeCartao: {
    borderRadius: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    paddingHorizontal: 16,
  },
  // ---- KPI 2x2 (M6) ----
  kpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCartao: {
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
  kpiValor: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: 'var(--text)',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  container: { flex: 1, backgroundColor: 'var(--bg)' },
  // Sem barra inferior aqui (nao e' aba; chega pelo menu do perfil e sai pelo
  // arrow_back), entao nao ha' o que reservar: 16, nao 120.
  content: { padding: 16, paddingBottom: 16 },
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
    // 48 e raio 12: era ~36 com raio 10, os dois fora da escala do celular.
    height: 48,
    justifyContent: 'center',
    borderRadius: 12,
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
  // 09f: drill-down no drawer padrao de 480 a' direita (mesma casca da ficha).
  modalBackdropWeb: { flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.32)' },
  modalPanelWeb: {
    width: 480,
    maxWidth: '100%',
    height: '100%',
    maxHeight: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderLeftWidth: 1,
    borderLeftColor: 'var(--border)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: -8, height: 0 },
    shadowRadius: 16,
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
    // 48: era 36, abaixo do alvo minimo do celular.
    width: 48, height: 48, borderRadius: 12,
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

// Estilos do painel web (handoff v2). Separados do StyleSheet historico da
// tela pra ficar claro o que pertence a' superficie desktop.
const estilosWeb = StyleSheet.create({
  bloco: { gap: 24, marginBottom: 24 },
  // Seletor de periodo compacto: chips de 36px em linha, nao lajes full-width.
  periodoLinha: { flexWrap: 'wrap', marginBottom: 12 },
  periodoCustom: { alignSelf: 'flex-start', marginBottom: 16, marginTop: 0 },
  // flexBasis explicito: o periodChip base tem flex:1 (basis 0) e a base 0
  // sobrevivia ao override — era o chip colapsado com o texto na vertical.
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
  kpis: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  kpiCartao: {
    flex: 1,
    minWidth: 180,
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
  kpiValor: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  kpiDelta: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, fontWeight: '500' },
  duasColunas: { flexDirection: 'row', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' },
  cartao: {
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    padding: 24,
    minWidth: 280,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  cartaoTitulo: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '700', color: 'var(--text)', marginBottom: 16 },
  funilRotulo: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  funilNumero: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, color: 'var(--text-faint)', fontVariant: ['tabular-nums'] },
  funilTrilha: { height: 22, borderRadius: 4, backgroundColor: 'var(--surface-3)', overflow: 'hidden' },
  funilBarra: { height: '100%', borderRadius: 4 },
  heatCelula: { width: 28, height: 28, borderRadius: 4 },
  heatHojeVazio: { borderWidth: 1.5, borderColor: '#C8131B', borderStyle: 'dashed' },
  heatLegenda: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-faint)' },
  exportarBotao: {
    marginTop: 16,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--teal-text)',
  },
  exportarTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--teal-text)' },
  tabelaCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'var(--surface-2)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--stroke-default)',
  },
  tabelaTh: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '700',
    color: 'var(--text-muted)',
    textAlign: 'right',
  },
  tabelaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  tabelaAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabelaAvatarTexto: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: 'var(--text-muted)' },
  tabelaNome: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)', flexShrink: 1 },
  tabelaTd: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: 'var(--text-muted)',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});

// Estilos do layout novo do Gestor (prompts 09b-09f).
const nw = StyleSheet.create({
  card: {
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  kicker: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  notinha: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  rotulinho: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-faint)' },
  numeroGrande: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  numeroMedio: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  numeroCard: { fontSize: 24, lineHeight: 32, fontWeight: '600', color: 'var(--text)', fontVariant: ['tabular-nums'], marginTop: 8 },
  tituloCard: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '700', color: 'var(--text)' },
  barraTrilha: {
    flexDirection: 'row',
    height: 32,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'var(--surface-3)',
  },
  barraSegmento: { justifyContent: 'center' },
  barraPct: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '700', color: '#FFFFFF', paddingLeft: 8 },
  cardAtividade: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  thLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'var(--surface-2)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--stroke-default)',
  },
  th: {
    flex: 1,
    minWidth: 76,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '700',
    color: 'var(--text-muted)',
    textAlign: 'right',
  },
  tdLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  tdRank: { width: 32, fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '700', color: 'var(--text-faint)', fontVariant: ['tabular-nums'] },
  td: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: 'var(--text-muted)',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  tdNome: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: 'var(--text-muted)' },
  scoreTrilha: { width: 44, height: 6, borderRadius: 3, backgroundColor: 'var(--surface-3)', overflow: 'hidden' },
  scoreBarra: { height: '100%', borderRadius: 3 },
  cardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  quadroIcone: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRail: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'var(--surface-2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRailTexto: { fontSize: 12, lineHeight: 24, letterSpacing: 0.5, fontWeight: '700', color: 'var(--text-muted)' },
  drawerFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', alignItems: 'flex-end' },
  drawerPainel: {
    width: 480,
    maxWidth: '100%',
    height: '100%',
    backgroundColor: 'var(--surface)',
    borderLeftWidth: 1,
    borderLeftColor: 'var(--border)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: -8, height: 0 },
    shadowRadius: 16,
  },
  drawerFechar: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
