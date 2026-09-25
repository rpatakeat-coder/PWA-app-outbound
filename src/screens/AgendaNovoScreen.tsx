// Aba Agenda do mapa novo (prompt final, Parte B §B3).
//
// A mesma agenda que o gestor vê no Planejamento: as paradas da rota de hoje,
// as tarefas do HubSpot (visitas e retornos que o Cockpit põe na semana) e as
// reuniões/follow-ups agendados pelo app. Nenhum dado próprio.
//
// `Cheguei` na próxima parada é o MESMO check-in do mapa (GPS novo, "Está na
// porta?", ficha de rua): a tela só leva ao mapa e dispara o fluxo de lá.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTarefasDoCrm } from '../hooks/useTarefasDoCrm';
import { IconChevronRight, useIconColors } from '../components/icons';
import { diaBRT, ehCobranca } from '../utils/abaTarefas';
import { compromissosDoDia, diasDaFaixa, estadoDasParadas, rotuloDoDia } from '../utils/agendaNovo';
import type { Client, ClientMeeting, FieldRouteStopWithClient } from '../types/client';

type Props = {
  paradas: FieldRouteStopWithClient[];
  reunioes: ClientMeeting[];
  metaVisitasDia: number;
  nomeDoLead: (c: Client) => string;
  nomePorId: (clientId: string) => string | null;
  distanciaAte: (clientId: string | null) => string | null;
  visitadoHoje: (c: Client) => boolean;
  aoCheguei: (c: Client) => void;
  aoAbrirLead: (clientId: string) => void;
};

const ruaDo = (c: Client | null) => {
  if (!c) return null;
  const rua = [c.endereco, c.numero].filter(Boolean).join(', ');
  return rua || c.bairro || null;
};

export default function AgendaNovoScreen({
  paradas, reunioes, metaVisitasDia, nomeDoLead, nomePorId, distanciaAte, visitadoHoje, aoCheguei, aoAbrirLead,
}: Props) {
  const cores = useIconColors();
  const agora = new Date();
  const hoje = diaBRT(agora)!;
  const dias = useMemo(() => diasDaFaixa(agora), [hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dia, setDia] = useState(hoje);
  const { tarefas } = useTarefasDoCrm(true);

  const estado = estadoDasParadas(
    paradas.map((p) => ({ ...p, visitadoHoje: !!p.client && visitadoHoje(p.client) })),
  );
  const feitas = estado.filter((p) => p.estado === 'feito').length;
  const noPlano = new Set(paradas.map((p) => p.client_id));
  const cobrar = new Set(tarefas.filter((t) => ehCobranca({ assunto: t.assunto, origem: t.marcador?.origem }) && t.clientId).map((t) => t.clientId!));
  const doDia = (d: string) => compromissosDoDia(d, tarefas, reunioes, nomePorId, d === hoje ? noPlano : undefined);
  const compromissos = doDia(dia);
  const meta = metaVisitasDia > 0 ? metaVisitasDia : 6;

  return (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo}>
      <Text style={s.subtitulo}>A mesma do Planejamento do Cockpit</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.faixa}>
        {dias.map((d) => {
          const r = rotuloDoDia(d, hoje);
          const n = (d === hoje ? estado.length : 0) + doDia(d).length;
          const ativo = d === dia;
          return (
            <TouchableOpacity
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected: ativo }}
              accessibilityLabel={`${r.semana} ${r.numero}${n ? `, ${n} ${n === 1 ? 'item' : 'itens'}` : ''}`}
              style={[s.dia, ativo && s.diaAtivo]}
              onPress={() => setDia(d)}
            >
              <Text style={[s.diaSemana, ativo && s.diaTextoAtivo]}>{r.semana}</Text>
              <Text style={[s.diaNumero, ativo && s.diaTextoAtivo]}>{r.numero}</Text>
              {n > 0 && <View style={[s.diaSelo, ativo && s.diaSeloAtivo]}><Text style={[s.diaSeloTexto, ativo && s.diaSeloTextoAtivo]}>{n}</Text></View>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {dia === hoje && (
        <>
          <View style={s.progresso}>
            <Text style={s.progressoTitulo}>{`Plano de hoje · ${feitas} de ${estado.length} feito`}</Text>
            {estado.length > 0 && (
              <View style={s.segmentos}>
                {estado.map((p) => <View key={p.id} style={[s.segmento, p.estado === 'feito' && s.segmentoFeito]} />)}
              </View>
            )}
            <Text style={s.progressoLinha}>{`visitas hoje: ${feitas} de ${meta}`}</Text>
            <Text style={s.progressoMeta}>{`Meta do playbook: ${meta} visitas qualificadas por dia`}</Text>
          </View>

          {estado.length === 0 && (
            <Text style={s.vazio}>Sem rota hoje. Monte pela "Rota de hoje" no topo.</Text>
          )}

          {estado.map((p, i) => {
            const c = p.client;
            const nome = c ? nomeDoLead(c) : 'Parada';
            const sub = [ruaDo(c), distanciaAte(p.client_id)].filter(Boolean).join(' · ');
            const proxima = p.estado === 'proxima';
            return (
              <View key={p.id} style={[s.parada, proxima && s.paradaProxima]}>
                <TouchableOpacity accessibilityRole="button" style={s.paradaLinha} onPress={() => aoAbrirLead(p.client_id)}>
                  <View style={[s.numero, p.estado === 'feito' && s.numeroFeito, proxima && s.numeroProxima]}>
                    <Text style={[s.numeroTexto, (p.estado === 'feito' || proxima) && s.numeroTextoClaro]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.paradaNome, p.estado === 'feito' && s.paradaNomeFeita]} numberOfLines={1}>{nome}</Text>
                    {!!sub && <Text style={s.paradaSub} numberOfLines={1}>{sub}</Text>}
                    <View style={s.chips}>
                      <Text style={s.chip}>Visita do plano</Text>
                      {cobrar.has(p.client_id) && <Text style={[s.chip, s.chipCobrar]}>cobrar</Text>}
                    </View>
                  </View>
                  <Text style={[s.status, p.estado === 'feito' && s.statusFeito, proxima && s.statusProxima]}>
                    {p.estado === 'feito' ? 'feito ✓' : proxima ? 'próxima' : 'pendente'}
                  </Text>
                </TouchableOpacity>
                {proxima && c && (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Cheguei em ${nome}`} style={s.cheguei} onPress={() => aoCheguei(c)}>
                    <Text style={s.chegueiTexto}>Cheguei</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </>
      )}

      {compromissos.length > 0 && (
        <View style={s.grupo}>
          <Text style={s.secao}>{dia === hoje ? 'REUNIÕES E RETORNOS DE HOJE' : 'REUNIÕES E RETORNOS'}</Text>
          {compromissos.map((k) => (
            <TouchableOpacity
              key={k.id}
              accessibilityRole="button"
              disabled={!k.clientId}
              style={s.compromisso}
              onPress={() => k.clientId && aoAbrirLead(k.clientId)}
            >
              <Text style={s.hora}>{k.hora ?? '—'}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.paradaNome} numberOfLines={1}>{`${k.tipo[0].toUpperCase()}${k.tipo.slice(1)} · ${k.nome ?? 'cliente não identificado'}`}</Text>
                <Text style={s.paradaSub} numberOfLines={1}>{[k.titulo, distanciaAte(k.clientId)].filter(Boolean).join(' · ')}</Text>
                <View style={s.chips}><Text style={s.chip}>{k.fonte === 'hubspot' ? 'Planejamento' : 'Agendado no app'}</Text></View>
              </View>
              {!!k.clientId && <IconChevronRight width={20} height={20} fill={cores.muted} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {dia !== hoje && compromissos.length === 0 && (
        <Text style={s.vazio}>Nada marcado neste dia. O "Agendar" do card e o próximo passo da ficha caem aqui.</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  conteudo: { padding: 16, paddingBottom: 32, gap: 12 },
  subtitulo: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  faixa: { gap: 8, paddingRight: 16 },
  dia: {
    width: 56, minHeight: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2,
    backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)',
  },
  diaAtivo: { backgroundColor: '#C8131B', borderColor: '#C8131B' },
  diaSemana: { fontSize: 11, fontWeight: '700', color: 'var(--text-muted)' },
  diaNumero: { fontSize: 18, fontWeight: '800', color: 'var(--text)' },
  diaTextoAtivo: { color: '#FFFFFF' },
  diaSelo: { position: 'absolute', top: -6, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: 'var(--text)', alignItems: 'center', justifyContent: 'center' },
  diaSeloAtivo: { backgroundColor: '#FFFFFF' },
  diaSeloTexto: { fontSize: 10, fontWeight: '800', color: 'var(--surface)' },
  diaSeloTextoAtivo: { color: '#C8131B' },
  progresso: { padding: 16, gap: 8, borderRadius: 16, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  progressoTitulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  segmentos: { flexDirection: 'row', gap: 4 },
  segmento: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'var(--border)' },
  segmentoFeito: { backgroundColor: 'var(--tint-green-text)' },
  progressoLinha: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  progressoMeta: { fontSize: 12, color: 'var(--text-faint)' },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)', textAlign: 'center', paddingVertical: 16 },
  parada: { borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)', overflow: 'hidden' },
  paradaProxima: { borderColor: '#C8131B', borderWidth: 2 },
  paradaLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 12, paddingVertical: 10 },
  numero: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  numeroFeito: { backgroundColor: 'var(--tint-green-text)', borderColor: 'var(--tint-green-text)' },
  numeroProxima: { backgroundColor: '#C8131B', borderColor: '#C8131B' },
  numeroTexto: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  numeroTextoClaro: { color: '#FFFFFF' },
  paradaNome: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: 'var(--text)' },
  paradaNomeFeita: { color: 'var(--text-muted)' },
  paradaSub: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { fontSize: 11, fontWeight: '700', color: 'var(--text-muted)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: 'var(--border)', overflow: 'hidden' },
  chipCobrar: { color: 'var(--tint-red-text)', borderColor: 'var(--tint-red-border)' },
  status: { fontSize: 12, fontWeight: '700', color: 'var(--text-faint)' },
  statusFeito: { color: 'var(--tint-green-text)' },
  statusProxima: { color: '#C8131B' },
  cheguei: { marginHorizontal: 12, marginBottom: 12, minHeight: 48, borderRadius: 12, backgroundColor: '#C8131B', alignItems: 'center', justifyContent: 'center' },
  chegueiTexto: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  grupo: { gap: 8, marginTop: 4 },
  secao: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--text-faint)' },
  compromisso: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)',
  },
  hora: { width: 44, fontSize: 14, fontWeight: '800', color: 'var(--text)', fontVariant: ['tabular-nums'] },
});
