import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../components/Alert';
import { supabase } from '../integrations/supabase/client';
import { useLayout } from '../hooks/useLayout';
import { useTheme, type ThemePref } from '../theme';
import {
  IconBarGraph,
  IconExternalLink,
  IconLock,
  IconLogout,
  IconRefresh,
  IconUserGroup,
  useIconColors,
} from '../components/icons';
import { ds } from './sharedStyles';

// Configuracoes como TELA (prompt 13a/13b do handoff) — antes era o modal da
// engrenagem (isPasswordModalOpen). Toda a logica veio junto sem mudanca:
// updatePassword, o <a href> real pro /gestao e o update em app_force_reload.
interface Props {
  profile: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    id_hubspot?: string | null;
  } | null;
  logout: () => void;
  updatePassword: (nova: string) => Promise<void>;
  canViewGestor: boolean;
  isAdmin: boolean;
  isViewer: boolean;
  /** Switch "Carregar so a area do mapa" — estado compartilhado com o mapa. */
  showOnlyMyArea: boolean;
  onToggleArea: (valor: boolean) => void;
}

const OPCOES_TEMA: Array<{ valor: ThemePref; rotulo: string }> = [
  { valor: 'system', rotulo: 'Automático' },
  { valor: 'light', rotulo: 'Claro' },
  { valor: 'dark', rotulo: 'Escuro' },
];

export function ConfiguracoesScreen({
  profile,
  logout,
  updatePassword,
  canViewGestor,
  isAdmin,
  isViewer,
  showOnlyMyArea,
  onToggleArea,
}: Props) {
  const layout = useLayout();
  const iconColors = useIconColors();
  const { pref: themePref, setPref: setThemePref } = useTheme();

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  // SOBRE: o build vem do carimbo do proprio sw.js servido — e' a unica
  // "versao" que o PWA tem (cada deploy reescreve BUILD_VERSION).
  const [buildSw, setBuildSw] = useState<string | null>(null);
  useEffect(() => {
    let cancelado = false;
    if (typeof fetch === 'undefined') return;
    fetch('/sw.js', { cache: 'no-store' })
      .then(r => r.text())
      .then(txt => {
        if (cancelado) return;
        const m = txt.match(/BUILD_VERSION = '([^']+)'/);
        setBuildSw(m ? m[1] : null);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const salvarSenha = async () => {
    if (novaSenha.length < 6) {
      Alert.alert('Senha curta', 'A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmaSenha) {
      Alert.alert('Confirmação não confere', 'As duas senhas digitadas precisam ser iguais.');
      return;
    }
    try {
      setSalvandoSenha(true);
      await updatePassword(novaSenha);
      setNovaSenha('');
      setConfirmaSenha('');
      Alert.alert('Pronto', 'Senha redefinida com sucesso.');
    } catch (err) {
      Alert.alert('Erro ao redefinir senha', err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setSalvandoSenha(false);
    }
  };

  const forcarAtualizacao = () => {
    Alert.alert(
      'Forçar reload de todos',
      'Todos os apps abertos vão recarregar agora. Confirmar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, reload',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await supabase
              .from('app_force_reload')
              .update({
                triggered_at: new Date().toISOString(),
                triggered_by: profile?.id ?? null,
                triggered_reason: 'manual-by-admin',
              })
              .eq('id', 1);
            if (err) {
              Alert.alert('Erro', err.message);
              return;
            }
            Alert.alert('Pronto', 'Sinal enviado. Seu próprio app vai recarregar em alguns segundos.');
          },
        },
      ],
    );
  };

  const papel = canViewGestor ? 'Gestor' : isViewer ? 'Visualização' : 'Vendedor';

  const linhaLeitura = (chave: string, valor: string | null | undefined, tabular = false) => (
    <View style={styles.linha} key={chave}>
      <Text style={styles.linhaChave} numberOfLines={1}>{chave}</Text>
      <Text style={[styles.linhaValor, tabular && { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
        {valor || '—'}
      </Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.pagina}>
      {/* 1. CONTA */}
      <View>
        <Text style={styles.tituloSecao}>Conta</Text>
        <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
          {linhaLeitura('Nome', profile?.full_name)}
          {linhaLeitura('E-mail', profile?.email)}
          {linhaLeitura('Papel', papel)}
          {linhaLeitura('ID HubSpot', profile?.id_hubspot, true)}
          <Text style={styles.nota}>Nome, e-mail e papel são definidos pelo administrador.</Text>
        </View>
      </View>

      {/* 2. SENHA */}
      <View>
        <Text style={styles.tituloSecao}>Senha</Text>
        <View style={styles.card}>
          <Text style={styles.hint}>Digite uma nova senha. Mínimo de 6 caracteres.</Text>
          <View style={[styles.gradeSenha, !layout.ehDesktop && { flexDirection: 'column' }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rotuloCampo}>Nova senha</Text>
              <TextInput
                style={styles.campo}
                secureTextEntry
                value={novaSenha}
                onChangeText={setNovaSenha}
                editable={!salvandoSenha}
                placeholder="••••••••"
                placeholderTextColor="var(--text-disabled)"
                accessibilityLabel="Nova senha"
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rotuloCampo}>Confirmar nova senha</Text>
              <TextInput
                style={styles.campo}
                secureTextEntry
                value={confirmaSenha}
                onChangeText={setConfirmaSenha}
                editable={!salvandoSenha}
                placeholder="••••••••"
                placeholderTextColor="var(--text-disabled)"
                accessibilityLabel="Confirmar nova senha"
              />
            </View>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.ctaCheio, salvandoSenha && { opacity: 0.6 }]}
            disabled={salvandoSenha}
            onPress={salvarSenha}
          >
            {salvandoSenha ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <IconLock width={20} height={20} fill="#FFFFFF" />
                <Text style={styles.ctaCheioTexto}>Salvar nova senha</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. APARENCIA */}
      <View>
        <Text style={styles.tituloSecao}>Aparência</Text>
        <View style={styles.card}>
          <Text style={styles.rotuloCampo}>Tema</Text>
          <Text style={styles.hint}>
            Automático segue o aparelho. A escolha manual vence o aparelho e vale também no mapa.
          </Text>
          <View style={styles.segmentos}>
            {OPCOES_TEMA.map((opt, i) => {
              const ativo = themePref === opt.valor;
              return (
                <TouchableOpacity
                  key={opt.valor}
                  accessibilityRole="button"
                  accessibilityLabel={opt.rotulo}
                  style={[
                    styles.segmento,
                    i === 0 && { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
                    i === OPCOES_TEMA.length - 1 && { borderTopRightRadius: 12, borderBottomRightRadius: 12 },
                    i > 0 && { borderLeftWidth: 0 },
                    ativo && styles.segmentoAtivo,
                  ]}
                  onPress={() => setThemePref(opt.valor)}
                >
                  <Text style={[styles.segmentoTexto, ativo && { color: '#FFFFFF' }]}>{opt.rotulo}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* 4. MAPA — item que o modal tinha e a spec nao listou; vem junto. */}
      <View>
        <Text style={styles.tituloSecao}>Mapa</Text>
        <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rotuloCampo}>Carregar só a área do mapa</Text>
            <Text style={styles.hint}>
              Traz os clientes da região visível e vai carregando conforme você move o mapa.
              Desligue para carregar a base inteira — é bem mais pesado. Atualiza quando você
              abrir o app de novo.
            </Text>
          </View>
          <Switch value={showOnlyMyArea} onValueChange={onToggleArea} />
        </View>
      </View>

      {/* 5. AREA DO GESTOR */}
      {canViewGestor && (
        <View>
          <Text style={styles.tituloSecao}>Área do gestor</Text>
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              accessibilityRole="link"
              style={styles.cardLink}
              {...ds({ hover: 'borda', trans: '1' })}
              {...({ href: '/gestao/', hrefAttrs: { target: '_blank', rel: 'noopener' } } as Record<string, unknown>)}
            >
              <View style={[styles.quadroIcone, { backgroundColor: 'var(--tint-red)' }]}>
                <IconBarGraph width={20} height={20} fill={iconColors.tintRedText} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardLinkTitulo}>Abrir painel de gestão</Text>
                <Text style={styles.hint}>Funil do time, travados e gargalo. Melhor no computador.</Text>
              </View>
              <IconExternalLink width={20} height={20} fill={iconColors.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="link"
              style={styles.cardLink}
              {...ds({ hover: 'borda', trans: '1' })}
              {...({ href: '/gestao/#/time', hrefAttrs: { target: '_blank', rel: 'noopener' } } as Record<string, unknown>)}
            >
              <View style={[styles.quadroIcone, { backgroundColor: 'var(--surface-2)' }]}>
                <IconUserGroup width={20} height={20} fill={iconColors.muted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardLinkTitulo}>Vendedores e usuários</Text>
                <Text style={styles.hint}>Metas, classificação e atividade por vendedor, no cockpit.</Text>
              </View>
              <IconExternalLink width={20} height={20} fill={iconColors.muted} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 6. ADMINISTRACAO */}
      {isAdmin && (
        <View>
          <Text style={styles.tituloSecao}>Administração</Text>
          <View style={[styles.card, styles.cardAdmin]}>
            <Text style={styles.rotuloCampo}>Forçar atualização</Text>
            <Text style={[styles.hint, { maxWidth: 560 }]}>
              Dispara um reload imediato em todos os apps abertos (puxa OTA novo do EAS antes).
              Use com cuidado — usuários no meio de um cadastro perdem o que não foi salvo.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.ctaVazadoNeutro}
              onPress={forcarAtualizacao}
            >
              <IconRefresh width={20} height={20} fill={iconColors.muted} />
              <Text style={styles.ctaVazadoNeutroTexto}>Forçar atualização</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 7. SOBRE */}
      <View>
        <Text style={styles.tituloSecao}>Sobre</Text>
        <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
          {linhaLeitura('Build do service worker', buildSw, true)}
          <View style={{ padding: 16 }}>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.ctaSair}
              {...ds({ hover: 'tintred', trans: '1' })}
              onPress={logout}
            >
              <IconLogout width={20} height={20} fill={iconColors.brandText} />
              <Text style={styles.ctaSairTexto}>Sair da conta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: {
    padding: 24,
    gap: 32,
    maxWidth: 880,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 120,
  },
  tituloSecao: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 16,
  },
  card: {
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--border)',
  },
  linhaChave: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    fontWeight: '600',
    color: 'var(--text-faint)',
    flexShrink: 0,
  },
  linhaValor: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.25,
    color: 'var(--text)',
    textAlign: 'right',
    flexShrink: 1,
  },
  nota: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    color: 'var(--text-faint)',
    padding: 16,
  },
  hint: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)', marginBottom: 8 },
  rotuloCampo: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: 8,
  },
  gradeSenha: { flexDirection: 'row', gap: 16, maxWidth: 560, marginTop: 8 },
  campo: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--stroke-strong)',
    backgroundColor: 'var(--surface)',
    paddingHorizontal: 16,
    fontSize: 14,
    color: 'var(--text)',
  },
  ctaCheio: {
    marginTop: 16,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#C8131B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    minWidth: 220,
  },
  ctaCheioTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: '#FFFFFF' },
  segmentos: { flexDirection: 'row', maxWidth: 360, marginTop: 8 },
  segmento: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    backgroundColor: 'var(--surface)',
  },
  segmentoAtivo: { backgroundColor: '#C8131B', borderColor: '#C8131B' },
  segmentoTexto: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '600', color: 'var(--text-muted)' },
  cardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: 'var(--surface)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  quadroIcone: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardLinkTitulo: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text)' },
  cardAdmin: { borderLeftWidth: 3, borderLeftColor: '#CC8C1D' },
  ctaVazadoNeutro: {
    marginTop: 16,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  ctaVazadoNeutroTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text-muted)' },
  ctaSair: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C8131B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  ctaSairTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--brand-text)' },
});
