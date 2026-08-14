// <MapView> sobre a Google Maps JavaScript API, com a MESMA superficie de
// props/metodos do react-native-maps + react-native-map-clustering.
//
// O objetivo e' que App.tsx e EditLocationModal continuem escritos como
// estavam: mesmas props (initialRegion, onRegionChangeComplete, radius,
// minPoints, clusterColor...) e mesmos metodos de ref (fitToCoordinates,
// animateToRegion, animateCamera). Toda a traducao mora aqui.
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { MarkerClusterer, SuperClusterAlgorithm, type Renderer } from '@googlemaps/markerclusterer';

import { MapChildContext, type MapChildContextValue } from './context';
import { GOOGLE_MAP_ID, USING_DEMO_MAP_ID, loadGoogleMaps, onGoogleAuthFailure } from './loader';
import { useTheme } from '../theme';
import {
  boundsForCoordinates,
  boundsToRegion,
  regionToBounds,
  toLatLngLiteral,
  zoomForLongitudeDelta,
  type LatLng,
  type Region,
} from './geo';

export interface Camera {
  center?: LatLng;
  zoom?: number;
  heading?: number;
  pitch?: number;
}

export interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Metodos que o App.tsx chama via ref. Espelha o react-native-maps. */
export interface MapViewHandle {
  fitToCoordinates: (
    coords: LatLng[],
    options?: { edgePadding?: Partial<EdgePadding>; animated?: boolean },
  ) => void;
  animateToRegion: (region: Region, duration?: number) => void;
  animateCamera: (camera: Camera, options?: { duration?: number }) => void;
  getMapInstance: () => google.maps.Map | null;
}

export interface MapViewProps {
  style?: any;
  onLayout?: (e: LayoutChangeEvent) => void;
  initialRegion?: Region;
  children?: React.ReactNode;

  showsUserLocation?: boolean;
  followsUserLocation?: boolean;

  onPanDrag?: () => void;
  onRegionChange?: (region: Region) => void;
  onRegionChangeComplete?: (region: Region) => void;
  onPress?: (e: { nativeEvent: { coordinate: LatLng } }) => void;

  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;

  /** Clustering (react-native-map-clustering). */
  radius?: number;
  minPoints?: number;
  maxZoom?: number;
  clusterColor?: string;
  clusterTextColor?: string;

  /**
   * Aceitas por compatibilidade e ignoradas — nao existem na web:
   * `showsBuildings` (o 3D vem do proprio tile vetorial), `spiralEnabled`
   * (a Google ja separa markers sobrepostos no zoom) e `animationEnabled`
   * (o workaround do snapshot vazio no iOS nao se aplica ao DOM).
   * Declaradas pra o TypeScript nao reclamar nas chamadas existentes.
   */
  showsBuildings?: boolean;
  spiralEnabled?: boolean;
  animationEnabled?: boolean;
  provider?: unknown;
  /** Callback-ref alternativo, como no react-native-map-clustering. */
  mapRef?: (ref: MapViewHandle | null) => void;
}

/** Bolha de cluster: mesmo visual do react-native-map-clustering (circulo + contagem). */
function makeClusterRenderer(
  maps: typeof google.maps,
  color: string,
  textColor: string,
): Renderer {
  return {
    render({ count, position }) {
      const div = document.createElement('div');
      // Cresce com a contagem, mas com teto: sem o clamp um cluster de 2000
      // leads viraria um circulo gigante cobrindo a cidade inteira.
      const size = Math.min(56, 34 + Math.log10(Math.max(count, 1)) * 14);
      Object.assign(div.style, {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: color,
        color: textColor,
        border: '2px solid #fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: '700',
        fontSize: `${count >= 1000 ? 11 : 13}px`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        cursor: 'pointer',
      });
      div.textContent = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);

      return new maps.marker.AdvancedMarkerElement({
        position,
        content: div,
        // Acima dos pins soltos pra a bolha nunca ficar escondida atras deles.
        zIndex: 3000,
      });
    },
  };
}

const MapViewInner = forwardRef<MapViewHandle, MapViewProps>(function MapView(props, ref) {
  const {
    style,
    onLayout,
    initialRegion,
    children,
    showsUserLocation = false,
    followsUserLocation = false,
    onPanDrag,
    onRegionChange,
    onRegionChangeComplete,
    onPress,
    rotateEnabled = false,
    pitchEnabled = false,
    scrollEnabled = true,
    zoomEnabled = true,
    radius = 60,
    minPoints = 3,
    maxZoom = 14,
    clusterColor = '#3b82f6',
    clusterTextColor = '#ffffff',
    mapRef,
  } = props;

  // O mapa nao le CSS: a variante clara/escura vem do estilo publicado no Map
  // ID e e' escolhida por `colorScheme`, que so' pode ser definido na
  // construcao. Por isso o tema entra aqui como dependencia, e nao como cor.
  const { isDark } = useTheme();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const [ctx, setCtx] = useState<MapChildContextValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Callbacks em ref: os listeners da Google sao registrados UMA vez na
  // criacao do mapa. Sem isso, cada troca de handler exigiria recriar o
  // mapa — e recriar o mapa e' exatamente o evento cobrado (Dynamic Maps).
  const handlers = useRef({ onPanDrag, onRegionChange, onRegionChangeComplete, onPress });
  handlers.current = { onPanDrag, onRegionChange, onRegionChangeComplete, onPress };

  // A recusa da chave chega DEPOIS do script carregar, por callback global —
  // sem isto o usuario so' veria o mapa cinza da Google, sem saber o motivo.
  useEffect(
    () =>
      onGoogleAuthFailure(() => {
        setError(
          USING_DEMO_MAP_ID
            ? 'O Google recusou a chave do mapa. Falta configurar o Map ID ' +
                '(EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID) — sem ele os pins não carregam.'
            : 'O Google recusou a chave do mapa. Verifique se a Maps JavaScript API ' +
                'está ativa, se este domínio está liberado nas restrições da chave e ' +
                'se o Map ID é do tipo JavaScript.',
        );
      }),
    [],
  );

  // ---- Criacao do mapa ----
  // Recriado quando o TEMA muda, porque `colorScheme` so' vale na construcao.
  // Antes eu lia o tema uma unica vez pra economizar eventos do SKU Dynamic
  // Maps, mas o efeito era o mapa continuar claro depois de ligar o modo
  // escuro, ate' o usuario sair da aba e voltar. Trocar de tema e' raro (uma
  // vez por dia, no maximo), entao um carregamento a mais nao pesa na cota.
  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;

        const width = containerRef.current.clientWidth || 400;
        const center = initialRegion
          ? { lat: initialRegion.latitude, lng: initialRegion.longitude }
          : { lat: -23.55, lng: -46.63 };
        const zoom = initialRegion
          ? zoomForLongitudeDelta(initialRegion.longitudeDelta, width)
          : 12;

        const map = new maps.Map(containerRef.current, {
          center,
          zoom,
          mapId: GOOGLE_MAP_ID,
          // Seleciona a variante clara/escura do estilo publicado nesse Map ID.
          // Precisa vir na construcao — nao ha setter depois; por isso o
          // efeito inteiro depende de `isDark`.
          colorScheme: isDark ? 'DARK' : 'LIGHT',
          // UI propria do app: os controles padrao da Google brigariam com os
          // botoes flutuantes (centralizar, calor, rota) desenhados por cima.
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: scrollEnabled ? 'greedy' : 'none',
          zoomControl: false,
          rotateControl: rotateEnabled,
          scrollwheel: zoomEnabled,
          headingInteractionEnabled: rotateEnabled,
          tiltInteractionEnabled: pitchEnabled,
        });

        mapInstanceRef.current = map;

        // `idle` = mapa parou de mover E terminou de desenhar. E' o analogo
        // exato do onRegionChangeComplete: o valor daqui e' o definitivo que
        // o modo de criacao de lead salva como coordenada.
        map.addListener('idle', () => {
          const b = map.getBounds();
          if (b) handlers.current.onRegionChangeComplete?.(boundsToRegion(b));
        });

        // `bounds_changed` dispara continuamente durante o arraste — alimenta
        // o preview de coordenadas enquanto o usuario move o mapa.
        map.addListener('bounds_changed', () => {
          const b = map.getBounds();
          if (b) handlers.current.onRegionChange?.(boundsToRegion(b));
        });

        map.addListener('dragstart', () => handlers.current.onPanDrag?.());

        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          handlers.current.onPress?.({
            nativeEvent: {
              coordinate: { latitude: e.latLng.lat(), longitude: e.latLng.lng() },
            },
          });
        });

        const clusterer = new MarkerClusterer({
          map,
          markers: [],
          algorithm: new SuperClusterAlgorithm({ radius, minPoints, maxZoom }),
          renderer: makeClusterRenderer(maps, clusterColor, clusterTextColor),
        });
        clustererRef.current = clusterer;

        // Registro em LOTE. Cada addMarker/removeMarker individual redesenha
        // o clusterer inteiro; com centenas de pins montando no mesmo commit
        // do React isso vira O(n^2) e trava o mapa por segundos. Aqui as
        // chamadas do commit sao acumuladas e aplicadas de uma vez, com um
        // unico render no fim.
        let pendingAdd: google.maps.marker.AdvancedMarkerElement[] = [];
        let pendingRemove: google.maps.marker.AdvancedMarkerElement[] = [];
        let flushScheduled = false;

        const flush = () => {
          flushScheduled = false;

          // Marker que entrou e saiu no mesmo lote (remonta por mudanca de
          // key) se anula: aplicar os dois lados deixaria o clusterer com
          // referencia morta.
          const add = pendingAdd.filter((m) => !pendingRemove.includes(m));
          const remove = pendingRemove.filter((m) => !pendingAdd.includes(m));
          pendingAdd = [];
          pendingRemove = [];

          // `true` = noDraw: segura o redesenho ate o render() final.
          if (remove.length) clusterer.removeMarkers(remove, true);
          if (add.length) clusterer.addMarkers(add, true);
          if (remove.length || add.length) clusterer.render();
        };

        const scheduleFlush = () => {
          if (flushScheduled) return;
          flushScheduled = true;
          // Microtask: roda logo apos os effects do commit atual, entao pega
          // o lote inteiro de markers daquele render.
          queueMicrotask(flush);
        };

        const registerMarker: MapChildContextValue['registerMarker'] = (marker, clusterable) => {
          if (clusterable) {
            pendingAdd.push(marker);
            scheduleFlush();
            return () => {
              pendingRemove.push(marker);
              scheduleFlush();
            };
          }
          // Fora do clustering (pins numerados da rota, seta do usuario):
          // vao direto pro mapa, sem passar pelo clusterer.
          marker.map = map;
          return () => {
            marker.map = null;
          };
        };

        setCtx({ maps, map, registerMarker });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      clustererRef.current?.clearMarkers();
      clustererRef.current = null;
      mapInstanceRef.current = null;
      // Zera o contexto: os overlays filhos desmontam e soltam seus markers
      // ANTES de o mapa novo nascer. Sem isso eles tentariam se registrar num
      // mapa que ja' nao existe.
      setCtx(null);
      // A Google nao tem "destroy": o que ela criou fica no container. Sem
      // limpar, o mapa novo seria montado por cima do antigo.
      containerRef.current?.replaceChildren();
    };
    // `isDark` e' a UNICA dependencia: so' o tema justifica recriar o mapa
    // (o Map ID nao pode ser trocado depois). initialRegion e as props de
    // clustering sao snapshot inicial, como no react-native-maps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  // ---- Ponto azul da posicao do usuario ----
  // O react-native-maps delega isso ao SO; na web desenhamos e acompanhamos
  // via navigator.geolocation.
  // Em ref, nao em dependencia: `followsUserLocation` vem de
  // `isFollowingUser && !creationMode` e alterna a cada arraste do mapa. Como
  // dependencia, cada alternancia derrubaria e recriaria o watchPosition —
  // e cada re-aquisicao de GPS custa segundos e bateria no celular do campo.
  const followRef = useRef(followsUserLocation);
  followRef.current = followsUserLocation;

  useEffect(() => {
    if (!ctx || !showsUserLocation) return;

    const dot = document.createElement('div');
    Object.assign(dot.style, {
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      background: '#1d4ed8',
      border: '3px solid #fff',
      boxShadow: '0 0 0 6px rgba(29,78,216,0.18)',
      transform: 'translateY(50%)', // ancora no centro, nao na base
    });

    const marker = new ctx.maps.marker.AdvancedMarkerElement({
      map: ctx.map,
      content: dot,
      zIndex: 2500,
    });

    const watchId = navigator.geolocation?.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        marker.position = p;
        if (followRef.current) ctx.map.panTo(p);
      },
      (err) => console.warn('[MAP] geolocation:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      marker.map = null;
    };
  }, [ctx, showsUserLocation]);

  // ---- Metodos imperativos ----
  const handle = useMemo<MapViewHandle>(
    () => ({
      fitToCoordinates: (coords, options) => {
        const map = mapInstanceRef.current;
        if (!map || !ctx) return;
        const bounds = boundsForCoordinates(coords, ctx.maps);
        if (!bounds) return;
        const p = options?.edgePadding;
        map.fitBounds(
          bounds,
          p
            ? { top: p.top ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0 }
            : 40,
        );
      },

      animateToRegion: (region) => {
        const map = mapInstanceRef.current;
        if (!map) return;
        // fitBounds respeita o delta pedido melhor que setZoom+panTo, que
        // arredondaria o zoom e mudaria a area enquadrada.
        map.fitBounds(regionToBounds(region), 0);
      },

      animateCamera: (camera) => {
        const map = mapInstanceRef.current;
        if (!map) return;
        // moveCamera faz update PARCIAL — propriedades omitidas mantem o
        // valor atual. E' o que o modo navegacao espera: quando o heading
        // vem null (bussola sem leitura), o mapa NAO deve girar pro norte.
        const patch: google.maps.CameraOptions = {};
        if (camera.center) patch.center = toLatLngLiteral(camera.center);
        if (camera.zoom != null) patch.zoom = camera.zoom;
        if (camera.heading != null) patch.heading = camera.heading;
        if (camera.pitch != null) patch.tilt = camera.pitch;
        map.moveCamera(patch);
      },

      getMapInstance: () => mapInstanceRef.current,
    }),
    [ctx],
  );

  useImperativeHandle(ref, () => handle, [handle]);

  // `mapRef` (callback-prop do react-native-map-clustering) so entrega o
  // handle quando ele existe de fato — entregar antes faria o App guardar
  // uma referencia cujos metodos ainda nao alcancam o mapa.
  const mapRefCb = useRef(mapRef);
  mapRefCb.current = mapRef;
  useEffect(() => {
    mapRefCb.current?.(handle);
    return () => mapRefCb.current?.(null);
  }, [handle]);

  const setContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
  }, []);

  return (
    <View style={style} onLayout={onLayout}>
      {/* O mapa vive num div nativo. `position:absolute` + inset 0 preenche a
          View do react-native-web sem depender de flex no elemento DOM. */}
      <div
        ref={setContainer}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {!ctx && !error && (
        <View style={mapStyles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      {error && (
        <View style={mapStyles.overlay}>
          <Text style={mapStyles.errorTitle}>Mapa indisponível</Text>
          <Text style={mapStyles.errorBody}>{error}</Text>
        </View>
      )}

      {/* Overlays so montam depois do mapa pronto: cada um precisa da
          instancia pra se registrar, e sem ela ficariam em estado invalido. */}
      {ctx && <MapChildContext.Provider value={ctx}>{children}</MapChildContext.Provider>}
    </View>
  );
});

const mapStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--surface-2)',
    padding: 24,
  },
  errorTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  errorBody: { fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' },
});

export default MapViewInner;
