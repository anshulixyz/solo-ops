/* =========================================================================
   core/sync.js — keeps app data in data/*.json files so agents and the CLI
   see the same thing the browser does.

   Modes (auto-detected):
     server  — page served by `node serve.js`: reads/writes via /api/data/*
     static  — served by any other static server: read-only pulls
     folder  — file:// in Chromium: user links the repo folder once, then the
               page reads/writes data/*.json directly (File System Access API)
     manual  — anything else: Save file / Load file buttons only

   Each app registers:
     Sync.register({ file:'runway.json', key:'marathon.runway.v3', label:'tasks',
                     read: fn → body object, apply: fn(body) })
   (`keys: [...]` instead of `key` when several Store keys feed one file.)
   Store.set(key) → debounced write of {version, updatedAt, ...read()}.
   A newer file on disk → apply(body) (the app replaces state + re-renders).
   ========================================================================= */
(function (global) {
  'use strict';

  var META_KEY = 'marathon.sync.meta';          // { file: { updatedAt } }
  var DB_NAME = 'marathon.sync', DB_STORE = 'handles';
  var specs = [];
  var mode = 'manual';
  var dirHandle = null, dataDir = null;
  var applying = false;
  var timers = {};
  var pollTimer = null;
  var lastSeen = {};                            // file → lastModified / updatedAt seen
  var pills = [];
  var pop = null;
  var cfg = (global.Config && Config.get('sync')) || { pollMs: 3000 };
  var fsSupported = typeof global.showDirectoryPicker === 'function';
  var listeners = [];
  var lastNote = {};                            // file → short description of the latest local change

  function meta() { return Store.getJSON(META_KEY, {}); }
  function setMeta(file, updatedAt) {
    var m = meta(); m[file] = { updatedAt: updatedAt }; Store.setJSON(META_KEY, m, { silent: true });
  }
  function localStamp(file) { var m = meta()[file]; return m ? m.updatedAt : ''; }
  function now() { return new Date().toISOString(); }
  function specFor(file) { return specs.filter(function (s) { return s.file === file; })[0]; }
  function emit(evt, data) { listeners.forEach(function (fn) { try { fn(evt, data); } catch (e) { /* ignore */ } }); }

  /* ---- registration + local change tracking ---------------------------- */
  var ready = false;   // true once mode detection finished
  function register(spec) {
    specs.push(spec);
    if (ready && mode !== 'manual') pullOne(spec, true);
  }
  function stripStamp(obj) {
    var o = {}; Object.keys(obj || {}).forEach(function (k) { if (k !== 'updatedAt' && k !== 'version') o[k] = obj[k]; }); return JSON.stringify(o);
  }
  Store.onChange(function (key) {
    if (applying) return;
    specs.forEach(function (s) {
      var keys = s.keys || [s.key];
      if (keys.indexOf(key) < 0) return;
      setMeta(s.file, now());
      scheduleWrite(s);
      if (s.activity !== false && global.Activity) Activity.bump(s.app || s.label || s.file.replace(/\.json$/, ''));
    });
  });
  function scheduleWrite(spec) {
    if (spec.readOnly) return;   // a sibling file mirrored on this page (takes on every page, the story's four): the file always wins, the page never writes it back
    if (mode !== 'server' && mode !== 'folder') return;
    clearTimeout(timers[spec.file]);
    timers[spec.file] = setTimeout(function () { writeOne(spec); }, 400);
  }
  function body(spec) {
    var b = spec.read() || {};
    var out = { version: 1, updatedAt: localStamp(spec.file) || now() };
    Object.keys(b).forEach(function (k) { out[k] = b[k]; });
    return out;
  }
  function applyBody(spec, parsed) {
    applying = true;
    var keys = spec.keys || [spec.key];
    var wasFresh = !spec.freshApplied && (!!(spec.isFresh && spec.isFresh()) || keys.some(function (k) { return Store.isFresh(k); }));   // sample data giving way to the file is not a change anyone made; only once per page, so later agent/CLI edits are logged
    if (global.Recent) Recent.beforeApply(keys);
    try {
      setMeta(spec.file, parsed.updatedAt || now());
      spec.apply(parsed);
      if (wasFresh) { spec.freshApplied = true; keys.forEach(function (k) { if (Store.clearFresh) Store.clearFresh(k); }); }
      if (global.Recent) { if (wasFresh) Recent.beforeApply(keys); else Recent.afterApply(keys, 'agent or CLI'); }
      emit('applied', { file: spec.file, label: spec.label });
    } finally { applying = false; }
  }

  /* ---- server mode ------------------------------------------------------ */
  function serverPing() {
    if (location.protocol.indexOf('http') !== 0) return Promise.resolve(false);
    return fetch('/api/ping', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return !!(j && j.marathon); }).catch(function () { return false; });
  }
  function serverRead(file) {
    return fetch('/api/data/' + file, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('read failed');
      return r.json();
    });
  }
  function serverWrite(file, obj) {
    return fetch('/api/data/' + file, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Marathon-Source': 'ui', 'X-Marathon-Note': (lastNote[file] || '').slice(0, 120) }, body: JSON.stringify(obj, null, 2) })
      .then(function (r) { if (!r.ok) throw new Error('write failed'); });
  }
  function staticRead(file) {
    var base = location.pathname.replace(/[^/]*$/, '');
    var up = document.querySelector('script[src$="core/sync.js"]');
    var root = up ? up.getAttribute('src').replace(/core\/sync\.js$/, '') : '';
    return fetch(base + root + 'data/' + file, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  /* ---- folder mode (File System Access API) ----------------------------- */
  function idb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('no idb'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) { e.target.result.createObjectStore(DB_STORE); };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGet(k) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readonly'); var r = tx.objectStore(DB_STORE).get(k);
        r.onsuccess = function () { resolve(r.result || null); }; r.onerror = function () { reject(r.error); };
      });
    }).catch(function () { return null; });
  }
  function idbSet(k, v) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readwrite'); var r = v == null ? tx.objectStore(DB_STORE).delete(k) : tx.objectStore(DB_STORE).put(v, k);
        r.onsuccess = function () { resolve(); }; r.onerror = function () { reject(r.error); };
      });
    }).catch(function () {});
  }
  function resolveDataDir(handle) {
    if (handle.name === 'data') return Promise.resolve(handle);
    return handle.getDirectoryHandle('data', { create: true });
  }
  function folderRead(file) {
    return dataDir.getFileHandle(file).then(function (fh) { return fh.getFile(); }).then(function (f) {
      lastSeen[file] = f.lastModified;
      return f.text().then(function (t) { return t.trim() ? JSON.parse(t) : null; });
    }).catch(function (e) { if (e && e.name === 'NotFoundError') return null; throw e; });
  }
  function folderChanged(file) {
    return dataDir.getFileHandle(file).then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.lastModified !== lastSeen[file]; }).catch(function () { return false; });
  }
  // folder mode keeps the same data/log.jsonl the server and CLI use
  function folderLog(file, prevText) {
    if (/^(activity|log)\.json$/.test(file)) return Promise.resolve();
    var rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: now(), file: file, source: 'ui', note: (lastNote[file] || '').slice(0, 120), prev: prevText && prevText.length <= 2 * 1024 * 1024 ? prevText : null, prevBytes: prevText ? prevText.length : 0 };
    return dataDir.getFileHandle('log.jsonl', { create: true }).then(function (fh) { return fh.getFile().then(function (f) { return f.text(); }).then(function (t) {
      var lines = t.split('\n').filter(Boolean); lines.push(JSON.stringify(rec)); if (lines.length > 400) lines = lines.slice(lines.length - 400);
      return fh.createWritable().then(function (w) { return w.write(lines.join('\n') + '\n').then(function () { return w.close(); }); });
    }); }).catch(function () {});
  }
  function folderWrite(file, obj) {
    var prevP = dataDir.getFileHandle(file).then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); }).catch(function () { return ''; });
    return prevP.then(function (prev) { return folderLog(file, prev); }).then(function () { return dataDir.getFileHandle(file, { create: true }); }).then(function (fh) { return fh.createWritable(); }).then(function (w) {
      return w.write(JSON.stringify(obj, null, 2) + '\n').then(function () { return w.close(); });
    }).then(function () { return dataDir.getFileHandle(file).then(function (fh) { return fh.getFile(); }); })
      .then(function (f) { lastSeen[file] = f.lastModified; });
  }
  function linkFolder() {
    if (!fsSupported) { alert('Folder linking needs Chrome, Edge or another Chromium browser.\n\nOtherwise run `node serve.js` and open http://localhost:' + (cfg.port || 4321) + ', or use Save file / Load file.'); return Promise.resolve(false); }
    return global.showDirectoryPicker({ mode: 'readwrite' }).then(function (h) {
      dirHandle = h;
      return resolveDataDir(h).then(function (d) { dataDir = d; return idbSet('dir', h); }).then(function () {
        mode = 'folder'; startPolling(); render();
        return pullAll(true).then(function () { emit('linked', { name: h.name }); return true; });
      });
    }).catch(function (e) { if (e && e.name !== 'AbortError') alert('Could not link folder: ' + e.message); return false; });
  }
  function unlink() {
    dirHandle = null; dataDir = null; mode = fsSupported ? 'manual' : 'manual';
    stopPolling(); idbSet('dir', null); render(); emit('unlinked');
  }
  function reconnect() {
    if (!dirHandle) return Promise.resolve(false);
    return dirHandle.requestPermission({ mode: 'readwrite' }).then(function (p) {
      if (p !== 'granted') return false;
      return resolveDataDir(dirHandle).then(function (d) { dataDir = d; mode = 'folder'; startPolling(); render(); return firstPull(true).then(function () { return true; }); });
    }).catch(function () { return false; });
  }

  /* ---- unified read / write / pull -------------------------------------- */
  function readFile(file) {
    if (mode === 'server') return serverRead(file);
    if (mode === 'folder') return folderRead(file);
    if (mode === 'static') return staticRead(file);
    return Promise.resolve(null);
  }
  var lastWriteAt = '';
  function writeOne(spec) {
    var obj = body(spec); lastWriteAt = now();
    // spec.keep: keys the file owns (settings.json → config). The file's copy wins every write unless this page changed
    // them (spec.dirty), so a theme click can never drop or roll back what the CLI wrote; spec.kept gets the written body.
    var keepFromFile = (mode === 'server' || mode === 'folder') && spec.keep && spec.keep.length && !(spec.dirty && spec.dirty());
    // spec.reconcile(fileBody): the page owns a few fields per item and the CLI the rest (takes); it merges the file's fresh copy in and returns the body to write
    var reconcile = (mode === 'server' || mode === 'folder') && typeof spec.reconcile === 'function';
    var pre = keepFromFile ? readFile(spec.file).catch(function () { return null; }).then(function (f) { spec.keep.forEach(function (k) { if (f && f[k] !== undefined) obj[k] = f[k]; else delete obj[k]; }); })
      : reconcile ? readFile(spec.file).catch(function () { return null; }).then(function (f) { if (!f) return; var b = spec.reconcile(f) || spec.read() || {}; var stamp = obj.updatedAt; obj = { version: 1, updatedAt: stamp }; Object.keys(b).forEach(function (k) { obj[k] = b[k]; }); }) : Promise.resolve();
    setPillState('busy');
    return pre.then(function () { return mode === 'server' ? serverWrite(spec.file, obj) : mode === 'folder' ? folderWrite(spec.file, obj) : Promise.resolve(); })
      .then(function () { lastSeen[spec.file + ':stamp'] = obj.updatedAt; render(); if (spec.clean) spec.clean(); emit('wrote', { file: spec.file }); if (spec.kept) spec.kept(obj); })
      .catch(function (e) { render(); emit('error', { file: spec.file, error: e }); });
  }
  // Compare file vs local: newer file → apply; newer local (or no file) → write.
  // First contact (no local stamp yet) never silently overwrites a file:
  // identical content just adopts the file's stamp, sample data yields to
  // the file, and real local content asks the user.
  function pullOne(spec, pushIfNewer) {
    var writable = (mode === 'server' || mode === 'folder') && !spec.readOnly;   // readOnly: the page mirrors the file and never writes it back (takes, until the Video page)
    return readFile(spec.file).then(function (parsed) {
      var local = localStamp(spec.file);
      var hasFile = !!(parsed && parsed.updatedAt);
      if (spec.readOnly && hasFile) { applyBody(spec, parsed); lastSeen[spec.file + ':stamp'] = parsed.updatedAt; setMeta(spec.file, parsed.updatedAt); return; }
      if (!hasFile) {
        // untouched sample data stays in the browser: the first file is written when the user changes something (or runs `template all`)
        var sample = (spec.isFresh && spec.isFresh()) || (spec.keys || [spec.key]).some(function (k) { return Store.isFresh(k); });
        if (pushIfNewer && writable && !sample) { if (!local) setMeta(spec.file, now()); return writeOne(spec); }
        return;
      }
      if (!local) {
        var same = stripStamp(parsed) === stripStamp(body(spec));
        var fresh = (spec.isFresh && spec.isFresh()) || (spec.keys || [spec.key]).some(function (k) { return Store.isFresh(k); });
        if (same || spec.merge || fresh) { applyBody(spec, parsed); lastSeen[spec.file + ':stamp'] = parsed.updatedAt; return; }
        // Real content on both sides and no way to tell which is newer: ask,
        // and download whichever side loses so nothing is unrecoverable.
        var useFile = confirm('data/' + spec.file + ' differs from the copy in this browser.\n\nOK = load the file (the browser copy is saved as a backup' + (writable ? ' in data/exports/' : '') + ')\nCancel = keep the browser copy' + (writable ? ' and overwrite the file (the file is saved as a backup in data/exports/)' : ''));
        if (useFile) { download(spec.file, true); applyBody(spec, parsed); lastSeen[spec.file + ':stamp'] = parsed.updatedAt; return; }
        if (writable) { downloadRaw(spec.file.replace(/\.json$/, '') + '.file-backup-' + now().slice(0, 16).replace(/[:T]/g, '-') + '.json', parsed); }
        setMeta(spec.file, now());
        if (writable) return writeOne(spec);
        return;
      }
      var noCopy = (spec.isFresh && spec.isFresh()) || (spec.keys || [spec.key]).some(function (k) { return Store.isFresh(k); });   // a stamp but no real copy here (site data half cleared, untouched sample data): the file wins, whatever the stamps say
      if (parsed.updatedAt > local || noCopy) {
        applyBody(spec, parsed);
        lastSeen[spec.file + ':stamp'] = parsed.updatedAt; if (noCopy) setMeta(spec.file, parsed.updatedAt);
        if (spec.merge && writable && stripStamp(parsed) !== stripStamp(body(spec))) { setMeta(spec.file, now()); return writeOne(spec); }
      } else if (pushIfNewer && writable && parsed.updatedAt < local) {
        return writeOne(spec);
      } else {
        lastSeen[spec.file + ':stamp'] = parsed.updatedAt;
      }
    }).catch(function (e) { emit('error', { file: spec.file, error: e }); });
  }
  function pullAll(pushIfNewer) {
    return specs.reduce(function (chain, s) { return chain.then(function () { return pullOne(s, pushIfNewer); }); }, Promise.resolve());
  }
  function poll() {
    if (document.visibilityState !== 'visible') return;
    specs.forEach(function (s) {
      if (mode === 'folder') {
        folderChanged(s.file).then(function (changed) { if (changed) pullOne(s, false); });
      } else if (mode === 'server' || mode === 'static') {
        readFile(s.file).then(function (parsed) {
          if (parsed && parsed.updatedAt && parsed.updatedAt !== lastSeen[s.file + ':stamp'] && parsed.updatedAt > (localStamp(s.file) || '')) {
            applyBody(s, parsed); lastSeen[s.file + ':stamp'] = parsed.updatedAt;
          }
        }).catch(function () {});
      }
    });
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(poll, cfg.pollMs || 3000); }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  /* ---- saving a file the user asked for (export, backup before a destructive action) ----
     Server or linked folder: it lands in data/exports/<name>, next to the data it
     came from, where the CLI, backups and agents can see it. Anywhere else it
     downloads. Resolves { where: 'disk' | 'download', path, text }. */
  function browserDownload(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/octet-stream' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    return { where: 'download', path: name, text: 'Downloaded ' + name };
  }
  function saveFile(name, text, mime) {
    name = String(name || 'export.json').replace(/[^A-Za-z0-9._-]/g, '-'); var isBlob = typeof Blob !== 'undefined' && text instanceof Blob; if (!isBlob) text = String(text == null ? '' : text);   // a Blob (PNG) goes through as is
    var rel = 'data/exports/' + name; var ok = { where: 'disk', path: rel, text: 'Saved to ' + rel };
    if (mode === 'server') return fetch('/api/export/' + name, { method: 'PUT', headers: { 'Content-Type': mime || 'application/octet-stream' }, body: text }).then(function (r) { if (!r.ok) throw new Error('export failed'); return ok; }).catch(function () { return browserDownload(name, text, mime); });
    if (mode === 'folder' && dataDir) return dataDir.getDirectoryHandle('exports', { create: true }).then(function (d) { return d.getFileHandle(name, { create: true }); }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(text).then(function () { return w.close(); }); }).then(function () { return ok; }).catch(function () { return browserDownload(name, text, mime); });
    return Promise.resolve(browserDownload(name, text, mime));
  }
  function downloadRaw(name, obj) { return saveFile(name, JSON.stringify(obj, null, 2) + '\n', 'application/json'); }
  function download(file, asBackup) {
    var spec = specFor(file); if (!spec) return Promise.resolve(null);
    var name = asBackup ? file.replace(/\.json$/, '') + '.backup-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json' : file;
    return saveFile(name, JSON.stringify(body(spec), null, 2) + '\n', 'application/json');
  }
  // Accepts the data/ wrapper or a bare legacy export; returns the wrapper.
  function unwrap(parsed, arrayKey) {
    if (Array.isArray(parsed)) { var o = {}; o[arrayKey] = parsed; return o; }
    return parsed || {};
  }

  /* ---- status pill ------------------------------------------------------ */
  var pillState = '';
  function setPillState(s) { pillState = s; render(); }
  function labelFor() {
    if (pillState === 'busy') return { state: 'busy', text: 'Saving…' };
    if (mode === 'server') return { state: 'server', text: 'Synced to data/' };
    if (mode === 'folder') return { state: 'folder', text: 'Linked to ' + (dirHandle ? dirHandle.name : 'folder') };
    if (mode === 'static') return { state: 'static', text: 'Read-only data/' };
    if (dirHandle) return { state: 'prompt', text: 'Reconnect folder' };
    return { state: 'manual', text: fsSupported ? 'Link folder' : 'Save / Load file' };
  }
  function render() {
    var l = labelFor();
    pills.forEach(function (p) { p.setAttribute('data-state', l.state); p.textContent = l.text; p.title = tooltip(l.state); });
    if (pillState === 'busy') setTimeout(function () { pillState = ''; render(); }, 600);
  }
  function tooltip(state) {
    return {
      server: 'Every change is written to data/*.json by serve.js. Agents and the CLI see it instantly.',
      folder: 'Every change is written straight to data/*.json in the linked folder.',
      static: 'This server cannot write. Changes stay in the browser; use Save file to export.',
      prompt: 'Click to grant access to the linked folder again for this session.',
      manual: fsSupported ? 'Link the Solo Ops folder once so the browser writes data/*.json directly.' : 'Use Save file / Load file, or run node serve.js.'
    }[state] || '';
  }
  function onPillClick(e) {
    e.stopPropagation();
    if (mode === 'folder' || mode === 'server' || mode === 'static') { openMenu(e.currentTarget); return; }
    if (dirHandle) { reconnect().then(function (ok) { if (!ok) linkFolder(); }); return; }
    linkFolder();
  }
  function openMenu(anchor) {
    closeMenu();
    pop = document.createElement('div'); pop.className = 'mt-pop sync-pop';
    pop.innerHTML = '<h4>Sync · ' + mode + '</h4><div class="mt-hint">' + tooltip(mode) + '</div><div class="mt-row">' +
      '<button type="button" data-act="pull">Reload from files</button>' +
      (mode === 'folder' ? '<button type="button" data-act="unlink">Unlink</button>' : '') + '</div>' +
      '<div class="mt-hint">Terminal: <code>node solo.js week</code></div>';
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + 8) + 'px'; pop.style.right = Math.max(10, window.innerWidth - r.right) + 'px';
    pop.querySelector('[data-act="pull"]').onclick = function () { closeMenu(); pullAll(false).then(function () { emit('pulled'); }); };
    var u = pop.querySelector('[data-act="unlink"]'); if (u) u.onclick = function () { closeMenu(); unlink(); };
    setTimeout(function () { document.addEventListener('mousedown', onDoc); }, 0);
  }
  function closeMenu() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', onDoc); } }
  function onDoc(e) { if (pop && !pop.contains(e.target)) closeMenu(); }
  function mount(el) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'sync-pill';
    b.onclick = onPillClick; (el || document.body).appendChild(b); pills.push(b); render();
    return b;
  }

  /* ---- init ------------------------------------------------------------- */
  var started = false;
  function firstPull(push) { return pullAll(push).then(function () { emit('pulled', { first: true }); }); }   // 'pulled' also fires here, not only on Reload from files, so pages can reconcile once the files are in
  function init() {
    if (started) return; started = true;
    serverPing().then(function (ok) {
      if (ok) { mode = 'server'; ready = true; startPolling(); render(); return firstPull(true); }
      if (location.protocol.indexOf('http') === 0) {
        mode = 'static'; ready = true; startPolling(); render(); return firstPull(false);
      }
      if (!fsSupported) { ready = true; render(); return; }
      return idbGet('dir').then(function (h) {
        if (!h) { ready = true; render(); return; }
        dirHandle = h;
        return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
          if (p === 'granted') return resolveDataDir(h).then(function (d) { dataDir = d; mode = 'folder'; ready = true; startPolling(); render(); return firstPull(true); });
          ready = true; render();
        });
      });
    }).catch(function () { ready = true; render(); });
    // auto-mount a pill wherever the page asked for one
    var slots = document.querySelectorAll('[data-sync-pill]');
    for (var i = 0; i < slots.length; i++) mount(slots[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);

  global.Sync = {
    register: register, mount: mount, on: function (fn) { listeners.push(fn); },
    linkFolder: linkFolder, unlink: unlink, reconnect: reconnect, pullAll: pullAll,
    download: download, saveFile: saveFile, exportsOnDisk: function () { return mode === 'server' || mode === 'folder'; }, unwrap: unwrap, fsSupported: fsSupported,
    // mark a file's browser copy as just changed (pages that write another
    // app's key, e.g. Home's Start blank, call this so the file is overwritten
    // instead of winning on first contact)
    touch: function (file) { setMeta(file, now()); },
    // Save an image as a real file in data/attachments/ so agents can open it.
    // Returns the relative path, or '' when nothing can be written here.
    saveAttachment: function (name, dataUrl) {
      if (!dataUrl || !/^data:[^;]+;base64,/.test(dataUrl)) return Promise.resolve('');
      name = String(name).replace(/[^A-Za-z0-9._-]/g, '-');
      var rel = 'data/attachments/' + name;
      if (mode === 'server') return fetch('/api/attach/' + name, { method: 'PUT', body: dataUrl }).then(function (r) { return r.ok ? rel : ''; }).catch(function () { return ''; });
      if (mode === 'folder' && dataDir) {
        var b64 = dataUrl.split(',')[1]; var bin = atob(b64); var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return dataDir.getDirectoryHandle('attachments', { create: true }).then(function (d) { return d.getFileHandle(name, { create: true }); }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(bytes).then(function () { return w.close(); }); }).then(function () { return rel; }).catch(function () { return ''; });
      }
      return Promise.resolve('');
    },
    attachmentsAvailable: function () { return mode === 'server' || mode === 'folder'; },
    // a take's own file (data/videos/<id>/transcript.json) parsed as JSON; null where nothing can read it
    readTakeFile: function (id, name) {
      if (!/^v[a-z0-9]+$/.test(String(id)) || !/^[a-z0-9.-]+$/i.test(String(name))) return Promise.resolve(null);
      if (mode === 'server') return fetch('/api/video/' + id + '/' + name, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      if (mode === 'folder' && dataDir) return dataDir.getDirectoryHandle('videos').then(function (d) { return d.getDirectoryHandle(id); }).then(function (d) { return d.getFileHandle(name); }).then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); }).then(function (t) { return JSON.parse(t); }).catch(function () { return null; });
      return Promise.resolve(null);
    },
    // read an attachment back as a data URL ('' when it is not on disk here)
    readAttachment: function (name) {
      name = String(name).replace(/[^A-Za-z0-9._-]/g, '-');
      function toData(blob) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(''); }; r.readAsDataURL(blob); }); }
      if (mode === 'server') return fetch('/api/attach/' + name, { cache: 'no-store' }).then(function (r) { return r.ok ? r.blob().then(toData) : ''; }).catch(function () { return ''; });
      if (mode === 'folder' && dataDir) return dataDir.getDirectoryHandle('attachments').then(function (d) { return d.getFileHandle(name); }).then(function (fh) { return fh.getFile(); }).then(toData).catch(function () { return ''; });
      return Promise.resolve('');
    },
    // write any data file (used by Import all); server or folder modes only
    writeFile: function (file, obj) { if (mode === 'server') return serverWrite(file, obj); if (mode === 'folder') return folderWrite(file, obj); return Promise.reject(new Error('read-only here')); },
    lastWrite: function () { return lastWriteAt; },
    // link metadata via the server (title, description); null elsewhere
    meta: function (url) { if (mode !== 'server') return Promise.resolve(null); return fetch('/api/meta?url=' + encodeURIComponent(url), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.redirect && !j.title) return fetch('/api/meta?url=' + encodeURIComponent(j.redirect)).then(function (r2) { return r2.ok ? r2.json() : null; }); return j; }).catch(function () { return null; }); },
    // describe the latest local change so the log can show "done: Write the README"
    note: function (file, text) { lastNote[file] = text || ''; },
    // change log (server mode only in the browser; the CLI covers every mode)
    log: function (n) { if (mode !== 'server') return Promise.resolve(null); return fetch('/api/log?n=' + (n || 20), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); },
    revert: function (id) { if (mode !== 'server') return Promise.resolve(false); return fetch('/api/revert/' + id, { method: 'POST' }).then(function (r) { return r.ok; }).then(function (ok) { if (ok) return pullAll(false).then(function () { return true; }); return false; }); },
    // read a data file without registering (used by the hub); null when unavailable
    peek: function (file) { return readFile(file).catch(function () { return null; }); },
    ready: function () { return ready; },
    getMode: function () { return mode; }, specs: specs
  };
})(typeof window !== 'undefined' ? window : this);
