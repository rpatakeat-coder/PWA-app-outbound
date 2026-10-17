// A folha "Antes da rua" (handoff "Tarefas do App", P6, 17/10/2026): na 1ª abertura do Mapa no
// dia, se há quente esfriando, sobe esta folha com uma linha por quente e o Ligar. Não bloqueia:
// "Deixar para a hora das ligações" fecha e o mapa segue. O Ligar é um toque na tela, então o
// navegador deixa discar daqui; a fila abre o cartão daquele negócio para o Como foi na volta.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Painel } from '../components/Painel';
import { IconCall } from '../components/icons';

export type QuenteDaFolha = { dealId: string; negocio: string; linha: string; temTelefone: boolean };

export default function FolhaAntesDaRua({ hora, quentes, proximaJanela, aoLigar, aoDeixar }: {
  hora: string; quentes: QuenteDaFolha[]; proximaJanela: string | null;
  aoLigar: (dealId: string) => void; aoDeixar: () => void;
}) {
  const n = quentes.length;
  return (
    <Painel visivel aoFechar={aoDeixar} rotulo="Antes da rua" topo={
      <View style={s.topo}>
        <Text style={s.kicker}>{`ANTES DA RUA · ${hora}`}</Text>
        <Text style={s.titulo}>{`${n} ${n === 1 ? 'quente esfriando' : 'quentes esfriando'}`}</Text>
        <Text style={s.sub}>{n === 1 ? 'Um telefonema, uns 2 minutos. Depois o mapa abre com a rota.' : `${n === 2 ? 'Dois' : n} telefonemas, uns ${n * 2} minutos. Depois o mapa abre com a rota.`}</Text>
      </View>
    }>
      <View style={s.corpo}>
        {quentes.map((q) => (
          <View key={q.dealId} style={s.linha}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={s.nome} numberOfLines={1}>{q.negocio}</Text>
              <Text style={s.linhaT} numberOfLines={2}>{q.linha}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Ligar: ${q.negocio}`} disabled={!q.temTelefone} onPress={() => aoLigar(q.dealId)}
              style={[s.ligar, !q.temTelefone && { opacity: 0.45 }]}>
              <IconCall width={16} height={16} fill="#FFFFFF" /><Text style={s.ligarT}>Ligar</Text>
            </Pressable>
          </View>
        ))}
        <Pressable accessibilityRole="button" onPress={aoDeixar} style={s.deixar}>
          <Text style={s.deixarT}>{proximaJanela ? `Deixar para a hora das ligações · ${proximaJanela}` : 'Deixar para depois'}</Text>
        </Pressable>
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--text-subtle)' },
  titulo: { fontSize: 22, fontWeight: '800', color: 'var(--vermelho-texto)' },
  sub: { fontSize: 13, fontWeight: '500', lineHeight: 18, color: 'var(--text-muted)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, backgroundColor: 'var(--surface-2)', borderWidth: 1, borderColor: 'var(--border)', paddingVertical: 10, paddingLeft: 14, paddingRight: 10 },
  nome: { fontSize: 14.5, fontWeight: '700', color: 'var(--text)' },
  linhaT: { fontSize: 12, fontWeight: '600', lineHeight: 16, color: 'var(--vermelho-texto)' },
  ligar: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'var(--vermelho-acao)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  ligarT: { fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' },
  deixar: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  deixarT: { fontSize: 13.5, fontWeight: '700', color: 'var(--text)' },
});
