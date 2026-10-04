// Agenda · Semana (Um app só, PR 2 · docs/11 §2, prancha "Agenda · Semana", 04/10/2026).
//
// O Planejamento do executivo dentro do app: a palavra da semana, quantos dias úteis têm
// visita, e os blocos de cada dia com hora e propósito — o MESMO plano que o Cockpit grava
// e que vira a rota do Mapa (0150). Editar abre o editor do Cockpit embutido (uma regra de
// gravação só); "Escolher no mapa" é o Planejar do Mapa.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import CockpitEmbutido from '../components/CockpitEmbutido';
import { PROPOSITOS, segundaDaSemana, useMunicao, useSemanaDoPlano } from '../hooks/useSemanaDoPlano';
import { useQueryClient } from '@tanstack/react-query';
import { IconChevronLeft, IconChevronRight, useIconColors } from '../components/icons';

const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex'];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function AgendaSemana({ ownerId, aoEscolherNoMapa, hoje }: {
  ownerId: string | null; aoEscolherNoMapa?: () => void; hoje: string;
}) {
  const cores = useIconColors();
  const [desloc, setDesloc] = useState(0);
  const [editando, setEditando] = useState(false);
  const queryClient = useQueryClient();
  const segunda = segundaDaSemana(new Date(), desloc);
  const q = useSemanaDoPlano(ownerId, segunda, true);
  const municao = useMunicao(ownerId, true);
  const sexta = q.data?.dias[4]?.iso ?? segunda;
  const visitas = (q.data?.dias ?? []).reduce((n, d) => n + d.blocos.filter((b) => b.tipo === 'conta' || b.tipo === 'rua' || b.tipo === 'rel').length, 0);
  const cobertos = (q.data?.dias ?? []).filter((d) => d.blocos.some((b) => b.tipo !== 'bloqueado')).length;
  const pr = q.data?.promessa;

  if (!ownerId) return <Text style={s.vazio}>Não há carteira para planejar: seu usuário não está ligado a um dono no HubSpot.</Text>;
  return (
    <View style={{ gap: 12 }}>
      <View style={s.cab}>
        <Pressable accessibilityRole="button" accessibilityLabel="Semana anterior" disabled={desloc <= 0} onPress={() => setDesloc((d) => d - 1)} style={[s.seta, desloc <= 0 && { opacity: 0.35 }]}>
          <IconChevronLeft width={22} height={22} fill={cores.onSurface} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.titulo}>{`Semana ${ddmm(segunda)} a ${ddmm(sexta)}`}</Text>
          <Text style={s.sub}>a mesma rota do mapa, nos dois sentidos</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Próxima semana" disabled={desloc >= 1} onPress={() => setDesloc((d) => d + 1)} style={[s.seta, desloc >= 1 && { opacity: 0.35 }]}>
          <IconChevronRight width={22} height={22} fill={cores.onSurface} />
        </Pressable>
      </View>

      <View style={s.cartao}>
        <Text style={s.rotulo}>A SUA PALAVRA DESTA SEMANA</Text>
        {pr && (pr.visitas != null || pr.fechamentos != null || pr.prospeccao != null) ? (
          <View style={s.palavra}>
            {([['visitas', pr.visitas], ['fechamentos', pr.fechamentos], ['contas novas', pr.prospeccao]] as Array<[string, number | null]>).map(([r, v]) => (
              <View key={r}><Text style={s.palavraNum}>{v ?? '—'}</Text><Text style={s.palavraRot}>{r}</Text></View>
            ))}
          </View>
        ) : <Text style={s.sub}>Ainda sem palavra para esta semana. Dê a sua no editor da semana.</Text>}
        <Text style={s.sub}>{q.isLoading ? 'Lendo o plano…' : `${visitas} ${visitas === 1 ? 'visita agendada' : 'visitas agendadas'} · ${cobertos} de 5 dias úteis cobertos`}</Text>
      </View>

      {(municao.data ?? 0) > 0 && aoEscolherNoMapa && (
        <Pressable accessibilityRole="button" onPress={aoEscolherNoMapa} style={s.municao}>
          <View style={{ flex: 1 }}>
            <Text style={s.municaoTitulo}>{`${municao.data} contas-alvo na munição`}</Text>
            <Text style={s.sub}>escolha a conta, o dia e a hora</Text>
          </View>
          <Text style={s.municaoAcao}>Escolher no mapa</Text>
        </Pressable>
      )}

      {(q.data?.dias ?? []).map((d, i) => (
        <View key={d.iso} style={[s.dia, d.iso === hoje && s.diaHoje]}>
          <View style={s.diaRot}>
            <Text style={s.diaSemana}>{SEMANA[i]}</Text>
            <Text style={s.diaData}>{ddmm(d.iso)}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            {d.blocos.length === 0 && <Text style={s.sub}>nada planejado</Text>}
            {d.blocos.map((b, k) => {
              const p = PROPOSITOS[b.proposito];
              if (b.tipo === 'bloqueado') return <View key={k} style={[s.bloco, { borderLeftColor: 'var(--border)' }]}><Text style={s.blocoHora}>{b.hora || '—'}</Text><Text style={s.sub}>horário bloqueado</Text></View>;
              return (
                <View key={k} style={[s.bloco, { borderLeftColor: p?.cor ?? 'var(--border)' }]}>
                  <Text style={s.blocoHora}>{b.hora || 'sem hora'}</Text>
                  <Text style={s.blocoNome} numberOfLines={1}>{p?.nome ?? 'Visita'}</Text>
                  {b.alvo ? <Text style={s.sub} numberOfLines={1}>{b.alvo}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}

      <Pressable accessibilityRole="button" onPress={() => setEditando(true)} style={s.editar}>
        <Text style={s.editarTexto}>Editar a semana</Text>
        <Text style={s.editarSub}>pôr e mover blocos, dar a palavra da semana</Text>
      </Pressable>

      <CockpitEmbutido aba="planejamento" titulo="Editar a semana" visivel={editando}
        aoFechar={() => {
          setEditando(false);
          void queryClient.invalidateQueries({ queryKey: ['semana_do_plano'] });
          void queryClient.invalidateQueries({ queryKey: ['field_route_stops'] });
          void queryClient.invalidateQueries({ queryKey: ['field_routes'] });
        }} />
    </View>
  );
}

const s = StyleSheet.create({
  cab: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seta: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  setaTexto: { fontSize: 22, fontWeight: '700', color: 'var(--text)', marginTop: -2 },
  titulo: { fontSize: 18, fontWeight: '800', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  vazio: { fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', paddingVertical: 16 },
  cartao: { borderRadius: 16, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', padding: 16, gap: 10 },
  rotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: 'var(--text-muted)' },
  palavra: { flexDirection: 'row', gap: 22 },
  palavraNum: { fontSize: 26, fontWeight: '800', color: 'var(--text)' },
  palavraRot: { fontSize: 13, color: 'var(--text-muted)' },
  municao: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', paddingHorizontal: 14, paddingVertical: 10 },
  municaoTitulo: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  municaoAcao: { fontSize: 14, fontWeight: '700', color: 'var(--vermelho-texto)' },
  dia: { flexDirection: 'row', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border-soft)', backgroundColor: 'var(--surface)', padding: 12 },
  diaHoje: { borderColor: 'var(--vermelho-acao)' },
  diaRot: { width: 44 },
  diaSemana: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  diaData: { fontSize: 12, color: 'var(--text-muted)' },
  bloco: { borderLeftWidth: 3, borderRadius: 8, backgroundColor: 'var(--surface-2)', paddingHorizontal: 10, paddingVertical: 8, gap: 1 },
  blocoHora: { fontSize: 13, fontWeight: '800', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  blocoNome: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  editar: { minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: 'var(--vermelho-acao)', backgroundColor: 'var(--surface)', paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  editarTexto: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  editarSub: { fontSize: 12, color: 'var(--text-muted)' },
});
