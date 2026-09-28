// Aba Agenda do mapa novo (prompt final, Parte B §B3).
//
// A mesma agenda que o gestor vê no Planejamento: as paradas da rota de hoje,
// as tarefas do HubSpot (visitas e retornos que o Cockpit põe na semana) e as
// reuniões/follow-ups agendados pelo app. Nenhum dado próprio.
//
// `Cheguei` na próxima parada é o MESMO check-in do mapa (GPS novo, "Está na
// porta?", ficha de rua): a tela só leva ao mapa e dispara o fluxo de lá.
import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { supabase } from '../integrations/supabase/client';
import RegistrarTarefa, { type TarefaParaRegistrar } from './RegistrarTarefa';
import { fetchOptimizedTrip } from '../utils/routing';
import { Toast } from '../components/Toast';

import { useTarefasDoCrm } from '../hooks/useTarefasDoCrm';
import { ir } from './CardLeadNovo';
import { IconChevronRight, useIconColors } from '../components/icons';
import { acaoRapida, diaBRT, ehCobranca } from '../utils/abaTarefas';
import { compromissosDoDia, diasDaFaixa, estadoDasParadas, rotuloDoDia } from '../utils/agendaNovo';
import type { Client, ClientMeeting, FieldRouteStopWithClient } from '../types/client';

type Props = {
  /** Dia que abre selecionado (o "Ver na Agenda" da ficha de rua). */
  diaInicial?: string | null;
  paradas: FieldRouteStopWithClient[];
  reunioes: ClientMeeting[];
  metaVisitasDia: number;
  nomeDoLead: (c: Client) => string;
  nomePorId: (clientId: string) => string | null;
  distanciaAte: (clientId: string | null) => string | null;
  visitadoHoje: (c: Client) => boolean;
  aoCheguei: (c: Client) => void;
  /** Hora em que a Daily de hoje foi registrada (dailies.created_at). */
  dailyValidadaEm?: string | null;
  aoAbrirLead: (clientId: string) => void;
  /** Põe as paradas em aberto na melhor ordem a partir de onde a pessoa está (App.tsx). */
  aoRoteirizar?: () => void;
  roteirizando?: boolean;
  /** Monta o dia com microrrotas a partir da carteira (App.tsx). */
  aoMontarDia?: () => void;
  montandoDia?: boolean;
  /** Telefone do lead, para o "Ligar agora" do registro. */
  telefoneDe?: (clientId: string | null) => string | null;
  /** Onde a pessoa está: o ponto de partida do roteirizar dos outros dias. */
  base?: { latitude: number; longitude: number } | null;
};

const ruaDo = (c: Client | null) => {
  if (!c) return null;
  const rua = [c.endereco, c.numero].filter(Boolean).join(', ');
  return rua || c.bairro || null;
};

export default function AgendaNovoScreen({
  diaInicial, paradas, reunioes, metaVisitasDia, nomeDoLead, nomePorId, distanciaAte, visitadoHoje, aoCheguei, aoAbrirLead, dailyValidadaEm,
  aoRoteirizar, roteirizando, aoMontarDia, montandoDia, telefoneDe, base,
}: Props) {
  const [roteirizandoDia, setRoteirizandoDia] = useState(false);
  const [registrando, setRegistrando] = useState<TarefaParaRegistrar | null>(null);
  const queryClient = useQueryClient();
  // Concluídas nesta sessão: somem da lista na hora (o Desfazer as devolve).
  const [concluidas, setConcluidas] = useState<Set<string>>(new Set());
  const cores = useIconColors();
  const agora = new Date();
  const hoje = diaBRT(agora)!;
  const dias = useMemo(() => diasDaFaixa(agora), [hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dia, setDia] = useState(diaInicial && diaInicial >= hoje ? diaInicial : hoje);
  const { tarefas } = useTarefasDoCrm(true);
  const { user } = useAuth();

  /* O PLANO DOS OUTROS DIAS (28/09/2026, Julyan: "a munição não está indo pra agenda").
     O que se põe no Planejamento vira parada da rota DAQUELE dia (plano_para_rota), mas
     a Agenda só mostrava a rota de hoje: amanhã em diante aparecia só tarefa e reunião,
     e o planejado sumia. Uma consulta traz as rotas da faixa inteira. */
  const planoDaFaixa = useQuery({
    queryKey: ['field_route_stops', 'faixa', user?.id, dias[0], dias[dias.length - 1]],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('field_routes')
        .select('route_date, stops:field_route_stops(id, client_id, status, position, planned_at, client:clients(*))')
        .eq('seller_id', user!.id).gte('route_date', dias[0]).lte('route_date', dias[dias.length - 1]);
      if (error) throw error;
      const porDia = new Map<string, FieldRouteStopWithClient[]>();
      for (const r of (data ?? []) as unknown as Array<{ route_date: string; stops: FieldRouteStopWithClient[] }>) {
        const vivas = (r.stops ?? []).filter((s) => s.status !== 'removed').sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        porDia.set(r.route_date, [...(porDia.get(r.route_date) ?? []), ...vivas]);
      }
      return porDia;
    },
  });
  const horaDe = (p: FieldRouteStopWithClient, d: string) => (p.planned_at && diaBRT(new Date(p.planned_at)) === d ? Date.parse(p.planned_at) : null);
  const paradasDoDia = (d: string) => {
    if (d === hoje) return paradas;
    const l = [...(planoDaFaixa.data?.get(d) ?? [])];
    // Na ORDEM DA ROTA: é ela que o Percurso segue. O Roteirizar grava essa ordem pela
    // melhor rota ou pela hora combinada no Planejamento.
    return l.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  };

  const estado = estadoDasParadas(
    paradas.map((p) => ({ ...p, visitadoHoje: !!p.client && visitadoHoje(p.client) })),
  );
  const feitas = estado.filter((p) => p.estado === 'feito').length;
  const noPlano = new Set(paradas.map((p) => p.client_id));
  const cobrar = new Set(tarefas.filter((t) => ehCobranca({ assunto: t.assunto, origem: t.marcador?.origem }) && t.clientId).map((t) => t.clientId!));
  const doDia = (d: string) => compromissosDoDia(d, tarefas, reunioes, nomePorId, d === hoje ? noPlano : new Set(paradasDoDia(d).map((p) => p.client_id)));
  const compromissos = doDia(dia).filter((k) => !concluidas.has(k.id)
    && !(k.fonte === 'app' && reunioes.some((r) => `app-${r.id}` === k.id && r.status === 'realizada')));

  /* TERMINAR AS ATIVIDADES DO DIA (28/09/2026, Julyan). A visita se termina no Cheguei
     (GPS, foto, ficha). O que é SÓ LIGAÇÃO — retorno, cobrança, follow-up — se confirma
     aqui com "Liguei", e só isso: visita e reunião não ganham o botão (a mesma regra da
     aba Tarefas, acaoRapida). No HubSpot a tarefa conclui com uma nota da ligação e 5 s
     para desfazer; o follow-up agendado no app vira "realizada". */
  const podeLigar = (k: (typeof compromissos)[number]) => {
    if (k.fonte === 'hubspot') {
      const t = tarefas.find((x) => `hs-${x.id}` === k.id);
      return !!t && acaoRapida(t) === 'liguei';
    }
    return k.tipo === 'retorno';
  };
  const liguei = (k: (typeof compromissos)[number]) => {
    setConcluidas((s) => new Set(s).add(k.id));
    const voltar = () => setConcluidas((s) => { const n = new Set(s); n.delete(k.id); return n; });
    if (k.fonte === 'hubspot') {
      const t = tarefas.find((x) => `hs-${x.id}` === k.id);
      // O mesmo registro da aba Tarefas: como foi, o que vem agora, uma linha.
      voltar();
      if (!t) return;
      setRegistrando({ id: t.id, assunto: t.assunto, dealId: t.dealId, nome: k.nome ?? t.nomeDoCliente, telefone: telefoneDe?.(k.clientId) ?? null });
      return;
    }
    const idReuniao = k.id.replace(/^app-/, '');
    void (async () => {
      const { error } = await supabase.from('client_meetings').update({ status: 'realizada' }).eq('id', idReuniao);
      if (error) { voltar(); Alert.alert('Não consegui confirmar', error.message); return; }
      void queryClient.invalidateQueries({ queryKey: ['client_meetings'] });
    })();
  };

  /* O PERCURSO: as paradas em aberto, na ordem do plano, no Google Maps (até 10 — o
     limite de pontos do Maps no celular). Roteirizar antes põe na melhor ordem. */
  const abertasComPonto = estado.filter((p) => p.estado !== 'feito' && p.client?.latitude != null && p.client?.longitude != null);
  /* O PERCURSO COMPLETO, A PÉ OU DE CARRO (28/09/2026). O Google Maps aceita 10
     pontos por vez: com mais paradas, o percurso sai em partes (1–10, 11–20…), cada
     uma continuando de onde a anterior parou. */
  const abrirPercursoDe = (lista: FieldRouteStopWithClient[]) => {
    const pts = lista.filter((p) => p.client?.latitude != null && p.client?.longitude != null)
      .map((p) => `${p.client!.latitude},${p.client!.longitude}`);
    if (!pts.length) { Toast.mostrar('Nenhuma parada deste dia tem posição no mapa.', 'fila'); return; }
    const abrirParte = (modo: 'walking' | 'driving', ini: number) => {
      const parte = pts.slice(ini, ini + 10);
      const origem = ini > 0 ? pts[ini - 1] : null;
      const destino = parte[parte.length - 1];
      const meio = parte.slice(0, -1).join('|');
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`
        + (origem ? `&origin=${encodeURIComponent(origem)}` : '')
        + (meio ? `&waypoints=${encodeURIComponent(meio)}` : '') + `&travelmode=${modo}`;
      void Linking.openURL(url);
    };
    const escolherParte = (modo: 'walking' | 'driving') => {
      if (pts.length <= 10) { abrirParte(modo, 0); return; }
      const partes = Array.from({ length: Math.ceil(pts.length / 10) }, (_, i) => i * 10);
      Alert.alert('Qual parte do percurso?', `São ${pts.length} paradas; o Maps abre 10 por vez.`, [
        ...partes.map((ini) => ({ text: `Paradas ${ini + 1}–${Math.min(ini + 10, pts.length)}`, onPress: () => abrirParte(modo, ini) })),
        { text: 'Cancelar', style: 'cancel' as const },
      ]);
    };
    Alert.alert(`Percurso · ${pts.length} ${pts.length === 1 ? 'parada' : 'paradas'}`, 'Na ordem do plano, no Google Maps.', [
      { text: 'A pé', onPress: () => escolherParte('walking') },
      { text: 'Carro', onPress: () => escolherParte('driving') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };
  const abrirPercurso = () => abrirPercursoDe(abertasComPonto);

  /* ROTEIRIZAR QUALQUER DIA: a melhor ordem das paradas do dia (ORS, OSRM de reserva),
     a partir de onde a pessoa está — ou da primeira parada, sem GPS. Só a posição muda;
     a hora combinada no Planejamento continua a mesma. */
  const gravarOrdem = async (final: FieldRouteStopWithClient[]) => {
    for (const [i, p] of final.entries()) {
      const { error } = await supabase.from('field_route_stops').update({ position: i + 1 }).eq('id', p.id);
      if (error) throw error;
    }
    void queryClient.invalidateQueries({ queryKey: ['field_route_stops'] });
  };
  const perguntarRoteirizar = (lista: FieldRouteStopWithClient[], d: string) => {
    const comHora = lista.filter((p) => horaDe(p, d) != null).length;
    Alert.alert('Roteirizar o dia', comHora ? `${comHora} de ${lista.length} paradas têm hora combinada no Planejamento.` : undefined, [
      { text: 'Pela melhor rota', onPress: () => { void roteirizarDia(lista); } },
      ...(comHora ? [{ text: 'Pela hora combinada', onPress: () => {
        const ord = [...lista].sort((a, b) => (horaDe(a, d) ?? Infinity) - (horaDe(b, d) ?? Infinity) || (a.position ?? 0) - (b.position ?? 0));
        void gravarOrdem(ord).then(() => Toast.mostrar('✓ Na ordem da hora combinada', 'ok')).catch((e) => Alert.alert('Não deu para reordenar', String((e as Error)?.message ?? e)));
      } }] : []),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };
  const roteirizarDia = async (lista: FieldRouteStopWithClient[]) => {
    const abertas = lista.filter((p) => p.status !== 'done' && p.client?.latitude != null && p.client?.longitude != null);
    if (abertas.length < 2 || roteirizandoDia) return;
    const ponto = (p: FieldRouteStopWithClient) => ({ latitude: Number(p.client!.latitude), longitude: Number(p.client!.longitude) });
    const partida = base ?? ponto(abertas[0]);
    setRoteirizandoDia(true);
    try {
      const trip = await fetchOptimizedTrip([partida, ...abertas.map(ponto)]);
      const ordem = trip.inputOrderToVisit.slice(1).map((i) => abertas[i - 1]).filter(Boolean);
      const resto = lista.filter((p) => !ordem.includes(p));
      const final = [...lista.filter((p) => p.status === 'done'), ...ordem, ...resto.filter((p) => p.status !== 'done')];
      await gravarOrdem(final);
      const km = (trip.distanceMeters / 1000).toFixed(1).replace('.', ',');
      Toast.mostrar(`✓ Roteirizado · ${ordem.length} paradas · ${km} km · ~${Math.round(trip.durationSeconds / 60)} min de carro`, 'ok');
    } catch (e) {
      Alert.alert('Não deu para roteirizar', 'O serviço de rotas não respondeu; a ordem de antes ficou como estava.\n' + String((e as Error)?.message ?? ''));
    } finally {
      setRoteirizandoDia(false);
    }
  };
  const meta = metaVisitasDia > 0 ? metaVisitasDia : 6;

  return (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo}>
      <RegistrarTarefa
        tarefa={registrando}
        aoFechar={() => setRegistrando(null)}
        aoSumir={(id) => setConcluidas((st) => new Set(st).add(`hs-${id}`))}
        aoVoltar={(id) => setConcluidas((st) => { const n = new Set(st); n.delete(`hs-${id}`); return n; })}
      />
      <Text style={s.subtitulo}>A mesma do Planejamento do Cockpit</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.faixa}>
        {dias.map((d) => {
          const r = rotuloDoDia(d, hoje);
          const n = (d === hoje ? estado.length : paradasDoDia(d).length) + doDia(d).length;
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
            {/* Handoff v4.1 §6.14: "Plano de hoje · x de 6", barra verde e a hora da Daily. */}
            <Text style={s.progressoTitulo}>{`Plano de hoje · ${feitas} de ${meta}`}</Text>
            <View style={s.barraPlano}><View style={[s.barraPlanoCheia, { width: `${Math.min(100, Math.round((feitas / meta) * 100))}%` }]} /></View>
            <Text style={s.progressoMeta}>
              {dailyValidadaEm
                ? `validado na Daily ${new Date(dailyValidadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`
                : 'Daily de hoje ainda não registrada'}
            </Text>
          </View>

          {aoMontarDia && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Montar meu dia com microrrotas" disabled={montandoDia}
              style={[s.montarDia, montandoDia && { opacity: 0.6 }]} onPress={aoMontarDia}>
              <Text style={s.montarDiaTitulo}>{montandoDia ? 'Montando o dia…' : 'Montar meu dia'}</Text>
              <Text style={s.montarDiaSub}>microrrotas a pé, a partir de onde você está · o plano do Cockpit continua</Text>
            </TouchableOpacity>
          )}

          {abertasComPonto.length > 0 && (
            <View style={s.acoesRota}>
              {aoRoteirizar && abertasComPonto.length >= 2 && (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Roteirizar as paradas em aberto" disabled={roteirizando}
                  style={[s.acaoRota, roteirizando && { opacity: 0.6 }]} onPress={aoRoteirizar}>
                  <Text style={s.acaoRotaTexto}>{roteirizando ? 'Calculando…' : 'Roteirizar'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Abrir o percurso no Google Maps" style={[s.acaoRota, s.acaoRotaPrim]} onPress={abrirPercurso}>
                <Text style={[s.acaoRotaTexto, { color: '#FFFFFF' }]}>{`Percurso · ${abertasComPonto.length}`}</Text>
              </TouchableOpacity>
            </View>
          )}

          {estado.length === 0 && (
            <Text style={s.vazio}>Sem rota hoje. Toque em "Montar meu dia" ou ponha leads com "+ Rota de hoje" no cartão.</Text>
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
                  {p.estado === 'feito' ? (
                    <Text style={[s.status, s.statusFeito]}>Feito</Text>
                  ) : proxima ? (
                    <Text style={[s.status, s.statusProxima]}>próxima</Text>
                  ) : c ? (
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ir até ${nome}`} style={s.ir} onPress={() => ir(c)}>
                      <Text style={s.irTexto}>Ir</Text>
                    </TouchableOpacity>
                  ) : null}
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

      {dia !== hoje && paradasDoDia(dia).length > 0 && (
        <View style={s.acoesRota}>
          {paradasDoDia(dia).length >= 2 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Roteirizar este dia" disabled={roteirizandoDia}
              style={[s.acaoRota, roteirizandoDia && { opacity: 0.6 }]} onPress={() => perguntarRoteirizar(paradasDoDia(dia), dia)}>
              <Text style={s.acaoRotaTexto}>{roteirizandoDia ? 'Calculando…' : 'Roteirizar'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Abrir o percurso deste dia no Google Maps" style={[s.acaoRota, s.acaoRotaPrim]} onPress={() => abrirPercursoDe(paradasDoDia(dia))}>
            <Text style={[s.acaoRotaTexto, { color: '#FFFFFF' }]}>{`Percurso · ${paradasDoDia(dia).length}`}</Text>
          </TouchableOpacity>
        </View>
      )}

      {dia !== hoje && paradasDoDia(dia).length > 0 && (
        <View style={s.grupo}>
          <Text style={s.secao}>{`PLANO DO DIA · ${paradasDoDia(dia).length}`}</Text>
          {paradasDoDia(dia).map((p, i) => {
            const c = p.client;
            const nome = c ? nomeDoLead(c) : 'Parada';
            // A hora que o Planejamento marcou (plano_para_rota grava planned_at no dia);
            // parada sem hora mostra a ordem.
            const hora = p.planned_at && dia === diaBRT(new Date(p.planned_at))
              ?new Date(p.planned_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : null;
            return (
              <TouchableOpacity key={p.id} accessibilityRole="button" style={s.compromisso} onPress={() => aoAbrirLead(p.client_id)}>
                <Text style={s.hora}>{hora ?? String(i + 1)}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.paradaNome} numberOfLines={1}>{nome}</Text>
                  {!!ruaDo(c) && <Text style={s.paradaSub} numberOfLines={1}>{[ruaDo(c), distanciaAte(p.client_id)].filter(Boolean).join(' · ')}</Text>}
                  <View style={s.chips}><Text style={s.chip}>Visita do plano</Text></View>
                </View>
                <IconChevronRight width={20} height={20} fill={cores.muted} />
              </TouchableOpacity>
            );
          })}
        </View>
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
                {(() => {
                  const sub = [k.titulo, distanciaAte(k.clientId)].filter(Boolean).join(' · ');
                  return sub ? <Text style={s.paradaSub} numberOfLines={1}>{sub}</Text> : null;
                })()}
                <View style={s.chips}><Text style={s.chip}>{k.fonte === 'hubspot' ? 'Planejamento' : 'Agendado no app'}</Text></View>
              </View>
              {dia <= hoje && podeLigar(k) ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Liguei: ${k.nome ?? k.titulo ?? 'retorno'}`} style={s.liguei} onPress={() => liguei(k)}>
                  <Text style={s.ligueiTexto}>{k.fonte === 'hubspot' ? 'Registrar' : 'Liguei'}</Text>
                </TouchableOpacity>
              ) : (!!k.clientId && <IconChevronRight width={20} height={20} fill={cores.muted} />)}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {dia !== hoje && compromissos.length === 0 && paradasDoDia(dia).length === 0 && (
        <Text style={s.vazio}>Nada marcado neste dia. O “Agendar” do cartão e o próximo passo do registro caem aqui.</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  acoesRota: { flexDirection: 'row', gap: 8 },
  montarDia: { minHeight: 56, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: '#C8131B', justifyContent: 'center', gap: 2 },
  montarDiaTitulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  montarDiaSub: { fontSize: 12, color: 'var(--text-muted)' },
  acaoRota: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  acaoRotaPrim: { backgroundColor: '#C8131B', borderColor: '#C8131B' },
  acaoRotaTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  liguei: { minHeight: 44, minWidth: 72, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'var(--tint-green)', borderWidth: 1, borderColor: 'var(--tint-green-border)', alignItems: 'center', justifyContent: 'center' },
  ligueiTexto: { fontSize: 14, fontWeight: '700', color: 'var(--tint-green-text)' },
  conteudo: { padding: 16, paddingBottom: 32, gap: 12 },
  subtitulo: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  // paddingTop: o selo do dia sai 6px acima da caixa, e o scroll horizontal corta o que passa.
  faixa: { gap: 8, paddingRight: 16, paddingTop: 8 },
  dia: {
    width: 54, minHeight: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2,
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
  barraPlano: { height: 8, borderRadius: 4, backgroundColor: 'var(--surface-3, #3A3F47)', overflow: 'hidden', marginTop: 8 },
  barraPlanoCheia: { height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  ir: { minHeight: 44, minWidth: 56, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  irTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
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
