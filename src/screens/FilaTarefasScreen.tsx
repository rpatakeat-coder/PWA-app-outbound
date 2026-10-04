// Aba Tarefas · "a fila do dinheiro" (docs/10 §1, handoff de 22/10 — 04/10/2026).
//
// A Agenda responde QUANDO e ONDE; esta aba responde QUAL NEGÓCIO PRECISA DE MIM AGORA.
// Um card por negócio, na ordem valor × urgência, vindo pronto do servidor (Edge Function
// fila-tarefas, regra em supabase/functions/_compartilhado/filaDoDinheiro.ts). Resolver
// em 3 toques sem sair da lista: verbo → como foi → Salvar. A gravação é a de sempre
// (concluirTarefa: 5 s de Desfazer, fila sem sinal); Sem interesse vai para Perdido pela
// porta única (op mudar-etapa, o mesmo caminho do kanban).
//
// O que saiu daqui (docs/10 §1.1): a lista por data, "Sugestões do app" e a lista do CRM
// que só abria o lead. Ficou o "Do seu 1:1" (acordos do PDI), que a especificação não tirou.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Linking, Modal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { Toast } from '../components/Toast';
import { IconCalendar, IconCall, IconCheck, IconClose, IconWhatsapp, IconClipboardCheck, IconLocation, useIconColors } from '../components/icons';
import { useLayout } from '../hooks/useLayout';
import { useMeuPdi } from '../hooks/useMeuPdi';
import FolhaRanking, { SeloPosicao } from './FolhaRanking';
import { concluirComDesfazer } from '../utils/concluirTarefa';
import { gravarContato } from '../utils/contatoDeCampo';
import { ehErroDeRede, enfileirar, novoAcaoId } from '../utils/filaOffline';
import { ehRecusa, negocioAcao } from '../utils/negocioAcao';
import { ehDiaUtil, proximoDiaUtil } from '../../supabase/functions/_compartilhado/filaDoDinheiro';
import {
  COMO_FOI_FILA, DIAS_FILA, MOTIVOS_SEM_INTERESSE, dataDoChip, diaCurto, diasSugeridos, fraseDaVolta, notaDaFila,
  pedidoDaVolta, rotuloComoFoi, textoDoSalvar, type ComoFoiFila,
} from '../utils/registroDaFila';

// ---- o que o servidor devolve ---------------------------------------------------------
export type CardDaFila = {
  dealId: string; clientId: string | null; grupo: 'agora' | 'proteger' | 'destravar' | 'reativar';
  motivo: string; porque: string; verbo: 'Ligar' | 'Visitar' | 'WhatsApp' | 'Registrar';
  pessoa: string | null; papel: string | null; negocio: string; etapaId: string; temperatura: number | null;
  mrr: number | null; ultimoContato: string | null; ultimoContatoTexto: string; contatos: number;
  prazo: string | null; prazoTexto: string; venceu: boolean; agendaHoje: string | null; temTelefone: boolean;
  telefone: string | null; tarefaId: string | null; presencial: boolean; lat: number | null; lng: number | null;
  titulo: string;
};
type RespostaFila = {
  itens: CardDaFila[]; grupos: Array<{ id: CardDaFila['grupo']; rotulo: string }>; mrrEmJogo: number;
  hoje: string; feriados: string[]; semMedicao?: string;
};
type Feita = { dealId: string; hora: string; negocio: string; resultado: string; volta: string | null; perdido?: string | null };

// Cores de etapa são DADO (docs/10: o STAGE_COLORS do Meu funil) — não cromo.
const ETAPA: Record<string, { rotulo: string; cor: string }> = {
  '1395880469': { rotulo: 'Prospecção', cor: '#7A8494' },
  '1396005401': { rotulo: 'Visita', cor: '#E51A31' },
  '1395880470': { rotulo: 'Diagnóstico', cor: '#B07C1F' },
  '1395880471': { rotulo: 'Demo/Proposta', cor: '#8E3B5C' },
  '1395880472': { rotulo: 'Negociação', cor: '#2B3440' },
  '1395880473': { rotulo: 'Ag. Pagamento', cor: '#1E9E7B' },
};
const PERDIDO = '1396006164';
const corDaTemp = (t: number | null) => (t == null ? 'var(--text-faint)' : t >= 70 ? 'var(--vermelho-acao)' : t >= 55 ? 'var(--tint-amber-text)' : 'var(--tint-blue-text)');
const soDigitos = (t: string) => t.replace(/\D+/g, '');
const mil = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')} mil` : `R$ ${Math.round(v)}`);
const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const agoraHHMM = () => { const b = new Date(Date.now() - 3 * 3600000); return `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`; };
const reduzirMovimento = () => { try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** A busca da fila. Exportada: o App lê o mesmo cache para o cabeçalho e o selo da aba. */
export async function buscarFila(): Promise<RespostaFila> {
  const { data, error } = await supabase.functions.invoke('fila-tarefas', { body: {} });
  if (error) throw error;
  return data as RespostaFila;
}
function useFila() {
  return useQuery<RespostaFila>({
    queryKey: ['fila_tarefas'],
    staleTime: 60_000,
    placeholderData: (anterior) => anterior,
    queryFn: buscarFila,
  });
}

// Feitas hoje ficam no aparelho (por dia): é a lista curta da sessão, com Desfazer na janela.
function useFeitas(hoje: string) {
  const chave = `fila-feitas-${hoje}`;
  const [feitas, setFeitas] = useState<Feita[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(chave) ?? '[]') as Feita[]; } catch { return []; }
  });
  const gravar = (f: Feita[]) => { setFeitas(f); try { window.localStorage.setItem(chave, JSON.stringify(f)); } catch { /* sem armazenamento */ } };
  return {
    feitas,
    somar: (f: Feita) => gravar([f, ...feitas.filter((x) => x.dealId !== f.dealId)]),
    tirar: (dealId: string) => gravar(feitas.filter((x) => x.dealId !== dealId)),
  };
}

// ---- anel do dia (44 px no topo, 112 px na fila zerada) ------------------------------
function Anel({ feitas, total, tamanho = 44, zerada = false }: { feitas: number; total: number; tamanho?: number; zerada?: boolean }) {
  const p = total > 0 ? feitas / total : 0;
  const r = tamanho / 2 - (tamanho > 60 ? 5 : 3);
  const c = 2 * Math.PI * r;
  const cor = zerada ? 'var(--verde-acao)' : 'var(--vermelho-acao)';
  if (Platform.OS !== 'web') return <View style={{ width: tamanho, height: tamanho }} />;
  return (
    <View style={{ width: tamanho, height: tamanho, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${feitas} feitas de ${total}`}>
      {React.createElement('svg', { width: tamanho, height: tamanho, style: { position: 'absolute', transform: 'rotate(-90deg)' } },
        React.createElement('circle', { cx: tamanho / 2, cy: tamanho / 2, r, fill: 'none', stroke: 'var(--border)', strokeWidth: tamanho > 60 ? 6 : 3 }),
        React.createElement('circle', { cx: tamanho / 2, cy: tamanho / 2, r, fill: 'none', stroke: cor, strokeWidth: tamanho > 60 ? 6 : 3, strokeDasharray: `${c * (zerada ? 1 : p)} ${c}`, strokeLinecap: 'round' }))}
      {zerada && tamanho > 60
        ? <IconCheck width={44} height={44} fill="var(--verde-acao)" />
        : <Text style={{ fontSize: tamanho > 60 ? 28 : 14, fontWeight: '700', color: 'var(--text)' }}>{feitas}</Text>}
    </View>
  );
}

// ---- registro dentro do card (toques 2 e 3) ---------------------------------------------
type DadosRegistro = { comoFoi: ComoFoiFila; volta: string | null; motivo: string | null; detalhe: string };

function RegistroInline({ item, hoje, feriados, grande = false, discouEm, aoSalvar, aoSair }: {
  item: CardDaFila; hoje: string; feriados: string[]; grande?: boolean; discouEm: string | null;
  aoSalvar: (d: DadosRegistro) => void; aoSair: () => void;
}) {
  const [comoFoi, setComoFoi] = useState<ComoFoiFila | null>(null);
  const [dias, setDias] = useState<number | null>(null);
  const [outroDia, setOutroDia] = useState(false);
  const [volta, setVolta] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const algoMarcado = !!comoFoi;
  // O X do card e o verbo de outro card perguntam aqui se podem fechar (avisa, nunca trava).
  const marcadoRef = useRef(false);
  marcadoRef.current = algoMarcado;
  useEffect(() => {
    const fn = () => { if (marcadoRef.current) { setConfirmar(true); return false; } return true; };
    pedidoDeSaidaAtual = fn;
    return () => { if (pedidoDeSaidaAtual === fn) pedidoDeSaidaAtual = null; };
  }, []);
  const salvar = textoDoSalvar({ comoFoi, volta, outroDia, motivo, detalhe });
  const alturaChip = grande ? 52 : 44;

  const escolherComoFoi = (c: ComoFoiFila) => {
    setComoFoi(c); setConfirmar(false);
    const sug = diasSugeridos(c);
    setOutroDia(false); setMotivo(null); setDetalhe('');
    if (sug) { setDias(sug); setVolta(dataDoChip(hoje, sug, feriados)); } else { setDias(null); setVolta(null); }
  };
  const chip = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void, largo = false) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={aoTocar}
      style={[s.chipRegistro, { minHeight: alturaChip }, largo && s.chipLargo, ativo && s.chipRegistroAtivo]}>
      <Text style={[s.chipRegistroTexto, ativo && s.chipRegistroTextoAtivo]} numberOfLines={2}>{rotulo}</Text>
    </Pressable>
  );

  // calendário de 3 semanas (seg–sex); hoje, passado e feriado bloqueados
  const semanas = useMemo(() => {
    const t = new Date(hoje + 'T12:00:00Z'); const w = t.getUTCDay();
    t.setUTCDate(t.getUTCDate() - ((w + 6) % 7));
    const linhas: string[][] = [];
    for (let s = 0; s < 3; s++) {
      const l: string[] = [];
      for (let d = 0; d < 5; d++) { const x = new Date(t); x.setUTCDate(t.getUTCDate() + s * 7 + d); l.push(x.toISOString().slice(0, 10)); }
      linhas.push(l);
    }
    return linhas;
  }, [hoje]);

  return (
    <View style={s.registro}>
      {!!discouEm && <Text style={s.discou}><Text style={{ color: 'var(--verde-acao)' }}>● </Text>{discouEm}</Text>}
      <Text style={s.rotuloSecao}>COMO FOI?</Text>
      <View style={s.grade2}>{COMO_FOI_FILA.map((c) => chip(c.id, c.rotulo, comoFoi === c.id, () => escolherComoFoi(c.id), true))}</View>

      {comoFoi === 'sem_interesse' ? (
        <>
          <Text style={s.rotuloSecao}>MOTIVO</Text>
          <View style={s.linhaChips}>{MOTIVOS_SEM_INTERESSE.map((m) => chip(m, m, motivo === m, () => setMotivo(m)))}</View>
          {motivo === 'Outros' && (
            <TextInput value={detalhe} onChangeText={setDetalhe} placeholder="O que pesou (obrigatório)" placeholderTextColor="var(--text-faint)" style={s.campoTexto} maxLength={200} />
          )}
          <Text style={s.ajuda}>O negócio vai para Perdido com o motivo, sem próximo passo.</Text>
        </>
      ) : comoFoi ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={s.rotuloSecao}>PRÓXIMO PASSO</Text>
            <Text style={s.ajudaMiuda}>dias úteis</Text>
          </View>
          <View style={s.linhaChips}>
            {DIAS_FILA.map((d) => d.dias != null
              ? chip(String(d.dias), d.rotulo, !outroDia && dias === d.dias, () => { setOutroDia(false); setDias(d.dias); setVolta(dataDoChip(hoje, d.dias!, feriados)); })
              : chip('outro', d.rotulo, outroDia, () => { setOutroDia(true); setDias(null); setVolta(null); }))}
          </View>
          {outroDia && (
            <View style={s.calendario}>
              <View style={s.calLinha}>{['seg', 'ter', 'qua', 'qui', 'sex'].map((d) => <Text key={d} style={s.calCab}>{d}</Text>)}</View>
              {semanas.map((l, i) => (
                <View key={i} style={s.calLinha}>
                  {l.map((d) => {
                    const bloqueado = d <= hoje || !ehDiaUtil(d, feriados);
                    const ativo = volta === d;
                    return (
                      <Pressable key={d} disabled={bloqueado} accessibilityRole="button" accessibilityState={{ disabled: bloqueado, selected: ativo }}
                        accessibilityLabel={`${d.slice(8, 10)}/${d.slice(5, 7)}${feriados.includes(d) ? ' feriado' : ''}`}
                        onPress={() => setVolta(d)} style={[s.calDia, bloqueado && s.calDiaBloq, ativo && s.chipRegistroAtivo]}>
                        <Text style={[s.calDiaTexto, bloqueado && { color: 'var(--text-faint)' }, ativo && s.chipRegistroTextoAtivo]}>{Number(d.slice(8, 10))}</Text>
                        {feriados.includes(d) && <Text style={s.calFeriado}>feriado</Text>}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
          {!!volta && (() => {
            const f = fraseDaVolta(hoje, volta, feriados);
            return (
              <View style={{ alignItems: 'center', gap: 2, paddingVertical: 4 }}>
                <Text style={[s.fraseVolta, grande && { fontSize: 19 }]}>{f.frase}</Text>
                <Text style={s.ajudaMiuda}>{f.pulo}</Text>
              </View>
            );
          })()}
        </>
      ) : null}

      <Pressable accessibilityRole="button" disabled={!salvar.pode} onPress={() => comoFoi && aoSalvar({ comoFoi, volta, motivo, detalhe })}
        style={[s.salvar, { minHeight: grande ? 56 : 50 }, !salvar.pode && s.salvarFalta]}>
        <Text style={[s.salvarTexto, !salvar.pode && s.salvarFaltaTexto]}>{salvar.texto}</Text>
      </Pressable>

      {confirmar && (
        <View style={s.avisoSair}>
          <Text style={s.avisoSairTexto}>Sair sem salvar? O que você marcou se perde.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => setConfirmar(false)}><Text style={s.botaoSecTexto}>Continuar</Text></Pressable>
            <Pressable accessibilityRole="button" style={s.botaoSec} onPress={aoSair}><Text style={s.botaoSecTexto}>Sair sem salvar</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
// O X do card (e o verbo de outro card) pergunta ao registro aberto se pode sair.
let pedidoDeSaidaAtual: (() => boolean) | null = null;
const podeSair = () => (pedidoDeSaidaAtual ? pedidoDeSaidaAtual() : true);

// ---- o card ----------------------------------------------------------------------------
function CardFila({ item, aberto, selecionado, aoVerbo, aoFechar, aoAdiar, aoSelecionar, children }: {
  item: CardDaFila; aberto: boolean; selecionado?: boolean; aoVerbo: () => void; aoFechar: () => void; aoAdiar: () => void;
  aoSelecionar?: () => void; children?: React.ReactNode;
}) {
  const cores = useIconColors();
  const etapa = ETAPA[item.etapaId] ?? { rotulo: 'Etapa', cor: 'var(--text-faint)' };
  const x = useRef(new Animated.Value(0)).current;
  const [lado, setLado] = useState<0 | 1 | -1>(0);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => !aberto && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => { x.setValue(g.dx); setLado(g.dx > 0 ? 1 : g.dx < 0 ? -1 : 0); },
    onPanResponderRelease: (_e, g) => {
      const volta = () => { Animated.timing(x, { toValue: 0, duration: 180, useNativeDriver: false }).start(); setLado(0); };
      if (g.dx > 90) { volta(); aoVerbo(); return; }
      if (g.dx < -90) {
        if (reduzirMovimento()) { aoAdiar(); return; }
        Animated.timing(x, { toValue: -480, duration: 220, useNativeDriver: false }).start(() => aoAdiar());
        return;
      }
      volta();
    },
    onPanResponderTerminate: () => { Animated.timing(x, { toValue: 0, duration: 180, useNativeDriver: false }).start(); setLado(0); },
  }), [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const corVerbo = item.verbo === 'WhatsApp' ? 'var(--whatsapp)' : 'var(--vermelho-acao)';
  const Icone = item.verbo === 'WhatsApp' ? IconWhatsapp : item.verbo === 'Registrar' ? IconClipboardCheck : item.verbo === 'Visitar' ? IconLocation : IconCall;
  return (
    <View style={s.cardCaixa}>
      {lado !== 0 && !aberto && (
        <View style={[s.fundoGesto, { backgroundColor: lado > 0 ? 'var(--tint-green)' : 'var(--tint-amber)', alignItems: lado > 0 ? 'flex-start' : 'flex-end' }]}>
          <Text style={[s.fundoGestoTexto, { color: lado > 0 ? 'var(--tint-green-text)' : 'var(--tint-amber-text)' }]}>{lado > 0 ? 'Registrar' : 'Adiar para amanhã'}</Text>
        </View>
      )}
      <Animated.View {...pan.panHandlers} style={[s.card, aberto && s.cardAberto, selecionado && s.cardSelecionado, { transform: [{ translateX: x }] }]}>
        <Pressable onPress={aoSelecionar} disabled={!aoSelecionar} style={{ gap: 3 }} accessibilityRole={aoSelecionar ? 'button' : undefined}>
          <View style={s.cardTopo}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={s.cardTitulo} numberOfLines={1}>{item.titulo}</Text>
              <View style={s.cardLinha2}>
                <Text style={s.cardNegocio} numberOfLines={1}>{item.negocio}</Text>
                <View style={s.pilulaEtapa}><View style={[s.ponto, { backgroundColor: etapa.cor }]} /><Text style={s.pilulaTexto} numberOfLines={1}>{etapa.rotulo}</Text></View>
                {item.temperatura != null && <View style={s.temp}><View style={[s.ponto, { backgroundColor: corDaTemp(item.temperatura) }]} /><Text style={s.tempTexto}>{Math.round(item.temperatura)}</Text></View>}
              </View>
              <Text style={s.cardPorque} numberOfLines={1}>{item.porque}</Text>
            </View>
            {aberto ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.botaoX}>
                <IconClose width={20} height={20} fill={cores.onSurface} />
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={`${item.verbo}: ${item.negocio}`} onPress={aoVerbo} style={[s.botaoVerbo, { backgroundColor: corVerbo }]}>
                <Icone width={18} height={18} fill="#FFFFFF" />
                <Text style={s.botaoVerboTexto}>{item.verbo}</Text>
              </Pressable>
            )}
          </View>
          <View style={s.rodape}>
            <Text style={s.rodapeTexto} numberOfLines={1}>{item.ultimoContatoTexto}</Text>
            <View style={s.segmentos}>{[0, 1, 2, 3].map((i) => <View key={i} style={[s.segmento, i < item.contatos && { backgroundColor: item.contatos >= 4 ? 'var(--verde-acao)' : 'var(--text-muted)' }]} />)}</View>
            <Text style={s.rodapeFixo}>{`${item.contatos} de 4`}</Text>
            {!item.temTelefone && (item.verbo === 'Visitar') ? <Text style={[s.rodapeFixo, { color: 'var(--ambar-texto)' }]} numberOfLines={1}>sem telefone no CRM</Text>
              : item.agendaHoje ? (
                <View style={s.seloAgenda}><IconCalendar width={12} height={12} fill="var(--tint-green-text)" /><Text style={s.seloAgendaTexto}>{`hoje ${item.agendaHoje}`}</Text></View>
              ) : <Text style={[s.rodapeFixo, s.prazo, item.venceu && { color: 'var(--vermelho-texto)' }]}>{item.prazoTexto}</Text>}
          </View>
        </Pressable>
        {aberto && children}
      </Animated.View>
    </View>
  );
}

// ---- a tela -----------------------------------------------------------------------------
type Props = {
  ownerId: string | null;
  aoAbrirLead: (clientId: string) => void;
  aoPosicionar?: (dealId: string, nome: string) => void;
  aoRegistrarVisita: (clientId: string) => void;
  /** GPS atual; "Perto de mim" = até 1 km (D13, Julyan 04/10/26). */
  posicao: { latitude: number; longitude: number } | null;
};
const PERTO_M = 1000;
function metros(a: { latitude: number; longitude: number }, lat: number, lng: number) {
  const r = 6371000, rad = Math.PI / 180;
  const dLat = (lat - a.latitude) * rad, dLng = (lng - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
type Filtro = 'tudo' | 'ligar' | 'visitar' | 'whatsapp' | 'perto';

export default function FilaTarefasScreen({ ownerId, aoAbrirLead, aoPosicionar, aoRegistrarVisita, posicao }: Props) {
  const layout = useLayout();
  const queryClient = useQueryClient();
  const q = useFila();
  const hoje = q.data?.hoje ?? hojeBRT();
  const feriados = q.data?.feriados ?? [];
  const { feitas, somar, tirar } = useFeitas(hoje);
  const [escondidos, setEscondidos] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [discou, setDiscou] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [aba, setAba] = useState<'fila' | 'feitas'>('fila');
  const [foco, setFoco] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [pulso, setPulso] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const { pdi, marcar: marcarAcordo } = useMeuPdi(true);
  const [rankingAberto, setRankingAberto] = useState(false);
  // Contrato fechado hoje: o cartão verde no topo da fila (docs/10 §2.6 D). Do livro de pontos.
  const contratosHoje = useQuery<Array<{ negocio_id: string; valor: number | null; ref_em: string }>>({
    queryKey: ['contratos_hoje', ownerId],
    enabled: !!ownerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 24 * 3600000).toISOString();
      const { data } = await supabase.from('pontos_eventos').select('negocio_id, valor, ref_em').eq('tipo', 'contrato').eq('owner_id', ownerId!).gte('ref_em', desde);
      return (data ?? []) as Array<{ negocio_id: string; valor: number | null; ref_em: string }>;
    },
  });
  const acordos = (pdi?.compromissos ?? []).filter((c) => c.estado !== 'validado');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  // o que o servidor já não manda (gravou e a fila recarregou) sai de "escondidos"
  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(q.data.itens.map((i) => i.dealId));
    setEscondidos((e) => new Set([...e].filter((d) => ids.has(d))));
  }, [q.data]);

  const fila = useMemo(() => (q.data?.itens ?? []).filter((i) => !escondidos.has(i.dealId)), [q.data, escondidos]);
  const passa = (i: CardDaFila, f: Filtro) => f === 'tudo' || (f === 'ligar' && i.verbo === 'Ligar') || (f === 'visitar' && (i.verbo === 'Visitar' || i.verbo === 'Registrar'))
    || (f === 'whatsapp' && i.verbo === 'WhatsApp') || (f === 'perto' && !!posicao && i.lat != null && i.lng != null && metros(posicao, i.lat, i.lng) <= PERTO_M);
  const visiveis = fila.filter((i) => passa(i, filtro));
  const contagem = (f: Filtro) => fila.filter((i) => passa(i, f)).length;
  const mrrEmJogo = fila.reduce((acc, i) => acc + (i.mrr ?? 0), 0);
  const zerada = !!q.data && !q.data.semMedicao && fila.length === 0;
  const totalDia = feitas.length + fila.length;
  const doSelecionado = layout.ehDesktop ? (fila.find((i) => i.dealId === selecionado) ?? fila[0] ?? null) : null;

  // fila zerada: grava o dia (conquista "Fila zerada 5 dias"), uma vez por dia
  useEffect(() => {
    if (!zerada) return;
    const chave = `fila-zerada-gravada-${hoje}`;
    try { if (window.localStorage.getItem(chave)) return; window.localStorage.setItem(chave, '1'); } catch { /* sem armazenamento */ }
    void supabase.rpc('registrar_fila_zerada');
  }, [zerada, hoje]);

  const pulsar = () => { setPulso(true); setTimeout(() => setPulso(false), 450); };
  const esconder = (d: string) => setEscondidos((e) => new Set(e).add(d));
  const mostrar = (d: string) => setEscondidos((e) => { const n = new Set(e); n.delete(d); return n; });

  function tocarVerbo(i: CardDaFila) {
    if (aberto && aberto !== i.dealId && !podeSair()) return;
    setSelecionado(i.dealId);
    if (i.verbo === 'Registrar') { if (i.clientId) aoRegistrarVisita(i.clientId); return; }
    if (i.verbo === 'Visitar') {
      if (i.clientId) aoAbrirLead(i.clientId); else aoPosicionar?.(i.dealId, i.negocio);
      return;
    }
    const fone = i.telefone ? soDigitos(i.telefone) : '';
    const com55 = fone.length <= 11 ? `55${fone}` : fone;
    if (fone) {
      if (i.verbo === 'WhatsApp') void Linking.openURL(`https://wa.me/${com55}`);
      else void Linking.openURL(`tel:+${com55}`);
      setDiscou((d) => ({ ...d, [i.dealId]: `${i.verbo === 'WhatsApp' ? 'WhatsApp aberto' : 'Discou'} às ${agoraHHMM()} · ${i.telefone}` }));
    }
    pedidoDeSaidaAtual = null;
    setAberto(i.dealId);
  }
  function fecharCard() {
    if (!podeSair()) return;
    pedidoDeSaidaAtual = null; setAberto(null);
  }

  function salvar(i: CardDaFila, d: DadosRegistro) {
    const canal = i.verbo === 'WhatsApp' ? 'whatsapp' as const : 'ligacao' as const;
    const em = new Date().toISOString();
    const hora = agoraHHMM();
    const acaoId = novoAcaoId();
    pedidoDeSaidaAtual = null;
    setAberto(null); esconder(i.dealId); pulsar();
    if (d.comoFoi === 'sem_interesse') {
      somar({ dealId: i.dealId, hora, negocio: i.negocio, resultado: `Sem interesse · ${d.motivo}`, volta: null, perdido: d.motivo });
      const corpo = { op: 'mudar-etapa', dealId: i.dealId, novaEtapa: PERDIDO,
        propriedades: { motivo_do_perdido: d.motivo, ...(d.motivo === 'Outros' ? { observacao__desqualificado: d.detalhe.trim() } : {}) } };
      let desfeito = false;
      const timer = setTimeout(async () => {
        if (desfeito) return;
        try {
          await negocioAcao(corpo);
          void gravarContato({ canal, acaoId, clientId: i.clientId, dealId: i.dealId, ownerId, resultado: 'sem_interesse', em });
          void queryClient.invalidateQueries({ queryKey: ['fila_tarefas'] });
        } catch (e) {
          if (ehErroDeRede(e)) { await enfileirar({ acaoId, tipo: 'negocio', rotulo: `Perdido · ${i.negocio}`, payload: { corpo } }); return; }
          mostrar(i.dealId); tirar(i.dealId);
          Toast.mostrar(ehRecusa(e) ? `Não foi para Perdido: ${(e as Error).message}` : 'Não consegui mover para Perdido. Tente de novo.', 'erro');
        }
      }, 5000);
      Toast.mostrar(`Feito · ${i.negocio} · foi para Perdido`, 'ok', { rotulo: 'Desfazer', onPress: () => { desfeito = true; clearTimeout(timer); mostrar(i.dealId); tirar(i.dealId); } });
      return;
    }
    const volta = d.volta!;
    somar({ dealId: i.dealId, hora, negocio: i.negocio, resultado: rotuloComoFoi(d.comoFoi), volta });
    concluirComDesfazer({
      pedido: {
        taskId: i.tarefaId ?? `negocio-${i.dealId}`,
        nota: { dealId: i.dealId, texto: notaDaFila({ canal, comoFoi: d.comoFoi, volta, assunto: null }) },
        proximo: pedidoDaVolta({ dealId: i.dealId, volta, pessoa: i.pessoa, canal }),
        // sem tarefa aberta (quente sem passo…) ou tarefa de visita: não conclui nada
        manterAberta: !i.tarefaId || i.presencial,
        contato: { canal, acaoId, clientId: i.clientId, dealId: i.dealId, ownerId, resultado: d.comoFoi === 'decisor' ? 'decisor' : d.comoFoi, em },
      },
      rotulo: `Registro · ${i.negocio}`,
      textoToast: online ? `Feito · ${i.negocio} · volta ${diaCurto(volta)}` : 'Salvo no aparelho · sobe quando o sinal voltar',
      aoVoltar: () => { mostrar(i.dealId); tirar(i.dealId); },
      aoGravar: () => {
        void queryClient.invalidateQueries({ queryKey: ['fila_tarefas'] });
        void queryClient.invalidateQueries({ queryKey: ['tarefas_crm'] });
      },
    });
  }

  function adiar(i: CardDaFila) {
    const amanha = proximoDiaUtil(hoje, 1, feriados);
    esconder(i.dealId);
    let desfeito = false;
    const timer = setTimeout(async () => {
      if (desfeito) return;
      try {
        if (i.tarefaId) {
          const { error } = await supabase.functions.invoke('hubspot-sync', { body: { type: 'update_task', engagement_id: i.tarefaId, due_at: `${amanha}T12:00:00-03:00` } });
          if (error) throw error;
        } else {
          await negocioAcao(pedidoDaVolta({ dealId: i.dealId, volta: amanha, pessoa: i.pessoa, canal: i.verbo === 'WhatsApp' ? 'whatsapp' : 'ligacao' }));
        }
        void queryClient.invalidateQueries({ queryKey: ['fila_tarefas'] });
      } catch {
        mostrar(i.dealId);
        Toast.mostrar('Não consegui adiar no HubSpot. O negócio voltou para a fila.', 'erro');
      }
    }, 5000);
    Toast.mostrar(`Adiado · ${i.negocio} · volta ${diaCurto(amanha)}`, 'ok', { rotulo: 'Desfazer', onPress: () => { desfeito = true; clearTimeout(timer); mostrar(i.dealId); } });
  }

  // ---- topo (120 px) ----
  const topo = (
    <View style={s.topo}>
      <View style={s.topoA}>
        <Anel feitas={feitas.length} total={totalDia} zerada={zerada} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.topoTitulo}>Tarefas</Text>
            <SeloPosicao aoAbrir={() => setRankingAberto(true)} />
          </View>
          <Text style={[s.topoSub, pulso && s.topoSubPulso]} numberOfLines={1}>
            {zerada ? `Fila zerada · ${feitas.length} feitas` : `${feitas.length} feitas · ${fila.length} na fila`}
          </Text>
        </View>
        <Pressable accessibilityRole="button" disabled={fila.length === 0} onPress={() => setFoco(true)} style={[s.botaoFoco, fila.length === 0 && { opacity: 0.5 }]}>
          <Text style={s.botaoFocoTexto}>Modo foco</Text>
        </Pressable>
      </View>
      <View style={s.topoB}>
        <Text style={s.mrr} numberOfLines={1}><Text style={{ fontWeight: '700', color: 'var(--text)' }}>{mil(mrrEmJogo)}</Text> de MRR em jogo</Text>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {(['fila', 'feitas'] as const).map((a) => (
            <Pressable key={a} accessibilityRole="tab" accessibilityState={{ selected: aba === a }} onPress={() => setAba(a)} style={s.abaAlvo}>
              <Text style={[s.abaTexto, aba === a && s.abaAtiva]}>{a === 'fila' ? 'Na fila' : 'Feitas hoje'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsFiltro}>
        {([['tudo', 'Tudo'], ['ligar', 'Ligar'], ['visitar', 'Visitar'], ['whatsapp', 'WhatsApp'], ['perto', 'Perto de mim']] as Array<[Filtro, string]>).map(([f, r]) => (
          <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filtro === f }} onPress={() => setFiltro(f)} style={[s.chipFiltro, filtro === f && s.chipFiltroAtivo]}>
            <Text style={[s.chipFiltroTexto, filtro === f && s.chipFiltroTextoAtivo]}>{r} <Text style={s.chipFiltroN}>{contagem(f)}</Text></Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  const registroDe = (i: CardDaFila, grande = false) => (
    <RegistroInline key={i.dealId} item={i} hoje={hoje} feriados={feriados} grande={grande} discouEm={discou[i.dealId] ?? null}
      aoSalvar={(d) => salvar(i, d)} aoSair={() => { pedidoDeSaidaAtual = null; setAberto(null); }} />
  );

  const cards = (lista: CardDaFila[]) => (q.data?.grupos ?? []).map((g) => {
    const doGrupo = lista.filter((i) => i.grupo === g.id);
    if (!doGrupo.length) return null;
    return (
      <View key={g.id} style={{ gap: 10 }}>
        <View style={s.grupoCab}><Text style={s.grupoRotulo}>{g.rotulo.toUpperCase()}</Text><View style={s.grupoN}><Text style={s.grupoNTexto}>{doGrupo.length}</Text></View><View style={s.grupoLinha} /></View>
        {doGrupo.map((i) => (
          <CardFila key={i.dealId} item={i} aberto={aberto === i.dealId} selecionado={layout.ehDesktop && doSelecionado?.dealId === i.dealId}
            aoVerbo={() => tocarVerbo(i)} aoFechar={fecharCard} aoAdiar={() => adiar(i)}
            aoSelecionar={layout.ehDesktop ? () => setSelecionado(i.dealId) : undefined}>
            {!layout.ehDesktop && registroDe(i)}
          </CardFila>
        ))}
      </View>
    );
  });

  let corpo: React.ReactNode;
  if (aba === 'feitas') {
    corpo = (
      <View style={{ gap: 8 }}>
        <Text style={s.grupoRotulo}>{`${feitas.length} FEITAS HOJE · CADA UMA COM O PRÓXIMO PASSO`}</Text>
        {feitas.length === 0 && <Text style={s.vazio}>Nada registrado hoje ainda.</Text>}
        {feitas.map((f) => (
          <View key={f.dealId + f.hora} style={s.feita}>
            <Text style={s.feitaHora}>{f.hora}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.feitaNegocio} numberOfLines={1}>{f.negocio}</Text>
              <Text style={s.feitaResultado} numberOfLines={1}>{f.resultado}</Text>
              <Text style={s.feitaVolta} numberOfLines={1}>{f.perdido ? 'foi para Perdido' : f.volta ? `volta ${diaCurto(f.volta)}` : ''}{!online ? ' · aguardando sinal para subir' : ''}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  } else if (q.isLoading && !q.data) {
    corpo = (
      <View style={{ gap: 10 }}>
        <Text style={s.ajuda}>Montando a fila pelo valor e pela urgência…</Text>
        {[0, 1, 2, 3, 4].map((k) => <View key={k} style={s.esqueleto} />)}
      </View>
    );
  } else if (q.isError && !q.data) {
    corpo = (
      <View style={s.estadoCaixa}>
        <Text style={s.estadoTitulo}>Não consegui montar a fila agora</Text>
        <Text style={s.ajuda}>{online ? 'O HubSpot não respondeu. Puxe para baixo para tentar de novo.' : 'Sem sinal. A fila volta quando o sinal voltar.'}</Text>
        <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => q.refetch()}><Text style={s.botaoSecTexto}>Tentar de novo</Text></Pressable>
      </View>
    );
  } else if (q.data?.semMedicao) {
    corpo = <View style={s.estadoCaixa}><Text style={s.ajuda}>{q.data.semMedicao}</Text></View>;
  } else if (zerada) {
    corpo = (
      <View style={[s.estadoCaixa, { paddingTop: 32 }]}>
        <Anel feitas={feitas.length} total={feitas.length} tamanho={112} zerada />
        <Text style={s.zeradaTitulo}>Fila zerada</Text>
        <Text style={[s.ajuda, { textAlign: 'center', maxWidth: 300 }]}>{`${feitas.length} feitas hoje. Todo negócio da sua carteira tem o próximo passo marcado.`}</Text>
        {feitas.length > 0 && <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => setAba('feitas')}><Text style={s.botaoSecTexto}>Ver feitas hoje</Text></Pressable>}
      </View>
    );
  } else if (visiveis.length === 0) {
    const nome = { tudo: 'Tudo', ligar: 'Ligar', visitar: 'Visitar', whatsapp: 'WhatsApp', perto: 'Perto de mim' }[filtro];
    corpo = (
      <View style={s.estadoCaixa}>
        <Text style={s.ajuda}>{`Nada em '${nome}' agora.`}</Text>
        <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => setFiltro('tudo')}><Text style={s.botaoSecTexto}>Volte para Tudo</Text></Pressable>
      </View>
    );
  } else {
    corpo = <View style={{ gap: 18 }}>{cards(visiveis)}</View>;
  }

  const acordosBloco = acordos.length > 0 && aba === 'fila' ? (
    <View style={{ gap: 8, marginTop: 8 }}>
      <View style={s.grupoCab}><Text style={s.grupoRotulo}>DO SEU 1:1</Text><View style={s.grupoN}><Text style={s.grupoNTexto}>{acordos.length}</Text></View><View style={s.grupoLinha} /></View>
      {acordos.map((c) => (
        <Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{ checked: c.feito, disabled: marcarAcordo.isPending }} disabled={marcarAcordo.isPending}
          onPress={() => marcarAcordo.mutate({ id: c.id, feito: !c.feito })} style={s.acordo}>
          <View style={[s.circulo, c.feito && s.circuloFeito]}>{c.feito && <IconCheck width={14} height={14} fill="#FFFFFF" />}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.feitaNegocio, c.feito && { textDecorationLine: 'line-through', color: 'var(--text-muted)' }]} numberOfLines={3}>{c.texto}</Text>
            <Text style={s.feitaVolta}>{c.estado === 'devolvido' ? `devolvido: ${c.devolvidoMotivo ?? 'fale com o gestor'}` : c.estado === 'feito' ? 'feito · o gestor valida' : 'acordo do 1:1'}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  ) : null;

  const lista = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.lista}
      refreshControl={<RefreshControl refreshing={q.isFetching && !!q.data} onRefresh={() => q.refetch()} />}>
      {!online && <View style={s.semSinal}><Text style={s.semSinalTexto}>Sem sinal. As ações vão para a fila e sobem sozinhas.</Text></View>}
      {aba === 'fila' && (contratosHoje.data ?? []).map((k) => (
        <View key={k.negocio_id} style={s.contrato}>
          <Text style={s.contratoTitulo}>Contrato fechado</Text>
          <Text style={s.contratoTexto}>{`${k.valor ? `R$ ${Math.round(k.valor)}/mês · ` : ''}+200 na temporada`}</Text>
        </View>
      ))}
      {corpo}
      {acordosBloco}
    </ScrollView>
  );

  return (
    <View style={s.tela}>
      {layout.ehDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={s.colunaFila}>{topo}{lista}</View>
          <View style={s.painel}>
            {doSelecionado ? <PainelDoNegocio item={doSelecionado} aoVerbo={() => tocarVerbo(doSelecionado)} aberto={aberto === doSelecionado.dealId} aoFechar={fecharCard}>
              {registroDe(doSelecionado)}
            </PainelDoNegocio> : <View style={s.estadoCaixa}><Text style={s.ajuda}>Escolha um negócio da fila.</Text></View>}
          </View>
        </View>
      ) : (<>{topo}{lista}</>)}
      <FolhaRanking visivel={rankingAberto} aoFechar={() => setRankingAberto(false)} />
      {foco && <ModoFoco fila={fila} hoje={hoje} feriados={feriados} discou={discou} aoVerbo={tocarVerbo}
        aoSalvar={salvar} aoSair={() => { pedidoDeSaidaAtual = null; setAberto(null); setFoco(false); }} aberto={aberto} setAberto={setAberto} />}
    </View>
  );
}

// ---- computador: painel do negócio ------------------------------------------------------
function PainelDoNegocio({ item, aberto, aoVerbo, aoFechar, children }: { item: CardDaFila; aberto: boolean; aoVerbo: () => void; aoFechar: () => void; children: React.ReactNode }) {
  const etapa = ETAPA[item.etapaId];
  // a ordem do funil, explícita: chaves numéricas fazem o objeto se reordenar (Visita ia para o fim)
  const trilha = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473'];
  const idx = trilha.indexOf(item.etapaId);
  return (
    <ScrollView contentContainerStyle={{ padding: 28, gap: 16, maxWidth: 720 }}>
      <Text style={s.grupoRotulo}>{({ agora: 'AGORA', proteger: 'PROTEGER OS QUENTES', destravar: 'DESTRAVAR', reativar: 'REATIVAR' })[item.grupo]}</Text>
      <Text style={{ fontSize: 28, fontWeight: '700', color: 'var(--text)' }}>{item.titulo}</Text>
      <Text style={s.cardNegocio}>{`${item.negocio} · ${etapa?.rotulo ?? ''}${item.temperatura != null ? ` · ${Math.round(item.temperatura)}°` : ''}${item.mrr ? ` · R$ ${Math.round(item.mrr)}/mês` : ''}`}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>{trilha.map((t, i) => <View key={t} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= idx ? (ETAPA[t].cor) : 'var(--border)' }} />)}</View>
      <View style={s.blocoPainel}>
        <Text style={s.rotuloSecao}>AGORA</Text>
        <Text style={[s.cardPorque, { fontSize: 16 }]}>{item.porque}</Text>
        <Text style={s.ajuda}>{`${item.ultimoContatoTexto} · ${item.contatos} de 4 contatos · ${item.agendaHoje ? `na agenda hoje ${item.agendaHoje}` : item.prazoTexto}`}</Text>
        {aberto ? (
          <View style={{ gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={aoFechar} style={[s.botaoSec, { alignSelf: 'flex-end' }]}><Text style={s.botaoSecTexto}>Fechar</Text></Pressable>
            {children}
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={aoVerbo} style={[s.salvar, { backgroundColor: item.verbo === 'WhatsApp' ? 'var(--whatsapp)' : 'var(--vermelho-acao)' }]}>
            <Text style={s.salvarTexto}>{item.titulo}</Text>
          </Pressable>
        )}
      </View>
      <View style={s.blocoPainel}>
        <Text style={s.rotuloSecao}>PRÓXIMO PASSO MARCADO</Text>
        <Text style={s.ajuda}>{item.tarefaId ? `${item.prazoTexto} · tarefa aberta no HubSpot` : 'Nenhum: este negócio está sem próximo passo.'}</Text>
      </View>
    </ScrollView>
  );
}

// ---- modo foco --------------------------------------------------------------------------
function ModoFoco({ fila, hoje, feriados, discou, aberto, setAberto, aoVerbo, aoSalvar, aoSair }: {
  fila: CardDaFila[]; hoje: string; feriados: string[]; discou: Record<string, string>; aberto: string | null; setAberto: (d: string | null) => void;
  aoVerbo: (i: CardDaFila) => void; aoSalvar: (i: CardDaFila, d: DadosRegistro) => void; aoSair: () => void;
}) {
  const [ordem, setOrdem] = useState<string[]>(() => fila.map((i) => i.dealId));
  const [feitosNaSessao, setFeitos] = useState(0);
  const restantes = ordem.filter((d) => fila.some((i) => i.dealId === d));
  const atual = fila.find((i) => i.dealId === restantes[0]) ?? null;
  const total = feitosNaSessao + restantes.length;
  const etapa = atual ? ETAPA[atual.etapaId] : null;
  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={aoSair}>
      <View style={[s.tela, { padding: 16, gap: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={aoSair} style={s.botaoSec}><Text style={s.botaoSecTexto}>Sair</Text></Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.ajudaMiuda}>MODO FOCO</Text>
            <Text style={s.topoTitulo}>{atual ? `${feitosNaSessao + 1} de ${total}` : `${total} de ${total}`}</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={!atual} onPress={() => { if (atual) { setAberto(null); setOrdem([...restantes.slice(1), atual.dealId]); } }} style={s.botaoSec}><Text style={s.botaoSecTexto}>Pular</Text></Pressable>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: 'var(--border)' }}><View style={{ height: 4, borderRadius: 2, width: `${total ? (feitosNaSessao / total) * 100 : 100}%`, backgroundColor: 'var(--vermelho-acao)' }} /></View>
        {atual ? (
          <ScrollView contentContainerStyle={[s.card, { gap: 12, padding: 20 }]}>
            <Text style={s.grupoRotulo}>{({ agora: 'AGORA', proteger: 'PROTEGER OS QUENTES', destravar: 'DESTRAVAR', reativar: 'REATIVAR' })[atual.grupo]}</Text>
            <Text style={{ fontSize: 26, fontWeight: '700', color: 'var(--text)' }}>{atual.titulo}</Text>
            <Text style={s.cardNegocio}>{`${atual.negocio} · ${etapa?.rotulo ?? ''}${atual.temperatura != null ? ` · ${Math.round(atual.temperatura)}` : ''}`}</Text>
            <Text style={{ fontSize: 17, fontWeight: '600', color: 'var(--text)' }}>{atual.porque}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[['Último contato', atual.ultimoContatoTexto.replace(/^contato /, '')], ['Contatos', `${atual.contatos} de 4`], ['Prazo', atual.agendaHoje ? `hoje ${atual.agendaHoje}` : atual.prazoTexto]].map(([r, v]) => (
                <View key={r} style={s.caixaFato}><Text style={s.ajudaMiuda}>{r}</Text><Text style={[s.feitaNegocio, r === 'Prazo' && atual.venceu && { color: 'var(--vermelho-texto)' }]}>{v}</Text></View>
              ))}
            </View>
            {!!atual.mrr && <Text style={s.ajuda}>{`R$ ${Math.round(atual.mrr)}/mês em jogo`}</Text>}
            {aberto === atual.dealId ? (
              <RegistroInline item={atual} hoje={hoje} feriados={feriados} grande discouEm={discou[atual.dealId] ?? null}
                aoSalvar={(d) => { setFeitos((n) => n + 1); aoSalvar(atual, d); }} aoSair={() => { pedidoDeSaidaAtual = null; setAberto(null); }} />
            ) : (
              <Pressable accessibilityRole="button" onPress={() => aoVerbo(atual)} style={[s.salvar, { minHeight: 56, backgroundColor: atual.verbo === 'WhatsApp' ? 'var(--whatsapp)' : 'var(--vermelho-acao)' }]}>
                <Text style={s.salvarTexto}>{atual.titulo}</Text>
              </Pressable>
            )}
          </ScrollView>
        ) : (
          <View style={s.estadoCaixa}>
            <Anel feitas={1} total={1} tamanho={112} zerada />
            <Text style={s.zeradaTitulo}>Sessão concluída</Text>
            <Pressable accessibilityRole="button" style={s.botaoSec} onPress={aoSair}><Text style={s.botaoSecTexto}>Voltar para a fila</Text></Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  colunaFila: { width: 440, borderRightWidth: 1, borderRightColor: 'var(--border-soft)' },
  painel: { flex: 1 },
  topo: { paddingHorizontal: 16, paddingTop: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)', backgroundColor: 'var(--bg)' },
  topoA: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  topoTitulo: { fontSize: 20, fontWeight: '700', color: 'var(--text)' },
  topoSub: { fontSize: 12, color: 'var(--text-muted)' },
  topoSubPulso: { color: 'var(--vermelho-acao)', transform: [{ scale: 1.08 }] },
  botaoFoco: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center' },
  botaoFocoTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  topoB: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 22 },
  mrr: { fontSize: 13, color: 'var(--text-muted)', flexShrink: 1 },
  abaAlvo: { minHeight: 44, justifyContent: 'center' },
  abaTexto: { fontSize: 13, color: 'var(--text-muted)' },
  abaAtiva: { color: 'var(--text)', fontWeight: '700', textDecorationLine: 'underline', textDecorationColor: 'var(--vermelho-acao)' },
  chipsFiltro: { gap: 8, paddingBottom: 10 },
  chipFiltro: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center', backgroundColor: 'var(--surface-2)' },
  chipFiltroAtivo: { borderColor: 'var(--vermelho-acao)', backgroundColor: 'var(--tint-red)' },
  chipFiltroTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  chipFiltroTextoAtivo: { color: 'var(--text)' },
  chipFiltroN: { color: 'var(--text-muted)', fontWeight: '500' },
  lista: { padding: 16, gap: 18, paddingBottom: 120 },
  semSinal: { borderRadius: 12, padding: 12, backgroundColor: 'var(--tint-amber)', borderWidth: 1, borderColor: 'var(--tint-amber-border)' },
  semSinalTexto: { fontSize: 13, color: 'var(--tint-amber-text)', fontWeight: '600' },
  grupoCab: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grupoRotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: 'var(--text-muted)' },
  grupoN: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: 'var(--surface-3)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  grupoNTexto: { fontSize: 11, fontWeight: '700', color: 'var(--text)' },
  grupoLinha: { flex: 1, height: 1, backgroundColor: 'var(--border-soft)' },
  cardCaixa: { position: 'relative' },
  fundoGesto: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 18 },
  fundoGestoTexto: { fontSize: 14, fontWeight: '700' },
  card: { minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', padding: 12, gap: 4 },
  cardAberto: { borderColor: 'var(--vermelho-acao)' },
  cardSelecionado: { borderColor: 'var(--text)' },
  cardTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitulo: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: 'var(--text)' },
  cardLinha2: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  cardNegocio: { fontSize: 12, color: 'var(--text-muted)', flexShrink: 1 },
  pilulaEtapa: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: 'var(--surface-3)', flexShrink: 0 },
  pilulaTexto: { fontSize: 11, fontWeight: '600', color: 'var(--text)' },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  temp: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  tempTexto: { fontSize: 11, fontWeight: '600', color: 'var(--text-muted)' },
  cardPorque: { fontSize: 13, color: 'var(--text)', fontWeight: '500' },
  botaoVerbo: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  botaoVerboTexto: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  botaoX: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'var(--surface-3)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rodape: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  rodapeTexto: { fontSize: 11, color: 'var(--text-muted)', flexShrink: 1 },
  rodapeFixo: { fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 },
  prazo: { fontWeight: '600', color: 'var(--text)' },
  segmentos: { flexDirection: 'row', gap: 2, flexShrink: 0 },
  segmento: { width: 7, height: 4, borderRadius: 2, backgroundColor: 'var(--border)' },
  seloAgenda: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, height: 18, borderRadius: 9, backgroundColor: 'var(--tint-green)', flexShrink: 0 },
  seloAgendaTexto: { fontSize: 11, fontWeight: '700', color: 'var(--tint-green-text)' },
  registro: { gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  discou: { fontSize: 13, color: 'var(--text)' },
  rotuloSecao: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: 'var(--text-muted)' },
  grade2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linhaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipRegistro: { paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'var(--surface-3)', borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  chipLargo: { flexBasis: '47%', flexGrow: 1 },
  chipRegistroAtivo: { borderColor: 'var(--vermelho-acao)', backgroundColor: 'var(--tint-red)' },
  chipRegistroTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)', textAlign: 'center' },
  chipRegistroTextoAtivo: { color: 'var(--tint-red-text)' },
  calendario: { gap: 6, padding: 10, borderRadius: 12, backgroundColor: 'var(--surface-2)' },
  calLinha: { flexDirection: 'row', gap: 6 },
  calCab: { flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' },
  calDia: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'transparent' },
  calDiaBloq: { backgroundColor: 'transparent' },
  calDiaTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  calFeriado: { fontSize: 9, color: 'var(--text-faint)' },
  fraseVolta: { fontSize: 17, fontWeight: '700', color: 'var(--text)', textAlign: 'center' },
  ajuda: { fontSize: 13, color: 'var(--text-muted)' },
  ajudaMiuda: { fontSize: 11, color: 'var(--text-muted)' },
  campoTexto: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', paddingHorizontal: 12, fontSize: 15, color: 'var(--text)', backgroundColor: 'var(--surface)' },
  salvar: { borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, minHeight: 50 },
  salvarFalta: { backgroundColor: 'var(--surface-3)' },
  salvarTexto: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  salvarFaltaTexto: { color: 'var(--text-muted)' },
  avisoSair: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: 'var(--tint-amber)', borderWidth: 1, borderColor: 'var(--tint-amber-border)' },
  avisoSairTexto: { fontSize: 13, fontWeight: '600', color: 'var(--tint-amber-text)' },
  botaoSec: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)' },
  botaoSecTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  esqueleto: { height: 96, borderRadius: 14, backgroundColor: 'var(--surface-2)' },
  estadoCaixa: { alignItems: 'center', gap: 12, padding: 24 },
  estadoTitulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  zeradaTitulo: { fontSize: 22, fontWeight: '700', color: 'var(--text)', textAlign: 'center' },
  vazio: { fontSize: 13, color: 'var(--text-muted)' },
  feita: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  feitaHora: { fontSize: 12, color: 'var(--text-muted)', width: 40 },
  feitaNegocio: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  feitaResultado: { fontSize: 12, color: 'var(--text)' },
  feitaVolta: { fontSize: 11, color: 'var(--text-muted)' },
  acordo: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  circulo: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  circuloFeito: { backgroundColor: 'var(--verde-acao)', borderColor: 'var(--verde-acao)' },
  blocoPainel: { gap: 10, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)' },
  contrato: { gap: 2, padding: 14, borderRadius: 14, backgroundColor: 'var(--tint-green)', borderWidth: 1, borderColor: 'var(--tint-green-border)' },
  contratoTitulo: { fontSize: 15, fontWeight: '700', color: 'var(--tint-green-text)' },
  contratoTexto: { fontSize: 13, color: 'var(--tint-green-text)' },
  caixaFato: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: 'var(--surface-2)', gap: 2 },
});

