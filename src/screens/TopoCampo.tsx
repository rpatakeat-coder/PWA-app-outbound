// A FILEIRA DE CONTROLES do mapa (prancha "Mapa limpo", §1, 29/10/26).
//
// Era uma barra só com busca, sino e avatar, e abaixo dela vinham uma fileira de
// lentes, a faixa do plano e uma linha de pílulas — nove camadas sobre o mapa,
// cinco delas em pilha. Agora são DUAS peças nesta linha e mais nada:
//
//   [ ● Meu dia ▾ | ⌕ Buscar ]  [ Mapa | Lista ]
//
// O chip da lente abre a folha da lente (onde moram as lentes, as etapas, o
// Limpar e o Modo sol). O selo de filtro vive DENTRO do chip: é o único aviso de
// que há filtro ligado, e não some enquanto houver. **Sem contagem nenhuma** — o
// número que mudava a cada arraste saiu daqui (prancha §8).
//
// O sino e o avatar saíram: o sino conta falha de sincronização e recado do
// gestor, que não é tarefa da rua, e os dois foram para a aba Eu.
//
// O alternador fica no MESMO PIXEL nas duas vistas: não some, não muda de
// tamanho e não divide espaço com mais nada. É a promessa da prancha §6.
//
// top = área segura + 7 (54 num iPhone de 47 de status bar), 12 px das bordas,
// 48 de altura. O mapa começa atrás: é o mapa que ocupa a tela.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconClose, IconSearch, useIconColors } from '../components/icons';
import { IconChevronDown as SiDown } from '../components/icons';

export const ALTURA_TOPO_CAMPO = 48;
/** Respiro entre a fileira e a faixa da vez. Só existem estas duas posições (prancha §0.1). */
export const RESPIRO_ABAIXO_DA_FILEIRA = 8;

export type VistaDoMapa = 'mapa' | 'lista';

type Props = {
  top: number;
  /** O chip da lente: ponto na cor dela, nome e ▾. Abre a folha da lente. */
  lente?: { rotulo: string; cor: string } | null;
  aoAbrirLentes?: () => void;
  /** Quantos filtros estão ligados. > 0 mostra o selo invertido dentro do chip. */
  filtrosAtivos?: number;
  busca: string;
  aoBuscar: (t: string) => void;
  /** O campo só abre a folha de busca (§6.10); digitar é lá. */
  aoAbrirBusca: () => void;
  buscando: boolean;
  /** O alternador Mapa | Lista. Sem `aoVista` ele não aparece (desktop). */
  vista?: VistaDoMapa;
  aoVista?: (v: VistaDoMapa) => void;
};

export default function TopoCampo({ top, lente = null, aoAbrirLentes, filtrosAtivos = 0, busca, aoBuscar, aoAbrirBusca, buscando, vista, aoVista }: Props) {
  const cores = useIconColors();
  const comFiltro = filtrosAtivos > 0;
  return (
    <View style={[s.fileira, { top }]} accessibilityRole="toolbar">
      <View style={s.campo}>
        {lente && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={comFiltro
              ? `Lente ${lente.rotulo}, ${filtrosAtivos} ${filtrosAtivos === 1 ? 'filtro ligado' : 'filtros ligados'}. Trocar o que o mapa mostra`
              : `Lente ${lente.rotulo}. Trocar o que o mapa mostra`}
            onPress={aoAbrirLentes}
            style={s.lenteAlvo}
          >
            <View style={s.lente}>
              <View style={[s.bolinha, { backgroundColor: lente.cor }]} />
              <Text style={s.lenteTexto} numberOfLines={1}>{lente.rotulo}</Text>
              {comFiltro && (
                <View style={s.seloFiltro}>
                  <Text style={s.seloFiltroTexto}>{filtrosAtivos > 9 ? '9+' : filtrosAtivos}</Text>
                </View>
              )}
              <SiDown width={16} height={16} fill={cores.muted} />
            </View>
          </Pressable>
        )}
        {lente && <View style={s.divisor} />}
        <View style={[s.busca, !lente && s.buscaSozinha]}>
          <IconSearch width={16} height={16} fill={cores.muted} />
          <Pressable
            style={s.buscaAbrir}
            onPress={aoAbrirBusca}
            accessibilityRole="search"
            accessibilityLabel={busca ? `Busca: ${busca}. Abrir busca` : 'Buscar lead, rua ou bairro'}
          >
            <Text style={[s.buscaCampo, !busca && s.buscaVazia]} numberOfLines={1}>{busca || 'Buscar'}</Text>
          </Pressable>
          {buscando && <ActivityIndicator size="small" color={cores.muted} />}
          {busca.length > 0 && !buscando && (
            <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => aoBuscar('')} style={s.limpar}>
              <IconClose width={16} height={16} fill={cores.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {vista && aoVista && (
        <View style={s.alternador} accessibilityRole="tablist">
          {(['mapa', 'lista'] as const).map((v) => {
            const on = vista === v;
            return (
              <Pressable
                key={v}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={v === 'mapa' ? 'Ver no mapa' : 'Ver em lista'}
                onPress={() => aoVista(v)}
                style={[s.segmento, on && s.segmentoOn]}
              >
                <Text style={[s.segmentoTexto, on && s.segmentoTextoOn]}>{v === 'mapa' ? 'Mapa' : 'Lista'}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fileira: {
    position: 'absolute', left: 12, right: 12, height: ALTURA_TOPO_CAMPO, zIndex: 30,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  /* `--pilula-mapa` e `--chip-mapa` são os tokens que o app já tem para o que
     flutua SOBRE o mapa (claro no tema claro, escuro no escuro). A tabela da
     prancha diz `--surface-2`; mantive os do mapa de propósito, porque é para
     isso que eles existem — a regra é "nenhuma cor nova", e nenhuma é. */
  campo: {
    flex: 1, minWidth: 0, height: ALTURA_TOPO_CAMPO,
    flexDirection: 'row', alignItems: 'center', paddingLeft: 4,
    borderRadius: 24, borderWidth: 1, borderColor: 'var(--border)',
    backgroundColor: 'var(--pilula-mapa)',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  // ALVOS DE 48 (handoff v4.1 §13): a barra tem 48 contando a borda; o alvo
  // ocupa a altura toda (margem -1 sobre a borda) e o desenho segue com 40.
  // hitSlop não vale no navegador: o "limpar" tinha 16 px de toque.
  lenteAlvo: { height: 48, marginVertical: -1, justifyContent: 'center', flexShrink: 0, maxWidth: 170 },
  lente: {
    height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10,
    borderRadius: 20, backgroundColor: 'var(--chip-mapa)', flexShrink: 0, maxWidth: 170,
  },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  lenteTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)', flexShrink: 1 },
  /* O ÚNICO AVISO DE FILTRO. Invertido (fundo do texto, texto do fundo), como o
     selecionado do alternador — e não some enquanto houver filtro ligado. */
  seloFiltro: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: 'var(--text)', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  seloFiltroTexto: { fontSize: 11.5, fontWeight: '800', color: 'var(--surface)' },
  divisor: { width: 1, height: 22, backgroundColor: 'var(--border)', marginHorizontal: 2, flexShrink: 0 },
  limpar: { width: 48, height: 48, marginVertical: -1, alignItems: 'center', justifyContent: 'center' },
  busca: { flex: 1, minWidth: 0, height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8 },
  buscaSozinha: { paddingLeft: 12, gap: 10 },
  // era estilo de campo (flex 1 + altura 40) num texto: o "Lead ou rua" ficava grudado no topo da pílula
  buscaCampo: { fontSize: 14, lineHeight: 18, fontWeight: '500', color: 'var(--text)' },
  buscaAbrir: { flex: 1, minWidth: 0, minHeight: 48, marginVertical: -1, justifyContent: 'center' },
  buscaVazia: { color: 'var(--text-muted)' },
  /* MESMO PIXEL NAS DUAS VISTAS (prancha §1): largura fixa, nunca encolhe. */
  alternador: {
    width: 128, height: ALTURA_TOPO_CAMPO, flexShrink: 0, flexDirection: 'row', padding: 3,
    borderRadius: 24, borderWidth: 1, borderColor: 'var(--border)',
    backgroundColor: 'var(--pilula-mapa)',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  segmento: { flex: 1, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  segmentoOn: { backgroundColor: 'var(--text)' },
  segmentoTexto: { fontSize: 13.5, fontWeight: '600', color: 'var(--text-muted)' },
  segmentoTextoOn: { color: 'var(--surface)' },
});
