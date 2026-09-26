// Folha da lente Calor no celular (prompt final §5; só o gestor — Julyan 26/09).
//
// Antes dela a lente mostrava só as manchas no celular: o controle (vendedor,
// escala) morava no painel do desktop, e a folha "Agora, perto de você" some
// nesta lente. Aqui: últimos 30 dias, Time / Só eu, lista POR VENDEDOR com o
// nome do cadastro e o apelido antigo, "Ninguém foi" e quantos check-ins sem
// GPS ficaram fora da mancha.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type VendedorCalor = { id: string; nome: string; apelidos: string[]; count: number };

type Props = {
  chao: number;
  escopo: 'time' | 'eu';
  aoEscopo: (e: 'time' | 'eu') => void;
  vendedores: VendedorCalor[];
  vendedor: string | null;
  aoVendedor: (id: string | null) => void;
  total: number;
  ninguemFoi: number;
  semGps30d: number | null;
  carregando: boolean;
  aoMedir?: (medida: { y: number; altura: number }) => void;
};

const ESCALA = ['#FDE68A', '#FB923C', '#EF4444', '#991B1B'];

export default function FolhaCalor({
  chao, escopo, aoEscopo, vendedores, vendedor, aoVendedor, total, ninguemFoi, semGps30d, carregando, aoMedir,
}: Props) {
  const linha = (id: string | null, nome: string, apelidos: string[], n: number) => {
    const ativo = vendedor === id;
    return (
      <Pressable
        key={id ?? 'todos'}
        accessibilityRole="radio"
        accessibilityState={{ checked: ativo }}
        onPress={() => aoVendedor(id)}
        style={[s.linha, ativo && s.linhaAtiva]}
      >
        <View style={[s.radio, ativo && s.radioAtivo]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.nome} numberOfLines={1}>{nome}</Text>
          {apelidos.length > 0 && <Text style={s.apelido} numberOfLines={1}>{`era "${apelidos.join('", "')}"`}</Text>}
        </View>
        <Text style={s.contagem}>{n}</Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[s.folha, { bottom: chao }]}
      accessibilityLabel="Calor de visitas"
      onLayout={(e) => {
        const alvo = (e.nativeEvent as unknown as { target?: { getBoundingClientRect?: () => DOMRect } }).target;
        const topo = alvo?.getBoundingClientRect ? alvo.getBoundingClientRect().top : e.nativeEvent.layout.y;
        aoMedir?.({ y: Math.round(topo), altura: Math.round(e.nativeEvent.layout.height) });
      }}
    >
      <View style={s.topo}>
        <Text style={s.kicker}>CALOR · ÚLTIMOS 30 DIAS</Text>
        <Text style={s.total}>{carregando ? 'carregando…' : `${total} ${total === 1 ? 'check-in' : 'check-ins'} com GPS`}</Text>
      </View>

      <View style={s.seletor} accessibilityRole="tablist">
        {([['time', 'Time'], ['eu', 'Só eu']] as const).map(([id, rotulo]) => (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: escopo === id }} onPress={() => aoEscopo(id)}
            style={[s.seletorItem, escopo === id && s.seletorAtivo]}>
            <Text style={[s.seletorTexto, escopo === id && s.seletorTextoAtivo]}>{rotulo}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.legenda}>
        <View style={s.escala}>{ESCALA.map((c) => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}</View>
        <Text style={s.legendaTexto}>menos → mais visitas</Text>
        <View style={s.ninguem} />
        <Text style={s.legendaTexto}>{`Ninguém foi · ${ninguemFoi}`}</Text>
      </View>

      {escopo === 'time' && (
        <ScrollView style={s.lista} nestedScrollEnabled>
          {linha(null, 'Todos', [], vendedores.reduce((n, v) => n + v.count, 0))}
          {vendedores.map((v) => linha(v.id, v.nome, v.apelidos, v.count))}
          {!carregando && vendedores.length === 0 && <Text style={s.vazio}>Nenhum check-in com GPS nos últimos 30 dias.</Text>}
        </ScrollView>
      )}

      {semGps30d != null && semGps30d > 0 && (
        <Text style={s.rodape}>{`${semGps30d} ${semGps30d === 1 ? 'check-in' : 'check-ins'} sem GPS no local (declarados ou sem coordenada) não entram na mancha.`}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  folha: {
    position: 'absolute', left: 0, right: 0, zIndex: 20,
    backgroundColor: 'var(--surface)', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 10, maxHeight: '55%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
  topo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: 'var(--brand-text)' },
  total: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  seletor: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: 'var(--surface-2)' },
  seletorItem: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  seletorAtivo: { backgroundColor: '#C8131B' },
  seletorTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text-muted)' },
  seletorTextoAtivo: { color: '#FFFFFF' },
  legenda: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  escala: { width: 72, height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  legendaTexto: { fontSize: 12, color: 'var(--text-muted)' },
  ninguem: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: '#60A5FA', marginLeft: 6 },
  lista: { maxHeight: 220 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 4, borderRadius: 8 },
  linhaAtiva: { backgroundColor: 'var(--surface-2)' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'var(--stroke-strong)' },
  radioAtivo: { borderColor: '#C8131B', backgroundColor: '#C8131B' },
  nome: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  apelido: { fontSize: 11, color: 'var(--text-faint)' },
  contagem: { fontSize: 13, fontWeight: '800', color: 'var(--text-muted)', fontVariant: ['tabular-nums'] },
  vazio: { fontSize: 13, color: 'var(--text-muted)', paddingVertical: 8 },
  rodape: { fontSize: 12, lineHeight: 16, color: 'var(--tint-amber-text)' },
});
