import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDismissedContaAlvo } from '../hooks/useDismissedContaAlvo';

// "🚫 Contas Alvo dispensadas" (aba Gestor): lista as conta-alvo que os
// vendedores marcaram "Não interessa" — com quem dispensou e quando. Permite
// restaurar (volta a aparecer/ser sugerível).

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

export function DismissedContaAlvoCard() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, restore } = useDismissedContaAlvo(open);

  const onRestore = (id: string, nome: string) =>
    Alert.alert('Restaurar?', `Voltar "${nome}" pras contas-alvo (aparece no mapa e pode ser sugerida de novo)?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restaurar', onPress: () => restore.mutate(id) },
    ]);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <Text style={styles.title}>🚫 Contas Alvo dispensadas{data.length ? ` · ${data.length}` : ''}</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 8 }}>
          {isLoading ? (
            <ActivityIndicator color="#7c3aed" style={{ marginVertical: 12 }} />
          ) : data.length === 0 ? (
            <Text style={styles.empty}>Nenhuma conta-alvo dispensada.</Text>
          ) : (
            data.map((d) => (
              <View key={d.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{d.nome}{d.cidade ? ` · ${d.cidade}` : ''}</Text>
                  <Text style={styles.meta}>
                    Dispensado por {d.dismissedByName || 'vendedor'}{d.dismissedAt ? ` em ${fmt(d.dismissedAt)}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={() => onRestore(d.id, d.nome)}
                  disabled={restore.isPending}
                >
                  <Text style={styles.restoreText}>Restaurar</Text>
                </TouchableOpacity>
              </View>
            ))
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
  empty: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  name: { fontSize: 13, fontWeight: '700', color: '#334155' },
  meta: { fontSize: 11, color: '#64748b', marginTop: 1 },
  restoreBtn: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  restoreText: { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
});
