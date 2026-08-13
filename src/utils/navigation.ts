import { Alert } from '../components/Alert';

export type TravelMode = 'driving' | 'walking';

interface NavigationParams {
  latitude: number;
  longitude: number;
  clientName: string;
  travelMode: TravelMode;
}

/**
 * Abre uma URL em aba nova.
 *
 * SINCRONA de proposito. O navegador so permite abrir aba se a chamada
 * acontecer dentro do gesto do usuario; qualquer `await` antes do
 * window.open quebra essa janela e o bloqueador de pop-up mata a aba
 * silenciosamente. Por isso toda a montagem de URL aqui e' sincrona — foi
 * exatamente o que o fluxo antigo fazia errado ao chamar
 * `await Linking.canOpenURL(...)` antes de abrir.
 *
 * `_blank` em vez de trocar a location: no PWA instalado, navegar pra fora
 * descarregaria o app e o vendedor perderia a rota do dia carregada.
 */
function openInNewTab(url: string): boolean {
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  return win !== null;
}

/**
 * Monta a URL universal de rota do Google Maps.
 *
 * Este mesmo link resolve os tres casos sem precisar detectar plataforma:
 * no Android o sistema entrega pro app do Google Maps, no iOS o Safari
 * oferece abrir no app, e no desktop abre o Maps web.
 */
function directionsUrl(destination: string, travelMode: TravelMode, origin?: string | null) {
  const params = new URLSearchParams();
  params.set('api', '1');
  if (origin) params.set('origin', origin);
  params.set('destination', destination);
  params.set('travelmode', travelMode);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Abre o Google Maps com rota tracada ate as coordenadas do cliente. */
export const openGoogleMaps = ({ latitude, longitude, travelMode }: NavigationParams) => {
  const ok = openInNewTab(directionsUrl(`${latitude},${longitude}`, travelMode));
  if (!ok) {
    Alert.alert(
      'Pop-up bloqueado',
      'O navegador impediu a abertura do Google Maps. Libere pop-ups para este site e tente de novo.',
    );
  }
};

/**
 * Mantido por compatibilidade com quem ainda importa este nome.
 *
 * No navegador nao ha como abrir o Apple Maps de forma confiavel: o esquema
 * `maps://` so funciona no iOS e nao ha API pra saber se ele existe
 * (`canOpenURL` responde true pra tudo na web). O link universal do Google ja
 * cobre o iOS — o proprio sistema oferece abrir no app de mapas instalado.
 */
export const openAppleMaps = openGoogleMaps;

interface MultiStopParams {
  origin?: { latitude: number; longitude: number } | null; // GPS atual; se null, Maps usa o primeiro stop como origem
  stops: Array<{ latitude: number; longitude: number }>; // na ordem otimizada
  travelMode?: TravelMode;
}

/**
 * Abre o Google Maps com a ROTA INTEIRA (multi-stop) na ordem que o app
 * otimizou. origin = GPS atual; destination = ultimo stop; waypoints = os
 * intermediarios na ordem certa.
 */
export const openMultiStopNavigation = ({
  origin,
  stops,
  travelMode = 'driving',
}: MultiStopParams) => {
  if (stops.length === 0) {
    Alert.alert('Rota vazia', 'Nenhum destino pra abrir no Maps.');
    return;
  }

  // O Maps aceita ate ~10 paradas no total (destination + 9 waypoints).
  const MAX_TOTAL = 10;
  const used = stops.slice(0, MAX_TOTAL);
  const truncated = stops.length > MAX_TOTAL;

  const dest = used[used.length - 1];
  const middle = used.slice(0, -1);

  const params = new URLSearchParams();
  params.set('api', '1');
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
  params.set('destination', `${dest.latitude},${dest.longitude}`);
  if (middle.length > 0) {
    params.set('waypoints', middle.map((p) => `${p.latitude},${p.longitude}`).join('|'));
  }
  params.set('travelmode', travelMode);
  // Abre direto em "iniciar navegacao" quando o app do Maps esta instalado,
  // em vez de so mostrar a previa da rota.
  params.set('dir_action', 'navigate');

  const ok = openInNewTab(`https://www.google.com/maps/dir/?${params.toString()}`);

  if (!ok) {
    Alert.alert(
      'Pop-up bloqueado',
      'O navegador impediu a abertura do Google Maps. Libere pop-ups para este site e tente de novo.',
    );
    return;
  }

  if (truncated) {
    Alert.alert(
      'Rota truncada no Maps',
      `O Google Maps aceita ate ${MAX_TOTAL} paradas. As ultimas ${stops.length - MAX_TOTAL} ficaram de fora — visite manualmente depois.`,
    );
  }
};

/** Abre a navegacao ate um destino unico. */
export const openNavigation = (params: NavigationParams) => {
  openGoogleMaps(params);
};
