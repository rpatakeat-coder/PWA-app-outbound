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
  IconArrowFoward,
  IconCheck,
  IconClose,
  IconLocation,
  IconText,
  IconWarning,
  useIconColors,
} from '../components/icons';
import { fetchCepData, geocodeStructured, reverseGeocode, GeocodingError } from '../utils/geocoding';
import type { ClientFormData } from '../types/client';

/**
 * Os textos de falha do passo 1 (quadro 1c). Sao os MESMOS de antes, por
 * `kind` do GeocodingError — nao inventei copy nova: o que mudou e' que eles
 * deixaram de sair em `Alert.alert` e passaram a viver na faixa de aviso, com
 * o CEP digitado preservado no campo.
 */
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

type DadosCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  isGeneric: boolean;
};

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
  /**
   * Rehidratacao do passo 1 (M9/B): o `arrow_back` do passo 2 reabre esta tela
   * com o CEP e o endereco JA' resolvidos, sem refazer a busca. Nao mexe no
   * contrato do `onNext` — o App monta isto com os campos que ja' recebe.
   */
  valorInicial?: { cep: string; dados: DadosCep; numero: string } | null;
}

type Mode = 'cep' | 'coords';

export function CEPStep({ onNext, onCancel, onPickOnMap, valorInicial }: CEPStepProps) {
  const layout = useLayout();
  const iconColors = useIconColors();
  // O passo 1 do M9 E' o CEP: a antiga tela "Como deseja cadastrar?" deixou de
  // ser a porta de entrada (ela tornava "Passo 1 de 2" mentira). Os outros dois
  // caminhos continuam alcancaveis daqui — mapa e coordenadas, abaixo do CTA.
  const [mode, setMode] = useState<Mode>('cep');
  const [loading, setLoading] = useState(false);

  // CEP mode state
  const [cep, setCep] = useState(valorInicial?.cep ?? '');
  const [cepData, setCepData] = useState<DadosCep | null>(valorInicial?.dados ?? null);
  const [numero, setNumero] = useState(valorInicial?.numero ?? '');
  const [enderecoManual, setEnderecoManual] = useState('');
  // Erro do passo 1 na TELA, nao em Alert (quadro 1c).
  const [erroCep, setErroCep] = useState<string | null>(null);
  const [campoFocado, setCampoFocado] = useState<string | null>(null);

  // Coords mode state
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  const formatCEP = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 8);
    if (cleaned.length > 5) return cleaned.slice(0, 5) + '-' + cleaned.slice(5);
    return cleaned;
  };

  const cepCompleto = cep.replace(/\D/g, '').length === 8;

  // ---- CEP Flow ----
  const searchCEP = async () => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;

    Keyboard.dismiss();
    setErroCep(null);
    setLoading(true);
    try {
      const result = await fetchCepData(clean);
      if (!result) {
        // Nem ViaCEP nem BrasilAPI acharam.
        setErroCep('CEP não encontrado. Confira os números ou selecione o local no mapa.');
        return;
      }
      setCepData(result);
    } catch (err) {
      // Falha tecnica: rede, timeout, rate limit. Texto por `kind`, o mesmo de
      // antes — so' o lugar mudou.
      setErroCep(geocodingErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitCEP = async () => {
    if (!cepData) return;

    if (cepData.isGeneric && !enderecoManual.trim()) {
      setErroCep('CEP genérico: informe o endereço completo abaixo.');
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
          'Não conseguimos obter coordenadas para esse endereço. Você pode selecionar o local no mapa.',
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

  // Campo padrao do M9: rotulo PERMANENTE em cima, valor embaixo. O
  // placeholder-como-nome sai de vez — ele desaparecia no primeiro caractere e
  // deixava dez caixas iguais sem dizer o que era cada uma.
  const campo = (
    chave: string,
    rotulo: string,
    filho: React.ReactNode,
    opcoes?: { erro?: boolean; direita?: React.ReactNode; estilo?: object },
  ) => (
    <View
      style={[
        estilos.campo,
        campoFocado === chave && estilos.campoFocado,
        opcoes?.erro && estilos.campoErro,
        opcoes?.estilo,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={estilos.campoRotulo}>{rotulo}</Text>
        {filho}
      </View>
      {opcoes?.direita}
    </View>
  );

  // ---- Mode: Coords ----
  // Fora dos quadros do M9 (o handoff desenhou so' o caminho do CEP), entao
  // segue como estava — so' o "Voltar" muda de destino, ja' que a tela de
  // escolha deixou de existir.
  if (mode === 'coords') {
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
                <TouchableOpacity onPress={() => { setMode('cep'); setLatitude(''); setLongitude(''); }}>
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

              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ---- Mode: CEP (passo 1 do M9 — quadros 1a, 1b, 1c) ----
  // Sem TouchableWithoutFeedback+Keyboard.dismiss por volta do conteudo: em
  // navegador touch o wrapper vira responder do toque, cancela o click
  // sintetico e o TextInput nunca recebe foco (nao dava pra digitar no PWA).
  const enderecoResolvido = cepData && !cepData.isGeneric;

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
          <View style={[estilos.folha, layout.ehLargo && styles.cardWeb]}>
            {!layout.ehLargo && <View style={estilos.alca} />}

            <View style={estilos.cabecalho}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={estilos.titulo}>Onde fica o restaurante?</Text>
                <Text style={estilos.subtitulo}>Passo 1 de 2</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                style={estilos.fechar}
                onPress={onCancel}
              >
                <IconClose width={20} height={20} fill={iconColors.muted} />
              </TouchableOpacity>
            </View>

            {/* --- Campo CEP --- */}
            {campo(
              'cep',
              'CEP',
              <TextInput
                style={estilos.campoValor}
                placeholder="00000-000"
                placeholderTextColor="var(--text-subtle)"
                keyboardType="numeric"
                value={cep}
                onChangeText={v => { setCep(formatCEP(v)); setErroCep(null); }}
                onFocus={() => setCampoFocado('cep')}
                onBlur={() => setCampoFocado(null)}
                editable={!loading}
                returnKeyType="search"
                onSubmitEditing={searchCEP}
              />,
              {
                erro: !!erroCep,
                direita: cepData
                  ? <IconCheck width={20} height={20} fill={iconColors.tintGreenText} />
                  : erroCep
                    ? <IconWarning width={20} height={20} fill={iconColors.tintRedText} />
                    : undefined,
              },
            )}

            {/* --- 1c: faixa de aviso. Mesmo layout pros tres casos; so' o
                    texto muda, e o CEP digitado fica no campo. --- */}
            {erroCep && (
              <View style={estilos.faixaAviso}>
                <Text style={estilos.faixaAvisoTexto}>{erroCep}</Text>
              </View>
            )}

            {/* --- 1b: cartao do endereco resolvido --- */}
            {cepData && (
              <View style={estilos.cartaoEndereco}>
                <View style={estilos.cartaoLinha}>
                  <IconLocation width={24} height={24} fill={iconColors.tintGreenText} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={estilos.cartaoKicker}>ENDEREÇO ENCONTRADO</Text>
                    {enderecoResolvido && (
                      <Text style={estilos.cartaoRua} numberOfLines={2}>{cepData.logradouro}</Text>
                    )}
                    <Text style={estilos.cartaoDetalhe} numberOfLines={2}>
                      {[cepData.bairro, cepData.cidade, cepData.estado].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={estilos.cartaoRodape}
                  onPress={onPickOnMap}
                  disabled={!onPickOnMap}
                >
                  <Text style={estilos.cartaoRodapeTexto}>Não é aqui? Selecione no mapa.</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* CEP generico (sem logradouro nas duas bases): a rua vem a mao. */}
            {cepData?.isGeneric && campo(
              'enderecoManual',
              'Endereço completo *',
              <TextInput
                style={estilos.campoValor}
                placeholder="Rua, Avenida..."
                placeholderTextColor="var(--text-subtle)"
                value={enderecoManual}
                onChangeText={v => { setEnderecoManual(v); setErroCep(null); }}
                onFocus={() => setCampoFocado('enderecoManual')}
                onBlur={() => setCampoFocado(null)}
                editable={!loading}
              />,
            )}

            {/* Numero. Sem ele o CTA continua ativo — o lead entra e o flag de
                aproximado, que vem do geocoder, decide o resto. */}
            {cepData && campo(
              'numero',
              'Número',
              <TextInput
                style={estilos.campoValor}
                placeholder="Ex.: 1086"
                placeholderTextColor="var(--text-subtle)"
                keyboardType="default"
                value={numero}
                onChangeText={setNumero}
                onFocus={() => setCampoFocado('numero')}
                onBlur={() => setCampoFocado(null)}
                editable={!loading}
              />,
            )}

            {/* --- CTA: o estado da tela decide qual --- */}
            {cepData ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={[estilos.ctaPrimario, loading && styles.disabled]}
                onPress={submitCEP}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View style={estilos.ctaLinha}>
                    <Text style={estilos.ctaPrimarioTexto}>Continuar</Text>
                    <IconArrowFoward width={20} height={20} fill="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            ) : erroCep && onPickOnMap ? (
              <>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={estilos.ctaPrimario}
                  onPress={onPickOnMap}
                >
                  {/* Sem icone de proposito: o kit nao tem `map`, e reusar o
                      `location_on` do cartao de endereco aqui faria o mesmo
                      desenho dizer "este e' o endereco" e "va' pro mapa". O
                      rotulo sozinho nao tem essa ambiguidade. */}
                  <Text style={estilos.ctaPrimarioTexto}>Selecionar no mapa</Text>
                </TouchableOpacity>
                <Text style={estilos.notaCta}>
                  Arraste o mapa até o local exato. Endereço e CEP são preenchidos automaticamente.
                </Text>
              </>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                style={[estilos.ctaPrimario, !cepCompleto && estilos.ctaDesabilitado]}
                onPress={searchCEP}
                disabled={!cepCompleto || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[estilos.ctaPrimarioTexto, !cepCompleto && estilos.ctaTextoDesabilitado]}>
                    Buscar CEP
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Os outros dois caminhos de cadastro. A tela de escolha saiu, mas
                nenhum deles ficou inalcancavel. */}
            {!cepData && (
              <View style={estilos.alternativas}>
                {onPickOnMap && !erroCep && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={estilos.alternativa}
                    onPress={onPickOnMap}
                  >
                    <Text style={estilos.alternativaTexto}>Selecionar no mapa</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  accessibilityRole="button"
                  style={estilos.alternativa}
                  onPress={() => setMode('coords')}
                >
                  <Text style={estilos.alternativaTexto}>Usar coordenadas</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ===== Estilos do M9 (passo 1) =====
const estilos = StyleSheet.create({
  folha: {
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '92%',
  },
  alca: {
    width: 36,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'var(--stroke-default)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  titulo: { fontSize: 18, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: 'var(--text)' },
  subtitulo: { marginTop: 2, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: 'var(--text-faint)' },
  fechar: { width: 48, height: 48, marginTop: -12, marginRight: -12, alignItems: 'center', justifyContent: 'center' },

  // Campo padrao do M9: rotulo permanente + valor. `--surface-2` e' o
  // "nested" do desenho; o kit nao tem `--surface-nested`.
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'var(--surface-2)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    marginBottom: 8,
  },
  campoFocado: { borderColor: 'var(--stroke-strong)' },
  campoErro: { borderColor: '#C8131B' },
  campoRotulo: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, color: 'var(--text-faint)' },
  campoValor: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.15,
    fontWeight: '500',
    color: 'var(--text)',
    padding: 0,
    // O RNW da' altura de linha propria ao input; sem isto o campo pula de 56.
    minHeight: 24,
  },

  // 1c — faixa de aviso. `--tint-amber` e' o `--tint-warn` do desenho.
  faixaAviso: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: 'var(--tint-amber)',
    borderWidth: 1,
    borderColor: 'var(--tint-amber-border)',
  },
  faixaAvisoTexto: { fontSize: 12, lineHeight: 18, color: 'var(--tint-amber-text)' },

  // 1b — cartao do endereco resolvido.
  cartaoEndereco: {
    borderRadius: 16,
    backgroundColor: 'var(--surface-2)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    marginBottom: 8,
  },
  cartaoLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  cartaoKicker: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1,
    fontWeight: '700',
    color: 'var(--tint-green-text)',
  },
  cartaoRua: { marginTop: 4, fontSize: 16, lineHeight: 24, fontWeight: '600', color: 'var(--text)' },
  cartaoDetalhe: { marginTop: 2, fontSize: 12, lineHeight: 18, letterSpacing: 0.4, color: 'var(--text-muted)' },
  cartaoRodape: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'var(--border)',
  },
  cartaoRodapeTexto: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: 'var(--tint-red-text)' },

  // CTA
  ctaPrimario: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#C8131B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ctaLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaPrimarioTexto: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '600', color: '#FFFFFF' },
  // `--surface-3` e' o "sunken" do desenho.
  ctaDesabilitado: { backgroundColor: 'var(--surface-3)' },
  ctaTextoDesabilitado: { color: 'var(--text-disabled)' },
  notaCta: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: 'var(--text-faint)',
    textAlign: 'center',
  },

  alternativas: { marginTop: 8 },
  alternativa: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  alternativaTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--tint-red-text)' },
});

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
    // Canto a canto de proposito: `card` declara borderTopLeftRadius/Right 20
    // (o raio da folha do celular), que e' mais especifico que `borderRadius` e
    // vencia aqui — o modal do desktop nascia com 20/20/8/8.
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    padding: 24,
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
