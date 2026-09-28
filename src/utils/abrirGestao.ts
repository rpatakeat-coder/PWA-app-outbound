// GESTÃO EM ABA NOVA (Julyan, 28/09/2026: "quando o executivo ou gestor clicar em gestão,
// ele tem que abrir uma nova aba, não substituir a aba atual").
//
// A exceção é o iPhone com o app INSTALADO na tela de início: lá uma aba nova cai no
// Safari, que não tem a sessão do app (armazenamento separado) e pede login de novo —
// foi por isso que os links eram na mesma janela. Nesse caso continua na mesma janela.
// No computador, no Android (instalado ou não) e no navegador do celular, abre aba nova.

export function ehIphoneInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
  const instalado = nav.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && instalado;
}

/** Abre a Gestão. 'aba' = abriu em aba nova (a tela atual fica); 'mesma' = navegou aqui. */
export function abrirGestao(caminho = '/gestao'): 'aba' | 'mesma' {
  if (!ehIphoneInstalado()) {
    const janela = window.open(caminho, '_blank');
    if (janela) {
      try { janela.opener = null; } catch { /* sem acesso: segue */ }
      return 'aba';
    }
    // bloqueador de janela: cai na mesma aba, que é melhor que nada acontecer
  }
  window.location.href = caminho;
  return 'mesma';
}

/** Para links com href (react-native-web): os atributos de aba nova, fora do iPhone instalado. */
export function atributosDaGestao(): { target: string; rel: string } | undefined {
  return ehIphoneInstalado() ? undefined : { target: '_blank', rel: 'noopener' };
}
