// "SAÍ · COMO FICOU?" (espinha do dia, item 2.6, 29/10/26).
//
// O QUE ESTAVA ERRADO NÃO ERA O FORMULÁRIO, ERA A HORA. A ficha de rua abria
// logo depois do Cheguei — o comentário no App dizia isso com todas as letras,
// "abre depois do check-in". Ou seja: o app perguntava "como foi?" quando o
// executivo tinha acabado de ENCOSTAR na porta e ainda não havia falado com
// ninguém. Daí o número que o Julyan viu hoje: depois que "Apresentei agora"
// passou a existir, em 14/10, só **7 de 314** fichas levaram alguém a
// Demo/Proposta. Não é que a opção fosse escondida — é que, na hora em que o
// formulário subia, a demo ainda não tinha acontecido.
//
// Então a pergunta mudou de momento: sai da chegada e vai para a SAÍDA, com
// quatro botões e vinte segundos.
//
// NÃO É FORMULÁRIO NOVO. Cada botão abre a MESMA ficha de rua de sempre, já na
// opção escolhida — o pedido é explícito nisso ("o Saí deve usar a mesma
// escrita, não uma nova"). O que esta folha faz é escolher o caminho antes de
// abrir a ficha, que é a decisão que o executivo já tem pronta na cabeça quando
// vira as costas para a porta.
//
// E não trava: "Depois" fecha, e a visita sem desfecho já é pega pela linha do
// dia em `pendente`, que é vermelha e cobra sozinha.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';

/** As quatro saídas possíveis de uma porta, na ordem da prancha (grade 2x2). */
export type SaidaDaPorta = 'fechou' | 'demo' | 'voltar' | 'perdeu';

const OPCOES: { id: SaidaDaPorta; rotulo: string; sub: string }[] = [
  { id: 'fechou', rotulo: 'Fechou', sub: 'vai para pagamento' },
  { id: 'demo', rotulo: 'Fiz a demo', sub: 'apresentei agora' },
  { id: 'voltar', rotulo: 'Voltar', sub: 'marca o dia' },
  { id: 'perdeu', rotulo: 'Perdeu', sub: 'com o motivo' },
];

export default function FolhaSai({ nome, aoEscolher, aoDepois }: {
  nome: string;
  aoEscolher: (s: SaidaDaPorta) => void;
  aoDepois: () => void;
}) {
  return (
    <Painel visivel aoFechar={aoDepois} rotulo="Como ficou" topo={
      <View style={s.topo}>
        <View style={s.kickerLinha}>
          <Text style={s.kicker} numberOfLines={1}>{`COMO FICOU · ${nome.toLocaleUpperCase('pt-BR')}`}</Text>
          <Text style={s.leva}>leva 20 s</Text>
        </View>
        <Text style={s.titulo}>Qual é o próximo passo?</Text>
      </View>
    }>
      <View style={s.corpo}>
        <View style={s.grade}>
          {OPCOES.map((o) => (
            <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`${o.rotulo}: ${o.sub}`}
              onPress={() => aoEscolher(o.id)} style={s.opcao}>
              <Text style={s.opcaoRotulo}>{o.rotulo}</Text>
              <Text style={s.opcaoSub} numberOfLines={1}>{o.sub}</Text>
            </Pressable>
          ))}
        </View>
        {/* O que já se sabe não se pergunta: decisor, etapa, MRR e proposta vêm da ficha. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Depois" onPress={aoDepois} style={s.depois}>
          <Text style={s.depoisTexto}>Depois · fica pendente e a linha do dia cobra</Text>
        </Pressable>
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 6 },
  kickerLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, color: 'var(--ok-texto)' },
  leva: { fontSize: 12, fontWeight: '500', color: 'var(--text-muted)', flexShrink: 0 },
  titulo: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: 'var(--text)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  /* 2x2 a 390 px: `48%` deixa os 8 px de gap sem estourar quando o nome do rótulo cresce. */
  opcao: {
    width: '48%', minHeight: 60, borderRadius: 14, paddingHorizontal: 12, justifyContent: 'center',
    backgroundColor: 'var(--surface-3)', borderWidth: 1, borderColor: 'var(--border)',
  },
  opcaoRotulo: { fontSize: 15.5, fontWeight: '700', color: 'var(--text)' },
  opcaoSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 1 },
  depois: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  depoisTexto: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)' },
});
