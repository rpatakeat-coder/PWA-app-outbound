import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, type MapPressEvent, PROVIDER_DEFAULT } from 'react-native-maps';
import type { Client } from '../types/client';
import { distanceMeters } from '../hooks/useFieldOps';
import { reverseGeocode } from '../utils/geocoding';

interface Props {
  client: Client;
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

export function EditLocationModal({ client, onSave, onClose }: Props) {
  // Posicao ATUAL do cliente (pino cinza, fixo). Se por acaso nao tiver coords,
  // cai num default (centro do Brasil) so pra o mapa abrir.
  const currentLat = client.latitude ?? -14.235;
  const currentLng = client.longitude ?? -51.925;

  // Posicao NOVA (pino colorido, arrastavel). Comeca em cima da atual.
  const [newPos, setNewPos] = useState({ latitude: currentLat, longitude: currentLng });
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<MapView | null>(null);

  const distance = useMemo(
    () => distanceMeters(currentLat, currentLng, newPos.latitude, newPos.longitude),
    [currentLat, currentLng, newPos],
  );
  const moved = distance > 0;

  const onDragEnd = (lat: number, lng: number) => setNewPos({ latitude: lat, longitude: lng });

  // Tocar no mapa tambem reposiciona o pin novo (alem de arrastar).
  const onMapPress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setNewPos({ latitude, longitude });
  };

  const recenterOnCurrent = () => {
    mapRef.current?.animateToRegion({
      latitude: currentLat, longitude: currentLng,
      latitudeDelta: 0.01, longitudeDelta: 0.01,
    }, 400);
    setNewPos({ latitude: currentLat, longitude: currentLng });
  };

  const handleSave = async () => {
    if (saving) return;
    if (!moved) {
      Alert.alert('Sem alteração', 'Arraste o pino vermelho para o novo local antes de salvar.');
      return;
    }
    setSaving(true);
    // Tenta preencher endereco pela nova coord (best-effort — nao bloqueia).
    let addr: Awaited<ReturnType<typeof reverseGeocode>> | null = null;
    try {
      addr = await reverseGeocode(newPos.latitude, newPos.longitude);
    } catch (err: any) {
      console.warn('[EditLocation] reverseGeocode falhou:', err?.message ?? err);
    }
    try {
      await onSave({
        latitude: newPos.latitude,
        longitude: newPos.longitude,
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
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>📍 Editar localização</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{clientName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={saving}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Arraste o pino <Text style={{ color: '#dc2626', fontWeight: '800' }}>vermelho</Text> (ou
            toque no mapa) até o local certo. O pino{' '}
            <Text style={{ color: '#64748b', fontWeight: '800' }}>cinza</Text> mostra onde está hoje.
          </Text>

          <View style={styles.mapWrap}>
            <MapView
              ref={(r) => { mapRef.current = r; }}
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: currentLat, longitude: currentLng,
                latitudeDelta: 0.008, longitudeDelta: 0.008,
              }}
              onPress={onMapPress}
              showsUserLocation
            >
              {/* Posicao atual — cinza, fixa (nao arrastavel). */}
              <Marker
                coordinate={{ latitude: currentLat, longitude: currentLng }}
                pinColor="#94a3b8"
                title="Local atual"
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={false}
              />
              {/* Posicao nova — vermelha, arrastavel. */}
              <Marker
                coordinate={newPos}
                pinColor="#dc2626"
                draggable
                onDragEnd={(e) =>
                  onDragEnd(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
                }
                title="Novo local"
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={false}
              />
            </MapView>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoText}>
              {moved
                ? `Distância do local atual: ${fmtDistance(distance)}`
                : 'Pino novo em cima do atual — arraste para mover.'}
            </Text>
            {moved && (
              <TouchableOpacity onPress={recenterOnCurrent} disabled={saving}>
                <Text style={styles.resetLink}>Voltar ao atual</Text>
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, maxHeight: '90%',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 1 },
  close: { fontSize: 22, color: '#94a3b8', paddingHorizontal: 4 },
  hint: { fontSize: 12, color: '#64748b', marginVertical: 8, lineHeight: 17 },
  mapWrap: {
    height: 340, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#eef2f7',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, marginBottom: 4, gap: 8,
  },
  infoText: { flex: 1, fontSize: 12, color: '#475569', fontWeight: '600' },
  resetLink: { fontSize: 12, color: '#2563eb', fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 10,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  cancelBtnText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
});
