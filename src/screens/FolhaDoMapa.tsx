// Folha inferior do mapa novo, sem lead aberto (entrega 4; prancha §5).
//
// Peek: "AGORA, PERTO DE VOCÊ" + progresso do plano + a próxima parada com
// Ir e Cheguei. Tocar em "Nesta área" abre a lista dos pinos da lente, por
// Prioridade (plano › cobrança › quente › morno › distância) ou Distância.
// O peek não passa de ~40% da tela: o mapa é o produto.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Client } from '../types/client';
import { Toast } from '../components/Toast';
import { ORIGEM, origemDoFiltro } from '../utils/lentes';
import type { Pino } from '../utils/pinoP2';
import { distanciaTexto, ir } from './CardLeadNovo';

import { ordenarItens, type ItemFolha } from '../utils/cardNovo';

export type { ItemFolha };

type Props = {
  itens: ItemFolha[];
  planoTotal: number;
  planoFeito: number;
  /** Distância do chão da tela (acima da barra de baixo). */
  chao: number;
  /** Quantos leads a área tem ao todo (os fora da lente viram ponto). */
  totalNaArea: number;
  rotuloLente: string;
  onAbrir: (c: Client) => void;
  onCheguei: (c: Client) => void;
  /** Altura da folha na tela (o mapa termina no topo dela). */
  aoMedir?: (medida: { y: number; altura: number }) => void;
  /** Resumo de quadra tocado no mapa: a lista mostra só os pinos dele. */
  quadra?: { area: string; aoFechar: () => void } | null;
  /** Lentes Sem dono e Reconquista: "É meu" direto na linha (só na rota de hoje). */
  eMeu?: { naRota: Set<string>; aoAssumir: (c: Client) => void } | null;
};

function PinoMini({ p, plano }: { p: Pino; plano: number | null }) {
  return (
    <View style={[s.mini, { borderColor: p.dono === 'sem' ? '#FACC15' : p.cor, borderStyle: p.dono === 'sem' ? 'dashed' : 'solid' }]}>
      <Text style={[s.miniTexto, { color: p.cor }]}>{plano ?? (p.glifo || '•')}</Text>
    </View>
  );
}

function Etiquetas({ it }: { it: ItemFolha }) {
  const o = ORIGEM[origemDoFiltro(it.p)];
  return (
    <View style={s.etiquetas}>
      {it.p.etiqueta && (
        <View style={[s.tag, { backgroundColor: it.p.etiqueta.fundo }]}>
          <Text style={[s.tagTexto, { color: it.p.etiqueta.tinta }]}>{it.p.etiqueta.texto}</Text>
        </View>
      )}
      <View style={[s.tag, { backgroundColor: o.fundo }]}>
        <Text style={[s.tagTexto, { color: o.tinta }]} numberOfLines={1}>{o.rotulo}</Text>
      </View>
    </View>
  );
}

export default function FolhaDoMapa({ itens, planoTotal, planoFeito, chao, totalNaArea, rotuloLente, onAbrir, onCheguei, aoMedir, quadra, eMeu }: Props) {
  const [abertaPeloToque, setAberta] = useState(false);
  const aberta = abertaPeloToque || !!quadra;
  const [modo, setModo] = useState<'prioridade' | 'distancia'>('prioridade');
  const ordenados = useMemo(() => ordenarItens(itens, modo), [itens, modo]);
  const proxima = useMemo(() => ordenarItens(itens, 'prioridade').find((it) => it.plano && !it.feito) ?? null, [itens]);

  return (
    <View style={[s.folha, { bottom: chao }]} accessibilityLabel="Agora, perto de você" onLayout={(e) => {
      // No navegador o evento traz o próprio elemento: o topo vem na régua da
      // TELA, a mesma do mapa (o layout.y é relativo ao pai, que não é o do mapa).
      const alvo = (e.nativeEvent as unknown as { target?: { getBoundingClientRect?: () => DOMRect } }).target;
      const topo = alvo?.getBoundingClientRect ? alvo.getBoundingClientRect().top : e.nativeEvent.layout.y;
      aoMedir?.({ y: Math.round(topo), altura: Math.round(e.nativeEvent.layout.height) });
    }}>
      <Pressable accessibilityRole="button" accessibilityLabel={aberta ? 'Recolher a lista' : 'Abrir a lista desta área'} onPress={() => setAberta((v) => !v)} style={s.alca}>
        <View style={s.alcaBarra} />
      </Pressable>
      <View style={s.linhaTopo}>
        <Text style={s.kicker}>AGORA, PERTO DE VOCÊ</Text>
        <Text style={s.progresso}>
          {planoTotal ? `Plano de hoje · ${planoFeito} de ${planoTotal} feito` : 'Sem plano para hoje'}
        </Text>
      </View>

      {proxima ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => onAbrir(proxima.c)} style={s.proxima}>
            <PinoMini p={proxima.p} plano={proxima.plano} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.nome} numberOfLines={1}>{`${proxima.plano} · ${proxima.c.empresa?.trim() || proxima.c.nome}`}</Text>
              <Text style={s.sub} numberOfLines={1}>
                {[proxima.c.endereco?.trim() || proxima.c.bairro?.trim() || 'endereço não informado', distanciaTexto(proxima.distanciaM)].filter(Boolean).join(' · ')}
              </Text>
              <Etiquetas it={proxima} />
            </View>
          </Pressable>
          <View style={s.acoes}>
            <Pressable accessibilityRole="button" accessibilityLabel="Ir até a próxima parada" onPress={() => ir(proxima.c, false)} style={[s.btn, s.btnIr]}>
              <Text style={s.btnIrTexto}>Ir</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Cheguei na próxima parada" onPress={() => onCheguei(proxima.c)} style={[s.btn, s.btnCheguei]}>
              <Text style={s.btnChegueiTexto}>Cheguei</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={s.semProxima}>
          {planoTotal ? 'Plano de hoje concluído.' : 'Nada planejado para hoje no Cockpit. Os pinos da lente estão na lista abaixo.'}
        </Text>
      )}

      {quadra ? (
        <View style={s.quadraTopo}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nestaAreaTexto} numberOfLines={1}>{`Quadra · ${quadra.area} · ${itens.length} ${itens.length === 1 ? 'pino' : 'pinos'}`}</Text>
            <Text style={s.nestaAreaSub}>{`Lente ${rotuloLente} · melhor candidato primeiro`}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar a lista da quadra" onPress={quadra.aoFechar} style={s.quadraFechar}>
            <Text style={s.quadraFecharTexto}>✕</Text>
          </Pressable>
        </View>
      ) : (
      <Pressable accessibilityRole="button" onPress={() => setAberta((v) => !v)} style={s.nestaArea}>
        <Text style={s.nestaAreaTexto}>{`Nesta área · ${totalNaArea} · ${itens.length} ${itens.length === 1 ? 'pino' : 'pinos'}, ${Math.max(0, totalNaArea - itens.length)} pontos ${aberta ? '▾' : '▴'}`}</Text>
        <Text style={s.nestaAreaSub}>{`Lente ${rotuloLente}`}</Text>
      </Pressable>
      )}

      {aberta && (
        <>
          <View style={s.ordem}>
            {(['prioridade', 'distancia'] as const).map((m) => (
              <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: modo === m }} onPress={() => setModo(m)}
                style={[s.ordemBtn, modo === m && s.ordemBtnAtivo]}>
                <Text style={[s.ordemTexto, modo === m && s.ordemTextoAtivo]}>{m === 'prioridade' ? 'Prioridade' : 'Distância'}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView style={s.lista} contentContainerStyle={{ paddingBottom: 8 }}>
            {ordenados.length === 0 && <Text style={s.semProxima}>Nada desta lente na área. Troque de lente ou afaste o mapa.</Text>}
            {ordenados.slice(0, 80).map((it) => (
              <Pressable key={it.c.id} accessibilityRole="button" onPress={() => onAbrir(it.c)} style={s.linha}>
                <PinoMini p={it.p} plano={it.plano} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.nome} numberOfLines={1}>{`${it.plano ? `${it.plano} · ` : ''}${it.c.empresa?.trim() || it.c.nome}`}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {[distanciaTexto(it.distanciaM), it.c.telefone?.trim() ? null : 'sem tel.',
                      it.c.conta_alvo_rating != null ? `${Number(it.c.conta_alvo_rating).toFixed(1).replace('.', ',')}★` : null].filter(Boolean).join(' · ') || ' '}
                  </Text>
                </View>
                {eMeu && it.p.dono === 'sem' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={eMeu.naRota.has(it.c.id) ? `É meu: ${it.c.empresa?.trim() || it.c.nome}` : 'É meu: ponha na rota de hoje primeiro'}
                    onPress={() => (eMeu.naRota.has(it.c.id) ? eMeu.aoAssumir(it.c) : Toast.mostrar('Para assumir, ponha na rota de hoje (+ Rota de hoje no card) e toque em É meu.', 'fila'))}
                    style={[s.eMeu, !eMeu.naRota.has(it.c.id) && s.eMeuFora]}
                  >
                    <Text style={[s.eMeuTexto, !eMeu.naRota.has(it.c.id) && s.eMeuTextoFora]}>É meu</Text>
                  </Pressable>
                ) : <Etiquetas it={it} />}
              </Pressable>
            ))}
            {ordenados.length > 80 && <Text style={s.semProxima}>{`Mais ${ordenados.length - 80} — aproxime o mapa para ver.`}</Text>}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  folha: {
    position: 'absolute', left: 0, right: 0, zIndex: 20,
    backgroundColor: 'var(--surface)', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingHorizontal: 16, paddingBottom: 10, gap: 8, maxHeight: '62%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
  alca: { alignSelf: 'stretch', alignItems: 'center', paddingTop: 8, paddingBottom: 2, minHeight: 20 },
  alcaBarra: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'var(--stroke-strong)' },
  linhaTopo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: 'var(--brand-text)' },
  progresso: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  proxima: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  mini: { width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, backgroundColor: '#14171C', alignItems: 'center', justifyContent: 'center' },
  miniTexto: { fontSize: 12, fontWeight: '900' },
  nome: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 1 },
  etiquetas: { flexDirection: 'row', gap: 4, marginTop: 3, flexShrink: 0 },
  tag: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, maxWidth: 120 },
  tagTexto: { fontSize: 10, fontWeight: '800' },
  acoes: { flexDirection: 'row', gap: 8 },
  btn: { minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnIr: { flex: 1, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' },
  btnIrTexto: { fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  btnCheguei: { flex: 2, backgroundColor: '#E51A31' },
  btnChegueiTexto: { fontSize: 17, fontWeight: '800', color: '#fff' },
  semProxima: { fontSize: 13, color: 'var(--text-muted)', paddingVertical: 6 },
  nestaArea: { minHeight: 44, justifyContent: 'center' },
  eMeu: { minHeight: 44, minWidth: 64, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FACC15', alignItems: 'center', justifyContent: 'center' },
  eMeuFora: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: '#FACC15' },
  eMeuTexto: { fontSize: 13, fontWeight: '800', color: '#14171C' },
  eMeuTextoFora: { color: '#FACC15' },
  quadraTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  quadraFechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  quadraFecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  nestaAreaTexto: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  nestaAreaSub: { fontSize: 11, color: 'var(--text-muted)' },
  ordem: { flexDirection: 'row', gap: 8 },
  ordemBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center' },
  ordemBtnAtivo: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  ordemTexto: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  ordemTextoAtivo: { color: 'var(--bg)' },
  lista: { maxHeight: 320 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
});
