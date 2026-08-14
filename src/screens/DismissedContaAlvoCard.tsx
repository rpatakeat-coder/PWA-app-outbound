import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../components/Alert';
import { useDismissedContaAlvo } from '../hooks/useDismissedContaAlvo';
import { exportAgenda } from '../utils/exportAgenda';

// "🚫 Contas Alvo dispensadas" (aba Gestor): lista as conta-alvo que os
// vendedores marcaram "Não interessa" (quem/quando), com FILTRO por período e
// por quem dispensou + EXPORT JSON. Restaurar volta a conta-alvo.

const fmt = (iso: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const PERIODS: { label: string; days: number | null }[] = [
  { label: 'Tudo', days: null },
  { label: '30 dias', days: 30 },
  { label: '7 dias', days: 7 },
];

export function DismissedContaAlvoCard() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, restore } = useDismissedContaAlvo(open);
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [filterBy, setFilterBy] = useState<string | null>(null); // dismissedById | null = todos
  const [exporting, setExporting] = useState(false);

  // Quem já dispensou (pra montar os chips de filtro).
  const dismissers = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of data) if (d.dismissedById) m.set(d.dismissedById, d.dismissedByName || 'Sem nome');
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = useMemo(() => {
    const cutoff = periodDays ? Date.now() - periodDays * 86400000 : null;
    return data.filter((d) => {
      if (filterBy && d.dismissedById !== filterBy) return false;
      if (cutoff && d.dismissedAt && new Date(d.dismissedAt).getTime() < cutoff) return false;
      if (cutoff && !d.dismissedAt) return false;
      return true;
    });
  }, [data, filterBy, periodDays]);

  const onRestore = (id: string, nome: string) =>
    Alert.alert('Restaurar?', `Voltar "${nome}" pras contas-alvo (aparece no mapa e pode ser sugerida de novo)?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restaurar', onPress: () => restore.mutate(id) },
    ]);

  const onExport = async () => {
    if (exporting || filtered.length === 0) return;
    setExporting(true);
    try {
      const payload = {
        meta: {
          tipo: 'contas_alvo_dispensadas',
          gerado_em: new Date().toISOString(),
          filtro_vendedor: filterBy ? dismissers.find((x) => x.id === filterBy)?.name ?? filterBy : 'Todos',
          periodo: periodDays ? `últimos ${periodDays} dias` : 'tudo',
          total: filtered.length,
        },
        dispensadas: filtered.map((d) => ({
          conta_alvo: d.nome,
          cidade: d.cidade,
          dispensado_por: d.dismissedByName,
          dispensado_em: d.dismissedAt,
          vendedor_atribuido_id_hubspot: d.vendedorHubspotId,
        })),
      };
      const res = await exportAgenda(payload, 'contas-alvo-dispensadas');
      Alert.alert('Exportado 📤', `${filtered.length} contas-alvo dispensadas.\n\nToque em Abrir pra baixar o .json.`, [
        { text: 'Fechar', style: 'cancel' },
        { text: 'Abrir', onPress: () => Linking.openURL(res.url) },
      ]);
    } catch (err: any) {
      Alert.alert('Erro ao exportar', err?.message ?? 'Tente de novo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <Text style={styles.title}>🚫 Contas Alvo dispensadas{data.length ? ` · ${data.length}` : ''}</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 8 }}>
          {isLoading ? (
            <ActivityIndicator color="#C8131B" style={{ marginVertical: 12 }} />
          ) : data.length === 0 ? (
            <Text style={styles.empty}>Nenhuma conta-alvo dispensada.</Text>
          ) : (
            <>
              {/* Filtros */}
              <View style={styles.filterHeader}>
                <View style={styles.chipsRow}>
                  {PERIODS.map((p) => (
                    <TouchableOpacity
                      key={p.label}
                      style={[styles.pchip, periodDays === p.days && styles.pchipActive]}
                      onPress={() => setPeriodDays(p.days)}
                    >
                      <Text style={[styles.pchipText, periodDays === p.days && styles.pchipTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.exportBtn, (exporting || filtered.length === 0) && { opacity: 0.5 }]}
                  onPress={onExport}
                  disabled={exporting || filtered.length === 0}
                >
                  {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.exportBtnText}>📤 JSON</Text>}
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <TouchableOpacity style={[styles.chip, filterBy === null && styles.chipActive]} onPress={() => setFilterBy(null)}>
                  <Text style={[styles.chipText, filterBy === null && styles.chipTextActive]}>Todos ({data.length})</Text>
                </TouchableOpacity>
                {dismissers.map((v) => {
                  const active = filterBy === v.id;
                  const n = data.filter((d) => d.dismissedById === v.id).length;
                  return (
                    <TouchableOpacity key={v.id} style={[styles.chip, active && styles.chipActive]} onPress={() => setFilterBy(active ? null : v.id)}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{v.name} ({n})</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {filtered.length === 0 ? (
                <Text style={styles.empty}>Nada nesse filtro.</Text>
              ) : (
                filtered.map((d) => (
                  <View key={d.id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{d.nome}{d.cidade ? ` · ${d.cidade}` : ''}</Text>
                      <Text style={styles.meta}>
                        Dispensado por {d.dismissedByName || 'vendedor'}{d.dismissedAt ? ` em ${fmt(d.dismissedAt)}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.restoreBtn} onPress={() => onRestore(d.id, d.nome)} disabled={restore.isPending}>
                      <Text style={styles.restoreText}>Restaurar</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
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
  empty: { fontSize: 13, color: 'var(--text-subtle)', fontStyle: 'italic', marginTop: 8 },
  filterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  chipsRow: { flexDirection: 'row', gap: 6 },
  pchip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'var(--surface-2)' },
  pchipActive: { backgroundColor: '#222222' },
  pchipText: { fontSize: 11, fontWeight: '700', color: 'var(--text-muted)' },
  pchipTextActive: { color: '#fff' },
  exportBtn: { backgroundColor: '#C8131B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  exportBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  chips: { gap: 6, paddingBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: 'var(--surface-2)', maxWidth: 190 },
  chipActive: { backgroundColor: '#C8131B' },
  chipText: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  name: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  meta: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  restoreBtn: { backgroundColor: 'var(--surface-2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  restoreText: { fontSize: 12, fontWeight: '800', color: '#C8131B' },
});
