// "Puxa a versao nova e reinicia o app ja" — agora sobre o service worker do
// PWA, no lugar do OTA do expo-updates (que so existe em build nativo).
//
// O paralelo e' direto: onde o EAS entregava um bundle JS novo, aqui o
// service worker registra um build novo e fica "waiting"; mandar ele assumir
// o controle e recarregar produz o mesmo efeito de ponta a ponta — inclusive
// pro gatilho remoto via tabela `app_force_reload` (ver useForceReload).

const SW_URL = '/sw.js';

/** Evita dois reloads em sequencia se dois gatilhos dispararem juntos. */
let reloading = false;

/**
 * Registra o service worker e arma o reload automatico.
 * Chamar uma vez no boot (index.js).
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // Na PRIMEIRA visita nao ha controller: o clients.claim() do service worker
  // recem-instalado dispara controllerchange mesmo assim. Recarregar ali
  // faria toda primeira abertura piscar duas vezes. Guardamos o estado
  // inicial pra so recarregar em troca de versao de verdade.
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register(SW_URL).catch((err) => {
    console.warn('[SW] registro falhou:', err);
  });

  // `controllerchange` dispara quando o SW novo assume. Nesse instante os
  // assets em cache ja sao os da versao nova — recarregar aqui e' o que
  // efetivamente troca a versao na tela do vendedor.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/**
 * Checa se ha versao nova publicada e, se houver, ativa e recarrega.
 *
 * Retorna true quando disparou a troca (a pagina vai recarregar em seguida);
 * false quando ja estava atualizado ou nao deu pra checar. Erros sao
 * silenciados de proposito — uma falha de rede aqui nao pode derrubar o app.
 */
export async function checkAndReloadIfUpdateAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;

    // Vai ao servidor conferir se o sw.js mudou. Se mudou, o browser instala
    // o novo em segundo plano e o deixa em `waiting`.
    await registration.update();

    const waiting = registration.waiting;
    if (!waiting) return false;

    // Sem isso o SW novo so assumiria quando TODAS as abas fossem fechadas —
    // o vendedor ficaria na versao velha o dia inteiro.
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  } catch (err) {
    console.warn('[SW] check/update falhou:', err);
    return false;
  }
}
