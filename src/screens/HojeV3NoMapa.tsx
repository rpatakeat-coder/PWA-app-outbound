// O DIA NO MAPA (Hoje v3, handoff de 01/11/26, README §4.2 e §4.4). O mapa real não muda: lentes, pinos e
// rota ficam como estão. Entram só estas peças, por cima dele:
//
//   PilulaPlacar   no topo, no lugar da faixa da vez (a LinhaDoDia "pendente" ganha dela, como ganha de
//                  tudo: é o único estado com verbo e prazo). 48 px, raio 24. À esquerda, o círculo com
//                  as visitas COM PROVA (vermelho; verde quando bate a meta); linha 1 "4 de 6 com prova ·
//                  2 sem prova · 37 pts na semana", linha 2 "faltam 10 para passar o 2º · sequência 5
//                  dias". No feriado, "Feriado · sem expediente". Depois das 17h, com porta feita e o dia
//                  aberto, ganha o "fechar o dia" (o fecho não depende mais de o app voltar para a frente).
//   ToastPosVisita depois do Cheguei (+3 pts, 1,4 s, e a ficha abre), depois da ficha com passo (2,6 s) e
//                  sem passo (fica até a ação: os chips amanhã · sex 13 · seg 16 · depois). É aqui que o
//                  "sem próximo passo" morre: 1 toque vira tarefa no HubSpot.
// Os textos vêm de _compartilhado/hojeV3.ts (os mesmos do Cockpit). Toque ≥ 44 px; com
// prefers-reduced-motion, sem animação.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconCheck, IconWarning, useIconColors } from '../components/icons';
import type { VMDia } from '../../supabase/functions/_compartilhado/hojeV3';
import { useReduzirMovimento } from '../hooks/useDesenvolvimento';
import { FAIXA_TOPO } from '../map/conferenciaNaTela';

export function PilulaPlacar({ pilula, top, fecharDia, aoTocar }: {
  pilula: VMDia['pilula']; top: number; fecharDia: (() => void) | null; aoTocar: () => void;
}) {
  const fundo = pilula.tom === 'ok' ? 'var(--verde-acao)' : pilula.tom === 'acao' ? 'var(--vermelho-acao)' : 'var(--surface-3)';
  const tinta = pilula.tom === 'mute' ? 'var(--text-muted)' : '#FFFFFF';
  return (
    <View style={[s.pilulaLugar, { top }]} pointerEvents="box-none">
      <View style={s.pilula} {...FAIXA_TOPO}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${pilula.l1}. ${pilula.l2}. Abrir o Meu desempenho`} onPress={aoTocar} style={s.pilulaToque}>
          <View style={[s.circulo, { backgroundColor: fundo }]}><Text style={[s.circuloN, { color: tinta }]}>{pilula.n}</Text></View>
          <View style={s.pilulaTexto}>
            <Text style={s.l1} numberOfLines={1}>{pilula.l1}</Text>
            <Text style={s.l2} numberOfLines={1}>{pilula.l2}</Text>
          </View>
        </Pressable>
        {fecharDia && (
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar o dia" onPress={fecharDia} style={s.fechar}>
            <Text style={s.fecharTexto}>fechar o dia</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export type ToastV3 =
  | { kind: 'cheguei'; titulo: string; texto: string; tom: 'ok' | 'av' }
  | { kind: 'ficha'; titulo: string; texto: string; tom: 'ok' | 'acao'; chips: Array<{ rot: string; iso: string }> | null; dealId: string; nome: string };

export function ToastPosVisita({ toast, bottom, aoChip, aoDepois, aoSumir }: {
  toast: ToastV3; bottom: number;
  aoChip: (c: { rot: string; iso: string }) => Promise<void>;
  aoDepois: () => void;
  aoSumir: () => void;
}) {
  const reduzir = useReduzirMovimento();
  const cores = useIconColors();
  const opac = useRef(new Animated.Value(reduzir ? 1 : 0)).current;
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const comChips = toast.kind === 'ficha' && !!toast.chips;
  // auditoria 02/11/26: aoSumir chega como arrow nova a cada render do App; nas dependências, o
  // timer de auto-fechar recomeçava a cada render e o toast ficava na tela
  const aoSumirRef = useRef(aoSumir);
  aoSumirRef.current = aoSumir;
  useEffect(() => {
    opac.setValue(reduzir ? 1 : 0);
    if (!reduzir) Animated.timing(opac, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
    if (comChips) return;
    const t = setTimeout(() => aoSumirRef.current(), toast.kind === 'cheguei' ? 1400 : 2600);
    return () => clearTimeout(t);
  }, [toast, reduzir, opac, comChips]);
  const borda = toast.tom === 'ok' ? 'var(--verde-acao)' : toast.tom === 'acao' ? 'var(--vermelho-acao)' : 'var(--tint-amber-border)';
  return (
    <Animated.View style={[s.toastLugar, { bottom, opacity: opac }]} pointerEvents="box-none">
      <View style={[s.toast, { borderColor: borda }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <View style={s.toastCab}>
          <View style={[s.toastIcone, { backgroundColor: toast.tom === 'ok' ? 'var(--ok-fundo)' : toast.tom === 'acao' ? 'var(--tint-red)' : 'var(--tint-amber)' }]}>
            {toast.tom === 'ok' ? <IconCheck width={18} height={18} fill={cores.tintGreenText} /> : <IconWarning width={18} height={18} fill={toast.tom === 'acao' ? cores.brandText : cores.tintAmberText} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.toastT}>{toast.titulo}</Text>
            <Text style={s.toastS}>{toast.texto}</Text>
          </View>
        </View>
        {toast.kind === 'ficha' && toast.chips && (
          <View style={s.chips}>
            {toast.chips.map((c) => (
              <Pressable key={c.iso} accessibilityRole="button" accessibilityLabel={`Passo de ${toast.nome} em ${c.rot}`} disabled={ocupado}
                onPress={async () => {
                  setOcupado(true); setErro(null);
                  try { await aoChip(c); } catch (e) { setErro(`Não marquei: ${String((e as Error)?.message ?? e)}`); }
                  finally { setOcupado(false); }
                }} style={s.chip}>
                <Text style={s.chipT}>{c.rot}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" accessibilityLabel="Depois" disabled={ocupado} onPress={aoDepois} style={[s.chip, s.chipDepois]}>
              {ocupado ? <ActivityIndicator /> : <Text style={s.chipDepoisT}>depois</Text>}
            </Pressable>
          </View>
        )}
        {!!erro && <Text style={s.erro}>{erro}</Text>}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // 12 das bordas (02/11/26): a mesma linha da fileira de busca logo acima; com 10 ela sobrava 2 px de cada lado
  pilulaLugar: { position: 'absolute', left: 12, right: 12, zIndex: 40, alignItems: 'stretch' },
  pilula: { minHeight: 48, borderRadius: 24, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)', flexDirection: 'row', alignItems: 'center',
    paddingLeft: 7, paddingRight: 7, gap: 6, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  pilulaToque: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  circulo: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  circuloN: { fontSize: 14, fontWeight: '800' },
  pilulaTexto: { flex: 1, minWidth: 0 },
  l1: { fontSize: 12.5, fontWeight: '700', color: 'var(--text)' },
  l2: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  fechar: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fecharTexto: { fontSize: 12.5, fontWeight: '700', color: 'var(--vermelho-texto)' },
  toastLugar: { position: 'absolute', left: 12, right: 12, zIndex: 60 },
  toast: { padding: 12, borderRadius: 18, backgroundColor: 'var(--surface)', borderWidth: 1.5, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  toastCab: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toastIcone: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toastT: { fontSize: 14.5, fontWeight: '700', color: 'var(--text)' },
  toastS: { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface-2)', alignItems: 'center', justifyContent: 'center' },
  chipT: { fontSize: 13.5, fontWeight: '700', color: 'var(--text)' },
  chipDepois: { backgroundColor: 'transparent', borderColor: 'transparent' },
  chipDepoisT: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)' },
  erro: { fontSize: 12, color: 'var(--vermelho-texto)' },
});
