// A faixa da hora das ligações do Mapa (handoff "Tarefas do App", 17/10/2026, P1). As outras peças
// da aba Tarefas daquele handoff (placar, fila zerada, cartão cheio, mini, "falta só o Como foi",
// linha do Feito hoje) saíram com o "Tarefas por dia" (20/10/2026): estão em ./tarefas/PecasDaTarefa.
// Cores só dos tokens do app (public/index.html).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconCall } from '../components/icons';

const T = { inv: 'var(--text)', invFg: 'var(--bg)', acao: 'var(--vermelho-acao)' };

/** A faixa do Mapa e da Agenda: fundo invertido, telefone no círculo, "Abrir". */
export function FaixaHoraDasLigacoes({ ate, followups, quentes, aoAbrir }: { ate: string; followups: number; quentes: number; aoAbrir: () => void }) {
  return (
    <View style={st.faixa}>
      <View style={st.faixaCirculo}><IconCall width={18} height={18} fill="#FFFFFF" /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={st.faixaT} numberOfLines={1}>{`Hora das ligações · até ${ate}`}</Text>
        <Text style={st.faixaS} numberOfLines={1}>{`${followups} follow-ups, ${quentes} ${quentes === 1 ? 'quente' : 'quentes'} · 15 min`}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir a fila de ligações" onPress={aoAbrir} style={st.faixaBotao}><Text style={st.faixaBotaoT}>Abrir</Text></Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  faixa: { borderRadius: 16, backgroundColor: T.inv, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  faixaCirculo: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.acao, alignItems: 'center', justifyContent: 'center' },
  faixaT: { fontSize: 14.5, fontWeight: '700', color: T.invFg },
  faixaS: { fontSize: 12, fontWeight: '500', color: T.invFg, opacity: 0.82 },
  faixaBotao: { height: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: T.acao, alignItems: 'center', justifyContent: 'center' },
  faixaBotaoT: { fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' },
});
