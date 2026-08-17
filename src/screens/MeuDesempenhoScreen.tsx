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

interface Props {
  enabled: boolean;
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
  const leads = q.data ?? [];
  return (
    <Modal visible={params !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalPanel}>
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

export function MeuDesempenhoScreen({ enabled }: Props) {
  const [preset, setPreset] = useState<GestorPeriodPreset>('30d');
  const [modal, setModal] = useState<{ title: string; params: MyMetricLeadsParams } | null>(null);

  const period = useMemo<GestorPeriod>(() => ({ preset: preset === 'custom' ? '30d' : preset }), [preset]);
  const query = useMyMetrics(period, enabled);
  const m = query.data;

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
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={query.isFetching && !query.isLoading} onRefresh={() => query.refetch()} />}
    >
      {/* A Daily fica ACIMA do seletor de periodo de proposito: ela e' sempre
          de HOJE, e ficaria mentindo se parecesse responder ao filtro de 7/30
          dias que vem logo abaixo. */}
      <MinhaDailyCard enabled={enabled} />

      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.periodChip, preset === opt.value && styles.periodChipActive]}
            onPress={() => setPreset(opt.value)}
          >
            <Text style={[styles.periodChipText, preset === opt.value && styles.periodChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'var(--bg)' },
  content: { padding: 16, paddingBottom: 120 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: 'var(--surface)', alignItems: 'center', borderWidth: 1, borderColor: 'var(--border)' },
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
