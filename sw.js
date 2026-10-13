/* sw.js — Solo Ops service worker.
   Strategy: code and pages are NETWORK-FIRST (you always get fresh files when
   the server is up) with the cache as the offline fallback; /api/* and
   data/*.json are NEVER cached. serve.js stamps VERSION from the files'
   modification times, so every code change ships as a new worker; the page
   shows "Update ready — reload" when it activates. Served statically
   elsewhere, VERSION falls back to the literal below. */
var VERSION = '__VERSION__';
if (VERSION.indexOf('__') === 0) VERSION = 'solo-ops-static-1';
var SHELL = ['./', './index.html', './manifest.json', './solo.config.js', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './core/store.js', './core/config.js', './core/templates.js', './core/theme.js', './core/theme-boot.js', './core/theme.css', './core/ui.css',
  './core/sync.js', './core/activity.js', './core/palette.js', './core/nav.js', './core/inspo-quick.js', './core/attach.js', './core/quick.js', './about.html',
  './core/prompts.js', './core/when.js', './core/apply.js', './core/context.js', './core/guide.js', './core/recent.js',
  './calendar/calendar.html', './calendar/calendar.css', './calendar/calendar-model.js', './calendar/calendar-view.js', './calendar/calendar-main.js',
  './runway/marathon-board.html', './runway/styles.css', './runway/model.js', './runway/view.js', './runway/main.js',
  './social/social-board.html', './social/social-calendar.html', './social/social-styles.css', './social/social-graph.css', './social/social-calendar.css',
  './social/social-assets-store.js', './social/social-image-store.js', './social/social-model.js', './social/social-image.js', './social/social-view.js', './social/social-main.js', './social/social-calendar-view.js', './social/social-calendar-main.js',
  './studio/script-viewer.html', './studio/writing-viewer.html', './studio/script-viewer.css', './studio/writing-viewer.css', './studio/script-viewer.js', './studio/writing-viewer.js',
  './inspo/inspiration.html', './inspo/inspo.css', './inspo/inspo-model.js', './inspo/inspo-main.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }).then(function () {
    return self.clients.matchAll({ type: 'window' }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ type: 'sw-activated', version: VERSION }); }); });
  }));
});
self.addEventListener('message', function (e) { if (e.data && e.data.type === 'version') e.source.postMessage({ type: 'sw-version', version: VERSION }); });
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/api/') >= 0 || /\/data\//.test(url.pathname) || /\/sw\.js$/.test(url.pathname)) return;   // never cached
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(function (r) {
      if (r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); }
      return r;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('offline', { status: 503, statusText: 'offline' });
      });
    })
  );
});
