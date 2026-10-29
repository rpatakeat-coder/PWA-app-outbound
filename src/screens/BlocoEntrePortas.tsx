// ENTRE PORTAS (espinha do dia, item 2.7, 29/10/26).
//
// O telefonema que cabe no caminho entre uma porta e a próxima. Dois minutos em
// pé na calçada valem mais do que a mesma ligação às 18h, no carro, com pressa.
//
// SÓ UM DOS TRÊS GATILHOS DO PEDIDO FOI CONSTRUÍDO, de propósito:
//
//   · as janelas de 12:30 e 17:30 já têm casa — ocupam a faixa da vez desde o
//     mapa limpo. Pôr a mesma ligação também aqui seria mostrá-la duas vezes,
//     que é a poluição que o Julyan pediu duas vezes para evitar;
//   · "parado mais de 5 min" precisa acompanhar posição, e o custo de bateria
//     disso é a pergunta 0.6 do pacote da espinha, nunca respondida com medição
//     — a mesma razão por que a detecção de saída ficou no relógio.
//
// Sobra o gatilho que não tem outra casa e é o melhor dos três: ele ACABOU de
// registrar uma visita, está de pé na rua e ainda não andou.
//
// A LIGAÇÃO É A DA FILA, não uma escolha nova: a primeira de telefone na ordem
// de valor × urgência que o servidor já calcula. "Depois" esconde por 30
// minutos — adia, não cancela.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconCall, IconWhatsapp } from '../components/icons';

export type LigacaoEntrePortas = {
  dealId: string;
  pessoa: string | null;
  negocio: string;
  /** "o que foi combinado" da tarefa que comanda o card. */
  combinado: string | null;
  /** "venceu há 3 dias", "vence hoje". */
  prazoTexto: string;
  temTelefone: boolean;
};

export default function BlocoEntrePortas({ ligacao, aoLigar, aoWhats, aoDepois }: {
  ligacao: LigacaoEntrePortas;
  aoLigar: () => void;
  aoWhats: () => void;
  aoDepois: () => void;
}) {
  const quem = ligacao.pessoa?.trim()
    ? `Ligar para ${ligacao.pessoa.trim()}, ${ligacao.negocio}`
    : `Ligar para ${ligacao.negocio}`;
  return (
    <View style={s.bloco}>
      <View style={s.topo}>
        <Text style={s.kicker} numberOfLines={1}>ANTES DE ANDAR · 2 MIN</Text>
        <Text style={s.prazo} numberOfLines={1}>{ligacao.prazoTexto}</Text>
      </View>
      <Text style={s.titulo} numberOfLines={1}>{quem}</Text>
      {!!ligacao.combinado?.trim() && (
        <Text style={s.combinado} numberOfLines={2}>{`Combinado: “${ligacao.combinado.trim()}”`}</Text>
      )}
      <View style={s.botoes}>
        {ligacao.temTelefone ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={quem} onPress={aoLigar} style={s.ligar}>
              <IconCall width={18} height={18} fill="#fff" />
              <Text style={s.ligarTexto}>Ligar</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`WhatsApp para ${ligacao.negocio}`} onPress={aoWhats} style={s.secundario}>
              <IconWhatsapp width={18} height={18} fill="var(--text)" />
            </Pressable>
          </>
        ) : (
          /* Sem telefone o botão não some: ele diz por que não dá, senão parece que travou. */
          <View style={[s.ligar, s.semTelefone]}><Text style={s.semTelefoneTexto}>sem telefone no cadastro</Text></View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Depois: esconder por 30 minutos" onPress={aoDepois} style={s.depois}>
          <Text style={s.depoisTexto}>Depois</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bloco: {
    backgroundColor: 'var(--tint-amber)', borderWidth: 1, borderColor: 'var(--tint-amber-border)',
    borderRadius: 14, padding: 12, gap: 4, marginBottom: 10,
  },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: 'var(--tint-amber-text)' },
  prazo: { fontSize: 11.5, fontWeight: '600', color: 'var(--tint-amber-text)', flexShrink: 0 },
  titulo: { fontSize: 15.5, fontWeight: '700', color: 'var(--text)' },
  combinado: { fontSize: 12.5, lineHeight: 17, color: 'var(--text-muted)' },
  botoes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ligar: {
    flex: 1, minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'var(--vermelho-acao)',
  },
  ligarTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  semTelefone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'var(--stroke-strong)' },
  semTelefoneTexto: { fontSize: 12.5, fontWeight: '600', color: 'var(--text-muted)' },
  secundario: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'var(--stroke-strong)',
  },
  depois: { minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  depoisTexto: { fontSize: 13.5, fontWeight: '600', color: 'var(--text-muted)' },
});
