import { registerRootComponent } from 'expo';

import App from './App';
import { registerServiceWorker } from './src/utils/updates';

// registerRootComponent monta o App no #root do public/index.html.
registerRootComponent(App);

// Service worker: entrega de versao nova (no lugar do OTA do expo-updates) e
// casca offline. Registrado depois do mount pra nao competir com o primeiro
// paint — o SW so importa a partir da SEGUNDA visita mesmo.
registerServiceWorker();
