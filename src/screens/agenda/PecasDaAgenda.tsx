// As peças da Agenda do celular (handoff "Agenda do App", 19/10/2026): o aviso nos 3 níveis, a
// próxima parada, a linha de parada (a mesma em todos os dias), o placar do dia, a linha de
// ligação e a do Feito hoje. Medidas da prancha; cores só dos tokens do app (public/index.html).
// Nenhuma fileira divide o espaço entre texto e botão: botão vai para a fileira de baixo, em
// colunas iguais (no iPhone, texto ao lado de botão virava coluna de uma letra).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconBook, IconCall, IconCar, IconCheck, IconChevronRight, IconClose, IconIdCard, IconLocation, IconWarning, IconWhatsapp } from '../../components/icons';

export const T = {
  surface: 'var(--surface)', s2: 'var(--surface-2)', s3: 'var(--surface-3)', border: 'var(--border)', forte: 'var(--stroke-strong)',
  text: 'var(--text)', muted: 'var(--text-muted)', subtle: 'var(--text-subtle)', acao: 'var(--vermelho-acao)', vtx: 'var(--vermelho-texto)',
  verde: 'var(--verde-acao)', okBg: 'var(--ok-fundo)', okTx: 'var(--ok-texto)', amb: 'var(--tint-amber)', ambTx: 'var(--tint-amber-text)',
  info: 'var(--info-text)', inv: 'var(--text)', invFg: 'var(--bg)',
};

// ---- o aviso (3 níveis, um desenho) ----------------------------------------------------------
export type AcaoDoAviso = { rotulo: string; principal?: boolean; onPress: () => void; desligado?: boolean };
export type ItemDoAviso = { chave: string; nome: string; sub?: string; acoes?: AcaoDoAviso[] };
const NIVEL = {
  agir: { bg: 'var(--tint-red)', bd: 'var(--tint-red-border)', ic: T.vtx, tc: T.vtx },
  atencao: { bg: T.amb, bd: 'var(--tint-amber-border)', ic: T.ambTx, tc: T.ambTx },
  info: { bg: T.s3, bd: T.border, ic: T.info, tc: T.text },
} as const;

function Botoes({ acoes, alto = 44 }: { acoes: AcaoDoAviso[]; alto?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {acoes.map((a) => (
        <Pressable key={a.rotulo} accessibilityRole="button" disabled={a.desligado} onPress={a.onPress}
          style={[st.botao, { minHeight: alto }, a.principal ? { backgroundColor: T.acao, borderColor: T.acao } : null, a.desligado && { opacity: 0.5 }]}>
          <Text style={[st.botaoT, a.principal && { color: '#FFFFFF' }]}>{a.rotulo}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Aviso({ nivel, titulo, texto, itens, acoes, rodape }: {
  nivel: keyof typeof NIVEL; titulo: string; texto?: string | null; itens?: ItemDoAviso[]; acoes?: AcaoDoAviso[]; rodape?: string | null;
}) {
  const c = NIVEL[nivel];
  const Icone = nivel === 'atencao' ? IconWarning : nivel === 'agir' ? IconWarning : IconCall;
  return (
    <View style={[st.aviso, { backgroundColor: c.bg, borderColor: c.bd }]} accessibilityRole={nivel === 'info' ? undefined : 'alert'}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 20, paddingTop: 1 }}><Icone width={20} height={20} fill={c.ic} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[st.avisoT, { color: c.tc }]}>{titulo}</Text>
          {!!texto && <Text style={st.avisoTx}>{texto}</Text>}
        </View>
      </View>
      {(itens ?? []).map((it) => (
        <View key={it.chave} style={st.avisoItem}>
          <View style={{ gap: 2 }}>
            <Text style={st.nome145} numberOfLines={2}>{it.nome}</Text>
            {!!it.sub && <Text style={st.sub12}>{it.sub}</Text>}
          </View>
          {!!it.acoes?.length && <Botoes acoes={it.acoes} />}
        </View>
      ))}
      {!!acoes?.length && <Botoes acoes={acoes} />}
      {!!rodape && <Text style={st.rodape}>{rodape}</Text>}
    </View>
  );
}

// ---- a próxima parada -----------------------------------------------------------------------
export type DadosDaProxima = {
  numero: number; total: number; nome: string; hora: string | null; marcada: boolean;
  quente: boolean; etapa: string | null; corEtapa: string | null; oQue: string | null; cliente: boolean;
  endereco: string | null; distancia: string | null; pertoM: number | null;
  diasNaEtapa: number | null; regua: number | null; ultimo: string; decide: string; conseguir: string;
};

export function ProximaParada({ d, aoIr, aoCheguei, aoLigar, aoCartao, aoPlaybook, aoTirar }: {
  d: DadosDaProxima; aoIr: () => void; aoCheguei: () => void; aoLigar: () => void; aoCartao: () => void; aoPlaybook?: () => void; aoTirar?: () => void;
}) {
  const perto = d.pertoM != null && d.pertoM <= 150;
  const temRegua = !d.cliente && d.diasNaEtapa != null && !!d.regua;
  const pct = temRegua ? Math.min(1, d.diasNaEtapa! / d.regua!) : 0;
  const passou = temRegua && d.diasNaEtapa! > d.regua!;
  const corRegua = passou ? T.acao : pct >= 0.7 ? '#D97706' : T.verde;
  const fraseRegua = !temRegua ? null : passou
    ? `Passou ${d.diasNaEtapa! - d.regua!} ${d.diasNaEtapa! - d.regua! === 1 ? 'dia' : 'dias'} da régua. Saia com o próximo passo datado.`
    : d.regua! - d.diasNaEtapa! === 1 ? 'Falta 1 dia para a régua.' : `Faltam ${d.regua! - d.diasNaEtapa!} dias para a régua.`;
  const sec = [
    { l: 'Ligar', Ic: IconCall, on: aoLigar },
    { l: 'Cartão', Ic: IconIdCard, on: aoCartao },
    ...(aoPlaybook ? [{ l: 'Playbook', Ic: IconBook, on: aoPlaybook }] : []),
  ];
  return (
    <View style={[st.heroi, perto && { borderWidth: 2, borderColor: T.acao }]}>
      <View style={st.linhaQuebra}>
        <Text style={[st.kicker, { color: T.vtx, flexGrow: 1, minWidth: 150 }]}>{`PRÓXIMA PARADA · ${d.numero} DE ${d.total}`}</Text>
        {!!d.hora && <Text style={[st.horaHeroi, d.marcada ? { fontWeight: '700', color: T.text } : { fontWeight: '500', color: T.subtle }]}>{d.marcada ? `${d.hora} · marcada` : `por volta de ${d.hora}`}</Text>}
      </View>
      <View style={{ gap: 6 }}>
        <Text style={st.nomeHeroi} numberOfLines={2}>{d.nome}</Text>
        <View style={st.selos}>
          {d.quente && <View style={[st.selo, { backgroundColor: T.acao }]}><Text style={[st.seloT, { color: '#FFFFFF', letterSpacing: 0.4 }]}>QUENTE</Text></View>}
          {d.cliente && <View style={[st.selo, { backgroundColor: T.okBg }]}><Text style={[st.seloT, { color: T.okTx }]}>CLIENTE</Text></View>}
          {!!d.etapa && !d.cliente && (
            <View style={[st.selo, { backgroundColor: T.s3, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.corEtapa ?? T.subtle }} />
              <Text style={[st.seloT, { color: T.text, fontWeight: '600' }]}>{d.etapa}</Text>
            </View>
          )}
          {!!d.oQue && <View style={[st.selo, { backgroundColor: T.s3 }]}><Text style={[st.seloT, { color: T.text, fontWeight: '600' }]}>{d.oQue}</Text></View>}
        </View>
        {(!!d.endereco || !!d.distancia) && (
          <Text style={[st.loc, perto && { color: T.okTx }]}>
            {[d.endereco, perto ? `você está a ${Math.round(d.pertoM!)} m` : d.distancia].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
      <View style={st.preparo}>
        {temRegua && (
          <View style={{ gap: 6 }}>
            <View style={st.linhaQuebra}>
              <Text style={[st.reguaRot, { flexGrow: 1, minWidth: 140 }]}>{`${d.etapa} · ${d.diasNaEtapa} ${d.diasNaEtapa === 1 ? 'dia' : 'dias'} na etapa`}</Text>
              <Text style={st.reguaDir}>{`régua de ${d.regua} dias`}</Text>
            </View>
            <View style={st.trilho}><View style={{ width: `${Math.max(4, Math.round(pct * 100))}%` as unknown as number, height: '100%', borderRadius: 3, backgroundColor: corRegua }} /></View>
            <Text style={[st.reguaFrase, { color: passou ? T.vtx : T.muted }]}>{fraseRegua}</Text>
          </View>
        )}
        <View style={{ gap: 6 }}>
          <View style={st.par}><Text style={st.parRot}>Último toque</Text><Text style={st.parVal}>{d.ultimo}</Text></View>
          <View style={st.par}><Text style={st.parRot}>Quem decide</Text><Text style={st.parVal}>{d.decide}</Text></View>
        </View>
        <View style={st.conseguir}>
          <View style={{ width: 18, paddingTop: 2 }}><IconLocation width={18} height={18} fill={T.vtx} /></View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text style={st.conseguirK}>{d.cliente ? 'HOJE' : 'O QUE CONSEGUIR HOJE'}</Text>
            <Text style={st.conseguirT}>{d.conseguir}</Text>
          </View>
        </View>
      </View>
      {/* Ir · Cheguei, sempre os dois e nesta ordem; perto (até 150 m) o Cheguei acende */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ir até ${d.nome}`} onPress={aoIr}
          style={[st.grande, perto ? { borderColor: T.forte } : { backgroundColor: T.acao, borderColor: T.acao }]}>
          <IconCar width={18} height={18} fill={perto ? 'var(--text)' : '#FFFFFF'} /><Text style={[st.grandeT, !perto && { color: '#FFFFFF' }]}>Ir</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Cheguei em ${d.nome}`} onPress={aoCheguei}
          style={[st.grande, perto ? { backgroundColor: T.acao, borderColor: T.acao } : { borderColor: T.forte }]}>
          <IconLocation width={18} height={18} fill={perto ? '#FFFFFF' : 'var(--text)'} /><Text style={[st.grandeT, perto && { color: '#FFFFFF' }]}>Cheguei</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {sec.map((b) => (
          <Pressable key={b.l} accessibilityRole="button" onPress={b.on} style={st.sec}>
            <b.Ic width={15} height={15} fill="var(--text)" /><Text style={st.secT}>{b.l}</Text>
          </Pressable>
        ))}
      </View>
      {!!aoTirar && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Tirar ${d.nome} do plano`} onPress={aoTirar} style={st.tirar}>
          <IconClose width={14} height={14} fill="var(--text-subtle)" /><Text style={st.tirarT}>Tirar do plano</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---- a linha de parada ----------------------------------------------------------------------
export type DadosDaLinha = {
  chave: string; numero: number; nome: string; hora: string | null; marcada: boolean;
  cliente: boolean; corEtapa: string | null; quente: boolean; doHubspot: boolean;
  linha2: string; cadencia: string | null; cadenciaVermelha: boolean; objetivo: string | null;
  naEtapa: string | null; decide: string | null;
};

export function LinhaParada({ d, aberta, aoTocar, aoIr, aoFazerAgora, aoCartao, aoPorAmanha }: {
  d: DadosDaLinha; aberta: boolean; aoTocar: () => void; aoIr?: () => void; aoFazerAgora?: () => void; aoCartao: () => void; aoPorAmanha?: () => void;
}) {
  return (
    <View style={st.linha}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Text style={[st.horaLinha, d.marcada ? { fontWeight: '700', color: T.text } : { fontWeight: '500', color: T.subtle }]}>{d.hora ?? ''}</Text>
        <View style={[st.disco, d.cliente ? { borderWidth: 2, borderColor: T.verde, backgroundColor: 'transparent' } : { backgroundColor: d.corEtapa ?? T.s3 }]}>
          <Text style={[st.discoT, { color: d.cliente ? T.okTx : '#111418' }]}>{d.numero}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: aberta }} onPress={aoTocar} style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={st.nome145} numberOfLines={2}>{d.nome}</Text>
          {(d.quente || d.cliente || d.doHubspot) && (
            <View style={st.selos}>
              {d.quente && <View style={[st.seloP, { backgroundColor: T.acao }]}><Text style={[st.seloPT, { color: '#FFFFFF' }]}>QUENTE</Text></View>}
              {d.cliente && <View style={[st.seloP, { backgroundColor: T.okBg }]}><Text style={[st.seloPT, { color: T.okTx }]}>CLIENTE</Text></View>}
              {d.doHubspot && <View style={[st.seloP, { backgroundColor: T.s3 }]}><Text style={[st.seloPT, { color: T.muted }]}>tarefa do HubSpot</Text></View>}
            </View>
          )}
          <Text style={st.sub12}>{d.linha2}</Text>
          {!!d.cadencia && <Text style={[st.cad, { color: d.cadenciaVermelha ? T.vtx : T.muted }]}>{d.cadencia}</Text>}
          {!!d.objetivo && <Text style={st.objetivo}>{d.objetivo}</Text>}
        </Pressable>
        {aoIr ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Ir até ${d.nome}`} onPress={aoIr} style={st.ir}>
            <IconCar width={18} height={18} fill="var(--text)" />
          </Pressable>
        ) : <View style={{ width: 44 }} />}
      </View>
      {aberta && (
        <View style={st.recuo}>
          <View style={st.preparoCurto}>
            {!!d.naEtapa && <View style={st.par}><Text style={st.parRot}>Na etapa</Text><Text style={st.parVal}>{d.naEtapa}</Text></View>}
            <View style={st.par}><Text style={st.parRot}>Quem decide</Text><Text style={st.parVal}>{d.decide ?? '—'}</Text></View>
          </View>
          <Botoes acoes={[
            ...(aoFazerAgora ? [{ rotulo: 'Fazer esta agora', principal: true, onPress: aoFazerAgora }] : []),
            { rotulo: 'Abrir o cartão', onPress: aoCartao },
          ]} />
        </View>
      )}
      {!!aoPorAmanha && (
        <View style={st.recuo}><Botoes acoes={[{ rotulo: 'Pôr amanhã', onPress: aoPorAmanha }]} /></View>
      )}
    </View>
  );
}

// ---- o placar do dia --------------------------------------------------------------------------
export function PlacarDoDia({ rotulo, feitas, meta, linhas, promessa }: {
  rotulo: string; feitas: number | null; meta: number;
  linhas: Array<{ texto: string; tom: 'ok' | 'ruim' | 'neutro' | 'info' }>;
  promessa?: { aoPrometer: (n: number) => void; enviando: boolean } | null;
}) {
  const cor = { ok: [T.verde, T.okTx], ruim: [T.acao, T.vtx], neutro: [T.border, T.muted], info: [T.info, T.text] } as const;
  return (
    <View style={st.placar}>
      {!!promessa && (
        <View style={[st.linhaQuebra, { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: T.border }]}>
          <Text style={[st.promT, { flexGrow: 1, minWidth: 96 }]}>Visitas hoje?</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[4, 6, 8, 10].map((n) => (
              <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Prometer ${n} visitas`} disabled={promessa.enviando}
                onPress={() => promessa.aoPrometer(n)} style={[st.prom, promessa.enviando && { opacity: 0.5 }]}>
                <Text style={st.promN}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Text style={st.kicker}>{rotulo.toUpperCase()}</Text>
      <View style={[st.linhaQuebra, { alignItems: 'baseline' }]}>
        <Text style={st.placarN}>{`${feitas == null ? '—' : feitas} de ${meta}`}</Text>
        <Text style={st.placarR}>visitas com Cheguei</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: Math.max(1, Math.min(meta, 12)) }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: feitas != null && i < feitas ? T.verde : T.border }} />
        ))}
      </View>
      <View style={{ gap: 4 }}>
        {linhas.map((l) => (
          <View key={l.texto} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cor[l.tom][0] }} />
            <Text style={[st.placarL, { color: cor[l.tom][1] }]}>{l.texto}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---- a linha de ligação / WhatsApp ----------------------------------------------------------------
export function LinhaLigacao({ hora, nome, sub, whatsapp, acoes }: {
  hora: string | null; nome: string; sub: string; whatsapp: boolean; acoes: AcaoDoAviso[];
}) {
  return (
    <View style={{ paddingTop: 4, paddingBottom: 8, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Text style={[st.horaLinha, { fontWeight: '700', color: T.text }]}>{hora ?? ''}</Text>
        <View style={[st.disco, { backgroundColor: T.s3 }]}>
          {whatsapp ? <IconWhatsapp width={14} height={14} fill="var(--text)" /> : <IconCall width={14} height={14} fill="var(--text)" />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={st.nome14} numberOfLines={2}>{nome}</Text>
          <Text style={st.sub12}>{sub}</Text>
        </View>
      </View>
      {!!acoes.length && (
        <View style={[st.recuo, { flexDirection: 'row', gap: 6 }]}>
          {acoes.map((a) => (
            <Pressable key={a.rotulo} accessibilityRole="button" onPress={a.onPress} style={[st.naFila, a.principal && { backgroundColor: T.acao, borderColor: T.acao }]}>
              <Text style={[st.naFilaT, a.principal && { color: '#FFFFFF' }]}>{a.rotulo}</Text>
              {a.rotulo === 'na fila' && <IconChevronRight width={15} height={15} fill="var(--text)" />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ---- Feito hoje -----------------------------------------------------------------------------------
export function LinhaFeito({ hora, nome, sub, proximo, guardado, aoMarcar, aoTocar }: {
  hora: string; nome: string; sub: string; proximo: string | null; guardado?: boolean; aoMarcar?: () => void; aoTocar?: () => void;
}) {
  return (
    <View style={st.linha}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Text style={[st.horaLinha, { fontWeight: '700', color: T.muted }]}>{hora}</Text>
        <View style={[st.disco, { backgroundColor: T.okBg }]}><IconCheck width={14} height={14} fill="var(--ok-texto)" /></View>
        <Pressable accessibilityRole="button" disabled={!aoTocar} onPress={aoTocar} style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={st.nome145} numberOfLines={2}>{nome}</Text>
          <Text style={st.sub12}>{sub}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
            <View style={{ paddingTop: 2 }}>{proximo ? <IconCheck width={14} height={14} fill="var(--ok-texto)" /> : <IconWarning width={14} height={14} fill="var(--vermelho-texto)" />}</View>
            <Text style={[st.feitoP, { color: proximo ? T.okTx : T.vtx }]}>{proximo ? `Próximo passo: ${proximo}` : 'Sem próximo passo'}</Text>
          </View>
          {guardado && <View style={[st.seloP, { backgroundColor: T.s3, alignSelf: 'flex-start' }]}><Text style={[st.seloPT, { color: T.muted }]}>guardado no aparelho</Text></View>}
        </Pressable>
      </View>
      {!proximo && !!aoMarcar && (
        <View style={st.recuoFeito}><Botoes acoes={[{ rotulo: 'Marcar o próximo passo', principal: true, onPress: aoMarcar }]} /></View>
      )}
    </View>
  );
}

export function TituloDeLista({ titulo, apoio }: { titulo: string; apoio?: string | null }) {
  return (
    <View style={{ gap: 2, paddingBottom: 8 }}>
      <Text style={st.lista}>{titulo.toUpperCase()}</Text>
      {!!apoio && <Text style={st.apoio}>{apoio}</Text>}
    </View>
  );
}

// a coluna do texto começa depois da hora (48) e do disco (28), com os dois gaps de 10
const RECUO = 48 + 10 + 28 + 10;
export const st = StyleSheet.create({
  aviso: { borderRadius: 14, borderWidth: 1.5, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  avisoT: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  avisoTx: { fontSize: 12.5, fontWeight: '500', lineHeight: 18, color: T.text },
  avisoItem: { borderRadius: 12, backgroundColor: T.s2, padding: 12, gap: 10 },
  rodape: { fontSize: 11.5, fontWeight: '500', lineHeight: 17, color: T.muted },
  botao: { flex: 1, minWidth: 0, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, borderColor: T.forte, backgroundColor: T.s2, alignItems: 'center', justifyContent: 'center' },
  botaoT: { fontSize: 12.5, fontWeight: '700', lineHeight: 16, color: T.text, textAlign: 'center' },
  nome145: { fontSize: 14.5, fontWeight: '700', lineHeight: 19, color: T.text },
  nome14: { fontSize: 14, fontWeight: '700', lineHeight: 18, color: T.text },
  sub12: { fontSize: 12, fontWeight: '500', lineHeight: 17, color: T.muted },
  heroi: { borderRadius: 18, backgroundColor: T.s2, borderWidth: 1, borderColor: T.border, padding: 16, gap: 12 },
  linhaQuebra: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.88, color: T.subtle },
  horaHeroi: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  nomeHeroi: { fontSize: 20, fontWeight: '800', lineHeight: 25, color: T.text },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  selo: { minHeight: 22, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 11, justifyContent: 'center' },
  seloT: { fontSize: 11, fontWeight: '700', lineHeight: 18 },
  seloP: { minHeight: 20, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, justifyContent: 'center' },
  seloPT: { fontSize: 10.5, fontWeight: '700', lineHeight: 16 },
  loc: { fontSize: 12.5, fontWeight: '600', lineHeight: 17, color: T.muted },
  preparo: { borderRadius: 12, backgroundColor: T.s3, padding: 12, gap: 10 },
  reguaRot: { fontSize: 12, fontWeight: '600', color: T.text },
  reguaDir: { fontSize: 11.5, fontWeight: '500', color: T.subtle },
  trilho: { height: 6, borderRadius: 3, backgroundColor: T.border, overflow: 'hidden' },
  reguaFrase: { fontSize: 11.5, fontWeight: '600', lineHeight: 16 },
  par: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  parRot: { width: 92, fontSize: 12, lineHeight: 17, color: T.subtle },
  parVal: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '600', lineHeight: 17, color: T.text },
  conseguir: { borderTopWidth: 1, borderTopColor: T.border, paddingTop: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  conseguirK: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.6, color: T.subtle },
  conseguirT: { fontSize: 14, fontWeight: '700', lineHeight: 19, color: T.text },
  grande: { flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  grandeT: { fontSize: 15, fontWeight: '700', color: T.text },
  sec: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 12, backgroundColor: T.s3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secT: { fontSize: 12.5, fontWeight: '700', lineHeight: 15, color: T.text, textAlign: 'center', flexShrink: 1 },
  tirar: { alignSelf: 'center', minHeight: 44, marginTop: -6, marginBottom: -10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tirarT: { fontSize: 12, fontWeight: '600', color: T.subtle },
  linha: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.border, gap: 10 },
  horaLinha: { width: 48, paddingTop: 5, fontSize: 13.5, lineHeight: 16, fontVariant: ['tabular-nums'] },
  disco: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  discoT: { fontSize: 12.5, fontWeight: '700' },
  cad: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  objetivo: { fontSize: 12.5, fontWeight: '600', lineHeight: 17, color: T.text },
  ir: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: T.forte, alignItems: 'center', justifyContent: 'center' },
  recuo: { marginLeft: RECUO, gap: 8 },
  recuoFeito: { marginLeft: RECUO },
  preparoCurto: { borderRadius: 12, backgroundColor: T.s3, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
  placar: { borderRadius: 16, backgroundColor: T.s2, borderWidth: 1, borderColor: T.border, padding: 14, gap: 10 },
  promT: { fontSize: 13.5, fontWeight: '700', color: T.text },
  prom: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: T.forte, alignItems: 'center', justifyContent: 'center' },
  promN: { fontSize: 15, fontWeight: '700', color: T.text },
  placarN: { fontSize: 24, fontWeight: '800', lineHeight: 27, color: T.text, fontVariant: ['tabular-nums'] },
  placarR: { fontSize: 13, fontWeight: '600', color: T.muted },
  placarL: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  naFila: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: T.forte, flexDirection: 'row', alignItems: 'center', gap: 4 },
  naFilaT: { fontSize: 13, fontWeight: '700', color: T.text },
  feitoP: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  lista: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.92, color: T.subtle },
  apoio: { fontSize: 11.5, fontWeight: '500', lineHeight: 16, color: T.subtle },
});
