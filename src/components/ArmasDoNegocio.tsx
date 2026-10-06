// SUAS ARMAS PRA DEMO / PRA NEGOCIAÇÃO (Raio X › Praça, 06/10/26).
//
// No cartão do lead, de Conversa com decisor em diante: o que o executivo leva para a
// conversa. Grade 2×2 (sistema, dor, quem decide, achar o dono), o argumento do Playbook
// contra o sistema dele e a linha "Na sua praça" (armas_da_praca, 0172). O que falta fica
// âmbar e, tocado, abre a folha só das armas. A regra é a MESMA do Cockpit (GV2.armas):
// ver src/utils/armasDaDemo.ts.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';
import { argumentoDoSistema, armasConhecidas, nomeDoSistema, fichasDaFolha, linhaDaPraca, type Armas, type DadosDaPraca, type FichaArmas } from '../utils/armasDaDemo';
import { ETAPA, HORARIOS } from '../utils/fichaDeRua';

export const ETAPAS_DO_BLOCO: string[] = [ETAPA.decisor, ETAPA.demo, ETAPA.negociacao, ETAPA.pagamento];

/* a praça muda pouco: uma leitura por sessão serve a todos os cartões */
let pracaCache: Promise<DadosDaPraca | null> | null = null;
function lerPraca(): Promise<DadosDaPraca | null> {
  if (!pracaCache) {
    pracaCache = Promise.resolve(supabase.rpc('armas_da_praca'))
      .then(({ data, error }) => (error ? null : (data as DadosDaPraca)), () => null);
    void pracaCache.then((d) => { if (!d) pracaCache = null; });
  }
  return pracaCache;
}

export default function ArmasDoNegocio({ client, etapa, onCompletar }: { client: Client; etapa: string; onCompletar?: () => void }) {
  const [armas, setArmas] = useState<Armas | null>(null);
  const [praca, setPraca] = useState<DadosDaPraca | null>(null);
  const dealId = client.id_hubspot ? String(client.id_hubspot) : null;

  useEffect(() => {
    if (!dealId) return;
    let vivo = true;
    setArmas(null);
    Promise.all([
      supabase.rpc('mapa_negocio', { p_deal: dealId }).then(({ data }) => (data as Record<string, unknown>) ?? {}, () => ({})),
      client.id
        ? supabase.from('fichas_de_rua').select('ocorrido_em, decisor_nome, decisor_papel, horario_dono, sistema, dor')
            .eq('client_id', client.id).order('ocorrido_em', { ascending: false }).limit(10)
            .then(({ data }) => (data ?? []) as FichaArmas[], () => [] as FichaArmas[])
        : Promise.resolve([] as FichaArmas[]),
      supabase.from('gv2_falta_etapa').select('criado_em, armas').eq('negocio_id', dealId).order('criado_em', { ascending: false }).limit(5)
        .then(({ data }) => fichasDaFolha((data ?? []) as { criado_em: string; armas: Record<string, unknown> | null }[]), () => [] as FichaArmas[]),
    ]).then(([neg, fichas, folha]) => { if (vivo) setArmas(armasConhecidas(neg, [...folha, ...fichas])); });
    void lerPraca().then((d) => { if (vivo) setPraca(d); });
    return () => { vivo = false; };
  }, [dealId, client.id]);

  if (!dealId || !ETAPAS_DO_BLOCO.includes(etapa)) return null;
  const titulo = etapa === ETAPA.negociacao || etapa === ETAPA.pagamento ? 'SUAS ARMAS PRA NEGOCIAÇÃO' : 'SUAS ARMAS PRA DEMO';
  if (!armas) {
    return (
      <View style={s.bloco}>
        <Text style={s.rotulo}>{titulo}</Text>
        <View style={s.grade}>{[0, 1, 2, 3].map((i) => <View key={i} style={[s.tile, s.esqueleto]} />)}</View>
      </View>
    );
  }
  const horario = HORARIOS.find((h) => h.valor === armas.horario)?.curto ?? '';
  const tiles: { rot: string; v: string }[] = [
    { rot: 'Sistema hoje', v: nomeDoSistema(armas.sistema) },
    { rot: 'Maior dor', v: armas.dor },
    { rot: 'Quem decide', v: armas.decisor ? `${armas.decisor}${armas.papel ? ` · ${armas.papel.toLowerCase()}` : ''}` : '' },
    { rot: 'Achar o dono', v: horario },
  ];
  const n = tiles.filter((t) => t.v).length;
  const arg = argumentoDoSistema(armas.sistema);
  const naPraca = linhaDaPraca(praca, armas.sistema);
  return (
    <View style={s.bloco}>
      <View style={s.cab}>
        <Text style={s.rotulo}>{titulo}</Text>
        <Text style={[s.n, n === 4 ? s.nOk : s.nFalta]}>{`${n} de 4`}</Text>
      </View>
      <View style={s.grade}>
        {tiles.map((t) => (t.v ? (
          <View key={t.rot} style={s.tile}>
            <Text style={s.tileRot}>{t.rot}</Text>
            <Text style={s.tileVal} numberOfLines={1}>{t.v}</Text>
          </View>
        ) : (
          <Pressable key={t.rot} accessibilityRole="button" accessibilityLabel={`${t.rot}: falta. Tocar para completar`} disabled={!onCompletar}
            onPress={onCompletar} style={[s.tile, s.tileFalta]}>
            <Text style={[s.tileRot, s.tileFaltaTexto]}>{t.rot}</Text>
            <Text style={[s.tileVal, s.tileFaltaTexto]} numberOfLines={2}>falta · tocar para completar</Text>
          </Pressable>
        )))}
      </View>
      <View style={s.arg}>
        {arg ? (
          <>
            <Text style={s.argRot}>{`CONTRA ${arg.contra.toUpperCase()} · PLAYBOOK, OBJEÇÕES`}</Text>
            <Text style={s.argObj}>{`“${arg.objecao}”`}</Text>
            <Text style={s.argTexto}>{arg.texto}</Text>
          </>
        ) : (
          <>
            <Text style={s.argRot}>SEM O SISTEMA</Text>
            <Text style={s.argObj}>Sem o sistema, não há argumento pronto</Text>
            <Text style={s.argTexto}>Pergunte na Demo: “o que vocês usam hoje para fechar o caixa e lançar os pedidos?”</Text>
          </>
        )}
      </View>
      {!!naPraca && <Text style={s.praca}><Text style={s.pracaB}>Na sua praça: </Text>{naPraca}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { gap: 8, marginTop: 4 },
  cab: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  rotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: 'var(--text-muted)' },
  n: { fontSize: 12, fontWeight: '800' },
  nOk: { color: 'var(--tint-green-text)' },
  nFalta: { color: 'var(--tint-amber-text)' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { flexBasis: '48%', flexGrow: 1, minHeight: 48, borderRadius: 10, backgroundColor: 'var(--surface-2)', paddingHorizontal: 10, paddingVertical: 7, gap: 1 },
  esqueleto: { backgroundColor: 'var(--surface-3)' },
  tileRot: { fontSize: 11.5, fontWeight: '600', color: 'var(--text-muted)' },
  tileVal: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  tileFalta: { backgroundColor: 'var(--tint-amber)', borderWidth: 1, borderColor: 'var(--tint-amber-border)' },
  tileFaltaTexto: { color: 'var(--tint-amber-text)' },
  /* o argumento é o cartão escuro, nos dois temas (como no Cockpit) */
  arg: { borderRadius: 12, backgroundColor: '#111418', borderWidth: 1, borderColor: 'var(--border)', padding: 12, gap: 4 },
  argRot: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: '#9CA3AF' },
  argObj: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  argTexto: { fontSize: 13, lineHeight: 19, color: '#D1D5DB' },
  praca: { fontSize: 12.5, lineHeight: 18, color: 'var(--text-muted)' },
  pracaB: { fontWeight: '800', color: 'var(--text)' },
});
