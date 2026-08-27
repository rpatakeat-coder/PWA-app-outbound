import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Keyboard,
  Platform,
} from 'react-native';
import { KeyboardAvoidingView } from '../components/KeyboardAvoidingView';
import { Alert } from '../components/Alert';
import {
  IconLock,
  IconMail,
  useIconColors,
} from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { useLayout } from '../hooks/useLayout';

export function LoginScreen() {
  const iconColors = useIconColors();
  const layout = useLayout();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { login, error } = useAuth();

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Atenção', 'Por favor, preencha email e senha');
      return;
    }

    try {
      setLoading(true);
      await login(email, password);
    } catch (err) {
      Alert.alert('Erro ao fazer login', error || 'Verifique suas credenciais');
    } finally {
      setLoading(false);
    }
  };

  // O MESMO formulario nas duas composicoes: cartao branco sobre vermelho no
  // celular, bloco de 400px no painel direito no desktop (handoff, tela 8).
  const formulario = (
    <View style={layout.ehDesktop ? styles.webBloco : styles.card}>
      <Text style={[styles.formTitle, layout.ehDesktop && styles.webFormTitle]}>Entrar na conta</Text>

      {layout.ehDesktop && <Text style={styles.webRotulo}>E-mail</Text>}
      <View style={[styles.inputWrap, layout.ehDesktop && styles.webInputWrap]}>
        <IconMail width={layout.ehDesktop ? 20 : 16} height={layout.ehDesktop ? 20 : 16} fill={layout.ehDesktop ? iconColors.muted : iconColors.onSurface} />
        <TextInput
          style={styles.input}
          placeholder={layout.ehDesktop ? 'voce@takeat.app' : 'Email'}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          value={email}
          onChangeText={setEmail}
          placeholderTextColor="var(--text-subtle)"
          accessibilityLabel="E-mail"
        />
      </View>

      {layout.ehDesktop && <Text style={styles.webRotulo}>Senha</Text>}
      <View style={[styles.inputWrap, layout.ehDesktop && styles.webInputWrap]}>
        <IconLock width={layout.ehDesktop ? 20 : 16} height={layout.ehDesktop ? 20 : 16} fill={layout.ehDesktop ? iconColors.muted : iconColors.onSurface} />
        <TextInput
          style={styles.input}
          placeholder={layout.ehDesktop ? '••••••••' : 'Senha'}
          secureTextEntry
          editable={!loading}
          value={password}
          onChangeText={setPassword}
          placeholderTextColor="var(--text-subtle)"
          accessibilityLabel="Senha"
        />
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, layout.ehDesktop && styles.webBotao, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Entrar</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  if (layout.ehDesktop) {
    return (
      <View style={styles.webSplit}>
        <View style={styles.webMarca}>
          <Image source={{ uri: '/marca/takeat-logo-white.svg' }} style={styles.webLogo} />
          <View style={{ gap: 12 }}>
            <Text style={styles.webKicker}>Field Sales Outbound</Text>
            <Text style={styles.webFrase}>O campo inteiro numa tela: mapa, rota, agenda e funil.</Text>
          </View>
          <Text style={styles.webNota}>Contas são criadas pelo administrador.</Text>
        </View>
        <View style={styles.webForm}>{formulario}</View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS === 'android' && { paddingBottom: keyboardHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topSection}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
          />
          <Text style={styles.title}>Takeat RPA</Text>
          <Text style={styles.subtitle}>Gestão de Leads & Clientes</Text>
        </View>

        <View style={styles.formSection}>
          {formulario}

          <Text style={styles.infoText}>
            Contas são criadas pelo administrador
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // ---- Login desktop: split panel (handoff, tela 8) ----
  webSplit: { flex: 1, flexDirection: 'row' },
  webMarca: {
    flex: 1,
    backgroundColor: '#C8131B',
    padding: 64,
    justifyContent: 'space-between',
  },
  webLogo: { width: 116, height: 32, resizeMode: 'contain', alignSelf: 'flex-start' },
  webKicker: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.3,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
  },
  webFrase: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: '#FFFFFF', maxWidth: 380 },
  webNota: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'rgba(255,255,255,0.7)' },
  webForm: {
    flex: 1,
    backgroundColor: 'var(--bg)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 64,
  },
  webBloco: { width: '100%', maxWidth: 400, gap: 4 },
  webFormTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: 'var(--text)', textAlign: 'left', marginBottom: 16 },
  webRotulo: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: 8,
    marginTop: 8,
  },
  webInputWrap: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'var(--stroke-strong)',
    backgroundColor: 'var(--surface)',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  webBotao: {
    height: 40,
    borderRadius: 12,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: 16,
  },
  container: {
    flex: 1,
    backgroundColor: '#C8131B',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingBottom: 32,
  },
  logo: {
    width: 80,
    height: 80,
    tintColor: '#fff',
    resizeMode: 'contain',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  formSection: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: 'var(--surface)',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'var(--text)',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'var(--bg)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--border)',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: 'var(--text)',
  },
  button: {
    backgroundColor: '#C8131B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: 'var(--brand-text)',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 16,
  },
});
