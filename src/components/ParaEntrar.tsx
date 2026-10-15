// O BLOCO "PARA ENTRAR" (prancha "Mapa do Executivo", §4, 15/10/26) e a folha da fala pronta.
//
// O mapa diz ONDE; a folha diz COM O QUÊ. Uma arma por folha, logo abaixo do nome: o motivo
// (montado com o dado) e, na folha aberta, a fala do Playbook entre aspas. Na espiada da próxima
// porta, só o motivo, com "Fala pronta ›". Tocar no link abre a página do gatilho (fala, "se ele
// insistir" e o que marcar no registro) por cima do mapa, sem sair da rua — e conta como
// fala_aberta (decisão 6).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Painel } from './Painel';
import { IconClose } from './icons';
import { useIconColors } from './icons';
import { paginasDeGatilho } from '../hooks/useArmaDoPino';
import { preencherFala, type Arma } from '../utils/armasDoMapa';

type Props = {
  arma: Arma;
  /** Espiada: só o motivo, com "Fala pronta ›". */
  compacto?: boolean;
  /** Kicker trocado ("ESCOLHIDA POR" na porta sugerida depois do plano). */
  kicker?: string;
  /** Texto no lugar do motivo (as parcelas da porta sugerida). */
  motivo?: string;
  aoAbrirFala?: (a: Arma) => void;
};

export function BlocoParaEntrar({ arma, compacto = false, kicker, motivo, aoAbrirFala }: Props) {
  const link = compacto ? 'Fala pronta ›' : 'Playbook ›';
  const abrir = aoAbrirFala ? () => aoAbrirFala(arma) : undefined;
  return (
    <Pressable accessibilityRole={abrir ? 'button' : undefined} disabled={!abrir} onPress={abrir}
      accessibilityLabel={`${kicker ?? arma.kicker}: ${motivo ?? arma.motivo}.${abrir ? ` ${link.replace(' ›', '')}` : ''}`}
      style={({ pressed }) => [s.bloco, pressed && { opacity: 0.85 }]}>
      <View style={s.topo}>
        <Text style={s.kicker} numberOfLines={1}>{kicker ?? arma.kicker}</Text>
        {abrir && <Text style={s.link} numberOfLines={1}>{link}</Text>}
      </View>
      <Text style={s.motivo} numberOfLines={compacto ? 2 : 3}>{motivo ?? arma.motivo}</Text>
      {!compacto && !!arma.fala && <Text style={s.fala}>{`“${arma.fala}”`}</Text>}
    </Pressable>
  );
}

/** A página do gatilho no Playbook (as 9 páginas de PLAYBOOK-gatilhos.md), por cima do mapa. */
export function FolhaFalaPronta({ arma, aoFechar }: { arma: Arma | null; aoFechar: () => void }) {
  const cores = useIconColors();
  if (!arma) return null;
  const pg = paginasDeGatilho()[arma.gatilho];
  const insistir = preencherFala(pg.insistir.texto, { dor: /reclama de (.+)$/i.exec(arma.motivo)?.[1] ?? null });
  return (
    <Painel visivel aoFechar={aoFechar} rotulo={`Playbook · ${pg.titulo}`} topo={
      <View style={s.folhaTopo}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.folhaKicker}>{`PLAYBOOK · NA PORTA · ${arma.gatilho} DE 9`}</Text>
          <Text style={s.folhaTitulo}>{pg.titulo}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fechar}>
          <IconClose width={20} height={20} fill={cores.muted} />
        </Pressable>
      </View>
    }>
      <View style={s.folhaCorpo}>
        <Text style={s.motivoGrande}>{arma.motivo}</Text>
        <View style={s.falaCaixa}>
          <Text style={s.secao}>FALA PRONTA</Text>
          <Text style={s.falaGrande}>{`“${arma.fala}”`}</Text>
        </View>
        {!!arma.referencia && <Text style={s.texto}>{arma.referencia}</Text>}
        <View style={{ gap: 4 }}>
          <Text style={s.secao}>{`SE ELE INSISTIR ("${pg.insistir.quando.toUpperCase()}")`}</Text>
          <Text style={s.texto}>{`“${insistir}”`}</Text>
        </View>
        <View style={{ gap: 4 }}>
          <Text style={s.secao}>O QUE MARCAR NO REGISTRO</Text>
          <Text style={s.texto}>{pg.marcar}</Text>
        </View>
        {!!pg.extra && <Text style={s.nota}>{pg.extra}</Text>}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  bloco: {
    borderRadius: 14, borderWidth: 1.5, borderColor: 'var(--arma-borda)', backgroundColor: 'var(--arma-fundo)',
    paddingVertical: 9, paddingHorizontal: 12, gap: 3,
  },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.88, color: 'var(--arma-kicker)', flexShrink: 1 },
  link: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)', textDecorationLine: 'underline', flexShrink: 0 },
  motivo: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: 'var(--text)' },
  fala: { fontSize: 13.5, lineHeight: 20, fontWeight: '500', color: 'var(--text-muted)' },
  folhaTopo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 8 },
  folhaKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.88, color: 'var(--arma-kicker)' },
  folhaTitulo: { fontSize: 19, fontWeight: '700', color: 'var(--text)', marginTop: 2 },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  folhaCorpo: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  motivoGrande: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: 'var(--text)' },
  falaCaixa: { borderRadius: 14, borderWidth: 1.5, borderColor: 'var(--arma-borda)', backgroundColor: 'var(--arma-fundo)', padding: 12, gap: 4 },
  falaGrande: { fontSize: 17, lineHeight: 25, fontWeight: '600', color: 'var(--text)' },
  secao: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.66, color: 'var(--text-muted)' },
  texto: { fontSize: 14, lineHeight: 21, color: 'var(--text)' },
  nota: { fontSize: 13, lineHeight: 19, color: 'var(--text-muted)' },
});
