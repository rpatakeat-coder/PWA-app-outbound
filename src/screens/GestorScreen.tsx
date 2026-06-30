import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function SellerCard({ seller, rank }: { seller: SellerMetrics; rank: number }) {
  const displayName = seller.full_name?.trim() || seller.email || 'Sem nome';
  const initials = (seller.full_name?.trim() || seller.email || '?')
    .split(/\s+/)
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const totalActivity =
    seller.visited + seller.created + seller.meetings_scheduled + seller.stage_changes + seller.notes_created;

  // Distribuicao de status apenas dos leads sob responsabilidade.
  const statusEntries = Object.entries(seller.status_breakdown).sort((a, b) => b[1] - a[1]);

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
        <View style={styles.metricBox}>
          <Text style={[styles.metricValue, { color: '#a855f7' }]}>{seller.visited}</Text>
          <Text style={styles.metricLabel}>Visitados</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={[styles.metricValue, { color: '#3b82f6' }]}>{seller.created}</Text>
          <Text style={styles.metricLabel}>Criados</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={[styles.metricValue, { color: '#f97316' }]}>{seller.meetings_scheduled}</Text>
          <Text style={styles.metricLabel}>Reuniões</Text>
        </View>
      </View>
      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Text style={[styles.metricValue, { color: '#0ea5e9' }]}>{seller.stage_changes}</Text>
          <Text style={styles.metricLabel}>Mudanças</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={[styles.metricValue, { color: '#facc15' }]}>{seller.notes_created}</Text>
          <Text style={styles.metricLabel}>Notas</Text>
        </View>
        <View style={styles.metricBox} />
      </View>

      <View style={styles.assignedRow}>
        <Text style={styles.assignedLabel}>
          {seller.leads_assigned} {seller.leads_assigned === 1 ? 'lead atribuído' : 'leads atribuídos'}
        </Text>
        <Text style={styles.totalActivityText}>{totalActivity} ações no período</Text>
      </View>

      {statusEntries.length > 0 ? (
        <View style={styles.statusBreakdown}>
          {statusEntries.map(([status, count]) => (
            <View key={status} style={styles.statusChip}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] ?? '#94a3b8' }]} />
              <Text style={styles.statusChipText}>
                {STATUS_LABEL[status] ?? status} {count}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function GestorScreen({ enabled }: Props) {
  const [period, setPeriod] = useState<GestorPeriod>('30d');
  const query = useGestorMetrics(period, enabled);

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
            <StatCard label="Total de leads" value={query.data.global.total_clients} color="#0f172a" />
            <StatCard label="Leads" value={query.data.global.total_leads} color={STATUS_COLOR.lead} />
            <StatCard label="Visitados" value={query.data.global.total_visited} color={STATUS_COLOR.lead_visitado} />
            <StatCard label="Clientes" value={query.data.global.total_active_clients} color={STATUS_COLOR.cliente} />
            <StatCard label="Churn" value={query.data.global.total_churn} color={STATUS_COLOR.churn} />
          </View>

          {/* Atividade no periodo selecionado. */}
          <Text style={styles.sectionTitle}>
            Atividade {period === 'all' ? 'total' : `nos últimos ${period === '7d' ? '7' : '30'} dias`}
          </Text>
          <View style={styles.statsGrid}>
            <StatCard label="Visitados" value={query.data.global.visited_in_period} color="#a855f7" />
            <StatCard label="Criados" value={query.data.global.created_in_period} color="#3b82f6" />
            <StatCard label="Reuniões" value={query.data.global.meetings_in_period} color="#f97316" />
            <StatCard label="Mudanças etapa" value={query.data.global.stage_changes_in_period} color="#0ea5e9" />
            <StatCard label="Notas" value={query.data.global.notes_in_period} color="#facc15" />
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
              <SellerCard key={seller.seller_id} seller={seller} rank={idx + 1} />
            ))
          )}

          <Text style={styles.footerHint}>
            Métricas calculadas em tempo real a partir do banco. Puxe pra baixo pra atualizar.
          </Text>
        </>
      ) : null}
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
});
