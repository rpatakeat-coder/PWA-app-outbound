// AGENDA NO COMPUTADOR — planejar no mapa e já ir (Claude Design, "entrega-agenda-pc", 05/10/2026).
//
// O painel da esquerda (400 px; 360 em 1280) com o mapa na altura toda à direita. De cima para
// baixo: busca + Hoje + Esconder · a semana (passada, esta e a próxima) · o dia (propósito e
// resumo) · Plano | Sugestões · aviso de conflito · a lista · o rodapé fixo.
//
// A ORDEM MANDA (src/utils/rotaDoDia.ts): o horário sem cadeado é estimado pelo caminho; o
// cadeado prende o horário, não a posição. Nada aqui grava sozinho: pôr, tirar, mover, fixar e
// Encaixar são marcas (o App guarda o rascunho e mostra o mesmo dia no mapa); Confirmar grava
// tudo e manda ao Planejamento do Cockpit. Dia passado é só leitura, com a prova de cada visita.
//
// Só computador. O celular continua com a AgendaNovoScreen.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../integrations/supabase/client';
import { useTarefasDoCrm } from '../hooks/useTarefasDoCrm';
import { useClientSearch } from '../hooks/useClients';
import { compromissosDoDia, type Compromisso } from '../utils/agendaNovo';
import { lerSemanaDoPlano, PROPOSITOS } from '../utils/semanaDoPlano';
import { montarPreparo, usePreparo } from '../utils/preparo';
import { conflito, duracao, encaixar, hhmm, horarios, kmTexto, melhorPosicao, metros, perna, resumo, type ParadaRota, type Ponto } from '../utils/rotaDoDia';
import type { LugarPerto } from '../utils/googlePerto';
import type { Client, ClientMeeting } from '../types/client';
import {
  IconCall, IconChevronLeft, IconChevronRight, IconClose, IconLock, IconMenu, IconSearch, IconShrink, IconWarning, IconWhatsapp, useIconColors,
} from '../components/icons';

export type ItemPC = {
  client: Client;
  /** feita = visitada (na rota ou check-in no dia); entra = marcada para entrar, ainda não gravada. */
  estado: 'planejada' | 'feita' | 'entra';
  /** Hora de reunião ou horário combinado que veio da grade do Cockpit: cadeado que não se solta aqui. */
  compromisso: string | null;
  /** Hora com cadeado em vigor (compromisso, ou o cadeado posto na Agenda). */
  fixo: string | null;
};

export type GrupoSugestao = 'regua' | 'alvo' | 'queda' | 'google';
export type SugestaoPC = {
  chave: string;
  grupo: GrupoSugestao;
  client: Client | null;
  google: LugarPerto | null;
  nome: string;
  sub: string;
  ponto: Ponto;
};

export type ContextoPC = { codigo: string | null; diasNaEtapa: number | null; regua: number | null; temperatura: string | null; etapa: string | null };

type Props = {
  hoje: string;
  dia: string;
  aoDia: (iso: string) => void;
  itens: ItemPC[];
  carregando: boolean;
  meta: number;
  ownerHubspot: string | null;
  reunioes: ClientMeeting[];
  nomePorId: (clientId: string) => string | null;
  nomeDe: (c: Client) => string;
  corDe: (c: Client) => string;
  contextoDe: (c: Client) => ContextoPC;
  sugestoes: SugestaoPC[];
  carregandoGoogle: boolean;
  aba: 'plano' | 'sugestoes';
  aoAba: (a: 'plano' | 'sugestoes') => void;
  foco: Client | null;
  aoFocar: (c: Client | null) => void;
  hover: string | null;
  aoHover: (id: string | null) => void;
  mudancas: number;
  confirmando: boolean;
  aoConfirmar: () => void;
  aoDescartar: () => void;
  aoPor: (cs: Client[]) => void;
  aoTirar: (c: Client) => void;
  aoOrdem: (ids: string[], texto: string) => void;
  aoFixar: (clientId: string, hora: string | null) => void;
  aoPorGoogle: (l: LugarPerto) => void;
  aoAbrirFicha: (c: Client) => void;
  aoIrParaRua: () => void;
  aoRemarcar: (cs: Client[]) => void;
  aoBairro: (bairro: string, pontos: Ponto[]) => void;
  recolhido: boolean;
  aoEsconder: () => void;
  largura: number;
};

const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const somaDias = (iso: string, n: number) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const segundaDe = (iso: string) => { const d = dow(iso); return somaDias(iso, d === 0 ? -6 : 1 - d); };
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const minDe = (h: string | null) => { if (!h) return null; const m = /^(\d{1,2}):(\d{2})/.exec(h); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const pontoDe = (c: Client): Ponto | null => (c.latitude != null && c.longitude != null ? { latitude: Number(c.latitude), longitude: Number(c.longitude) } : null);
const ordinal = (n: number) => `${n}ª`;
/** Conta-alvo da munição ainda sem negócio não é "sem etapa": é a etapa antes do funil. */
const etapaOuTipo = (c: Client, etapa: string | null) => etapa ?? (c.status === 'cliente' ? 'Cliente Takeat' : (c.lead_prospeccao_id || c.conta_alvo_place_id) ? 'Conta-alvo · sem negócio' : null);
const soDigitos = (t: string) => t.replace(/\D+/g, '');
const com55 = (t: string) => { const d = soDigitos(t); return d.length <= 11 ? `55${d}` : d; };
const ROTULO_GRUPO: Record<GrupoSugestao, string> = {
  regua: 'PASSARAM DA RÉGUA', alvo: 'CONTAS-ALVO DA MUNIÇÃO', queda: 'CLIENTES EM QUEDA', google: 'GOOGLE · FORA DA BASE',
};

function tituloDoDia(dia: string, hoje: string) {
  const base = `${SEMANA_LONGA[dow(dia)]}, ${ddmm(dia)}`;
  return dia === hoje ? `Hoje, ${base}` : base.charAt(0).toUpperCase() + base.slice(1);
}

/** Barra de 8 segmentos + o que o preparo sabe do lead (o mesmo da Agenda do celular). */
function CartaoFoco({ c, item, numero, total, chega, props }: {
  c: Client; item: ItemPC | null; numero: number | null; total: number; chega: number | null; props: Props;
}) {
  const ctx = props.contextoDe(c);
  const q = usePreparo(c.id, true, c.id_hubspot ? String(c.id_hubspot) : null);
  const p = montarPreparo({ codigo: ctx.codigo, diasNaEtapa: ctx.diasNaEtapa, reguaDias: ctx.regua, telefone: c.telefone, fichas: q.data?.fichas ?? [], toques: q.data?.toques ?? [], negocio: q.data?.negocio ?? null });
  const cores = useIconColors();
  const [escolhendoHora, setEscolhendoHora] = useState(false);
  const somenteLeitura = props.dia < props.hoje;
  // Na microrota: as portas da base a até 250 m (o anel do mapa) que não estão no dia.
  const noDia = new Set(props.itens.map((i) => i.client.id));
  const pc = pontoDe(c);
  const perto = pc ? props.sugestoes.filter((s) => s.client && !noDia.has(s.client.id) && s.client.id !== c.id && metros(pc, s.ponto) <= 250).slice(0, 4) : [];
  const opcoesHora = (() => {
    const base = chega ?? 9 * 60;
    const r = Math.round(base / 15) * 15;
    return [r - 30, r - 15, r, r + 15].filter((m) => m >= 6 * 60 && m <= 21 * 60).map(hhmm);
  })();
  const fixadoAqui = !!item?.fixo && !item.compromisso;
  return (
    <View style={{ gap: 12 }}>
      <View style={s.focoTopo}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar para o plano" onPress={() => props.aoFocar(null)} style={s.voltar}>
          <IconChevronLeft width={16} height={16} fill={cores.muted} />
          <Text style={s.voltarTexto}>{numero ? `Plano de ${props.dia === props.hoje ? 'hoje' : SEMANA_LONGA[dow(props.dia)]}` : 'Voltar'}</Text>
        </Pressable>
        {numero ? <Text style={s.focoPos}>{`${numero} de ${total}`}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        {numero ? <View style={[s.disco, { backgroundColor: props.corDe(c) }]}><Text style={s.discoTexto}>{numero}</Text></View> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.focoNome} numberOfLines={2}>{props.nomeDe(c)}</Text>
          <Text style={s.sub} numberOfLines={2}>{[etapaOuTipo(c, ctx.etapa) ?? 'Sem etapa', c.bairro ?? 'sem bairro no cadastro'].join(' · ')}</Text>
        </View>
      </View>
      {p.indice >= 0 && (
        <View style={s.segs8}>{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <View key={i} style={[s.seg8, i <= p.indice && { backgroundColor: 'var(--vermelho-acao)' }]} />)}</View>
      )}
      <View style={s.grade2}>
        <Campo rotulo="Temperatura" valor={ctx.temperatura ?? '—'} />
        <Campo rotulo="Na etapa" valor={ctx.diasNaEtapa != null ? `${ctx.diasNaEtapa} ${ctx.diasNaEtapa === 1 ? 'dia útil' : 'dias úteis'}${ctx.regua ? ` · régua ${ctx.regua}` : ''}` : '—'}
          tom={p.regua === 'passou' ? 'var(--vermelho-texto)' : p.regua === 'perto' ? 'var(--ambar-texto)' : undefined} />
        <Campo rotulo="Último contato" valor={q.isLoading ? '…' : p.ultimo} />
        <Campo rotulo="Contatos" valor={q.isLoading ? '…' : `${p.contatos} de 4`} />
        <Campo rotulo="Telefone" valor={c.telefone || '—'} />
        <Campo rotulo="Bairro" valor={c.bairro || 'sem bairro no cadastro'} tom={c.bairro ? undefined : 'var(--ambar-texto)'} />
      </View>
      {item && chega != null && item.estado !== 'feita' && (
        <View style={s.caixaHora}>
          <View style={{ flex: 1 }}>
            <Text style={s.horaGrande}>{item.fixo ? `às ${item.fixo}` : `chega ≈ ${hhmm(chega)}`}</Text>
            <Text style={s.sub}>{item.compromisso ? 'horário marcado (reunião ou combinado)' : item.fixo ? 'horário fixo · a ordem se ajusta em volta' : 'estimado pela ordem da rota'}</Text>
          </View>
          {!somenteLeitura && !item.compromisso && (
            fixadoAqui ? (
              <Pressable accessibilityRole="button" onPress={() => props.aoFixar(c.id, null)} style={s.botaoPeq}><Text style={s.botaoPeqTexto}>Soltar horário</Text></Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setEscolhendoHora((v) => !v)} style={s.botaoPeq}>
                <IconLock width={14} height={14} fill={cores.muted} /><Text style={s.botaoPeqTexto}>Fixar horário</Text>
              </Pressable>
            )
          )}
        </View>
      )}
      {escolhendoHora && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {opcoesHora.map((h) => (
            <Pressable key={h} accessibilityRole="button" onPress={() => { props.aoFixar(c.id, h); setEscolhendoHora(false); }} style={s.chipHora}>
              <Text style={s.chipHoraTexto}>{h}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" disabled={!c.telefone} onPress={() => { if (c.telefone) void Linking.openURL(`tel:${soDigitos(c.telefone)}`); }} style={[s.botaoSec, !c.telefone && { opacity: 0.45 }]}>
          <IconCall width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>Ligar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!c.telefone} onPress={() => { if (c.telefone) void Linking.openURL(`https://wa.me/${com55(c.telefone)}`); }} style={[s.botaoSec, !c.telefone && { opacity: 0.45 }]}>
          <IconWhatsapp width={16} height={16} fill={cores.onSurface} /><Text style={s.botaoSecTexto}>WhatsApp</Text>
        </Pressable>
        {!somenteLeitura && (item ? (
          item.estado !== 'feita' && !item.compromisso && (
            <Pressable accessibilityRole="button" onPress={() => props.aoTirar(c)} style={s.botaoSec}><Text style={s.botaoSecTexto}>Tirar do dia</Text></Pressable>
          )
        ) : (
          <Pressable accessibilityRole="button" onPress={() => props.aoPor([c])} style={[s.botaoSec, s.botaoPor]}><Text style={s.botaoPorTexto}>Pôr no dia</Text></Pressable>
        ))}
      </View>
      {!somenteLeitura && (
        <View style={s.caixa}>
          <Text style={s.rotuloSecao}>NA MICROROTA · 250 M</Text>
          {perto.length ? perto.map((x) => (
            <View key={x.chave} style={s.linhaMini}>
              <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => x.client && props.aoFocar(x.client)}>
                <Text style={s.nomeMini} numberOfLines={2}>{x.nome}</Text>
                <Text style={s.sub} numberOfLines={1}>{x.sub}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => x.client && props.aoPor([x.client])} style={s.botaoPorPeq}><Text style={s.botaoPorTexto}>Pôr</Text></Pressable>
            </View>
          )) : <Text style={s.sub}>Nenhuma outra porta da base nesse raio.</Text>}
        </View>
      )}
      <Pressable accessibilityRole="button" onPress={() => props.aoAbrirFicha(c)} style={s.botaoLink}>
        <Text style={s.botaoLinkTexto}>Abrir ficha completa do lead</Text>
        <IconChevronRight width={14} height={14} fill={cores.muted} />
      </Pressable>
    </View>
  );
}

function Campo({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <View style={s.campo}>
      <Text style={s.campoRotulo}>{rotulo}</Text>
      <Text style={[s.campoValor, tom ? { color: tom } : null]} numberOfLines={2}>{valor}</Text>
    </View>
  );
}

export default function AgendaPC(props: Props) {
  const { hoje, dia, aoDia, itens, carregando, meta, ownerHubspot, foco, aoFocar, aba, aoAba } = props;
  const cores = useIconColors();
  const { user } = useAuth();
  const passado = dia < hoje;
  const ehHoje = dia === hoje;

  // ---- semana (‹ › atravessa a passada, esta e a próxima) ----
  const segHoje = segundaDe(hoje);
  const seg = segundaDe(dia);
  const offset = Math.round((Date.parse(seg) - Date.parse(segHoje)) / (7 * 86400000));
  const diasSemana = [0, 1, 2, 3, 4].map((i) => somaDias(seg, i));
  const irSemana = (n: number) => {
    const alvo = somaDias(segHoje, 7 * n);
    const naSemana = [0, 1, 2, 3, 4].map((i) => somaDias(alvo, i));
    aoDia(naSemana.includes(hoje) ? hoje : n < 0 ? naSemana[4] : naSemana[0]);
  };
  const rotuloSemana = offset === 0 ? 'Esta semana' : offset === 1 ? 'Semana que vem' : offset === -1 ? 'Semana passada' : `Semana de ${ddmm(seg)}`;

  // Contagem de cada dia da semana (uma consulta para os cinco).
  const semanaQ = useQuery({
    queryKey: ['field_route_stops', 'semana-pc', user?.id, seg],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('field_routes')
        .select('route_date, stops:field_route_stops(client_id, status)')
        .eq('seller_id', user!.id).gte('route_date', diasSemana[0]).lte('route_date', diasSemana[4]);
      if (error) throw error;
      const porDia = new Map<string, { vivas: number; feitas: number }>();
      for (const r of (data ?? []) as unknown as Array<{ route_date: string; stops: Array<{ status: string }> }>) {
        const vivas = (r.stops ?? []).filter((x) => x.status === 'planned' || x.status === 'done');
        const atual = porDia.get(r.route_date) ?? { vivas: 0, feitas: 0 };
        porDia.set(r.route_date, { vivas: atual.vivas + vivas.length, feitas: atual.feitas + vivas.filter((x) => x.status === 'done').length });
      }
      return porDia;
    },
  });
  const { tarefas } = useTarefasDoCrm(true);
  const compromissosDe = (d: string, jaNoPlano: Set<string>) => compromissosDoDia(d, tarefas, props.reunioes, props.nomePorId, jaNoPlano);
  const rotuloChip = (d: string) => {
    if (d === dia) {
      const n = itens.length;
      if (passado) return n ? `${itens.filter((i) => i.estado === 'feita').length} de ${n}` : 'vazio';
      return n ? (d === hoje ? `hoje · ${n}` : `${n} ${n === 1 ? 'parada' : 'paradas'}`) : 'vazio';
    }
    const c = semanaQ.data?.get(d);
    if (d < hoje) return c?.vivas ? `${c.feitas} de ${c.vivas}` : '—';
    if (c?.vivas) return d === hoje ? `hoje · ${c.vivas}` : `${c.vivas} ${c.vivas === 1 ? 'parada' : 'paradas'}`;
    const k = compromissosDe(d, new Set()).length;
    return k ? `${k} ${k === 1 ? 'retorno' : 'retornos'}` : 'vazio';
  };

  // ---- propósito do dia (a grade do Planejamento) ----
  const planoQ = useQuery({
    queryKey: ['plano_semana_agenda_pc', ownerHubspot, seg],
    enabled: !!ownerHubspot,
    staleTime: 60_000,
    queryFn: () => lerSemanaDoPlano(ownerHubspot!, seg),
  });
  const proposito = planoQ.data?.find((x) => x.iso === dia)?.proposito ?? null;
  const bairroDoDia = (() => {
    const conta = new Map<string, number>();
    for (const i of itens) if (i.client.bairro) conta.set(i.client.bairro, (conta.get(i.client.bairro) ?? 0) + 1);
    return [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  })();

  // ---- a rota: horários estimados, pernas, conflito ----
  const rota: ParadaRota[] = useMemo(() => itens.map((i) => ({ id: i.client.id, ponto: pontoDe(i.client), fixo: minDe(i.fixo) })), [itens]);
  const inicio = useMemo(() => {
    const primeiroFixo = rota[0]?.fixo;
    return primeiroFixo != null ? primeiroFixo : 9 * 60;
  }, [rota]);
  const hs = useMemo(() => horarios(rota, inicio), [rota, inicio]);
  const res = resumo(rota, hs);
  const conf = passado ? null : conflito(rota, hs);

  // ---- dia passado: a prova de cada visita ----
  const visitasQ = useQuery({
    queryKey: ['visitas_do_dia_pc', user?.id, dia],
    enabled: !!user?.id && passado,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const ini = new Date(`${dia}T03:00:00.000Z`).toISOString();
      const fim = new Date(Date.parse(ini) + 86400000).toISOString();
      const { data, error } = await supabase.from('client_visits').select('client_id, visited_at, distance_m, declarada')
        .eq('visited_by', user!.id).gte('visited_at', ini).lt('visited_at', fim);
      if (error) throw error;
      const m = new Map<string, { hora: string; distancia: number | null; declarada: boolean }>();
      for (const v of (data ?? []) as Array<{ client_id: string; visited_at: string; distance_m: number | null; declarada: boolean | null }>) {
        if (m.has(v.client_id)) continue;
        m.set(v.client_id, { hora: new Date(v.visited_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }), distancia: v.distance_m != null ? Number(v.distance_m) : null, declarada: !!v.declarada });
      }
      return m;
    },
  });
  const provaDe = (c: Client) => visitasQ.data?.get(c.id) ?? null;
  // dia passado: o que se rodou de verdade é o caminho entre as visitas feitas
  const rodado = passado ? resumo(rota.filter((_, k) => itens[k] && (itens[k].estado === 'feita' || !!provaDe(itens[k].client))), []) : null;
  const naoForam = passado ? itens.filter((i) => i.estado !== 'feita' && !provaDe(i.client)).map((i) => i.client) : [];
  const comProva = passado ? itens.filter((i) => { const v = provaDe(i.client); return v && !v.declarada && v.distancia != null; }).length : 0;

  // ---- compromissos (reuniões e retornos do HubSpot e do app) na lista pelo horário ----
  const noPlano = useMemo(() => new Set(itens.map((i) => i.client.id)), [itens]);
  const compromissos = useMemo(() => compromissosDe(dia, noPlano), [dia, noPlano, tarefas, props.reunioes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- busca ----
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  useEffect(() => { const t = setTimeout(() => setTermo(busca.trim()), 250); return () => clearTimeout(t); }, [busca]);
  const achados = useClientSearch(termo);
  const linhasBusca = useMemo(() => {
    if (termo.length < 2) return [];
    const t = termo.toLowerCase();
    const casa = (c: Client) => [c.empresa, c.nome, c.bairro].some((x) => x && x.toLowerCase().includes(t));
    const vistos = new Set<string>();
    const out: Array<{ c: Client | null; g: LugarPerto | null; nome: string; onde: string }> = [];
    itens.forEach((i, k) => { if (casa(i.client)) { vistos.add(i.client.id); out.push({ c: i.client, g: null, nome: props.nomeDe(i.client), onde: `No dia · ${ordinal(k + 1)} parada` }); } });
    for (const x of props.sugestoes) {
      if (x.client && !vistos.has(x.client.id) && casa(x.client)) { vistos.add(x.client.id); out.push({ c: x.client, g: null, nome: x.nome, onde: `Sugestão · ${ROTULO_GRUPO[x.grupo].toLowerCase()}` }); }
      if (x.google && x.nome.toLowerCase().includes(t)) out.push({ c: null, g: x.google, nome: x.nome, onde: 'Google · fora da base' });
    }
    for (const c of achados.data ?? []) {
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      const meu = !!ownerHubspot && String(c.vendedor_id_hubspot ?? '') === String(ownerHubspot);
      out.push({ c, g: null, nome: props.nomeDe(c), onde: `${meu ? 'Carteira' : 'Base'}${c.bairro ? ` · ${c.bairro}` : ''}` });
    }
    return out.slice(0, 30);
  }, [termo, itens, props.sugestoes, achados.data, ownerHubspot]); // eslint-disable-line react-hooks/exhaustive-deps
  const abrirAchado = (l: (typeof linhasBusca)[number]) => {
    if (l.c) aoFocar(l.c);
    else if (l.g) props.aoPorGoogle(l.g);
    setBusca(''); setTermo('');
  };
  const campoBusca = useRef<TextInput>(null);

  // ---- foco: posição, ↑ ↓ e Esc ----
  const idxFoco = foco ? itens.findIndex((i) => i.client.id === foco.id) : -1;
  const estado = useRef({ itens, idxFoco, foco, aba, dia, busca, diasSemana });
  estado.current = { itens, idxFoco, foco, aba, dia, busca, diasSemana };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const aoTecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
      const st = estado.current;
      if (e.key === 'Escape') {
        if (digitando && st.busca) { setBusca(''); return; }
        if (st.foco) { aoFocar(null); return; }
        if (st.aba === 'sugestoes') { aoAba('plano'); return; }
        return;
      }
      if (digitando) return;
      // as setas só valem com o foco no painel (no mapa elas arrastam o mapa)
      const noPainel = !alvo || alvo === document.body || !!alvo.closest?.('[data-agenda-pc]');
      if (!noPainel) return;
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && st.foco && st.idxFoco >= 0) {
        e.preventDefault();
        const n = st.idxFoco + (e.key === 'ArrowDown' ? 1 : -1);
        if (n >= 0 && n < st.itens.length) aoFocar(st.itens[n].client);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const d = st.dia;
        let alvoDia = somaDias(d, e.key === 'ArrowRight' ? 1 : -1);
        while (dow(alvoDia) === 0 || dow(alvoDia) === 6) alvoDia = somaDias(alvoDia, e.key === 'ArrowRight' ? 1 : -1);
        if (alvoDia >= somaDias(segHoje, -7) && alvoDia <= somaDias(segHoje, 11)) aoDia(alvoDia);
      }
    };
    window.addEventListener('keydown', aoTecla);
    return () => window.removeEventListener('keydown', aoTecla);
  }, [segHoje]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- arrastar pela alça ----
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const soltar = (para: number) => {
    const de = arrastando;
    setArrastando(null); setSobre(null);
    if (de == null || de === para) return;
    const ids = itens.map((i) => i.client.id);
    const [m] = ids.splice(de, 1);
    ids.splice(para > de ? para - 1 : para, 0, m);
    props.aoOrdem(ids, `${props.nomeDe(itens[de].client)} foi para ${ordinal(ids.indexOf(m) + 1)}`);
  };

  // ---- dia vazio: os bairros da carteira ----
  const vazio = !carregando && !itens.length && !passado;
  const bairrosQ = useQuery({
    queryKey: ['bairros_da_carteira', ownerHubspot],
    enabled: vazio && !!ownerHubspot,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('bairro, latitude, longitude')
        .eq('vendedor_id_hubspot', ownerHubspot!).eq('status', 'lead').not('bairro', 'is', null).not('latitude', 'is', null).limit(3000);
      if (error) throw error;
      const m = new Map<string, { n: number; pontos: Ponto[] }>();
      for (const r of (data ?? []) as Array<{ bairro: string; latitude: number; longitude: number }>) {
        const b = r.bairro.trim();
        if (!b) continue;
        const x = m.get(b) ?? { n: 0, pontos: [] };
        x.n++; if (x.pontos.length < 60) x.pontos.push({ latitude: Number(r.latitude), longitude: Number(r.longitude) });
        m.set(b, x);
      }
      return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    },
  });

  // ---- sugestões com a melhor posição ----
  const sugestoesComPosicao = useMemo(() => props.sugestoes.map((x) => {
    const noDia = !!x.client && noPlano.has(x.client.id);
    const mp = melhorPosicao(rota, x.ponto);
    return { ...x, noDia, posDia: noDia && x.client ? itens.findIndex((i) => i.client.id === x.client!.id) + 1 : null, mp };
  }), [props.sugestoes, rota, noPlano, itens]);
  const textoPosicao = (x: (typeof sugestoesComPosicao)[number]) => {
    if (x.noDia) return `No dia como ${ordinal(x.posDia ?? 0)}`;
    if (!rota.length) return 'Começa o dia';
    const perto = x.mp.maisPerto != null && x.mp.mPerto != null ? `${kmTexto(x.mp.mPerto)} da parada ${x.mp.maisPerto + 1} · ` : '';
    return `${perto}entra como ${ordinal(x.mp.indice + 1)} · +${x.mp.minAMais - 20 > 0 ? x.mp.minAMais - 20 : 1} min de rua`;
  };
  const montar = (n: number) => {
    const ordem: GrupoSugestao[] = ['regua', 'alvo', 'queda'];
    const cands = sugestoesComPosicao.filter((x) => x.client && !x.noDia).sort((a, b) => ordem.indexOf(a.grupo) - ordem.indexOf(b.grupo));
    const vistos = new Set<string>();
    const escolhidos: Client[] = [];
    for (const x of cands) { if (escolhidos.length >= n) break; if (vistos.has(x.client!.id)) continue; vistos.add(x.client!.id); escolhidos.push(x.client!); }
    if (escolhidos.length) props.aoPor(escolhidos);
  };

  // ===== RECOLHIDO: o cartão pequeno por cima do mapa =====
  if (props.recolhido) {
    return (
      <View style={s.mini}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.miniTitulo} numberOfLines={1}>{tituloDoDia(dia, hoje)}</Text>
            <Text style={s.sub} numberOfLines={1}>{itens.length ? `${itens.length} ${itens.length === 1 ? 'parada' : 'paradas'} · ${kmTexto(res.km * 1000)}${res.inicio != null ? ` · ${hhmm(res.inicio)} → ${hhmm(res.fim!)}` : ''}` : 'Nada no dia ainda'}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={props.aoEsconder} style={s.botaoPeq}><Text style={s.botaoPeqTexto}>Mostrar painel</Text></Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {diasSemana.map((d) => (
            <Pressable key={d} accessibilityRole="button" onPress={() => aoDia(d)} style={[s.miniDia, d === dia && s.diaAtivo, d < hoje && { opacity: 0.6 }]}>
              <Text style={s.diaSemana}>{SEMANA[dow(d)]}</Text>
              <Text style={s.miniNum}>{d.slice(8, 10)}</Text>
            </Pressable>
          ))}
        </View>
        {ehHoje && itens.length > 0 && (
          <Pressable accessibilityRole="button" onPress={props.aoIrParaRua} style={s.botaoPrim}><Text style={s.botaoPrimTexto}>Ir para a rua</Text></Pressable>
        )}
      </View>
    );
  }

  // ===== uma linha da lista =====
  const linhaParada = (i: ItemPC, k: number) => {
    const h = hs[k];
    const c = i.client;
    const ctx = props.contextoDe(c);
    const v = passado ? provaDe(c) : null;
    const feita = i.estado === 'feita' || !!v;
    const proxima = ehHoje && !feita && itens.slice(0, k).every((x) => x.estado === 'feita');
    const destaque = props.hover === c.id || foco?.id === c.id;
    const semEtapa = !etapaOuTipo(c, ctx.etapa);
    const prox = itens[k + 1];
    const leg = prox ? perna(pontoDe(c), pontoDe(prox.client)) : null;
    const conflitoAqui = conf?.indice === k;
    const arrastavel = !passado && !i.compromisso;
    return (
      <div
        key={c.id}
        draggable={arrastavel}
        onDragStart={(e) => { setArrastando(k); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); } catch { /* ok */ } }}
        onDragOver={(e) => { if (arrastando != null) { e.preventDefault(); setSobre(k); } }}
        onDrop={(e) => { e.preventDefault(); soltar(k); }}
        onDragEnd={() => { setArrastando(null); setSobre(null); }}
        onMouseEnter={() => props.aoHover(c.id)}
        onMouseLeave={() => props.aoHover(null)}
        style={{ opacity: arrastando === k ? 0.4 : 1, borderTop: sobre === k && arrastando != null && arrastando !== k ? '2px solid var(--vermelho-acao)' : '2px solid transparent' }}
      >
        <Pressable accessibilityRole="button" accessibilityLabel={`${k + 1}ª parada: ${props.nomeDe(c)}`} onPress={() => aoFocar(c)}
          style={[s.linha, destaque && s.linhaDestaque, i.estado === 'entra' && s.linhaEntra, proxima && s.linhaProxima]}>
          {arrastavel ? <View style={s.alca}><IconMenu width={14} height={14} fill={cores.muted} /></View> : <View style={s.alca} />}
          <View style={[s.disco, { backgroundColor: feita && !passado ? 'var(--verde-acao)' : props.corDe(c) }, passado && !feita && { opacity: 0.45 }]}>
            <Text style={s.discoTexto}>{k + 1}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nome} numberOfLines={2}>{props.nomeDe(c)}</Text>
            <Text style={s.sub} numberOfLines={1}>
              <Text style={semEtapa ? { color: 'var(--ambar-texto)' } : null}>{etapaOuTipo(c, ctx.etapa) ?? 'sem etapa'}</Text>
              {' · '}
              <Text style={!c.bairro ? { color: 'var(--ambar-texto)' } : null}>{c.bairro ?? 'sem bairro no cadastro'}</Text>
              {i.estado === 'entra' ? <Text style={{ color: 'var(--vermelho-texto)', fontWeight: '700' }}>{' · a confirmar'}</Text> : null}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', minWidth: 62 }}>
            {passado ? (
              <>
                <Text style={s.hora}>{v ? v.hora : '—'}</Text>
                <Text style={[s.horaSub, v ? (v.declarada || v.distancia == null ? { color: 'var(--ambar-texto)' } : { color: 'var(--tint-green-text)' }) : { color: 'var(--text-faint)' }]}>
                  {v ? (v.declarada || v.distancia == null ? 'sem prova' : `GPS a ${Math.round(v.distancia)} m`) : 'não foi'}
                </Text>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {i.fixo ? <IconLock width={12} height={12} fill={conflitoAqui ? '#B45309' : cores.muted} /> : null}
                  <Text style={[s.hora, conflitoAqui && { color: 'var(--ambar-texto)' }]}>{i.fixo ?? (h ? hhmm(h.chega) : '')}</Text>
                </View>
                <Text style={s.horaSub}>{feita ? 'feita' : i.fixo ? (i.compromisso ? 'marcado' : 'fixado') : 'estimado'}</Text>
              </>
            )}
          </View>
          {passado && !v && i.estado !== 'feita' && (
            <Pressable accessibilityRole="button" onPress={() => props.aoRemarcar([c])} style={s.botaoPorPeq}><Text style={s.botaoPorTexto}>Remarcar</Text></Pressable>
          )}
        </Pressable>
        {leg && <Text style={s.perna}>{`${leg.min} min · ${kmTexto(leg.m)}`}</Text>}
      </div>
    );
  };

  const linhaCompromisso = (k: Compromisso) => (
    <View key={k.id} style={s.compromisso}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.nome} numberOfLines={2}>{`${k.tipo === 'reunião' ? 'Reunião' : k.tipo === 'retorno' ? 'Ligar' : 'Visita'} · ${k.nome ?? k.titulo ?? 'sem lead'}`}</Text>
        <Text style={s.sub} numberOfLines={1}>{[k.titulo && k.nome ? k.titulo : null, k.fonte === 'hubspot' ? 'HubSpot' : 'Agenda do app'].filter(Boolean).join(' · ')}</Text>
      </View>
      <Text style={s.hora}>{k.hora ?? 'sem hora'}</Text>
    </View>
  );

  // Paradas e compromissos intercalados pelo horário.
  const lista = (() => {
    const out: React.ReactNode[] = [];
    const ks = [...compromissos];
    itens.forEach((i, k) => {
      const t = hs[k]?.chega ?? 0;
      while (ks.length && (minDe(ks[0].hora) ?? 99999) <= t) out.push(linhaCompromisso(ks.shift()!));
      out.push(linhaParada(i, k));
    });
    for (const k of ks) out.push(linhaCompromisso(k));
    // soltar depois da última parada (arrastar para o fim)
    if (arrastando != null) {
      out.push(
        <div key="fim-da-lista" onDragOver={(e) => { e.preventDefault(); setSobre(itens.length); }} onDrop={(e) => { e.preventDefault(); soltar(itens.length); }}
          style={{ minHeight: 40, borderRadius: 12, border: sobre === itens.length ? '2px dashed var(--vermelho-acao)' : '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
          soltar aqui para ir por último
        </div>,
      );
    }
    return out;
  })();

  const grupos: GrupoSugestao[] = ['regua', 'alvo', 'queda', 'google'];
  const nSug = sugestoesComPosicao.filter((x) => !x.noDia).length;
  const titulo = tituloDoDia(dia, hoje);
  const resumoTexto = passado
    ? `${itens.filter((i) => i.estado === 'feita' || provaDe(i.client)).length} de ${itens.length} visitadas · ${comProva} com prova de GPS · ${kmTexto((rodado?.km ?? 0) * 1000)} rodados`
    : itens.length
      ? `${itens.length} ${itens.length === 1 ? 'parada' : 'paradas'} · meta ${meta} · ≈ ${duracao(res.minutos)} de rua · ${kmTexto(res.km * 1000)} · ${hhmm(res.inicio!)} → ${hhmm(res.fim!)}`
      : `Meta de ${meta} visitas · nada marcado ainda`;

  let corpo: React.ReactNode;
  if (termo.length >= 2) {
    corpo = (
      <View style={{ gap: 4 }}>
        <Text style={s.rotuloSecao}>{achados.isFetching ? 'BUSCANDO…' : `${linhasBusca.length} ${linhasBusca.length === 1 ? 'RESULTADO' : 'RESULTADOS'}`}</Text>
        {linhasBusca.map((l, k) => (
          <Pressable key={(l.c?.id ?? l.g?.placeId ?? '') + k} accessibilityRole="button" onPress={() => abrirAchado(l)} style={s.linhaBusca}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.nome} numberOfLines={2}>{l.nome}</Text>
              <Text style={s.sub} numberOfLines={1}>{l.onde}</Text>
            </View>
            <IconChevronRight width={14} height={14} fill={cores.muted} />
          </Pressable>
        ))}
        {!achados.isFetching && !linhasBusca.length && <Text style={s.sub}>Nada com esse nome, bairro ou CNPJ na sua base.</Text>}
      </View>
    );
  } else if (foco) {
    corpo = <CartaoFoco c={foco} item={idxFoco >= 0 ? itens[idxFoco] : null} numero={idxFoco >= 0 ? idxFoco + 1 : null} total={itens.length} chega={idxFoco >= 0 ? hs[idxFoco]?.chega ?? null : null} props={props} />;
  } else if (aba === 'sugestoes' && !passado) {
    corpo = (
      <View style={{ gap: 10 }}>
        <Text style={s.sub}>Perto do que já está no dia. Pôr encaixa no melhor lugar da rota; os horários se ajustam.</Text>
        {grupos.map((g) => {
          const doGrupo = sugestoesComPosicao.filter((x) => x.grupo === g);
          if (!doGrupo.length && !(g === 'google' && props.carregandoGoogle)) return null;
          return (
            <View key={g} style={{ gap: 4 }}>
              <Text style={s.rotuloSecao}>{`${ROTULO_GRUPO[g]} · ${doGrupo.length}`}</Text>
              {g === 'google' && props.carregandoGoogle && !doGrupo.length ? <ActivityIndicator style={{ marginVertical: 8 }} /> : null}
              {doGrupo.map((x) => (
                <div key={x.chave} onMouseEnter={() => props.aoHover(x.client?.id ?? x.chave)} onMouseLeave={() => props.aoHover(null)}>
                <View style={[s.linhaSug, props.hover === (x.client?.id ?? x.chave) && s.linhaDestaque]}>
                  <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => (x.client ? aoFocar(x.client) : x.google && props.aoPorGoogle(x.google))}>
                    <Text style={s.nome} numberOfLines={2}>{x.nome}</Text>
                    <Text style={s.sub} numberOfLines={1}>{x.sub}</Text>
                    <Text style={s.subFraco} numberOfLines={1}>{textoPosicao(x)}</Text>
                  </Pressable>
                  {x.noDia ? (
                    <Text style={s.noDia}>No dia</Text>
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Pôr ${x.nome} no dia`}
                      onPress={() => (x.client ? props.aoPor([x.client]) : x.google && props.aoPorGoogle(x.google))} style={s.botaoPorPeq}>
                      <Text style={s.botaoPorTexto}>Pôr</Text>
                    </Pressable>
                  )}
                </View>
                </div>
              ))}
            </View>
          );
        })}
        {!sugestoesComPosicao.length && !props.carregandoGoogle && (
          <Text style={s.sub}>Nenhuma sugestão nesta parte do mapa. Arraste o mapa até o bairro do dia.</Text>
        )}
      </View>
    );
  } else if (vazio) {
    const reguas = sugestoesComPosicao.filter((x) => x.grupo === 'regua').slice(0, 3);
    corpo = (
      <View style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={s.vazioTitulo}>{`${titulo} ainda está vazia`}</Text>
          <Text style={s.sub}>Escolha um bairro da sua carteira. O mapa vai até lá e mostra o que vale a visita.</Text>
        </View>
        <View style={s.bairros}>
          {bairrosQ.isLoading ? <ActivityIndicator /> : (bairrosQ.data ?? []).map(([b, x]) => (
            <Pressable key={b} accessibilityRole="button" onPress={() => props.aoBairro(b, x.pontos)} style={s.bairro}>
              <Text style={s.bairroNome} numberOfLines={1}>{b}</Text>
              <Text style={s.bairroN}>{x.n}</Text>
            </Pressable>
          ))}
        </View>
        {compromissos.length > 0 && (
          <View style={{ gap: 4 }}>
            <Text style={s.rotuloSecao}>JÁ MARCADO NESSE DIA</Text>
            {compromissos.map(linhaCompromisso)}
          </View>
        )}
        {reguas.length > 0 && (
          <View style={{ gap: 4 }}>
            <Text style={s.rotuloSecao}>OU COMECE PELOS QUE MAIS PRECISAM</Text>
            {reguas.map((x) => (
              <View key={x.chave} style={s.linhaSug}>
                <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => x.client && aoFocar(x.client)}>
                  <Text style={s.nome} numberOfLines={2}>{x.nome}</Text>
                  <Text style={s.sub} numberOfLines={1}>{x.sub}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => x.client && props.aoPor([x.client])} style={s.botaoPorPeq}><Text style={s.botaoPorTexto}>Pôr</Text></Pressable>
              </View>
            ))}
          </View>
        )}
        {nSug > 0 && (
          <Pressable accessibilityRole="button" onPress={() => montar(Math.max(1, meta))} style={s.botaoPrim}>
            <Text style={s.botaoPrimTexto}>{`Montar com ${Math.min(Math.max(1, meta), nSug)} sugestões`}</Text>
          </Pressable>
        )}
      </View>
    );
  } else {
    corpo = (
      <View style={{ gap: 2 }}>
        {carregando && !itens.length ? <ActivityIndicator style={{ marginVertical: 16 }} /> : lista}
      </View>
    );
  }

  const rodape = (() => {
    if (props.mudancas > 0) {
      return (
        <View style={s.rodape}>
          <Text style={[s.sub, { flex: 1 }]} numberOfLines={2}>{`${props.mudancas} ${props.mudancas === 1 ? 'mudança não confirmada' : 'mudanças não confirmadas'}`}</Text>
          <Pressable accessibilityRole="button" onPress={props.aoDescartar} disabled={props.confirmando} style={s.botaoSecPeq}><Text style={s.botaoSecTexto}>Descartar</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={props.aoConfirmar} disabled={props.confirmando} style={[s.botaoPrimPeq, props.confirmando && { opacity: 0.6 }]}>
            {props.confirmando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoPrimTexto}>Confirmar</Text>}
          </Pressable>
        </View>
      );
    }
    if (passado) {
      return naoForam.length ? (
        <View style={s.rodape}>
          <Text style={[s.sub, { flex: 1 }]}>{`${naoForam.length} ${naoForam.length === 1 ? 'ficou' : 'ficaram'} para trás`}</Text>
          <Pressable accessibilityRole="button" onPress={() => props.aoRemarcar(naoForam)} style={s.botaoPrimPeq}><Text style={s.botaoPrimTexto}>{`Remarcar ${naoForam.length}`}</Text></Pressable>
        </View>
      ) : null;
    }
    return (
      <View style={s.rodape}>
        <Pressable accessibilityRole="button" onPress={() => aoAba(aba === 'sugestoes' ? 'plano' : 'sugestoes')} style={s.botaoSecPeq}>
          <Text style={s.botaoSecTexto}>{aba === 'sugestoes' ? 'Voltar ao plano' : `Sugestões · ${nSug}`}</Text>
        </Pressable>
        {ehHoje && itens.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={props.aoIrParaRua} style={[s.botaoPrimPeq, { flex: 1 }]}><Text style={s.botaoPrimTexto}>Ir para a rua</Text></Pressable>
        ) : <View style={{ flex: 1 }} />}
      </View>
    );
  })();

  return (
    <View style={[s.painel, { width: props.largura }]} dataSet={{ agendaPc: '1' }}>
      <View style={s.cabeca}>
        <View style={s.buscaCaixa}>
          <IconSearch width={16} height={16} fill={cores.muted} />
          <TextInput
            ref={campoBusca}
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar lead, bairro ou CNPJ"
            placeholderTextColor="var(--text-faint)"
            style={s.buscaCampo}
            onSubmitEditing={() => { if (linhasBusca[0]) abrirAchado(linhasBusca[0]); }}
          />
          {busca ? <Pressable accessibilityRole="button" accessibilityLabel="Limpar a busca" onPress={() => setBusca('')}><IconClose width={14} height={14} fill={cores.muted} /></Pressable> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => { let d = hoje; while (dow(d) === 0 || dow(d) === 6) d = somaDias(d, 1); aoDia(d); }} style={s.botaoPeq}><Text style={s.botaoPeqTexto}>Hoje</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Esconder o painel" onPress={props.aoEsconder} style={s.botaoIcone}>
          <IconShrink width={16} height={16} fill={cores.muted} />
        </Pressable>
      </View>

      <View style={s.semanaTopo}>
        <Pressable accessibilityRole="button" accessibilityLabel="Semana anterior" disabled={offset <= -1} onPress={() => irSemana(offset - 1)} style={[s.seta, offset <= -1 && { opacity: 0.3 }]}>
          <IconChevronLeft width={16} height={16} fill={cores.muted} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.semanaRotulo}>{rotuloSemana}</Text>
          <Text style={s.subFraco}>{`${ddmm(diasSemana[0])} a ${ddmm(diasSemana[4])}`}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Próxima semana" disabled={offset >= 1} onPress={() => irSemana(offset + 1)} style={[s.seta, offset >= 1 && { opacity: 0.3 }]}>
          <IconChevronRight width={16} height={16} fill={cores.muted} />
        </Pressable>
      </View>
      <View style={s.faixa}>
        {diasSemana.map((d) => (
          <Pressable key={d} accessibilityRole="button" accessibilityLabel={tituloDoDia(d, hoje)} onPress={() => aoDia(d)}
            style={[s.dia, d === dia && s.diaAtivo, d < hoje && d !== dia && { opacity: 0.6 }]}>
            <Text style={[s.diaSemana, d === hoje && { color: 'var(--vermelho-texto)' }]}>{SEMANA[dow(d)]}</Text>
            <Text style={s.diaNumero}>{d.slice(8, 10)}</Text>
            <Text style={s.diaRotulo} numberOfLines={1}>{rotuloChip(d)}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.diaCabeca}>
        <Text style={s.diaTitulo}>{titulo}</Text>
        <Text style={s.proposito} numberOfLines={1}>{[proposito ? PROPOSITOS[proposito] ?? proposito : null, bairroDoDia].filter(Boolean).join(' · ') || (passado ? 'Dia passado · só leitura' : 'Sem propósito no Planejamento')}</Text>
        <Text style={s.sub}>{resumoTexto}</Text>
      </View>

      {!passado && !foco && termo.length < 2 && (
        <View style={s.abas}>
          {(['plano', 'sugestoes'] as const).map((a) => (
            <Pressable key={a} accessibilityRole="button" onPress={() => aoAba(a)} style={[s.aba, aba === a && s.abaAtiva]}>
              <Text style={[s.abaTexto, aba === a && s.abaTextoAtivo]}>{a === 'plano' ? 'Plano' : 'Sugestões'}</Text>
              <Text style={s.abaN}>{a === 'plano' ? itens.length : nSug}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {conf && !foco && termo.length < 2 && (
        <View style={s.conflito}>
          <IconWarning width={16} height={16} fill="#B45309" />
          <Text style={s.conflitoTexto}>
            {`${props.nomeDe(itens[conf.indice].client)} tem horário às ${itens[conf.indice].fixo}: pela ordem ${conf.atraso ? `chega ${conf.atraso} min atrasado` : `espera ${conf.espera} min`}.`}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => props.aoOrdem(encaixar(rota, inicio), 'Rota refeita pelo caminho')} style={s.botaoEncaixar}>
            <Text style={s.botaoEncaixarTexto}>Encaixar</Text>
          </Pressable>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.conteudo}>{corpo}</ScrollView>
      {rodape}
    </View>
  );
}

/** As camadas do mapa da Agenda (topo do mapa). Plano sempre; o resto liga e desliga. */
export type CamadaAgenda = 'carteira' | 'regua' | 'alvo' | 'queda' | 'google';
export function CamadasAgenda({ ativas, contagem, nPlano, aoAlternar }: {
  ativas: Set<CamadaAgenda>; contagem: Record<CamadaAgenda, number>; nPlano: number; aoAlternar: (c: CamadaAgenda) => void;
}) {
  const itens: { id: CamadaAgenda; rotulo: string }[] = [
    { id: 'carteira', rotulo: 'Minha carteira' }, { id: 'regua', rotulo: 'Régua estourada' }, { id: 'alvo', rotulo: 'Contas-alvo' },
    { id: 'queda', rotulo: 'Em queda' }, { id: 'google', rotulo: 'Google' },
  ];
  return (
    <View style={s.camadas} pointerEvents="box-none">
      <View style={[s.camada, s.camadaFixa]}><Text style={s.camadaTexto}>Plano</Text><Text style={s.camadaN}>{nPlano}</Text></View>
      {itens.map((x) => {
        const on = ativas.has(x.id);
        return (
          <Pressable key={x.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => aoAlternar(x.id)} style={[s.camada, on && s.camadaOn]}>
            <Text style={[s.camadaTexto, on && s.camadaTextoOn]}>{x.rotulo}</Text>
            <Text style={[s.camadaN, on && s.camadaTextoOn]}>{contagem[x.id]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  painel: { height: '100%', borderRightWidth: 1, borderRightColor: 'var(--border)', backgroundColor: 'var(--bg)' },
  cabeca: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 12 },
  buscaCaixa: { flex: 1, minWidth: 0, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  buscaCampo: { flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text)', outlineStyle: 'none' } as never,
  botaoPeq: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  botaoPeqTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  botaoIcone: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', alignItems: 'center', justifyContent: 'center' },
  semanaTopo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10 },
  seta: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  semanaRotulo: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  faixa: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 6 },
  dia: { flex: 1, minWidth: 0, minHeight: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 2, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  diaAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)', borderWidth: 1.5 },
  diaSemana: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: 'var(--text-muted)' },
  diaNumero: { fontSize: 17, fontWeight: '800', color: 'var(--text)' },
  diaRotulo: { fontSize: 10, color: 'var(--text-muted)', maxWidth: '100%' },
  diaCabeca: { paddingHorizontal: 14, paddingTop: 12, gap: 2 },
  diaTitulo: { fontSize: 18, fontWeight: '800', color: 'var(--text)' },
  proposito: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  abas: { flexDirection: 'row', gap: 4, marginHorizontal: 14, marginTop: 10, padding: 4, borderRadius: 12, backgroundColor: 'var(--surface-2)' },
  aba: { flex: 1, minHeight: 36, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  abaAtiva: { backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  abaTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text-muted)' },
  abaTextoAtivo: { color: 'var(--text)' },
  abaN: { fontSize: 12, fontWeight: '700', color: 'var(--text-faint)' },
  conflito: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: 'var(--tint-amber)' },
  conflitoTexto: { flex: 1, fontSize: 12, lineHeight: 17, color: 'var(--tint-amber-text)', fontWeight: '600' },
  botaoEncaixar: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'var(--surface)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'var(--border)' },
  botaoEncaixarTexto: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  conteudo: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 16, gap: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  linhaDestaque: { backgroundColor: 'var(--surface)', borderColor: 'var(--border)' },
  linhaEntra: { borderColor: 'var(--vermelho-acao)', borderStyle: 'dashed' },
  linhaProxima: { backgroundColor: 'var(--tint-red)' },
  alca: { width: 16, alignItems: 'center', cursor: 'grab' } as never,
  disco: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  discoTexto: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  nome: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 12, lineHeight: 17, color: 'var(--text-muted)' },
  subFraco: { fontSize: 12, lineHeight: 17, color: 'var(--text-faint)' },
  hora: { fontSize: 14, fontWeight: '800', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  horaSub: { fontSize: 11, color: 'var(--text-faint)' },
  perna: { fontSize: 11, color: 'var(--text-faint)', paddingLeft: 66, paddingVertical: 2 },
  compromisso: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border)', marginVertical: 2 },
  rotuloSecao: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--text-faint)', marginTop: 6 },
  linhaSug: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border-soft)', backgroundColor: 'var(--surface)' },
  linhaBusca: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border-soft)', backgroundColor: 'var(--surface)' },
  noDia: { fontSize: 12, fontWeight: '700', color: 'var(--tint-green-text)' },
  botaoPorPeq: { minHeight: 36, minWidth: 56, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  botaoPor: { backgroundColor: 'var(--vermelho-acao)', borderColor: 'var(--vermelho-acao)' },
  botaoPorTexto: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  rodape: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  botaoSecPeq: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  botaoPrimPeq: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  botaoPrim: { minHeight: 48, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  botaoPrimTexto: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  botaoSec: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  botaoSecTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  botaoLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)' },
  botaoLinkTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  focoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingRight: 8 },
  voltarTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text-muted)' },
  focoPos: { fontSize: 12, fontWeight: '700', color: 'var(--text-faint)' },
  focoNome: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: 'var(--text)' },
  segs8: { flexDirection: 'row', gap: 4 },
  seg8: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'var(--border)' },
  grade2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  campo: { width: '48%', flexGrow: 1, padding: 10, gap: 2, borderRadius: 10, backgroundColor: 'var(--surface-2)' },
  campoRotulo: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: 'var(--text-faint)', textTransform: 'uppercase' },
  campoValor: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: 'var(--text)' },
  caixaHora: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)' },
  horaGrande: { fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  chipHora: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)' },
  chipHoraTexto: { fontSize: 14, fontWeight: '800', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  caixa: { padding: 12, gap: 6, borderRadius: 12, backgroundColor: 'var(--surface-2)' },
  linhaMini: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  nomeMini: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  vazioTitulo: { fontSize: 16, fontWeight: '800', color: 'var(--text)' },
  bairros: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bairro: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  bairroNome: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  bairroN: { fontSize: 12, fontWeight: '700', color: 'var(--text-faint)' },
  mini: { width: 320, padding: 12, gap: 10, borderRadius: 16, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16 },
  miniTitulo: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  miniDia: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'var(--border)' },
  miniNum: { fontSize: 14, fontWeight: '800', color: 'var(--text)' },
  camadas: { position: 'absolute', top: 12, left: 12, right: 12, zIndex: 55, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  camada: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  camadaFixa: { borderColor: 'var(--vermelho-acao)' },
  camadaOn: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  camadaTexto: { fontSize: 12, fontWeight: '700', color: 'var(--text)' },
  camadaTextoOn: { color: 'var(--bg)' },
  camadaN: { fontSize: 11, fontWeight: '700', color: 'var(--text-faint)' },
});
