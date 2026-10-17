// As peças da aba Tarefas do handoff "Tarefas do App" (17/10/2026), com as medidas das pranchas:
// o placar do dia (P3), a fila zerada (P3), a hora das ligações (P1), o cabeçalho das seções, o
// cartão cheio do vencido (P5), o cartão mini do Sem próximo passo, o cartão "falta só o Como foi"
// (P7) e a linha do Feito hoje com a origem (P7). Cores só dos tokens do app (public/index.html).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconCalendar, IconCall, IconCheck, IconClock, IconUser, IconWarning, IconWhatsapp } from '../components/icons';

// os nomes do protótipo (TH.esc / TH.sol) nos tokens do app
const T = {
  bg: 'var(--bg)', painel: 'var(--surface)', card: 'var(--surface-2)', chip: 'var(--surface-3)',
  line: 'var(--border)', line2: 'var(--stroke-strong)', fg: 'var(--text)', mute: 'var(--text-muted)', dim: 'var(--text-subtle)',
  avBg: 'var(--tint-amber)', avFg: 'var(--tint-amber-text)', okBg: 'var(--ok-fundo)', okFg: 'var(--ok-texto)', okLine: 'var(--tint-green-border)',
  erroLine: 'var(--tint-red-border)', acao: 'var(--vermelho-acao)', vtx: 'var(--vermelho-texto)', inv: 'var(--text)', invFg: 'var(--bg)',
  verde: 'var(--verde-acao)', vazio: 'var(--border)', gpsTx: 'var(--info-text)', sel: 'var(--tint-red)',
};

const DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diaCurto = (iso: string) => `${DIA[new Date(iso + 'T12:00:00Z').getUTCDay()]} ${ddmm(iso)}`;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 86400000);

// ---- placar do dia (P3) -----------------------------------------------------------------
function Anel({ fracao, tamanho, traco, cor, fundo }: { fracao: number; tamanho: number; traco: number; cor: string; fundo: string }) {
  const r = (tamanho - traco) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fracao));
  // SVG direto (react-native-web renderiza no DOM): o círculo cheio e o arco por cima
  return React.createElement('svg', { width: tamanho, height: tamanho, viewBox: `0 0 ${tamanho} ${tamanho}`, style: { transform: 'rotate(-90deg)', flexShrink: 0 } },
    React.createElement('circle', { cx: tamanho / 2, cy: tamanho / 2, r, fill: 'none', stroke: fundo, strokeWidth: traco }),
    f > 0 ? React.createElement('circle', { cx: tamanho / 2, cy: tamanho / 2, r, fill: 'none', stroke: cor, strokeWidth: traco, strokeLinecap: 'round', strokeDasharray: `${c * f} ${c}` }) : null);
}

export function PlacarDoDia({ feitos, total, sub, subCor, pct, media, semPasso }: {
  feitos: number; total: number; sub: string; subCor?: string; pct: number | null; media: number | null; semPasso: number;
}) {
  const cor = pct == null ? T.dim : media != null && pct >= media ? T.verde : pct >= 30 ? T.avFg : T.acao;
  return (
    <View style={st.placar}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Anel fracao={total ? feitos / total : 0} tamanho={64} traco={7} cor={T.verde} fundo={T.vazio} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={st.kicker}>PLACAR DO DIA</Text>
          <Text style={st.placarN}>{`${feitos} de ${total}`}<Text style={st.placarFeitos}> feitos hoje</Text></Text>
          <Text style={[st.placarSub, subCor ? { color: subCor } : null]}>{sub}</Text>
        </View>
      </View>
      <View style={st.placarDiv}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Text style={st.gestorRot}>O que o seu gestor vê de você</Text>
          <Text style={[st.gestorPct, { color: cor }]}>{pct == null ? '—' : `${pct}%`}</Text>
        </View>
        <View style={st.barra}>
          <View style={[st.barraCheia, { width: `${pct ?? 0}%` as unknown as number, backgroundColor: cor }]} />
          {media != null && <View style={[st.barraMedia, { left: `${media}%` as unknown as number }]} />}
        </View>
        <Text style={st.gestorSub}>{media != null ? `dos follow-ups de hoje feitos · o traço é a média do time (${media}%)` : 'dos follow-ups de hoje feitos'}</Text>
      </View>
      <View style={[st.placarDiv, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <Text style={st.semPassoRot}>Sem próximo passo <Text style={{ fontWeight: '500', color: T.dim }}>· a regra é zero</Text></Text>
        <View style={[st.semPassoPilula, semPasso > 0 ? { backgroundColor: T.acao } : { backgroundColor: T.okBg }]}>
          <Text style={[st.semPassoN, { color: semPasso > 0 ? '#FFFFFF' : T.okFg }]}>{semPasso}</Text>
        </View>
      </View>
    </View>
  );
}

export function FilaZerada({ total, zerouAs, pct, sequencia, recorde, amanha }: {
  total: number; zerouAs: string | null; pct: number | null; sequencia: number | null; recorde: number | null; amanha: string | null;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={st.zerada}>
        <View style={{ width: 112, height: 112 }}>
          <Anel fracao={1} tamanho={112} traco={10} cor={T.verde} fundo={T.verde} />
          <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}><IconCheck width={44} height={44} fill={T.okFg} /></View>
        </View>
        <Text style={st.zeradaTitulo}>Fila zerada</Text>
        <Text style={st.zeradaSub}>{`${total} de ${total}${zerouAs ? ` · zerou às ${zerouAs}` : ''}`}</Text>
        <Text style={st.zeradaFrase}>Todo negócio da fila saiu com o próximo passo datado ou com o motivo do Perdido.</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 4 }}>
          <View style={st.zeradaN}><Text style={[st.zeradaNum, { color: T.okFg }]}>{pct == null ? '—' : `${pct}%`}</Text><Text style={st.zeradaNTx}>dos follow-ups de hoje, no cockpit do gestor</Text></View>
          <View style={st.zeradaN}><Text style={st.zeradaNum}>{sequencia == null ? '—' : `${sequencia} ${sequencia === 1 ? 'dia' : 'dias'}`}</Text>
            <Text style={st.zeradaNTx}>{recorde != null ? `seguidos zerando · seu recorde é ${recorde}` : 'seguidos zerando'}</Text></View>
        </View>
      </View>
      {!!amanha && (
        <View style={st.amanha}><Text style={st.amanhaT}>{`Amanhã · ${amanha}`}</Text><Text style={st.amanhaS}>1ª hora das ligações às 12:30</Text></View>
      )}
    </View>
  );
}

// ---- a hora das ligações (P1) -------------------------------------------------------------
export function BlocoHoraDasLigacoes({ faltamMin, decorrido, ate, de, followups, quentes }: {
  faltamMin: number; decorrido: number; de: string; ate: string; followups: number; quentes: number;
}) {
  return (
    <View style={st.janela}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: T.acao }} />
        <Text style={st.janelaT}>Hora das ligações</Text>
        <Text style={st.janelaFaltam}>{`faltam ${faltamMin} min`}</Text>
      </View>
      <View style={st.janelaTrilho}><View style={{ width: `${Math.round(decorrido * 100)}%` as unknown as number, height: '100%', backgroundColor: T.acao }} /></View>
      <Text style={st.janelaS}>{`${de} a ${ate} · ${followups} ${followups === 1 ? 'follow-up' : 'follow-ups'}, ${quentes} ${quentes === 1 ? 'quente' : 'quentes'}. Comece por cima.`}</Text>
    </View>
  );
}

/** A faixa do Mapa e da Agenda: fundo invertido, telefone no círculo, "Abrir". */
export function FaixaHoraDasLigacoes({ ate, followups, quentes, aoAbrir }: { ate: string; followups: number; quentes: number; aoAbrir: () => void }) {
  return (
    <View style={st.faixa}>
      <View style={st.faixaCirculo}><IconCall width={18} height={18} fill="#FFFFFF" /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={st.faixaT} numberOfLines={1}>{`Hora das ligações · até ${ate}`}</Text>
        <Text style={st.faixaS} numberOfLines={1}>{`${followups} follow-ups, ${quentes} ${quentes === 1 ? 'quente' : 'quentes'} · 15 min`}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir a fila de ligações" onPress={aoAbrir} style={st.faixaBotao}><Text style={st.faixaBotaoT}>Abrir</Text></Pressable>
    </View>
  );
}

// ---- seções ---------------------------------------------------------------------------------
export function CabecalhoDaSecao({ rotulo, n, sub, ponto, cor }: { rotulo: string; n: number; sub?: string | null; ponto: string; cor?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ponto }} />
      <Text style={[st.secaoRot, cor ? { color: cor } : null]}>{`${rotulo} · ${n}`}</Text>
      <View style={{ flex: 1 }} />
      {!!sub && <Text style={st.secaoSub}>{sub}</Text>}
    </View>
  );
}
export function SecaoVazia({ texto }: { texto: string }) {
  return <View style={st.vazia}><Text style={st.vaziaT}>{texto}</Text></View>;
}

// ---- o cartão (P5) ----------------------------------------------------------------------------
export type DadosDoCartao = {
  dealId: string; negocio: string; etapaRotulo: string; diasNaEtapa: number | null; quente: boolean;
  tipoPrazo: 'vencido' | 'hoje' | 'combinado' | 'outro'; prazo: string | null; horaPrazo: string | null; hoje: string;
  combinadoTexto: string | null; combinadoDoGestor?: { de: string; ate: string | null } | null;
  sugerido: 'Ligar' | 'WhatsApp' | 'Pôr no plano'; visita: boolean; temTelefone: boolean;
};

function linhaDoPrazo(d: DadosDoCartao): { texto: string; cor: string; Icone: typeof IconWarning } {
  if (d.tipoPrazo === 'combinado' && d.combinadoDoGestor) {
    return { texto: `combinado no 1:1 de ${diaCurto(d.combinadoDoGestor.de)}${d.combinadoDoGestor.ate ? ` · até ${diaCurto(d.combinadoDoGestor.ate)}` : ''}`, cor: T.gpsTx, Icone: IconUser };
  }
  if (d.tipoPrazo === 'vencido' && d.prazo) {
    const n = diasEntre(d.prazo, d.hoje);
    return { texto: `venceu ${diaCurto(d.prazo)} · ${n === 1 ? 'ontem' : `há ${n} dias`}`, cor: T.vtx, Icone: IconWarning };
  }
  if (d.tipoPrazo === 'hoje') return { texto: `vence hoje${d.horaPrazo ? ` · ${d.horaPrazo}` : ''}`, cor: T.avFg, Icone: IconClock };
  return { texto: d.prazo ? `vence ${diaCurto(d.prazo)}` : 'sem prazo', cor: T.mute, Icone: IconClock };
}

export function CartaoCheio({ d, destaque, veioDaAgenda, aoLigar, aoWhatsApp, aoPorNoPlano, children }: {
  d: DadosDoCartao; destaque?: boolean; veioDaAgenda?: boolean;
  aoLigar: () => void; aoWhatsApp: () => void; aoPorNoPlano: () => void; children?: React.ReactNode;
}) {
  const p = linhaDoPrazo(d);
  const verbos: Array<{ l: 'Ligar' | 'WhatsApp' | 'Pôr no plano'; Icone: typeof IconCall; on: () => void; desligado?: boolean }> = [
    { l: 'Ligar', Icone: IconCall, on: aoLigar, desligado: !d.temTelefone },
    { l: 'WhatsApp', Icone: IconWhatsapp, on: aoWhatsApp, desligado: !d.temTelefone },
    { l: 'Pôr no plano', Icone: IconCalendar, on: aoPorNoPlano },
  ];
  return (
    <View style={[st.cartao, d.tipoPrazo === 'vencido' && { borderWidth: 1.5, borderColor: T.erroLine }, destaque && st.cartaoDestaque]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={st.cartaoNome}>{d.negocio}</Text>
          <Text style={st.cartaoEt}>{d.diasNaEtapa != null ? `${d.etapaRotulo} · ${d.diasNaEtapa} d na etapa` : d.etapaRotulo}</Text>
        </View>
        {d.quente && <View style={st.seloQuente}><Text style={st.seloQuenteT}>QUENTE</Text></View>}
        {veioDaAgenda && <View style={st.seloAgenda}><Text style={st.seloAgendaT}>da Agenda</Text></View>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <p.Icone width={14} height={14} fill={p.cor} />
        <Text style={[st.cartaoPrazo, { color: p.cor }]}>{p.texto}</Text>
      </View>
      {!!d.combinadoTexto && (
        <View style={st.combinado}>
          <Text style={st.combinadoK}>{d.combinadoDoGestor ? 'COMBINADO COM O GESTOR' : 'O QUE FOI COMBINADO'}</Text>
          <Text style={st.combinadoT}>{d.combinadoTexto}</Text>
        </View>
      )}
      {d.visita && <Text style={st.notaVisita}>Visita só conclui com o Cheguei. A ligação não conclui esta tarefa.</Text>}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {verbos.map((v) => {
          const sugerido = v.l === d.sugerido;
          return (
            <Pressable key={v.l} accessibilityRole="button" accessibilityLabel={`${v.l}: ${d.negocio}`} disabled={v.desligado} onPress={v.on}
              style={[st.verbo, sugerido ? { backgroundColor: T.acao, borderColor: T.acao } : null, v.desligado && { opacity: 0.45 }]}>
              <v.Icone width={15} height={15} fill={sugerido ? '#FFFFFF' : 'var(--text)'} />
              <Text style={[st.verboT, sugerido && { color: '#FFFFFF' }]} numberOfLines={2}>{v.l}</Text>
            </Pressable>
          );
        })}
      </View>
      {children}
    </View>
  );
}

export function CartaoMini({ negocio, et, aoMarcar }: { negocio: string; et: string; aoMarcar: () => void }) {
  return (
    <View style={st.mini}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={st.miniNome}>{negocio}</Text>
        <Text style={st.miniEt}>{et}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Marcar o passo: ${negocio}`} onPress={aoMarcar} style={st.miniBotao}><Text style={st.miniBotaoT}>Marcar o passo</Text></Pressable>
    </View>
  );
}

export function CartaoFaltaComoFoi({ negocio, linha, aoRegistrar }: { negocio: string; linha: string; aoRegistrar: () => void }) {
  return (
    <View style={[st.cartao, { borderWidth: 1.5, borderColor: T.okLine }]}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={st.check28}><IconCheck width={15} height={15} fill={T.okFg} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={st.cartaoNome}>{negocio}</Text>
          <Text style={[st.cartaoPrazo, { color: T.okFg }]}>{linha}</Text>
          <Text style={st.faltaT}>Falta só o Como foi. A tarefa fecha sozinha quando você registrar.</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Registrar o Como foi: ${negocio}`} onPress={aoRegistrar} style={st.botaoGrande}><Text style={st.botaoGrandeT}>Registrar o Como foi</Text></Pressable>
    </View>
  );
}

// ---- Feito hoje (P7) ------------------------------------------------------------------------------
const ROTULO_ORIGEM: Record<string, string> = {
  cheguei: 'sozinha · Cheguei GPS', ligacao_app: 'sozinha · ligação pelo app', whatsapp_app: 'sozinha · WhatsApp pelo app', desfecho: 'sozinha · desfecho no mapa', fila: 'pela fila',
};
export function LinhaFeitoHoje({ hora, negocio, resultado, origem, noAparelho, acao }: {
  hora: string; negocio: string; resultado: string; origem: string | null; noAparelho?: boolean; acao?: React.ReactNode;
}) {
  const sozinha = !!origem && origem !== 'fila';
  return (
    <View style={st.feita}>
      <Text style={st.feitaHora}>{hora}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={st.feitaNome}>{negocio}</Text>
        <Text style={[st.feitaRes, { color: /perdido/i.test(resultado) ? T.mute : T.okFg }]}>{resultado}</Text>
        {!!origem && (
          <View style={[st.origem, { backgroundColor: sozinha ? T.okBg : T.chip }]}><Text style={[st.origemT, { color: sozinha ? T.okFg : T.mute }]}>{ROTULO_ORIGEM[origem] ?? origem}</Text></View>
        )}
      </View>
      {noAparelho ? <View style={st.noAparelho}><Text style={st.noAparelhoT}>no aparelho</Text></View> : acao ?? <IconCheck width={18} height={18} fill={T.okFg} />}
    </View>
  );
}

const st = StyleSheet.create({
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: T.dim },
  placar: { borderRadius: 16, backgroundColor: T.painel, borderWidth: 1, borderColor: T.line, padding: 14, gap: 12 },
  placarN: { fontSize: 24, fontWeight: '800', lineHeight: 26, color: T.fg },
  placarFeitos: { fontSize: 14, fontWeight: '600', color: T.mute },
  placarSub: { fontSize: 12, fontWeight: '600', lineHeight: 16, color: T.mute },
  placarDiv: { borderTopWidth: 1, borderTopColor: T.line, paddingTop: 10, gap: 6 },
  gestorRot: { flex: 1, minWidth: 140, fontSize: 12, fontWeight: '600', color: T.mute },
  gestorPct: { fontSize: 17, fontWeight: '800' },
  barra: { height: 6, borderRadius: 3, backgroundColor: T.vazio, position: 'relative' },
  barraCheia: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  barraMedia: { position: 'absolute', top: -3, width: 2, height: 12, backgroundColor: T.fg },
  gestorSub: { fontSize: 11.5, fontWeight: '500', lineHeight: 16, color: T.dim },
  semPassoRot: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '600', lineHeight: 16, color: T.mute },
  semPassoPilula: { height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center' },
  semPassoN: { fontSize: 13, fontWeight: '800' },
  zerada: { borderRadius: 20, backgroundColor: T.okBg, borderWidth: 1.5, borderColor: T.okLine, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, alignItems: 'center', gap: 10 },
  zeradaTitulo: { fontSize: 26, fontWeight: '800', lineHeight: 30, color: T.okFg },
  zeradaSub: { fontSize: 14, fontWeight: '600', color: T.okFg },
  zeradaFrase: { fontSize: 12.5, fontWeight: '500', lineHeight: 19, color: T.fg, maxWidth: 300, textAlign: 'center' },
  zeradaN: { flex: 1, borderRadius: 12, backgroundColor: T.painel, padding: 10, gap: 1 },
  zeradaNum: { fontSize: 20, fontWeight: '800', color: T.fg },
  zeradaNTx: { fontSize: 11, fontWeight: '500', lineHeight: 15, color: T.mute },
  amanha: { borderRadius: 14, backgroundColor: T.painel, borderWidth: 1, borderColor: T.line, paddingVertical: 12, paddingHorizontal: 14, gap: 1 },
  amanhaT: { fontSize: 14, fontWeight: '700', color: T.fg },
  amanhaS: { fontSize: 12, fontWeight: '500', color: T.mute },
  janela: { borderRadius: 16, backgroundColor: T.inv, paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
  janelaT: { flex: 1, fontSize: 14.5, fontWeight: '700', color: T.invFg },
  janelaFaltam: { fontSize: 13, fontWeight: '700', color: T.invFg },
  janelaTrilho: { height: 5, borderRadius: 3, backgroundColor: 'var(--stroke-default)', overflow: 'hidden' },
  janelaS: { fontSize: 12, fontWeight: '500', lineHeight: 17, color: T.invFg, opacity: 0.82 },
  faixa: { borderRadius: 16, backgroundColor: T.inv, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  faixaCirculo: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.acao, alignItems: 'center', justifyContent: 'center' },
  faixaT: { fontSize: 14.5, fontWeight: '700', color: T.invFg },
  faixaS: { fontSize: 12, fontWeight: '500', color: T.invFg, opacity: 0.82 },
  faixaBotao: { height: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: T.acao, alignItems: 'center', justifyContent: 'center' },
  faixaBotaoT: { fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' },
  secaoRot: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.92, color: T.fg },
  secaoSub: { fontSize: 11.5, fontWeight: '500', color: T.dim },
  vazia: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: T.line, justifyContent: 'center', paddingHorizontal: 12 },
  vaziaT: { fontSize: 12, fontWeight: '500', color: T.dim },
  cartao: { borderRadius: 16, backgroundColor: T.painel, borderWidth: 1, borderColor: T.line, padding: 14, gap: 10 },
  cartaoDestaque: { borderWidth: 2, borderColor: T.acao, boxShadow: '0 0 0 3px rgba(229,26,49,.25)' } as never,
  cartaoNome: { fontSize: 15.5, fontWeight: '700', lineHeight: 20, color: T.fg },
  cartaoEt: { fontSize: 12, fontWeight: '500', color: T.mute },
  cartaoPrazo: { fontSize: 12.5, fontWeight: '700', lineHeight: 17, flexShrink: 1 },
  seloQuente: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: T.acao, justifyContent: 'center' },
  seloQuenteT: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.42, color: '#FFFFFF' },
  seloAgenda: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: T.sel, justifyContent: 'center' },
  seloAgendaT: { fontSize: 10.5, fontWeight: '700', color: T.vtx },
  combinado: { borderRadius: 10, backgroundColor: T.card, paddingVertical: 8, paddingHorizontal: 10, gap: 2 },
  combinadoK: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.63, color: T.dim },
  combinadoT: { fontSize: 13, fontWeight: '600', lineHeight: 18, color: T.fg },
  notaVisita: { fontSize: 11.5, fontWeight: '500', lineHeight: 17, color: T.avFg },
  verbo: { flex: 1, minHeight: 44, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 12, backgroundColor: T.card, borderWidth: 1, borderColor: T.line2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  verboT: { fontSize: 12.5, fontWeight: '700', lineHeight: 15, color: T.fg, textAlign: 'center', flexShrink: 1 },
  mini: { borderRadius: 14, backgroundColor: T.painel, borderWidth: 1, borderColor: T.line, paddingVertical: 10, paddingRight: 10, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniNome: { fontSize: 14, fontWeight: '700', lineHeight: 18, color: T.fg },
  miniEt: { fontSize: 11.5, fontWeight: '500', lineHeight: 16, color: T.mute },
  miniBotao: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: T.card, borderWidth: 1, borderColor: T.line2, justifyContent: 'center' },
  miniBotaoT: { fontSize: 12.5, fontWeight: '700', color: T.fg },
  check28: { width: 28, height: 28, borderRadius: 14, backgroundColor: T.okBg, alignItems: 'center', justifyContent: 'center' },
  faltaT: { fontSize: 12, fontWeight: '500', lineHeight: 17, color: T.mute },
  botaoGrande: { minHeight: 48, borderRadius: 14, backgroundColor: T.acao, alignItems: 'center', justifyContent: 'center' },
  botaoGrandeT: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  feita: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingVertical: 6, borderTopWidth: 1, borderTopColor: T.line },
  feitaHora: { width: 44, fontSize: 13, fontWeight: '700', color: T.mute },
  feitaNome: { fontSize: 13.5, fontWeight: '600', lineHeight: 17, color: T.fg },
  feitaRes: { fontSize: 11.5, fontWeight: '600', lineHeight: 15 },
  origem: { alignSelf: 'flex-start', minHeight: 20, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10 },
  origemT: { fontSize: 10.5, fontWeight: '700', lineHeight: 16 },
  noAparelho: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: T.chip, justifyContent: 'center' },
  noAparelhoT: { fontSize: 10.5, fontWeight: '700', color: T.mute },
});
