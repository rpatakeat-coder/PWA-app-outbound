import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../components/Alert';
import { useAllSellers } from '../hooks/useAllSellers';
import { useSellerGoals } from '../hooks/useSellerGoals';
import { useRouteConfig } from '../hooks/useRouteConfig';

// "🎯 Metas por vendedor" (aba Gestor): meta DIÁRIA de visitas de cada vendedor.
// Default = meta global (route_config). O ranking compara feito x meta.

export function SellerGoalsCard() {
  const [open, setOpen] = useState(false);
  const { data: allSellers = [], isLoading: loadingSellers } = useAllSellers(open);
  // Só vendedores ATIVOS têm meta ("sem meta" e "não vendedor" ficam de fora).
  const sellers = allSellers.filter((s) => s.status === 'ativo');
  const { goals, save } = useSellerGoals(open);
  const { config } = useRouteConfig();
  const defaultMeta = config.meta_visitas_dia || 6;

  const [form, setForm] = useState<Record<string, string>>({});

  // Inicializa/sincroniza o form quando a lista + metas carregam.
  useEffect(() => {
    if (!open || sellers.length === 0) return;
    setForm((prev) => {
      const next = { ...prev };
      for (const s of sellers) {
        if (next[s.id] === undefined) next[s.id] = String(goals.get(s.id) ?? defaultMeta);
      }
      return next;
    });
  }, [open, sellers, goals, defaultMeta]);

  const onSave = () => {
    const rows = sellers.map((s) => {
      const n = Math.max(0, Math.round(Number(String(form[s.id]).replace(',', '.')) || defaultMeta));
      return { seller_id: s.id, meta_visitas_dia: n };
    });
    save.mutate(rows, {
      onSuccess: () => Alert.alert('Salvo ✅', 'Metas atualizadas. O ranking já compara feito x meta.'),
      onError: (err: any) => Alert.alert('Erro ao salvar', err?.message ?? 'Tente de novo.'),
    });
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <Text style={styles.title}>🎯 Metas por vendedor</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.hint}>Meta diária de visitas (check-ins). Vazio = padrão global ({defaultMeta}).</Text>
          {loadingSellers ? (
            <ActivityIndicator color="#C8131B" style={{ marginVertical: 12 }} />
          ) : (
            <>
              {sellers.map((s) => (
                <View key={s.id} style={styles.row}>
                  <Text style={styles.name} numberOfLines={1}>
                    {s.name}{s.deactivated ? ' • desativado' : ''}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={form[s.id] ?? ''}
                    onChangeText={(v) => setForm((f) => ({ ...f, [s.id]: v }))}
                    keyboardType="number-pad"
                    placeholder={String(defaultMeta)}
                    placeholderTextColor="var(--text-subtle)"
                  />
                </View>
              ))}
              <TouchableOpacity
                style={[styles.saveBtn, save.isPending && { opacity: 0.6 }]}
                onPress={onSave}
                disabled={save.isPending}
              >
                {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Salvar metas</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'var(--surface)', borderRadius: 14, borderWidth: 1, borderColor: 'var(--tint-red-border)', padding: 14, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: 'var(--tint-red-text)' },
  chevron: { fontSize: 12, color: '#C8131B', fontWeight: '800' },
  hint: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  name: { flex: 1, fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  input: { width: 70, borderWidth: 1, borderColor: 'var(--border)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, color: 'var(--text)', backgroundColor: 'var(--bg)', textAlign: 'center' },
  saveBtn: { backgroundColor: '#C8131B', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
