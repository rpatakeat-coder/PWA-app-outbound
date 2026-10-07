// Aba Agenda do mapa novo — "O que eu tenho hoje, a que horas, e estou no ritmo?"
// Handoff "Abas do app" (Claude Design, 04/10/2026), pranchas G1/G2/R1 e docs/12 §1–2.
//
// De cima para baixo: a semana com o propósito de cada dia (o planos_semanais do
// Planejamento do Cockpit), Lista | Mapa do dia, o ritmo numa linha (o ÚNICO lugar do app que
// pede a promessa do dia), "N feitas hoje", a próxima ação com o preparo de 10 s já aberto, o
// resto do dia em ordem, e uma porta só para montar ou refazer o dia. Nenhum dado próprio: as
// paradas da rota (field_route_stops), as tarefas do HubSpot e as reuniões do app.
//
// `Cheguei` na próxima parada é o MESMO check-in do mapa (GPS novo, "Está na porta?", ficha de
// rua): a tela só leva ao mapa e dispara o fluxo de lá.
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { Painel } from '../components/Painel';
import { supabase } from '../integrations/supabase/client';
import RegistrarTarefa, { type TarefaParaRegistrar } from './RegistrarTarefa';
import { fetchOptimizedTrip } from '../utils/routing';
import { Toast } from '../components/Toast';

import { useTarefasDoCrm } from '../hooks/useTarefasDoCrm';
import { useMinhaDaily } from '../hooks/useMinhaDaily';
import { useMeuDia } from '../hooks/useMeuDia';
import { ir } from './CardLeadNovo';
import {
  IconBook, IconCalendar, IconCall, IconCar, IconCheck, IconChevronRight, IconLocation, IconRefresh, IconSquareMenu, IconWhatsapp, useIconColors,
} from '../components/icons';
import { acaoRapida, diaBRT, ehCobranca } from '../utils/abaTarefas';
import { compromissosDoDia, estadoDasParadas, paradaParaCasar, seloDoCompromisso, separarCompromissos } from '../utils/agendaNovo';
import { acaoPorId } from '../utils/acoesDoPlano';
import { montarFeitoNoDia, type FichaDoDia, type RegistroDoDia, type VisitaDoDia } from '../utils/feitoNoDia';
import { proximoDiaUtil } from '../../supabase/functions/_compartilhado/filaDoDinheiro';
import { porNoDia } from '../utils/paradaDoDia';
import { lerSemanaDoPlano, PROPOSITOS, type DiaDoPlano } from '../utils/semanaDoPlano';
import { montarPreparo, usePreparo } from '../utils/preparo';
import { stageTemperature } from '../constants/stages';
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
  /** Mantido por compatibilidade: a hora da promessa agora vem do useMeuDia. */
  dailyValidadaEm?: string | null;
  aoAbrirLead: (clientId: string) => void;
  /** Põe as paradas em aberto na melhor ordem a partir de onde a pessoa está (App.tsx). */
  aoRoteirizar?: () => void;
  roteirizando?: boolean;
  /** Monta o dia com microrrotas a partir da carteira (App.tsx). */
  aoMontarDia?: () => void;
  montandoDia?: boolean;
  /** Telefone do lead, para Ligar e Confirmar no WhatsApp. */
  telefoneDe?: (clientId: string | null) => string | null;
  /** Onde a pessoa está: o ponto de partida do roteirizar dos outros dias. */
  base?: { latitude: number; longitude: number } | null;
  /** O dono no HubSpot: chave do planos_semanais (a faixa da semana). */
  ownerHubspot?: string | null;
  /** Etapa (código) e dias na etapa do snapshot, e a régua da etapa — o mesmo do cartão. */
  contextoDe?: (c: Client) => { codigo: string | null; diasNaEtapa: number | null; regua: number | null };
  /** Lista | Mapa do dia (opção A da Rota): abre o mapa do dia. Sem ela, sem seletor. */
  aoMapaDoDia?: () => void;
  /** Playbook pela etapa do lead. */
  aoPlaybook?: () => void;
  /** Computador: o mapa fica na coluna da direita, sem seletor. */
  largo?: boolean;
  /** Computador (05/10/26): o dia escolhido vai ao mapa da direita, que entra no modo Planejar dele. */
  aoMudarDia?: (iso: string) => void;
  /** O dia trocado pela barra do Planejar volta para cá. */
  diaControlado?: string | null;
};

const ruaDo = (c: Client | null) => {
  if (!c) return null;
  const rua = [c.endereco, c.numero].filter(Boolean).join(', ');
  return rua || c.bairro || null;
};
const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const dowDe = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const horaBRT = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const soDigitos = (t: string) => t.replace(/\D+/g, '');
const com55 = (t: string) => { const d = soDigitos(t); return d.length <= 11 ? `55${d}` : d; };
const corRegua = (r: 'ok' | 'perto' | 'passou' | null) => (r === 'passou' ? 'var(--vermelho-texto)' : r === 'perto' ? 'var(--ambar-texto)' : 'var(--tint-green-text)');

/** O preparo de 10 s (docs/12 §1.5): barra de 8, etapa na cor da régua, último contato, contatos,
 *  o que falta e quem decide. */
function Preparo({ c, contextoDe, telefone }: { c: Client; contextoDe?: Props['contextoDe']; telefone: string | null }) {
  const q = usePreparo(c.id, true, c.id_hubspot ? String(c.id_hubspot) : null);
  const ctx = contextoDe?.(c) ?? { codigo: null, diasNaEtapa: null, regua: null };
  const p = montarPreparo({ codigo: ctx.codigo, diasNaEtapa: ctx.diasNaEtapa, reguaDias: ctx.regua, telefone, fichas: q.data?.fichas ?? [], toques: q.data?.toques ?? [], negocio: q.data?.negocio ?? null });
  return (
    <View style={{ gap: 8 }}>
      {p.indice >= 0 && (
        <View style={s.segs8}>{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <View key={i} style={[s.seg8, i <= p.indice && { backgroundColor: 'var(--vermelho-acao)' }]} />)}</View>
      )}
      {!!p.etapaTexto && <Text style={[s.etapaTexto, { color: corRegua(p.regua) }]}>{p.etapaTexto}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[s.caixa, { flex: 1.4 }]}>
          <Text style={s.caixaRotulo}>ÚLTIMO CONTATO</Text>
          <Text style={s.caixaValor}>{q.isLoading ? '…' : p.ultimo}</Text>
        </View>
        <View style={[s.caixa, { flex: 1 }]}>
          <Text style={s.caixaRotulo}>CONTATOS</Text>
          <Text style={s.caixaValor}>{q.isLoading ? '…' : `${p.contatos} de 4`}</Text>
        </View>
      </View>
      {!!p.falta && (
        <View style={[s.caixa, s.caixaAmbar]}>
          <Text style={[s.caixaRotulo, { color: 'var(--tint-amber-text)' }]}>{p.faltaConferida ? 'O QUE FALTA' : 'A PRÓXIMA ETAPA PEDE'}</Text>
          <Text style={[s.caixaValor, { color: 'var(--tint-amber-text)' }]}>{p.falta}</Text>
        </View>
      )}
      <View style={s.caixa}>
        <Text style={s.caixaRotulo}>QUEM DECIDE</Text>
        <Text style={s.caixaValor}>{q.isLoading ? '…' : p.decide}</Text>
      </View>
    </View>
  );
}

type Linha =
  | { k: string; tipo: 'parada'; ordem: number; hora: string | null; numero: number; p: FieldRouteStopWithClient }
  | { k: string; tipo: 'compromisso'; ordem: number; hora: string | null; comp: ReturnType<typeof compromissosDoDia>[number] };

export default function AgendaNovoScreen({
  diaInicial, paradas, reunioes, metaVisitasDia, nomeDoLead, nomePorId, distanciaAte, visitadoHoje, aoCheguei, aoAbrirLead,
  aoRoteirizar, roteirizando, aoMontarDia, montandoDia, telefoneDe, base, ownerHubspot, contextoDe, aoMapaDoDia, aoPlaybook, largo, aoMudarDia, diaControlado,
}: Props) {
  const [roteirizandoDia, setRoteirizandoDia] = useState(false);
  const [registrando, setRegistrando] = useState<TarefaParaRegistrar | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [feitasAbertas, setFeitasAbertas] = useState(true);
  const [porta, setPorta] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const queryClient = useQueryClient();
  // Concluídas nesta sessão: somem da lista na hora (o Desfazer as devolve).
  const [concluidas, setConcluidas] = useState<Set<string>>(new Set());
  const cores = useIconColors();
  const agora = new Date();
  const hoje = diaBRT(agora)!;
  const horaAgora = Number(agora.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' })) % 24;
  /* A SEMANA INTEIRA, A PASSADA E A QUE VEM (Julyan, 05/10/26: "preciso ver os outros dias da
     semana também" — "os dois, passados e a semana que vem"). Era hoje + 4 dias úteis: na
     quarta, segunda e terça sumiam, e a semana seguinte só aparecia aos pedaços. Agora é
     segunda a sexta da semana escolhida, com o seletor Esta semana / Semana que vem. */
  const segundaDe = (iso: string, mais: number) => {
    const t = new Date(`${iso}T12:00:00Z`);
    const dow = t.getUTCDay();
    t.setUTCDate(t.getUTCDate() - (dow === 0 ? 6 : dow - 1) + 7 * mais + (dow === 6 || dow === 0 ? 7 : 0));
    return t.toISOString().slice(0, 10);
  };
  const somaDias = (iso: string, n: number) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const semanaDoDia = (iso: string) => (iso >= segundaDe(hoje, 1) ? 1 : 0);
  const [semanaVista, setSemanaVista] = useState(diaInicial ? semanaDoDia(diaInicial) : 0);
  const dias = useMemo(() => { const seg = segundaDe(hoje, semanaVista); return [0, 1, 2, 3, 4].map((i) => somaDias(seg, i)); }, [hoje, semanaVista]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dia, setDia] = useState(diaInicial && dias.includes(diaInicial) ? diaInicial : hoje);
  const irParaSemana = (n: number) => {
    setSemanaVista(n);
    const seg = segundaDe(hoje, n);
    const naSemana = [0, 1, 2, 3, 4].map((i) => somaDias(seg, i));
    setDia(naSemana.includes(hoje) ? hoje : naSemana.find((d) => d >= hoje) ?? naSemana[0]);
  };
  // o mapa do computador acompanha o dia daqui, e a barra do Planejar devolve o dia trocado lá
  useEffect(() => { aoMudarDia?.(dia); }, [dia]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!diaControlado || diaControlado === dia) return;
    if (!dias.includes(diaControlado)) setSemanaVista(semanaDoDia(diaControlado));
    setDia(diaControlado);
  }, [diaControlado]); // eslint-disable-line react-hooks/exhaustive-deps
  const { tarefas } = useTarefasDoCrm(true);
  const { user } = useAuth();
  const { prometer } = useMinhaDaily(true);
  const meuDia = useMeuDia(true, user?.id ?? null);

  /* FEITO NO DIA (06/10/26): os check-ins, o registro de cada visita e o que foi registrado na
     Tarefas, do dia aberto (hoje ou um que já passou). Três leituras em paralelo, só as dele. */
  const feitoQ = useQuery({
    queryKey: ['feito_no_dia', user?.id, dia],
    enabled: !!user?.id && dia <= hoje,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const ini = new Date(`${dia}T00:00:00-03:00`).toISOString();
      const fim = new Date(`${dia}T23:59:59.999-03:00`).toISOString();
      const [v, fi, r] = await Promise.all([
        supabase.from('client_visits').select('id, client_id, visited_at, distance_m, declarada, client:clients(empresa, nome)')
          .eq('visited_by', user!.id).gte('visited_at', ini).lte('visited_at', fim),
        supabase.from('fichas_de_rua').select('client_id, ocorrido_em, como_foi, proximo, proximo_em, proximo_tipo, etapa_antes, etapa_depois, decisor_nome, motivo_perdido, client:clients(empresa, nome)')
          .eq('criado_por', user!.id).gte('ocorrido_em', ini).lte('ocorrido_em', fim),
        supabase.from('fila_feitas').select('id, deal_id, negocio, hora, resultado, volta, perdido, criada_em')
          .eq('user_id', user!.id).eq('dia', dia).neq('estado', 'desfeita'),
      ]);
      if (v.error) throw v.error;
      if (fi.error) throw fi.error;
      const nomes = new Map<string, string>();
      for (const x of [...(v.data ?? []), ...(fi.data ?? [])] as Array<{ client_id: string | null; client?: { empresa?: string | null; nome?: string | null } | null }>) {
        if (x.client_id && x.client) nomes.set(x.client_id, (x.client.empresa?.trim() || x.client.nome || '').trim());
      }
      return { visitas: (v.data ?? []) as unknown as VisitaDoDia[], fichas: (fi.data ?? []) as unknown as FichaDoDia[], registros: (r.error ? [] : (r.data ?? [])) as RegistroDoDia[], nomes };
    },
  });

  /* O PLANO DOS OUTROS DIAS (28/09/2026). O que se põe no Planejamento vira parada da rota
     DAQUELE dia (plano_para_rota): uma consulta traz as rotas da faixa inteira. */
  const planoDaFaixa = useQuery({
    queryKey: ['field_route_stops', 'faixa', user?.id, dias[0], dias[dias.length - 1]],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('field_routes')
        .select('route_date, stops:field_route_stops(id, client_id, status, position, planned_at, acao, horario_fixo, client:clients(*))')
        .eq('seller_id', user!.id).gte('route_date', dias[0]).lte('route_date', dias[dias.length - 1]);
      if (error) throw error;
      const porDia = new Map<string, FieldRouteStopWithClient[]>();
      for (const r of (data ?? []) as unknown as Array<{ route_date: string; stops: FieldRouteStopWithClient[] }>) {
        const vivas = (r.stops ?? []).filter((x) => x.status !== 'removed' && x.status !== 'skipped').sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        porDia.set(r.route_date, [...(porDia.get(r.route_date) ?? []), ...vivas]);
      }
      return porDia;
    },
  });
  // O propósito de cada dia: o mesmo planos_semanais do Planejamento (Fase 0).
  const semana = useQuery<Map<string, DiaDoPlano>>({
    queryKey: ['plano_semana_agenda', ownerHubspot, dias[0], dias[4]],
    enabled: !!ownerHubspot,
    staleTime: 60_000,
    queryFn: async () => {
      const [a, b] = await Promise.all([lerSemanaDoPlano(ownerHubspot!, dias[0]), lerSemanaDoPlano(ownerHubspot!, dias[4])]);
      return new Map([...a, ...b].map((d) => [d.iso, d]));
    },
  });
  // Demos realizadas de hoje (livro da temporada, a mesma régua do Cockpit) — para a noite.
  const demosHoje = useQuery<number>({
    queryKey: ['demos_hoje', ownerHubspot, hoje],
    enabled: !!ownerHubspot && horaAgora >= 18,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count } = await supabase.from('pontos_eventos').select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerHubspot!).eq('tipo', 'demo_realizada').gte('ref_em', `${hoje}T03:00:00.000Z`);
      return count ?? 0;
    },
  });

  const horaDe = (p: FieldRouteStopWithClient, d: string) => (p.planned_at && diaBRT(new Date(p.planned_at)) === d ? Date.parse(p.planned_at) : null);
  const paradasDoDia = (d: string) => {
    if (d === hoje) return paradas;
    return [...(planoDaFaixa.data?.get(d) ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  };

  const estado = estadoDasParadas(paradas.map((p) => ({ ...p, visitadoHoje: !!p.client && visitadoHoje(p.client) })));
  const feitasLista = estado.filter((p) => p.estado === 'feito');
  const proxima = estado.find((p) => p.estado === 'proxima') ?? null;
  const cobrar = new Set(tarefas.filter((t) => ehCobranca({ assunto: t.assunto, origem: t.marcador?.origem }) && t.clientId).map((t) => t.clientId!));
  // UM PLANO SÓ (06/10/26): o compromisso que casa com uma parada (negócio, nome no bairro,
  // cadastro) vira selo nela; Ligar vai às Ligações do dia; o resto fica em "Fora do plano".
  const doDia = (d: string) => compromissosDoDia(d, tarefas, reunioes, nomePorId, paradasDoDia(d).map(paradaParaCasar));
  const compromissos = doDia(dia).filter((k) => !concluidas.has(k.id)
    && !(k.fonte === 'app' && reunioes.some((r) => `app-${r.id}` === k.id && (r.status === 'realizada' || r.status === 'nao_aconteceu'))));
  const sep = separarCompromissos(compromissos);
  const soltos = [...sep.ligacoes, ...sep.fora];
  /** o chip da parada (0175) e os selos dos compromissos casados com ela */
  const chipDaParada = (p: FieldRouteStopWithClient) => acaoPorId(p.acao)?.rotulo ?? null;
  const selosDa = (clientId: string) => (sep.casados.get(clientId) ?? []).map((k) => seloDoCompromisso(k, clientId));

  /* TERMINAR AS ATIVIDADES DO DIA (28/09/2026). A visita se termina no Cheguei. O que é SÓ
     LIGAÇÃO — retorno, cobrança, follow-up — se confirma com o registro (a mesma regra da aba
     Tarefas, acaoRapida). */
  const podeLigar = (k: (typeof compromissos)[number]) => {
    if (k.fonte === 'hubspot') {
      const t = tarefas.find((x) => `hs-${x.id}` === k.id);
      return !!t && acaoRapida(t) === 'liguei';
    }
    return k.tipo === 'retorno';
  };
  const registrar = (k: (typeof compromissos)[number]) => {
    setConcluidas((st) => new Set(st).add(k.id));
    const voltar = () => setConcluidas((st) => { const n = new Set(st); n.delete(k.id); return n; });
    if (k.fonte === 'hubspot') {
      const t = tarefas.find((x) => `hs-${x.id}` === k.id);
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
  const ligar = (clientId: string | null, k?: (typeof compromissos)[number]) => {
    const tel = telefoneDe?.(clientId);
    if (!tel) { Toast.mostrar('Sem telefone no CRM para este lead.', 'fila'); return; }
    void Linking.openURL(`tel:+${com55(tel)}`);
    // Ao voltar da ligação, o registro em 3 toques (a tarefa do HubSpot conclui com a nota).
    if (k && podeLigar(k)) setTimeout(() => registrar(k), 600);
  };
  const confirmarNoWhatsApp = (k: (typeof compromissos)[number]) => {
    const tel = telefoneDe?.(k.clientId);
    if (!tel) { Toast.mostrar('Sem telefone no CRM para confirmar.', 'fila'); return; }
    const msg = `Olá! Confirmando nossa conversa${k.hora ? ` de hoje às ${k.hora}` : ''}. Tudo certo?`;
    void Linking.openURL(`https://wa.me/${com55(tel)}?text=${encodeURIComponent(msg)}`);
  };

  /* O PERCURSO COMPLETO, A PÉ OU DE CARRO (28/09/2026): 10 pontos por vez no Google Maps. */
  const abertasComPonto = estado.filter((p) => p.estado !== 'feito' && p.client?.latitude != null && p.client?.longitude != null);
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

  /* ROTEIRIZAR QUALQUER DIA: a melhor ordem (ORS, OSRM de reserva) a partir de onde a pessoa
     está. Só a posição muda; a hora combinada no Planejamento continua a mesma. */
  const gravarOrdem = async (final: FieldRouteStopWithClient[]) => {
    for (const [i, p] of final.entries()) {
      const { error } = await supabase.from('field_route_stops').update({ position: i + 1 }).eq('id', p.id);
      if (error) throw error;
    }
    void queryClient.invalidateQueries({ queryKey: ['field_route_stops'] });
  };
  const pelaHoraDoPlano = (lista: FieldRouteStopWithClient[], d: string) => {
    const comHora = lista.filter((p) => horaDe(p, d) != null).length;
    if (!comHora) { Toast.mostrar('O plano deste dia não tem hora marcada: a ordem já é a do Planejamento.', 'fila'); return; }
    const ord = [...lista].sort((a, b) => (horaDe(a, d) ?? Infinity) - (horaDe(b, d) ?? Infinity) || (a.position ?? 0) - (b.position ?? 0));
    void gravarOrdem(ord).then(() => Toast.mostrar(`Na ordem do plano · ${comHora} com hora marcada`, 'ok'))
      .catch((e) => Alert.alert('Não deu para reordenar', String((e as Error)?.message ?? e)));
  };
  const roteirizarDia = async (lista: FieldRouteStopWithClient[]) => {
    const abertas = lista.filter((p) => p.status !== 'done' && p.client?.latitude != null && p.client?.longitude != null);
    if (abertas.length < 2 || roteirizandoDia) { Toast.mostrar('Com menos de 2 paradas em aberto não há o que reordenar.', 'fila'); return; }
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
      Toast.mostrar(`Roteirizado · ${ordem.length} paradas · ${km} km · ~${Math.round(trip.durationSeconds / 60)} min de carro`, 'ok');
    } catch (e) {
      Alert.alert('Não deu para roteirizar', 'O cálculo ou a gravação da ordem falhou; confira a lista antes de sair.\n' + String((e as Error)?.message ?? ''));
    } finally {
      setRoteirizandoDia(false);
    }
  };

  // ---- o ritmo (docs/12 §1.3): o único lugar do app que pede a promessa ----
  const md = meuDia.data;
  const prometido = md?.prometido?.visitas ?? null;
  const alvo = prometido ?? (metaVisitasDia > 0 ? metaVisitasDia : 6);
  const provadas = md?.provadasHoje ?? md?.visitasHoje ?? feitasLista.length;
  const momento: 'manha' | 'rua' | 'noite' = horaAgora >= 18 ? 'noite' : horaAgora < 11 && provadas === 0 ? 'manha' : 'rua';
  const pedePromessa = prometido == null && horaAgora < 12 && !!md;
  const prometer_ = (n: number) => {
    prometer.mutate(n, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['meu_dia'] });
        Toast.mostrar(`Prometido: ${n} visitas · vai para a Daily do time no Cockpit`, 'ok');
      },
      onError: (e) => Alert.alert('Não consegui gravar a promessa', String((e as Error)?.message ?? e)),
    });
  };

  // ---- a linha do tempo de hoje: próxima em destaque, o resto em ordem de hora ----
  const linhasDepois: Linha[] = [];
  // HORA ESTIMADA (docs/12 §1.6): parada sem hora marcada ganha "~HH:MM" — a partir de agora,
  // 20 min por visita e o deslocamento em linha reta × 1,3 a 25 km/h entre um ponto e o outro.
  // Parada com hora do Planejamento mantém a hora dela e acerta o relógio da conta.
  const VISITA_MS = 20 * 60000;
  type Ponto = { latitude: number; longitude: number };
  const pontoDe = (c: Client | null | undefined): Ponto | null => (c && c.latitude != null && c.longitude != null ? { latitude: Number(c.latitude), longitude: Number(c.longitude) } : null);
  const viagemMs = (a: Ponto | null, b: Ponto | null) => {
    if (!a || !b) return 10 * 60000;
    const r = 6371, rad = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
    const km = 2 * r * Math.asin(Math.sqrt(h)) * 1.3;
    return Math.round((km / 25) * 3600000);
  };
  let relogio = Date.now();
  let anterior: Ponto | null = base ?? null;
  if (proxima?.client) {
    const hp = horaDe(proxima, hoje);
    relogio = Math.max(relogio + viagemMs(anterior, pontoDe(proxima.client)), hp ?? 0) + VISITA_MS;
    anterior = pontoDe(proxima.client) ?? anterior;
  }
  estado.forEach((p, i) => {
    if (p.estado !== 'pendente') return;
    const h = horaDe(p, hoje);
    let hora: string;
    if (h) { relogio = Math.max(relogio, h); hora = horaBRT(p.planned_at!); }
    else { relogio += viagemMs(anterior, pontoDe(p.client)); hora = `~${horaBRT(new Date(relogio).toISOString())}`; }
    linhasDepois.push({ k: `p-${p.id}`, tipo: 'parada', ordem: relogio, hora, numero: i + 1, p });
    anterior = pontoDe(p.client) ?? anterior;
    relogio += VISITA_MS;
  });
  linhasDepois.sort((a, b) => a.ordem - b.ordem);
  const semRota = estado.length === 0;

  // Dia fechado (noite): o que ficou para trás, com "Pôr amanhã".
  const amanha = proximoDiaUtil(hoje, 1);
  const ficaram = estado.filter((p) => p.estado !== 'feito');
  const porAmanha = (p: FieldRouteStopWithClient) => {
    if (!user?.id) return;
    void porNoDia(user.id, amanha, p.client_id)
      .then((r) => {
        void queryClient.invalidateQueries({ queryKey: ['field_route_stops'] });
        Toast.mostrar(r === 'ja' ? 'Já estava no plano de amanhã' : `No plano de ${SEMANA_LONGA[dowDe(amanha)]} ${ddmm(amanha)} · aparece no Planejamento do Cockpit`, 'ok');
      })
      .catch((e) => Alert.alert('Não consegui pôr amanhã', String((e as Error)?.message ?? e)));
  };

  // o chip do dia tem ~60 px a 390: "Relacionamento · 4" saía "Relacion…" (auditoria 06/10)
  const CURTO: Record<string, string> = { relac: 'Relac.', follow: 'Follow', nova: 'Nova' };
  const rotuloDia = (d: string) => {
    const pl = semana.data?.get(d);
    const n = (d === hoje ? estado.length : paradasDoDia(d).length) + doDia(d).length;
    if (pl?.proposito) return `${CURTO[pl.proposito] ?? PROPOSITOS[pl.proposito] ?? pl.proposito}${n ? ` · ${n}` : ''}`;
    return n ? `${n} ${n === 1 ? 'item' : 'itens'}` : '—';
  };

  // ---- blocos ----
  const seletorSemana = (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      {[{ n: 0, rot: 'Esta semana' }, { n: 1, rot: 'Semana que vem' }].map((o) => (
        <Pressable key={o.n} accessibilityRole="button" accessibilityState={{ selected: semanaVista === o.n }}
          onPress={() => irParaSemana(o.n)}
          style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', borderWidth: 1,
            borderColor: semanaVista === o.n ? 'var(--tint-red-border)' : 'var(--border)', backgroundColor: semanaVista === o.n ? 'var(--tint-red)' : 'transparent' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: semanaVista === o.n ? 'var(--tint-red-text)' : 'var(--text)' }}>{o.rot}</Text>
        </Pressable>
      ))}
    </View>
  );
  const faixa = (
    <View style={s.faixa}>
      {dias.map((d) => {
        const ativo = d === dia;
        const passou = d < hoje;
        const rot = d === hoje ? 'HOJE' : SEMANA[dowDe(d)];
        return (
          <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: ativo }}
            accessibilityLabel={`${rot} ${d.slice(8)}: ${rotuloDia(d)}`}
            style={[s.dia, ativo && s.diaAtivo, passou && !ativo && { opacity: 0.6 }]} onPress={() => { setDia(d); setAberto(null); }}>
            <Text style={[s.diaSemana, ativo && { color: 'var(--vermelho-texto)' }]}>{rot}</Text>
            <Text style={s.diaNumero}>{String(Number(d.slice(8)))}</Text>
            <Text style={s.diaProposito} numberOfLines={1}>{rotuloDia(d)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const seletor = !largo && aoMapaDoDia && dia === hoje && !semRota ? (
    <View style={s.seg}>
      <View style={[s.segItem, s.segItemAtivo]} accessibilityRole="tab" accessibilityState={{ selected: true }}>
        <IconSquareMenu width={18} height={18} fill={cores.onSurface} />
        <Text style={s.segTexto}>Lista</Text>
      </View>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: false }} style={s.segItem} onPress={aoMapaDoDia}>
        <IconLocation width={18} height={18} fill={cores.muted} />
        <Text style={[s.segTexto, { color: 'var(--text-muted)' }]}>Mapa do dia</Text>
      </Pressable>
    </View>
  ) : null;

  const ritmo = pedePromessa ? (
    <View style={s.promessa}>
      <Text style={s.promessaTitulo}>Quantas visitas você faz hoje?</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[4, 6, 8, 10].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Prometer ${n} visitas`} disabled={prometer.isPending}
            style={[s.promessaChip, prometer.isPending && { opacity: 0.5 }]} onPress={() => prometer_(n)}>
            <Text style={s.promessaChipTexto}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.promessaNota}>Uma vez por dia, só aqui. Vai para a Daily do time no Cockpit.</Text>
    </View>
  ) : (
    <View style={s.ritmo}>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text style={s.ritmoLinha} numberOfLines={1}>
          <Text style={s.ritmoNumero}>{`${provadas} de ${alvo}`}</Text>
          <Text style={s.ritmoRotulo}>  visitas provadas</Text>
        </Text>
        <View style={s.tracos}>
          {Array.from({ length: Math.max(1, Math.min(alvo, 12)) }, (_, i) => (
            <View key={i} style={[s.traco, i < provadas && { backgroundColor: 'var(--verde-acao)' }]} />
          ))}
        </View>
      </View>
      <Text style={s.ritmoPromessa} numberOfLines={2}>
        {md?.prometido?.validadaEm && prometido != null ? `prometeu ${prometido} às ${horaBRT(md.prometido.validadaEm)}` : 'sem promessa hoje'}
      </Text>
    </View>
  );

  /* FEITO NO DIA: aberto, com o resumo de cada item — como foi, a etapa e o próximo passo com o
     dia —, para ninguém esquecer o que combinou. Check-in sem registro aparece em âmbar e abre o
     cartão para registrar. Tocar em qualquer item abre o lead. */
  const itensFeitos = feitoQ.data ? montarFeitoNoDia({
    visitas: feitoQ.data.visitas, fichas: feitoQ.data.fichas, registros: feitoQ.data.registros,
    nomeDe: (id) => feitoQ.data!.nomes.get(id) || nomePorId(id) || null,
    noPlano: new Set(paradasDoDia(dia).map((p) => p.client_id)),
  }) : [];
  const faltamRegistro = itensFeitos.filter((i) => i.faltaRegistro).length;
  const feitas = itensFeitos.length > 0 ? (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: feitasAbertas }} style={s.feitasLinha} onPress={() => setFeitasAbertas((v) => !v)}>
        <View style={s.feitasIcone}><IconCheck width={14} height={14} fill="var(--tint-green-text)" /></View>
        <Text style={s.feitasTexto}>{`${dia === hoje ? 'FEITO HOJE' : 'FEITO NO DIA'} · ${itensFeitos.length}${faltamRegistro ? ` · ${faltamRegistro} sem registro` : ''}`}</Text>
        <Text style={s.feitasAcao}>{feitasAbertas ? 'ocultar' : 'ver'}</Text>
      </Pressable>
      {feitasAbertas && itensFeitos.map((i) => (
        <Pressable key={i.chave} accessibilityRole="button" disabled={!i.clientId} style={[s.feitoItem, i.faltaRegistro && s.feitoFalta]} onPress={() => i.clientId && aoAbrirLead(i.clientId)}>
          <Text style={s.hora}>{i.hora}</Text>
          <View style={[s.disco, { backgroundColor: i.faltaRegistro ? 'var(--tint-amber)' : 'var(--tint-green)' }]}>
            {i.tipo === 'tarefa' ? <IconCall width={14} height={14} fill="var(--tint-green-text)" /> : <IconCheck width={14} height={14} fill={i.faltaRegistro ? 'var(--tint-amber-text)' : 'var(--tint-green-text)'} />}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text style={s.nomeLinha} numberOfLines={1}>{i.nome}</Text>
            <Text style={s.subLinha} numberOfLines={1}>{i.linha1}</Text>
            {i.linha2 ? <Text style={s.feitoResumo} numberOfLines={2}>{i.linha2}</Text> : null}
            {i.faltaRegistro
              ? <Text style={s.feitoFaltaTexto}>Falta registrar como foi · toque para abrir o cartão</Text>
              : i.proximo ? <Text style={s.feitoProximo} numberOfLines={2}>{`Próximo passo: ${i.proximo}`}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  ) : null;

  const heroi = proxima && proxima.client && momento !== 'noite' ? (() => {
    const c = proxima.client!;
    const numero = estado.indexOf(proxima) + 1;
    const temp = stageTemperature(c.etapa);
    const manha = momento === 'manha';
    const tel = telefoneDe?.(c.id) ?? c.telefone ?? null;
    return (
      <View style={s.heroi}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.heroiOlho}>{`${manha ? 'PRIMEIRA PARADA' : 'AGORA'} · ${numero} DO PLANO`}</Text>
            <Pressable accessibilityRole="button" onPress={() => aoAbrirLead(c.id)}>
              <Text style={s.heroiNome} numberOfLines={2}>{nomeDoLead(c)}</Text>
            </Pressable>
            <Text style={s.heroiSub} numberOfLines={2}>{[ruaDo(c), distanciaAte(c.id)].filter(Boolean).join(' · ')}</Text>
          </View>
          {temp && (
            <View style={s.tempChip}><View style={[s.ponto, { backgroundColor: temp.color }]} /><Text style={s.tempTexto}>{temp.label}</Text></View>
          )}
        </View>
        <Preparo c={c} contextoDe={contextoDe} telefone={tel} />
        <Pressable accessibilityRole="button" accessibilityLabel={manha ? `Ir agora até ${nomeDoLead(c)}` : `Cheguei em ${nomeDoLead(c)}`}
          style={s.botao56} onPress={() => (manha ? ir(c) : aoCheguei(c))}>
          {manha ? <IconCar width={20} height={20} fill="#FFFFFF" /> : <IconLocation width={20} height={20} fill="#FFFFFF" />}
          <Text style={s.botao56Texto}>{manha ? 'Ir agora' : 'Cheguei'}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => ligar(c.id)}>
            <IconCall width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>Ligar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => (manha ? aoAbrirLead(c.id) : ir(c))}>
            {manha ? <IconLocation width={16} height={16} fill={cores.onSurface} /> : <IconCar width={16} height={16} fill={cores.onSurface} />}
            <Text style={s.botaoSecTexto}>{manha ? 'Cartão' : 'Ir'}</Text>
          </Pressable>
          {aoPlaybook && (
            <Pressable accessibilityRole="button" style={s.botaoSec} onPress={aoPlaybook}>
              <IconBook width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>Playbook</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  })() : null;

  const linhaDepois = (l: Linha) => {
    const open = aberto === l.k;
    if (l.tipo === 'parada') {
      const c = l.p.client;
      const nome = c ? nomeDoLead(c) : 'Parada';
      const temp = c ? stageTemperature(c.etapa) : null;
      return (
        <View key={l.k} style={[s.linha, open && s.linhaAberta]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} style={s.linhaTopo} onPress={() => setAberto(open ? null : l.k)}>
            <Text style={s.hora}>{l.hora ?? '~'}</Text>
            <View style={[s.disco, { backgroundColor: temp?.color ?? 'var(--surface-3)' }]}><Text style={s.discoTexto}>{l.numero}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.nomeLinha} numberOfLines={1}>{nome}</Text>
              <Text style={s.subLinha} numberOfLines={1}>{[chipDaParada(l.p), distanciaAte(l.p.client_id), cobrar.has(l.p.client_id) ? 'cobrar' : null].filter(Boolean).join(' · ') || 'visita do plano'}</Text>
              {selosDa(l.p.client_id).map((x) => <Text key={x} style={s.selo} numberOfLines={1}>{x}</Text>)}
            </View>
            {c && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Ir até ${nome}`} style={s.botaoLinha} onPress={() => ir(c)}>
                <IconCar width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoLinhaTexto}>Ir</Text>
              </Pressable>
            )}
          </Pressable>
          {open && c && (
            <View style={s.linhaPreparo}>
              {/* A RUA É DINÂMICA (Julyan 06/10): chegou antes da hora, ou fora da ordem, faz o
                  check-in daqui mesmo — o mesmo Cheguei do cartão (GPS + registro). */}
              {dia === hoje && (
                <Pressable accessibilityRole="button" accessibilityLabel={`Cheguei em ${nome}`} style={s.botao56} onPress={() => aoCheguei(c)}>
                  <IconLocation width={20} height={20} fill="#FFFFFF" /><Text style={s.botao56Texto}>{visitadoHoje(c) ? 'Registrar de novo' : 'Cheguei'}</Text>
                </Pressable>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => aoAbrirLead(c.id)}>
                  <IconLocation width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>Abrir o cartão</Text>
                </Pressable>
                <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => ligar(c.id)}>
                  <IconCall width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>Ligar</Text>
                </Pressable>
              </View>
              <Preparo c={c} contextoDe={contextoDe} telefone={telefoneDe?.(c.id) ?? c.telefone ?? null} />
            </View>
          )}
        </View>
      );
    }
    const k = l.comp;
    const reuniao = k.tipo === 'reunião';
    const nome = k.nome ?? 'cliente não identificado';
    return (
      <View key={l.k} style={[s.linha, open && s.linhaAberta]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} style={s.linhaTopo} onPress={() => setAberto(open ? null : l.k)}>
          <Text style={s.hora}>{k.hora ?? '—'}</Text>
          <View style={[s.disco, { backgroundColor: 'var(--surface-3)' }]}>
            {reuniao ? <IconCalendar width={14} height={14} fill={cores.onSurface} /> : <IconCall width={14} height={14} fill={cores.onSurface} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nomeLinha} numberOfLines={1}>{nome}</Text>
            <Text style={s.subLinha} numberOfLines={1}>{[acaoPorId(k.acao)?.rotulo ?? (reuniao ? 'Reunião' : k.tipo === 'retorno' ? 'Retorno' : 'Visita'), k.titulo, k.fonte === 'hubspot' ? 'HubSpot' : 'Agenda do app'].filter(Boolean).join(' · ')}</Text>
          </View>
          {reuniao ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Confirmar no WhatsApp: ${nome}`} style={[s.botaoLinha, s.botaoWhats]} onPress={() => confirmarNoWhatsApp(k)}>
              <IconWhatsapp width={16} height={16} fill="#FFFFFF" /><Text style={[s.botaoLinhaTexto, { color: '#FFFFFF' }]}>Confirmar</Text>
            </Pressable>
          ) : dia <= hoje && podeLigar(k) ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Ligar: ${nome}`} style={s.botaoLinha} onPress={() => ligar(k.clientId, k)}>
              <IconCall width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoLinhaTexto}>Ligar</Text>
            </Pressable>
          ) : k.clientId ? <IconChevronRight width={20} height={20} fill={cores.muted} /> : null}
        </Pressable>
        {open && (() => {
          const c = k.clientId ? paradas.find((p) => p.client_id === k.clientId)?.client ?? null : null;
          return (
            <View style={s.linhaPreparo}>
              {c ? <Preparo c={c} contextoDe={contextoDe} telefone={telefoneDe?.(c.id) ?? c.telefone ?? null} /> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {k.clientId && (
                  <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => aoAbrirLead(k.clientId!)}>
                    <IconLocation width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>Abrir o cartão</Text>
                  </Pressable>
                )}
                {dia <= hoje && podeLigar(k) && (
                  <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => registrar(k)}>
                    <IconCheck width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>Registrar</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })()}
      </View>
    );
  };

  /* LIGAÇÕES DO DIA e FORA DO PLANO (§4.3). Ligar não é parada de rua: fica sem número. O que
     não casou com nenhuma parada fica à parte, tracejado, com o caminho para pôr no plano
     (abre o pino, onde o "Pôr no plano" é a ação principal). */
  const casadosTotal = [...sep.casados.values()].reduce((n, l) => n + l.length, 0);
  const blocosSoltos = (
    <>
      {casadosTotal > 0 && <Text style={s.casadosAviso}>{`${casadosTotal} ${casadosTotal === 1 ? 'compromisso do HubSpot e do app já está' : 'compromissos do HubSpot e do app já estão'} nas paradas, sem repetir`}</Text>}
      {sep.ligacoes.length > 0 && <Text style={s.secao}>LIGAÇÕES DO DIA · NÃO É PARADA DE RUA</Text>}
      {sep.ligacoes.map((k) => linhaDepois({ k: `c-${k.id}`, tipo: 'compromisso', ordem: 0, hora: k.hora, comp: k }))}
      {sep.fora.length > 0 && <Text style={s.secao}>FORA DO PLANO</Text>}
      {sep.fora.length > 0 && (
        <View style={s.fora}>
          {sep.fora.map((k) => (
            <View key={k.id} style={{ gap: 6 }}>
              {linhaDepois({ k: `c-${k.id}`, tipo: 'compromisso', ordem: 0, hora: k.hora, comp: k })}
              {k.clientId && (
                <Pressable accessibilityRole="button" accessibilityLabel={`Marcar o próximo passo: ${k.nome ?? 'lead'}`} style={s.botaoSec} onPress={() => aoAbrirLead(k.clientId!)}>
                  <IconLocation width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>Marcar o próximo passo</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </>
  );

  const portaUnica = (
    <Pressable accessibilityRole="button" disabled={montandoDia || roteirizando || roteirizandoDia}
      style={semRota ? [s.botao56, (montandoDia) && { opacity: 0.6 }] : s.refazer} onPress={() => setPorta(true)}>
      <IconRefresh width={18} height={18} fill={semRota ? '#FFFFFF' : cores.muted} />
      <Text style={semRota ? s.botao56Texto : s.refazerTexto}>
        {montandoDia ? 'Montando o dia…' : roteirizando || roteirizandoDia ? 'Calculando…' : semRota ? 'Montar meu dia' : 'Refazer meu dia'}
      </Text>
    </Pressable>
  );

  const noite = momento === 'noite' && dia === hoje && !semRota ? (
    <View style={s.noite}>
      <Text style={s.heroiOlho}>DIA FECHADO</Text>
      <Text style={s.noiteTitulo}>
        {`${provadas} ${provadas === 1 ? 'visita provada' : 'visitas provadas'}${demosHoje.data ? ` e ${demosHoje.data} ${demosHoje.data === 1 ? 'demo realizada' : 'demos realizadas'}` : ''}`}
      </Text>
      <Text style={s.subLinha}>Os mesmos números do placar da semana no Cockpit.</Text>
      {ficaram.map((p) => (
        <View key={p.id} style={s.ficou}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nomeLinha} numberOfLines={2}>{`${p.client ? nomeDoLead(p.client) : 'Parada'} ficou para trás`}</Text>
            <Text style={s.subLinha} numberOfLines={1}>{`parada ${estado.indexOf(p) + 1} do plano · sem visita hoje`}</Text>
          </View>
          <Pressable accessibilityRole="button" style={s.botaoLinha} onPress={() => porAmanha(p)}>
            <Text style={s.botaoLinhaTexto}>Pôr amanhã</Text>
          </Pressable>
        </View>
      ))}
      <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => setDia(amanha)}>
        <Text style={s.botaoSecTexto}>{`Ver ${SEMANA_LONGA[dowDe(amanha)]}`}</Text>
      </Pressable>
    </View>
  ) : null;

  const outroDia = dia !== hoje ? (() => {
    const lista = paradasDoDia(dia);
    const pl = semana.data?.get(dia);
    return (
      <View style={{ gap: 10 }}>
        <View>
          <Text style={s.outroTitulo}>{`${SEMANA_LONGA[dowDe(dia)][0].toUpperCase()}${SEMANA_LONGA[dowDe(dia)].slice(1)}, ${ddmm(dia)}`}</Text>
          <Text style={s.subLinha}>
            {[pl?.proposito ? PROPOSITOS[pl.proposito] ?? pl.proposito : null, lista.length ? `${lista.length} ${lista.length === 1 ? 'conta do plano' : 'contas do plano'}` : null].filter(Boolean).join(' · ') || 'Nada no plano deste dia'}
          </Text>
        </View>
        {lista.map((p, i) => {
          const c = p.client;
          const nome = c ? nomeDoLead(c) : 'Parada';
          const casados = sep.casados.get(p.client_id) ?? [];
          const reuniao = casados.find((k) => k.hora && k.hora !== '09:00');
          const hora = p.planned_at && dia === diaBRT(new Date(p.planned_at)) ? horaBRT(p.planned_at) : (reuniao?.hora ?? null);
          return (
            <Pressable key={p.id} accessibilityRole="button" style={s.bloco} onPress={() => aoAbrirLead(p.client_id)}>
              <Text style={s.hora}>{hora ?? String(i + 1)}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.nomeLinha} numberOfLines={1}>{nome}</Text>
                <Text style={s.subLinha} numberOfLines={1}>{[chipDaParada(p) ?? 'Visita do plano', ruaDo(c), distanciaAte(p.client_id)].filter(Boolean).join(' · ')}</Text>
                {casados.map((k) => <Text key={k.id} style={s.selo} numberOfLines={1}>{seloDoCompromisso(k, p.client_id)}</Text>)}
              </View>
              <IconChevronRight width={20} height={20} fill={cores.muted} />
            </Pressable>
          );
        })}
        {lista.length >= 2 && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" style={s.botaoSec} disabled={roteirizandoDia} onPress={() => { void roteirizarDia(lista); }}>
              <IconRefresh width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>{roteirizandoDia ? 'Calculando…' : 'Reordenar'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => abrirPercursoDe(lista)}>
              <IconCar width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>{`Percurso · ${lista.length}`}</Text>
            </Pressable>
          </View>
        )}
        {blocosSoltos}
        {feitas}
        {lista.length === 0 && soltos.length === 0 && (
          <Text style={s.vazio}>Nada no plano deste dia. O plano se monta no mapa: toque no pino e "Marcar o próximo passo". O Planejamento do Cockpit também cai aqui.</Text>
        )}
        <Text style={s.nota}>Este é o plano que você e o gestor fecharam no Planejamento.</Text>
      </View>
    );
  })() : null;

  const carregando = planoDaFaixa.isLoading && paradas.length === 0 && dia === hoje;
  // ESTADOS (docs/12 §8): sem sinal = faixa âmbar e o salvo continua na tela; erro de leitura =
  // faixa vermelha com "Tentar de novo". As escritas sem sinal já vão para a fila do app.
  const falhouLeitura = planoDaFaixa.isError || semana.isError || meuDia.isError;
  const faixaEstado = !online ? (
    <View style={[s.estado, s.estadoAviso]} accessibilityRole="alert">
      <Text style={[s.estadoTexto, { color: 'var(--tint-amber-text)' }]}>Sem sinal. Mostrando o que já estava salvo · o que você registrar sobe sozinho quando o sinal voltar.</Text>
    </View>
  ) : falhouLeitura ? (
    <View style={[s.estado, s.estadoErro]} accessibilityRole="alert">
      <Text style={[s.estadoTexto, { color: 'var(--tint-red-text)', flex: 1 }]}>Não carreguei tudo agora. Mostrando o que foi salvo.</Text>
      <Pressable accessibilityRole="button" style={s.estadoBotao} onPress={() => { void planoDaFaixa.refetch(); void semana.refetch(); void meuDia.refetch(); }}>
        <Text style={[s.estadoTexto, { fontWeight: '800', color: 'var(--tint-red-text)' }]}>Tentar de novo</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <ScrollView style={s.tela} contentContainerStyle={[s.conteudo, largo && { paddingHorizontal: 0 }]}>
      <RegistrarTarefa
        tarefa={registrando}
        aoFechar={() => setRegistrando(null)}
        aoSumir={(id) => setConcluidas((st) => new Set(st).add(`hs-${id}`))}
        aoVoltar={(id) => setConcluidas((st) => { const n = new Set(st); n.delete(`hs-${id}`); return n; })}
      />
      {faixaEstado}
      {seletorSemana}
      {faixa}
      {dia === hoje ? (
        <>
          {seletor}
          {ritmo}
          {carregando ? (
            <View style={{ gap: 10 }}>
              <Text style={s.subLinha}>Montando o dia pelo plano e pela hora…</Text>
              {[96, 120, 96].map((h, i) => <View key={i} style={[s.esqueleto, { height: h }]} />)}
            </View>
          ) : (
            <>
              {noite}
              {heroi}
              {semRota && (
                <View style={s.vazioCaixa}>
                  <Text style={s.vazioTitulo}>{soltos.length ? 'Sem rota hoje' : 'Nada marcado hoje'}</Text>
                  <Text style={s.vazio}>O plano se monta no mapa: toque no pino e "Marcar o próximo passo". Sem plano para hoje: monte a microrrota a partir de onde você está.</Text>
                </View>
              )}
              {linhasDepois.length > 0 && momento !== 'noite' && <Text style={s.secao}>DEPOIS</Text>}
              {momento !== 'noite' && linhasDepois.map(linhaDepois)}
              {momento !== 'noite' && blocosSoltos}
              {feitas}
              {/* dia sem rota: "Montar meu dia" é a ação principal em qualquer hora (docs/12 §8) */}
              {(momento !== 'noite' || semRota) && portaUnica}
            </>
          )}
        </>
      ) : outroDia}

      <Painel visivel={porta} aoFechar={() => setPorta(false)} rotulo={semRota ? 'Montar meu dia' : 'Refazer meu dia'}>
        <View style={{ gap: 10, paddingBottom: 8 }}>
          {[
            aoMontarDia ? { t: 'Microrrota a pé a partir daqui', s2: 'portas boas perto de onde você está · o plano do Cockpit continua', Ic: IconLocation, fn: aoMontarDia } : null,
            !semRota ? { t: `Seguir o plano de ${SEMANA_LONGA[dowDe(hoje)]}`, s2: 'na ordem da hora marcada no Planejamento', Ic: IconCalendar, fn: () => pelaHoraDoPlano(paradas, hoje) } : null,
            !semRota ? { t: 'Reordenar o que falta', s2: 'pela distância a partir de onde você está', Ic: IconRefresh, fn: () => (aoRoteirizar ? aoRoteirizar() : void roteirizarDia(paradas)) } : null,
            abertasComPonto.length ? { t: `Abrir o percurso no Maps · ${abertasComPonto.length}`, s2: 'a pé ou de carro, na ordem do plano', Ic: IconCar, fn: () => abrirPercursoDe(abertasComPonto) } : null,
          ].filter((o): o is { t: string; s2: string; Ic: typeof IconLocation; fn: () => void } => !!o).map((o) => (
            <Pressable key={o.t} accessibilityRole="button" style={s.opcao} onPress={() => { setPorta(false); setTimeout(o.fn, 350); }}>
              <o.Ic width={20} height={20} fill={cores.onSurface} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.nomeLinha}>{o.t}</Text>
                <Text style={s.subLinha}>{o.s2}</Text>
              </View>
              <IconChevronRight width={20} height={20} fill={cores.muted} />
            </Pressable>
          ))}
          <Text style={s.nota}>Uma porta só para o dia. O que você montar grava a rota de hoje, e o Planejamento do gestor mostra igual.</Text>
        </View>
      </Painel>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  // a barra de baixo (Mapa · Agenda · Tarefas) cobria o fim da lista: folga da barra + área segura
  conteudo: { padding: 16, paddingBottom: 'calc(120px + env(safe-area-inset-bottom))' as unknown as number, gap: 12 },
  faixa: { flexDirection: 'row', gap: 6 },
  dia: { flex: 1, minWidth: 0, minHeight: 72, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 2, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  diaAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)', borderWidth: 1.5 },
  diaSemana: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: 'var(--text-muted)' },
  diaNumero: { fontSize: 18, fontWeight: '800', color: 'var(--text)' },
  diaProposito: { fontSize: 11, color: 'var(--text-muted)', maxWidth: '100%' },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: 'var(--surface-2)' },
  segItem: { flex: 1, minHeight: 44, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: 'transparent' },
  segItemAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)' },
  segTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  ritmo: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  ritmoLinha: { color: 'var(--text)' },
  ritmoNumero: { fontSize: 22, fontWeight: '800', color: 'var(--text)' },
  ritmoRotulo: { fontSize: 14, fontWeight: '500', color: 'var(--text-muted)' },
  ritmoPromessa: { fontSize: 13, color: 'var(--text-muted)', textAlign: 'right', maxWidth: 150 },
  tracos: { flexDirection: 'row', gap: 4 },
  traco: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'var(--border)' },
  promessa: { padding: 14, gap: 10, borderRadius: 16, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  promessaTitulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  promessaChip: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', alignItems: 'center', justifyContent: 'center' },
  promessaChipTexto: { fontSize: 17, fontWeight: '800', color: 'var(--text)' },
  promessaNota: { fontSize: 12, color: 'var(--text-faint)' },
  feitasLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  feitasIcone: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'var(--tint-green)', alignItems: 'center', justifyContent: 'center' },
  feitasTexto: { flex: 1, fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  feitasAcao: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  feitoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 56, padding: 12, borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)' },
  feitoFalta: { borderColor: 'var(--tint-amber-text)', borderStyle: 'dashed' },
  feitoResumo: { fontSize: 13, color: 'var(--text)' },
  feitoProximo: { fontSize: 13, fontWeight: '700', color: 'var(--tint-blue-text)' },
  feitoFaltaTexto: { fontSize: 13, fontWeight: '700', color: 'var(--tint-amber-text)' },
  feitaItem: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingLeft: 36 },
  heroi: { padding: 14, gap: 10, borderRadius: 16, backgroundColor: 'var(--surface)', borderWidth: 1.5, borderColor: 'var(--vermelho-acao)' },
  heroiOlho: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--vermelho-texto)' },
  heroiNome: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: 'var(--text)' },
  heroiSub: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)' },
  tempChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 30, borderRadius: 15, backgroundColor: 'var(--surface-2)' },
  tempTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  segs8: { flexDirection: 'row', gap: 4 },
  seg8: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'var(--border)' },
  etapaTexto: { fontSize: 13, fontWeight: '700' },
  caixa: { padding: 12, gap: 4, borderRadius: 12, backgroundColor: 'var(--surface-2)' },
  caixaAmbar: { backgroundColor: 'var(--tint-amber)' },
  caixaRotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: 'var(--text-faint)' },
  caixaValor: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: 'var(--text)' },
  botao56: { minHeight: 56, borderRadius: 16, backgroundColor: 'var(--vermelho-acao)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  botao56Texto: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  botaoSec: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  botaoSecTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  selo: { fontSize: 12, fontWeight: '700', color: 'var(--tint-blue-text)', marginTop: 2 },
  casadosAviso: { fontSize: 12.5, fontWeight: '600', color: 'var(--tint-green-text)' },
  fora: { gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border)' },
  secao: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--text-faint)', marginTop: 4 },
  linha: { borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)' },
  linhaAberta: { borderColor: 'var(--border)' },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 12, paddingVertical: 8 },
  linhaPreparo: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  hora: { width: 44, fontSize: 14, fontWeight: '800', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  disco: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  discoTexto: { fontSize: 13, fontWeight: '800', color: '#111418' },
  nomeLinha: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: 'var(--text)' },
  subLinha: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  botaoLinha: { minHeight: 44, minWidth: 56, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  botaoWhats: { backgroundColor: '#128C4A', borderColor: '#128C4A' },
  botaoLinhaTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  refazer: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  refazerTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  noite: { padding: 14, gap: 10, borderRadius: 16, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  noiteTitulo: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: 'var(--text)' },
  ficou: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: 'var(--surface-2)' },
  outroTitulo: { fontSize: 18, fontWeight: '800', color: 'var(--text)' },
  bloco: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)' },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)' },
  vazioCaixa: { padding: 16, gap: 6, borderRadius: 16, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  vazioTitulo: { fontSize: 17, fontWeight: '700', color: 'var(--text)' },
  nota: { fontSize: 12, lineHeight: 17, color: 'var(--text-faint)' },
  esqueleto: { borderRadius: 16, backgroundColor: 'var(--surface-2)' },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  estadoAviso: { backgroundColor: 'var(--tint-amber)', borderColor: 'var(--tint-amber-border)' },
  estadoErro: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  estadoTexto: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  estadoBotao: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 12, borderRadius: 14, backgroundColor: 'var(--surface-2)' },
});
