// A LISTA DO QUE ESTÁ FILTRADO NO MAPA (Julyan, 27/10/26: "quando os executivos filtrarem, não
// aparecer só no mapa e virar lista também, com a distância e etc, ou bairro").
//
// O mapa responde ONDE estão; esta folha responde QUAL É O PRÓXIMO: mais perto primeiro, e cada
// linha diz o que falta ali. Tocar na linha fecha a folha e abre o pino no mapa — a lista é um
// jeito de escolher, não um lugar onde se mora.
//
// A ordem e o texto das linhas são regra pura (src/utils/listaDoMapa.ts); aqui só tem tela.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import { IconChevronRight as SiRight } from '../components/icons';

import type { LinhaDaLista, OrdemDaLista } from '../utils/listaDoMapa';

type Props = {
  visivel: boolean;
  aoFechar: () => void;
  linhas: LinhaDaLista[];
  /** Sem GPS a lista é alfabética e não mostra distância — e isso é dito, não escondido. */
  semGps: boolean;
  /** Quantos filtros estão ligados (0 = é a lente que está mandando). */
  filtrosAtivos: number;
  aoTocar: (id: string) => void;
  ordem: OrdemDaLista;
  aoTrocarOrdem: (o: OrdemDaLista) => void;
};

/** Quantas linhas a folha desenha de uma vez. Acima disso, "Ver mais". */
const PAGINA = 60;

export default function FolhaLista({ visivel, aoFechar, linhas, semGps, filtrosAtivos, aoTocar, ordem, aoTrocarOrdem }: Props) {
  const [quantas, setQuantas] = React.useState(PAGINA);
  // Trocar a ordem volta ao começo: continuar na página 3 de outra ordem mostra o meio da lista.
  React.useEffect(() => { setQuantas(PAGINA); }, [visivel, ordem]);

  const aproximados = linhas.filter((l) => l.aproximado).length;
  const nunca = linhas.filter((l) => l.nunca).length;
  const mostradas = linhas.slice(0, quantas);

  const botaoOrdem = (o: OrdemDaLista, rotulo: string) => (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: ordem === o }}
      accessibilityLabel={`Ordenar por ${rotulo}`} onPress={() => aoTrocarOrdem(o)}
      style={[s.ordem, ordem === o && s.ordemAtiva]}>
      <Text style={[s.ordemTexto, ordem === o && s.ordemTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  );

  return (
    <Painel
      visivel={visivel}
      aoFechar={aoFechar}
      rotulo="Lista do mapa"
      topo={
        <View style={s.topo}>
          <View style={s.linhaTitulo}>
            <Text style={s.titulo}>{`${linhas.length} ${linhas.length === 1 ? 'lugar' : 'lugares'}`}</Text>
            <Pressable accessibilityRole="button" onPress={aoFechar} style={s.fechar} hitSlop={8}>
              <Text style={s.fecharTexto}>Fechar</Text>
            </Pressable>
          </View>
          <View style={s.ordens}>
            {botaoOrdem('perto', 'Mais perto')}
            {botaoOrdem('novo', `Nunca visitado · ${nunca}`)}
          </View>
          <Text style={s.legenda}>
            {semGps
              ? ordem === 'novo'
                ? 'Sem GPS: nunca visitados primeiro, depois em ordem de nome.'
                : 'Sem GPS: em ordem de nome. Ligue a localização para ver a distância.'
              : ordem === 'novo'
                ? 'Quem você nunca visitou primeiro e, dentro disso, o mais perto.'
                : 'Mais perto primeiro, de onde você está agora.'}
            {filtrosAtivos > 0 ? ` · ${filtrosAtivos} ${filtrosAtivos === 1 ? 'filtro' : 'filtros'}` : ''}
          </Text>
        </View>
      }
    >
      <View style={s.corpo}>
        {linhas.length === 0 ? (
          <Text style={s.vazio}>Nenhum lugar com esses filtros na área do mapa. Afaste o mapa ou tire um filtro.</Text>
        ) : (
          <>
            {mostradas.map((l) => (
              <Pressable key={l.id} accessibilityRole="button" accessibilityLabel={`${l.nome}. ${l.sub}${l.distancia ? `. ${l.distancia}` : ''}`}
                onPress={() => aoTocar(l.id)} style={s.linha}>
                <View style={[s.bolinha, { backgroundColor: l.cor }]} />
                <View style={s.textos}>
                  <Text style={s.nome} numberOfLines={1}>{l.nome}</Text>
                  {/* DUAS LINHAS. A 390 px "nunca visitado · 12 dias parado" não cabe em uma, e
                      cortar sobra justamente na informação que decide a parada (visto em 27/10/26). */}
                  <Text style={s.sub} numberOfLines={2}>{l.sub}</Text>
                </View>
                {l.distancia ? <Text style={s.distancia}>{l.distancia}</Text> : null}
                <SiRight width={18} height={18} fill="var(--text-muted)" />
              </Pressable>
            ))}
            {linhas.length > quantas && (
              <Pressable accessibilityRole="button" onPress={() => setQuantas((q) => q + PAGINA)} style={s.mais}>
                <Text style={s.maisTexto}>{`Ver mais ${Math.min(PAGINA, linhas.length - quantas)}`}</Text>
              </Pressable>
            )}
            {/* 19% da base tem coordenada da RUA, não da porta (medido em 27/10/26). Distância
                exata em cima disso é mentira que parece precisa — por isso o "~" e este aviso. */}
            {aproximados > 0 && !semGps && (
              <Text style={s.nota}>{`~ em ${aproximados} ${aproximados === 1 ? 'lugar' : 'lugares'}: a coordenada é da rua, não da porta — a distância é estimativa.`}</Text>
            )}
          </>
        )}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 4 },
  linhaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flex: 1, fontSize: 18, fontWeight: '800', color: 'var(--text)' },
  fechar: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  fecharTexto: { fontSize: 15, fontWeight: '600', color: 'var(--text-muted)' },
  legenda: { fontSize: 12, color: 'var(--text-muted)' },
  ordens: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 2 },
  ordem: {
    minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center',
    borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)',
  },
  ordemAtiva: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  ordemTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  ordemTextoAtivo: { color: 'var(--bg)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 24 },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)', paddingTop: 16, textAlign: 'center' },
  linha: {
    minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'var(--border)',
  },
  bolinha: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  textos: { flex: 1, minWidth: 0 },
  nome: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  distancia: { fontSize: 13, fontWeight: '700', color: 'var(--text)', fontVariant: ['tabular-nums'], flexShrink: 0 },
  mais: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)' },
  maisTexto: { fontSize: 14, fontWeight: '800', color: 'var(--text)' },
  nota: { fontSize: 12, lineHeight: 17, color: 'var(--text-muted)', marginTop: 12 },
});
