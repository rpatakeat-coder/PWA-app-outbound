// Barra de topo do app de campo v4.1 (handoff §3 e §6.1): UMA linha que
// flutua sobre o mapa — busca, sino e avatar. Desde a prancha "Mapa do Executivo" (15/10/26) a
// lente não mora mais aqui: ganhou a fileira logo abaixo (FileiraDeLentes), e a barra segue o
// tema (pílula clara no claro, escura no escuro), como a prancha.
//
// top = área segura + 7 (54 num iPhone de 47 de status bar), 12 px das
// bordas, 48 de altura, raio 24. O mapa começa atrás dela: é o mapa que
// ocupa a tela, não o cabeçalho.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { IconBell, IconClose, IconSearch, useIconColors } from '../components/icons';
import { IconChevronDown as SiDown } from '../components/icons';

export const ALTURA_TOPO_CAMPO = 48;

type Props = {
  top: number;
  /** Legado: a pílula da lente no topo (sem ela, a busca ocupa a largura). */
  lente?: { rotulo: string; cor: string } | null;
  aoAbrirLentes?: () => void;
  busca: string;
  aoBuscar: (t: string) => void;
  /** O campo só abre a folha de busca (§6.10); digitar é lá. */
  aoAbrirBusca: () => void;
  buscando: boolean;
  selo: number;
  aoSino: () => void;
  avatar: { url?: string | null; nome?: string | null; email?: string | null };
  aoAvatar: () => void;
};

export default function TopoCampo({ top, lente = null, aoAbrirLentes, busca, aoBuscar, aoAbrirBusca, buscando, selo, aoSino, avatar, aoAvatar }: Props) {
  const cores = useIconColors();
  return (
    <View style={[s.barra, { top }]} accessibilityRole="toolbar">
      {lente && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Lente ${lente.rotulo}. Trocar lente, filtros e legenda`} onPress={aoAbrirLentes} style={s.lenteAlvo}>
          <View style={s.lente}>
            <View style={[s.bolinha, { backgroundColor: lente.cor }]} />
            <Text style={s.lenteTexto} numberOfLines={1}>{lente.rotulo}</Text>
            <SiDown width={16} height={16} fill={cores.muted} />
          </View>
        </Pressable>
      )}
      <View style={[s.busca, !lente && s.buscaSozinha]}>
        <IconSearch width={16} height={16} fill={cores.muted} />
        <Pressable
          style={s.buscaAbrir}
          onPress={aoAbrirBusca}
          accessibilityRole="search"
          accessibilityLabel={busca ? `Busca: ${busca}. Abrir busca` : 'Buscar lead, rua ou bairro'}
        >
          <Text style={[s.buscaCampo, !busca && s.buscaVazia]} numberOfLines={1}>{busca || 'Buscar lead, rua ou bairro'}</Text>
        </Pressable>
        {buscando && <ActivityIndicator size="small" color={cores.muted} />}
        {busca.length > 0 && !buscando && (
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => aoBuscar('')} style={s.limpar}>
            <IconClose width={16} height={16} fill={cores.muted} />
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selo ? `Avisos, ${selo} ${selo === 1 ? 'novo' : 'novos'}` : 'Avisos'}
        onPress={aoSino}
        style={s.icone}
      >
        <IconBell width={22} height={22} fill={cores.onSurface} />
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
    flexDirection: 'row', alignItems: 'center', gap: 0, paddingLeft: 4, paddingRight: 0,
    borderRadius: 24, borderWidth: 1, borderColor: 'var(--border)',
    /* sem o desfoque (14/10/26): a GPU refazia o blur a cada quadro do mapa. A cor segue o tema
       (prancha 15/10/26: pílula clara no claro, escura no escuro). */
    backgroundColor: 'var(--pilula-mapa)',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  // ALVOS DE 48 (handoff v4.1 §13): a barra tem 48 contando a borda; o alvo
  // ocupa a altura toda (margem -1 sobre a borda) e o desenho segue com 40.
  // hitSlop não vale no navegador: o "limpar" tinha 16 px de toque.
  // 160: com 140 "Contas-alvo" saía "Contas-al…" (auditoria 06/10)
  lenteAlvo: { height: 48, marginVertical: -1, justifyContent: 'center', flexShrink: 0, maxWidth: 160 },
  limpar: { width: 48, height: 48, marginVertical: -1, alignItems: 'center', justifyContent: 'center' },
  lente: {
    height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12,
    borderRadius: 20, backgroundColor: 'var(--chip-mapa)', flexShrink: 0, maxWidth: 160,
  },
  bolinha: { width: 8, height: 8, borderRadius: 4 },
  lenteTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)', flexShrink: 1 },
  seta: { fontSize: 11, color: '#AEB4BE' },
  busca: { flex: 1, minWidth: 0, height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6 },
  buscaSozinha: { paddingLeft: 12, gap: 10 },
  // era estilo de campo (flex 1 + altura 40) num texto: o "Lead ou rua" ficava grudado no topo da pílula
  buscaCampo: { fontSize: 14, lineHeight: 18, fontWeight: '500', color: 'var(--text)' },
  buscaAbrir: { flex: 1, minWidth: 0, minHeight: 48, marginVertical: -1, justifyContent: 'center' },
  buscaVazia: { color: 'var(--text-muted)' },
  icone: { width: 48, height: 48, marginVertical: -1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  selo: {
    position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center',
  },
  seloTexto: { fontSize: 10, fontWeight: '800', color: '#fff' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'var(--chip-mapa)' },
  avatarTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
});
