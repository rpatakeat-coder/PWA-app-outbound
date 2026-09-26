// Filtros do mapa novo (entrega 3; prancha §8.9).
//
// Tela própria: Só minha área, Status, Temperatura da etapa e Origem do lead,
// cada chip com a contagem que ele entrega ao ser tocado. O rascunho só vale
// no "Ver N"; "Limpar" zera. "Mais filtros" abre o painel antigo (UF, etapa,
// vendedor, visita), porque nada da tela atual pode sumir (§9).
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Painel } from '../components/Painel';
import type { Client } from '../types/client';
import {
  contarChips, FILTROS_VAZIOS, ORIGEM, passaNosFiltros, ROTULO_STATUS, ROTULO_TEMP,
  type FiltrosNovos, type OrigemFiltro, type StatusFiltro, type TempFiltro,
} from '../utils/lentes';
import type { Pino } from '../utils/pinoP2';

type Props = {
  visivel: boolean;
  aoFechar: () => void;
  itens: { c: Client; p: Pino }[];
  filtros: FiltrosNovos;
  aoAplicar: (f: FiltrosNovos) => void;
  soMinhaArea: boolean;
  aoTrocarSoMinhaArea: (v: boolean) => void;
  aoAbrirMaisFiltros: () => void;
  motorConferidoEm?: string | null;
  /** Só para gestor/admin: leads de teste (0106) ficam escondidos por padrão. */
  mostrarTestes?: boolean;
  aoTrocarMostrarTestes?: (v: boolean) => void;
};

const COR_TEMP: Record<TempFiltro, string> = {
  Q: '#E23B3B', M: '#F5A524', F: '#0EA5E9', fechado: '#16A34A', perdido: '#4B5563', alvo: '#8B5CF6',
};

function alternar<T>(s: Set<T>, v: T): Set<T> {
  const n = new Set(s);
  if (n.has(v)) n.delete(v); else n.add(v);
  return n;
}

export default function FiltrosMapaNovo({
  visivel, aoFechar, itens, filtros, aoAplicar, soMinhaArea, aoTrocarSoMinhaArea, aoAbrirMaisFiltros, motorConferidoEm,
  mostrarTestes, aoTrocarMostrarTestes,
}: Props) {
  const [rascunho, setRascunho] = useState<FiltrosNovos>(filtros);
  useEffect(() => { if (visivel) setRascunho(filtros); }, [visivel, filtros]);

  const contagem = useMemo(() => contarChips(itens, rascunho), [itens, rascunho]);
  const total = useMemo(() => itens.filter(({ c, p }) => passaNosFiltros(c, p, rascunho)).length, [itens, rascunho]);

  const chip = (chave: string, rotulo: string, n: number, ativo: boolean, aoTocar: () => void, bolinha?: string, cores?: { fundo: string; tinta: string }) => (
    <Pressable
      key={chave}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      accessibilityLabel={`${rotulo}, ${n}`}
      onPress={aoTocar}
      style={[s.chip, ativo && s.chipAtivo, cores && !ativo && { backgroundColor: cores.fundo, borderColor: cores.fundo }]}
    >
      {bolinha && <View style={[s.bolinha, { backgroundColor: bolinha }]} />}
      <Text style={[s.chipTexto, cores && !ativo && { color: cores.tinta }, ativo && s.chipTextoAtivo]}>{rotulo}</Text>
      <Text style={[s.chipN, cores && !ativo && { color: cores.tinta }, ativo && s.chipTextoAtivo]}>{n}</Text>
    </Pressable>
  );

  const dataMotor = motorConferidoEm
    ? new Date(motorConferidoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
    : null;

  return (
    <Painel
      visivel={visivel}
      aoFechar={aoFechar}
      rotulo="Filtros do mapa"
      topo={<Text style={s.titulo}>Filtros</Text>}
      rodape={
        <View style={s.rodape}>
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoLimpar]} onPress={() => setRascunho(FILTROS_VAZIOS)}>
            <Text style={s.botaoLimparTexto}>Limpar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoVer]} onPress={() => { aoAplicar(rascunho); aoFechar(); }}>
            <Text style={s.botaoVerTexto}>{`Ver ${total}`}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={s.corpo}>
        <View style={s.linhaSwitch}>
          <View style={{ flex: 1 }}>
            <Text style={s.secaoTitulo}>Só minha área</Text>
            <Text style={s.ajuda}>Carrega o que está na tela, em volta de você.</Text>
          </View>
          <Switch value={soMinhaArea} onValueChange={aoTrocarSoMinhaArea} accessibilityLabel="Só minha área" />
        </View>

        <Text style={s.secaoTitulo}>Status</Text>
        <View style={s.chips}>
          {(Object.keys(ROTULO_STATUS) as StatusFiltro[]).map((k) =>
            chip(`s-${k}`, ROTULO_STATUS[k], contagem.status.get(k) ?? 0, rascunho.status.has(k),
              () => setRascunho((r) => ({ ...r, status: alternar(r.status, k) }))))}
        </View>

        <Text style={s.secaoTitulo}>Temperatura da etapa</Text>
        <View style={s.chips}>
          {(Object.keys(ROTULO_TEMP) as TempFiltro[]).map((k) =>
            chip(`t-${k}`, ROTULO_TEMP[k], contagem.temp.get(k) ?? 0, rascunho.temp.has(k),
              () => setRascunho((r) => ({ ...r, temp: alternar(r.temp, k) })), COR_TEMP[k]))}
        </View>

        <Text style={s.secaoTitulo}>Origem do lead</Text>
        <View style={s.chips}>
          {(Object.keys(ORIGEM) as OrigemFiltro[]).map((k) =>
            chip(`o-${k}`, ORIGEM[k].rotulo, contagem.origem.get(k) ?? 0, rascunho.origem.has(k),
              () => setRascunho((r) => ({ ...r, origem: alternar(r.origem, k) })), undefined, ORIGEM[k]))}
        </View>

        {aoTrocarMostrarTestes && (
          <View style={s.linhaSwitch}>
            <View style={{ flex: 1 }}>
              <Text style={s.secaoTitulo}>Mostrar testes</Text>
              <Text style={s.ajuda}>Leads de QA ("Teste", "RPA demo"). Só gestor vê esta opção.</Text>
            </View>
            <Switch value={!!mostrarTestes} onValueChange={aoTrocarMostrarTestes} accessibilityLabel="Mostrar testes" />
          </View>
        )}

        <Pressable accessibilityRole="button" style={s.mais} onPress={aoAbrirMaisFiltros}>
          <Text style={s.maisTexto}>Mais filtros · UF, etapa, vendedor, visita</Text>
        </Pressable>

        <Text style={s.nota}>
          {dataMotor ? `Tempo parado e cobranças do Cockpit, atualizados em ${dataMotor}.` : 'Tempo parado e cobranças do Cockpit: data da atualização desconhecida.'}
        </Text>
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  titulo: { fontSize: 18, fontWeight: '800', color: 'var(--text)', paddingHorizontal: 16, paddingVertical: 12 },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 4 },
  secaoTitulo: { fontSize: 14, fontWeight: '800', color: 'var(--text)', marginTop: 6 },
  ajuda: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22,
    borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)',
  },
  chipAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  bolinha: { width: 8, height: 8, borderRadius: 4 },
  chipTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  chipN: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  chipTextoAtivo: { color: 'var(--tint-red-text)' },
  mais: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  maisTexto: { fontSize: 14, fontWeight: '700', color: 'var(--info-text)', textDecorationLine: 'underline' },
  nota: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },
  rodape: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  botao: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  botaoLimpar: { flex: 1, borderWidth: 1, borderColor: 'var(--border)' },
  botaoLimparTexto: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  botaoVer: { flex: 2, backgroundColor: '#E51A31' },
  botaoVerTexto: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
