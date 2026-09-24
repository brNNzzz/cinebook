/**
 * CineBook - Service Worker
 * ---------------------------------------------------------------------------
 * Estratégias por tipo de recurso:
 *
 *   Navegação (páginas)   -> network-first, cai pro cache, depois offline.html
 *   JS / CSS / JSON       -> network-first (deploy novo aparece na hora; o
 *                            cache só entra quando estiver offline)
 *   Outros estáticos      -> stale-while-revalidate (ícones, logo...)
 *   API do TMDb           -> network-first (nunca serve catálogo velho de cara)
 *                            — tanto direto quanto pelo proxy /tmdb-api/
 *   Imagens do TMDb       -> cache-first com teto de entradas
 *   Fontes / bandeiras    -> cache-first
 *   Qualquer outra origem -> passa direto, o SW não intercepta
 *
 * IMPORTANTE: a lista de pré-cache é tolerante a falhas. Se um arquivo listado
 * aqui não existir no servidor (renomeado, removido, página nova ainda não
 * listada), a instalação NÃO quebra — aquele recurso apenas não fica offline.
 * ---------------------------------------------------------------------------
 */

const VERSION = 'v1.1.0';

const CACHE_SHELL = `cinebook-shell-${VERSION}`;
const CACHE_STATIC = `cinebook-static-${VERSION}`;
const CACHE_API = `cinebook-api-${VERSION}`;
const CACHE_IMG = `cinebook-img-${VERSION}`;
const CACHE_FONTS = `cinebook-fonts-${VERSION}`;

const CURRENT_CACHES = [
  CACHE_SHELL,
  CACHE_STATIC,
  CACHE_API,
  CACHE_IMG,
  CACHE_FONTS,
];

const OFFLINE_URL = '/offline.html';

/**
 * Páginas do app. Cada item é uma lista de candidatos: o SW tenta o primeiro,
 * e se der 404 tenta o próximo. Isso faz funcionar tanto na Hostinger (onde o
 * .htaccess serve URLs limpas: /login) quanto num servidor estático simples
 * (onde só /login.html existe).
 */
const PAGE_CANDIDATES = [
  ['/', '/index.html'],
  ['/detalhes', '/detalhes.html'],
  ['/login', '/login.html'],
  ['/cadastro', '/cadastro.html'],
  ['/perfil', '/perfil.html'],
];

/** Estáticos essenciais. Ausências são ignoradas silenciosamente. */
const STATIC_ASSETS = [
  '/css/styles.css',
  '/js/i18n.js',
  '/js/data.js',
  '/js/tmdb.js',
  '/js/app.js',
  '/js/details.js',
  '/js/pwa.js',
  '/assets/logo.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/manifest.json',
  OFFLINE_URL,
];

/** Teto de pôsteres guardados. Acima disso, os mais antigos saem. */
const IMG_CACHE_LIMIT = 250;
const API_CACHE_LIMIT = 120;

// ===========================================================================
// Utilidades
// ===========================================================================

/**
 * Normaliza o caminho de uma página para uma chave única de cache.
 * /index.html -> /   |   /login.html -> /login   |   /login/ -> /login
 * A query string é descartada de propósito: detalhes.html?id=123 e
 * detalhes.html?id=456 compartilham o mesmo "casco" HTML.
 */
function pageKey(url) {
  let p = new URL(url).pathname;
  p = p.replace(/\/index\.html$/i, '/');
  p = p.replace(/\.html$/i, '');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p === '' ? '/' : p;
}

/**
 * Remove a flag "redirected" de uma resposta.
 * O .htaccess da Hostinger devolve 301 de /index.html para /. Guardar essa
 * resposta redirecionada no cache e devolvê-la numa navegação quebra com
 * "a redirected response was used for a request whose redirect mode is not
 * follow". Reconstruir a Response a partir do corpo limpa essa flag.
 */
async function cleanResponse(response) {
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Mantém um cache dentro de um teto de entradas (FIFO). */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

// ===========================================================================
// Install - pré-cache tolerante a falhas
// ===========================================================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(CACHE_SHELL);

      // Páginas: tenta cada candidato até um responder OK.
      await Promise.all(
        PAGE_CANDIDATES.map(async (candidates) => {
          for (const path of candidates) {
            try {
              const res = await fetch(path, {
                cache: 'reload',
                redirect: 'follow',
              });
              if (!res || !res.ok) continue;
              const clean = await cleanResponse(res);
              await shell.put(pageKey(new URL(path, self.location.origin)), clean);
              return;
            } catch (_) {
              /* tenta o próximo candidato */
            }
          }
          console.warn('[SW] página não pré-cacheada:', candidates[0]);
        })
      );

      const statics = await caches.open(CACHE_STATIC);
      await Promise.all(
        STATIC_ASSETS.map(async (path) => {
          try {
            const res = await fetch(path, { cache: 'reload' });
            if (res && res.ok) await statics.put(path, await cleanResponse(res));
          } catch (_) {
            console.warn('[SW] estático não pré-cacheado:', path);
          }
        })
      );
    })()
  );
});

// ===========================================================================
// Activate - limpa versões antigas
// ===========================================================================

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('cinebook-') && !CURRENT_CACHES.includes(n))
          .map((n) => caches.delete(n))
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (_) {}
      }
      await self.clients.claim();
    })()
  );
});

// ===========================================================================
// Mensagens vindas da página (js/pwa.js)
// ===========================================================================

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ===========================================================================
// Estratégias
// ===========================================================================

/** Navegação: rede primeiro, cache depois, offline.html por último. */
async function handleNavigation(event) {
  const key = pageKey(event.request.url);
  try {
    const preload = await event.preloadResponse;
    const fresh = preload || (await fetch(event.request));
    if (fresh && fresh.ok) {
      const clean = await cleanResponse(fresh.clone());
      const shell = await caches.open(CACHE_SHELL);
      await shell.put(key, clean.clone());

      // O .htaccess da Hostinger redireciona /login.html -> /login (301).
      // Uma resposta marcada como "redirected" não pode ser devolvida direto
      // numa navegação: o navegador recusa com erro de rede. A cópia limpa
      // não carrega essa marca, então é ela que vai para a tela.
      if (fresh.redirected) return clean;
    }
    return fresh;
  } catch (_) {
    // Offline: tenta a própria página em cache.
    // Se ela não estiver lá (rota nova, link quebrado, 404), mostra a página
    // offline em vez de devolver a home — devolver a home deixaria a barra de
    // endereço dizendo uma coisa e a tela mostrando outra.
    const shell = await caches.open(CACHE_SHELL);
    const cached = await shell.match(key);
    if (cached) return cached;
    const statics = await caches.open(CACHE_STATIC);
    const offline = await statics.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response('Você está offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Estáticos: devolve do cache na hora e atualiza em segundo plano. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (res) => {
      if (res && res.ok) await cache.put(request, await cleanResponse(res.clone()));
      return res;
    })
    .catch(() => null);

  if (cached) return cached;

  const fresh = await network;
  if (fresh) return fresh;
  throw new Error('Recurso indisponível offline: ' + request.url);
}

/**
 * Rede primeiro. Só usa cache se a rede falhar (offline) ou passar do tempo
 * limite — assim uma conexão travada não deixa a página esperando pra sempre.
 */
async function networkFirst(request, cacheName, limit, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const networkPromise = fetch(request);
    const fresh = timeoutMs
      ? await Promise.race([
          networkPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
        ])
      : await networkPromise;
    if (fresh && fresh.ok) {
      await cache.put(request, await cleanResponse(fresh.clone()));
      if (limit) trimCache(cacheName, limit);
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.url.includes('/js/') || request.url.includes('/css/') });
    if (cached) return cached;
    throw err;
  }
}

/** Imagens e fontes: cache primeiro, rede só na primeira vez. */
async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const fresh = await fetch(request);
  if (fresh && (fresh.ok || fresh.type === 'opaque')) {
    await cache.put(request, fresh.clone());
    if (limit) trimCache(cacheName, limit);
  }
  return fresh;
}

// ===========================================================================
// Roteador de fetch
// ===========================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só GET. POST de login/cadastro etc. passa direto.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Só http(s). Ignora chrome-extension:, data:, etc.
  if (!url.protocol.startsWith('http')) return;

  // Navegações (abrir/atualizar uma página)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  const host = url.hostname;

  // ---- API do TMDb: sempre tenta a rede primeiro ----
  if (host === 'api.themoviedb.org') {
    event.respondWith(networkFirst(request, CACHE_API, API_CACHE_LIMIT));
    return;
  }

  // ---- Pôsteres e backdrops do TMDb ----
  if (host === 'image.tmdb.org') {
    event.respondWith(cacheFirst(request, CACHE_IMG, IMG_CACHE_LIMIT));
    return;
  }

  // ---- Fontes do Google e bandeiras do seletor de idioma ----
  if (
    host === 'fonts.googleapis.com' ||
    host === 'fonts.gstatic.com' ||
    host === 'flagcdn.com'
  ) {
    event.respondWith(cacheFirst(request, CACHE_FONTS, null));
    return;
  }

  // ---- Proxy do TMDb no próprio domínio (Netlify: /tmdb-api/*) ----
  if (url.origin === self.location.origin && url.pathname.startsWith('/tmdb-api/')) {
    event.respondWith(networkFirst(request, CACHE_API, API_CACHE_LIMIT));
    return;
  }

  // ---- Código e estilo do próprio site: sempre a versão publicada ----
  // Antes era stale-while-revalidate: depois de um deploy, quem já tinha
  // visitado continuava rodando o JavaScript antigo até recarregar de novo.
  if (url.origin === self.location.origin && /\.(js|css|json)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, CACHE_STATIC, null, 6000));
    return;
  }

  // ---- Outros estáticos do próprio site (ícones, imagens) ----
  if (url.origin === self.location.origin) {
    event.respondWith(
      staleWhileRevalidate(request, CACHE_STATIC).catch(() => fetch(request))
    );
    return;
  }

  // ---- Qualquer outra origem (YouTube, Netflix, backend Python, etc.) ----
  // Não intercepta: deixa o navegador lidar, inclusive com os erros.
});
