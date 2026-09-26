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

  // /gestao e' outro front (o cockpit), de mesa e sempre com rede: passa direto,
  // SEM cache. Antes, a navegacao para /gestao caia no ramo abaixo e era gravada
  // na chave '/' — o proximo vendedor offline abria a casca da GESTAO no lugar
  // do mapa, e a gestao podia ser servida velha do cache de estaticos.
  if (url.pathname === '/gestao' || url.pathname.startsWith('/gestao/')) return;

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
  // HTML NO LUGAR DE CÓDIGO (26/09/2026, app em branco medido na produção):
  // na troca de deploy, um bundle novo pedido a uma borda ainda na versão
  // antiga cai na reescrita "/(.*) -> /index.html" e volta como HTML com 200 e
  // o cache "immutable" de 1 ano do /_expo/static. Guardado, o app abria em
  // branco para sempre — nem a revalidação curava, porque o cache HTTP do
  // navegador devolvia o mesmo HTML. Agora: código que chega como HTML não é
  // guardado, o que já estava guardado é apagado, e a busca é refeita pulando
  // o cache do navegador.
  const esperaCodigo = req.destination === 'script' || req.destination === 'style' || /\.(m?js|css)$/.test(url.pathname);
  const ehHtml = (res) => (res.headers.get('content-type') || '').includes('text/html');
  const valido = (res) => !!res && res.ok && res.type === 'basic' && !(esperaCodigo && ehHtml(res));

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      let cached = await cache.match(req);
      if (cached && esperaCodigo && ehHtml(cached)) {
        await cache.delete(req);
        cached = undefined;
      }

      const network = fetch(req)
        .then(async (res) => {
          // Só guarda resposta completa e valida. `res.ok` exclui 404/500;
          // type 'basic' exclui opaca (que nao da pra validar).
          if (valido(res)) { cache.put(req, res.clone()); return res; }
          if (esperaCodigo) {
            const sep = req.url.includes('?') ? '&' : '?';
            const de_novo = await fetch(req.url + sep + 'sw=' + Date.now(), { cache: 'reload' }).catch(() => null);
            if (valido(de_novo)) { cache.put(req, de_novo.clone()); return de_novo; }
          }
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
