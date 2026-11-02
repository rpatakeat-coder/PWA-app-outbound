// A FOLHA DA MANHÃ · "SEU DIA EM 30 SEGUNDOS" (Hoje v3, handoff de 01/11/26, README §4.1).
//
// Substitui a FolhaPlanoDoDia (a pergunta "Vamos? / Confirma?") na 1ª abertura do dia útil até as 10h, e
// quando o push das 8h é tocado. Até 3 linhas, cada uma num cartão com ícone de 34 px:
//   1. o plano (ou "Nada no plano de hoje" + o "Montar o dia" que já existe);
//   2. os passos que vencem hoje (a linha some quando não há);
//   3. "N sem próximo passo": o número da regra única (o mesmo do Hoje do Cockpit e do Planejamento) e os 3
//      primeiros da fila por dinheiro, cada um com o atalho do Planejamento v3 "+ Pôr em qui 12/11 ·
//      sugerido". O toque cria a tarefa no HubSpot ANTES de pôr a parada no plano (marcarPassoRapido).
// Ontem sem fecho: as pendências de ontem no topo, com os chips hoje · sex 13 · seg 16 · decidir.
// Tudo em ordem: um círculo verde cresce (.4 → 1) com "Dia em ordem · vá para a rua" e a folha some em
// 1,5 s; com prefers-reduced-motion, sem animação.
//
// AVISAR, NÃO TRAVAR: "Ir para a rua" e "depois" fecham, o mapa está atrás o tempo todo e o Cheguei de
// qualquer pino funciona com a folha aberta ou fechada.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import { IconCheck, IconClock, IconLocation, IconPlus, IconWarning, useIconColors } from '../components/icons';
import type { VMDia } from '../../supabase/functions/_compartilhado/hojeV3';
import { useReduzirMovimento } from '../hooks/useDesenvolvimento';

const COR_ETAPA = ['#94A3B8', '#60A5FA', '#A78BFA', '#F59E0B', '#F97316', '#10B981'];

type Props = {
  folha: VMDia['folha'];
  chipsOntem: Array<{ rot: string; iso: string }>;
  aoIr: () => void;
  aoDepois: () => void;
  /** a folha em ordem fecha sozinha em 1,5 s */
  aoSumir: () => void;
  aoMontar: () => void;
  /** "+ Pôr em …": grava (HubSpot primeiro) e devolve o texto do feito, ou lança o erro */
  aoPor: (id: string) => Promise<string>;
  /** um chip das pendências de ontem; 'decidir' abre o cartão do negócio na fila */
  aoOntem: (id: string, chip: { rot: string; iso: string } | 'decidir') => Promise<string | null>;
};

export default function FolhaManhaV3({ folha, chipsOntem, aoIr, aoDepois, aoSumir, aoMontar, aoPor, aoOntem }: Props) {
  const cores = useIconColors();
  const reduzir = useReduzirMovimento();
  const escala = useRef(new Animated.Value(0.4)).current;
  const [feitos, setFeitos] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // auditoria 02/11/26: o App passa aoSumir como arrow nova a cada render; nas dependências, o
  // timer de 1,5 s recomeçava a cada render e a folha "em ordem" podia nunca sumir
  const aoSumirRef = useRef(aoSumir);
  aoSumirRef.current = aoSumir;

  useEffect(() => {
    if (!folha.emOrdem) return;
    if (reduzir) escala.setValue(1);
    else Animated.timing(escala, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }).start();
    const t = setTimeout(() => aoSumirRef.current(), 1500);
    return () => clearTimeout(t);
  }, [folha.emOrdem, reduzir, escala]);

  const fazer = async (chave: string, f: () => Promise<string | null>) => {
    if (ocupado) return;
    setOcupado(chave); setErro(null);
    try { const t = await f(); if (t) setFeitos((x) => ({ ...x, [chave]: t })); }
    catch (e) { setErro(`Não marquei: ${String((e as Error)?.message ?? e)}. O lead continua sem próximo passo.`); }
    finally { setOcupado(null); }
  };

  if (folha.emOrdem) {
    return (
      <Painel visivel aoFechar={aoDepois} rotulo="Seu dia em 30 segundos">
        <View style={s.ordem} accessibilityLiveRegion="polite">
          <Animated.View style={[s.ordemCirculo, { transform: [{ scale: escala }] }]}>
            <IconCheck width={30} height={30} fill="#FFFFFF" />
          </Animated.View>
          <Text style={s.ordemTexto}>{folha.emOrdemTexto}</Text>
        </View>
      </Painel>
    );
  }

  const icone = (k: 'plano' | 'vence' | 'sem') => (
    <View style={[s.icone, k === 'plano' ? s.iconePlano : k === 'vence' ? s.iconeVence : s.iconeSem]}>
      {k === 'plano' ? <IconLocation width={18} height={18} fill={cores.onSurface} />
        : k === 'vence' ? <IconClock width={18} height={18} fill={cores.tintAmberText} />
          : <IconWarning width={18} height={18} fill={cores.brandText} />}
    </View>
  );

  return (
    <Painel visivel aoFechar={aoDepois} rotulo="Seu dia em 30 segundos" topo={
      <View style={s.topo}>
        <Text style={s.kicker}>{folha.kicker}</Text>
        <Text style={s.titulo}>{folha.titulo}</Text>
      </View>
    } rodape={
      <View style={s.rodape}>
        <Pressable accessibilityRole="button" accessibilityLabel={folha.ir} onPress={aoIr} style={s.ir}>
          <Text style={s.irTexto}>{folha.ir}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={folha.depois} onPress={aoDepois} style={s.depois}>
          <Text style={s.depoisTexto}>{folha.depois}</Text>
        </Pressable>
      </View>
    }>
      <ScrollView style={s.rolagem} contentContainerStyle={s.corpo}>
        {folha.ontem && (
          <View style={[s.cartao, s.cartaoOntem]}>
            <Text style={s.ontemTitulo}>{folha.ontem.titulo}</Text>
            {folha.ontem.linhas.map((l) => (
              <View key={l.id} style={s.linhaLead}>
                <Text style={s.leadNome} numberOfLines={1}>{l.nome}</Text>
                {feitos['o:' + l.id] ? <Text style={s.feito}>{feitos['o:' + l.id]}</Text> : (
                  <View style={s.chips}>
                    {chipsOntem.map((c) => (
                      <Pressable key={c.iso} accessibilityRole="button" accessibilityLabel={`Passo de ${l.nome} em ${c.rot}`} disabled={!!ocupado}
                        onPress={() => fazer('o:' + l.id, () => aoOntem(l.id, c))} style={s.chip}>
                        <Text style={s.chipTexto}>{c.rot}</Text>
                      </Pressable>
                    ))}
                    <Pressable accessibilityRole="button" accessibilityLabel={`Decidir ${l.nome}`} disabled={!!ocupado}
                      onPress={() => fazer('o:' + l.id, () => aoOntem(l.id, 'decidir'))} style={s.chip}>
                      <Text style={s.chipTexto}>decidir</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={s.cartao}>
          <View style={s.cabLinha}>
            {icone('plano')}
            <View style={s.cabTexto}>
              <Text style={s.linhaTitulo}>{folha.plano.titulo}</Text>
              <Text style={s.linhaSub}>{folha.plano.sub}</Text>
            </View>
          </View>
          {!!folha.plano.montar && (
            <Pressable accessibilityRole="button" accessibilityLabel={folha.plano.montar} onPress={aoMontar} style={s.montar}>
              <Text style={s.montarTexto}>{folha.plano.montar}</Text>
            </Pressable>
          )}
        </View>

        {folha.vencem && (
          <View style={s.cartao}>
            <View style={s.cabLinha}>
              {icone('vence')}
              <View style={s.cabTexto}>
                <Text style={s.linhaTitulo}>{folha.vencem.titulo}</Text>
                <Text style={s.linhaSub}>{folha.vencem.sub}</Text>
              </View>
            </View>
          </View>
        )}

        {folha.sem && (
          <View style={s.cartao}>
            <View style={s.cabLinha}>
              {icone('sem')}
              <View style={s.cabTexto}>
                <Text style={s.linhaTitulo}>{folha.sem.titulo}</Text>
                <Text style={s.linhaSub}>{folha.sem.sub}</Text>
              </View>
            </View>
            {(folha.sem.linhas as Array<{ id: string; nome: string; etapaIdx: number; quente: boolean; feito: string | null; sugT: string | null; sugS: string | null }>).map((l) => {
              const feito = feitos['s:' + l.id] ?? l.feito;
              return (
                <View key={l.id} style={s.linhaLead}>
                  <View style={s.leadCab}>
                    <View style={[s.ponto, { backgroundColor: COR_ETAPA[l.etapaIdx] ?? COR_ETAPA[0] }]} />
                    <Text style={s.leadNome} numberOfLines={1}>{l.nome}</Text>
                    {l.quente && <Text style={s.quente}>QUENTE</Text>}
                  </View>
                  {feito ? (
                    <View style={s.feitoLinha}><IconCheck width={14} height={14} fill={cores.tintGreenText} /><Text style={s.feito}>{feito}</Text></View>
                  ) : l.sugT ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`${l.sugT} ${l.nome}. ${l.sugS ?? ''}`} disabled={!!ocupado}
                      onPress={() => fazer('s:' + l.id, () => aoPor(l.id))} style={s.atalho}>
                      {ocupado === 's:' + l.id ? <ActivityIndicator color="#FFFFFF" /> : <IconPlus width={14} height={14} fill="#FFFFFF" />}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.atalhoT}>{l.sugT}</Text>
                        {!!l.sugS && <Text style={s.atalhoS}>{l.sugS}</Text>}
                      </View>
                    </Pressable>
                  ) : (
                    <Text style={s.linhaSub}>sem dia com vaga no bairro dele · marque pelas Tarefas</Text>
                  )}
                </View>
              );
            })}
            {!!folha.sem.mais && <Text style={s.mais}>{folha.sem.mais}</Text>}
          </View>
        )}
        {!!erro && <Text style={s.erro} accessibilityLiveRegion="polite">{erro}</Text>}
      </ScrollView>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 4 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: 'var(--vermelho-texto)' },
  titulo: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: 'var(--text)' },
  rolagem: { maxHeight: 460 },
  corpo: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  cartao: { backgroundColor: 'var(--surface-2)', borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', padding: 12, gap: 8 },
  cartaoOntem: { backgroundColor: 'var(--tint-amber)', borderColor: 'var(--tint-amber-border)' },
  ontemTitulo: { fontSize: 14, fontWeight: '700', color: 'var(--tint-amber-text)' },
  cabLinha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cabTexto: { flex: 1, minWidth: 0, gap: 2 },
  icone: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconePlano: { backgroundColor: 'var(--tint-blue)' },
  iconeVence: { backgroundColor: 'var(--tint-amber)' },
  iconeSem: { backgroundColor: 'var(--tint-red)' },
  linhaTitulo: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  linhaSub: { fontSize: 12.5, lineHeight: 17, color: 'var(--text-muted)' },
  montar: { minHeight: 44, borderRadius: 12, backgroundColor: 'var(--text)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  montarTexto: { fontSize: 14, fontWeight: '700', color: 'var(--bg)' },
  linhaLead: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'var(--border)' },
  leadCab: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  leadNome: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  quente: { fontSize: 9.5, fontWeight: '800', color: '#FFFFFF', backgroundColor: 'var(--vermelho-acao)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  atalho: { minHeight: 44, borderRadius: 10, backgroundColor: 'var(--text)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  atalhoT: { fontSize: 13, fontWeight: '700', color: 'var(--bg)' },
  atalhoS: { fontSize: 11, color: 'var(--bg)', opacity: 0.8 },
  feitoLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  feito: { fontSize: 12.5, fontWeight: '600', color: 'var(--ok-texto)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface)', alignItems: 'center', justifyContent: 'center' },
  chipTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  mais: { fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 },
  erro: { fontSize: 12.5, color: 'var(--vermelho-texto)' },
  rodape: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 2 },
  ir: { height: 52, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  irTexto: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  depois: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  depoisTexto: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)' },
  ordem: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 14 },
  ordemCirculo: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'var(--verde-acao)', alignItems: 'center', justifyContent: 'center' },
  ordemTexto: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
});
