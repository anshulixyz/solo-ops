/* =========================================================================
   core/guide.js — the Guide panel: how to run Solo Ops with your AI agent.
   • Built-in prompts live in core/prompts.js (shared with the CLI, which
     exports them as slash commands). Agent mode: "runs commands" (Claude
     Code, Cursor, Codex) or "chat only" (ChatGPT, Claude.ai). Chat mode packs
     a snapshot of your data and the reply format into every prompt.
   • Paste the reply → Preview → Apply (core/apply.js Apply.reply: preview and
     apply share one path) updates boards, posts, scripts, notes and
     inspiration right here, logged as source "reply". No terminal needed.
   • Tabs by intent: Quick (five-second actions across all projects, no
     agent), Ask (Start here / Start with one, Ask your AI with its chips,
     Next, For this page, the groups, search; the first open lands here),
     Reply (paste → preview → apply), Settings. Blanks become a small form
     before copying; a prompt that needs an open item says what to open; the
     mode is guessed from how the page is open until you pick one.
   Opens from the left-edge handle, the nav button, or the ? key.
   How it all works, every setting and its storage key: docs/guide.md.
   ========================================================================= */
(function (global) {
  'use strict';
  var panel = null; var MODE_KEY = 'marathon.guide.mode'; var SEEN_KEY = 'marathon.guide.seen';
  var PKEY = 'marathon.prompts';   // { custom:[{id,t,d,c,p,pages}], overrides:{ title:{d,p,mode,at} }, hidden:[titles], removed:[custom ids], shown:[titles], reset:{ title: when } } ↔ data/prompts.json
  function pstore() { var v = Store.getJSON(PKEY, null); return v && typeof v === 'object' ? { custom: v.custom || [], overrides: v.overrides || {}, hidden: v.hidden || [], removed: v.removed || [], shown: v.shown || [], reset: v.reset || {} } : { custom: [], overrides: {}, hidden: [], removed: [], shown: [], reset: {} }; }   // removed: ids of deleted prompts, shown: built-ins shown again, reset: when an edit was reset (so a merge never brings any of them back)
  function psave(v) { Store.setJSON(PKEY, v); }
  function registerPromptsSync() {
    if (!global.Sync) return;
    Sync.register({ file: 'prompts.json', key: PKEY, label: 'prompts', activity: false, merge: true,
      read: function () { return pstore(); },
      apply: function (body) { var cur = pstore(); var inc = { custom: body.custom || [], overrides: body.overrides || {}, hidden: body.hidden || [], removed: body.removed || [], shown: body.shown || [], reset: body.reset || {} };
        var reset = {}; [cur.reset, inc.reset].forEach(function (r) { Object.keys(r).forEach(function (t) { reset[t] = Math.max(reset[t] || 0, +r[t] || 0); }); });
        var ovs = {}; [cur.overrides, inc.overrides].forEach(function (o) { Object.keys(o).forEach(function (t) { if (!ovs[t] || (+o[t].at || 0) >= (+ovs[t].at || 0)) ovs[t] = o[t]; }); });   // the newer edit of a title wins (the file's on a tie)
        Object.keys(ovs).forEach(function (t) { if (reset[t] && reset[t] >= (+ovs[t].at || 0)) delete ovs[t]; });   // a reset (here, in another browser or `prompts restore --all`) beats every older edit
        var uniq = function (a) { return a.filter(function (h, i) { return a.indexOf(h) === i; }); }; var removed = uniq(inc.removed.concat(cur.removed)); var shown = uniq(inc.shown.concat(cur.shown));
        var seen = {}; var custom = inc.custom.concat(cur.custom).filter(function (c) { if (!c || !c.id || seen[c.id] || removed.indexOf(c.id) >= 0) return false; seen[c.id] = 1; return true; });
        Store.setJSON(PKEY, { custom: custom, overrides: ovs, hidden: uniq(inc.hidden.concat(cur.hidden)).filter(function (h) { return shown.indexOf(h) < 0; }), removed: removed, shown: shown, reset: reset }, { silent: true }); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerPromptsSync); else setTimeout(registerPromptsSync, 0);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mode() { return Store.get(MODE_KEY) === 'files' ? 'files' : (Store.get(MODE_KEY) === 'chat' ? 'chat' : ''); }
  // until the person picks, a guess from where the page runs: served by node serve.js → an agent in this folder most likely; file:// → a chat
  function envMode() { return global.Sync && Sync.getMode() === 'server' ? 'files' : 'chat'; }
  function effMode() { return mode() || envMode(); }
  // nothing on the boards or the schedule of the open project yet (the Guide then starts with Get started)
  function projectEmpty() { var w = Config.ws(); var n = 0; Config.boards(w.id).forEach(function (b) { n += (Store.getJSON(Config.boardKey(b.id, w.id), []) || []).length; }); if (w.apps.social) n += (Store.getJSON(Config.key('social', w.id), []) || []).length; return n === 0; }
  function root() { var n = document.querySelector('[data-nav]'); return (n && n.getAttribute('data-root')) || './'; }
  function page() {
    var h = location.pathname.replace(/.*\//, '');
    return { 'index.html': 'home', '': 'home', 'overview.html': 'overview', 'about.html': 'about', 'marathon-board.html': 'board', 'social-board.html': 'social', 'social-calendar.html': 'streak', 'calendar.html': 'calendar', 'script-viewer.html': 'scripts', 'writing-viewer.html': 'writing', 'video.html': 'video', 'inspiration.html': 'inspo' }[h] || 'home';
  }
  var ABOUT = {}; Object.keys((global.MARATHON_PROMPTS || {}).PAGES || {}).forEach(function (k) { ABOUT[k] = MARATHON_PROMPTS.PAGES[k].about; });   // the page help lives with the prompts (core/prompts.js PAGES), so docs/guide-prompts.md shows the same
  var GO = { calendar: ['calendar/calendar.html', 'the Calendar'], board: ['runway/marathon-board.html', 'the board'], social: ['social/social-board.html', 'the schedule'], scripts: ['studio/script-viewer.html', 'the Script Viewer'], writing: ['studio/writing-viewer.html', 'the Writing Viewer'], video: ['studio/video.html', 'Video'], inspo: ['inspo/inspiration.html', 'Inspiration'], home: ['index.html', 'Home'] };

  /* ---- snapshot of the open workspace (chat mode pastes this) ---------- */
  function snapshot() {
    var w = Config.ws(); var L = ['WORKSPACE: ' + w.title + ' (' + w.id + ')']; var posts = [];
    var hid = Config.hiddenBoards(w.id).filter(function (b) { return !global.Model || b.id !== Model.BOARD; }); if (hid.length) L.push('HIDDEN BOARDS (left out here; the person hid them): ' + hid.map(function (b) { return '"' + b.title + '" (--board ' + b.id + ')'; }).join(', '));
    Config.boardsInView(w.id).forEach(function (b) {
      var tasks = Store.getJSON(Config.boardKey(b.id, w.id), []) || [];
      L.push('', 'BOARD "' + b.title + '" (--board ' + b.id + ')');
      ['doing', 'todo', 'later', 'bucket', 'done'].forEach(function (col) {
        var g = tasks.filter(function (t) { return t.col === col; }); if (!g.length) return;
        L.push('  ' + col + ':');
        g.slice(0, col === 'done' ? 5 : 40).forEach(function (t) { var n = (t.checklist || []).length, d = (t.checklist || []).filter(function (c) { return c.done; }).length; L.push('  - [' + t.id + '] ' + t.title + ' · ' + t.pri + (t.at ? ' · at ' + t.at.replace('T', ' ') : '') + (t.due ? ' · due ' + t.due : '') + (t.tags.length ? ' · #' + t.tags.join(' #') : '') + (n ? ' · ' + d + '/' + n + ' steps' : '') + (t.ext && !/^share:/.test(t.ext) ? ' · ext ' + t.ext : '')); });   // ext: where an imported task came from, so a re-run updates it
      });
    });
    if (w.apps.social) { posts = (Store.getJSON(Config.key('social', w.id), []) || []).slice().sort(function (a, b) { return a.datetime.localeCompare(b.datetime); }); if (posts.length) { L.push('', 'POSTS'); posts.slice(0, 30).forEach(function (p) { var n = (p.prep || []).length, d = (p.prep || []).filter(function (c) { return c.done; }).length; L.push('  - [' + p.id + '] ' + p.datetime.replace('T', ' ') + ' · ' + p.title + ' · ' + p.status + (p.copy ? '' : ' · NO COPY YET') + (n ? ' · prep ' + d + '/' + n : '')); }); } }
    if (w.apps.scripts) { var sc = (Store.getJSON(Config.key('scripts', w.id), { scripts: [] }) || {}).scripts || []; if (sc.length) L.push('', 'SCRIPTS: ' + sc.map(function (s) { return '[' + s.id + '] ' + s.title; }).join(' · ')); }
    if (w.apps.writing) { var nt = (Store.getJSON(Config.key('writing', w.id), { notes: [] }) || {}).notes || []; if (nt.length) L.push('', 'NOTES: ' + nt.map(function (n) { var m = (n.text || '').match(/^#\s+(.+)/m); var nf = Object.keys(n.files || {}).length ? ' (' + Object.keys(n.files).length + ' image file' + (Object.keys(n.files).length === 1 ? '' : 's') + ': ' + Object.keys(n.files).map(function (k) { return n.files[k]; }).join(', ') + ')' : (Object.keys(n.images || {}).length ? ' (has images in the app)' : ''); return '[' + n.id + '] ' + (m ? m[1].slice(0, 50) : 'untitled') + nf; }).join(' · ')); }
    var tk = (Store.getJSON(Config.key('videos', w.id), null) || {}).videos || []; var waiting = tk.filter(function (v) { return ['recorded', 'transcribed', 'cut'].indexOf(v.status || 'recorded') >= 0; });
    if (waiting.length) L.push('', 'TAKES: ' + waiting.map(function (v) { return '[' + v.id + '] ' + v.title + ' · ' + (v.status || 'recorded') + ' · next: ' + (v.status === 'cut' ? 'render' : v.status === 'transcribed' ? 'cut (Cut this take)' : 'transcribe'); }).join(' · '));
    if (global.InspoModel) { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } var ins = InspoModel.list({ status: 'new' }).filter(function (x) { return !x.ws || x.ws === w.id; }); if (ins.length) { L.push('', 'INSPIRATION (unused)'); ins.slice(0, 20).forEach(function (x) { L.push('  - [' + x.id + '] ' + (x.title || x.url) + (x.url ? ' ' + x.url : '') + (x.file ? ' [image file: ' + x.file + ']' : (x.image ? ' [image in the app — ask me to upload it]' : '')) + (x.tags.length ? ' #' + x.tags.join(' #') : '') + (x.text ? ' — ' + x.text.slice(0, 120).replace(/\n/g, ' ') : '')); }); } }
    var withFiles = posts.filter ? posts.filter(function (p) { return (p.assets || []).length; }) : [];
    if (withFiles.length) L.push('', 'POST IMAGES: ' + withFiles.map(function (p) { return '[' + p.id + '] ' + p.assets.map(function (a) { return a.file || a.name + ' (in the app)'; }).join(', '); }).join(' · '));
    L.push('', 'ATTACHMENTS: image files live under data/attachments/ (relative to the Solo Ops folder). Links are URLs you can open. If something matters and you cannot read files, ask me to upload or paste it.');
    var act = global.Activity ? Activity.summary() : null; if (act && act.lastActive) L.push('', 'ACTIVITY: last change ' + Activity.ago(act.lastActive) + ', streak ' + act.streak + ' days');
    return L.join('\n');
  }

  /* ---- prompts: built-ins come from core/prompts.js (shared with the CLI) ---- */
  var srvFolder = null;   // absolute path of the Solo Ops folder from /api/ping (server mode); '' = unknown
  function folder() {
    if (srvFolder) return srvFolder;
    if (location.protocol === 'file:') { try { var p = decodeURIComponent(location.pathname).replace(/[^/]*$/, ''); var up = (root().match(/\.\.\//g) || []).length; for (var i = 0; i < up; i++) p = p.replace(/[^/]+\/$/, ''); return p.replace(/\/$/, ''); } catch (e) { return ''; } }
    return '';
  }
  function fetchFolder() {
    if (srvFolder !== null || !global.Sync || Sync.getMode() !== 'server') return Promise.resolve(false);
    return fetch('/api/ping', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { srvFolder = (j && j.folder) || ''; return !!srvFolder; }).catch(function () { srvFolder = ''; return false; });
  }
  function opts() { var w = Config.ws(); var fb = Config.firstBoard(w.id); return { title: w.title, id: w.id, board: fb ? fb.id : 'runway', mode: effMode() === 'files' ? 'files' : 'chat', folder: folder() }; }
  function prompts() {
    var P = global.MARATHON_PROMPTS; var o = opts(); var files = o.mode === 'files';
    var list = P ? P.build(o) : []; var head = P ? P.head(o) : ''; if (!P) return list;
    // your edits (data/prompts.json): overrides of built-ins, hidden built-ins, your own prompts
    var ps = pstore();
    list.forEach(function (x) { var ov = ps.overrides[x.t]; if (ov && (!ov.mode || ov.mode === o.mode)) { if (ov.d) x.d = ov.d; if (ov.p) x.p = ov.p; x.overridden = true; } });   // an edit made in one mode leaves the other mode's text alone (older edits, without a mode, apply to both)
    list = list.filter(function (x) { return ps.hidden.indexOf(x.t) < 0; });
    ps.custom.forEach(function (c) { list.push({ c: c.c || 'projects', t: c.t || 'My prompt', d: c.d || '', p: c.p || '', pages: c.pages || [], custom: true, id: c.id, go: c.go, reply: files ? 'agent' : 'lines' }); });
    list.forEach(function (x) { x.p = x.p.split('{{head}}').join(head); if (!files && (x.custom || (x.overridden && x.reply === 'lines'))) { if (x.custom && !/\{\{\w+\}\}/.test(x.p) && x.p.indexOf('HOW TO REPLY') < 0) x.p += P.tail(o, { snap: true }); if (x.p.indexOf('HOW TO REPLY') < 0) x.p += P.tail(o, { writes: true }); } });   // your own prompts: the snapshot when they carry no context, the reply legend; an edited built-in keeps what it was
    return list;
  }
  var I = {
    daily: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    weekly: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    projects: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18"/></svg>',
    content: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    fix: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    moves: '<svg viewBox="0 0 24 24"><path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-6-4-8 0 4-3 6-4 9-1 3 1 10 7 10z"/></svg>',
    prompts: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    apply: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    setup: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    bringin: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'
  };
  var CATS = (global.MARATHON_PROMPTS || {}).CATS || [['daily', 'Daily', ''], ['weekly', 'Weekly', ''], ['projects', 'Projects', ''], ['content', 'Content', ''], ['setup', 'Set up', ''], ['fix', 'Safety', '']];
  var ASK = (global.MARATHON_PROMPTS || {}).ASK || ['daily', 'weekly', 'projects', 'content'];   // groups in the Ask tab; setup + fix live in Settings
  var TAB_KEY = 'marathon.guide.tab';
  /* ---- backup status (server mode only; elsewhere the CLI knows) ---- */
  var backup = { state: 'unknown', at: 0 };   // {repo, remote, lastAt, dirty}
  function backupStatus() {
    if (!global.Sync || Sync.getMode() !== 'server') { backup.state = 'n/a'; return Promise.resolve(backup); }
    if (Date.now() - backup.at < 300000) return Promise.resolve(backup);
    return fetch('/api/backup', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { backup = Object.assign({ state: j ? 'ok' : 'unknown', at: Date.now() }, j || {}); return backup; }).catch(function () { backup.state = 'unknown'; backup.at = Date.now(); return backup; });
  }
  var ACK_KEY = 'marathon.backup.ack';   // the user said "I keep a copy elsewhere" (pages that cannot see the server)
  function backupOk() { return backup.state === 'ok' && ((backup.repo && backup.remote) || backup.folder); }
  function backupDone() { return backupOk() || !!Store.get(ACK_KEY); }
  function backupFresh() {   // backed up within a week (repo commit or folder copy)
    if (!backupOk()) return false; var at = backup.repo && backup.remote ? backup.lastAt : backup.folderAt; if (!at) return !!(backup.repo && backup.remote);
    return Date.now() - Date.parse(at) < 7 * 86400000;
  }
  function backupLine() {
    if (backup.state === 'n/a') return Store.get(ACK_KEY) ? '<span>You said your data is backed up elsewhere. <code>node solo.js backup --status</code> shows what the folder knows.</span>' : '<span><b>Not backed up as far as this page can tell.</b> Your data lives in this browser' + (global.Sync && Sync.getMode() === 'folder' ? ' and the linked folder' : '') + '.</span>';
    if (backup.state !== 'ok') return '<span>Checking backup…</span>';
    if (!backup.repo && backup.folder) return '<span><b>Copied to ' + esc(backup.folder.replace(/^.*\//, '')) + '</b> ' + (backup.folderAt ? esc(ago(backup.folderAt)) : 'never') + ' · <code>' + esc(backup.folder) + '</code></span>';
    if (!backup.repo) return '<span><b>No backup yet.</b> Your data lives only on this computer.</span>';
    var days = backup.lastAt ? Math.floor((Date.now() - Date.parse(backup.lastAt)) / 86400000) : null;
    return '<span><b>Backup ' + (days === null ? 'set up' : days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago') + '</b>' + (backup.remote ? ' → ' + esc(backup.remote.replace(/^.*github\.com[:\/]/, '').replace(/\.git$/, '')) : ' (local repo only, no remote)') + (backup.dirty ? ' · ' + backup.dirty + ' file' + (backup.dirty === 1 ? '' : 's') + ' changed since' : '') + '</span>';
  }
  function backupDays() { return backup.state === 'ok' && backup.repo && backup.lastAt ? Math.floor((Date.now() - Date.parse(backup.lastAt)) / 86400000) : null; }
  // tabs are named by intent: Quick (no AI) · Ask (what to ask) · Reply (bring the answer back) · Settings
  var TAB_MAP = { moves: 'ask', prompts: 'ask', do: 'ask', apply: 'reply', setup: 'settings' };
  function tab() { var t = Store.get(TAB_KEY) || 'quick'; return TAB_MAP[t] || t; }
  var CAT_KEY = 'marathon.guide.cats';        // { daily: true, … } which groups are open
  var CARRY_KEY = 'marathon.guide.carry';     // { text, ws, at }: reply lines handed to the page that saves their file (Continue on Home)
  var LAST_KEY = 'marathon.guide.lastCopy';   // { t, at, ws } the last prompt copied (Reply shows it)
  var query = '';
  function ago(ts) { return global.Activity && Activity.ago ? Activity.ago(ts) : 'a moment ago'; }
  function openCats() { return Store.getJSON(CAT_KEY, null) || {}; }
  function matches(x, q) { q = q.toLowerCase(); var cat = (CATS.filter(function (c) { return c[0] === x.c; })[0] || [])[1] || ''; return (x.t + ' ' + x.d + ' ' + cat + ' ' + x.p).toLowerCase().indexOf(q) >= 0; }

  /* ---- render: tabs → Quick · Ask · Reply · Settings ----------------------- */
  function render() {
    var pg = page(); var w = Config.ws(); var m = effMode(); var guessed = !mode(); var r = root();
    var all = prompts(); var here = forPage(all, pg);
    var t = tab(); if (!Store.get(SEEN_KEY) && !Store.get(TAB_KEY)) { t = 'ask'; Store.set(TAB_KEY, 'ask', { silent: true }); }   // a first open shows what you can ask (and stays there when the mode is picked)
    var TABS = [['quick', 'Quick', I.bolt], ['ask', 'Ask', I.prompts], ['reply', 'Reply', I.apply], ['settings', 'Settings', I.setup]];
    var lc = Store.getJSON(LAST_KEY, null); if (lc && lc.ws !== w.id) lc = null;
    panel.innerHTML = '<div class="guide-head"><b>Guide</b><span class="guide-sub">' + esc(w.title) + '</span><button type="button" class="guide-close" aria-label="Close">×</button></div>' +
      '<div class="guide-tabs">' + TABS.map(function (x) { return '<button type="button" class="guide-tab' + (x[0] === t ? ' on' : '') + '" data-tab="' + x[0] + '" title="' + x[1] + '">' + x[2] + '<span>' + x[1] + '</span></button>'; }).join('') + '</div>' +
      '<div class="guide-agent' + (guessed ? ' unset' : '') + '"><span>Your AI</span>' +
        '<button type="button" data-mode="files" class="' + (m === 'files' ? 'on' : '') + '" title="Claude Code, Cursor, Codex, Claude Desktop with this folder. It reads your files and runs commands itself.">Runs commands</button>' +
        '<button type="button" data-mode="chat" class="' + (m === 'chat' ? 'on' : '') + '" title="ChatGPT, Claude.ai, Gemini. Prompts carry a snapshot of your data; you paste the reply back here.">Chat only</button>' +
        (guessed ? '<em title="Solo Ops guessed from how this page is open (node serve.js → an agent in this folder). One click sets it.">guessed</em>' : '') + '</div>' +
      (!backupDone() && backup.state !== 'unknown' && t !== 'settings' ? '<button type="button" class="guide-pending" title="Open Protect your work"><span class="dot"></span><span><b>Save your data somewhere private.</b> ' + (backup.state === 'ok' ? 'Right now it lives only on this computer.' : 'Nothing here says it is backed up yet.') + '</span><span class="go">Set up →</span></button>' : '') +
      (ffmpegCardDue() ? ffmpegCard() : '') +
      '<div class="guide-body">' +
      (t === 'quick' ? quickSection() : '') +
      (t === 'ask' ? askSection(all, pg) + '<div class="guide-search-wrap">' + I.search + '<input type="search" class="guide-search" placeholder="Search prompts" value="' + esc(query) + '" aria-label="Search prompts"></div><div id="guideList"></div>' : '') +
      (t === 'reply' ? '<div class="guide-status ' + (lc || carried && !carried.expired ? 'ok' : '') + '"><span class="dot"></span><span>' + (carried && carried.expired ? 'The lines handed to this page came too late (after 30 minutes) or for another project: paste the answer again.' : carried ? '<b>' + carried.n + ' line' + (carried.n === 1 ? '' : 's') + ' from your reply on ' + esc(carried.from) + '</b>: check ' + (carried.n === 1 ? 'it' : 'them') + ' and press Apply.' : m === 'files' ? 'Your agent changes the files itself, so there is nothing to paste back. This tab is for an answer it gave as text.' : lc ? '<b>' + esc(lc.t) + '</b> copied ' + esc(ago(lc.at)) + '. Paste ' + who(m) + '\'s answer below.' : 'Ask something in <b>Ask</b>, send it to ' + who(m) + ', then paste the answer here.') + '</span></div>' +
        (m === 'files' ? '<p class="guide-note">Your agent writes the files itself, so you rarely need this. Use it when it answers in the chat instead.</p>' : '') +
        (['overview', 'about'].indexOf(pg) >= 0 ? '<p class="guide-note">This page shows your project but does not save it: paste the answer on the <a href="' + r + 'calendar/calendar.html">Calendar</a> (tasks and posts), on <a href="' + r + 'index.html">Home</a> (inspiration), or on the page it is about.</p>' : '') +
        '<textarea class="guide-reply" rows="8" placeholder="Paste the whole answer here. The changes are picked out for you, and nothing happens until you press Preview.">' + esc(replyDraft.text) + '</textarea>' +
        '<div class="guide-row"><button type="button" class="gp-copy guide-preview">Preview changes</button><button type="button" class="guide-snap guide-snapbtn" title="Copy a text snapshot of this workspace for any chat">Copy project</button></div>' +
        '<div class="guide-plan"></div><div class="guide-result"></div><div class="guide-away"></div>' +
        '<details class="guide-sec small"><summary>How this works</summary><p>Your agent answers with a list of changes (or a plain checklist). Paste it here and press <b>Preview</b>: you see every change before anything happens, untick what you do not want, then <b>Apply</b>. The changes land in this workspace. Nothing runs on your computer, nothing is deleted, and every change shows in Home → Recent changes where it can be reverted.</p></details>' +
        (m === 'files' && global.Sync && Sync.getMode() === 'server' ? '<h4>Recent agent changes</h4><div class="guide-agentlog">Loading…</div>' : '') : '') +
      (t === 'settings' ? '<h4>How does your AI agent work?</h4><div class="guide-modes">' +
        '<label class="guide-mode' + (m === 'files' ? ' on' : '') + '"><input type="radio" name="gmode" value="files"' + (m === 'files' ? ' checked' : '') + '><b>It can run commands</b><span>Claude Code, Cursor, Codex, Claude Desktop with this folder. It reads your files, opens attachments, runs <code>node solo.js</code> itself.</span></label>' +
        '<label class="guide-mode' + (m === 'chat' ? ' on' : '') + '"><input type="radio" name="gmode" value="chat"' + (m === 'chat' ? ' checked' : '') + '><b>It is a chat</b><span>ChatGPT, Claude.ai, Gemini. Prompts carry a snapshot of your data; you paste the reply into Reply. No terminal needed.</span></label></div>' +
        (m === 'files' ? '<ol class="guide-steps"><li>Open this folder in your agent.</li><li>Type <code>/menu</code> (or say <b>"what can you do?"</b>): it lists what you can ask, by moment of the day. <code>/bring-in</code> brings your work in from Notion, Linear, Todoist or a list; <code>/start-day</code>, <code>/wrap</code>… every prompt in Ask ships as one (<code>.claude/commands</code> for Claude Code, <code>.cursor/commands</code> for Cursor; <code>node solo.js prompts export --for codex</code> for Codex).</li><li>Keep <code>node serve.js</code> running; pages update as the agent works. Images you attach are saved to <code>data/attachments/</code> so it can open them.</li></ol>'
         : m === 'chat' ? '<ol class="guide-steps"><li>Copy a prompt from <b>Ask</b> — it carries a snapshot of this workspace and the reply format, so a brand-new chat works.</li><li>When the agent replies with a code block, copy it.</li><li><b>Reply</b> → paste → Preview → Apply. If an item has an image the agent needs, upload it in the chat when asked.</li></ol>' : '') +
        (m ? '<h4>Set up once</h4><p>' + (m === 'chat' ? 'Optional: paste this into a ChatGPT or Claude <b>Project</b> as its instructions, and the chat knows Solo Ops before you say anything.' : 'For an agent that was <b>not</b> opened in this folder (Claude Desktop, a terminal started elsewhere): this tells it where the folder is and what to read.') + '</p>' + all.filter(function (x) { return x.c === 'setup' && (m === 'chat' ? x.t === 'Set up this chat' : x.t === 'Set up this folder'); }).map(function (x) { return row(all, x, pg); }).join('') : '') +
        '<h4>Protect your work</h4><div class="guide-status ' + (backup.state === 'ok' ? (backupFresh() ? 'ok' : 'warn') : Store.get(ACK_KEY) ? 'ok' : '') + '" id="guideBackup"><span class="dot"></span>' + backupLine() + '</div>' +
        (backupDone() ? '' : '<p class="guide-why"><b>Why this matters.</b> This folder is the Solo Ops code, and the code is public, including any copy of it. Your tasks, posts and drafts are yours: they stay out of it on purpose, so they need a private home of their own. Pick one way, once:</p>' +
          '<div class="guide-opt"><b>1 · Let your agent do it</b><span>' + (m === 'files' ? 'Type <code>/backup-setup</code> in Claude Code or Cursor, or copy the prompt below. It asks GitHub or folder, then does it.' : 'Open this folder in Claude Code, Cursor or Codex and type <code>/backup-setup</code>; a chat-only agent cannot do this part.') + '</span></div>' +
          (m === 'files' ? all.filter(function (x) { return x.t === 'Set up a private backup'; }).map(function (x) { return row(all, x, pg); }).join('') : '') +
          '<div class="guide-opt"><b>2 · Do it yourself, one command</b><span>In a terminal, in this folder. With the GitHub tool (<code>gh</code>) logged in it creates a private repo called <b>solo-ops-data</b> (change the name after <code>--name</code> if you like) and pushes; without it, it prints what to do instead. Nothing is created without telling you.</span><div class="guide-cmd"><code>node solo.js backup setup --name solo-ops-data</code><button type="button" class="guide-snap gd-copy" data-copy="node solo.js backup setup --name solo-ops-data">Copy</button></div></div>' +
          '<div class="guide-opt"><b>3 · No GitHub: a folder that syncs</b><span>iCloud Drive, Dropbox or Google Drive. A plain copy, no git.</span><div class="guide-cmd"><code>node solo.js backup --to "' + esc(navigator.platform.indexOf('Mac') >= 0 ? '~/Library/Mobile Documents/com~apple~CloudDocs/Solo Ops backup' : '~/Dropbox/Solo Ops backup') + '"</code><button type="button" class="guide-snap gd-copy" data-copy="' + esc('node solo.js backup --to "' + (navigator.platform.indexOf('Mac') >= 0 ? '~/Library/Mobile Documents/com~apple~CloudDocs/Solo Ops backup' : '~/Dropbox/Solo Ops backup') + '"') + '">Copy</button></div></div>' +
          '<p class="guide-note">Then once: <code>node solo.js backup --daily</code> and it repeats every evening.' + (backup.state === 'n/a' ? ' Already keep a copy another way? <button type="button" class="guide-link gd-ack">Mark as done</button>' : '') + '</p>') +
        (backupDone() ? '<p>Every change is logged and can be reverted from Home → Recent changes. A pasted reply never deletes anything. Your tasks never enter the public Solo Ops repo; the backup above is their private home. <code>node solo.js backup</code> runs it again, <code>--daily</code> schedules it.' + (Store.get(ACK_KEY) && !backupOk() ? ' <button type="button" class="guide-link gd-unack">Show the setup again</button>' : '') + '</p>' : '') +
        all.filter(function (x) { return x.c === 'fix' && x.t !== 'Set up a private backup' && !(m === 'chat' && x.slug === 'undo-agent'); }).map(function (x) { return row(all, x, pg); }).join('') +
        (m === 'chat' ? '<p class="guide-note">Undo a change: <a href="' + r + 'index.html">Home</a> → Recent changes → Restore (with <code>node serve.js</code> running), or <code>node solo.js revert &lt;id&gt;</code> in a terminal.</p>' : '') +
        (pstore().hidden.length ? '<p><button type="button" class="guide-snap pe-restore">Show ' + pstore().hidden.length + ' hidden built-in prompt' + (pstore().hidden.length === 1 ? '' : 's') + '</button></p>' : '') +
        '<h4>Your data</h4>' + dataSection() +
        '<h4>Read more</h4><p><a href="' + r + 'about.html">About Solo Ops: why, how, what is next</a> · <a href="' + r + 'README.md" target="_blank">README</a> · <a href="' + r + 'AGENTS.md" target="_blank">AGENTS.md</a> · <a href="' + r + 'prompts/agent-bootstrap.md" target="_blank">bootstrap prompt</a> · <a href="' + r + 'data/SCHEMA.md" target="_blank">data schema</a> · <a href="' + r + 'docs/guide.md" target="_blank">how the Guide works</a> · <a href="' + r + 'NEXT.md" target="_blank">what is next</a></p>' : '') +
      '</div>';
    panel.querySelector('.guide-close').onclick = close;
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-tab'), function (b) { b.onclick = function () { Store.set(TAB_KEY, b.dataset.tab, { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-agent [data-mode]'), function (b) { b.onclick = function () { Store.set(MODE_KEY, b.dataset.mode, { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('input[name=gmode]'), function (i) { i.onchange = function () { Store.set(MODE_KEY, i.value, { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); Store.set(TAB_KEY, 'ask', { silent: true }); render(); }; });
    var pr = panel.querySelector('.pe-restore'); if (pr) pr.onclick = restoreHidden;
    var pend = panel.querySelector('button.guide-pending'); if (pend) pend.onclick = openProtect;
    var ffc = panel.querySelector('.gd-ffcheck'); if (ffc) ffc.onclick = function () { ffc.textContent = 'Checking…'; ffmpegStatus(true).then(function () { render(); }); };
    var ffy = panel.querySelector('.gd-ffcopy'); if (ffy) ffy.onclick = function () { copyText(ffy.getAttribute('data-copy'), ffy, 'Copied'); };
    var ffs = panel.querySelector('.gd-ffsetup'); if (ffs) ffs.onclick = function () { openPrompt('setup-video'); };
    Array.prototype.forEach.call(panel.querySelectorAll('.gd-copy'), function (b) { b.onclick = function () { copyText(b.dataset.copy, b, 'Copied'); }; });
    var ack = panel.querySelector('.gd-ack'); if (ack) ack.onclick = function () { Store.set(ACK_KEY, new Date().toISOString(), { silent: true }); render(); };
    var unack = panel.querySelector('.gd-unack'); if (unack) unack.onclick = function () { Store.remove ? Store.remove(ACK_KEY) : Store.set(ACK_KEY, '', { silent: true }); render(); };
    var ex = panel.querySelector('.gd-export'); if (ex) ex.onclick = exportAll; var im = panel.querySelector('.gd-import'); if (im) im.onclick = importAll;
    if (t === 'quick') bindQuick();
    if (t === 'ask') {
      bindAsk(all, pg);
      renderList(all, here, pg);
      var si = panel.querySelector('.guide-search'); si.oninput = function () { query = si.value.trim(); renderList(all, here, pg); }; si.onkeydown = function (e) { if (e.key === 'Escape') { si.value = ''; query = ''; renderList(all, here, pg); } };
      if (query) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    }
    if (t === 'settings') bindList(all);
    if (t === 'reply') {
      panel.querySelector('.guide-reply').addEventListener('input', function () { panel.querySelector('.guide-plan').innerHTML = ''; });
      panel.querySelector('.guide-preview').onclick = previewReply; var rta = panel.querySelector('.guide-reply'); rta.oninput = function () { replyDraft.text = rta.value; replyDraft.previewed = false; };
      if (replyDraft.previewed && replyDraft.text.trim()) setTimeout(previewReply, 0);   // a re-render (the backup status arriving) keeps the preview
      fillAway();
      var sb = panel.querySelector('.guide-snapbtn'); sb.onclick = function () { copyText(snapshot(), sb, 'Copied'); };
      var al = panel.querySelector('.guide-agentlog');
      if (al) Sync.log(12).then(function (recs) { var rows = (recs || []).filter(function (x) { return x.source === 'agent'; }).slice(0, 6); al.innerHTML = rows.length ? '<ul class="guide-log">' + rows.map(function (x) { return '<li><b>' + esc(x.note || x.file) + '</b><span>' + esc(x.file) + ' · ' + esc(ago(x.ts)) + '</span></li>'; }).join('') + '</ul><p class="guide-note">Revert any of them from Home → Recent changes.</p>' : '<p class="guide-note">No agent changes yet. Open the folder in your agent and ask for a standup.</p>'; });
    }
    // footer: the two quick actions on every tab — apply a reply (preview first) and copy context
    var foot = document.createElement('div'); foot.className = 'guide-foot';
    var filesFoot = m === 'files' && t !== 'reply';
    foot.innerHTML = '<button type="button" class="guide-foot-apply">' + (filesFoot ? I.list + 'What can I ask?' : I.apply + (t === 'reply' ? 'Preview changes' : 'Paste the answer')) + '</button>' +
      '<div class="guide-ctx"><button type="button" class="guide-foot-ctx" title="Copy context for your agent: recent changes, the last task, this item, the whole project…">' + I.link + 'Copy context <span class="chev">▾</span></button><div class="guide-ctx-menu"></div></div>';
    panel.appendChild(foot);
    foot.querySelector('.guide-foot-apply').onclick = function () {
      if (filesFoot) { Store.set(TAB_KEY, 'ask', { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); query = ''; render(); var st = panel.querySelector('.guide-start'); if (st) { st.scrollIntoView({ block: 'start' }); st.classList.add('flash'); setTimeout(function () { st.classList.remove('flash'); }, 900); } return; }
      if (t === 'reply') { previewReply(); return; } Store.set(TAB_KEY, 'reply', { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); render(); var ta = panel.querySelector('.guide-reply'); if (ta) ta.focus(); };
    var ctxBtn = foot.querySelector('.guide-foot-ctx'); var ctxMenu = foot.querySelector('.guide-ctx-menu');
    ctxBtn.onclick = function (e) {
      e.stopPropagation();
      if (ctxMenu.classList.contains('open')) { ctxMenu.classList.remove('open'); return; }
      ctxMenu.innerHTML = (global.Context ? Context.menu() : []).map(function (it) { return '<button type="button" data-ctx="' + it.id + '"><b>' + esc(it.label) + '</b><span>' + esc(it.hint) + '</span><code>{{' + it.id + '}}</code></button>'; }).join('') + '<div class="guide-ctx-foot">Use any of these as a token inside your own prompts.</div>';
      Array.prototype.forEach.call(ctxMenu.querySelectorAll('[data-ctx]'), function (b) { b.onclick = function () { var txt = Context.get(b.dataset.ctx); ctxMenu.classList.remove('open'); copyText(txt, ctxBtn, 'Copied ' + Context.info(b.dataset.ctx).label.toLowerCase()); }; });
      ctxMenu.classList.add('open');
      setTimeout(function () { document.addEventListener('mousedown', function h(ev) { if (!ctxMenu.contains(ev.target) && ev.target !== ctxBtn && !ctxBtn.contains(ev.target)) { ctxMenu.classList.remove('open'); document.removeEventListener('mousedown', h); } }); }, 0);
    };
  }

  function openProtect() { Store.set(TAB_KEY, 'settings', { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); render(); var el = panel.querySelector('#guideBackup'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1200); } }

  /* ---- Quick: the five-second actions, no agent needed ------------------ */
  function priBadge(p) { return '<span class="qk-pri ' + esc(p) + '" title="Click to change priority">' + esc(p === 'medium' ? 'med' : p) + '</span>'; }
  function quickRow(x, i) {
    var t = x.task; return '<li class="qk-row' + (t.col === 'doing' ? ' doing' : '') + '" data-i="' + i + '">' +
      (t.col === 'doing' ? '<button type="button" class="qk-btn qk-done" title="Mark done">' + I.check + '</button>' : '<button type="button" class="qk-btn qk-start" title="Start: move to Doing">' + I.play + '</button>') +
      '<span class="qk-main"><b>' + esc(t.title) + '</b><span>' + esc(x.wsTitle) + (Config.boards(x.ws).length > 1 ? ' · ' + esc(x.boardTitle) : '') + (t.col === 'doing' ? ' · doing' : '') + '</span></span>' + priBadge(t.pri) + '</li>';
  }
  function quickSection() {
    var w = Config.ws(); var boards = Config.boardsInView(w.id); var top = global.Quick ? Quick.top(10) : []; var pg = page();
    return (quickNote && Date.now() < quickNote.until ? '<div class="qk-note show">' + esc(quickNote.msg) + '</div>' : '') +
      '<h4>' + I.play + ' What are you doing?</h4>' +
      '<div class="qk-box"><input type="text" class="qk-now" placeholder="Type it, any project — “recording stack”, “pricing page”…" autocomplete="off"><div class="qk-matches"></div></div>' +
      '<h4>' + I.plus + ' Add tasks <span class="guide-hint">to ' + esc(w.title) + '</span></h4>' +
      '<div class="qk-box"><textarea class="qk-add" rows="2" placeholder="One per line. Enter adds, Shift+Enter for another line.\n@project #tag !high >later also work"></textarea>' +
      '<div class="qk-opts"><select class="qk-pri-sel" title="Priority for lines without !high / !low"><option value="high">high</option><option value="medium" selected>medium</option><option value="low">low</option></select>' +
      (boards.length > 1 ? '<select class="qk-board" title="Which board">' + boards.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.title) + '</option>'; }).join('') + '</select>' : '') +
      '<button type="button" class="gp-copy qk-add-btn">Add</button></div></div>' +
      '<h4>' + I.list + ' Top tasks <span class="guide-hint">all projects</span><button type="button" class="qk-copy" title="Copy this list for your agent">copy</button></h4>' +
      (top.length ? '<ul class="qk-top">' + top.map(quickRow).join('') + '</ul>' : '<p class="guide-note">Nothing in Doing or To Do yet. Add tasks above.</p>') +
      '<p class="guide-foot-note">Doing first, then To Do by priority. ▶ starts a task, ✓ finishes it, the badge changes priority. Every change is logged like any other.' + (pg !== 'board' ? ' Boards update when you open them.' : '') + '</p>';
  }
  /* ---- Ask: one box, what you want in plain words, with the context attached ------ */
  var replyDraft = { text: '', previewed: false };   // Reply's pasted answer, kept across re-renders like the Ask box
  var ask = { text: '', chips: null, focus: false, more: false };   // survives the re-renders (open() re-renders twice while the backup status and folder arrive)
  var ASK_DEFAULT = {}; Object.keys((global.MARATHON_PROMPTS || {}).PAGES || {}).forEach(function (k) { ASK_DEFAULT[k] = MARATHON_PROMPTS.PAGES[k].chips; });   // what "Sends along" ticks first on each page
  function who(m) { return m === 'files' ? 'your agent' : 'your AI'; }
  function askChips(pg) {
    if (!ask.chips) { var d = (ASK_DEFAULT[pg] || ASK_DEFAULT.home).slice(); if (d.indexOf('this') >= 0 && !hasThis()) { d = d.filter(function (c) { return c !== 'this'; }); if (!d.length) d = ['recent']; } ask.chips = d; }
    return ask.chips;
  }
  function chipLabel(it) {   // "This item" names the item: a user sees what goes along, not a token
    if (it.id !== 'this' && it.id !== 'last_task') return it.label;
    var txt = global.Context ? Context.get(it.id) : ''; var first = (txt.match(/^#\s*([^\n]*)/) || [])[1] || '';
    if (/^(Task|Post|Last task I touched|Task in progress)/.test(first)) { var m = txt.match(/^#[^\n]*\n\[[^\]]+\]\s*([^·\n]+)/); if (m) return (it.id === 'last_task' ? 'Last task' : 'This ' + (/^Post/.test(first) ? 'post' : 'task')) + ': ' + m[1].trim().slice(0, 40); }
    if (/^Take/.test(first)) { var tm = first.match(/^Take \[[^\]]+\]\s*([^·]+)/); return 'This take: ' + (tm ? tm[1].trim().slice(0, 40) : ''); }
    if (/^(Script|Draft)/.test(first)) { var title = first.replace(/^(Script|Draft)[^:]*:?\s*/, '').replace(/\(.*$/, '').trim(); if (!title) { var m2 = txt.match(/\n#\s+([^\n]{1,60})/); title = m2 ? m2[1].trim() : ''; } return 'This ' + (/^Script/.test(first) ? 'script' : 'draft') + (title ? ': ' + title.slice(0, 40) : ''); }
    return it.label + (hasThis() ? '' : ' (nothing open)');
  }
  function hasThis() { var t = global.Context ? Context.get('this') : ''; return /^# (Task|Post|Script|Draft|Take|Last task I touched|Task in progress)/.test(t); }   // one open item, not the board/project fallback
  function askItems() {   // the Context menu minus "Last task" when it is the same card as "This item"
    var items = global.Context ? Context.menu() : []; var same = items.some(function (x) { return x.id === 'this'; }) && items.some(function (x) { return x.id === 'last_task'; }) && Context.get('this').split('\n')[1] === Context.get('last_task').split('\n')[1];
    return same ? items.filter(function (x) { return x.id !== 'last_task'; }) : items;
  }
  function startSlugs() {   // Home, Board, Calendar: getting started, then the moment of the day; the other pages: their own first three
    var P = global.MARATHON_PROMPTS; if (!P || !P.startWith) return []; var pg = page();
    var hidden = pstore().hidden; var titles = startSlugs.titles || (startSlugs.titles = (function () { var m = {}; P.build({ mode: 'chat' }).forEach(function (y) { m[y.slug] = y.t; }); return m; })()); var ok = function (sl) { return hidden.indexOf(titles[sl]) < 0; };   // titles do not change with the mode
    var gettingStarted = ['home', 'board', 'calendar'].indexOf(pg) >= 0 || (pg === 'overview' && projectEmpty());   // an empty Overview starts like Home
    if (!gettingStarted && P.FOR_PAGE && P.FOR_PAGE[pg]) return P.FOR_PAGE[pg].filter(ok).slice(0, 3);
    return P.startWith(projectEmpty(), new Date().getHours()).filter(ok);   // a hidden prompt is never offered
  }
  function startSection(all) {   // "Start with one": an empty project gets Get started; otherwise the moment of the day (core/prompts.js startWith)
    var m = effMode(); var list = startSlugs().map(function (sl) { return all.filter(function (x) { return x.slug === sl; })[0]; }).filter(Boolean); if (!list.length) return '';
    return '<div class="guide-start"><div class="guide-start-h">' + (projectEmpty() ? 'Start here' : 'Start with one') + '</div>' +
      list.map(function (x) { return '<button type="button" class="guide-start-b" data-slug="' + esc(x.slug) + '" title="' + esc(x.d) + '"><b class="gp-t">' + esc(x.t) + '</b>' + (m === 'files' ? '<code>/' + esc(x.slug) + '</code>' : '') + '</button>'; }).join('') +
      '<p class="guide-note">' + (m === 'files' ? 'Type the command in your agent, or click to copy the prompt. <code>/menu</code> lists everything.' : 'Click to copy the prompt for your AI, paste it there, then bring the answer back in <b>Reply</b>. Everything else is below.') + '</p></div>';
  }
  function askSection(all, pg) {
    var m = effMode(); var on = askChips(pg); var items = askItems();
    var shown = ask.more ? items : items.filter(function (it, i) { return on.indexOf(it.id) >= 0 || i < 3; });   // the page's few; the rest behind "more"
    var setup = m !== 'files' ? all.filter(function (x) { return x.t === 'Set up this chat'; })[0] : null;
    return startSection(all) + (setup ? '<div class="guide-teach"><div><b>New chat? Paste this first, once.</b><span>Then your AI knows how Solo Ops works. Skip it if you use a ChatGPT or Claude Project that already has it.</span></div><button type="button" class="guide-snap guide-teach-copy" data-i="' + all.indexOf(setup) + '">Copy setup</button></div>' : '') +
      '<div class="guide-ask"><h4>Ask ' + who(m) + '</h4>' +
      '<textarea class="guide-ask-in" rows="2" placeholder="Say it in plain words — “move this to done and write a script for it”">' + esc(ask.text) + '</textarea>' +
      '<div class="guide-chips"><span class="guide-chips-l">Sends along:</span>' + shown.map(function (it) { var isOn = on.indexOf(it.id) >= 0; return '<button type="button" class="guide-chip' + (isOn ? ' on' : '') + '" data-chip="' + it.id + '" title="' + esc(it.hint) + (isOn ? ' · click to leave it out' : ' · click to send it along') + '">' + (isOn ? '<span class="tick">✓</span>' : '') + esc(chipLabel(it)) + '</button>'; }).join('') + (items.length > shown.length ? '<button type="button" class="guide-chip more" data-more="1" title="More things to send along">+ ' + (items.length - shown.length) + ' more</button>' : '') + '</div>' +
      '<button type="button" class="gp-copy guide-ask-copy">Copy for ' + who(m) + '</button>' +
      '<p class="guide-note">' + (m === 'files' ? 'Paste it into your agent in this folder, or just say the same there. It changes the files itself, and this page follows on its own.' : 'Paste it into ChatGPT or Claude. When it answers, bring the answer back in <b>Reply</b>.') + '</p></div>';
  }
  function bindAsk(all, pg) {
    var ta = panel.querySelector('.guide-ask-in'); if (!ta) return;
    ta.oninput = function () { ask.text = ta.value; }; ta.onfocus = function () { ask.focus = true; }; ta.onblur = function () { ask.focus = false; };
    ta.onkeydown = function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); copyAsk(pg); } };
    if (ask.focus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-chip'), function (b) { b.onclick = function () { if (b.dataset.more) { ask.more = true; render(); return; } var c = askChips(pg); var i = c.indexOf(b.dataset.chip); if (i >= 0) c.splice(i, 1); else c.push(b.dataset.chip); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-start-b'), function (b) { b.onclick = function () { var x = all.filter(function (y) { return y.slug === b.dataset.slug; })[0]; if (!x) return; var nd = needs(x); if (nd) { var bt = b.querySelector('.gp-t'); var was = bt.textContent; bt.textContent = nd; setTimeout(function () { bt.textContent = was; }, 2200); return; } if (blanks(x).length) { openPrompt(x.slug, { form: true }); return; } copyPrompt(x, b); }; });
    panel.querySelector('.guide-ask-copy').onclick = function () { copyAsk(pg); };
    var tc = panel.querySelector('.guide-teach-copy'); if (tc) tc.onclick = function () { copyText(global.Context ? Context.fill(all[+tc.dataset.i].p) : all[+tc.dataset.i].p, tc, 'Copied'); };   // not finish(): nothing to paste back after the setup text
  }
  function copyAsk(pg) {
    var btn = panel.querySelector('.guide-ask-copy'); var ta = panel.querySelector('.guide-ask-in'); var text = ask.text.trim();
    if (!text) { ta.focus(); var old = btn.textContent; btn.textContent = 'Type what you want first.'; setTimeout(function () { if (btn.textContent === 'Type what you want first.') btn.textContent = old; }, 1800); return; }
    var P = global.MARATHON_PROMPTS; var o = opts(); var files = o.mode === 'files';   // the mode stays a guess until the person picks one (a chat user may run node serve.js too)
    var chips = askChips(pg).filter(function (id) { return global.Context && Context.info(id); });
    var parts = chips.map(function (id) { var body = Context.get(id); return (/^#/.test(body) ? '' : '# ' + Context.info(id).label + '\n') + body; });
    var out = (P ? P.head(o) : '') + (parts.length ? parts.join('\n\n') + '\n\n' : '') + 'WHAT I WANT:\n' + text + (files ? '\n\nThe ids above are the ones `node solo.js show <id>` takes.' : '') + (P && !files ? '\n\n' + P.cheatsheet() : '');
    btn.textContent = 'Copy for ' + who(o.mode);   // in case the empty-box warning is still showing
    Store.setJSON(LAST_KEY, { t: 'Your ask', at: Date.now(), ws: Config.activeWs() }, { silent: true });   // Reply's status line: "Your ask copied…"
    copyText(out, btn, 'Copied — now paste it into ' + who(o.mode)).then(function (ok) { if (ok) { ask.text = ''; ta.value = ''; } });   // a failed copy keeps the text
  }
  var quickNoteT = null; var quickNote = null;   // { msg, until }: survives the re-renders that follow a change
  function bindQuick() {
    var body = panel.querySelector('.guide-body'); var top = Quick.top(10);
    // re-render, then show a one-line confirmation on the fresh panel
    function redraw(msg) { if (msg) { quickNote = { msg: msg, until: Date.now() + 2400 }; clearTimeout(quickNoteT); quickNoteT = setTimeout(function () { var n = panel.querySelector('.qk-note'); if (n) n.classList.remove('show'); }, 2400); } render(); }
    // what are you doing? → matches across projects → Doing
    var now = body.querySelector('.qk-now'); var mt = body.querySelector('.qk-matches'); var found = [];
    function showMatches() {
      var q = now.value.trim(); if (!q) { mt.innerHTML = ''; found = []; return; }
      found = Quick.find(q, 3);
      var strong = found[0] && found[0].ratio >= 0.5;
      mt.innerHTML = found.map(function (x, i) { return '<button type="button" class="qk-match' + (i === 0 && strong ? ' first' : '') + '" data-i="' + i + '">' + I.play + '<span><b>' + esc(x.task.title) + '</b><em>' + esc(x.wsTitle) + ' · ' + esc(x.task.col) + ' · ' + esc(x.task.pri) + '</em></span></button>'; }).join('') +
        '<button type="button" class="qk-match new' + (strong ? '' : ' first') + '" data-new="1">' + I.plus + '<span><b>Start a new task: “' + esc(q.slice(0, 60)) + '”</b><em>in ' + esc(Config.ws().title) + ', straight into Doing</em></span></button>';
      Array.prototype.forEach.call(mt.querySelectorAll('.qk-match'), function (b) { b.onclick = function () { choose(b.dataset.new ? null : found[+b.dataset.i]); }; });
    }
    function choose(x) {
      var q = now.value.trim();
      var msg = '';
      if (x) { Quick.setCol(x, 'doing'); msg = 'Now doing: ' + x.task.title; }
      else if (q) { var m = Quick.startNew(q); if (m) msg = 'Started: ' + m.task.title; }
      now.value = ''; redraw(msg);
    }
    now.oninput = showMatches;
    now.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); choose(found[0] && found[0].ratio >= 0.5 ? found[0] : null); } if (e.key === 'Escape') { now.value = ''; showMatches(); } };
    setTimeout(function () { now.focus(); }, 50);
    // add tasks
    var ta = body.querySelector('.qk-add'); var addBtn = body.querySelector('.qk-add-btn');
    function count() { var n = ta.value.split('\n').filter(function (l) { return Quick.parseLine(l).title; }).length; addBtn.textContent = n > 1 ? 'Add ' + n + ' tasks' : 'Add'; }
    function doAdd() { var bsel = body.querySelector('.qk-board'); var made = Quick.addLines(ta.value, { pri: body.querySelector('.qk-pri-sel').value, board: bsel ? bsel.value : undefined }); if (!made.length) { ta.focus(); return; } ta.value = ''; redraw('Added ' + made.length + ' task' + (made.length === 1 ? '' : 's') + ' to ' + made[0].boardTitle); }
    ta.oninput = count; ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAdd(); } }; addBtn.onclick = doAdd;
    // top tasks
    Array.prototype.forEach.call(body.querySelectorAll('.qk-row'), function (li) {
      var x = top[+li.dataset.i]; if (!x) return;
      var st = li.querySelector('.qk-start'); if (st) st.onclick = function () { Quick.setCol(x, 'doing'); redraw('Now doing: ' + x.task.title); };
      var dn = li.querySelector('.qk-done'); if (dn) dn.onclick = function () { Quick.setCol(x, 'done'); redraw('Done: ' + x.task.title); };
      li.querySelector('.qk-pri').onclick = function () { var next = { high: 'medium', medium: 'low', low: 'high' }[x.task.pri] || 'high'; Quick.setPri(x, next); redraw(); };
    });
    var cp = body.querySelector('.qk-copy'); if (cp) cp.onclick = function () { copyText('TOP TASKS (all projects)\n' + Quick.asList(top), cp, 'copied'); };
  }
  // the Ask tab's list: search results, or nudges + this page + groups + about
  function forPage(all, pg) {
    var P = global.MARATHON_PROMPTS || {}; var order = (projectEmpty() && ['home', 'board', 'calendar', 'overview'].indexOf(pg) >= 0 ? (P.GET_STARTED || []) : []).concat((P.FOR_PAGE || {})[pg] || []);
    var rank = function (x) { var i = order.indexOf(x.slug); return i < 0 ? 1000 + all.indexOf(x) : i; };
    var empty = projectEmpty() && ['home', 'board', 'calendar', 'overview'].indexOf(pg) >= 0;   // nothing on the board yet: only what works without tasks
    return all.filter(function (x) { return x.pages.indexOf(pg) >= 0 && (!empty || x.custom || (P.EMPTY_OK || []).indexOf(x.slug) >= 0); }).sort(function (a, b) { return rank(a) - rank(b); });
  }
  // the groups never repeat what Start shows, except the prompt being opened (Start here on a prompt with blanks opens its form there)
  function renderList(all, here, pg) {
    var el = panel.querySelector('#guideList'); var m = effMode(); var sw = startSlugs(); here = here.filter(function (x) { return sw.indexOf(x.slug) < 0; });
    if (query) {
      var hits = all.filter(function (x) { return matches(x, query); });
      el.innerHTML = '<div class="guide-cat"><b>' + (hits.length ? hits.length + ' prompt' + (hits.length === 1 ? '' : 's') : 'No prompt') + '</b><span class="cat-sub">for “' + esc(query) + '”</span></div>' +
        (hits.length ? hits.map(function (x) { return row(all, x, pg); }).join('') : '<p class="guide-note">Try another word, or add your own prompt with + in any group.</p>');
      bindList(all); return;
    }
    var top = here.slice(0, 5); var open = openCats();
    el.innerHTML = '<div class="guide-moves compact" id="guideMoves"></div>' +
      (top.length ? '<div class="guide-cat"><span class="cat-ic">' + I.link + '</span><b>For this page</b></div>' + top.map(function (x) { return row(all, x, pg); }).join('') : '') +
      CATS.filter(function (c) { return ASK.indexOf(c[0]) >= 0; }).map(function (c) { var g = all.filter(function (x) { return x.c === c[0] && top.indexOf(x) < 0 && (startSlugs().indexOf(x.slug) < 0 || x.slug === pendingSlug); }); if (!g.length) return ''; return '<details class="guide-sec" data-cat="' + c[0] + '"' + (open[c[0]] ? ' open' : '') + '><summary><span class="cat-ic">' + I[c[0]] + '</span><b>' + esc(c[1]) + '</b><span class="cat-sub">' + esc(c[2]) + '</span><span class="guide-hint">' + g.length + '</span><button type="button" class="cat-add" data-cat="' + c[0] + '" title="Add my own prompt here">+</button></summary>' + g.map(function (x) { return row(all, x, pg); }).join('') + '<div class="gp-new" data-cat="' + c[0] + '"></div></details>'; }).join('') +
      '<details class="guide-sec" data-cat="about"' + (open.about ? ' open' : '') + '><summary><span class="cat-ic">' + I.moves + '</span><b>This page</b><span class="cat-sub">what it does · shortcuts</span></summary>' + (ABOUT[pg] || []).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '<p>⌘K commands · ⌘⇧I capture · ? this guide · n add · 1/2/3 board views</p></details>' +
      '<p class="guide-foot-note">Click a prompt to copy it' + (m === 'chat' ? '; it carries a snapshot of this workspace and the reply format, so a fresh chat needs no setup' : m === 'files' ? '; it tells the agent what to read and change. The same prompts are slash commands in Claude Code and Cursor: type /menu there for the list by moment of the day' : '') + '. ✎ edits a prompt, + adds your own.</p>';
    bindList(all); focusPending(all);
    Array.prototype.forEach.call(el.querySelectorAll('details.guide-sec[data-cat]'), function (d) { d.addEventListener('toggle', function () { var o = openCats(); o[d.dataset.cat] = d.open; Store.setJSON(CAT_KEY, o, { silent: true }); }); });
    renderMoves(all);
  }
  function bindList(all) {
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-prompt'), function (cardEl) { if (!cardEl._bound) { cardEl._bound = true; bindCard(cardEl, all[+cardEl.dataset.i]); } });
    Array.prototype.forEach.call(panel.querySelectorAll('.gp-edit'), function (b) { b.onclick = function (e) { e.stopPropagation(); editPrompt(all[+b.dataset.i], b.closest('.guide-prompt')); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('.cat-add'), function (b) { b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); var d = b.closest('details'); if (d && !d.open) d.open = true; newPrompt(b.dataset.cat, panel.querySelector('.gp-new[data-cat="' + b.dataset.cat + '"]')); }; });
  }
  function row(all, x, pg) {
    var i = all.indexOf(x); var bl = blanks(x); var m = effMode();
    var tip = (bl.length ? 'Asks for ' + bl.join(', ') + ', then copies' : 'Copies this prompt') + (m === 'chat' ? ' with a snapshot of this workspace' : '') + '.';
    return '<div class="guide-prompt row' + (x.custom ? ' custom' : '') + '" data-i="' + i + '"><button type="button" class="gp-main" title="' + esc(tip) + '"><span class="gp-t">' + esc(x.t) + '</span>' + (m === 'files' && x.builtin && !x.overridden && x.slug && (x.c !== 'setup' || x.slash) ? '<code class="gp-slash" title="Type this in Claude Code or Cursor">/' + esc(x.slug) + '</code>' : '') + (x.custom ? '<span class="gp-mine">mine</span>' : x.overridden ? '<span class="gp-mine">edited</span>' : '') + '</button><button type="button" class="gp-edit" title="Edit this prompt" data-i="' + i + '"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button><div class="gp-d">' + esc(x.d) + (x.go && x.go !== pg ? ' <span class="gp-go">Then open ' + esc(GO[x.go] ? GO[x.go][1] : x.go) + '.</span>' : '') + (m === 'chat' && x.reply === 'terminal' ? ' <span class="gp-go">Ends in commands you run yourself, in a terminal in your Solo Ops folder (or paste it into Claude Code or Cursor, which run them).</span>' : '') + (needs(x) ? ' <span class="gp-go">' + esc(needs(x)) + '.</span>' : '') + '</div><div class="gp-form"></div></div>';
  }

  /* ---- your data: where it is, auto-save, export / import, backups ---- */
  function dataFiles() {
    var w = Config.ws(); var files = [];
    Config.workspaces().forEach(function (x) { Config.boards(x.id).forEach(function (b) { files.push({ file: Config.boardFile(b.id, x.id), key: Config.boardKey(b.id, x.id), wrap: 'tasks', label: x.title + ' · ' + b.title }); });
      if (x.apps.social) files.push({ file: Config.file('social', x.id), key: Config.key('social', x.id), wrap: 'posts', label: x.title + ' · posts' });
      if (x.apps.scripts) files.push({ file: Config.file('scripts', x.id), key: Config.key('scripts', x.id), wrap: null, label: x.title + ' · scripts' });
      if (x.apps.writing) files.push({ file: Config.file('writing', x.id), key: Config.key('writing', x.id), wrap: null, label: x.title + ' · notes' });
      if (x.apps.video) files.push({ file: Config.file('videos', x.id), key: Config.key('videos', x.id), wrap: null, label: x.title + ' · takes' }); });
    files.push({ file: 'inspiration.json', key: 'marathon.inspiration', wrap: null, label: 'inspiration' }, { file: 'boards.json', key: Config.BOARDS_KEY, wrap: null, label: 'boards registry' }, { file: 'workspaces.json', key: Config.WS_KEY, wrap: null, label: 'workspaces registry' }, { file: 'prompts.json', key: PKEY, wrap: null, label: 'your prompts' }, { file: 'settings.json', key: 'marathon.theme', wrap: 'theme', label: 'theme' });
    return files;
  }
  function dataSection() {
    var m = global.Sync ? Sync.getMode() : 'manual'; var ok = m === 'server' || m === 'folder';
    var files = dataFiles(); var total = 0; var rows = files.map(function (f) { var raw = Store.get(f.key) || ''; total += raw.length; return '<li><span>' + esc(f.label) + ' <b>' + esc(f.file) + '</b></span><span>' + (raw ? Math.max(1, Math.round(raw.length / 1024)) + ' KB' : '—') + '</span></li>'; }).join('');
    return '<div class="guide-status ' + (ok ? 'ok' : '') + '"><span class="dot"></span><span>' + (m === 'server' ? '<b>Auto-saving</b> to this browser and to the data folder on disk.' : m === 'folder' ? '<b>Auto-saving</b> to this browser and to the linked folder.' : '<b>Saved in this browser only.</b> Run <code>node serve.js</code> or link the folder so files on disk stay in step.') + '</span></div>' +
      '<p>Everything is plain files in <code>data/</code>, ' + files.length + ' of them, about ' + Math.max(1, Math.round(total / 1024)) + ' KB. Nothing is sent anywhere.</p>' +
      '<div class="guide-row"><button type="button" class="gp-copy gd-export">Export everything (one file)</button><button type="button" class="guide-snap gd-import">Import…</button></div>' +
      '<p class="guide-note">' + (ok ? 'Exports and the safety copies made before a destructive action land in <code>data/exports/</code>, next to your data.' : 'Exports download to your browser\'s download folder; with <code>node serve.js</code> or a linked folder they land in <code>data/exports/</code> instead.') + '</p>' +
      '<details class="guide-sec small"><summary>Details: files, sizes, attachments</summary><ul class="guide-files">' + rows + '</ul>' +
      '<p>An image you drop keeps a small thumbnail inside the item; the original is written to <code>data/attachments/</code> when <code>node serve.js</code> is running or the folder is linked, and waits in this browser until then. Other files are copied the same way up to ' + (global.Attach ? Attach.cfg().copyMaxMB : 25) + ' MB (<code>attachments.copyMaxMB</code> in solo.config.js); bigger ones are saved by name and you paste a path or link.' + (global.Sync && !Sync.attachmentsAvailable() ? ' <b>Right now originals stay in this browser only.</b>' : '') + '</p>' +
      '<p>Terminal: <code>node solo.js doctor</code> checks every file, attachment and the backup age · <code>node solo.js backup</code> refuses a public GitHub repo on purpose · <code>node solo.js prompts</code> lists your prompts (they live in <code>data/prompts.json</code>).</p></details>';
  }
  function exportAll() {
    var files = dataFiles(); var bundle = { version: 1, exportedAt: new Date().toISOString(), app: 'Solo Ops', files: {} };
    files.forEach(function (f) { var v = Store.getJSON(f.key, null); if (v == null) return; var body = f.wrap ? (function () { var o = {}; o[f.wrap] = v; return o; })() : v; if (f.file.indexOf('.json') > 0 && !f.wrap && f.wrap !== null) {} bundle.files[f.file] = Object.assign({ version: 1, updatedAt: new Date().toISOString() }, body); });
    var name = 'solo-ops-backup-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json'; var btn = panel && panel.querySelector('.gd-export');
    Sync.saveFile(name, JSON.stringify(bundle, null, 2) + '\n', 'application/json').then(function (r) { if (!btn) return; var old = btn.textContent; btn.textContent = r.text; btn.classList.add('copied'); setTimeout(function () { btn.textContent = old; btn.classList.remove('copied'); }, 3200); });
  }
  function importAll() {
    var i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
    i.onchange = function () {
      var f = i.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () {
        var b; try { b = JSON.parse(r.result); } catch (e) { alert('Not a Solo Ops backup.'); return; }
        if (!b || !b.files) { alert('Not a Solo Ops backup (expected a file made by Export everything).'); return; }
        var names = Object.keys(b.files); if (!confirm('Import ' + names.length + ' files from ' + (b.exportedAt || 'this backup') + '? Current content of those files is replaced (every file write is logged and revertable).')) return;
        var known = dataFiles(); var done = 0;
        var chain = Promise.resolve();
        names.forEach(function (name) {
          var obj = b.files[name]; var spec = known.filter(function (k) { return k.file === name; })[0];
          chain = chain.then(function () {
            if (global.Sync && (Sync.getMode() === 'server' || Sync.getMode() === 'folder')) { obj.updatedAt = new Date().toISOString(); return Sync.writeFile(name, obj).then(function () { done++; }); }
            if (spec) { var v = spec.wrap ? obj[spec.wrap] : obj; if (spec.wrap === 'theme') v = obj.theme; if (v != null) { Store.setJSON(spec.key, v); done++; } }
          }).catch(function () {});
        });
        chain.then(function () { if (global.Sync) return Sync.pullAll(false); }).then(function () { alert('Imported ' + done + ' file' + (done === 1 ? '' : 's') + '. Reloading.'); location.reload(); });
      };
      r.readAsText(f);
    };
    i.click();
  }

  /* ---- next best moves: read the workspace, suggest up to 4, each wired to a prompt ---- */
  function moves(all) {
    var w = Config.ws(); var out = []; var m = mode();
    var tasks = []; var anyFresh = false;
    Config.boardsInView(w.id).forEach(function (b) { var k = Config.boardKey(b.id, w.id); if (Store.isSample ? Store.isSample(k) : Store.isFresh(k)) anyFresh = true; (Store.getJSON(k, []) || []).forEach(function (t) { tasks.push(t); }); });
    var doing = tasks.filter(function (t) { return t.col === 'doing'; }); var todo = tasks.filter(function (t) { return t.col === 'todo'; });
    var noSteps = tasks.filter(function (t) { return (t.col === 'doing' || (t.col === 'todo' && t.pri === 'high')) && !(t.checklist || []).length; });
    var posts = w.apps.social ? (Store.getJSON(Config.key('social', w.id), []) || []) : [];
    var soon = new Date(Date.now() + 7 * 86400000); var noCopy = posts.filter(function (p) { return p.status !== 'posted' && !p.copy && new Date(p.datetime) <= soon; });
    var unposted = posts.filter(function (p) { return p.status !== 'posted'; });
    var ins = global.InspoModel ? (function () { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } return InspoModel.list({ status: 'new' }).filter(function (x) { return !x.ws || x.ws === w.id; }).length; })() : 0;
    var act = global.Activity ? Activity.summary() : null;
    function by(t) { return all.filter(function (x) { return x.t === t; })[0]; }
    var empty = !tasks.length && !posts.length;
    if (empty && !anyFresh) { out.push({ s: 'Your project is empty. Bring your work in from Notion, Linear, Todoist or a list.', p: by('Bring in my work') }); out.push({ s: 'Starting something new? Plan it in five questions.', p: by('Plan a project from scratch') }); }
    if (anyFresh) out.push({ s: 'This is still the sample board. Plan your real project.', p: by('Plan a project from scratch') });
    if (act && act.lastActive && act.idle) out.push({ s: 'Nothing has moved for ' + Math.round(act.hoursIdle) + ' hours. A standup gets you back in.', p: by('Daily standup') });
    if (tasks.length && !doing.length) out.push({ s: 'Nothing is in Doing. Pick the next step.', p: by('What should I do right now?') });
    if (doing.length > 3) out.push({ s: doing.length + ' tasks in Doing — more than one person can carry. Trim it.', p: by('Clean up the board') });
    if (noSteps.length) out.push({ s: noSteps.length + ' important task' + (noSteps.length === 1 ? ' has' : 's have') + ' no steps yet: "' + noSteps[0].title.slice(0, 40) + '"…', p: by('Break this task into steps') });
    if (noCopy.length) out.push({ s: noCopy.length + ' post' + (noCopy.length === 1 ? '' : 's') + ' in the next 7 days ' + (noCopy.length === 1 ? 'has' : 'have') + ' no copy.', p: by('Draft next week\'s posts') });
    if (w.apps.social && !unposted.length && !anyFresh && !empty && Store.get(Config.key('social', w.id)) != null) out.push({ s: 'No posts on the schedule. Keep the cadence going.', p: by('Brainstorm 10 post ideas') });   // only when this browser knows the schedule
    var insNew = global.InspoModel ? InspoModel.listNew(w.id).length : 0;
    if (insNew) out.push({ s: insNew + ' new inspiration item' + (insNew === 1 ? '' : 's') + ' since your last assessment.', p: by('Assess new inspiration') });
    else if (ins >= 3) out.push({ s: ins + ' inspiration items waiting to become work.', p: by('Turn inspiration into work') });
    if (todo.length > 25) out.push({ s: todo.length + ' items in To Do. Park what is not this month.', p: by('Clean up the board') });
    if (!anyFresh && tasks.length > 3 && backup.state !== 'unknown') {
      if (backupDone() && backup.state === 'ok' && backup.repo && backupDays() !== null && backupDays() >= 7) out.push({ s: 'Last backup was ' + backupDays() + ' days ago.', p: by('Back up now') });
    }
    var sw = startSlugs(); out = out.filter(function (mv) { return mv.open || (mv.p && sw.indexOf(mv.p.slug) < 0); });   // never twice (Start here shows it), never a move whose prompt is hidden
    return out.slice(0, 4);
  }
  function renderMoves(all) {
    var el = panel.querySelector('#guideMoves'); var list = moves(all);
    if (!el) return;
    if (!list.length) { el.innerHTML = projectEmpty() ? '' : '<div class="guide-move ok"><span class="dot"></span><span>Board looks healthy. Start your day in the morning, wrap up at night.</span></div>'; return; }   // an empty project: Start here says it all
    var compact = el.classList.contains('compact');
    el.innerHTML = '<div class="guide-moves-h">Next</div>' + (compact ? list.slice(0, 2) : list).map(function (mv, i) { return '<button type="button" class="guide-move" data-i="' + i + '"><span class="dot"></span><span>' + esc(mv.s) + '</span><span class="go">' + (mv.p ? esc(mv.p.t) + ' →' : mv.open === 'backup' ? 'Set up →' : 'Choose →') + '</span></button>'; }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.guide-move'), function (b) {
      b.onclick = function () {
        var mv = list[+b.dataset.i];
        if (mv.open === 'connect') { var sw = panel.querySelector('.guide-agent'); if (sw) { sw.classList.add('flash'); setTimeout(function () { sw.classList.remove('flash'); }, 1200); } return; }
        if (mv.open === 'backup') { openProtect(); return; }
        if (!mv.p) return;
        var idx = all.indexOf(mv.p); var card = panel.querySelector('.guide-prompt[data-i="' + idx + '"]');
        if (!card) { Store.set(TAB_KEY, 'ask', { silent: true }); query = ''; render(); card = panel.querySelector('.guide-prompt[data-i="' + idx + '"]'); if (!card) return; }
        var det = card.closest('details'); if (det && !det.open) det.open = true;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 900);
        if (mv.fill) { card.querySelector('.gp-main').click(); setTimeout(function () { Object.keys(mv.fill).forEach(function (k) { var inp = Array.prototype.filter.call(card.querySelectorAll('.gp-field'), function (f) { return f.querySelector('span').textContent === k; })[0]; if (inp) inp.querySelector('input,textarea').value = mv.fill[k]; }); }, 30); }
      };
    });
  }

  /* ---- edit / add prompts ---- */
  function promptForm(x, cat) {
    return '<div class="gp-editor"><label>Title<input class="pe-t" value="' + esc(x ? x.t : '') + '" placeholder="e.g. Monday planning"></label>' +
      '<label>Category<select class="pe-c">' + CATS.map(function (c) { return '<option value="' + c[0] + '"' + ((x ? x.c : cat) === c[0] ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select></label>' +
      '<label>One line, what it does<input class="pe-d" value="' + esc(x ? x.d : '') + '"></label>' +
      '<label>Prompt<textarea class="pe-p" rows="8">' + esc(x ? x.p : '{{head}}') + '</textarea></label>' +
      '<div class="pe-hint">Blanks like <code>&lt;idea&gt;</code> become fields. <code>{{head}}</code> = agent preamble. Context tokens: <code>{{recent}}</code> <code>{{last_task}}</code> <code>{{this}}</code> <code>{{project}}</code> <code>{{board}}</code> <code>{{doing}}</code> <code>{{posts}}</code> <code>{{inspiration}}</code> <code>{{inspiration_new}}</code> <code>{{shipped}}</code> <code>{{schedule}}</code> <code>{{take}}</code> — the same things as the Copy context menu. An edit of a built-in applies to the mode you are in.</div>' +
      '<div class="guide-row"><button type="button" class="gp-copy pe-save">Save</button>' + (x && x.builtin && x.overridden ? '<button type="button" class="guide-snap pe-reset">Reset to default</button>' : '') + (x && x.custom ? '<button type="button" class="guide-snap pe-del">Delete</button>' : x && x.builtin ? '<button type="button" class="guide-snap pe-hide" title="Hide this built-in prompt">Hide</button>' : '') + '<button type="button" class="guide-snap pe-cancel">Cancel</button></div></div>';
  }
  function editPrompt(x, card) {
    var form = card.querySelector('.gp-form'); if (form.querySelector('.gp-editor')) { form.innerHTML = ''; card.classList.remove('open'); return; }
    card.classList.add('open'); form.innerHTML = promptForm(x);
    form.querySelector('.pe-cancel').onclick = function () { form.innerHTML = ''; card.classList.remove('open'); };
    form.querySelector('.pe-save').onclick = function () {
      var ps = pstore(); var v = { t: form.querySelector('.pe-t').value.trim() || x.t, d: form.querySelector('.pe-d').value.trim(), p: form.querySelector('.pe-p').value, c: form.querySelector('.pe-c').value };
      if (x.custom) { ps.custom = ps.custom.map(function (c) { return c.id === x.id ? Object.assign({}, c, v) : c; }); }
      else { ps.overrides[x.t] = { d: v.d, p: v.p, mode: mode() || envMode(), at: Date.now() }; if (v.c !== x.c || v.t !== x.t) { ps.hidden.push(x.t); ps.custom.push({ id: 'c' + Date.now().toString(36), t: v.t, d: v.d, p: v.p, c: v.c, pages: x.pages }); delete ps.overrides[x.t]; ps.reset[x.t] = Date.now(); } }
      psave(ps); if (global.Sync) Sync.note('prompts.json', 'edited prompt: ' + v.t); render();
    };
    var rs = form.querySelector('.pe-reset'); if (rs) rs.onclick = function () { var ps = pstore(); delete ps.overrides[x.t]; ps.reset[x.t] = Date.now(); psave(ps); render(); };
    var dl = form.querySelector('.pe-del'); if (dl) dl.onclick = function () { if (!confirm('Delete "' + x.t + '"?')) return; var ps = pstore(); ps.custom = ps.custom.filter(function (c) { return c.id !== x.id; }); ps.removed.push(x.id); psave(ps); render(); };
    var hd = form.querySelector('.pe-hide'); if (hd) hd.onclick = function () { var ps = pstore(); ps.hidden.push(x.t); ps.shown = ps.shown.filter(function (h) { return h !== x.t; }); psave(ps); render(); };
  }
  function newPrompt(cat, slot) {
    if (slot.innerHTML) { slot.innerHTML = ''; return; }
    slot.innerHTML = promptForm(null, cat);
    slot.querySelector('.pe-cancel').onclick = function () { slot.innerHTML = ''; };
    slot.querySelector('.pe-save').onclick = function () {
      var t = slot.querySelector('.pe-t').value.trim(); if (!t) { slot.querySelector('.pe-t').focus(); return; }
      var ps = pstore(); ps.custom.push({ id: 'c' + Date.now().toString(36), t: t, d: slot.querySelector('.pe-d').value.trim(), p: slot.querySelector('.pe-p').value, c: slot.querySelector('.pe-c').value, pages: [page()] });
      psave(ps); if (global.Sync) Sync.note('prompts.json', 'new prompt: ' + t); render();
    };
    slot.querySelector('.pe-t').focus();
  }
  function restoreHidden() { var ps = pstore(); ps.shown = ps.shown.concat(ps.hidden); ps.hidden = []; psave(ps); render(); }

  // what a prompt needs before it can copy something useful: an open item, a task, a take. '' when it is ready.
  function needs(x) {
    if (!x || !x.arg || !global.Context) return '';
    if (x.arg === 'item') return hasThis() ? '' : (page() === 'board' ? 'Open a task first' : 'Open a script, draft or post first');
    if (x.arg === 'task') return /^\(/.test(Context.get('last_task')) ? 'Open or start a task first' : '';
    if (x.arg === 'take') return /^\(/.test(Context.get('take')) ? 'Add a take first (the Video page)' : '';
    return '';
  }
  function bindCard(card, x) {
    var form = card.querySelector('.gp-form'); var main = card.querySelector('.gp-main'); var desc = card.querySelector('.gp-d'); if (desc) { desc.style.cursor = 'pointer'; desc.onclick = function (e) { if (e.target.closest && e.target.closest('a,button')) return; main.click(); }; }
    main.onclick = function () {
      var nd = needs(x); if (nd) { var tt = card.querySelector('.gp-t'); var was = tt.textContent; tt.textContent = nd; card.classList.add('copied'); setTimeout(function () { tt.textContent = was; card.classList.remove('copied'); }, 2200); return; }
      var bl = blanks(x);
      if (!bl.length) { finish(x.p, card, x); return; }
      if (form.innerHTML) { form.innerHTML = ''; card.classList.remove('open'); return; }
      card.classList.add('open');
      form.innerHTML = bl.map(function (b, k) { var isBlock = x.block && b === x.block; return '<label class="gp-field"><span>' + esc(b) + '</span>' + (isBlock ? '<textarea rows="5" data-k="' + k + '">' + esc(prefillOf(x)) + '</textarea>' : '<input data-k="' + k + '" placeholder="' + esc(b) + '">') + '</label>'; }).join('') + '<button type="button" class="gp-copy">Copy the finished prompt</button>';
      var first = form.querySelector('input,textarea'); if (first) first.focus();
      form.querySelector('.gp-copy').onclick = function () { var out = x.p; bl.forEach(function (b, k) { var el = form.querySelector('[data-k="' + k + '"]'); var v = (el.value || '').trim(); out = out.split('<' + b + '>').join(v || '<' + b + '>'); }); finish(out, card, x); };
    };
  }
  function finish(text, card, x) {
    if (x && x.reviews && global.InspoModel && effMode() === 'files') setTimeout(function () { InspoModel.markReviewed(); }, 0);   // the agent assesses right away; a chat's assessment counts when its answer is applied
    if (x && x.t) Store.setJSON(LAST_KEY, { t: x.t, at: Date.now(), ws: Config.activeWs() }, { silent: true });
    text = global.Context ? Context.fill(text) : text.replace('{{snapshot}}', snapshot());
    copyText(text, card, 'Copied — paste into ' + who(mode()) + (x.go && x.go !== page() ? ' · then open ' + GO[x.go][1] : ''));
  }
  function copyPrompt(x, el) {   // copy one prompt now, with the next step in the message (Start here, Home's welcome card)
    if (needs(x)) return Promise.resolve(false);
    var files = effMode() === 'files';
    if (x.reviews && global.InspoModel && files) setTimeout(function () { InspoModel.markReviewed(); }, 0);
    Store.setJSON(LAST_KEY, { t: x.t, at: Date.now(), ws: Config.activeWs() }, { silent: true });
    var text = global.Context ? Context.fill(x.p) : x.p.replace('{{snapshot}}', snapshot());
    return copyText(text, el || null, files ? 'Copied. Or just type /' + x.slug + ' in your agent.' : (['overview', 'about'].indexOf(page()) >= 0 ? 'Copied: paste it into ChatGPT or Claude, then bring the answer back to the Reply on the Calendar (tasks and posts) or Home (inspiration).' : 'Copied: paste it into ChatGPT or Claude, then bring the answer back in Reply.'));
  }
  function prefillOf(x) { if (typeof x.prefill === 'function') return x.prefill(); if (typeof x.prefill === 'string') { var e = document.getElementById(x.prefill); return e ? e.value : ''; } return ''; }
  function blanks(x) { return global.MARATHON_PROMPTS && MARATHON_PROMPTS.blanks ? MARATHON_PROMPTS.blanks(x.p) : []; }   // real <blanks> only: the reply legend and `CLI examples` are notation (core/prompts.js)
  function copyText(text, el, msg) {   // → Promise<boolean>: true when the clipboard took it; el null = no flash (the caller says it)
    return navigator.clipboard.writeText(text).then(function () {
      if (!el) return true;
      var t = el.querySelector ? (el.querySelector('.gp-t') || el) : el; var old = t.textContent; el.classList.add('copied'); t.textContent = msg;
      setTimeout(function () { el.classList.remove('copied'); t.textContent = old; }, 2200); return true;
    }).catch(function () { try { prompt('Copy this:', text); } catch (e) { /* embedded browsers */ } return false; });
  }
  function previewReply() {
    var ta = panel.querySelector('.guide-reply'); var out = panel.querySelector('.guide-result'); var planEl = panel.querySelector('.guide-plan'); var text = ta.value.trim();
    replyDraft.text = ta.value; replyDraft.previewed = !!text; stillAway = []; fillAway();
    out.innerHTML = '';
    if (!text) { out.textContent = 'Paste the agent\'s reply first.'; return; }
    if (!global.Apply) { out.textContent = 'Apply is not loaded on this page.'; return; }
    var rep2 = Apply.reply(text, { ws: Config.activeWs() }); var units = rep2.units;
    if (!units.length) { out.textContent = 'No command lines or "- [ ]" checklist items in that text. Ask your AI to end with the lines in one ``` block.'; return; }
    var nOk = units.filter(function (u) { return u.ok; }).length; var away = mergeGroups(awayGroups(units), carried && carried.rest || []); var names = away.map(function (g) { return g.name; }).join(' and ');
    var nAwayLines = units.filter(function (u) { return !u.ok && u.away; }).length;
    planEl.innerHTML = '<div class="guide-plan-h">' + (nOk ? nOk + ' change' + (nOk === 1 ? '' : 's') + ' here' + (nAwayLines ? ' · ' + nAwayLines + ' more on ' + esc(names) + ', after you apply these' : ' — untick anything you do not want') : nAwayLines ? 'These changes are saved on ' + esc(names) : 'Nothing here can be applied: the reason is under each line') + '</div>' +
      units.map(function (u, i) { var g = u.away ? groupOf(away, u) : null; return '<label class="guide-unit' + (u.ok ? '' : ' off') + '"><input type="checkbox" data-i="' + i + '"' + (u.ok ? ' checked' : ' disabled') + '><span>' + esc(u.label) + (u.ok ? '' : ' <em>' + esc(g ? 'saved on ' + g.name + ' · Continue on ' + g.name + ' below' : u.reason) + '</em>') + '</span></label>'; }).join('') +
      (nOk ? '<button type="button" class="gp-copy guide-apply">Apply selected to ' + esc(Config.ws().title) + '</button>' : '') +
      (!nOk && away.length ? '<div class="guide-row">' + carryButtons(away) + '</div>' : '');
    if (nOk) planEl.querySelector('.guide-apply').onclick = function () {
      var picks = Array.prototype.filter.call(planEl.querySelectorAll('input[type=checkbox]'), function (c) { return c.checked && !c.disabled; }).map(function (c) { return +c.dataset.i; });
      if (!picks.length) { out.textContent = 'Nothing selected.'; return; }
      applyReply(rep2, picks, away);
    };
    else wireCarry(planEl, away, 0);
  }
  var NAME = { home: 'Home', calendar: 'the Calendar', board: 'the Board', social: 'the Schedule', streak: 'the Posting streak', scripts: 'the Script Viewer', writing: 'the Writing Viewer', video: 'the Video page', inspo: 'the Inspiration page', overview: 'Overview', about: 'About' };
  var carried = null; var origin = '';   // origin: the page the reply was pasted on first (kept through every hop)   // { from, n, rest: [groups] } on the page lines were handed to; { expired: true } when they came too late
  // Lines another page saves (core/apply.js "paste this line on …"): grouped by the page that saves them, carried there in one click.
  // Lines another page saves (core/apply.js marks them with the file they need): one group per page that saves them, carried
  // there in one click. A page never writes another page's file (core/story.js), so the lines travel instead.
  var DEST = { home: { file: 'index.html', name: 'Home' }, calendar: { file: 'calendar/calendar.html', name: 'the Calendar' }, scripts: { file: 'studio/script-viewer.html', name: 'the Script Viewer' }, writing: { file: 'studio/writing-viewer.html', name: 'the Writing Viewer' }, videos: { file: 'studio/video.html', name: 'the Video page' } };
  function kindOf(f) { var w = Config.activeWs(); return f === Config.file('social', w) ? 'social' : f === Config.file('scripts', w) ? 'scripts' : f === Config.file('writing', w) ? 'writing' : f === Config.file('videos', w) ? 'videos' : f === 'inspiration.json' ? 'inspiration' : 'board'; }
  function awayGroups(units) {
    var kinds = {}; units.forEach(function (u) { if (!u.ok && u.away) kinds[kindOf(u.away)] = 1; });
    var dest = function (k) { return k === 'social' ? 'calendar' : k === 'board' ? (kinds.social ? 'calendar' : 'home') : k === 'inspiration' ? 'home' : k; };   // tasks with posts: the Calendar saves both
    var by = {}; units.forEach(function (u) { if (u.ok || !u.away) return; var d = DEST[dest(kindOf(u.away))]; (by[d.file] = by[d.file] || { file: d.file, name: d.name, texts: [] }).texts.push(u.text); });
    return ['home', 'calendar', 'scripts', 'writing', 'videos'].map(function (k) { return by[DEST[k].file]; }).filter(Boolean).filter(function (g) { return location.pathname.slice(-g.file.length) !== g.file; });   // never back to this page
  }
  function mergeGroups(a, b) { var out = []; a.concat(b).forEach(function (g) { var same = out.filter(function (x) { return x.file === g.file; })[0]; if (same) same.texts = same.texts.concat(g.texts.filter(function (t) { return same.texts.indexOf(t) < 0; })); else out.push({ file: g.file, name: g.name, texts: g.texts.slice() }); }); return out.filter(function (g) { return location.pathname.slice(-g.file.length) !== g.file; }); }
  var stillAway = [];   // after Apply: the lines other pages save, still to go (kept across re-renders)
  function fillAway() { var el = panel && panel.querySelector('.guide-away'); if (!el) return; el.innerHTML = stillAway.length ? '<p class="guide-note">Still to apply on another page:</p><div class="guide-row">' + carryButtons(stillAway) + '</div>' : ''; if (stillAway.length) wireCarry(el, stillAway, 1200); }
  function groupOf(groups, u) { return groups.filter(function (g) { return g.texts.indexOf(u.text) >= 0; })[0] || null; }
  function carryButtons(groups) { return groups.map(function (g, i) { return '<button type="button" class="gp-copy guide-carry" data-g="' + i + '">Continue on ' + esc(g.name) + ': ' + g.texts.length + ' line' + (g.texts.length === 1 ? '' : 's') + ' →</button>'; }).join(''); }
  function wireCarry(el, groups, delay) {   // delay: let this page's own file writes (400 ms after a change) finish before leaving
    Array.prototype.forEach.call(el.querySelectorAll('.guide-carry'), function (b) { b.onclick = function () {
      var g = groups[+b.dataset.g]; if (!g) return; var order = [g].concat(groups.filter(function (x) { return x !== g; }));   // the rest rides along: offered on that page once you apply there
      Store.setJSON(CARRY_KEY, { groups: order, from: origin || NAME[page()] || 'another page', ws: Config.activeWs(), at: Date.now() }, { silent: true });
      b.disabled = true; b.textContent = 'Opening ' + g.name + '…'; setTimeout(function () { location.href = root() + g.file + '?ws=' + encodeURIComponent(Config.activeWs()); }, delay);
    }; });
  }
  function takeCarry() {   // on the page the lines were handed to: the Guide opens on Reply with them, previewed (Apply is still yours)
    var c = Store.getJSON(CARRY_KEY, null); if (!c || !c.groups || !c.groups.length) return;
    var mine = c.groups[0]; if (location.pathname.slice(-mine.file.length) !== mine.file) return;   // only the page the lines were sent to takes them (another tab or page leaves them alone)
    Store.remove(CARRY_KEY); var late = Date.now() - (+c.at || 0) > 30 * 60000 || (c.ws && c.ws !== Config.activeWs());
    Store.set(TAB_KEY, 'reply', { silent: true }); Store.set(SEEN_KEY, '1', { silent: true });
    carried = late ? { expired: true } : { from: c.from, n: mine.texts.length, rest: c.groups.slice(1) }; if (!late) origin = c.from;
    var tries = 0; (function go() { if (global.Sync && Sync.ready && !Sync.ready() && tries++ < 40) return setTimeout(go, 100);   // this page's files first, so the preview reads them
      setTimeout(function () { open(); if (late) return; var ta = panel && panel.querySelector('.guide-reply'); if (ta) { ta.value = mine.texts.join('\n'); previewReply(); } }, 300); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(takeCarry, 0); }); else setTimeout(takeCarry, 0);
  function applyReply(rep2, picks, away) {
    var ta = panel.querySelector('.guide-reply'); var out = panel.querySelector('.guide-result'); var planEl = panel.querySelector('.guide-plan');
    var res = rep2.apply(picks);
    planEl.innerHTML = '';
    out.innerHTML = (res.applied.length ? '<b>Applied ' + res.applied.length + ':</b><ul>' + res.applied.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '<b>Nothing applied.</b> ') +
      (res.skipped.length ? '<b>Skipped ' + res.skipped.length + ':</b><ul>' + res.skipped.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
      (res.applied.length ? '<p>Every applied change is in Home → Recent changes and can be reverted.' + (['board', 'social', 'streak', 'scripts', 'writing', 'video'].indexOf(page()) >= 0 || (away && away.length) || (res.spawn || []).length ? '' : ' Reloading in a moment…') + '</p>' : '') +
      '';
    var spawned = awayGroups((res.spawn || []).map(function (sp) { return { ok: false, away: sp.file, text: sp.text }; }));   // inspo use: the piece is made on its own page
    stillAway = mergeGroups(away || [], spawned); fillAway();
    if (carried && !carried.expired) carried = null;   // what was carried here is done; the rest travels with the buttons
    replyDraft.text = ''; replyDraft.previewed = false;   // applied (or all skipped): a re-render starts clean
    if (res.applied.length) {
      ta.value = '';
      if (global.refreshBoard) refreshBoard();
      if (global.refreshSchedule) refreshSchedule();
      if (global.refreshScripts) refreshScripts();   // the Script and Writing pages answer the file write from their own copy: they take the reply's first
      if (global.refreshNotes) refreshNotes();
      var pg = page(); if (['inspo', 'home', 'overview', 'about', 'calendar'].indexOf(pg) >= 0 && !stillAway.length) setTimeout(function () { location.reload(); }, 2500);   // pages without a live refresh reload once the files are written (Board, Schedule, Streak, Scripts and Writing refresh in place)
      if (global.InspoModel && InspoModel.markReviewed && res.applied.some(function (a) { return /^tags #|^used as |^project |^archived: /.test(a); })) InspoModel.markReviewed();   // an assessment counts once its answer is applied, not when it is copied
    }
  }
  function open() { if (!panel) { panel = document.createElement('aside'); panel.className = 'guide'; document.body.appendChild(panel); } render(); panel.classList.add('open'); document.body.classList.add('guide-open'); var before = backup.at; backupStatus().then(function () { if (backup.at !== before && panel.classList.contains('open')) render(); }); var ffBefore = ffmpeg.at; ffmpegStatus().then(function () { if (ffmpeg.at !== ffBefore && ffmpegCardDue() && panel.classList.contains('open')) render(); }); fetchFolder().then(function (got) { if (got && panel.classList.contains('open')) render(); }); }
  function close() { if (panel) { panel.classList.remove('open'); document.body.classList.remove('guide-open'); } }
  function toggle() { if (panel && panel.classList.contains('open')) close(); else open(); }
  function registerPalette() {   // ⌘K → "Ask: Bring in my work" opens the Guide on that prompt (the menu, core/prompts.js)
    var P = global.MARATHON_PROMPTS; if (!global.Palette || !Palette.register || !P || !P.MENU || registerPalette.done) return; registerPalette.done = true;
    var all = P.build({ title: '', id: 'main', mode: 'chat' }); var by = {}; all.forEach(function (x) { by[x.slug] = x; });
    var hid = pstore().hidden; P.MENU.forEach(function (g) { g[2].forEach(function (sl) { if (by[sl] && hid.indexOf(by[sl].t) < 0) Palette.register({ label: 'Ask: ' + by[sl].t, hint: 'guide', keywords: '/' + sl + ' ' + g[1] + ' prompt agent ai', run: function () { openPrompt(sl); } }); }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerPalette); else setTimeout(registerPalette, 0);
  function mountHandle() {
    if (document.querySelector('.guide-handle')) return;
    var h = document.createElement('button'); h.type = 'button'; h.className = 'guide-handle'; h.title = 'Guide: run this with your AI agent (?)';
    h.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg><span>Guide</span>';
    h.onclick = toggle; document.body.appendChild(h);
  }
  document.addEventListener('keydown', function (e) {
    var t = (e.target.tagName || '').toLowerCase(); if (t === 'input' || t === 'textarea' || t === 'select' || e.target.isContentEditable) return;
    if (e.key === '?' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); toggle(); }
    if (e.key === 'Escape') close();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHandle); else mountHandle();
  // ?guide=quick|ask|reply|settings (old names still work) opens the panel on load (used for screenshots and deep links)
  (function () { var g = new URLSearchParams(location.search).get('guide'); if (!g) return; if (['moves', 'prompts', 'apply', 'setup', 'do', 'quick', 'ask', 'reply', 'settings'].indexOf(g) >= 0) Store.set(TAB_KEY, TAB_MAP[g] || g, { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); setTimeout(open, 400); })();
  // open the panel on a prompt card by slug (falls back to the Ask tab when the page does not list it)
  var pendingSlug = null;
  var pendingForm = false;
  function focusPending(all) {   // after every list render while a slug is pending (open() re-renders when the backup status and folder arrive)
    if (!pendingSlug || !panel) return; var x = all.filter(function (p) { return p.slug === pendingSlug; })[0]; if (!x) { pendingSlug = null; return; }
    var card = panel.querySelector('.guide-prompt[data-i="' + all.indexOf(x) + '"]'); if (!card) return;
    var det = card.closest('details'); if (det && !det.open) det.open = true;
    card.scrollIntoView({ block: 'center' }); card.classList.add('flash');
    if (pendingForm && !card.querySelector('.gp-field')) { pendingForm = false; var mn = card.querySelector('.gp-main'); if (mn) mn.click(); }   // a prompt with blanks: its form, open
  }
  function openPrompt(slug, o2) {   // the Video page opens Cut this take here; the open take rides along through the {{take}} token
    Store.set(TAB_KEY, 'ask', { silent: true }); query = ''; pendingSlug = slug; pendingForm = !!(o2 && o2.form); open();
    setTimeout(function () { pendingSlug = null; var f = panel && panel.querySelector('.guide-prompt.flash'); if (f) f.classList.remove('flash'); }, 2500);
  }
  /* ---- ffmpeg (server mode only): a pending card while Video cannot work, once a take exists; the Video page shows its own card instead ---- */
  var ffmpeg = { state: 'unknown', at: 0 };   // state: unknown | ok | missing | n/a
  function ffmpegStatus(force) {
    if (!global.Sync || Sync.getMode() !== 'server') { ffmpeg.state = 'n/a'; return Promise.resolve(ffmpeg); }
    if (!force && Date.now() - ffmpeg.at < 300000) return Promise.resolve(ffmpeg);
    return fetch('/api/video/doctor' + (force ? '?fresh=1' : ''), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { ffmpeg = Object.assign({ state: j ? (j.ffmpeg ? 'ok' : 'missing') : 'unknown', at: Date.now() }, j || {}); return ffmpeg; }).catch(function () { ffmpeg.state = 'unknown'; ffmpeg.at = Date.now(); return ffmpeg; });
  }
  function ffmpegCardDue() { if (ffmpeg.state !== 'missing' || page() === 'video') return false; var w = Config.ws(); if (!w.apps.video) return false; var d = Store.getJSON(Config.key('videos', w.id), null); return !!(d && (d.videos || []).length); }
  function ffmpegCard() {
    var mac = navigator.platform.indexOf('Mac') >= 0; var line = mac ? 'brew install ffmpeg' : 'winget install Gyan.FFmpeg';
    return '<div class="guide-pending ffmpeg-card" title="Video needs ffmpeg"><span class="dot"></span><span><b>Video needs ffmpeg</b>, a free tool that reads and writes video files. ' + (mac ? 'Mac (needs Homebrew, brew.sh): ' : 'Windows: ') + '<code>' + line + '</code>. Or ask your agent: <button type="button" class="guide-link gd-ffsetup">Set up video on this computer</button>. Then Check again.</span><span class="go"><button type="button" class="guide-link gd-ffcopy" data-copy="' + line + '">Copy</button> · <button type="button" class="guide-link gd-ffcheck">Check again</button></span></div>';
  }
  global.Guide = { open: open, close: close, toggle: toggle, snapshot: snapshot, mode: effMode, modeChosen: mode, openPrompt: openPrompt,
    // a page's own prompt (the Inspiration page's Brainstorm…) in the Guide's mode: the preamble, then the body, then (chat) the reply format
    compose: function (body, o2) { var P = global.MARATHON_PROMPTS; if (!P) return body; var o = opts(); return P.head(o) + body + (o.mode === 'chat' && o2 && o2.writes ? '\n\n' + P.cheatsheet() : ''); },
    _t: { awayGroups: awayGroups, mergeGroups: mergeGroups, page: page, startSlugs: startSlugs, projectEmpty: projectEmpty, prompts: prompts, needs: function (slug) { return needs(prompts().filter(function (y) { return y.slug === slug; })[0]); }, forPage: function (pg) { return forPage(prompts(), pg || page()).map(function (x) { return x.slug; }); }, about: ABOUT, chips: ASK_DEFAULT },
    copyPrompt: function (slug, el) { var x = prompts().filter(function (y) { return y.slug === slug; })[0]; return x ? copyPrompt(x, el) : Promise.resolve(false); } };
})(window);
