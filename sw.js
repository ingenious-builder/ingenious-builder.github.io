// ══════════════════════════════════════════════════════════
// САЙТ ИЗ ПАМЯТИ ТЕЛЕФОНА
//
// Каждый файл сайта хранится в памяти телефона. При запуске отдаём
// копию сразу — ничего не ждём от сети (раньше каждый запуск сверялся
// с GitHub, и через медленную связь заставка висела по 10–20 секунд).
// Параллельно тихо скачиваем свежие файлы и обновляем копию: новая
// версия приложения откроется со следующего запуска.
//
// Сами данные (траты, доходы) сюда не относятся: они идут в облако
// мимо этого файла, а без сети копятся в очереди приложения.
// ══════════════════════════════════════════════════════════

'use strict';

// Имя копии менять только при обновлении самого Flutter (движок canvaskit
// должен совпадать с main.dart.js) — тогда копия соберётся заново.
const CACHE = 'traty-site-v1';

// Свой сайт и шрифты Google (Flutter иногда догружает недостающие символы).
const ALLOWED = [self.location.origin, 'https://fonts.gstatic.com', 'https://fonts.googleapis.com'];

// Движок рисования: Chrome и Android (в том числе приложение-оболочка)
// берут свою версию из canvaskit/chromium, Safari и iPhone — обычную.
const ENGINE = typeof Intl.v8BreakIterator !== 'undefined' ? 'canvaskit/chromium/' : 'canvaskit/';

// Главное для запуска — кладём в память сразу при установке,
// чтобы уже второй запуск был мгновенным целиком.
const CORE = [
  './',
  'flutter_bootstrap.js',
  'main.dart.js',
  ENGINE + 'canvaskit.js',
  ENGINE + 'canvaskit.wasm',
  'assets/FontManifest.json',
  'assets/AssetManifest.bin.json',
  'assets/fonts/MaterialIcons-Regular.otf',
  'assets/assets/fonts/Manrope.ttf',
  'manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // что уже лежит в памяти — не качаем заново; по одному, чтобы
      // отсутствие какого-то файла не мешало сохранить остальные
      await Promise.all(CORE.map(async (p) => {
        if (!(await cache.match(p))) await cache.add(new Request(p, { cache: 'no-cache' })).catch(() => {});
      }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // старые версии копии — убрать
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!ALLOWED.includes(url.origin)) return; // облако Supabase и прочее — мимо
  if (url.pathname.endsWith('.apk')) return; // файл приложения не кэшируем
  event.respondWith(fromMemory(event, req));
});

async function fromMemory(event, req) {
  const cache = await caches.open(CACHE);
  // no-cache: сверяемся с сайтом (быстрый ответ «не изменилось»), а не
  // берём из кэша браузера — иначе обновление запаздывало бы на 10 минут
  const fresh = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      return cache.put(req, res.clone()).then(() => res, () => res);
    }
    return res;
  });
  // свежая версия докачивается, даже когда страница уже открылась из копии
  event.waitUntil(fresh.catch(() => {}));

  const hit = (await cache.match(req, { ignoreSearch: true })) ||
    (req.mode === 'navigate' ? await cache.match(new URL('./', self.location).href) : undefined);
  if (hit) return hit;
  // в памяти ещё нет (самый первый запуск) — ждём сеть
  return fresh;
}
