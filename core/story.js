/* core/story.js — a task carries its pieces: a draft, a script, a take, a post.
   No new file and no new id. A task on any board may hold `noteId`, `scriptId`,
   `takeId`, `postId`; the pieces keep their own pointers too (a script remembers
   the draft it came from, a take its script and its post, a post its draft or
   script). This file walks the pointers both ways (the pure part, shared with the
   CLI's `link` and `story`) and draws the one line the views show: "Task: …" with
   the filled pills, or "Connect with a task…". A page writes only its own file;
   every other connection runs through the server (`node solo.js link`), with the
   terminal line as the fallback. Classic script + require(), like core/video.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Story = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KINDS = ['task', 'note', 'script', 'take', 'post'];              // the order of a story
  var PIECES = ['note', 'script', 'take', 'post'];
  var WORD = { task: 'Task', note: 'Draft', script: 'Script', take: 'Take', post: 'Post' };
  var PLURAL = { task: 'Tasks', note: 'Drafts', script: 'Scripts', take: 'Takes', post: 'Posts' };
  var APP = { note: 'writing', script: 'scripts', take: 'videos', post: 'social' };
  var TAG = { note: 'writing', script: 'script', take: 'video' };      // the board tag that makes a task a suggestion for that view
  var FIELD = { note: 'noteId', script: 'scriptId', take: 'takeId', post: 'postId' };
  var COL = { todo: 'To do', doing: 'Doing', done: 'Done', later: 'Later', bucket: 'Bucket' };
  // every pointer: which kind holds it, the field, what it points at
  var POINTERS = [
    { holder: 'task', field: 'noteId', target: 'note' }, { holder: 'task', field: 'scriptId', target: 'script' }, { holder: 'task', field: 'takeId', target: 'take' }, { holder: 'task', field: 'postId', target: 'post' },
    { holder: 'script', field: 'noteId', target: 'note' },
    { holder: 'take', field: 'scriptId', target: 'script' }, { holder: 'take', field: 'postId', target: 'post' },
    { holder: 'post', field: 'noteId', target: 'note' }, { holder: 'post', field: 'scriptId', target: 'script' }
  ];
  // upstream>downstream → where the pointer lives (the take → post edge lives on the take: `video post` wrote it first)
  var PAIR = { 'task>note': { holder: 'task', field: 'noteId' }, 'task>script': { holder: 'task', field: 'scriptId' }, 'task>take': { holder: 'task', field: 'takeId' }, 'task>post': { holder: 'task', field: 'postId' },
    'note>script': { holder: 'script', field: 'noteId' }, 'note>post': { holder: 'post', field: 'noteId' }, 'script>take': { holder: 'take', field: 'scriptId' }, 'script>post': { holder: 'post', field: 'scriptId' }, 'take>post': { holder: 'take', field: 'postId' } };
  var MAX = 40;

  function titleOf(text) { var m = String(text || '').match(/^#\s+(.+)/m); return m ? m[1].trim().slice(0, 60) : (String(text || '').split('\n').filter(function (l) { return l.trim(); })[0] || 'Untitled').slice(0, 56); }
  function clean(text) { return String(text || '').replace(/~~[\s\S]*?~~/g, '').replace(/\+\+([\s\S]*?)\+\+/g, '$1').replace(/\[\[[\s\S]*?\]\]/g, '').replace(/^#\s+.+\n?/m, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?;:])/g, '$1').replace(/\n{3,}/g, '\n\n').trim(); }   // a draft without its markup and its title line
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function when(s) {   // "Fri 09:00" this week, "24 Oct 09:00" otherwise; a bad date prints as it is
    var d = new Date(String(s || '')); if (isNaN(d)) return String(s || ''); var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var diff = (d - new Date()) / 86400000; var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    return (diff > -1 && diff < 6 ? days[d.getDay()] : d.getDate() + ' ' + months[d.getMonth()]) + ' ' + hm;
  }
  function fmt(sec) { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ':' + pad(sec % 60); }
  function runtime(take) { var e = take.edl || []; if (!e.length) return (take.sources && take.sources[0] && take.sources[0].duration) || 0; return e.reduce(function (a, s) { return a + Math.max(0, (s.end || 0) - (s.start || 0)); }, 0); }
  function tomorrow9() { var d = new Date(); d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T09:00'; }
  function tag(item) { var d = new Date(item.createdAt || item.updatedAt || 0); if (!(item.createdAt || item.updatedAt) || isNaN(d)) return ''; var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return d.getDate() + ' ' + months[d.getMonth()] + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }   // tells two same-titled items apart

  /* data = { task: [], note: [], script: [], take: [], post: [] }: ONE workspace (tasks from every board of it, each copy tagged with `_board`) */
  function empty() { return { task: [], note: [], script: [], take: [], post: [] }; }
  function titleFor(kind, item) { return kind === 'note' ? titleOf(item.text) : kind === 'script' ? (item.title || titleOf(item.text)) : (item.title || 'Untitled'); }
  function stateFor(kind, item) {
    if (kind === 'task') return (COL[item.col] || item.col || '') + (item._board && item._board !== 'runway' ? ' · ' + item._board : '');
    if (kind === 'take') { var st = item.status || 'recorded'; if (st === 'cut' || st === 'rendered') return st + ' ' + fmt(runtime(item)); return st === 'recorded' ? 'no words yet' : st; }
    if (kind === 'post') return when(item.datetime) + (item.status ? ' · ' + item.status : '');
    return '';
  }
  function describe(kind, item) { if (item && item.missing) return WORD[kind] + ': missing'; var s = stateFor(kind, item); return WORD[kind] + ': ' + titleFor(kind, item) + (s ? ' · ' + s : ''); }
  function dupTitles(items, kindOf) { var seen = {}; var dup = {}; items.forEach(function (x) { var k = kindOf(x) + ':' + titleFor(kindOf(x), x.item || x).toLowerCase(); if (seen[k]) dup[k] = 1; seen[k] = 1; }); return function (kind, item) { return !!dup[kind + ':' + titleFor(kind, item).toLowerCase()]; }; }
  function lookup(data, q) {   // an id, else the one title that contains q
    q = String(q || '').trim(); if (!q) return null;
    for (var i = 0; i < KINDS.length; i++) { var k = KINDS[i]; var hit = (data[k] || []).filter(function (x) { return x && x.id === q; })[0]; if (hit) return { kind: k, item: hit }; }
    var low = q.toLowerCase(); var hits = [];
    KINDS.forEach(function (k) { (data[k] || []).forEach(function (x) { if (x && titleFor(k, x).toLowerCase().indexOf(low) >= 0) hits.push({ kind: k, item: x }); }); });
    if (hits.length > 1) { var e = new Error('Several match "' + q + '": ' + hits.slice(0, 6).map(function (h) { return describe(h.kind, h.item) + ' [' + h.item.id + ']'; }).join(' · ') + '. Give the id.'); e.ambiguous = true; throw e; }
    return hits[0] || null;
  }
  function missingRef(data, id) { for (var i = 0; i < POINTERS.length; i++) { var p = POINTERS[i]; if ((data[p.holder] || []).some(function (x) { return x && x[p.field] === id; })) return { kind: p.target, item: { id: id, missing: true }, missing: true }; } return null; }

  /* every item reachable through the pointers, in story order; a pointer to nothing is a member with missing: true */
  function of(data, kind, id) {
    data = data || empty(); var seen = {}; var queue = [{ kind: kind, id: id }]; var members = [];
    while (queue.length && members.length < MAX) {
      var q = queue.shift(); var key = q.kind + ':' + q.id; if (seen[key]) continue; seen[key] = 1;
      var item = (data[q.kind] || []).filter(function (x) { return x && x.id === q.id; })[0];
      if (!item) { if (q.id) members.push({ kind: q.kind, id: q.id, missing: true, title: 'missing', state: '' }); continue; }
      members.push({ kind: q.kind, id: q.id, item: item, title: titleFor(q.kind, item), state: stateFor(q.kind, item) });
      POINTERS.forEach(function (p) {
        if (p.holder === q.kind && item[p.field]) queue.push({ kind: p.target, id: item[p.field] });
        if (p.target === q.kind) (data[p.holder] || []).forEach(function (x) { if (x && x[p.field] === q.id) queue.push({ kind: p.holder, id: x.id }); });
      });
    }
    members.sort(function (a, b) { var ka = KINDS.indexOf(a.kind), kb = KINDS.indexOf(b.kind); if (ka !== kb) return ka - kb; if (!!a.missing !== !!b.missing) return a.missing ? 1 : -1; if (a.missing) return 0; if (a.kind === 'post') return String(a.item.datetime || '').localeCompare(String(b.item.datetime || '')); return ((b.item.createdAt || b.item.updatedAt) || 0) - ((a.item.createdAt || a.item.updatedAt) || 0); });
    return members;
  }
  function byKind(members) { var g = {}; KINDS.forEach(function (k) { g[k] = members.filter(function (m) { return m.kind === k; }); }); return g; }
  function connected(members) { return members.length > 1; }
  function text(members) {   // one line, for `story`, the show commands and the {{this}} / {{take}} / {{board}} tokens
    var g = byKind(members); var parts = []; var dup = dupTitles(members.filter(function (m) { return !m.missing; }), function (m) { return m.kind; });
    KINDS.forEach(function (k) { if (!g[k].length) return; var items = g[k].map(function (m) { return m.missing ? 'missing (' + m.id + ')' : m.title + (dup(k, m.item) && tag(m.item) ? ' · ' + tag(m.item) : '') + (m.state ? ' (' + m.state + ')' : '') + ' [' + m.id + ']'; }); parts.push((g[k].length > 1 ? PLURAL[k] : WORD[k]) + ': ' + items.join(' · ')); });
    return parts.join(' → ');
  }
  /* the task a piece belongs to (the first one found), and a task's pieces, one per kind */
  function taskOf(data, kind, id) { if (kind === 'task') return (data.task || []).filter(function (t) { return t.id === id; })[0] || null; var ms = of(data, kind, id); var t = ms.filter(function (m) { return m.kind === 'task' && !m.missing; })[0]; return t ? t.item : null; }
  function piecesOf(data, taskId, t) {   // t: the task object when it is not (yet) in data, e.g. a card being drawn from the page's own model
    var d = data; if (t && !(data.task || []).some(function (x) { return x && x.id === taskId; })) d = Object.assign({}, data, { task: (data.task || []).concat([t]) });
    var g = byKind(of(d, 'task', taskId)); var out = {}; PIECES.forEach(function (k) { out[k] = g[k].filter(function (m) { return !m.missing; })[0] || null; }); return out;
  }
  function isContent(t) { return !!(t && ((t.tags || []).some(function (x) { return x === 'writing' || x === 'script' || x === 'video'; }) || t.noteId || t.scriptId || t.takeId || t.postId)); }   // only such a task shows pills and a next step
  /* the one next step for a task: follows the tag and what exists; a draft is never forced */
  function nextStep(data, t) {
    if (!t || !isContent(t)) return null; var p = piecesOf(data, t.id, t); var tags = t.tags || []; var writingOnly = tags.indexOf('writing') >= 0 && tags.indexOf('script') < 0 && tags.indexOf('video') < 0 && !p.script && !p.take;
    if (writingOnly) { if (!p.note) return { kind: 'note', label: 'Write the draft' }; if (!p.post) return { kind: 'post', label: 'Make the post' }; return null; }   // an essay never becomes a script
    if (tags.indexOf('writing') >= 0 && !p.note && !p.script) return { kind: 'note', label: 'Write the draft' };
    if (!p.script && !p.take) return { kind: 'script', label: 'Start the script' };
    if (!p.take) return { kind: 'take', label: 'Add the take' };
    if (p.take.item.status !== 'rendered' && !p.post) return { kind: 'cut', label: 'Cut the take' };   // opens the take; the Video page says what comes next
    if (!p.post && p.take.item.status === 'rendered') return { kind: 'post', label: 'Make the post' };
    return null;
  }
  /* tasks worth suggesting in a view: tagged for it, in To do or Doing (Doing first), without that piece yet */
  function suggestions(data, kind, limit) {
    var want = TAG[kind]; if (!want) return { list: [], more: 0 };
    var all = (data.task || []).filter(function (t) { if (!(t.col === 'todo' || t.col === 'doing')) return false; var tags = t.tags || []; var p = piecesOf(data, t.id); if (p[kind]) return false;
      if (tags.indexOf(want) >= 0) return true; return kind === 'script' && tags.indexOf('video') >= 0 && !p.take; });   // a video task starts with its script, so it is a Script suggestion too
    all.sort(function (a, b) { var da = a.col === 'doing' ? 0 : 1, db = b.col === 'doing' ? 0 : 1; if (da !== db) return da - db; if (kind === 'take') { var sa = piecesOf(data, a.id).script ? 0 : 1, sb = piecesOf(data, b.id).script ? 0 : 1; return sa - sb; } return 0; });
    var n = limit || 5; return { list: all.slice(0, n), more: Math.max(0, all.length - n) };
  }

  /* which item gets which pointer when a and b are connected; throws a plain sentence when the pair makes no story */
  function pair(data, aQ, bQ) {
    var a = lookup(data, aQ) || missingRef(data, aQ), b = lookup(data, bQ) || missingRef(data, bQ);
    if (!a) throw new Error('No task, draft, script, take or post here matches "' + aQ + '"');
    if (!b) throw new Error('No task, draft, script, take or post here matches "' + bQ + '"');
    if (a.missing && b.missing) throw new Error('Neither of those exists any more.');
    if (a.kind === b.kind) throw new Error('Two ' + PLURAL[a.kind].toLowerCase() + ' cannot be one story; connect a task with its draft, script, take or post.');
    var up = KINDS.indexOf(a.kind) < KINDS.indexOf(b.kind) ? a : b; var down = up === a ? b : a;
    var p = PAIR[up.kind + '>' + down.kind]; if (!p) throw new Error('A ' + WORD[up.kind].toLowerCase() + ' connects to a ' + WORD[down.kind].toLowerCase() + ' through a script: connect the script first.');
    var holder = p.holder === up.kind ? up : down; var target = holder === up ? down : up;
    return { up: up, down: down, holder: holder, field: p.field, target: target };
  }
  function direct(data, aId, bId) { var p; try { p = pair(data, aId, bId); } catch (e) { return null; } return p.holder.item[p.field] === p.target.item.id ? p : null; }
  /* what a new piece made from `from` should carry (the CLI and the pages build the same thing) */
  function noteFrom(task) { return { text: '# ' + (task.title || 'Untitled') + '\n\n' + (task.desc || '') + (task.desc ? '\n' : '') }; }
  function scriptFrom(kind, item) { var t = titleFor(kind, item); var body = kind === 'note' ? clean(item.text) : kind === 'task' ? String(item.desc || '').trim() : ''; return { title: t, text: '# ' + t + '\n\n## Hook\n\n## Script\n' + (body ? body + '\n' : '1. \n'), noteId: kind === 'note' ? item.id : '' }; }
  function postFrom(kind, item) {
    var t = titleFor(kind, item); var np = { datetime: tomorrow9(), title: t, format: kind === 'note' || kind === 'task' ? 'text' : 'video', copy: kind === 'note' ? clean(item.text) : kind === 'task' ? String(item.desc || '').trim() : '', video: { title: kind === 'note' || kind === 'task' ? '' : t, status: kind === 'script' ? 'scripted' : kind === 'take' ? ((item.status === 'cut' || item.status === 'rendered') ? 'edited' : 'recorded') : 'none', notes: '', link: '' }, status: 'draft' };
    if (kind === 'note') np.noteId = item.id; if (kind === 'script') np.scriptId = item.id; if (kind === 'take' && item.scriptId) np.scriptId = item.scriptId;
    return np;
  }

  /* ---------- browser part: the line on the views, the pills on the card, the suggestions ---------- */
  var B = {};
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    var hooks = []; var open = {}; var cache = null;   // open: id → true while its picker shows; cache: the parsed data between changes
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function ws() { return window.Config && Config.activeWs ? Config.activeWs() : undefined; }
    function rootPath() { return /\/(studio|social|runway|inspo|calendar)\//.test(location.pathname) ? '../' : ''; }
    function keyOf(kind) { return Config.key(APP[kind], ws()); }
    function fileOf(kind) { return Config.file(APP[kind], ws()); }
    function server() { return !!(window.Sync && Sync.getMode && Sync.getMode() === 'server'); }
    function wsQ() { var w = ws(); return w ? '&ws=' + encodeURIComponent(w) : ''; }
    function wsFlag() { var w = ws(); return w && Config.PRIMARY && w !== Config.PRIMARY ? ' --ws ' + w : ''; }
    function boards() { return window.Config && Config.boards ? Config.boards(ws()) : []; }
    function boardTitle(id) { var b = boards().filter(function (x) { return x.id === id; })[0]; return b ? (b.title || b.id) : (id || ''); }
    function load() {   // the four files and every board of the workspace, from the browser copies; cached until something changes
      if (cache) return cache; var d = empty(); var wr = Store.getJSON(keyOf('note'), null); var sc = Store.getJSON(keyOf('script'), null); var vd = Store.getJSON(keyOf('take'), null); var so = Store.getJSON(keyOf('post'), null);
      d.note = wr && Array.isArray(wr.notes) ? wr.notes : []; d.script = sc && Array.isArray(sc.scripts) ? sc.scripts : []; d.take = vd && Array.isArray(vd.videos) ? vd.videos : []; d.post = Array.isArray(so) ? so : [];
      boards().forEach(function (b) { var ts = Store.getJSON(Config.boardKey(b.id, ws()), null); if (Array.isArray(ts)) ts.forEach(function (t) { if (t && t.id) d.task.push(Object.assign({ _board: b.id }, t)); }); });
      cache = d; return d;
    }
    function invalidate() { cache = null; }
    if (window.Store && Store.onChange) Store.onChange(function () { invalidate(); });
    function pageUrl(kind, id, item) { var r = rootPath(); var q = wsQ(); if (kind === 'task') return r + 'runway/marathon-board.html?id=' + encodeURIComponent(id) + (item && item._board ? '&board=' + encodeURIComponent(item._board) : '') + q; return kind === 'post' ? r + 'social/social-board.html?id=' + encodeURIComponent(id) + q : r + 'studio/' + (kind === 'note' ? 'writing-viewer' : kind === 'script' ? 'script-viewer' : 'video') + '.html?open=' + encodeURIComponent(id) + q; }
    function here(kind) { var p = location.pathname; return kind === 'task' ? /marathon-board/.test(p) : kind === 'note' ? /writing-viewer/.test(p) : kind === 'script' ? /script-viewer/.test(p) : kind === 'take' ? /video\.html/.test(p) : /social-board/.test(p); }
    // the sibling files this page does not own: read-only, the file always wins, never written back (the pattern core/context.js uses for takes)
    function register() {
      if (!window.Sync || !Sync.register) return;
      PIECES.forEach(function (kind) {
        if (here(kind)) return; var file = fileOf(kind); var key = keyOf(kind); if ((Sync.specs || []).some(function (s) { return s.file === file; })) return;
        Sync.register({ file: file, key: key, label: PLURAL[kind].toLowerCase(), app: APP[kind] === 'videos' ? 'video' : APP[kind], activity: false, readOnly: true, isFresh: function () { return Store.get(key) == null; },
          read: function () { var cur = Store.getJSON(key, null); return kind === 'post' ? { posts: Array.isArray(cur) ? cur : [] } : (cur || {}); },
          apply: function (body) { Store.setJSON(key, kind === 'post' ? (Array.isArray(body) ? body : body && Array.isArray(body.posts) ? body.posts : []) : (body && typeof body === 'object' ? body : {}), { silent: true }); invalidate(); } });
      });
      if (!here('task')) boards().forEach(function (b) {   // every board of the workspace, read-only (the board page registers its own, writable, and needs no other)
        var file = Config.boardFile(b.id, ws()); var key = Config.boardKey(b.id, ws()); if ((Sync.specs || []).some(function (s) { return s.file === file; })) return;
        Sync.register({ file: file, key: key, label: 'tasks', app: 'board', activity: false, readOnly: true, isFresh: function () { return Store.get(key) == null; },
          read: function () { var cur = Store.getJSON(key, null); return { projects: [], tasks: Array.isArray(cur) ? cur : [] }; },
          apply: function (body) { Store.setJSON(key, body && Array.isArray(body.tasks) ? body.tasks : [], { silent: true }); invalidate(); } });
      });
      if (!register.bound && Sync.on) { register.bound = true; Sync.on(function (ev, d) { if (ev !== 'applied' && ev !== 'pulled') return; invalidate(); if (ev === 'applied' && d && d.file === 'boards.json') register(); if (ev === 'pulled' || !d || !d.file || /(^|-)(writing|scripts|videos|social)\.json$/.test(d.file) || boards().some(function (b) { return Config.boardFile(b.id, ws()) === d.file; })) fire(); }); }   // only the files a story reads repaint the pages
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(register, 0); }); else setTimeout(register, 0);
    function fire() { invalidate(); hooks.forEach(function (fn) { try { fn(); } catch (e) { /* a page's repaint failed; the data is written */ } }); }
    function api(body) { return fetch('/api/story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ ws: ws() }, body)) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('the server answered ' + r.status)); return j; }); }); }
    function copy(t) { try { navigator.clipboard.writeText(t); } catch (e) { /* no clipboard */ } }
    function needServer(line) { copy(line); return new Error('Needs node serve.js running. Copied the terminal line instead: ' + line); }
    function pulled() { return window.Sync && Sync.pullAll ? Sync.pullAll(false) : Promise.resolve(); }
    /* a connection: the task's field on the board page through its own model; the script's / the post's field through their own models; anything else through the CLI on the server */
    function write(p, off) {
      var patch = {}; patch[p.field] = off ? '' : p.target.item.id; var note = (off ? 'disconnected ' : 'connected ') + WORD[p.holder.kind].toLowerCase() + (off ? ' from ' : ' to ') + WORD[p.target.kind].toLowerCase() + ' ' + titleFor(p.target.kind, p.target.item);
      if (p.holder.kind === 'task' && here('task') && window.Model && Model.update && Model.getState().some(function (t) { return t.id === p.holder.item.id; })) { Model.update(p.holder.item.id, patch); if (window.Sync && Sync.note) Sync.note(Config.boardFile(Model.BOARD, ws()), note); return Promise.resolve(); }
      if (p.holder.kind === 'post' && here('post') && window.SocialModel && SocialModel.updatePost) { SocialModel.updatePost(p.holder.item.id, patch); if (window.Sync && Sync.note) Sync.note(fileOf('post'), note); return Promise.resolve(); }
      if (p.holder.kind === 'script' && here('script') && typeof library !== 'undefined' && library && library.scripts && typeof persistLibrary === 'function') { var s = library.scripts.filter(function (x) { return x.id === p.holder.item.id; })[0]; if (s) { s.noteId = patch.noteId; s.updatedAt = Date.now(); if (window.Sync && Sync.note) Sync.note(fileOf('script'), note); persistLibrary(); } return Promise.resolve(); }
      var line = 'node solo.js link ' + p.up.item.id + ' ' + p.down.item.id + (off ? ' --off' : '') + wsFlag();
      if (!server()) return Promise.reject(needServer(line));
      return api({ op: off ? 'unlink' : 'link', a: p.up.item.id, b: p.down.item.id }).then(pulled);
    }
    function connect(aId, bId) { var d = load(); var p; try { p = pair(d, aId, bId); } catch (e) { return Promise.reject(e); } if (p.target.missing || p.holder.missing) return Promise.reject(new Error('One of those was deleted; it cannot be connected.')); var before = p.holder.item[p.field]; var was = before && before !== p.target.item.id ? lookup(d, before) : null; return write(p, false).then(function () { fire(); p.was = was; return p; }); }
    function disconnect(aId, bId) { var p; try { p = pair(load(), aId, bId); } catch (e) { return Promise.reject(e); } return write(p, true).then(function () { fire(); return p; }); }

    /* pills: the pieces a task holds, filled when they exist; `all` draws the empty ones too (the expanded card) */
    function pills(taskId, all, t) {
      var d = load(); var p = piecesOf(d, taskId, t); var out = '';
      PIECES.forEach(function (k) { var m = p[k]; if (!m && !all) return; out += m ? '<a class="st-pill on" href="' + esc(pageUrl(k, m.id, m.item)) + '" title="' + esc(describe(k, m.item)) + '">' + WORD[k] + '</a>' : '<span class="st-pill">' + WORD[k] + '</span>'; });
      return out;
    }
    /* the line on a view: "Task: title" with the filled pills and ×, or "Connect with a task…" */
    function taskLine(kind, id) {
      var d = load(); var t = taskOf(d, kind, id); var out = '<span class="st-line" data-story="' + esc(id) + '">';
      if (t) { out += '<a class="st-task" href="' + esc(pageUrl('task', t.id, t)) + '" title="' + esc(describe('task', t)) + '">Task: ' + esc(t.title) + '</a>' + pills(t.id, false) + (direct(d, t.id, id) ? '<button type="button" class="st-off" onclick="taskDetach(\'' + esc(id) + '\',\'' + esc(t.id) + '\')" title="Disconnect from the task (keeps both)">×</button>' : ''); }
      else { out += open[id] ? taskPicker(kind, id) : '<button type="button" class="guide-link st-connect" onclick="taskConnect(\'' + esc(kind) + '\',\'' + esc(id) + '\')">Connect with a task…</button>'; }
      return out + '</span>';
    }
    function taskPicker(kind, id) {
      var d = load(); var ts = (d.task || []).filter(function (t) { return t.col !== 'done' && t.col !== 'later' && t.col !== 'bucket' && !t[FIELD[kind]]; });
      var want = TAG[kind]; ts.sort(function (a, b) { var ta = (a.tags || []).indexOf(want) >= 0 ? 0 : 1, tb = (b.tags || []).indexOf(want) >= 0 ? 0 : 1; if (ta !== tb) return ta - tb; var ca = a.col === 'doing' ? 0 : 1, cb = b.col === 'doing' ? 0 : 1; return ca - cb; });
      var many = boards().length > 1; var item = (d[kind] || []).filter(function (x) { return x.id === id; })[0]; var title = item ? titleFor(kind, item) : ''; var b0 = boards()[0];
      var opts = ts.slice(0, 80).map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.title + ' · ' + (many ? boardTitle(t._board) + ' · ' : '') + (COL[t.col] || t.col)) + '</option>'; }).join('');
      return '<span class="st-pick"><select id="taskPick"><option value="">' + (ts.length ? 'Choose a task…' : 'No open task yet') + '</option>' + opts + '</select><button type="button" class="btn small primary" onclick="taskPicked(\'' + esc(kind) + '\',\'' + esc(id) + '\')">Connect</button>' +
        '<span class="st-or">or new task</span><input type="text" id="taskNew" value="' + esc(title) + '" maxlength="120" placeholder="Task title" onkeydown="if(event.key===\'Enter\')taskCreate(\'' + esc(kind) + '\',\'' + esc(id) + '\')"><button type="button" class="btn small" onclick="taskCreate(\'' + esc(kind) + '\',\'' + esc(id) + '\')" title="' + esc('A new task on ' + (b0 ? b0.title || b0.id : 'the board') + ', in To do' + (want ? ', tagged ' + want : '') + ', with this attached') + '">Create</button><button type="button" class="btn small ghost" onclick="taskConnect(\'' + esc(kind) + '\',\'' + esc(id) + '\')">Cancel</button></span>';
    }
    /* the suggestions at the top of a view's list: tasks tagged for it, with the card's own verb */
    function suggestionsHtml(kind) {
      var d = load(); var s = suggestions(d, kind, 5); if (!s.list.length) return ''; var many = boards().length > 1; var verb = kind === 'note' ? 'Write the draft' : kind === 'script' ? 'Start the script' : 'Add the take';
      return '<details class="st-sugg" open><summary title="' + esc('Tasks tagged ' + TAG[kind] + ' that do not have this piece yet') + '">From your board' + (many ? 's' : '') + '</summary>' + s.list.map(function (t) {
        return '<div class="st-srow"><a href="' + esc(pageUrl('task', t.id, t)) + '" title="Open the card">' + esc(t.title) + '</a><div class="st-smeta"><span class="muted">' + esc((many ? boardTitle(t._board) + ' · ' : '') + (COL[t.col] || t.col)) + '</span><button type="button" class="btn small" onclick="taskMake(\'' + esc(t.id) + '\',\'' + esc(kind) + '\')">' + verb + '</button></div></div>'; }).join('') +
        (s.more ? '<a class="muted st-more" href="' + esc(rootPath() + 'runway/marathon-board.html?' + wsQ().slice(1)) + '">+' + s.more + ' more on the board</a>' : '') + '</details>';
    }
    /* a piece made for a task, through the CLI: one process creates it and links it; the take needs a file, so Video opens with the box */
    function makeFor(taskId, kind) {
      var r = rootPath(); var d = load(); var t = (d.task || []).filter(function (x) { return x.id === taskId; })[0]; if (!t) return Promise.reject(new Error('That task is not here any more'));
      if (kind === 'take') { location.href = r + 'studio/video.html?add=1&task=' + encodeURIComponent(taskId) + wsQ(); return Promise.resolve(''); }
      if (kind === 'cut') { var pc = piecesOf(d, taskId); if (pc.take) location.href = pageUrl('take', pc.take.id, pc.take.item); return Promise.resolve(''); }
      var line = kind === 'note' ? 'node solo.js notes add --task ' + taskId + wsFlag() : kind === 'script' ? 'node solo.js scripts add --task ' + taskId + (t.noteId ? ' --draft ' + t.noteId : '') + wsFlag() : 'node solo.js social add --task ' + taskId + wsFlag();
      if (!server()) return Promise.reject(needServer(line));
      return api({ op: kind, task: taskId }).then(function (res) { var nid = res && (res.id || (res.post && res.post.id)); if (!nid) throw new Error('Nothing came back'); return pulled().then(function () { fire(); return nid; }); });
    }
    function openPiece(kind, nid) { var r = rootPath(); location.href = kind === 'post' ? r + 'social/social-board.html?id=' + encodeURIComponent(nid) + wsQ() : r + 'studio/' + (kind === 'note' ? 'writing-viewer' : 'script-viewer') + '.html?open=' + encodeURIComponent(nid) + wsQ(); }

    /* globals the markup calls */
    window.taskConnect = function (kind, id) { open[id] = !open[id]; fire(); setTimeout(function () { var s = document.getElementById('taskPick'); if (s) s.focus(); }, 0); };
    window.taskPicked = function (kind, id) { var s = document.getElementById('taskPick'); var tid = s && s.value; if (!tid) return; connect(tid, id).then(function (p) { open[id] = false; fire(); B.flash('Connected to ' + describe('task', p.up.item)); }).catch(function (e) { B.flash(e.message); }); };
    window.taskCreate = function (kind, id) { var inp = document.getElementById('taskNew'); var title = inp && inp.value.trim(); if (!title) { if (inp) inp.focus(); return; } var b0 = boards()[0]; var line = 'node solo.js add "' + title.replace(/"/g, '') + '"' + (TAG[kind] ? ' --tags ' + TAG[kind] : '') + ' --' + (kind === 'note' ? 'draft' : kind) + ' ' + id + wsFlag(); if (!server()) { B.flash(needServer(line).message); return; }
      api({ op: 'task', title: title.slice(0, 120), kind: kind, id: id, board: b0 ? b0.id : '', note: 'made from the ' + WORD[kind].toLowerCase() + ' ' + title.slice(0, 40) + ', attached' }).then(function () { open[id] = false; return pulled(); }).then(function () { fire(); B.flash('Task made on ' + (b0 ? b0.title || b0.id : 'the board') + ', in To do, with this attached'); }).catch(function (e) { B.flash(e.message); }); };
    window.taskDetach = function (id, tid) { disconnect(tid, id).then(function () { B.flash('Disconnected from the task (both are still there)'); }).catch(function (e) { B.flash(e.message); }); };
    window.taskMake = function (taskId, kind) { makeFor(taskId, kind).then(function (nid) { if (nid) openPiece(kind, nid); }).catch(function (e) { B.flash(e.message); }); };
    B.flash = function (msg) { var t = document.getElementById('toast') || document.getElementById('flash'); if (!t) { if (window.showToast) showToast(msg); else if (typeof window.flash === 'function') window.flash(msg); return; } t.textContent = msg; t.classList.add('show'); clearTimeout(B.flash._t); B.flash._t = setTimeout(function () { t.classList.remove('show'); }, 3200); };
    B.load = load; B.invalidate = invalidate; B.connect = connect; B.disconnect = disconnect; B.onWrite = function (fn) { hooks.push(fn); }; B.pageUrl = pageUrl; B.server = server;
    B.taskLine = taskLine; B.pills = pills; B.suggestionsHtml = suggestionsHtml; B.makeFor = makeFor; B.openPiece = openPiece;
    B.line = function (kind, id) { var ms = of(load(), kind, id); return connected(ms) ? text(ms) : ''; };   // for the tokens
    B.taskText = function (kind, id) { var t = taskOf(load(), kind, id); return t ? 'Task: ' + t.title + ' (' + stateFor('task', t) + ') [' + t.id + ']' : 'no task yet'; };
    B.openParam = function (name) { try { return new URLSearchParams(location.search).get(name || 'open') || ''; } catch (e) { return ''; } };
    B.clearQuery = function (names) { try { var u = new URL(location.href); names.forEach(function (n) { u.searchParams.delete(n); }); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } catch (e) { /* no history api */ } };   // a deep link is consumed once
    var CSS = '.st-line{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);max-width:100%}.st-task{color:var(--ink);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:3px 9px;background:var(--panel-2)}.st-task:hover{text-decoration:underline}.st-pill{font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;border-radius:999px;border:1px solid var(--line);color:var(--faint);text-decoration:none}.st-pill.on{border-color:var(--accent);color:var(--accent)}.st-pill.on:hover{background:var(--panel-2)}.st-off{border:0;background:none;color:var(--faint);cursor:pointer;font:inherit;font-size:14px;padding:0 2px;line-height:1}.st-off:hover{color:var(--ink)}.st-connect{font-size:12px}.st-pick{display:inline-flex;min-width:0;max-width:100%;flex-wrap:wrap;gap:6px;align-items:center}.st-pick .btn{flex:none}.st-pick select{flex:1 1 160px;min-width:0;font:inherit;font-size:12.5px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}.st-pick input{flex:1 1 140px;min-width:0;font:inherit;font-size:12.5px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}.st-or{font-size:11.5px;color:var(--faint)}.st-sugg{margin:4px 8px 10px;padding:6px 8px;border:1px dashed var(--line);border-radius:8px;font-size:12px;color:var(--muted)}.st-sugg summary{cursor:pointer;list-style:none;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}.st-sugg summary::-webkit-details-marker{display:none}.st-srow{display:flex;flex-direction:column;gap:4px;padding:6px 0;border-top:1px solid var(--line)}.st-srow a{color:var(--ink);text-decoration:none;font-size:12.5px;line-height:1.35}.st-smeta{display:flex;align-items:center;justify-content:space-between;gap:8px}.st-srow a:hover{text-decoration:underline}.st-srow .btn{flex:none;height:26px;padding:0 8px;font-size:11.5px}.st-more{display:block;padding-top:6px;font-size:11.5px}';
    (function () { if (document.getElementById('storyCss')) return; var st = document.createElement('style'); st.id = 'storyCss'; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); })();
  }

  var api = { KINDS: KINDS, PIECES: PIECES, WORD: WORD, PLURAL: PLURAL, APP: APP, TAG: TAG, FIELD: FIELD, COL: COL, PAIR: PAIR, POINTERS: POINTERS, empty: empty, lookup: lookup, of: of, byKind: byKind, connected: connected, text: text, pair: pair, direct: direct, missingRef: missingRef, tag: tag, dupTitles: dupTitles, describe: describe, titleFor: titleFor, stateFor: stateFor, titleOf: titleOf, clean: clean, when: when, taskOf: taskOf, piecesOf: piecesOf, isContent: isContent, nextStep: nextStep, suggestions: suggestions, noteFrom: noteFrom, scriptFrom: scriptFrom, postFrom: postFrom, tomorrow9: tomorrow9 };
  Object.keys(B).forEach(function (k) { api[k] = B[k]; });
  return api;
}));
