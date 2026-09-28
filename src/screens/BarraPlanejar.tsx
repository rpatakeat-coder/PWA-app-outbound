// PLANEJAR PELO MAPA (28/09/2026). No lugar da folha do mapa enquanto o modo está
// ligado: o dia escolhido, as paradas dele em ordem e o Pronto. Tocar num pino do mapa
// põe ou tira daquele dia (quem faz é o App); aqui só se escolhe o dia, abre a ficha ou
// tira da lista. O que entra vai para o Planejamento do Cockpit pelo rota_para_plano.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Client } from '../types/client';
import { vaiAoCockpit, type DiaPlanejavel } from '../utils/planoNoMapa';

/** noCockpit: lido na grade do Planejamento (null enquanto não leu). compromisso: a hora
 *  da visita marcada (Agenda do app ou próximo passo do CRM); null quando não é. */
export type ParadaDoDia = { id: string; client: Client; status: string; noCockpit: boolean | null; compromisso: string | null };

type Props = {
  dias: DiaPlanejavel[];
  dia: string;
  aoDia: (iso: string) => void;
  paradas: ParadaDoDia[];
  carregando?: boolean;
  aoAbrir: (c: Client) => void;
  aoTirar: (p: ParadaDoDia) => void;
  aoFechar: () => void;
  /** Marcas ainda não gravadas: o toque marca, o Confirmar grava (28/09). */
  pendentes: { client: Client; entrar: boolean }[];
  confirmando?: boolean;
  aoConfirmar: () => void;
  aoDescartar: () => void;
  chao: number;
  embutida?: boolean;
  aoMedir?: (medida: { y: number; altura: number }) => void;
};

export default function BarraPlanejar({ dias, dia, aoDia, paradas, carregando, aoAbrir, aoTirar, aoFechar, pendentes, confirmando, aoConfirmar, aoDescartar, chao, embutida, aoMedir }: Props) {
  const saem = new Set(pendentes.filter((x) => !x.entrar).map((x) => x.client.id));
  const entram = pendentes.filter((x) => x.entrar);
  const ficam = paradas.length - saem.size;
  const atual = dias.find((d) => d.iso === dia);
  const rotulo = atual ? (atual.hoje ? 'hoje' : atual.rotulo) : dia;
  const soNoApp = paradas.filter((p) => p.noCockpit === false);
  const semNegocio = soNoApp.filter((p) => !vaiAoCockpit(p.client)).length;
  const cheio = soNoApp.length - semNegocio;
  return (
    <View
      style={embutida ? s.painel : [s.folha, { bottom: chao }]}
      accessibilityLabel="Planejar pelo mapa"
      onLayout={embutida ? undefined : (e) => {
        const alvo = (e.nativeEvent as unknown as { target?: { getBoundingClientRect?: () => DOMRect } }).target;
        const topo = alvo?.getBoundingClientRect ? alvo.getBoundingClientRect().top : e.nativeEvent.layout.y;
        aoMedir?.({ y: Math.round(topo), altura: Math.round(e.nativeEvent.layout.height) });
      }}
    >
      <View style={s.topo}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.kicker} numberOfLines={1}>PLANEJAR PELO MAPA</Text>
          <Text style={s.titulo} numberOfLines={1}>
            {carregando ? `Carregando ${rotulo}…` : `${paradas.length} ${paradas.length === 1 ? 'parada' : 'paradas'} ${atual?.hoje ? 'hoje' : `na ${rotulo}`}`}
          </Text>
        </View>
        {pendentes.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Confirmar ${pendentes.length} ${pendentes.length === 1 ? 'mudança' : 'mudanças'}`}
            onPress={aoConfirmar} disabled={confirmando} style={[s.pronto, confirmando && { opacity: 0.6 }]}>
            <Text style={s.prontoTexto}>{confirmando ? 'Gravando…' : `Confirmar ${pendentes.length}`}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Terminar o planejamento" onPress={aoFechar} style={s.pronto}>
            <Text style={s.prontoTexto}>Pronto</Text>
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dias}>
        {dias.map((d) => (
          <Pressable key={d.iso} accessibilityRole="button" accessibilityState={{ selected: d.iso === dia }}
            accessibilityLabel={`Planejar ${d.hoje ? 'hoje' : d.rotulo}`} onPress={() => aoDia(d.iso)}
            style={[s.diaBtn, d.iso === dia && s.diaBtnAtivo]}>
            <Text style={[s.diaTexto, d.iso === dia && s.diaTextoAtivo]}>{d.hoje ? 'Hoje' : d.rotulo}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {pendentes.length ? (
        <View style={s.marcas}>
          <Text style={s.marcasTexto} numberOfLines={2}>
            {[entram.length ? `+${entram.length} para entrar` : null, saem.size ? `−${saem.size} para sair` : null].filter(Boolean).join(' · ')}
            {` · fica com ${ficam + entram.length}. Toque de novo num pino para desmarcar.`}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Descartar as marcas" onPress={aoDescartar} disabled={confirmando} style={s.descartar}>
            <Text style={s.descartarTexto}>Descartar</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={s.dica}>
          {`Toque nos pinos para marcar o que entra ou sai ${atual?.hoje ? 'de hoje' : `da ${rotulo}`}, e confirme. Longe, aproxime o mapa: de perto cada lead vira um pino.`}
        </Text>
      )}

      <ScrollView style={embutida ? s.listaEmbutida : s.lista} contentContainerStyle={{ paddingBottom: 6 }}>
        {!carregando && paradas.length === 0 && entram.length === 0 && (
          <Text style={s.vazio}>Nada neste dia ainda. Escolha no mapa os leads perto uns dos outros.</Text>
        )}
        {(() => { let k = 0; return paradas.map((p) => {
          const nome = p.client.empresa?.trim() || p.client.nome;
          const sai = saem.has(p.client.id);
          const n = sai ? null : ++k;
          const notas = sai ? 'sai ao confirmar' : [
            p.client.bairro?.trim() || null,
            p.status === 'done' ? 'feita' : null,
            p.compromisso != null ? `visita marcada${p.compromisso ? ` ${p.compromisso}` : ''}` : null,
            p.noCockpit === true ? 'no Cockpit' : p.noCockpit === false ? 'só no app' : null,
          ].filter(Boolean).join(' · ');
          return (
            <View key={p.id} style={s.linha}>
              <View style={[s.num, sai && s.numFora]}><Text style={[s.numTexto, sai && s.numForaTexto]}>{n ?? '–'}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${nome}`} onPress={() => aoAbrir(p.client)} style={s.linhaTexto}>
                <Text style={[s.nome, sai && s.nomeFora]} numberOfLines={1}>{nome}</Text>
                {!!notas && <Text style={s.sub} numberOfLines={1}>{notas}</Text>}
              </Pressable>
              {p.status !== 'done' && p.compromisso == null && (
                <Pressable accessibilityRole="button" accessibilityLabel={sai ? `Manter ${nome} no dia` : `Marcar ${nome} para sair do dia`} onPress={() => aoTirar(p)} style={s.tirar} hitSlop={4}>
                  <Text style={s.tirarTexto}>{sai ? '↺' : '✕'}</Text>
                </Pressable>
              )}
            </View>
          );
        }).concat(entram.map((x) => {
          const nome = x.client.empresa?.trim() || x.client.nome;
          const n = ++k;
          return (
            <View key={`novo-${x.client.id}`} style={s.linha}>
              <View style={[s.num, s.numNovo]}><Text style={s.numTexto}>{n}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${nome}`} onPress={() => aoAbrir(x.client)} style={s.linhaTexto}>
                <Text style={s.nome} numberOfLines={1}>{nome}</Text>
                <Text style={s.sub} numberOfLines={1}>{[x.client.bairro?.trim() || null, 'a confirmar', !vaiAoCockpit(x.client) ? 'sem negócio: só no app' : null].filter(Boolean).join(' · ')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Desmarcar ${nome}`} onPress={() => aoTirar({ id: x.client.id, client: x.client, status: 'planned', noCockpit: null, compromisso: null })} style={s.tirar} hitSlop={4}>
                <Text style={s.tirarTexto}>✕</Text>
              </Pressable>
            </View>
          );
        })); })()}
        {soNoApp.length > 0 && (
          <Text style={s.aviso}>
            {[semNegocio > 0 ? `${semNegocio} sem negócio nem conta-alvo: ficam na rota e na Agenda do app, o Cockpit não tem onde mostrar.` : null,
              cheio > 0 ? `${cheio} não couberam no Planejamento do Cockpit (15 faixas por dia, já ocupadas): ficam na rota e na Agenda do app.` : null].filter(Boolean).join(' ')}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  folha: {
    position: 'absolute', left: 0, right: 0, zIndex: 20,
    backgroundColor: 'var(--surface)', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: 'var(--border)',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 8, maxHeight: '46%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
  painel: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 8, backgroundColor: 'var(--surface)' },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: '#F87171' },
  titulo: { fontSize: 16, fontWeight: '600', color: 'var(--text)', marginTop: 1 },
  pronto: { height: 44, paddingHorizontal: 18, borderRadius: 13, backgroundColor: '#E51A31', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  prontoTexto: { fontSize: 14, fontWeight: '700', color: '#fff' },
  dias: { gap: 8, paddingRight: 8 },
  diaBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center' },
  diaBtnAtivo: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  diaTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text-muted)' },
  diaTextoAtivo: { color: 'var(--bg)' },
  dica: { fontSize: 12, color: 'var(--text-muted)' },
  lista: { maxHeight: 190 },
  listaEmbutida: { flex: 1, minHeight: 0 },
  vazio: { fontSize: 13, color: 'var(--text-muted)', paddingVertical: 8 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'var(--text)', alignItems: 'center', justifyContent: 'center' },
  numTexto: { fontSize: 12, fontWeight: '800', color: 'var(--bg)' },
  linhaTexto: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' },
  nome: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  sub: { fontSize: 12, fontWeight: '500', color: 'var(--text-muted)', marginTop: 1 },
  tirar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  tirarTexto: { fontSize: 16, color: 'var(--text-muted)' },
  marcas: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'var(--surface-2)' },
  marcasTexto: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '600', color: 'var(--text)' },
  descartar: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  descartarTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text-muted)' },
  numFora: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'var(--border)' },
  numForaTexto: { color: 'var(--text-muted)' },
  numNovo: { backgroundColor: '#E51A31' },
  nomeFora: { color: 'var(--text-muted)', textDecorationLine: 'line-through' },
  aviso: { fontSize: 12, color: 'var(--text-muted)', paddingTop: 8 },
});
