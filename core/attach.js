/* =========================================================================
   core/attach.js — where files live. Rules:
   • an image dropped anywhere becomes a small THUMBNAIL (kept inside the
     item, travels with the JSON and the export bundle) + the ORIGINAL
   • the original goes to data/attachments/ as a real file when the server
     runs or the folder is linked; otherwise into IndexedDB (no 5 MB
     localStorage cap) and is written to disk the next time a connection
     appears
   • any other file up to `attachments.copyMaxMB` (solo.config.js) is copied
     the same way; above that nothing is copied — the item keeps the name and
     size and the user pastes a path or link instead ("local redirection")
   Exposes Attach.{thumb, put, get, url, flush, tooBig, fmtSize, ext}.
   Needs Store, Config, Sync (optional).
   ========================================================================= */
(function (global) {
  'use strict';
  var DB = 'solo-ops-attachments', STORE = 'files';
  function cfg() { var c = (global.Config && Config.get('attachments')) || {}; return { thumbMaxPx: c.thumbMaxPx || 640, thumbMaxKB: c.thumbMaxKB || 200, copyMaxMB: c.copyMaxMB || 25 }; }
  function fmtSize(n) { n = +n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB'; }
  function ext(fileOrType, name) { var t = typeof fileOrType === 'string' ? fileOrType : (fileOrType && fileOrType.type) || ''; var m = (name || (fileOrType && fileOrType.name) || '').match(/\.([A-Za-z0-9]{1,6})$/); if (m) return m[1].toLowerCase().replace('jpeg', 'jpg'); var dm = t.match(/^data:([^;]+)/); t = dm ? dm[1] : t; var map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md' }; return map[t] || (t.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'bin'; }
  function safe(name) { return String(name).replace(/[^A-Za-z0-9._-]/g, '-'); }
  function tooBig(file) { return !!file && file.size > cfg().copyMaxMB * 1048576; }

  /* ---- thumbnails ---- */
  function thumb(dataUrl) {
    var c = cfg();
    return new Promise(function (resolve) {
      if (!/^data:image\//.test(dataUrl || '')) return resolve('');
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var small = dataUrl.length < c.thumbMaxKB * 1024 * 1.37 && Math.max(w, h) <= c.thumbMaxPx;
        if (small || /^data:image\/svg/.test(dataUrl)) return resolve(dataUrl);
        var s = Math.min(1, c.thumbMaxPx / Math.max(w, h)); var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
        try { cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); var out = cv.toDataURL(/png|gif/.test(dataUrl.slice(0, 20)) && dataUrl.length < 600000 ? 'image/png' : 'image/jpeg', 0.82); if (out.length > dataUrl.length) out = dataUrl; resolve(out); } catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  /* ---- IndexedDB fallback for originals ---- */
  function db() { return new Promise(function (res, rej) { if (!global.indexedDB) return rej(new Error('no idb')); var r = indexedDB.open(DB, 1); r.onupgradeneeded = function () { r.result.createObjectStore(STORE); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function idbPut(name, dataUrl) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put({ data: dataUrl, at: Date.now(), pending: true }, name); tx.oncomplete = function () { res(true); }; tx.onerror = function () { rej(tx.error); }; }); }); }
  function idbGet(name) { return db().then(function (d) { return new Promise(function (res) { var r = d.transaction(STORE).objectStore(STORE).get(name); r.onsuccess = function () { res(r.result || null); }; r.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  function idbKeys() { return db().then(function (d) { return new Promise(function (res) { var r = d.transaction(STORE).objectStore(STORE).getAllKeys(); r.onsuccess = function () { res(r.result || []); }; r.onerror = function () { res([]); }; }); }).catch(function () { return []; }); }
  function idbMark(name) { return db().then(function (d) { return new Promise(function (res) { var tx = d.transaction(STORE, 'readwrite'); var st = tx.objectStore(STORE); var r = st.get(name); r.onsuccess = function () { if (r.result) { r.result.pending = false; st.put(r.result, name); } }; tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); }; }); }).catch(function () { return false; }); }

  /* ---- put / get ---- */
  // → { file: 'data/attachments/<name>' | '', where: 'disk' | 'browser' | '' }
  function put(name, dataUrl) {
    name = safe(name);
    var onDisk = global.Sync && Sync.attachmentsAvailable && Sync.attachmentsAvailable();
    var p = onDisk ? Sync.saveAttachment(name, dataUrl) : Promise.resolve('');
    return p.then(function (rel) {
      if (rel) return { file: rel, where: 'disk' };
      return idbPut(name, dataUrl).then(function () { return { file: '', where: 'browser' }; }).catch(function () { return { file: '', where: '' }; });
    });
  }
  function get(name) {
    name = safe(name);
    var fromDisk = (global.Sync && Sync.readAttachment) ? Sync.readAttachment(name) : Promise.resolve('');
    return fromDisk.then(function (d) { if (d) return d; return idbGet(name).then(function (r) { return r ? r.data : ''; }); }).catch(function () { return idbGet(name).then(function (r) { return r ? r.data : ''; }); });
  }
  // a URL that opens the original directly (server mode only)
  function url(name) { if (!global.Sync || Sync.getMode() !== 'server') return ''; return '/api/attach/' + safe(name); }
  // originals that only exist in this browser are written to disk once a connection appears
  var flushing = false;
  function flush() {
    if (flushing || !global.Sync || !Sync.attachmentsAvailable || !Sync.attachmentsAvailable()) return Promise.resolve(0);
    flushing = true; var n = 0;
    return idbKeys().then(function (keys) {
      return keys.reduce(function (p, k) { return p.then(function () { return idbGet(k).then(function (r) { if (!r || !r.pending) return; return Sync.saveAttachment(k, r.data).then(function (rel) { if (rel) { n++; return idbMark(k).then(function () { emit(k, rel); }); } }); }); }); }, Promise.resolve());
    }).then(function () { flushing = false; return n; }).catch(function () { flushing = false; return n; });
  }
  var listeners = [];
  function emit(name, rel) { listeners.forEach(function (fn) { try { fn(name, rel); } catch (e) { /* ignore */ } }); }
  if (global.Sync && Sync.on) Sync.on(function (evt) { if (evt === 'linked' || evt === 'pulled' || evt === 'ready') setTimeout(flush, 500); });
  setTimeout(flush, 3000);

  global.Attach = { cfg: cfg, thumb: thumb, put: put, get: get, url: url, flush: flush, tooBig: tooBig, fmtSize: fmtSize, ext: ext, safe: safe, onFlushed: function (fn) { listeners.push(fn); } };
})(window);
