// Folha "Filtros e outras lentes" (prancha "Mapa do Executivo", §2, 15/10/26): o botão ≡ da
// fileira de lentes abre aqui as lentes que não cabem a 390 px (Reconquista, Clientes, Em queda,
// Sem dono e Calor, só gestor), os filtros e a legenda dos pinos.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import { FILTROS_VAZIOS, type FiltrosNovos, type Lente } from '../utils/lentes';

/* FILTROS DE UM TOQUE (Julyan, 15/10/26: "cadê os outros filtros? o que eles precisam pra vender mais
   com menos cliques, sem poluir a tela"). Os que mais decidem a próxima porta ficam aqui, sem abrir
   a tela de filtros: marcar põe no mapa, desmarcar tira. O resto continua em "Todos os filtros". */
type Rapido = { id: string; rotulo: string; grupo: 'temp' | 'status' | 'visita'; valor: string };
const RAPIDOS: Rapido[] = [
  { id: 'q', rotulo: 'Quentes', grupo: 'temp', valor: 'Q' },
  { id: 'm', rotulo: 'Mornos', grupo: 'temp', valor: 'M' },
  { id: 'f', rotulo: 'Frios', grupo: 'temp', valor: 'F' },
  { id: 'nunca', rotulo: 'Nunca visitados', grupo: 'visita', valor: 'nunca' },
  { id: 'mais', rotulo: 'Sem visita há 30+ dias', grupo: 'visita', valor: 'mais' },
  { id: 'cli', rotulo: 'Clientes', grupo: 'status', valor: 'cliente' },
  { id: 'ex', rotulo: 'Ex-clientes', grupo: 'status', valor: 'ex' },
];
import { IconClose as SiClose } from '../components/icons';

export const COR_LENTE: Record<Lente, string> = {
  dia: '#E51A31', novos: '#C8F31D', carteira: '#F5A524', clientes: '#16A34A', alvo: '#8B5CF6', rec: '#EC4899', queda: '#14B8A6', semdono: '#FACC15', calor: '#F97316',
};

const DESCRICAO: Record<Lente, string> = {
  dia: 'plano, meus leads, recém-abertos, clientes e contas-alvo (apagadas)',
  novos: 'CNPJ aberto há até 90 dias',
  carteira: 'meus leads por etapa',
  clientes: 'clientes ativos · relacionamento',
  alvo: 'nota 4,5+ no Google',
  rec: 'ex-clientes',
  queda: 'faturamento caindo ou sem comanda',
  semdono: 'pode assumir: É meu',
  calor: 'só gestor · 30 dias',
};

const LEGENDA: { cor: string; rotulo: string; tracejado?: boolean; losango?: boolean }[] = [
  { cor: '#E23B3B', rotulo: 'Quente' },
  { cor: '#F5A524', rotulo: 'Morno' },
  { cor: '#0EA5E9', rotulo: 'Frio' },
  { cor: '#C8F31D', rotulo: 'Recém-aberto', losango: true },
  { cor: '#8B5CF6', rotulo: 'Mais avaliado' },
  { cor: '#16A34A', rotulo: 'Cliente' },
  { cor: '#EC4899', rotulo: 'Ex-cliente' },
  { cor: '#4B5563', rotulo: 'Perdido' },
  { cor: '#FACC15', rotulo: 'Sem dono', tracejado: true },
];

type Props = {
  visivel: boolean;
  aoFechar: () => void;
  lentes: { id: Lente; rotulo: string }[];
  atual: Lente;
  aoEscolher: (l: Lente) => void;
  filtrosAtivos: number;
  aoFiltros: () => void;
  /** Os filtros de agora e a troca direta (filtros de um toque). */
  filtros?: FiltrosNovos;
  aoFiltrosRapidos?: (f: FiltrosNovos) => void;
  /** "Modo sol · mapa claro": controle do mapa que veio do menu do avatar (29/10/26). */
  /** Meta da semana de Recém-abertos ("2/5"): mora aqui, não na pílula — é meta com dono. */
  contadorNovos?: string | null;
  modoSol?: boolean;
  aoModoSol?: () => void;
};

export default function FolhaLentes({ visivel, aoFechar, lentes, atual, aoEscolher, filtrosAtivos, aoFiltros, filtros, aoFiltrosRapidos, contadorNovos = null, modoSol, aoModoSol }: Props) {
  const marcado = (r: Rapido) => !!filtros && (filtros[r.grupo] as Set<string>).has(r.valor);
  const alternar = (r: Rapido) => {
    if (!filtros || !aoFiltrosRapidos) return;
    const conj = new Set(filtros[r.grupo] as Set<string>);
    if (conj.has(r.valor)) conj.delete(r.valor); else conj.add(r.valor);
    aoFiltrosRapidos({ ...filtros, [r.grupo]: conj } as FiltrosNovos);
  };
  return (
    <Painel visivel={visivel} aoFechar={aoFechar} rotulo={lentes.length ? 'O que o mapa mostra' : 'Filtros'} topo={
      <View style={s.topo}>
        <Text style={s.titulo}>{lentes.length ? 'O que o mapa mostra' : 'Filtros'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fechar}>
          <SiClose width={20} height={20} fill="var(--text-muted)" />
        </Pressable>
      </View>
    }>
      <View style={s.corpo}>
        {lentes.length > 0 && <View style={s.grade}>
          {lentes.map((l) => {
            const ativa = l.id === atual;
            return (
              <Pressable
                key={l.id}
                accessibilityRole="button"
                accessibilityState={{ selected: ativa }}
                accessibilityLabel={`Lente ${l.rotulo}: ${DESCRICAO[l.id]}`}
                onPress={() => { aoEscolher(l.id); aoFechar(); }}
                style={[s.lente, ativa && s.lenteAtiva]}
              >
                <View style={s.lenteLinha}>
                  <View style={[s.bolinha, { backgroundColor: COR_LENTE[l.id] }]} />
                  <Text style={s.lenteNome} numberOfLines={1}>{l.rotulo}</Text>
                  {l.id === 'novos' && !!contadorNovos && <Text style={s.lenteMeta}>{contadorNovos}</Text>}
                </View>
                <Text style={s.lenteDesc} numberOfLines={2}>{DESCRICAO[l.id]}</Text>
              </Pressable>
            );
          })}
        </View>}

        {filtros && aoFiltrosRapidos && (
          <View style={{ gap: 8 }}>
            <Text style={s.secao}>FILTRO DE UM TOQUE · MARCAR PÕE NO MAPA</Text>
            <View style={s.rapidos}>
              {RAPIDOS.map((r) => {
                const on = marcado(r);
                return (
                  <Pressable key={r.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => alternar(r)}
                    style={[s.rapido, on && s.rapidoOn]}>
                    <Text style={[s.rapidoTexto, on && s.rapidoTextoOn]}>{on ? `${r.rotulo} ✓` : r.rotulo}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* LIMPAR (29/10/26): a pílula "Limpar" que ficava sobre o mapa saiu com a pilha do topo.
            Sem isto, desligar filtro viraria caçar chip por chip — e o selo do chip da lente
            avisaria de um filtro que custa caro tirar. */}
        {filtrosAtivos > 0 && aoFiltrosRapidos && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Limpar os ${filtrosAtivos} filtros`}
            onPress={() => aoFiltrosRapidos(FILTROS_VAZIOS)} style={s.limpar}>
            <Text style={s.limparTexto}>{`Limpar os ${filtrosAtivos} filtros`}</Text>
          </Pressable>
        )}

        {/* a folha dos filtros abre depois que esta fecha (as duas são Painel: no mesmo render o voltar de uma fechava a outra) */}
        <Pressable accessibilityRole="button" onPress={() => { aoFechar(); setTimeout(aoFiltros, 350); }} style={s.filtros}>
          <Text style={s.filtrosTexto}>{filtrosAtivos ? `Todos os filtros · ${filtrosAtivos} ${filtrosAtivos === 1 ? 'ativo' : 'ativos'}` : 'Todos os filtros'}</Text>
          <Text style={s.filtrosSub}>etapa, temperatura, tempo sem toque, origem, dono, visitado</Text>
        </Pressable>

        {/* MODO SOL mora aqui desde 29/10 (prancha "Mapa limpo", resposta 7): é um controle DO
            MAPA e vivia no menu do avatar. Com o avatar fora do mapa, ele viraria três toques
            justamente na hora em que a pessoa está com sol na tela. Esta folha é a que fala
            sobre o que o mapa mostra, então é a casa dele. */}
        {aoModoSol && (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!modoSol }} onPress={aoModoSol} style={s.sol}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.solTexto}>Modo sol · mapa claro</Text>
              <Text style={s.solSub}>para ler na calçada ao meio-dia</Text>
            </View>
            <View style={[s.chave, modoSol && s.chaveOn]}>
              <View style={[s.chaveBola, modoSol && s.chaveBolaOn]} />
            </View>
          </Pressable>
        )}

        <Text style={s.secao}>LEGENDA</Text>
        <View style={s.legenda}>
          {LEGENDA.map((i) => (
            <View key={i.rotulo} style={s.legItem}>
              <View style={[s.legDisco, i.tracejado
                ? { backgroundColor: 'transparent', borderWidth: 2, borderStyle: 'dashed', borderColor: i.cor }
                : i.losango ? { backgroundColor: i.cor, borderRadius: 2, width: 12, height: 12, transform: [{ rotate: '45deg' }] } : { backgroundColor: i.cor }]} />
              <Text style={s.legTexto}>{i.rotulo}</Text>
            </View>
          ))}
        </View>
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  lenteMeta: { fontSize: 12, fontWeight: '800', color: 'var(--text-muted)' },
  limpar: { minHeight: 44, justifyContent: 'center' },
  limparTexto: { fontSize: 14, fontWeight: '600', color: 'var(--vermelho-texto)' },
  sol: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  solTexto: { fontSize: 14.5, fontWeight: '600', color: 'var(--text)' },
  solSub: { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1 },
  chave: { width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: 'var(--surface-3)', borderWidth: 1, borderColor: 'var(--border)', flexShrink: 0 },
  chaveOn: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  chaveBola: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'var(--text-muted)' },
  chaveBolaOn: { backgroundColor: 'var(--surface)', marginLeft: 18 },
  topo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  titulo: { flex: 1, fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  fecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lente: {
    width: '48.5%', minHeight: 64, padding: 12, gap: 4, borderRadius: 14,
    backgroundColor: 'var(--surface-2)', borderWidth: 1, borderColor: 'var(--border)',
  },
  lenteAtiva: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)', borderWidth: 1.5 },
  lenteLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bolinha: { width: 8, height: 8, borderRadius: 4 },
  lenteNome: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  lenteDesc: { fontSize: 12, color: 'var(--text-muted)' },
  filtros: {
    minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, justifyContent: 'center',
    backgroundColor: 'var(--surface-2)', borderWidth: 1, borderColor: 'var(--border)',
  },
  filtrosTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  filtrosSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  rapidos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rapido: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center', backgroundColor: 'var(--surface-2)' },
  rapidoOn: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  rapidoTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  rapidoTextoOn: { color: 'var(--bg)' },
  secao: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--text-faint)' },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 14 },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 90 },
  legDisco: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#fff' },
  legTexto: { fontSize: 13, color: 'var(--text)' },
});
