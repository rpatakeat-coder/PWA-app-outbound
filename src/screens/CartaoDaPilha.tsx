// O CARTÃO DA PILHA (prancha "Mapa na rua" §3, 5e, 02/11/26).
//
// Dois ou mais restaurantes no mesmo ponto viram UM pino no mapa (o do membro mais prioritário,
// com a sombra de um segundo e o contador). Ao tocar, o leque abre os membros com nome (2c) e este
// cartão toma o lugar da folha: o endereço do ponto, uma linha por membro com o motivo e "Abrir",
// e "Cheguei aqui", que pergunta em qual — mesmo endereço não esconde ninguém.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Alert } from '../components/Alert';
import { FAIXA_BAIXO } from '../map/conferenciaNaTela';
import { COR, type Pino } from '../utils/pinoP2';
import type { Client } from '../types/client';

export type MembroDaPilha = { c: Client; p: Pino; nome: string; motivo: string };

type Props = {
  membros: MembroDaPilha[];
  /** Endereço do ponto (o do primeiro membro com rua). */
  endereco: string | null;
  /** Todos na mesma coordenada (ou a poucos metros). */
  mesmoPonto: boolean;
  distancia: string | null;
  bottom: number;
  aoAbrir: (c: Client) => void;
  aoCheguei: (c: Client) => void;
  aoFechar: () => void;
};

function Marca({ p }: { p: Pino }) {
  if (p.familia === 'rec') {
    return <View style={s.caixa}><View style={s.losango} /></View>;
  }
  return (
    <View style={s.caixa}>
      <View style={[s.circulo, { backgroundColor: p.cor }]}>
        <Text style={s.circuloTexto}>{p.familia === 'cli' ? 'T' : p.glifo}</Text>
      </View>
    </View>
  );
}

export default function CartaoDaPilha({ membros, endereco, mesmoPonto, distancia, bottom, aoAbrir, aoCheguei, aoFechar }: Props) {
  const perguntar = () => {
    Alert.alert('Cheguei em qual?', 'Os dois estão no mesmo ponto: escolha onde você entrou.', [
      ...membros.map((m) => ({ text: m.nome, onPress: () => aoCheguei(m.c) })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };
  return (
    <View style={[s.cartao, { bottom }]} accessibilityLabel={`${membros.length} no mesmo ponto`} {...FAIXA_BAIXO}>
      <View style={s.alca}><View style={s.alcaBarra} /></View>
      <View style={s.kickerLinha}>
        <Text style={s.kicker} numberOfLines={1}>{`${membros.length} NO MESMO PONTO`}</Text>
        {!!distancia && <Text style={s.kickerDireita} numberOfLines={1}>{distancia}</Text>}
      </View>
      <View style={s.tituloLinha}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.titulo} numberOfLines={2}>{endereco || 'Endereço não informado'}</Text>
          <Text style={s.sub}>{mesmoPonto ? 'mesmo endereço' : 'a poucos metros um do outro'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fechar}>
          <Text style={s.fecharTexto}>Fechar</Text>
        </Pressable>
      </View>
      <View>
        {membros.map((m) => (
          <View key={m.c.id} style={s.linha}>
            <Marca p={m.p} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.nome} numberOfLines={1}>{m.nome}</Text>
              <Text style={s.motivo} numberOfLines={2}>{m.motivo}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${m.nome}`} onPress={() => aoAbrir(m.c)} style={s.abrir}>
              <Text style={s.abrirTexto}>Abrir</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cheguei aqui: escolher em qual" onPress={membros.length === 1 ? () => aoCheguei(membros[0].c) : perguntar} style={s.cheguei}>
        <Text style={s.chegueiTexto}>Cheguei aqui</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  cartao: {
    position: 'absolute', left: 0, right: 0, zIndex: 30, paddingHorizontal: 16, paddingBottom: 14, gap: 12,
    backgroundColor: 'var(--surface)', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: 'var(--border)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: -8 },
  },
  alca: { height: 18, alignItems: 'center', justifyContent: 'center' },
  alcaBarra: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'var(--stroke-strong)' },
  kickerLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  kicker: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.69, color: 'var(--text-subtle)', flexShrink: 0 },
  kickerDireita: { fontSize: 12.5, fontWeight: '600', color: 'var(--text-muted)', flexShrink: 1 },
  tituloLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titulo: { fontSize: 19, lineHeight: 25, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13.5, color: 'var(--text-muted)', marginTop: 2 },
  fechar: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  fecharTexto: { fontSize: 15, fontWeight: '600', color: 'var(--text-muted)' },
  linha: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: 'var(--border)', paddingVertical: 6 },
  caixa: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  circulo: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  circuloTexto: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  losango: { width: 18, height: 18, borderRadius: 3, transform: [{ rotate: '45deg' }], backgroundColor: COR.rec, borderWidth: 2, borderColor: COR.recTinta },
  nome: { fontSize: 14.5, fontWeight: '600', color: 'var(--text)' },
  motivo: { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1 },
  abrir: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  abrirTexto: { fontSize: 13.5, fontWeight: '600', color: 'var(--text)' },
  cheguei: { minHeight: 52, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  chegueiTexto: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
