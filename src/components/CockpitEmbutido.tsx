// Uma tela do Cockpit dentro do app, sem o cabeçalho dele (Um app só, 04/10/2026).
//
// Para o que é complexo, de mesa e já funciona no Cockpit — o editor da semana do
// Planejamento e o kanban do funil no computador — o app abre a própria tela do Cockpit
// com `?embutido=<aba>`: a mesma regra de gravação, a mesma sessão (mesmo domínio), e o
// executivo não sai do app. Ao fechar, quem abriu recarrega o que pode ter mudado.
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconClose, useIconColors } from './icons';

export type AbaEmbutida = 'planejamento' | 'funil' | 'propostas' | 'desenvolvimento';

export function enderecoEmbutido(aba: AbaEmbutida, extra = ''): string {
  return `/gestao/cockpit/?embutido=${aba}${extra}#/${aba}`;
}

/** Só o miolo (para encaixar numa coluna do computador). */
export function QuadroEmbutido({ aba, extra, altura }: { aba: AbaEmbutida; extra?: string; altura?: number | string }) {
  const [carregou, setCarregou] = useState(false);
  return (
    <View style={[s.quadro, altura != null && { height: altura as number }]}>
      {!carregou && (
        <View style={s.carregando}><ActivityIndicator /><Text style={s.carregandoTexto}>Abrindo…</Text></View>
      )}
      {React.createElement('iframe', {
        src: enderecoEmbutido(aba, extra),
        title: aba,
        onLoad: () => setCarregou(true),
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: 'transparent' },
      })}
    </View>
  );
}

export default function CockpitEmbutido({ aba, extra, titulo, visivel, aoFechar }: {
  aba: AbaEmbutida; extra?: string; titulo: string; visivel: boolean; aoFechar: () => void;
}) {
  const cores = useIconColors();
  if (!visivel) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={aoFechar} transparent={false}>
      <View style={s.tela}>
        <View style={s.topo}>
          <Text style={s.titulo} numberOfLines={1}>{titulo}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fechar}>
            <IconClose width={22} height={22} fill={cores.onSurface} />
          </Pressable>
        </View>
        <QuadroEmbutido aba={aba} extra={extra} />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)' },
  titulo: { flex: 1, fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  quadro: { flex: 1, position: 'relative', backgroundColor: 'var(--bg)' },
  carregando: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  carregandoTexto: { fontSize: 13, color: 'var(--text-muted)' },
});
