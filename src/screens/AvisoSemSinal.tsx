// Pílula de conexão do app de campo (handoff v4.1 §6.18 e §9): "sem sinal não
// é erro". Sem rede, ou com registros ainda na fila, uma pílula amarela sob o
// topo diz quantos estão esperando — e que sobem sozinhos. Nada trava.
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { itensDaFila, ouvirFila, type ItemFila } from '../utils/filaOffline';

export default function AvisoSemSinal() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [fila, setFila] = useState<ItemFila[]>(() => itensDaFila());
  useEffect(() => ouvirFila(setFila), []);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const esperando = fila.filter((i) => i.estado === 'na_fila').length;
  if (online && esperando === 0) return null;
  const texto = !online
    ? `Sem sinal${esperando ? ` · ${esperando} ${esperando === 1 ? 'registro' : 'registros'} na fila ↑` : ''} · sobem sozinhos`
    : `${esperando} ${esperando === 1 ? 'registro subindo' : 'registros subindo'} ↑`;
  return (
    <View style={s.pilula} accessibilityRole="alert">
      <Text style={s.texto} numberOfLines={1}>{texto}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pilula: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#3A2A06', borderWidth: 1, borderColor: '#F5A524' },
  texto: { fontSize: 12, fontWeight: '600', color: '#FDE68A' },
});
