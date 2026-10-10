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

  var RESERVED = ['social', 'scripts', 'writing', 'settings', 'activity', 'boards', 'workspaces', 'calendar', 'home', 'prompts', 'inspiration', 'log', 'attachments'];
  var BOARDS_KEY = 'marathon.boards';
  var WS_KEY = 'marathon.workspaces';       // runtime-created workspaces (data/workspaces.json)
  var WS_ACTIVE = 'marathon.workspace';     // last used workspace id (this browser)
  var DEFAULTS = {
    name: 'Solo Ops', eyebrow: 'Solo founder ops',
    apps: { boards: true, social: true, scripts: true, writing: true },
    projects: [{ name: 'general', hue: 45 }],
    boards: [{ id: 'runway', title: 'Launch Runway', sprintLabel: 'Sprint progress', milestones: [], focus: [] }],
    workspaces: [],
    board: { tags: [], tagHues: {} },
    social: { title: 'Social Schedule', network: 'X / Twitter', arcLabel: 'Posting arc', milestones: [], focus: [],
      postTypes: ['announcement', 'launch', 'update', 'thread', 'teaser'],
      prepKinds: ['content', 'video', 'dev', 'design', 'outreach', 'other'] },
    studio: { scriptTitle: 'Script Viewer', writingTitle: 'Writing Viewer' },
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
  var cfg = merge(DEFAULTS, raw);
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
    var apps = merge({ social: true, scripts: true, writing: true }, w.apps || {});
    var boards = (Array.isArray(w.boards) ? w.boards : []).map(normBoard).filter(Boolean);
    if (w.boards === undefined && apps.boards !== false && !boards.length) boards = [normBoard({ id: 'runway', title: 'Launch Runway', sprintLabel: 'Sprint progress' })];
    return { id: id, title: w.title || id, apps: { social: apps.social !== false, scripts: apps.scripts !== false, writing: apps.writing !== false }, boards: boards, createdAt: w.createdAt || 0 };
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
    if (wsFromUrl && RESERVED.indexOf(wsFromUrl) < 0) return wsFromUrl;
    var saved = global.Store ? Store.get(WS_ACTIVE) : null;
    return (saved && workspace(saved)) ? saved : PRIMARY;
  }
  function setActiveWs(id) { if (global.Store) Store.set(WS_ACTIVE, id, { silent: true }); }
  function ws() { return workspace(activeWs()) || { id: activeWs(), title: activeWs(), apps: { social: true, scripts: true, writing: true }, boards: [] }; }
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
      }
    });
  }
  if (typeof document !== 'undefined' && document.addEventListener) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerBoardsSync); else setTimeout(registerBoardsSync, 0); }

  global.Config = {
    get: function (p) { return p ? path(cfg, p) : cfg; },
    all: cfg,
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
