// Camada de pontos de 7 px (mapa novo): tudo que está fora da lente ativa.
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
  forma: 'bola' | 'quadrado' | 'anel' | 'tracejado';
  opacidade: number;
};

export default function CamadaDePontos({ pontos }: { pontos: Ponto[] }) {
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
        for (const p of pontosRef.current) {
          const px = proj.fromLatLngToDivPixel(new maps.LatLng(p.lat, p.lng));
          if (!px) continue;
          const x = px.x - sw.x;
          const y = px.y - ne.y;
          if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
          g.globalAlpha = p.opacidade;
          if (p.forma === 'quadrado') {
            g.fillStyle = p.cor;
            g.beginPath();
            g.roundRect ? g.roundRect(x - 3.5, y - 3.5, 7, 7, 2) : g.rect(x - 3.5, y - 3.5, 7, 7);
            g.fill();
          } else if (p.forma === 'bola') {
            g.fillStyle = p.cor;
            g.beginPath();
            g.arc(x, y, 3.5, 0, Math.PI * 2);
            g.fill();
          } else {
            g.strokeStyle = p.cor;
            g.lineWidth = 1.5;
            g.setLineDash(p.forma === 'tracejado' ? [2, 1.5] : []);
            g.beginPath();
            g.arc(x, y, 2.8, 0, Math.PI * 2);
            g.stroke();
            g.setLineDash([]);
          }
        }
        g.globalAlpha = 1;
      }
    }

    const camada = new Camada();
    camada.setMap(map);
    redesenharRef.current = () => camada.draw();
    // O overlayLayer anda junto no arraste, mas o canvas só cobre a janela
    // do último desenho: redesenha ao mexer para não aparecer borda vazia.
    const l1 = map.addListener('bounds_changed', () => camada.draw());
    return () => {
      l1.remove();
      camada.setMap(null);
      redesenharRef.current = () => {};
    };
  }, [ctx]);

  useEffect(() => {
    redesenharRef.current();
  }, [pontos]);

  return null;
}
