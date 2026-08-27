// Carregador do Google Maps JS pro cockpit.
//
// O cockpit e' React puro (sem o shim react-native-maps do app de campo),
// entao fala com a API do Google direto. Reusa as MESMAS variaveis de ambiente
// do app (EXPO_PUBLIC_*, liberadas no vite.config via envPrefix): uma chave,
// um Map ID, configurados uma vez na Vercel pros dois produtos.
let promessa: Promise<any> | null = null;

export const MAP_ID = (import.meta as any).env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined;

export function carregarGoogleMaps(): Promise<any> {
  if (promessa) return promessa;
  const chave = (import.meta as any).env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  promessa = new Promise((resolve, reject) => {
    if (!chave) {
      reject(new Error('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY não configurada para o build do cockpit.'));
      return;
    }
    if ((window as any).google?.maps) { resolve((window as any).google.maps); return; }
    const s = document.createElement('script');
    // loading=async e' o carregamento recomendado; libraries=marker traz o
    // AdvancedMarkerElement (exige Map ID pra estilizacao).
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(chave)}&libraries=marker&loading=async&callback=__cockpitMapsPronto`;
    (window as any).__cockpitMapsPronto = () => resolve((window as any).google.maps);
    s.onerror = () => reject(new Error('Não consegui carregar o Google Maps.'));
    document.head.appendChild(s);
  });
  return promessa;
}
