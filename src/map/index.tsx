// Ponto unico de entrada da camada de mapa.
//
// Reexporta com os MESMOS nomes que o react-native-maps e o
// react-native-map-clustering usavam, pra a migracao dos consumidores ser
// so a troca da string do import:
//
//   - import MapView from 'react-native-map-clustering'   ->  from './src/map'
//   - import { Marker, Polyline, Circle } from 'react-native-maps'  ->  from './src/map'
//
// O clustering nao e' mais um wrapper separado: virou props do proprio
// MapView (radius/minPoints/maxZoom/clusterColor), que e' como o App.tsx ja
// as passava.
export { default, default as MapView } from './MapView';
export { default as Marker } from './Marker';
export { default as Polyline } from './Polyline';
export { default as Circle } from './Circle';

export type { MapViewHandle, MapViewProps, Camera, EdgePadding } from './MapView';
export type { MarkerProps } from './Marker';
export type { PolylineProps } from './Polyline';
export type { CircleProps } from './Circle';
export type { Region, LatLng } from './geo';

export { hasApiKey, GOOGLE_MAP_ID } from './loader';

// Na web so existe um provedor — a propria Google JS API. As constantes
// continuam exportadas porque EditLocationModal passa PROVIDER_DEFAULT; sao
// inertes e mantidas so pra o codigo existente nao precisar mudar.
export const PROVIDER_DEFAULT = undefined;
export const PROVIDER_GOOGLE = 'google';
