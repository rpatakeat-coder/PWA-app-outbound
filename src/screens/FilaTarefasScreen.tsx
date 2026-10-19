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
//
// DIDÁTICA (15/10/26, Julyan: "fica juntando várias coisas, tem que ser didático"): a tela lê
// de cima para baixo em cinco seções — Atrasados, Para hoje, Combinados com o gestor, Sem
// próximo passo e Feito hoje. Saíram daqui o placar e o ranking (moram em Meu desempenho),
// o card "Contrato fechado", a aba interna "Feitas hoje" (virou a última seção) e os termos
// internos ("Proteger/Destravar/Reativar", "N de 4", temperatura em número). O cartão tem um
// botão só e o "Adiar" é visível; arrastar para a direita deixou de discar. A regra e a ordem
// continuam as do servidor (um card por negócio, valor × urgência).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { CampoData } from '../components/CampoData';
import { Toast } from '../components/Toast';
import { IconCheck } from '../components/icons';
import { useLayout } from '../hooks/useLayout';
import { useMeuPdi } from '../hooks/useMeuPdi';
import { concluirComDesfazer } from '../utils/concluirTarefa';
import { gravarContato, type Contato } from '../utils/contatoDeCampo';
import { ehErroDeRede, ehSessaoVencida, enfileirar, novoAcaoId, registrarExecutor } from '../utils/filaOffline';
import { ehRecusa, negocioAcao } from '../utils/negocioAcao';
import { apagarPendente, desfazerFeita, lerFeitas, marcarGravada, registrarFeita, type FeitaServidor, type OrigemDoFeito, type SecaoDoFeito } from '../utils/filaFeitas';
import { ehDiaUtil, proximoDiaUtil, quenteEsfriando, secaoDoItem, type SecaoDaFila } from '../../supabase/functions/_compartilhado/filaDoDinheiro';
import { BlocoHoraDasLigacoes, CabecalhoDaSecao, CartaoCheio, CartaoFaltaComoFoi, CartaoMini, FilaZerada, LinhaFeitoHoje, PlacarDoDia, SecaoVazia, type DadosDoCartao } from './CartaoDaFila';
import { estadoDoPush, ligarPush, type EstadoDoPush, type PedidoDaFila } from '../utils/pushDaFila';
import { janelaAtual, janelasDoDia } from '../utils/horaDasLigacoes';
import { porNoDia } from '../utils/paradaDoDia';
import { aoMudarOPlano } from '../utils/planoDoPino';
import { lerSemanaDoPlano, type DiaDoPlano } from '../utils/semanaDoPlano';
import {
  COMO_FOI_FILA, DIAS_FILA, MOTIVOS_SEM_INTERESSE, dataDoChip, diaCurto, diasSugeridos, fraseDaVolta, notaDaFila,
  pedidoDaVolta, rotuloComoFoi, textoDoSalvar, type ComoFoiFila,
} from '../utils/registroDaFila';
import { AJUDA_MOTIVO, MOTIVOS_QUE_EXIGEM_TEXTO, rotuloDoMotivo } from '../utils/fichaDeRua';

// ---- o que o servidor devolve ---------------------------------------------------------
export type CardDaFila = {
  dealId: string; clientId: string | null; grupo: 'agora' | 'proteger' | 'destravar' | 'reativar';
  motivo: string; porque: string; verbo: 'Ligar' | 'Visitar' | 'WhatsApp' | 'Registrar';
  pessoa: string | null; papel: string | null; negocio: string; etapaId: string; temperatura: number | null;
  mrr: number | null; ultimoContato: string | null; ultimoContatoTexto: string; contatos: number;
  prazo: string | null; prazoTexto: string; venceu: boolean; agendaHoje: string | null; temTelefone: boolean;
  telefone: string | null; tarefaId: string | null; presencial: boolean; lat: number | null; lng: number | null;
  assunto?: string | null; diasNaEtapa?: number | null; horaPrazo?: string | null;
  titulo: string;
  /** Por que o título usa o negócio (A2): "contato no CRM: 'Julyan' · igual ao dono da conta". */
  tituloPorque?: string | null;
};
type RespostaFila = {
  itens: CardDaFila[]; grupos: Array<{ id: CardDaFila['grupo']; rotulo: string }>; mrrEmJogo: number;
  hoje: string; feriados: string[]; semMedicao?: string;
};
type Feita = FeitaServidor;

// Cores de etapa são DADO (docs/10: o STAGE_COLORS do Meu funil) — não cromo.
const ETAPA: Record<string, { rotulo: string; cor: string }> = {
  '1395880469': { rotulo: 'Prospecção', cor: '#7A8494' },
  '1396005401': { rotulo: 'Visita', cor: '#E51A31' },
  '1395880470': { rotulo: 'Conversa com decisor', cor: '#B07C1F' },
  '1395880471': { rotulo: 'Demo/Proposta', cor: '#8E3B5C' },
  '1395880472': { rotulo: 'Negociação', cor: '#2B3440' },
  '1395880473': { rotulo: 'Ag. Pagamento', cor: '#1E9E7B' },
};
const PERDIDO = '1396006164';
const soDigitos = (t: string) => t.replace(/\D+/g, '');
const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const agoraHHMM = () => { const b = new Date(Date.now() - 3 * 3600000); return `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`; };
const duracao = (seg: number) => (seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min ${seg % 60} s`);

/* SEM INTERESSE E ADIAR PELA FILA (auditoria 14/10/26). Os dois esperam 5 s de Desfazer antes
   de escrever. Antes: (a) fechar o app dentro da janela perdia a escrita (o Perdido nunca ia e a
   linha de fila_feitas ficava 'pendente' para sempre); (b) sem sinal, o Perdido entrava na fila
   como 'negocio' e, ao subir, ninguém marcava a linha como gravada — o Desfazer tardio dizia
   "ainda está subindo" para sempre. Agora o envio é um só (enviarDaAba), é o executor do tipo
   'aba-tarefas' da fila offline e marca a linha gravada depois que o Perdido sobe; e quem está
   na janela vai para a fila no pagehide, como o concluirComDesfazer. Registrado no carregamento
   do módulo (o App.tsx importa esta tela de forma estática): sobe mesmo se a aba não abrir. */
type PedidoDaAba =
  | { op: 'perdido'; corpo: Record<string, unknown>; feitaAcaoId: string; contato: Contato }
  | { op: 'adiar'; tarefaId: string | null; amanha: string; corpo: Record<string, unknown> | null };

async function enviarDaAba(p: PedidoDaAba): Promise<void> {
  if (p.op === 'perdido') {
    await negocioAcao(p.corpo);
    void gravarContato(p.contato);
    await marcarGravada(p.feitaAcaoId, {});
    return;
  }
  if (p.tarefaId) {
    const { data, error } = await supabase.functions.invoke('hubspot-sync', { body: { type: 'update_task', engagement_id: p.tarefaId, due_at: `${p.amanha}T12:00:00-03:00` } });
    if (error) throw error;
    // a hubspot-sync também recusa com 200 e { error } (o mesmo cuidado do concluirTarefa)
    const d = data as { error?: string; detail?: string } | null;
    if (d?.error) throw new Error(String(d.detail ?? d.error));
  } else if (p.corpo) {
    await negocioAcao(p.corpo);
  }
}

registrarExecutor('aba-tarefas', (item) => enviarDaAba(item.payload as unknown as PedidoDaAba));

const naJanela = new Map<string, { timer: ReturnType<typeof setTimeout>; rotulo: string; pedido: PedidoDaAba }>();
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const [acaoId, j] of naJanela) {
      clearTimeout(j.timer);
      naJanela.delete(acaoId);
      void enfileirar({ acaoId, tipo: 'aba-tarefas', rotulo: j.rotulo, payload: j.pedido as unknown as Record<string, unknown> });
    }
  });
}

// A ÚLTIMA FILA FICA NO APARELHO (auditoria de velocidade, 05/10/26): a Edge leva ~2 s, e ao
// abrir o app o selo e a aba esperavam esse tempo em branco — sem sinal, para sempre. Agora a
// última resposta mostra na hora e a busca nova corre por trás (initialDataUpdatedAt 0 a marca
// como velha: o React Query busca sempre ao abrir, mesmo que a guardada tenha 10 s — a tarefa
// pode ter sido concluída no HubSpot). Só vale para a mesma pessoa e o mesmo dia: a fila
// depende do dia, e outro login no mesmo aparelho não vê a carteira de quem saiu.
const CHAVE_FILA = 'takeat-fila-tarefas';
function donoDaSessao(): string | null {
  try {
    const k = Object.keys(window.localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    return k ? JSON.parse(window.localStorage.getItem(k) ?? 'null')?.user?.id ?? null : null;
  } catch { return null; }
}
function filaGuardada(): RespostaFila | undefined {
  try {
    const g = JSON.parse(window.localStorage.getItem(CHAVE_FILA) ?? 'null');
    if (!g?.data || !g.uid || g.uid !== donoDaSessao() || g.data.hoje !== hojeBRT()) return undefined;
    return g.data as RespostaFila;
  } catch { return undefined; }
}

/** A busca da fila. Exportada: o App lê o mesmo cache para o cabeçalho e o selo da aba. */
export async function buscarFila(): Promise<RespostaFila> {
  const { data, error } = await supabase.functions.invoke('fila-tarefas', { body: {} });
  if (error) throw error;
  const uid = donoDaSessao();
  if (uid) { try { window.localStorage.setItem(CHAVE_FILA, JSON.stringify({ uid, em: Date.now(), data })); } catch { /* sem armazenamento: só não guarda */ } }
  return data as RespostaFila;
}
/** As opções da fila, as mesmas nos três lugares que a leem (App, Tarefas, Lista do computador). */
export function opcoesDaFila() {
  return { queryKey: ['fila_tarefas'], queryFn: buscarFila, staleTime: 60_000, initialData: filaGuardada(), initialDataUpdatedAt: 0 };
}
function useFila() {
  return useQuery<RespostaFila>({
    ...opcoesDaFila(),
    placeholderData: (anterior) => anterior,
  });
}

// Feitas hoje moram em fila_feitas (0155, 04/10/2026): a mesma lista no celular e no
// computador, e com Desfazer até o fim do dia. A linha entra na tela na hora (local) e a
// do servidor a substitui quando chega, casadas pelo acaoId.
function useFeitas(hoje: string) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['fila_feitas', hoje], queryFn: () => lerFeitas(hoje), staleTime: 30_000 });
  const [locais, setLocais] = useState<Feita[]>([]);
  const doServidor = q.data ?? [];
  const noServidor = new Set(doServidor.map((f) => f.acaoId));
  const feitas = [...locais.filter((l) => !noServidor.has(l.acaoId)), ...doServidor];
  const recarregar = () => qc.invalidateQueries({ queryKey: ['fila_feitas', hoje] });
  return {
    feitas,
    recarregar,
    somar: (f: Feita, extra: { etapaAnterior?: string | null; tarefaId?: string | null; origem?: OrigemDoFeito; secao?: SecaoDoFeito | null }) => {
      setLocais((l) => [f, ...l.filter((x) => x.dealId !== f.dealId)]);
      void registrarFeita({ ...f, dia: hoje, ...extra, origem: extra.origem }).then(recarregar);
    },
    tirar: (dealId: string) => {
      const f = feitas.find((x) => x.dealId === dealId && x.estado === 'pendente');
      setLocais((l) => l.filter((x) => x.dealId !== dealId));
      if (f) void apagarPendente(f.acaoId).then(recarregar);
    },
  };
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
      {!!discouEm && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'var(--verde-acao)' }} />
          <Text style={[s.discou, { flex: 1 }]}>{discouEm}</Text>
        </View>
      )}
      <Text style={s.rotuloSecao}>COMO FOI?</Text>
      <View style={s.grade2}>{COMO_FOI_FILA.map((c) => chip(c.id, c.rotulo, comoFoi === c.id, () => escolherComoFoi(c.id), true))}</View>

      {comoFoi === 'sem_interesse' ? (
        <>
          <Text style={s.rotuloSecao}>MOTIVO</Text>
          <View style={s.linhaChips}>{MOTIVOS_SEM_INTERESSE.map((m) => chip(m, rotuloDoMotivo(m), motivo === m, () => setMotivo(m)))}</View>
          {!!motivo && !!AJUDA_MOTIVO[motivo ?? ''] && <Text style={s.ajudaMiuda}>{AJUDA_MOTIVO[motivo ?? '']}</Text>}
          {/* aberto para todo motivo (14/10/26); obrigatório só em Outros/Funcionalidade */}
          {!!motivo && (
            <TextInput value={detalhe} onChangeText={setDetalhe} placeholder={MOTIVOS_QUE_EXIGEM_TEXTO.includes(motivo ?? '') ? 'O que pesou (obrigatório)' : 'O que pesou (opcional)'}
              placeholderTextColor="var(--text-faint)" style={s.campoTexto} maxLength={200} />
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
              {/* MAIS LONGE QUE 3 SEMANAS (19/10/26): o cliente pede "me liga daqui a um mês" e o
                  calendário parava em 15 dias úteis. O calendário do aparelho aceita qualquer dia útil. */}
              <Text style={s.ajudaMiuda}>Mais longe: escolha no calendário</Text>
              <CampoData valor={volta && !semanas.some((l) => l.includes(volta)) ? volta : ''} minimo={proximoDiaUtil(hoje, 1, feriados)} rotulo="Escolher outro dia para o próximo passo"
                aoMudar={(v) => {
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v <= hoje) return;
                  // fim de semana ou feriado vai para o próximo dia útil
                  setVolta(ehDiaUtil(v, feriados) ? v : proximoDiaUtil(v, 1, feriados));
                }} />
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

// a regra das seções mora no módulo da fila, junto do robô do push (17/10/26)
const secaoDe = (i: CardDaFila): SecaoDaFila => secaoDoItem(i);

// ---- a tela -----------------------------------------------------------------------------
type Props = {
  ownerId: string | null;
  aoAbrirLead: (clientId: string) => void;
  aoPosicionar?: (dealId: string, nome: string) => void;
  aoRegistrarVisita: (clientId: string) => void;
  /** A4: abre o cadastro do lead no campo telefone. */
  aoEditarTelefone?: (clientId: string) => void;
  /** Abre a folha "Marcar o próximo passo" do app (a mesma do pino): tipo, dia, hora e HubSpot. */
  aoMarcarProximoPasso?: (clientId: string) => void;
  /** O id do executivo no app (field_routes.seller_id), para o Pôr no plano. */
  sellerId?: string | null;
  /** GPS atual; "Perto de mim" = até 1 km (D13, Julyan 04/10/26). */
  posicao: { latitude: number; longitude: number } | null;
  /** O que o aviso da fila pediu (P6): abrir a fila, ou o cartão de um negócio pronto para ligar. */
  pedido?: PedidoDaFila | null;
  /** P4: "‹ Agenda" e a volta sozinha depois do Salvar, quando o cartão veio da Agenda. */
  aoVoltarAgenda?: () => void;
};
const PERTO_M = 1000;
function metros(a: { latitude: number; longitude: number }, lat: number, lng: number) {
  const r = 6371000, rad = Math.PI / 180;
  const dLat = (lat - a.latitude) * rad, dLng = (lng - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
type Filtro = 'tudo' | 'ligar' | 'visitar' | 'whatsapp' | 'perto';

export default function FilaTarefasScreen({ ownerId, aoPosicionar, aoRegistrarVisita, aoEditarTelefone, aoMarcarProximoPasso, sellerId, posicao, pedido, aoVoltarAgenda }: Props) {
  const layout = useLayout();
  const queryClient = useQueryClient();
  const q = useFila();
  const hoje = q.data?.hoje ?? hojeBRT();
  const feriados = q.data?.feriados ?? [];
  const { feitas, somar, tirar, recarregar: recarregarFeitas } = useFeitas(hoje);
  const [desfazendo, setDesfazendo] = useState<{ id: string; fase: 'confirmar' | 'indo' } | null>(null);
  const [escondidos, setEscondidos] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [discou, setDiscou] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const { pdi, marcar: marcarAcordo } = useMeuPdi(true);
  const acordos = (pdi?.compromissos ?? []).filter((c) => c.estado !== 'validado');
  // o relógio da hora das ligações (P1): a faixa aparece e some sozinha
  const [relogio, setRelogio] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setRelogio(Date.now()), 30_000); return () => clearInterval(t); }, []);
  // os avisos no aparelho (P6)
  const [estadoPush, setEstadoPush] = useState<EstadoDoPush | null>(null);
  const [ligandoPush, setLigandoPush] = useState(false);
  useEffect(() => { void estadoDoPush().then(setEstadoPush).catch(() => setEstadoPush('sem_suporte')); }, []);
  // de onde veio o cartão em foco (o aviso) e o tempo fora do app depois de Ligar ou WhatsApp (0.2b)
  const [veioDe, setVeioDe] = useState<{ deal: string; de: 'push' | 'agenda'; rotulo?: string | null } | null>(null);
  const saida = useRef<{ deal: string; canal: 'ligacao' | 'whatsapp'; em: number; viaPush: boolean } | null>(null);
  const [fora, setFora] = useState<Record<string, { segundos: number; canal: 'ligacao' | 'whatsapp' }>>({});
  // os combinados do 1:1 entram no denominador do % que o gestor vê (fila_do_dia, 0217)
  useEffect(() => {
    if (!sellerId || !pdi) return;
    void supabase.from('fila_do_dia').upsert({ user_id: sellerId, dia: hojeBRT(), combinados: acordos.length }, { onConflict: 'user_id,dia' }).then(() => {}, () => {});
  }, [sellerId, pdi, acordos.length]);
  // A4: o plano desta semana e da próxima (o mesmo planos_semanais do Planejamento do Cockpit),
  // para saber se o negócio já está no plano e qual é o próximo dia de Rua.
  const plano = useQuery<DiaDoPlano[]>({
    queryKey: ['plano_semana_fila', ownerId, hoje],
    enabled: !!ownerId,
    staleTime: 60_000,
    queryFn: async () => {
      const seguinte = proximoDiaUtil(hoje, 5, []);
      const [a, b] = await Promise.all([lerSemanaDoPlano(ownerId!, hoje), lerSemanaDoPlano(ownerId!, seguinte)]);
      return [...a, ...b];
    },
  });
  const [postosNoPlano, setPostosNoPlano] = useState<Record<string, string>>({});
  // a folha "Marcar o próximo passo" grava fora daqui: o selo "próximo passo · dia" relê quando o plano muda
  useEffect(() => aoMudarOPlano(() => { void queryClient.invalidateQueries({ queryKey: ['plano_semana_fila'] }); }), [queryClient]);
  // Decisão 4 do handoff: o próximo dia de Rua do plano; sem Rua marcada, o próximo dia útil.
  const proximoDiaDeRua = (): string => {
    const rua = (plano.data ?? []).find((x) => x.iso > hoje && ehDiaUtil(x.iso, feriados) && x.proposito === 'rua');
    return rua ? rua.iso : proximoDiaUtil(hoje, 1, feriados);
  };

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
  /* O % QUE O GESTOR VÊ (P3): uma conta só, no banco (percentual_followups, 0217) — a mesma do
     cockpit e do push das 17:30. Relê quando a fila ou o Feito hoje mudam. */
  const pctQ = useQuery<Array<{ user_id: string; pct: number | null }>>({
    queryKey: ['pct_followups', hoje, feitas.length, q.dataUpdatedAt],
    enabled: !!q.data && !!sellerId,
    staleTime: 30_000,
    queryFn: async () => { const { data, error } = await supabase.rpc('percentual_followups', { p_dia: hoje }); if (error) throw error; return (data ?? []) as Array<{ user_id: string; pct: number | null }>; },
  });
  const meuPct = sellerId ? (pctQ.data?.find((x) => x.user_id === sellerId)?.pct ?? null) : null;
  const mediaPct = (() => { const v = (pctQ.data ?? []).map((x) => x.pct).filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; })();
  const seqQ = useQuery<{ atual: number; recorde: number } | null>({
    queryKey: ['seq_fila_zerada', hoje],
    staleTime: 5 * 60_000,
    queryFn: async () => { const { data } = await supabase.rpc('sequencia_da_fila_zerada'); return ((data ?? []) as Array<{ atual: number; recorde: number }>)[0] ?? null; },
  });
  // o aviso abriu o app (P6): o cartão daquele negócio em destaque, pronto para ligar num toque
  useEffect(() => {
    if (!pedido || !q.data) return;
    setFiltro('tudo');
    if (pedido.acao === 'fila' || !pedido.deal) return;
    const i = q.data.itens.find((x) => x.dealId === pedido.deal);
    if (!i) { Toast.mostrar('Este negócio já saiu da fila: foi registrado ou mudou de etapa.', 'ok'); return; }
    const daAgenda = pedido.origem === 'agenda';
    // a ligação já saiu de outra tela (Antes da rua): a volta conta o tempo fora do app daqui
    if (pedido.discouEm && !saida.current) {
      saida.current = { deal: i.dealId, canal: 'ligacao', em: pedido.discouEm, viaPush: false };
      setDiscou((d) => ({ ...d, [i.dealId]: `Discou às ${agoraHHMM()} · ${i.telefone ?? ''}` }));
    }
    setSelecionado(i.dealId); setVeioDe({ deal: i.dealId, de: daAgenda ? 'agenda' : 'push', rotulo: pedido.rotulo ?? null });
    setTimeout(() => { try { document.getElementById(`fila-${i.dealId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* sem DOM */ } }, 300);
  }, [pedido?.n, !!q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // voltou da ligação ou do WhatsApp: o tempo fora do app e o Como foi daquele negócio aberto
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible' || !saida.current) return;
      const s0 = saida.current; saida.current = null;
      const segundos = Math.round((Date.now() - s0.em) / 1000);
      setFora((m) => ({ ...m, [s0.deal]: { segundos, canal: s0.canal } }));
      setDiscou((d) => ({ ...d, [s0.deal]: `${s0.canal === 'whatsapp' ? 'WhatsApp' : 'Ligou'} · fora do app ${duracao(segundos)}${s0.viaPush ? ' · pela notificação' : ''}` }));
      setSelecionado(s0.deal); setAberto(s0.deal);
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);
  const passa = (i: CardDaFila, f: Filtro) => f === 'tudo' || (f === 'ligar' && i.verbo === 'Ligar') || (f === 'visitar' && (i.verbo === 'Visitar' || i.verbo === 'Registrar'))
    || (f === 'whatsapp' && i.verbo === 'WhatsApp') || (f === 'perto' && !!posicao && i.lat != null && i.lng != null && metros(posicao, i.lat, i.lng) <= PERTO_M);
  const visiveis = fila.filter((i) => passa(i, filtro));
  const contagem = (f: Filtro) => fila.filter((i) => passa(i, f)).length;
  const zerada = !!q.data && !q.data.semMedicao && fila.length === 0;
  // UM NEGÓCIO, UMA FEITA (auditoria 16/10/26): duas ações no mesmo negócio (ou a mesma registrada
  // duas vezes) contavam duas; e o negócio que já está nas feitas e voltou para a fila (gravação na
  // fila offline + recarga) entrava duas vezes no total do anel.
  const dealsFeitos = new Set(feitas.map((x) => x.dealId));
  const nFeitas = dealsFeitos.size;
  const totalDia = nFeitas + fila.filter((i) => !dealsFeitos.has(i.dealId)).length;
  // sem a fila lida (erro do HubSpot ou ainda carregando) o topo não diz "0 faltam"
  const filaMedida = !!q.data;

  // fila zerada: grava o dia (conquista "Fila zerada 5 dias"), uma vez por dia
  useEffect(() => {
    if (!zerada) return;
    const chave = `fila-zerada-gravada-${hoje}`;
    try { if (window.localStorage.getItem(chave)) return; window.localStorage.setItem(chave, '1'); } catch { /* sem armazenamento */ }
    void supabase.rpc('registrar_fila_zerada');
  }, [zerada, hoje]);

  const esconder = (d: string) => setEscondidos((e) => new Set(e).add(d));
  const mostrar = (d: string) => setEscondidos((e) => { const n = new Set(e); n.delete(d); return n; });

  function discar(i: CardDaFila, canal: 'ligacao' | 'whatsapp') {
    if (aberto && aberto !== i.dealId && !podeSair()) return;
    setSelecionado(i.dealId);
    const fone = i.telefone ? soDigitos(i.telefone) : '';
    if (!fone) { if (i.clientId) aoEditarTelefone?.(i.clientId); else Toast.mostrar('Este negócio não tem telefone no CRM.', 'erro'); return; }
    const com55 = fone.length <= 11 ? `55${fone}` : fone;
    saida.current = { deal: i.dealId, canal, em: Date.now(), viaPush: veioDe?.deal === i.dealId && veioDe.de === 'push' };
    void Linking.openURL(canal === 'whatsapp' ? `https://wa.me/${com55}` : `tel:+${com55}`);
    setDiscou((d) => ({ ...d, [i.dealId]: `${canal === 'whatsapp' ? 'WhatsApp aberto' : 'Discou'} às ${agoraHHMM()} · ${i.telefone}` }));
    pedidoDeSaidaAtual = null;
    setAberto(i.dealId);
  }
  /* DE ONDE VEIO O FEITO (P7): ligação pelo app com 30 s ou mais fora dele, ou WhatsApp aberto pelo
     app, vira "sozinha"; o resto é "pela fila". A duração é o tempo FORA DO APP: o navegador não
     sabe quanto durou a ligação (item 0.2b do handoff). */
  function origemDe(i: CardDaFila, canal: 'ligacao' | 'whatsapp'): OrigemDoFeito {
    const fo = fora[i.dealId];
    if (fo && fo.canal === canal && canal === 'ligacao' && fo.segundos >= 30) return 'ligacao_app';
    if (fo && fo.canal === canal && canal === 'whatsapp') return 'whatsapp_app';
    return 'fila';
  }
  const secaoDoFeito = (i: CardDaFila): SecaoDoFeito => secaoDe(i);
  function fecharCard() {
    if (!podeSair()) return;
    pedidoDeSaidaAtual = null; setAberto(null);
  }

  function salvar(i: CardDaFila, d: DadosRegistro) {
    const canal = fora[i.dealId]?.canal ?? (i.verbo === 'WhatsApp' ? 'whatsapp' as const : 'ligacao' as const);
    const em = new Date().toISOString();
    const hora = agoraHHMM();
    const acaoId = novoAcaoId();
    pedidoDeSaidaAtual = null;
    setAberto(null); esconder(i.dealId);
    if (veioDe?.deal === i.dealId) {
      const voltarAgenda = veioDe.de === 'agenda';
      setVeioDe(null);
      if (voltarAgenda) setTimeout(() => aoVoltarAgenda?.(), 900);
    }
    if (d.comoFoi === 'sem_interesse') {
      somar({ id: null, acaoId, estado: 'pendente', dealId: i.dealId, hora, negocio: i.negocio, resultado: `Sem interesse · ${d.motivo}`, volta: null, perdido: d.motivo },
        { etapaAnterior: i.etapaId, tarefaId: i.tarefaId ?? null, origem: origemDe(i, canal), secao: secaoDoFeito(i) });
      const corpo = { op: 'mudar-etapa', dealId: i.dealId, novaEtapa: PERDIDO,
        // "O que pesou" vai sempre que escrito (14/10/26), não só no Outros
        propriedades: { motivo_do_perdido: d.motivo, ...(d.detalhe.trim() ? { observacao__desqualificado: d.detalhe.trim().slice(0, 200) } : {}) } };
      const pedido: PedidoDaAba = { op: 'perdido', corpo, feitaAcaoId: acaoId,
        contato: { canal, acaoId, clientId: i.clientId, dealId: i.dealId, ownerId, resultado: 'sem_interesse', em } };
      const rotulo = `Perdido · ${i.negocio}`;
      let desfeito = false;
      const timer = setTimeout(async () => {
        naJanela.delete(acaoId);
        if (desfeito) return;
        try {
          await enviarDaAba(pedido);
          void recarregarFeitas();
          void queryClient.invalidateQueries({ queryKey: ['fila_tarefas'] });
        } catch (e) {
          if (ehErroDeRede(e) || ehSessaoVencida(e)) {
            await enfileirar({ acaoId, tipo: 'aba-tarefas', rotulo, payload: pedido as unknown as Record<string, unknown> });
            return;
          }
          mostrar(i.dealId); tirar(i.dealId);
          Toast.mostrar(ehRecusa(e) ? `Não foi para Perdido: ${(e as Error).message}` : 'Não consegui mover para Perdido. Tente de novo.', 'erro');
        }
      }, 5000);
      naJanela.set(acaoId, { timer, rotulo, pedido });
      Toast.mostrar(`Feito · ${i.negocio} · foi para Perdido`, 'ok', { rotulo: 'Desfazer', onPress: () => { desfeito = true; clearTimeout(timer); naJanela.delete(acaoId); mostrar(i.dealId); tirar(i.dealId); } });
      return;
    }
    const volta = d.volta!;
    /* REUNIÃO OU VISITA REGISTRADA POR TELEFONE NÃO VOLTA (15/10/26): a tarefa presencial não
       se conclui por ligação (visita só se prova pelo Cheguei) e, vencida, trazia o card de volta
       em "Agora" a cada abertura. Agora ela é REMARCADA para o dia combinado — e é ela o próximo
       passo, sem nascer um segundo. */
    const remarcarPresencial = !!i.tarefaId && i.presencial;
    somar({ id: null, acaoId, estado: 'pendente', dealId: i.dealId, hora, negocio: i.negocio, resultado: rotuloComoFoi(d.comoFoi), volta },
      { etapaAnterior: i.etapaId, tarefaId: i.tarefaId ?? null, origem: origemDe(i, canal), secao: secaoDoFeito(i) });
    concluirComDesfazer({
      pedido: {
        taskId: i.tarefaId ?? `negocio-${i.dealId}`,
        nota: { dealId: i.dealId, texto: notaDaFila({ canal, comoFoi: d.comoFoi, volta, assunto: null }) },
        proximo: remarcarPresencial ? null : pedidoDaVolta({ dealId: i.dealId, volta, pessoa: i.pessoa, canal }),
        // sem tarefa aberta (quente sem passo…) ou tarefa de visita: não conclui nada
        manterAberta: !i.tarefaId || i.presencial,
        contato: { canal, acaoId, clientId: i.clientId, dealId: i.dealId, ownerId, resultado: d.comoFoi === 'decisor' ? 'decisor' : d.comoFoi, em },
      },
      rotulo: `Registro · ${i.negocio}`,
      textoToast: online ? `Feito · ${i.negocio} · volta ${diaCurto(volta)}` : 'Salvo no aparelho · sobe quando o sinal voltar',
      aoVoltar: () => { mostrar(i.dealId); tirar(i.dealId); },
      aoGravar: () => {
        if (remarcarPresencial) {
          const pedidoRemarcar: PedidoDaAba = { op: 'adiar', tarefaId: i.tarefaId!, amanha: volta, corpo: null };
          void enviarDaAba(pedidoRemarcar).catch((e) => {
            if (ehErroDeRede(e) || ehSessaoVencida(e)) return enfileirar({ acaoId: novoAcaoId(), tipo: 'aba-tarefas', rotulo: `Remarcar · ${i.negocio}`, payload: pedidoRemarcar as unknown as Record<string, unknown> });
            Toast.mostrar(`Não consegui remarcar a tarefa no HubSpot: ${String((e as Error)?.message ?? e)}`, 'erro');
            return undefined;
          });
        }
        void queryClient.invalidateQueries({ queryKey: ['fila_tarefas'] });
        void queryClient.invalidateQueries({ queryKey: ['tarefas_crm'] });
        void recarregarFeitas();
      },
    });
  }

  // Desfazer depois dos 5 s (mesmo dia): dois toques, porque arquiva a nota no HubSpot.
  async function desfazerDepois(f: Feita) {
    if (!f.id) return;
    if (!desfazendo || desfazendo.id !== f.id) {
      const id = f.id;
      setDesfazendo({ id, fase: 'confirmar' });
      setTimeout(() => setDesfazendo((x) => (x && x.id === id && x.fase === 'confirmar' ? null : x)), 5000);
      return;
    }
    if (desfazendo.fase === 'indo') return;
    setDesfazendo({ id: f.id, fase: 'indo' });
    try {
      const r = await desfazerFeita(f.id);
      mostrar(f.dealId);
      Toast.mostrar(r.falhou.length ? `Desfeito em parte · ${f.negocio} · confira no HubSpot: ${r.falhou.join(', ')}` : `Desfeito · ${f.negocio} voltou para a fila`, r.falhou.length ? 'erro' : 'ok');
      void queryClient.invalidateQueries({ queryKey: ['fila_tarefas'] });
      void queryClient.invalidateQueries({ queryKey: ['tarefas_crm'] });
    } catch (e) {
      Toast.mostrar((e as Error).message, 'erro');
    } finally {
      setDesfazendo(null);
      void recarregarFeitas();
    }
  }

  // A4: Pôr no plano. Grava na rota do dia (field_route_stops), que o espelho 0150 leva ao
  // planos_semanais do Planejamento do Cockpit. 5 s de Desfazer antes de gravar, como o Adiar.
  function porNoPlano(i: CardDaFila) {
    // sem pino: o mapa posiciona o negócio primeiro (o mesmo caminho do antigo "Ir ao mapa")
    if (!i.clientId) { if (aoPosicionar) aoPosicionar(i.dealId, i.negocio); else Toast.mostrar('Este negócio ainda não tem pino no mapa.', 'erro'); return; }
    /* A MESMA FOLHA DO PINO (06/10/26): aqui o botão punha no próximo dia de rua sem tipo, sem
       hora e sem HubSpot. Agora abre o "Marcar o próximo passo"; o atalho antigo só sobra sem ela. */
    if (aoMarcarProximoPasso) { aoMarcarProximoPasso(i.clientId); return; }
    if (!sellerId) return;
    const dia = proximoDiaDeRua();
    setPostosNoPlano((p) => ({ ...p, [i.dealId]: dia }));
    let desfeito = false;
    const timer = setTimeout(async () => {
      if (desfeito) return;
      try {
        await porNoDia(sellerId, dia, i.clientId!);
        void queryClient.invalidateQueries({ queryKey: ['plano_semana_fila'] });
      } catch {
        setPostosNoPlano((p) => { const n = { ...p }; delete n[i.dealId]; return n; });
        Toast.mostrar('Não consegui pôr no plano. Tente de novo.', 'erro');
      }
    }, 5000);
    Toast.mostrar(`No plano · ${i.negocio} · ${diaCurto(dia)}`, 'ok', { rotulo: 'Desfazer', onPress: () => {
      desfeito = true; clearTimeout(timer);
      setPostosNoPlano((p) => { const n = { ...p }; delete n[i.dealId]; return n; });
    } });
  }

  // ---- o desenho do handoff "Tarefas do App" (17/10/26): placar, 5 seções, cartão por tipo ----
  const janela = fila.length > 0 ? janelaAtual(relogio, feriados) : null;
  const atrasadosLista = visiveis.filter((i) => secaoDe(i) === 'atrasados' && i.motivo !== 'visita_sem_registro');
  // P7: o Cheguei sem Como foi vai para o TOPO de Para hoje (no servidor ele conta como atrasado)
  const hojeLista = [...visiveis.filter((i) => i.motivo === 'visita_sem_registro'), ...visiveis.filter((i) => secaoDe(i) === 'hoje')];
  const semPassoLista = visiveis.filter((i) => secaoDe(i) === 'sem_passo' && i.motivo !== 'visita_sem_registro');
  const acordosAbertosN = acordos.filter((c) => !c.feito).length;
  const nFollowups = fila.filter((i) => secaoDe(i) !== 'sem_passo').length + acordosAbertosN;
  const nQuentes = fila.filter((i) => quenteEsfriando(i, hoje)).length;
  const nSemPasso = fila.filter((i) => secaoDe(i) === 'sem_passo' && i.motivo !== 'visita_sem_registro').length;
  const noAparelho = feitas.filter((f) => f.estado === 'pendente').length;
  const horaBRT = new Date(relogio - 3 * 3600000).getUTCHours();

  const dadosDe = (i: CardDaFila): DadosDoCartao => ({
    dealId: i.dealId, negocio: i.negocio, etapaRotulo: ETAPA[i.etapaId]?.rotulo ?? 'Etapa', diasNaEtapa: i.diasNaEtapa ?? null,
    quente: quenteEsfriando(i, hoje), tipoPrazo: i.venceu ? 'vencido' : i.prazo === hoje ? 'hoje' : 'outro',
    prazo: i.prazo, horaPrazo: i.horaPrazo ?? null, hoje, combinadoTexto: i.assunto ?? null,
    /* O VERBO SEGUE A TAREFA, NÃO A ETAPA (produção, 17/10/26): negócio em Visita com tarefa "Follow-up
       - Ligar…" vinha com a nota "Visita só conclui com o Cheguei" e o Pôr no plano sugerido. Só tarefa
       presencial (visita/reunião) é visita; o resto sugere ligar (ou WhatsApp, se a tarefa diz). */
    sugerido: i.presencial || i.verbo === 'Registrar' ? 'Pôr no plano'
      : i.verbo === 'WhatsApp' || /whats/i.test(i.assunto ?? '') ? 'WhatsApp'
      : i.telefone ? 'Ligar' : 'Pôr no plano',
    visita: i.presencial || i.verbo === 'Registrar', temTelefone: !!i.telefone,
  });
  const registroDe = (i: CardDaFila, grande = false) => (
    <RegistroInline key={i.dealId} item={i} hoje={hoje} feriados={feriados} grande={grande} discouEm={discou[i.dealId] ?? null}
      aoSalvar={(d) => salvar(i, d)} aoSair={() => { pedidoDeSaidaAtual = null; setAberto(null); }} />
  );
  const cartao = (i: CardDaFila) => (
    <View key={i.dealId} nativeID={`fila-${i.dealId}`}>
      {i.motivo === 'visita_sem_registro' ? (
        <CartaoFaltaComoFoi negocio={i.negocio} linha={i.porque} aoRegistrar={() => { if (i.clientId) aoRegistrarVisita(i.clientId); }} />
      ) : (
        <CartaoCheio d={dadosDe(i)} destaque={veioDe?.deal === i.dealId || (layout.ehDesktop && selecionado === i.dealId)} veioDaAgenda={veioDe?.deal === i.dealId && veioDe.de === 'agenda'}
          aoLigar={() => discar(i, 'ligacao')} aoWhatsApp={() => discar(i, 'whatsapp')} aoPorNoPlano={() => porNoPlano(i)}>
          {aberto === i.dealId && (
            <View style={{ gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar o registro" onPress={fecharCard} style={[s.botaoSec, { alignSelf: 'flex-end' }]}><Text style={s.botaoSecTexto}>Fechar</Text></Pressable>
              {registroDe(i)}
            </View>
          )}
        </CartaoCheio>
      )}
    </View>
  );
  const secao = (rotulo: string, lista: CardDaFila[], vazio: string, ponto: string, sub?: string | null, cor?: string) => (
    <View style={{ gap: 10 }}>
      <CabecalhoDaSecao rotulo={rotulo} n={lista.length} sub={sub} ponto={ponto} cor={cor} />
      {lista.length ? lista.map(cartao) : <SecaoVazia texto={vazio} />}
    </View>
  );
  const semPassoBloco = (
    <View style={{ gap: 8 }}>
      <CabecalhoDaSecao rotulo="SEM PRÓXIMO PASSO" n={semPassoLista.length} sub={semPassoLista.length ? 'a regra é zero' : null}
        ponto={semPassoLista.length ? 'var(--vermelho-acao)' : 'var(--verde-acao)'} cor={semPassoLista.length ? 'var(--vermelho-texto)' : 'var(--ok-texto)'} />
      {semPassoLista.length ? semPassoLista.map((i) => (
        <View key={i.dealId} nativeID={`fila-${i.dealId}`}>
          <CartaoMini negocio={i.negocio} et={`${ETAPA[i.etapaId]?.rotulo ?? 'Etapa'} · ${i.ultimoContatoTexto}`} aoMarcar={() => porNoPlano(i)} />
        </View>
      )) : <SecaoVazia texto="zero · funil limpo" />}
    </View>
  );
  const acordosBloco = (
    <View style={{ gap: 8 }}>
      <CabecalhoDaSecao rotulo="COMBINADOS COM O GESTOR" n={acordosAbertosN} ponto="var(--info-text)" />
      {acordos.length === 0 ? <SecaoVazia texto="nenhum combinado aberto" /> : acordos.map((c) => (
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
  );
  /* FEITO HOJE: a 5ª seção, aberta (P3), com a origem de cada um (P7) */
  const feitasBloco = (
    <View style={{ gap: 0 }}>
      <View style={{ paddingBottom: 8 }}><CabecalhoDaSecao rotulo="FEITO HOJE" n={nFeitas} sub={feitas.length ? 'Desfazer até o fim do dia' : null} ponto="var(--verde-acao)" /></View>
      {feitas.length === 0 ? <SecaoVazia texto="nada ainda" /> : feitas.map((f) => (
        <LinhaFeitoHoje key={f.acaoId} hora={f.hora} negocio={f.negocio}
          resultado={`${f.resultado}${f.perdido ? ' → Perdido' : f.volta ? ` → volta ${diaCurto(f.volta)}` : ''}`}
          origem={f.origem ?? (f.estado === 'pendente' ? null : 'fila')} noAparelho={f.estado === 'pendente' && !online}
          // o desfecho no mapa se desfaz lá (a etapa), não aqui
          acao={f.estado === 'gravada' && f.id && f.origem !== 'desfecho' ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Desfazer o registro de ${f.negocio}`} onPress={() => void desfazerDepois(f)}
              disabled={desfazendo?.id === f.id && desfazendo.fase === 'indo'} style={[s.botaoSec, desfazendo?.id === f.id && { borderColor: 'var(--vermelho-acao)' }]}>
              <Text style={[s.botaoSecTexto, desfazendo?.id === f.id && { color: 'var(--vermelho-acao)' }]}>
                {desfazendo?.id === f.id ? (desfazendo.fase === 'indo' ? 'Desfazendo…' : 'Confirmar') : 'Desfazer'}
              </Text>
            </Pressable>
          ) : f.estado === 'pendente' ? <Text style={s.feitaVolta}>subindo</Text> : undefined} />
      ))}
    </View>
  );

  // o cartão de ligar os avisos (P6): só enquanto não estão ligados, e some se a pessoa fechar
  const [cartaoPushFechado, setCartaoPushFechado] = useState(() => { try { return window.localStorage.getItem('fila-push-cartao-fechado') === '1'; } catch { return false; } });
  const cartaoPush = !cartaoPushFechado && (estadoPush === 'desligado' || estadoPush === 'precisa_instalar') ? (
    <View style={s.cartaoPush}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={s.cartaoPushT}>Avisos da fila no celular</Text>
        <Text style={s.ajudaMiuda}>{estadoPush === 'precisa_instalar'
          ? 'No iPhone os avisos só chegam com o app na tela de início: Compartilhar › Adicionar à Tela de Início.'
          : 'Até 4 por dia: quente esfriando, hora das ligações e o fim do dia. Nada depois das 19h.'}</Text>
      </View>
      <View style={{ gap: 6 }}>
        {estadoPush === 'desligado' && (
          <Pressable accessibilityRole="button" disabled={ligandoPush} onPress={async () => {
            setLigandoPush(true);
            try { const e = await ligarPush(); setEstadoPush(e); Toast.mostrar(e === 'ligado' ? 'Avisos ligados · mandei um de teste' : e === 'negado' ? 'O celular recusou os avisos. Libere nas configurações do navegador.' : 'Os avisos não ligaram.', e === 'ligado' ? 'ok' : 'erro'); }
            catch (err) { Toast.mostrar((err as Error).message, 'erro'); }
            finally { setLigandoPush(false); }
          }} style={s.cartaoPushBotao}><Text style={s.cartaoPushBotaoT}>{ligandoPush ? 'Ligando…' : 'Ligar'}</Text></Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={() => { setCartaoPushFechado(true); try { window.localStorage.setItem('fila-push-cartao-fechado', '1'); } catch { /* sem armazenamento */ } }} style={s.botaoSec}><Text style={s.botaoSecTexto}>Agora não</Text></Pressable>
      </View>
    </View>
  ) : null;

  /* O ESTADO DOS AVISOS FICA SEMPRE NO FIM DA ABA (iPhone, 17/10/26): fechado o cartão, não havia
     mais como ligar, e nada dizia por que o aviso não chegava. */
  const linhaDosAvisos = estadoPush && estadoPush !== 'ligado' ? (
    <View style={s.linhaAvisos}>
      <Text style={[s.ajudaMiuda, { flex: 1 }]}>{estadoPush === 'desligado' ? 'Avisos da fila neste celular: desligados.'
        : estadoPush === 'precisa_instalar' ? 'Avisos no iPhone: abra pelo ícone do app na tela de início (Compartilhar › Adicionar à Tela de Início).'
        : estadoPush === 'negado' ? 'O celular bloqueou os avisos do app. No iPhone: Ajustes › Notificações › Takeat; no Android: configurações do site no Chrome.'
        : 'Este navegador não recebe avisos. No iPhone, precisa do iOS 16.4 ou mais novo e do app aberto pela tela de início.'}</Text>
      {estadoPush === 'desligado' && (
        <Pressable accessibilityRole="button" disabled={ligandoPush} onPress={async () => {
          setLigandoPush(true);
          try { const e = await ligarPush(); setEstadoPush(e); Toast.mostrar(e === 'ligado' ? 'Avisos ligados · mandei um de teste' : e === 'negado' ? 'O celular recusou os avisos.' : 'Os avisos não ligaram.', e === 'ligado' ? 'ok' : 'erro'); }
          catch (err) { Toast.mostrar((err as Error).message, 'erro'); }
          finally { setLigandoPush(false); }
        }} style={s.cartaoPushBotao}><Text style={s.cartaoPushBotaoT}>{ligandoPush ? 'Ligando…' : 'Ligar'}</Text></Pressable>
      )}
    </View>
  ) : null;
  const filtros = (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {([['tudo', 'Todas'], ['ligar', 'Ligar'], ['visitar', 'Visitar'], ['whatsapp', 'WhatsApp'], ...(layout.ehDesktop ? [['perto', 'Perto de mim']] : [])] as Array<[Filtro, string]>).map(([f, r]) => (
        <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filtro === f }} accessibilityLabel={`${r}: ${filaMedida ? contagem(f) : '—'}`} onPress={() => setFiltro(f)}
          style={[s.chipFiltro, filtro === f && s.chipFiltroAtivo]}>
          <Text style={[s.chipFiltroTexto, filtro === f && s.chipFiltroTextoAtivo]}>{r}</Text>
        </Pressable>
      ))}
    </View>
  );

  const barraDaAgenda = veioDe?.de === 'agenda' ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Voltar para a Agenda" onPress={() => { setVeioDe(null); aoVoltarAgenda?.(); }} style={s.barraAgenda}>
      <Text style={s.barraAgendaT} numberOfLines={1}>{`‹ Agenda · ${veioDe.rotulo ?? fila.find((x) => x.dealId === veioDe.deal)?.negocio ?? ''}`}</Text>
    </Pressable>
  ) : null;

  let corpo: React.ReactNode;
  if (q.isLoading && !q.data) {
    corpo = (
      <View style={{ gap: 10 }}>
        <Text style={s.ajuda}>Lendo seus negócios no HubSpot…</Text>
        {[0, 1, 2, 3, 4].map((k) => <View key={k} style={s.esqueleto} />)}
      </View>
    );
  } else if (q.isError && !q.data) {
    corpo = (
      <View style={s.estadoCaixa}>
        <Text style={s.estadoTitulo}>Não consegui ler suas tarefas agora</Text>
        <Text style={s.ajuda}>{online ? 'O HubSpot não respondeu. Puxe para baixo para tentar de novo.' : 'Sem sinal. As tarefas voltam quando o sinal voltar.'}</Text>
        <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => q.refetch()}><Text style={s.botaoSecTexto}>Tentar de novo</Text></Pressable>
      </View>
    );
  } else if (q.data?.semMedicao) {
    corpo = <View style={s.estadoCaixa}><Text style={s.ajuda}>{q.data.semMedicao}</Text></View>;
  } else if (zerada) {
    const amanha = proximoDiaUtil(hoje, 1, feriados);
    const nomeDia = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(amanha + 'T12:00:00Z').getUTCDay()];
    corpo = (
      <FilaZerada total={nFeitas} zerouAs={feitas[0]?.hora ?? null} pct={meuPct} sequencia={seqQ.data?.atual ?? null} recorde={seqQ.data?.recorde ?? null}
        amanha={`${nomeDia} ${amanha.slice(8, 10)}/${amanha.slice(5, 7)}`} />
    );
  } else {
    corpo = (
      <View style={{ gap: 18 }}>
        {filtros}
        {visiveis.length === 0 && filtro !== 'tudo' ? (
          <View style={s.estadoCaixa}>
            <Text style={s.ajuda}>{`Nada em '${{ tudo: 'Todas', ligar: 'Ligar', visitar: 'Visitar', whatsapp: 'WhatsApp', perto: 'Perto de mim' }[filtro]}' agora.`}</Text>
            <Pressable accessibilityRole="button" style={s.botaoSec} onPress={() => setFiltro('tudo')}><Text style={s.botaoSecTexto}>Volte para Todas</Text></Pressable>
          </View>
        ) : (
          <>
            {secao('ATRASADOS', atrasadosLista, 'nenhum atrasado', 'var(--vermelho-acao)', atrasadosLista.length ? 'o mais antigo primeiro' : null, 'var(--vermelho-texto)')}
            {secao('PARA HOJE', hojeLista, 'nada vence hoje', 'var(--tint-amber-text)')}
            {acordosBloco}
            {semPassoBloco}
          </>
        )}
      </View>
    );
  }

  const topo = !zerada && filaMedida && !q.data?.semMedicao ? (
    <View style={{ gap: 12 }}>
      {janela && <BlocoHoraDasLigacoes faltamMin={janela.faltamMin} decorrido={janela.decorrido} de={janela.de} ate={janela.ate} followups={nFollowups} quentes={nQuentes} />}
      <PlacarDoDia feitos={nFeitas} total={totalDia} pct={meuPct} media={mediaPct} semPasso={nSemPasso}
        sub={fila.length === 0 ? 'tudo em dia' : horaBRT >= 18 ? `faltam ${fila.length} · passou das 18h` : `faltam ${fila.length} · zere até 18h`}
        subCor={horaBRT >= 18 && fila.length > 0 ? 'var(--vermelho-texto)' : undefined} />
    </View>
  ) : null;

  const lista = (
    <ScrollView style={[{ flex: 1 }, layout.ehDesktop && { width: '100%', maxWidth: 720 }]} contentContainerStyle={s.lista}
      refreshControl={<RefreshControl refreshing={q.isFetching && !!q.data} onRefresh={() => q.refetch()} />}>
      {barraDaAgenda}
      {!online && (
        <View style={s.semSinal}><Text style={s.semSinalTexto}>{`Sem sinal · a fila segue funcionando${noAparelho ? ` · ${noAparelho} ${noAparelho === 1 ? 'registro guardado' : 'registros guardados'} no aparelho` : ''}. Sobe para o HubSpot sozinho quando o sinal voltar.`}</Text></View>
      )}
      {cartaoPush}
      {topo}
      {corpo}
      {feitasBloco}
      {linhaDosAvisos}
    </ScrollView>
  );

  // PC: a coluna de 320 px com as janelas do dia e as ligações da agenda de hoje
  const ligacoesDeHoje = fila.filter((i) => i.prazo === hoje && !!i.horaPrazo && (i.verbo === 'Ligar' || i.verbo === 'WhatsApp'))
    .sort((a, b) => (a.horaPrazo ?? '').localeCompare(b.horaPrazo ?? ''));
  const colunaDireita = (
    <ScrollView style={s.colunaDireita} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={s.blocoPainel}>
        <Text style={s.rotuloSecao}>HORAS DAS LIGAÇÕES</Text>
        {!ehDiaUtil(hoje, feriados) ? <Text style={s.ajudaMiuda}>Hoje não tem hora das ligações: fim de semana ou feriado.</Text> : janelasDoDia(relogio).map((j) => {
          const feitasNa = feitas.filter((f) => f.hora >= j.de && f.hora < j.ate).length;
          return (
            <View key={j.de} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
              <Text style={[s.feitaNegocio, { width: 104 }]}>{`${j.de} – ${j.ate}`}</Text>
              <Text style={[s.ajudaMiuda, j.estado === 'agora' && { color: 'var(--vermelho-texto)', fontWeight: '700' }, j.estado === 'feita' && { color: 'var(--ok-texto)' }]}>
                {j.estado === 'agora' ? `agora · faltam ${j.faltamMin} min` : j.estado === 'feita' ? `feita · ${feitasNa} ${feitasNa === 1 ? 'ligação' : 'ligações'}` : 'próxima'}
              </Text>
            </View>
          );
        })}
        <Text style={s.ajudaMiuda}>Na janela, a faixa aparece no Mapa e na Agenda. Fora dela, some.</Text>
      </View>
      <View style={s.blocoPainel}>
        <Text style={s.rotuloSecao}>AGENDA DE HOJE · LIGAÇÕES</Text>
        {ligacoesDeHoje.length === 0 ? <Text style={s.ajudaMiuda}>Nenhuma ligação com hora marcada hoje.</Text> : ligacoesDeHoje.map((i) => (
          <View key={i.dealId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}>
            <Text style={[s.feitaNegocio, { width: 44 }]}>{i.horaPrazo}</Text>
            <Text style={[s.ajudaMiuda, { flex: 1 }]} numberOfLines={2}>{`${i.verbo} · ${i.negocio}`}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${i.negocio}`} onPress={() => setSelecionado(i.dealId)} style={s.botaoSec}><Text style={s.botaoSecTexto}>abrir</Text></Pressable>
          </View>
        ))}
        <Text style={s.ajudaMiuda}>Ligação e WhatsApp da Agenda abrem aqui na fila.</Text>
      </View>
    </ScrollView>
  );

  return (
    <View style={s.tela}>
      {layout.ehDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>{lista}</View>
          {colunaDireita}
        </View>
      ) : lista}
    </View>
  );
}

const s = StyleSheet.create({
  linhaAvisos: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', padding: 12 },
  cartaoPush: { borderRadius: 16, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cartaoPushT: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  cartaoPushBotao: { minHeight: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  cartaoPushBotaoT: { fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' },
  barraAgenda: { minHeight: 44, borderRadius: 12, backgroundColor: 'var(--surface-3)', paddingHorizontal: 14, justifyContent: 'center' },
  barraAgendaT: { fontSize: 13.5, fontWeight: '700', color: 'var(--text)' },
  colunaDireita: { width: 320, flexGrow: 0, borderLeftWidth: 1, borderLeftColor: 'var(--border-soft)' },
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  colunaFila: { width: 440, borderRightWidth: 1, borderRightColor: 'var(--border-soft)' },
  painel: { flex: 1 },
  topo: { paddingHorizontal: 16, paddingTop: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)', backgroundColor: 'var(--bg)' },
  topoA: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  topoTitulo: { fontSize: 20, fontWeight: '700', color: 'var(--text)' },
  topoSub: { fontSize: 12, color: 'var(--text-muted)' },
  topoPlacar: { fontSize: 16, fontWeight: '700', color: 'var(--text)', flexShrink: 1 },
  topoSubPulso: { color: 'var(--vermelho-acao)', transform: [{ scale: 1.08 }] },
  botaoFoco: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center' },
  botaoFocoTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  topoB: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 22 },
  mrr: { fontSize: 13, color: 'var(--text-muted)', flexShrink: 1 },
  abaAlvo: { minHeight: 44, justifyContent: 'center' },
  abaTexto: { fontSize: 13, color: 'var(--text-muted)' },
  abaAtiva: { color: 'var(--text)', fontWeight: '700', textDecorationLine: 'underline', textDecorationColor: 'var(--vermelho-acao)' },
  chipsFiltro: { gap: 8, paddingBottom: 10 },
  /* a célula cresce a partir do rótulo (não quatro iguais): o "WhatsApp" cortava em "WhatsA…" a 390 px */
  filtrosGrade: { flexDirection: 'row', gap: 6 },
  filtroCelula: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, height: 52, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filtroRotulo: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  filtroN: { fontSize: 12, fontWeight: '500', color: 'var(--text-muted)', marginTop: 1 },
  cardTituloPorque: { fontSize: 12, color: 'var(--text-faint)' },
  botaoTelefone: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: 'var(--border)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  botaoTelefoneTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  chipFiltro: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center', backgroundColor: 'var(--surface-2)' },
  chipFiltroAtivo: { borderColor: 'var(--text)', backgroundColor: 'var(--text)' },
  chipFiltroTexto: { fontSize: 13.5, fontWeight: '700', color: 'var(--text)' },
  chipFiltroTextoAtivo: { color: 'var(--bg)' },
  chipFiltroN: { color: 'var(--text-muted)', fontWeight: '500' },
  lista: { padding: 16, gap: 18, paddingBottom: 120 },
  semSinal: { borderRadius: 12, padding: 12, backgroundColor: 'var(--tint-amber)', borderWidth: 1, borderColor: 'var(--tint-amber-border)' },
  semSinalTexto: { fontSize: 13, color: 'var(--tint-amber-text)', fontWeight: '600' },
  grupoCab: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grupoRotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: 'var(--text-muted)' },
  grupoN: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: 'var(--surface-3)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  grupoNTexto: { fontSize: 11, fontWeight: '700', color: 'var(--text)' },
  grupoLinha: { flex: 1, height: 1, backgroundColor: 'var(--border-soft)' },
  grupoExtra: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  grupoAjuda: { fontSize: 12, color: 'var(--text-faint)' },
  secaoRecolhida: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  botaoAdiar: { minHeight: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center', marginLeft: 'auto' },
  botaoAdiarTexto: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  cardCaixa: { position: 'relative' },
  fundoGesto: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 18 },
  fundoGestoTexto: { fontSize: 14, fontWeight: '700' },
  card: { minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', padding: 12, gap: 4 },
  cardAberto: { borderColor: 'var(--vermelho-acao)' },
  cardSelecionado: { borderColor: 'var(--text)' },
  cardTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitulo: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: 'var(--text)' },
  /* o nome, a etapa e a temperatura quebram linha em vez de espremer o nome em "Oda…" (390 px) */
  cardLinha2: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 3, minWidth: 0 },
  cardNegocio: { fontSize: 12, color: 'var(--text-muted)', flexShrink: 1, maxWidth: '100%' },
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

