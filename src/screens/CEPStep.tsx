import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import { KeyboardAvoidingView } from '../components/KeyboardAvoidingView';
import { Alert } from '../components/Alert';
import { useLayout } from '../hooks/useLayout';
import {
  IconArrowBack,
  IconLocation,
  IconMail,
  IconText,
  useIconColors,
} from '../components/icons';
import { fetchCepData, geocodeStructured, reverseGeocode, GeocodingError } from '../utils/geocoding';
import type { ClientFormData } from '../types/client';

function geocodingErrorMessage(err: unknown): string {
  if (err instanceof GeocodingError) {
    switch (err.kind) {
      case 'timeout': return 'O serviço demorou a responder. Verifique sua conexão e tente novamente.';
      case 'network': return 'Falha de rede. Verifique sua conexão.';
      case 'rate_limit': return 'Muitas buscas em sequência. Aguarde alguns segundos.';
      case 'not_found': return 'Endereço não encontrado.';
      default: return err.message || 'Erro ao consultar serviço externo.';
    }
  }
  return 'Erro inesperado. Tente novamente.';
}

interface CEPStepProps {
  onNext: (data: Partial<ClientFormData> & {
    latitude?: number | null;
    longitude?: number | null;
    bairro?: string;
    numero?: string;
    // true quando o geocoding caiu no centroide da rua (não achou o número
    // exato). O app usa pra marcar geo_approximate e alargar o raio de check-in.
    geoApproximate?: boolean;
  }) => void;
  onCancel: () => void;
  onPickOnMap?: () => void;
}

type Mode = 'choose' | 'cep' | 'coords';

export function CEPStep({ onNext, onCancel, onPickOnMap }: CEPStepProps) {
  const layout = useLayout();
  const iconColors = useIconColors();
  const [mode, setMode] = useState<Mode>('choose');
  const [loading, setLoading] = useState(false);

  // CEP mode state
  const [cep, setCep] = useState('');
  const [cepData, setCepData] = useState<{
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
    isGeneric: boolean;
  } | null>(null);
  const [numero, setNumero] = useState('');
  const [enderecoManual, setEnderecoManual] = useState('');

  // Coords mode state
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  const formatCEP = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 8);
    if (cleaned.length > 5) return cleaned.slice(0, 5) + '-' + cleaned.slice(5);
    return cleaned;
  };

  // ---- CEP Flow ----
  const searchCEP = async () => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) {
      Alert.alert('CEP inválido', 'Digite um CEP válido com 8 dígitos');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    try {
      const result = await fetchCepData(clean);
      if (!result) {
        Alert.alert('CEP não encontrado', 'Verifique o CEP e tente novamente');
        return;
      }
      setCepData(result);
    } catch (err) {
      Alert.alert('Erro ao buscar CEP', geocodingErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitCEP = async () => {
    if (!cepData) return;

    if (cepData.isGeneric && !enderecoManual.trim()) {
      Alert.alert('Endereço necessário', 'Por favor, informe o endereço completo');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    try {
      const logradouro = cepData.isGeneric ? enderecoManual.trim() : cepData.logradouro;

      // Geocodificação estruturada (número + rua separados) — melhor chance de
      // acertar o número exato da casa. Retorna approximate=true quando cai no
      // centroide da rua (limite do OSM).
      const coords = await geocodeStructured({
        logradouro,
        numero,
        cidade: cepData.cidade,
        estado: cepData.estado,
        cep,
        bairro: cepData.bairro,
      });

      if (!coords) {
        Alert.alert(
          'Endereço não localizado',
          'Não conseguimos obter coordenadas para esse endereço. Você pode cadastrar via coordenadas no passo anterior.',
        );
        return;
      }

      onNext({
        cep,
        // IMPORTANTE: endereço SÓ o logradouro; o número vai no campo próprio
        // `numero` (antes ia concatenado aqui, o que deixava o lead como "sem
        // número" e atrapalhava a geocodificação).
        endereco: logradouro,
        numero: numero.trim() || undefined,
        cidade: cepData.cidade,
        estado: cepData.estado,
        latitude: coords.latitude,
        longitude: coords.longitude,
        bairro: cepData.bairro,
        geoApproximate: coords.approximate,
      });
    } catch (err) {
      Alert.alert('Erro ao obter coordenadas', geocodingErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ---- Coords Flow ----
  const submitCoords = async () => {
    const lat = parseFloat(latitude.replace(',', '.'));
    const lng = parseFloat(longitude.replace(',', '.'));

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert('Coordenadas inválidas', 'Verifique os valores de latitude e longitude');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    try {
      const addr = await reverseGeocode(lat, lng);

      onNext({
        latitude: lat,
        longitude: lng,
        endereco: addr?.endereco || '',
        cidade: addr?.cidade || '',
        estado: addr?.estado || '',
        cep: addr?.cep ? `${addr.cep.slice(0, 5)}-${addr.cep.slice(5)}` : '',
        bairro: addr?.bairro || '',
      });
    } catch {
      onNext({ latitude: lat, longitude: lng });
    } finally {
      setLoading(false);
    }
  };

  // ---- Mode: Choose ----
  if (mode === 'choose') {
    return (
      <View style={[styles.overlay, layout.ehLargo && styles.overlayWeb]}>
        <View style={[styles.card, layout.ehLargo && styles.cardWeb]}>
          <Text style={styles.title}>Como deseja cadastrar?</Text>
          <Text style={styles.subtitle}>Escolha a forma de inserir a localização</Text>

          <TouchableOpacity style={styles.optionCard} onPress={() => setMode('cep')}>
            <IconMail width={16} height={16} fill={iconColors.onSurface} />
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>Cadastrar via CEP</Text>
              <Text style={styles.optionDesc}>Informe o CEP e o endereço será preenchido automaticamente</Text>
            </View>
            <Text style={styles.optionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionCard} onPress={() => setMode('coords')}>
            <IconLocation width={16} height={16} fill={iconColors.onSurface} />
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>Cadastrar via Coordenadas</Text>
              <Text style={styles.optionDesc}>Informe latitude e longitude diretamente</Text>
            </View>
            <Text style={styles.optionArrow}>›</Text>
          </TouchableOpacity>

          {onPickOnMap && (
            <TouchableOpacity style={styles.optionCard} onPress={onPickOnMap}>
              <IconLocation width={16} height={16} fill={iconColors.onSurface} />
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Colocar pelo pin no mapa</Text>
                <Text style={styles.optionDesc}>
                  Arraste o mapa até o local exato. Endereço/CEP/bairro são preenchidos automaticamente.
                </Text>
              </View>
              <Text style={styles.optionArrow}>›</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---- Mode: CEP ----
  if (mode === 'cep') {
  // Sem TouchableWithoutFeedback+Keyboard.dismiss por volta do conteudo: em
  // navegador touch o wrapper vira responder do toque, cancela o click
  // sintetico e o TextInput nunca recebe foco (nao dava pra digitar no PWA).
    return (
      <View style={[styles.overlay, layout.ehLargo && styles.overlayWeb]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.keyboardView, layout.ehLargo && styles.centroWeb]}
        >
            <ScrollView
              contentContainerStyle={[styles.scrollContent, layout.ehLargo && styles.centroWeb]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.card, layout.ehLargo && styles.cardWeb]}>
                <View style={styles.headerRow}>
                  <TouchableOpacity onPress={() => { setMode('choose'); setCepData(null); setCep(''); setNumero(''); setEnderecoManual(''); }}>
                    <IconText Icone={IconArrowBack} style={styles.backBtn} tone="brandText">Voltar</IconText>
                  </TouchableOpacity>
                </View>

                <IconText Icone={IconMail} style={styles.title} tone="onSurface">Cadastro via CEP</IconText>

                {/* CEP Input */}
                <Text style={styles.label}>CEP</Text>
                <View style={styles.inputRow} {...({ dataSet: { campo: "1" } } as Record<string, unknown>)}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="00000-000"
                    placeholderTextColor="var(--text-subtle)"
                    keyboardType="numeric"
                    value={cep}
                    onChangeText={v => setCep(formatCEP(v))}
                    editable={!loading}
                    returnKeyType="search"
                    onSubmitEditing={searchCEP}
                  />
                  <TouchableOpacity
                    style={[styles.searchBtn, loading && styles.disabled]}
                    onPress={searchCEP}
                    disabled={loading}
                  >
                    {loading && !cepData ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.searchBtnText}>Buscar</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* CEP Result */}
                {cepData && (
                  <View style={styles.resultBox}>
                    <View style={styles.resultHeader}>
                      <Text style={styles.resultHeaderText}>Endereço encontrado</Text>
                    </View>

                    {!cepData.isGeneric && (
                      <Text style={styles.resultAddress}>
                        {cepData.logradouro}{cepData.bairro ? `, ${cepData.bairro}` : ''}
                      </Text>
                    )}
                    <Text style={styles.resultCity}>
                      {cepData.cidade} - {cepData.estado}
                    </Text>

                    {cepData.isGeneric && (
                      <>
                        <View style={styles.warningBox}>
                          <Text style={styles.warningText}>
                            CEP genérico — informe o endereço completo
                          </Text>
                        </View>
                        <Text style={styles.label}>Endereço completo *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Rua, Avenida..."
                          placeholderTextColor="var(--text-subtle)"
                          value={enderecoManual}
                          onChangeText={setEnderecoManual}
                          editable={!loading}
                        />
                      </>
                    )}

                    <Text style={styles.label}>Número</Text>
                    <TextInput
                      style={[styles.input, { width: 120 }]}
                      placeholder="Nº"
                      placeholderTextColor="var(--text-subtle)"
                      keyboardType="default"
                      value={numero}
                      onChangeText={setNumero}
                      editable={!loading}
                    />

                    <TouchableOpacity
                      style={[styles.submitBtn, loading && styles.disabled]}
                      onPress={submitCEP}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.submitBtnText}>Continuar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {!cepData && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setMode('choose'); setCep(''); }}>
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ---- Mode: Coords ----
  return (
    <View style={[styles.overlay, layout.ehLargo && styles.overlayWeb]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.keyboardView, layout.ehLargo && styles.centroWeb]}
      >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, layout.ehLargo && styles.centroWeb]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.card, layout.ehLargo && styles.cardWeb]}>
              <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => { setMode('choose'); setLatitude(''); setLongitude(''); }}>
                  <IconText Icone={IconArrowBack} style={styles.backBtn} tone="brandText">Voltar</IconText>
                </TouchableOpacity>
              </View>

              <IconText Icone={IconLocation} style={styles.title} tone="onSurface">Cadastro via Coordenadas</IconText>
              <Text style={styles.subtitle}>
                O endereço será preenchido automaticamente
              </Text>

              <Text style={styles.label}>Latitude</Text>
              <TextInput
                style={styles.input}
                placeholder="-23.550520"
                placeholderTextColor="var(--text-subtle)"
                keyboardType="numeric"
                value={latitude}
                onChangeText={setLatitude}
                editable={!loading}
              />

              <Text style={styles.label}>Longitude</Text>
              <TextInput
                style={styles.input}
                placeholder="-46.633308"
                placeholderTextColor="var(--text-subtle)"
                keyboardType="numeric"
                value={longitude}
                onChangeText={setLongitude}
                editable={!loading}
              />

              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.disabled]}
                onPress={submitCoords}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Continuar</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setMode('choose'); setLatitude(''); setLongitude(''); }}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  // Web (>=768): o fluxo vira modal CENTRAL (handoff, tela 12). zIndex acima
  // da sidebar (40) — o overlay absoluto do container passava por baixo dela
  // e o conteudo full-bleed sumia atras da coluna de navegacao.
  overlayWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 60,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  centroWeb: { justifyContent: 'center', alignItems: 'center' },
  cardWeb: {
    width: '100%',
    maxWidth: 640,
    borderRadius: 8,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 25,
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
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  headerRow: {
    marginBottom: 8,
  },
  backBtn: {
    fontSize: 15,
    color: 'var(--brand-text)',
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: 'var(--text)',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginBottom: 16,
  },
  // Options
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'var(--bg)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  optionIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: 'var(--text)',
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 16,
  },
  optionArrow: {
    fontSize: 24,
    color: 'var(--text-subtle)',
    fontWeight: '300',
  },
  // Form
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: 'var(--text-muted)',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'var(--bg)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'var(--border)',
    color: 'var(--text)',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchBtn: {
    backgroundColor: '#C8131B',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  // Result
  resultBox: {
    marginTop: 16,
    backgroundColor: 'var(--tint-green)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'var(--tint-green-border)',
  },
  resultHeader: {
    marginBottom: 8,
  },
  resultHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultAddress: {
    fontSize: 15,
    fontWeight: '600',
    color: 'var(--text)',
    marginBottom: 2,
  },
  resultCity: {
    fontSize: 14,
    color: 'var(--text-muted)',
    marginBottom: 8,
  },
  warningBox: {
    backgroundColor: 'var(--tint-amber)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'var(--tint-amber-border)',
  },
  warningText: {
    fontSize: 13,
    color: 'var(--tint-amber-text)',
    fontWeight: '500',
  },
  // Buttons
  submitBtn: {
    backgroundColor: '#C8131B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelBtnText: {
    color: 'var(--text-muted)',
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
});
