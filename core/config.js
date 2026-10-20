/* =========================================================================
   core/config.js — reads solo.config.js (window.MARATHON_CONFIG), fills
   defaults, and exposes helpers + a tiny DOM binder. Global `Config`.
   Usage in HTML: <span data-cfg="eyebrow"></span> gets the config value;
   [data-app="social"] elements are hidden when that app is switched off.
   Boards = config boards ∪ boards created at runtime (Store key
   `marathon.boards`, mirrored to data/boards.json).
   ========================================================================= */
(function (global) {
  'use strict';

  var RESERVED = ['social', 'scripts', 'writing', 'settings', 'activity', 'boards', 'workspaces', 'calendar', 'home', 'prompts', 'inspiration', 'log', 'attachments', 'backup', 'exports', 'videos', 'video', 'models', 'secrets'];
  var BOARDS_KEY = 'marathon.boards';
  var WS_KEY = 'marathon.workspaces';       // runtime-created workspaces (data/workspaces.json)
  var WS_ACTIVE = 'marathon.workspace';     // last used workspace id (this browser)
  var DEFAULTS = {
    name: 'Solo Ops', eyebrow: 'Solo founder ops',
    apps: { boards: true, social: true, scripts: true, writing: true, video: true },
    projects: [{ name: 'general', hue: 45 }],
    boards: [{ id: 'runway', title: 'Launch Runway', sprintLabel: 'Sprint progress', milestones: [], focus: [] }],
    workspaces: [],
    board: { tags: [], tagHues: {} },
    social: { title: 'Social Schedule', network: 'X / Twitter', arcLabel: 'Posting arc', milestones: [], focus: [],
      postTypes: ['announcement', 'launch', 'update', 'thread', 'teaser'],
      prepKinds: ['content', 'video', 'dev', 'design', 'outreach', 'other'] },
    studio: { scriptTitle: 'Script Viewer', writingTitle: 'Writing Viewer', videoTitle: 'Video' },
    video: { engine: '', ffmpeg: '', whisper: '', model: 'small.en', captions: { style: 'sentence', burn: false }, pause: 0.7, recordings: '', auto: '', autoMaxMin: 30 },
    activity: { reminderAfterHours: 24 },
    theme: { mode: 'auto', palette: 'warm' },
    sync: { port: 4321, pollMs: 3000 }
  };

  function merge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(over || {}).forEach(function (k) {
      var v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = merge(base[k], v);
      else if (v !== undefined) out[k] = v;
    });
    return out;
  }
  var raw = global.MARATHON_CONFIG || {};
  // legacy shape: `runway: { title, tags, tagHues, milestones, focus, sprintLabel }`
  if (raw.runway && !raw.boards) {
    raw.boards = [{ id: 'runway', title: raw.runway.title, sprintLabel: raw.runway.sprintLabel, milestones: raw.runway.milestones, focus: raw.runway.focus }];
    raw.board = raw.board || { tags: raw.runway.tags, tagHues: raw.runway.tagHues };
  }
  // Personal values (owner, board titles, post types …) live in data/settings.json
  // under `config`, never in solo.config.js, which is shipped code. The browser
  // keeps the last copy it saw under OVR_KEY so every page can read it before
  // the file arrives; theme.js's settings.json sync hands new copies to
  // setOverrides, which reloads once when they differ from what this page used.
  var OVR_KEY = 'marathon.config';
  function storedOverrides() {
    var o = null;
    try { o = global.Store ? Store.getJSON(OVR_KEY, null) : JSON.parse(localStorage.getItem(OVR_KEY) || 'null'); } catch (e) { o = null; }
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  }
  var overrides = storedOverrides();
  var LOADED = JSON.stringify(overrides || {});
  if (overrides) raw = mergeOverrides(raw, overrides);
  var cfg = merge(DEFAULTS, raw);

  /* ---- personal values: edit, check and merge against the shipped config ----
     Shared by the pages, the Reply tab (core/apply.js) and the CLI, which
     require()s this file. `shipped` is solo.config.js as it ships. */
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function kindOf(v) { return Array.isArray(v) ? 'list' : isObj(v) ? 'group' : (v === null || v === undefined) ? 'none' : typeof v; }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function lev(a, b) { var m = [], i, j; for (i = 0; i <= a.length; i++) { m[i] = [i]; } for (j = 1; j <= b.length; j++) m[0][j] = j; for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
  function closest(name, keys) { var best = '', bd = 3; keys.forEach(function (k) { var d = lev(name.toLowerCase(), k.toLowerCase()); if (d < bd) { bd = d; best = k; } }); return best; }
  // "42", "true", "[…]", "{…}" become values; anything else stays the text as typed
  function parseValue(text) { if (typeof text !== 'string') return text; var t = text.trim(); if (/^[\[{]/.test(t) || /^(true|false|null|-?\d+(\.\d+)?)$/.test(t)) { try { return JSON.parse(t); } catch (e) { return text; } } return text; }
  function listOf(v) { return Array.isArray(v) ? v : String(v).split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
  // The same shape as the shipped value, or an Error that says what the setting is and how to write it.
  function coerce(p, shipped, v) {
    var k = kindOf(shipped);
    if (k === 'list') {
      var strings = shipped.every(function (x) { return typeof x === 'string'; });
      if (!strings && !Array.isArray(v)) throw new Error('`' + p + '` is a list of ' + (shipped[0] && shipped[0].id ? 'entries with an id' : 'groups') + '. Set one entry with `' + p + '.<id>.<key> <value>`, or the whole list as JSON: \'[' + JSON.stringify(shipped[0] || {}) + ']\'');
      v = listOf(v); if (!v.every(function (x) { return typeof x === 'string'; })) throw new Error('`' + p + '` is a list of words. Write it as: ' + p + ' a,b,c'); return v;
    }
    if (k === 'group') { if (!isObj(v)) throw new Error('`' + p + '` is a group of settings (' + Object.keys(shipped).join(', ') + '). Set one of them: `' + p + '.' + (Object.keys(shipped)[0] || 'key') + ' <value>`'); return v; }
    if (k === 'string') { if (v && typeof v === 'object') throw new Error('`' + p + '` is text. Quote values with spaces: ' + p + ' "Mara Jane"'); return String(v == null ? '' : v); }
    if (k === 'number') { var n = Number(v); if (!isFinite(n) || String(v).trim() === '') throw new Error('`' + p + '` is a number (now ' + shipped + ')'); return n; }
    if (k === 'boolean') { if (v === true || v === false) return v; if (/^(true|false)$/i.test(String(v))) return /^true$/i.test(String(v)); throw new Error('`' + p + '` is true or false'); }
    return v;
  }
  var PATH_RE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
  // override(shipped, current, 'set'|'add'|'unset'|'clear', path, value, { force }) → { config, label, unchanged }
  // A segment inside a list of {id} entries picks that entry (boards.runway.title); the list is copied whole first, since lists replace.
  function override(shipped, current, op, p, value, opts) {
    opts = opts || {}; var cur = clone(isObj(current) ? current : {});
    if (op === 'clear') return { config: {}, label: 'your settings cleared; solo.config.js as shipped applies' };
    p = String(p || '').trim();
    if (!PATH_RE.test(p)) throw new Error('`' + p + '` is not a setting. Names look like owner or social.postTypes; `node solo.js config` lists them.');
    var segs = p.split('.'); var top = segs[0];
    if (op === 'unset') {   // walks what is stored, not the shipped file: a name that was never set is simply not there
      var un = cur; for (var u = 0; u < segs.length - 1; u++) { un = isObj(un) ? un[segs[u]] : (Array.isArray(un) ? un.filter(function (x) { return x && x.id === segs[u]; })[0] : undefined); }
      var lk = segs[segs.length - 1]; if (!isObj(un) || !(lk in un)) return { config: prune(cur), label: '`' + p + '` was not set; nothing changed', unchanged: true };
      delete un[lk]; return { config: prune(cur), label: '`' + p + '` back to the shipped value' };
    }
    if (!(top in shipped) && !opts.force) { var c = closest(top, Object.keys(shipped)); throw new Error('`' + top + '` is not a setting.' + (c ? ' Did you mean `' + c + '`?' : '') + ' `node solo.js config` lists them (add --force for a key your own fork added).'); }
    var sh = shipped, node = cur, parents = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], last = i === segs.length - 1;
      if (Array.isArray(sh)) {
        if (/^\d+$/.test(s)) throw new Error('`' + segs.slice(0, i).join('.') + '` is a list; pick an entry by id (' + sh.map(function (x) { return x && x.id; }).filter(Boolean).join(', ') + '), e.g. `' + segs.slice(0, i).join('.') + '.' + ((sh[0] || {}).id || 'id') + '.title`');
        var idx = -1; sh.forEach(function (x, n) { if (x && x.id === s) idx = n; });
        if (idx < 0) throw new Error('no entry `' + s + '` in `' + segs.slice(0, i).join('.') + '` (' + sh.map(function (x) { return x && x.id; }).filter(Boolean).join(', ') + ')');
        var pk = segs[i - 1]; var parent = parents[parents.length - 1];
        if (!Array.isArray(parent[pk])) parent[pk] = clone(sh);
        var entry = parent[pk].filter(function (x) { return x && x.id === s; })[0]; if (!entry) { entry = clone(sh[idx]); parent[pk].push(entry); }
        if (last) throw new Error('set one key of the entry: `' + p + '.title <value>`');
        parents.push(node); node = entry; sh = sh[idx]; continue;
      }
      if (!isObj(sh) && i > 0) throw new Error('`' + segs.slice(0, i).join('.') + '` is ' + (kindOf(sh) === 'none' ? 'not a setting' : 'a single value') + '; nothing sits under it');
      var next = isObj(sh) ? sh[s] : undefined;
      if (last) {
        var v = op === 'add' ? (function () { if (kindOf(next) !== 'list' || !next.every(function (x) { return typeof x === 'string'; })) throw new Error('`' + p + '` is not a list of words; use `config set`'); var base = Array.isArray(node[s]) ? node[s].slice() : next.slice(); listOf(value).forEach(function (x) { if (base.indexOf(x) < 0) base.push(x); }); return base; })() : coerce(p, next, parseValue(value));
        node[s] = v; return { config: prune(cur), label: p + ' = ' + JSON.stringify(v) };
      }
      if (!isObj(node[s]) && !Array.isArray(node[s])) node[s] = Array.isArray(next) ? undefined : {};
      if (Array.isArray(next)) { parents.push(node); sh = next; node = node; continue; }   // the next segment picks the entry
      parents.push(node); node = node[s]; sh = next;
    }
    return { config: prune(cur), label: p };
  }
  function prune(o) { Object.keys(o).forEach(function (k) { if (o[k] === undefined) delete o[k]; else if (isObj(o[k])) { prune(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } }); return o; }
  // Problems in a `config` object next to the shipped file: unknown top-level keys and values of another shape.
  function check(shipped, config) {
    var issues = []; if (config === undefined) return issues; if (!isObj(config)) return ['config must be an object of solo.config.js keys'];
    (function walk(sh, o, pre) { Object.keys(o).forEach(function (k) { var p = pre ? pre + '.' + k : k; if (!pre && !(k in sh)) { issues.push('`' + k + '` is not a setting'); return; } var sv = isObj(sh) ? sh[k] : undefined, ov = o[k]; var ks = kindOf(sv), ko = kindOf(ov); if (ks === 'none') return; if ((ks === 'list') !== (ko === 'list') || (ks === 'group') !== (ko === 'group')) { issues.push('`' + p + '` should be a ' + ks + ' (it is ' + (ko === 'string' ? 'text' : ko) + ')'); return; } if (ks === 'group') walk(sv, ov, p); }); })(shipped, config, '');
    return issues;
  }
  // merge that skips values of another shape, so a hand-edited settings.json cannot blank a page
  function mergeOverrides(base, over) {
    var o = {}; Object.keys(base || {}).forEach(function (k) { o[k] = base[k]; });
    Object.keys(over || {}).forEach(function (k) { var v = over[k], b = base ? base[k] : undefined; if (v === undefined) return; if (b !== undefined && ((Array.isArray(b) !== Array.isArray(v)) || (isObj(b) !== isObj(v)))) return; o[k] = isObj(v) && isObj(b) ? mergeOverrides(b, v) : v; });
    return o;
  }
  // workspaces: config list, or one built from the top-level apps/boards
  if (!Array.isArray(raw.workspaces) || !raw.workspaces.length) {
    cfg.workspaces = [{ id: 'main', title: cfg.name, apps: cfg.apps, boards: cfg.boards }];
  }
  cfg.projects = (cfg.projects || []).map(function (p) {
    return typeof p === 'string' ? { name: p, hue: hashHue(p) } : { name: p.name, hue: p.hue != null ? p.hue : hashHue(p.name) };
  });
  if (!cfg.projects.length) cfg.projects = [{ name: 'general', hue: 45 }];
  cfg.workspaces = cfg.workspaces.map(normWs).filter(Boolean);
  if (!cfg.workspaces.length) cfg.workspaces = [normWs({ id: 'main', title: cfg.name })];
  var PRIMARY = cfg.workspaces[0].id;      // its files keep the short names (runway.json, social.json …)

  function hashHue(s) {
    var h = 0, i; s = String(s || '');
    for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return h % 360;
  }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32); }
  function normBoard(b) {
    if (!b) return null;
    var id = slug(b.id || b.title);
    if (!id || RESERVED.indexOf(id) >= 0) return null;
    return { id: id, title: b.title || id, sprintLabel: b.sprintLabel || 'Progress', milestones: b.milestones || [], focus: b.focus || [], createdAt: b.createdAt || 0 };
  }
  function normWs(w) {
    if (!w) return null;
    var id = slug(w.id || w.title); if (!id || RESERVED.indexOf(id) >= 0) return null;
    var apps = merge({ social: true, scripts: true, writing: true, video: true }, w.apps || {});
    var boards = (Array.isArray(w.boards) ? w.boards : []).map(normBoard).filter(Boolean);
    if (w.boards === undefined && apps.boards !== false && !boards.length) boards = [normBoard({ id: 'runway', title: 'Launch Runway', sprintLabel: 'Sprint progress' })];
    return { id: id, title: w.title || id, apps: { social: apps.social !== false, scripts: apps.scripts !== false, writing: apps.writing !== false, video: apps.video !== false }, boards: boards, createdAt: w.createdAt || 0 };
  }
  function path(obj, p) { return String(p).split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---- workspaces: config + runtime-created ---------------------------- */
  function runtimeWs() {
    var d = global.Store ? Store.getJSON(WS_KEY, null) : null;
    return d && Array.isArray(d.workspaces) ? d.workspaces.map(normWs).filter(Boolean) : [];
  }
  function workspaces() {
    var seen = {}, out = [];
    cfg.workspaces.concat(runtimeWs()).forEach(function (w) { if (!seen[w.id]) { seen[w.id] = 1; out.push(w); } });
    return out;
  }
  function workspace(id) { return workspaces().filter(function (w) { return w.id === id; })[0] || null; }
  var wsFromUrl = typeof location !== 'undefined' ? slug(new URLSearchParams(location.search).get('ws') || '') : '';
  function activeWs() {
    if (wsFromUrl && RESERVED.indexOf(wsFromUrl) < 0 && (workspace(wsFromUrl) || !global.Store || Store.get(WS_KEY) == null)) return wsFromUrl;   // a typo in ?ws= must not become a workspace (pages would create its files)
    var saved = global.Store ? Store.get(WS_ACTIVE) : null;
    return (saved && workspace(saved)) ? saved : PRIMARY;
  }
  function setActiveWs(id) { if (global.Store) Store.set(WS_ACTIVE, id, { silent: true }); }
  function ws() { return workspace(activeWs()) || { id: activeWs(), title: activeWs(), apps: { social: true, scripts: true, writing: true, video: true }, boards: [] }; }
  function addWorkspace(w) {
    var nw = normWs(w); if (!nw) return null;
    if (workspace(nw.id)) return workspace(nw.id);
    nw.createdAt = Date.now();
    var cur = runtimeWs(); cur.push(nw); Store.setJSON(WS_KEY, { workspaces: cur });
    return nw;
  }
  function updateWorkspace(id, patch) {
    var cur = runtimeWs(); var hit = false;
    cur = cur.map(function (w) { if (w.id === id) { hit = true; return normWs(Object.assign({}, w, patch, { id: id })); } return w; });
    if (!hit) { var cw = workspace(id); if (!cw) return null; cur.push(normWs(Object.assign({}, cw, patch, { id: id }))); }
    Store.setJSON(WS_KEY, { workspaces: cur }); return workspace(id);
  }
  function removeWorkspace(id) { Store.setJSON(WS_KEY, { workspaces: runtimeWs().filter(function (w) { return w.id !== id; }) }); }

  /* ---- file + key naming: primary workspace keeps short names ---------- */
  function prefix(wsId) { wsId = wsId || activeWs(); return wsId === PRIMARY ? '' : wsId + '-'; }
  function file(app, wsId) { return prefix(wsId) + app + '.json'; }
  function key(app, wsId) {
    wsId = wsId || activeWs();
    if (wsId === PRIMARY) return { social: 'marathon.social.v3', scripts: 'marathon.scripts', writing: 'marathon.writing' }[app] || ('marathon.' + app);
    return 'marathon.' + wsId + '.' + app;
  }
  function boardFile(id, wsId) { return prefix(wsId) + id + '.json'; }
  function boardKey(id, wsId) { wsId = wsId || activeWs(); return 'marathon.board.' + (wsId === PRIMARY ? '' : wsId + '.') + id; }

  /* ---- boards of a workspace: config + runtime-created ------------------ */
  function runtimeBoards(wsId) {
    wsId = wsId || activeWs();
    var d = global.Store ? Store.getJSON(BOARDS_KEY, null) : null;
    return (d && Array.isArray(d.boards) ? d.boards : []).filter(function (b) { return (b.ws || PRIMARY) === wsId; }).map(normBoard).filter(Boolean);
  }
  function allRuntimeBoards() { var d = global.Store ? Store.getJSON(BOARDS_KEY, null) : null; return d && Array.isArray(d.boards) ? d.boards : []; }
  function boards(wsId) {
    wsId = wsId || activeWs();
    var w = workspace(wsId); var seen = {}, out = [];
    (w ? w.boards : []).concat(runtimeBoards(wsId)).forEach(function (b) { if (!seen[b.id]) { seen[b.id] = 1; out.push(b); } });
    return out;
  }
  function board(id, wsId) { return boards(wsId).filter(function (b) { return b.id === id; })[0] || null; }
  function addBoard(b, wsId) {
    wsId = wsId || activeWs();
    var nb = normBoard(b); if (!nb) return null;
    if (board(nb.id, wsId)) return board(nb.id, wsId);
    nb.createdAt = Date.now(); nb.ws = wsId;
    var cur = allRuntimeBoards(); cur.push(nb);
    Store.setJSON(BOARDS_KEY, { boards: cur });
    return nb;
  }
  function updateBoard(id, patch, wsId) {
    wsId = wsId || activeWs();
    var cur = allRuntimeBoards(); var found = false;
    cur = cur.map(function (b) { if (slug(b.id || b.title) === id && (b.ws || PRIMARY) === wsId) { found = true; return Object.assign(normBoard(Object.assign({}, b, patch, { id: id })), { ws: wsId }); } return b; });
    if (!found) { var cb = board(id, wsId); if (!cb) return null; cur.push(Object.assign(normBoard(Object.assign({}, cb, patch, { id: id })), { ws: wsId })); }
    Store.setJSON(BOARDS_KEY, { boards: cur });
    return board(id, wsId);
  }
  function removeBoard(id, wsId) {
    wsId = wsId || activeWs();
    Store.setJSON(BOARDS_KEY, { boards: allRuntimeBoards().filter(function (b) { return !(slug(b.id || b.title) === id && (b.ws || PRIMARY) === wsId); }) });
  }

  // mirror runtime-created boards to data/boards.json once Sync exists
  function registerBoardsSync() {
    if (!global.Sync) return;
    // The file is the truth for personal config: after the first pull, compare settings.json → config with the copy this page
    // used (a page that saw the file before it carried config, or before this code, would otherwise never pick it up).
    var healed = false;
    Sync.on(function (ev) { if (ev !== 'pulled' || healed || !Sync.peek) return; healed = true; Sync.peek('settings.json').then(function (f) { if (f && typeof f === 'object' && f.updatedAt) global.Config.setOverrides(f.config); }); });
    Sync.register({
      file: 'boards.json', key: BOARDS_KEY, label: 'boards', activity: false, merge: true,
      read: function () { return { boards: allRuntimeBoards() }; },
      apply: function (body) {
        if (!Array.isArray(body.boards)) return;
        var seen = {}, out = [];
        body.boards.concat(allRuntimeBoards()).forEach(function (b) {
          var nb = normBoard(b); if (!nb) return; var k = (b.ws || PRIMARY) + '/' + nb.id;
          if (!seen[k]) { seen[k] = 1; out.push(Object.assign(nb, { ws: b.ws || PRIMARY })); }
        });
        Store.setJSON(BOARDS_KEY, { boards: out }, { silent: true });
      }
    });
    Sync.register({
      file: 'workspaces.json', key: WS_KEY, label: 'workspaces', activity: false, merge: true,
      read: function () { return { workspaces: runtimeWs() }; },
      apply: function (body) {
        if (!Array.isArray(body.workspaces)) return;
        var seen = {}, out = [];
        body.workspaces.concat(runtimeWs()).forEach(function (w) { var nw = normWs(w); if (nw && !seen[nw.id]) { seen[nw.id] = 1; out.push(nw); } });
        Store.setJSON(WS_KEY, { workspaces: out }, { silent: true });
        if (wsFromUrl && wsFromUrl !== activeWs() && workspace(wsFromUrl) && typeof location !== 'undefined') location.reload();   // the link named a project this browser had not seen yet
      }
    });
  }
  if (typeof document !== 'undefined' && document.addEventListener) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerBoardsSync); else setTimeout(registerBoardsSync, 0); }

  global.Config = {
    get: function (p) { return p ? path(cfg, p) : cfg; },
    all: cfg,
    OVR_KEY: OVR_KEY,
    overrides: storedOverrides,
    // Store the `config` object from data/settings.json; reload once when it differs from what this page was built with.
    setOverrides: function (o) {
      var next = o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length ? o : null;
      if (JSON.stringify(next || {}) === LOADED) return false;
      if (!global.Store || !Store.ok) return false;   // nowhere to keep it (private window): a reload would only loop
      if (next) Store.setJSON(OVR_KEY, next, { silent: true }); else Store.remove(OVR_KEY);
      // `video` settings (the pause length, the remembered engine, the recordings folder) apply in place: the Video page must not reload under a selection
      var was = JSON.parse(LOADED || '{}'); var nx = next || {}; var changed = {}; Object.keys(was).concat(Object.keys(nx)).forEach(function (k) { if (JSON.stringify(was[k]) !== JSON.stringify(nx[k])) changed[k] = 1; });
      if (Object.keys(changed).length && Object.keys(changed).every(function (k) { return k === 'video'; })) { cfg.video = merge(merge(DEFAULTS.video, (global.MARATHON_CONFIG || {}).video || {}), nx.video || {}); LOADED = JSON.stringify(nx); return true; }
      if (typeof location !== 'undefined' && location.reload) (function go() {   // not while someone is typing
        var el = typeof document !== 'undefined' ? document.activeElement : null;
        if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return setTimeout(go, 2000);
        location.reload();
      })();
      return true;
    },
    override: override, check: check, mergeOverrides: mergeOverrides, parseValue: parseValue,
    BOARDS_KEY: BOARDS_KEY, WS_KEY: WS_KEY, RESERVED: RESERVED, PRIMARY: PRIMARY, slug: slug,
    workspaces: workspaces, workspace: workspace, ws: ws, activeWs: activeWs, setActiveWs: setActiveWs,
    addWorkspace: addWorkspace, updateWorkspace: updateWorkspace, removeWorkspace: removeWorkspace,
    file: file, key: key,
    // 'boards' is on when the active workspace has at least one board
    appEnabled: function (name, wsId) { var w = wsId ? workspace(wsId) : ws(); if (!w) return false; return name === 'boards' ? boards(w.id).length > 0 : w.apps[name] !== false; },
    projectNames: function () { return cfg.projects.map(function (p) { return p.name; }); },
    projectHue: function (name) {
      for (var i = 0; i < cfg.projects.length; i++) if (cfg.projects[i].name === name) return cfg.projects[i].hue;
      return hashHue(name);
    },
    tagHue: function (tag) { var h = cfg.board.tagHues || {}; return h.hasOwnProperty(tag) ? h[tag] : hashHue(tag); },
    hashHue: hashHue,
    boards: boards, board: board, addBoard: addBoard, updateBoard: updateBoard, removeBoard: removeBoard,
    boardFile: boardFile, boardKey: boardKey,
    // Fill [data-cfg="a.b"] text, [data-cfg-title] document title, ticks, focus
    // cards; hide [data-app="x"] when app x is off. `scope` (optional object)
    // is consulted before cfg, so a board can bind its own title/milestones.
    applyDOM: function (scope) {
      var get = function (p) { var v = scope ? path(scope, p) : undefined; return v !== undefined ? v : path(cfg, p); };
      var nodes = document.querySelectorAll('[data-cfg]');
      for (var i = 0; i < nodes.length; i++) { var v = get(nodes[i].getAttribute('data-cfg')); if (v != null) nodes[i].textContent = v; }
      var t = document.querySelector('[data-cfg-title]');
      if (t) { var tv = get(t.getAttribute('data-cfg-title')); if (tv) document.title = tv + ' — ' + cfg.name; }
      var ticks = document.querySelectorAll('[data-cfg-ticks]');
      for (var j = 0; j < ticks.length; j++) {
        var arr = get(ticks[j].getAttribute('data-cfg-ticks')) || [];
        ticks[j].innerHTML = arr.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
        ticks[j].style.display = arr.length ? '' : 'none';
      }
      var focus = document.querySelectorAll('[data-cfg-focus]');
      for (var k = 0; k < focus.length; k++) {
        var el = focus[k];
        if (!('staticHtml' in el.dataset)) el.dataset.staticHtml = el.innerHTML;   // static cards (cross-links) stay
        var cards = get(el.getAttribute('data-cfg-focus')) || [];
        el.innerHTML = cards.map(function (c, idx) {
          return '<div class="pri' + (idx % 2 ? ' two' : '') + '"><span class="k">' + esc(c.k || '') + '</span>' +
            '<span><span class="t">' + esc(c.t || '') + '</span><br><span class="s">' + esc(c.s || '') + '</span></span></div>';
        }).join('') + el.dataset.staticHtml;
        el.style.display = el.children.length ? '' : 'none';
      }
      var apps = document.querySelectorAll('[data-app]');
      for (var m = 0; m < apps.length; m++) if (!global.Config.appEnabled(apps[m].getAttribute('data-app'))) apps[m].style.display = 'none';
    }
  };
})(typeof window !== 'undefined' ? window : this);
