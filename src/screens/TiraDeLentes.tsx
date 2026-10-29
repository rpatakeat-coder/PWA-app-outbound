// A FILEIRA DE LENTES, EMBAIXO (prancha "Ordem da porta", §5, 29/10/26).
//
// Julyan: "eu gostava das lentes, dá para deixar elas também? talvez menor e
// arrastável lateralmente".
//
// POR QUE EMBAIXO, E NÃO DE VOLTA AO TOPO. A fileira antiga tinha 44 px, faixa
// própria, e EMPURRAVA tudo o que vinha abaixo — foi uma das cinco faixas
// empilhadas que motivaram o mapa limpo. Aqui ela mora na linha dos botões do
// mapa, entre a localização e o "+", e sobe e desce com a folha: ocupa um espaço
// que já era do chrome, sem criar faixa nova e sem tocar nas duas posições fixas
// do topo (50 e 106).
//
// SEM NÚMERO. A regra do §8 do mapa limpo continua: um número no mapa só muda
// por algo que o executivo fez, e a contagem por lente mudava a cada arraste.
//
// O ARRASTO É SÓ LATERAL. A folha já só assume o gesto quando ele é claramente
// vertical (`|dy| > 12 && |dy| > |dx|`), então o espelho disso aqui faz os dois
// conviverem: horizontal fica na fileira e não chega ao mapa; vertical passa
// direto para a folha.
import React from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Lente } from '../utils/lentes';
import { COR_LENTE } from './FolhaLentes';

export const ALTURA_TIRA_LENTES = 44;

export default function TiraDeLentes({ lentes, atual, aoEscolher, bottom }: {
  lentes: { id: Lente; rotulo: string }[];
  atual: Lente;
  aoEscolher: (l: Lente) => void;
  /** Mesma linha dos botões do mapa: o App passa o mesmo cálculo que usa neles. */
  bottom: number;
}) {
  /* O espelho da regra da folha: a fileira só assume o gesto quando ele é claramente
     HORIZONTAL. Sem isto, arrastar de lado aqui moveria o mapa atrás. */
  const arrasto = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
  }), []);

  return (
    <View style={[s.tira, { bottom }]} pointerEvents="box-none" {...arrasto.panHandlers}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.conteudo}
        /* A ativa encosta à esquerda ao abrir: é a que ele está vendo, e procurar a lente ativa
           numa fileira que rola seria trabalho à toa. */
        keyboardShouldPersistTaps="handled"
      >
        {lentes.map((l) => {
          const ativa = l.id === atual;
          return (
            <Pressable
              key={l.id}
              accessibilityRole="button"
              accessibilityState={{ selected: ativa }}
              accessibilityLabel={`Lente ${l.rotulo}`}
              onPress={() => aoEscolher(l.id)}
              /* O ALVO É A ALTURA INTEIRA DA FILEIRA (44), não a da pílula (32): a pílula é o
                 desenho, o alvo é o toque, e encostar um no outro tira o ponto morto entre eles. */
              style={s.alvo}
            >
              <View style={[s.pilula, ativa && s.pilulaAtiva]}>
                <View style={[s.ponto, { backgroundColor: COR_LENTE[l.id] }]} />
                <Text style={[s.texto, ativa && s.textoAtivo]} numberOfLines={1}>{l.rotulo}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  /* left/right 64: os 44 px de cada botão do mapa mais 8 de vão, dos dois lados. */
  tira: { position: 'absolute', left: 64, right: 64, height: ALTURA_TIRA_LENTES, zIndex: 25, justifyContent: 'center' },
  conteudo: { alignItems: 'center', gap: 6, paddingRight: 8 },
  alvo: { height: ALTURA_TIRA_LENTES, justifyContent: 'center', paddingHorizontal: 3 },
  pilula: {
    height: 32, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'var(--pilula-mapa)', borderWidth: 1, borderColor: 'var(--border)',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  /* Invertida, como o selecionado do alternador e o selo do filtro: é o mesmo gesto visual. */
  pilulaAtiva: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  texto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  textoAtivo: { color: 'var(--surface)' },
});
