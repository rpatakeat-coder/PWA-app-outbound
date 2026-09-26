// "Meu dia em números" (handoff v4.1 §6.12): quanto falta para a meta, o que
// foi prometido na Daily e onde estão as próximas portas boas. Curto de
// propósito — o painel completo fica no Cockpit.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import type { MeuDia } from '../hooks/useMeuDia';

type Props = {
  visivel: boolean;
  aoFechar: () => void;
  dados: MeuDia | undefined;
  carregando: boolean;
  metaPadrao: number;
  portasNaMicrorrota: number;
  proxima: { nome: string } | null;
  aoIrProxima: () => void;
};

function Barra({ rotulo, feito, meta }: { rotulo: string; feito: number; meta: number }) {
  const pct = meta > 0 ? Math.min(1, feito / meta) : 0;
  return (
    <View style={s.barraBloco}>
      <View style={s.barraTopo}>
        <Text style={s.barraRotulo}>{rotulo}</Text>
        <Text style={s.barraNum}>{`${feito}/${meta}`}</Text>
      </View>
      <View style={s.trilho}><View style={[s.preenchido, { width: `${pct * 100}%` }, pct >= 1 && s.batido]} /></View>
    </View>
  );
}

export default function FolhaMeuDia({ visivel, aoFechar, dados, carregando, metaPadrao, portasNaMicrorrota, proxima, aoIrProxima }: Props) {
  const meta = dados?.prometido?.visitas && dados.prometido.visitas > 0 ? dados.prometido.visitas : metaPadrao;
  const faltam = dados ? Math.max(0, meta - dados.visitasHoje) : null;
  const frase = faltam == null ? null
    : faltam === 0 ? `Meta de visitas batida. ${portasNaMicrorrota ? `Ainda há ${portasNaMicrorrota} portas boas na microrrota.` : 'Siga para a próxima porta.'}`
    : `Faltam ${faltam} ${faltam === 1 ? 'visita' : 'visitas'}. ${portasNaMicrorrota ? `Tem ${portasNaMicrorrota} ${portasNaMicrorrota === 1 ? 'porta boa' : 'portas boas'} na sua microrrota agora.` : 'Abra a lente Meu dia para achar a próxima porta.'}`;
  const p = dados?.prometido;
  return (
    <Painel visivel={visivel} aoFechar={aoFechar} rotulo="Meu dia em números" topo={
      <View style={s.topo}>
        <Text style={s.titulo}>Meu dia</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fechar}><Text style={s.fecharTexto}>✕</Text></Pressable>
      </View>
    }>
      <View style={s.corpo}>
        {carregando || !dados ? <ActivityIndicator /> : (
          <>
            <Barra rotulo={p?.visitas ? 'Visitas hoje · prometido na Daily' : 'Visitas hoje · meta do playbook'} feito={dados.visitasHoje} meta={meta} />
            {!!frase && <Text style={s.frase}>{frase}</Text>}
            <View style={s.linha}>
              <Text style={s.linhaRotulo}>Reuniões</Text>
              <Text style={s.linhaValor}>{`${dados.reunioesMarcadasHoje} marcadas hoje · ${dados.reunioesParaHoje} na agenda de hoje`}</Text>
            </View>
            <View style={s.linha}>
              <Text style={s.linhaRotulo}>Daily</Text>
              <Text style={s.linhaValor}>
                {p ? [p.visitas ? `${p.visitas} visitas` : null, p.avancos ? `${p.avancos} avanços` : null, p.propostas ? `${p.propostas} propostas` : null].filter(Boolean).join(' · ') || 'prometido sem números'
                  : 'ainda não fechada no Cockpit hoje'}
              </Text>
            </View>
            <View style={s.linha}>
              <Text style={s.linhaRotulo}>Sequência</Text>
              <Text style={s.linhaValor}>{dados.sequenciaDias ? `${dados.sequenciaDias} ${dados.sequenciaDias === 1 ? 'dia com rua' : 'dias seguidos com rua'}` : 'comece hoje'}</Text>
            </View>
            {proxima && (
              <Pressable accessibilityRole="button" onPress={() => { aoFechar(); aoIrProxima(); }} style={s.botao}>
                <Text style={s.botaoTexto} numberOfLines={1}>{`Ir para a próxima porta · ${proxima.nome}`}</Text>
              </Pressable>
            )}
            <Text style={s.nota}>O painel completo (funil, placar, semana) fica no Cockpit.</Text>
          </>
        )}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  titulo: { flex: 1, fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  fecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  barraBloco: { gap: 6 },
  barraTopo: { flexDirection: 'row', justifyContent: 'space-between' },
  barraRotulo: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  barraNum: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  trilho: { height: 8, borderRadius: 4, backgroundColor: 'var(--surface-2)', overflow: 'hidden' },
  preenchido: { height: 8, borderRadius: 4, backgroundColor: '#E51A31' },
  batido: { backgroundColor: '#16A34A' },
  frase: { fontSize: 14, fontWeight: '600', color: 'var(--text)', lineHeight: 20 },
  linha: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  linhaRotulo: { width: 86, fontSize: 13, color: 'var(--text-muted)' },
  linhaValor: { flex: 1, fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  botao: { height: 56, borderRadius: 16, backgroundColor: '#E51A31', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botaoTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  nota: { fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' },
});
