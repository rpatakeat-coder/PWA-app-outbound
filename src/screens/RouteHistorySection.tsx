import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouteHistory } from '../hooks/useRouteHistory';
import type { SellerMetrics } from '../hooks/useGestorMetrics';

// "Histórico de rotas" (aba Gestor): escolhe um vendedor e vê, por dia do
// período selecionado, a ROTA planejada (paradas + concluídas) e as VISITAS
// reais (check-ins). Usa os chips de período que já existem na tela.

interface Props {
  sellers: SellerMetrics[];
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

export function RouteHistorySection({ sellers, range, enabled }: Props) {
  const [open, setOpen] = useState(false);
  const [sellerId, setSellerId] = useState<string | null>(null);

  const seller = sellers.find((s) => s.seller_id === sellerId) ?? null;
  const history = useRouteHistory(sellerId, range, enabled && open);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <Text style={styles.title}>🗺️ Histórico de rotas</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.hint}>Escolha o vendedor — usa o período selecionado acima.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {sellers.map((s) => {
              const active = s.seller_id === sellerId;
              return (
                <TouchableOpacity
                  key={s.seller_id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSellerId(active ? null : s.seller_id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                    {s.full_name?.trim() || s.email || 'Sem nome'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {!sellerId ? (
            <Text style={styles.empty}>Toque num vendedor pra ver as rotas e visitas dele.</Text>
          ) : history.isLoading ? (
            <ActivityIndicator color="#7c3aed" style={{ marginVertical: 14 }} />
          ) : (history.data ?? []).length === 0 ? (
            <Text style={styles.empty}>Sem rotas nem check-ins de {seller?.full_name ?? 'vendedor'} no período.</Text>
          ) : (
            (history.data ?? []).map((day) => {
              const done = day.stops.filter((s) => s.done).length;
              return (
                <View key={day.date} style={styles.dayCard}>
                  <Text style={styles.dayTitle}>{fmtDay(day.date)}</Text>

                  {/* Rota planejada */}
                  {day.stops.length > 0 ? (
                    <View style={styles.block}>
                      <Text style={styles.blockTitle}>
                        🗺️ Rota{day.routeSource === 'manual' ? ' (manual)' : day.routeSource === 'suggested' ? ' (auto)' : ''} —
                        {' '}{day.stops.length} parada{day.stops.length === 1 ? '' : 's'} ({done} concluída{done === 1 ? '' : 's'})
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

                  {/* Check-ins reais */}
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
            })
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
  hint: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  chips: { gap: 6, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#f1f5f9', maxWidth: 160 },
  chipActive: { backgroundColor: '#7c3aed' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  chipTextActive: { color: '#fff' },
  empty: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginTop: 12 },
  dayCard: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginTop: 10 },
  dayTitle: { fontSize: 14, fontWeight: '800', color: '#7c3aed', marginBottom: 6 },
  block: { marginBottom: 8 },
  blockTitle: { fontSize: 12, fontWeight: '800', color: '#334155', marginBottom: 3 },
  blockMuted: { fontSize: 12, color: '#94a3b8', marginBottom: 6 },
  line: { fontSize: 12, color: '#475569', marginLeft: 4, marginTop: 1 },
  lineDone: { color: '#16a34a', fontWeight: '600' },
});
