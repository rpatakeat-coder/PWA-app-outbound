/* eslint-env serviceworker */
// Service worker do Takeat RPA.
//
// Faz dois papeis:
//  1. Canal de atualizacao — substitui o OTA do expo-updates. Cada build
//     reescreve BUILD_VERSION (ver scripts/build-web.js), o que muda os bytes
//     deste arquivo; e' isso que faz o browser detectar versao nova. Sem o
//     carimbo o sw.js seria byte-identico entre deploys e NENHUM update
//     chegaria aos vendedores.
//  2. Casca offline — o app abre e mostra a interface mesmo sem rede (comum
//     em campo, dentro de estabelecimento). Os DADOS continuam exigindo rede;
//     ver a regra de same-origin abaixo.

const BUILD_VERSION = '__BUILD_VERSION__';
const CACHE = `takeat-rpa-${BUILD_VERSION}`;

// Casca minima. Os bundles JS tem nome com hash gerado no build, entao nao da
// pra lista-los aqui — eles entram no cache sob demanda (stale-while-revalidate).
const SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Sem catch, UMA url que falhe aborta o install inteiro e o app fica
      // sem service worker nenhum.
      .then((cache) => cache.addAll(SHELL).catch((err) => console.warn('[SW] precache:', err))),
  );
  // De proposito SEM skipWaiting: quem decide a hora de trocar de versao e' o
  // app (utils/updates.ts), pra a troca acontecer junto com o reload e nao no
  // meio de um cadastro sendo preenchido.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('takeat-rpa-') && k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Tudo que e' de outro dominio passa direto, SEM cache:
  //   - Supabase (leads, visitas, reunioes): dado de venda cacheado e' pior
  //     que dado ausente — o vendedor agiria sobre uma etapa desatualizada.
  //   - Google Maps: os tiles ja tem cache proprio do browser, e cachear
  //     resposta opaca aqui so incharia o storage sem ganho.
  //   - Nominatim / OSRM / BrasilAPI / ViaCEP: respostas pontuais de consulta.
  if (url.origin !== self.location.origin) return;

  // Navegacao (abrir/recarregar o app): rede primeiro pra pegar a versao mais
  // nova; se estiver offline, serve a casca do cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match('/', { ignoreSearch: true });
          return cached ?? Response.error();
        }),
    );
    return;
  }

  // Estaticos do proprio dominio (JS/CSS/imagens): stale-while-revalidate —
  // responde na hora do cache e atualiza em segundo plano. E' o que mantem a
  // abertura rapida em 4G ruim.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);

      const network = fetch(req)
        .then((res) => {
          // Só guarda resposta completa e valida. `res.ok` exclui 404/500;
          // type 'basic' exclui opaca (que nao da pra validar).
          if (res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network);
        return cached;
      }

      const res = await network;
      return res ?? Response.error();
    }),
  );
});
