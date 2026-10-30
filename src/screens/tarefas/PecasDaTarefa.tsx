// As peças da aba Tarefas do handoff "Tarefas por dia" (20/10/2026), com as medidas das pranchas:
// a fileira de dias (P1), o placar e os 3 blocos numerados de Hoje (P3), o cartão de tarefa ÚNICO
// (P3 · 2.3 do prompt), a linha de fim, os recolhidos, a faixa da janela das ligações, o Hoje zerado,
// o dia livre e a linha do Feito hoje. Cores só dos tokens do app (public/index.html), no mesmo
// mapa do CartaoDaFila: nenhuma cor nova.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  IconArrowFoward, IconCalendar, IconCall, IconCheck, IconChevronRight, IconClock, IconUser, IconWarning, IconWhatsapp,
} from '../../components/icons';

const T = {
  painel: 'var(--surface)', card: 'var(--surface-2)', chip: 'var(--surface-3)', line: 'var(--border)', line2: 'var(--stroke-strong)',
  fg: 'var(--text)', mute: 'var(--text-muted)', dim: 'var(--text-subtle)', inv: 'var(--text)', invFg: 'var(--bg)',
  acao: 'var(--vermelho-acao)', vtx: 'var(--vermelho-texto)', erroLine: 'var(--tint-red-border)', verde: 'var(--verde-acao)',
  okBg: 'var(--ok-fundo)', okFg: 'var(--ok-texto)', avFg: 'var(--tint-amber-text)', gpsTx: 'var(--info-text)',
};

// ---- a fileira de dias (P1 · 2.1) ------------------------------------------------------------
export type DiaDaFileira = { chave: string; rotulo: string; n: number | null; data: string; atrasado?: boolean; hoje?: boolean };
export function FileiraDeDias({ dias, ativo, aoEscolher }: { dias: DiaDaFileira[]; ativo: string; aoEscolher: (chave: string) => void }) {
  return (
    <View style={st.fileira} accessibilityRole="tablist">
      {dias.map((d) => {
        const sel = d.chave === ativo;
        const zero = d.n === 0;
        return (
          <Pressable key={d.chave} accessibilityRole="tab" accessibilityState={{ selected: sel }}
            accessibilityLabel={`${d.rotulo}: ${d.n == null ? 'lendo' : `${d.n} ${d.n === 1 ? 'tarefa' : 'tarefas'}`}${d.atrasado ? ', com atrasado' : ''}`}
            onPress={() => aoEscolher(d.chave)} style={[st.dia, sel && st.diaSel]}>
            {d.atrasado && <View style={st.diaPonto} />}
            <Text style={[st.diaRot, sel && { color: T.invFg }]}>{d.rotulo}</Text>
            <Text style={[st.diaN, sel && { color: T.invFg }]}>{d.n == null ? '—' : d.n}</Text>
            <Text style={[st.diaData, sel ? { color: T.invFg, opacity: 0.75 } : zero ? { color: d.hoje ? T.okFg : T.avFg, fontWeight: '600' } : null]}>
              {zero ? (d.hoje ? 'zerado' : 'livre') : d.data}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- o placar (P3) ------------------------------------------------------------------------
function Anel({ fracao, tamanho, traco }: { fracao: number; tamanho: number; traco: number }) {
  const r = (tamanho - traco) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fracao));
  return React.createElement('svg', { width: tamanho, height: tamanho, viewBox: `0 0 ${tamanho} ${tamanho}`, style: { transform: 'rotate(-90deg)', flexShrink: 0 } },
    React.createElement('circle', { cx: tamanho / 2, cy: tamanho / 2, r, fill: 'none', stroke: T.line, strokeWidth: traco }),
    f > 0 ? React.createElement('circle', { cx: tamanho / 2, cy: tamanho / 2, r, fill: 'none', stroke: T.verde, strokeWidth: traco, strokeLinecap: 'round', strokeDasharray: `${c * f} ${c}` }) : null);
}
export function PlacarTarefas({ feitas, total, faltam, soAtrasados }: { feitas: number; total: number; faltam: number; soAtrasados: number | null }) {
  return (
    <View style={st.placar}>
      <Anel fracao={total ? feitas / total : 0} tamanho={52} traco={6} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={st.placarN}>{`${feitas} de ${total}`}<Text style={st.placarFeitas}> feitas hoje</Text></Text>
        {soAtrasados != null
          ? <Text style={[st.placarSub, { color: T.vtx }]}>{`${soAtrasados} ${soAtrasados === 1 ? 'atrasado esperando' : 'atrasados esperando'} · comece pelo bloco 2`}</Text>
          : <Text style={st.placarSub}>{`faltam ${faltam} · de cima para baixo, termina no bloco 3`}</Text>}
      </View>
    </View>
  );
}

// ---- os blocos (P3) -------------------------------------------------------------------------
export function CabecalhoDeBloco({ numero, titulo, n, legenda, alerta }: { numero: 1 | 2 | 3; titulo: string; n: number; legenda: string; alerta?: boolean }) {
  const vazio = n === 0;
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={[st.disco, vazio && { backgroundColor: T.okBg }]}>
        {vazio ? <IconCheck width={14} height={14} fill={T.okFg} /> : <Text style={st.discoT}>{numero}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={[st.blocoT, alerta && n > 0 && { color: T.vtx }]}>{`${titulo} · ${n}`}</Text>
        <Text style={st.blocoL}>{legenda}</Text>
      </View>
    </View>
  );
}
export function BlocoVazio({ texto }: { texto: string }) {
  return <View style={st.vazio}><Text style={st.vazioT}>{texto}</Text></View>;
}
export function LinhaDeFim({ zerada }: { zerada: boolean }) {
  return (
    <View style={st.fim} accessibilityRole="text">
      <View style={st.fimFio} />
      <Text style={st.fimT}>{zerada ? 'FILA DE HOJE ZERADA' : 'FIM DA FILA DE HOJE'}</Text>
      <View style={st.fimFio} />
    </View>
  );
}
export function Recolhido({ titulo, legenda, n, aberto, aoAlternar, children }: {
  titulo: string; legenda: string; n: number; aberto: boolean; aoAlternar: () => void; children?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: aberto }} accessibilityLabel={`${titulo}: ${n}`} onPress={aoAlternar} style={st.recolhido}>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text style={st.recolhidoT}>{titulo}</Text>
          <Text style={st.recolhidoL} numberOfLines={2}>{legenda}</Text>
        </View>
        <View style={st.pilula}>
          <Text style={st.pilulaT}>{n}</Text>
          <View style={{ transform: [{ rotate: aberto ? '90deg' : '0deg' }] }}><IconChevronRight width={14} height={14} fill={T.fg} /></View>
        </View>
      </Pressable>
      {aberto && children}
    </View>
  );
}

// ---- a hora das ligações, dentro do bloco 2 (P3) ----------------------------------------------
export function FaixaJanela({ ate, faltamMin, decorrido }: { ate: string; faltamMin: number; decorrido: number }) {
  return (
    <View style={st.janela}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: T.acao }} />
        <Text style={st.janelaT}>{`Hora das ligações · até ${ate}`}</Text>
        <Text style={st.janelaF}>{`faltam ${faltamMin} min`}</Text>
      </View>
      <View style={st.janelaTrilho}><View style={{ width: `${Math.round(decorrido * 100)}%` as unknown as number, height: '100%', backgroundColor: T.acao }} /></View>
    </View>
  );
}

// ---- o cartão de tarefa ÚNICO (2.3) -------------------------------------------------------
export type BotaoDoCartao = { rotulo: string; icone: 'ligar' | 'whatsapp' | 'plano' | 'passo' | 'remarcar' | 'registrar'; cheio?: boolean; desligado?: boolean; onPress: () => void };
export type DadosCartaoTarefa = {
  id: string; nome: string; quente: boolean; daAgenda?: boolean; etapaRotulo: string; etapaCor: string; contato: string | null;
  quando: { texto: string; tom: 'erro' | 'aviso' | 'mute' | 'info' | 'ok'; icone: 'alerta' | 'relogio' | 'pessoa' | 'check' };
  rotuloCaixa: string; textoCaixa: string; nota?: string | null; atrasado?: boolean; destaque?: boolean; botoes: BotaoDoCartao[];
};
const TOM: Record<DadosCartaoTarefa['quando']['tom'], string> = { erro: T.vtx, aviso: T.avFg, mute: T.mute, info: T.gpsTx, ok: T.okFg };
function IconeDoBotao({ k, cor }: { k: BotaoDoCartao['icone']; cor: string }) {
  if (k === 'ligar') return <IconCall width={15} height={15} fill={cor} />;
  if (k === 'whatsapp') return <IconWhatsapp width={15} height={15} fill={cor} />;
  if (k === 'passo') return <IconArrowFoward width={15} height={15} fill={cor} />;
  if (k === 'registrar') return <IconCheck width={15} height={15} fill={cor} />;
  return <IconCalendar width={15} height={15} fill={cor} />;
}
export function CartaoTarefa({ d, children }: { d: DadosCartaoTarefa; children?: React.ReactNode }) {
  const cor = TOM[d.quando.tom];
  const IconeQ = d.quando.icone === 'alerta' ? IconWarning : d.quando.icone === 'pessoa' ? IconUser : d.quando.icone === 'check' ? IconCheck : IconClock;
  return (
    <View nativeID={`fila-${d.id}`} style={[st.cartao, d.atrasado && { borderWidth: 1.5, borderColor: T.erroLine }, d.destaque && st.cartaoDestaque]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text style={st.nome} numberOfLines={2}>{d.nome}</Text>
        {(d.quente || d.daAgenda) && (
          <View style={{ flexDirection: 'row', gap: 4, flexShrink: 0 }}>
            {d.quente && <View style={st.seloQuente}><Text style={st.seloQuenteT}>QUENTE</Text></View>}
            {d.daAgenda && <View style={st.seloAgenda}><Text style={st.seloAgendaT}>da Agenda</Text></View>}
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <View style={st.etapa}><View style={[st.etapaPonto, { backgroundColor: d.etapaCor }]} /><Text style={st.etapaT}>{d.etapaRotulo}</Text></View>
        {!!d.contato && <Text style={st.contato}>{d.contato}</Text>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <IconeQ width={14} height={14} fill={cor} />
        <Text style={[st.quando, { color: cor }]}>{d.quando.texto}</Text>
      </View>
      <View style={st.caixa}>
        <Text style={st.caixaK}>{d.rotuloCaixa.toUpperCase()}</Text>
        <Text style={st.caixaT}>{d.textoCaixa}</Text>
      </View>
      {!!d.nota && <Text style={st.nota}>{d.nota}</Text>}
      <View style={st.botoes}>
        {d.botoes.map((b) => (
          <Pressable key={b.rotulo} accessibilityRole="button" accessibilityLabel={`${b.rotulo}: ${d.nome}`} disabled={b.desligado} onPress={b.onPress}
            style={[st.botao, b.cheio && st.botaoCheio, b.desligado && { opacity: 0.45 }]}>
            <IconeDoBotao k={b.icone} cor={b.cheio ? '#FFFFFF' : 'var(--text)'} />
            <Text style={[st.botaoT, b.cheio && { color: '#FFFFFF' }]} numberOfLines={2}>{b.rotulo}</Text>
          </Pressable>
        ))}
      </View>
      {children}
    </View>
  );
}

// ---- Hoje zerado (P3) ---------------------------------------------------------------------
export function HojeZerado({ feitas, zerouAs, nAmanha, aoVerAmanha }: { feitas: number; zerouAs: string | null; nAmanha: number | null; aoVerAmanha: () => void }) {
  return (
    <View style={st.zerado}>
      <View style={{ width: 72, height: 72 }}>
        <Anel fracao={1} tamanho={72} traco={7} />
        <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}><IconCheck width={30} height={30} fill={T.okFg} /></View>
      </View>
      <Text style={st.zeradoT}>Hoje zerado</Text>
      <Text style={st.zeradoS}>{`${feitas} de ${feitas}${zerouAs ? ` · zerou às ${zerouAs}` : ''}`}</Text>
      <Text style={st.zeradoF}>Todo negócio de hoje saiu com o próximo passo datado ou com o motivo do Perdido.</Text>
      <Pressable accessibilityRole="button" onPress={aoVerAmanha} style={st.zeradoBotao}>
        <Text style={st.zeradoBotaoT}>{`Ver amanhã${nAmanha != null ? ` · ${nAmanha} ${nAmanha === 1 ? 'tarefa' : 'tarefas'}` : ''}`}</Text>
      </Pressable>
    </View>
  );
}

// ---- dia sem nada (P1) -------------------------------------------------------------------
export function DiaLivre({ nomeDia }: { nomeDia: string }) {
  return (
    <View style={st.livre}>
      <IconCalendar width={20} height={20} fill={T.mute} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={st.livreT}>{`Nenhuma tarefa vence na ${nomeDia}`}</Text>
        <Text style={st.livreS}>Bom dia para limpar o funil: marque o passo de quem ficou sem, ou ponha visitas no plano.</Text>
      </View>
    </View>
  );
}

// ---- a linha do Feito hoje (2.3) ----------------------------------------------------------
export function LinhaFeitoTarefa({ hora, negocio, resultado, perdido, selos, noAparelho, agora, acao }: {
  hora: string; negocio: string; resultado: string; perdido?: boolean; selos?: string[]; noAparelho?: boolean; agora?: boolean; acao?: React.ReactNode;
}) {
  return (
    <View style={[st.feita, agora && { backgroundColor: T.okBg }]}>
      <Text style={st.feitaH}>{hora}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={st.feitaN}>{negocio}</Text>
        <Text style={[st.feitaR, { color: perdido ? T.mute : T.okFg }]}>{resultado}</Text>
        {!!selos?.length && (
          <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
            {selos.map((x) => <View key={x} style={st.selo}><Text style={st.seloT}>{x}</Text></View>)}
          </View>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {noAparelho ? <View style={st.selo}><Text style={st.seloT}>no aparelho</Text></View> : <IconCheck width={18} height={18} fill={T.okFg} />}
        {acao}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  // 6 colunas iguais (repeat(6, minmax(0,1fr))): flex 1 1 0 com minWidth 0 — o RN-web não garante grid
  fileira: { flexDirection: 'row', gap: 5 },
  dia: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, minHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: T.line, backgroundColor: T.painel, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 1, position: 'relative' },
  diaSel: { backgroundColor: T.inv, borderColor: T.inv },
  diaPonto: { position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: T.acao },
  diaRot: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: T.mute },
  diaN: { fontSize: 16, fontWeight: '800', color: T.fg, fontVariant: ['tabular-nums'] },
  diaData: { fontSize: 10, fontWeight: '500', color: T.mute },
  placar: { borderRadius: 16, backgroundColor: T.painel, borderWidth: 1, borderColor: T.line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  placarN: { fontSize: 21, fontWeight: '800', lineHeight: 26, color: T.fg },
  placarFeitas: { fontSize: 13.5, fontWeight: '600', color: T.mute },
  placarSub: { fontSize: 12, fontWeight: '600', lineHeight: 16, color: T.mute },
  disco: { width: 28, height: 28, borderRadius: 14, backgroundColor: T.inv, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  discoT: { fontSize: 13, fontWeight: '800', color: T.invFg },
  blocoT: { fontSize: 15, fontWeight: '700', lineHeight: 20, color: T.fg },
  blocoL: { fontSize: 11.5, fontWeight: '500', lineHeight: 16, color: T.dim },
  vazio: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: T.okFg, justifyContent: 'center', paddingHorizontal: 12 },
  vazioT: { fontSize: 12.5, fontWeight: '600', color: T.okFg },
  fim: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  fimFio: { flex: 1, height: 1, backgroundColor: T.line },
  fimT: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.9, color: T.dim },
  recolhido: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: T.line, backgroundColor: T.painel, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recolhidoT: { fontSize: 14, fontWeight: '700', color: T.fg },
  recolhidoL: { fontSize: 11.5, fontWeight: '500', color: T.dim },
  pilula: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: T.chip },
  pilulaT: { fontSize: 13, fontWeight: '800', color: T.fg },
  janela: { borderRadius: 14, backgroundColor: T.inv, paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  janelaT: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: '700', color: T.invFg },
  janelaF: { fontSize: 12.5, fontWeight: '700', color: T.invFg },
  janelaTrilho: { height: 5, borderRadius: 3, backgroundColor: 'var(--stroke-default)', overflow: 'hidden' },
  cartao: { borderRadius: 16, backgroundColor: T.painel, borderWidth: 1, borderColor: T.line, padding: 14, gap: 10 },
  cartaoDestaque: { borderWidth: 2, borderColor: T.acao, boxShadow: '0 0 0 3px rgba(229,26,49,.25)' } as never,
  nome: { flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: '700', lineHeight: 20, color: T.fg },
  seloQuente: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: T.acao, justifyContent: 'center' },
  seloQuenteT: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.42, color: '#FFFFFF' },
  seloAgenda: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: T.chip, justifyContent: 'center' },
  seloAgendaT: { fontSize: 10.5, fontWeight: '700', color: T.vtx },
  etapa: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: T.chip },
  etapaPonto: { width: 10, height: 10, borderRadius: 5 },
  etapaT: { fontSize: 11.5, fontWeight: '600', color: T.fg },
  contato: { fontSize: 12.5, fontWeight: '500', color: T.mute },
  quando: { fontSize: 12.5, fontWeight: '700', lineHeight: 17, flexShrink: 1 },
  caixa: { borderRadius: 10, backgroundColor: T.chip, paddingVertical: 8, paddingHorizontal: 10, gap: 2 },
  caixaK: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.63, color: T.dim },
  caixaT: { fontSize: 13.5, fontWeight: '600', lineHeight: 19, color: T.fg },
  nota: { fontSize: 11.5, fontWeight: '500', lineHeight: 17, color: T.avFg },
  botoes: { flexDirection: 'row', gap: 6 },
  botao: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, minHeight: 44, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 12, backgroundColor: T.chip, borderWidth: 1, borderColor: T.line2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  botaoCheio: { backgroundColor: T.acao, borderColor: T.acao },
  botaoT: { fontSize: 12.5, fontWeight: '700', lineHeight: 15, color: T.fg, textAlign: 'center', flexShrink: 1 },
  zerado: { borderRadius: 20, backgroundColor: T.okBg, borderWidth: 1.5, borderColor: T.okFg, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 18, alignItems: 'center', gap: 8 },
  zeradoT: { fontSize: 24, fontWeight: '800', lineHeight: 28, color: T.okFg },
  zeradoS: { fontSize: 14, fontWeight: '600', color: T.okFg },
  zeradoF: { fontSize: 12.5, fontWeight: '500', lineHeight: 19, color: T.fg, maxWidth: 300, textAlign: 'center' },
  zeradoBotao: { alignSelf: 'stretch', minHeight: 48, borderRadius: 14, backgroundColor: T.inv, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  zeradoBotaoT: { fontSize: 14, fontWeight: '700', color: T.invFg },
  livre: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: T.line2, padding: 14 },
  livreT: { fontSize: 14, fontWeight: '700', color: T.fg },
  livreS: { fontSize: 12.5, fontWeight: '500', lineHeight: 18, color: T.mute },
  feita: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: T.line },
  feitaH: { width: 44, flexShrink: 0, fontSize: 13, fontWeight: '700', color: T.mute },
  feitaN: { fontSize: 13.5, fontWeight: '600', lineHeight: 17, color: T.fg },
  feitaR: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  selo: { minHeight: 20, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, backgroundColor: T.chip, justifyContent: 'center' },
  seloT: { fontSize: 10.5, fontWeight: '700', color: T.mute },
});
