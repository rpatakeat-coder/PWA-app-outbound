// Folha inferior do mapa novo, sem lead aberto (handoff v4.1 §3 e §6.1).
//
// Espiada (88 px): "PRÓXIMA PORTA · N DO PLANO", o progresso de visitas do
// dia e a próxima porta com Cheguei. Tocar na alça abre a lista da área
// (ou da quadra), por Prioridade (plano › cobrança › quente › morno ›
// distância) ou Distância. O mapa é o produto: em repouso ele fica com ~73%.
import React, { useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Client } from '../types/client';
import { useAcimaDoRodape } from '../hooks/useAcimaDoRodape';
import { Toast } from '../components/Toast';
import { ORIGEM, origemDoFiltro } from '../utils/lentes';
import type { Pino } from '../utils/pinoP2';
import { distanciaTexto, ir } from './CardLeadNovo';
import { IconArrowDown, IconArrowUp, useIconColors } from '../components/icons';

import { ordenarItens, quedaCurta, type ItemFolha } from '../utils/cardNovo';
import { IconChevronDown as SiDown, IconClose as SiClose, IconChevronRight as SiRight } from '../components/icons';

export type { ItemFolha };

type Props = {
  itens: ItemFolha[];
  planoTotal: number;
  planoFeito: number;
  /** Distância do chão da tela (acima da barra de baixo). */
  chao: number;
  /** Quantos leads a área tem ao todo (os fora da lente viram ponto). */
  totalNaArea: number;
  rotuloLente: string;
  onAbrir: (c: Client) => void;
  onCheguei: (c: Client) => void;
  /** Altura da folha na tela (o mapa termina no topo dela). */
  aoMedir?: (medida: { y: number; altura: number }) => void;
  /** Resumo de quadra tocado no mapa: a lista mostra só os pinos dele. */
  quadra?: { area: string; aoFechar: () => void } | null;
  /** Lentes Sem dono e Reconquista: "É meu" direto na linha (só na rota de hoje). */
  eMeu?: { naRota: Set<string>; aoAssumir: (c: Client) => void } | null;
  /** Visitas do plano feitas hoje e a meta do playbook (6). */
  // null = ainda não medido (N3): mostra "—", nunca "0 de 6" antes de ler
  visitasFeitas: number | null;
  /** Das feitas, as provadas (visitas_do_dia, 0143) — o mesmo número do Cockpit. null = não medido. */
  visitasProvadas?: number | null;
  metaVisitas: number;
  /** Toque em "x de 6 visitas". */
  aoProgresso?: () => void;
  /** Desktop (28/09/2026): a mesma folha vira o painel lateral, sempre aberta, sem alça. */
  embutida?: boolean;
  /** id do pino aberto no mapa: tocar num pino traz a pílula recolhida de volta */
  pinoAberto?: string | null;
  /** Põe as paradas em aberto na melhor ordem a partir de onde a pessoa está. */
  aoRoteirizar?: () => void;
  roteirizando?: boolean;
  /** Liga o modo Planejar: escolher os leads de um dia tocando nos pinos. */
  aoPlanejar?: () => void;
  /** Meu roteiro (29/09/2026): subir ou descer uma parada na sequência de hoje. */
  aoMover?: (c: Client, delta: -1 | 1) => void;
  /** Meu roteiro: tirar a parada de hoje (sai também do Planejamento). */
  aoTirar?: (c: Client) => void;
};

type Modo = 'prioridade' | 'distancia' | 'roteiro';

// Andando na rua: ~80 m por minuto, contando esquina e sinal.
function aPe(m: number | null): string | null {
  if (m == null) return null;
  return `${Math.max(1, Math.round(m / 80))} min a pé`;
}

function PinoMini({ p, plano }: { p: Pino; plano: number | null }) {
  return (
    <View style={[s.mini, { borderColor: p.dono === 'sem' ? '#FACC15' : p.cor, borderStyle: p.dono === 'sem' ? 'dashed' : 'solid' }]}>
      <Text style={[s.miniTexto, { color: p.cor }]}>{plano ?? (p.glifo || '•')}</Text>
    </View>
  );
}

// A4 (handoff v6): a 375 px as duas etiquetas ao lado do nome deixavam ~100 px para ele.
// Agora elas moram na linha de baixo, dentro da coluna do nome: a primeira aparece e as
// outras viram "+1" (o nome inteiro de cada uma fica no rótulo de acessibilidade).
function Etiquetas({ it }: { it: ItemFolha }) {
  // Cliente em queda: o que importa na linha é quanto caiu e o tamanho dele, não a
  // origem (que é coisa de lead).
  const lista: { texto: string; fundo: string; tinta: string }[] = [];
  if (it.p.queda) lista.push({ texto: quedaCurta(it.p.queda), fundo: 'var(--tint-red)', tinta: 'var(--vermelho-texto)' });
  else {
    if (it.p.etiqueta) lista.push({ texto: it.p.etiqueta.texto, fundo: it.p.etiqueta.fundo, tinta: it.p.etiqueta.tinta });
    const o = ORIGEM[origemDoFiltro(it.p)];
    lista.push({ texto: o.rotulo, fundo: o.fundo, tinta: o.tinta });
  }
  if (!lista.length) return null;
  const [primeira, ...resto] = lista;
  return (
    <View style={s.etiquetas} accessibilityLabel={lista.map((e) => e.texto).join(', ')}>
      <View style={[s.tag, { backgroundColor: primeira.fundo }]}>
        <Text style={[s.tagTexto, { color: primeira.tinta }]} numberOfLines={1}>{primeira.texto}</Text>
      </View>
      {resto.length > 0 && (
        <View style={[s.tag, s.tagMais]}>
          <Text style={[s.tagTexto, { color: 'var(--text-muted)' }]}>{`+${resto.length}`}</Text>
        </View>
      )}
    </View>
  );
}

export default function FolhaDoMapa({ itens, planoTotal, planoFeito, chao, totalNaArea, rotuloLente, onAbrir, onCheguei, aoMedir, quadra, eMeu, visitasFeitas: feitasMedidas, visitasProvadas = null, metaVisitas, aoProgresso, embutida, aoRoteirizar, roteirizando, aoPlanejar, aoMover, aoTirar, pinoAberto = null }: Props) {
  const cores = useIconColors();
  const visitasFeitas = feitasMedidas ?? 0;
  const feitasTexto = feitasMedidas == null ? "—" : String(feitasMedidas);
  const emAberto = Math.max(0, planoTotal - planoFeito);
  const [abertaPeloToque, setAberta] = useState(false);
  // RECOLHER A PÍLULA (02/10/26, Julyan: "manter no mapa, mas recolhível"). Recolhida vira um
  // botão pequeno com o placar do dia; a escolha fica no aparelho, e tocar num pino a traz de volta.
  const [recolhida, setRecolhidaEstado] = useState<boolean>(() => {
    try { return localStorage.getItem('folha-pilula-recolhida') === '1'; } catch { return false; }
  });
  const setRecolhida = (v: boolean) => {
    setRecolhidaEstado(v);
    try { localStorage.setItem('folha-pilula-recolhida', v ? '1' : '0'); } catch { /* só nesta sessão */ }
  };
  useEffect(() => { if (pinoAberto) setRecolhidaEstado(false); }, [pinoAberto]);
  const aberta = !!embutida || abertaPeloToque || !!quadra;
  // a pílula e a folha nunca cobrem o rodapé (useAcimaDoRodape)
  const acima = useAcimaDoRodape(chao, aberta ? 0 : 8, aberta);
  // Folha aberta: cheia (quase a tela toda) ou normal; arrastar para baixo recolhe e fecha.
  const [cheia, setCheia] = useState(false);
  const arrastoFolha = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_e, g) => {
      if (g.dy < -30) setCheia(true);
      else if (g.dy > 40) { setCheia((c) => { if (!c) { setAberta(false); quadra?.aoFechar(); } return false; }); }
    },
  }), [quadra]);
  // A ordem escolhida fica no aparelho (28/09/2026): quem anda por distância não
  // quer escolher de novo a cada vez que a lista abre.
  const [modoEscolhido, setModoEstado] = useState<Modo>(() => {
    try {
      const m = window.localStorage.getItem('takeat-folha-ordem');
      return m === 'distancia' || m === 'roteiro' ? m : 'prioridade';
    } catch { return 'prioridade'; }
  });
  // MEU ROTEIRO (29/09/2026, Julyan: "acho legal ter o roteiro, mas dá pra escolher as
  // sequências"): o plano de hoje na ordem da rota, com subir, descer e tirar. Sem plano
  // (ou sem permissão de mexer), a opção some e a lista volta para Prioridade.
  const podeRoteiro = !!aoMover && planoTotal > 0;
  const modo: Modo = modoEscolhido === 'roteiro' && !podeRoteiro ? 'prioridade' : modoEscolhido;
  const setModo = (m: Modo) => {
    setModoEstado(m);
    try { window.localStorage.setItem('takeat-folha-ordem', m); } catch { /* sem storage: só não lembra */ }
  };
  const ordenados = useMemo(() => (modo === 'roteiro'
    ? itens.filter((it) => it.plano != null).sort((a, b) => (a.plano ?? 0) - (b.plano ?? 0))
    : ordenarItens(itens, modo)), [itens, modo]);
  const proxima = useMemo(() => ordenarItens(itens, 'prioridade').find((it) => it.plano && !it.feito) ?? null, [itens]);
  // Arrastar a pílula para cima abre a lista da área (handoff v4.1, xama1).
  const arrasto = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_e, g) => { if (g.dy < -30) setAberta(true); },
  }), []);
  const medir = (e: { nativeEvent: { layout: { y: number; height: number } } }) => {
    // No navegador o evento traz o próprio elemento: o topo vem na régua da TELA.
    const alvo = (e.nativeEvent as unknown as { target?: { getBoundingClientRect?: () => DOMRect } }).target;
    const topo = alvo?.getBoundingClientRect ? alvo.getBoundingClientRect().top : e.nativeEvent.layout.y;
    aoMedir?.({ y: Math.round(topo), altura: Math.round(e.nativeEvent.layout.height) + 8 });
  };

  // PÍLULA DA PRÓXIMA PORTA (handoff v4.1 revisado, xama1): a folha espiada de
  // 88 px + rodapé de 90 px eram 178 px de faixa sólida (21% da tela). A pílula
  // flutua a 8 px do rodapé, tem 60 px e nenhum rótulo: nome e distância, o
  // progresso em tracinhos e o Cheguei. "Dono às 15h" e "decisor ?" já estão na
  // etiqueta do pino, não se repetem aqui.
  if (!aberta && recolhida) {
    const metaR = Math.max(1, metaVisitas);
    return (
      <Pressable ref={acima.ref} accessibilityRole="button" accessibilityLabel={`Mostrar a próxima porta. ${feitasTexto} de ${metaR} visitas hoje`}
        onPress={() => setRecolhida(false)} onLayout={medir} style={[s.pilulaMini, { bottom: chao + 8 + acima.ajuste }]}>
        <Text style={s.pilulaMiniTexto}>{`${feitasTexto}/${metaR}`}</Text>
        <View style={{ transform: [{ rotate: true ? '180deg' : '0deg' }] }}><SiDown width={18} height={18} fill="var(--text-muted)" /></View>
      </Pressable>
    );
  }
  if (!aberta) {
    const meta = Math.max(1, metaVisitas);
    return (
      <View ref={acima.ref} style={[s.pilula, { bottom: chao + 8 + acima.ajuste }]} accessibilityLabel="Próxima porta" onLayout={medir} {...arrasto.panHandlers}>
        <Pressable accessibilityRole="button" accessibilityLabel="Recolher a barra da próxima porta" onPress={() => setRecolhida(true)} hitSlop={8} style={s.pilulaRecolher}>
          <SiDown width={18} height={18} fill="var(--text-muted)" />
        </Pressable>
        {proxima ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${proxima.c.empresa?.trim() || proxima.c.nome}`} onPress={() => onAbrir(proxima.c)} style={s.pilulaTexto}>
            <Text style={s.pilulaNome} numberOfLines={1}>{proxima.c.empresa?.trim() || proxima.c.nome}</Text>
            <Text style={s.pilulaSub} numberOfLines={1}>{[distanciaTexto(proxima.distanciaM), aPe(proxima.distanciaM)].filter(Boolean).join(' · ') || 'toque para ver o lead'}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir a lista desta área" onPress={() => setAberta(true)} style={s.pilulaTexto}>
            <Text style={s.pilulaNome} numberOfLines={1}>{planoTotal ? `Plano concluído · ${planoFeito}/${planoTotal}` : 'Nada planejado hoje'}</Text>
            <Text style={s.pilulaSub} numberOfLines={1}>{`${totalNaArea} na área · ver a lista`}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`${feitasTexto} de ${meta} visitas hoje`} onPress={aoProgresso} style={s.pilulaProgresso} hitSlop={6}>
          <Text style={s.pilulaConta}>{`${feitasTexto}/${meta}`}</Text>
          <View style={s.tracos}>{Array.from({ length: Math.min(meta, 8) }, (_, k) => <View key={k} style={[s.traco, k < visitasFeitas && s.tracoFeito]} />)}</View>
          {/* D1 (handoff v6): a meta conta a visita feita; a prova vem logo embaixo, igual ao Cockpit */}
          {visitasProvadas != null && visitasFeitas > 0 && (
            <Text style={[s.pilulaProva, visitasProvadas < visitasFeitas && s.pilulaProvaFalta]} numberOfLines={1}>
              {visitasProvadas < visitasFeitas ? `${visitasFeitas - visitasProvadas} sem prova` : `${visitasProvadas} prov.`}
            </Text>
          )}
        </Pressable>
        {proxima ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Cheguei na próxima porta" onPress={() => onCheguei(proxima.c)} style={s.pilulaCheguei}>
            <Text style={s.btnChegueiTexto}>Cheguei</Text>
          </Pressable>
        ) : aoPlanejar ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Planejar pelo mapa" onPress={aoPlanejar} style={s.pilulaLista}>
            <Text style={s.pilulaListaTexto}>Planejar</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir a lista desta área" onPress={() => setAberta(true)} style={s.pilulaLista}>
            <Text style={s.pilulaListaTexto}>Lista</Text>
          </Pressable>
        )}
      </View>
    );
  }

  /* UMA ROLAGEM SÓ NO COMPUTADOR (06/10/26). O painel era uma caixa fixa e a lista rolava
     por dentro com a SOBRA da altura: num notebook de 640 px de tela, os filtros, a próxima
     porta e os botões comiam tudo e "Meu roteiro" ficava com 64 px — uma parada à vista, com
     uma barra de rolagem de brinquedo. Agora o painel inteiro rola e a lista vai inteira
     dentro dele. A folha do celular não muda. */
  const Casca = embutida ? ScrollView : View;
  const ListaCasca = embutida ? View : ScrollView;
  return (
    <Casca ref={embutida ? undefined : acima.ref}
      style={embutida ? s.painelRola : [s.folha, { bottom: chao + acima.ajuste }, cheia && s.folhaCheia]}
      {...(embutida ? { contentContainerStyle: s.painelConteudo } : {})}
      accessibilityLabel="Agora, perto de você" onLayout={embutida ? undefined : (e) => {
      // No navegador o evento traz o próprio elemento: o topo vem na régua da
      // TELA, a mesma do mapa (o layout.y é relativo ao pai, que não é o do mapa).
      const alvo = (e.nativeEvent as unknown as { target?: { getBoundingClientRect?: () => DOMRect } }).target;
      const topo = alvo?.getBoundingClientRect ? alvo.getBoundingClientRect().top : e.nativeEvent.layout.y;
      aoMedir?.({ y: Math.round(topo), altura: Math.round(e.nativeEvent.layout.height) });
    }}>
      {!embutida && (
        <Pressable accessibilityRole="button" accessibilityLabel={cheia ? 'Recolher a lista' : 'Abrir a lista em tela cheia'} onPress={() => setCheia((c) => !c)} style={s.alca} {...arrastoFolha.panHandlers}>
          <View style={s.alcaBarra} />
        </Pressable>
      )}
      <View style={s.linhaTopo}>
        <Text style={s.kicker} numberOfLines={1}>
          {proxima ? `PRÓXIMA PORTA · ${proxima.plano} DO PLANO` : planoTotal ? 'PLANO DE HOJE' : 'AGORA, PERTO DE VOCÊ'}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${feitasTexto} de ${metaVisitas} visitas hoje`} onPress={aoProgresso} hitSlop={10} style={{ paddingVertical: 13, marginVertical: -13 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={s.progresso}>{`${feitasTexto} de ${metaVisitas} visitas${visitasProvadas != null && visitasFeitas > 0 ? ` · ${visitasProvadas} ${visitasProvadas === 1 ? 'provada' : 'provadas'}` : ''}`}</Text>
            <SiRight width={16} height={16} fill="var(--text-muted)" />
          </View>
        </Pressable>
      </View>

      {proxima ? (
        <View style={s.proxima}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${proxima.c.empresa?.trim() || proxima.c.nome}`} onPress={() => onAbrir(proxima.c)} style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nome} numberOfLines={1}>{proxima.c.empresa?.trim() || proxima.c.nome}</Text>
            <Text style={s.sub} numberOfLines={1}>
              {[distanciaTexto(proxima.distanciaM), aPe(proxima.distanciaM), proxima.c.bairro?.trim() || null].filter(Boolean).join(' · ') || 'toque para ver o lead'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Cheguei na próxima porta" onPress={() => onCheguei(proxima.c)} style={s.btnCheguei}>
            <Text style={s.btnChegueiTexto}>Cheguei</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setAberta((v) => !v)} style={s.proxima}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nome} numberOfLines={1}>
              {planoTotal ? `Plano de hoje concluído · ${planoFeito} de ${planoTotal}` : 'Nada no plano de hoje'}
            </Text>
            <Text style={s.sub} numberOfLines={2}>{planoTotal ? `${totalNaArea} na área · lente ${rotuloLente}` : (aoPlanejar ? 'Toque em Planejar e escolha os leads no mapa' : 'Ponha leads com + Rota de hoje (no card) ou monte no Planejamento')}</Text>
          </View>
        </Pressable>
      )}

      {aberta && aoRoteirizar && emAberto >= 2 && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Roteirizar as ${emAberto} paradas em aberto`} disabled={roteirizando}
          onPress={aoRoteirizar} style={[s.roteirizar, roteirizando && { opacity: 0.6 }]}>
          <Text style={s.roteirizarTexto}>{roteirizando ? 'Calculando a melhor ordem…' : `Roteirizar o plano · ${emAberto} paradas`}</Text>
        </Pressable>
      )}

      {aberta && (quadra ? (
        <View style={s.quadraTopo}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nestaAreaTexto} numberOfLines={1}>{`Quadra · ${quadra.area} · ${itens.length} ${itens.length === 1 ? 'pino' : 'pinos'}`}</Text>
            <Text style={s.nestaAreaSub}>{`Lente ${rotuloLente} · melhor candidato primeiro`}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar a lista da quadra" onPress={quadra.aoFechar} style={s.quadraFechar}>
            <SiClose width={20} height={20} fill="var(--text-muted)" />
          </Pressable>
        </View>
      ) : (
        <View style={s.quadraTopo}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nestaAreaTexto} numberOfLines={1}>{`Nesta área · ${itens.length} ${itens.length === 1 ? 'pino' : 'pinos'} da lente`}</Text>
            <Text style={s.nestaAreaSub}>{`Lente ${rotuloLente} · ${Math.max(0, totalNaArea - itens.length)} outros viram ponto`}</Text>
          </View>
          {aoPlanejar && (
            <Pressable accessibilityRole="button" accessibilityLabel="Planejar pelo mapa" onPress={aoPlanejar} style={s.planejar}>
              <Text style={s.planejarTexto}>Planejar</Text>
            </Pressable>
          )}
          {!embutida && (
            <Pressable accessibilityRole="button" accessibilityLabel="Recolher a lista" onPress={() => setAberta(false)} style={s.quadraFechar}>
              <SiClose width={20} height={20} fill="var(--text-muted)" />
            </Pressable>
          )}
        </View>
      ))}

      {aberta && (
        <>
          <View style={s.ordem}>
            {((podeRoteiro ? ['roteiro', 'prioridade', 'distancia'] : ['prioridade', 'distancia']) as Modo[]).map((m) => (
              <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: modo === m }} onPress={() => setModo(m)}
                style={[s.ordemBtn, modo === m && s.ordemBtnAtivo]}>
                <Text style={[s.ordemTexto, modo === m && s.ordemTextoAtivo]}>{m === 'roteiro' ? 'Meu roteiro' : m === 'prioridade' ? 'Prioridade' : 'Distância'}</Text>
              </Pressable>
            ))}
          </View>
          {modo === 'roteiro' && (
            <Text style={s.roteiroAjuda}>A próxima porta segue esta ordem. Pode ir a qualquer outro pino antes: o Cheguei fora do plano conta igual.</Text>
          )}
          <ListaCasca style={embutida ? s.listaEmbutida : [s.lista, cheia && s.listaCheia]} {...(embutida ? {} : { contentContainerStyle: { paddingBottom: 8 } })}>
            {ordenados.length === 0 && <Text style={s.semProxima}>Nada desta lente na área. Troque de lente ou afaste o mapa.</Text>}
            {modo === 'roteiro' && ordenados.map((it, i) => {
              const nome = it.c.empresa?.trim() || it.c.nome;
              const podeSubir = !it.feito && i > 0 && !ordenados[i - 1].feito;
              const podeDescer = !it.feito && i < ordenados.length - 1;
              return (
                <View key={it.c.id} style={s.linha}>
                  <PinoMini p={it.p} plano={it.plano} />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${nome}`} onPress={() => onAbrir(it.c)} style={{ flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' }}>
                    <Text style={[s.nome, it.feito && s.nomeFeito]} numberOfLines={1}>{nome}</Text>
                    <Text style={s.sub} numberOfLines={1}>{it.feito ? 'visitada hoje' : [distanciaTexto(it.distanciaM), aPe(it.distanciaM)].filter(Boolean).join(' · ') || ' '}</Text>
                  </Pressable>
                  {!it.feito && (
                    <View style={s.roteiroAcoes}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Subir ${nome} na sequência`} disabled={!podeSubir} onPress={() => aoMover?.(it.c, -1)} style={[s.roteiroBtn, !podeSubir && s.roteiroBtnOff]}>
                        <IconArrowUp width={18} height={18} fill={cores.onSurface} />
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Descer ${nome} na sequência`} disabled={!podeDescer} onPress={() => aoMover?.(it.c, 1)} style={[s.roteiroBtn, !podeDescer && s.roteiroBtnOff]}>
                        <IconArrowDown width={18} height={18} fill={cores.onSurface} />
                      </Pressable>
                      {aoTirar && (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Tirar ${nome} do roteiro de hoje`} onPress={() => aoTirar(it.c)} style={s.roteiroTirar}>
                          <Text style={s.roteiroTirarTexto}>Tirar</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            {modo !== 'roteiro' && ordenados.slice(0, 80).map((it) => (
              <Pressable key={it.c.id} accessibilityRole="button" onPress={() => onAbrir(it.c)} style={s.linha}>
                <PinoMini p={it.p} plano={it.plano} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.nome} numberOfLines={2}>{`${it.plano ? `${it.plano} · ` : ''}${it.c.empresa?.trim() || it.c.nome}`}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {[distanciaTexto(it.distanciaM), it.c.telefone?.trim() ? null : 'sem tel.',
                      it.c.conta_alvo_rating != null ? `${Number(it.c.conta_alvo_rating).toFixed(1).replace('.', ',')}★` : null].filter(Boolean).join(' · ') || ' '}
                  </Text>
                  <Etiquetas it={it} />
                </View>
                {eMeu && it.p.dono === 'sem' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={eMeu.naRota.has(it.c.id) ? `É meu: ${it.c.empresa?.trim() || it.c.nome}` : `É meu: pôr na rota de hoje e assumir ${it.c.empresa?.trim() || it.c.nome}`}
                    onPress={() => eMeu.aoAssumir(it.c)}
                    style={[s.eMeu, !eMeu.naRota.has(it.c.id) && s.eMeuFora]}
                  >
                    <Text style={[s.eMeuTexto, !eMeu.naRota.has(it.c.id) && s.eMeuTextoFora]}>É meu</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            ))}
            {modo !== 'roteiro' && ordenados.length > 80 && <Text style={s.semProxima}>{`Mais ${ordenados.length - 80} — aproxime o mapa para ver.`}</Text>}
          </ListaCasca>
        </>
      )}
    </Casca>
  );
}

const s = StyleSheet.create({
  pilulaRecolher: { width: 28, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8, flexShrink: 0 },
  pilulaMini: {
    position: 'absolute', left: 10, zIndex: 20, height: 44, borderRadius: 22, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)',
  },
  pilulaMiniTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  pilulaMiniSeta: { fontSize: 14, color: 'var(--text-muted)' },
  pilula: {
    position: 'absolute', left: 10, right: 10, zIndex: 20, height: 60, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 6,
    backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  pilulaTexto: { flex: 1, minWidth: 0, justifyContent: 'center', minHeight: 48 },
  pilulaNome: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  pilulaSub: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)', marginTop: 1 },
  pilulaProgresso: { alignItems: 'center', gap: 4, paddingHorizontal: 2, minHeight: 48, minWidth: 48, justifyContent: 'center' },
  pilulaConta: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  tracos: { flexDirection: 'row', gap: 2 },
  traco: { width: 5, height: 4, borderRadius: 1, backgroundColor: 'var(--stroke-strong)' },
  tracoFeito: { backgroundColor: 'var(--vermelho-acao)' },
  pilulaCheguei: { height: 48, paddingHorizontal: 18, borderRadius: 13, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pilulaLista: { height: 48, paddingHorizontal: 16, borderRadius: 13, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pilulaListaTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  // cheia = altura fixa (não só um teto maior): sem isso a lista não tinha por que crescer
  folhaCheia: { maxHeight: '88%', height: '88%' },
  listaCheia: { maxHeight: '100%', flex: 1, minHeight: 0 },
  folha: {
    position: 'absolute', left: 0, right: 0, zIndex: 20,
    backgroundColor: 'var(--surface)', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: 'var(--border)',
    // 48%: com 62% a lista aberta tomava a tela e o mapa virava uma faixa sem arrasto (26/09).
    paddingHorizontal: 16, paddingBottom: 10, gap: 6, maxHeight: '52%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
  // 18 px de alça, 44 de toque (auditoria 04/10/26): a área cresce sem mexer no desenho
  alca: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', height: 44, marginVertical: -13 },
  alcaBarra: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'var(--stroke-strong)' },
  linhaTopo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  kicker: { flex: 1, fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--vermelho-texto)' },
  progresso: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  pilulaProva: { fontSize: 11, fontWeight: '600', color: 'var(--text-muted)', marginTop: 2 },
  pilulaProvaFalta: { color: 'var(--tint-amber-text)' },
  proxima: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  btnCheguei: { height: 48, paddingHorizontal: 20, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  btnChegueiTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  mini: { width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, backgroundColor: '#14171C', alignItems: 'center', justifyContent: 'center' },
  miniTexto: { fontSize: 12, fontWeight: '900' },
  nome: { fontSize: 16, fontWeight: '600', color: 'var(--text)' },
  sub: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)', marginTop: 1 },
  etiquetas: { flexDirection: 'row', gap: 4, marginTop: 4, minWidth: 0, alignItems: 'center' },
  tag: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, maxWidth: '85%', flexShrink: 1 },
  tagMais: { backgroundColor: 'var(--surface-2)', flexShrink: 0 },
  tagTexto: { fontSize: 10, fontWeight: '800' },
  semProxima: { fontSize: 13, color: 'var(--text-muted)', paddingVertical: 6 },
  nestaArea: { minHeight: 44, justifyContent: 'center' },
  eMeu: { minHeight: 44, minWidth: 64, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FACC15', alignItems: 'center', justifyContent: 'center' },
  eMeuFora: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: '#FACC15' },
  eMeuTexto: { fontSize: 13, fontWeight: '800', color: '#14171C' },
  eMeuTextoFora: { color: 'var(--amarelo-sem-dono-texto)' },
  quadraTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  quadraFechar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  quadraFecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  nestaAreaTexto: { fontSize: 13, fontWeight: '800', color: 'var(--text)' },
  nestaAreaSub: { fontSize: 11, color: 'var(--text-muted)' },
  ordem: { flexDirection: 'row', gap: 8 },
  roteiroAjuda: { fontSize: 12, lineHeight: 17, color: 'var(--text-muted)', paddingHorizontal: 16, paddingBottom: 6 },
  roteiroAcoes: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  roteiroBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  roteiroBtnOff: { opacity: 0.3 },
  roteiroTirar: { height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  roteiroTirarTexto: { fontSize: 13, fontWeight: '600', color: 'var(--vermelho-texto)' },
  nomeFeito: { color: 'var(--text-muted)', textDecorationLine: 'line-through' },
  ordemBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center' },
  ordemBtnAtivo: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  ordemTexto: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  ordemTextoAtivo: { color: 'var(--bg)' },
  lista: { maxHeight: 320 },
  roteirizar: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  roteirizarTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  planejar: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  planejarTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  painel: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 6, backgroundColor: 'var(--surface)' },
  listaEmbutida: { paddingBottom: 8 },
  painelRola: { flex: 1, minHeight: 0, backgroundColor: 'var(--surface)', overscrollBehavior: 'contain' } as never,
  painelConteudo: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
});
