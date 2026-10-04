// Desenvolvimento, enxuto (Um app só, PR 5 · docs/11 §2 e U9, prancha "Desenvolvimento", 04/10/2026).
//
// O executivo abre aqui uma vez por semana, antes do 1:1. Ficou o que serve para isso:
//  - as 3 prioridades da semana, tiradas dos números de hoje (placar e fila);
//  - os acordos do 1:1 (marcar feito; o gestor valida ou devolve com motivo);
//  - o PDI (título do documento vigente);
//  - as conquistas — a MESMA lista da folha do ranking (minhas_conquistas);
//  - "Entenda seus números" — o antigo Meu desempenho.
// Treinos e falas prontas do Desenvolvimento do Cockpit vivem no Playbook, na etapa certa.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useMeuPdi } from '../hooks/useMeuPdi';
import { usePlacar } from '../hooks/useUmApp';
import { useConquistas } from './FolhaRanking';
import { IconCheck, IconChevronRight, useIconColors } from '../components/icons';

type ItemDaFila = { grupo: string; negocio: string; porque: string; passouRegua?: boolean };

export default function DesenvolvimentoScreen({ aoAbrirNumeros, aoAbrirPlaybook }: { aoAbrirNumeros: () => void; aoAbrirPlaybook: () => void }) {
  const cores = useIconColors();
  const queryClient = useQueryClient();
  const { pdi, carregando, marcar } = useMeuPdi(true);
  const placar = usePlacar(true);
  const conquistas = useConquistas(true);
  const fila = queryClient.getQueryData<{ itens?: ItemDaFila[] }>(['fila_tarefas']);

  // as 3 prioridades: o que mais move a semana, medido agora
  const prioridades: Array<{ titulo: string; sub: string }> = [];
  const rg = placar.data?.regua;
  if (rg && rg.abertos - rg.com_passo > 0) {
    const n = rg.abertos - rg.com_passo;
    prioridades.push({ titulo: `Datar os ${n} ${n === 1 ? 'negócio' : 'negócios'} sem próximo passo`, sub: `${rg.com_passo} de ${rg.abertos} abertos já têm data` });
  }
  const travado = fila?.itens?.find((i) => i.passouRegua) ?? fila?.itens?.find((i) => i.grupo === 'destravar');
  if (travado) prioridades.push({ titulo: `Destravar ${travado.negocio}`, sub: travado.porque });
  const se = placar.data?.semana;
  if (se) {
    if (se.piso_faltam_demos > 0) prioridades.push({ titulo: 'Fazer 1 demo realizada até sexta', sub: `${se.demos} nesta semana · o piso pede 1` });
    else if (se.piso_faltam_provadas > 0) prioridades.push({ titulo: `Mais ${se.piso_faltam_provadas} visitas provadas`, sub: `${se.provadas} de 10 do piso da semana` });
    else prioridades.push({ titulo: 'Piso da semana batido: vá pelos pontos', sub: `${se.pts} de ${se.meta_pts} pts` });
  }

  const acordos = pdi?.compromissos ?? [];
  const lista = conquistas.data ?? [];
  return (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo}>
      <Text style={s.intro}>Você abre aqui uma vez por semana, antes do 1:1. Treinos e falas prontas estão no Playbook, na etapa certa.</Text>

      <View style={s.bloco}>
        <Text style={s.rotulo}>SUAS 3 PRIORIDADES DA SEMANA</Text>
        {placar.isLoading && <ActivityIndicator />}
        {prioridades.slice(0, 3).map((p, i) => (
          <View key={i} style={s.prioridade}>
            <View style={s.n}><Text style={s.nTexto}>{i + 1}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.item}>{p.titulo}</Text>
              <Text style={s.sub} numberOfLines={2}>{p.sub}</Text>
            </View>
          </View>
        ))}
        {!placar.isLoading && prioridades.length === 0 && <Text style={s.sub}>Sem prioridade medida agora.</Text>}
      </View>

      <View style={s.bloco}>
        <Text style={s.rotulo}>ACORDOS DO 1:1</Text>
        {carregando && <ActivityIndicator />}
        {!carregando && acordos.length === 0 && <Text style={s.sub}>Nenhum acordo aberto com o gestor.</Text>}
        {acordos.map((c) => (
          <Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{ checked: c.feito, disabled: marcar.isPending || c.estado === 'validado' }}
            disabled={marcar.isPending || c.estado === 'validado'} onPress={() => marcar.mutate({ id: c.id, feito: !c.feito })} style={s.acordo}>
            <View style={[s.circulo, c.feito && s.circuloFeito]}>{c.feito && <IconCheck width={14} height={14} fill="#FFFFFF" />}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.item, c.feito && { textDecorationLine: 'line-through', color: 'var(--text-muted)' }]}>{c.texto}</Text>
              <Text style={[s.sub, c.estado === 'devolvido' && { color: 'var(--vermelho-texto)' }]}>
                {c.estado === 'validado' ? 'validado pelo gestor' : c.estado === 'devolvido' ? `devolvido: ${c.devolvidoMotivo ?? 'fale com o gestor'}` : c.estado === 'feito' ? 'feito · o gestor valida' : 'aberto'}
              </Text>
            </View>
          </Pressable>
        ))}
        {acordos.length > 0 && <Text style={s.nota}>O acordo com prazo nesta semana também aparece na fila de Tarefas.</Text>}
      </View>

      {pdi?.titulo ? (
        <View style={s.bloco}>
          <Text style={s.rotulo}>MEU PDI</Text>
          <Text style={s.item}>{pdi.titulo}</Text>
        </View>
      ) : null}

      <View style={s.bloco}>
        <Text style={s.rotulo}>{`CONQUISTAS${lista.length ? ` · ${lista.filter((c) => c.feito).length} DE ${lista.length}` : ''}`}</Text>
        {conquistas.isLoading && <ActivityIndicator />}
        {lista.map((c) => (
          <View key={c.id} style={s.conquista}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.item}>{c.titulo}</Text>
              <Text style={s.sub}>{c.medido === false ? 'não medido' : `${Math.min(c.progresso, c.alvo)} de ${c.alvo} ${c.unidade}`}</Text>
            </View>
            {c.feito && <IconCheck width={18} height={18} fill={cores.tintGreenText} />}
          </View>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={aoAbrirNumeros} style={s.link}>
        <View style={{ flex: 1 }}>
          <Text style={s.item}>Entenda seus números</Text>
          <Text style={s.sub}>hoje · 7 dias · 30 dias · tudo, atividade e seus leads</Text>
        </View>
        <IconChevronRight width={20} height={20} fill={cores.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={aoAbrirPlaybook} style={s.link}>
        <View style={{ flex: 1 }}>
          <Text style={s.item}>Playbook</Text>
          <Text style={s.sub}>treinos, falas prontas e como passar de cada etapa</Text>
        </View>
        <IconChevronRight width={20} height={20} fill={cores.muted} />
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  conteudo: { padding: 16, paddingBottom: 32, gap: 12 },
  intro: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 18 },
  bloco: { borderRadius: 16, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', padding: 16, gap: 10 },
  rotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: 'var(--text-muted)' },
  prioridade: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  n: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  nTexto: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  item: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  nota: { fontSize: 12, color: 'var(--text-faint)' },
  acordo: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 52 },
  circulo: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  circuloFeito: { backgroundColor: 'var(--verde-acao)', borderColor: 'var(--verde-acao)' },
  conquista: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', paddingHorizontal: 16 },
});
