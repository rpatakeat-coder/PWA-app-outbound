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
import { IconChevronDown as SiDown, IconClose as SiClose } from '../components/icons';
import { BlocoParaEntrar } from '../components/ParaEntrar';
import { visitasDoDia, type Arma } from '../utils/armasDoMapa';
import type { ObjecaoDaCasa } from '../utils/playbook';
import type { LinhaDoDia as LinhaDoDiaTipo } from '../utils/linhaDoDia';
import { primeiroToque, registrarEvento } from '../utils/eventosDoMapa';
import { useComSinal } from './AvisoSemSinal';

export type { ItemFolha };

type Props = {
  itens: ItemFolha[];
  planoTotal: number;
  /** o plano do dia ainda está sendo lido: não afirmar "Nada planejado" antes de saber (auditoria 29/10/26) */
  planoCarregando?: boolean;
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
  /** Sexta à tarde abaixo da meta de recém-abertos: a linha âmbar (prancha §3). */
  linhaMeta?: string | null;
  /** Toque na linha da meta: abre a lente Recém-abertos. */
  aoNovos?: () => void;
  /** A porta do halo (a parada pendente do plano ou a sugerida depois dele). */
  idProxima?: string | null;
  /** O "Para entrar" da próxima porta (prancha §4). */
  armaDaProxima?: Arma | null;
  /** A próxima porta é a sugerida depois do plano: o porquê e a 2ª opção (prancha §4b). */
  sugestao?: { porque: string; segunda: { id: string; texto: string } | null } | null;
  /** "Fala pronta ›" / "Playbook ›": abre a página do gatilho. */
  aoFala?: (a: Arma) => void;
  /** "SE ELE DISSER · PARA ESTA CASA" (espinha do dia 2.4): até 2, escolhidas pela ficha. */
  objecoesDaProxima?: ObjecaoDaCasa[];
  /* A LINHA DO DIA MUDOU DE CASA (prancha "Mapa limpo" §4, 29/10/26). Ela era uma faixa sobre o
     mapa; agora só o estado `pendente` fica lá em cima, porque é o único com verbo e prazo. Todo
     o resto é contexto e vira o KICKER desta folha, que é onde o executivo já olha para ver a
     próxima porta. `sem_plano` não é nem faixa nem kicker: vira a folha inteira (§4, 2a/2b). */
  linha?: LinhaDoDiaTipo | null;
  /** Entre portas (2.7): o bloco ambar da ligacao que cabe no caminho, no topo da folha. */
  entrePortas?: React.ReactNode;
  /** "Montar o dia" da folha sem plano: a mesma proposta de sempre. */
  aoMontarDia?: () => void;
  /** Lente Recém-abertos: quantos a pessoa tem na região (0 = estado vazio) e a volta ao Meu dia. */
  recem?: { naRegiao: number | null; aoVoltar: () => void } | null;
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
  // recém-aberto: o losango limão com os dias (o mesmo do mapa)
  if (p.familia === 'rec') {
    return (
      <View style={s.miniCaixa}>
        <View style={s.miniLosango}>
          <Text style={s.miniLosangoTexto}>{plano ?? p.abertoHa ?? ''}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.mini, { borderColor: p.dono === 'sem' ? '#FACC15' : p.cor, borderStyle: p.dono === 'sem' ? 'dashed' : 'solid' }]}>
      <Text style={[s.miniTexto, { color: p.cor }]}>{plano ?? (p.familia === 'av' && p.nota != null ? p.nota.toFixed(1).replace('.', ',') : p.glifo || '•')}</Text>
    </View>
  );
}

const diasTexto = (n: number | null | undefined) => (n == null ? null : n === 0 ? 'abriu hoje' : `aberto há ${n} ${n === 1 ? 'dia' : 'dias'}`);

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

export default function FolhaDoMapa({ itens, planoTotal, planoCarregando = false, planoFeito, chao, totalNaArea, rotuloLente, onAbrir, onCheguei: chegueiBruto, aoMedir, quadra, eMeu, visitasFeitas: feitasMedidas, visitasProvadas = null, metaVisitas, aoProgresso, linhaMeta = null, aoNovos, idProxima = null, armaDaProxima: armaDoHalo = null, sugestao = null, aoFala, objecoesDaProxima = [], linha = null, aoMontarDia, entrePortas = null, recem = null, embutida, aoRoteirizar, roteirizando, aoPlanejar, aoMover, aoTirar, pinoAberto = null }: Props) {
  const cores = useIconColors();
  /** Qual objeção do "Se ele disser" está aberta (uma por vez, e a folha não muda de tamanho à toa). */
  const [disserAberta, setDisserAberta] = useState<string | null>(null);
  const onCheguei = (c: Client) => { primeiroToque('cheguei'); chegueiBruto(c); };
  const irAte = (c: Client) => { primeiroToque('ir'); ir(c, false); };
  const visitasFeitas = feitasMedidas ?? 0;
  const feitasTexto = feitasMedidas == null ? "—" : String(feitasMedidas);
  // "N visitas hoje · mínimo 6" (prancha §3): passa de 6 normalmente, nunca "dia concluído"
  const semProva = visitasProvadas != null && visitasFeitas > visitasProvadas ? visitasFeitas - visitasProvadas : 0;
  const visitasTexto = visitasDoDia(feitasMedidas, metaVisitas) ?? `mínimo ${metaVisitas} visitas`;
  const lenteRecem = !!recem;
  const comSinal = useComSinal();
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
  const ordenados = useMemo(() => {
    if (modo === 'roteiro') return itens.filter((it) => it.plano != null).sort((a, b) => (a.plano ?? 0) - (b.plano ?? 0));
    // LENTE RECÉM-ABERTOS (prancha §4): mais novo e mais perto primeiro (até 30 dias na frente)
    if (lenteRecem && modo === 'prioridade') {
      const d = (x: ItemFolha) => x.distanciaM ?? Number.POSITIVE_INFINITY;
      const novo = (x: ItemFolha) => (x.p.familia === 'rec' ? ((x.p.abertoHa ?? 99) <= 30 ? 0 : 1) : 2);
      return [...itens].sort((a, b) => novo(a) - novo(b) || d(a) - d(b));
    }
    return ordenarItens(itens, modo);
  }, [itens, modo, lenteRecem]);
  // a porta do halo: a que o App diz (plano pendente ou a sugerida); sem ela, a 1ª do plano em aberto
  const proxima = useMemo(() => (idProxima ? itens.find((it) => it.c.id === idProxima) ?? null : null)
    ?? ordenarItens(itens, 'prioridade').find((it) => it.plano && !it.feito) ?? null, [itens, idProxima]);
  const ehSugerida = !!proxima && !proxima.plano && !!sugestao;
  // o "Para entrar" é da porta do halo: numa quadra aberta, a "próxima" pode ser outra parada, e a
  // fala era de outro restaurante (auditoria 15/10/26)
  const armaDaProxima = proxima && proxima.c.id === idProxima ? armaDoHalo : null;
  // Arrastar a pílula para cima abre a lista da área (handoff v4.1, xama1).
  const arrasto = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_e, g) => { if (g.dy < -30) setAberta(true); },
  }), []);
  /* O VÃO ENTRE O MAPA E A PÍLULA (print do Julyan, 15/10/26): o onLayout do navegador só dispara
     quando a pílula muda de TAMANHO. Quando ela muda de LUGAR (o rodapé mede depois, o ajuste do
     useAcimaDoRodape), o mapa ficava com o topo velho e sobrava uma faixa escura embaixo dele.
     Remede a cada mudança de lugar ou de conteúdo, no quadro seguinte. */
  useEffect(() => {
    if (aberta || !aoMedir) return;
    const id = requestAnimationFrame(() => {
      const el = acima.ref.current as unknown as HTMLElement | null;
      if (!el || typeof el.getBoundingClientRect !== 'function') return;
      const r = el.getBoundingClientRect();
      if (r.height > 0) aoMedir({ y: Math.round(r.top), altura: Math.round(r.height) + 8 });
    });
    return () => cancelAnimationFrame(id);
  }); // eslint-disable-line react-hooks/exhaustive-deps
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
  /* A FOLHA SEM PLANO (prancha "Mapa limpo" §4, 2a/2b). "Dia sem plano" era uma faixa âmbar sobre
     o mapa com um "Montar ›" de 60 px; virou a folha inteira, porque começar o dia com compromisso
     é a coisa mais importante que a tela tem a dizer às 8h. Continua sem travar nada: o mapa está
     atrás, o Cheguei de qualquer pino funciona, e "Agora não" é só fechar. */
  if (!aberta && linha?.estado === 'sem_plano' && aoMontarDia) {
    return (
      <View ref={acima.ref} style={[s.pilula, s.semPlano, { bottom: chao + 8 + acima.ajuste }]} onLayout={medir} {...arrasto.panHandlers}>
        <View style={s.kickerLinha}>
          <Text style={[s.kickerFolha, s.kickerAmbar]} numberOfLines={1}>DIA SEM PLANO</Text>
          {!!linha.subtitulo && <Text style={s.kickerDireita} numberOfLines={1}>{linha.subtitulo}</Text>}
        </View>
        <Text style={s.semPlanoTitulo} numberOfLines={2}>{linha.titulo}</Text>
        <View style={s.semPlanoBotoes}>
          <Pressable accessibilityRole="button" accessibilityLabel="Ver as portas propostas" onPress={() => setAberta(true)} style={s.btnContorno}>
            <Text style={s.btnContornoTexto}>Ver as portas</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Montar o dia com as portas propostas" onPress={aoMontarDia} style={s.btnMontar}>
            <Text style={s.btnChegueiTexto}>Montar o dia</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!aberta) {
    const meta = Math.max(1, metaVisitas);
    const subProxima = proxima
      ? (ehSugerida ? sugestao!.porque : [distanciaTexto(proxima.distanciaM), aPe(proxima.distanciaM)].filter(Boolean).join(' · ')) || 'toque para ver o lead'
      : '';
    /* O KICKER: o texto que era a faixa do topo, agora aqui. `linha.titulo` já vem pronto e
       testado ("2 de 6 portas · no ritmo"); aqui ele só sobe para caixa alta. O tom vem da
       própria linha — inclusive o VERMELHO do `escapando`, que é a decisão de 29/10: ele fala do
       dia inteiro, não é um verbo que se resolve num toque, então é kicker e não faixa. */
    const tomDoKicker = linha?.tom === 'verde' ? s.kickerVerde
      : linha?.tom === 'ambar' ? s.kickerAmbar
      : linha?.tom === 'vermelho' ? s.kickerVermelho : null;
    return (
      <View ref={acima.ref} style={[s.pilula, { bottom: chao + 8 + acima.ajuste }]} accessibilityLabel="Próxima porta" onLayout={medir} {...arrasto.panHandlers}>
        {/* ENTRE PORTAS (2.7) vai ACIMA do kicker e da proxima porta, mas dentro da folha: e uma
            sugestao de dois minutos, nao um estado do dia — e, como tudo aqui, nunca toma o lugar
            do Cheguei, que continua embaixo, no mesmo pixel. */}
        {entrePortas}
        {linha && (
          <Pressable accessibilityRole="button" accessibilityLabel={linha.rotulo} onPress={aoProgresso} style={s.kickerLinha}>
            <Text style={[s.kickerFolha, tomDoKicker]} numberOfLines={1}>{linha.titulo.toLocaleUpperCase('pt-BR')}</Text>
            {!!linha.direita && <Text style={s.kickerDireita} numberOfLines={1}>{linha.direita}</Text>}
          </Pressable>
        )}
        <View style={s.pilulaLinha}>
          <Pressable accessibilityRole="button" accessibilityLabel="Recolher a barra da próxima porta" onPress={() => setRecolhida(true)} hitSlop={8} style={s.pilulaRecolher}>
            <SiDown width={18} height={18} fill="var(--text-muted)" />
          </Pressable>
          {proxima ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${proxima.c.empresa?.trim() || proxima.c.nome}`} onPress={() => onAbrir(proxima.c)} style={s.pilulaTexto}>
              <Text style={s.pilulaNome} numberOfLines={1}>{proxima.c.empresa?.trim() || proxima.c.nome}</Text>
              <Text style={s.pilulaSub} numberOfLines={1}>{subProxima}</Text>
            </Pressable>
          ) : lenteRecem && recem!.naRegiao === 0 ? (
            /* prancha §8: a lente sem CNPJ novo na região diz isso, e o plano continua no mapa */
            <Pressable accessibilityRole="button" accessibilityLabel="Nenhum recém-aberto na sua região. Abrir a lista" onPress={() => setAberta(true)} style={s.pilulaTexto}>
              <Text style={s.pilulaNome} numberOfLines={1}>Nenhum recém-aberto na região</Text>
              <Text style={s.pilulaSub} numberOfLines={1}>nova leva toda segunda</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Abrir a lista desta área" onPress={() => setAberta(true)} style={s.pilulaTexto}>
              {/* sem "concluído" (prancha §3): 6 é o mínimo, a rua continua */}
              <Text style={s.pilulaNome} numberOfLines={1}>{planoCarregando ? 'Lendo o plano…' : planoTotal ? `Plano feito · ${planoFeito} de ${planoTotal}` : 'Nada planejado hoje'}</Text>
              <Text style={s.pilulaSub} numberOfLines={1}>{`${totalNaArea} na área · ver a lista`}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={`${feitasTexto} ${visitasFeitas === 1 ? 'visita' : 'visitas'} hoje, mínimo ${meta}`} onPress={aoProgresso} style={s.pilulaProgresso} hitSlop={6}>
            <Text style={s.pilulaConta} numberOfLines={1}>{`${feitasTexto} hoje`}</Text>
            <Text style={[s.pilulaProva, semProva > 0 && s.pilulaProvaFalta]} numberOfLines={1}>{semProva ? `${semProva} sem prova` : `mín. ${meta}`}</Text>
          </Pressable>
          {proxima ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cheguei na próxima porta" onPress={() => onCheguei(proxima.c)}
              style={s.pilulaCheguei}>
              <Text style={s.btnChegueiTexto}>Cheguei</Text>
            </Pressable>
          ) : lenteRecem && recem!.naRegiao === 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao Meu dia" onPress={recem!.aoVoltar} style={s.pilulaLista}>
              <Text style={s.pilulaListaTexto}>Meu dia</Text>
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
        {/* A BARRA GUIA O PLANEJAMENTO (Julyan, 15/10/26: "essa barra embaixo tem que guiar o
            planejamento deles, sem travar"). Sem plano hoje, ou com o plano feito a partir das 15h,
            uma linha leva ao Planejar (o dia de hoje ou o de amanhã). Durante o plano, nada: a
            próxima porta já é o guia. Nunca bloqueia o Cheguei. */}
        {(() => {
          if (!aoPlanejar || planoCarregando) return null;
          const hora = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }));
          const semPlano = planoTotal === 0;
          const feitoTarde = planoTotal > 0 && planoFeito >= planoTotal && hora >= 15;
          if (!semPlano && !feitoTarde) return null;
          const texto = semPlano
            ? (hora >= 17 ? 'Sem plano hoje · deixe amanhã pronto' : `Sem plano · monte ${Math.max(1, metaVisitas)} portas em 1 min`)
            : 'Plano de hoje feito · deixe amanhã pronto';
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${texto}. Planejar`} onPress={aoPlanejar} style={s.pilulaArma}>
              <Text style={s.pilulaArmaTexto} numberOfLines={1}>{texto}</Text>
              <Text style={[s.pilulaArmaLink, { color: 'var(--vermelho-texto)' }]}>Planejar ›</Text>
            </Pressable>
          );
        })()}
        {/* ESPIADA DA PRÓXIMA PORTA (prancha §4): só o motivo, em 1–2 linhas, com "Fala pronta ›" */}
        {proxima && armaDaProxima && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Para entrar: ${armaDaProxima.motivo}. Fala pronta`}
            onPress={aoFala ? () => aoFala(armaDaProxima) : () => onAbrir(proxima.c)} style={s.pilulaArma}>
            <Text style={s.pilulaArmaTexto} numberOfLines={2}>
              <Text style={s.pilulaArmaKicker}>{`${armaDaProxima.kicker}  `}</Text>
              {armaDaProxima.motivo}
            </Text>
            <Text style={s.pilulaArmaLink}>Fala pronta ›</Text>
          </Pressable>
        )}
        {!proxima && linhaMeta && (
          <Pressable accessibilityRole="button" onPress={aoNovos} style={s.pilulaArma}>
            <Text style={[s.pilulaArmaTexto, { color: 'var(--tint-amber-text)' }]} numberOfLines={2}>{linhaMeta}</Text>
            <Text style={s.pilulaArmaLink}>Ver ›</Text>
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
        <Text style={[s.kicker, lenteRecem && !proxima && s.kickerNeutro]} numberOfLines={2}>
          {lenteRecem && !quadra ? 'RECÉM-ABERTOS · 0 A 90 DIAS'
            : proxima ? (ehSugerida ? (planoTotal ? 'PLANO FEITO · PRÓXIMA PORTA PERTO' : 'PRÓXIMA PORTA PERTO') : `PRÓXIMA PORTA · ${proxima.plano} DO PLANO`)
              : planoTotal ? 'PLANO DE HOJE' : 'AGORA, PERTO DE VOCÊ'}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={visitasTexto} onPress={aoProgresso} hitSlop={10} style={{ paddingVertical: 13, marginVertical: -13 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={[s.progresso, feitasMedidas != null && feitasMedidas >= metaVisitas && s.progressoOk]}>{visitasTexto}</Text>
          </View>
        </Pressable>
      </View>
      {/* META DOS RECÉM-ABERTOS (prancha §3): a linha só entra na sexta à tarde abaixo da meta;
          o resto da semana o contador mora no botão da lente. Toque abre a lente. */}
      {!!linhaMeta && !lenteRecem && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${linhaMeta} Ver os recém-abertos no mapa`} onPress={aoNovos} style={s.metaLinha}>
          <Text style={s.metaTexto}>{linhaMeta}</Text>
          <Text style={s.metaVer}>Ver ›</Text>
        </Pressable>
      )}

      {lenteRecem && !quadra ? (
        recem!.naRegiao === 0 ? (
          <View style={{ gap: 8, paddingBottom: 4 }}>
            <Text style={s.nome}>Nenhum CNPJ aberto nos últimos 90 dias na sua região</Text>
            <Text style={s.sub}>Nova leva toda segunda. Até lá, seus leads perto estão no Meu dia.</Text>
            <Pressable accessibilityRole="button" onPress={recem!.aoVoltar} style={s.voltarMeuDia}>
              <Text style={s.voltarMeuDiaTexto}>Voltar ao Meu dia</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 2 }}>
            <Text style={s.nome} numberOfLines={1}>{`${recem!.naRegiao ?? itens.filter((it) => it.p.familia === 'rec').length} na sua região`}</Text>
            <Text style={s.sub} numberOfLines={2}>Mais novo e mais perto primeiro · nova leva toda segunda</Text>
          </View>
        )
      ) : proxima ? (
        <View style={{ gap: 8 }}>
          <View style={s.proxima}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${proxima.c.empresa?.trim() || proxima.c.nome}`} onPress={() => onAbrir(proxima.c)} style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.nome} numberOfLines={1}>{proxima.c.empresa?.trim() || proxima.c.nome}</Text>
              <Text style={s.sub} numberOfLines={1}>
                {[proxima.p.familia === 'rec' ? diasTexto(proxima.p.abertoHa) : null, distanciaTexto(proxima.distanciaM), aPe(proxima.distanciaM), proxima.c.bairro?.trim() || null].filter(Boolean).join(' · ') || 'toque para ver o lead'}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Ir até ${proxima.c.empresa?.trim() || proxima.c.nome}`} onPress={() => irAte(proxima.c)} style={s.btnIr}>
              <Text style={s.btnIrTexto}>Ir</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Cheguei na próxima porta" onPress={() => onCheguei(proxima.c)} style={s.btnCheguei}>
              <Text style={s.btnChegueiTexto}>Cheguei</Text>
            </Pressable>
          </View>
          {/* "Para entrar" (prancha §4); na porta sugerida, "ESCOLHIDA POR" com as parcelas (§4b) */}
          {ehSugerida ? (
            <BlocoParaEntrar arma={armaDaProxima ?? { gatilho: 6, kicker: 'PARA ENTRAR', motivo: sugestao!.porque, fala: '' }} compacto
              kicker="ESCOLHIDA POR" motivo={sugestao!.porque} aoAbrirFala={armaDaProxima ? aoFala : undefined} />
          ) : armaDaProxima ? (
            <BlocoParaEntrar arma={armaDaProxima} compacto={!embutida && !aberta} aoAbrirFala={aoFala} />
          ) : null}
          {/* SE ELE DISSER · PARA ESTA CASA (espinha do dia 2.4): a objeção que ele vai
              dizer chega antes da campainha. A resposta abre AQUI, sem sair da folha —
              na porta ninguém navega biblioteca. Sem ficha, nada disto aparece. */}
          {(embutida || aberta) && objecoesDaProxima.length > 0 && (
            <View style={s.disserBloco}>
              <Text style={s.disserKicker}>SE ELE DISSER · PARA ESTA CASA</Text>
              {objecoesDaProxima.map((od) => {
                const abertaEsta = disserAberta === od.objecao.id;
                return (
                  <View key={od.objecao.id}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: abertaEsta }}
                      accessibilityLabel={`Se ele disser: ${od.objecao.curta}. ${od.motivo}`}
                      onPress={() => {
                        if (!abertaEsta) registrarEvento('se_ele_disser_aberto', { objecao_id: od.objecao.id, pagina: od.objecao.paginaId });
                        setDisserAberta(abertaEsta ? null : od.objecao.id);
                      }}
                      style={s.disserLinha}
                    >
                      <Text style={s.disserAspas} numberOfLines={1}>{`“${od.objecao.curta}”`}</Text>
                      <Text style={s.disserMotivo} numberOfLines={1}>{od.motivo}</Text>
                      <Text style={s.disserSeta}>{abertaEsta ? '–' : '›'}</Text>
                    </Pressable>
                    {abertaEsta && (
                      <View style={s.disserResposta}>
                        <Text style={s.disserFala}>{`“${od.objecao.fala}”`}</Text>
                        {od.objecao.seInsistir.length > 0 && (
                          <Text style={s.disserInsistir}>{`Se ele insistir: ${od.objecao.seInsistir.join(' ')}`}</Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          {!comSinal && <Text style={s.semSinal}>Cheguei funciona sem sinal: grava no celular com a hora e o GPS.</Text>}
          {ehSugerida && sugestao!.segunda && (
            <Pressable accessibilityRole="button" onPress={() => { const it = itens.find((x) => x.c.id === sugestao!.segunda!.id); if (it) onAbrir(it.c); }} style={s.segunda}>
              <Text style={s.segundaTexto} numberOfLines={2}>{sugestao!.segunda.texto}</Text>
              <Text style={s.segundaTexto}>›</Text>
            </Pressable>
          )}
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

      {aberta && !(lenteRecem && recem!.naRegiao === 0 && !quadra) && (quadra ? (
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
            <Text style={s.nestaAreaTexto} numberOfLines={1}>{lenteRecem ? 'MAIS NOVOS PERTO' : `Nesta área · ${itens.length} ${itens.length === 1 ? 'pino' : 'pinos'}`}</Text>
            <Text style={s.nestaAreaSub}>{totalNaArea > itens.length
              ? `Lente ${rotuloLente} · ${totalNaArea - itens.length} viram ponto: aproxime para ver`
              : `Lente ${rotuloLente}`}</Text>
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

      {aberta && !(lenteRecem && recem!.naRegiao === 0 && !quadra) && (
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
                    {/* recém-aberto e mais avaliado: sem telefone (não tem / seria consulta paga) */}
                    {(it.p.familia === 'rec'
                      ? [diasTexto(it.p.abertoHa), distanciaTexto(it.distanciaM)]
                      : it.p.familia === 'av'
                        ? [it.p.nota != null ? `★ ${it.p.nota.toFixed(1).replace('.', ',')}` : null, distanciaTexto(it.distanciaM)]
                        : [distanciaTexto(it.distanciaM), it.c.telefone?.trim() ? null : 'sem tel.']).filter(Boolean).join(' · ') || ' '}
                  </Text>
                  {it.p.familia !== 'rec' && it.p.familia !== 'av' && <Etiquetas it={it} />}
                </View>
                {!eMeu && it.c.latitude != null && (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Ir até ${it.c.empresa?.trim() || it.c.nome}`} onPress={() => irAte(it.c)} style={s.linhaIr}>
                    <Text style={s.linhaIrTexto}>Ir</Text>
                  </Pressable>
                )}
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
  metaLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'var(--tint-amber)' },
  metaTexto: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: '600', color: 'var(--tint-amber-text)' },
  metaVer: { fontSize: 13, fontWeight: '700', color: 'var(--tint-amber-text)', flexShrink: 0 },
  pilulaLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60 },
  pilulaArma: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderTopWidth: 1, borderTopColor: 'var(--border-soft)', paddingRight: 8 },
  pilulaArmaTexto: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: '600', color: 'var(--text)' },
  pilulaArmaKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.66, color: 'var(--arma-kicker)' },
  pilulaArmaLink: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)', textDecorationLine: 'underline', flexShrink: 0 },
  kickerNeutro: { color: 'var(--text)' },
  semSinal: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)', backgroundColor: 'var(--arma-fundo)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
  progressoOk: { color: 'var(--ok-texto)' },
  btnIr: { height: 48, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  btnIrTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  linhaIr: { height: 44, minWidth: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  linhaIrTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  segunda: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  segundaTexto: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: 'var(--text-muted)' },
  voltarMeuDia: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  voltarMeuDiaTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  miniCaixa: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  // o mesmo limão neon do pino do mapa (15/10/26), com a tinta escura nos dois temas
  miniLosango: { width: 21, height: 21, borderRadius: 3, transform: [{ rotate: '45deg' }], backgroundColor: '#C8F31D', borderWidth: 1.5, borderColor: '#111418', alignItems: 'center', justifyContent: 'center' },
  miniLosangoTexto: { fontSize: 10, fontWeight: '700', color: '#111418', transform: [{ rotate: '-45deg' }] },
  pilulaRecolher: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12, flexShrink: 0 },
  pilulaMini: {
    position: 'absolute', left: 10, zIndex: 20, height: 44, borderRadius: 22, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)',
  },
  pilulaMiniTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  pilulaMiniSeta: { fontSize: 14, color: 'var(--text-muted)' },
  // a pílula ganhou a linha do "Para entrar" (prancha §4): coluna, não mais 60 px fixos
  pilula: {
    position: 'absolute', left: 10, right: 10, zIndex: 20, minHeight: 60, borderRadius: 18,
    flexDirection: 'column', paddingLeft: 14, paddingRight: 6,
    backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  pilulaTexto: { flex: 1, minWidth: 0, justifyContent: 'center', minHeight: 48 },
  pilulaNome: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  pilulaSub: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)', marginTop: 1 },
  pilulaProgresso: { alignItems: 'center', gap: 1, paddingHorizontal: 2, minHeight: 48, minWidth: 52, justifyContent: 'center' },
  pilulaConta: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
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
  kicker: { flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 15, fontWeight: '700', letterSpacing: 0.5, color: 'var(--vermelho-texto)' },
  progresso: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  pilulaProva: { fontSize: 11, fontWeight: '600', color: 'var(--text-muted)', marginTop: 2 },
  pilulaProvaFalta: { color: 'var(--tint-amber-text)' },
  proxima: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  /* O KICKER DA FOLHA (prancha "Mapa limpo" §4): a linha que era faixa no topo. */
  kickerLinha: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2, marginBottom: 6 },
  kickerFolha: { flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, color: 'var(--text-muted)' },
  kickerVerde: { color: 'var(--ok-texto)' },
  kickerAmbar: { color: 'var(--tint-amber-text)' },
  /* O `escapando` é o único de ritmo que é vermelho, e por decisão de 29/10 ele é kicker, não
     faixa: fala do dia inteiro em vez de um verbo que se resolve num toque. */
  kickerVermelho: { color: 'var(--vermelho-texto)' },
  kickerDireita: { fontSize: 12, fontWeight: '500', color: 'var(--text-muted)', flexShrink: 0 },
  /* NUNCA DOIS VERMELHOS CHEIOS (§3): com a faixa vermelha na tela o Cheguei vira contorno —
     e continua funcionando, porque nada no mapa trava o Cheguei. */
  /* A FOLHA SEM PLANO (§4, 2a/2b). */
  semPlano: { gap: 2 },
  semPlanoTitulo: { fontSize: 18, lineHeight: 23, fontWeight: '700', color: 'var(--text)', paddingHorizontal: 2 },
  semPlanoBotoes: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnContorno: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  btnContornoTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  btnMontar: { flex: 1, height: 48, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  // SE ELE DISSER (2.4): mesmos tokens do resto da folha, nenhuma cor nova, e
  // cada linha com os 44 px de toque mínimo do pedido.
  disserBloco: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'var(--border)', gap: 2 },
  disserKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.66, color: 'var(--text-subtle)', marginBottom: 4 },
  disserLinha: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  disserAspas: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: '600', color: 'var(--text)' },
  disserMotivo: { fontSize: 12, fontWeight: '500', color: 'var(--text-subtle)', flexShrink: 1, maxWidth: '42%' },
  disserSeta: { fontSize: 15, fontWeight: '700', color: 'var(--text-muted)', width: 14, textAlign: 'center' },
  disserResposta: { paddingBottom: 10, gap: 4 },
  disserFala: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: 'var(--text)' },
  disserInsistir: { fontSize: 12.5, lineHeight: 17, color: 'var(--text-muted)' },
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
  planejar: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  planejarTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  painel: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 6, backgroundColor: 'var(--surface)' },
  listaEmbutida: { paddingBottom: 8 },
  painelRola: { flex: 1, minHeight: 0, backgroundColor: 'var(--surface)', overscrollBehavior: 'contain' } as never,
  painelConteudo: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
});
