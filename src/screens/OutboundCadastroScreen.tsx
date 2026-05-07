import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import type { Profile } from '../integrations/supabase/types';

const WEBHOOK_URL = 'https://webhook.takeat.cloud/webhook/c45d62f8-a6d7-406d-ab48-4bebddadba64';

interface OutboundCadastroScreenProps {
  profile: Profile | null;
  onClose: () => void;
}

const formatCelular = (value: string) => {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export function OutboundCadastroScreen({ profile, onClose }: OutboundCadastroScreenProps) {
  const [nomeCliente, setNomeCliente] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [celular, setCelular] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (!nomeCliente.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o nome do cliente.');
      return;
    }
    if (!nomeEmpresa.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o nome da empresa.');
      return;
    }
    const celularNumerico = celular.replace(/\D/g, '');
    if (celularNumerico.length < 10) {
      Alert.alert('Celular inválido', 'Informe um celular com DDD (10 ou 11 dígitos).');
      return;
    }

    if (!profile?.id_hubspot || !profile?.instancia_token) {
      Alert.alert(
        'Vendedor não configurado',
        'Seu usuário não possui id_hubspot e/ou instancia_token configurados. Peça ao administrador para preencher esses campos no seu perfil.',
      );
      return;
    }

    Keyboard.dismiss();
    setSubmitting(true);

    const payload = {
      nome_cliente: nomeCliente.trim(),
      nome_empresa: nomeEmpresa.trim(),
      celular,
      celular_numerico: celularNumerico,
      vendedor_id: profile.id_hubspot,
      vendedor_nome: profile.full_name ?? '',
      vendedor_token: profile.instancia_token,
      observacoes: observacoes.trim(),
      origem: 'Captacao Outbound - Formulario Web',
      enviado_em: new Date().toISOString(),
    };

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ` - ${text.slice(0, 200)}` : ''}`);
      }

      Alert.alert('Sucesso', 'Cadastro enviado com sucesso!', [
        { text: 'OK', onPress: onClose },
      ]);
    } catch (err: any) {
      Alert.alert('Erro ao enviar', err?.message || 'Não foi possível enviar o cadastro. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.title}>📤 Cadastro Outbound</Text>
                <TouchableOpacity onPress={onClose} disabled={submitting}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>
                Envia o lead direto para o sistema, sem salvar no app nem no mapa.
              </Text>

              <Text style={styles.label}>Nome do cliente *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Julyan Teste"
                placeholderTextColor="#94a3b8"
                value={nomeCliente}
                onChangeText={setNomeCliente}
                editable={!submitting}
              />

              <Text style={styles.label}>Nome da empresa *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Restaurante do Julyan"
                placeholderTextColor="#94a3b8"
                value={nomeEmpresa}
                onChangeText={setNomeEmpresa}
                editable={!submitting}
              />

              <Text style={styles.label}>Celular *</Text>
              <TextInput
                style={styles.input}
                placeholder="(27) 99618-3875"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={celular}
                onChangeText={v => setCelular(formatCelular(v))}
                editable={!submitting}
                maxLength={16}
              />

              <Text style={styles.label}>Observações</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Anotações sobre o contato..."
                placeholderTextColor="#94a3b8"
                value={observacoes}
                onChangeText={setObservacoes}
                editable={!submitting}
                multiline
                textAlignVertical="top"
              />

              {profile && (
                <View style={styles.vendedorBox}>
                  <Text style={styles.vendedorBoxTitle}>Vendedor</Text>
                  <Text style={styles.vendedorBoxLine}>
                    {profile.full_name || profile.email}
                  </Text>
                  <Text style={styles.vendedorBoxHint}>
                    {profile.id_hubspot && profile.instancia_token
                      ? 'Configuração de vendedor OK'
                      : '⚠ Falta id_hubspot/instancia_token no perfil — peça ao admin para configurar.'}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.disabled]}
                onPress={submit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Enviar cadastro</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={submitting}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeBtn: {
    fontSize: 22,
    color: '#94a3b8',
    paddingHorizontal: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
  },
  textarea: {
    height: 90,
  },
  vendedorBox: {
    marginTop: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  vendedorBoxTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  vendedorBoxLine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  vendedorBoxHint: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  submitBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelBtnText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
});
