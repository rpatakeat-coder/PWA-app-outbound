// A PÍLULA NÃO PODE COBRIR O RODAPÉ (28/09/2026, Julyan: "o nada planejado de hoje tá
// cortando o rodapé deles"). No iPhone com o app instalado, a pílula e as folhas do mapa
// ficavam por cima da barra de abas: o `chao` sai da altura medida do rodapé, e a conta
// não fecha quando a área segura de baixo entra de um jeito no rodapé e de outro no
// contêiner do mapa — no navegador comum ela fecha e o defeito não aparece.
//
// Em vez de adivinhar a conta, o elemento se mede: a base dele contra o topo da barra de
// abas (data-testid="rodape-app"). Se estiver cobrindo, sobe o que falta; se a conta já
// estiver certa, o ajuste é zero. Só roda na web (é onde o app vive); sem rodapé na tela
// (desktop, painel embutido) não faz nada.
import { useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';

export function useAcimaDoRodape(chao: number, folga: number, chave?: unknown) {
  const ref = useRef<View>(null);
  const [ajuste, setAjuste] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    const medir = () => {
      const el = ref.current as unknown as HTMLElement | null;
      const rodape = document.querySelector('[data-testid="rodape-app"]');
      if (!el || typeof el.getBoundingClientRect !== 'function' || !rodape) return;
      const falta = el.getBoundingClientRect().bottom - (rodape.getBoundingClientRect().top - folga);
      setAjuste((a) => {
        const n = Math.max(0, Math.round(a + falta));
        return Math.abs(n - a) > 1 ? n : a;
      });
    };
    const quadro = window.requestAnimationFrame(medir);
    const depois = window.setTimeout(medir, 700);
    window.addEventListener('resize', medir);
    return () => {
      window.cancelAnimationFrame(quadro);
      window.clearTimeout(depois);
      window.removeEventListener('resize', medir);
    };
  }, [chao, folga, chave]);
  return { ref, ajuste };
}
