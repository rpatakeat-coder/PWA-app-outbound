// <Circle> compativel com react-native-maps.
// Unico consumidor hoje: o mapa de calor do gestor, que desenha um circulo
// translucido por celula da grade (ver src/utils/heatmap.ts). Sao dezenas a
// centenas por render, entao a instancia e' reaproveitada entre updates.
import { useEffect, useRef } from 'react';

import { useMapContext } from './context';
import type { LatLng } from './geo';

export interface CircleProps {
  center: LatLng;
  /** Raio em METROS (igual ao react-native-maps, nao em pixels). */
  radius: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  zIndex?: number;
}

export default function Circle({
  center,
  radius,
  fillColor = 'rgba(0,0,0,0.1)',
  strokeColor = 'rgba(0,0,0,0)',
  strokeWidth = 0,
  zIndex,
}: CircleProps) {
  const ctx = useMapContext();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!ctx) return;

    const circle = new ctx.maps.Circle({
      map: ctx.map,
      // As manchas de calor sao decorativas: capturar clique aqui roubaria o
      // toque do pin que estiver embaixo.
      clickable: false,
    });
    circleRef.current = circle;

    return () => {
      circle.setMap(null);
      circleRef.current = null;
    };
  }, [ctx]);

  useEffect(() => {
    const circle = circleRef.current;
    if (!circle) return;

    circle.setOptions({
      center: { lat: center.latitude, lng: center.longitude },
      radius,
      fillColor,
      // A Google separa cor e opacidade; o app manda rgba() no fillColor.
      // Deixamos fillOpacity em 1 pra o alpha do proprio rgba mandar.
      fillOpacity: 1,
      strokeColor,
      strokeOpacity: strokeWidth > 0 ? 1 : 0,
      strokeWeight: strokeWidth,
      zIndex,
    });
  }, [center.latitude, center.longitude, radius, fillColor, strokeColor, strokeWidth, zIndex]);

  return null;
}
