/* =========================================================================
   core/guide.js — the Guide panel: how to run Solo Ops with your AI agent.
   • Built-in prompts live in core/prompts.js (shared with the CLI, which
     exports them as slash commands). Agent mode: "runs commands" (Claude
     Code, Cursor, Codex) or "chat only" (ChatGPT, Claude.ai). Chat mode packs
     a snapshot of your data and the reply format into every prompt.
   • Paste the reply → Apply (core/apply.js) updates boards, posts, scripts,
     notes and inspiration right here. No terminal needed.
   • Tabs by intent: Quick (five-second actions across all projects, no
     agent), Ask (search + prompts, this page first, groups collapsed),
     Reply (paste → preview → apply), Settings. Blanks become a
     small form before copying; a visible switch says how the agent works.
   Opens from the left-edge handle, the nav button, or the ? key.
   ========================================================================= */
(function (global) {
  'use strict';
  var panel = null; var MODE_KEY = 'marathon.guide.mode'; var SEEN_KEY = 'marathon.guide.seen';
  var PKEY = 'marathon.prompts';   // { custom:[{id,t,d,c,p,pages}], overrides:{ title:{t,d,p} }, hidden:[titles] } ↔ data/prompts.json
  function pstore() { var v = Store.getJSON(PKEY, null); return v && typeof v === 'object' ? { custom: v.custom || [], overrides: v.overrides || {}, hidden: v.hidden || [] } : { custom: [], overrides: {}, hidden: [] }; }
  function psave(v) { Store.setJSON(PKEY, v); }
  function registerPromptsSync() {
    if (!global.Sync) return;
    Sync.register({ file: 'prompts.json', key: PKEY, label: 'prompts', activity: false, merge: true,
      read: function () { return pstore(); },
      apply: function (body) { var cur = pstore(); var inc = { custom: body.custom || [], overrides: body.overrides || {}, hidden: body.hidden || [] };
        var seen = {}; var custom = inc.custom.concat(cur.custom).filter(function (c) { if (!c || !c.id || seen[c.id]) return false; seen[c.id] = 1; return true; });
        Store.setJSON(PKEY, { custom: custom, overrides: Object.assign({}, cur.overrides, inc.overrides), hidden: inc.hidden.concat(cur.hidden).filter(function (h, i, a) { return a.indexOf(h) === i; }) }, { silent: true }); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerPromptsSync); else setTimeout(registerPromptsSync, 0);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mode() { return Store.get(MODE_KEY) === 'files' ? 'files' : (Store.get(MODE_KEY) === 'chat' ? 'chat' : ''); }
  function root() { var n = document.querySelector('[data-nav]'); return (n && n.getAttribute('data-root')) || './'; }
  function page() {
    var h = location.pathname.replace(/.*\//, '');
    return { 'index.html': 'home', '': 'home', 'marathon-board.html': 'board', 'social-board.html': 'social', 'social-calendar.html': 'social', 'script-viewer.html': 'scripts', 'writing-viewer.html': 'writing', 'inspiration.html': 'inspo' }[h] || 'home';
  }
  var ABOUT = {
    home: ['The helicopter view: activity across every project, each workspace with its numbers, what is in play, your inbox and the change log.', 'Switch the open project with the Workspace menu in the nav. "Open project" and everything below it belongs to that one.'],
    board: ['One board = one kanban: To Do → Doing → Done, a Later parking lot and a Bucket List for ideas. Cards carry checklists, priority, project, tags and private notes.', 'n adds a task · 1 / 2 / 3 switch views · ⌘K runs "add Fix the hero @launch #copy !high".'],
    social: ['A posting arc: each post has a date, copy, type, prep checklist, images and video status. Mark it posted to log engagement. Status: draft → ready → scheduled → posted.'],
    scripts: ['Short-form scripts with a light structure: # Title, ## Hook, ## Script (numbered beats), ## Inserts, ## Prep. Reader shows spoken lines only; 9:16 previews the phone; Teleprompter scrolls at your pace.'],
    writing: ['Drafts with track changes you and your agent both read: ~~cut~~, ++add++, [[note for the AI]]. Copy for AI sends the markup; Copy clean sends the final text.'],
    inspo: ['Everything worth keeping lands here. Tag with a project, then Use as task / post / script / draft, or tick a few and Brainstorm with AI. The capture strip on every page saves here.']
  };
  var GO = { board: ['runway/marathon-board.html', 'the board'], social: ['social/social-board.html', 'the schedule'], scripts: ['studio/script-viewer.html', 'the Script Viewer'], writing: ['studio/writing-viewer.html', 'the Writing Viewer'], inspo: ['inspo/inspiration.html', 'Inspiration'], home: ['index.html', 'Home'] };

  /* ---- snapshot of the open workspace (chat mode pastes this) ---------- */
  function snapshot() {
    var w = Config.ws(); var L = ['WORKSPACE: ' + w.title + ' (' + w.id + ')']; var posts = [];
    Config.boards(w.id).forEach(function (b) {
      var tasks = Store.getJSON(Config.boardKey(b.id, w.id), []) || [];
      L.push('', 'BOARD "' + b.title + '" (--board ' + b.id + ')');
      ['doing', 'todo', 'later', 'bucket', 'done'].forEach(function (col) {
        var g = tasks.filter(function (t) { return t.col === col; }); if (!g.length) return;
        L.push('  ' + col + ':');
        g.slice(0, col === 'done' ? 5 : 40).forEach(function (t) { var n = (t.checklist || []).length, d = (t.checklist || []).filter(function (c) { return c.done; }).length; L.push('  - [' + t.id + '] ' + t.title + ' · ' + t.pri + (t.tags.length ? ' · #' + t.tags.join(' #') : '') + (n ? ' · ' + d + '/' + n + ' steps' : '')); });
      });
    });
    if (w.apps.social) { posts = (Store.getJSON(Config.key('social', w.id), []) || []).slice().sort(function (a, b) { return a.datetime.localeCompare(b.datetime); }); if (posts.length) { L.push('', 'POSTS'); posts.slice(0, 30).forEach(function (p) { var n = (p.prep || []).length, d = (p.prep || []).filter(function (c) { return c.done; }).length; L.push('  - [' + p.id + '] ' + p.datetime.replace('T', ' ') + ' · ' + p.title + ' · ' + p.status + (p.copy ? '' : ' · NO COPY YET') + (n ? ' · prep ' + d + '/' + n : '')); }); } }
    if (w.apps.scripts) { var sc = (Store.getJSON(Config.key('scripts', w.id), { scripts: [] }) || {}).scripts || []; if (sc.length) L.push('', 'SCRIPTS: ' + sc.map(function (s) { return '[' + s.id + '] ' + s.title; }).join(' · ')); }
    if (w.apps.writing) { var nt = (Store.getJSON(Config.key('writing', w.id), { notes: [] }) || {}).notes || []; if (nt.length) L.push('', 'NOTES: ' + nt.map(function (n) { var m = (n.text || '').match(/^#\s+(.+)/m); var nf = Object.keys(n.files || {}).length ? ' (' + Object.keys(n.files).length + ' image file' + (Object.keys(n.files).length === 1 ? '' : 's') + ': ' + Object.keys(n.files).map(function (k) { return n.files[k]; }).join(', ') + ')' : (Object.keys(n.images || {}).length ? ' (has images in the app)' : ''); return '[' + n.id + '] ' + (m ? m[1].slice(0, 50) : 'untitled') + nf; }).join(' · ')); }
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
  function opts() { var w = Config.ws(); var boards = Config.boards(w.id); return { title: w.title, id: w.id, board: boards[0] ? boards[0].id : 'runway', mode: mode() === 'files' ? 'files' : 'chat', folder: folder() }; }
  function prompts() {
    var P = global.MARATHON_PROMPTS; var o = opts(); var files = o.mode === 'files';
    var list = P ? P.build(o) : []; var head = P ? P.head(o) : ''; var tail = P ? P.tail(o, { snap: true, writes: true }) : '';
    // your edits (data/prompts.json): overrides of built-ins, hidden built-ins, your own prompts
    var ps = pstore();
    list.forEach(function (x) { var ov = ps.overrides[x.t]; if (ov) { if (ov.d) x.d = ov.d; if (ov.p) x.p = ov.p; x.overridden = true; } });
    list = list.filter(function (x) { return ps.hidden.indexOf(x.t) < 0; });
    ps.custom.forEach(function (c) { list.push({ c: c.c || 'projects', t: c.t || 'My prompt', d: c.d || '', p: c.p || '', pages: c.pages || [], custom: true, id: c.id, go: c.go }); });
    list.forEach(function (x) { x.p = x.p.split('{{head}}').join(head); if (!files && (x.custom || x.overridden) && x.p.indexOf('{{snapshot}}') < 0 && x.p.indexOf('{{recent}}') < 0 && x.p.indexOf('HOW TO REPLY') < 0) x.p += tail; });
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
  // tabs are named by intent: Do (what to ask) · Reply (bring the answer back) · Settings
  var TAB_MAP = { moves: 'ask', prompts: 'ask', do: 'ask', apply: 'reply', setup: 'settings' };
  function tab() { var t = Store.get(TAB_KEY) || 'quick'; return TAB_MAP[t] || t; }
  var CAT_KEY = 'marathon.guide.cats';        // { daily: true, … } which groups are open
  var LAST_KEY = 'marathon.guide.lastCopy';   // { t, at, ws } the last prompt copied (Reply shows it)
  var query = '';
  function ago(ts) { return global.Activity && Activity.ago ? Activity.ago(ts) : 'a moment ago'; }
  function openCats() { return Store.getJSON(CAT_KEY, null) || {}; }
  function matches(x, q) { q = q.toLowerCase(); var cat = (CATS.filter(function (c) { return c[0] === x.c; })[0] || [])[1] || ''; return (x.t + ' ' + x.d + ' ' + cat + ' ' + x.p).toLowerCase().indexOf(q) >= 0; }

  /* ---- render: tabs → Do · Reply · Settings ----------------------------- */
  function render() {
    var pg = page(); var w = Config.ws(); var m = mode(); var r = root();
    var all = prompts(); var here = all.filter(function (x) { return x.pages.indexOf(pg) >= 0; });
    var t = tab(); if (!m && !Store.get(SEEN_KEY) && !Store.get(TAB_KEY)) t = 'settings';
    var TABS = [['quick', 'Quick', I.bolt], ['ask', 'Ask', I.prompts], ['reply', 'Reply', I.apply], ['settings', 'Settings', I.setup]];
    var lc = Store.getJSON(LAST_KEY, null); if (lc && lc.ws !== w.id) lc = null;
    panel.innerHTML = '<div class="guide-head"><b>Guide</b><span class="guide-sub">' + esc(w.title) + '</span><button type="button" class="guide-close" aria-label="Close">×</button></div>' +
      '<div class="guide-tabs">' + TABS.map(function (x) { return '<button type="button" class="guide-tab' + (x[0] === t ? ' on' : '') + '" data-tab="' + x[0] + '" title="' + x[1] + '">' + x[2] + '<span>' + x[1] + '</span></button>'; }).join('') + '</div>' +
      '<div class="guide-agent' + (m ? '' : ' unset') + '"><span>Your agent</span>' +
        '<button type="button" data-mode="files" class="' + (m === 'files' ? 'on' : '') + '" title="Claude Code, Cursor, Codex, Claude Desktop with this folder. It reads your files and runs commands itself.">Runs commands</button>' +
        '<button type="button" data-mode="chat" class="' + (m === 'chat' ? 'on' : '') + '" title="ChatGPT, Claude.ai, Gemini. Prompts carry a snapshot of your data; you paste the reply back here.">Chat only</button>' +
        (m ? '' : '<em>pick one</em>') + '</div>' +
      (!backupDone() && backup.state !== 'unknown' && t !== 'settings' ? '<button type="button" class="guide-pending" title="Open Protect your work"><span class="dot"></span><span><b>Save your data somewhere private.</b> ' + (backup.state === 'ok' ? 'Right now it lives only on this computer.' : 'Nothing here says it is backed up yet.') + '</span><span class="go">Set up →</span></button>' : '') +
      '<div class="guide-body">' +
      (t === 'quick' ? quickSection() : '') +
      (t === 'ask' ? '<div class="guide-search-wrap">' + I.search + '<input type="search" class="guide-search" placeholder="Search prompts" value="' + esc(query) + '" aria-label="Search prompts"></div><div id="guideList"></div>' : '') +
      (t === 'reply' ? '<div class="guide-status ' + (lc ? 'ok' : '') + '"><span class="dot"></span><span>' + (lc ? '<b>' + esc(lc.t) + '</b> copied ' + esc(ago(lc.at)) + '. Paste what your agent answered below.' : 'Copy a prompt from <b>Ask</b>, send it to your agent, then paste the answer here.') + '</span></div>' +
        (m === 'files' ? '<p class="guide-note">Your agent writes the files itself, so you rarely need this. Use it when it answers in the chat instead.</p>' : '') +
        '<textarea class="guide-reply" rows="8" placeholder="Paste your agent\'s reply here."></textarea>' +
        '<div class="guide-row"><button type="button" class="gp-copy guide-preview">Preview changes</button><button type="button" class="guide-snap guide-snapbtn" title="Copy a text snapshot of this workspace for any chat">Copy project</button></div>' +
        '<div class="guide-plan"></div><div class="guide-result"></div>' +
        '<details class="guide-sec small"><summary>How this works</summary><p>Your agent answers with a list of changes (or a plain checklist). Paste it here and press <b>Preview</b>: you see every change before anything happens, untick what you do not want, then <b>Apply</b>. The changes land in this workspace. Nothing runs on your computer, nothing is deleted, and every change shows in Home → Recent changes where it can be reverted.</p></details>' +
        (m === 'files' && global.Sync && Sync.getMode() === 'server' ? '<h4>Recent agent changes</h4><div class="guide-agentlog">Loading…</div>' : '') : '') +
      (t === 'settings' ? '<h4>How does your AI agent work?</h4><div class="guide-modes">' +
        '<label class="guide-mode' + (m === 'files' ? ' on' : '') + '"><input type="radio" name="gmode" value="files"' + (m === 'files' ? ' checked' : '') + '><b>It can run commands</b><span>Claude Code, Cursor, Codex, Claude Desktop with this folder. It reads your files, opens attachments, runs <code>node solo.js</code> itself.</span></label>' +
        '<label class="guide-mode' + (m === 'chat' ? ' on' : '') + '"><input type="radio" name="gmode" value="chat"' + (m === 'chat' ? ' checked' : '') + '><b>It is a chat</b><span>ChatGPT, Claude.ai, Gemini. Prompts carry a snapshot of your data; you paste the reply into Reply. No terminal needed.</span></label></div>' +
        (m === 'files' ? '<ol class="guide-steps"><li>Open this folder in your agent.</li><li>Say: <b>"Read AGENTS.md, then run node solo.js week"</b> — or type a slash command: <code>/standup</code>, <code>/now</code>, <code>/week</code>… every prompt in Ask ships as one (<code>.claude/commands</code> for Claude Code, <code>.cursor/commands</code> for Cursor; <code>node solo.js prompts export --for codex</code> for Codex).</li><li>Keep <code>node serve.js</code> running; pages update as the agent works. Images you attach are saved to <code>data/attachments/</code> so it can open them.</li></ol>'
         : m === 'chat' ? '<ol class="guide-steps"><li>Copy a prompt from <b>Ask</b> — it carries a snapshot of this workspace and the reply format, so a brand-new chat works.</li><li>When the agent replies with a code block, copy it.</li><li><b>Reply</b> → paste → Preview → Apply. If an item has an image the agent needs, upload it in the chat when asked.</li></ol>' : '') +
        (m ? '<h4>Set up once</h4><p>' + (m === 'chat' ? 'Optional: paste this into a ChatGPT or Claude <b>Project</b> as its instructions, and the chat knows Solo Ops before you say anything.' : 'For an agent that was <b>not</b> opened in this folder (Claude Desktop, a terminal started elsewhere): this tells it where the folder is and what to read.') + '</p>' + all.filter(function (x) { return x.c === 'setup' && (m === 'chat' ? x.t === 'Set up this chat' : x.t === 'Set up this folder'); }).map(function (x) { return row(all, x, pg); }).join('') : '') +
        '<h4>Protect your work</h4><div class="guide-status ' + (backup.state === 'ok' ? (backupFresh() ? 'ok' : 'warn') : Store.get(ACK_KEY) ? 'ok' : '') + '" id="guideBackup"><span class="dot"></span>' + backupLine() + '</div>' +
        (backupDone() ? '' : '<p class="guide-why"><b>Why this matters.</b> This folder is the Solo Ops code, and the code is public, including any copy of it. Your tasks, posts and drafts are yours: they stay out of it on purpose, so they need a private home of their own. Pick one way, once:</p>' +
          '<div class="guide-opt"><b>1 · Let your agent do it</b><span>' + (m === 'files' ? 'Type <code>/backup-setup</code> in Claude Code or Cursor, or copy the prompt below. It asks GitHub or folder, then does it.' : 'Open this folder in Claude Code, Cursor or Codex and type <code>/backup-setup</code>; a chat-only agent cannot do this part.') + '</span></div>' +
          (m === 'files' ? all.filter(function (x) { return x.t === 'Set up a private backup'; }).map(function (x) { return row(all, x, pg); }).join('') : '') +
          '<div class="guide-opt"><b>2 · Do it yourself, one command</b><span>In a terminal, in this folder. With the GitHub tool (<code>gh</code>) logged in it creates a private repo and pushes; without it, it prints what to do instead. Nothing is created without telling you.</span><div class="guide-cmd"><code>node solo.js backup setup</code><button type="button" class="guide-snap gd-copy" data-copy="node solo.js backup setup">Copy</button></div></div>' +
          '<div class="guide-opt"><b>3 · No GitHub: a folder that syncs</b><span>iCloud Drive, Dropbox or Google Drive. A plain copy, no git.</span><div class="guide-cmd"><code>node solo.js backup --to "' + esc(navigator.platform.indexOf('Mac') >= 0 ? '~/Library/Mobile Documents/com~apple~CloudDocs/Solo Ops backup' : '~/Dropbox/Solo Ops backup') + '"</code><button type="button" class="guide-snap gd-copy" data-copy="' + esc('node solo.js backup --to "' + (navigator.platform.indexOf('Mac') >= 0 ? '~/Library/Mobile Documents/com~apple~CloudDocs/Solo Ops backup' : '~/Dropbox/Solo Ops backup') + '"') + '">Copy</button></div></div>' +
          '<p class="guide-note">Then once: <code>node solo.js backup --daily</code> and it repeats every evening.' + (backup.state === 'n/a' ? ' Already keep a copy another way? <button type="button" class="guide-link gd-ack">Mark as done</button>' : '') + '</p>') +
        (backupDone() ? '<p>Every change is logged and can be reverted from Home → Recent changes. A pasted reply never deletes anything. Your tasks never enter the public Solo Ops repo; the backup above is their private home. <code>node solo.js backup</code> runs it again, <code>--daily</code> schedules it.' + (Store.get(ACK_KEY) && !backupOk() ? ' <button type="button" class="guide-link gd-unack">Show the setup again</button>' : '') + '</p>' : '') +
        all.filter(function (x) { return x.c === 'fix' && x.t !== 'Set up a private backup'; }).map(function (x) { return row(all, x, pg); }).join('') +
        (pstore().hidden.length ? '<p><button type="button" class="guide-snap pe-restore">Show ' + pstore().hidden.length + ' hidden built-in prompt' + (pstore().hidden.length === 1 ? '' : 's') + '</button></p>' : '') +
        '<h4>Your data</h4>' + dataSection() +
        '<h4>Read more</h4><p><a href="' + r + 'about.html">About Solo Ops: why, how, what is next</a> · <a href="' + r + 'README.md" target="_blank">README</a> · <a href="' + r + 'AGENTS.md" target="_blank">AGENTS.md</a> · <a href="' + r + 'prompts/agent-bootstrap.md" target="_blank">bootstrap prompt</a> · <a href="' + r + 'data/SCHEMA.md" target="_blank">data schema</a> · <a href="' + r + 'NEXT.md" target="_blank">what is next</a></p>' : '') +
      '</div>';
    panel.querySelector('.guide-close').onclick = close;
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-tab'), function (b) { b.onclick = function () { Store.set(TAB_KEY, b.dataset.tab, { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-agent [data-mode]'), function (b) { b.onclick = function () { Store.set(MODE_KEY, b.dataset.mode, { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('input[name=gmode]'), function (i) { i.onchange = function () { Store.set(MODE_KEY, i.value, { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); Store.set(TAB_KEY, 'ask', { silent: true }); render(); }; });
    var pr = panel.querySelector('.pe-restore'); if (pr) pr.onclick = restoreHidden;
    var pend = panel.querySelector('.guide-pending'); if (pend) pend.onclick = openProtect;
    Array.prototype.forEach.call(panel.querySelectorAll('.gd-copy'), function (b) { b.onclick = function () { copyText(b.dataset.copy, b, 'Copied'); }; });
    var ack = panel.querySelector('.gd-ack'); if (ack) ack.onclick = function () { Store.set(ACK_KEY, new Date().toISOString(), { silent: true }); render(); };
    var unack = panel.querySelector('.gd-unack'); if (unack) unack.onclick = function () { Store.remove ? Store.remove(ACK_KEY) : Store.set(ACK_KEY, '', { silent: true }); render(); };
    var ex = panel.querySelector('.gd-export'); if (ex) ex.onclick = exportAll; var im = panel.querySelector('.gd-import'); if (im) im.onclick = importAll;
    if (t === 'quick') bindQuick();
    if (t === 'ask') {
      renderList(all, here, pg);
      var si = panel.querySelector('.guide-search'); si.oninput = function () { query = si.value.trim(); renderList(all, here, pg); }; si.onkeydown = function (e) { if (e.key === 'Escape') { si.value = ''; query = ''; renderList(all, here, pg); } };
      if (query) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    }
    if (t === 'settings') bindList(all);
    if (t === 'reply') {
      panel.querySelector('.guide-reply').addEventListener('input', function () { panel.querySelector('.guide-plan').innerHTML = ''; });
      panel.querySelector('.guide-preview').onclick = previewReply; var sb = panel.querySelector('.guide-snapbtn'); sb.onclick = function () { copyText(snapshot(), sb, 'Copied'); };
      var al = panel.querySelector('.guide-agentlog');
      if (al) Sync.log(12).then(function (recs) { var rows = (recs || []).filter(function (x) { return x.source === 'agent'; }).slice(0, 6); al.innerHTML = rows.length ? '<ul class="guide-log">' + rows.map(function (x) { return '<li><b>' + esc(x.note || x.file) + '</b><span>' + esc(x.file) + ' · ' + esc(ago(x.ts)) + '</span></li>'; }).join('') + '</ul><p class="guide-note">Revert any of them from Home → Recent changes.</p>' : '<p class="guide-note">No agent changes yet. Open the folder in your agent and ask for a standup.</p>'; });
    }
    // footer: the two quick actions on every tab — apply a reply (preview first) and copy context
    var foot = document.createElement('div'); foot.className = 'guide-foot';
    foot.innerHTML = '<button type="button" class="guide-foot-apply">' + I.apply + (t === 'reply' ? 'Preview changes' : 'Apply a reply') + '</button>' +
      '<div class="guide-ctx"><button type="button" class="guide-foot-ctx" title="Copy context for your agent: recent changes, the last task, this item, the whole project…">' + I.link + 'Copy context <span class="chev">▾</span></button><div class="guide-ctx-menu"></div></div>';
    panel.appendChild(foot);
    foot.querySelector('.guide-foot-apply').onclick = function () { if (t === 'reply') { previewReply(); return; } Store.set(TAB_KEY, 'reply', { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); render(); var ta = panel.querySelector('.guide-reply'); if (ta) ta.focus(); };
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
    var w = Config.ws(); var boards = Config.boards(w.id); var top = global.Quick ? Quick.top(10) : []; var pg = page();
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
  function renderList(all, here, pg) {
    var el = panel.querySelector('#guideList'); var m = mode();
    if (query) {
      var hits = all.filter(function (x) { return matches(x, query); });
      el.innerHTML = '<div class="guide-cat"><b>' + (hits.length ? hits.length + ' prompt' + (hits.length === 1 ? '' : 's') : 'No prompt') + '</b><span class="cat-sub">for “' + esc(query) + '”</span></div>' +
        (hits.length ? hits.map(function (x) { return row(all, x, pg); }).join('') : '<p class="guide-note">Try another word, or add your own prompt with + in any group.</p>');
      bindList(all); return;
    }
    var top = here.slice(0, 5); var open = openCats();
    el.innerHTML = '<div class="guide-moves compact" id="guideMoves"></div>' +
      (top.length ? '<div class="guide-cat"><span class="cat-ic">' + I.link + '</span><b>For this page</b></div>' + top.map(function (x) { return row(all, x, pg); }).join('') : '') +
      CATS.filter(function (c) { return ASK.indexOf(c[0]) >= 0; }).map(function (c) { var g = all.filter(function (x) { return x.c === c[0] && top.indexOf(x) < 0; }); if (!g.length) return ''; return '<details class="guide-sec" data-cat="' + c[0] + '"' + (open[c[0]] ? ' open' : '') + '><summary><span class="cat-ic">' + I[c[0]] + '</span><b>' + esc(c[1]) + '</b><span class="cat-sub">' + esc(c[2]) + '</span><span class="guide-hint">' + g.length + '</span><button type="button" class="cat-add" data-cat="' + c[0] + '" title="Add my own prompt here">+</button></summary>' + g.map(function (x) { return row(all, x, pg); }).join('') + '<div class="gp-new" data-cat="' + c[0] + '"></div></details>'; }).join('') +
      '<details class="guide-sec" data-cat="about"' + (open.about ? ' open' : '') + '><summary><span class="cat-ic">' + I.moves + '</span><b>This page</b><span class="cat-sub">what it does · shortcuts</span></summary>' + (ABOUT[pg] || []).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '<p>⌘K commands · ⌘⇧I capture · ? this guide · n add · 1/2/3 board views</p></details>' +
      '<p class="guide-foot-note">Click a prompt to copy it' + (m === 'chat' ? '; it carries a snapshot of this workspace and the reply format, so a fresh chat needs no setup' : m === 'files' ? '; it tells the agent what to read and change. The same prompts are slash commands in Claude Code and Cursor (/standup, /week, /now…)' : '') + '. ✎ edits a prompt, + adds your own.</p>';
    bindList(all);
    Array.prototype.forEach.call(el.querySelectorAll('details.guide-sec[data-cat]'), function (d) { d.addEventListener('toggle', function () { var o = openCats(); o[d.dataset.cat] = d.open; Store.setJSON(CAT_KEY, o, { silent: true }); }); });
    renderMoves(all);
  }
  function bindList(all) {
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-prompt'), function (cardEl) { if (!cardEl._bound) { cardEl._bound = true; bindCard(cardEl, all[+cardEl.dataset.i]); } });
    Array.prototype.forEach.call(panel.querySelectorAll('.gp-edit'), function (b) { b.onclick = function (e) { e.stopPropagation(); editPrompt(all[+b.dataset.i], b.closest('.guide-prompt')); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('.cat-add'), function (b) { b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); var d = b.closest('details'); if (d && !d.open) d.open = true; newPrompt(b.dataset.cat, panel.querySelector('.gp-new[data-cat="' + b.dataset.cat + '"]')); }; });
  }
  function row(all, x, pg) {
    var i = all.indexOf(x); var bl = blanks(x); var m = mode();
    var tip = (bl.length ? 'Asks for ' + bl.join(', ') + ', then copies' : 'Copies this prompt') + (m === 'chat' ? ' with a snapshot of this workspace' : '') + '.';
    return '<div class="guide-prompt row' + (x.custom ? ' custom' : '') + '" data-i="' + i + '"><button type="button" class="gp-main" title="' + esc(tip) + '"><span class="gp-t">' + esc(x.t) + '</span>' + (x.custom ? '<span class="gp-mine">mine</span>' : x.overridden ? '<span class="gp-mine">edited</span>' : '') + '</button><button type="button" class="gp-edit" title="Edit this prompt" data-i="' + i + '"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button><div class="gp-d">' + esc(x.d) + (x.go && x.go !== pg ? ' <span class="gp-go">Then open ' + esc(GO[x.go] ? GO[x.go][1] : x.go) + '.</span>' : '') + '</div><div class="gp-form"></div></div>';
  }

  /* ---- your data: where it is, auto-save, export / import, backups ---- */
  function dataFiles() {
    var w = Config.ws(); var files = [];
    Config.workspaces().forEach(function (x) { Config.boards(x.id).forEach(function (b) { files.push({ file: Config.boardFile(b.id, x.id), key: Config.boardKey(b.id, x.id), wrap: 'tasks', label: x.title + ' · ' + b.title }); });
      if (x.apps.social) files.push({ file: Config.file('social', x.id), key: Config.key('social', x.id), wrap: 'posts', label: x.title + ' · posts' });
      if (x.apps.scripts) files.push({ file: Config.file('scripts', x.id), key: Config.key('scripts', x.id), wrap: null, label: x.title + ' · scripts' });
      if (x.apps.writing) files.push({ file: Config.file('writing', x.id), key: Config.key('writing', x.id), wrap: null, label: x.title + ' · notes' }); });
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
    Config.boards(w.id).forEach(function (b) { var k = Config.boardKey(b.id, w.id); if (Store.isFresh(k)) anyFresh = true; (Store.getJSON(k, []) || []).forEach(function (t) { tasks.push(t); }); });
    var doing = tasks.filter(function (t) { return t.col === 'doing'; }); var todo = tasks.filter(function (t) { return t.col === 'todo'; });
    var noSteps = tasks.filter(function (t) { return (t.col === 'doing' || (t.col === 'todo' && t.pri === 'high')) && !(t.checklist || []).length; });
    var posts = w.apps.social ? (Store.getJSON(Config.key('social', w.id), []) || []) : [];
    var soon = new Date(Date.now() + 7 * 86400000); var noCopy = posts.filter(function (p) { return p.status !== 'posted' && !p.copy && new Date(p.datetime) <= soon; });
    var unposted = posts.filter(function (p) { return p.status !== 'posted'; });
    var ins = global.InspoModel ? (function () { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } return InspoModel.list({ status: 'new' }).filter(function (x) { return !x.ws || x.ws === w.id; }).length; })() : 0;
    var act = global.Activity ? Activity.summary() : null;
    function by(t) { return all.filter(function (x) { return x.t === t; })[0]; }
    if (!m) out.push({ s: 'Tell the Guide how your agent works — one choice, remembered.', open: 'connect' });
    if (anyFresh) out.push({ s: 'This is still the sample board. Plan your real project.', p: by('Plan a project from scratch') });
    if (act && act.lastActive && act.idle) out.push({ s: 'Nothing has moved for ' + Math.round(act.hoursIdle) + ' hours. A standup gets you back in.', p: by('Daily standup') });
    if (tasks.length && !doing.length) out.push({ s: 'Nothing is in Doing. Pick the next step.', p: by('What should I do right now?') });
    if (doing.length > 3) out.push({ s: doing.length + ' tasks in Doing — more than one person can carry. Trim it.', p: by('Clean up the board') });
    if (noSteps.length) out.push({ s: noSteps.length + ' important task' + (noSteps.length === 1 ? ' has' : 's have') + ' no steps yet: "' + noSteps[0].title.slice(0, 40) + '"…', p: by('Break this task into steps') });
    if (noCopy.length) out.push({ s: noCopy.length + ' post' + (noCopy.length === 1 ? '' : 's') + ' in the next 7 days ' + (noCopy.length === 1 ? 'has' : 'have') + ' no copy.', p: by('Draft next week\'s posts') });
    if (w.apps.social && !unposted.length && !anyFresh) out.push({ s: 'No posts scheduled. Keep the cadence going.', p: by('Brainstorm 10 post ideas') });
    var insNew = global.InspoModel ? InspoModel.listNew(w.id).length : 0;
    if (insNew) out.push({ s: insNew + ' new inspiration item' + (insNew === 1 ? '' : 's') + ' since your last assessment.', p: by('Assess new inspiration') });
    else if (ins >= 3) out.push({ s: ins + ' inspiration items waiting to become work.', p: by('Turn inspiration into work') });
    if (todo.length > 25) out.push({ s: todo.length + ' items in To Do. Park what is not this month.', p: by('Clean up the board') });
    if (!anyFresh && tasks.length > 3 && backup.state !== 'unknown') {
      if (!backupDone()) out.unshift({ s: 'Your data lives only on this computer. Save it somewhere private.', open: 'backup' });
      else if (backup.state === 'ok' && backup.repo && backupDays() !== null && backupDays() >= 7) out.push({ s: 'Last backup was ' + backupDays() + ' days ago.', p: by('Back up now') });
    }
    return out.slice(0, 4);
  }
  function renderMoves(all) {
    var el = panel.querySelector('#guideMoves'); var list = moves(all);
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="guide-move ok"><span class="dot"></span><span>Board looks healthy. Standup in the morning, wrap up at night.</span></div>'; return; }
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
      '<div class="pe-hint">Blanks like <code>&lt;idea&gt;</code> become fields. <code>{{head}}</code> = agent preamble. Context tokens: <code>{{recent}}</code> <code>{{last_task}}</code> <code>{{this}}</code> <code>{{project}}</code> <code>{{board}}</code> <code>{{doing}}</code> <code>{{posts}}</code> <code>{{inspiration}}</code> <code>{{inspiration_new}}</code> <code>{{shipped}}</code> — the same things as the Copy context menu.</div>' +
      '<div class="guide-row"><button type="button" class="gp-copy pe-save">Save</button>' + (x && x.builtin && x.overridden ? '<button type="button" class="guide-snap pe-reset">Reset to default</button>' : '') + (x && x.custom ? '<button type="button" class="guide-snap pe-del">Delete</button>' : x && x.builtin ? '<button type="button" class="guide-snap pe-hide" title="Hide this built-in prompt">Hide</button>' : '') + '<button type="button" class="guide-snap pe-cancel">Cancel</button></div></div>';
  }
  function editPrompt(x, card) {
    var form = card.querySelector('.gp-form'); if (form.querySelector('.gp-editor')) { form.innerHTML = ''; card.classList.remove('open'); return; }
    card.classList.add('open'); form.innerHTML = promptForm(x);
    form.querySelector('.pe-cancel').onclick = function () { form.innerHTML = ''; card.classList.remove('open'); };
    form.querySelector('.pe-save').onclick = function () {
      var ps = pstore(); var v = { t: form.querySelector('.pe-t').value.trim() || x.t, d: form.querySelector('.pe-d').value.trim(), p: form.querySelector('.pe-p').value, c: form.querySelector('.pe-c').value };
      if (x.custom) { ps.custom = ps.custom.map(function (c) { return c.id === x.id ? Object.assign({}, c, v) : c; }); }
      else { ps.overrides[x.t] = { d: v.d, p: v.p }; if (v.c !== x.c || v.t !== x.t) { ps.hidden.push(x.t); ps.custom.push({ id: 'c' + Date.now().toString(36), t: v.t, d: v.d, p: v.p, c: v.c, pages: x.pages }); delete ps.overrides[x.t]; } }
      psave(ps); if (global.Sync) Sync.note('prompts.json', 'edited prompt: ' + v.t); render();
    };
    var rs = form.querySelector('.pe-reset'); if (rs) rs.onclick = function () { var ps = pstore(); delete ps.overrides[x.t]; psave(ps); render(); };
    var dl = form.querySelector('.pe-del'); if (dl) dl.onclick = function () { if (!confirm('Delete "' + x.t + '"?')) return; var ps = pstore(); ps.custom = ps.custom.filter(function (c) { return c.id !== x.id; }); psave(ps); render(); };
    var hd = form.querySelector('.pe-hide'); if (hd) hd.onclick = function () { var ps = pstore(); ps.hidden.push(x.t); psave(ps); render(); };
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
  function restoreHidden() { var ps = pstore(); ps.hidden = []; psave(ps); render(); }

  function bindCard(card, x) {
    var form = card.querySelector('.gp-form'); var main = card.querySelector('.gp-main');
    main.onclick = function () {
      if (!mode()) { Store.set(MODE_KEY, 'chat', { silent: true }); }   // sensible default for a first click
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
    if (x && x.reviews && global.InspoModel) setTimeout(function () { InspoModel.markReviewed(); }, 0);
    if (x && x.t) Store.setJSON(LAST_KEY, { t: x.t, at: Date.now(), ws: Config.activeWs() }, { silent: true });
    text = global.Context ? Context.fill(text) : text.replace('{{snapshot}}', snapshot());
    copyText(text, card, 'Copied — paste into your agent' + (x.go && x.go !== page() ? ' · then open ' + GO[x.go][1] : ''));
  }
  function prefillOf(x) { if (typeof x.prefill === 'function') return x.prefill(); if (typeof x.prefill === 'string') { var e = document.getElementById(x.prefill); return e ? e.value : ''; } return ''; }
  function blanks(x) { var seen = {}, out = []; (x.p.match(/<([^<>\n]{2,60})>/g) || []).forEach(function (m) { var k = m.slice(1, -1); if (!seen[k]) { seen[k] = 1; out.push(k); } }); return out; }
  function copyText(text, el, msg) {
    navigator.clipboard.writeText(text).then(function () {
      var t = el.querySelector ? (el.querySelector('.gp-t') || el) : el; var old = t.textContent; el.classList.add('copied'); t.textContent = msg;
      setTimeout(function () { el.classList.remove('copied'); t.textContent = old; }, 2200);
    }).catch(function () { prompt('Copy this:', text); });
  }
  function previewReply() {
    var ta = panel.querySelector('.guide-reply'); var out = panel.querySelector('.guide-result'); var planEl = panel.querySelector('.guide-plan'); var text = ta.value.trim();
    out.innerHTML = '';
    if (!text) { out.textContent = 'Paste the agent\'s reply first.'; return; }
    if (!global.Apply) { out.textContent = 'Apply is not loaded on this page.'; return; }
    var units = Apply.plan(text, { ws: Config.activeWs() });
    if (!units.length) { out.textContent = 'No commands or checklist items found in that text.'; return; }
    planEl.innerHTML = '<div class="guide-plan-h">' + units.filter(function (u) { return u.ok; }).length + ' change' + (units.length === 1 ? '' : 's') + ' found — untick anything you do not want</div>' +
      units.map(function (u, i) { return '<label class="guide-unit' + (u.ok ? '' : ' off') + '"><input type="checkbox" data-i="' + i + '"' + (u.ok ? ' checked' : ' disabled') + '><span>' + esc(u.label) + (u.ok ? '' : ' <em>' + esc(u.reason) + '</em>') + '</span></label>'; }).join('') +
      '<button type="button" class="gp-copy guide-apply">Apply selected to ' + esc(Config.ws().title) + '</button>';
    planEl.querySelector('.guide-apply').onclick = function () {
      var chosen = Array.prototype.filter.call(planEl.querySelectorAll('input[type=checkbox]'), function (c) { return c.checked && !c.disabled; }).map(function (c) { return units[+c.dataset.i].text; });
      if (!chosen.length) { out.textContent = 'Nothing selected.'; return; }
      applyReply(chosen.join('\n'));
    };
  }
  function applyReply(text) {
    var ta = panel.querySelector('.guide-reply'); var out = panel.querySelector('.guide-result'); var planEl = panel.querySelector('.guide-plan');
    var res = Apply.run(text, { ws: Config.activeWs() });
    planEl.innerHTML = '';
    out.innerHTML = (res.applied.length ? '<b>Applied ' + res.applied.length + ':</b><ul>' + res.applied.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '<b>Nothing applied.</b> ') +
      (res.skipped.length ? '<b>Skipped ' + res.skipped.length + ':</b><ul>' + res.skipped.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
      (res.applied.length ? '<p>Every applied change is in Home → Recent changes and can be reverted.' + ((page() === 'board' || page() === 'social') ? '' : ' Reloading in a moment…') + '</p>' : '');
    if (res.applied.length) {
      ta.value = '';
      if (global.refreshBoard) refreshBoard();
      if (global.refreshSchedule) refreshSchedule();
      var pg = page(); if ((pg === 'scripts' || pg === 'writing' || pg === 'inspo' || pg === 'home')) setTimeout(function () { location.reload(); }, 2500);
      if (global.Sync) Sync.note('inspiration.json', 'agent reply applied');
    }
  }
  function open() { if (!panel) { panel = document.createElement('aside'); panel.className = 'guide'; document.body.appendChild(panel); } render(); panel.classList.add('open'); document.body.classList.add('guide-open'); var before = backup.at; backupStatus().then(function () { if (backup.at !== before && panel.classList.contains('open')) render(); }); fetchFolder().then(function (got) { if (got && panel.classList.contains('open')) render(); }); }
  function close() { if (panel) { panel.classList.remove('open'); document.body.classList.remove('guide-open'); } }
  function toggle() { if (panel && panel.classList.contains('open')) close(); else open(); }
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
  (function () { var g = new URLSearchParams(location.search).get('guide'); if (!g) return; if (['moves', 'prompts', 'apply', 'setup', 'do', 'quick', 'ask', 'reply', 'settings'].indexOf(g) >= 0) Store.set(TAB_KEY, TAB_MAP[g] || g, { silent: true }); if (!Store.get(MODE_KEY)) Store.set(MODE_KEY, 'chat', { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); setTimeout(open, 400); })();
  global.Guide = { open: open, close: close, toggle: toggle, snapshot: snapshot, mode: mode };
})(window);
