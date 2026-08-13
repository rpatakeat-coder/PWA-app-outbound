import { registerRootComponent } from 'expo';

import App from './App';
import { initTheme } from './src/theme';
import { registerServiceWorker } from './src/utils/updates';

// Antes de montar o app: aplica o tema salvo direto no <html>. Se ficasse pra
// depois do primeiro render, a tela abriria clara e piscaria pra escura.
initTheme();

// registerRootComponent monta o App no #root do public/index.html.
registerRootComponent(App);

// Service worker: entrega de versao nova (no lugar do OTA do expo-updates) e
// casca offline. Registrado depois do mount pra nao competir com o primeiro
// paint — o SW so importa a partir da SEGUNDA visita mesmo.
registerServiceWorker();
