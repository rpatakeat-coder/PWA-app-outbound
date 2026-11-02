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
/* O RESPIRO ACIMA DO GOOGLE (print do iPhone, 02/11/26). A fileira de baixo (lentes, "+", a pílula
   recolhida) ficava a 12 px do fim do mapa, em cima da faixa do logo e dos "Termos" da Google, que
   o contrato do Maps não deixa cobrir, e os chips pareciam colados no rodapé. 28 px tira a fileira
   da faixa de atribuição (~24 px) com 4 de folga. */
export const RESPIRO_ACIMA_DO_GOOGLE = 28;

export default function TiraDeLentes({ lentes, atual, aoEscolher, bottom, left = 12, right = 64 }: {
  lentes: { id: Lente; rotulo: string }[];
  atual: Lente;
  aoEscolher: (l: Lente) => void;
  /** Mesma linha dos botões do mapa: o App passa o mesmo cálculo que usa neles. */
  bottom: number;
  /** Onde a fileira começa: 12 da borda, ou depois da pílula recolhida da próxima porta (02/11/26). */
  left?: number;
  /** Onde termina: antes do "+" (12 da borda + 44 + 8 de vão). */
  right?: number;
}) {
  /* O espelho da regra da folha: a fileira só assume o gesto quando ele é claramente
     HORIZONTAL. Sem isto, arrastar de lado aqui moveria o mapa atrás. */
  const arrasto = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
  }), []);

  return (
    <View style={[s.tira, { bottom, left, right }]} pointerEvents="box-none" {...arrasto.panHandlers}>
      <ScrollView
        horizontal
        /* O CORTE VIRA DEGRADÊ (02/11/26): a última pílula era cortada seco na beira do "+", e
           parecia que o botão estava em cima dela. O degradê de 24 px diz "tem mais, arraste". */
        style={s.rolagem}
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
  /* left/right vêm do App (02/11/26). Eram 64 dos dois lados, reservando à esquerda o lugar de uma
     localização que o App desenhava 64 px mais alto: sobrava um vão vazio. A localização foi para a
     coluna da direita, acima do "+", e a fileira começa a 12 da borda (ou depois da pílula recolhida). */
  tira: { position: 'absolute', height: ALTURA_TIRA_LENTES, zIndex: 25, justifyContent: 'center' },
  rolagem: {
    flexGrow: 0,
    WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 24px), transparent)',
    maskImage: 'linear-gradient(to right, #000 calc(100% - 24px), transparent)',
  } as never,
  conteudo: { alignItems: 'center', gap: 6, paddingRight: 24 },
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
