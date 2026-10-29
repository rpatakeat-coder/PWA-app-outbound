// FECHAR O DIA (espinha do dia, item 2.10, 29/10/26).
//
// O Julyan, no pedido de 28/10: "nada me pergunta como foi. O dia termina quando
// eu fecho o app. (...) É o momento que transforma rua em pipeline, e hoje ele
// não existe."
//
// Às 18h, na primeira vez que o app volta para a frente, esta folha sobe sozinha
// e faz uma pergunta de prestação de contas — com o número na mão, não de
// memória: "N portas, J com próximo passo, K sem. Fecha?".
//
// AS PENDENTES VÊM PRIMEIRO, cada uma com o seu Dar: é a última chance do dia de
// transformar a visita em pipeline, e amanhã a mesma visita já vale menos. Quem
// não tem pendência vê só o placar e o botão — a folha não inventa trabalho.
//
// NÃO TRAVA NADA: "Depois" fecha, e o dia fica aberto. Quem não fechou aparece
// para o gestor em "O time na rua" no dia seguinte (2.11), que é a cobrança
// certa — de gente para gente, e não de tela para pessoa.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';

export type PendenteDoFecho = { dealId: string; clientId: string | null; nome: string; hora: string | null };

export default function FolhaFechoDoDia({ dia, portas, meta, pendentes, amanha, aoDar, aoFechar, aoDepois }: {
  /** "QUINTA, 30/10" — já em Brasília. */
  dia: string;
  portas: number;
  meta: number;
  pendentes: PendenteDoFecho[];
  /** O que já está marcado para amanhã: o que faz o dia seguinte começar cheio. */
  amanha: number;
  aoDar: (p: PendenteDoFecho) => void;
  aoFechar: () => void;
  aoDepois: () => void;
}) {
  const k = pendentes.length;
  const j = Math.max(0, portas - k);
  return (
    <Painel visivel aoFechar={aoDepois} rotulo="Fechar o dia" topo={
      <View style={s.topo}>
        <View style={s.kickerLinha}>
          <Text style={s.kicker} numberOfLines={1}>{`FIM DO DIA · ${dia}`}</Text>
          {portas >= meta && meta > 0 && <Text style={s.bateu} numberOfLines={1}>{`${portas} de ${meta} portas ✓`}</Text>}
        </View>
        <Text style={s.titulo}>
          {k === 0
            ? `${portas} ${portas === 1 ? 'porta' : 'portas'}, todas com próximo passo. Fecha?`
            : `${portas} ${portas === 1 ? 'porta' : 'portas'}, ${j} com próximo passo, ${k} sem. Fecha?`}
        </Text>
      </View>
    }>
      <ScrollView style={s.rolagem} contentContainerStyle={s.corpo}>
        {k > 0 && (
          <>
            <Text style={s.grupo}>{`SEM PRÓXIMO PASSO · ${k}`}</Text>
            {pendentes.map((p) => (
              <View key={p.dealId} style={s.linha}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.nome} numberOfLines={1}>{p.nome}</Text>
                  {!!p.hora && <Text style={s.sub} numberOfLines={1}>{`visita das ${p.hora}`}</Text>}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Dar o próximo passo de ${p.nome}`}
                  onPress={() => aoDar(p)} style={s.dar}>
                  <Text style={s.darTexto}>Dar</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
        {amanha > 0 && (
          <Text style={s.amanha}>
            {`Amanhã já começa com ${amanha} ${amanha === 1 ? 'porta combinada' : 'portas combinadas'}.`}
          </Text>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar o dia" onPress={aoFechar} style={s.primario}>
          <Text style={s.primarioTexto}>Fechar o dia</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Depois" onPress={aoDepois} style={s.depois}>
          <Text style={s.depoisTexto}>Depois · o dia fica aberto e o gestor vê amanhã</Text>
        </Pressable>
      </ScrollView>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 6 },
  kickerLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, color: 'var(--text-subtle)' },
  bateu: { fontSize: 12, fontWeight: '700', color: 'var(--ok-texto)', flexShrink: 0 },
  titulo: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: 'var(--text)' },
  rolagem: { maxHeight: 420 },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  grupo: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, color: 'var(--vermelho-texto)', marginTop: 4 },
  linha: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: 'var(--border)' },
  nome: { fontSize: 15.5, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1 },
  /* Contorno, não vermelho cheio: o vermelho cheio é do Cheguei, e esta folha não é a rua. */
  dar: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  darTexto: { fontSize: 14.5, fontWeight: '700', color: 'var(--vermelho-texto)' },
  amanha: { fontSize: 13.5, lineHeight: 19, color: 'var(--text-muted)', marginTop: 6 },
  primario: { height: 52, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primarioTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  depois: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  depoisTexto: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)', textAlign: 'center' },
});
