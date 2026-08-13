// <Marker> compativel com react-native-maps sobre AdvancedMarkerElement.
//
// O ponto central: os pins do app NAO sao icones — sao componentes React
// completos (<CustomMarker> com logo, badge de reuniao, badge de Conta Alvo;
// <RouteMarker> com o numero da parada). Preservar isso e' o que evita
// redesenhar toda a identidade visual dos pins.
//
// Como funciona: criamos UM <div> por marker e o entregamos como `content` do
// AdvancedMarkerElement. Os filhos React sao renderizados dentro dele por
// portal. O div e' estavel durante toda a vida do marker, entao o portal
// sobrevive a tudo que o clusterer faz (adicionar/remover do mapa ao
// agrupar e desagrupar no zoom).
import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useMapContext } from './context';
import type { LatLng } from './geo';

export interface MarkerProps {
  coordinate: LatLng;
  children?: React.ReactNode;
  onPress?: () => void;
  zIndex?: number;
  /** Ponto do conteudo que encosta na coordenada. (0,0)=topo-esq, (1,1)=base-dir. */
  anchor?: { x: number; y: number };
  rotation?: number;
  /** Pin padrao quando nao ha filhos (EditLocationModal usa pra marcar o local atual). */
  pinColor?: string;
  title?: string;
  /** `false` mantem o pin fora do clustering. */
  cluster?: boolean;

  /**
   * Aceitas e ignoradas — existiam so por causa do render nativo:
   * `tracksViewChanges`/`onLayout` controlavam o snapshot da view no iOS
   * (bug do pin invisivel), e `flat` impedia o pin de tombar com o pitch.
   * No DOM o conteudo e' sempre ao vivo e sempre de frente pra camera.
   */
  tracksViewChanges?: boolean;
  onLayout?: () => void;
  flat?: boolean;
}

export default function Marker({
  coordinate,
  children,
  onPress,
  zIndex,
  anchor,
  rotation,
  pinColor,
  title,
  cluster = true,
}: MarkerProps) {
  const ctx = useMapContext();

  // Div estavel: criado uma vez e reaproveitado. Recriar a cada render
  // arrancaria o conteudo do portal do DOM a cada frame.
  const contentRef = useRef<HTMLDivElement | null>(null);
  if (contentRef.current === null && typeof document !== 'undefined') {
    contentRef.current = document.createElement('div');
  }

  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  // Em ref: o listener de clique e' registrado uma vez na criacao do marker,
  // mas `onPress` e' recriado a cada render do pai. Sem a ref, o listener
  // ficaria preso na primeira versao do callback.
  const pressRef = useRef(onPress);
  pressRef.current = onPress;

  const ax = anchor?.x ?? 0.5;
  // Default do react-native-maps: base-centro. Combina com o desenho dos pins
  // do app, que tem uma seta apontando pra baixo.
  const ay = anchor?.y ?? 1;

  const transform = useMemo(() => {
    // O AdvancedMarkerElement ja encosta a BASE-CENTRO do conteudo na
    // coordenada. Daqui pra frente e' so o deslocamento relativo a isso:
    // ancorar no centro (ay=0.5) pede empurrar meia altura pra baixo.
    const tx = (0.5 - ax) * 100;
    const ty = (1 - ay) * 100;
    const rot = rotation ? ` rotate(${rotation}deg)` : '';
    return `translate(${tx}%, ${ty}%)${rot}`;
  }, [ax, ay, rotation]);

  // ---- Cria e registra o marker ----
  useEffect(() => {
    const content = contentRef.current;
    if (!ctx || !content) return;

    // Sem filhos: pin classico da Google, tingido com pinColor.
    if (!children && pinColor) {
      const pin = new ctx.maps.marker.PinElement({
        background: pinColor,
        borderColor: '#ffffff',
        glyphColor: '#ffffff',
      });
      content.replaceChildren(pin.element);
    }

    const marker = new ctx.maps.marker.AdvancedMarkerElement({
      position: { lat: coordinate.latitude, lng: coordinate.longitude },
      content,
      zIndex,
      title,
      // Obrigatorio pra o marker receber clique: o padrao e' false, e nesse
      // modo a Google marca o conteudo como inerte a ponteiro — um listener
      // de DOM no proprio conteudo nunca chega a disparar.
      gmpClickable: true,
    });
    markerRef.current = marker;

    // `gmp-click` e' o evento oficial do AdvancedMarkerElement. Escutar aqui
    // (e nao um 'click' de DOM no conteudo) e' o que funciona com o
    // clustering: o marker e' removido e readicionado ao mapa ao agrupar e
    // desagrupar, e o listener acompanha a instancia, nao o no do DOM.
    const clickListener = marker.addListener('gmp-click', () => {
      pressRef.current?.();
    });

    const unregister = ctx.registerMarker(marker, cluster);

    return () => {
      clickListener.remove();
      unregister();
      markerRef.current = null;
    };
    // `cluster` fora das deps de proposito: e' constante por marker no app
    // (rota e seta do usuario sempre false, leads sempre true). Incluir faria
    // o marker ser destruido e recriado a toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // ---- Atualizacoes sem recriar o marker ----
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.position = { lat: coordinate.latitude, lng: coordinate.longitude };
    }
  }, [coordinate.latitude, coordinate.longitude]);

  useEffect(() => {
    if (markerRef.current && zIndex != null) markerRef.current.zIndex = zIndex;
  }, [zIndex]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.style.transform = transform;
  }, [transform]);

  if (!contentRef.current || !children) return null;
  return createPortal(children, contentRef.current);
}
