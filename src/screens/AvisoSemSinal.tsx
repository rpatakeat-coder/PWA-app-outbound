// Pílula de conexão do app de campo (handoff v4.1 §6.18 e §9): "sem sinal não é erro".
//
// Prancha "Mapa do Executivo" (§8, 15/10/26): sem rede, a faixa âmbar abaixo das lentes diz
// desde quando o mapa está salvo e quantos check-ins esperam o sinal (o ↑ vai no pino) — e que
// sobem sozinhos. Com rede e fila subindo, só a contagem. Nada trava: o Cheguei grava no celular.
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { itensDaFila, ouvirFila, type ItemFila } from '../utils/filaOffline';

/** A última vez que o aparelho esteve com sinal: é a hora do mapa salvo. */
let ultimaComSinal = Date.now();

/** true/false do navigator, ouvindo online/offline (a folha usa para a nota do Cheguei). */
export function useComSinal(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => { ultimaComSinal = Date.now(); setOnline(true); };
    const off = () => { ultimaComSinal = Date.now(); setOnline(false); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) ultimaComSinal = Date.now();
  return online;
}

export default function AvisoSemSinal() {
  const online = useComSinal();
  const [fila, setFila] = useState<ItemFila[]>(() => itensDaFila());
  useEffect(() => ouvirFila(setFila), []);

  const esperando = fila.filter((i) => i.estado === 'na_fila').length;
  if (online && esperando === 0) return null;
  if (online) {
    return (
      <View style={s.pilula} accessibilityRole="alert">
        <Text style={s.texto} numberOfLines={1}>{`${esperando} ${esperando === 1 ? 'registro subindo' : 'registros subindo'} ↑`}</Text>
      </View>
    );
  }
  const hora = new Date(ultimaComSinal).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return (
    <View style={s.faixa} accessibilityRole="alert">
      <Text style={s.titulo} numberOfLines={1}>{`Sem sinal · mapa salvo às ${hora}`}</Text>
      <Text style={s.texto} numberOfLines={2}>
        {esperando ? `${esperando} ${esperando === 1 ? 'check-in esperando' : 'check-ins esperando'} (↑). Envia sozinho quando voltar.` : 'O que você registrar fica no celular e sobe sozinho quando voltar.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  // A2 (handoff v6): o fundo era hex do escuro; agora a tinta âmbar do tema, par do texto
  pilula: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: 'var(--tint-amber)', borderWidth: 1, borderColor: 'var(--tint-amber-border)' },
  faixa: { alignSelf: 'stretch', marginHorizontal: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: 'var(--tint-amber)', borderWidth: 1, borderColor: 'var(--tint-amber-border)', gap: 2 },
  titulo: { fontSize: 13, fontWeight: '700', color: 'var(--tint-amber-text)' },
  texto: { fontSize: 12, fontWeight: '600', color: 'var(--tint-amber-text)' },
});
