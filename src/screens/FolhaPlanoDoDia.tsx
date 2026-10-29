// A FOLHA DE ABERTURA DO DIA (espinha do dia, item 2.3, 29/10/26).
//
// O Julyan, no pedido de 28/10: "abro o app às 8h e vejo 298 pinos e a frase
// 'Nada no plano de hoje'. Planejar é opcional, e um mapa cheio parece trabalho
// feito. Saio para a rua e improviso."
//
// Então o plano deixa de esperar ser encontrado e vem até ele. Na primeira
// abertura do dia, esta folha sobe sozinha com uma pergunta fechada — ou o plano
// que já existe ("Vamos?"), ou as portas propostas ("Confirma?").
//
// NÃO TRAVA NADA, que é a regra-mãe da casa: o mapa está atrás, "Agora não"
// fecha, e o Cheguei de qualquer pino funciona o tempo todo. O que ela faz é
// impedir que o dia comece sem que ele VEJA a pergunta — forçar pela atenção,
// não pela trava, que foi a decisão do próprio Julyan no item 4 do pedido.
//
// Uma vez por dia por aparelho (a mesma chave de `localStorage` por dia que a
// folha "Antes da rua" já usa). E ela vem ANTES da "Antes da rua": primeiro se
// decide o dia, depois se fazem as ligações de antes de sair.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';

export type ParadaDoPlano = { id: string; numero: number; nome: string; sub: string | null };

type Props = {
  /** "QUARTA, 29/10" — o dia por extenso, já em Brasília. */
  dia: string;
  /** As paradas de hoje. Vazio = não há plano, e a folha vira a pergunta da proposta. */
  paradas: ParadaDoPlano[];
  /** "feito no Cockpit ontem", "feito no app às 19:12" — de onde veio o plano. */
  origem: string | null;
  /** Quantas portas a proposta montaria, quando não há plano. */
  quantasPropostas: number;
  /** Fecha e vai para a rua com o plano que já existe. */
  aoComecar: () => void;
  /** Monta o dia com a proposta (a mesma função da Agenda). */
  aoMontar: () => void;
  /** "Agora não": fecha sem plano. A linha do dia fica âmbar e o gestor vê às 9h00. */
  aoAgoraNao: () => void;
  /** Abre a parada no mapa, para trocar ou tirar do plano. */
  aoTocarParada: (id: string) => void;
};

export default function FolhaPlanoDoDia({ dia, paradas, origem, quantasPropostas, aoComecar, aoMontar, aoAgoraNao, aoTocarParada }: Props) {
  const temPlano = paradas.length > 0;
  const n = temPlano ? paradas.length : quantasPropostas;
  return (
    <Painel visivel aoFechar={aoAgoraNao} rotulo="O plano de hoje" topo={
      <View style={s.topo}>
        <View style={s.kickerLinha}>
          <Text style={s.kicker} numberOfLines={1}>{`BOM DIA · ${dia}`}</Text>
          {!!origem && <Text style={s.origem} numberOfLines={1}>{origem}</Text>}
        </View>
        <Text style={s.titulo}>
          {temPlano
            ? `Seu plano de hoje: ${n} ${n === 1 ? 'porta' : 'portas'}. Vamos?`
            : `Hoje são estas ${n}, nesta ordem. Confirma?`}
        </Text>
      </View>
    }>
      <View style={s.corpo}>
        {temPlano ? (
          <ScrollView style={s.rolagem} contentContainerStyle={s.lista}>
            {paradas.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Parada ${p.numero}: ${p.nome}. Abrir no mapa`}
                onPress={() => aoTocarParada(p.id)} style={s.parada}>
                <View style={s.disco}><Text style={s.discoTexto}>{p.numero}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.nome} numberOfLines={1}>{p.nome}</Text>
                  {!!p.sub && <Text style={s.sub} numberOfLines={1}>{p.sub}</Text>}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={s.vazio}>
            {quantasPropostas > 0
              ? 'As promessas vencidas vêm na frente; o resto é o que está mais perto de você.'
              : 'Ainda não há portas para propor nesta região. Afaste o mapa ou troque a lente.'}
          </Text>
        )}

        {temPlano ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Começar o dia" onPress={aoComecar} style={s.primario}>
            <Text style={s.primarioTexto}>Começar o dia</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Montar o dia com ${n} portas`} onPress={aoMontar}
            disabled={quantasPropostas === 0} style={[s.primario, quantasPropostas === 0 && s.primarioMorto]}>
            <Text style={s.primarioTexto}>{`Confirmar as ${n}`}</Text>
          </Pressable>
        )}

        {/* O QUE ACONTECE SE ELE IGNORAR — dito na própria tela, que é o item que o Julyan disse
            importar mais no pedido. Sem isto, "Agora não" parece não ter preço, e tem. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Agora não" onPress={aoAgoraNao} style={s.agoraNao}>
          <Text style={s.agoraNaoTexto}>
            {temPlano ? 'Agora não · o plano continua te esperando no mapa' : 'Agora não · a linha fica âmbar e às 9h00 o gestor vê'}
          </Text>
        </Pressable>
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 6 },
  kickerLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, color: 'var(--vermelho-texto)' },
  origem: { fontSize: 12, fontWeight: '500', color: 'var(--text-muted)', flexShrink: 0 },
  titulo: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: 'var(--text)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  rolagem: { maxHeight: 320 },
  lista: { gap: 2 },
  parada: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  disco: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'var(--surface-3)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  discoTexto: { fontSize: 13.5, fontWeight: '800', color: 'var(--text)' },
  nome: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 1 },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)' },
  primario: { height: 52, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  primarioMorto: { opacity: 0.45 },
  primarioTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  agoraNao: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  agoraNaoTexto: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)', textAlign: 'center' },
});
