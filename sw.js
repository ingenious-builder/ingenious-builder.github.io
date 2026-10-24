// ══════════════════════════════════════════════════════════
// САЙТ БЕЗ ИНТЕРНЕТА
//
// Каждый файл сайта при загрузке кладём в память телефона. Дальше:
// есть сеть — берём свежий файл с сайта (и обновляем копию), сети нет
// или она «висит» дольше 5 секунд — отдаём копию. Поэтому приложение
// открывается и без интернета, а обновления приходят как раньше.
//
// Сами данные (траты, доходы) сюда не относятся: они идут в облако
// мимо этого файла, а без сети копятся в очереди приложения.
// ══════════════════════════════════════════════════════════

'use strict';

const CACHE = 'traty-site-v1';

// Свой сайт и шрифты Google (Flutter иногда догружает недостающие символы).
const ALLOWED = [self.location.origin, 'https://fonts.gstatic.com', 'https://fonts.googleapis.com'];

self.addEventListener('install', () => self.skipWaiting());

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
  event.respondWith(networkFirst(req));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req);
  try {
    const res = await withTimeout(net, 5000);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    // сеть не ответила — копия; если копии нет, всё же дождёмся сети
    const hit = (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? await cache.match(new URL('./', self.location).href) : undefined) ||
      (req.mode === 'navigate' ? await cache.match(new URL('./index.html', self.location).href) : undefined);
    if (hit) {
      // пока отдаём копию, свежий ответ (если всё же придёт) обновит её
      net.then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
      return hit;
    }
    return net;
  }
}
