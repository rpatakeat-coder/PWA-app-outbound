// As peças da aba Hoje enxuta (handoff "App de rua · abas Hoje e Eu, enxutas", 03/11/26). A prancha
// usa os tokens do Cockpit; aqui cada cor é um token do app (public/index.html, claro e escuro). As
// medidas, a ordem e o copy são os da prancha. Nada aqui grava: quem grava é a FilaTarefasScreen,
// pelos mesmos caminhos de antes (concluirComDesfazer, enviarDaAba, Pôr no plano).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const C = {
  ink: 'var(--text)', ink2: 'var(--text-subtle)', ink3: 'var(--text-muted)', mute: 'var(--text-faint)',
  card: 'var(--surface)', sub: 'var(--surface-2)', chip: 'var(--surface-3)', line: 'var(--border)', line2: 'var(--border-soft)',
  act: 'var(--vermelho-acao)', red: 'var(--vermelho-texto)', redS: 'var(--tint-red)', redB: 'var(--tint-red-border)',
  amb: 'var(--tint-amber-text)', ambS: 'var(--tint-amber)', ambB: 'var(--tint-amber-border)',
  grn: 'var(--verde-acao)', grnT: 'var(--ok-texto)', blue: 'var(--tint-blue-text)', inv: 'var(--bg)',
};

/** Rola a aba até o grupo (o chip da contagem e o "↑ está na próxima ação"). */
export function rolarAte(id: string) {
  try { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* sem DOM */ }
}

// ---- H2 · a contagem única -------------------------------------------------------------------
export type ChipDaContagem = { chave: string; rotulo: string; quente?: boolean; aoTocar: () => void };
export function ContagemDoHoje({ chips }: { chips: ChipDaContagem[] }) {
  return (
    <View style={st.contagem}>
      {chips.map((c) => (
        <Pressable key={c.chave} accessibilityRole="button" accessibilityLabel={`${c.rotulo}: ir para o grupo`} onPress={c.aoTocar}
          style={[st.chipCont, c.quente && { backgroundColor: C.redS, borderColor: C.act }]}>
          <Text style={[st.chipContT, c.quente && { color: C.red }]} numberOfLines={1}>{c.rotulo}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---- o placar do dia -------------------------------------------------------------------------
export type SeloDoPlacar = { texto: string; lider?: boolean };
export function PlacarDoDia({ portas, meta, demo, selos, aoSelo }: {
  /** null = o plano/visitas não responderam: "—", nunca 0 */
  portas: number | null; meta: number;
  demo: { n: number | null; sub: string };
  selos: SeloDoPlacar[]; aoSelo: () => void;
}) {
  const segs = Array.from({ length: Math.max(1, meta) }, (_, i) => i < (portas ?? 0));
  return (
    <View style={st.card}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1.4, minWidth: 0, gap: 4 }}>
          <Text style={st.kicker}>PORTAS COM PROVA</Text>
          <Text style={[st.numGrande, portas != null && portas >= meta && { color: C.grnT }]}>
            {portas == null ? '—' : portas}<Text style={st.numDe}>{` de ${meta}`}</Text>
          </Text>
          <View style={st.segs}>{segs.map((ok, i) => <View key={i} style={[st.seg, { backgroundColor: ok ? C.grn : C.chip }]} />)}</View>
        </View>
        <View style={st.divisor} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={st.kicker}>DEMO</Text>
          <Text style={[st.numGrande, !!demo.n && { color: C.grnT }]}>{demo.n == null ? '—' : demo.n}<Text style={st.numDe}> de 1</Text></Text>
          <Text style={st.demoSub} numberOfLines={2}>{demo.sub}</Text>
        </View>
      </View>
      {selos.length > 0 && (
        <View style={st.selos}>
          {selos.map((s) => (
            <Pressable key={s.texto} accessibilityRole="button" accessibilityLabel={`${s.texto}. Abrir Eu`} onPress={aoSelo}
              style={[st.selo, s.lider && { backgroundColor: C.ambS, borderColor: C.ambB }]}>
              <Text style={[st.seloT, s.lider && { color: C.amb }]}>{s.texto}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ---- o plano do dia (3 portas + "ver as N") ------------------------------------------------------
export type PortaDoPlano = { id: string; hora: string | null; nome: string; tipo: string; quente: boolean; recem: boolean; feita: boolean; /** visitada sem prova (fora do raio, sem foto): não é pendente nem conta */ semProva?: boolean };
export function PlanoDoDia({ titulo, portas, verTodas, aoAlternar, temMais, rotuloMais, aoIr, vazio }: {
  titulo: string; portas: PortaDoPlano[]; verTodas: boolean; aoAlternar: () => void; temMais: boolean; rotuloMais: string;
  aoIr: (p: PortaDoPlano) => void;
  vazio: { titulo: string; texto: string; botao: string | null; aoMontar: () => void } | null;
}) {
  const primeira = portas.find((p) => !p.feita && !p.semProva);
  return (
    <View style={st.card} nativeID="g-plano">
      <View style={st.cabGrupo}>
        <Text style={st.kicker} numberOfLines={1}>{titulo}</Text>
        {temMais && (
          <Pressable accessibilityRole="button" onPress={aoAlternar} hitSlop={8}><Text style={st.link}>{verTodas ? 'menos' : rotuloMais}</Text></Pressable>
        )}
      </View>
      {vazio ? (
        <View style={{ gap: 8 }}>
          <Text style={st.vazioT}>{vazio.titulo}</Text>
          <Text style={st.sub2}>{vazio.texto}</Text>
          {!!vazio.botao && (
            <Pressable accessibilityRole="button" onPress={vazio.aoMontar} style={st.botaoCheio}><Text style={st.botaoCheioT}>{vazio.botao}</Text></Pressable>
          )}
        </View>
      ) : portas.map((p, i) => {
        const prim = p === primeira;
        return (
          <View key={p.id + i} style={[st.porta, i > 0 && { borderTopWidth: 1, borderTopColor: C.line2 }]}>
            <Text style={[st.portaHora, p.feita && { color: C.mute }]}>{p.hora ?? '—'}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[st.portaNome, p.feita && { color: C.ink3 }]} numberOfLines={1}>{p.nome}</Text>
              <Text style={[st.portaSub, p.quente ? { color: C.amb } : p.recem ? { color: C.blue } : null]} numberOfLines={1}>
                {p.feita ? 'prova ✓' : p.semProva ? 'visitada · sem prova' : `${p.tipo}${p.quente ? ' · quente' : ''}${p.recem ? ' · recém-aberto' : ''}`}
              </Text>
            </View>
            {!p.feita && !p.semProva && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Ir até ${p.nome} no mapa`} onPress={() => aoIr(p)}
                style={[st.ir, prim ? { backgroundColor: C.act, borderColor: C.act } : null]}>
                <Text style={[st.irT, prim && { color: '#FFFFFF' }]}>Ir</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ---- a próxima ação · maior valor ------------------------------------------------------------------
export function ProximaAcao({ nome, sub, combinado, verbo, aoVerbo, aoNome }: {
  nome: string; sub: string; combinado: string | null; verbo: string; aoVerbo: () => void; aoNome: (() => void) | null;
}) {
  return (
    <View style={[st.card, { borderColor: C.act, borderWidth: 1.5 }]}>
      <Text style={[st.kicker, { color: C.red }]}>PRÓXIMA AÇÃO · MAIOR VALOR</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityRole="button" disabled={!aoNome} onPress={aoNome ?? undefined} style={{ flex: 1, minWidth: 0 }}
          accessibilityLabel={aoNome ? `${nome}: abrir a linha com as outras ações` : nome}>
          <Text style={st.proxNome} numberOfLines={1}>{nome}</Text>
          <Text style={st.sub2} numberOfLines={1}>{sub}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={aoVerbo} style={st.verboGrande}><Text style={st.botaoCheioT} numberOfLines={1}>{verbo}</Text></Pressable>
      </View>
      {!!combinado && <Text style={st.combinado} numberOfLines={1}>{`combinado: ${combinado}`}</Text>}
    </View>
  );
}

// ---- um grupo (Atrasados, Ligar hoje, Sem próximo passo) --------------------------------------------
export function GrupoDoHoje({ id, titulo, n, alerta, regra, ajudaAberta, aoAjuda, mais, naProxima, vazio, nota, children }: {
  id: string; titulo: string; n: number; alerta?: boolean; regra: string; ajudaAberta: boolean; aoAjuda: () => void;
  mais: { rotulo: string; aoTocar: () => void } | null;
  naProxima: { nome: string; aoTocar: () => void } | null;
  vazio: string | null; nota?: string | null; children?: React.ReactNode;
}) {
  return (
    <View nativeID={id} style={{ gap: 6 }}>
      <View style={st.cabGrupo}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1, minWidth: 0 }}>
          <Text style={[st.kicker, alerta && n > 0 && { color: C.red }]} numberOfLines={1}>{titulo.toUpperCase()}</Text>
          <Text style={[st.grupoN, alerta && n > 0 && { color: C.red }]}>{n}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {!!mais && <Pressable accessibilityRole="button" onPress={mais.aoTocar} hitSlop={8}><Text style={st.link}>{mais.rotulo}</Text></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={`A regra de ${titulo}`} accessibilityState={{ expanded: ajudaAberta }} onPress={aoAjuda} style={st.ajuda}>
            <Text style={st.ajudaT}>?</Text>
          </Pressable>
        </View>
      </View>
      {ajudaAberta && <View style={st.regra}><Text style={st.regraT}>{regra}</Text></View>}
      {vazio != null ? <Text style={st.vazioVerde}>{vazio}</Text> : (
        <View style={[st.card, { paddingVertical: 2, gap: 0 }]}>
          {!!naProxima && (
            <Pressable accessibilityRole="button" onPress={naProxima.aoTocar} style={st.naProx}>
              <Text style={st.sub2} numberOfLines={1}>{`↑ ${naProxima.nome} está na próxima ação`}</Text>
            </Pressable>
          )}
          {children}
        </View>
      )}
      {!!nota && <Text style={st.nota}>{nota}</Text>}
    </View>
  );
}

// ---- a linha fechada (46+) e aberta -------------------------------------------------------------------
export type AcaoDaLinha = { rotulo: string; onPress: () => void };
export function LinhaDoHoje({ id, primeira, destaque = false, nome, sub, quente, verbo, aoVerbo, aberta, aoAbrir, combinado, acoes, saindo, children }: {
  id: string; primeira: boolean; destaque?: boolean; nome: string; sub: string; quente: boolean; verbo: string; aoVerbo: () => void;
  aberta: boolean; aoAbrir: () => void; combinado: string | null; acoes: AcaoDaLinha[];
  saindo: { segundos: number; aoDesfazer: () => void } | null; children?: React.ReactNode;
}) {
  return (
    <View nativeID={`fila-${id}`} style={[st.linha, !primeira && { borderTopWidth: 1, borderTopColor: C.line2 }, destaque && st.linhaDestaque]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: aberta }} accessibilityLabel={`${nome}: ${aberta ? 'fechar' : 'abrir o combinado e as outras ações'}`}
          onPress={aoAbrir} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {quente && <View style={st.pontoQuente} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[st.linhaNome, !!saindo && { color: C.ink3 }]} numberOfLines={1}>{nome}</Text>
            <Text style={[st.linhaSub, quente && { color: C.amb }]} numberOfLines={1}>{sub}</Text>
          </View>
        </Pressable>
        {saindo ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Desfazer, ${saindo.segundos} segundos`} onPress={saindo.aoDesfazer} style={[st.verbo, { borderColor: C.grn }]}>
            <Text style={[st.verboT, { color: C.grnT }]} numberOfLines={1}>{`✓ Desfazer ${saindo.segundos}s`}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={aoVerbo} style={[st.verbo, quente && { backgroundColor: C.act, borderColor: C.act }]}>
            <Text style={[st.verboT, quente && { color: '#FFFFFF' }]} numberOfLines={1}>{verbo}</Text>
          </Pressable>
        )}
      </View>
      {aberta && !saindo && (
        <View style={{ gap: 8, paddingBottom: 10 }}>
          {!!combinado && <Text style={st.combinado}><Text style={{ fontWeight: '700', color: C.ink }}>O que foi combinado: </Text>{combinado}</Text>}
          {acoes.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {acoes.map((a) => (
                <Pressable key={a.rotulo} accessibilityRole="button" onPress={a.onPress} style={st.acao}><Text style={st.acaoT}>{a.rotulo}</Text></Pressable>
              ))}
            </View>
          )}
          {children}
        </View>
      )}
    </View>
  );
}

// ---- os 3 recolhidos lado a lado ----------------------------------------------------------------------------
export function RecolhidosDoHoje({ itens, aberto, aoEscolher, children }: {
  itens: Array<{ chave: string; rotulo: string; n: number }>; aberto: string | null; aoEscolher: (k: string) => void; children?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {itens.map((r) => (
          <Pressable key={r.chave} accessibilityRole="button" accessibilityState={{ expanded: aberto === r.chave }} onPress={() => aoEscolher(r.chave)}
            style={[st.recolhido, aberto === r.chave && { backgroundColor: C.sub, borderColor: C.ink3 }]}>
            <Text style={st.recN}>{r.n}</Text>
            {/* 2 linhas: a 390 "Com o gestor" não cabe ao lado do número e cortava em "Com o gest…" (produção, 04/11) */}
            <Text style={st.recT} numberOfLines={2}>{r.rotulo}</Text>
          </Pressable>
        ))}
      </View>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  contagem: { flexDirection: 'row', gap: 6, flexWrap: 'nowrap' },
  chipCont: { height: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, justifyContent: 'center', flexShrink: 1, minWidth: 0 },
  chipContT: { fontSize: 12.5, fontWeight: '700', color: C.ink2 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, padding: 12, gap: 8 },
  kicker: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: C.ink3 },
  numGrande: { fontSize: 32, lineHeight: 36, fontWeight: '900', color: C.ink },
  numDe: { fontSize: 18, fontWeight: '800', color: C.mute },
  segs: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 6, borderRadius: 3 },
  divisor: { width: 1, backgroundColor: C.line2 },
  demoSub: { fontSize: 12, color: C.ink3 },
  /* os 3 selos numa linha a 390; a 375 com nome de placar longo, quebram linha em vez de cortar */
  selos: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  selo: { height: 24, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, borderColor: C.line2, backgroundColor: C.sub, justifyContent: 'center' },
  seloT: { fontSize: 10.5, fontWeight: '600', color: C.ink2 },
  cabGrupo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24 },
  link: { fontSize: 12.5, fontWeight: '700', color: C.blue },
  porta: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 2 },
  portaHora: { width: 42, fontSize: 13, fontWeight: '800', color: C.ink2 },
  portaNome: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  portaSub: { fontSize: 12, color: C.ink3 },
  ir: { height: 36, minWidth: 52, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.sub, alignItems: 'center', justifyContent: 'center' },
  irT: { fontSize: 14, fontWeight: '800', color: C.ink },
  vazioT: { fontSize: 15, fontWeight: '800', color: C.ink },
  sub2: { fontSize: 12.5, color: C.ink3 },
  botaoCheio: { minHeight: 44, borderRadius: 12, backgroundColor: C.act, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  botaoCheioT: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  proxNome: { fontSize: 17, fontWeight: '800', color: C.ink },
  verboGrande: { minHeight: 44, minWidth: 88, paddingHorizontal: 16, borderRadius: 22, backgroundColor: C.act, alignItems: 'center', justifyContent: 'center' },
  combinado: { fontSize: 12.5, color: C.ink3 },
  grupoN: { fontSize: 13, fontWeight: '800', color: C.ink2 },
  ajuda: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  ajudaT: { fontSize: 12, fontWeight: '800', color: C.ink3 },
  regra: { borderRadius: 10, backgroundColor: C.sub, padding: 10 },
  regraT: { fontSize: 12.5, color: C.ink2 },
  vazioVerde: { fontSize: 13, fontWeight: '700', color: C.grnT, paddingVertical: 4 },
  naProx: { minHeight: 36, justifyContent: 'center' },
  nota: { fontSize: 12, color: C.ink3 },
  linha: { gap: 0 },
  /* o cartão que veio do push ou da Agenda (e o selecionado no computador) */
  linhaDestaque: { backgroundColor: C.redS, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 10 },
  pontoQuente: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'var(--ambar-texto)' },
  linhaNome: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  linhaSub: { fontSize: 12, color: C.ink3 },
  verbo: { minHeight: 36, minWidth: 64, maxWidth: 140, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.sub, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  verboT: { fontSize: 13.5, fontWeight: '800', color: C.ink },
  acao: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.sub, justifyContent: 'center' },
  acaoT: { fontSize: 13, fontWeight: '700', color: C.ink },
  recolhido: { flex: 1, minWidth: 0, height: 42, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6 },
  recN: { fontSize: 15, fontWeight: '900', color: C.ink },
  recT: { fontSize: 12, lineHeight: 14, fontWeight: '700', color: C.ink2, flexShrink: 1 },
});
