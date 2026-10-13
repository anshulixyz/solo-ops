/* =========================================================================
   core/quick.js — the five-second actions, across every workspace, no agent:
   • top(n): what to do now, all projects: Doing first, then To Do by priority
   • find(q): tasks that match free text ("recording stack" → the task)
   • setCol / setPri / addLines: direct, logged, synced changes
   Writes go to the board's Store key; Sync writes the file when that board is
   registered on this page and marks it changed (Sync.touch) otherwise, so the
   file is written the next time it is opened. Needs Store, Config, Sync.
   ========================================================================= */
(function (global) {
  'use strict';
  var PRI = { high: 0, medium: 1, low: 2 };
  function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function rows() {
    var out = [];
    Config.workspaces().forEach(function (w) { Config.boards(w.id).forEach(function (b) { var key = Config.boardKey(b.id, w.id); (Store.getJSON(key, []) || []).forEach(function (t) { out.push({ ws: w.id, wsTitle: w.title, board: b.id, boardTitle: b.title, key: key, file: Config.boardFile(b.id, w.id), task: t }); }); }); });
    return out;
  }
  function top(n) {
    var r = rows().filter(function (x) { return x.task.col === 'doing' || x.task.col === 'todo'; });
    r.sort(function (a, b) { return ((a.task.col === 'doing' ? 0 : 1) - (b.task.col === 'doing' ? 0 : 1)) || ((PRI[a.task.pri] === undefined ? 1 : PRI[a.task.pri]) - (PRI[b.task.pri] === undefined ? 1 : PRI[b.task.pri])) || ((b.task.updatedAt || 0) - (a.task.updatedAt || 0)); });
    return r.slice(0, n || 10);
  }
  function find(q, n) {
    q = String(q || '').trim().toLowerCase(); var words = q.split(/\s+/).filter(function (w) { return w.length > 1; }); if (!words.length) return [];
    var scored = rows().filter(function (x) { return x.task.col !== 'done'; }).map(function (x) {
      var hay = (x.task.title + ' ' + (x.task.tags || []).join(' ') + ' ' + (x.task.proj || '')).toLowerCase();
      var s = words.filter(function (w) { return hay.indexOf(w) >= 0; }).length; if (!s) return null; if (hay.indexOf(q) >= 0) s += 2; if (x.task.col === 'doing') s -= 0.5;
      return { x: x, s: s, ratio: words.filter(function (w) { return hay.indexOf(w) >= 0; }).length / words.length };
    }).filter(Boolean);
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, n || 3).map(function (s) { s.x.score = s.s; s.x.ratio = s.ratio; return s.x; });
  }
  function refresh() { if (global.refreshBoard) refreshBoard(); if (global.refreshSchedule) refreshSchedule(); }
  // Writes the browser copy at once (instant UI), then, with a server or linked folder, re-applies the
  // change on the file itself: another project's board may not be in this browser at all, or may be
  // older than what the CLI or an agent wrote. The file is the copy that counts; `done` runs after it.
  function write(row, mutate, note, done) {
    var stamp = Date.now(); var list = Store.getJSON(row.key, null); var t = list ? list.filter(function (x) { return x.id === row.task.id; })[0] : null;
    if (t) { mutate(t); t.updatedAt = stamp; Store.setJSON(row.key, list); if (global.Sync) { Sync.touch(row.file); Sync.note(row.file, note); } }
    var m = global.Sync ? Sync.getMode() : 'manual'; var onFile = m === 'server' || m === 'folder';
    if (onFile) Sync.peek(row.file).then(function (parsed) {
      if (!parsed || !Array.isArray(parsed.tasks)) return;
      var ft = parsed.tasks.filter(function (x) { return x.id === row.task.id; })[0]; if (!ft) return false;
      mutate(ft); ft.updatedAt = stamp; Store.setJSON(row.key, parsed.tasks, { silent: true });   // the server log records this write; Recent changes would otherwise blame the user for what the CLI changed meanwhile
      Sync.touch(row.file); Sync.note(row.file, note);
      return Sync.writeFile(row.file, Object.assign({ version: 1 }, parsed, { tasks: parsed.tasks, updatedAt: new Date().toISOString() })).then(function () { return true; }, function () { return true; });
    }).then(function (changed) { refresh(); if (done) done(changed !== false && (changed || !!t)); });
    if (!t && !onFile) return false;
    if (global.Activity && Activity.bump) { try { Activity.bump('board'); } catch (e) { /* optional */ } }
    refresh(); if (t && !onFile && done) done(true); return true;
  }
  function setCol(row, col, done) { return write(row, function (t) { t.col = col; if (col === 'done') t.doneAt = Date.now(); }, (col === 'doing' ? 'started' : col === 'done' ? 'done' : col) + ': ' + row.task.title, done); }
  function setPri(row, pri, done) { return write(row, function (t) { t.pri = pri; }, 'priority ' + pri + ': ' + row.task.title, done); }
  // "- [ ] Fix the hero @launch #copy !high >later" → { title, proj, tags, pri, col }
  function parseLine(line) {
    var t = { tags: [] };
    var title = String(line || '').replace(/^\s*(?:[-*•]|\d+[.)])\s*(?:\[[ xX]\]\s*)?/, '')
      .replace(/(^|\s)@(\S+)/g, function (_, sp, p) { t.proj = p; return sp; })
      .replace(/(^|\s)#(\S+)/g, function (_, sp, tag) { t.tags.push(tag.toLowerCase()); return sp; })
      .replace(/(^|\s)!(high|medium|med|low|h|m|l)\b/gi, function (_, sp, p) { p = p.toLowerCase(); t.pri = p === 'med' || p === 'm' ? 'medium' : p === 'h' ? 'high' : p === 'l' ? 'low' : p; return sp; })
      .replace(/(^|\s)>(todo|doing|done|later|bucket)\b/gi, function (_, sp, c) { t.col = c.toLowerCase(); return sp; })
      .replace(/\s+/g, ' ').trim();
    if (global.When && When.extract) { var ex = When.extract(title); if (ex.at || ex.due) { title = ex.title; if (ex.at) t.at = ex.at; if (ex.until) t.until = ex.until; if (ex.due) t.due = ex.due; } }
    t.title = title; return t;
  }
  // lines → tasks in one board of the open workspace (default: its first board)
  function addLines(text, opts) {
    opts = opts || {}; var w = (opts.ws && Config.workspace(opts.ws)) || Config.ws(); var boards = Config.boards(w.id); var b = boards.filter(function (x) { return x.id === opts.board; })[0] || boards[0]; if (!b) return [];
    var key = Config.boardKey(b.id, w.id); var file = Config.boardFile(b.id, w.id); var list = Store.getJSON(key, []) || []; var made = [];
    var projects = (Config.get('projects') || []).map(function (p) { return typeof p === 'string' ? p : p.name; });
    String(text || '').split('\n').forEach(function (line) {
      var p = parseLine(line); if (!p.title) return;
      var t = { id: uid(), title: p.title, desc: '', proj: p.proj || opts.proj || projects[0] || 'general', col: p.col || opts.col || 'todo', pri: p.pri || opts.pri || 'medium', tags: p.tags, notes: '', collapsed: true, checklist: [], at: p.at, until: p.until, due: p.due, createdAt: Date.now(), updatedAt: Date.now() };
      list.unshift(t); made.push({ ws: w.id, wsTitle: w.title, board: b.id, boardTitle: b.title, key: key, file: file, task: t });
    });
    if (!made.length) return made;
    Store.setJSON(key, list);
    if (global.Sync) { Sync.touch(file); Sync.note(file, 'added ' + made.length + ' task' + (made.length === 1 ? '' : 's') + ': ' + made.map(function (m) { return m.task.title; }).join(', ').slice(0, 100)); }
    if (global.Activity && Activity.bump) { try { Activity.bump(b.id); } catch (e) { /* optional */ } }
    refresh(); return made;
  }
  // a task in Doing right now, created from free text (when nothing matches)
  function startNew(title) { var made = addLines(title, { col: 'doing' }); return made[0] || null; }
  function asList(list) { return list.map(function (x) { return '- [' + (x.task.col === 'doing' ? '>' : ' ') + '] ' + x.task.title + ' · ' + x.task.pri + ' · ' + x.wsTitle + (x.boardTitle ? ' / ' + x.boardTitle : '') + (x.task.col === 'doing' ? ' · doing' : ''); }).join('\n'); }
  global.Quick = { rows: rows, top: top, find: find, setCol: setCol, setPri: setPri, parseLine: parseLine, addLines: addLines, startNew: startNew, asList: asList, PRI: PRI };
})(window);
