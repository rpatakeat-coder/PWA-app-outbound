import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAllSellers } from '../hooks/useAllSellers';
import { useRouteHistory, useRouteRanking } from '../hooks/useRouteHistory';
import { useSellerGoals } from '../hooks/useSellerGoals';
import { useRouteConfig } from '../hooks/useRouteConfig';
import { exportAgenda } from '../utils/exportAgenda';

// Dias úteis (seg–sex) no intervalo — base da meta do período (meta/dia × úteis).
function workdaysBetween(startISO: string | null, endISO: string | null): number {
  if (!startISO || !endISO) return 0;
  const start = new Date(startISO.slice(0, 10) + 'T00:00:00');
  const end = new Date(endISO.slice(0, 10) + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// "Histórico de rotas" (aba Gestor): RANKING dos vendedores escolhidos (por %
// de conclusão) + drill-down por dia (rota planejada + check-ins reais). O
// filtro lista TODOS os vendedores, inclusive DESATIVADOS. Usa o período dos
// chips da tela.

interface Props {
  range: { start: string | null; end: string | null };
  enabled: boolean;
}

const fmtDay = (d: string) => {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
};
const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// Detalhe por dia de UM vendedor (rota planejada + check-ins).
function SellerDetail({ sellerId, range, enabled }: { sellerId: string; range: Props['range']; enabled: boolean }) {
  const history = useRouteHistory(sellerId, range, enabled);
  if (history.isLoading) return <ActivityIndicator color="#7c3aed" style={{ marginVertical: 12 }} />;
  const days = history.data?.days ?? [];
  if (days.length === 0) return <Text style={styles.empty}>Sem rotas nem check-ins no período.</Text>;
  return (
    <View style={{ marginTop: 4 }}>
      {days.map((day) => {
        const done = day.stops.filter((s) => s.done).length;
        return (
          <View key={day.date} style={styles.dayCard}>
            <Text style={styles.dayTitle}>{fmtDay(day.date)}</Text>
            {day.stops.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>
                  🗺️ Rota{day.routeSource === 'manual' ? ' (manual)' : day.routeSource === 'suggested' ? ' (auto)' : ''} —
                  {' '}{day.stops.length} parada{day.stops.length === 1 ? '' : 's'} ({done} concluída{done === 1 ? '' : 's'})
                  {day.km > 0 ? ` · 🛣️ ${day.km.toFixed(1)} km / ~${Math.round(day.min)} min` : ''}
                </Text>
                {day.stops.map((s, i) => (
                  <Text key={i} style={[styles.line, s.done && styles.lineDone]}>
                    {s.done ? '✓' : '○'} {s.position}. {s.nome}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.blockMuted}>🗺️ Sem rota planejada nesse dia.</Text>
            )}
            {day.visits.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>📍 {day.visits.length} check-in{day.visits.length === 1 ? '' : 's'}</Text>
                {day.visits.map((v, i) => (
                  <Text key={i} style={styles.line}>
                    {fmtTime(v.at)} — {v.nome}{v.cidade ? ` (${v.cidade})` : ''}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.blockMuted}>📍 Sem check-ins nesse dia.</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function RouteHistorySection({ range, enabled }: Props) {
  const [open, setOpen] = useState(false);
  const { data: sellers = [], isLoading: loadingSellers } = useAllSellers(enabled && open);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const ranking = useRouteRanking(selectedIds, range, enabled && open);
  const nameById = useMemo(() => new Map(sellers.map((s) => [s.id, s])), [sellers]);

  const [sortBy, setSortBy] = useState<'pct' | 'checkins'>('pct');
  const [exportingRank, setExportingRank] = useState(false);

  // Meta diária por vendedor (fallback pra meta global). meta do período =
  // meta/dia × dias úteis; % = check-ins / meta do período.
  const { goals } = useSellerGoals(enabled && open);
  const { config } = useRouteConfig();
  const defaultMeta = config.meta_visitas_dia || 6;
  const workdays = useMemo(() => workdaysBetween(range.start, range.end), [range.start, range.end]);
  const metaOf = (sellerId: string, checkins: number) => {
    // "Sem meta": aparece no ranking mas não compara com meta.
    if (nameById.get(sellerId)?.status === 'sem_meta') return { metaDia: 0, metaPeriodo: 0, pctMeta: null as number | null };
    const metaDia = goals.get(sellerId) ?? defaultMeta;
    const metaPeriodo = workdays > 0 ? metaDia * workdays : 0;
    const pctMeta = metaPeriodo > 0 ? Math.round((checkins / metaPeriodo) * 100) : null;
    return { metaDia, metaPeriodo, pctMeta };
  };

  // Ranking ordenado pelo criterio escolhido (a query ja vem por pct; reordena
  // aqui pra trocar sem refetch).
  const rows = useMemo(() => {
    const data = ranking.data ?? [];
    return [...data].sort((a, b) =>
      sortBy === 'checkins'
        ? b.checkins - a.checkins || b.pct - a.pct || b.paradas - a.paradas
        : b.pct - a.pct || b.checkins - a.checkins || b.paradas - a.paradas,
    );
  }, [ranking.data, sortBy]);

  const handleExportRanking = async () => {
    if (exportingRank || rows.length === 0) return;
    setExportingRank(true);
    try {
      const payload = {
        meta: {
          tipo: 'ranking_rotas',
          gerado_em: new Date().toISOString(),
          periodo: { de: range.start, ate: range.end },
          ordenado_por: sortBy === 'checkins' ? 'check-ins' : '% conclusão',
          vendedores: rows.length,
        },
        ranking: rows.map((r, idx) => {
          const s = nameById.get(r.sellerId);
          const m = metaOf(r.sellerId, r.checkins);
          return {
            posicao: idx + 1,
            vendedor: s?.name ?? 'Vendedor',
            desativado: !!s?.deactivated,
            pct_conclusao: r.pct,
            rotas: r.rotas,
            paradas: r.paradas,
            concluidas: r.concluidas,
            check_ins: r.checkins,
            meta_dia: m.metaDia,
            meta_periodo: m.metaPeriodo,
            pct_meta: m.pctMeta,
            km: Number(r.km.toFixed(1)),
            min: Math.round(r.min),
          };
        }),
      };
      const res = await exportAgenda(payload, `ranking-rotas_${sortBy}`);
      Alert.alert(
        'Ranking exportado 🏆',
        `${rows.length} vendedores.\n\nToque em Abrir pra baixar o .json (abre no navegador).`,
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'Abrir', onPress: () => Linking.openURL(res.url) },
        ],
      );
    } catch (err: any) {
      Alert.alert('Erro ao exportar', err?.message ?? 'Tente de novo.');
    } finally {
      setExportingRank(false);
    }
  };

  const [hideDeactivated, setHideDeactivated] = useState(false);
  const visibleSellers = hideDeactivated ? sellers.filter((s) => !s.deactivated) : sellers;
  const deactivatedCount = sellers.filter((s) => s.deactivated).length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <Text style={styles.title}>🗺️ Histórico & ranking de rotas</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 8 }}>
          <View style={styles.filterRow}>
            <Text style={styles.hint}>Escolha os vendedores (usa o período acima):</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setSelected(new Set(visibleSellers.map((s) => s.id)))}>
                <Text style={styles.filterAction}>Todos</Text>
              </TouchableOpacity>
              {selected.size > 0 && (
                <TouchableOpacity onPress={() => setSelected(new Set())}>
                  <Text style={styles.filterAction}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {deactivatedCount > 0 && (
            <TouchableOpacity
              style={[styles.hideToggle, hideDeactivated && styles.hideToggleActive]}
              onPress={() => {
                const next = !hideDeactivated;
                setHideDeactivated(next);
                // Ao ocultar, tira desativados já selecionados (somem do ranking também).
                if (next) setSelected((sel) => new Set([...sel].filter((id) => !nameById.get(id)?.deactivated)));
              }}
            >
              <Text style={[styles.hideToggleText, hideDeactivated && styles.hideToggleTextActive]}>
                {hideDeactivated ? '☑' : '☐'} Ocultar desativados ({deactivatedCount})
              </Text>
            </TouchableOpacity>
          )}

          {loadingSellers ? (
            <ActivityIndicator color="#7c3aed" style={{ marginVertical: 10 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {visibleSellers.map((s) => {
                const active = selected.has(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.chip, active && styles.chipActive, s.deactivated && !active && styles.chipOff]}
                    onPress={() => toggle(s.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {s.name}{s.deactivated ? ' • desativado' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {selected.size === 0 ? (
            <Text style={styles.empty}>Selecione um ou mais vendedores (ou "Todos") pra ver o ranking.</Text>
          ) : ranking.isLoading ? (
            <ActivityIndicator color="#7c3aed" style={{ marginVertical: 14 }} />
          ) : (
            <View style={{ marginTop: 8 }}>
              <View style={styles.rankHeader}>
                <View style={styles.sortToggle}>
                  <TouchableOpacity
                    style={[styles.sortChip, sortBy === 'pct' && styles.sortChipActive]}
                    onPress={() => setSortBy('pct')}
                  >
                    <Text style={[styles.sortChipText, sortBy === 'pct' && styles.sortChipTextActive]}>% conclusão</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sortChip, sortBy === 'checkins' && styles.sortChipActive]}
                    onPress={() => setSortBy('checkins')}
                  >
                    <Text style={[styles.sortChipText, sortBy === 'checkins' && styles.sortChipTextActive]}>Check-ins</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.exportBtn, exportingRank && { opacity: 0.5 }]}
                  onPress={handleExportRanking}
                  disabled={exportingRank}
                >
                  {exportingRank
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.exportBtnText}>📤 JSON</Text>}
                </TouchableOpacity>
              </View>
              {rows.map((r, idx) => {
                const s = nameById.get(r.sellerId);
                const isOpen = expanded === r.sellerId;
                const meta = metaOf(r.sellerId, r.checkins);
                return (
                  <View key={r.sellerId}>
                    <TouchableOpacity
                      style={[styles.rankRow, isOpen && styles.rankRowOpen]}
                      onPress={() => setExpanded(isOpen ? null : r.sellerId)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rankPos}>{idx + 1}º</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rankName} numberOfLines={1}>
                          {s?.name ?? 'Vendedor'}{s?.deactivated ? ' • desativado' : ''}
                        </Text>
                        <Text style={styles.rankMeta}>
                          {r.paradas} paradas ({r.concluidas} ✓) · 📍 {r.checkins}{meta.metaPeriodo > 0 ? ` / ${meta.metaPeriodo} meta (${meta.pctMeta}%)` : ''} · 🛣️ {r.km.toFixed(0)} km
                        </Text>
                      </View>
                      <Text style={[styles.rankPct, { color: r.pct >= 70 ? '#16a34a' : r.pct >= 40 ? '#f59e0b' : '#dc2626' }]}>
                        {r.pct}%
                      </Text>
                    </TouchableOpacity>
                    {isOpen && <SellerDetail sellerId={r.sellerId} range={range} enabled={enabled && open} />}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  chevron: { fontSize: 12, color: '#64748b', fontWeight: '800' },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  hint: { fontSize: 12, color: '#64748b', flex: 1 },
  filterAction: { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
  hideToggle: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  hideToggleActive: { backgroundColor: '#ede9fe' },
  hideToggleText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  hideToggleTextActive: { color: '#5b21b6' },
  chips: { gap: 6, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#f1f5f9', maxWidth: 190 },
  chipActive: { backgroundColor: '#7c3aed' },
  chipOff: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  chipTextActive: { color: '#fff' },
  empty: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginTop: 12 },
  rankHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sortToggle: { flexDirection: 'row', gap: 6 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#f1f5f9' },
  sortChipActive: { backgroundColor: '#0f172a' },
  sortChipText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  sortChipTextActive: { color: '#fff' },
  exportBtn: { backgroundColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  exportBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  rankRowOpen: { backgroundColor: '#faf5ff' },
  rankPos: { fontSize: 13, fontWeight: '800', color: '#7c3aed', width: 28 },
  rankName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rankMeta: { fontSize: 11, color: '#64748b', marginTop: 1 },
  rankPct: { fontSize: 16, fontWeight: '800' },
  dayCard: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginTop: 10, marginLeft: 8 },
  dayTitle: { fontSize: 14, fontWeight: '800', color: '#7c3aed', marginBottom: 6 },
  block: { marginBottom: 8 },
  blockTitle: { fontSize: 12, fontWeight: '800', color: '#334155', marginBottom: 3 },
  blockMuted: { fontSize: 12, color: '#94a3b8', marginBottom: 6 },
  line: { fontSize: 12, color: '#475569', marginLeft: 4, marginTop: 1 },
  lineDone: { color: '#16a34a', fontWeight: '600' },
});
