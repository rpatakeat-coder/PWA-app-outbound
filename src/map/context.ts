import { createContext, useContext } from 'react';

/**
 * Canal entre o <MapView> e seus filhos (<Marker>, <Polyline>, <Circle>).
 *
 * O react-native-maps deixa os filhos se registrarem no mapa nativo via
 * hierarquia de componentes. Na Google JS API nao existe hierarquia: cada
 * overlay recebe `map` por atribuicao. Este contexto reproduz o efeito —
 * o filho pega a instancia do pai e se registra sozinho ao montar.
 */
export interface MapChildContextValue {
  maps: typeof google.maps;
  map: google.maps.Map;
  /**
   * Registra um marker. `clusterable=false` (prop `cluster={false}` no
   * react-native-map-clustering) mantem o pin fora do agrupamento — usado
   * pelos pins numerados da rota e pela seta do usuario, que precisam
   * aparecer sempre, nunca virar bolha de contagem.
   *
   * Retorna a funcao de cleanup pra chamar no unmount.
   */
  registerMarker: (
    marker: google.maps.marker.AdvancedMarkerElement,
    clusterable: boolean,
  ) => () => void;
}

export const MapChildContext = createContext<MapChildContextValue | null>(null);

/**
 * Overlays chamam isso. Retorna null enquanto a API do Google ainda carrega —
 * por isso todo consumidor precisa tratar o null em vez de assumir o mapa
 * pronto (os filhos montam junto com o MapView, antes do script baixar).
 */
export function useMapContext(): MapChildContextValue | null {
  return useContext(MapChildContext);
}
