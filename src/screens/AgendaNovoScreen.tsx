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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/Alert';
import { Painel } from '../components/Painel';
import { supabase } from '../integrations/supabase/client';
import RegistrarTarefa, { type TarefaParaRegistrar } from './RegistrarTarefa';
import { JANELAS_LIGACAO, MINUTOS_DA_JANELA } from '../utils/horaDasLigacoes';
import { useParaFechar } from './SemDesfecho';
import { Aviso, LinhaFeito, LinhaParada, LinhaTarefa, MarcoDaJanela, PlacarDoDia, ProximaParada, TituloDeLista, type DadosDaLinha, type DadosDaProxima, type DadosDaTarefa, type ItemDoAviso } from './agenda/PecasDaAgenda';
import { opcoesDaFila } from './FilaTarefasScreen';
import { lerFeitas } from '../utils/filaFeitas';
import { oQueFazer } from '../utils/textoDaTarefa';
import * as Location from 'expo-location';
import SemLugarNoMapa from './SemLugarNoMapa';
import { fetchOptimizedTrip } from '../utils/routing';
import { Toast } from '../components/Toast';

import { useTarefasDoCrm } from '../hooks/useTarefasDoCrm';
import { useMinhaDaily } from '../hooks/useMinhaDaily';
import { useMeuDia } from '../hooks/useMeuDia';
import { ir } from './CardLeadNovo';
import {
  IconChevronRight, IconRefresh, useIconColors,
} from '../components/icons';
import { acaoRapida, diaBRT } from '../utils/abaTarefas';
import { compromissosDoDia, estadoDasParadas, paradaParaCasar, separarCompromissos } from '../utils/agendaNovo';
import { acaoPorId } from '../utils/acoesDoPlano';
import { montarFeitoNoDia, type FichaDoDia, type RegistroDoDia, type VisitaDoDia } from '../utils/feitoNoDia';
import { proximoDiaUtil } from '../../supabase/functions/_compartilhado/filaDoDinheiro';
import { porNoDia, tirarDoDia } from '../utils/paradaDoDia';
import { avisarQueOPlanoMudou } from '../utils/planoDoPino';
import { ROTULO_ETAPA } from '../utils/fichaDeRua';
import { lerSemanaDoPlano, PROPOSITOS, type DiaDoPlano } from '../utils/semanaDoPlano';
import { montarPreparo, usePreparo } from '../utils/preparo';
import { STAGES } from '../constants/stages';
import type { Client, ClientMeeting, FieldRouteStopWithClient } from '../types/client';

type Props = {
  /** Dia que abre selecionado (o "Ver na Agenda" da ficha de rua). */
  diaInicial?: string | null;
  paradas: FieldRouteStopWithClient[];
  /** A leitura das paradas de hoje falhou (não é "sem rota"). */
  paradasErro?: boolean;
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
  /** P4 (handoff Tarefas do App): ligação e WhatsApp do HubSpot se registram na fila, no cartão do negócio. */
  aoAbrirNaFila?: (dealId: string, rotulo: string, discou?: { em: number; canal: 'ligacao' | 'whatsapp' }) => void;
  /** A folha "Marcar o próximo passo" (a mesma do pino e da aba Tarefas). */
  aoMarcarProximoPasso?: (clientId: string) => void;
};

const ruaDo = (c: Client | null) => {
  if (!c) return null;
  const rua = [c.endereco, c.numero].filter(Boolean).join(', ');
  return rua || c.bairro || null;
};
const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
/* QUENTE NA AGENDA (19/10/26, Julyan aprovou): Conversa com decisor, Demo/Proposta, Negociação e Ag.
   Pagamento — só no selo e na ordem; a cobrança do Ag. Pagamento não muda. */
const ETAPAS_QUENTES_AGENDA = new Set(['1395880470', '1395880471', '1395880472', '1395880473']);
/** O que a visita tem de conseguir para o negócio subir de etapa ("Consiga: …"). */
const CONSEGUIR: Record<string, string> = {
  '1395880469': 'o nome de quem decide', '1396005401': 'conversa com quem decide', '1395880470': 'a data da demo',
  '1395880471': 'o sim da proposta', '1395880472': 'a data do pagamento', '1395880473': 'o pagamento confirmado',
};
const distanciaM = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const dowDe = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const horaBRT = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const soDigitos = (t: string) => t.replace(/\D+/g, '');
const com55 = (t: string) => { const d = soDigitos(t); return d.length <= 11 ? `55${d}` : d; };

/* A VOLTA PARA O MESMO PONTO (Tarefas por dia, 2.6): a Agenda desmonta ao trocar de aba; a rolagem
   fica guardada aqui e volta quando a pessoa sai para a Tarefas e retorna pela barra (até 10 min). */
const rolagem = { dia: '', y: 0, voltarAte: 0 };

type Linha =
  | { k: string; tipo: 'parada'; ordem: number; hora: string | null; numero: number; p: FieldRouteStopWithClient }
  | { k: string; tipo: 'compromisso'; ordem: number; hora: string | null; comp: ReturnType<typeof compromissosDoDia>[number] };

export default function AgendaNovoScreen({
  diaInicial, paradas, paradasErro, reunioes, metaVisitasDia, nomeDoLead, nomePorId, distanciaAte, visitadoHoje, aoCheguei, aoAbrirLead,
  aoRoteirizar, roteirizando, aoMontarDia, montandoDia, telefoneDe, base, ownerHubspot, contextoDe, aoMapaDoDia, aoPlaybook, largo, aoMudarDia, diaControlado, aoAbrirNaFila, aoMarcarProximoPasso,
}: Props) {
  const [roteirizandoDia, setRoteirizandoDia] = useState(false);
  const [registrando, setRegistrando] = useState<TarefaParaRegistrar | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  // "Fazer esta agora" (§2.3), as tiradas do plano na janela do Desfazer e a folha do motivo (§2.2)
  const [focoId, setFocoId] = useState<string | null>(null);
  const [tiradas, setTiradas] = useState<Set<string>>(new Set());
  const [tirando, setTirando] = useState<FieldRouteStopWithClient | null>(null);
  /* ONDE A PESSOA ESTÁ (§2.2: o Cheguei acende a menos de 150 m). O app só lia a posição ao abrir; aqui
     lê ao abrir a Agenda e a cada 60 s com ela na tela, em precisão média (pouca bateria). */
  const [posicao, setPosicao] = useState<{ latitude: number; longitude: number } | null>(base ?? null);
  useEffect(() => {
    let vivo = true;
    const ler = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((l) => { if (vivo) setPosicao({ latitude: l.coords.latitude, longitude: l.coords.longitude }); })
        .catch(() => undefined);
    };
    ler();
    const t = setInterval(ler, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const queryClient = useQueryClient();
  const rolador = useRef<ScrollView>(null);
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
  // voltando da Tarefas pela barra: o mesmo dia que estava aberto
  const diaDaVolta = !diaInicial && rolagem.voltarAte > Date.now() && rolagem.dia >= hoje ? rolagem.dia : null;
  const [semanaVista, setSemanaVista] = useState(diaInicial ? semanaDoDia(diaInicial) : diaDaVolta ? semanaDoDia(diaDaVolta) : 0);
  const dias = useMemo(() => { const seg = segundaDe(hoje, semanaVista); return [0, 1, 2, 3, 4].map((i) => somaDias(seg, i)); }, [hoje, semanaVista]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dia, setDia] = useState(diaInicial && dias.includes(diaInicial) ? diaInicial : diaDaVolta && dias.includes(diaDaVolta) ? diaDaVolta : hoje);
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
  // a mesma fila e o mesmo Feito hoje da aba Tarefas (o mesmo cache): uma conta só nas duas telas
  const filaQ = useQuery(opcoesDaFila());
  const feitasFilaQ = useQuery({ queryKey: ['fila_feitas', hoje], queryFn: () => lerFeitas(hoje), staleTime: 30_000 });
  const { user } = useAuth();
  const { prometer } = useMinhaDaily(true);
  const meuDia = useMeuDia(true, user?.id ?? null);
  const paraFechar = useParaFechar(user?.id ?? null);

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
        supabase.from('fila_feitas').select('id, deal_id, negocio, hora, resultado, volta, perdido, criada_em, origem, concluiu_tarefa')
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
      const { count, error } = await supabase.from('pontos_eventos').select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerHubspot!).eq('tipo', 'demo_realizada').gte('ref_em', `${hoje}T03:00:00.000Z`);
      if (error) throw error; // erro não vira "0 demos" (auditoria 16/10/26)
      return count ?? 0;
    },
  });

  const horaDe = (p: FieldRouteStopWithClient, d: string) => (p.planned_at && diaBRT(new Date(p.planned_at)) === d ? Date.parse(p.planned_at) : null);
  const paradasDoDia = (d: string) => {
    if (d === hoje) return paradas;
    return [...(planoDaFaixa.data?.get(d) ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  };

  const estado = estadoDasParadas(paradas.filter((p) => !tiradas.has(p.id)).map((p) => ({ ...p, visitadoHoje: !!p.client && visitadoHoje(p.client) })));
  const proxima = estado.find((p) => p.estado === 'proxima') ?? null;
  // UM PLANO SÓ (06/10/26): o compromisso que casa com uma parada (negócio, nome no bairro,
  // cadastro) vira selo nela; Ligar vai às Ligações do dia; o resto fica em "Fora do plano".
  const doDia = (d: string) => compromissosDoDia(d, tarefas, reunioes, nomePorId, paradasDoDia(d).map(paradaParaCasar));
  const compromissos = doDia(dia).filter((k) => !concluidas.has(k.id)
    && !(k.fonte === 'app' && reunioes.some((r) => `app-${r.id}` === k.id && (r.status === 'realizada' || r.status === 'nao_aconteceu'))));
  const sep = separarCompromissos(compromissos);
  const soltos = [...sep.ligacoes, ...sep.fora];
  /** o chip da parada (0175) e os selos dos compromissos casados com ela */
  const chipDaParada = (p: FieldRouteStopWithClient) => acaoPorId(p.acao)?.rotulo ?? null;

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
  /* UMA PORTA SÓ (P4, 17/10/26): a tarefa de ligação ou WhatsApp do HubSpot com negócio abre o
     cartão dele na fila; o "Registrar a tarefa" daqui saiu. Sem negócio ela não está na fila e
     segue com o registro antigo. */
  const naFilaDe = (k: (typeof compromissos)[number]): { dealId: string; rotulo: string } | null => {
    if (!aoAbrirNaFila || k.fonte !== 'hubspot') return null;
    const t = tarefas.find((x) => `hs-${x.id}` === k.id);
    if (!t?.dealId) return null;
    // o negócio está na fila (hoje ou num dos próximos dias): o cartão dele existe na aba Tarefas
    if (!podeLigar(k) && !daFila(String(t.dealId))) return null;
    const verbo = /whats/i.test(`${t.assunto ?? ''} ${k.titulo ?? ''}`) ? 'WhatsApp' : 'Ligar';
    return { dealId: String(t.dealId), rotulo: `${k.hora && !['00:00', '09:00', '12:00'].includes(k.hora) ? `${k.hora} · ` : ''}${verbo} · ${k.nome ?? t.nomeDoCliente ?? 'negócio'}` };
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
    // O Ligar marca o retorno como feito sozinho, 600 ms depois de abrir o discador, sem
    // pergunta: a ligação pode nem ter acontecido. O toast diz o que gravou e o Desfazer
    // (10 s) devolve o status que ele tinha.
    const statusAntes = reunioes.find((r) => r.id === idReuniao)?.status ?? 'agendada';
    void (async () => {
      const { error } = await supabase.from('client_meetings').update({ status: 'realizada' }).eq('id', idReuniao);
      if (error) { voltar(); Alert.alert('Não consegui confirmar', error.message); return; }
      void queryClient.invalidateQueries({ queryKey: ['client_meetings'] });
      Toast.mostrar(`${k.nome ?? 'Retorno'} marcado como feito`, 'ok', {
        rotulo: 'Desfazer',
        onPress: () => {
          void (async () => {
            const { error: e2 } = await supabase.from('client_meetings').update({ status: statusAntes }).eq('id', idReuniao);
            if (e2) { Toast.mostrar(`Não consegui desfazer: ${e2.message}`, 'erro'); return; }
            voltar();
            void queryClient.invalidateQueries({ queryKey: ['client_meetings'] });
            Toast.mostrar('Desfeito.', 'ok');
          })();
        },
      }, 10000);
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

  // ---- o ritmo (docs/12 §1.3): o único lugar do app que pede a promessa ----
  const md = meuDia.data;
  const prometido = md?.prometido?.visitas ?? null;
  const alvo = prometido ?? (metaVisitasDia > 0 ? metaVisitasDia : 6);
  // SÓ PROVADAS (auditoria 16/10/26): o rótulo é "visitas provadas"; antes, sem a prova lida, caía no
  // total de check-ins ou na lista local e mostrava visita sem prova como provada. Sem a medição: "—".
  const provadasMedidas = md?.provadasHoje ?? null;
  const provadas = provadasMedidas ?? 0;
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
    // à noite o card da próxima parada some: ela entra na lista junto com as outras
    if (p.estado !== 'pendente' && !(momento === 'noite' && p.estado === 'proxima')) return;
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
  // SEM LEITURA NÃO É SEM ROTA (auditoria 16/10/26): a falha virava "Sem rota hoje" e convidava a
  // "Montar meu dia" por cima do plano que existe
  const leituraFalhou = semRota && (dia === hoje ? !!paradasErro : planoDaFaixa.isError);

  // Dia fechado (noite): o que ficou para trás, com "Pôr amanhã".
  const amanha = proximoDiaUtil(hoje, 1);
  const porAmanha = (p: FieldRouteStopWithClient) => {
    if (!user?.id) return;
    void porNoDia(user.id, amanha, p.client_id)
      .then((r) => {
        void queryClient.invalidateQueries({ queryKey: ['field_route_stops'] });
        Toast.mostrar(r === 'ja' ? `Já estava no plano de ${SEMANA_LONGA[dowDe(amanha)]} ${ddmm(amanha)}` : `No plano de ${SEMANA_LONGA[dowDe(amanha)]} ${ddmm(amanha)} · aparece no Planejamento do Cockpit`, 'ok');
      })
      .catch((e) => Alert.alert('Não consegui pôr amanhã', String((e as Error)?.message ?? e)));
  };

  const falhouLeitura = planoDaFaixa.isError || semana.isError || meuDia.isError;

  // ---- o desenho do handoff "Agenda do App" (19/10/26) ----
  const CLIENTE_ST = new Set(['cliente', 'ganho_fs']);
  const ehCliente = (c: Client | null | undefined) => !!c && CLIENTE_ST.has(String(c.status ?? ''));
  const codigoDe = (c: Client | null | undefined) => (c ? contextoDe?.(c)?.codigo ?? null : null);
  const corDaEtapa = (codigo: string | null) => (codigo ? STAGES.find((x) => x.id === codigo)?.color ?? null : null);
  const rotuloDaEtapa = (codigo: string | null) => (codigo ? ROTULO_ETAPA[codigo] ?? null : null);
  const quenteDe = (c: Client | null | undefined) => !ehCliente(c) && ETAPAS_QUENTES_AGENDA.has(codigoDe(c) ?? '');

  // a próxima parada: a da ordem do plano, ou a que a pessoa escolheu em "Fazer esta agora"
  const heroiP = (focoId ? estado.find((p) => p.id === focoId && p.estado !== 'feito') : null) ?? proxima;
  const abertasDoDia = estado.filter((p) => p.estado !== 'feito');
  const metros = heroiP?.client && posicao && heroiP.client.latitude != null && heroiP.client.longitude != null
    ? distanciaM(posicao, { latitude: Number(heroiP.client.latitude), longitude: Number(heroiP.client.longitude) }) : null;

  const dadosDaLinha = (p: FieldRouteStopWithClient, numero: number, hora: string | null): DadosDaLinha => {
    const c = p.client;
    const cli = ehCliente(c);
    const ctx = c ? contextoDe?.(c) : null;
    const codigo = ctx?.codigo ?? null;
    const oQue = chipDaParada(p) ?? (cli ? 'Relacionamento' : 'Visita');
    const passou = !cli && ctx?.diasNaEtapa != null && !!ctx.regua && ctx.diasNaEtapa > ctx.regua;
    const marcada = !!hora && !hora.startsWith('~');
    return {
      chave: p.id, numero, nome: c ? nomeDoLead(c) : 'Parada', hora: hora ? hora.replace(/^~/, '') : null, marcada,
      cliente: cli, corEtapa: corDaEtapa(codigo), quente: quenteDe(c), doHubspot: (sep.casados.get(p.client_id) ?? []).some((k) => k.fonte === 'hubspot'),
      linha2: [oQue, cli ? null : rotuloDaEtapa(codigo), distanciaAte(p.client_id)].filter(Boolean).join(' · '),
      cadencia: cli ? 'cliente · sem régua de venda'
        : ctx?.diasNaEtapa != null ? `${ctx.diasNaEtapa} ${ctx.diasNaEtapa === 1 ? 'dia' : 'dias'} na etapa${ctx.regua ? (passou ? ` · passou da régua de ${ctx.regua} dias` : ` · régua de ${ctx.regua} dias`) : ''}` : null,
      cadenciaVermelha: passou,
      objetivo: cli ? 'Hoje: pedir indicação de 2 vizinhos' : `Consiga: ${CONSEGUIR[codigo ?? ''] ?? 'o próximo passo datado'}`,
      naEtapa: !cli && ctx?.diasNaEtapa != null ? `${ctx.diasNaEtapa} de ${ctx.regua ?? '—'} dias · ${rotuloDaEtapa(codigo) ?? ''}` : null,
      decide: null,
    };
  };
  // as linhas da lista "Depois": as estimadas pela rota, e a próxima do plano quando outra virou a da vez
  const linhasParadas = [
    ...(heroiP && proxima && heroiP.id !== proxima.id ? [{ p: proxima, hora: null as string | null, numero: estado.indexOf(proxima) + 1 }] : []),
    ...linhasDepois.filter((l): l is Extract<Linha, { tipo: 'parada' }> => l.tipo === 'parada' && l.p.id !== heroiP?.id).map((l) => ({ p: l.p, hora: l.hora, numero: l.numero })),
  ];

  /* ORGANIZAR O DIA (§2.6): um botão só. Vazio, monta; com paradas, reordena pelo caminho com os quentes
     antes, a prospecção depois e o cliente por último — sem tirar nem pôr parada. */
  const grupoDe = (p: FieldRouteStopWithClient) => (ehCliente(p.client) ? 2 : quenteDe(p.client) ? 0 : 1);
  const organizar = async (lista: FieldRouteStopWithClient[], d: string) => {
    if (!lista.length) { if (d === hoje && aoMontarDia) aoMontarDia(); else Toast.mostrar('Este dia não tem paradas. O plano se monta no mapa ou no Planejamento.', 'fila'); return; }
    const abertas = lista.filter((p) => p.status !== 'done' && p.client?.latitude != null && p.client?.longitude != null);
    if (abertas.length < 2 || roteirizandoDia) { Toast.mostrar('Com menos de 2 paradas em aberto não há o que reordenar.', 'fila'); return; }
    const ponto = (p: FieldRouteStopWithClient) => ({ latitude: Number(p.client!.latitude), longitude: Number(p.client!.longitude) });
    setRoteirizandoDia(true);
    try {
      const trip = await fetchOptimizedTrip([base ?? ponto(abertas[0]), ...abertas.map(ponto)]);
      const pelaRota = trip.inputOrderToVisit.slice(1).map((i) => abertas[i - 1]).filter(Boolean);
      // dentro de cada grupo vale a ordem do caminho
      const ordem = [...pelaRota].sort((a, b) => grupoDe(a) - grupoDe(b) || pelaRota.indexOf(a) - pelaRota.indexOf(b));
      const resto = lista.filter((p) => !ordem.includes(p));
      await gravarOrdem([...lista.filter((p) => p.status === 'done'), ...ordem, ...resto.filter((p) => p.status !== 'done')]);
      Toast.mostrar(`Dia organizado · ${ordem.length} paradas, quentes primeiro`, 'ok');
    } catch (e) {
      Alert.alert('Não deu para organizar', 'O cálculo ou a gravação da ordem falhou; confira a lista antes de sair.\n' + String((e as Error)?.message ?? ''));
    } finally { setRoteirizandoDia(false); }
  };
  const botoesDoDia = (lista: FieldRouteStopWithClient[], d: string) => (
    <View style={{ flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'var(--border)' }}>
      <Pressable accessibilityRole="button" disabled={roteirizandoDia || montandoDia} onPress={() => { void organizar(lista, d); }} style={[s.organizar, (roteirizandoDia || montandoDia) && { opacity: 0.6 }]}>
        <IconRefresh width={16} height={16} fill={cores.onSurface} />
        <Text style={s.organizarT}>{roteirizandoDia || montandoDia ? 'Organizando…' : 'Organizar o dia'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => abrirPercursoDe(lista.filter((p) => p.status !== 'done'))} style={s.percurso}>
        <Text style={s.percursoT}>Percurso no Maps</Text>
      </Pressable>
    </View>
  );

  /* TIRAR DO PLANO (§2.2): pede o motivo, espera 5 s de Desfazer e só então grava (o mesmo plano do
     Planejamento do gestor). "Passar para outro dia" abre a folha do próximo passo, que move. */
  const confirmarTirar = (p: FieldRouteStopWithClient, motivo: 'fechado' | 'sem_tempo') => {
    setTirando(null);
    if (!user?.id) return;
    const nome = p.client ? nomeDoLead(p.client) : 'Parada';
    setTiradas((t) => new Set(t).add(p.id));
    if (focoId === p.id) setFocoId(null);
    let desfeito = false;
    const gravar = () => tirarDoDia(user.id, hoje, p.client_id, motivo)
      .then(() => { avisarQueOPlanoMudou(); void queryClient.invalidateQueries({ queryKey: ['field_route_stops'] }); })
      .catch((e) => { setTiradas((t) => { const n = new Set(t); n.delete(p.id); return n; }); Toast.mostrar(`Não tirou do plano: ${String((e as Error)?.message ?? e)}`, 'erro'); });
    const timer = setTimeout(() => { window.removeEventListener('pagehide', aoSair); if (!desfeito) void gravar(); }, 5000);
    const aoSair = () => { clearTimeout(timer); if (!desfeito) void gravar(); };
    window.addEventListener('pagehide', aoSair);
    Toast.mostrar(`Tirou do plano · ${nome}`, 'ok', { rotulo: 'Desfazer', onPress: () => {
      desfeito = true; clearTimeout(timer); window.removeEventListener('pagehide', aoSair);
      setTiradas((t) => { const n = new Set(t); n.delete(p.id); return n; });
    } }, 5000);
  };

  const seletorSemana = (
    <View style={s.segmento}>
      {[{ n: 0, rot: 'Esta semana' }, { n: 1, rot: 'Semana que vem' }].map((o) => (
        <Pressable key={o.n} accessibilityRole="tab" accessibilityState={{ selected: semanaVista === o.n }} onPress={() => irParaSemana(o.n)}
          style={[s.segItem2, semanaVista === o.n && s.segItem2Ativo]}>
          <Text style={[s.segTexto2, semanaVista !== o.n && { fontWeight: '600', color: 'var(--text-muted)' }]}>{o.rot}</Text>
        </Pressable>
      ))}
    </View>
  );
  const rotuloDia = (d: string) => {
    const n = d === hoje ? estado.length : paradasDoDia(d).length;
    return n ? `${n} ${n === 1 ? 'parada' : 'paradas'}` : 'sem plano';
  };
  const faixa = (
    <View style={s.faixa}>
      {dias.map((d) => {
        const ativo = d === dia;
        const passou = d < hoje;
        const rot = d === hoje ? 'HOJE' : SEMANA[dowDe(d)];
        const r = rotuloDia(d);
        return (
          <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: ativo }} accessibilityLabel={`${rot} ${d.slice(8)}: ${r}`}
            style={[s.dia, ativo && s.diaAtivo, passou && !ativo && { opacity: 0.6 }]} onPress={() => { setDia(d); setAberto(null); }}>
            <Text style={[s.diaSemana, ativo && { color: 'var(--bg)' }]}>{rot}</Text>
            <Text style={[s.diaNumero, ativo && { color: 'var(--bg)' }]}>{String(Number(d.slice(8)))}</Text>
            <Text style={[s.diaProposito, r === 'sem plano' && { color: 'var(--tint-amber-text)' }, ativo && { color: 'var(--bg)' }]} numberOfLines={1}>{r}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const seletor = !largo && aoMapaDoDia && dia === hoje && !semRota ? (
    <View style={s.segmento}>
      <View style={[s.segItem2, s.segItem2Ativo]} accessibilityRole="tab" accessibilityState={{ selected: true }}><Text style={s.segTexto2}>Lista</Text></View>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: false }} style={s.segItem2} onPress={aoMapaDoDia}>
        <Text style={[s.segTexto2, { fontWeight: '600', color: 'var(--text-muted)' }]}>Mapa do dia</Text>
      </Pressable>
    </View>
  ) : null;

  const avisoDoAparelho = !online ? (
    <Aviso nivel="atencao" titulo="Sem sinal" texto="Pode seguir. O Cheguei e o Como foi ficam guardados no aparelho e sobem sozinhos quando o sinal voltar." />
  ) : falhouLeitura ? (
    <Aviso nivel="agir" titulo="Não carreguei tudo agora" texto="Mostrando o que já estava salvo."
      acoes={[{ rotulo: 'Tentar de novo', principal: true, onPress: () => { void planoDaFaixa.refetch(); void semana.refetch(); void meuDia.refetch(); } }]} />
  ) : null;

  const heroi = heroiP && heroiP.client ? (
    <ProximaComPreparo key={heroiP.id} c={heroiP.client} contextoDe={contextoDe} telefone={telefoneDe?.(heroiP.client.id) ?? heroiP.client.telefone ?? null}
      base={{
        numero: estado.indexOf(heroiP) + 1, total: estado.length, nome: nomeDoLead(heroiP.client),
        hora: horaDe(heroiP, hoje) ? horaBRT(heroiP.planned_at!) : null, marcada: !!horaDe(heroiP, hoje),
        quente: quenteDe(heroiP.client), etapa: rotuloDaEtapa(codigoDe(heroiP.client)), corEtapa: corDaEtapa(codigoDe(heroiP.client)),
        oQue: chipDaParada(heroiP) ?? (ehCliente(heroiP.client) ? 'Relacionamento' : 'Visita'), cliente: ehCliente(heroiP.client),
        endereco: ruaDo(heroiP.client), distancia: distanciaAte(heroiP.client.id), pertoM: metros,
        diasNaEtapa: contextoDe?.(heroiP.client)?.diasNaEtapa ?? null, regua: contextoDe?.(heroiP.client)?.regua ?? null,
        conseguir: ehCliente(heroiP.client) ? 'Pedir indicação de 2 vizinhos' : (CONSEGUIR[codigoDe(heroiP.client) ?? ''] ?? 'o próximo passo datado').replace(/^./, (x) => x.toUpperCase()),
      }}
      aoIr={() => ir(heroiP.client!)} aoCheguei={() => aoCheguei(heroiP.client!)} aoLigar={() => ligar(heroiP.client!.id)}
      aoCartao={() => aoAbrirLead(heroiP.client!.id)} aoPlaybook={aoPlaybook} aoTirar={() => setTirando(heroiP)} />
  ) : null;

  // PARA FECHAR (§2.4): reunião de lead sem desfecho + visita com Cheguei sem Como foi
  const itensFeitos = feitoQ.data ? montarFeitoNoDia({
    visitas: feitoQ.data.visitas, fichas: feitoQ.data.fichas, registros: feitoQ.data.registros,
    nomeDe: (id) => feitoQ.data!.nomes.get(id) || nomePorId(id) || null,
    noPlano: new Set(paradasDoDia(dia).map((p) => p.client_id)),
  }) : [];
  const semComoFoi = itensFeitos.filter((i) => i.faltaRegistro);
  const itensParaFechar: ItemDoAviso[] = [
    ...(dia === hoje ? paraFechar.itens : []),
    ...semComoFoi.map((i) => ({ chave: i.chave, nome: i.nome, sub: `Cheguei às ${i.hora} · falta o Como foi`,
      acoes: [{ rotulo: 'Registrar o Como foi', principal: true, onPress: () => { if (i.clientId) aoAbrirLead(i.clientId); } }] })),
  ];
  const blocoParaFechar = itensParaFechar.length ? (
    <Aviso nivel="agir" titulo={`Para fechar · ${itensParaFechar.length}`}
      texto={paraFechar.itens.length && dia === hoje ? 'Reuniões que já passaram e ainda não têm desfecho. O seu gestor vê esta lista.' : 'Visita com Cheguei sem o Como foi. Sem ele a visita não conta.'}
      itens={itensParaFechar} rodape={paraFechar.itens.length && dia === hoje ? paraFechar.rodape : null} />
  ) : null;

  // COMO ESTÁ O SEU DIA (§2.5)
  const visitasFeitas = itensFeitos.filter((i) => i.tipo === 'visita' && !i.faltaRegistro);
  const comPasso = visitasFeitas.filter((i) => !!i.proximo).length;
  const semPasso = visitasFeitas.length - comPasso;
  const linhasDoPlacar: Array<{ texto: string; tom: 'ok' | 'ruim' | 'neutro' | 'info' }> = [];
  if (!provadas && !visitasFeitas.length) linhasDoPlacar.push({ texto: 'Toda visita termina com o próximo passo datado.', tom: 'neutro' });
  if (comPasso) linhasDoPlacar.push({ texto: `${comPasso} ${comPasso === 1 ? 'saiu' : 'saíram'} com próximo passo`, tom: 'ok' });
  if (semPasso) linhasDoPlacar.push({ texto: `${semPasso} sem próximo passo`, tom: 'ruim' });
  if (semComoFoi.length) linhasDoPlacar.push({ texto: `${semComoFoi.length} falta o Como foi`, tom: 'ruim' });
  if (momento === 'noite' && demosHoje.data) linhasDoPlacar.push({ texto: `${demosHoje.data} ${demosHoje.data === 1 ? 'demo hoje' : 'demos hoje'}`, tom: 'info' });
  // A CONTA É UMA SÓ (2.6): o mesmo N de M do placar da aba Tarefas, do mesmo cache
  if (filaQ.data && !filaQ.data.semMedicao && feitasFilaQ.data) {
    const feitosF = new Set(feitasFilaQ.data.map((x) => x.dealId));
    const totalF = feitosF.size + (filaQ.data.itens ?? []).filter((x) => !feitosF.has(x.dealId)).length;
    if (totalF > 0) linhasDoPlacar.push({ texto: `Tarefas: ${feitosF.size} de ${totalF} feitas · a mesma conta da aba Tarefas`, tom: 'info' });
  }
  const placar = (
    <PlacarDoDia rotulo={momento === 'noite' ? `Seu dia · ${horaBRT(new Date().toISOString())}` : 'Como está o seu dia'}
      feitas={provadasMedidas} meta={metaVisitasDia > 0 ? metaVisitasDia : 6} linhas={linhasDoPlacar}
      promessa={pedePromessa ? { aoPrometer: prometer_, enviando: prometer.isPending } : null} />
  );

  const ficaramNoite = momento === 'noite' ? abertasDoDia : [];
  const avisoDaNoite = ficaramNoite.length ? (
    <Aviso nivel="atencao" titulo={`Passou das 18h e ${ficaramNoite.length} ${ficaramNoite.length === 1 ? 'parada ficou' : 'paradas ficaram'}`}
      texto="Se ainda está na rua, siga a lista. Se não, ponha para amanhã."
      acoes={[{ rotulo: `Pôr ${ficaramNoite.length === 1 ? 'a parada' : `as ${ficaramNoite.length}`} amanhã`, principal: true, onPress: () => ficaramNoite.forEach(porAmanha) }]} />
  ) : null;

  /* A TAREFA NA LISTA DO DIA (Tarefas por dia, 2.5): a seção "Ligar e WhatsApp de hoje" saiu. Cada
     ligação ou WhatsApp entra na lista pela hora; sem hora, na primeira janela de ligação que ainda
     não passou (12:30 ou 17:30). Os marcos das janelas entram na lista e somem quando a janela passa. */
  const agoraHM = horaBRT(new Date().toISOString());
  const janelasDoDia = JANELAS_LIGACAO.map((j) => { const [h, m] = j.split(':').map(Number); const fim = h * 60 + m + MINUTOS_DA_JANELA; return { de: j, ate: `${String(Math.floor(fim / 60)).padStart(2, '0')}:${String(fim % 60).padStart(2, '0')}` }; });
  const janelasAbertas = dia === hoje ? janelasDoDia.filter((x) => agoraHM < x.ate) : [];
  const minutos = (h: string | null) => { if (!h) return null; const m = h.replace(/^~/, '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  // 00:00, 09:00 e 12:00 são o "sem hora" do HubSpot (a mesma regra do servidor, horaDe)
  const semHora = (h: string | null) => !h || h === '00:00' || h === '09:00' || h === '12:00';
  const filaItens = (filaQ.data?.itens ?? []) as Array<{ dealId: string; pessoa: string | null; papel: string | null; etapaId: string; verbo: string; assunto?: string | null; telefone: string | null; presencial?: boolean; combinadoEm?: string | null; combinadoNa?: string | null }>;
  const filaProximos = (filaQ.data?.proximos ?? []) as Array<{ dealId: string; pessoa: string | null; papel: string | null; etapaId: string; verbo: string; assunto: string | null; telefone: string | null; presencial?: boolean; combinadoEm?: string | null; combinadoNa?: string | null }>;
  /** 'combinado na visita de sex 16/10' (o servidor diz o dia em que a tarefa nasceu e o contato daquele dia) */
  const ondeCombinou = (f: { combinadoEm?: string | null; combinadoNa?: string | null } | null) => {
    if (!f?.combinadoEm) return null;
    // espaço que não quebra: "sex" e "16/10" ficam na mesma linha
    const quando = [SEMANA[dowDe(f.combinadoEm)].toLowerCase(), ddmm(f.combinadoEm)].join('\u00A0');
    return f.combinadoNa === 'visita' ? 'combinado na visita de ' + quando : f.combinadoNa === 'ligacao' ? 'combinado na ligação de ' + quando
      : f.combinadoNa === 'whatsapp' ? 'combinado no WhatsApp de ' + quando : 'combinado em ' + quando;
  };
  const daFila = (dealId: string | null) => (dealId ? filaItens.find((x) => x.dealId === dealId) ?? filaProximos.find((x) => x.dealId === dealId) ?? null : null);
  // feito na Tarefas (ou aqui, pela Tarefas): sai da lista nas duas telas
  const dealsFeitos = new Set((feitasFilaQ.data ?? []).map((f) => f.dealId));
  type Extra = { k: string; min: number; ord: 0 | 1; el: React.ReactNode; nTarefa?: number };
  const tarefasDoDia: Array<{ k: (typeof compromissos)[number]; hora: string; marcada: boolean; min: number }> = [];
  /* QUEM É LIGAÇÃO: o chip 'ligar' do plano, ou a tarefa do HubSpot cujo negócio está na fila com o verbo
     Ligar ou WhatsApp (o assunto 'Ligar - marcar a data da demo' lia como demo e ia para os sem dia no plano) */
  const ehConversa = (k: (typeof compromissos)[number]) => {
    if (k.acao === 'ligar') return true;
    const f = k.fonte === 'hubspot' ? daFila(k.dealId ? String(k.dealId) : null) : null;
    return !!f && (f.verbo === 'Ligar' || f.verbo === 'WhatsApp') && !f.presencial;
  };
  const ligacoesDoDia = [...sep.ligacoes, ...sep.fora.filter(ehConversa)];
  const foraDoDia = sep.fora.filter((k) => !ehConversa(k));
  for (const k of ligacoesDoDia) {
    if (dia === hoje && k.dealId && dealsFeitos.has(String(k.dealId))) continue;
    const marcada = !semHora(k.hora);
    const hora = marcada ? k.hora! : (janelasAbertas[0] ?? janelasDoDia[dia > hoje ? 0 : janelasDoDia.length - 1]).de;
    tarefasDoDia.push({ k, hora, marcada, min: minutos(hora) ?? 0 });
  }
  const discarDaAgenda = (k: (typeof compromissos)[number], whats: boolean) => {
    const f = daFila(k.dealId);
    const tel = telefoneDe?.(k.clientId) ?? f?.telefone ?? null;
    if (!tel) { Toast.mostrar('Sem telefone no CRM para este lead.', 'fila'); return; }
    void Linking.openURL(whats ? `https://wa.me/${com55(tel)}` : `tel:+${com55(tel)}`);
    const nf = naFilaDe(k);
    // com negócio: entra nos 3 toques da aba Tarefas, no cartão dele, com o tempo fora do app contando
    if (nf) { rolagem.dia = dia; rolagem.voltarAte = Date.now() + 10 * 60_000; aoAbrirNaFila!(nf.dealId, nf.rotulo, { em: Date.now(), canal: whats ? 'whatsapp' : 'ligacao' }); return; }
    if (!whats && podeLigar(k)) setTimeout(() => registrar(k), 600);
  };
  const extrasDoDia: Extra[] = [
    ...tarefasDoDia.map(({ k, hora, marcada, min }): Extra => {
      const f = daFila(k.dealId);
      // o verbo da fila vence o assunto: "Ligar - marcar a data da demo" não é reunião
      const reuniao = k.tipo === 'reunião' && !(f && (f.verbo === 'Ligar' || f.verbo === 'WhatsApp'));
      const whats = reuniao || (f ? f.verbo === 'WhatsApp' : /whats/i.test(`${k.titulo ?? ''} ${acaoPorId(k.acao)?.rotulo ?? ''}`));
      const nf = dia <= hoje || f ? naFilaDe(k) : null;
      const etapa = f?.etapaId ?? null;
      const contato = f?.pessoa ? (f.papel ? `${f.pessoa}, ${f.papel.toLowerCase()}` : f.pessoa) : null;
      const verbo = reuniao ? 'Confirmar' : whats ? 'WhatsApp' : 'Ligar';
      // o assunto do HubSpot é "Tipo - texto": o tipo já está no verbo da frase
      const semTipo = (x: string | null | undefined) => (x ? x.replace(/^\s*[^-–·:]{1,24}\s+[-–·:]\s+/, '').trim() || null : null);
      const oQue = semTipo(k.titulo) ?? semTipo(f?.assunto);
      const d: DadosDaTarefa = {
        chave: k.id, nome: k.nome ?? 'cliente não identificado', hora, marcada, whatsapp: whats, corEtapa: corDaEtapa(etapa),
        quente: !!etapa && ETAPAS_QUENTES_AGENDA.has(etapa),
        linha2: [contato, rotuloDaEtapa(etapa)].filter(Boolean).join(' · ') || null,
        linha3: [marcada ? null : 'sem hora', ondeCombinou(f) ?? (marcada ? (k.fonte === 'hubspot' ? 'tarefa do HubSpot' : 'retorno da Agenda do app') : 'entra na hora das ligações')].filter(Boolean).join(' · '),
        // o mesmo texto do cartão na aba Tarefas (textoDaTarefa); sem o negócio na fila, o verbo + o assunto
        linha4: f?.assunto ? oQueFazer(f.assunto, k.nome ?? '', '') || null : oQue ? `${verbo}: ${oQue}` : reuniao ? 'Confirmar a reunião no WhatsApp' : null,
      };
      return { k: k.id, min, ord: 1, nTarefa: 1, el: (
        <LinhaTarefa key={k.id} d={d}
          aoTocar={nf ? () => { rolagem.dia = dia; rolagem.voltarAte = Date.now() + 10 * 60_000; aoAbrirNaFila!(nf.dealId, nf.rotulo); } : k.clientId ? () => aoAbrirLead(k.clientId!) : undefined}
          aoVerbo={dia < hoje ? undefined : reuniao ? () => confirmarNoWhatsApp(k) : () => discarDaAgenda(k, whats)} />
      ) };
    }),
    ...janelasAbertas.map((x): Extra => {
      const fim = minutos(x.ate) ?? 0, ini = minutos(x.de) ?? 0;
      const n = tarefasDoDia.filter((t) => t.min >= ini && t.min < fim).length;
      return { k: `janela-${x.de}`, min: ini, ord: 0, el: <MarcoDaJanela key={`janela-${x.de}`} de={x.de} ate={x.ate} nNaFila={n} /> };
    }),
  ].sort((a, b) => a.min - b.min || a.ord - b.ord);

  /** As paradas na ordem delas, com as tarefas e os marcos encaixados pela hora (marco, parada, tarefa). */
  const intercalar = (paradasEl: Array<{ min: number | null; el: React.ReactNode }>, extras: Extra[]) => {
    const fora: React.ReactNode[] = [];
    let i = 0;
    let ultimo = -1;
    for (const p of paradasEl) {
      const m = p.min ?? ultimo;
      while (i < extras.length && (extras[i].min < m || (extras[i].min === m && extras[i].ord === 0))) fora.push(extras[i++].el);
      fora.push(p.el);
      ultimo = m;
    }
    while (i < extras.length) fora.push(extras[i++].el);
    return fora;
  };
  const LEGENDA = 'Hora em negrito: marcada. Em cinza: prevista. Disco vazado: ligar ou WhatsApp, na hora dele; sem hora, entra na hora das ligações.';
  const listaDoDia = (rotulo: string, linhas: Array<{ p: FieldRouteStopWithClient; hora: string | null; numero: number }>, d: string, comAmanha: boolean) => (
    <View>
      <TituloDeLista titulo={rotulo} apoio={LEGENDA} />
      {intercalar(linhas.map((l) => ({
        min: minutos(l.hora),
        el: (
          <LinhaComPreparo key={l.p.id} p={l.p} contextoDe={contextoDe} d={dadosDaLinha(l.p, l.numero, l.hora)} aberta={aberto === l.p.id}
            aoTocar={() => setAberto(aberto === l.p.id ? null : l.p.id)}
            aoIr={l.p.client ? () => ir(l.p.client!) : undefined}
            aoFazerAgora={d === hoje && l.p.status !== 'done' ? () => { setFocoId(l.p.id); setAberto(null); } : undefined}
            aoCartao={() => aoAbrirLead(l.p.client_id)} aoPorAmanha={comAmanha ? () => porAmanha(l.p) : undefined} />
        ),
      })), extrasDoDia)}
      {linhas.length > 0 && botoesDoDia(paradasDoDia(d), d)}
    </View>
  );
  const temTarefaNaLista = tarefasDoDia.length > 0;

  // MARCADOS NO HUBSPOT, SEM DIA NO PLANO (§2.8)
  const blocoHubspot = foraDoDia.length ? (
    <View style={{ gap: 8 }}>
      <TituloDeLista titulo={`Marcados no HubSpot, sem dia no plano · ${foraDoDia.length}`} apoio="Têm tarefa no HubSpot, mas nenhuma parada combina. Marque o passo para entrar no plano." />
      {foraDoDia.map((k) => (
        <View key={k.id} style={s.cartaoHub}>
          <View style={{ gap: 2 }}>
            <Text style={s.cartaoHubNome} numberOfLines={2}>{k.nome ?? 'cliente não identificado'}</Text>
            <Text style={s.subLinha}>{[acaoPorId(k.acao)?.rotulo ?? (k.tipo === 'reunião' ? 'Reunião' : 'Follow-up'), k.hora, k.titulo].filter(Boolean).join(' · ')}</Text>
          </View>
          {k.clientId && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Marcar o próximo passo: ${k.nome ?? 'lead'}`} style={s.botaoCheio}
              onPress={() => (aoMarcarProximoPasso ? aoMarcarProximoPasso(k.clientId!) : aoAbrirLead(k.clientId!))}>
              <Text style={s.botaoCheioT}>Marcar o próximo passo</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  ) : null;

  // FEITO HOJE (§2.9), aberto; quem falta o Como foi está no Para fechar
  const feitosDoDia = itensFeitos.filter((i) => !i.faltaRegistro);
  const blocoFeito = feitosDoDia.length ? (
    <View>
      <TituloDeLista titulo={`${dia === hoje ? 'Feito hoje' : 'Feito no dia'} · ${feitosDoDia.length}`} />
      {feitosDoDia.map((i) => (
        <LinhaFeito key={i.chave} hora={i.hora} nome={i.nome} sub={[i.linha1, i.linha2].filter(Boolean).join(' · ')} proximo={i.proximo} selo={i.selo}
          aoTocar={i.clientId ? () => aoAbrirLead(i.clientId!) : undefined}
          aoMarcar={i.clientId && aoMarcarProximoPasso ? () => aoMarcarProximoPasso(i.clientId!) : undefined} />
      ))}
    </View>
  ) : null;

  const carregando = planoDaFaixa.isLoading && paradas.length === 0 && dia === hoje;
  const outro = dia !== hoje;
  const listaOutro = outro ? paradasDoDia(dia) : [];
  const plOutro = outro ? semana.data?.get(dia) : undefined;

  return (
    <ScrollView ref={rolador} style={s.tela} contentContainerStyle={[s.conteudo, largo && { paddingHorizontal: 0 }]}
      scrollEventThrottle={200} onScroll={(e) => { rolagem.dia = dia; rolagem.y = e.nativeEvent.contentOffset.y; }}
      onContentSizeChange={(_w, h) => {
        // voltou da aba Tarefas pela barra: a mesma rolagem, uma vez
        if (rolagem.voltarAte > Date.now() && rolagem.dia === dia && rolagem.y > 0 && h >= rolagem.y + 200) { rolador.current?.scrollTo({ y: rolagem.y, animated: false }); rolagem.voltarAte = 0; }
      }}>
      <RegistrarTarefa
        tarefa={registrando}
        aoFechar={() => setRegistrando(null)}
        aoSumir={(id) => setConcluidas((st) => new Set(st).add(`hs-${id}`))}
        aoVoltar={(id) => setConcluidas((st) => { const n = new Set(st); n.delete(`hs-${id}`); return n; })}
      />
      {avisoDoAparelho}
      <View style={{ gap: 8 }}>
        {seletorSemana}
        {faixa}
        {seletor}
      </View>
      {!outro ? (
        carregando ? (
          <View style={{ gap: 10 }}>
            <Text style={s.subLinha}>Montando o dia pelo plano e pela hora…</Text>
            {[96, 120, 96].map((h, i) => <View key={i} style={[s.esqueleto, { height: h }]} />)}
          </View>
        ) : (
          <>
            {momento !== 'noite' && heroi}
            {semRota && !leituraFalhou && (
              <Aviso nivel="atencao" titulo="Hoje ainda não tem paradas"
                texto="Organizar o dia monta a rota com os quentes primeiro, a partir de onde você está."
                acoes={[
                  ...(aoMontarDia ? [{ rotulo: montandoDia ? 'Organizando…' : 'Organizar o dia', principal: true, onPress: aoMontarDia, desligado: montandoDia }] : []),
                  ...(aoMapaDoDia ? [{ rotulo: 'Abrir o mapa', onPress: aoMapaDoDia }] : []),
                ]} />
            )}
            {leituraFalhou && (
              <Aviso nivel="atencao" titulo="Não consegui ler o seu plano agora" texto="Pode ser o sinal. Feche e abra a Agenda de novo antes de organizar o dia, para não montar por cima do que já está planejado." />
            )}
            {blocoParaFechar}
            {placar}
            {avisoDaNoite}
            {(temTarefaNaLista || (momento === 'noite' ? ficaramNoite.length > 0 : linhasParadas.length > 0)) && listaDoDia(
              momento === 'noite' ? `Ficaram para trás · ${ficaramNoite.length}` : linhasParadas.length ? 'Depois' : 'Hoje',
              momento === 'noite' ? ficaramNoite.map((p) => ({ p, hora: null, numero: estado.indexOf(p) + 1 })) : linhasParadas,
              hoje, momento === 'noite')}
            {blocoHubspot}
            {blocoFeito}
          </>
        )
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Text style={s.outroTitulo}>{`${SEMANA_LONGA[dowDe(dia)][0].toUpperCase()}${SEMANA_LONGA[dowDe(dia)].slice(1)}, ${ddmm(dia)}`}</Text>
            <Text style={s.subLinha}>{[plOutro?.proposito ? PROPOSITOS[plOutro.proposito] ?? plOutro.proposito : null, listaOutro.length ? `${listaOutro.length} ${listaOutro.length === 1 ? 'parada' : 'paradas'}` : null, listaOutro.length ? 'plano fechado com o gestor' : null].filter(Boolean).join(' · ') || 'Nada no plano deste dia'}</Text>
          </View>
          {blocoParaFechar}
          {listaOutro.length === 0 && (
            <Aviso nivel="atencao" titulo="Este dia ainda não tem paradas" texto={'O plano se monta no mapa (toque no pino e "Marcar o próximo passo") ou no Planejamento do Cockpit.'} />
          )}
          {(listaOutro.length > 0 || temTarefaNaLista) && listaDoDia(listaOutro.length ? `Paradas · ${listaOutro.length}` : 'Tarefas do dia', listaOutro.map((p, i) => ({ p, hora: horaDe(p, dia) ? horaBRT(p.planned_at!) : null, numero: i + 1 })), dia, false)}
          {blocoHubspot}
          {blocoFeito}
          <Text style={s.nota}>É o mesmo plano que o seu gestor vê no Planejamento do Cockpit.</Text>
        </>
      )}
      <SemLugarNoMapa dia={dia} />

      <Painel visivel={!!tirando} aoFechar={() => setTirando(null)} rotulo="Tirar do plano">
        <View style={{ gap: 10, paddingBottom: 8 }}>
          <Text style={s.nomeLinha}>{tirando?.client ? `Tirar ${nomeDoLead(tirando.client)} do plano de hoje?` : 'Tirar do plano?'}</Text>
          <Text style={s.subLinha}>Sai da Agenda e do Planejamento do gestor, com o motivo.</Text>
          {tirando && [
            { t: 'Estava fechado', fn: () => confirmarTirar(tirando, 'fechado') },
            { t: 'Sem tempo hoje', fn: () => confirmarTirar(tirando, 'sem_tempo') },
            { t: 'Passar para outro dia', fn: () => { const c = tirando.client_id; setTirando(null); if (aoMarcarProximoPasso) setTimeout(() => aoMarcarProximoPasso(c), 350); else aoAbrirLead(c); } },
          ].map((o) => (
            <Pressable key={o.t} accessibilityRole="button" style={s.opcao} onPress={o.fn}>
              <Text style={[s.nomeLinha, { flex: 1 }]}>{o.t}</Text>
              <IconChevronRight width={20} height={20} fill={cores.muted} />
            </Pressable>
          ))}
        </View>
      </Painel>
    </ScrollView>
  );
}

/** A próxima parada com o preparo (último toque, quem decide e o que a etapa pede) do banco. */
function ProximaComPreparo({ c, contextoDe, telefone, base, ...acoes }: {
  c: Client; contextoDe?: Props['contextoDe']; telefone: string | null; base: Omit<DadosDaProxima, 'ultimo' | 'decide'>;
  aoIr: () => void; aoCheguei: () => void; aoLigar: () => void; aoCartao: () => void; aoPlaybook?: () => void; aoTirar?: () => void;
}) {
  const q = usePreparo(c.id, true, c.id_hubspot ? String(c.id_hubspot) : null);
  const ctx = contextoDe?.(c) ?? { codigo: null, diasNaEtapa: null, regua: null };
  const p = montarPreparo({ codigo: ctx.codigo, diasNaEtapa: ctx.diasNaEtapa, reguaDias: ctx.regua, telefone, fichas: q.data?.fichas ?? [], toques: q.data?.toques ?? [], negocio: q.data?.negocio ?? null });
  const conseguir = !base.cliente && p.falta ? p.falta.replace(/^Para [^:]+:\s*/, '').replace(/^./, (x) => x.toUpperCase()) : base.conseguir;
  return <ProximaParada d={{ ...base, ultimo: q.isLoading ? '…' : p.ultimo, decide: q.isLoading ? '…' : p.decide, conseguir }} {...acoes} />;
}

/** A linha de parada; o "Quem decide" só é lido quando a pessoa abre a linha. */
function LinhaComPreparo({ p, contextoDe, d, ...resto }: {
  p: FieldRouteStopWithClient; contextoDe?: Props['contextoDe']; d: DadosDaLinha; aberta: boolean;
  aoTocar: () => void; aoIr?: () => void; aoFazerAgora?: () => void; aoCartao: () => void; aoPorAmanha?: () => void;
}) {
  const c = p.client;
  const q = usePreparo(c?.id ?? null, resto.aberta && !!c, c?.id_hubspot ? String(c.id_hubspot) : null);
  const ctx = c ? contextoDe?.(c) ?? { codigo: null, diasNaEtapa: null, regua: null } : { codigo: null, diasNaEtapa: null, regua: null };
  const decide = resto.aberta && c
    ? (q.isLoading ? '…' : montarPreparo({ codigo: ctx.codigo, diasNaEtapa: ctx.diasNaEtapa, reguaDias: ctx.regua, telefone: c.telefone ?? null, fichas: q.data?.fichas ?? [], toques: q.data?.toques ?? [], negocio: q.data?.negocio ?? null }).decide)
    : null;
  return <LinhaParada d={{ ...d, decide: d.cliente ? '—' : decide }} {...resto} />;
}

const s = StyleSheet.create({
  segmento: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 14, backgroundColor: 'var(--surface-3)' },
  segItem2: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segItem2Ativo: { backgroundColor: 'var(--surface-2)', boxShadow: '0 1px 2px rgba(0,0,0,.12)' } as never,
  segTexto2: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  organizar: { flex: 1, minHeight: 44, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: 'var(--stroke-strong)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  organizarT: { fontSize: 13, fontWeight: '700', color: 'var(--text)', textAlign: 'center', flexShrink: 1 },
  percurso: { flex: 1, minHeight: 44, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  percursoT: { fontSize: 13, fontWeight: '600', color: 'var(--text-muted)', textAlign: 'center' },
  cartaoHub: { borderRadius: 14, backgroundColor: 'var(--surface-2)', borderWidth: 1, borderColor: 'var(--border)', padding: 12, gap: 10 },
  cartaoHubNome: { fontSize: 14.5, fontWeight: '700', lineHeight: 19, color: 'var(--text)' },
  botaoCheio: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  botaoCheioT: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  // a barra de baixo (Mapa · Agenda · Tarefas) cobria o fim da lista: folga da barra + área segura
  conteudo: { padding: 16, paddingBottom: 'calc(120px + env(safe-area-inset-bottom))' as unknown as number, gap: 12 },
  faixa: { flexDirection: 'row', gap: 6 },
  dia: { flex: 1, minWidth: 0, minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'flex-start', gap: 1, paddingVertical: 6, paddingHorizontal: 2, backgroundColor: 'var(--surface-2)', borderWidth: 1, borderColor: 'var(--border)' },
  diaAtivo: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  diaSemana: { fontSize: 11, fontWeight: '700', letterSpacing: 0.44, color: 'var(--text)' },
  diaNumero: { fontSize: 15, fontWeight: '800', lineHeight: 17, color: 'var(--text)', fontVariant: ['tabular-nums'] },
  diaProposito: { fontSize: 10, fontWeight: '500', lineHeight: 12, color: 'var(--text-muted)', maxWidth: '100%' },
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
  // sem padding lateral: a caixa tracejada dentro da coluna cortava o nome ("Kadô Sushi Ba…") a 390 px
  fora: { gap: 10, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border)' },
  secao: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--text-faint)', marginTop: 4 },
  linha: { borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)' },
  linhaAberta: { borderColor: 'var(--border)' },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 12, paddingVertical: 8 },
  linhaPreparo: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  // 58 e uma linha só: a hora estimada tem o "~" na frente e quebrava em "~12:0 / 0" (iPhone, 19/10/26)
  hora: { width: 58, flexShrink: 0, fontSize: 14, fontWeight: '800', color: 'var(--text)', fontVariant: ['tabular-nums'], whiteSpace: 'nowrap' } as never,
  disco: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  discoTexto: { fontSize: 13, fontWeight: '800', color: '#111418' },
  nomeLinha: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: 'var(--text)' },
  subLinha: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  botaoLinha: { minHeight: 44, minWidth: 56, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  botaoWhats: { backgroundColor: '#128C4A', borderColor: '#128C4A' },
  botaoNaFila: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  botaoNaFilaTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  linhaJanela: { minHeight: 44, borderRadius: 12, backgroundColor: 'var(--surface-3)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  horaJanela: { width: 44, fontSize: 13, fontWeight: '800', color: 'var(--vermelho-texto)' },
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
