import { useWindowDimensions } from 'react-native';

// Largura da janela -> decisoes de layout, num lugar so'.
//
// POR QUE UM HOOK, E NAO MEDIA QUERY
// O app roda em react-native-web: os estilos sao objetos JS que viram classes,
// e nao ha' `@media` pra escrever dentro de um StyleSheet. O caminho e' ler a
// largura e escolher o estilo — o mesmo que o app ja' faz com `insets`.
//
// OS DEGRAUS SAO DO DESIGN SYSTEM, nao meus.
// foundations.md §3 (Grids) define:
//   Mobile   4 colunas, largura alvo 390px. Combinacoes: 4 (cheia) e 2+2.
//   Desktop  12 colunas, gutter 16px, margem 16-20px, MIN WIDTH 1024px.
//            Combinacoes: 12 · 6+6 · 8+4 · 4+4+4 · 3+3+3+3.
//
// Dai saem os dois cortes:
//   ate 767    celular. NADA muda: e' onde o app e' de fato usado, na rua.
//   768-1023   tablet. Ganha 2 colunas (o "2+2" do grid Mobile), e o alvo
//              continua 48px porque o design system agrupa Tablet COM Mobile.
//   1024+      desktop, o piso do grid de 12 colunas. Tres colunas = "4+4+4".
//
// ALVO DE TOQUE — components.md, tabela de Button:
//   Mobile/Tablet 48px ("min 48px touch target")
//   Desktop Large 40px ("primary desktop default")
// Nao inventar valor intermediario: a regra 4 do README do kit e' explicita
// sobre nao substituir token oficial por valor visualmente parecido.

export interface Layout {
  largura: number;
  /** < 768px — o celular de sempre. */
  ehCelular: boolean;
  /** 768px+ — ja' cabe mais de uma coluna. */
  ehLargo: boolean;
  /** 1024px+ — o piso do grid Desktop de 12 colunas (foundations.md §3). */
  ehDesktop: boolean;
  /** Colunas da lista de leads. */
  colunas: number;
  /** Teto de largura do conteudo. O mesmo do cockpit de gestao: duas larguras
   *  diferentes entre os dois produtos leriam como bug. Nao ha' token de
   *  largura maxima em foundations.md — e' extensao nossa, nao oficial. */
  larguraMaxima: number;
  /** Altura minima de um controle tocavel. */
  alvo: number;
}

const TETO = 1320;

export function useLayout(): Layout {
  const { width } = useWindowDimensions();
  const ehLargo = width >= 768;
  const ehDesktop = width >= 1024;
  return {
    largura: width,
    ehCelular: !ehLargo,
    ehLargo,
    ehDesktop,
    colunas: ehDesktop ? 3 : ehLargo ? 2 : 1,
    larguraMaxima: TETO,
    // Tablet fica com 48 junto do celular: e' o que o design system manda.
    alvo: ehDesktop ? 40 : 48,
  };
}
