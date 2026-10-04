// Busca do mapa em folha cheia (handoff v4.1 §6.10). O campo do topo só
// abre esta folha: o teclado cobria o mapa de qualquer jeito, e sem lista o
// executivo digitava e não via o que tinha achado.
//
// Mais perto primeiro. Entram também os negócios dele no HubSpot que ainda
// não têm pino: esses aparecem com Posicionar, e ele resolve pelo app.
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Painel } from '../components/Painel';
import { IconClose, IconSearch } from '../components/icons';
import { IconChevronRight as SiRight } from '../components/icons';

export type LinhaBusca = {
  chave: string;
  nome: string;
  sub: string;
  distancia: string | null;
  acao: 'abrir' | 'posicionar';
  aoTocar: () => void;
};

type Props = {
  visivel: boolean;
  aoFechar: () => void;
  busca: string;
  aoBuscar: (t: string) => void;
  linhas: LinhaBusca[];
  carregando: boolean;
  /** A parte do HubSpot falhou (sem sinal, cota): a lista é só do mapa. */
  foraFalhou: boolean;
};

export default function FolhaBusca({ visivel, aoFechar, busca, aoBuscar, linhas, carregando, foraFalhou }: Props) {
  const campo = useRef<TextInput>(null);
  useEffect(() => {
    // Depois da animação de abrir: foco durante ela some no RNW.
    if (!visivel) return;
    const id = setTimeout(() => campo.current?.focus(), 320);
    return () => clearTimeout(id);
  }, [visivel]);

  const termo = busca.trim();
  return (
    <Painel visivel={visivel} aoFechar={aoFechar} rotulo="Buscar" topo={
      <View style={s.topo}>
        <View style={s.linhaCampo}>
          <View style={s.campo}>
            <IconSearch width={16} height={16} fill="#AEB4BE" />
            <TextInput
              ref={campo}
              style={s.campoTexto}
              placeholder="Lead, rua ou bairro"
              placeholderTextColor="#8B919C"
              value={busca}
              onChangeText={aoBuscar}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              autoComplete="off"
              textContentType="none"
              inputMode="search"
              accessibilityLabel="Buscar lead, rua ou bairro"
            />
            {carregando && <ActivityIndicator size="small" color="#AEB4BE" />}
            {busca.length > 0 && !carregando && (
              <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => aoBuscar('')} hitSlop={12} style={{ padding: 12, margin: -12 }}>
                <IconClose width={16} height={16} fill="#AEB4BE" />
              </Pressable>
            )}
          </View>
          <Pressable accessibilityRole="button" onPress={aoFechar} style={s.fechar} hitSlop={8}>
            <Text style={s.fecharTexto}>Fechar</Text>
          </Pressable>
        </View>
        <Text style={s.legenda}>Mais perto primeiro · inclui negócios que ainda não estão no mapa</Text>
      </View>
    }>
      <View style={s.corpo}>
        {termo.length < 2 ? (
          <Text style={s.vazio}>Digite pelo menos 2 letras do nome, da rua ou do bairro. Acento não importa.</Text>
        ) : linhas.length === 0 && carregando ? (
          <View style={s.carregando}><ActivityIndicator color="#AEB4BE" /><Text style={s.vazio}>Buscando no mapa e nos seus negócios…</Text></View>
        ) : linhas.length === 0 ? (
          <Text style={s.vazio}>Nada com “{termo}” no mapa nem nos seus negócios do HubSpot.</Text>
        ) : (
          linhas.map((l) => (
            <Pressable key={l.chave} accessibilityRole="button" onPress={l.aoTocar} style={s.linha}>
              <View style={s.textos}>
                <Text style={s.nome} numberOfLines={1}>{l.nome}</Text>
                <Text style={s.sub} numberOfLines={1}>{l.sub}</Text>
              </View>
              {l.acao === 'posicionar' ? (
                <View style={s.posicionar}><Text style={s.posicionarTexto}>Posicionar</Text></View>
              ) : l.distancia ? (
                <Text style={s.distancia}>{l.distancia}</Text>
              ) : (
                <SiRight width={18} height={18} fill="var(--text-muted)" />
              )}
            </Pressable>
          ))
        )}
        {foraFalhou && termo.length >= 3 && (
          <Text style={s.aviso}>Não consegui buscar no HubSpot agora. A lista mostra só o que está no mapa.</Text>
        )}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  linhaCampo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  campo: {
    flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)',
  },
  campoTexto: { flex: 1, minWidth: 0, fontSize: 16, color: 'var(--text)', outlineStyle: 'none' } as never,
  fechar: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  fecharTexto: { fontSize: 15, fontWeight: '600', color: 'var(--text-muted)' },
  legenda: { fontSize: 12, color: 'var(--text-muted)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 24 },
  carregando: { alignItems: 'center', gap: 8, paddingTop: 16 },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)', paddingTop: 16, textAlign: 'center' },
  linha: {
    minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'var(--border)',
  },
  textos: { flex: 1, minWidth: 0 },
  nome: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  distancia: { fontSize: 13, color: 'var(--text-muted)', fontVariant: ['tabular-nums'] },
  posicionar: {
    minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center',
    backgroundColor: 'var(--tint-red)', borderWidth: 1, borderColor: 'var(--vermelho-acao)',
  },
  posicionarTexto: { fontSize: 13, fontWeight: '700', color: 'var(--vermelho-texto)' },
  aviso: { fontSize: 12, color: '#F5A524', paddingTop: 12 },
});
