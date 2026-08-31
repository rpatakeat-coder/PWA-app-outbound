import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  IconLocation,
  IconText, IconCheckbox, IconCheckboxChecked} from '../components/icons';
import { Alert } from '../components/Alert';
import { useAllSellers } from '../hooks/useAllSellers';
import { useRouteHistory, useRouteRanking } from '../hooks/useRouteHistory';
import { useSellerGoals } from '../hooks/useSellerGoals';
import { useRouteConfig } from '../hooks/useRouteConfig';

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
  if (history.isLoading) return <ActivityIndicator color="var(--brand-text)" style={{ marginVertical: 12 }} />;
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
                <IconText Icone={IconLocation} size={14} style={styles.blockTitle} tone="muted">
                  Rota{day.routeSource === 'manual' ? ' (manual)' : day.routeSource === 'suggested' ? ' (auto)' : ''} —
                  {' '}{day.stops.length} parada{day.stops.length === 1 ? '' : 's'} ({done} concluída{done === 1 ? '' : 's'})
                  {day.km > 0 ? ` · ${day.km.toFixed(1)} km / ~${Math.round(day.min)} min` : ''}
                </IconText>
                {day.stops.map((s, i) => (
                  <Text key={i} style={[styles.line, s.done && styles.lineDone]}>
                    {s.done ? '✓' : '○'} {s.position}. {s.nome}
                  </Text>
                ))}
              </View>
            ) : (
              <IconText Icone={IconLocation} style={styles.blockMuted} tone="muted">Sem rota planejada nesse dia.</IconText>
            )}
            {day.visits.length > 0 ? (
              <View style={styles.block}>
                <IconText Icone={IconLocation} style={styles.blockTitle} tone="onSurface">{day.visits.length} check-in{day.visits.length === 1 ? '' : 's'}</IconText>
                {day.visits.map((v, i) => (
                  <Text key={i} style={styles.line}>
                    {fmtTime(v.at)} — {v.nome}{v.cidade ? ` (${v.cidade})` : ''}
                  </Text>
                ))}
              </View>
            ) : (
              <IconText Icone={IconLocation} style={styles.blockMuted} tone="muted">Sem check-ins nesse dia.</IconText>
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
        <IconText Icone={IconLocation} style={styles.title} tone="tintRedText">Histórico & ranking de rotas</IconText>
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
                <IconText
                Icone={hideDeactivated ? IconCheckboxChecked : IconCheckbox}
                size={14}
                tone="muted"
              >
                Ocultar desativados ({deactivatedCount})
              </IconText>
              </Text>
            </TouchableOpacity>
          )}

          {loadingSellers ? (
            <ActivityIndicator color="var(--brand-text)" style={{ marginVertical: 10 }} />
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
            <ActivityIndicator color="var(--brand-text)" style={{ marginVertical: 14 }} />
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
                          {r.paradas} paradas ({r.concluidas} feitas) · {r.checkins} check-in{r.checkins === 1 ? '' : 's'}{meta.metaPeriodo > 0 ? ` / ${meta.metaPeriodo} meta (${meta.pctMeta}%)` : ''} · {r.km.toFixed(0)} km
                        </Text>
                      </View>
                      <Text style={[styles.rankPct, { color: r.pct >= 70 ? '#16a34a' : r.pct >= 40 ? '#FFB32F' : '#C8131B' }]}>
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
  card: { backgroundColor: 'var(--surface)', borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', padding: 14, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  chevron: { fontSize: 12, color: 'var(--text-muted)', fontWeight: '800' },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  hint: { fontSize: 12, color: 'var(--text-muted)', flex: 1 },
  filterAction: { fontSize: 12, fontWeight: '800', color: 'var(--brand-text)' },
  hideToggle: { alignSelf: 'flex-start', backgroundColor: 'var(--surface-2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  hideToggleActive: { backgroundColor: 'var(--tint-red)' },
  hideToggleText: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  hideToggleTextActive: { color: 'var(--tint-red-text)' },
  chips: { gap: 6, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: 'var(--surface-2)', maxWidth: 190 },
  chipActive: { backgroundColor: '#C8131B' },
  chipOff: { backgroundColor: 'var(--tint-red)', borderWidth: 1, borderColor: 'var(--tint-red-border)' },
  chipText: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  chipTextActive: { color: '#fff' },
  empty: { fontSize: 13, color: 'var(--text-subtle)', fontStyle: 'italic', marginTop: 12 },
  rankHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sortToggle: { flexDirection: 'row', gap: 6 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'var(--surface-2)' },
  sortChipActive: { backgroundColor: '#222222' },
  sortChipText: { fontSize: 11, fontWeight: '700', color: 'var(--text-muted)' },
  sortChipTextActive: { color: '#fff' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  rankRowOpen: { backgroundColor: 'var(--tint-red)' },
  rankPos: { fontSize: 13, fontWeight: '800', color: 'var(--brand-text)', width: 28 },
  rankName: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  rankMeta: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  rankPct: { fontSize: 16, fontWeight: '800' },
  dayCard: { borderTopWidth: 1, borderTopColor: 'var(--border-soft)', paddingTop: 10, marginTop: 10, marginLeft: 8 },
  dayTitle: { fontSize: 14, fontWeight: '800', color: 'var(--brand-text)', marginBottom: 6 },
  block: { marginBottom: 8 },
  blockTitle: { fontSize: 12, fontWeight: '800', color: 'var(--text)', marginBottom: 3 },
  blockMuted: { fontSize: 12, color: 'var(--text-subtle)', marginBottom: 6 },
  line: { fontSize: 12, color: 'var(--text-muted)', marginLeft: 4, marginTop: 1 },
  lineDone: { color: '#16a34a', fontWeight: '600' },
});
