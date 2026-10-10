/* sw.js — caches the app shell so Solo Ops opens instantly as an installed
   app. Data (/api/*, data/*.json) is always network-first and never served
   stale. Bump VERSION when shipping a new build. */
var VERSION = 'solo-ops-v1';
var SHELL = ['./', './index.html', './manifest.json', './solo.config.js', './icons/icon.svg', './icons/icon-192.png',
  './core/store.js', './core/config.js', './core/templates.js', './core/theme.js', './core/theme-boot.js', './core/theme.css', './core/ui.css',
  './core/sync.js', './core/activity.js', './core/palette.js', './core/nav.js', './core/inspo-quick.js',
  './runway/marathon-board.html', './runway/styles.css', './runway/model.js', './runway/view.js', './runway/main.js',
  './social/social-board.html', './social/social-calendar.html', './social/social-styles.css', './social/social-graph.css', './social/social-calendar.css',
  './social/social-assets-store.js', './social/social-image-store.js', './social/social-model.js', './social/social-image.js', './social/social-view.js', './social/social-main.js', './social/social-calendar-view.js', './social/social-calendar-main.js',
  './studio/script-viewer.html', './studio/writing-viewer.html', './studio/script-viewer.css', './studio/writing-viewer.css', './studio/script-viewer.js', './studio/writing-viewer.js',
  './inspo/inspiration.html', './inspo/inspo.css', './inspo/inspo-model.js', './inspo/inspo-main.js'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.indexOf('/api/') >= 0 || /\/data\//.test(url.pathname) || url.origin !== location.origin) return;
  // network first, cache fallback: fresh code when online, instant shell offline
  e.respondWith(fetch(e.request).then(function (r) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); return r; }).catch(function () { return caches.match(e.request); }));
});
