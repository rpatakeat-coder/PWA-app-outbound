// Folha de lentes, filtros e legenda (handoff v4.1 §6.9). Saiu do topo: a
// linha de pílulas roubava 56 px do mapa o dia inteiro para uma escolha que
// se faz poucas vezes por dia.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import type { Lente } from '../utils/lentes';

export const COR_LENTE: Record<Lente, string> = {
  dia: '#E51A31', carteira: '#F5A524', alvo: '#8B5CF6', rec: '#EC4899', semdono: '#FACC15', calor: '#F97316',
};

const DESCRICAO: Record<Lente, string> = {
  dia: 'plano + microrrota',
  carteira: 'meus leads por etapa',
  alvo: 'prospecção aprovada',
  rec: 'ex-clientes',
  semdono: 'pode assumir: É meu',
  calor: 'só gestor · 30 dias',
};

const LEGENDA: { cor: string; rotulo: string; tracejado?: boolean }[] = [
  { cor: '#E23B3B', rotulo: 'Quente' },
  { cor: '#F5A524', rotulo: 'Morno' },
  { cor: '#0EA5E9', rotulo: 'Frio' },
  { cor: '#16A34A', rotulo: 'Cliente' },
  { cor: '#EC4899', rotulo: 'Ex-cliente' },
  { cor: '#8B5CF6', rotulo: 'Conta-alvo' },
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
};

export default function FolhaLentes({ visivel, aoFechar, lentes, atual, aoEscolher, filtrosAtivos, aoFiltros }: Props) {
  return (
    <Painel visivel={visivel} aoFechar={aoFechar} rotulo="Lentes, filtros e legenda" topo={
      <View style={s.topo}>
        <Text style={s.titulo}>O que o mapa destaca</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fechar}>
          <Text style={s.fecharTexto}>✕</Text>
        </Pressable>
      </View>
    }>
      <View style={s.corpo}>
        <View style={s.grade}>
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
                </View>
                <Text style={s.lenteDesc} numberOfLines={2}>{DESCRICAO[l.id]}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable accessibilityRole="button" onPress={() => { aoFechar(); aoFiltros(); }} style={s.filtros}>
          <Text style={s.filtrosTexto}>{filtrosAtivos ? `Filtros · ${filtrosAtivos} ativos` : 'Filtros'}</Text>
          <Text style={s.filtrosSub}>etapa, temperatura, tempo sem toque, origem, dono, visitado</Text>
        </Pressable>

        <Text style={s.secao}>LEGENDA</Text>
        <View style={s.legenda}>
          {LEGENDA.map((i) => (
            <View key={i.rotulo} style={s.legItem}>
              <View style={[s.legDisco, i.tracejado
                ? { backgroundColor: 'transparent', borderWidth: 2, borderStyle: 'dashed', borderColor: i.cor }
                : { backgroundColor: i.cor }]} />
              <Text style={s.legTexto}>{i.rotulo}</Text>
            </View>
          ))}
        </View>
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
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
  lenteAtiva: { backgroundColor: '#3A1519', borderColor: '#E51A31', borderWidth: 1.5 },
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
  secao: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--text-faint)' },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 14 },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 90 },
  legDisco: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#fff' },
  legTexto: { fontSize: 13, color: 'var(--text)' },
});
