/* eslint-env serviceworker */
// Service worker do APP Field Sales.
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

// P#2 (desempenho, 02/10/26): o código desta versão, listado pelo build
// (scripts/build-web.js troca o comentário abaixo pela lista de _expo/static).
// A versão nova baixa o bundle ENQUANTO espera, antes do SKIP_WAITING — antes, a
// primeira abertura depois de cada deploy baixava 1,9 MB de novo, já com o app na mão.
// Fora do build (dev) a lista fica vazia e nada muda.
const PRECODIGO = [/* __PRECODIGO__ */];

// Mesma regra do fetch: código que chega como HTML (a borda ainda na versão antiga
// reescreve para o index.html com 200) NÃO é guardado — foi a tela branca de 26/09.
async function guardarCodigo(cache, url) {
  try {
    const res = await fetch(url, { cache: 'reload' });
    const tipo = res.headers.get('content-type') || '';
    if (res.ok && res.type === 'basic' && !tipo.includes('text/html')) await cache.put(url, res);
  } catch (e) { /* sem rede: entra sob demanda, como antes */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Sem catch, UMA url que falhe aborta o install inteiro e o app fica
      // sem service worker nenhum.
      .then(async (cache) => {
        await cache.addAll(SHELL).catch((err) => console.warn('[SW] precache:', err));
        await Promise.all(PRECODIGO.map((url) => guardarCodigo(cache, url)));
      }),
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

// 3. A FILA VAI ATÉ O EXECUTIVO (handoff Tarefas do App, P6, 17/10/2026). O aviso chega cifrado
//    pela Edge push-fila; o navegador já entrega o JSON: { titulo, texto, tag, url, acoes: [{acao, titulo, url}] }.
//    Android mostra até 2 botões; no iPhone (só com o app instalado) não há botão: o toque abre a url.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { titulo: 'Takeat', texto: event.data ? event.data.text() : '' }; }
  const acoes = Array.isArray(d.acoes) ? d.acoes.filter((a) => a && a.acao && a.titulo).slice(0, 2) : [];
  event.waitUntil(self.registration.showNotification(d.titulo || 'Sua fila', {
    body: d.texto || '',
    tag: d.tag || 'fila',
    renotify: true,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: d.url || '/?fila=fila&origem=push', acoes },
    actions: acoes.map((a) => ({ action: a.acao, title: a.titulo })),
  }));
});

// O toque leva ao app: com uma janela aberta, ela vem para a frente e recebe a ação (o app trata
// a url como faria na abertura); sem janela, abre o app já na url. "fechar" só fecha.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const dados = event.notification.data || {};
  if (event.action === 'fechar') return;
  const escolhida = (dados.acoes || []).find((a) => a.acao === event.action);
  const alvo = new URL((escolhida && escolhida.url) || dados.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const doApp = janelas.find((c) => new URL(c.url).origin === self.location.origin && !new URL(c.url).pathname.startsWith('/gestao'));
    if (doApp) {
      await doApp.focus();
      doApp.postMessage({ type: 'FILA_ACAO', url: alvo });
      return;
    }
    await self.clients.openWindow(alvo);
  })());
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
  // SINAL FRACO (auditoria de velocidade, 28/09/2026): a rede não tinha prazo — no 4G
  // ruim a abertura esperava até a conexão desistir, e só então caía na casca. Agora,
  // com casca guardada, espera no máximo 3 s; a rede continua e atualiza a casca por baixo.
  if (req.mode === 'navigate') {
    const rede = fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
      }
      return res;
    });
    event.respondWith(
      (async () => {
        const cached = await caches.match('/', { ignoreSearch: true });
        if (!cached) return rede.catch(() => Response.error());
        const prazo = new Promise((ok) => setTimeout(() => ok(null), 3000));
        const venceu = await Promise.race([rede.catch(() => null), prazo]);
        return venceu || cached;
      })(),
    );
    event.waitUntil(rede.catch(() => null));
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
