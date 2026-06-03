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
  TouchableOpacity,
  View,
} from 'react-native';
import type { Client } from '../types/client';
import { STAGES, CHANGE_STAGE_WEBHOOK } from '../constants/stages';

interface Props {
  client: Client;
  onClose: () => void;
}

export function ChangeStageModal({ client, onClose }: Props) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedSubOption, setSelectedSubOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedStage = STAGES.find((s) => s.id === selectedStageId) ?? null;
  const needsSubOption = !!selectedStage?.subOption;
  const ready =
    !!selectedStage && (!needsSubOption || !!selectedSubOption) && !submitting;

  const submit = async () => {
    if (!selectedStage) return;
    if (!client.id_hubspot) {
      Alert.alert(
        'Cliente sem ID HubSpot',
        'Esse pin não tem ID do HubSpot cadastrado — sem isso o webhook não consegue identificar o registro lá. Cadastre o ID antes ou peça pra integração rodar.',
      );
      return;
    }
    if (needsSubOption && !selectedSubOption) {
      Alert.alert(
        'Falta selecionar',
        `Escolha um valor para "${selectedStage.subOption!.fieldLabel}".`,
      );
      return;
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
      if (selectedStage.subOption && selectedSubOption) {
        payload.sub_field = selectedStage.subOption.field;
        payload.sub_value = selectedSubOption;
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
                      setSelectedSubOption(null);
                    }}
                    disabled={submitting}
                  >
                    <View style={[styles.stageDot, { backgroundColor: stage.color }]} />
                    <Text
                      style={[
                        styles.stageLabel,
                        isSelected && { color: stage.color },
                      ]}
                    >
                      {stage.label}
                    </Text>
                    {stage.subOption && (
                      <Text style={styles.stageHint}>
                        + {stage.subOption.fieldLabel}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* Sub-opção inline quando essa stage exige propriedade
                      obrigatória no HubSpot. Some quando troca de stage. */}
                  {isSelected && stage.subOption && (
                    <View style={[styles.subOptionsWrap, { borderLeftColor: stage.color }]}>
                      <Text style={styles.subOptionsLabel}>
                        {stage.subOption.fieldLabel}
                      </Text>
                      <View style={styles.subOptionsGrid}>
                        {stage.subOption.options.map((opt) => {
                          const subSelected = selectedSubOption === opt;
                          return (
                            <TouchableOpacity
                              key={opt}
                              style={[
                                styles.subOptionChip,
                                subSelected && {
                                  backgroundColor: stage.color,
                                  borderColor: stage.color,
                                },
                              ]}
                              onPress={() => setSelectedSubOption(opt)}
                              disabled={submitting}
                            >
                              <Text
                                style={[
                                  styles.subOptionChipText,
                                  subSelected && { color: '#fff' },
                                ]}
                              >
                                {opt}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
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
