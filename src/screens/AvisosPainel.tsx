// Folha do sino de Avisos (prompt final §8.10). Três blocos, na ordem do que
// custa venda: envio que não subiu (o trabalho do dia pode não ter chegado ao
// HubSpot), conta-alvo que o motor viu fechar (não mandar ninguém lá), e o
// atalho para as cobranças atrasadas (que moram na aba Tarefas).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import { textoDoMotor, type AvisoMotor } from '../hooks/useAvisos';
import type { ItemFila } from '../utils/filaOffline';

type Props = {
  aoFechar: () => void;
  motor: AvisoMotor[];
  vistoEm: number;
  falhas: ItemFila[];
  cobrancasAtrasadas: number;
  carregando: boolean;
  aoAbrirLead: (id: string) => void;
  aoTentarDeNovo: () => void;
  aoAbrirTarefas: () => void;
};

export default function AvisosPainel({
  aoFechar, motor, vistoEm, falhas, cobrancasAtrasadas, carregando, aoAbrirLead, aoTentarDeNovo, aoAbrirTarefas,
}: Props) {
  const nada = !falhas.length && !motor.length && !cobrancasAtrasadas;
  return (
    <Painel visivel aoFechar={aoFechar} rotulo="Avisos" topo={
      <View style={s.topo}>
        <Text style={s.titulo}>Avisos</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar avisos" onPress={aoFechar} style={s.fechar}>
          <Text style={s.fecharTexto}>✕</Text>
        </Pressable>
      </View>
    }>
      <View style={s.corpo}>
        {falhas.length > 0 && (
          <View style={[s.bloco, s.blocoErro]}>
            <Text style={s.blocoTitulo}>{`${falhas.length} ${falhas.length === 1 ? 'envio não subiu' : 'envios não subiram'}`}</Text>
            {falhas.slice(0, 5).map((f) => (
              <Text key={f.acaoId} style={s.linhaPequena} numberOfLines={1}>{`• ${f.rotulo}${f.erro ? ` — ${f.erro}` : ''}`}</Text>
            ))}
            <Pressable accessibilityRole="button" onPress={aoTentarDeNovo} style={s.botao}>
              <Text style={s.botaoTexto}>Tentar de novo</Text>
            </Pressable>
          </View>
        )}

        {cobrancasAtrasadas > 0 && (
          <Pressable accessibilityRole="button" onPress={aoAbrirTarefas} style={s.bloco}>
            <Text style={s.blocoTitulo}>{`${cobrancasAtrasadas} ${cobrancasAtrasadas === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}`}</Text>
            <Text style={s.linhaPequena}>Estão na aba Tarefas ›</Text>
          </Pressable>
        )}

        {motor.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={s.secao}>MOTOR DAS CONTAS-ALVO · ÚLTIMOS 30 DIAS</Text>
            {motor.map((a) => {
              const novo = Date.parse(a.em) > vistoEm;
              return (
                <Pressable key={a.id} accessibilityRole="button" onPress={() => aoAbrirLead(a.id)} style={[s.item, novo && s.itemNovo]}>
                  {novo && <View style={s.ponto} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.itemTexto} numberOfLines={2}>{textoDoMotor(a)}</Text>
                    {!!a.cidade && <Text style={s.linhaPequena}>{`${a.cidade} · tocar para ver e descartar`}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {nada && (
          <Text style={s.vazio}>
            {carregando ? 'Carregando…' : 'Nada novo. O motor confere as contas-alvo toda madrugada e avisa aqui quando uma fecha.'}
          </Text>
        )}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  titulo: { flex: 1, fontSize: 20, fontWeight: '800', color: 'var(--text)' },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  fecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  bloco: { padding: 14, gap: 4, borderRadius: 12, backgroundColor: 'var(--surface-2)', borderWidth: 1, borderColor: 'var(--border)' },
  blocoErro: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  blocoTitulo: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  linhaPequena: { fontSize: 12, lineHeight: 16, color: 'var(--text-muted)' },
  botao: { marginTop: 8, minHeight: 44, borderRadius: 10, backgroundColor: '#C8131B', alignItems: 'center', justifyContent: 'center' },
  botaoTexto: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  secao: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: 'var(--text-faint)' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)' },
  itemNovo: { borderColor: 'var(--tint-amber-border)' },
  ponto: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' },
  itemTexto: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: 'var(--text)' },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)', textAlign: 'center', paddingVertical: 24 },
});
