// Casca unica de painel do app (prompt M1b).
//
// UMA implementacao, duas formas: drawer de 480px a' direita no desktop,
// bottom sheet ancorado no rodape no celular. Quem escolhe e' o useLayout —
// nao duas copias de JSX (regra 1 do CLAUDE.md).
//
// QUEM MAIS VAI USAR ISTO
// Avisos, configuracao de rota, perfil e os drill-downs do gestor. Por isso o
// conteudo entra por slots (topo / corpo / rodape) e nao ha nada de "lead"
// aqui dentro. Se um segundo padrao de painel nascer no app, e' bug.
//
// AS TRES FAIXAS
// topo e rodape sao `flex:0 0 auto` (nao rolam); o corpo e' o unico que rola.
// E' o que mantem a acao do momento visivel sem precisar rolar a ficha.
//
// PADDING E' DO CHAMADOR
// A casca nao impoe padding nas faixas: cada tela tem a sua (o topo do lead,
// por exemplo, usa 12/16/16 no celular pra compensar a alca). A casca cuida
// da forma, do fechamento e da acessibilidade.
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useLayout } from '../hooks/useLayout';

/** Celular: a folha tem dois tamanhos. Desktop ignora e abre sempre completo. */
export type EstagioPainel = 'peek' | 'cheia';

export interface PainelProps {
  visivel: boolean;
  aoFechar: () => void;
  /** Vai pro `aria-label` do dialog — o nome do que esta' aberto. */
  rotulo: string;
  /** Faixa fixa de cima. Nao rola. */
  topo?: React.ReactNode;
  /** Faixa do meio. E' a unica que rola. */
  children?: React.ReactNode;
  /** Faixa fixa de baixo. Nao rola. */
  rodape?: React.ReactNode;
  /**
   * Estagio 1 no celular (peek). Passando isto, a folha vira de dois
   * estagios: peek -> completa -> fechada. Sem isto, abre completa direto.
   */
  peek?: React.ReactNode;
  estagio?: EstagioPainel;
  aoTrocarEstagio?: (estagio: EstagioPainel) => void;
  /** Pra quem precisa rolar o corpo por codigo (abrir menu no fim da lista). */
  corpoRef?: React.RefObject<ScrollView | null>;
  estiloCorpo?: StyleProp<ViewStyle>;
  estiloConteudoCorpo?: StyleProp<ViewStyle>;
  /**
   * Indices dos filhos do corpo que grudam no topo ao rolar (barra de abas).
   *
   * O indice conta os SLOTS crus de children, e `{cond && <X/>}` gasta um slot
   * mesmo quando e' `false` — entao quem usa isto tem que passar os filhos como
   * ARRAY EXPLICITO de posicoes fixas, nunca uma sequencia de condicionais.
   * O elemento grudado tambem precisa pintar o proprio fundo: o wrapper que o
   * RNW cria tem `position:sticky` e nada mais, e o conteudo rola por tras.
   */
  indicesGrudados?: number[];
}

export function Painel({
  visivel,
  aoFechar,
  rotulo,
  topo,
  children,
  rodape,
  peek,
  estagio = 'cheia',
  aoTrocarEstagio,
  corpoRef,
  estiloCorpo,
  estiloConteudoCorpo,
  indicesGrudados,
}: PainelProps) {
  const layout = useLayout();
  const ehDesktop = layout.ehDesktop;
  // No desktop nao ha peek: o drawer de 480px nao cobre o mapa, entao o motivo
  // do peek (nao perder a referencia de onde o pin esta') nao existe ali.
  const temPeek = !ehDesktop && peek != null;
  const mostrandoPeek = temPeek && estagio === 'peek';

  // Refs pros handlers de janela (keydown/popstate) nao reassinarem a cada
  // render — eles sao registrados uma vez por abertura.
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;
  const aoTrocarEstagioRef = useRef(aoTrocarEstagio);
  aoTrocarEstagioRef.current = aoTrocarEstagio;
  const estagioRef = useRef(estagio);
  estagioRef.current = estagio;
  const temPeekRef = useRef(temPeek);
  temPeekRef.current = temPeek;

  // ── Animacao de entrada ────────────────────────────────────────────────
  // Dois valores separados de proposito: `entrada` e' a animacao de abrir
  // (220ms ease-out) e `arraste` e' o dedo. Num valor so', arrastar durante a
  // abertura brigaria com a interpolacao.
  const entrada = useRef(new Animated.Value(0)).current;
  const arraste = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visivel) {
      entrada.setValue(0);
      arraste.setValue(0);
      return;
    }
    Animated.timing(entrada, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visivel, entrada, arraste]);

  const deslocamento = entrada.interpolate({
    inputRange: [0, 1],
    // Desktop entra pela direita (a largura do drawer); celular, por baixo.
    outputRange: [ehDesktop ? 480 : 480, 0],
  });

  // ── Fechar com Esc (web) ───────────────────────────────────────────────
  useEffect(() => {
    if (!visivel || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFecharRef.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [visivel]);

  // ── Voltar do sistema (Android e gesto do iOS, no PWA) ─────────────────
  // Nao ha rota pro painel, entao o voltar sairia do app. Empilhamos um
  // estado ao abrir e tratamos o popstate: da ficha completa desce pro peek,
  // do peek fecha. Ao fechar por outro caminho (X, overlay, Esc), o cleanup
  // desempilha o que empurramos — senao o botao voltar ficaria "engasgado".
  useEffect(() => {
    if (!visivel || Platform.OS !== 'web' || typeof window === 'undefined') return;
    let nossoEstadoNaPilha = true;
    window.history.pushState({ painelTakeat: true }, '');
    const aoVoltar = () => {
      nossoEstadoNaPilha = false;
      if (temPeekRef.current && estagioRef.current === 'cheia') {
        // Desce um estagio e reempilha: o proximo voltar fecha.
        window.history.pushState({ painelTakeat: true }, '');
        nossoEstadoNaPilha = true;
        aoTrocarEstagioRef.current?.('peek');
        return;
      }
      aoFecharRef.current();
    };
    window.addEventListener('popstate', aoVoltar);
    return () => {
      window.removeEventListener('popstate', aoVoltar);
      if (nossoEstadoNaPilha) window.history.back();
    };
  }, [visivel]);

  // ── Foco entra ao abrir e volta ao fechar ──────────────────────────────
  const painelRef = useRef<View>(null);
  useEffect(() => {
    if (!visivel || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const anterior = document.activeElement as HTMLElement | null;
    // O no' do RNW e' o proprio elemento do DOM. tabIndex -1 deixa o painel
    // focavel por codigo sem entrar na ordem do Tab.
    const no = painelRef.current as unknown as HTMLElement | null;
    if (no) {
      no.tabIndex = -1;
      no.focus?.();
    }
    return () => anterior?.focus?.();
  }, [visivel]);

  // ── Arraste (so' no celular) ───────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 2 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        arraste.setValue(0);
      },
      onPanResponderMove: (_, g) => {
        // Pra cima so' um respiro: expandir troca de estagio no release, nao
        // arrasta a folha inteira.
        arraste.setValue(Math.max(g.dy, -32));
      },
      onPanResponderRelease: (_, g) => {
        const puxouPraBaixo = g.dy > 80 || g.vy > 0.4;
        const puxouPraCima = g.dy < -48 || g.vy < -0.4;
        if (puxouPraBaixo && temPeekRef.current && estagioRef.current === 'cheia') {
          arraste.setValue(0);
          aoTrocarEstagioRef.current?.('peek');
          return;
        }
        if (puxouPraBaixo) {
          Animated.timing(arraste, {
            toValue: 800,
            duration: 200,
            useNativeDriver: true,
          }).start(() => aoFecharRef.current());
          return;
        }
        if (puxouPraCima && temPeekRef.current && estagioRef.current === 'peek') {
          arraste.setValue(0);
          aoTrocarEstagio?.('cheia');
          return;
        }
        Animated.spring(arraste, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ).current;

  if (!visivel) return null;

  const transformacao = ehDesktop
    ? { transform: [{ translateX: deslocamento }] }
    : { transform: [{ translateY: Animated.add(deslocamento, arraste) }] };

  return (
    <Modal visible transparent animationType="none" onRequestClose={aoFechar}>
      <View style={[estilos.raiz, ehDesktop ? estilos.raizDesktop : estilos.raizCelular]}>
        {/* Escurecimento com fade proprio. pointerEvents none pra que o toque
            caia no backdrop abaixo, e nao aqui. */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: ehDesktop ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.4)', opacity: entrada },
          ]}
        />
        {/* Backdrop e' IRMAO do conteudo, nunca envolve — envolvendo, ele vira
            responder no navegador touch e mata o clique dos campos. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          style={StyleSheet.absoluteFill}
          onPress={aoFechar}
        />
        <Animated.View
          ref={painelRef}
          role="dialog"
          aria-modal
          aria-label={rotulo}
          style={[
            estilos.painel,
            ehDesktop ? estilos.drawer : estilos.folha,
            !ehDesktop && mostrandoPeek && estilos.folhaPeek,
            transformacao,
          ]}
        >
          {/* A alca so' existe onde ha' gesto. No desktop o painel fecha no X,
              no fundo ou no Esc — uma alca ali mentiria sobre o que da' pra fazer. */}
          {!ehDesktop && (
            <View style={estilos.areaAlca} {...panResponder.panHandlers}>
              <View style={estilos.alca} />
            </View>
          )}

          {mostrandoPeek ? (
            <View {...panResponder.panHandlers}>{peek}</View>
          ) : (
            <>
              {topo}
              <ScrollView
                ref={corpoRef}
                style={[estilos.corpo, estiloCorpo]}
                contentContainerStyle={estiloConteudoCorpo}
                stickyHeaderIndices={indicesGrudados}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
              {rodape}
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1 },
  raizCelular: { justifyContent: 'flex-end' },
  raizDesktop: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  painel: { backgroundColor: 'var(--surface)' },
  drawer: {
    width: 480,
    maxWidth: '100%',
    height: '100%',
    // Sem raio: encosta na borda da janela.
    borderLeftWidth: 1,
    borderLeftColor: 'var(--border)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: -8, height: 0 },
    shadowRadius: 16,
  },
  folha: {
    maxHeight: '92%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
  },
  // No peek a folha tem a altura do conteudo, nao 92%.
  folhaPeek: { maxHeight: undefined },
  areaAlca: { width: '100%', paddingTop: 14, paddingBottom: 14, alignItems: 'center' },
  alca: { alignSelf: 'center', width: 36, height: 4, backgroundColor: 'var(--stroke-default)', borderRadius: 2 },
  corpo: { flex: 1 },
});
