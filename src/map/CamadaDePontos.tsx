// Camada de pontos do zoom afastado (prancha "Mapa do Executivo", 15/10/26): o que está na lente
// vira ponto quando o mapa se afasta do bairro — o recém-aberto, losango de 9 px; o lead, ponto de
// 10 px na cor da temperatura. O plano, o aberto e a próxima porta continuam pino inteiro.
//
// Um canvas só, por cima do mapa, em vez de um AdvancedMarkerElement por
// lead. Com a lente certa são poucas dezenas de pinos inteiros e alguns
// milhares de pontos — milhares de marcadores travam o celular, e agrupados
// viram bolha azul com número, que é justamente o que a prancha proíbe
// ("nunca só um número num círculo"). Pontos não têm toque próprio.
import { useEffect, useRef } from 'react';

import { useMapContext } from './context';

export type Ponto = {
  lat: number;
  lng: number;
  cor: string;
  borda: string;
  forma: 'bola' | 'losango';
  tamanho: number;
  opacidade: number;
};

// sol: modo sol (mapa claro) ganha contorno escuro nos pontos cheios, que sumiam no fundo claro.
export default function CamadaDePontos({ pontos }: { pontos: Ponto[]; sol?: boolean }) {
  const ctx = useMapContext();
  const pontosRef = useRef(pontos);
  pontosRef.current = pontos;
  const redesenharRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!ctx) return;
    const { maps, map } = ctx;

    class Camada extends maps.OverlayView {
      canvas = document.createElement('canvas');
      onAdd() {
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none';
        this.getPanes()?.overlayLayer.appendChild(this.canvas);
      }
      onRemove() {
        this.canvas.remove();
      }
      draw() {
        const proj = this.getProjection();
        const b = map.getBounds();
        if (!proj || !b) return;
        const sw = proj.fromLatLngToDivPixel(b.getSouthWest());
        const ne = proj.fromLatLngToDivPixel(b.getNorthEast());
        if (!sw || !ne) return;
        const w = Math.max(1, Math.round(ne.x - sw.x));
        const h = Math.max(1, Math.round(sw.y - ne.y));
        const dpr = window.devicePixelRatio || 1;
        const c = this.canvas;
        c.style.left = `${sw.x}px`;
        c.style.top = `${ne.y}px`;
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
        if (c.width !== w * dpr || c.height !== h * dpr) {
          c.width = w * dpr;
          c.height = h * dpr;
        }
        const g = c.getContext('2d');
        if (!g) return;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        /* só projeta o que está na tela (14/10/26): a carga traz milhares de pontos da cidade, e
           projetar todos a cada quadro travava o celular; comparar lat/lng com a janela é barato */
        const bs = b.getSouthWest(), bn = b.getNorthEast();
        const mLat = (bn.lat() - bs.lat()) * 0.05, mLng = Math.abs(bn.lng() - bs.lng()) * 0.05;
        const latMin = bs.lat() - mLat, latMax = bn.lat() + mLat, lngMin = bs.lng() - mLng, lngMax = bn.lng() + mLng;
        for (const p of pontosRef.current) {
          if (p.lat < latMin || p.lat > latMax || (lngMin <= lngMax && (p.lng < lngMin || p.lng > lngMax))) continue;
          const px = proj.fromLatLngToDivPixel(new maps.LatLng(p.lat, p.lng));
          if (!px) continue;
          const x = px.x - sw.x;
          const y = px.y - ne.y;
          if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
          g.globalAlpha = p.opacidade;
          const r = p.tamanho / 2;
          g.fillStyle = p.cor;
          g.strokeStyle = p.borda;
          g.lineWidth = 1.5;
          g.beginPath();
          if (p.forma === 'losango') {
            // o quadrado girado 45°: a diagonal é o lado × 1,41
            const dg = r * Math.SQRT2;
            g.moveTo(x, y - dg); g.lineTo(x + dg, y); g.lineTo(x, y + dg); g.lineTo(x - dg, y); g.closePath();
          } else {
            g.arc(x, y, r, 0, Math.PI * 2);
          }
          g.fill();
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    }

    const camada = new Camada();
    camada.setMap(map);
    redesenharRef.current = () => camada.draw();
    // O overlayLayer anda junto no arraste, mas o canvas só cobre a janela
    // do último desenho: redesenha ao mexer para não aparecer borda vazia.
    /* no máximo um desenho por quadro (14/10/26): o bounds_changed dispara várias vezes por quadro */
    let pedido = 0;
    const l1 = map.addListener('bounds_changed', () => {
      if (pedido) return;
      pedido = requestAnimationFrame(() => { pedido = 0; camada.draw(); });
    });
    return () => {
      l1.remove();
      if (pedido) cancelAnimationFrame(pedido);
      camada.setMap(null);
      redesenharRef.current = () => {};
    };
  }, [ctx]);

  useEffect(() => {
    redesenharRef.current();
  }, [pontos]);

  return null;
}
