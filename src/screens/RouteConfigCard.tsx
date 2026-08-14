import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { IconText, IconSettings } from '../components/icons';
import { Alert } from '../components/Alert';
import { useRouteConfig, type RouteConfig } from '../hooks/useRouteConfig';

// Card "⚙️ Config Rota do dia" na aba Gestor: edita raio/nota/avaliações da
// Conta Alvo, meta de visitas/dia e os SLAs por etapa. Salva na route_config
// (RLS só deixa o gestor editar). Colapsável pra não poluir a tela.

type FormVals = Record<keyof RouteConfig, string>;

const toForm = (c: RouteConfig): FormVals => ({
  conta_alvo_raio_m: String(c.conta_alvo_raio_m / 1000), // exibe em KM
  conta_alvo_nota_min: String(c.conta_alvo_nota_min),
  conta_alvo_reviews_min: String(c.conta_alvo_reviews_min),
  meta_visitas_dia: String(c.meta_visitas_dia),
  sla_prospeccao: String(c.sla_prospeccao),
  sla_visita: String(c.sla_visita),
  sla_conversa: String(c.sla_conversa),
  sla_demo: String(c.sla_demo),
  sla_negociacao: String(c.sla_negociacao),
  sla_ag_pagamento: String(c.sla_ag_pagamento),
});

const numOr = (s: string, fallback: number) => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};

export function RouteConfigCard() {
  const { config, isLoading, save } = useRouteConfig();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormVals>(() => toForm(config));

  // Sincroniza o form quando a config carrega/muda (e não está editando aberto).
  useEffect(() => {
    if (!open) setForm(toForm(config));
  }, [config, open]);

  const setField = (k: keyof RouteConfig, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = () => {
    const patch: RouteConfig = {
      conta_alvo_raio_m: Math.round(numOr(form.conta_alvo_raio_m, 2) * 1000), // km -> m
      conta_alvo_nota_min: numOr(form.conta_alvo_nota_min, 4.5),
      conta_alvo_reviews_min: Math.round(numOr(form.conta_alvo_reviews_min, 100)),
      meta_visitas_dia: Math.round(numOr(form.meta_visitas_dia, 6)),
      sla_prospeccao: Math.round(numOr(form.sla_prospeccao, 5)),
      sla_visita: Math.round(numOr(form.sla_visita, 5)),
      sla_conversa: Math.round(numOr(form.sla_conversa, 4)),
      sla_demo: Math.round(numOr(form.sla_demo, 3)),
      sla_negociacao: Math.round(numOr(form.sla_negociacao, 7)),
      sla_ag_pagamento: Math.round(numOr(form.sla_ag_pagamento, 2)),
    };
    save.mutate(patch, {
      onSuccess: () => Alert.alert('Salvo ✅', 'Config da Rota do dia atualizada. Vale já nas próximas gerações/buscas.'),
      onError: (err: any) => Alert.alert('Erro ao salvar', err?.message ?? 'Tente de novo.'),
    });
  };

  const Field = ({ label, k, hint }: { label: string; k: keyof RouteConfig; hint?: string }) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={form[k]}
        onChangeText={(v) => setField(k, v)}
        keyboardType="decimal-pad"
        placeholderTextColor="var(--text-subtle)"
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <IconText Icone={IconSettings} style={styles.title} tone="tintRedText">Config Rota do dia</IconText>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 6 }}>
          {isLoading ? (
            <ActivityIndicator color="var(--brand-text)" style={{ marginVertical: 12 }} />
          ) : (
            <>
              <Text style={styles.section}>Conta Alvo</Text>
              <View style={styles.row}>
                <Field label="Raio (km)" k="conta_alvo_raio_m" />
                <Field label="Nota mín." k="conta_alvo_nota_min" />
                <Field label="Avaliações mín." k="conta_alvo_reviews_min" />
              </View>

              <Text style={styles.section}>Rota do dia</Text>
              <View style={styles.row}>
                <Field label="Meta visitas/dia" k="meta_visitas_dia" />
              </View>

              <Text style={styles.section}>SLA por etapa (dias)</Text>
              <View style={styles.row}>
                <Field label="Prospecção" k="sla_prospeccao" />
                <Field label="Visita" k="sla_visita" />
                <Field label="Conversa" k="sla_conversa" />
              </View>
              <View style={styles.row}>
                <Field label="Demo/Proposta" k="sla_demo" />
                <Field label="Negociação" k="sla_negociacao" />
                <Field label="Ag. Pagamento" k="sla_ag_pagamento" />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, save.isPending && { opacity: 0.6 }]}
                onPress={onSave}
                disabled={save.isPending}
              >
                {save.isPending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Salvar config</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'var(--surface)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'var(--tint-red-border)',
    padding: 14,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: 'var(--tint-red-text)' },
  chevron: { fontSize: 12, color: 'var(--brand-text)', fontWeight: '800' },
  section: { fontSize: 12, fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, marginBottom: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: 'var(--text-muted)', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: 'var(--border)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: 'var(--text)', backgroundColor: 'var(--bg)' },
  fieldHint: { fontSize: 10, color: 'var(--text-subtle)', marginTop: 2 },
  saveBtn: { backgroundColor: '#C8131B', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
