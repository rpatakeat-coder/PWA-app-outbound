import { Linking, Platform, Alert } from 'react-native';

export type TravelMode = 'driving' | 'walking';

interface NavigationParams {
  latitude: number;
  longitude: number;
  clientName: string;
  travelMode: TravelMode;
}

/**
 * Abre Google Maps com rota traçada até as coordenadas do cliente
 */
export const openGoogleMaps = async ({
  latitude,
  longitude,
  clientName,
  travelMode,
}: NavigationParams) => {
  const travelModeParam = travelMode === 'driving' ? 'driving' : 'walking';
  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=${travelModeParam}`;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Fallback para web
      await Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`);
    }
  } catch (error) {
    Alert.alert('Erro', 'Não foi possível abrir o Google Maps');
    console.warn('Erro ao abrir Google Maps:', error);
  }
};

/**
 * Abre Apple Maps com rota traçada até as coordenadas do cliente
 * Apenas disponível em iOS
 */
export const openAppleMaps = async ({
  latitude,
  longitude,
  clientName,
  travelMode,
}: NavigationParams) => {
  if (Platform.OS !== 'ios') {
    Alert.alert('Aviso', 'Apple Maps está disponível apenas no iOS');
    return;
  }

  // dirflg: d (driving), w (walking), t (transit), r (rideshare)
  const dirflg = travelMode === 'driving' ? 'd' : 'w';
  const url = `maps://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=${dirflg}`;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Aviso', 'Apple Maps não está disponível neste dispositivo');
    }
  } catch (error) {
    Alert.alert('Erro', 'Não foi possível abrir o Apple Maps');
    console.warn('Erro ao abrir Apple Maps:', error);
  }
};

interface MultiStopParams {
  origin?: { latitude: number; longitude: number } | null; // GPS atual; se null, Maps usa o primeiro stop como origem
  stops: Array<{ latitude: number; longitude: number }>;   // na ordem otimizada
  travelMode?: TravelMode;
}

/**
 * Abre Google Maps com a ROTA INTEIRA (multi-stop) já planejada na ordem
 * que o app otimizou. Origin = GPS do usuario; destination = ultimo stop;
 * waypoints = stops intermediarios na ordem certa.
 *
 * Google Maps web API suporta ate ~9 waypoints. Acima disso, truncamos
 * (improvavel chegar nesse limite com rotas de campo de ate 30 stops,
 * mas no caso extremo o usuario teria que rodar mais de uma rota).
 */
export const openMultiStopNavigation = async ({ origin, stops, travelMode = 'driving' }: MultiStopParams) => {
  if (stops.length === 0) {
    Alert.alert('Rota vazia', 'Nenhum destino pra abrir no Maps.');
    return;
  }

  // Maps suporta ate ~9 waypoints (10 paradas total incluindo destination)
  // — limite documentado historico. Se for mais, truncamos com aviso.
  const MAX_TOTAL = 10;
  const used = stops.slice(0, MAX_TOTAL);
  const truncated = stops.length > MAX_TOTAL;

  const origLatLon = origin ? `${origin.latitude},${origin.longitude}` : null;
  const dest = used[used.length - 1];
  const middle = used.slice(0, -1);

  const params = new URLSearchParams();
  params.set('api', '1');
  if (origLatLon) params.set('origin', origLatLon);
  params.set('destination', `${dest.latitude},${dest.longitude}`);
  if (middle.length > 0) {
    params.set('waypoints', middle.map(p => `${p.latitude},${p.longitude}`).join('|'));
  }
  params.set('travelmode', travelMode);
  // dir_action=navigate abre direto no modo "iniciar navegacao" quando
  // o app do Google Maps esta instalado (em vez de so mostrar a previa).
  params.set('dir_action', 'navigate');

  const url = `https://www.google.com/maps/dir/?${params.toString()}`;

  try {
    await Linking.openURL(url);
    if (truncated) {
      Alert.alert(
        'Rota truncada no Maps',
        `O Google Maps aceita ate ${MAX_TOTAL} paradas. As ultimas ${stops.length - MAX_TOTAL} ficaram de fora — visite manualmente depois.`,
      );
    }
  } catch (error) {
    console.warn('Erro ao abrir multi-stop:', error);
    Alert.alert('Erro', 'Nao foi possivel abrir o Google Maps com a rota.');
  }
};

/**
 * Abre aplicativo de navegação padrão (detecta automaticamente)
 * Prefere Google Maps, fallback para Apple Maps (iOS)
 */
export const openNavigation = async ({
  latitude,
  longitude,
  clientName,
  travelMode,
}: NavigationParams) => {
  if (Platform.OS === 'ios') {
    // iOS: tenta Google Maps primeiro, depois Apple Maps
    try {
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=${travelMode === 'driving' ? 'driving' : 'walking'}`;
      const canOpenGoogleMaps = await Linking.canOpenURL(googleMapsUrl);

      if (canOpenGoogleMaps) {
        await openGoogleMaps({ latitude, longitude, clientName, travelMode });
      } else {
        await openAppleMaps({ latitude, longitude, clientName, travelMode });
      }
    } catch (error) {
      console.warn('Erro ao abrir navegação:', error);
    }
  } else {
    // Android: usa Google Maps
    await openGoogleMaps({ latitude, longitude, clientName, travelMode });
  }
};
