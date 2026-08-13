// <Polyline> compativel com react-native-maps.
// Usada em tres lugares: rota do dia (vermelha), caminho restante na
// navegacao (azul) e rastro percorrido (cinza).
import { useEffect, useMemo, useRef } from 'react';

import { useMapContext } from './context';
import { toLatLngLiteral, type LatLng } from './geo';

export interface PolylineProps {
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  /** [traco, espaco] em px. O app usa pra sinalizar rota em linha reta (sem geometria real). */
  lineDashPattern?: number[];
  zIndex?: number;
}

export default function Polyline({
  coordinates,
  strokeColor = '#000000',
  strokeWidth = 3,
  lineDashPattern,
  zIndex,
}: PolylineProps) {
  const ctx = useMapContext();
  const lineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!ctx) return;

    const line = new ctx.maps.Polyline({ map: ctx.map });
    lineRef.current = line;

    return () => {
      line.setMap(null);
      lineRef.current = null;
    };
  }, [ctx]);

  // O consumidor passa o padrao inline (`lineDashPattern={[8, 4]}`), o que
  // cria um array novo a cada render. Como dependencia direta, o efeito
  // abaixo rodaria SEMPRE e reconstruiria o path inteiro da rota a cada
  // frame. A assinatura em string estabiliza isso.
  const dashKey = lineDashPattern ? lineDashPattern.join(',') : '';

  const path = useMemo(
    () => coordinates.filter(Boolean).map(toLatLngLiteral),
    [coordinates],
  );

  useEffect(() => {
    const line = lineRef.current;
    if (!line || !ctx) return;

    const dashed = dashKey.length > 0;

    const dash = dashKey ? dashKey.split(',').map(Number) : [];

    line.setOptions({
      path,
      strokeColor,
      strokeWeight: strokeWidth,
      // Tracejado na Google e' uma linha invisivel com simbolos repetidos por
      // cima — nao ha equivalente direto ao lineDashPattern nativo.
      strokeOpacity: dashed ? 0 : 1,
      icons: dashed
        ? [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 1,
                strokeColor,
                strokeWeight: strokeWidth,
                scale: strokeWidth,
              },
              offset: '0',
              // Espacamento proporcional ao traco pedido, com minimo pra o
              // tracejado nao virar linha continua em traco muito curto.
              repeat: `${Math.max(12, (dash[0] ?? 8) + (dash[1] ?? 4))}px`,
            },
          ]
        : undefined,
      zIndex,
    });
  }, [ctx, path, strokeColor, strokeWidth, dashKey, zIndex]);

  return null;
}
