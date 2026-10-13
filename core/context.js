/* =========================================================================
   core/context.js — things you can hand to an agent, as text. Each one is
   a {{token}} usable inside any prompt and an entry in the Guide's Context
   menu. Global `Context`.
     recent · shipped · last_task · this · project · doing · inspiration · board
   ========================================================================= */
(function (global) {
  'use strict';
  function ws() { return Config.ws(); }
  function page() {
    var h = location.pathname.replace(/.*\//, '');
    return { 'index.html': 'home', '': 'home', 'marathon-board.html': 'board', 'social-board.html': 'social', 'social-calendar.html': 'social', 'calendar.html': 'calendar', 'script-viewer.html': 'scripts', 'writing-viewer.html': 'writing', 'inspiration.html': 'inspo' }[h] || 'home';
  }
  function task(t, bTitle) {
    return '[' + t.id + '] ' + t.title + (bTitle ? ' · board: ' + bTitle : '') + ' · ' + t.col + ' · ' + t.pri + (t.at ? ' · at ' + t.at.replace('T', ' ') + (t.until ? '–' + t.until.slice(11) : '') : '') + (t.due ? ' · due ' + t.due : '') + (t.tags.length ? ' · #' + t.tags.join(' #') : '') + ' · project: ' + t.proj +
      (t.desc ? '\n  ' + t.desc : '') + ((t.checklist || []).length ? '\n  steps: ' + t.checklist.map(function (c, i) { return (c.done ? '[x] ' : '[ ] ') + (i + 1) + '. ' + c.text; }).join(' · ') : '\n  (no steps yet)') + (t.notes ? '\n  notes: ' + t.notes.replace(/\n/g, ' / ') : '');
  }
  function post(p) {
    return '[' + p.id + '] ' + p.title + ' · ' + p.datetime.replace('T', ' ') + ' · ' + p.postType + ' · ' + p.format + ' · ' + p.status + (p.copy ? '\n  copy: ' + p.copy : '\n  (no copy yet)') + ((p.prep || []).length ? '\n  prep: ' + p.prep.map(function (c) { return (c.done ? '[x] ' : '[ ] ') + c.text; }).join(' · ') : '') + ((p.links || []).length ? '\n  links: ' + p.links.map(function (l) { return l.url; }).join(' ') : '') + ((p.assets || []).length ? '\n  images: ' + p.assets.map(function (a) { return a.file || a.name + ' (in the app)'; }).join(', ') : '') + (p.notes ? '\n  notes: ' + p.notes : '');
  }
  function allTasks() { var w = ws(); var out = []; Config.boards(w.id).forEach(function (b) { (Store.getJSON(Config.boardKey(b.id, w.id), []) || []).forEach(function (t) { out.push({ t: t, b: b }); }); }); return out; }

  var C = {
    recent: { label: 'Recent context', hint: 'last 10 changes, with each item\'s current state', get: function () { return global.Recent ? Recent.text(10) : ''; } },
    last_task: { label: 'Last task I touched', hint: 'the full card', get: function () {
      var evs = global.Recent ? Recent.load().slice().reverse().filter(function (e) { return e.kind === 'task' && !e.gone; }) : [];
      for (var i = 0; i < evs.length; i++) { var hit = allTasks().filter(function (x) { return x.t.id === evs[i].id; })[0]; if (hit) return '# Last task I touched (' + Activity.ago(evs[i].ts) + ': ' + evs[i].what + ')\n' + task(hit.t, hit.b.title); }
      var doing = allTasks().filter(function (x) { return x.t.col === 'doing'; })[0]; return doing ? '# Task in progress\n' + task(doing.t, doing.b.title) : '(no task touched yet)';
    } },
    this: { label: 'This item', hint: 'what is open on this page', get: function () {
      var pg = page(); var w = ws();
      if (pg === 'scripts' && typeof library !== 'undefined' && library.scripts) { var s = library.scripts.filter(function (x) { return x.id === library.activeId; })[0]; return s ? '# Script: ' + s.title + '\n\n' + s.text : '(no script open)'; }
      if (pg === 'writing' && typeof library !== 'undefined' && library.notes) { var n = library.notes.filter(function (x) { return x.id === library.activeId; })[0]; return n ? '# Draft (markup: ~~cut~~ ++add++ [[note for you]])\n\n' + n.text + (Object.keys(n.files || {}).length ? '\n\nimage files: ' + Object.keys(n.files).map(function (k) { return n.files[k]; }).join(', ') : '') : '(no note open)'; }
      if (pg === 'social') { var ti = document.querySelector('.detail-title'); var posts = Store.getJSON(Config.key('social', w.id), []) || []; var p = ti ? posts.filter(function (x) { return x.title === ti.value; })[0] : null; return p ? '# Post\n' + post(p) : '(no post selected)'; }
      if (pg === 'board') { var evs = global.Recent ? Recent.load().slice().reverse().filter(function (e) { return e.kind === 'task' && global.Model && e.key === Model.KEY; }) : []; var t = evs.length ? Model.getState().filter(function (x) { return x.id === evs[0].id; })[0] : null; if (!t) t = Model.getState().filter(function (x) { return x.col === 'doing'; })[0]; return t ? '# Task\n' + task(t, Model.board().title) : C.board.get(); }
      if (pg === 'inspo') return C.inspiration.get();
      return C.project.get();
    } },
    board: { label: 'This board', hint: 'every task on the open board', get: function () {
      var w = ws(); var b = global.Model ? Model.board() : Config.boards(w.id)[0]; if (!b) return '(no board)';
      var tasks = global.Model ? Model.getState() : (Store.getJSON(Config.boardKey(b.id, w.id), []) || []);
      var L = ['# Board: ' + b.title + ' (' + w.title + ')', ''];
      ['doing', 'todo', 'later', 'bucket', 'done'].forEach(function (col) { var g = tasks.filter(function (t) { return t.col === col; }); if (!g.length) return; L.push('## ' + col + ' (' + g.length + ')'); g.forEach(function (t) { L.push(task(t)); L.push(''); }); });
      return L.join('\n');
    } },
    doing: { label: 'Doing now', hint: 'everything in progress, all boards', get: function () {
      var d = allTasks().filter(function (x) { return x.t.col === 'doing'; }); if (!d.length) return '(nothing in Doing)';
      return '# In progress (' + d.length + ')\n\n' + d.map(function (x) { return task(x.t, x.b.title); }).join('\n\n');
    } },
    project: { label: 'This project', hint: 'full snapshot of the workspace', get: function () { return global.Guide ? Guide.snapshot() : ''; } },
    inspiration: { label: 'Inspiration inbox', hint: 'unused items with links and image files', get: function () {
      if (!global.InspoModel) return ''; if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; }
      var w = ws(); var items = InspoModel.list({ status: 'new' }).filter(function (x) { return !x.ws || x.ws === w.id; });
      return items.length ? InspoModel.forAI(items, 'next steps') : '(inbox is empty)';
    } },
    inspiration_new: { label: 'New inspiration', hint: 'saved since your last assessment', get: function () {
      if (!global.InspoModel) return ''; if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; }
      var items = InspoModel.listNew(ws().id); var since = InspoModel.reviewedAt();
      return items.length ? '# New inspiration since ' + (since ? Activity.ago(since) : 'the start') + ' (' + items.length + ')\n\n' + InspoModel.forAI(items, 'assessment').split('\n').slice(2).join('\n') : '(nothing new since ' + (since ? Activity.ago(since) : 'the start') + ')';
    } },
    shipped: { label: 'What I shipped', hint: 'tasks finished and posts published recently', get: function () {
      var evs = global.Recent ? Recent.load().slice().reverse().filter(function (e) { return /^(finished|post posted|new script|new note):/.test(e.what || '') && !e.gone; }) : [];
      var L = ['# What I finished recently (newest first)']; var seen = {};
      evs.forEach(function (e) { var k = e.kind + ':' + e.id; if (seen[k] || L.length > 8) return; seen[k] = 1; L.push('- ' + Activity.ago(e.ts) + ' · ' + e.what + '\n  now: ' + Recent.current(e)); });
      if (L.length === 1) { var d = allTasks().filter(function (x) { return x.t.col === 'done'; }).slice(0, 5); if (!d.length) return '(nothing finished yet — mark a task done first)'; L.push('(from the Done column)'); d.forEach(function (x) { L.push(task(x.t, x.b.title)); }); }
      return L.join('\n');
    } },
    schedule: { label: 'My schedule', hint: 'next 7 days: meetings, dated tasks, posts, overdue first', get: function () {
      var W = global.When; if (!W) return ''; var w = ws(); var now = new Date(); var items = [];
      allTasks().forEach(function (x) { var t = x.t; if (!t.at && !t.due) return; items.push({ kind: 'task', id: t.id, title: t.title, at: t.at || '', until: t.until || '', due: t.due || '', col: t.col, meeting: (t.tags || []).indexOf('meeting') >= 0, board: x.b.title, open: t.col !== 'done' }); });
      if (w.apps.social) (Store.getJSON(Config.key('social', w.id), []) || []).forEach(function (p) { if (p.datetime) items.push({ kind: 'post', id: p.id, title: p.title, at: String(p.datetime).slice(0, 16), until: '', due: '', status: p.status, open: p.status !== 'posted' }); });
      items.forEach(function (i) { i.when = i.at || i.due; i.state = W.state(i, now); }); items = items.filter(function (i) { return i.open; }); items.sort(function (a, b) { return a.when.localeCompare(b.when); });
      function line(i) { return '- ' + (i.state === 'overdue' ? 'OVERDUE · ' : '') + (i.at ? W.range(i.at, i.until) : 'due ' + i.due) + ' [' + i.id + '] ' + i.title + (i.meeting ? ' · meeting' : i.kind === 'post' ? ' · post (' + i.status + ')' : ' · ' + i.board); }
      var L = ['# My schedule · next 7 days (' + w.title + ')']; var over = items.filter(function (i) { return i.state === 'overdue'; }); if (over.length) { L.push('', '## Overdue'); over.forEach(function (i) { L.push(line(i)); }); }
      var d = new Date(now.getTime()); d.setHours(0, 0, 0, 0); var any = false;
      for (var k = 0; k < 7; k++) { var key = W.localD(d); var g = items.filter(function (i) { return W.dayKey(i.when) === key && i.state !== 'overdue'; }); if (g.length) { any = true; L.push('', '## ' + d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) + (k === 0 ? ' · today' : '')); g.forEach(function (i) { L.push(line(i)); }); } d.setDate(d.getDate() + 1); }
      if (!any && !over.length) L.push('', '(nothing with a date in the next 7 days)');
      return L.join('\n');
    } },
    posts: { label: 'Upcoming posts', hint: 'next 14 days with copy and prep', get: function () {
      var w = ws(); var end = new Date(Date.now() + 14 * 86400000); var posts = (Store.getJSON(Config.key('social', w.id), []) || []).filter(function (p) { return p.status !== 'posted' && new Date(p.datetime) <= end; }).sort(function (a, b) { return a.datetime.localeCompare(b.datetime); });
      return posts.length ? '# Upcoming posts (' + posts.length + ')\n\n' + posts.map(post).join('\n\n') : '(no posts in the next 14 days)';
    } }
  };
  global.Context = {
    names: Object.keys(C),
    get: function (name) { return C[name] ? C[name].get() : ''; },
    info: function (name) { return C[name]; },
    // replace every {{token}} in a prompt
    fill: function (text) { return String(text).replace(/\{\{(\w+)\}\}/g, function (m, k) { if (k === 'snapshot') k = 'project'; return C[k] ? C[k].get() : m; }); },
    // the Context menu, with what is most useful on this page first
    menu: function () { var pg = page(); var order = pg === 'board' ? ['this', 'last_task', 'board', 'recent', 'doing', 'project', 'posts', 'inspiration_new', 'inspiration'] : pg === 'social' ? ['this', 'posts', 'recent', 'doing', 'project', 'inspiration_new', 'inspiration', 'last_task', 'board'] : pg === 'scripts' || pg === 'writing' ? ['this', 'recent', 'inspiration_new', 'inspiration', 'project', 'last_task', 'doing', 'posts', 'board'] : pg === 'inspo' ? ['inspiration_new', 'inspiration', 'recent', 'project', 'doing', 'posts', 'last_task', 'this', 'board'] : ['recent', 'project', 'inspiration_new', 'doing', 'last_task', 'posts', 'inspiration', 'this', 'board']; order.splice(order.indexOf('recent') + 1, 0, 'shipped'); order.splice(pg === 'calendar' || pg === 'home' ? 0 : order.indexOf('shipped') + 1, 0, 'schedule'); return order.map(function (k) { return { id: k, label: C[k].label, hint: C[k].hint }; }); }
  };
})(window);
