// Toast de sincronização + faixa da fila offline (mapa novo, entrega 1).
//
// Mesmo desenho do Alert: um objeto global (`Toast.mostrar`) que qualquer
// ponto do app chama, e um Host montado UMA vez na raiz do App.tsx, fora do
// MainApp, para continuar vivo quando a tela que disparou desmonta.
//
// A faixa âmbar mostra a fila de src/utils/filaOffline.ts: "Sem sinal · N na
// fila" enquanto houver item esperando, e vermelha com "Tentar" quando algum
// falhou. Nada se perde sem sinal: toda escrita está em "subiu" (toast verde),
// "na fila" (faixa âmbar) ou "falhou" (faixa vermelha).
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { descartar, ouvirFila, subirFila, type ItemFila } from '../utils/filaOffline';

export type TipoToast = 'ok' | 'fila' | 'erro';

type Pedido = {
  id: number;
  texto: string;
  tipo: TipoToast;
  acao?: { rotulo: string; onPress: () => void };
  duracaoMs: number;
};

let atual: Pedido | null = null;
let notificar: (() => void) | null = null;
let proximoId = 1;

export const Toast = {
  mostrar(texto: string, tipo: TipoToast = 'ok', acao?: Pedido['acao']) {
    atual = { id: proximoId++, texto, tipo, acao, duracaoMs: acao ? 5000 : 3500 };
    notificar?.();
  },
};

// position: fixed só existe no web; no nativo o absolute na raiz faz o mesmo.
const FIXO = (Platform.OS === 'web' ? 'fixed' : 'absolute') as ViewStyle['position'];

function hora(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  } catch {
    return '';
  }
}

export function ToastHost() {
  const [, render] = useState(0);
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const [verFila, setVerFila] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    notificar = () => render((n) => n + 1);
    return () => { notificar = null; };
  }, []);

  useEffect(() => ouvirFila(setFila), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const pedido = atual;
  useEffect(() => {
    if (!pedido) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (atual?.id === pedido.id) { atual = null; render((n) => n + 1); } }, pedido.duracaoMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [pedido?.id]);

  const naFila = fila.filter((i) => i.estado === 'na_fila');
  const falhas = fila.filter((i) => i.estado === 'falhou');
  const temFaixa = naFila.length > 0 || falhas.length > 0;
  const maisAntigo = fila[0]?.criadoEm;

  const tentar = async () => {
    const n = await subirFila(true);
    if (n > 0) Toast.mostrar(`✓ ${n === 1 ? '1 item enviado' : `${n} itens enviados`} · HubSpot + Cockpit`, 'ok');
  };

  return (
    <>
      {temFaixa && (
        <View style={[styles.faixa, { position: FIXO }, falhas.length ? styles.faixaErro : styles.faixaFila]} accessibilityRole="alert">
          <Pressable style={styles.faixaLinha} onPress={() => setVerFila((v) => !v)} accessibilityLabel="Ver a fila de sincronização">
            <Text style={[styles.faixaTexto, falhas.length ? styles.textoErro : styles.textoFila]} numberOfLines={1}>
              {falhas.length
                ? `${falhas.length} não ${falhas.length === 1 ? 'subiu' : 'subiram'}${naFila.length ? ` · ${naFila.length} na fila` : ''}`
                : `${online ? 'Enviando' : 'Sem sinal'} · ${naFila.length} na fila${maisAntigo ? ` · desde ${hora(maisAntigo)}` : ''}`}
            </Text>
            <Text style={[styles.faixaAcao, falhas.length ? styles.textoErro : styles.textoFila]}>{verFila ? 'Fechar' : 'Ver fila'}</Text>
          </Pressable>
          {verFila && (
            <View style={styles.lista}>
              {fila.map((i) => (
                <View key={i.acaoId} style={styles.item}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemRotulo} numberOfLines={1}>{i.rotulo}</Text>
                    <Text style={styles.itemDetalhe} numberOfLines={2}>
                      {i.estado === 'falhou' ? `Falhou: ${i.erro ?? 'erro desconhecido'}` : `Na fila desde ${hora(i.criadoEm)}`}
                    </Text>
                  </View>
                  {i.estado === 'falhou' && (
                    <Pressable onPress={() => void descartar(i.acaoId)} style={styles.itemBotao} accessibilityLabel={`Descartar ${i.rotulo}`}>
                      <Text style={styles.itemBotaoTexto}>Descartar</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable onPress={() => void tentar()} style={styles.tentar} accessibilityLabel="Tentar enviar a fila agora">
                <Text style={styles.tentarTexto}>Tentar agora</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      {pedido && (
        <View style={[styles.toast, { position: FIXO }, pedido.tipo === 'erro' ? styles.toastErro : pedido.tipo === 'fila' ? styles.toastFila : styles.toastOk]}
          accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.toastTexto} numberOfLines={2}>{pedido.texto}</Text>
          {pedido.acao && (
            <Pressable onPress={() => { const a = pedido.acao; atual = null; render((n) => n + 1); a?.onPress(); }} style={styles.toastBotao}>
              <Text style={styles.toastBotaoTexto}>{pedido.acao.rotulo}</Text>
            </Pressable>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  faixa: {
    top: 0, left: 0, right: 0, zIndex: 9000,
    paddingTop: 'max(8px, env(safe-area-inset-top))' as unknown as number,
    paddingHorizontal: 16, paddingBottom: 8,
    borderBottomWidth: 1,
  },
  faixaFila: { backgroundColor: 'var(--tint-amber)', borderColor: 'var(--tint-amber-border)', borderStyle: 'dashed' },
  faixaErro: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  faixaLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  faixaTexto: { flex: 1, fontSize: 13, fontWeight: '700' },
  faixaAcao: { fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  textoFila: { color: 'var(--tint-amber-text)' },
  textoErro: { color: 'var(--tint-red-text)' },
  lista: { marginTop: 6, gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'var(--surface)', borderRadius: 8, padding: 10 },
  itemRotulo: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  itemDetalhe: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  itemBotao: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  itemBotaoTexto: { fontSize: 13, fontWeight: '700', color: 'var(--brand-text)' },
  tentar: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'var(--surface)' },
  tentarTexto: { fontSize: 14, fontWeight: '800', color: 'var(--text)' },
  toast: {
    left: 16, right: 16, zIndex: 9001,
    bottom: 'calc(88px + env(safe-area-inset-bottom))' as unknown as number,
    maxWidth: 480, alignSelf: 'center', marginHorizontal: 'auto' as unknown as number,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  toastOk: { backgroundColor: 'var(--tint-green)', borderColor: 'var(--tint-green-border)' },
  toastFila: { backgroundColor: 'var(--tint-amber)', borderColor: 'var(--tint-amber-border)' },
  toastErro: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  toastTexto: { flex: 1, fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  toastBotao: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  toastBotaoTexto: { fontSize: 14, fontWeight: '800', color: 'var(--info-text)' },
});
