/* =========================================================================
   model.js — data model & state
   Owns the task list, template seed, migration/normalization, and every
   mutation. No DOM here. Exposes a single global `Model`.

   Task shape:
     { id, title, desc, proj, col, pri, tags:[], notes:'', collapsed:bool,
       checklist:[{text, done}] }
   Projects and tags come from solo.config.js; the seed comes from
   core/templates.js. One page serves many boards: ?board=<id> picks one
   (default: the first configured board). Each board has its own Store key
   (marathon.board.<id>) and data file (data/<id>.json) via core/sync.js.
   ========================================================================= */
(function (global) {
  'use strict';

  // ?board=<id> wins even when the registry (data/boards.json) has not synced
  // into this browser yet: the id is enough to pick the Store key and file,
  // and the title fills in once boards.json arrives.
  var wanted = Config.slug(new URLSearchParams(location.search).get('board') || '');
  var firstBoard = Config.boards()[0];
  // a workspace without boards still gets a provisional "board" so the page
  // can offer "+ Board" instead of crashing
  var BOARD = (wanted && Config.RESERVED.indexOf(wanted) < 0) ? wanted : (firstBoard ? firstBoard.id : 'board');
  var KEY = Config.boardKey(BOARD);
  var PROJ_KEY = KEY + '.projects';
  var PRI_RANK = { high: 0, medium: 1, low: 2 };
  var COLS = ['todo', 'doing', 'done', 'later', 'bucket'];
  var DEFAULT_PROJECTS = Config.projectNames();
  var KNOWN_TAGS = (Config.get('board.tags') || []).slice();

  // one-time migrations: open-source v1 keys, then the pre-open-source keys
  if (BOARD === 'runway' && Config.activeWs() === Config.PRIMARY) {
    Store.migrate('marathon.runway.v3', KEY) || Store.migrate('anshuli.runway.v2', KEY);
    Store.migrate('marathon.runway.projects', PROJ_KEY) || Store.migrate('anshuli.runway.projects.v1', PROJ_KEY);
  }

  /* ---- projects (user-extendable) ------------------------------------ */
  function loadCustomProjects() {
    var a = Store.getJSON(PROJ_KEY, []);
    return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string' && x.trim(); }) : [];
  }
  var customProjects = loadCustomProjects();

  // defaults + user-added + any project seen on a task, deduped (first wins)
  function getProjects() {
    var seen = {}, out = [];
    DEFAULT_PROJECTS.concat(customProjects).forEach(function (p) {
      if (p && !seen[p]) { seen[p] = 1; out.push(p); }
    });
    state.forEach(function (t) {
      if (t.proj && !seen[t.proj]) { seen[t.proj] = 1; out.push(t.proj); }
    });
    return out;
  }
  function addProject(name) {
    var v = (name || '').trim();
    if (!v) return null;
    var match = getProjects().filter(function (p) { return p.toLowerCase() === v.toLowerCase(); })[0];
    if (match) return match;
    customProjects.push(v);
    Store.setJSON(PROJ_KEY, customProjects);
    return v;
  }
  function setCustomProjects(arr, opts) {
    customProjects = Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string' && x.trim(); }) : [];
    Store.setJSON(PROJ_KEY, customProjects, opts);
  }

  /* ---- seed: the template sprint ------------------------------------- */
  function seed() { return MARATHON_TEMPLATES.runway().tasks; }

  /* ---- migration / normalization ------------------------------------- */
  function deriveTags(t) {
    if (Array.isArray(t.tags)) return t.tags.slice();
    var tags = t.type ? [String(t.type)] : [];
    var hay = (String(t.title || '') + ' ' +
      (Array.isArray(t.checklist) ? t.checklist.map(function (c) { return c && c.text ? c.text : ''; }).join(' ') : '')).toLowerCase();
    if (/\bvideo|record/.test(hay) && tags.indexOf('video') === -1) tags.push('video');
    return tags;
  }
  function normalize(arr) {
    return (arr || []).map(function (t) {
      var o = {
        id: t.id || ('t' + Math.abs(hash(JSON.stringify(t)))),
        title: t.title || '',
        desc: t.desc || '',
        proj: t.proj || DEFAULT_PROJECTS[0] || 'general',
        col: COLS.indexOf(t.col) !== -1 ? t.col : 'todo',
        pri: PRI_RANK.hasOwnProperty(t.pri) ? t.pri : (t.p1 ? 'high' : 'medium'),
        tags: deriveTags(t),
        notes: typeof t.notes === 'string' ? t.notes : '',
        collapsed: t.collapsed !== undefined ? !!t.collapsed : true,
        checklist: Array.isArray(t.checklist) ? t.checklist.map(function (c) {
          return { text: (c && c.text) || '', done: !!(c && c.done) };
        }) : []
      };
      // dates (core/when.js stamps, local time) and the id a connected calendar gave the item; kept only when set
      if (typeof t.at === 'string' && t.at) o.at = t.at;
      if (typeof t.until === 'string' && t.until) o.until = t.until;
      if (typeof t.due === 'string' && t.due) o.due = t.due;
      if (typeof t.ext === 'string' && t.ext) o.ext = t.ext;
      if (typeof t.extCol === 'string' && t.extCol) o.extCol = t.extCol;   // what the source said last import (a re-run moves the task only when that changes)
      if (typeof t.extPri === 'string' && t.extPri) o.extPri = t.extPri;
      ['noteId', 'scriptId', 'takeId', 'postId'].forEach(function (k) { if (typeof t[k] === 'string' && t[k]) o[k] = t[k]; });   // the pieces a task carries (a draft, a script, a take, a post; core/story.js)
      return o;
    });
  }
  function hash(s) {
    var h = 0, i;
    for (i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return h;
  }

  /* ---- state + persistence ------------------------------------------- */
  var state = load();
  var fresh = false;   // true when this browser had no board and got the template

  function load() {
    var raw = Store.get(KEY);
    if (raw) {
      try {
        var d = JSON.parse(raw);
        if (Array.isArray(d)) return normalize(d);
      } catch (e) { /* fall through to seed */ }
    }
    fresh = true;   // a first open: blank, or the sample when core/templates.js says so (Store.firstOpen)
    return normalize(Store.firstOpen(KEY, [], function () { return normalize(seed()); }));
  }
  function save(opts) { Store.setJSON(KEY, state, opts); }
  function byId(id) { return state.find(function (x) { return x.id === id; }); }
  function newId() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  /* ---- mutations ----------------------------------------------------- */
  function add(t) { state.unshift(normalize([t])[0]); save(); return state[0]; }
  function del(id) { state = state.filter(function (t) { return t.id !== id; }); save(); }
  function update(id, patch) {
    var t = byId(id); if (!t) return;
    Object.keys(patch || {}).forEach(function (k) { if (k !== 'id') t[k] = patch[k]; });
    state = normalize(state); save();
  }
  function setPri(id, val) {
    var t = byId(id); if (!t) return;
    t.pri = PRI_RANK.hasOwnProperty(val) ? val : 'medium'; save();
  }
  function move(id, dir) {
    var order = ['todo', 'doing', 'done'];
    var t = byId(id); if (!t) return;
    var ni = order.indexOf(t.col) + dir;
    if (ni < 0 || ni >= order.length) return;
    t.col = order[ni]; save();
  }
  function moveTo(id, col) {
    var t = byId(id);
    if (t && COLS.indexOf(col) !== -1) { t.col = col; save(); }
  }
  function toggleStep(id, idx) {
    var t = byId(id); if (!t || !t.checklist[idx]) return;
    t.checklist[idx].done = !t.checklist[idx].done; save();
  }
  function addStep(id, text) {
    var v = (text || '').trim(); if (!v) return;
    var t = byId(id); if (!t) return;
    t.checklist.push({ text: v, done: false }); save();
  }
  function delStep(id, idx) {
    var t = byId(id); if (!t) return;
    t.checklist.splice(idx, 1); save();
  }
  function addTag(id, tag) {
    var v = (tag || '').trim().toLowerCase(); if (!v) return;
    var t = byId(id); if (!t) return;
    if (t.tags.indexOf(v) === -1) t.tags.push(v); save();
  }
  function removeTag(id, tag) {
    var t = byId(id); if (!t) return;
    t.tags = t.tags.filter(function (x) { return x !== tag; }); save();
  }
  function setNotes(id, text) {
    var t = byId(id); if (!t) return;
    t.notes = text || ''; save();
  }
  function toggleCollapse(id) {
    var t = byId(id); if (!t) return;
    t.collapsed = !t.collapsed; save();
  }
  function setCollapsedAll(val) {
    state.forEach(function (t) { t.collapsed = !!val; }); save();
  }
  function reset() { state = normalize(seed()); save(); return state; }
  function replaceAll(arr, opts) { state = normalize(arr); save(opts); return state; }
  function clearAll() { state = []; save(); return state; }

  // find by id, or by case-insensitive title substring (used by the palette)
  function find(q) {
    q = String(q || '').trim(); if (!q) return [];
    var exact = byId(q); if (exact) return [exact];
    var l = q.toLowerCase();
    return state.filter(function (t) { return t.title.toLowerCase().indexOf(l) >= 0; });
  }

  /* ---- public API ---------------------------------------------------- */
  global.Model = {
    BOARD: BOARD, board: function () { return Config.board(BOARD) || { id: BOARD, title: BOARD, milestones: [], focus: [], sprintLabel: 'Progress' }; },
    KEY: KEY, PROJ_KEY: PROJ_KEY, PRI_RANK: PRI_RANK, COLS: COLS, DEFAULT_PROJECTS: DEFAULT_PROJECTS, KNOWN_TAGS: KNOWN_TAGS,
    getProjects: getProjects, addProject: addProject, getCustomProjects: function () { return customProjects.slice(); }, setCustomProjects: setCustomProjects,
    seed: seed, normalize: normalize, newId: newId, isFresh: function () { return Store.isFresh(KEY); },   // the shared flag only: the first real write clears it (a module flag would stay true and let a file overwrite what was typed)
    isSample: function () { return Store.isSample(KEY); },   // untouched sample tasks (Load sample board, an older first open), not merely empty
    getState: function () { return state; },
    save: save, find: find,
    add: add, del: del, update: update, setPri: setPri, move: move, moveTo: moveTo,
    toggleStep: toggleStep, addStep: addStep, delStep: delStep,
    addTag: addTag, removeTag: removeTag, setNotes: setNotes,
    toggleCollapse: toggleCollapse, setCollapsedAll: setCollapsedAll,
    reset: reset, replaceAll: replaceAll, clearAll: clearAll
  };
})(window);
