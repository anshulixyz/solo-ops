#!/usr/bin/env node
/* =========================================================================
   marathon.js — zero-dependency CLI for Marathon.
   Reads and writes the same data/*.json files the pages use, so the board,
   the terminal and your agent always see one list.

     node marathon.js help
     node marathon.js today | week | review
     node marathon.js add "Write the launch post" --proj launch --pri high --tags content,video
     node marathon.js done t5 | start t5 | move t5 later | pri t5 high
     node marathon.js social next | social add "Launch day" --at 2026-10-20T09:00

   Output is Markdown by default; add --json for machine-readable output.
   ========================================================================= */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var DATA = path.join(ROOT, 'data');
var cfg = safeRequire(path.join(ROOT, 'marathon.config.js')) || {};
var T = safeRequire(path.join(ROOT, 'core', 'templates.js'));
var RESERVED = ['social', 'scripts', 'writing', 'settings', 'activity', 'boards'];
var APPS = Object.assign({ boards: true, social: true, scripts: true, writing: true }, cfg.apps || {});
function appOn(a) { return APPS[a] !== false; }
var COLS = ['todo', 'doing', 'done', 'later', 'bucket'];
var COL_LABEL = { todo: 'To Do', doing: 'Doing', done: 'Done', later: 'Later', bucket: 'Bucket List' };
var PRI = { high: 0, medium: 1, low: 2 };

function safeRequire(p) { try { return require(p); } catch (e) { return null; } }

/* ---- args ---------------------------------------------------------------- */
var argv = process.argv.slice(2);
var flags = {}, pos = [];
for (var i = 0; i < argv.length; i++) {
  var a = argv[i];
  if (a.indexOf('--') === 0) {
    var eq = a.indexOf('=');
    if (eq > -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && argv[i + 1].indexOf('--') !== 0) flags[a.slice(2)] = argv[++i];
    else flags[a.slice(2)] = true;
  } else pos.push(a);
}
var JSON_OUT = !!flags.json;
var cmd = pos.shift() || 'help';

/* ---- io ------------------------------------------------------------------ */
function fileOf(name) { return path.join(DATA, name + '.json'); }
function read(name) {
  try { return JSON.parse(fs.readFileSync(fileOf(name), 'utf8')); } catch (e) { return null; }
}
function write(name, body, opts) {
  body.version = 1; body.updatedAt = new Date().toISOString();
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(fileOf(name), JSON.stringify(body, null, 2) + '\n');
  if (!(opts && opts.noActivity) && name !== 'activity' && name !== 'boards' && name !== 'settings') logActivity(name);
  return body;
}
function logActivity(app) {
  var a = read('activity'); if (!a || !a.days) a = { days: {}, lastActive: '', lastByApp: {} };
  var d = new Date(); var key = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  a.days[key] = a.days[key] || {}; a.days[key][app] = (a.days[key][app] || 0) + 1;
  a.lastActive = d.toISOString(); a.lastByApp = a.lastByApp || {}; a.lastByApp[app] = a.lastActive;
  write('activity', a, { noActivity: true });
}
function activitySummary() {
  var a = read('activity'); if (!a || !a.days) a = { days: {}, lastActive: '' };
  var now = new Date(); var hours = a.lastActive ? (now - new Date(a.lastActive)) / 3600000 : Infinity;
  var limit = (cfg.activity && cfg.activity.reminderAfterHours) || 24;
  var streak = 0, d = new Date(now); d.setHours(0, 0, 0, 0);
  var k = function (x) { return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
  if (!a.days[k(d)]) d.setDate(d.getDate() - 1);
  while (a.days[k(d)] && Object.keys(a.days[k(d)]).length) { streak++; d.setDate(d.getDate() - 1); }
  return { lastActive: a.lastActive, hoursIdle: hours, idle: hours >= limit, limit: limit, streak: streak, activeDays: Object.keys(a.days).length };
}
function ago(iso) {
  if (!iso) return 'never'; var m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 48) return h + ' h ago'; return Math.round(h / 24) + ' days ago';
}
function activityLine() {
  var s = activitySummary();
  if (!s.lastActive) return '_No activity logged yet._';
  return (s.idle ? '⚠ **Idle for ' + Math.round(s.hoursIdle) + ' h**' : 'Last activity ' + ago(s.lastActive)) + ' · streak ' + s.streak + ' day' + (s.streak === 1 ? '' : 's') + ' · ' + s.activeDays + ' active days logged';
}
function slug(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32); }
function normBoard(b) { var id = slug(b.id || b.title); if (!id || RESERVED.indexOf(id) >= 0) return null; return { id: id, title: b.title || id, sprintLabel: b.sprintLabel || 'Progress', milestones: b.milestones || [], focus: b.focus || [], createdAt: b.createdAt || 0 }; }
function allBoards() {
  var seen = {}, out = []; var rt = read('boards'); var list = (cfg.boards || []).concat(rt && Array.isArray(rt.boards) ? rt.boards : []);
  if (cfg.runway && !cfg.boards) list.unshift({ id: 'runway', title: cfg.runway.title });
  list.map(normBoard).filter(Boolean).forEach(function (b) { if (!seen[b.id]) { seen[b.id] = 1; out.push(b); } });
  if (!out.length) out.push({ id: 'runway', title: 'Launch Runway', sprintLabel: 'Progress', milestones: [], focus: [] });
  return out;
}
var BOARDS = allBoards();
var BOARD_ID = (function () {
  var want = flags.board ? slug(flags.board) : null;
  if (!want) return BOARDS[0].id;
  var hit = BOARDS.filter(function (b) { return b.id === want || b.title.toLowerCase().indexOf(String(flags.board).toLowerCase()) >= 0; });
  if (hit.length !== 1) fail('Unknown board "' + flags.board + '". Boards: ' + BOARDS.map(function (b) { return b.id + ' (' + b.title + ')'; }).join(', '));
  return hit[0].id;
})();
function boardMeta(id) { return BOARDS.filter(function (b) { return b.id === (id || BOARD_ID); })[0]; }
function board(id) { var d = read(id || BOARD_ID); return d && Array.isArray(d.tasks) ? d : { projects: [], tasks: [] }; }
function saveBoard(b, id) { return write(id || BOARD_ID, b); }
function schedule() { var d = read('social'); return d && Array.isArray(d.posts) ? d : { posts: [] }; }
function scripts() { var d = read('scripts'); return d && Array.isArray(d.scripts) ? d : { activeId: '', scripts: [] }; }
function notes() { var d = read('writing'); return d && Array.isArray(d.notes) ? d : { activeId: '', notes: [] }; }

function out(md, obj) {
  if (JSON_OUT) process.stdout.write(JSON.stringify(obj === undefined ? { text: md } : obj, null, 2) + '\n');
  else process.stdout.write((Array.isArray(md) ? md.join('\n') : md) + '\n');
}
function fail(msg) { if (JSON_OUT) out('', { error: msg }); else process.stderr.write('✗ ' + msg + '\n'); process.exit(1); }
function hint(name) { return 'No data/' + name + '.json yet. Open the app once, or run: node marathon.js template ' + (RESERVED.indexOf(name) < 0 ? 'board --board ' + name : name); }

/* ---- helpers ------------------------------------------------------------- */
function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function localDT(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtDT(s) {
  var d = new Date(s); if (isNaN(d)) return s;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function parseWhen(v) {
  if (!v) return localDT(tomorrow9());
  var m = String(v).match(/^\+(\d+)d(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) { var d = new Date(); d.setDate(d.getDate() + parseInt(m[1], 10)); d.setHours(m[2] ? +m[2] : 9, m[3] ? +m[3] : 0, 0, 0); return localDT(d); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v + 'T09:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v.slice(0, 16);
  var d2 = new Date(v); if (!isNaN(d2)) return localDT(d2);
  fail('Could not read the date "' + v + '". Use 2026-10-20T09:00, 2026-10-20, or +3d 17:30.');
}
function tomorrow9() { var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }
function progress(items) { var n = (items || []).length, d = (items || []).filter(function (c) { return c.done; }).length; return n ? d + '/' + n : ''; }
function find(list, q, label) {
  q = String(q || '').trim();
  if (!q) fail('Which ' + label + '? Give an id or part of the title.');
  var exact = list.filter(function (x) { return x.id === q; });
  if (exact.length) return exact[0];
  var l = q.toLowerCase();
  var m = list.filter(function (x) { return (x.title || '').toLowerCase().indexOf(l) >= 0; });
  if (m.length === 1) return m[0];
  var ex = m.filter(function (x) { return (x.title || '').toLowerCase() === l; });
  if (ex.length === 1) return ex[0];
  if (!m.length) fail('No ' + label + ' matches "' + q + '".');
  fail(m.length + ' ' + label + 's match "' + q + '": ' + m.map(function (x) { return x.id + ' (' + x.title + ')'; }).join(', ') + '. Use the id.');
}
function taskLine(t) {
  var p = progress(t.checklist);
  return '- [' + t.id + ']' + (t._board ? ' (' + t._board + ')' : '') + ' ' + t.title + ' · ' + t.proj + ' · ' + t.pri + (t.tags && t.tags.length ? ' · #' + t.tags.join(' #') : '') + (p ? ' · ' + p + ' steps' : '');
}
function postLine(p) {
  var pr = progress(p.prep);
  return '- [' + p.id + '] ' + fmtDT(p.datetime) + ' · ' + p.title + ' · ' + p.project + ' · ' + p.postType + ' · ' + p.status + (pr ? ' · ' + pr + ' prep' : '');
}
function byPri(a, b) { return (PRI[a.pri] || 0) - (PRI[b.pri] || 0); }
function split(v) { return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
function stamp(ms) { return new Date(ms || 0).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
function titleOf(text) { var m = (text || '').match(/^#\s+(.+)/m); return m ? m[1].trim().slice(0, 60) : ((text || '').split('\n').find(function (l) { return l.trim(); }) || 'Untitled').slice(0, 56); }

/* ---- task commands ------------------------------------------------------- */
function cmdList() {
  var b = board(); if (!read(BOARD_ID)) fail(hint(BOARD_ID));
  var which = (pos[0] || 'board').toLowerCase();
  var cols = which === 'all' ? COLS : which === 'board' ? ['todo', 'doing', 'done'] : COLS.indexOf(which) >= 0 ? [which] : null;
  if (!cols) fail('Unknown list "' + which + '". Use board, all, todo, doing, done, later or bucket.');
  var tasks = b.tasks.filter(function (t) { return cols.indexOf(t.col) >= 0; })
    .filter(function (t) { return !flags.proj || t.proj === flags.proj; })
    .filter(function (t) { return !flags.tag || (t.tags || []).indexOf(flags.tag) >= 0; });
  var md = [];
  cols.forEach(function (c) {
    var g = tasks.filter(function (t) { return t.col === c; }).sort(byPri);
    if (!g.length && cols.length > 1) return;
    md.push('## ' + COL_LABEL[c] + ' (' + g.length + ')');
    md.push(g.length ? g.map(taskLine).join('\n') : '_empty_');
    md.push('');
  });
  out(md, tasks);
}
function cmdShow() {
  var b = board(); var t = find(b.tasks, pos.join(' '), 'task');
  var md = ['# ' + t.title, '', '- id: ' + t.id, '- status: ' + COL_LABEL[t.col], '- project: ' + t.proj, '- priority: ' + t.pri,
    '- tags: ' + ((t.tags || []).join(', ') || 'none'), ''];
  if (t.desc) md.push(t.desc, '');
  if (t.checklist && t.checklist.length) { md.push('## Steps'); t.checklist.forEach(function (c, i) { md.push('- [' + (c.done ? 'x' : ' ') + '] ' + (i + 1) + '. ' + c.text); }); md.push(''); }
  if (t.notes) md.push('## Notes', '', t.notes, '');
  out(md, t);
}
function cmdAdd() {
  var title = pos.join(' ').trim() || flags.title;
  if (!title) fail('Usage: add "Task title" [--proj X] [--pri high|medium|low] [--tags a,b] [--col todo|doing|later|bucket] [--desc "..."] [--steps "a|b|c"]');
  var b = board();
  var projects = ((cfg.projects || []).map(function (p) { return typeof p === 'string' ? p : p.name; })).concat(b.projects || []);
  var t = {
    id: newId('t'), title: title, desc: flags.desc || '', proj: flags.proj || projects[0] || 'general',
    col: COLS.indexOf(flags.col) >= 0 ? flags.col : 'todo', pri: PRI.hasOwnProperty(flags.pri) ? flags.pri : 'medium',
    tags: split(flags.tags).map(function (s) { return s.toLowerCase(); }), notes: flags.notes || '', collapsed: true,
    checklist: String(flags.steps || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { text: s, done: false }; })
  };
  if (projects.indexOf(t.proj) < 0) { b.projects = (b.projects || []).concat([t.proj]); }
  b.tasks.unshift(t); saveBoard(b);
  out('✓ Added [' + t.id + '] ' + t.title + ' → ' + COL_LABEL[t.col] + ' · ' + t.proj + ' · ' + t.pri, t);
}
function moveCmd(col, verb) {
  return function () {
    var b = board(); var t = find(b.tasks, pos.join(' '), 'task');
    t.col = col; saveBoard(b);
    out('✓ ' + verb + ': [' + t.id + '] ' + t.title + ' → ' + COL_LABEL[col], t);
  };
}
function cmdMove() {
  var col = (pos[pos.length - 1] || '').toLowerCase();
  if (COLS.indexOf(col) < 0) fail('Usage: move <task> <todo|doing|done|later|bucket>');
  pos.pop(); moveCmd(col, 'Moved')();
}
function cmdPri() {
  var p = (pos[pos.length - 1] || '').toLowerCase(); if (p === 'med') p = 'medium';
  if (!PRI.hasOwnProperty(p)) fail('Usage: pri <task> <high|medium|low>');
  pos.pop(); var b = board(); var t = find(b.tasks, pos.join(' '), 'task'); t.pri = p; saveBoard(b);
  out('✓ [' + t.id + '] ' + t.title + ' → ' + p, t);
}
function cmdTag() {
  var ops = pos.filter(function (x) { return /^[+-]/.test(x); }); var q = pos.filter(function (x) { return !/^[+-]/.test(x); }).join(' ');
  if (!ops.length) fail('Usage: tag <task> +video -coding');
  var b = board(); var t = find(b.tasks, q, 'task'); t.tags = t.tags || [];
  ops.forEach(function (o) { var tag = o.slice(1).toLowerCase(); if (o[0] === '+' && t.tags.indexOf(tag) < 0) t.tags.push(tag); if (o[0] === '-') t.tags = t.tags.filter(function (x) { return x !== tag; }); });
  saveBoard(b); out('✓ [' + t.id + '] tags: ' + (t.tags.join(', ') || 'none'), t);
}
function cmdStep() {
  var text = flags.text || pos.slice(1).join(' '); var q = flags.text ? pos.join(' ') : pos[0];
  if (!q || !text) fail('Usage: step <task> "Step text"   (or step <task> --text "...")');
  var b = board(); var t = find(b.tasks, q, 'task'); t.checklist = t.checklist || []; t.checklist.push({ text: text, done: false }); saveBoard(b);
  out('✓ [' + t.id + '] step ' + t.checklist.length + ': ' + text, t);
}
function checkCmd(done) {
  return function () {
    var n = parseInt(pos[pos.length - 1], 10); if (!n) fail('Usage: ' + (done ? 'check' : 'uncheck') + ' <task> <step number>');
    pos.pop(); var b = board(); var t = find(b.tasks, pos.join(' '), 'task');
    if (!t.checklist || !t.checklist[n - 1]) fail('[' + t.id + '] has no step ' + n + '.');
    t.checklist[n - 1].done = done; saveBoard(b);
    out('✓ [' + t.id + '] ' + (done ? '☑' : '☐') + ' ' + t.checklist[n - 1].text + ' (' + progress(t.checklist) + ')', t);
  };
}
function cmdNote() {
  var text = flags.text || pos.slice(1).join(' '); var q = flags.text ? pos.join(' ') : pos[0];
  if (!q) fail('Usage: note <task> "text to append"   (or --text)');
  var b = board(); var t = find(b.tasks, q, 'task');
  if (!text) return out(t.notes || '_no notes_', { id: t.id, notes: t.notes });
  t.notes = (t.notes ? t.notes + '\n' : '') + text; saveBoard(b); out('✓ [' + t.id + '] note added', t);
}
function cmdRm() {
  var b = board(); var t = find(b.tasks, pos.join(' '), 'task');
  b.tasks = b.tasks.filter(function (x) { return x.id !== t.id; }); saveBoard(b); out('✓ Deleted [' + t.id + '] ' + t.title, t);
}
function cmdEdit() {
  var b = board(); var t = find(b.tasks, pos.join(' '), 'task');
  ['title', 'desc', 'proj', 'notes'].forEach(function (k) { if (flags[k] !== undefined) t[k] = String(flags[k]); });
  if (flags.pri && PRI.hasOwnProperty(flags.pri)) t.pri = flags.pri;
  if (flags.col && COLS.indexOf(flags.col) >= 0) t.col = flags.col;
  if (flags.tags !== undefined) t.tags = split(flags.tags);
  saveBoard(b); out('✓ Updated [' + t.id + '] ' + t.title, t);
}

/* ---- overviews ----------------------------------------------------------- */
// tasks from every board (or just --board), each tagged with its board id when >1
function allTasks() {
  var ids = flags.board ? [BOARD_ID] : BOARDS.map(function (b) { return b.id; });
  var out = [];
  ids.forEach(function (id) { board(id).tasks.forEach(function (t) { out.push(ids.length > 1 ? Object.assign({ _board: id }, t) : t); }); });
  return out;
}
function cmdToday() {
  var tasks = appOn('boards') ? allTasks() : [], s = appOn('social') ? schedule() : { posts: [] };
  var now = new Date(); var end = new Date(now); end.setHours(23, 59, 59, 999);
  var doing = tasks.filter(function (t) { return t.col === 'doing'; }).sort(byPri);
  var high = tasks.filter(function (t) { return t.col === 'todo' && t.pri === 'high'; }).sort(byPri);
  var posts = s.posts.filter(function (p) { return p.status !== 'posted'; }).sort(function (a, c) { return a.datetime.localeCompare(c.datetime); });
  var due = posts.filter(function (p) { return new Date(p.datetime) <= end; });
  var md = ['# Today · ' + now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), '', activityLine(), ''];
  if (appOn('boards')) {
    md.push('## Doing (' + doing.length + ')', doing.length ? doing.map(taskLine).join('\n') : '_nothing in progress — start one: node marathon.js start <task>_', '');
    md.push('## High priority, not started (' + high.length + ')', high.length ? high.map(taskLine).join('\n') : '_none_', '');
  }
  if (appOn('social')) md.push('## Posts due today or overdue (' + due.length + ')', due.length ? due.map(postLine).join('\n') : '_none_' + (posts[0] ? ' — next: ' + fmtDT(posts[0].datetime) + ' · ' + posts[0].title : ''), '');
  out(md, { activity: activitySummary(), doing: doing, high: high, due: due, next: posts[0] || null });
}
function cmdWeek() {
  var days = parseInt(flags.days || pos[0], 10) || 7;
  var tasks = appOn('boards') ? allTasks() : [], s = appOn('social') ? schedule() : { posts: [] }, sc = appOn('scripts') ? scripts() : { scripts: [] }, n = appOn('writing') ? notes() : { notes: [] };
  var now = new Date(); var end = new Date(now.getTime() + days * 86400000);
  var doing = tasks.filter(function (t) { return t.col === 'doing'; }).sort(byPri);
  var todo = tasks.filter(function (t) { return t.col === 'todo'; }).sort(byPri);
  var done = tasks.filter(function (t) { return t.col === 'done'; });
  var posts = s.posts.filter(function (p) { return p.status !== 'posted' && new Date(p.datetime) <= end; }).sort(function (a, c) { return a.datetime.localeCompare(c.datetime); });
  var overdue = posts.filter(function (p) { return new Date(p.datetime) < now; });
  var prepOpen = posts.reduce(function (acc, p) { return acc + (p.prep || []).filter(function (x) { return !x.done; }).length; }, 0);
  var md = ['# Next ' + days + ' days · ' + now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' → ' + end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), '', activityLine(), ''];
  if (appOn('boards')) {
    var boardsLine = (flags.board ? [boardMeta()] : BOARDS).map(function (bm) {
      var bt = board(bm.id).tasks; var dn = bt.filter(function (t) { return t.col === 'done'; }).length; var tot = bt.filter(function (t) { return ['todo', 'doing', 'done'].indexOf(t.col) >= 0; }).length;
      return '**' + bm.title + ':** ' + dn + '/' + tot + ' done (' + (tot ? Math.round(dn / tot * 100) : 0) + '%)' + (bt.some(function (t) { return t.col === 'later'; }) ? ' · ' + bt.filter(function (t) { return t.col === 'later'; }).length + ' in Later' : '');
    });
    md.push(boardsLine.join('  \n'), '');
    md.push('## Doing (' + doing.length + ')', doing.length ? doing.map(taskLine).join('\n') : '_nothing in progress_', '');
    md.push('## To Do by priority (' + todo.length + ')', todo.length ? todo.map(taskLine).join('\n') : '_empty_', '');
  }
  if (appOn('social')) md.push('## Posts scheduled (' + posts.length + (overdue.length ? ', ' + overdue.length + ' overdue' : '') + ' · ' + prepOpen + ' prep items open)', posts.length ? posts.map(postLine).join('\n') : '_no posts in this window_', '');
  if (appOn('scripts') || appOn('writing')) {
    md.push('## Studio');
    if (appOn('scripts')) md.push('- ' + sc.scripts.length + ' script' + (sc.scripts.length === 1 ? '' : 's') + (sc.scripts[0] ? ' · latest: ' + latestOf(sc.scripts).title + ' (' + stamp(latestOf(sc.scripts).updatedAt) + ')' : ''));
    if (appOn('writing')) md.push('- ' + n.notes.length + ' note' + (n.notes.length === 1 ? '' : 's') + (n.notes[0] ? ' · latest: ' + titleOf(latestOf(n.notes).text) + ' (' + stamp(latestOf(n.notes).updatedAt) + ')' : ''));
    md.push('');
  }
  out(md, { window: { from: now.toISOString(), days: days }, activity: activitySummary(), boards: BOARDS.map(function (b) { return b.id; }), doing: doing, todo: todo, done: done.length, posts: posts, overdue: overdue, prepOpen: prepOpen, scripts: sc.scripts.length, notes: n.notes.length });
}
function latestOf(arr) { return arr.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })[0]; }

/* ---- share / import ------------------------------------------------------ */
function cmdShare() {
  var b = board(); var which = (pos[0] || 'todo').toLowerCase();
  var cols = which === 'all' ? COLS : which === 'board' ? ['todo', 'doing', 'done'] : [which];
  if (cols.some(function (c) { return COLS.indexOf(c) < 0; })) fail('Usage: share [todo|doing|done|later|bucket|board|all]');
  var md = ['# ' + boardMeta().title + ' — ' + cols.map(function (c) { return COL_LABEL[c]; }).join(', '), ''];
  cols.forEach(function (c) {
    var g = b.tasks.filter(function (t) { return t.col === c; }).sort(byPri);
    if (!g.length) return;
    if (cols.length > 1) md.push('## ' + COL_LABEL[c], '');
    g.forEach(function (t) {
      md.push('- [' + (c === 'done' ? 'x' : ' ') + '] ' + t.title + (t.pri === 'high' ? ' (high)' : '') + (t.proj ? ' · ' + t.proj : ''));
      (t.checklist || []).forEach(function (s) { md.push('  - [' + (s.done ? 'x' : ' ') + '] ' + s.text); });
    });
    md.push('');
  });
  out(md, b.tasks.filter(function (t) { return cols.indexOf(t.col) >= 0; }));
}
// import a markdown checklist: top-level "- [ ] Title" lines become tasks,
// indented "  - [ ] step" lines become checklist steps of the task above.
function cmdImport() {
  var file = pos[0]; if (!file) fail('Usage: import <list.md> [--col todo] [--proj X] [--pri medium]');
  var text; try { text = fs.readFileSync(path.resolve(file), 'utf8'); } catch (e) { fail('Cannot read ' + file); }
  var b = board(); var col = COLS.indexOf(flags.col) >= 0 ? flags.col : 'todo'; var added = [];
  text.split('\n').forEach(function (line) {
    var m = line.match(/^(\s*)[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/); if (!m) return;
    var indent = m[1].length, done = (m[2] || '').toLowerCase() === 'x', title = m[3].trim();
    if (indent === 0) {
      var pri = /\(high\)/i.test(title) ? 'high' : /\(low\)/i.test(title) ? 'low' : (PRI.hasOwnProperty(flags.pri) ? flags.pri : 'medium');
      title = title.replace(/\s*\((high|low|medium)\)/i, '').replace(/\s*·\s*\S+$/, '');
      var t = { id: newId('t'), title: title, desc: '', proj: flags.proj || (b.projects && b.projects[0]) || ((cfg.projects || [])[0] || {}).name || 'general', col: done ? 'done' : col, pri: pri, tags: split(flags.tags), notes: '', collapsed: true, checklist: [] };
      b.tasks.unshift(t); added.push(t);
    } else if (added.length) added[added.length - 1].checklist.push({ text: title, done: done });
  });
  if (!added.length) fail('No "- [ ] item" lines found in ' + file);
  saveBoard(b); out('✓ Imported ' + added.length + ' task' + (added.length === 1 ? '' : 's') + ' into ' + COL_LABEL[col] + ':\n' + added.map(taskLine).join('\n'), added);
}

/* ---- social -------------------------------------------------------------- */
function cmdSocial() {
  var sub = (pos.shift() || 'list').toLowerCase(); var s = schedule();
  if (!read('social') && ['list', 'next', 'week', 'show'].indexOf(sub) >= 0) fail(hint('social'));
  var sorted = s.posts.slice().sort(function (a, b) { return a.datetime.localeCompare(b.datetime); });
  var un = sorted.filter(function (p) { return p.status !== 'posted'; });
  if (sub === 'list') return out(['## Posts (' + sorted.length + ')'].concat(sorted.map(postLine)), sorted);
  if (sub === 'next') return un[0] ? out(postLine(un[0]) + (un[0].copy ? '\n\n' + un[0].copy : ''), un[0]) : out('_everything is posted_', null);
  if (sub === 'week') { var end = new Date(Date.now() + (parseInt(flags.days, 10) || 7) * 86400000); var w = un.filter(function (p) { return new Date(p.datetime) <= end; }); return out(['## Posts in the next ' + (parseInt(flags.days, 10) || 7) + ' days (' + w.length + ')'].concat(w.length ? w.map(postLine) : ['_none_']), w); }
  if (sub === 'show') { var p = find(s.posts, pos.join(' '), 'post'); var md = ['# ' + p.title, '', '- id: ' + p.id, '- when: ' + fmtDT(p.datetime), '- type: ' + p.postType + ' · ' + p.format + ' · ' + p.project, '- status: ' + p.status, '', '## Copy', '', p.copy || '_empty_', '']; if (p.prep && p.prep.length) { md.push('## Prep'); p.prep.forEach(function (x, i) { md.push('- [' + (x.done ? 'x' : ' ') + '] ' + (i + 1) + '. ' + x.text + ' (' + x.kind + ')'); }); md.push(''); } if (p.notes) md.push('## Notes', '', p.notes); return out(md, p); }
  if (sub === 'add') {
    var title = pos.join(' ').trim() || flags.title; if (!title) fail('Usage: social add "Title" [--at 2026-10-20T09:00 | +3d 17:30] [--type launch] [--project X] [--format text|video|text+video] [--copy "..."] [--prep "a|b"]');
    var types = (cfg.social && cfg.social.postTypes) || ['announcement', 'launch', 'update', 'thread', 'teaser'];
    var np = { id: newId('p'), datetime: parseWhen(flags.at), title: title, postType: types.indexOf(flags.type) >= 0 ? flags.type : 'update', format: ['text', 'video', 'text+video'].indexOf(flags.format) >= 0 ? flags.format : 'text',
      project: flags.project || flags.proj || ((cfg.projects || [])[0] || {}).name || 'general', copy: flags.copy || '', video: { title: '', status: 'none', notes: '', link: '' }, links: [], assets: [],
      prep: String(flags.prep || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return { text: x, done: false, kind: 'content' }; }),
      notes: flags.notes || '', status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } };
    s.posts.push(np); write('social', s); return out('✓ Scheduled [' + np.id + '] ' + np.title + ' · ' + fmtDT(np.datetime), np);
  }
  if (sub === 'posted' || sub === 'ready' || sub === 'draft') {
    var pp = find(s.posts, pos.join(' '), 'post'); pp.status = sub;
    if (sub === 'posted') { pp.posted = pp.posted || {}; pp.posted.postedAt = pp.posted.postedAt || localDT(new Date()); if (flags.url) pp.posted.url = flags.url; }
    write('social', s); return out('✓ [' + pp.id + '] ' + pp.title + ' → ' + sub, pp);
  }
  if (sub === 'move') { var pm = find(s.posts, pos.slice(0, -1).join(' '), 'post'); pm.datetime = parseWhen(pos[pos.length - 1]); write('social', s); return out('✓ [' + pm.id + '] ' + pm.title + ' → ' + fmtDT(pm.datetime), pm); }
  if (sub === 'prep') { var text = flags.text || pos.slice(1).join(' '); var pq = find(s.posts, flags.text ? pos.join(' ') : pos[0], 'post'); if (!text) fail('Usage: social prep <post> "prep item"'); pq.prep = pq.prep || []; pq.prep.push({ text: text, done: false, kind: flags.kind || 'content' }); write('social', s); return out('✓ [' + pq.id + '] prep ' + pq.prep.length + ': ' + text, pq); }
  if (sub === 'check') { var n = parseInt(pos[pos.length - 1], 10); var pc = find(s.posts, pos.slice(0, -1).join(' '), 'post'); if (!pc.prep || !pc.prep[n - 1]) fail('No prep item ' + n); pc.prep[n - 1].done = !pc.prep[n - 1].done; write('social', s); return out('✓ [' + pc.id + '] ' + (pc.prep[n - 1].done ? '☑' : '☐') + ' ' + pc.prep[n - 1].text, pc); }
  if (sub === 'copy') { var text2 = flags.text || pos.slice(1).join(' '); var pcp = find(s.posts, flags.text ? pos.join(' ') : pos[0], 'post'); if (!text2) return out(pcp.copy || '_empty_', { id: pcp.id, copy: pcp.copy }); pcp.copy = text2; write('social', s); return out('✓ [' + pcp.id + '] copy updated (' + text2.length + ' chars)', pcp); }
  if (sub === 'rm') { var pr = find(s.posts, pos.join(' '), 'post'); s.posts = s.posts.filter(function (x) { return x.id !== pr.id; }); write('social', s); return out('✓ Deleted [' + pr.id + '] ' + pr.title, pr); }
  fail('Unknown social command "' + sub + '". Try: list, next, week, show, add, posted, ready, move, prep, check, copy, rm');
}

/* ---- studio -------------------------------------------------------------- */
function libCmd(name, key, label, mk) {
  return function () {
    var sub = (pos.shift() || 'list').toLowerCase(); var d = name === 'scripts' ? scripts() : notes(); var list = d[key];
    if (!read(name) && sub !== 'add') fail(hint(name));
    var items = list.map(function (x) { return { id: x.id, title: x.title || titleOf(x.text), updatedAt: x.updatedAt, text: x.text }; });
    if (sub === 'list') return out(['## ' + label + 's (' + items.length + ')'].concat(items.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).map(function (x) { return '- [' + x.id + '] ' + x.title + ' · ' + stamp(x.updatedAt); })), items.map(function (x) { return { id: x.id, title: x.title, updatedAt: x.updatedAt }; }));
    if (sub === 'show') { var it = find(items, pos.join(' '), label); return out(it.text, it); }
    if (sub === 'add') {
      var title = pos.join(' ').trim() || flags.title; var text = flags.file ? fs.readFileSync(path.resolve(flags.file), 'utf8') : (flags.text || (title ? '# ' + title + '\n\n' : ''));
      if (!text.trim()) fail('Usage: ' + name + ' add "Title"   or   ' + name + ' add --file draft.md');
      var item = mk(text); list.unshift(item); d.activeId = item.id; write(name, d); return out('✓ Added [' + item.id + '] ' + (item.title || titleOf(item.text)), item);
    }
    if (sub === 'rm') { var r = find(items, pos.join(' '), label); d[key] = list.filter(function (x) { return x.id !== r.id; }); if (d.activeId === r.id) d.activeId = d[key][0] ? d[key][0].id : ''; write(name, d); return out('✓ Deleted [' + r.id + '] ' + r.title, r); }
    fail('Unknown ' + name + ' command "' + sub + '". Try: list, show, add, rm');
  };
}
var cmdScripts = libCmd('scripts', 'scripts', 'script', function (text) { return { id: newId('s'), title: titleOf(text), text: text, createdAt: Date.now(), updatedAt: Date.now() }; });
var cmdNotes = libCmd('writing', 'notes', 'note', function (text) { return { id: newId('n'), text: text, images: {}, createdAt: Date.now(), updatedAt: Date.now() }; });

/* ---- boards -------------------------------------------------------------- */
function cmdBoards() {
  var sub = (pos.shift() || 'list').toLowerCase();
  var rt = read('boards') || { boards: [] }; rt.boards = Array.isArray(rt.boards) ? rt.boards : [];
  if (sub === 'list') return out(['## Boards (' + BOARDS.length + ')'].concat(BOARDS.map(function (b) {
    var bt = board(b.id).tasks; var dn = bt.filter(function (t) { return t.col === 'done'; }).length; var tot = bt.filter(function (t) { return ['todo', 'doing', 'done'].indexOf(t.col) >= 0; }).length;
    return '- [' + b.id + '] ' + b.title + ' · ' + dn + '/' + tot + ' done · ' + bt.length + ' tasks' + (b.id === BOARD_ID ? ' (default)' : '') + (fs.existsSync(fileOf(b.id)) ? '' : ' · no data file yet');
  })), BOARDS);
  if (sub === 'add') {
    var title = pos.join(' ').trim() || flags.title; if (!title) fail('Usage: boards add "Title" [--from blank|sample|<board id>]');
    var id = slug(title); if (!id || RESERVED.indexOf(id) >= 0) fail('Pick a different name.');
    if (BOARDS.some(function (b) { return b.id === id; })) fail('Board "' + id + '" already exists.');
    if (fs.existsSync(fileOf(id)) && !flags.force) fail('data/' + id + '.json already exists. Re-run with --force to replace it, or pick another name.');
    var from = (flags.from || 'blank').toLowerCase(); var tasks = [];
    if (from === 'sample') { if (!T) fail('core/templates.js missing'); tasks = T.runway().tasks; }
    else if (from !== 'blank') { var src = BOARDS.filter(function (b) { return b.id === slug(from); })[0]; if (!src) fail('No board "' + from + '" to copy.'); tasks = board(src.id).tasks.map(function (t) { return Object.assign({}, t, { id: newId('t') }); }); }
    rt.boards.push({ id: id, title: title, sprintLabel: 'Progress', milestones: [], focus: [], createdAt: Date.now() });
    write('boards', rt); write(id, { projects: [], tasks: tasks });
    return out('✓ Board [' + id + '] ' + title + ' created with ' + tasks.length + ' task' + (tasks.length === 1 ? '' : 's') + ' → data/' + id + '.json\n  use it: node marathon.js week --board ' + id + '   ·   open: runway/marathon-board.html?board=' + id, { id: id, title: title, tasks: tasks.length });
  }
  if (sub === 'rename') {
    var bid = slug(pos.shift()); var nt = pos.join(' ').trim(); if (!bid || !nt) fail('Usage: boards rename <id> "New title"');
    var meta = BOARDS.filter(function (b) { return b.id === bid; })[0]; if (!meta) fail('No board "' + bid + '".');
    var hit = false; rt.boards = rt.boards.map(function (b) { if (slug(b.id || b.title) === bid) { hit = true; b.title = nt; } return b; });
    if (!hit) rt.boards.push(Object.assign({}, meta, { title: nt }));
    write('boards', rt); return out('✓ [' + bid + '] → ' + nt + (cfg.boards && cfg.boards.some(function (b) { return slug(b.id || b.title) === bid; }) ? '  (overrides the title in marathon.config.js)' : ''), { id: bid, title: nt });
  }
  if (sub === 'rm') {
    var rid = slug(pos.shift()); if (!rid) fail('Usage: boards rm <id>');
    if (BOARDS.length < 2) fail('Keep at least one board.');
    if (!flags.force) fail('This deletes data/' + rid + '.json. Re-run with --force.');
    rt.boards = rt.boards.filter(function (b) { return slug(b.id || b.title) !== rid; }); write('boards', rt);
    try { fs.unlinkSync(fileOf(rid)); } catch (e) { /* none */ }
    return out('✓ Board [' + rid + '] removed' + (cfg.boards && cfg.boards.some(function (b) { return slug(b.id || b.title) === rid; }) ? ' (it is still listed in marathon.config.js — remove it there too)' : ''), { id: rid });
  }
  fail('Unknown boards command "' + sub + '". Try: list, add, rename, rm');
}
function cmdActivity() {
  var s = activitySummary(); var a = read('activity') || { days: {} };
  var days = Object.keys(a.days || {}).sort().slice(-14);
  out(['# Activity', '', activityLine(), ''].concat(days.length ? days.map(function (d) { return '- ' + d + ': ' + Object.keys(a.days[d]).map(function (k) { return k + ' ×' + a.days[d][k]; }).join(', '); }) : ['_nothing logged yet_']), s);
}

/* ---- template / theme / config / serve ----------------------------------- */
function cmdTemplate() {
  if (!T) fail('core/templates.js not found.');
  var which = (pos[0] || 'all').toLowerCase(); var all = ['board', 'social', 'scripts', 'writing', 'settings'];
  if (which === 'runway') which = 'board';
  var targets = which === 'all' ? all : [which]; if (targets.some(function (t) { return all.indexOf(t) < 0; })) fail('Usage: template [board|social|scripts|writing|settings|all] [--board id] [--force]');
  var done = [];
  targets.forEach(function (t) {
    var name = t === 'board' ? BOARD_ID : t;
    if (fs.existsSync(fileOf(name)) && !flags.force) { done.push('- data/' + name + '.json exists — skipped (use --force to overwrite)'); return; }
    var body = t === 'board' ? T.runway() : t === 'social' ? T.social(new Date()) : t === 'scripts' ? T.scripts(new Date()) : t === 'writing' ? T.writing(new Date()) : T.settings();
    write(name, body, { noActivity: true }); done.push('- wrote data/' + name + '.json (sample content)');
  });
  out(done, { written: targets });
}
function cmdTheme() {
  var sub = (pos.shift() || 'show').toLowerCase(); var s = read('settings') || { theme: (cfg.theme || { mode: 'auto', palette: 'warm' }) };
  var palettes = ['warm', 'paper', 'forest', 'dusk', 'mono'], modes = ['auto', 'light', 'dark'];
  if (sub === 'show') return out('theme: mode ' + s.theme.mode + ' · palette ' + s.theme.palette + '\npalettes: ' + palettes.join(', ') + '\nmodes: ' + modes.join(', '), s.theme);
  if (sub === 'list') return out(palettes.map(function (p) { return '- ' + p + (p === s.theme.palette ? ' (current)' : ''); }), palettes);
  if (sub === 'set') { var p = (pos[0] || '').toLowerCase(); if (palettes.indexOf(p) < 0) fail('Unknown palette. Pick one of: ' + palettes.join(', ')); s.theme.palette = p; write('settings', s); return out('✓ palette → ' + p + ' (open pages switch within a few seconds)', s.theme); }
  if (sub === 'mode') { var m = (pos[0] || '').toLowerCase(); if (modes.indexOf(m) < 0) fail('Mode must be auto, light or dark'); s.theme.mode = m; write('settings', s); return out('✓ mode → ' + m, s.theme); }
  fail('Usage: theme [show|list|set <palette>|mode <auto|light|dark>]');
}
function cmdConfig() {
  var projects = (cfg.projects || []).map(function (p) { return typeof p === 'string' ? p : p.name; });
  out(['# ' + (cfg.name || 'Marathon') + ' config', '', '- apps: ' + Object.keys(APPS).map(function (k) { return k + (APPS[k] === false ? ' (off)' : ''); }).join(', '),
    '- boards: ' + BOARDS.map(function (b) { return b.id + ' (' + b.title + ')'; }).join(', ') + '  — default for CLI: ' + BOARD_ID,
    '- projects: ' + projects.join(', '), '- task tags: ' + ((cfg.board && cfg.board.tags) || (cfg.runway && cfg.runway.tags) || []).join(', '),
    '- post types: ' + ((cfg.social && cfg.social.postTypes) || []).join(', '), '- idle reminder after: ' + ((cfg.activity && cfg.activity.reminderAfterHours) || 24) + ' h', '- theme default: ' + JSON.stringify(cfg.theme || {}), '- data dir: ' + DATA,
    '- files: ' + BOARDS.map(function (b) { return b.id; }).concat(['social', 'scripts', 'writing', 'settings', 'activity']).map(function (f) { return f + '.json' + (fs.existsSync(fileOf(f)) ? ' ✓' : ' (missing)'); }).join(' · '), '', 'Edit marathon.config.js to change any of this.'], cfg);
}
function cmdServe() { require('child_process').spawn(process.execPath, [path.join(ROOT, 'serve.js')].concat(flags.port ? ['--port', String(flags.port)] : []), { stdio: 'inherit' }); }
function cmdHelp() {
  out(['# marathon.js — tasks, posts, scripts and notes from the terminal', '',
    'Overviews', '  today                      what is in play now + idle reminder', '  week [--days 7]            tasks by priority + posts + studio for the window', '  review                     same as week', '  activity                   streak + last 14 days', '',
    'Boards (data/<id>.json — every task command takes --board <id>; default: first board)', '  boards list', '  boards add "Title" [--from blank|sample|<id>]   boards rename <id> "Title"   boards rm <id> --force', '',
    'Tasks', '  list [board|all|todo|doing|done|later|bucket] [--proj X] [--tag Y]', '  show <task>                 full task (id or title fragment)',
    '  add "Title" [--proj X] [--pri high] [--tags a,b] [--col later] [--desc "…"] [--steps "a|b"]', '  start|done|later|bucket|todo <task>', '  move <task> <column>        pri <task> <high|medium|low>', '  tag <task> +a -b            step <task> "text"   check|uncheck <task> <n>', '  note <task> ["text"]        edit <task> --title … --proj … --pri …', '  rm <task>', '',
    'Share', '  share [todo|board|all]      markdown checklist (paste anywhere)', '  import <list.md> [--col]    "- [ ] item" lines become tasks, indented lines become steps', '',
    'Posts (data/social.json)', '  social list|next|week|show <post>', '  social add "Title" [--at 2026-10-20T09:00 | +3d 17:30] [--type launch] [--project X] [--copy "…"] [--prep "a|b"]', '  social posted|ready|draft <post> [--url …]   social move <post> <when>', '  social prep <post> "item"   social check <post> <n>   social copy <post> ["text"]   social rm <post>', '',
    'Studio (data/scripts.json, data/writing.json)', '  scripts list|show <s>|add "Title" [--file x.md]|rm <s>', '  notes list|show <n>|add "Title" [--file x.md]|rm <n>', '',
    'Setup', '  template [all|board|social|scripts|writing|settings] [--board id] [--force]', '  theme [show|list|set <warm|paper|forest|dusk|mono>|mode <auto|light|dark>]', '  config                     show marathon.config.js summary', '  serve [--port 4321]        start the local server (pages write data/ directly)', '',
    'Add --json to any command for machine-readable output. Ids: tasks t…, posts p…, scripts s…, notes n….'], null);
}

/* ---- dispatch ------------------------------------------------------------ */
var commands = {
  help: cmdHelp, '--help': cmdHelp, '-h': cmdHelp,
  today: cmdToday, week: cmdWeek, review: cmdWeek,
  list: cmdList, ls: cmdList, show: cmdShow, add: cmdAdd, edit: cmdEdit,
  done: moveCmd('done', 'Done'), start: moveCmd('doing', 'Started'), later: moveCmd('later', 'Parked'), bucket: moveCmd('bucket', 'Bucketed'), todo: moveCmd('todo', 'Back to To Do'),
  move: cmdMove, pri: cmdPri, tag: cmdTag, step: cmdStep, check: checkCmd(true), uncheck: checkCmd(false), note: cmdNote, rm: cmdRm, del: cmdRm,
  share: cmdShare, import: cmdImport,
  social: cmdSocial, post: cmdSocial, posts: cmdSocial,
  scripts: cmdScripts, script: cmdScripts, notes: cmdNotes,
  boards: cmdBoards, board: cmdBoards, activity: cmdActivity,
  template: cmdTemplate, theme: cmdTheme, config: cmdConfig, serve: cmdServe
};
var fn = commands[cmd];
if (!fn) fail('Unknown command "' + cmd + '". Run: node marathon.js help');
fn();
