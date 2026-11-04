// As ENTRADAS do Desenvolvimento v2 (handoff de 01/11/26, README §5): o que faz a pessoa abrir o Meu
// desempenho. "Sem as entradas, ninguém abre: esta etapa é tão importante quanto a tela."
//
//   (a PilulaDoHoje saiu em 04/11/26: virou os selos do placar da aba Hoje enxuta)
//   ToastDeConquista  logo depois do check-in, da venda ou da missão fechada: quando o quadro relido
//                     (o sinal ao vivo 'visita'/'conquista' invalida ['desenvolvimento_quadro']) traz uma
//                     conquista não vista, ou quando a venda muda a faixa do variável. Cartão no topo com
//                     borda vermelha, some em 8 s; o toque abre a coleção com a medalha destacada.
// Os textos são os de _compartilhado/desenvolvimentoV2.ts — os mesmos da pílula e do toast do Cockpit.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconFlame, useIconColors } from '../components/icons';
import { conquistasNovas, faixaDe, reais, toastDaConquista } from '../../supabase/functions/_compartilhado/desenvolvimentoV2';
import { destaqueDaSessao, marcarVistas, useCapitulos, useDesenvolvimentoQuadro, useReduzirMovimento } from '../hooks/useDesenvolvimento';

const CHAVE_TOASTADAS = 'dv2-toastadas';
function lerToastadas(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(CHAVE_TOASTADAS) || '[]') as string[]); } catch { return new Set(); }
}
function gravarToastadas(s: Set<string>) {
  try { sessionStorage.setItem(CHAVE_TOASTADAS, JSON.stringify([...s].slice(-50))); } catch { /* sem sessionStorage */ }
}

export function ToastDeConquista({ aoVer, naAbaEu }: { aoVer: () => void; naAbaEu: boolean }) {
  const q = useDesenvolvimentoQuadro(true);
  const capitulos = useCapitulos(true);
  const reduzir = useReduzirMovimento();
  const cores = useIconColors();
  const [cartao, setCartao] = useState<{ kicker: string; titulo: string; acao: string } | null>(null);
  const opac = useRef(new Animated.Value(0)).current;
  const faixaAntes = useRef<number | null>(null);
  const novas = useMemo(() => (q.data && !q.data.erro ? conquistasNovas(q.data, capitulos) : []), [q.data, capitulos]);

  useEffect(() => {
    if (!q.data || q.data.erro) return;
    /* a venda que muda a faixa do variável também é conquista (não grava medalha: é o variável) */
    const V = q.data.variavel;
    const f = V ? faixaDe(V.faixas, V.vendas) : null;
    const pc = f ? Number(f.porCliente) : null;
    if (pc != null && faixaAntes.current != null && pc > faixaAntes.current && !naAbaEu) {
      setCartao({ kicker: 'FAIXA NOVA', titulo: `A partir de agora, cada venda vale +${reais(pc)}`, acao: 'ver o mês' });
    }
    if (pc != null) faixaAntes.current = pc;
    const ja = lerToastadas();
    const nova = novas.find((n) => !ja.has(n.id));
    if (!nova) return;
    ja.add(nova.id); gravarToastadas(ja);
    destaqueDaSessao.add(nova.id);
    void marcarVistas([nova.id], 'toast');
    if (!naAbaEu) setCartao(toastDaConquista(nova));
  }, [q.data, novas, naAbaEu]);

  useEffect(() => {
    if (!cartao) return;
    opac.setValue(reduzir ? 1 : 0);
    if (!reduzir) Animated.timing(opac, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }).start();
    const t = setTimeout(() => setCartao(null), 8000);
    return () => clearTimeout(t);
  }, [cartao, reduzir, opac]);

  if (!cartao) return null;
  return (
    <Animated.View style={[st.toastLugar, { opacity: opac }]} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel={`${cartao.kicker}. ${cartao.titulo}. ${cartao.acao}`} accessibilityLiveRegion="polite"
        onPress={() => { setCartao(null); aoVer(); }} style={st.toast}>
        <View style={st.toastIcone}><IconFlame width={22} height={22} fill={cores.brand} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.toastKicker}>{cartao.kicker}</Text>
          <Text style={st.toastTitulo} numberOfLines={2}>{cartao.titulo}</Text>
        </View>
        <Text style={st.toastAcao}>{cartao.acao}</Text>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  toastLugar: { position: 'absolute', left: 12, right: 12, top: 50, zIndex: 50 },
  toast: { minHeight: 64, padding: 12, borderRadius: 18, backgroundColor: 'var(--surface)', borderWidth: 1.5, borderColor: 'var(--vermelho-acao)', flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  toastIcone: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'var(--tint-red)', alignItems: 'center', justifyContent: 'center' },
  toastKicker: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: 'var(--vermelho-texto)' },
  toastTitulo: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  toastAcao: { fontSize: 12.5, fontWeight: '700', color: 'var(--text-muted)', minWidth: 44, textAlign: 'right' },
});
