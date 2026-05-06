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
