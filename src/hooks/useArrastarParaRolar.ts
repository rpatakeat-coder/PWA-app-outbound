// ARRASTAR COM O MOUSE (Julyan, 03/11/26: "sobre o mapa no desktop, as lentes têm que ser arrastáveis").
// No navegador, o ScrollView horizontal do RNW só rola com trackpad ou shift+roda: o mouse não arrasta.
// Aqui: segurar e arrastar rola a fileira, a roda vertical vira rolagem de lado, e o clique que
// terminou um arraste não escolhe a lente embaixo do cursor.
import { useEffect, type RefObject } from 'react';
import { Platform, type ScrollView } from 'react-native';

const LIMIAR_PX = 5;

export function useArrastarParaRolar(ref: RefObject<ScrollView | null>, ligado: boolean) {
  useEffect(() => {
    if (!ligado || Platform.OS !== 'web') return;
    const sv = ref.current as unknown as { getScrollableNode?: () => HTMLElement } | null;
    const el = sv?.getScrollableNode?.() ?? (sv as unknown as HTMLElement | null);
    if (!el || typeof el.addEventListener !== 'function') return;

    let inicioX = 0;
    let inicioScroll = 0;
    let segurando = false;
    let arrastou = false;
    el.style.cursor = 'grab';

    const aoDescer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      segurando = true;
      arrastou = false;
      inicioX = e.clientX;
      inicioScroll = el.scrollLeft;
    };
    const aoMover = (e: PointerEvent) => {
      if (!segurando) return;
      const dx = e.clientX - inicioX;
      if (!arrastou && Math.abs(dx) < LIMIAR_PX) return;
      if (!arrastou) {
        arrastou = true;
        el.style.cursor = 'grabbing';
        el.style.userSelect = 'none';
      }
      el.scrollLeft = inicioScroll - dx;
    };
    const aoSubir = () => {
      if (!segurando) return;
      segurando = false;
      el.style.cursor = 'grab';
      el.style.userSelect = '';
    };
    // o clique que fecha um arraste morre aqui, antes de chegar ao botão da lente
    const aoClicar = (e: MouseEvent) => {
      if (!arrastou) return;
      arrastou = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const aoRodar = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    el.addEventListener('pointerdown', aoDescer);
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSubir);
    el.addEventListener('click', aoClicar, true);
    el.addEventListener('wheel', aoRodar, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', aoDescer);
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSubir);
      el.removeEventListener('click', aoClicar, true);
      el.removeEventListener('wheel', aoRodar);
    };
  }, [ref, ligado]);
}
