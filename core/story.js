/* core/story.js — one story across a draft, a script, its takes and the posts.
   No new file and no new id: a script keeps the draft it came from (noteId), a take
   its script (scriptId) and the post made from it (postId, written by `video post`),
   a post the draft or the script it came from (noteId / scriptId). This file walks
   those pointers both ways (the pure part, shared with the CLI's `link` and `story`)
   and draws the line the four pages show (the browser part). A page writes only its
   own file; every other connection runs through the server (`node solo.js link`),
   with the terminal line as the fallback. Classic script + require(), like core/video.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Story = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KINDS = ['note', 'script', 'take', 'post'];                       // the order of a story
  var WORD = { note: 'Draft', script: 'Script', take: 'Take', post: 'Post' };
  var PLURAL = { note: 'Drafts', script: 'Scripts', take: 'Takes', post: 'Posts' };
  var APP = { note: 'writing', script: 'scripts', take: 'videos', post: 'social' };
  // every pointer: which kind holds it, the field, what it points at
  var POINTERS = [
    { holder: 'script', field: 'noteId', target: 'note' },
    { holder: 'take', field: 'scriptId', target: 'script' },
    { holder: 'take', field: 'postId', target: 'post' },
    { holder: 'post', field: 'noteId', target: 'note' },
    { holder: 'post', field: 'scriptId', target: 'script' }
  ];
  // upstream>downstream → where the pointer lives (the take → post edge lives on the take: `video post` wrote it first)
  var PAIR = { 'note>script': { holder: 'script', field: 'noteId' }, 'note>post': { holder: 'post', field: 'noteId' }, 'script>take': { holder: 'take', field: 'scriptId' }, 'script>post': { holder: 'post', field: 'scriptId' }, 'take>post': { holder: 'take', field: 'postId' } };
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

  /* data = { note: [], script: [], take: [], post: [] }: the four arrays of ONE workspace (a story never crosses workspaces) */
  function empty() { return { note: [], script: [], take: [], post: [] }; }
  function lookup(data, q) {   // an id, else the one title that contains q
    q = String(q || '').trim(); if (!q) return null;
    for (var i = 0; i < KINDS.length; i++) { var k = KINDS[i]; var hit = (data[k] || []).filter(function (x) { return x && x.id === q; })[0]; if (hit) return { kind: k, item: hit }; }
    var low = q.toLowerCase(); var hits = [];
    KINDS.forEach(function (k) { (data[k] || []).forEach(function (x) { if (x && titleFor(k, x).toLowerCase().indexOf(low) >= 0) hits.push({ kind: k, item: x }); }); });
    if (hits.length > 1) { var e = new Error('Several match "' + q + '": ' + hits.slice(0, 6).map(function (h) { return describe(h.kind, h.item) + ' [' + h.item.id + ']'; }).join(' · ') + '. Give the id.'); e.ambiguous = true; throw e; }
    return hits[0] || null;
  }
  function titleFor(kind, item) { return kind === 'note' ? titleOf(item.text) : kind === 'script' ? (item.title || titleOf(item.text)) : (item.title || 'Untitled'); }
  function stateFor(kind, item) {
    if (kind === 'take') { var st = item.status || 'recorded'; if (st === 'cut' || st === 'rendered') return st + ' ' + fmt(runtime(item)); return st === 'recorded' ? 'no words yet' : st; }
    if (kind === 'post') return when(item.datetime) + (item.status ? ' · ' + item.status : '');
    return '';
  }
  function describe(kind, item) { if (item && item.missing) return WORD[kind] + ': missing'; var s = stateFor(kind, item); return WORD[kind] + ': ' + titleFor(kind, item) + (s ? ' · ' + s : ''); }
  function tag(item) { var d = new Date(item.createdAt || item.updatedAt || 0); if (!(item.createdAt || item.updatedAt) || isNaN(d)) return ''; var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return d.getDate() + ' ' + months[d.getMonth()] + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }   // tells two same-titled items apart
  function dupTitles(items, kindOf) { var seen = {}; var dup = {}; items.forEach(function (x) { var k = kindOf(x) + ':' + titleFor(kindOf(x), x.item || x).toLowerCase(); if (seen[k]) dup[k] = 1; seen[k] = 1; }); return function (kind, item) { return !!dup[kind + ':' + titleFor(kind, item).toLowerCase()]; }; }
  /* a pointer to an id that no longer exists: found through whatever still points at it, so it can be disconnected */
  function missingRef(data, id) { for (var i = 0; i < POINTERS.length; i++) { var p = POINTERS[i]; if ((data[p.holder] || []).some(function (x) { return x && x[p.field] === id; })) return { kind: p.target, item: { id: id, missing: true }, missing: true }; } return null; }
  /* the pointer that holds a and b together right now, or null when they are only connected through something else */
  function direct(data, aId, bId) { var p; try { p = pair(data, aId, bId); } catch (e) { return null; } return p.holder.item[p.field] === p.target.item.id ? p : null; }

  /* every item reachable through the pointers, in story order; a pointer to nothing is a member with missing: true */
  function of(data, kind, id) {
    data = data || empty(); var seen = {}; var queue = [{ kind: kind, id: id }]; var members = [];
    while (queue.length && members.length < MAX) {
      var q = queue.shift(); var key = q.kind + ':' + q.id; if (seen[key]) continue; seen[key] = 1;
      var item = (data[q.kind] || []).filter(function (x) { return x && x.id === q.id; })[0];
      if (!item) { if (q.id) members.push({ kind: q.kind, id: q.id, missing: true, title: 'missing', state: '' }); continue; }
      members.push({ kind: q.kind, id: q.id, item: item, title: titleFor(q.kind, item), state: stateFor(q.kind, item) });
      POINTERS.forEach(function (p) {
        if (p.holder === q.kind && item[p.field]) queue.push({ kind: p.target, id: item[p.field] });                                   // what this item points at
        if (p.target === q.kind) (data[p.holder] || []).forEach(function (x) { if (x && x[p.field] === q.id) queue.push({ kind: p.holder, id: x.id }); });   // what points at it
      });
    }
    members.sort(function (a, b) { var ka = KINDS.indexOf(a.kind), kb = KINDS.indexOf(b.kind); if (ka !== kb) return ka - kb; if (!!a.missing !== !!b.missing) return a.missing ? 1 : -1; if (a.missing) return 0; if (a.kind === 'post') return String(a.item.datetime || '').localeCompare(String(b.item.datetime || '')); return ((b.item.createdAt || b.item.updatedAt) || 0) - ((a.item.createdAt || a.item.updatedAt) || 0); });
    return members;
  }
  function byKind(members) { var g = {}; KINDS.forEach(function (k) { g[k] = members.filter(function (m) { return m.kind === k; }); }); return g; }
  function connected(members) { return members.length > 1; }
  /* one line of text, for `story`, the show commands and the {{this}} / {{take}} tokens */
  function text(members) {
    var g = byKind(members); var parts = []; var dup = dupTitles(members.filter(function (m) { return !m.missing; }), function (m) { return m.kind; });
    KINDS.forEach(function (k) { if (!g[k].length) return; var items = g[k].map(function (m) { return m.missing ? 'missing (' + m.id + ')' : m.title + (dup(k, m.item) && tag(m.item) ? ' · ' + tag(m.item) : '') + (m.state ? ' (' + m.state + ')' : '') + ' [' + m.id + ']'; }); parts.push((g[k].length > 1 ? PLURAL[k] : WORD[k]) + ': ' + items.join(' · ')); });
    return parts.join(' → ');
  }

  /* which item gets which pointer when a and b are connected; throws a plain sentence when the pair makes no story */
  function pair(data, aQ, bQ) {
    var a = lookup(data, aQ) || missingRef(data, aQ), b = lookup(data, bQ) || missingRef(data, bQ);
    if (!a) throw new Error('No draft, script, take or post here matches "' + aQ + '"');
    if (!b) throw new Error('No draft, script, take or post here matches "' + bQ + '"');
    if (a.missing && b.missing) throw new Error('Neither of those exists any more.');
    if (a.kind === b.kind) throw new Error('Two ' + PLURAL[a.kind].toLowerCase() + ' cannot be one story; connect a draft, a script, a take and a post.');
    var up = KINDS.indexOf(a.kind) < KINDS.indexOf(b.kind) ? a : b; var down = up === a ? b : a;
    var p = PAIR[up.kind + '>' + down.kind]; if (!p) throw new Error('A ' + WORD[up.kind].toLowerCase() + ' connects to a ' + WORD[down.kind].toLowerCase() + ' through a script: connect the script first.');
    var holder = p.holder === up.kind ? up : down; var target = holder === up ? down : up;
    return { up: up, down: down, holder: holder, field: p.field, target: target };
  }
  /* the items a new script / post made from `from` should carry (the CLI and the pages build the same thing) */
  function scriptFrom(kind, item) { var t = titleFor(kind, item); var body = kind === 'note' ? clean(item.text) : ''; return { title: t, text: '# ' + t + '\n\n## Hook\n\n## Script\n' + (body ? body + '\n' : '1. \n'), noteId: kind === 'note' ? item.id : '' }; }
  function postFrom(kind, item) {
    var t = titleFor(kind, item); var np = { datetime: tomorrow9(), title: t, format: kind === 'note' ? 'text' : 'video', copy: kind === 'note' ? clean(item.text) : '', video: { title: kind === 'note' ? '' : t, status: kind === 'script' ? 'scripted' : kind === 'take' ? ((item.status === 'cut' || item.status === 'rendered') ? 'edited' : 'recorded') : 'none', notes: '', link: '' }, status: 'draft' };
    if (kind === 'note') np.noteId = item.id; if (kind === 'script') np.scriptId = item.id; if (kind === 'take' && item.scriptId) np.scriptId = item.scriptId;
    return np;
  }

  /* ---------- browser part: the line on the four pages ---------- */
  var B = {};
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    var hooks = []; var open = {};   // open: id → true while its picker is shown
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function ws() { return window.Config && Config.activeWs ? Config.activeWs() : undefined; }
    function rootPath() { return /\/(studio|social|runway|inspo|calendar)\//.test(location.pathname) ? '../' : ''; }
    function keyOf(kind) { return Config.key(APP[kind], ws()); }
    function fileOf(kind) { return Config.file(APP[kind], ws()); }
    function server() { return !!(window.Sync && Sync.getMode && Sync.getMode() === 'server'); }
    function wsQ() { var w = ws(); return w ? '&ws=' + encodeURIComponent(w) : ''; }   // always: the other page may have another workspace open
    function wsFlag() { var w = ws(); return w && Config.PRIMARY && w !== Config.PRIMARY ? ' --ws ' + w : ''; }
    function load() {   // the four arrays from the browser copies; the sibling files are registered read-only below, so they are at most one poll behind
      var d = empty(); var wr = Store.getJSON(keyOf('note'), null); var sc = Store.getJSON(keyOf('script'), null); var vd = Store.getJSON(keyOf('take'), null); var so = Store.getJSON(keyOf('post'), null);
      d.note = wr && Array.isArray(wr.notes) ? wr.notes : []; d.script = sc && Array.isArray(sc.scripts) ? sc.scripts : []; d.take = vd && Array.isArray(vd.videos) ? vd.videos : []; d.post = Array.isArray(so) ? so : [];
      return d;
    }
    function pageUrl(kind, id) { var r = rootPath(); var q = wsQ(); return kind === 'post' ? r + 'social/social-board.html?id=' + encodeURIComponent(id) + q : r + 'studio/' + (kind === 'note' ? 'writing-viewer' : kind === 'script' ? 'script-viewer' : 'video') + '.html?open=' + encodeURIComponent(id) + q; }
    function here(kind) { var p = location.pathname; return kind === 'note' ? /writing-viewer/.test(p) : kind === 'script' ? /script-viewer/.test(p) : kind === 'take' ? /video\.html/.test(p) : /social-board/.test(p); }
    // the sibling files this page does not own: read-only, the file always wins, never written back (the pattern core/context.js uses for takes)
    function register() {
      if (!window.Sync || !Sync.register) return;
      KINDS.forEach(function (kind) {
        if (here(kind)) return;   // the page's own file: it registers that itself, writable
        var file = fileOf(kind); var key = keyOf(kind); if ((Sync.specs || []).some(function (s) { return s.file === file; })) return;
        Sync.register({ file: file, key: key, label: PLURAL[kind].toLowerCase(), app: APP[kind] === 'videos' ? 'video' : APP[kind], activity: false, readOnly: true, isFresh: function () { return Store.get(key) == null; },
          read: function () { var cur = Store.getJSON(key, null); return kind === 'post' ? { posts: Array.isArray(cur) ? cur : [] } : (cur || {}); },   // social.json holds { posts }, the browser a bare array
          apply: function (body) { Store.setJSON(key, kind === 'post' ? (Array.isArray(body) ? body : body && Array.isArray(body.posts) ? body.posts : []) : (body && typeof body === 'object' ? body : {}), { silent: true }); } });
      });
      if (Sync.on) Sync.on(function (ev) { if (ev === 'applied' || ev === 'pulled') fire(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(register, 0); }); else setTimeout(register, 0);   // after the page's own registration
    function fire() { hooks.forEach(function (fn) { try { fn(); } catch (e) { /* a page's repaint failed; the data is written */ } }); }
    function api(body) { return fetch('/api/story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ ws: ws() }, body)) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('the server answered ' + r.status)); return j; }); }); }
    function copy(t) { try { navigator.clipboard.writeText(t); } catch (e) { /* no clipboard */ } }
    function needServer(line) { copy(line); return new Error('Needs node serve.js running. Copied the terminal line instead: ' + line); }
    /* a connection: the page's own field in the page's own model; anything else through the CLI on the server */
    function write(p, off) {
      var patch = {}; patch[p.field] = off ? '' : p.target.item.id; var note = (off ? 'disconnected ' : 'connected ') + WORD[p.holder.kind].toLowerCase() + (off ? ' from ' : ' to ') + WORD[p.target.kind].toLowerCase() + ' ' + titleFor(p.target.kind, p.target.item);
      if (p.holder.kind === 'post' && here('post') && window.SocialModel && SocialModel.updatePost) { SocialModel.updatePost(p.holder.item.id, patch); if (window.Sync && Sync.note) Sync.note(fileOf('post'), note); return Promise.resolve(); }
      if (p.holder.kind === 'script' && here('script') && typeof library !== 'undefined' && library && library.scripts && typeof persistLibrary === 'function') { var s = library.scripts.filter(function (x) { return x.id === p.holder.item.id; })[0]; if (s) { s.noteId = patch.noteId; s.updatedAt = Date.now(); if (window.Sync && Sync.note) Sync.note(fileOf('script'), note); persistLibrary(); } return Promise.resolve(); }
      var line = 'node solo.js link ' + p.up.item.id + ' ' + p.down.item.id + (off ? ' --off' : '') + wsFlag();
      if (!server()) return Promise.reject(needServer(line));
      return api({ op: off ? 'unlink' : 'link', a: p.up.item.id, b: p.down.item.id }).then(function () { return window.Sync && Sync.pullAll ? Sync.pullAll(false) : null; });
    }
    function connect(aId, bId) { var d = load(); var p; try { p = pair(d, aId, bId); } catch (e) { return Promise.reject(e); } if (p.target.missing || p.holder.missing) return Promise.reject(new Error('One of those was deleted; it cannot be connected.')); var before = p.holder.item[p.field]; var was = before && before !== p.target.item.id ? lookup(d, before) : null; return write(p, false).then(function () { fire(); p.was = was; return p; }); }
    function disconnect(aId, bId) { var p; try { p = pair(load(), aId, bId); } catch (e) { return Promise.reject(e); } return write(p, true).then(function () { fire(); return p; }); }
    function members(kind, id) { return of(load(), kind, id); }

    /* the line: chips in story order, the next step in its empty slot, Connect… at the end */
    function chip(m, selfId, data, dup) {
      var label = WORD[m.kind] + ': ' + (m.missing ? 'missing' : esc(m.title) + (dup && dup(m.kind, m.item) && tag(m.item) ? ' <span class="st-state">' + esc(tag(m.item)) + '</span>' : '')) + (m.state ? ' <span class="st-state">' + esc(m.state) + '</span>' : '');
      if (m.id === selfId) return '<span class="st-chip st-self" title="This ' + WORD[m.kind].toLowerCase() + '">' + label + '</span>';
      var held = !!direct(data, selfId, m.id);   // × only where this page's item holds the pointer (or is held by it); the rest hang on another piece
      var off = held ? '<button type="button" class="st-off" onclick="storyDisconnect(\'' + esc(selfId) + '\',\'' + esc(m.id) + '\')" title="Disconnect (keeps both)">×</button>' : '';
      if (m.missing) return '<span class="st-chip st-missing" title="' + (held ? 'It was deleted; × forgets it' : 'It was deleted; open the piece that pointed at it to forget it') + '">' + label + off + '</span>';
      return '<span class="st-chip"' + (held ? '' : ' title="Connected through another piece of the story; open that one to disconnect"') + '><a href="' + esc(pageUrl(m.kind, m.id)) + '" title="Open it">' + label + '</a>' + off + '</span>';
    }
    function slot(kind, selfKind, selfId, opts) {   // what an empty slot offers, from where we stand
      var o = opts || {}; if (KINDS.indexOf(kind) <= KINDS.indexOf(selfKind)) return '';
      if (kind === 'script' && selfKind === 'note') return '<button type="button" class="btn small" onclick="storyMake(\'note\',\'' + esc(selfId) + '\',\'script\')" title="A new script with this draft as its text; the draft stays. Your AI writes the beats from there (Guide → Write a script).">Start the script</button>';
      if (kind === 'take' && selfKind === 'script') return '<button type="button" class="btn small" onclick="storyMake(\'script\',\'' + esc(selfId) + '\',\'take\')" title="Opens Video to add the recording; the take will know its script">Add the take</button>';
      if (kind === 'post' && (selfKind === 'note' || selfKind === 'script')) return '<button type="button" class="btn small" onclick="storyMake(\'' + esc(selfKind) + '\',\'' + esc(selfId) + '\',\'post\')" title="' + (selfKind === 'note' ? 'A draft post on the schedule, dated tomorrow 09:00, with this as its copy' : 'A draft post on the schedule, dated tomorrow 09:00, with this script attached') + '">Make the post</button>';
      if (kind === 'post' && selfKind === 'take') return o.takePost || '';
      return '';
    }
    function connectLabel(kind) { var ks = KINDS.filter(function (k) { return k !== kind && (PAIR[k + '>' + kind] || PAIR[kind + '>' + k]); }).map(function (k) { return WORD[k].toLowerCase(); }); return 'Connect to a ' + (ks.length > 1 ? ks.slice(0, -1).join(', ') + ' or ' + ks[ks.length - 1] : ks[0]) + '…'; }
    function html(kind, id, opts) {
      var data = load(); var ms = of(data, kind, id); var g = byKind(ms); var any = connected(ms); var cells = []; var dup = dupTitles(ms.filter(function (m) { return !m.missing; }), function (m) { return m.kind; });
      KINDS.forEach(function (k) { var cell = g[k].length ? g[k].map(function (m) { return chip(m, id, data, dup); }).join('') : slot(k, kind, id, opts); if (cell) cells.push(cell); });
      if (!any) cells = KINDS.map(function (k) { return slot(k, kind, id, opts); }).filter(Boolean);   // nothing connected: no line, only the next step
      var out = '<div class="st-line' + (any ? '' : ' st-empty') + '" data-story="' + esc(id) + '" title="One story: draft → script → take → post">' + (!any && cells.length ? '<span class="st-next">Next:</span>' : '') + cells.join(any ? '<span class="st-arrow">→</span>' : '');
      out += '<button type="button" class="guide-link st-connect" onclick="storyConnect(\'' + esc(kind) + '\',\'' + esc(id) + '\')">' + (open[id] ? 'Close' : connectLabel(kind)) + '</button>';
      if (open[id]) out += picker(kind, id, ms);
      return out + '</div>';
    }
    function picker(kind, id, ms) {
      var d = load(); var inStory = {}; ms.forEach(function (m) { inStory[m.id] = 1; }); var groups = '';
      KINDS.forEach(function (k) {
        if (k === kind) return; if (!PAIR[k + '>' + kind] && !PAIR[kind + '>' + k]) return;   // only what connects directly
        var items = (d[k] || []).filter(function (x) { return x && x.id && !inStory[x.id]; }).slice().sort(function (a, b) { return ((b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)); }).slice(0, 60);
        if (!items.length) return; var dupK = dupTitles(items, function () { return k; }); var rule = PAIR[kind + '>' + k] || PAIR[k + '>' + kind];
        groups += '<optgroup label="' + esc(PLURAL[k]) + '">' + items.map(function (x) {
          var withOther = ''; if (rule && rule.holder === k && x[rule.field] && x[rule.field] !== id) { var o = lookup(d, x[rule.field]); withOther = ' · already with ' + (o ? describe(o.kind, o.item) : 'another ' + WORD[kind].toLowerCase()); }   // connecting it here moves it
          return '<option value="' + esc(x.id) + '">' + esc(describe(k, x) + (dupK(k, x) && tag(x) ? ' · ' + tag(x) : '') + withOther) + '</option>'; }).join('') + '</optgroup>';
      });
      if (!groups) return '<div class="st-pick muted">Nothing else to connect yet.</div>';
      return '<div class="st-pick"><select id="storyPick"><option value="">Choose what this belongs with…</option>' + groups + '</select><button type="button" class="btn small primary" onclick="storyPicked(\'' + esc(id) + '\')">Connect</button></div>';
    }

    /* globals the markup calls */
    window.storyConnect = function (kind, id) { open[id] = !open[id]; fire(); setTimeout(function () { var s = document.getElementById('storyPick'); if (s) s.focus(); }, 0); };
    window.storyPicked = function (id) { var s = document.getElementById('storyPick'); var other = s && s.value; if (!other) return; connect(id, other).then(function (p) { open[id] = false; fire(); B.flash('Connected: ' + describe(p.up.kind, p.up.item) + ' → ' + describe(p.down.kind, p.down.item) + (p.was ? ' (it was with ' + describe(p.was.kind, p.was.item) + ')' : '')); }).catch(function (e) { B.flash(e.message); }); };
    window.storyDisconnect = function (id, other) { disconnect(id, other).then(function () { B.flash('Disconnected (both are still there)'); }).catch(function (e) { B.flash(e.message); }); };
    window.storyMake = function (kind, id, what) {
      var r = rootPath(); if (what === 'take') { location.href = r + 'studio/video.html?add=1&script=' + encodeURIComponent(id) + wsQ(); return; }
      var line = what === 'script' ? 'node solo.js scripts add --draft ' + id + wsFlag() : 'node solo.js social add --' + (kind === 'note' ? 'draft' : kind) + ' ' + id + wsFlag();
      if (!server()) { B.flash(needServer(line).message); return; }
      api({ op: what, from: id, kind: kind }).then(function (r2) { var nid = r2 && (r2.id || (r2.post && r2.post.id)); if (!nid) throw new Error('Nothing came back'); return (window.Sync && Sync.pullAll ? Sync.pullAll(false) : Promise.resolve()).then(function () { location.href = what === 'script' ? r + 'studio/script-viewer.html?open=' + encodeURIComponent(nid) + wsQ() : r + 'social/social-board.html?id=' + encodeURIComponent(nid) + '&made=1' + wsQ(); }); }).catch(function (e) { B.flash(e.message); });
    };
    B.flash = function (msg) { var t = document.getElementById('toast') || document.getElementById('flash'); if (!t) { if (window.showToast) showToast(msg); else if (typeof window.flash === 'function') window.flash(msg); return; } t.textContent = msg; t.classList.add('show'); clearTimeout(B.flash._t); B.flash._t = setTimeout(function () { t.classList.remove('show'); }, 3200); };
    B.html = html; B.members = members; B.load = load; B.connect = connect; B.disconnect = disconnect; B.onWrite = function (fn) { hooks.push(fn); }; B.pageUrl = pageUrl; B.server = server;
    B.line = function (kind, id) { var ms = members(kind, id); return connected(ms) ? text(ms) : ''; };   // for the tokens
    B.tag = tag; B.direct = function (a, b) { return direct(load(), a, b); };
    B.clearQuery = function (names) { try { var u = new URL(location.href); names.forEach(function (n) { u.searchParams.delete(n); }); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } catch (e) { /* no history api */ } };   // a deep link is consumed once
    B.openParam = function (name) { try { return new URLSearchParams(location.search).get(name || 'open') || ''; } catch (e) { return ''; } };
    var CSS = '.st-line{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:8px 0 12px;font-size:12.5px;color:var(--muted)}.st-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid var(--line);border-radius:999px;background:var(--panel-2);color:var(--ink);max-width:100%}.st-chip a{color:inherit;text-decoration:none}.st-chip a:hover{text-decoration:underline}.st-self{border-color:var(--accent);color:var(--accent)}.st-missing{border-style:dashed;color:var(--muted)}.st-state{color:var(--muted);font-family:var(--mono);font-size:10.5px}.st-arrow{color:var(--faint)}.st-off{border:0;background:none;color:var(--faint);cursor:pointer;font:inherit;padding:0 2px;line-height:1;opacity:0;transition:opacity .15s}.st-chip:hover .st-off,.st-chip:focus-within .st-off{opacity:1}.st-off:hover{color:var(--ink)}.st-connect{font-size:12px}.st-next{color:var(--faint);font-size:11px;letter-spacing:.04em;text-transform:uppercase}.st-pick{flex-basis:100%;min-width:0;max-width:100%;display:flex;gap:6px;align-items:center}.st-pick .btn{flex:none}.st-pick select{flex:1 1 0;width:0;min-width:0;font:inherit;font-size:12.5px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}';
    (function () { if (document.getElementById('storyCss')) return; var st = document.createElement('style'); st.id = 'storyCss'; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); })();
  }

  var api = { KINDS: KINDS, WORD: WORD, PLURAL: PLURAL, APP: APP, PAIR: PAIR, POINTERS: POINTERS, empty: empty, lookup: lookup, of: of, byKind: byKind, connected: connected, text: text, pair: pair, direct: direct, missingRef: missingRef, tag: tag, dupTitles: dupTitles, describe: describe, titleFor: titleFor, stateFor: stateFor, titleOf: titleOf, clean: clean, when: when, scriptFrom: scriptFrom, postFrom: postFrom, tomorrow9: tomorrow9 };
  Object.keys(B).forEach(function (k) { api[k] = B[k]; });
  return api;
}));
