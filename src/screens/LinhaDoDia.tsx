// A faixa da linha do dia, 48 px, logo abaixo das lentes do Mapa (pacote "a espinha do dia",
// §2.2, 28/10/26). O que ela DIZ está em utils/linhaDoDia.ts, que é puro e testado; aqui só o
// desenho.
//
// SEM ✕. A linha não se fecha, porque o dia não se fecha. Tocar nela abre o que ela está
// falando — nunca troca de aba: o executivo não sai do mapa, então o que ele precisa vem até
// o mapa.
//
// NENHUMA COR NOVA. A prancha foi desenhada só no escuro, com valores literais; aqui tudo sai
// dos tokens que o app já tem, e o tema claro nasce de graça.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ALTURA_LINHA_DO_DIA, type LinhaDoDia as Linha, type TomDaLinha } from '../utils/linhaDoDia';

type Props = {
  linha: Linha;
  /** Distância do topo. Desde 29/10 há só duas posições fixas: a fileira e ESTA faixa. */
  top: number;
  aoTocar: () => void;
  /** A ocupante que perdeu a vez na fila: vira o "+1" na ponta direita (prancha "Mapa limpo" §3). */
  outra?: { rotulo: string; aoTocar: () => void } | null;
};

/* Cada tom é um trio (fundo, traço, tinta) e o ponto repete a tinta — menos no vermelho, onde
   o ponto usa a cor de AÇÃO: é o único lugar da linha que pede movimento agora. */
const TOM: Record<TomDaLinha, { fundo: string; traco: string; tinta: string; ponto: string }> = {
  neutro: { fundo: 'var(--pilula-mapa)', traco: 'var(--border)', tinta: 'var(--text)', ponto: 'var(--text-muted)' },
  ambar: { fundo: 'var(--tint-amber)', traco: 'var(--tint-amber-border)', tinta: 'var(--tint-amber-text)', ponto: 'var(--tint-amber-text)' },
  /* A BORDA E A COR DE ACAO (prancha "Ordem da porta" §4): a faixa desce de tom, mas se marca
     com o contorno vermelho. Quem tem vermelho CHEIO na tela e sempre o Cheguei, nunca ela. */
  vermelho: { fundo: 'var(--tint-red)', traco: 'var(--vermelho-acao)', tinta: 'var(--tint-red-text)', ponto: 'var(--vermelho-acao)' },
  verde: { fundo: 'var(--ok-fundo)', traco: 'var(--tint-green-border)', tinta: 'var(--ok-texto)', ponto: 'var(--ok-texto)' },
};

export default function LinhaDoDia({ linha, top, aoTocar, outra }: Props) {
  const t = TOM[linha.tom];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={linha.rotulo}
      testID={`linha-do-dia-${linha.estado}`}
      onPress={aoTocar}
      style={[s.faixa, { top, backgroundColor: t.fundo, borderColor: t.traco }]}
    >
      <View style={[s.ponto, { backgroundColor: t.ponto }]} />
      {/* `minWidth: 0` é o que deixa o numberOfLines cortar em vez de empurrar a direita para fora */}
      <View style={s.meio}>
        <Text style={[s.titulo, { color: t.tinta }]} numberOfLines={1}>{linha.titulo}</Text>
        {!!linha.subtitulo && (
          <Text style={[s.sub, linha.tom === 'neutro' ? s.subNeutro : { color: t.tinta, opacity: 0.82 }]} numberOfLines={1}>
            {linha.subtitulo}
          </Text>
        )}
      </View>
      {!!linha.direita && <Text style={[s.direita, { color: t.tinta }]} numberOfLines={1}>{linha.direita}</Text>}
      {/* O "+1" DA FILA (prancha "Mapa limpo" §3): só UMA faixa por vez, mas a que perdeu não
          evapora. Sem isto, uma visita sem próximo passo às 12:30 esconderia a hora das ligações
          o dia inteiro — o executivo nunca saberia que era hora de ligar. */}
      {outra && (
        <Pressable accessibilityRole="button" accessibilityLabel={outra.rotulo} onPress={outra.aoTocar} style={[s.mais, { borderColor: t.traco }]}>
          <Text style={[s.maisTexto, { color: t.tinta }]}>+1</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  faixa: {
    position: 'absolute', left: 12, right: 12, minHeight: ALTURA_LINHA_DO_DIA, zIndex: 24,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 14, borderWidth: 1,
    // a mesma sombra da folha e das pílulas: a faixa flutua sobre o mapa, não é parte dele
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  ponto: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  meio: { flex: 1, minWidth: 0, gap: 1 },
  titulo: { fontSize: 13.5, fontWeight: '700' },
  sub: { fontSize: 12, fontWeight: '500' },
  subNeutro: { color: 'var(--text-muted)' },
  mais: { minWidth: 28, height: 28, borderRadius: 14, borderWidth: 1, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  maisTexto: { fontSize: 12.5, fontWeight: '800' },
  direita: { fontSize: 12.5, fontWeight: '700', flexShrink: 0, whiteSpace: 'nowrap' } as never,
});
