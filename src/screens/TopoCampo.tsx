// Barra de topo do app de campo v4.1 (handoff §3 e §6.1): UMA linha que
// flutua sobre o mapa — pílula da lente, busca, sino e avatar. As lentes,
// os filtros e a legenda saíram do topo e moram na FolhaLentes.
//
// top = área segura + 7 (54 num iPhone de 47 de status bar), 12 px das
// bordas, 48 de altura, raio 24. O mapa começa atrás dela: é o mapa que
// ocupa a tela, não o cabeçalho.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { IconBell, IconClose, IconSearch } from '../components/icons';

export const ALTURA_TOPO_CAMPO = 48;

type Props = {
  top: number;
  lente: { rotulo: string; cor: string };
  aoAbrirLentes: () => void;
  busca: string;
  aoBuscar: (t: string) => void;
  buscando: boolean;
  selo: number;
  aoSino: () => void;
  avatar: { url?: string | null; nome?: string | null; email?: string | null };
  aoAvatar: () => void;
};

export default function TopoCampo({ top, lente, aoAbrirLentes, busca, aoBuscar, buscando, selo, aoSino, avatar, aoAvatar }: Props) {
  return (
    <View style={[s.barra, { top }]} accessibilityRole="toolbar">
      <Pressable accessibilityRole="button" accessibilityLabel={`Lente ${lente.rotulo}. Trocar lente, filtros e legenda`} onPress={aoAbrirLentes} style={s.lente}>
        <View style={[s.bolinha, { backgroundColor: lente.cor }]} />
        <Text style={s.lenteTexto} numberOfLines={1}>{lente.rotulo}</Text>
        <Text style={s.seta}>▾</Text>
      </Pressable>
      <View style={s.busca}>
        <IconSearch width={16} height={16} fill="#AEB4BE" />
        <TextInput
          style={s.buscaCampo}
          placeholder="Buscar lead, rua, CNPJ"
          placeholderTextColor="#8B919C"
          value={busca}
          onChangeText={aoBuscar}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Buscar lead, rua ou CNPJ"
        />
        {buscando && <ActivityIndicator size="small" color="#AEB4BE" />}
        {busca.length > 0 && !buscando && (
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => aoBuscar('')} hitSlop={12}>
            <IconClose width={16} height={16} fill="#AEB4BE" />
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selo ? `Avisos, ${selo} ${selo === 1 ? 'novo' : 'novos'}` : 'Avisos'}
        onPress={aoSino}
        style={s.icone}
      >
        <IconBell width={22} height={22} fill="#F4F5F7" />
        {selo > 0 && (
          <View style={s.selo}><Text style={s.seloTexto}>{selo > 9 ? '9+' : selo}</Text></View>
        )}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir menu do perfil" onPress={aoAvatar} style={s.icone}>
        <Avatar url={avatar.url} nome={avatar.nome} email={avatar.email} tamanho={36} estilo={s.avatar} estiloTexto={s.avatarTexto} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  barra: {
    position: 'absolute', left: 12, right: 12, height: ALTURA_TOPO_CAMPO, zIndex: 30,
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 4,
    borderRadius: 24, borderWidth: 1, borderColor: '#2E333B',
    backgroundColor: 'rgba(20,22,26,.9)',
    // @ts-expect-error — só existe no web; é o vidro do handoff (blur 12).
    backdropFilter: 'blur(12px)',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  lente: {
    height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12,
    borderRadius: 20, backgroundColor: '#262A31', flexShrink: 0, maxWidth: 140,
  },
  bolinha: { width: 8, height: 8, borderRadius: 4 },
  lenteTexto: { fontSize: 13, fontWeight: '700', color: '#F4F5F7', flexShrink: 1 },
  seta: { fontSize: 11, color: '#AEB4BE' },
  busca: { flex: 1, minWidth: 0, height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6 },
  buscaCampo: { flex: 1, minWidth: 0, fontSize: 13, color: '#F4F5F7', height: 40 },
  icone: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  selo: {
    position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: '#E51A31', alignItems: 'center', justifyContent: 'center',
  },
  seloTexto: { fontSize: 10, fontWeight: '800', color: '#fff' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#262A31' },
  avatarTexto: { fontSize: 14, fontWeight: '700', color: '#F4F5F7' },
});
