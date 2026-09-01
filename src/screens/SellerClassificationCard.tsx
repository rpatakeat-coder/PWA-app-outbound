import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconText, IconUserGroup, IconCheckbox, IconCheckboxChecked} from '../components/icons';
import { Alert } from '../components/Alert';
import { useSellerClassification, precisaDeIdHubspot } from '../hooks/useSellerClassification';
import type { SellerStatus } from '../hooks/useAllSellers';

// "👥 Vendedores & usuários" (aba Gestor): o gestor define quem é vendedor
// ativo, quem é usuário comum (sem meta) e quem não é vendedor. Aplica nos
// rankings/metas/filtros.

const OPTIONS: { value: SellerStatus; label: string }[] = [
  { value: 'ativo', label: 'Vendedor' },
  { value: 'sem_meta', label: 'Sem meta' },
  { value: 'nao_vendedor', label: 'Não vend.' },
];

export function SellerClassificationCard() {
  const [open, setOpen] = useState(false);
  const { users, isLoading, save } = useSellerClassification(open);
  const [form, setForm] = useState<Record<string, SellerStatus>>({});
  const [hideDeactivated, setHideDeactivated] = useState(false);

  const visible = users.filter((u) => !hideDeactivated || !u.deactivated);
  const deactivatedCount = users.filter((u) => u.deactivated).length;

  useEffect(() => {
    if (!open || users.length === 0) return;
    setForm((prev) => {
      const next = { ...prev };
      for (const u of users) if (next[u.id] === undefined) next[u.id] = u.status;
      return next;
    });
  }, [open, users]);

  const onSave = () => {
    const rows = users.map((u) => ({ seller_id: u.id, status: form[u.id] ?? u.status }));
    save.mutate(rows, {
      onSuccess: () => Alert.alert('Salvo', 'Classificação atualizada. Vale nos rankings, metas e filtros.'),
      onError: (err: any) => Alert.alert('Erro ao salvar', err?.message ?? 'Tente de novo.'),
    });
  };

  const semId = visible.filter(precisaDeIdHubspot);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <IconText Icone={IconUserGroup} style={styles.title} tone="tintRedText">Vendedores & usuários</IconText>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.hint}>
            Vendedor = rankings + metas. Sem meta = aparece no ranking mas sem meta. Não vend. = sumido.
          </Text>
          {deactivatedCount > 0 && (
            <TouchableOpacity
              style={[styles.toggle, hideDeactivated && styles.toggleActive]}
              onPress={() => setHideDeactivated((v) => !v)}
            >
              <Text style={[styles.toggleText, hideDeactivated && styles.toggleTextActive]}>
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
          {/* Vendedor sem id_hubspot nao recebe lead nem tarefa — e o app nao
              tinha onde dizer isso. Sem o aviso, a conta fica meses parecendo
              normal e o gestor so' descobre pela reclamacao ("nao chega nada
              pra mim"). Aparece so' quando ha' alguem nessa situacao. */}
          {!isLoading && semId.length > 0 && (
            <View style={styles.avisoSemId}>
              <Text style={styles.avisoSemIdTexto}>
                {semId.length === 1
                  ? `${semId[0].name} está sem ID do HubSpot — não recebe lead nem tarefa. Configure em Vendedores e usuários.`
                  : `${semId.length} pessoas estão sem ID do HubSpot e não recebem lead nem tarefa: ${semId.map(u => u.name).join(', ')}.`}
              </Text>
            </View>
          )}
          {isLoading ? (
            <ActivityIndicator color="var(--brand-text)" style={{ marginVertical: 12 }} />
          ) : (
            <>
              {visible.map((u) => {
                const cur = form[u.id] ?? u.status;
                return (
                  <View key={u.id} style={styles.row}>
                    <Text style={styles.name} numberOfLines={1}>
                      {u.name}{u.deactivated ? ' • desativado' : ''}{precisaDeIdHubspot(u) ? ' • sem ID HubSpot' : ''}
                    </Text>
                    <View style={styles.seg}>
                      {OPTIONS.map((o) => {
                        const active = cur === o.value;
                        return (
                          <TouchableOpacity
                            key={o.value}
                            style={[styles.segBtn, active && styles.segBtnActive]}
                            onPress={() => setForm((f) => ({ ...f, [u.id]: o.value }))}
                          >
                            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity
                style={[styles.saveBtn, save.isPending && { opacity: 0.6 }]}
                onPress={onSave}
                disabled={save.isPending}
              >
                {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Salvar classificação</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avisoSemId: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: 'var(--tint-amber)',
    borderWidth: 1,
    borderColor: 'var(--tint-amber-border)',
  },
  avisoSemIdTexto: { fontSize: 12, lineHeight: 18, color: 'var(--tint-amber-text)' },
  card: { backgroundColor: 'var(--surface)', borderRadius: 14, borderWidth: 1, borderColor: 'var(--tint-red-border)', padding: 14, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: 'var(--tint-red-text)' },
  chevron: { fontSize: 12, color: 'var(--brand-text)', fontWeight: '800' },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 },
  toggle: { alignSelf: 'flex-start', backgroundColor: 'var(--surface-2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  toggleActive: { backgroundColor: 'var(--tint-red)' },
  toggleText: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  toggleTextActive: { color: 'var(--tint-red-text)' },
  row: { marginBottom: 10 },
  name: { fontSize: 13, fontWeight: '700', color: 'var(--text)', marginBottom: 5 },
  seg: { flexDirection: 'row', gap: 6 },
  segBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: 'var(--surface-2)', alignItems: 'center' },
  segBtnActive: { backgroundColor: '#C8131B' },
  segText: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  segTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#C8131B', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
