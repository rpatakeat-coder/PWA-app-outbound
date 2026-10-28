// A fileira de lentes do mapa (prancha "Mapa do Executivo", §2, 15/10/26).
//
// A 390 px cabem Meu dia, Recém-abertos (com o contador da semana), Carteira e Mais avaliados,
// numa fileira que rola de lado; o botão Filtros (≡) fica fixo à direita e abre o resto
// (Reconquista, Clientes, Em queda, Sem dono, Calor) e os filtros. Lente ativa = invertida
// (fundo da tinta, texto do fundo). O contador mora no botão Recém-abertos: sempre à vista, um
// toque abre a lente. No computador a mesma fileira mostra todas as lentes, sem rolar.
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COR_LENTE } from './FolhaLentes';

import type { EstiloMeta } from '../utils/armasDoMapa';
import type { Lente } from '../utils/lentes';

export const ALTURA_FILEIRA_LENTES = 44;

type Props = {
  lentes: { id: Lente; rotulo: string }[];
  atual: Lente;
  aoEscolher: (l: Lente) => void;
  /** O contador do botão Recém-abertos (null = ainda não medido: o botão vai sem pílula). */
  contador: { texto: string; estilo: EstiloMeta } | null;
  /** Filtros (≡): no celular abre a folha com as outras lentes e os filtros. */
  aoFiltros?: () => void;
  filtrosAtivos?: number;
  /** A lente ativa mora no Filtros (Reconquista, Clientes…): o ≡ fica aceso. */
  lenteNosFiltros?: boolean;
  /** Com filtro ligado, a pílula "N filtros · Limpar" logo abaixo da fileira (um toque desliga). */
  aoLimparFiltros?: () => void;
  /** A LISTA DO MAPA (Julyan, 27/10/26): com filtro ligado, a pílula abre o mesmo recorte em
   *  lista. `naLista` é quantos lugares ela mostra — o mesmo número que o mapa desenha. */
  aoVerLista?: () => void;
  naLista?: number;
  /** Computador: quebra em linhas em vez de rolar, e o Filtros vira um botão com texto. */
  largo?: boolean;
  top?: number;
};

function Contador({ c, ativa }: { c: NonNullable<Props['contador']>; ativa: boolean }) {
  // na lente ativa (botão invertido) a pílula neutra ganha o fundo da página, como na prancha
  const neutra = c.estilo === 'zero' || c.estilo === 'meio';
  const estilo = c.estilo === 'batida' ? s.cBatida : c.estilo === 'falta' ? s.cFalta : ativa ? s.cMeioAtiva : c.estilo === 'zero' ? s.cZero : s.cMeio;
  const texto = c.estilo === 'batida' ? s.cBatidaTexto : c.estilo === 'falta' ? s.cFaltaTexto : s.cTexto;
  return (
    <View style={[s.contador, estilo, ativa && neutra && s.cZeroAtiva]}>
      <Text style={[s.cTextoBase, texto]} numberOfLines={1}>{c.texto}</Text>
    </View>
  );
}

export default function FileiraDeLentes({ lentes, atual, aoEscolher, contador, aoFiltros, filtrosAtivos = 0, lenteNosFiltros = false, aoLimparFiltros, aoVerLista, naLista = 0, largo = false, top }: Props) {
  const limpar = filtrosAtivos > 0 && aoLimparFiltros ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`${filtrosAtivos} ${filtrosAtivos === 1 ? 'filtro ligado' : 'filtros ligados'}. Limpar`}
      onPress={aoLimparFiltros} style={[s.limpar, largo && s.limparLargo]}>
      <Text style={s.limparTexto}>{`${filtrosAtivos} ${filtrosAtivos === 1 ? 'filtro' : 'filtros'} · Limpar ✕`}</Text>
    </Pressable>
  ) : null;
  /* SEMPRE, não só com filtro marcado (Julyan, 28/10/26: "clico em clientes e não aparece a
     lista ainda, só o mapa, eu quero os dois"). Eu tinha prendido a pílula a `filtrosAtivos > 0`
     — mas "Clientes" é LENTE, não filtro, e lente também é um recorte. A lista vale para
     qualquer coisa que o mapa esteja mostrando; com zero lugares a pílula some, porque aí não
     há lista nenhuma para abrir. */
  const lista = naLista > 0 && aoVerLista ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver os ${naLista} em lista, mais perto primeiro`}
      onPress={aoVerLista} style={[s.lista, largo && s.limparLargo]}>
      <Text style={s.listaTexto}>{`Lista · ${naLista}`}</Text>
    </Pressable>
  ) : null;
  /* TODAS AS LENTES NA FILEIRA (Julyan, 15/10/26: "as lentes têm que estar mais visíveis, em
     cima, e ele vai arrastando e escolhendo o que quer, horizontalmente"). Cada uma com a bolinha da
     sua cor; a escolhida rola para a vista. */
  const rolaRef = useRef<ScrollView>(null);
  const xDe = useRef(new Map<Lente, number>());
  useEffect(() => {
    const x = xDe.current.get(atual);
    if (x != null) rolaRef.current?.scrollTo({ x: Math.max(0, x - 48), animated: true });
  }, [atual]);
  const botoes = lentes.map((l) => {
    const ativa = l.id === atual;
    const comContador = l.id === 'novos' && contador;
    return (
      <Pressable key={l.id} accessibilityRole="button" accessibilityState={{ selected: ativa }}
        accessibilityLabel={comContador ? `Lente ${l.rotulo}. ${contador!.texto} recém-abertos visitados na semana` : `Lente ${l.rotulo}`}
        onLayout={(e) => { xDe.current.set(l.id, e.nativeEvent.layout.x); }}
        onPress={() => aoEscolher(l.id)} style={[s.lente, largo && s.lenteLarga, ativa && s.lenteAtiva]}>
        <View style={[s.bolinha, { backgroundColor: COR_LENTE[l.id] }, ativa && s.bolinhaAtiva]} />
        <Text style={[s.lenteTexto, largo && s.lenteTextoLargo, ativa && s.lenteTextoAtivo]} numberOfLines={1}>{l.rotulo}</Text>
        {comContador ? <Contador c={contador!} ativa={ativa} /> : null}
      </Pressable>
    );
  });
  if (largo) {
    return (
      <View style={s.largo}>
        {botoes}
        {aoFiltros && (
          <Pressable accessibilityRole="button" onPress={aoFiltros} style={[s.lente, s.lenteLarga]}>
            <Text style={[s.lenteTexto, s.lenteTextoLargo]}>{filtrosAtivos ? `Filtros · ${filtrosAtivos}` : 'Filtros'}</Text>
          </Pressable>
        )}
        {limpar}
        {lista}
      </View>
    );
  }
  return (
    <View style={[s.fileira, { top }]} pointerEvents="box-none">
      <ScrollView ref={rolaRef} horizontal showsHorizontalScrollIndicator={false} style={s.rola} contentContainerStyle={s.rolaConteudo} keyboardShouldPersistTaps="handled">
        {botoes}
      </ScrollView>
      {aoFiltros && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Filtros${filtrosAtivos ? `, ${filtrosAtivos} filtros ativos` : ''}`}
          onPress={aoFiltros} style={[s.filtros, (lenteNosFiltros || filtrosAtivos > 0) && s.filtrosAceso]}>
          <View style={s.linhas}>
            <View style={[s.l1, (lenteNosFiltros || filtrosAtivos > 0) && s.lAceso]} />
            <View style={[s.l2, (lenteNosFiltros || filtrosAtivos > 0) && s.lAceso]} />
            <View style={[s.l3, (lenteNosFiltros || filtrosAtivos > 0) && s.lAceso]} />
          </View>
          {filtrosAtivos > 0 && <View style={s.pontoFiltro} />}
        </Pressable>
      )}
      {(limpar || lista) && <View style={s.limparLinha} pointerEvents="box-none"><View style={s.duasPilulas}>{limpar}{lista}</View></View>}
    </View>
  );
}

const s = StyleSheet.create({
  fileira: { position: 'absolute', left: 0, right: 0, height: ALTURA_FILEIRA_LENTES, zIndex: 25, flexDirection: 'row', alignItems: 'center' },
  // a ponta direita apaga: diz que tem mais lente arrastando
  rola: { flex: 1, minWidth: 0, maskImage: 'linear-gradient(to right, #000 86%, transparent)', WebkitMaskImage: 'linear-gradient(to right, #000 86%, transparent)' } as never,
  rolaConteudo: { gap: 8, paddingLeft: 12, paddingRight: 8, alignItems: 'center' },
  largo: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%' },
  lente: {
    height: 44, paddingHorizontal: 14, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0,
    backgroundColor: 'var(--pilula-mapa)', borderWidth: 1, borderColor: 'var(--border)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  lenteLarga: { paddingHorizontal: 12, gap: 6, shadowOpacity: 0 },
  lenteAtiva: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  bolinha: { width: 10, height: 10, borderRadius: 5, marginRight: -2 },
  bolinhaAtiva: { borderWidth: 1.5, borderColor: 'var(--bg)' },
  lenteTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap' } as never,
  lenteTextoLargo: { fontSize: 13 },
  lenteTextoAtivo: { color: 'var(--bg)' },
  contador: { height: 24, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  cTextoBase: { fontSize: 12.5, fontWeight: '700', whiteSpace: 'nowrap' } as never,
  cZero: { borderColor: 'var(--border)' },
  cZeroAtiva: { borderColor: 'var(--bg)' },
  cMeio: { backgroundColor: 'var(--chip-mapa)' },
  cMeioAtiva: { backgroundColor: 'var(--bg)' },
  cTexto: { color: 'var(--text)' },
  cTextoAtivo: { color: 'var(--text)' },
  cBatida: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  cBatidaTexto: { color: '#FFFFFF' },
  cFalta: { backgroundColor: 'var(--tint-amber)' },
  cFaltaTexto: { color: 'var(--tint-amber-text)' },
  filtros: {
    width: 44, height: 44, borderRadius: 22, marginRight: 12, marginLeft: 4, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: 'var(--pilula-mapa)', borderWidth: 1, borderColor: 'var(--border)',
  },
  filtrosAceso: { borderColor: 'var(--text)', borderWidth: 1.5 },
  linhas: { alignItems: 'center', gap: 4 },
  l1: { width: 16, height: 2.2, borderRadius: 2, backgroundColor: 'var(--text)' },
  l2: { width: 10, height: 2.2, borderRadius: 2, backgroundColor: 'var(--text)' },
  l3: { width: 4, height: 2.2, borderRadius: 2, backgroundColor: 'var(--text)' },
  lAceso: { backgroundColor: 'var(--text)' },
  limparLinha: { position: 'absolute', top: ALTURA_FILEIRA_LENTES + 6, left: 12 },
  limpar: { height: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', backgroundColor: 'var(--text)', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  limparLargo: { height: 44, borderRadius: 22 },
  limparTexto: { fontSize: 13, fontWeight: '700', color: 'var(--bg)' },
  duasPilulas: { flexDirection: 'row', gap: 8 },
  lista: { height: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', backgroundColor: 'var(--pilula-mapa)', borderWidth: 1, borderColor: 'var(--border)', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  listaTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  pontoFiltro: { position: 'absolute', top: 6, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: 'var(--vermelho-acao)' },
});
