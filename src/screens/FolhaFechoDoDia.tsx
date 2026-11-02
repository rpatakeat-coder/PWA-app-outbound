// FECHAR O DIA (espinha do dia, item 2.10, 29/10/26).
//
// O Julyan, no pedido de 28/10: "nada me pergunta como foi. O dia termina quando
// eu fecho o app. (...) É o momento que transforma rua em pipeline, e hoje ele
// não existe."
//
// Às 18h, na primeira vez que o app volta para a frente, esta folha sobe sozinha
// e faz uma pergunta de prestação de contas — com o número na mão, não de
// memória: "N portas, J com próximo passo, K sem. Fecha?".
//
// AS PENDENTES VÊM PRIMEIRO, cada uma com o seu Dar: é a última chance do dia de
// transformar a visita em pipeline, e amanhã a mesma visita já vale menos. Quem
// não tem pendência vê só o placar e o botão — a folha não inventa trabalho.
//
// NÃO TRAVA NADA: "Depois" fecha, e o dia fica aberto. Quem não fechou aparece
// para o gestor em "O time na rua" no dia seguinte (2.11), que é a cobrança
// certa — de gente para gente, e não de tela para pessoa.
//
// HOJE v3 (01/11/26, README §4.5): a mesma folha ganha a versão do Hoje v3 (FolhaFechoV3, abaixo). Ela abre
// pelo push das 18h ou pelo "fechar o dia" da pílula (não mais quando o app volta para a frente) e traz o
// dia inteiro: com passo, pendente (com os chips amanhã · sex 13 · seg 16 · decidir) e não visitada. O
// botão é "Fechar o dia" sem pendência e "fechar mesmo assim" (contornado) com. Fechar grava fecho_do_dia
// (0229, o mesmo de sempre) e mostra o check-out com recompensa, que conta para a sequência e a missão do
// Meu desempenho. A folha anterior (o default deste arquivo) segue para quem desliga o Hoje v3.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import { IconCheck, IconClose, IconWarning, useIconColors } from '../components/icons';
import type { VMDia } from '../../supabase/functions/_compartilhado/hojeV3';
import { useReduzirMovimento } from '../hooks/useDesenvolvimento';

export type LinhaDoFecho = { id: string; dealId: string | null; nome: string; estado: 'ok' | 'pend' | 'x'; sub: string };

export function FolhaFechoV3({ fecho, checkout, linhas, chips, aoChip, aoFechar, aoDepois, aoVerDesempenho }: {
  fecho: VMDia['fecho'];
  checkout: VMDia['checkout'];
  linhas: LinhaDoFecho[];
  chips: Array<{ rot: string; iso: string }>;
  /** marca o passo (HubSpot primeiro) e devolve o texto; 'decidir' abre o cartão na fila (null) */
  aoChip: (l: LinhaDoFecho, c: { rot: string; iso: string } | 'decidir') => Promise<string | null>;
  /** grava o fecho_do_dia; lança o erro se não gravou */
  aoFechar: (pendentes: number) => Promise<void>;
  aoDepois: () => void;
  aoVerDesempenho: () => void;
}) {
  const cores = useIconColors();
  const reduzir = useReduzirMovimento();
  const [feitos, setFeitos] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fechado, setFechado] = useState(false);
  const escala = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (!fechado) return;
    if (reduzir) { escala.setValue(1); return; }
    Animated.timing(escala, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [fechado, reduzir, escala]);
  const pendentes = linhas.filter((l) => l.estado === 'pend' && !feitos[l.id]).length;

  if (fechado) {
    return (
      <Painel visivel aoFechar={aoDepois} rotulo="Dia fechado">
        <View style={v.co} accessibilityLiveRegion="polite">
          <Animated.View style={[v.coCirculo, { transform: [{ scale: escala }] }]}>
            <IconCheck width={36} height={36} fill="#FFFFFF" />
          </Animated.View>
          <Text style={v.coTitulo}>{checkout.titulo}</Text>
          <Text style={v.coTexto}>{checkout.texto}</Text>
          <View style={v.coChips}>{checkout.chips.map((c) => <Text key={c} style={v.coChip}>{c}</Text>)}</View>
          <Text style={v.coRodape}>{checkout.rodape}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={checkout.botao} onPress={aoVerDesempenho} style={v.coBotao}>
            <Text style={v.coBotaoT}>{checkout.botao}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoDepois} style={v.depois}><Text style={v.depoisT}>fechar</Text></Pressable>
        </View>
      </Painel>
    );
  }

  const marcar = async (l: LinhaDoFecho, c: { rot: string; iso: string } | 'decidir') => {
    if (ocupado) return;
    setOcupado(l.id); setErro(null);
    try { const t = await aoChip(l, c); if (t) setFeitos((x) => ({ ...x, [l.id]: t })); }
    catch (e) { setErro(`Não marquei o passo de ${l.nome}: ${String((e as Error)?.message ?? e)}.`); }
    finally { setOcupado(null); }
  };
  const titulo = pendentes === linhas.filter((l) => l.estado === 'pend').length ? fecho.titulo : fecho.titulo.replace(/· \d+ sem próximo passo/, pendentes ? `· ${pendentes} sem próximo passo` : '· todas com próximo passo');
  const semPend = pendentes === 0;
  return (
    <Painel visivel aoFechar={aoDepois} rotulo="Fecho do dia" topo={
      <View style={v.topo}>
        <Text style={v.kicker}>{fecho.kicker}</Text>
        <Text style={v.titulo}>{titulo}</Text>
        <Text style={v.sub}>{semPend ? 'Pronto para fechar.' : fecho.sub}</Text>
      </View>
    } rodape={
      <View style={v.rodape}>
        {!!erro && <Text style={v.erro}>{erro}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={semPend ? 'Fechar o dia' : 'fechar mesmo assim'} disabled={ocupado === 'fechar'}
          onPress={async () => {
            setOcupado('fechar'); setErro(null);
            try { await aoFechar(pendentes); setFechado(true); }
            catch (e) { setErro(`Não consegui fechar o dia agora: ${String((e as Error)?.message ?? e)}. Tente de novo.`); }
            finally { setOcupado(null); }
          }} style={semPend ? v.fechar : v.fecharContorno}>
          {ocupado === 'fechar' ? <ActivityIndicator /> : <Text style={semPend ? v.fecharT : v.fecharContornoT}>{semPend ? 'Fechar o dia' : 'fechar mesmo assim'}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="depois" onPress={aoDepois} style={v.depois}><Text style={v.depoisT}>depois</Text></Pressable>
      </View>
    }>
      <ScrollView style={v.rolagem} contentContainerStyle={v.corpo}>
        {linhas.map((l) => {
          const feito = feitos[l.id];
          const pend = l.estado === 'pend' && !feito;
          return (
            <View key={l.id} style={[v.linha, pend && v.linhaPend]}>
              <View style={v.linhaCab}>
                <View style={[v.ic, l.estado === 'x' ? v.icX : pend ? v.icPend : v.icOk]}>
                  {l.estado === 'x' ? <IconClose width={14} height={14} fill={cores.tintAmberText} />
                    : pend ? <IconWarning width={14} height={14} fill={cores.brandText} /> : <IconCheck width={14} height={14} fill={cores.tintGreenText} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={v.nome} numberOfLines={1}>{l.nome}</Text>
                  <Text style={[v.linhaSub, pend ? v.subPend : l.estado === 'x' ? v.subX : v.subOk]} numberOfLines={2}>{feito ?? (l.estado === 'x' ? fecho.naoVisitada : l.sub)}</Text>
                </View>
              </View>
              {pend && (
                <View style={v.chips}>
                  {chips.map((c) => (
                    <Pressable key={c.iso} accessibilityRole="button" accessibilityLabel={`Passo de ${l.nome} em ${c.rot}`} disabled={!!ocupado} onPress={() => marcar(l, c)} style={v.chip}>
                      <Text style={v.chipT}>{c.rot}</Text>
                    </Pressable>
                  ))}
                  <Pressable accessibilityRole="button" accessibilityLabel={`Decidir ${l.nome}`} disabled={!!ocupado} onPress={() => marcar(l, 'decidir')} style={v.chip}>
                    <Text style={v.chipT}>decidir</Text>
                  </Pressable>
                  {ocupado === l.id && <ActivityIndicator />}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </Painel>
  );
}

const v = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 4 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: 'var(--text-subtle)' },
  titulo: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  rolagem: { maxHeight: 420 },
  corpo: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  linha: { padding: 10, borderRadius: 12, gap: 8 },
  linhaPend: { backgroundColor: 'var(--tint-red)' },
  linhaCab: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ic: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  icOk: { backgroundColor: 'var(--ok-fundo)' },
  icPend: { backgroundColor: 'var(--surface)' },
  icX: { backgroundColor: 'var(--tint-amber)' },
  nome: { fontSize: 14.5, fontWeight: '700', color: 'var(--text)' },
  linhaSub: { fontSize: 12.5, marginTop: 1 },
  subOk: { color: 'var(--ok-texto)' },
  subPend: { color: 'var(--vermelho-texto)' },
  subX: { color: 'var(--tint-amber-text)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface)', alignItems: 'center', justifyContent: 'center' },
  chipT: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  rodape: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 2 },
  erro: { fontSize: 12.5, color: 'var(--vermelho-texto)', paddingBottom: 6 },
  fechar: { height: 52, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  fecharT: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  fecharContorno: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  fecharContornoT: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  depois: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  depoisT: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)' },
  co: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16, gap: 8 },
  coCirculo: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'var(--verde-acao)', alignItems: 'center', justifyContent: 'center', borderWidth: 10, borderColor: 'var(--ok-fundo)' },
  coTitulo: { fontSize: 22, fontWeight: '800', color: 'var(--text)', marginTop: 6 },
  coTexto: { fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' },
  coChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 },
  coChip: { fontSize: 12.5, fontWeight: '700', color: 'var(--text)', backgroundColor: 'var(--surface-3)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  coRodape: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },
  coBotao: { minHeight: 48, alignSelf: 'stretch', borderRadius: 14, backgroundColor: 'var(--text)', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  coBotaoT: { fontSize: 15, fontWeight: '700', color: 'var(--bg)' },
});

export type PendenteDoFecho = { dealId: string; clientId: string | null; nome: string; hora: string | null };

export default function FolhaFechoDoDia({ dia, portas, meta, pendentes, amanha, aoDar, aoFechar, aoDepois }: {
  /** "QUINTA, 30/10" — já em Brasília. */
  dia: string;
  portas: number;
  meta: number;
  pendentes: PendenteDoFecho[];
  /** O que já está marcado para amanhã: o que faz o dia seguinte começar cheio. */
  amanha: number;
  aoDar: (p: PendenteDoFecho) => void;
  aoFechar: () => void;
  aoDepois: () => void;
}) {
  const k = pendentes.length;
  const j = Math.max(0, portas - k);
  return (
    <Painel visivel aoFechar={aoDepois} rotulo="Fechar o dia" topo={
      <View style={s.topo}>
        <View style={s.kickerLinha}>
          <Text style={s.kicker} numberOfLines={1}>{`FIM DO DIA · ${dia}`}</Text>
          {portas >= meta && meta > 0 && <Text style={s.bateu} numberOfLines={1}>{`${portas} de ${meta} portas ✓`}</Text>}
        </View>
        <Text style={s.titulo}>
          {k === 0
            ? `${portas} ${portas === 1 ? 'porta' : 'portas'}, todas com próximo passo. Fecha?`
            : `${portas} ${portas === 1 ? 'porta' : 'portas'}, ${j} com próximo passo, ${k} sem. Fecha?`}
        </Text>
      </View>
    }>
      <ScrollView style={s.rolagem} contentContainerStyle={s.corpo}>
        {k > 0 && (
          <>
            <Text style={s.grupo}>{`SEM PRÓXIMO PASSO · ${k}`}</Text>
            {pendentes.map((p) => (
              <View key={p.dealId} style={s.linha}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.nome} numberOfLines={1}>{p.nome}</Text>
                  {!!p.hora && <Text style={s.sub} numberOfLines={1}>{`visita das ${p.hora}`}</Text>}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Dar o próximo passo de ${p.nome}`}
                  onPress={() => aoDar(p)} style={s.dar}>
                  <Text style={s.darTexto}>Dar</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
        {amanha > 0 && (
          <Text style={s.amanha}>
            {`Amanhã já começa com ${amanha} ${amanha === 1 ? 'porta combinada' : 'portas combinadas'}.`}
          </Text>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar o dia" onPress={aoFechar} style={s.primario}>
          <Text style={s.primarioTexto}>Fechar o dia</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Depois" onPress={aoDepois} style={s.depois}>
          <Text style={s.depoisTexto}>Depois · o dia fica aberto e o gestor vê amanhã</Text>
        </Pressable>
      </ScrollView>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 6 },
  kickerLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, color: 'var(--text-subtle)' },
  bateu: { fontSize: 12, fontWeight: '700', color: 'var(--ok-texto)', flexShrink: 0 },
  titulo: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: 'var(--text)' },
  rolagem: { maxHeight: 420 },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  grupo: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, color: 'var(--vermelho-texto)', marginTop: 4 },
  linha: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: 'var(--border)' },
  nome: { fontSize: 15.5, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1 },
  /* Contorno, não vermelho cheio: o vermelho cheio é do Cheguei, e esta folha não é a rua. */
  dar: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  darTexto: { fontSize: 14.5, fontWeight: '700', color: 'var(--vermelho-texto)' },
  amanha: { fontSize: 13.5, lineHeight: 19, color: 'var(--text-muted)', marginTop: 6 },
  primario: { height: 52, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primarioTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  depois: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  depoisTexto: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)', textAlign: 'center' },
});
