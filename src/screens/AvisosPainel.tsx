// Folha do sino de Avisos (handoff v4.1 §6.11). Na ordem do que custa venda:
// 1. envio que não subiu (o trabalho do dia pode não ter chegado ao HubSpot);
// 2. a fila de Tarefas: "N na fila · M para agora", o MESMO número do selo da aba (S1, handoff
//    das abas 04/10/26 — antes contava as atrasadas do HubSpot e divergia do selo);
// 3. recados do gestor.
// O motor das contas-alvo saiu em 26/09: conta inativa sai do mapa, não vira lista.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import { IconChevronRight, IconClose, useIconColors } from '../components/icons';
import type { AvisoGestor } from '../hooks/useAvisos';
import type { ItemFila } from '../utils/filaOffline';

type Props = {
  aoFechar: () => void;
  falhas: ItemFila[];
  /** Negócios na fila de Tarefas (o selo da aba); null = a fila ainda não chegou. */
  naFila: number | null;
  /** Da fila, quantos estão no grupo "Agora". */
  paraAgora: number | null;
  gestor: AvisoGestor[];
  carregando: boolean;
  aoTentarDeNovo: () => void;
  aoAbrirTarefas: () => void;
};

export default function AvisosPainel({
  aoFechar, falhas, naFila, paraAgora, gestor, carregando, aoTentarDeNovo, aoAbrirTarefas,
}: Props) {
  const cores = useIconColors();
  const nada = !falhas.length && !naFila && !gestor.length;
  return (
    <Painel visivel aoFechar={aoFechar} rotulo="Avisos" topo={
      <View style={s.topo}>
        <Text style={s.titulo}>Avisos</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar avisos" onPress={aoFechar} style={s.fechar}>
          <IconClose width={20} height={20} fill={cores.muted} />
        </Pressable>
      </View>
    }>
      <View style={s.corpo}>
        {falhas.length > 0 && (
          <View style={[s.bloco, s.blocoErro]}>
            <Text style={s.blocoTitulo}>{`${falhas.length} ${falhas.length === 1 ? 'envio não subiu' : 'envios não subiram'}`}</Text>
            {falhas.slice(0, 5).map((f) => (
              <Text key={f.acaoId} style={s.linhaPequena} numberOfLines={1}>{`${f.rotulo}${f.erro ? ` — ${f.erro}` : ''}`}</Text>
            ))}
            <Pressable accessibilityRole="button" onPress={aoTentarDeNovo} style={s.botao}>
              <Text style={s.botaoTexto}>Tentar de novo</Text>
            </Pressable>
          </View>
        )}

        {!!naFila && (
          <Pressable accessibilityRole="button" onPress={aoAbrirTarefas} style={[s.bloco, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={s.blocoTitulo}>{`${naFila} na fila de Tarefas${paraAgora ? ` · ${paraAgora} para agora` : ''}`}</Text>
              <Text style={s.linhaPequena}>o mesmo número da aba</Text>
            </View>
            <IconChevronRight width={20} height={20} fill={cores.muted} />
          </Pressable>
        )}

        {gestor.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={s.secao}>DO GESTOR</Text>
            {gestor.map((g) => (
              <View key={g.id} style={s.item}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.itemTexto} numberOfLines={g.pessoal ? 8 : 2}>{g.titulo}</Text>
                  <Text style={s.linhaPequena}>
                    {[g.autor, new Date(g.em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {nada && (
          <Text style={s.vazio}>
            {carregando ? 'Carregando…' : 'Nada novo. Envio que não subir e recado do gestor aparecem aqui.'}
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
  corpo: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  bloco: { padding: 14, gap: 4, borderRadius: 12, backgroundColor: 'var(--surface-2)', borderWidth: 1, borderColor: 'var(--border)' },
  blocoErro: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  blocoTitulo: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  linhaPequena: { fontSize: 12, lineHeight: 16, color: 'var(--text-muted)' },
  botao: { marginTop: 8, minHeight: 44, borderRadius: 10, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  botaoTexto: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  secao: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: 'var(--text-faint)' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)' },
  itemTexto: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: 'var(--text)' },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)', textAlign: 'center', paddingVertical: 24 },
});
