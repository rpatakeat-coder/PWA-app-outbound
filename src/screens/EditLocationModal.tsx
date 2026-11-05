import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Alert } from '../components/Alert';
import { useLayout } from '../hooks/useLayout';
import {
  IconClose,
  IconLocation,
  IconText,
  useIconColors,
} from '../components/icons';
import MapView, { Marker, type Region, type MapViewHandle, PROVIDER_DEFAULT } from '../map';
import type { Client } from '../types/client';
import { distanceMeters } from '../hooks/useFieldOps';
import { geocodeAddress, reverseGeocode } from '../utils/geocoding';
import { leituraRecente, ouvirLeituras, type LeituraDoGps } from '../map/leituraDoGps';

interface Props {
  client: Client;
  /** Onde abrir o mapa. O "Mover pino" do Cheguei passa a posição da pessoa: ela está na porta, e o pino
   *  errado pode estar a quilômetros (vídeo do executivo, 05/11/26: pino a 9,2 km, arrastar no olho). */
  abrirEm?: { latitude: number; longitude: number } | null;
  // Salva a nova localizacao. Recebe as coords + endereco resolvido pelo
  // reverse-geocode (pode vir parcial/vazio se o reverse falhar).
  onSave: (payload: {
    latitude: number;
    longitude: number;
    endereco?: string;
    numero?: string | null;
    bairro?: string | null;
    cep?: string;
    cidade?: string;
    estado?: string;
  }) => Promise<void>;
  onClose: () => void;
}

// Formata distancia curta: metros ate 1km, senao km com 1 casa.
function fmtDistance(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function EditLocationModal({ client, abrirEm, onSave, onClose }: Props) {
  const layout = useLayout();
  /* O MAPA ENCOLHE EM TELA BAIXA (05/11/26): com os atalhos novos, num computador de 695 px de altura o
     Cancelar caía para fora do cartão. O resto da folha ocupa ~410 px; o mapa fica com o que sobra dos
     88% da tela, entre 170 e 280 px. */
  const { height: alturaTela } = useWindowDimensions();
  const alturaMapa = Math.round(Math.max(170, Math.min(280, alturaTela * 0.88 - 410)));
  const iconColors = useIconColors();
  // Posicao ATUAL do cliente (pino cinza, fixo). Se por acaso nao tiver coords,
  // cai num default (centro do Brasil) so pra o mapa abrir.
  const currentLat = client.latitude ?? -14.235;
  const currentLng = client.longitude ?? -51.925;

  // Posicao NOVA = CENTRO do mapa (mesmo mecanismo do cadastro). O usuario faz
  // pan no mapa; uma mira fixa desenhada no centro aponta o novo local. O valor
  // e capturado no onRegionChangeComplete (assentamento final do mapa).
  const inicio = abrirEm ?? { latitude: currentLat, longitude: currentLng };
  const [center, setCenter] = useState(inicio);
  /* ONDE A PESSOA ESTÁ (05/11/26): a última leitura do GPS do mapa, e as próximas. Com ela, um toque leva
     o mapa até ela, em vez de procurar o lugar no olho. */
  const [gps, setGps] = useState<LeituraDoGps | null>(() => leituraRecente(5 * 60000, 300));
  useEffect(() => ouvirLeituras((l) => { if (l.accuracy > 0 && l.accuracy <= 300) setGps(l); }), []);
  /* ou o endereço digitado: a mesma busca do cadastro (Nominatim), perto da cidade do lead */
  const [endereco, setEndereco] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [avisoBusca, setAvisoBusca] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<MapViewHandle | null>(null);

  const distance = useMemo(
    () => distanceMeters(currentLat, currentLng, center.latitude, center.longitude),
    [currentLat, currentLng, center],
  );
  const moved = distance > 0;

  const onRegionChangeComplete = (region: Region) => {
    setCenter({ latitude: region.latitude, longitude: region.longitude });
  };

  const irPara = (lat: number, lng: number) => {
    mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 400);
  };
  const irParaMim = () => { if (gps) irPara(gps.latitude, gps.longitude); };
  const buscarEndereco = async () => {
    const q = endereco.trim();
    if (q.length < 4 || buscando) return;
    setBuscando(true); setAvisoBusca(null);
    try {
      const cidade = [client.cidade, client.estado].filter(Boolean).join(', ');
      const achou = (cidade && !q.toLowerCase().includes(String(client.cidade ?? '').toLowerCase())
        ? await geocodeAddress(`${q}, ${cidade}`) : null) ?? await geocodeAddress(q);
      if (!achou) { setAvisoBusca('Não achei esse endereço. Confira a rua e o número, ou use "Estou no local".'); return; }
      irPara(achou.latitude, achou.longitude);
      setAvisoBusca(achou.approximate ? 'Achei a rua, não o número exato: ajuste o pino em cima da porta.' : null);
    } catch {
      setAvisoBusca('A busca de endereço não respondeu. Tente de novo ou use "Estou no local".');
    } finally { setBuscando(false); }
  };

  const recenterOnCurrent = () => {
    mapRef.current?.animateToRegion({
      latitude: currentLat, longitude: currentLng,
      latitudeDelta: 0.008, longitudeDelta: 0.008,
    }, 400);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!moved) {
      Alert.alert('Sem alteração', 'Mova o mapa até o novo local (a mira central marca o ponto) antes de salvar.');
      return;
    }
    setSaving(true);
    // Tenta preencher endereco pela nova coord (best-effort — nao bloqueia).
    let addr: Awaited<ReturnType<typeof reverseGeocode>> | null = null;
    try {
      addr = await reverseGeocode(center.latitude, center.longitude);
    } catch (err: any) {
      console.warn('[EditLocation] reverseGeocode falhou:', err?.message ?? err);
    }
    try {
      await onSave({
        latitude: center.latitude,
        longitude: center.longitude,
        endereco: addr?.endereco || undefined,
        numero: addr?.numero || null,
        bairro: addr?.bairro || null,
        cep: addr?.cep ? `${addr.cep.slice(0, 5)}-${addr.cep.slice(5)}` : undefined,
        cidade: addr?.cidade || undefined,
        estado: addr?.estado || undefined,
      });
      onClose();
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err?.message || 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const clientName = client.empresa?.trim() || client.nome?.trim() || 'Cliente';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, layout.ehLargo && styles.overlayCentralWeb]}>
        <View style={[styles.sheet, layout.ehLargo && styles.cartaoCentralWeb]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <IconText Icone={IconLocation} style={styles.title} tone="onSurface">Editar localização</IconText>
              <Text style={styles.subtitle} numberOfLines={1}>{clientName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={saving} accessibilityRole="button" accessibilityLabel="Fechar" style={{ padding: 12, margin: -12 }}>
              <IconClose width={20} height={20} fill={iconColors.muted} />
            </TouchableOpacity>
          </View>

          {/* os dois atalhos antes do mapa: onde estou, ou o endereço digitado */}
          <View style={styles.atalhos}>
            <TouchableOpacity
              style={[styles.btAqui, !gps && styles.btAquiOff]}
              onPress={irParaMim}
              disabled={!gps || saving}
              accessibilityRole="button"
              accessibilityLabel="Estou no local: levar o mapa até a minha posição"
            >
              <IconLocation width={16} height={16} fill="#fff" />
              <Text style={styles.btAquiTx}>{gps ? `Estou no local (±${Math.round(gps.accuracy)} m)` : 'Esperando o GPS…'}</Text>
            </TouchableOpacity>
            <View style={styles.buscaLinha}>
              <TextInput
                style={styles.buscaInput}
                value={endereco}
                onChangeText={(v) => { setEndereco(v); setAvisoBusca(null); }}
                placeholder="ou digite o endereço: rua e número"
                placeholderTextColor="#8B919C"
                returnKeyType="search"
                onSubmitEditing={buscarEndereco}
                editable={!saving}
              />
              <TouchableOpacity style={styles.btBuscar} onPress={buscarEndereco} disabled={buscando || saving || endereco.trim().length < 4} accessibilityRole="button">
                {buscando ? <ActivityIndicator size="small" color="var(--text)" /> : <Text style={styles.btBuscarTx}>Buscar</Text>}
              </TouchableOpacity>
            </View>
            {!!avisoBusca && <Text style={styles.avisoBusca}>{avisoBusca}</Text>}
          </View>

          <Text style={styles.hint}>
            Mova o mapa até o local certo — o{' '}
            <Text style={{ color: 'var(--brand-text)', fontWeight: '800' }}>pino central</Text> marca a nova
            posição. O pino <Text style={{ color: 'var(--text-muted)', fontWeight: '800' }}>cinza</Text> mostra
            onde está hoje.
          </Text>

          <View style={[styles.mapWrap, { height: alturaMapa }]}>
            <MapView
              ref={(r) => { mapRef.current = r; }}
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: inicio.latitude, longitude: inicio.longitude,
                latitudeDelta: abrirEm ? 0.004 : 0.008, longitudeDelta: abrirEm ? 0.004 : 0.008,
              }}
              onRegionChangeComplete={onRegionChangeComplete}
              showsUserLocation
            >
              {/* Posicao atual — cinza, fixa (Marker real ancorado na coord). */}
              <Marker
                coordinate={{ latitude: currentLat, longitude: currentLng }}
                pinColor="#94a3b8"
                title="Local atual"
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={false}
              />
            </MapView>

            {/* Mira/pin fixo desenhado no CENTRO do mapa = novo local. Igual ao
                cadastro: a coordenada capturada e o centro do MapView. */}
            <View pointerEvents="none" style={styles.centerPinWrap}>
              <View style={styles.centerPin}>
                <Image source={require('../../assets/icon.png')} style={styles.centerPinLogo} fadeDuration={0} />
              </View>
              <View style={styles.centerPinArrow} />
              <View style={styles.centerDot} />
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoText}>
              {moved
                ? `A ${fmtDistance(distance)} do pino antigo`
                : 'Mapa sobre o pino antigo — mova para reposicionar.'}
            </Text>
            {moved && (
              <TouchableOpacity onPress={recenterOnCurrent} disabled={saving}>
                <Text style={styles.resetLink}>Ver o pino antigo</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (!moved || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!moved || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Salvar nova localização</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const PIN_W = 36;
const PIN_H = 36;
const ARROW = 8;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  // Web: cartao central em vez de bottom sheet (mesma correcao do resto).
  overlayCentralWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  cartaoCentralWeb: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 8,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 25,
  },
  sheet: {
    backgroundColor: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, maxHeight: '90%',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', color: 'var(--text)' },
  subtitle: { fontSize: 13, color: 'var(--text-muted)', marginTop: 1 },
  close: { fontSize: 22, color: 'var(--text-subtle)', paddingHorizontal: 4 },
  atalhos: { gap: 8, marginTop: 6 },
  btAqui: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44,
    borderRadius: 12, backgroundColor: '#2563EB', paddingHorizontal: 12,
  },
  btAquiOff: { opacity: 0.5 },
  btAquiTx: { color: '#fff', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  buscaLinha: { flexDirection: 'row', gap: 8 },
  buscaInput: {
    flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)',
    backgroundColor: 'var(--surface-2)', paddingHorizontal: 12, fontSize: 14, color: 'var(--text)',
  },
  btBuscar: {
    minHeight: 44, minWidth: 76, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
  },
  btBuscarTx: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  avisoBusca: { fontSize: 12, color: 'var(--warning-text, #92400E)', lineHeight: 17 },
  hint: { fontSize: 12, color: 'var(--text-muted)', marginVertical: 8, lineHeight: 17 },
  mapWrap: {
    height: 280, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)',
    justifyContent: 'center', alignItems: 'center',
  },
  // Conjunto pin+seta+dot centrado no meio do mapWrap. O translateY sobe o
  // grupo pra ponta da seta (e o dot) caírem no centro EXATO do mapa.
  centerPinWrap: {
    position: 'absolute', alignItems: 'center',
    transform: [{ translateY: -(PIN_H + ARROW) / 2 }],
  },
  centerPin: {
    width: PIN_W, height: PIN_H, borderRadius: PIN_W / 2, backgroundColor: 'var(--vermelho-acao)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  centerPinLogo: { width: 22, height: 22, borderRadius: 11 },
  centerPinArrow: {
    width: 0, height: 0, backgroundColor: 'transparent',
    borderLeftWidth: ARROW, borderRightWidth: ARROW, borderTopWidth: ARROW,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#C8131B',
    marginTop: -1,
  },
  centerDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: 'var(--vermelho-acao)',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, marginBottom: 4, gap: 8,
  },
  infoText: { flex: 1, fontSize: 12, color: 'var(--text-muted)', fontWeight: '600' },
  resetLink: { fontSize: 12, color: 'var(--info-text)', fontWeight: '700' },
  saveBtn: {
    backgroundColor: 'var(--vermelho-acao)', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 10,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  cancelBtnText: { color: 'var(--text-muted)', fontSize: 14, fontWeight: '600' },
});
