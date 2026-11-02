// Meu desempenho v2 — o jogo da carreira (handoff "Desenvolvimento v2", 01/11/26).
//
// "Eu tenho certeza que ninguém clica na aba Desenvolvimento. Tem que gamificar." A tela responde em
// 5 s: onde eu estou, o que eu ganho a seguir e quanto falta. Nove blocos, nesta ordem: o 1:1 em uma
// linha, a semana (a disputa dos R$ 250), a missão da semana, as sequências, o mês (a escada do
// variável), a habilidade do mês, a carreira (com o Playbook), a coleção e você contra você.
//
// Tudo vem de desenvolvimento_quadro() (migração 0240) e é formatado por
// supabase/functions/_compartilhado/desenvolvimentoV2.ts — o mesmo texto que o Cockpit mostra na aba
// Desenvolvimento (DV2, testado com a mesma fixture). Aqui só mora o layout.
//
// Saíram desta aba (README §1): os 5 números do Hoje (continuam no Hoje) e os blocos de cobrança; o
// v1 continua inteiro em MeuDesempenhoScreen e volta com localStorage['meu-desempenho-v1'] = '1'.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../integrations/supabase/client';
import { useLayout } from '../hooks/useLayout';
import {
  IconBook, IconCalendar, IconCheck, IconCheckCircle, IconClock, IconFlame, IconLocation, IconShieldCheck, IconStar,
  IconTarget, IconTrophy, IconUserGroup, IconZap, useIconColors,
} from '../components/icons';
import FolhaRanking from './FolhaRanking';
import {
  montarDesenvolvimento, type VM, type Tom,
} from '../../supabase/functions/_compartilhado/desenvolvimentoV2';

// o quadro, os capítulos, as conquistas vistas e o "reduzir movimento" moram em ../hooks/useDesenvolvimento
import { destaqueDaSessao, marcarVistas, registrarAbertura, useCapitulos, useDesenvolvimentoQuadro, useReduzirMovimento, type OrigemAbertura } from '../hooks/useDesenvolvimento';

const COR: Record<Tom, string> = {
  ok: 'var(--tint-green-text)', av: 'var(--tint-amber-text)', rota: 'var(--tint-blue-text)', acao: 'var(--vermelho-texto)', mute: 'var(--text)', dim: 'var(--text-muted)',
};
const AV_BARRA = '#D97706';

function Icone({ nome, cor, tam = 20 }: { nome: string; cor: string; tam?: number }) {
  const p = { width: tam, height: tam, fill: cor };
  switch (nome) {
    case 'flame': return <IconFlame {...p} />;
    case 'trophy': return <IconTrophy {...p} />;
    case 'star': return <IconStar {...p} />;
    case 'map-pin': return <IconLocation {...p} />;
    case 'book': return <IconBook {...p} />;
    case 'clock': return <IconClock {...p} />;
    case 'check-circle': return <IconCheckCircle {...p} />;
    case 'users': return <IconUserGroup {...p} />;
    case 'zap': return <IconZap {...p} />;
    case 'shield-check': return <IconShieldCheck {...p} />;
    case 'calendar': return <IconCalendar {...p} />;
    default: return <IconTarget {...p} />;
  }
}

type Props = {
  enabled: boolean;
  linhas?: Array<{ chave: string; rotulo: string; sub?: string | null; selo?: string | null; perigo?: boolean; aoTocar: () => void }>;
  /** de onde a pessoa chegou (a medição do aceite, aberturas_de_tela) */
  origem?: OrigemAbertura;
  /** rolar até a coleção (o toque do toast); o número muda a cada pedido */
  rolarColecao?: number;
  aoFazerQuiz?: () => void;
};

export function MeuDesempenhoV2Screen({ enabled, linhas = [], origem = 'menu', rolarColecao, aoFazerQuiz }: Props) {
  const layout = useLayout();
  const cores = useIconColors();
  const q = useDesenvolvimentoQuadro(enabled);
  const capitulos = useCapitulos(enabled);
  const reduzir = useReduzirMovimento();
  const vm: VM | null = useMemo(() => (q.data && !q.data.erro ? montarDesenvolvimento(q.data, capitulos) : null), [q.data, capitulos]);
  const [umAberto, setUmAberto] = useState(false);
  const [rankingAberto, setRankingAberto] = useState(false);
  const rolagem = useRef<ScrollView>(null);
  const yColecao = useRef<number | null>(null);

  /* a medição: uma abertura por vez que a aba aparece */
  const abriu = useRef(false);
  useEffect(() => {
    if (!enabled) { abriu.current = false; return; }
    if (abriu.current) return;
    abriu.current = true;
    registrarAbertura(origem);
  }, [enabled, origem]);

  /* o toque do toast rola até a coleção, com a medalha nova destacada */
  useEffect(() => {
    if (!rolarColecao || !vm) return;
    const t = setTimeout(() => { if (yColecao.current != null) rolagem.current?.scrollTo({ y: Math.max(0, yColecao.current - 12), animated: !reduzir }); }, 80);
    return () => clearTimeout(t);
  }, [rolarColecao, vm, reduzir]);

  /* a coleção mostrou a conquista nova: grava em conquistas_vistas (some o selo do menu do Cockpit) */
  const novasIds = vm ? vm.novas.map((n) => n.id).join(',') : '';
  useEffect(() => {
    if (!enabled || !novasIds) return;
    const ids = novasIds.split(',');
    ids.forEach((i) => destaqueDaSessao.add(i));
    const t = setTimeout(() => { void marcarVistas(ids, 'colecao'); }, 2000);
    return () => clearTimeout(t);
  }, [enabled, novasIds]);

  if (q.isLoading) {
    return (
      <View style={st.tela}><View style={st.conteudo}>
        <Text style={st.fraco}>Montando o seu jogo com os mesmos números do Cockpit…</Text>
        {[48, 220, 180, 160].map((h, i) => <View key={i} style={[st.esqueleto, { height: h }]} />)}
      </View></View>
    );
  }
  if (q.isError || !vm) {
    return (
      <View style={[st.tela, st.centro]}>
        <Text style={st.vazioTitulo}>Não carreguei o seu desempenho agora</Text>
        <Text style={st.fraco}>{`— · desenvolvimento_quadro${q.data?.erro ? ` (${q.data.erro})` : ''}. Nada foi perdido: a prova continua contando.`}</Text>
        <Pressable accessibilityRole="button" style={st.botao} onPress={() => void q.refetch()}><Text style={st.botaoTexto}>Tentar de novo</Text></Pressable>
      </View>
    );
  }
  const largo = layout.ehDesktop;

  // ── cabeçalho ──
  const cab = (
    <View style={{ gap: 6 }}>
      <Text style={st.titulo}>Meu desempenho</Text>
      <Text style={st.fraco}>{vm.cab.sub}</Text>
      <View style={st.linha}>
        {vm.cab.selos.map((s) => (
          <View key={s.t} style={[st.selo, s.tom === 'pri' ? { backgroundColor: 'var(--text)' } : { backgroundColor: 'var(--tint-blue)' }]}>
            <Text style={[st.seloTexto, { color: s.tom === 'pri' ? 'var(--surface)' : 'var(--tint-blue-text)' }]}>{s.t}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  // ── 1 · o 1:1 em uma linha ──
  const um = vm.umAUm;
  const blocoUm = (
    <View style={[st.cartao, { paddingVertical: 0, gap: 0 }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: umAberto }} disabled={um.convite || !um.itens.length}
        onPress={() => setUmAberto((v) => !v)} style={st.umLinha}>
        <IconCalendar width={18} height={18} fill={cores.muted} />
        <Text style={[st.texto, { flex: 1 }]}>{um.texto}</Text>
        {!um.convite && um.itens.length > 0 && <Text style={st.link}>{umAberto ? 'fechar' : 'ver'}</Text>}
      </Pressable>
      {umAberto && (
        <View style={{ gap: 6, paddingBottom: 12 }}>
          {um.itens.map((x, i) => (
            <View key={i} style={st.linha}><View style={[st.ponto, { backgroundColor: x.tom === 'ok' ? 'var(--verde-acao)' : 'var(--tint-blue-text)' }]} /><Text style={st.fraco}>{x.t}</Text></View>
          ))}
        </View>
      )}
    </View>
  );

  // ── 2 · a semana ──
  const S = vm.semana;
  const blocoSemana = (
    <View style={st.cartao}>
      <View style={st.kickerLinha}><Text style={[st.kicker, { color: 'var(--tint-blue-text)' }]}>{S.kicker}</Text><Text style={st.nota}>{S.ateCurto || S.ate}</Text></View>
      <View style={[st.linha, { alignItems: 'flex-end', justifyContent: 'space-between' }]}>
        <View style={{ flexShrink: 1 }}>
          <Text style={st.grande}>{S.pts}<Text style={st.fraco}>{S.fora ? '' : '  pts'}</Text></Text>
          <Text style={[st.textoForte, { color: COR[S.posTom] }]}>{S.posTexto}</Text>
        </View>
        {S.podio.length > 0 && (
          <View style={st.podio} accessibilityLabel="pódio da semana">
            {S.podio.map((p) => (
              <View key={p.lugar} style={st.podioCol}>
                <Text style={[st.nota, p.eu && { color: 'var(--tint-blue-text)', fontWeight: '700' }]}>{p.pts}</Text>
                <View style={[st.podioBloco, { height: p.altura, backgroundColor: p.eu ? 'var(--tint-blue-text)' : 'var(--surface-2)' }]}>
                  <Text style={[st.podioLugar, { color: p.eu ? 'var(--surface)' : 'var(--text-muted)' }]}>{p.lugar}</Text>
                </View>
                <Text style={[st.nota, p.eu && { color: 'var(--tint-blue-text)', fontWeight: '700' }]} numberOfLines={1}>{p.nome}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={[st.caixa, { backgroundColor: 'var(--tint-blue)' }]}><Text style={[st.textoForte, { color: 'var(--tint-blue-text)' }]}>{S.proximo}</Text></View>
      <View style={st.linha}>{S.regra.map((r) => <View key={r.t} style={st.chip}><Text style={st.chipTexto}><Text style={{ fontWeight: '800' }}>{r.v}</Text>{` ${r.t}`}</Text></View>)}</View>
      <Text style={st.nota}>{S.nota}</Text>
      {/* o ranking completo fica na Disputa (README, regra 3): aqui só o pódio e o próximo a passar */}
      {!S.fora && q.data?.pessoa.fase !== 'novato' && (
        <Pressable accessibilityRole="button" onPress={() => setRankingAberto(true)} style={[st.botao, { alignSelf: 'flex-start' }]}><Text style={st.botaoTexto}>a disputa completa</Text></Pressable>
      )}
    </View>
  );

  // ── 3 · a missão da semana ──
  const M = vm.missao;
  const blocoMissao = (
    <View style={[st.cartao, { borderWidth: 1.5, borderColor: M.cumprida ? 'var(--verde-acao)' : 'var(--vermelho-acao)', backgroundColor: M.cumprida ? 'var(--tint-green)' : 'var(--surface)' }]}>
      <View style={st.kickerLinha}><Text style={[st.kicker, { color: M.cumprida ? 'var(--tint-green-text)' : 'var(--vermelho-texto)' }]}>{M.kicker}</Text><Text style={st.nota}>{M.prazo}</Text></View>
      {M.cumprida ? <Celebracao selo={M.selo} icone={M.icone} texto={M.celebra} reduzir={reduzir} aoVer={() => { if (yColecao.current != null) rolagem.current?.scrollTo({ y: yColecao.current - 12, animated: !reduzir }); }} /> : null}
      <Text style={st.missaoTitulo}>{M.titulo}</Text>
      <View style={[st.linha, { flexWrap: 'wrap' }]}>
        {M.passos.map((f, i) => <View key={i} style={[st.passo, { backgroundColor: f ? (M.cumprida ? 'var(--verde-acao)' : 'var(--vermelho-acao)') : 'var(--surface-3)' }]} />)}
        <Text style={[st.textoForte, { color: M.cumprida ? 'var(--tint-green-text)' : 'var(--text)' }]}>{M.contagem}</Text>
        <Text style={st.fraco}>{M.unidade}</Text>
      </View>
      {!M.cumprida && !M.fora && (
        <View style={st.premio}><Icone nome={M.icone} cor={cores.muted} /><Text style={[st.texto, { flex: 1 }]}>{M.premio}</Text></View>
      )}
      <Text style={st.nota}>{M.nota}</Text>
    </View>
  );

  // ── 4 · as sequências ──
  const Q = vm.sequencias;
  const blocoSeq = (
    <View style={st.cartao}>
      <Text style={[st.kicker, { color: 'var(--vermelho-texto)' }]}>SEQUÊNCIAS</Text>
      {Q.fora ? <Text style={st.fraco}>{Q.nota}</Text> : Q.itens.map((x) => (
        <View key={x.id} style={{ gap: 8 }}>
          <View style={st.linha}>
            <View style={[st.icone40, { backgroundColor: x.acesa ? 'var(--tint-red)' : 'var(--surface-2)' }]}><Icone nome={x.icone} cor={x.acesa ? cores.brand : cores.faint} /></View>
            <View style={{ flex: 1 }}><Text style={st.textoForte}>{x.titulo}</Text><Text style={st.nota}>{x.sub}</Text></View>
          </View>
          <View style={st.linha}>
            {x.dias.map((d, i) => (
              <View key={i} style={{ flex: 1, gap: 4, alignItems: 'center' }}>
                <View style={[st.barraDia, d.st === 'fer' ? st.hachura : { backgroundColor: d.st === 'ok' ? 'var(--vermelho-acao)' : d.st === 'hoje' ? 'var(--stroke-strong)' : 'var(--surface-3)' }]} />
                <Text style={[st.mini, d.st === 'fer' && { color: 'var(--tint-amber-text)' }, d.st === 'hoje' && { color: 'var(--text)', fontWeight: '700' }]}>{d.rotulo}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      {!Q.fora && <Text style={[st.nota, Q.notaTom === 'av' && { color: 'var(--tint-amber-text)' }]}>{Q.nota}</Text>}
    </View>
  );

  // ── 5 · o mês: a escada do variável ──
  const X = vm.variavel;
  const blocoVar = (
    <View style={st.cartao}>
      <Text style={[st.kicker, { color: 'var(--tint-green-text)' }]}>O MÊS · SEU VARIÁVEL</Text>
      <Text style={st.blocoTitulo}>{X.titulo}</Text>
      <Text style={st.fraco}>{X.sub}</Text>
      {X.faixas.length > 0 && (
        <View style={[st.linha, { alignItems: 'flex-end', flexWrap: 'wrap' }]}>
          {X.faixas.map((g) => (
            <View key={g.rotulo} style={{ gap: 4, flexGrow: g.degraus.length }}>
              <Text style={[st.mini, { color: g.atual ? 'var(--tint-green-text)' : 'var(--text-muted)', fontWeight: '700' }]}>{g.rotulo}</Text>
              <View style={[st.linha, { gap: 4 }]}>
                {g.degraus.map((d) => (
                  <View key={d.n} style={[st.degrau, d.st === 'feita' ? { backgroundColor: 'var(--verde-acao)', borderColor: 'var(--verde-acao)' } : d.st === 'proxima' ? { borderColor: 'var(--text)', borderStyle: 'solid' } : { borderColor: 'var(--stroke-strong)', borderStyle: 'dashed' }]}>
                    <Text style={[st.degrauTexto, { color: d.st === 'feita' ? '#FFFFFF' : d.st === 'proxima' ? 'var(--text)' : 'var(--text-faint)' }]}>{String(d.n)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={[st.linha, { justifyContent: 'space-between' }]}><Text style={st.nota}>{X.rodape}</Text><Text style={st.nota}>{X.meta}</Text></View>
    </View>
  );

  // ── 6 · a habilidade do mês ──
  const H = vm.habilidade;
  const mx = H.barra ? Math.max(H.barra.meta, H.barra.agora, H.barra.antes ?? 0) * 1.25 : 1;
  const blocoHab = (
    <View style={[st.cartao, H.modo !== 'ativa' && { backgroundColor: 'var(--tint-amber)' }]}>
      <Text style={[st.kicker, { color: 'var(--tint-amber-text)' }]}>HABILIDADE DO MÊS · O CHEFÃO</Text>
      {H.modo === 'ativa' ? (
        <>
          <Text style={st.blocoTitulo}>{H.nome}</Text>
          <Text style={st.nota}>{H.com}</Text>
          <View style={st.linha}>
            {H.caixas.map((c) => (
              <View key={c.rotulo} style={st.caixaNum}><Text style={st.mini}>{c.rotulo}</Text>
                <Text style={[st.numCaixa, { color: c.tom === 'ok' ? 'var(--tint-green-text)' : c.tom === 'av' ? AV_BARRA : c.tom === 'dim' ? 'var(--text-muted)' : 'var(--text)' }]}>{c.valor}</Text></View>
            ))}
          </View>
          {H.barra && (
            <View style={st.trilho}>
              <View style={[st.preenche, { width: `${Math.min(100, (H.barra.agora / mx) * 100)}%`, backgroundColor: H.bateu ? 'var(--verde-acao)' : AV_BARRA }]} />
              {H.barra.antes != null && <View style={[st.marca, { left: `${(H.barra.antes / mx) * 100}%`, width: 2, backgroundColor: 'var(--text-faint)' }]} />}
              <View style={[st.marca, { left: `${(H.barra.meta / mx) * 100}%`, width: 3, backgroundColor: 'var(--text)' }]} />
            </View>
          )}
          <Text style={[st.texto, H.bateu && { color: 'var(--tint-green-text)' }]}>{H.falta}</Text>
        </>
      ) : (
        <>
          <Text style={[st.textoForte, { color: 'var(--tint-amber-text)' }]}>{H.conviteT}</Text>
          <Text style={[st.fraco, { color: 'var(--tint-amber-text)' }]}>{H.conviteS}</Text>
        </>
      )}
    </View>
  );

  // ── 7 · a carreira e o Playbook ──
  const C = vm.carreira, PB = vm.playbook;
  const blocoCar = (
    <View style={st.cartao}>
      <View style={st.kickerLinha}><Text style={[st.kicker, { color: 'var(--text-muted)' }]}>SUA CARREIRA</Text><Text style={st.nota}>{C.onde}</Text></View>
      {C.fora ? <Text style={st.fraco}>{`— · ${C.fonte} não respondeu`}</Text> : C.degraus.map((d, i) => (
        <View key={d.t} style={st.degrauCar}>
          <View style={{ alignItems: 'center' }}>
            <View style={[st.circulo, d.st === 'feito' ? { backgroundColor: 'var(--verde-acao)', borderColor: 'var(--verde-acao)' } : d.st === 'atual' ? { backgroundColor: 'var(--surface)', borderColor: 'var(--text)' } : { backgroundColor: 'var(--surface-2)', borderColor: 'var(--surface-2)' }]}>
              {d.st === 'feito' ? <IconCheck width={14} height={14} fill="#FFFFFF" /> : <Text style={[st.mini, { fontWeight: '800', color: d.st === 'atual' ? 'var(--text)' : 'var(--text-faint)' }]}>{String(i + 1)}</Text>}
            </View>
            {i < C.degraus.length - 1 && <View style={[st.traco, { backgroundColor: d.st === 'feito' ? 'var(--verde-acao)' : 'var(--border)' }]} />}
          </View>
          <View style={{ flex: 1, gap: 4, paddingBottom: 10 }}>
            <Text style={[st.textoForte, d.st === 'futuro' && !d.crit.length && { color: 'var(--text-muted)' }]}>{d.t}</Text>
            <Text style={st.nota}>{d.s}</Text>
            {d.barra && (
              <View style={{ gap: 4 }}>
                <View style={st.trilhoFino}><View style={[st.preenche, { width: `${d.barra.pct}%`, backgroundColor: 'var(--text)' }]} /></View>
                <Text style={st.mini}>{d.barra.t}</Text>
              </View>
            )}
            {d.crit.map((c) => (
              <View key={c.t} style={[st.linha, { alignItems: 'flex-start' }]}>
                <View style={[st.check, c.ok ? { backgroundColor: 'var(--verde-acao)', borderColor: 'var(--verde-acao)' } : { borderColor: 'var(--stroke-strong)' }]}>{c.ok && <IconCheck width={10} height={10} fill="#FFFFFF" />}</View>
                <View style={{ flex: 1 }}><Text style={st.texto}>{c.t}</Text><Text style={st.nota}>{c.s}</Text></View>
              </View>
            ))}
            {!!d.proximo && <Text style={[st.textoForte, { color: 'var(--vermelho-texto)' }]}>{d.proximo}</Text>}
          </View>
        </View>
      ))}
      <View style={st.separador} />
      <Text style={st.textoForte}>{PB.titulo}</Text>
      {PB.total > 0 && <View style={[st.linha, { gap: 4 }]}>{PB.feitos.map((f, i) => <View key={i} style={[st.seg, { backgroundColor: f ? 'var(--tint-blue-text)' : 'var(--surface-3)' }]} />)}</View>}
      <Text style={st.nota}>{PB.sub}</Text>
      {!PB.fora && !PB.completa && aoFazerQuiz && (
        <Pressable accessibilityRole="button" onPress={aoFazerQuiz} style={st.botao}><IconBook width={18} height={18} fill={cores.onSurface} /><Text style={st.botaoTexto}>fazer o quiz</Text></Pressable>
      )}
    </View>
  );

  // ── 8 · a coleção ──
  const K = vm.colecao;
  const blocoCol = (
    <View style={st.cartao} onLayout={(e) => { yColecao.current = e.nativeEvent.layout.y; }}>
      <View style={st.kickerLinha}><Text style={[st.kicker, { color: 'var(--text-muted)' }]}>COLEÇÃO</Text><Text style={st.nota}>{K.n}</Text></View>
      {!!K.reconhecimento && (
        <View style={[st.caixa, st.linha, { backgroundColor: 'var(--tint-amber)' }]}><IconStar width={18} height={18} fill={cores.tintAmberText} /><Text style={[st.texto, { flex: 1, color: 'var(--tint-amber-text)' }]}>{K.reconhecimento}</Text></View>
      )}
      {K.fora ? <Text style={st.fraco}>{`— · ${K.fonte} não respondeu`}</Text> : (
        <View style={st.grade}>
          {K.itens.map((m) => {
            const nova = m.ganha && (m.nova || [...destaqueDaSessao].some((i) => i === m.id || i.indexOf(m.id + ':') === 0));
            return (
              <View key={m.id} style={[st.medalha, { width: largo ? '24%' : '32%' }, nova && st.medalhaNova]}>
                <View style={[st.medalhaCirc, { backgroundColor: nova ? 'var(--vermelho-acao)' : m.ganha ? 'var(--tint-green)' : 'var(--surface-2)' }]}>
                  <Icone nome={m.icone} cor={nova ? '#FFFFFF' : m.ganha ? cores.tintGreenText : cores.faint} />
                </View>
                <Text style={[st.medalhaNome, !m.ganha && { color: 'var(--text-muted)' }]} numberOfLines={2}>{m.t}</Text>
                {m.ganha ? <Text style={[st.mini, nova && { color: 'var(--vermelho-texto)', fontWeight: '700' }]}>{m.d}</Text> : (
                  <View style={{ gap: 3, alignSelf: 'stretch' }}>
                    <View style={st.trilhoMini}><View style={[st.preenche, { width: `${m.pctProgresso}%`, backgroundColor: 'var(--text-faint)' }]} /></View>
                    <Text style={st.mini} numberOfLines={2}>{m.progresso}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  // ── 9 · você contra você ──
  const blocoVs = (
    <View style={st.cartao}>
      <Text style={[st.kicker, { color: 'var(--text-muted)' }]}>VOCÊ CONTRA VOCÊ</Text>
      <View style={[st.linha, { alignItems: 'stretch' }]}>
        {vm.vs.map((v) => (
          <View key={v.t} style={st.caixaNum}><Text style={st.numCaixa}>{v.v}</Text><Text style={st.mini}>{v.t}</Text>{!!v.s && <Text style={st.mini}>{v.s}</Text>}</View>
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView ref={rolagem} style={st.tela} contentContainerStyle={[st.conteudo, largo && st.conteudoLargo]}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {cab}{blocoUm}{blocoSemana}{blocoMissao}{blocoSeq}{blocoVar}{blocoHab}{blocoCar}{blocoCol}{blocoVs}
      <Text style={st.nota}>Os mesmos números da aba Desenvolvimento do Cockpit. Ponto só nasce de prova: abrir esta tela não soma nada.</Text>
      {linhas.length > 0 && (
        <View style={st.lista}>
          {linhas.map((l) => (
            <Pressable key={l.chave} accessibilityRole="button" accessibilityLabel={l.rotulo} onPress={l.aoTocar} style={st.linhaEu}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[st.linhaTexto, l.perigo && { color: 'var(--vermelho-texto)' }]} numberOfLines={1}>{l.rotulo}</Text>
                {!!l.sub && <Text style={st.nota} numberOfLines={1}>{l.sub}</Text>}
              </View>
              {!!l.selo && <View style={st.linhaSelo}><Text style={st.linhaSeloTexto}>{l.selo}</Text></View>}
              <Text style={st.fraco}>›</Text>
            </Pressable>
          ))}
        </View>
      )}
      <FolhaRanking visivel={rankingAberto} aoFechar={() => setRankingAberto(false)} />
    </ScrollView>
  );
}

/* MISSÃO CUMPRIDA: o círculo de 64 px entra com escala .4 → 1 em .6 s (overshoot), com o anel de 8 px.
   ≤ 2 s e, com "reduzir movimento", aparece direto (regra 7 do README). */
function Celebracao({ selo, icone, texto, reduzir, aoVer }: { selo: string; icone: string; texto: string; reduzir: boolean; aoVer: () => void }) {
  const escala = useRef(new Animated.Value(reduzir ? 1 : 0.4)).current;
  const opac = useRef(new Animated.Value(reduzir ? 1 : 0)).current;
  useEffect(() => {
    if (reduzir) { escala.setValue(1); opac.setValue(1); return; }
    Animated.parallel([
      Animated.timing(escala, { toValue: 1, duration: 600, easing: Easing.bezier(0.2, 1.6, 0.4, 1), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(opac, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [reduzir, escala, opac]);
  return (
    <View style={[st.linha, { gap: 14, alignItems: 'center' }]} accessibilityLabel={`Missão cumprida. ${texto}`}>
      <Animated.View style={[st.celebra, { transform: [{ scale: escala }], opacity: opac }]}>
        <Icone nome={icone} cor="#FFFFFF" tam={28} />
      </Animated.View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[st.blocoTitulo, { color: 'var(--tint-green-text)' }]}>Missão cumprida.</Text>
        <Text style={st.texto}>{texto}</Text>
        <Pressable accessibilityRole="button" onPress={aoVer} style={[st.botao, { alignSelf: 'flex-start', marginTop: 4 }]}><Text style={st.botaoTexto}>ver a coleção</Text></Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  centro: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  conteudo: { padding: 14, paddingBottom: 40, gap: 12 },
  conteudoLargo: { padding: 28, maxWidth: 760, width: '100%', alignSelf: 'center' },
  esqueleto: { borderRadius: 16, backgroundColor: 'var(--surface-2)' },
  titulo: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: 'var(--text)' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selo: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  seloTexto: { fontSize: 11.5, fontWeight: '700' },
  cartao: { padding: 14, gap: 10, borderRadius: 16, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  umLinha: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  kickerLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  grande: { fontSize: 40, lineHeight: 46, fontWeight: '700', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  blocoTitulo: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: 'var(--text)' },
  missaoTitulo: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: 'var(--text)' },
  texto: { fontSize: 13.5, lineHeight: 19, color: 'var(--text)' },
  textoForte: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: 'var(--text)' },
  fraco: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  nota: { fontSize: 11.5, lineHeight: 16, color: 'var(--text-faint)' },
  mini: { fontSize: 10.5, lineHeight: 14, color: 'var(--text-muted)', textAlign: 'center' },
  link: { fontSize: 13, fontWeight: '700', color: 'var(--text-muted)', minWidth: 44, textAlign: 'right' },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  caixa: { padding: 10, borderRadius: 12 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'var(--surface-2)' },
  chipTexto: { fontSize: 11.5, color: 'var(--text)' },
  podio: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  podioCol: { width: 52, alignItems: 'center', gap: 3 },
  podioBloco: { width: 52, borderTopLeftRadius: 6, borderTopRightRadius: 6, alignItems: 'center', paddingTop: 4 },
  podioLugar: { fontSize: 11, fontWeight: '800' },
  passo: { width: 34, height: 10, borderRadius: 5 },
  premio: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--stroke-strong)', backgroundColor: 'var(--surface-2)' },
  icone40: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  barraDia: { alignSelf: 'stretch', height: 8, borderRadius: 4 },
  hachura: { backgroundColor: 'var(--surface-3)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--tint-amber-text)' },
  degrau: { minWidth: 30, flexGrow: 1, height: 38, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  degrauTexto: { fontSize: 13, fontWeight: '700' },
  caixaNum: { flex: 1, minWidth: 0, padding: 10, borderRadius: 12, backgroundColor: 'var(--surface-2)', gap: 2, alignItems: 'center' },
  numCaixa: { fontSize: 20, fontWeight: '700', color: 'var(--text)', fontVariant: ['tabular-nums'] },
  trilho: { height: 10, borderRadius: 5, backgroundColor: 'var(--surface-3)', position: 'relative', overflow: 'visible' },
  trilhoFino: { height: 6, borderRadius: 3, backgroundColor: 'var(--surface-3)', overflow: 'hidden' },
  trilhoMini: { height: 5, borderRadius: 3, backgroundColor: 'var(--surface-3)', overflow: 'hidden' },
  preenche: { height: '100%', borderRadius: 5 },
  marca: { position: 'absolute', top: -3, height: 16, borderRadius: 1 },
  degrauCar: { flexDirection: 'row', gap: 10 },
  circulo: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  traco: { width: 2, flex: 1, minHeight: 12 },
  check: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  separador: { height: 1, backgroundColor: 'var(--border)' },
  seg: { flex: 1, height: 6, borderRadius: 3 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' },
  medalha: { padding: 8, borderRadius: 12, alignItems: 'center', gap: 4 },
  medalhaNova: { backgroundColor: 'var(--tint-red)', borderWidth: 2, borderColor: 'var(--vermelho-acao)' },
  medalhaCirc: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  medalhaNome: { fontSize: 11.5, lineHeight: 15, fontWeight: '700', color: 'var(--text)', textAlign: 'center' },
  celebra: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'var(--verde-acao)', alignItems: 'center', justifyContent: 'center', borderWidth: 8, borderColor: 'rgba(21,128,61,0.18)' },
  botao: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center', backgroundColor: 'var(--surface)' },
  botaoTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  vazioTitulo: { fontSize: 17, fontWeight: '700', color: 'var(--text)', textAlign: 'center' },
  lista: { marginTop: 4, borderTopWidth: 1, borderTopColor: 'var(--border)' },
  linhaEu: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'var(--border)' },
  linhaTexto: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  linhaSelo: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: 'var(--text)', alignItems: 'center', justifyContent: 'center' },
  linhaSeloTexto: { fontSize: 11.5, fontWeight: '800', color: 'var(--surface)' },
});
