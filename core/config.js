/* =========================================================================
   core/config.js — reads marathon.config.js (window.MARATHON_CONFIG), fills
   defaults, and exposes helpers + a tiny DOM binder. Global `Config`.
   Usage in HTML: <span data-cfg="eyebrow"></span> gets the config value;
   [data-app="social"] elements are hidden when that app is switched off.
   Boards = config boards ∪ boards created at runtime (Store key
   `marathon.boards`, mirrored to data/boards.json).
   ========================================================================= */
(function (global) {
  'use strict';

  var RESERVED = ['social', 'scripts', 'writing', 'settings', 'activity', 'boards'];
  var BOARDS_KEY = 'marathon.boards';
  var DEFAULTS = {
    name: 'Marathon', eyebrow: 'Solo founder ops',
    apps: { boards: true, social: true, scripts: true, writing: true },
    projects: [{ name: 'general', hue: 45 }],
    boards: [{ id: 'runway', title: 'Launch Runway', sprintLabel: 'Sprint progress', milestones: [], focus: [] }],
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
  cfg.projects = (cfg.projects || []).map(function (p) {
    return typeof p === 'string' ? { name: p, hue: hashHue(p) } : { name: p.name, hue: p.hue != null ? p.hue : hashHue(p.name) };
  });
  if (!cfg.projects.length) cfg.projects = [{ name: 'general', hue: 45 }];
  cfg.boards = (cfg.boards || []).map(normBoard).filter(Boolean);
  if (!cfg.boards.length) cfg.boards = [normBoard(DEFAULTS.boards[0])];

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
  function path(obj, p) { return String(p).split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---- boards: config + runtime-created ------------------------------ */
  function runtimeBoards() {
    var d = global.Store ? Store.getJSON(BOARDS_KEY, null) : null;
    return d && Array.isArray(d.boards) ? d.boards.map(normBoard).filter(Boolean) : [];
  }
  function boards() {
    var seen = {}, out = [];
    cfg.boards.concat(runtimeBoards()).forEach(function (b) { if (!seen[b.id]) { seen[b.id] = 1; out.push(b); } });
    return out;
  }
  function board(id) {
    var all = boards();
    return all.filter(function (b) { return b.id === id; })[0] || null;
  }
  function addBoard(b) {
    var nb = normBoard(b); if (!nb) return null;
    if (board(nb.id)) return board(nb.id);
    nb.createdAt = Date.now();
    var cur = runtimeBoards(); cur.push(nb);
    Store.setJSON(BOARDS_KEY, { boards: cur });
    return nb;
  }
  function updateBoard(id, patch) {
    var cur = runtimeBoards(); var found = false;
    cur = cur.map(function (b) { if (b.id === id) { found = true; return normBoard(Object.assign({}, b, patch, { id: id })); } return b; });
    if (!found) { var cb = board(id); if (!cb) return null; cur.push(normBoard(Object.assign({}, cb, patch, { id: id }))); }
    Store.setJSON(BOARDS_KEY, { boards: cur });
    return board(id);
  }
  function removeBoard(id) {
    Store.setJSON(BOARDS_KEY, { boards: runtimeBoards().filter(function (b) { return b.id !== id; }) });
  }
  function boardFile(id) { return id + '.json'; }
  function boardKey(id) { return 'marathon.board.' + id; }

  // mirror runtime-created boards to data/boards.json once Sync exists
  function registerBoardsSync() {
    if (!global.Sync) return;
    Sync.register({
      file: 'boards.json', key: BOARDS_KEY, label: 'boards', activity: false, merge: true,
      read: function () { return { boards: runtimeBoards() }; },
      apply: function (body) {
        if (!Array.isArray(body.boards)) return;
        var seen = {}, out = [];
        body.boards.concat(runtimeBoards()).forEach(function (b) { var nb = normBoard(b); if (nb && !seen[nb.id]) { seen[nb.id] = 1; out.push(nb); } });
        Store.setJSON(BOARDS_KEY, { boards: out }, { silent: true });
      }
    });
  }
  if (typeof document !== 'undefined' && document.addEventListener) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerBoardsSync); else setTimeout(registerBoardsSync, 0); }

  global.Config = {
    get: function (p) { return p ? path(cfg, p) : cfg; },
    all: cfg,
    BOARDS_KEY: BOARDS_KEY, RESERVED: RESERVED, slug: slug,
    appEnabled: function (name) { return cfg.apps[name] !== false; },
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
        if (!el.dataset.staticHtml) el.dataset.staticHtml = el.innerHTML;   // static cards (cross-links) stay
        var cards = get(el.getAttribute('data-cfg-focus')) || [];
        el.innerHTML = cards.map(function (c, idx) {
          return '<div class="pri' + (idx % 2 ? ' two' : '') + '"><span class="k">' + esc(c.k || '') + '</span>' +
            '<span><span class="t">' + esc(c.t || '') + '</span><br><span class="s">' + esc(c.s || '') + '</span></span></div>';
        }).join('') + el.dataset.staticHtml;
        el.style.display = el.children.length ? '' : 'none';
      }
      var apps = document.querySelectorAll('[data-app]');
      for (var m = 0; m < apps.length; m++) if (cfg.apps[apps[m].getAttribute('data-app')] === false) apps[m].style.display = 'none';
    }
  };
})(typeof window !== 'undefined' ? window : this);
