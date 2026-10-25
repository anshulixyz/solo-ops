/* =========================================================================
   core/home.js — Home (index.html) and the project Overview (overview.html).
   One script, two pages: every render step checks that its element exists.
   Home = the cockpit: Today strip (now / next / doing / quick add / Share
   today), one card per project, This week, Inspiration + Recent changes,
   Activity folded away. Overview = one project in detail: its boards and
   apps, rename / apps / remove. Handlers are globals (markup uses on*).
   Reads other projects' files with Sync.peek (no registration). The only
   writes to another project go through Quick.setCol (▶ / ✓ on Tasks in
   play), which re-applies the change on the file itself.
   ========================================================================= */
(function () {
  'use strict';
  var ICONS = {
    board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18"/></svg>',
    social: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    script: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4M16 5v4M10 12l4 2.5-4 2.5z"/></svg>',
    writing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M8 5v14M16 5v14"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-6-4-8 0 4-3 6-4 9-1 3 1 10 7 10z"/></svg>'
  };
  var W = Config.ws();
  var PRIMARY_ID = Config.PRIMARY;
  var KEYS = { social: Config.key('social'), scripts: Config.key('scripts'), writing: Config.key('writing'), video: Config.key('videos') };
  var data = { boards: {}, posts: null, scripts: null, notes: null, takes: null };
  var fromFiles = false;
  var HIDDEN_FILES = /^(settings|activity|prompts|backup)\.json$/;   // housekeeping files: not "changes" to a person (boards/workspaces stay: removing a project must be restorable)
  var PAGE = document.body.getAttribute('data-home-page') || 'home';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function q(ws) { return '?ws=' + encodeURIComponent(ws || W.id); }
  function loadLocal() {
    Config.shownBoards().forEach(function (b) { data.boards[b.id] = Store.getJSON(Config.boardKey(b.id), null); });
    data.posts = Store.getJSON(KEYS.social, null);
    var s = Store.getJSON(KEYS.scripts, null); data.scripts = s && s.scripts ? s.scripts : null;
    var w = Store.getJSON(KEYS.writing, null); data.notes = w && w.notes ? w.notes : null;
    var v = Store.getJSON(KEYS.video, null); data.takes = v && v.videos ? v.videos : null;
  }
  function loadFiles() {
    var m = Sync.getMode();
    if (m !== 'server' && m !== 'folder' && m !== 'static') return Promise.resolve(false);
    var boards = Config.shownBoards();
    return Promise.all(boards.map(function (b) { return Sync.peek(Config.boardFile(b.id)); }).concat([Config.file('social'), Config.file('scripts'), Config.file('writing'), 'activity.json', Config.file('videos')].map(Sync.peek))).then(function (r) {
      boards.forEach(function (b, i) { if (r[i] && r[i].tasks) data.boards[b.id] = r[i].tasks; });
      var o = boards.length;
      if (r[o] && r[o].posts) data.posts = r[o].posts;
      if (r[o + 1] && r[o + 1].scripts) data.scripts = r[o + 1].scripts;
      if (r[o + 2] && r[o + 2].notes) data.notes = r[o + 2].notes;
      if (r[o + 3] && r[o + 3].days) Store.setJSON(Activity.KEY, Activity.merge(Activity.load(), r[o + 3]), { silent: true });
      if (r[o + 4] && r[o + 4].videos) data.takes = r[o + 4].videos;
      fromFiles = r.some(Boolean);
      return fromFiles;
    });
  }
  function fmt(dt) { var d = new Date(dt); return isNaN(d) ? dt : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function fmtDay(dt) { var d = new Date(dt); return isNaN(d) ? dt : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
  // the open project still holds the sample sprint (an older first open, or Load sample board / template all): not merely empty
  function isSample() {
    var first = Config.shownBoards()[0]; if (!first || W.sample) return false;   // only shown boards are loaded here
    if (Store.isSample && Store.isSample(Config.boardKey(first.id))) return true;
    var T = MARATHON_TEMPLATES.runway().tasks.map(function (t) { return t.id; }).join();
    var ids = (data.boards[first.id] || []).map(function (t) { return t.id; }).join();
    return !!ids && ids === T;
  }
  // nothing real anywhere yet: no task, post, script, note or take in any of your projects (the Sample project does not count)
  function hasContent(o) { return !!o && ((o.tasks || []).length || (o.posts || []).length || (o.scripts || []).length || (o.notes || []).length || (o.takes || []).length); }
  function installEmpty() { return Config.workspaces().filter(function (w) { return !w.sample; }).every(function (w) { return !Config.hiddenBoards(w.id).length && !hasContent(wsStats[w.id]) && !hasContent(wsLocal(w)); }); }   // someone who hid a board is not new here   // the browser copy counts too: a task just added may not be in the file yet
  function renderFirstRun() {
    var wl = $('welcome'); var fr = $('firstRun'); var shot = /[?&]shot=/.test(location.search);
    var empty = !W.sample && installEmpty() && !shot;
    if (wl) {
      wl.style.display = empty ? '' : 'none';
      var m = Sync.getMode(); var nr = $('wlNameRow'); if (nr) nr.style.display = (m === 'server' || m === 'manual') && W.id === PRIMARY_ID && !String(Config.get('owner') || '').trim() && Config.get('name') === 'Solo Ops' ? '' : 'none';
      var lk = $('wlLink'); if (lk) lk.style.display = (Sync.fsSupported && m === 'manual') ? '' : 'none';
      var wh = $('wlWhere'); if (wh) wh.innerHTML = m === 'server' ? 'Saved to <code>data/</code> in your Solo Ops folder while <code>node serve.js</code> runs, so your AI sees every change.' : m === 'folder' ? 'Saved to the linked Solo Ops folder, so your AI sees every change.' : 'Right now this lives in this browser only. Link the folder (Chrome, Edge) or run <code>node serve.js</code> in the Solo Ops folder so your files and your AI see it.';
    }
    if (fr) {
      var dismissed = shot; try { dismissed = dismissed || !!localStorage.getItem('marathon.hub.sampleOk'); } catch (e) {}
      fr.style.display = (!empty && isSample() && !dismissed) ? '' : 'none';
      var lb = $('linkBtn'); if (lb) lb.style.display = (Sync.fsSupported && Sync.getMode() === 'manual') ? '' : 'none';
    }
  }
  // "1 take without words yet" · "2 takes waiting to be cut" · "1 cut waiting to be rendered": the step the most recent waiting take is at
  function takeWaiting(takes) {
    var w = (takes || []).filter(function (v) { return ['recorded', 'transcribed', 'cut'].indexOf(v.status || 'recorded') >= 0; }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    if (!w.length) return ''; var by = {}; w.forEach(function (v) { var st = v.status || 'recorded'; by[st] = (by[st] || 0) + 1; });
    var part = function (n, one, many) { return n ? n + ' ' + (n === 1 ? one : many) : ''; };
    return [part(by.recorded, 'take without words yet', 'takes without words yet'), part(by.transcribed, 'take to cut', 'takes to cut'), part(by.cut, 'cut to render', 'cuts to render')].filter(Boolean).join(' · ');
  }
  function latest(arr) { return arr.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })[0]; }
  function noteTitle(text) { var m = (text || '').match(/^#\s+(.+)/m); return m ? m[1].trim().slice(0, 50) : (text || '').split('\n')[0].slice(0, 50) || 'Untitled'; }
  function counts(tasks) {
    var c = { doing: 0, todo: 0, done: 0, later: 0, bucket: 0 }; (tasks || []).forEach(function (t) { c[t.col] = (c[t.col] || 0) + 1; });
    c.board = c.doing + c.todo + c.done; c.pct = c.board ? Math.round(c.done / c.board * 100) : 0; return c;
  }
  var PRI = { high: 0, medium: 1, low: 2 };
  function rank(t) { return t.pri in PRI ? PRI[t.pri] : 1; }
  function byPri(a, b) { return rank(a) - rank(b); }
  function wsTitleOf(id) { var w = Config.workspace(id); return w ? w.title : id; }
  function many() { return Config.workspaces().length > 1; }
  // Home scope: 'all' or one project. Filters Today, This week and Recent changes; the project cards always show every project.
  var SCOPE_KEY = 'marathon.hub.scope';
  function scope() { if (!many()) return 'all'; var s = ''; try { s = localStorage.getItem(SCOPE_KEY) || ''; } catch (e) {} return s && Config.workspace(s) ? s : 'all'; }
  function scopeTitle() { var s = scope(); return s === 'all' ? 'all projects' : wsTitleOf(s); }
  window.setHomeScope = function (id) { try { localStorage.setItem(SCOPE_KEY, id); } catch (e) {} render(); loadProjects(); };
  function scopeChips() {
    if (!many()) return ''; var s = scope();
    return '<div class="scope" role="tablist" aria-label="Which projects Home shows"><span class="scope-l">Show</span>' + [{ id: 'all', title: 'All' }].concat(Config.workspaces().filter(function (w) { return !w.sample || w.id === W.id; })).map(function (w) { return '<button type="button" class="' + (w.id === s ? 'on' : '') + '" onclick="setHomeScope(\'' + esc(w.id) + '\')" title="' + (w.id === 'all' ? 'Every project together' : 'Only ' + esc(w.title)) + '">' + esc(w.title) + '</button>'; }).join('') + '</div>';
  }
  function boardLink(t) { return 'runway/marathon-board.html?ws=' + encodeURIComponent(t._ws) + '&board=' + encodeURIComponent(t._board) + (t.id ? '&id=' + encodeURIComponent(t.id) : ''); }
  function toast(msg) { var t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('show'); }, 2200); }

  /* ---- activity: folded away on Home, streak line in the summary ---- */
  function renderActivity(allTasks) {
    var el = $('activity'); if (!el) return;
    var s = Activity.summary();
    var top = allTasks.filter(function (t) { return t.col === 'doing'; })[0] || allTasks.filter(function (t) { return t.col === 'todo' && t.pri === 'high'; })[0] || allTasks.filter(function (t) { return t.col === 'todo'; })[0];
    var left = '<div class="act-card' + (s.idle && s.lastActive ? ' idle' : '') + '">' +
      '<div class="act-sub">' + ICONS.flame.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;color:var(--accent)"') + (s.lastActive ? 'Last activity <b>' + esc(Activity.ago(s.lastActive)) + '</b>' : 'No activity logged yet') + '</div>' +
      '<div class="act-big">' + s.streak + '<small>day streak</small></div>' +
      '<div class="act-sub"><b>' + s.todayCount + '</b> change' + (s.todayCount === 1 ? '' : 's') + ' today · <b>' + s.activeDays + '</b> active days logged</div>' +
      (s.idle && s.lastActive ? '<div class="act-nudge">Nothing has moved for ' + Math.round(s.hoursIdle / 24 * 10) / 10 + ' days.' + (top ? ' Smallest next step: <a href="runway/marathon-board.html' + (top._board ? '?board=' + esc(top._board) : '') + '">' + esc(top.title) + '</a>' : '') + '</div>' :
        (!s.lastActive ? '<div class="act-nudge">Add a task, schedule a post or edit a draft and it shows up here.</div>' : '')) +
      '</div>';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var start = new Date(today); start.setDate(start.getDate() - 83); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    var cells = ''; var d = new Date(start); var max = 1;
    Object.keys(s.days).forEach(function (k) { var n = Object.keys(s.days[k]).reduce(function (a, x) { return a + s.days[k][x]; }, 0); if (n > max) max = n; });
    while (d <= today) {
      var k = Activity.dayKey(d); var n = s.days[k] ? Object.keys(s.days[k]).reduce(function (a, x) { return a + s.days[k][x]; }, 0) : 0;
      var lvl = !n ? 0 : n >= max * 0.75 ? 4 : n >= max * 0.5 ? 3 : n >= max * 0.25 ? 2 : 1;
      cells += '<i class="l' + lvl + (k === Activity.dayKey(today) ? ' today' : '') + '" title="' + esc(k) + (n ? ' · ' + n + ' change' + (n === 1 ? '' : 's') + ': ' + Object.keys(s.days[k]).map(function (x) { return x + ' ×' + s.days[k][x]; }).join(', ') : ' · quiet') + '"></i>';
      d.setDate(d.getDate() + 1);
    }
    var byApp = Object.keys(s.lastByApp || {}).sort(function (a, b) { return (s.lastByApp[b] || '') > (s.lastByApp[a] || '') ? 1 : -1; }).slice(0, 6)
      .map(function (a) { return '<span>' + esc(a) + ' ' + esc(Activity.ago(s.lastByApp[a])) + '</span>'; }).join('');
    var right = '<div class="act-card"><div class="act-sub">Last 12 weeks · every change on any page or from the CLI counts · reminder after ' + s.reminderAfterHours + ' h idle</div>' +
      '<div class="hm">' + cells + '</div><div class="hm-legend">' + (byApp || '<span>no activity yet</span>') + '</div></div>';
    el.innerHTML = left + right;
    var line = $('activityLine'); if (line) line.innerHTML = (s.streak ? '<b>' + s.streak + '</b> day streak · ' : '') + (s.lastActive ? 'last activity <b>' + esc(Activity.ago(s.lastActive)) + '</b> · ' : '') + '<b>' + s.todayCount + '</b> change' + (s.todayCount === 1 ? '' : 's') + ' today';
  }

  /* ---- every project: stats read from files (peek) or the browser ---- */
  var wsStats = {};
  function wsLocal(w) {
    var o = { tasks: [], tasksByBoard: {}, posts: null, scripts: null, notes: null, takes: null };
    Config.shownBoards(w.id).forEach(function (b) { var bt = Store.getJSON(Config.boardKey(b.id, w.id), null) || []; o.tasksByBoard[b.id] = bt; bt.forEach(function (t) { o.tasks.push(t); }); });
    if (w.apps.social) o.posts = Store.getJSON(Config.key('social', w.id), null);
    if (w.apps.scripts) { var sc = Store.getJSON(Config.key('scripts', w.id), null); o.scripts = sc && sc.scripts ? sc.scripts : null; }
    if (w.apps.writing) { var wr = Store.getJSON(Config.key('writing', w.id), null); o.notes = wr && wr.notes ? wr.notes : null; }
    if (w.apps.video) { var vd = Store.getJSON(Config.key('videos', w.id), null); o.takes = vd && vd.videos ? vd.videos : null; }
    return o;
  }
  function wsFiles(w) {
    var m = Sync.getMode(); var o = wsLocal(w);
    if (m !== 'server' && m !== 'folder' && m !== 'static') return Promise.resolve(o);
    var boards = Config.shownBoards(w.id);
    var reads = boards.map(function (b) { return Sync.peek(Config.boardFile(b.id, w.id)); })
      .concat([w.apps.social ? Sync.peek(Config.file('social', w.id)) : null, w.apps.scripts ? Sync.peek(Config.file('scripts', w.id)) : null, w.apps.writing ? Sync.peek(Config.file('writing', w.id)) : null, w.apps.video ? Sync.peek(Config.file('videos', w.id)) : null]);
    return Promise.all(reads).then(function (r) {
      var tasks = []; var any = false;
      boards.forEach(function (b, i) { if (r[i] && r[i].tasks) { any = true; o.tasksByBoard[b.id] = r[i].tasks; r[i].tasks.forEach(function (t) { tasks.push(t); }); } });
      if (any) o.tasks = tasks;
      var n = boards.length;
      if (r[n] && r[n].posts) o.posts = r[n].posts;
      if (r[n + 1] && r[n + 1].scripts) o.scripts = r[n + 1].scripts;
      if (r[n + 2] && r[n + 2].notes) o.notes = r[n + 2].notes;
      if (r[n + 3] && r[n + 3].videos) o.takes = r[n + 3].videos;
      return o;
    });
  }
  function loadProjects() {
    return Promise.all(Config.workspaces().map(function (w) { return wsFiles(w).then(function (o) { wsStats[w.id] = o; }); })).then(renderProjects);
  }
  // every task / post across every project, tagged with where it lives
  function gather() {
    var tasks = [], posts = [];
    Config.workspaces().forEach(function (w) {
      if (w.sample && w.id !== W.id) return;   // the Sample project never mixes into your day
      var o = wsStats[w.id] || wsLocal(w);
      Config.shownBoards(w.id).forEach(function (b) {
        var bt = (wsStats[w.id] ? null : Store.getJSON(Config.boardKey(b.id, w.id), null)) || [];
        (o.tasksByBoard && o.tasksByBoard[b.id] ? o.tasksByBoard[b.id] : bt).forEach(function (t) { tasks.push(Object.assign({ _ws: w.id, _board: b.id }, t)); });
      });
      (o.posts || []).forEach(function (p) { posts.push(Object.assign({ _ws: w.id }, p)); });
    });
    var s = scope(); if (s !== 'all' && !gather.everything) { tasks = tasks.filter(function (t) { return t._ws === s; }); posts = posts.filter(function (p) { return p._ws === s; }); }
    return { tasks: tasks, posts: posts };
  }
  function doneToday() {   // from the browser's own change events (the file log has no per-item view)
    if (!window.Recent) return 0; var today = new Date().toDateString();
    return Recent.load().filter(function (ev) { return /^finished: /.test(ev.what || '') && new Date(ev.ts).toDateString() === today; }).length;
  }

  /* ---- Today strip (Home) ---- */
  function renderToday() {
    var el = $('todayDyn'); if (!el) return;
    var Wn = window.When; var g = gather(); var tasks = g.tasks, posts = g.posts; var now = new Date();
    var tkey = Wn ? Wn.localD(now) : now.toISOString().slice(0, 10); var nowStamp = Wn ? Wn.localDT(now) : '';
    var weekEnd = new Date(now.getTime() + 7 * 86400000); var wkKey = Wn ? Wn.localD(weekEnd) : '';
    var open = tasks.filter(function (t) { return t.col !== 'done'; });
    var overdue = 0, dueWeek = 0, meetingsWeek = 0; var todayItems = [];
    if (Wn) open.forEach(function (t) {
      if (!t.at && !t.due) return; var st = Wn.state(t, now); if (st === 'overdue') overdue++;
      var day = Wn.dayKey(t.at || t.due); if (t.due && t.due > tkey && t.due <= wkKey) dueWeek++;
      if (t.at && (t.tags || []).indexOf('meeting') >= 0 && day >= tkey && day <= wkKey) meetingsWeek++;
      if (t.at && day === tkey) todayItems.push(t);
    });
    todayItems.sort(function (a, b) { return a.at.localeCompare(b.at); });
    var current = todayItems.filter(function (t) { return t.at <= nowStamp && t.until && t.until > nowStamp; })[0];
    var next = current || todayItems.filter(function (t) { return t.at > nowStamp; })[0];
    var postsWeek = posts.filter(function (p) { return p.status !== 'posted' && p.datetime && p.datetime.slice(0, 10) >= tkey && p.datetime.slice(0, 10) <= wkKey; }).length;
    var doing = open.filter(function (t) { return t.col === 'doing'; }).sort(byPri).slice(0, 3);
    var done = doneToday();
    function inWords(stamp) { var ms = new Date(stamp.replace('T', ' ').replace(' ', 'T')) - now; var m = Math.round(ms / 60000); if (m <= 0) return 'now'; if (m < 60) return 'in ' + m + ' min'; return 'in ' + Math.round(m / 60) + ' h'; }
    var left = '<div class="date"><div class="wd">' + esc(now.toLocaleDateString(undefined, { weekday: 'long' })) + '</div><div class="dt">' + esc(now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })) + (many() ? ' · ' + esc(scopeTitle()) : '') + '</div>' + scopeChips() +
      '<div class="ctr">' + (overdue ? '<a class="warn" href="calendar/calendar.html' + q() + '" title="Deadlines passed or timed tasks not ticked">' + overdue + ' overdue</a>' : '') +
      (done ? '<span class="good">' + done + ' done today</span>' : '') +
      (dueWeek ? '<span>' + dueWeek + ' due this week</span>' : '') + (meetingsWeek ? '<span>' + meetingsWeek + ' meeting' + (meetingsWeek === 1 ? '' : 's') + ' this week</span>' : '') +
      (postsWeek ? '<span>' + postsWeek + ' post' + (postsWeek === 1 ? '' : 's') + ' this week</span>' : '') + '</div></div>';
    var mid = '<div class="plan"><div class="k">' + (current ? 'Now' : 'Next') + '</div>' +
      (next ? '<div class="next"><b>' + esc(Wn.range(next.at, next.until)) + '</b><a href="' + boardLink(next) + '">' + esc(next.title) + '</a>' + (current ? '' : '<span class="in">' + esc(inWords(next.at)) + '</span>') + (many() ? '<span class="in">' + esc(wsTitleOf(next._ws)) + '</span>' : '') + '</div>'
        : '<div class="quiet">' + (todayItems.length ? 'Nothing more with a time today.' : 'No meetings or timed tasks today.') + ' <a href="calendar/calendar.html' + q() + '">Calendar →</a></div>') +
      '<div class="k">Doing</div>' + (doing.length ? '<ul>' + doing.map(function (t) { return '<li>' + (many() ? '<span class="pj">' + esc(wsTitleOf(t._ws)) + '</span>' : '') + '<a href="' + boardLink(t) + '">' + esc(t.title) + '</a></li>'; }).join('') + '</ul>'
        : '<div class="quiet">Nothing started. ' + (open.length ? 'Pick one on the <a href="runway/marathon-board.html' + q() + '">board</a> or ask <a href="#" onclick="Guide.openPrompt(\'now\');return false;">What should I do right now?</a>' : 'Add the first task with the quick add.') + '</div>') + '</div>';
    el.innerHTML = left + mid;   // the buttons and the quick add form are static markup beside this, so a re-render never eats what is being typed
    var cl = $('calLink'); if (cl) cl.href = 'calendar/calendar.html' + q();
    var hint = $('qaHint'); if (hint) hint.innerHTML = 'Lands in To Do of ' + esc(W.title) + (many() ? ' (the open project)' : '') + ' · a date at the end becomes its time · <kbd>⌘K</kbd> jumps anywhere';
  }
  window.homeQuickAdd = function (e) {
    if (e) e.preventDefault(); var inp = $('qaInput'); var text = inp ? inp.value.trim() : ''; if (!text || !window.Quick) return false;
    var made = Quick.addLines(text, { ws: W.id }); if (!made.length) { toast('No board in this project yet.'); return false; }
    inp.value = ''; var t = made[0].task; var Wn = window.When; toast('Added: ' + t.title + (t.at ? ' · ' + (Wn ? Wn.label(t.at) : t.at) : t.due ? ' · due ' + (Wn ? Wn.label(t.due) : t.due) : ''));
    wsStats = {}; loadLocal(); render(); loadProjects();   // from the browser copy; Home registers the open project's boards, so the file follows within a second
    inp.focus();
    return false;
  };
  // ▶ / ✓ on Tasks in play: any project. Quick writes the browser copy and, with a server or linked folder, the file itself.
  window.homeTask = function (ws, board, id, col) {
    var w = Config.workspace(ws); if (!w || !window.Quick) return;
    var o = wsStats[ws] || wsLocal(w); var t = (o.tasksByBoard && o.tasksByBoard[board] ? o.tasksByBoard[board] : []).filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var row = { ws: ws, board: board, key: Config.boardKey(board, ws), file: Config.boardFile(board, ws), task: t };
    var ok = Quick.setCol(row, col, function (changed) { toast(changed ? (col === 'done' ? 'Done: ' : 'Now doing: ') + t.title + (many() ? ' · ' + wsTitleOf(ws) : '') : 'Could not change "' + t.title + '": it is no longer on that board.'); wsStats = {}; loadLocal(); render(); loadProjects(); });
    if (!ok) { toast('Could not change that task here. Open its board.'); return; }
    wsStats = {}; loadLocal(); render(); loadProjects();
  };
  window.shareToday = function () {
    if (!window.ShareCard) return;
    gather.everything = true; var g = gather(); gather.everything = false;   // the card can show any project, whatever Home is filtered to
    var scopes = [{ id: W.id, title: W.title }].concat(Config.workspaces().filter(function (w) { return w.id !== W.id; }).map(function (w) { return { id: w.id, title: w.title }; })); if (many()) scopes.push({ id: 'all', title: 'All projects' });
    if (many()) Store.set('marathon.share.scope', scope(), { silent: true });   // the card opens on what Home is showing
    ShareCard.open({ scopes: scopes, streak: Activity.summary().streak,
      data: function (id) { return id === 'all' ? { scope: 'All projects', tasks: g.tasks } : { scope: wsTitleOf(id), tasks: g.tasks.filter(function (t) { return t._ws === id; }) }; },
      onPlan: function () { Guide.openPrompt('plan-today'); } });
  };

  /* ---- This week (Home): tasks in play · calendar today + tomorrow · posts ---- */
  function renderWeek() {
    var el = $('today'); if (!el) return;
    var g = gather(); var tasks = g.tasks, posts = g.posts; var m = many();
    var focus = tasks.filter(function (t) { return t.col === 'doing' || (t.col === 'todo' && t.pri === 'high'); })
      .sort(function (a, b) { return (m ? (a._ws === W.id ? 0 : 1) - (b._ws === W.id ? 0 : 1) : 0) || (a.col === 'doing' ? 0 : 1) - (b.col === 'doing' ? 0 : 1) || byPri(a, b); }).slice(0, 10);
    var weekEnd = new Date(Date.now() + 7 * 86400000);
    var week = posts.filter(function (p) { return p.status !== 'posted' && new Date(p.datetime) <= weekEnd; }).sort(function (a, b) { return a.datetime.localeCompare(b.datetime); }).slice(0, 8);
    var lastWs = null;
    var html = '<div class="hub-card"><div class="sec-h" style="margin:0 0 8px">Tasks in play <a href="runway/marathon-board.html' + q() + '">Board →</a></div>' + (focus.length ? '<ul>' + focus.map(function (t) {
      var n = (t.checklist || []).length, d = (t.checklist || []).filter(function (c) { return c.done; }).length; var grp = '';
      if (m && t._ws !== lastWs) { lastWs = t._ws; grp = '<li class="grp">' + esc(wsTitleOf(t._ws)) + '</li>'; }
      var act = t.col === 'doing' ? '<button type="button" class="tq done" title="Mark done" onclick="homeTask(\'' + esc(t._ws) + '\',\'' + esc(t._board) + '\',\'' + esc(t.id) + '\',\'done\')">✓</button>' : '<button type="button" class="tq" title="Start: move to Doing" onclick="homeTask(\'' + esc(t._ws) + '\',\'' + esc(t._board) + '\',\'' + esc(t.id) + '\',\'doing\')">▶</button>';
      return grp + '<li>' + act + '<span class="pdot ' + (t.col === 'doing' ? 'doing' : t.pri === 'high' ? 'high' : '') + '" title="' + esc(t.col === 'doing' ? 'doing' : t.pri + ' priority') + '"></span><a href="' + boardLink(t) + '" title="' + esc(t.id) + '">' + esc(t.title) + '</a><span class="meta">' + (t.col === 'doing' ? 'doing' : 'high') + (n ? ' · ' + d + '/' + n : '') + '</span></li>';
    }).join('') + '</ul><div class="fine" style="margin-top:6px">▶ starts a task, ✓ finishes it' + (m ? ', any project' : '') + '. <a href="#" onclick="Store.set(\'marathon.guide.tab\',\'quick\',{silent:true});Guide.open();return false;">More tasks →</a></div>' : '<div class="empty">Nothing in Doing and no high-priority To Do' + (scope() === 'all' ? ' anywhere' : ' in ' + esc(scopeTitle())) + '. Add one above, or ⌘K → add.</div>') + '</div>';
    var Wn = window.When; var sched = []; var tkey = '', tmkey = '';
    if (Wn) {
      var now = new Date(); tkey = Wn.localD(now); var tm = new Date(now.getTime()); tm.setDate(tm.getDate() + 1); tmkey = Wn.localD(tm);
      tasks.forEach(function (t) { if (!t.at && !t.due) return; var st = Wn.state(t, now); var day = Wn.dayKey(t.at || t.due); if (t.col !== 'done' && (st === 'overdue' || day === tkey || day === tmkey)) sched.push({ kind: 'task', id: t.id, title: t.title, at: t.at || '', until: t.until || '', due: t.due || '', st: st, day: day, ws: t._ws, board: t._board, meeting: (t.tags || []).indexOf('meeting') >= 0 }); });
      sched.sort(function (a, b) { var oa = a.st === 'overdue' ? 0 : 1, ob = b.st === 'overdue' ? 0 : 1; if (oa !== ob) return oa - ob; return ((a.at || a.due) + (a.at ? '' : 'T00:00')).localeCompare((b.at || b.due) + (b.at ? '' : 'T00:00')); });
    }
    html += '<div class="hub-card"><div class="sec-h" style="margin:0 0 8px">Calendar · today and tomorrow <a href="calendar/calendar.html' + q() + '">Open →</a></div>' + (sched.length ? '<ul>' + sched.slice(0, 10).map(function (i) {
      var when = i.st === 'overdue' ? 'overdue' : i.st === 'past' ? 'ended ' + Wn.timeOf(i.until || i.at) : (i.day === tmkey ? 'tmrw ' : '') + (i.at ? Wn.range(i.at, i.until) : 'due');
      var link = 'runway/marathon-board.html?ws=' + encodeURIComponent(i.ws) + '&board=' + encodeURIComponent(i.board) + '&id=' + encodeURIComponent(i.id);
      return '<li' + (i.st === 'past' ? ' class="past"' : '') + '><span class="when' + (i.st === 'overdue' ? ' overdue' : '') + '">' + esc(when) + '</span><a href="' + link + '">' + esc(i.title) + '</a><span class="meta">' + (m ? esc(wsTitleOf(i.ws)) + ' · ' : '') + (i.meeting ? 'meeting' : 'task') + '</span></li>';
    }).join('') + '</ul>' : '<div class="empty">Nothing with a time today or tomorrow. Add a meeting on the <a href="calendar/calendar.html' + q() + '">Calendar</a>, give a card a date, or ask your agent to <a href="#" onclick="Guide.openPrompt(\'fill-calendar\');return false;">fill it in</a>.</div>') + '</div>';
    html += '<div class="hub-card"><div class="sec-h" style="margin:0 0 8px">Posts · next 7 days <a href="social/social-board.html' + q() + '">Schedule →</a></div>' + (week.length ? '<ul>' + week.map(function (p) {
      var n = (p.prep || []).length, d = (p.prep || []).filter(function (c) { return c.done; }).length;
      return '<li><span class="when">' + esc(fmtDay(p.datetime)) + '</span><a href="social/social-board.html?ws=' + encodeURIComponent(p._ws) + '&id=' + encodeURIComponent(p.id) + '">' + esc(p.title) + '</a><span class="meta">' + (m ? esc(wsTitleOf(p._ws)) + ' · ' : '') + (n ? d + '/' + n + ' prep' : esc(p.status)) + '</span></li>';
    }).join('') + '</ul>' : '<div class="empty">No unposted posts in the next week.</div>') + '</div>';
    el.innerHTML = html;
  }

  /* ---- project cards (Home) ---- */
  function renderProjects() {
    renderToday(); renderWeek(); renderFirstRun();
    var el = $('projects'); if (!el) return;
    var all = Config.workspaces(); var tot = { tasks: 0, doing: 0, posts: 0, scripts: 0, notes: 0 };
    all.filter(function (w) { return !w.sample || w.id === W.id; }).forEach(function (w) { var o = wsStats[w.id] || wsLocal(w); var c = counts(o.tasks); tot.tasks += c.board; tot.doing += c.doing; tot.posts += (o.posts || []).filter(function (p) { return p.status !== 'posted'; }).length; tot.scripts += (o.scripts || []).length; tot.notes += (o.notes || []).length; });
    var sum = $('projectsSum'); if (sum) sum.textContent = all.length + ' project' + (all.length === 1 ? '' : 's') + ' · ' + tot.doing + ' doing · ' + tot.posts + ' posts queued · ' + tot.scripts + ' scripts · ' + tot.notes + ' notes';
    var la = Activity.summary().lastByApp || {}; var Wn = window.When; var now = new Date(); var tkey = Wn ? Wn.localD(now) : ''; var wkKey = Wn ? Wn.localD(new Date(now.getTime() + 7 * 86400000)) : '';
    el.innerHTML = all.map(function (w) {
      var o = wsStats[w.id] || wsLocal(w); var c = counts(o.tasks); var nb = Config.shownBoards(w.id).length; var nh = Config.hiddenBoards(w.id).length;
      var posts = o.posts || []; var postsWeek = posts.filter(function (p) { return p.status !== 'posted' && p.datetime && p.datetime.slice(0, 10) >= tkey && p.datetime.slice(0, 10) <= wkKey; }).length;
      var open = o.tasks.filter(function (t) { return t.col !== 'done'; });
      var overdue = Wn ? open.filter(function (t) { return (t.at || t.due) && Wn.state(t, now) === 'overdue'; }).length : 0;
      var meetings = Wn ? open.filter(function (t) { return t.at && (t.tags || []).indexOf('meeting') >= 0 && Wn.dayKey(t.at) >= tkey && Wn.dayKey(t.at) <= wkKey; }).length : 0;
      var doing = open.filter(function (t) { return t.col === 'doing'; }).sort(byPri)[0];
      var nowStamp = Wn ? Wn.localDT(now) : ''; var dated = Wn ? open.filter(function (t) { return t.at && (t.until || t.at) > nowStamp; }).sort(function (a, b) { return a.at.localeCompare(b.at); })[0] : null;
      var top = open.filter(function (t) { return t.col === 'todo'; }).sort(byPri)[0];
      var line = doing ? '<div class="now"><b>Doing</b>' + esc(doing.title) + '</div>' : dated ? '<div class="now"><b>Next</b>' + esc(Wn.label ? Wn.label(dated.at) : dated.at) + ' · ' + esc(dated.title) + '</div>' : top ? '<div class="now"><b>Next</b>' + esc(top.title) + '</div>' : '<div class="now quiet">' + (nb ? 'Nothing started yet' : nh ? 'All boards hidden' : 'No board in this project') + '</div>';
      var stamps = Config.shownBoards(w.id).map(function (b) { return la[b.id]; }).concat([la.schedule, la.scripts, la.notes]).filter(Boolean).sort().reverse();
      var chips = [];
      if (nb) chips.push('<span>' + c.todo + ' to do · ' + c.doing + ' doing</span>');
      if (overdue) chips.push('<span class="warn">' + overdue + ' overdue</span>');
      if (nh) chips.push('<span title="Open the project to show it again">' + nh + ' board' + (nh === 1 ? '' : 's') + ' hidden</span>');
      if (meetings) chips.push('<span>' + meetings + ' meeting' + (meetings === 1 ? '' : 's') + ' this week</span>');
      if (w.apps.social) chips.push('<span>' + postsWeek + ' post' + (postsWeek === 1 ? '' : 's') + ' this week</span>');
      if (w.apps.scripts && (o.scripts || []).length) chips.push('<span>' + o.scripts.length + ' script' + (o.scripts.length === 1 ? '' : 's') + '</span>');
      if (w.apps.writing && (o.notes || []).length) chips.push('<span>' + o.notes.length + ' note' + (o.notes.length === 1 ? '' : 's') + '</span>');
      var tw = takeWaiting(o.takes); if (w.apps.video && tw) chips.push('<span>' + esc(tw) + '</span>');
      return '<a class="hub-card ws' + (w.id === W.id ? ' on' : '') + '" href="overview.html?ws=' + encodeURIComponent(w.id) + '" title="Open this project: its boards, schedule, scripts and notes">' +
        (stamps[0] ? '<span class="last">' + esc(Activity.ago(stamps[0])) + '</span>' : '') +
        '<h2>' + esc(w.title) + (w.sample ? '<span class="sample-tag">SAMPLE</span>' : '') + (w.id === W.id ? '<span class="open-tag">OPEN</span>' : '') + '</h2>' + line +
        (nb ? '<div class="wsbar"><div class="bar"><div class="bar-fill" style="width:' + c.pct + '%"></div></div><b>' + c.pct + '%</b></div>' : '') +
        '<div class="chips">' + chips.join('') + '</div></a>';
    }).join('') + '<a class="hub-card new" href="#" onclick="toggleWsPanel(\'new\');return false;">+ New project</a>';
  }

  /* ---- Overview page: one project's boards and apps ---- */
  function renderOverview() {
    var bl = $('boards'); if (!bl) return;
    var boards = Config.shownBoards(); var hidden = Config.hiddenBoards(); var la = Activity.summary().lastByApp || {};
    bl.innerHTML = boards.map(function (b) {
      var c = counts(data.boards[b.id]); var lb = la[b.id];
      return '<a class="hub-card" href="runway/marathon-board.html' + q() + '&board=' + encodeURIComponent(b.id) + '">' + (lb ? '<span class="last">' + esc(Activity.ago(lb)) + '</span>' : '') +
        '<div class="ic">' + ICONS.board + '</div><h2>' + esc(b.title) + '</h2><div class="sub">' + esc(b.sprintLabel) + ' · ' + c.pct + '%</div>' +
        '<div class="bar"><div class="bar-fill" style="width:' + c.pct + '%"></div></div>' +
        '<div class="stat"><span><b>' + c.doing + '</b> doing</span><span><b>' + c.todo + '</b> to do</span><span><b>' + c.done + '</b> done</span>' + (c.later ? '<span><b>' + c.later + '</b> later</span>' : '') + (c.bucket ? '<span><b>' + c.bucket + '</b> ideas</span>' : '') + '</div>' +
        '<div class="folder">data/' + esc(Config.boardFile(b.id)) + '</div></a>';
    }).join('') + '<a class="hub-card new" href="runway/marathon-board.html' + q() + '#new">+ New board — blank, sample, or a copy</a>' +
      (hidden.length ? '<div class="hub-card hidden-boards"><h2>Hidden (' + hidden.length + ')</h2><div class="sub">Off Home, the Calendar and the board list. Their tasks stay.</div>' +
        hidden.map(function (b) { return '<div class="hb-row"><a href="runway/marathon-board.html' + q() + '&board=' + encodeURIComponent(b.id) + '">' + esc(b.title) + '</a><button class="btn ghost small" onclick="showBoard(\'' + esc(b.id) + '\')">Show</button></div>'; }).join('') + '</div>' : '');
    var bh = $('boardsHead'); if (bh) bh.style.display = boards.length || hidden.length ? '' : 'none'; bl.style.display = boards.length || hidden.length ? '' : 'none';
    var nbl = $('newBoardLink'); if (nbl) nbl.href = 'runway/marathon-board.html' + q() + '#new';
    var posts = data.posts || [], scripts = data.scripts || [], notes = data.notes || [];
    var unposted = posts.filter(function (p) { return p.status !== 'posted'; }).sort(function (a, b) { return a.datetime.localeCompare(b.datetime); });
    var posted = posts.length - unposted.length; var cards = [];
    if (Config.appEnabled('social')) cards.push(card('social/social-board.html' + q(), ICONS.social, Config.get('social.title'), Config.get('social.network') + ' posting arc, prep lists, posting streak.',
      '<span><b>' + posts.length + '</b> posts</span><span><b>' + posted + '</b> posted</span>' + (unposted[0] ? '<span>next <b>' + esc(fmt(unposted[0].datetime)) + '</b></span>' : ''), 'data/' + Config.file('social'), la.schedule || la.social));
    if (Config.appEnabled('scripts')) cards.push(card('studio/script-viewer.html' + q(), ICONS.script, Config.get('studio.scriptTitle'), 'Reels & shorts scripts — hooks, beats, inserts, teleprompter, 9:16 preview.',
      '<span><b>' + scripts.length + '</b> scripts</span>' + (scripts[0] ? '<span>latest <b>' + esc(latest(scripts).title) + '</b></span>' : ''), 'data/' + Config.file('scripts'), la.scripts));
    if (Config.appEnabled('writing')) cards.push(card('studio/writing-viewer.html' + q(), ICONS.writing, Config.get('studio.writingTitle'), 'Drafts with ~~cuts~~, ++adds++, [[notes for AI]], copy-for-AI.',
      '<span><b>' + notes.length + '</b> notes</span>' + (notes[0] ? '<span>latest <b>' + esc(noteTitle(latest(notes).text)) + '</b></span>' : ''), 'data/' + Config.file('writing'), la.notes || la.writing));
    var takes = data.takes || []; var tw = takeWaiting(takes);
    if (Config.appEnabled('video')) cards.push(card('studio/video.html' + q(), ICONS.video, Config.get('studio.videoTitle'), 'Cut your takes by their words. The footage stays where it is.',
      '<span><b>' + takes.length + '</b> take' + (takes.length === 1 ? '' : 's') + '</span>' + (tw ? '<span>' + esc(tw) + '</span>' : takes[0] ? '<span>latest <b>' + esc(latest(takes).title) + '</b></span>' : ''), 'data/' + Config.file('videos'), la.videos));
    $('cards').innerHTML = cards.join('');
    $('appsHead').style.display = cards.length ? '' : 'none';
    var c = counts([].concat.apply([], boards.map(function (b) { return data.boards[b.id] || []; })));
    var sum = $('ovSum'); if (sum) sum.textContent = (boards.length ? boards.length + ' board' + (boards.length === 1 ? '' : 's') + (hidden.length ? ' (' + hidden.length + ' hidden)' : '') + ' · ' + c.doing + ' doing · ' + c.todo + ' to do · ' + c.done + ' done' : hidden.length ? 'All boards hidden' : 'No boards') + (W.apps.social ? ' · ' + unposted.length + ' posts queued' : '') + (W.apps.scripts ? ' · ' + scripts.length + ' scripts' : '') + (W.apps.writing ? ' · ' + notes.length + ' notes' : '');
    var del = $('wsDeleteBtn'); if (del) del.style.display = Config.workspaces().length > 1 ? '' : 'none';
  }
  function card(href, icon, title, sub, stat, folder, last) {
    return '<a class="hub-card" href="' + href + '">' + (last ? '<span class="last">' + esc(Activity.ago(last)) + '</span>' : '') + '<div class="ic">' + icon + '</div><h2>' + esc(title) + '</h2><div class="sub">' + esc(sub) + '</div><div class="stat">' + stat + '</div><div class="folder">' + esc(folder) + '</div></a>';
  }

  /* ---- inspiration + recent changes (Home) ---- */
  function renderInspo() {
    var el = $('inspoCard'); if (!el) return;
    if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; }
    var items = InspoModel.list({ status: 'new' }).slice(0, 5); var all = InspoModel.getState().length;
    el.innerHTML = (items.length ? '<ul class="inspo-mini">' + items.map(function (x) {
      return '<li><span class="k">' + esc(x.kind) + '</span><a href="inspo/inspiration.html">' + esc(x.title || x.url) + '</a>' + (x.ws ? '<span class="k">' + esc(wsTitleOf(x.ws)) + '</span>' : '') + '</li>';
    }).join('') + '</ul>' : '<div class="empty" style="color:var(--faint);font-size:13px">Nothing new. Press ⌘⇧I anywhere, or the + in the nav.</div>') +
      '<div class="stat" style="margin-top:10px"><span><b>' + all + '</b> saved</span><span><b>' + InspoModel.list({ status: 'new' }).length + '</b> unused</span><button class="btn small" style="margin-left:auto" onclick="InspoQuick.open()">+ Add</button></div>';
  }
  function human(what) {   // "finished: Title" → <i>Finished</i> Title
    var m = String(what || '').match(/^([^:]+): (.*)$/); if (!m) return esc(what);
    return '<i>' + esc(m[1].charAt(0).toUpperCase() + m[1].slice(1)) + '</i> ' + esc(m[2]);
  }
  function renderLog() {
    var card = $('logCard'); if (!card) return; var hint = $('logHint');
    var events = window.Recent ? Recent.load().slice().reverse().slice(0, 8) : [];
    if (scope() !== 'all') events = events.filter(function (ev) { return !ev.ws || ev.ws === scope(); });
    var rows = events.map(function (ev) { var who = ev.source === 'you' ? 'you' : ev.source === 'file' ? 'file' : 'agent'; return '<li><span class="src ' + (who === 'you' ? 'ui' : who) + '">' + who + '</span><span class="what">' + human(ev.what) + ' <small>' + (many() && ev.ws ? esc(wsTitleOf(ev.ws)) + ' · ' : '') + esc(Activity.ago(ev.ts)) + '</small></span></li>'; });
    Sync.log(14).then(function (recs) {
      var server = recs ? recs.filter(function (r) { return !HIDDEN_FILES.test(r.file); }) : null;
      if (!rows.length && scope() === 'all' && server && server.length) rows = server.slice(0, 8).map(function (r) { return '<li><span class="src ' + esc(r.source) + '">' + esc(r.source === 'ui' ? 'you' : r.source) + '</span><span class="what">' + esc(r.note || r.file) + ' <small>' + esc(Activity.ago(r.ts)) + '</small></span></li>'; });
      if (hint) hint.textContent = server === null ? 'this browser · the file log needs node serve.js' : 'you and your agent';
      var restore = server && server.length ? '<details class="restore"><summary>Restore a file to an earlier moment</summary><p>Every file write is logged with its previous content. Restoring puts that whole file back as it was just before the change, so edits made to it after that moment are undone too.</p><ul class="log-list">' + server.slice(0, 8).map(function (r) {
        return '<li><span class="src ' + esc(r.source) + '">' + esc(r.source === 'ui' ? 'you' : r.source) + '</span><span class="what" title="' + esc(r.note) + '">' + esc(r.note || r.file) + ' <small>' + esc(r.file) + ' · ' + esc(Activity.ago(r.ts)) + '</small></span>' + (r.canRevert ? '<button class="rv" onclick="revertLog(\'' + esc(r.id) + '\')">Restore</button>' : '') + '</li>';
      }).join('') + '</ul></details>' : (server === null ? '<details class="restore"><summary>Restore a file to an earlier moment</summary><p>Run <code>node serve.js</code> and every file write is logged here with a Restore button. The CLI always has it: <code>node solo.js log</code> and <code>revert</code>.</p></details>' : '');
      card.innerHTML = (rows.length ? '<ul class="log-list">' + rows.join('') + '</ul>' : '<div class="empty" style="color:var(--faint);font-size:13px">No changes ' + (scope() === 'all' ? 'yet' : 'recorded for ' + esc(scopeTitle()) + ' in this browser yet') + '. Tick, move or add something on any page and it shows up here.</div>') + restore;
    });
  }
  window.revertLog = function (id) {
    if (!confirm('Restore this file to how it was just before that change? Later edits to the same file are undone too (this restore is logged and can itself be restored).')) return;
    Sync.revert(id).then(function (ok) { if (ok) { wsStats = {}; loadFiles().then(render).then(loadProjects); renderLog(); } else alert('Could not restore.'); });
  };

  function render() {
    var boards = Config.shownBoards(); var allTasks = [];
    boards.forEach(function (b) { (data.boards[b.id] || []).forEach(function (t) { allTasks.push(Object.assign({ _board: boards.length > 1 ? b.id : '' }, t)); }); });
    renderActivity(allTasks);
    renderOverview();
    renderFirstRun();
    var nt = $('wsSecTitle'); if (nt) nt.textContent = W.title;
    var ht = $('homeTitle'); if (ht) { var owner = String(Config.get('owner') || '').trim(); ht.textContent = owner ? owner + (/s$/i.test(owner) ? '’' : '’s') + ' workspaces' : 'Your workspaces'; }
    var hs = $('homeSub'); if (hs) hs.textContent = many() ? scopeTitle() : W.title;
    var wh = $('weekHead'); if (wh) wh.textContent = 'This week · ' + (many() ? scopeTitle() : W.title);
    var unknown = $('wsUnknown'); if (unknown) { var asked = Config.slug(new URLSearchParams(location.search).get('ws') || ''); unknown.style.display = (!Config.workspace(W.id) || (asked && asked !== W.id)) ? '' : 'none'; }
    renderProjects(); renderInspo(); renderLog();
    document.title = (PAGE === 'overview' ? W.title + ' — ' : '') + (W.title === Config.get('name') || PAGE === 'overview' ? Config.get('name') : W.title + ' — ' + Config.get('name'));
    var note = $('note'); if (note) note.textContent = (fromFiles ? 'Counts read from data/*.json' : 'Counts read from this browser') + ' · ⌘K to jump anywhere · open project "' + W.title + '"';
    Config.applyDOM();
  }

  /* ---- project (workspace) create / edit / rename / remove ---- */
  var wsMode = 'new';
  window.showBoard = function (id) { Config.setHidden(id, false); location.reload(); };   // reload: the board's tasks were never loaded while it was hidden
  window.toggleWsPanel = function (mode) {
    var p = $('wsPanel'); if (!p) { location.href = 'index.html' + q() + (mode === 'edit' ? '#edit-ws' : '#new-ws'); return; }
    var opening = !p.classList.contains('open') || (mode || 'new') !== wsMode;
    wsMode = mode || 'new';
    p.classList.toggle('open', opening);
    if (!opening) return;
    var edit = wsMode === 'edit';
    $('wsPanelLabel').textContent = edit ? 'Project "' + W.title + '" — apps' : 'New project';
    $('wsTitleInput').style.display = edit ? 'none' : '';
    $('wsBoardsField').style.display = edit ? 'none' : '';
    $('wsFromField').style.display = edit ? 'none' : '';
    $('wsSubmit').textContent = edit ? 'Save' : 'Create';
    $('wsAppBoards').checked = edit ? Config.boards(W.id).length > 0 : true;
    $('wsAppBoards').disabled = edit;
    $('wsAppSocial').checked = edit ? W.apps.social : true;
    $('wsAppScripts').checked = edit ? W.apps.scripts : true;
    $('wsAppWriting').checked = edit ? W.apps.writing : true;
    if ($('wsAppVideo')) $('wsAppVideo').checked = edit ? W.apps.video !== false : true;
    if (!edit) $('wsTitleInput').focus();
  };
  function seedApp(app, key, sample) {
    var T = MARATHON_TEMPLATES; var now = new Date();
    var body = app === 'social' ? (sample ? T.social(now).posts : []) : app === 'scripts' ? (sample ? T.scripts(now) : { activeId: '', scripts: [] }) : (sample ? T.writing(now) : { activeId: '', notes: [] });
    Store.setJSON(key, body, { silent: true }); if (sample) Store.markFresh(key);
  }
  window.submitWs = function () {
    var apps = { social: $('wsAppSocial').checked, scripts: $('wsAppScripts').checked, writing: $('wsAppWriting').checked, video: $('wsAppVideo') ? $('wsAppVideo').checked : true };
    if (wsMode === 'edit') { Config.updateWorkspace(W.id, { apps: apps }); location.href = 'overview.html' + q(); return; }
    var title = $('wsTitleInput').value.trim(); if (!title) { alert('Give the project a name.'); return; }
    var id = Config.slug(title); if (!id || Config.RESERVED.indexOf(id) >= 0 || Config.workspace(id)) { alert('Pick a different name.'); return; }
    var sample = $('wsFrom').value === 'sample';
    var boards = $('wsAppBoards').checked
      ? ($('wsBoards').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean).length ? $('wsBoards').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : ['Board'])
      : [];
    var w = Config.addWorkspace({ id: id, title: title, apps: apps, boards: boards.map(function (t) { return { id: Config.slug(t), title: t, sprintLabel: 'Progress', milestones: [], focus: [] }; }) });
    if (!w) { alert('Could not create the project.'); return; }
    w.boards.forEach(function (b, i) {
      var tasks = (sample && i === 0) ? MARATHON_TEMPLATES.runway().tasks : [];
      Store.setJSON(Config.boardKey(b.id, w.id), tasks, { silent: true }); if (tasks.length) Store.markFresh(Config.boardKey(b.id, w.id));
    });
    if (apps.social) seedApp('social', Config.key('social', w.id), sample);
    if (apps.scripts) seedApp('scripts', Config.key('scripts', w.id), sample);
    if (apps.writing) seedApp('writing', Config.key('writing', w.id), sample);
    Config.setActiveWs(w.id);
    location.href = 'index.html?ws=' + encodeURIComponent(w.id) + '&made=1';   // Home keeps every project in view; the toast says what switched
  };
  window.renameWs = function () {
    var t = prompt('Rename this project', W.title); if (!t || !t.trim()) return;
    Config.updateWorkspace(W.id, { title: t.trim() }); location.reload();
  };
  window.deleteWs = function () {
    if (Config.workspaces().length < 2) return;
    if (!confirm('Remove the project "' + W.title + '" from Solo Ops?\n\nIts files in data/ are kept on disk; only the project entry is removed.')) return;
    Config.removeWorkspace(W.id);
    var next = Config.workspaces()[0]; Config.setActiveWs(next.id); location.href = 'index.html?ws=' + encodeURIComponent(next.id);
  };

  function firstRunDone() { try { localStorage.setItem('marathon.hub.sampleOk', '1'); } catch (e) {} var fr = $('firstRun'); if (fr) fr.style.display = 'none'; }
  window.startBlank = function () {
    var ok = true; try { ok = confirm('Replace the sample content in this project with empty lists?'); } catch (e) { ok = true; }
    if (!ok) return;
    // real (non-silent) writes: the apps and sync treat these as your data, not samples
    Config.boards().forEach(function (b) { Store.setJSON(Config.boardKey(b.id), []); Sync.touch(Config.boardFile(b.id)); });
    if (W.apps.social) { Store.setJSON(KEYS.social, []); Sync.touch(Config.file('social')); }
    if (W.apps.scripts) { Store.setJSON(KEYS.scripts, { activeId: '', scripts: [] }); Sync.touch(Config.file('scripts')); }
    if (W.apps.writing) { Store.setJSON(KEYS.writing, { activeId: '', notes: [] }); Sync.touch(Config.file('writing')); }
    if (InspoModel.isSample && InspoModel.isSample()) { InspoModel.replaceAll([]); Sync.touch('inspiration.json'); }   // the sample inbox items go too; anything you saved stays
    firstRunDone();
    // open the first app of this project so its page writes the blank file
    var first = Config.boards()[0];
    location.href = first ? 'runway/marathon-board.html?ws=' + encodeURIComponent(W.id) + '&board=' + encodeURIComponent(first.id)
      : (W.apps.social ? 'social/social-board.html' : W.apps.scripts ? 'studio/script-viewer.html' : 'studio/writing-viewer.html') + '?ws=' + encodeURIComponent(W.id);
  };
  window.keepSample = firstRunDone;

  /* ---- the welcome card (an empty install): bring in · add tasks · a separate sample project ---- */
  function setupApi(body) {
    return fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.error) || 'failed'); return j; }); });
  }
  window.welcomeBringIn = function (btn) { Guide.copyPrompt('bring-in').then(function (ok) { if (ok) toast(Guide.mode() === 'files' || (!Guide.mode() && Sync.getMode() === 'server') ? 'Copied. Paste it into your agent, or just type /bring-in there.' : 'Copied. Paste it into ChatGPT or Claude, then bring the answer back in Guide \u2192 Reply.'); }); Guide.openPrompt('bring-in'); };
  window.welcomeAdd = function () {
    var ta = $('wlAdd'); var text = ta ? ta.value.trim() : ''; if (!text) { if (ta) ta.focus(); return; }
    var made = window.Quick ? Quick.addLines(text, { ws: W.id }) : []; if (!made.length) { toast('No board in this project yet.'); return; }
    ta.value = ''; toast('Added ' + made.length + ' task' + (made.length === 1 ? '' : 's') + ' to ' + made[0].boardTitle + '. The board has them.');
    wsStats = {}; loadLocal(); render(); loadProjects(); setTimeout(function () { wsStats = {}; loadLocal(); render(); loadProjects(); }, 1500);   // again once the file has them (the write follows within a second)
  };
  window.welcomeName = function () {
    var inp = $('wlName'); var name = inp ? inp.value.replace(/[\r\n]/g, ' ').trim().slice(0, 60) : ''; if (!name) { if (inp) inp.focus(); return false; }
    if (Sync.getMode() === 'server') { setupApi({ op: 'blank', name: name }).then(function () { toast('Named "' + name + '". Pages follow in a moment.'); }).catch(function (e) { toast('Could not name it: ' + e.message); }); return false; }
    // no server: the same settings, kept in this browser (Config.override checks them the way `config set` does); the page reloads with them
    try { var b0 = Config.boards(PRIMARY_ID)[0]; var shipped = window.MARATHON_CONFIG || {}; var o = (Store.getJSON(Config.OVR_KEY, null)) || {};
      [['name', name]].concat(b0 ? [['boards.' + b0.id + '.title', name], ['boards.' + b0.id + '.sprintLabel', 'Progress'], ['boards.' + b0.id + '.milestones', '[]'], ['boards.' + b0.id + '.focus', '[]']] : []).forEach(function (st) { o = Config.override(shipped, o, 'set', st[0], st[1], {}).config; });
      if (inp) inp.blur(); toast('Named "' + name + '" in this browser.'); setTimeout(function () { Config.setOverrides(o); }, 600);
    } catch (e) { toast('Could not name it: ' + e.message); }
    return false;
  };
  window.welcomeSample = function () {
    var go = function () { Config.setActiveWs('sample-project'); location.href = 'index.html?ws=sample-project'; };
    if (Sync.getMode() === 'server') {   // the CLI writes it as files, so your agent and every browser see the same Sample project
      setupApi({ op: 'sample' }).then(function () { return Sync.pullAll(false); }).then(go).catch(function (e) { toast('Could not add the sample project: ' + e.message); });
      return;
    }
    // no server: the sample lives in this browser (the files follow when the folder is linked and you change something)
    var sb = (Config.boards(PRIMARY_ID)[0]) || { id: 'runway', title: 'Launch Runway' };
    var shipped = (window.MARATHON_CONFIG && MARATHON_CONFIG.boards && MARATHON_CONFIG.boards[0]) || sb;
    var w = Config.workspace('sample-project') || Config.addWorkspace({ id: 'sample-project', title: 'Sample project', apps: { social: true, scripts: true, writing: true, video: true }, boards: [{ id: 'runway', title: shipped.title || 'Launch Runway', sprintLabel: shipped.sprintLabel || 'Sprint progress', milestones: shipped.milestones || [], focus: shipped.focus || [] }], sample: true });
    if (!w) { toast('Could not add the sample project.'); return; }
    var bk = Config.boardKey('runway', w.id); if (Store.get(bk) == null) { Store.setJSON(bk, MARATHON_TEMPLATES.runway().tasks, { silent: true }); Store.markFresh(bk); }
    ['social', 'scripts', 'writing'].forEach(function (app) { var k = Config.key(app, w.id); if (Store.get(k) == null) seedApp(app, k, true); });
    go();
  };

  Config.applyDOM();
  Palette.init({ root: './' });
  Palette.register([{ label: 'Share today', hint: 'home', keywords: 'image card copy png', run: function () { if (window.shareToday) shareToday(); } },
    { label: 'Start blank (clear all sample data)', hint: 'setup', run: window.startBlank },
    { label: 'New project', hint: 'projects', keywords: 'workspace', run: function () { toggleWsPanel('new'); } },
    { label: 'Project overview', hint: 'projects', keywords: 'workspace boards apps', run: function () { location.href = 'overview.html' + q(); } },
    { label: 'New board', hint: 'boards', run: function () { location.href = 'runway/marathon-board.html' + q() + '#new'; } }]);
  Sync.on(function (evt) { if (evt === 'linked' || evt === 'pulled' || evt === 'applied') { wsStats = {}; loadFiles().then(render).then(loadProjects); } });

  loadLocal(); render();
  var tries = 0;
  (function waitReady() { if (Sync.ready()) { loadFiles().then(render).then(loadProjects).then(renderLog); return; } if (tries++ < 40) setTimeout(waitReady, 100); })();
  Sync.register({ file: 'inspiration.json', key: InspoModel.KEY, label: 'inspiration', app: 'inspiration', isFresh: InspoModel.isFresh,
    read: function () { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } return { items: InspoModel.getState() }; },
    apply: function (body) { if (Array.isArray(body.items)) { InspoModel.replaceAll(body.items, { silent: true }); renderInspo(); } } });
  if (window.Recent) Store.onChange(function (k) { if (/^marathon\.board\.|social/.test(k)) setTimeout(renderLog, 50); });
  if (PAGE === 'home' && Config.workspace(W.id)) Config.boards(W.id).forEach(function (b) {
    var key = Config.boardKey(b.id, W.id); var pk = key + '.projects';
    Sync.register({ file: Config.boardFile(b.id, W.id), keys: [key, pk], label: 'board', app: b.id, isFresh: function () { return Store.get(key) == null; },
      read: function () { return { projects: Store.getJSON(pk, []) || [], tasks: Store.getJSON(key, []) || [] }; },
      apply: function (body) { if (Array.isArray(body.tasks)) { Store.setJSON(key, body.tasks, { silent: true }); data.boards[b.id] = body.tasks; } if (Array.isArray(body.projects)) Store.setJSON(pk, body.projects, { silent: true }); wsStats = {}; render(); loadProjects(); } });
  });
  var act = $('actWrap'); if (act) { try { act.open = localStorage.getItem('marathon.hub.activityOpen') === '1'; } catch (e) {} act.addEventListener('toggle', function () { try { localStorage.setItem('marathon.hub.activityOpen', act.open ? '1' : '0'); } catch (e) {} }); }
  if (/[?&]made=1/.test(location.search)) { setTimeout(function () { toast('Project "' + W.title + '" created. Board and Calendar now show it; switch projects with the Workspace menu (top left).'); }, 400); history.replaceState(null, '', location.pathname + location.search.replace(/[?&]made=1/, '').replace(/^&/, '?')); }
  if (location.hash === '#new-ws' || location.hash === '#edit-ws') { toggleWsPanel(location.hash === '#edit-ws' ? 'edit' : 'new'); history.replaceState(null, '', location.pathname + location.search); }
})();
