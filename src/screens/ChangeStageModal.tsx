import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Client } from '../types/client';
import {
  STAGES,
  CHANGE_STAGE_WEBHOOK,
  type Stage,
  type StageSubField,
} from '../constants/stages';
import { useStagePropertyOptions } from '../hooks/useStagePropertyOptions';

interface Props {
  client: Client;
  onClose: () => void;
}

// Normaliza "1.500,50" / "1500,50" / "1500.50" / "1500" pra "1500.50".
// Mantém só dígitos e o último separador como ponto decimal. Vazio → null.
function normalizeCurrency(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Remove R$, espaços e qualquer outro símbolo
  const cleaned = trimmed.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  // Se tem vírgula e ponto, ponto é separador de milhar; tira ele e usa vírgula como decimal
  let withDecimal = cleaned;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // o último separador é o decimal
    if (lastComma > lastDot) {
      withDecimal = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      withDecimal = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    withDecimal = cleaned.replace(',', '.');
  }
  const n = Number(withDecimal);
  if (!Number.isFinite(n)) return null;
  return String(n);
}

function SelectField({
  subField,
  value,
  onChange,
  color,
  disabled,
  dbOptions,
  dbLabel,
}: {
  subField: Extract<StageSubField, { kind: 'select' }>;
  value: string; // sempre o internal value (vai pro payload do HubSpot)
  onChange: (v: string) => void;
  color: string;
  disabled: boolean;
  // Quando vem do banco: cada option tem { value: internal, label: display }.
  // Fallback hardcoded (subField.options) eh array de strings — o mesmo
  // valor serve como internal E display.
  dbOptions?: { value: string; label: string }[];
  dbLabel?: string;
}) {
  const opts: { value: string; label: string }[] =
    dbOptions ?? subField.options.map((o) => ({ value: o, label: o }));
  const label = dbLabel ?? subField.fieldLabel;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subOptionsLabel}>{label}</Text>
      <View style={styles.subOptionsGrid}>
        {opts.map((opt) => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.subOptionChip,
                selected && { backgroundColor: color, borderColor: color },
              ]}
              onPress={() => onChange(opt.value)}
              disabled={disabled}
            >
              <Text style={[styles.subOptionChipText, selected && { color: '#fff' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function CurrencyField({
  subField,
  value,
  onChange,
  disabled,
}: {
  subField: Extract<StageSubField, { kind: 'currency' }>;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subOptionsLabel}>{subField.fieldLabel}</Text>
      <View style={styles.currencyRow}>
        <Text style={styles.currencyPrefix}>R$</Text>
        <TextInput
          style={styles.currencyInput}
          placeholder={subField.placeholder ?? '0,00'}
          placeholderTextColor="#94a3b8"
          keyboardType="decimal-pad"
          value={value}
          onChangeText={onChange}
          editable={!disabled}
        />
      </View>
    </View>
  );
}

// Mascara CEP: 00000-000 (5 digitos + hifen + 3 digitos)
function maskCep(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

// Mascara dual CPF/CNPJ: aplica formato de CPF (000.000.000-00) ate 11 digitos
// ou CNPJ (00.000.000/0000-00) acima disso. A property cnpj_cpf no HubSpot
// aceita os dois.
function maskCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    // CPF
    let out = d;
    if (d.length > 3) out = `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length > 6) out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    if (d.length > 9) out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    return out;
  }
  // CNPJ
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Validacao simples de email (formato basico — RFC completo seria overkill)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());
const isValidCep = (v: string) => v.replace(/\D/g, '').length === 8;
// Aceita 11 (CPF) ou 14 (CNPJ) digitos
const isValidCnpj = (v: string) => {
  const len = v.replace(/\D/g, '').length;
  return len === 11 || len === 14;
};

function PlainTextField({
  subField,
  value,
  onChange,
  disabled,
  kind,
}: {
  subField: Extract<StageSubField, { kind: 'text' | 'email' | 'cep' | 'cnpj' | 'textarea' }>;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  kind: 'text' | 'email' | 'cep' | 'cnpj' | 'textarea';
}) {
  const keyboardType =
    kind === 'email' ? 'email-address' :
    kind === 'cep' || kind === 'cnpj' ? 'number-pad' : 'default';
  const multiline = kind === 'textarea';
  const autoCapitalize = kind === 'email' ? 'none' : 'sentences';
  const handleChange = (raw: string) => {
    if (kind === 'cep') onChange(maskCep(raw));
    else if (kind === 'cnpj') onChange(maskCnpj(raw));
    else onChange(raw);
  };
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subOptionsLabel}>{subField.fieldLabel}</Text>
      <TextInput
        style={[styles.plainInput, multiline && styles.plainInputMultiline]}
        placeholder={subField.placeholder ?? ''}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType as any}
        autoCapitalize={autoCapitalize as any}
        autoCorrect={kind !== 'email'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        value={value}
        onChangeText={handleChange}
        editable={!disabled}
      />
    </View>
  );
}

export function ChangeStageModal({ client, onClose }: Props) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [subValues, setSubValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Source of truth das opções: tabela stage_property_options no Supabase.
  // O hardcoded em STAGES é fallback enquanto a query carrega ou se falhar.
  const { data: groupedOptions } = useStagePropertyOptions();

  const selectedStage: Stage | null =
    STAGES.find((s) => s.id === selectedStageId) ?? null;
  const subFields = selectedStage?.subFields ?? [];

  // Todos os sub-fields são obrigatórios — só libera o submit quando todos
  // tiverem valor não-vazio e válido pelo tipo (currency numerico, email
  // formato, cep 8 digitos, cnpj 14 digitos).
  const allFilled = subFields.every((sf) => {
    const raw = subValues[sf.field];
    if (!raw || !raw.trim()) return false;
    if (sf.kind === 'currency') return normalizeCurrency(raw) !== null;
    if (sf.kind === 'email') return isValidEmail(raw);
    if (sf.kind === 'cep') return isValidCep(raw);
    if (sf.kind === 'cnpj') return isValidCnpj(raw);
    return true;
  });
  const ready = !!selectedStage && allFilled && !submitting;

  const setSubValue = (field: string, value: string) =>
    setSubValues((prev) => ({ ...prev, [field]: value }));

  const submit = async () => {
    if (!selectedStage) return;
    if (!client.id_hubspot) {
      Alert.alert(
        'Cliente sem ID HubSpot',
        'Esse pin não tem ID do HubSpot cadastrado — sem isso o webhook não consegue identificar o registro lá. Cadastre o ID antes ou peça pra integração rodar.',
      );
      return;
    }

    // Valida cada sub-field individualmente e monta sub_values normalizado.
    const subValuesPayload: Record<string, string> = {};
    for (const sf of subFields) {
      const raw = subValues[sf.field]?.trim() ?? '';
      if (!raw) {
        Alert.alert('Falta preencher', `Preencha "${sf.fieldLabel}".`);
        return;
      }
      if (sf.kind === 'currency') {
        const normalized = normalizeCurrency(raw);
        if (normalized === null) {
          Alert.alert(
            'Valor inválido',
            `"${sf.fieldLabel}" precisa ser um número (ex.: 1500 ou 1500,50).`,
          );
          return;
        }
        subValuesPayload[sf.field] = normalized;
      } else if (sf.kind === 'email') {
        if (!isValidEmail(raw)) {
          Alert.alert('E-mail inválido', `"${sf.fieldLabel}" precisa ser um e-mail válido.`);
          return;
        }
        subValuesPayload[sf.field] = raw.toLowerCase();
      } else if (sf.kind === 'cep') {
        if (!isValidCep(raw)) {
          Alert.alert('CEP inválido', `"${sf.fieldLabel}" precisa ter 8 dígitos.`);
          return;
        }
        // Envia so digitos pro webhook — quem consome decide se aplica mascara
        subValuesPayload[sf.field] = raw.replace(/\D/g, '');
      } else if (sf.kind === 'cnpj') {
        if (!isValidCnpj(raw)) {
          Alert.alert('CNPJ / CPF inválido', `"${sf.fieldLabel}" precisa ter 11 dígitos (CPF) ou 14 dígitos (CNPJ).`);
          return;
        }
        subValuesPayload[sf.field] = raw.replace(/\D/g, '');
      } else {
        subValuesPayload[sf.field] = raw;
      }
    }

    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        type: 'change_stage',
        id: client.id,
        id_hubspot: client.id_hubspot,
        stage_id: selectedStage.id,
        stage_label: selectedStage.label,
      };
      if (subFields.length > 0) {
        payload.sub_values = subValuesPayload;
      }

      const res = await fetch(CHANGE_STAGE_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Webhook respondeu ${res.status}`);
      }
      Alert.alert(
        'Etapa enviada',
        `${client.nome} foi enviado para ${selectedStage.label}.`,
        [{ text: 'OK', onPress: onClose }],
      );
    } catch (err: any) {
      Alert.alert('Erro ao enviar', err?.message ?? 'Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={submitting ? undefined : onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerRow}>
              <Text style={styles.title}>🔄 Mover para etapa</Text>
              <TouchableOpacity onPress={onClose} disabled={submitting}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle} numberOfLines={2}>
              {client.nome}
              {client.empresa ? ` • ${client.empresa}` : ''}
            </Text>

            {!client.id_hubspot && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ Esse cliente ainda não tem ID HubSpot. Você consegue escolher
                  a etapa mas o webhook vai recusar até o ID ser cadastrado.
                </Text>
              </View>
            )}

            <Text style={styles.sectionLabel}>Escolha a etapa nova</Text>

            {STAGES.map((stage) => {
              const isSelected = selectedStageId === stage.id;
              return (
                <View key={stage.id}>
                  <TouchableOpacity
                    style={[
                      styles.stageCard,
                      isSelected && {
                        borderColor: stage.color,
                        backgroundColor: `${stage.color}10`,
                      },
                    ]}
                    onPress={() => {
                      setSelectedStageId(stage.id);
                      setSubValues({});
                    }}
                    disabled={submitting}
                  >
                    <View style={[styles.stageDot, { backgroundColor: stage.color }]} />
                    <Text
                      style={[styles.stageLabel, isSelected && { color: stage.color }]}
                    >
                      {stage.label}
                    </Text>
                    {stage.subFields && stage.subFields.length > 0 && (
                      <Text style={styles.stageHint}>
                        + {stage.subFields.length} obrig.
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* Sub-fields inline. Cada etapa pode ter múltiplos
                      (NEGOCIAÇÃO precisa de plano_apresentado + mrr). */}
                  {isSelected && stage.subFields && stage.subFields.length > 0 && (
                    <View
                      style={[styles.subOptionsWrap, { borderLeftColor: stage.color }]}
                    >
                      {stage.subFields.map((sf) => {
                        if (sf.kind === 'select') {
                          const dbGroup = groupedOptions?.[sf.field];
                          return (
                            <SelectField
                              key={sf.field}
                              subField={sf}
                              value={subValues[sf.field] ?? ''}
                              onChange={(v) => setSubValue(sf.field, v)}
                              color={stage.color}
                              disabled={submitting}
                              dbOptions={dbGroup?.options}
                              dbLabel={dbGroup?.label}
                            />
                          );
                        }
                        if (sf.kind === 'currency') {
                          return (
                            <CurrencyField
                              key={sf.field}
                              subField={sf}
                              value={subValues[sf.field] ?? ''}
                              onChange={(v) => setSubValue(sf.field, v)}
                              disabled={submitting}
                            />
                          );
                        }
                        return (
                          <PlainTextField
                            key={sf.field}
                            subField={sf}
                            kind={sf.kind}
                            value={subValues[sf.field] ?? ''}
                            onChange={(v) => setSubValue(sf.field, v)}
                            disabled={submitting}
                          />
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}

            <TouchableOpacity
              style={[styles.submit, !ready && styles.disabled]}
              onPress={submit}
              disabled={!ready}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  {selectedStage
                    ? `Mover para ${selectedStage.label}`
                    : 'Escolha uma etapa'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  closeBtn: { fontSize: 22, color: '#94a3b8', paddingHorizontal: 4 },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 10,
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warningText: { fontSize: 12, color: '#92400e', lineHeight: 17 },
  stageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    marginBottom: 8,
    gap: 10,
  },
  stageDot: { width: 12, height: 12, borderRadius: 6 },
  stageLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a', flex: 1 },
  stageHint: { fontSize: 10, color: '#94a3b8', fontStyle: 'italic' },
  subOptionsWrap: {
    marginLeft: 18,
    marginBottom: 12,
    paddingLeft: 14,
    paddingVertical: 10,
    borderLeftWidth: 3,
  },
  subOptionsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  subOptionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subOptionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  subOptionChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
  },
  currencyPrefix: { fontSize: 14, fontWeight: '700', color: '#475569', marginRight: 6 },
  currencyInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#0f172a' },
  plainInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  plainInputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  submit: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
