// Os blocos do Hoje do Cockpit (GV2.H5) no Hoje do celular (Julyan, 24/11/26: "a aba Hoje do executivo no
// celular tem que ser a mesma da aba Hoje do Cockpit"). Mesmos blocos, mesmos textos e mesmos números; o
// desenho é o do app (os cartões de PecasDoHoje, tokens de public/index.html, claro e escuro). As contas
// moram em src/utils/hojeComoCockpit.ts. Nada aqui grava: o "Pôr no plano" é o da fila (porNoPlano).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { reais } from '../../../supabase/functions/_compartilhado/desenvolvimentoV2';
import { HORAS, MESES, legendaDoDinheiro, ord, periodoDaSemana, topoDaSemana, type Dinheiro, type Hora, type LinhaACobrar, type Mes, type Semana } from '../../utils/hojeComoCockpit';

const C = {
  ink: 'var(--text)', ink2: 'var(--text-subtle)', ink3: 'var(--text-muted)', mute: 'var(--text-faint)',
  card: 'var(--surface)', sub: 'var(--surface-2)', chip: 'var(--surface-3)', line: 'var(--border)', line2: 'var(--border-soft)',
  act: 'var(--vermelho-acao)', red: 'var(--vermelho-texto)', redS: 'var(--tint-red)',
  amb: 'var(--tint-amber-text)', ambS: 'var(--tint-amber)', ambB: 'var(--tint-amber-border)',
  grn: 'var(--verde-acao)', grnT: 'var(--ok-texto)', blue: 'var(--tint-blue-text)',
};

function Cab({ titulo, sub, botao }: { titulo: string; sub?: string | null; botao?: { rotulo: string; aoTocar: () => void } | null }) {
  return (
    <View style={st.cab}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={st.cabT}>{titulo}</Text>
        {!!sub && <Text style={st.cabS} numberOfLines={1}>{sub}</Text>}
      </View>
      {!!botao && (
        <Pressable accessibilityRole="button" onPress={botao.aoTocar} style={st.bt} hitSlop={6}><Text style={st.btT}>{botao.rotulo}</Text></Pressable>
      )}
    </View>
  );
}
const Fora = ({ fonte }: { fonte: string }) => <Text style={st.fora}><Text style={{ fontWeight: '800' }}>— </Text>{`Fonte fora · ${fonte}`}</Text>;
const Lendo = () => <View style={st.lendo} accessibilityLabel="lendo" />;

// ---- a frase do topo e a chave da hora -------------------------------------------------------------
export function FraseDoHoje({ frase, hora, aoHora }: { frase: string; hora: Hora; aoHora: (h: Hora) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={st.chave} accessibilityRole="tablist" accessibilityLabel="a hora do dia">
        {HORAS.map(([k, rot]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: hora === k }} onPress={() => aoHora(k)}
            style={[st.chaveB, hora === k && { backgroundColor: C.card, borderColor: C.line }]}>
            <Text style={[st.chaveT, hora === k && { color: C.ink }]}>{rot}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={st.frase}>{frase}</Text>
    </View>
  );
}

// ---- Meu dinheiro ------------------------------------------------------------------------------------
export function MeuDinheiro({ din, mesIso, bonus, lendoBonus, aoComissao, aoBonus }: {
  din: Dinheiro | null | undefined; mesIso: string; bonus: string | null; lendoBonus: boolean; aoComissao: () => void; aoBonus: () => void;
}) {
  const cab = <Cab titulo="Meu dinheiro" sub="só o variável" botao={din ? { rotulo: 'Comissão', aoTocar: aoComissao } : null} />;
  if (din === undefined) return <View style={st.card}>{cab}<Lendo /></View>;
  if (!din) return <View style={st.card}>{cab}<Fora fonte="tabela de comissionamento" /></View>;
  const linhas: Array<{ t: string; s: string; v: string }> = [{ t: 'A próxima venda', s: 'a ' + ord(din.proximaN) + ' do mês', v: '+ ' + reais(din.proxima) }];
  if (din.degrau) linhas.push({ t: 'O salto da ' + ord(din.degrau.clientes) + ' venda', s: 'a faixa de ' + reais(din.degrau.porCliente) + ' vale para as ' + din.degrau.clientes + ': ' + reais(din.degrau.total), v: '+ ' + reais(din.degrau.salto) });
  if (din.naMeta) linhas.push({ t: 'Na meta, com ' + din.naMeta.clientes, s: 'a ' + ord(din.naMeta.clientes) + ' rende + ' + reais(din.naMeta.rende), v: reais(din.naMeta.total) });
  else if (din.meta) linhas.push({ t: 'Meta do mês batida', s: din.clientes + (din.clientes === 1 ? ' cliente' : ' clientes') + ' de ' + din.meta, v: reais(din.total) });
  return (
    <View style={st.card}>
      {cab}
      <Pressable accessibilityRole="button" accessibilityLabel={`${reais(din.total)} em ${MESES[Number(mesIso.slice(5, 7)) - 1]}. Abrir a comissão`} onPress={aoComissao}
        style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={st.rs}>{reais(din.total)}</Text>
        <Text style={st.sub}>{`em ${MESES[Number(mesIso.slice(5, 7)) - 1]}, até aqui`}</Text>
      </Pressable>
      <View style={st.escada} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {din.escada.map((g) => (
          <View key={g.n} style={[st.degrau, g.k === 'feita' && { backgroundColor: C.grn, borderColor: C.grn }, g.k === 'prox' && { borderColor: C.act }]}>
            <Text style={[st.degrauT, g.k === 'feita' && { color: '#FFFFFF' }, g.k === 'prox' && { color: C.red }]}>{g.n}</Text>
          </View>
        ))}
      </View>
      <Text style={st.leg}>{legendaDoDinheiro(din)}</Text>
      <View style={st.lns}>
        {linhas.map((l, i) => (
          <View key={l.t} style={[st.ln, i > 0 && { borderTopWidth: 1, borderTopColor: C.line2 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.lnT}>{l.t}</Text>
              <Text style={st.lnS}>{l.s}</Text>
            </View>
            <Text style={st.lnV}>{l.v}</Text>
          </View>
        ))}
      </View>
      {lendoBonus ? <Lendo /> : bonus ? (
        <Pressable accessibilityRole="button" onPress={aoBonus} style={st.bonus}><Text style={st.bonusT}>{bonus}</Text></Pressable>
      ) : null}
    </View>
  );
}

// ---- A meta em ação ------------------------------------------------------------------------------------
export function MetaEmAcao({ m, l1, l2, legenda, aoTocar }: { m: Mes | null; l1: string; l2: string; legenda: string; aoTocar: () => void }) {
  if (!m) return <View style={st.card}><Cab titulo="A meta em ação" /><Lendo /></View>;
  const tom = m.ritmo?.k === 'av' ? C.amb : C.grnT;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="A meta em ação. Abrir Eu" onPress={aoTocar} style={st.card}>
      <View style={st.cab}>
        <Text style={st.cabT}>A meta em ação</Text>
        {!!m.ritmo && <View style={[st.tag, { backgroundColor: m.ritmo.k === 'av' ? C.ambS : 'var(--tint-green)' }]}><Text style={[st.tagT, { color: tom }]}>{m.ritmo.t}</Text></View>}
      </View>
      <Text style={st.t1}>{l1}</Text>
      {!!l2 && <Text style={st.t2}>{l2}</Text>}
      {m.meta > 0 && (
        <>
          <View style={st.barra}>
            <View style={[st.barraV, { width: `${m.pct}%`, backgroundColor: m.ritmo?.k === 'av' ? 'var(--ambar-texto)' : C.grn }]} />
            <View style={[st.risco, { left: `${m.pctEsp}%` }]} />
          </View>
          <Text style={st.leg}>{legenda}</Text>
        </>
      )}
    </Pressable>
  );
}

// ---- Missão e sequência ----------------------------------------------------------------------------------
export function MissaoESequencia({ linhas, lendo, fora, aoTocar }: { linhas: Array<{ t: string; s: string }>; lendo: boolean; fora: boolean; aoTocar: () => void }) {
  return (
    <View style={st.card}>
      {lendo ? <Lendo /> : fora ? <Fora fonte="missão e sequência (desempenho)" /> : !linhas.length ? <Text style={st.leg}>Sem missão nem sequência nesta semana.</Text>
        : linhas.map((l, i) => (
          <Pressable key={l.t} accessibilityRole="button" onPress={aoTocar} style={[{ gap: 2, paddingVertical: 2 }, i > 0 && { borderTopWidth: 1, borderTopColor: C.line2, paddingTop: 8 }]}>
            <Text style={st.lnT}>{l.t}</Text>
            <Text style={st.lnS}>{l.s}</Text>
          </Pressable>
        ))}
    </View>
  );
}

// ---- O que cobrar ---------------------------------------------------------------------------------------
export function OQueCobrar<T>({ c, fora, rotulo, cor, nomeDe, porRotulo, aoPor, aoVer, aoFunil }: {
  c: { total: number; linhas: Array<LinhaACobrar<T>> } | null; fora: boolean;
  rotulo: (idx: number) => string; cor: (idx: number) => string; nomeDe: (i: T) => string;
  porRotulo: string | null; aoPor: (i: T) => void; aoVer: (idx: number) => void; aoFunil: () => void;
}) {
  if (fora) return <View style={st.card}><Cab titulo="O que cobrar" /><Fora fonte="fila do HubSpot" /></View>;
  if (!c) return <View style={st.card}><Cab titulo="O que cobrar" /><Lendo /></View>;
  /* o Cockpit diz "Meu funil →"; no app o botão abre a lista Sem próximo passo inteira, e o nome diz isso */
  const btF = { rotulo: 'Ver todos →', aoTocar: aoFunil };
  if (!c.total) return (
    <View style={st.card}>
      <Cab titulo="O que cobrar" sub="em dia" botao={btF} />
      <Text style={[st.lnT, { color: C.grnT }]}>Nada para cobrar: funil em dia.</Text>
    </View>
  );
  return (
    <View style={st.card}>
      <Cab titulo="O que cobrar" sub={`${c.total} para cobrar`} botao={btF} />
      {c.linhas.map((x, k) => {
        const titulo = x.n + ' em ' + rotulo(x.idx) + (x.parados ? (x.parados === 1 ? ', 1 parado' : ', ' + x.parados + ' parados') : '');
        const sub = k === 0
          ? 'o primeiro: ' + nomeDe(x.primeiro) + (x.regua != null ? ' · prazo de ' + x.regua + (x.regua === 1 ? ' dia' : ' dias') : '')
          : (x.pior ? 'a etapa mais entupida · ' : '') + (x.regua != null ? 'prazo de ' + x.regua + (x.regua === 1 ? ' dia' : ' dias') : 'sem prazo');
        return (
          <View key={x.idx} style={[st.cb, k > 0 && { borderTopWidth: 1, borderTopColor: C.line2 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${titulo}. Ver a lista`} onPress={() => aoVer(x.idx)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[st.dot, { backgroundColor: cor(x.idx) }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.lnT} numberOfLines={2}>{titulo}</Text>
                <Text style={st.lnS} numberOfLines={2}>{sub}</Text>
              </View>
            </Pressable>
            {k === 0 && porRotulo ? (
              <Pressable accessibilityRole="button" onPress={() => aoPor(x.primeiro)} style={[st.bt, { backgroundColor: C.act, borderColor: C.act }]}>
                <Text style={[st.btT, { color: '#FFFFFF' }]}>{porRotulo}</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => aoVer(x.idx)} style={st.bt}><Text style={st.btT}>Ver</Text></Pressable>
            )}
          </View>
        );
      })}
      <Text style={st.leg}>o dinheiro mais perto primeiro</Text>
    </View>
  );
}

// ---- A semana ---------------------------------------------------------------------------------------------
export function ASemana({ S, lendo, acumulo, aoBonus, aoAcumulo, aoTentar }: {
  S: Semana | null; lendo: boolean; acumulo: string | null; aoBonus: () => void; aoAcumulo: () => void; aoTentar: () => void;
}) {
  const btB = { rotulo: 'Bônus', aoTocar: aoBonus };
  if (lendo) return <View style={st.card}><Cab titulo="A semana" botao={btB} /><Lendo /></View>;
  if (!S) return (
    <View style={st.card}>
      <Cab titulo="A semana" botao={btB} />
      <Text style={st.fora}><Text style={{ fontWeight: '800' }}>— </Text>Fonte fora · placar_da_semana </Text>
      <Pressable accessibilityRole="button" onPress={aoTentar} hitSlop={8}><Text style={st.link}>Tentar de novo</Text></Pressable>
    </View>
  );
  const topo = topoDaSemana(S);
  return (
    <View style={st.card}>
      <Cab titulo="A semana" sub={periodoDaSemana(S)} botao={btB} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={st.pts}>{topo.pts}</Text>
        <Text style={[st.sub, { flexShrink: 1 }]}>{topo.t}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="abrir o bônus da semana" onPress={aoBonus} style={{ gap: 2 }}>
        {S.linhas.map((x) => (
          <View key={x.pos + x.nome} style={[st.rl, x.euMesmo && { backgroundColor: C.redS }]}>
            <Text style={st.rlP}>{x.pos}º</Text>
            <Text style={[st.rlN, x.euMesmo && { color: C.red }]} numberOfLines={1}>{x.nome + (x.euMesmo ? ' · você' : '')}</Text>
            <Text style={st.rlV}>{x.pontos}</Text>
          </View>
        ))}
      </Pressable>
      {!!acumulo && (
        <Pressable accessibilityRole="button" onPress={aoAcumulo} style={st.ac}>
          <View style={[st.dot, { backgroundColor: C.act }]} />
          <Text style={st.acT} numberOfLines={2}><Text style={{ fontWeight: '800', color: C.ink }}>Etapa com acúmulo </Text>{acumulo}</Text>
          <Text style={st.acSeta}>›</Text>
        </Pressable>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, padding: 12, gap: 8 },
  cab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 },
  cabT: { fontSize: 15, fontWeight: '800', color: C.ink },
  cabS: { fontSize: 12, color: C.ink3, flexShrink: 1 },
  bt: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.sub, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  btT: { fontSize: 12.5, fontWeight: '800', color: C.ink },
  fora: { fontSize: 12.5, color: C.ink3 },
  link: { fontSize: 12.5, fontWeight: '700', color: C.blue },
  lendo: { height: 40, borderRadius: 10, backgroundColor: C.sub },
  chave: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: C.sub, alignSelf: 'flex-start' },
  chaveB: { height: 28, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
  chaveT: { fontSize: 12, fontWeight: '700', color: C.ink3 },
  frase: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: C.ink },
  rs: { fontSize: 30, lineHeight: 34, fontWeight: '900', color: C.ink, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 12.5, color: C.ink3 },
  escada: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  degrau: { minWidth: 22, height: 22, paddingHorizontal: 4, borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.sub, alignItems: 'center', justifyContent: 'center' },
  degrauT: { fontSize: 11, fontWeight: '800', color: C.ink3 },
  leg: { fontSize: 12, color: C.ink3 },
  lns: { gap: 0 },
  ln: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  lnT: { fontSize: 13.5, fontWeight: '800', color: C.ink },
  lnS: { fontSize: 12, color: C.ink3 },
  lnV: { fontSize: 14, fontWeight: '900', color: C.ink, fontVariant: ['tabular-nums'] },
  bonus: { borderRadius: 10, backgroundColor: C.ambS, borderWidth: 1, borderColor: C.ambB, padding: 10 },
  bonusT: { fontSize: 12.5, fontWeight: '700', color: C.amb },
  tag: { height: 22, paddingHorizontal: 8, borderRadius: 11, justifyContent: 'center' },
  tagT: { fontSize: 11, fontWeight: '800' },
  t1: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  t2: { fontSize: 12.5, color: C.ink2 },
  barra: { height: 8, borderRadius: 4, backgroundColor: C.chip, overflow: 'visible', position: 'relative' },
  barraV: { height: 8, borderRadius: 4 },
  risco: { position: 'absolute', top: -3, width: 2, height: 14, marginLeft: -1, backgroundColor: C.ink2 },
  cb: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  pts: { fontSize: 24, lineHeight: 28, fontWeight: '900', color: C.ink, fontVariant: ['tabular-nums'] },
  rl: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28, paddingHorizontal: 6, borderRadius: 8 },
  rlP: { width: 24, fontSize: 12.5, fontWeight: '800', color: C.ink3 },
  rlN: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: '700', color: C.ink },
  rlV: { fontSize: 13.5, fontWeight: '900', color: C.ink, fontVariant: ['tabular-nums'] },
  ac: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderTopWidth: 1, borderTopColor: C.line2, paddingTop: 8 },
  acT: { flex: 1, minWidth: 0, fontSize: 12.5, color: C.ink3 },
  acSeta: { fontSize: 18, color: C.ink3 },
});
