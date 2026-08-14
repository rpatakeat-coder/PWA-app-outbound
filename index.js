import { registerRootComponent } from 'expo';

import App from './App';
import { BarreiraDeErro } from './src/components/BarreiraDeErro';
import { initTheme } from './src/theme';
import { registerServiceWorker } from './src/utils/updates';

// Antes de montar o app: aplica o tema salvo direto no <html> e arma o
// acompanhamento da preferencia do aparelho. Se ficasse pra depois do primeiro
// render, a tela abriria clara e piscaria pra escura.
initTheme();

// Erro de renderizacao NAO pode virar tela preta.
//
// Sem barreira, o React desmonta a arvore inteira e sobra o `body`, que no tema
// escuro e' quase preto. Foi exatamente o que aconteceu em 14/08/2026 e custou
// uma investigacao inteira, porque o vendedor em campo nao tinha o que
// reportar. Ver src/components/BarreiraDeErro.tsx.
const AppProtegido = () => (
  <BarreiraDeErro>
    <App />
  </BarreiraDeErro>
);

// registerRootComponent monta no #root do public/index.html.
registerRootComponent(AppProtegido);

// Service worker: entrega de versao nova (no lugar do OTA do expo-updates) e
// casca offline. Registrado depois do mount pra nao competir com o primeiro
// paint — o SW so importa a partir da SEGUNDA visita mesmo.
registerServiceWorker();
