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
  useGestorMetrics,
  type GestorPeriod,
  type MetricLead,
  type SellerMetrics,
} from '../hooks/useGestorMetrics';

interface Props {
  enabled: boolean;
}

const PERIOD_OPTIONS: { value: GestorPeriod; label: string }[] = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'all', label: 'Tudo' },
];

const STATUS_COLOR: Record<string, string> = {
  lead: '#3b82f6',
  lead_visitado: '#a855f7',
  cliente: '#22c55e',
  em_integracao: '#f97316',
  churn: '#ef4444',
  ex_cliente: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  lead: 'Leads',
  lead_visitado: 'Visitados',
  cliente: 'Clientes',
  em_integracao: 'Em integração',
  churn: 'Churn',
  ex_cliente: 'Ex-cliente',
};

// Conteúdo do modal "quais leads compõem esse número".
interface LeadModalState {
  title: string;
  leads: MetricLead[];
}

function formatLeadDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function LeadListModal({ state, onClose }: { state: LeadModalState | null; onClose: () => void }) {
  // Mais recente primeiro; sem data vai pro fim.
  const sorted = useMemo(() => {
    if (!state) return [];
    return [...state.leads].sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : -Infinity;
      const tb = b.at ? new Date(b.at).getTime() : -Infinity;
      return tb - ta;
    });
  }, [state]);

  return (
    <Modal visible={state !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle} numberOfLines={2}>{state?.title}</Text>
              <Text style={styles.modalSubtitle}>
                {sorted.length} {sorted.length === 1 ? 'lead' : 'leads'}
              </Text>
            </View>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={sorted}
            keyExtractor={(item, idx) => `${item.client_id}-${idx}`}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={styles.modalEmpty}>Nenhum lead nesse recorte.</Text>
            }
            renderItem={({ item }) => {
              const when = formatLeadDate(item.at);
              return (
                <View style={styles.modalLeadRow}>
                  <View style={[styles.modalLeadDot, { backgroundColor: (item.status && STATUS_COLOR[item.status]) || '#94a3b8' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLeadName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.modalLeadMeta}>
                      {(item.status && (STATUS_LABEL[item.status] ?? item.status)) || 'Sem status'}
                      {when ? ` • ${when}` : ''}
                    </Text>
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
  onOpenLeads,
}: {
  seller: SellerMetrics;
  rank: number;
  onOpenLeads: (title: string, leads: MetricLead[]) => void;
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

  const open = (metricLabel: string, leads: MetricLead[]) =>
    onOpenLeads(`${metricLabel} — ${displayName}`, leads);

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
        <MetricBox value={seller.visited} label="Visitados" color="#a855f7" onPress={() => open('Visitados', seller.details.visited)} />
        <MetricBox value={seller.created} label="Criados" color="#3b82f6" onPress={() => open('Criados', seller.details.created)} />
        <MetricBox value={seller.meetings_scheduled} label="Reuniões" color="#f97316" onPress={() => open('Reuniões', seller.details.meetings)} />
      </View>
      <View style={styles.metricsRow}>
        <MetricBox value={seller.follow_ups_scheduled} label="Follow ups" color="#0891b2" onPress={() => open('Follow ups', seller.details.follow_ups)} />
        <MetricBox value={seller.stage_changes} label="Mudanças" color="#0ea5e9" onPress={() => open('Mudanças de etapa', seller.details.stage_changes)} />
        <MetricBox value={seller.notes_created} label="Notas" color="#facc15" onPress={() => open('Notas', seller.details.notes)} />
      </View>

      <View style={styles.assignedRow}>
        <TouchableOpacity
          disabled={seller.leads_assigned === 0}
          onPress={() => open('Leads atribuídos', seller.details.assigned)}
        >
          <Text style={[styles.assignedLabel, seller.leads_assigned > 0 && styles.assignedLabelLink]}>
            {seller.leads_assigned} {seller.leads_assigned === 1 ? 'lead atribuído' : 'leads atribuídos'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.totalActivityText}>{totalActivity} ações no período</Text>
      </View>

      {statusEntries.length > 0 ? (
        <View style={styles.statusBreakdown}>
          {statusEntries.map(([status, count]) => (
            <TouchableOpacity
              key={status}
              style={styles.statusChip}
              onPress={() =>
                open(
                  STATUS_LABEL[status] ?? status,
                  seller.details.assigned.filter(l => l.status === status),
                )
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

export function GestorScreen({ enabled }: Props) {
  const [period, setPeriod] = useState<GestorPeriod>('30d');
  const [leadModal, setLeadModal] = useState<LeadModalState | null>(null);
  const query = useGestorMetrics(period, enabled);

  const openLeads = (title: string, leads: MetricLead[]) => setLeadModal({ title, leads });

  // Filtra vendedores totalmente inativos quando periodo != 'all' pra reduzir ruido.
  // Em 'all' mostra todos.
  const visibleSellers = useMemo(() => {
    if (!query.data) return [];
    return query.data.sellers.filter(s =>
      period === 'all'
        ? true
        : s.visited > 0 ||
          s.created > 0 ||
          s.meetings_scheduled > 0 ||
          s.follow_ups_scheduled > 0 ||
          s.stage_changes > 0 ||
          s.notes_created > 0 ||
          s.leads_assigned > 0,
    );
  }, [query.data, period]);

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
            style={[styles.periodChip, period === opt.value && styles.periodChipActive]}
            onPress={() => setPeriod(opt.value)}
          >
            <Text style={[styles.periodChipText, period === opt.value && styles.periodChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {query.isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color="#dc2626" />
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
              color="#0f172a"
              onPress={() => openLeads('Todos os leads', query.data!.globalDetails.all)}
            />
            <StatCard
              label="Leads"
              value={query.data.global.total_leads}
              color={STATUS_COLOR.lead}
              onPress={() => openLeads('Leads', query.data!.globalDetails.by_status['lead'] ?? [])}
            />
            <StatCard
              label="Visitados"
              value={query.data.global.total_visited}
              color={STATUS_COLOR.lead_visitado}
              onPress={() => openLeads('Visitados', query.data!.globalDetails.by_status['lead_visitado'] ?? [])}
            />
            <StatCard
              label="Clientes"
              value={query.data.global.total_active_clients}
              color={STATUS_COLOR.cliente}
              onPress={() => openLeads('Clientes', query.data!.globalDetails.by_status['cliente'] ?? [])}
            />
            <StatCard
              label="Churn"
              value={query.data.global.total_churn}
              color={STATUS_COLOR.churn}
              onPress={() => openLeads('Churn', query.data!.globalDetails.by_status['churn'] ?? [])}
            />
          </View>

          {/* Atividade no periodo selecionado. */}
          <Text style={styles.sectionTitle}>
            Atividade {period === 'all' ? 'total' : `nos últimos ${period === '7d' ? '7' : '30'} dias`}
          </Text>
          <View style={styles.statsGrid}>
            <StatCard
              label="Visitados"
              value={query.data.global.visited_in_period}
              color="#a855f7"
              onPress={() => openLeads('Visitados no período', query.data!.globalDetails.visited)}
            />
            <StatCard
              label="Criados"
              value={query.data.global.created_in_period}
              color="#3b82f6"
              onPress={() => openLeads('Criados no período', query.data!.globalDetails.created)}
            />
            <StatCard
              label="Reuniões"
              value={query.data.global.meetings_in_period}
              color="#f97316"
              onPress={() => openLeads('Reuniões no período', query.data!.globalDetails.meetings)}
            />
            <StatCard
              label="Follow ups"
              value={query.data.global.follow_ups_in_period}
              color="#0891b2"
              onPress={() => openLeads('Follow ups no período', query.data!.globalDetails.follow_ups)}
            />
            <StatCard
              label="Mudanças etapa"
              value={query.data.global.stage_changes_in_period}
              color="#0ea5e9"
              onPress={() => openLeads('Mudanças de etapa no período', query.data!.globalDetails.stage_changes)}
            />
            <StatCard
              label="Notas"
              value={query.data.global.notes_in_period}
              color="#facc15"
              onPress={() => openLeads('Notas no período', query.data!.globalDetails.notes)}
            />
          </View>

          {/* Ranking de vendedores. */}
          <Text style={styles.sectionTitle}>
            Vendedores ({visibleSellers.length}) {period !== 'all' ? '— ativos no período' : ''}
          </Text>
          {visibleSellers.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyText}>Nenhuma atividade registrada no período.</Text>
            </View>
          ) : (
            visibleSellers.map((seller, idx) => (
              <SellerCard key={seller.seller_id} seller={seller} rank={idx + 1} onOpenLeads={openLeads} />
            ))
          )}

          <Text style={styles.footerHint}>
            Toque em qualquer número pra ver os leads por trás dele. Puxe pra baixo pra atualizar.
          </Text>
        </>
      ) : null}

      <LeadListModal state={leadModal} onClose={() => setLeadModal(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 120 },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  periodChipActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  periodChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  periodChipTextActive: { color: '#fff' },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '600' },
  statSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

  sellerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#dc2626', fontSize: 14, fontWeight: '800' },
  sellerName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  sellerEmail: { fontSize: 12, color: '#64748b', marginTop: 1 },

  metricsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricLabel: { fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: '600' },

  assignedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  assignedLabel: { fontSize: 12, color: '#475569', fontWeight: '600' },
  assignedLabelLink: { textDecorationLine: 'underline' },
  totalActivityText: { fontSize: 11, color: '#94a3b8' },

  statusBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: 11, color: '#475569', fontWeight: '600' },

  loadingBlock: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  loadingText: { color: '#64748b', fontSize: 13 },
  errorText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
  errorSub: { color: '#64748b', fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
  retryButton: {
    marginTop: 12,
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  emptyBlock: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyText: { color: '#64748b', fontSize: 13, textAlign: 'center' },

  footerHint: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 11,
    color: '#94a3b8',
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
    backgroundColor: '#fff',
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
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  modalCloseButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modalCloseText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  modalEmpty: { textAlign: 'center', color: '#64748b', fontSize: 13, paddingVertical: 24 },
  modalLeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  modalLeadDot: { width: 10, height: 10, borderRadius: 5 },
  modalLeadName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  modalLeadMeta: { fontSize: 11, color: '#64748b', marginTop: 1 },
});
