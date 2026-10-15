#!/usr/bin/env node
/* =========================================================================
   solo.js — zero-dependency CLI for Solo Ops.
   Reads and writes the same data/*.json files the pages use, so the board,
   the terminal and your agent always see one list.

     node solo.js help
     node solo.js today | week | review
     node solo.js add "Write the launch post" --proj launch --pri high --tags content,video
     node solo.js done t5 | start t5 | move t5 later | pri t5 high
     node solo.js social next | social add "Launch day" --at 2026-10-20T09:00

   Output is Markdown by default; add --json for machine-readable output.
   ========================================================================= */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var DATA = process.env.SOLO_DATA ? path.resolve(process.env.SOLO_DATA) : path.join(ROOT, 'data');   // SOLO_DATA: another data folder (a second identity on one machine, tests)
var SHIPPED = safeRequire(path.join(ROOT, 'solo.config.js')) || {};   // the file as it ships: never personalised (this repository is public)
var CfgLib = (safeRequire(path.join(ROOT, 'core', 'config.js')) || {}).Config || null;   // shared with the pages: override · check · mergeOverrides
// The user's own values (owner, board titles, post types …) come from data/settings.json → `config`, merged over the
// shipped file; values of another shape than the shipped one are ignored (doctor reports them). `config set` writes them.
var OVERRIDES = configOverrides(); var cfg = OVERRIDES ? (CfgLib ? CfgLib.mergeOverrides(SHIPPED, OVERRIDES) : mergeCfg(SHIPPED, OVERRIDES)) : SHIPPED;
var T = safeRequire(path.join(ROOT, 'core', 'templates.js'));
var P = safeRequire(path.join(ROOT, 'core', 'prompts.js'));   // the Guide's built-in prompts (shared with the pages)
var When = safeRequire(path.join(ROOT, 'core', 'when.js'));    // dates: parse, state, label (shared with the pages)
var RESERVED = ['social', 'scripts', 'writing', 'settings', 'activity', 'boards', 'workspaces', 'calendar', 'home', 'prompts', 'inspiration', 'log', 'attachments', 'backup', 'exports'];
var COLS = ['todo', 'doing', 'done', 'later', 'bucket'];
var COL_LABEL = { todo: 'To Do', doing: 'Doing', done: 'Done', later: 'Later', bucket: 'Bucket List' };
var PRI = { high: 0, medium: 1, low: 2 };

function safeRequire(p) { try { return require(p); } catch (e) { return null; } }
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function mergeCfg(base, over) {   // same rules as core/config.js: objects merge, arrays and scalars replace
  var o = {}; Object.keys(base || {}).forEach(function (k) { o[k] = base[k]; });
  Object.keys(over || {}).forEach(function (k) { var v = over[k]; if (isObj(v) && isObj(base && base[k])) o[k] = mergeCfg(base[k], v); else if (v !== undefined) o[k] = v; });
  return o;
}
function configOverrides() { try { var s = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8')); return isObj(s.config) && Object.keys(s.config).length ? s.config : null; } catch (e) { return null; } }
// Read a solo.config.js text (as shipped or as staged) without running the rest of the CLI.
function evalConfigText(text) { try { var m = { exports: {} }; new Function('module', 'exports', text).call({}, m, m.exports); return isObj(m.exports) ? m.exports : null; } catch (e) { return null; } }

/* ---- args ---------------------------------------------------------------- */
var argv = process.argv.slice(2);
var flags = {}, pos = [];
for (var i = 0; i < argv.length; i++) {
  var a = argv[i];
  if (a.indexOf('--') === 0) {
    var eq = a.indexOf('=');
    if (eq > -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && argv[i + 1].indexOf('--') !== 0) {
      flags[a.slice(2)] = argv[++i];
      if (a === '--at' && i + 1 < argv.length && /^\d{1,2}:\d{2}$/.test(argv[i + 1])) flags.at += ' ' + argv[++i];   // --at +3d 9:00 without quotes
    } else flags[a.slice(2)] = true;
  } else pos.push(a);
}
var JSON_OUT = !!flags.json;
var cmd = pos.shift() || 'help';

/* ---- io ------------------------------------------------------------------ */
function fileOf(name) { return path.join(DATA, name + '.json'); }
function read(name) {
  try { return JSON.parse(fs.readFileSync(fileOf(name), 'utf8')); } catch (e) { return null; }
}
var LOG = path.join(DATA, 'log.jsonl');
var LOG_MAX = 400, SNAP_MAX = 2 * 1024 * 1024;
var SOURCE = (flags.as && ['agent', 'cli', 'ui'].indexOf(String(flags.as)) >= 0) ? String(flags.as) : (process.env.MARATHON_AGENT ? 'agent' : 'cli');
function logChange(file, prevText, note) {
  var rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: new Date().toISOString(), file: file, source: SOURCE, note: note || flags.note || (cmd + ' ' + pos.join(' ')).trim().slice(0, 120),
    prev: prevText && prevText.length <= SNAP_MAX ? prevText : null, prevBytes: prevText ? prevText.length : 0 };
  var lines = []; try { lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean); } catch (e) { /* new */ }
  lines.push(JSON.stringify(rec)); if (lines.length > LOG_MAX) lines = lines.slice(lines.length - LOG_MAX);
  fs.writeFileSync(LOG, lines.join('\n') + '\n'); return rec;
}
function readLog() { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } }
function write(name, body, opts) {
  body.version = 1; body.updatedAt = new Date().toISOString();
  fs.mkdirSync(DATA, { recursive: true });
  var text = JSON.stringify(body, null, 2) + '\n';
  if (name !== 'activity' && !(opts && opts.noLog)) { var prev = ''; try { prev = fs.readFileSync(fileOf(name), 'utf8'); } catch (e) { /* new */ } if (prev !== text) logChange(name + '.json', prev); }
  fs.writeFileSync(fileOf(name), text);
  if (!(opts && opts.noActivity) && ['activity', 'boards', 'workspaces', 'settings', 'prompts', 'backup'].indexOf(name) < 0) logActivity(name);
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
/* ---- workspaces: config + data/workspaces.json; primary keeps short file names ---- */
function normWs(w) {
  if (!w) return null; var id = slug(w.id || w.title); if (!id || RESERVED.indexOf(id) >= 0) return null;
  var apps = Object.assign({ social: true, scripts: true, writing: true }, w.apps || {});
  var boards = (Array.isArray(w.boards) ? w.boards : []).map(normBoard).filter(Boolean);
  if (w.boards === undefined && apps.boards !== false && !boards.length) boards = [normBoard({ id: 'runway', title: 'Launch Runway', sprintLabel: 'Sprint progress' })];
  return { id: id, title: w.title || id, apps: { social: apps.social !== false, scripts: apps.scripts !== false, writing: apps.writing !== false }, boards: boards };
}
function configWs() {
  var list = Array.isArray(cfg.workspaces) && cfg.workspaces.length ? cfg.workspaces
    : [{ id: 'main', title: cfg.name || 'Solo Ops', apps: cfg.apps, boards: cfg.boards || (cfg.runway ? [{ id: 'runway', title: cfg.runway.title }] : undefined) }];
  var out = list.map(normWs).filter(Boolean); return out.length ? out : [normWs({ id: 'main', title: 'Solo Ops' })];
}
function allWorkspaces() {
  var seen = {}, out = []; var rt = read('workspaces');
  configWs().concat(rt && Array.isArray(rt.workspaces) ? rt.workspaces : []).map(normWs).filter(Boolean).forEach(function (w) { if (!seen[w.id]) { seen[w.id] = 1; out.push(w); } });
  return out;
}
var WORKSPACES = allWorkspaces();
var PRIMARY = WORKSPACES[0].id;
var WS_ID = (function () {
  if (!flags.ws) return PRIMARY;
  var want = String(flags.ws).toLowerCase();
  var hit = WORKSPACES.filter(function (w) { return w.id === slug(want) || w.title.toLowerCase().indexOf(want) >= 0; });
  if (hit.length !== 1) fail('Unknown workspace "' + flags.ws + '". Workspaces: ' + WORKSPACES.map(function (w) { return w.id + ' (' + w.title + ')'; }).join(', '));
  return hit[0].id;
})();
var WS = WORKSPACES.filter(function (w) { return w.id === WS_ID; })[0];
function prefix(wsId) { return (wsId || WS_ID) === PRIMARY ? '' : (wsId || WS_ID) + '-'; }
function fileName(app, wsId) { return prefix(wsId) + app; }   // data/<prefix><app>.json
function appOn(a) { return a === 'boards' ? BOARDS.length > 0 : WS.apps[a] !== false; }
function allBoards() {
  var seen = {}, out = []; var rt = read('boards');
  var list = WS.boards.concat((rt && Array.isArray(rt.boards) ? rt.boards : []).filter(function (b) { return (b.ws || PRIMARY) === WS_ID; }));
  list.map(normBoard).filter(Boolean).forEach(function (b) { if (!seen[b.id]) { seen[b.id] = 1; out.push(b); } });
  return out;
}
var BOARDS = allBoards();
var BOARD_ID = (function () {
  var want = flags.board ? slug(flags.board) : null;
  if (!want) return BOARDS[0] ? BOARDS[0].id : 'runway';
  var hit = BOARDS.filter(function (b) { return b.id === want || b.title.toLowerCase().indexOf(String(flags.board).toLowerCase()) >= 0; });
  if (hit.length !== 1) fail('Unknown board "' + flags.board + '". Boards: ' + BOARDS.map(function (b) { return b.id + ' (' + b.title + ')'; }).join(', '));
  return hit[0].id;
})();
function boardMeta(id) { return BOARDS.filter(function (b) { return b.id === (id || BOARD_ID); })[0]; }
function boardFile(id) { return prefix() + (id || BOARD_ID); }
function board(id) { var d = read(boardFile(id)); return d && Array.isArray(d.tasks) ? d : { projects: [], tasks: [] }; }
function saveBoard(b, id) { return write(boardFile(id), b); }
function schedule() { var d = read(fileName('social')); return d && Array.isArray(d.posts) ? d : { posts: [] }; }
function scripts() { var d = read(fileName('scripts')); return d && Array.isArray(d.scripts) ? d : { activeId: '', scripts: [] }; }
function notes() { var d = read(fileName('writing')); return d && Array.isArray(d.notes) ? d : { activeId: '', notes: [] }; }

function out(md, obj) {
  if (JSON_OUT) process.stdout.write(JSON.stringify(obj === undefined ? { text: md } : obj, null, 2) + '\n');
  else process.stdout.write((Array.isArray(md) ? md.join('\n') : md) + '\n');
}
function localStamp(iso) { var d = new Date(iso); if (isNaN(d)) return String(iso).replace('T', ' ').slice(0, 16); function p(n) { return n < 10 ? '0' + n : '' + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }   // log stamps are UTC on disk, shown in local time
function fail(msg) { if (JSON_OUT) out('', { error: msg }); else process.stderr.write('✗ ' + msg + '\n'); process.exit(1); }
function hint(name) { return 'No data/' + name + '.json yet. Open the app once, or run: node solo.js template ' + (RESERVED.indexOf(name) < 0 ? 'board --board ' + name : name); }

/* ---- helpers ------------------------------------------------------------- */
function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function localDT(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtDT(s) {
  var d = new Date(s); if (isNaN(d)) return s;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function parseWhen(v) {   // posts: a date alone means 09:00; stamps with a zone become local time (core/when.js)
  if (!v) return localDT(tomorrow9());
  var p = When ? When.parse(v) : null; if (p) return p.allDay ? p.stamp + 'T09:00' : p.stamp;
  fail('Could not read the date "' + v + '". Use 2026-10-20T09:00, 2026-10-20, +3d 17:30, tomorrow 14:00 or fri 10:00.');
}
// tasks: a date alone stays all-day; 'clear' removes
function parseAt(v, what) { if (String(v).toLowerCase() === 'clear') return ''; var p = When ? When.parse(v) : null; if (!p) fail('Could not read the ' + (what || 'date') + ' "' + v + '". Use 2026-10-15T14:00, 2026-10-15, +3d 17:30, tomorrow 14:00 or fri 10:00.'); return p.stamp; }
function applyDates(t, f) {   // --at --until --due --ext from flags onto a task; 'clear' removes
  if (f.at !== undefined) { var a = parseAt(f.at, 'time'); if (a) t.at = a; else { delete t.at; delete t.until; } }
  if (f.until !== undefined) { if (!t.at || String(f.until).toLowerCase() === 'clear') delete t.until; else { var u = When.until(t.at, f.until); if (!u) fail('Could not read --until "' + f.until + '". Use 15:00 or a full date-time.'); if (u < t.at) fail('--until is before --at'); t.until = u; } }
  if (f.due !== undefined) { var d = parseAt(f.due, 'due date'); if (d) t.due = When.dayKey(d); else delete t.due; }
  if (f.ext !== undefined) { if (String(f.ext).toLowerCase() === 'clear' || !f.ext) delete t.ext; else t.ext = String(f.ext); }
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
function whenText(t) { if (!When || (!t.at && !t.due)) return ''; var st = When.state(t); return (t.at ? ' · ' + When.label(t.at) + (t.until && When.dayKey(t.until) === When.dayKey(t.at) ? '–' + When.timeOf(t.until) : '') : '') + (t.due ? ' · due ' + When.label(t.due) : '') + (st === 'overdue' ? ' · OVERDUE' : ''); }
function taskLine(t) {
  var p = progress(t.checklist);
  return '- [' + t.id + ']' + (t._board ? ' (' + t._board + ')' : '') + ' ' + t.title + ' · ' + t.proj + ' · ' + t.pri + whenText(t) + (t.tags && t.tags.length ? ' · #' + t.tags.join(' #') : '') + (p ? ' · ' + p + ' steps' : '');
}
// at <task> <when|clear> [--until HH:MM] · due <task> <date|clear>: the date is the trailing one or two words
function whenCmd(kind) {
  return function () {
    var b = board(); var q = null, when = null;
    for (var n = Math.min(2, pos.length - 1); n >= 1 && !when; n--) { var tail = pos.slice(-n).join(' '); if (tail.toLowerCase() === 'clear' || (When && When.parse(tail))) { q = pos.slice(0, -n).join(' '); when = tail; } }
    if (!when) fail('Usage: ' + kind + ' <task> <' + (kind === 'at' ? 'when' : 'date') + '|clear>' + (kind === 'at' ? ' [--until 15:00]' : '') + '   e.g. ' + kind + ' t3 tomorrow 14:00');
    var t = find(b.tasks, q, 'task'); var f = {}; f[kind] = when; if (flags.until !== undefined) f.until = flags.until; applyDates(t, f); saveBoard(b);
    out('✓ [' + t.id + '] ' + t.title + (when.toLowerCase() === 'clear' ? (kind === 'at' ? ' · time removed' : ' · due date removed') : whenText(t)), t);
  };
}
// every dated item of a workspace (tasks with at/due on any of its boards + posts), for today / week / calendar
function boardsOf(wsId) {
  var w = WORKSPACES.filter(function (x) { return x.id === wsId; })[0]; if (!w) return []; var seen = {}, outB = []; var rt = read('boards');
  w.boards.concat((rt && Array.isArray(rt.boards) ? rt.boards : []).filter(function (b) { return (b.ws || PRIMARY) === wsId; })).map(normBoard).filter(Boolean).forEach(function (b) { if (!seen[b.id]) { seen[b.id] = 1; outB.push(b); } });
  return outB;
}
function datedItems(all) {
  var items = []; var now = new Date();
  (all ? WORKSPACES : [WS]).forEach(function (w) {
    var wb = boardsOf(w.id); if (!wb.length) wb = [{ id: 'runway', title: 'Launch Runway' }];   // a workspace with no boards still has the default file (same fallback as BOARD_ID)
    wb.forEach(function (bm) { var bf = read(prefix(w.id) + bm.id); ((bf && bf.tasks) || []).forEach(function (t) { if (t.at || t.due) items.push({ kind: 'task', id: t.id, title: t.title, at: t.at || '', until: t.until || '', due: t.due || '', col: t.col, pri: t.pri, tags: t.tags || [], meeting: (t.tags || []).indexOf('meeting') >= 0, board: bm.id, boardTitle: bm.title, ws: w.id, ext: t.ext || '' }); }); });
    if (w.apps.social !== false) { var sfile = read(prefix(w.id) + 'social'); ((sfile && sfile.posts) || []).forEach(function (p) { if (p.datetime) items.push({ kind: 'post', id: p.id, title: p.title, at: p.datetime.slice(0, 16), until: '', due: '', status: p.status, ws: w.id, board: '' }); }); }
  });
  items.forEach(function (i) { i.when = i.at || i.due; i.state = When ? When.state(i, now) : ''; i.open = i.kind === 'task' ? i.col !== 'done' : i.status !== 'posted'; });
  items.sort(function (a, b) { return a.when.localeCompare(b.when); });
  return items;
}
function itemLine(i, showBoard) {
  var time = i.at ? (When ? When.range(i.at, i.until) : i.at.slice(11)) : 'due';
  return '- ' + (i.state === 'overdue' ? 'OVERDUE · ' : '') + (i.state === 'overdue' && !i.at ? 'due ' + i.due + ' ' : time + ' ') + '[' + i.id + '] ' + i.title + (i.meeting ? ' · meeting' : i.kind === 'post' ? ' · post' + (i.status ? ' (' + i.status + ')' : '') : '') + (showBoard && i.board ? ' (' + i.board + ')' : '') + (i.ws !== WS_ID ? ' · ' + i.ws : '');
}
// what is on today: everything overdue, then today's dated tasks and posts in time order (all-day first)
function scheduleToday(items) {
  var today = When ? When.localD(new Date()) : new Date().toISOString().slice(0, 10);
  var list = items.filter(function (i) { return i.open && (i.state === 'overdue' || When.dayKey(i.when) === today); });
  list.sort(function (a, b) { var oa = a.state === 'overdue' ? 0 : 1, ob = b.state === 'overdue' ? 0 : 1; if (oa !== ob) return oa - ob; return (a.when + (a.at ? '' : 'T00:00')).localeCompare(b.when + (b.at ? '' : 'T00:00')); });
  return list;
}
function byDay(items, from, days) {
  var out = []; var d = new Date(from.getTime()); d.setHours(0, 0, 0, 0);
  for (var k = 0; k < days; k++) { var key = When.localD(d); var g = items.filter(function (i) { return i.open && When.dayKey(i.when) === key && i.state !== 'overdue'; }); if (g.length) out.push({ day: key, label: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), items: g }); d.setDate(d.getDate() + 1); }
  return out;
}
function cmdCalendar() {
  var days = parseInt(flags.days || pos[0], 10) || 14; var items = datedItems(!!flags.all); var now = new Date(); var showBoard = BOARDS.length > 1 || !!flags.all;
  var overdue = items.filter(function (i) { return i.open && i.state === 'overdue'; }); var groups = byDay(items, now, days);
  var md = ['# Calendar · next ' + days + ' days' + (flags.all ? ' · all projects' : ' · ' + WS.title), ''];
  if (overdue.length) { md.push('## Overdue (' + overdue.length + ')'); overdue.forEach(function (i) { md.push(itemLine(i, showBoard)); }); md.push(''); }
  if (!groups.length) md.push('_Nothing with a date in this window. Add one: `node solo.js add "Call with X" --at tomorrow 14:00 --until 14:30 --tags meeting`, or ask your agent to fill your calendar._', '');
  groups.forEach(function (g) { md.push('## ' + g.label + (g.day === When.localD(now) ? ' · today' : '')); g.items.forEach(function (i) { md.push(itemLine(i, showBoard)); }); md.push(''); });
  out(md, { from: When.localD(now), days: days, all: !!flags.all, overdue: overdue, byDay: groups, items: items.filter(function (i) { return i.open; }) });
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
  var b = board(); if (!read(boardFile())) fail(hint(boardFile()));
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
  if (!title) fail('Usage: add "Task title" [--proj X] [--pri high|medium|low] [--tags a,b] [--col todo|doing|later|bucket] [--desc "..."] [--steps "a|b|c"] [--at <when>] [--until <HH:MM>] [--due <date>] [--ext <calendar id>]');
  var b = board();
  var projects = ((cfg.projects || []).map(function (p) { return typeof p === 'string' ? p : p.name; })).concat(b.projects || []);
  var t = {
    id: newId('t'), title: title, desc: flags.desc || '', proj: flags.proj || projects[0] || 'general',
    col: COLS.indexOf(flags.col) >= 0 ? flags.col : 'todo', pri: PRI.hasOwnProperty(flags.pri) ? flags.pri : 'medium',
    tags: split(flags.tags).map(function (s) { return s.toLowerCase(); }), notes: flags.notes || '', collapsed: true,
    checklist: String(flags.steps || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { text: s, done: false }; })
  };
  applyDates(t, flags);
  // --ext: the id a connected calendar gave this item. Same ext on the board → update it, never a duplicate (safe re-import).
  var same = t.ext ? b.tasks.filter(function (x) { return x.ext === t.ext; })[0] : null;
  if (same) {
    same.title = t.title; if (t.at) same.at = t.at; if (t.until) same.until = t.until; else if (t.at) delete same.until; if (t.due) same.due = t.due; if (t.desc) same.desc = t.desc; t.tags.forEach(function (g) { if (same.tags.indexOf(g) < 0) same.tags.push(g); });
    saveBoard(b); return out('✓ Updated [' + same.id + '] ' + same.title + ' (same --ext ' + same.ext + ')' + whenText(same), same);
  }
  if (projects.indexOf(t.proj) < 0) { b.projects = (b.projects || []).concat([t.proj]); }
  b.tasks.unshift(t); saveBoard(b);
  out('✓ Added [' + t.id + '] ' + t.title + ' → ' + COL_LABEL[t.col] + ' · ' + t.proj + ' · ' + t.pri + whenText(t), t);
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
  applyDates(t, flags);
  saveBoard(b); out('✓ Updated [' + t.id + '] ' + t.title + whenText(t), t);
}

/* ---- overviews ----------------------------------------------------------- */
// tasks from every board (or just --board), each tagged with its board id when >1
function allTasks() {
  var ids = flags.board ? [BOARD_ID] : BOARDS.map(function (b) { return b.id; });
  var out = [];
  ids.forEach(function (id) { board(id).tasks.forEach(function (t) { out.push(ids.length > 1 ? Object.assign({ _board: id }, t) : t); }); });
  return out;
}
var EMPTY_NUDGE = '_Nothing here yet. Ask your agent for /setup · sample sprint: `node solo.js template all` · plan your own: /plan-project (Guide → Plan a project from scratch) · open the app: `node serve.js`_';
function cmdToday() {
  var tasks = appOn('boards') ? allTasks() : [], s = appOn('social') ? schedule() : { posts: [] };
  var now = new Date(); var end = new Date(now); end.setHours(23, 59, 59, 999);
  var doing = tasks.filter(function (t) { return t.col === 'doing'; }).sort(byPri);
  var high = tasks.filter(function (t) { return t.col === 'todo' && t.pri === 'high'; }).sort(byPri);
  var posts = s.posts.filter(function (p) { return p.status !== 'posted'; }).sort(function (a, c) { return a.datetime.localeCompare(c.datetime); });
  var due = posts.filter(function (p) { return new Date(p.datetime) <= end; });
  var md = ['# Today · ' + now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), '', activityLine(), ''];
  if (!tasks.length && !s.posts.length) md.push(EMPTY_NUDGE, '');
  var sched = When ? scheduleToday(datedItems(false)) : [];
  if (sched.length || tasks.some(function (t) { return t.at || t.due; })) md.push('## Schedule (' + sched.length + ')', sched.length ? sched.map(function (i) { return itemLine(i, BOARDS.length > 1); }).join('\n') : '_nothing dated today_', '');
  if (appOn('boards')) {
    md.push('## Doing (' + doing.length + ')', doing.length ? doing.map(taskLine).join('\n') : '_nothing in progress — start one: node solo.js start <task>_', '');
    md.push('## High priority, not started (' + high.length + ')', high.length ? high.map(taskLine).join('\n') : '_none_', '');
  }
  if (appOn('social')) md.push('## Posts due today or overdue (' + due.length + ')', due.length ? due.map(postLine).join('\n') : '_none_' + (posts[0] ? ' — next: ' + fmtDT(posts[0].datetime) + ' · ' + posts[0].title : ''), '');
  out(md, { activity: activitySummary(), schedule: sched, doing: doing, high: high, due: due, next: posts[0] || null });
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
  if (!tasks.length && !s.posts.length && !sc.scripts.length && !n.notes.length) md.push(EMPTY_NUDGE, '');
  if (appOn('boards')) {
    var boardsLine = (flags.board ? [boardMeta()] : BOARDS).map(function (bm) {
      var bt = board(bm.id).tasks; var dn = bt.filter(function (t) { return t.col === 'done'; }).length; var tot = bt.filter(function (t) { return ['todo', 'doing', 'done'].indexOf(t.col) >= 0; }).length;
      return '**' + bm.title + ':** ' + dn + '/' + tot + ' done (' + (tot ? Math.round(dn / tot * 100) : 0) + '%)' + (bt.some(function (t) { return t.col === 'later'; }) ? ' · ' + bt.filter(function (t) { return t.col === 'later'; }).length + ' in Later' : '');
    });
    md.push(boardsLine.join('  \n'), '');
    md.push('## Doing (' + doing.length + ')', doing.length ? doing.map(taskLine).join('\n') : '_nothing in progress_', '');
    md.push('## To Do by priority (' + todo.length + ')', todo.length ? todo.map(taskLine).join('\n') : '_empty_', '');
  }
  var dayGroups = When ? byDay(datedItems(false), now, days) : []; var wkOverdue = When ? datedItems(false).filter(function (i) { return i.open && i.state === 'overdue'; }) : [];
  if (dayGroups.length || wkOverdue.length) { md.push('## By day' + (wkOverdue.length ? ' (' + wkOverdue.length + ' overdue)' : '')); wkOverdue.forEach(function (i) { md.push(itemLine(i, BOARDS.length > 1)); }); dayGroups.forEach(function (g) { md.push('**' + g.label + '**'); g.items.forEach(function (i) { md.push(itemLine(i, BOARDS.length > 1)); }); }); md.push(''); }
  if (appOn('social')) md.push('## Posts scheduled (' + posts.length + (overdue.length ? ', ' + overdue.length + ' overdue' : '') + ' · ' + prepOpen + ' prep items open)', posts.length ? posts.map(postLine).join('\n') : '_no posts in this window_', '');
  if (appOn('scripts') || appOn('writing')) {
    md.push('## Studio');
    if (appOn('scripts')) md.push('- ' + sc.scripts.length + ' script' + (sc.scripts.length === 1 ? '' : 's') + (sc.scripts[0] ? ' · latest: ' + latestOf(sc.scripts).title + ' (' + stamp(latestOf(sc.scripts).updatedAt) + ')' : ''));
    if (appOn('writing')) md.push('- ' + n.notes.length + ' note' + (n.notes.length === 1 ? '' : 's') + (n.notes[0] ? ' · latest: ' + titleOf(latestOf(n.notes).text) + ' (' + stamp(latestOf(n.notes).updatedAt) + ')' : ''));
    md.push('');
  }
  out(md, { byDay: dayGroups, overdueDated: wkOverdue, window: { from: now.toISOString(), days: days }, activity: activitySummary(), boards: BOARDS.map(function (b) { return b.id; }), doing: doing, todo: todo, done: done.length, posts: posts, overdue: overdue, prepOpen: prepOpen, scripts: sc.scripts.length, notes: n.notes.length });
}
function latestOf(arr) { return arr.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })[0]; }

/* ---- share / import ------------------------------------------------------ */
var SC = safeRequire(path.join(ROOT, 'core', 'share-card.js'));   // Share today: model + text (shared with the pages)
function cmdShare() {
  var which = (pos[0] || 'todo').toLowerCase();
  if (which === 'today') {   // the card's text version: Doing · Schedule · Next up, titles only
    if (!SC) fail('core/share-card.js missing');
    var all = flags.all === true; var tasks = [];
    (all ? WORKSPACES : [WS]).forEach(function (w) { var wb = boardsOf(w.id); if (!wb.length) wb = [{ id: 'runway' }]; wb.forEach(function (bm) { var bf = read(prefix(w.id) + bm.id); ((bf && bf.tasks) || []).forEach(function (t) { tasks.push(t); }); }); });
    var m = SC.model({ now: new Date(), scope: all ? 'All projects' : WS.title, tasks: tasks, streak: activitySummary().streak });
    return out(SC.markdown(m), m);
  }
  var b = board();
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
  if (!read(fileName('social')) && ['list', 'next', 'week', 'show'].indexOf(sub) >= 0) fail(hint(fileName('social')));
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
    s.posts.push(np); write(fileName('social'), s); return out('✓ Scheduled [' + np.id + '] ' + np.title + ' · ' + fmtDT(np.datetime) + (flags.type && types.indexOf(flags.type) < 0 ? '\n  · type "' + flags.type + '" is not in your post types (' + types.join(', ') + '), so it is "' + np.postType + '". Add it: node solo.js config add social.postTypes ' + flags.type : ''), np);
  }
  if (sub === 'posted' || sub === 'ready' || sub === 'draft') {
    var pp = find(s.posts, pos.join(' '), 'post'); pp.status = sub;
    if (sub === 'posted') { pp.posted = pp.posted || {}; pp.posted.postedAt = pp.posted.postedAt || localDT(new Date()); if (flags.url) pp.posted.url = flags.url; }
    write(fileName('social'), s); return out('✓ [' + pp.id + '] ' + pp.title + ' → ' + sub, pp);
  }
  if (sub === 'move') { var pm = find(s.posts, pos.slice(0, -1).join(' '), 'post'); pm.datetime = parseWhen(pos[pos.length - 1]); write(fileName('social'), s); return out('✓ [' + pm.id + '] ' + pm.title + ' → ' + fmtDT(pm.datetime), pm); }
  if (sub === 'prep') { var text = flags.text || pos.slice(1).join(' '); var pq = find(s.posts, flags.text ? pos.join(' ') : pos[0], 'post'); if (!text) fail('Usage: social prep <post> "prep item"'); pq.prep = pq.prep || []; pq.prep.push({ text: text, done: false, kind: flags.kind || 'content' }); write(fileName('social'), s); return out('✓ [' + pq.id + '] prep ' + pq.prep.length + ': ' + text, pq); }
  if (sub === 'check') { var n = parseInt(pos[pos.length - 1], 10); var pc = find(s.posts, pos.slice(0, -1).join(' '), 'post'); if (!pc.prep || !pc.prep[n - 1]) fail('No prep item ' + n); pc.prep[n - 1].done = !pc.prep[n - 1].done; write(fileName('social'), s); return out('✓ [' + pc.id + '] ' + (pc.prep[n - 1].done ? '☑' : '☐') + ' ' + pc.prep[n - 1].text, pc); }
  if (sub === 'copy') { var text2 = flags.text || pos.slice(1).join(' '); var pcp = find(s.posts, flags.text ? pos.join(' ') : pos[0], 'post'); if (!text2) return out(pcp.copy || '_empty_', { id: pcp.id, copy: pcp.copy }); pcp.copy = text2; write(fileName('social'), s); return out('✓ [' + pcp.id + '] copy updated (' + text2.length + ' chars)', pcp); }
  if (sub === 'rm') { var pr = find(s.posts, pos.join(' '), 'post'); s.posts = s.posts.filter(function (x) { return x.id !== pr.id; }); write(fileName('social'), s); return out('✓ Deleted [' + pr.id + '] ' + pr.title, pr); }
  fail('Unknown social command "' + sub + '". Try: list, next, week, show, add, posted, ready, move, prep, check, copy, rm');
}

/* ---- studio -------------------------------------------------------------- */
function libCmd(name, key, label, mk) {
  return function () {
    var sub = (pos.shift() || 'list').toLowerCase(); var d = name === 'scripts' ? scripts() : notes(); var list = d[key];
    if (!read(fileName(name)) && sub !== 'add') fail(hint(fileName(name)));
    var items = list.map(function (x) { return { id: x.id, title: x.title || titleOf(x.text), updatedAt: x.updatedAt, text: x.text }; });
    if (sub === 'list') return out(['## ' + label + 's (' + items.length + ')'].concat(items.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).map(function (x) { return '- [' + x.id + '] ' + x.title + ' · ' + stamp(x.updatedAt); })), items.map(function (x) { return { id: x.id, title: x.title, updatedAt: x.updatedAt }; }));
    if (sub === 'show') { var it = find(items, pos.join(' '), label); return out(it.text, it); }
    if (sub === 'add') {
      var title = pos.join(' ').trim() || flags.title; var text = flags.file ? fs.readFileSync(path.resolve(flags.file), 'utf8') : (flags.text || (title ? '# ' + title + '\n\n' : ''));
      if (!text.trim()) fail('Usage: ' + name + ' add "Title"   or   ' + name + ' add --file draft.md');
      var item = mk(text); list.unshift(item); d.activeId = item.id; write(fileName(name), d); return out('✓ Added [' + item.id + '] ' + (item.title || titleOf(item.text)), item);
    }
    if (sub === 'rm') { var r = find(items, pos.join(' '), label); d[key] = list.filter(function (x) { return x.id !== r.id; }); if (d.activeId === r.id) d.activeId = d[key][0] ? d[key][0].id : ''; write(fileName(name), d); return out('✓ Deleted [' + r.id + '] ' + r.title, r); }
    fail('Unknown ' + name + ' command "' + sub + '". Try: list, show, add, rm');
  };
}
var cmdScripts = libCmd('scripts', 'scripts', 'script', function (text) { return { id: newId('s'), title: titleOf(text), text: text, createdAt: Date.now(), updatedAt: Date.now() }; });
var cmdNotes = libCmd('writing', 'notes', 'note', function (text) { return { id: newId('n'), text: text, images: {}, createdAt: Date.now(), updatedAt: Date.now() }; });

/* ---- inspiration --------------------------------------------------------- */
function inspo() { var d = read('inspiration'); return d && Array.isArray(d.items) ? d : { items: [] }; }
function parseQuick(text, extra) {
  text = String(text || '').trim(); var tags = [];
  text = text.replace(/(^|\s)#([\w-]+)/g, function (_, sp, t) { tags.push(t.toLowerCase()); return sp; }).trim();
  var m = text.match(/https?:\/\/\S+/); var it = Object.assign({ id: newId('i'), tags: tags, ws: '', status: 'new', source: SOURCE, usedAs: [], createdAt: Date.now(), updatedAt: Date.now(), image: '' }, extra || {});
  if (m) { it.kind = 'link'; it.url = m[0]; var rest = text.replace(m[0], '').trim(); it.title = rest.split('\n')[0].slice(0, 80) || m[0].replace(/^https?:\/\//, '').split('/')[0]; it.text = rest.split('\n').slice(1).join('\n'); }
  else { it.kind = 'note'; it.url = ''; var lines = text.split('\n'); it.title = lines[0].slice(0, 80); it.text = lines.slice(1).join('\n').trim(); }
  return it;
}
// copy a local file into data/attachments/ (named <base>.<ext>) when it is under
// attachments.copyMaxMB; otherwise return just its facts so the item can link to it
function attachFile(p, base) {
  var abs = path.resolve(p); var st; try { st = fs.statSync(abs); } catch (e) { fail('No such file: ' + p); }
  var ext = (path.extname(abs).slice(1) || 'bin').toLowerCase().replace('jpeg', 'jpg'); var image = /^(png|jpg|gif|webp|svg)$/.test(ext);
  var cap = ((cfg.attachments && cfg.attachments.copyMaxMB) || 25) * 1048576; var sizeText = st.size < 1048576 ? Math.round(st.size / 1024) + ' KB' : (st.size / 1048576).toFixed(1) + ' MB';
  var r = { abs: abs, name: path.basename(abs), size: st.size, type: image ? 'image/' + (ext === 'jpg' ? 'jpeg' : ext) : '', image: image, sizeText: sizeText, file: '' };
  if (st.size > cap) return r;
  var dir = path.join(DATA, 'attachments'); fs.mkdirSync(dir, { recursive: true }); var name = base + '.' + ext; fs.copyFileSync(abs, path.join(dir, name)); r.file = 'data/attachments/' + name; return r;
}
function inspoLine(x) { return '- [' + x.id + '] ' + (x.title || x.url || 'untitled') + (x.url ? ' · ' + x.url : '') + (x.file ? ' · ' + x.file : (x.image ? ' · (image in browser)' : '')) + (x.tags.length ? ' · #' + x.tags.join(' #') : '') + (x.ws ? ' · ' + x.ws : '') + ' · ' + x.status + ' · ' + x.source; }
function cmdInspo() {
  var sub = (pos.shift() || 'list').toLowerCase(); var d = inspo();
  if (sub === 'list') {
    var items = d.items.filter(function (x) { return (!flags.ws || x.ws === WS_ID) && (flags.status ? x.status === flags.status : x.status !== 'archived') && (!flags.tag || x.tags.indexOf(flags.tag) >= 0); });
    return out(['## Inspiration (' + items.length + ')'].concat(items.length ? items.map(inspoLine) : ['_empty — inspo add "https://… #tag" or a note_']), items);
  }
  if (sub === 'show') { var x = find(d.items, pos.join(' '), 'inspiration item'); return out(['# ' + (x.title || x.url), '', x.url ? x.url + '\n' : '', x.text || '', x.file ? '\nattachment: ' + x.file : (x.image ? '\n(image stored in the browser only — open the app with node serve.js to export it)' : ''), '', 'tags: ' + x.tags.join(', ') + ' · workspace: ' + (x.ws || '—') + ' · ' + x.status + ' · ' + x.source].filter(function (l) { return l !== undefined; }), x); }
  if (sub === 'add') {
    var text = pos.join(' ').trim() || flags.text; if (!text && !flags.file) fail('Usage: inspo add "https://… or an idea #tag" [--ws <id>] [--tags a,b] [--title "…"] [--file <path>]'); text = text || String(flags.file).split('/').pop();
    var it = parseQuick(text, { ws: flags.ws ? WS_ID : '' }); if (flags.title) it.title = flags.title; if (flags.tags) it.tags = it.tags.concat(split(flags.tags).map(function (t) { return t.toLowerCase(); }));
    if (flags.file) { var att = attachFile(String(flags.file), 'inspo-' + it.id); it.kind = att.image ? 'image' : 'file'; it.name = att.name; it.size = att.size; it.type = att.type; if (att.file) { it.file = att.file; it.stored = 'disk'; } else { it.url = 'file://' + att.abs; it.text = (it.text ? it.text + '\n' : '') + 'Too large to copy (' + att.sizeText + '); kept as a local link.'; } if (!it.title) it.title = att.name.replace(/\.[^.]+$/, ''); if (it.tags.indexOf(it.kind) < 0) it.tags.push(it.kind); }
    d.items.unshift(it); write('inspiration', d); return out('✓ Saved [' + it.id + '] ' + (it.title || it.url) + (it.ws ? ' → ' + it.ws : '') + (it.tags.length ? ' #' + it.tags.join(' #') : ''), it);
  }
  if (sub === 'tag') { var xt = find(d.items, pos.filter(function (p) { return !/^[+-]/.test(p); }).join(' '), 'inspiration item'); pos.filter(function (p) { return /^[+-]/.test(p); }).forEach(function (o) { var t = o.slice(1).toLowerCase(); if (o[0] === '+' && xt.tags.indexOf(t) < 0) xt.tags.push(t); if (o[0] === '-') xt.tags = xt.tags.filter(function (y) { return y !== t; }); }); xt.updatedAt = Date.now(); write('inspiration', d); return out('✓ [' + xt.id + '] #' + xt.tags.join(' #'), xt); }
  if (sub === 'ws') { var xw = find(d.items, pos.slice(0, -1).join(' ') || pos[0], 'inspiration item'); xw.ws = slug(pos[pos.length - 1]); xw.updatedAt = Date.now(); write('inspiration', d); return out('✓ [' + xw.id + '] → workspace ' + xw.ws, xw); }
  if (sub === 'archive' || sub === 'unarchive') { var xa = find(d.items, pos.join(' '), 'inspiration item'); xa.status = sub === 'archive' ? 'archived' : 'new'; xa.updatedAt = Date.now(); write('inspiration', d); return out('✓ [' + xa.id + '] ' + xa.status, xa); }
  if (sub === 'rm') { var xr = find(d.items, pos.join(' '), 'inspiration item'); d.items = d.items.filter(function (y) { return y.id !== xr.id; }); write('inspiration', d); return out('✓ Deleted [' + xr.id + '] ' + (xr.title || xr.url), xr); }
  if (sub === 'use') {
    var as = (flags.as && ['task', 'post', 'script', 'note'].indexOf(flags.as) >= 0) ? flags.as : (flags.task ? 'task' : flags.post ? 'post' : flags.script ? 'script' : flags.note ? 'note' : null);
    if (!as) fail('Usage: inspo use <item> --as task|post|script|note [--ws <id>] [--board <id>]');
    var xu = find(d.items, pos.join(' '), 'inspiration item'); var title = xu.title || xu.url || 'From inspiration'; var body = [xu.url, xu.text].filter(Boolean).join('\n'); var created;
    if (as === 'task') { var b = board(); var t = { id: newId('t'), title: title, desc: body, proj: ((cfg.projects || [])[0] || {}).name || 'general', col: 'todo', pri: 'medium', tags: xu.tags.slice(), notes: 'From inspiration ' + xu.id, collapsed: true, checklist: [] }; b.tasks.unshift(t); saveBoard(b); created = t.id + ' on ' + BOARD_ID; }
    else if (as === 'post') { var s2 = schedule(); var np = { id: newId('p'), datetime: parseWhen(flags.at), title: title, postType: 'update', format: 'text', project: ((cfg.projects || [])[0] || {}).name || 'general', copy: body, video: { title: '', status: 'none', notes: '', link: '' }, links: xu.url ? [{ id: newId('l'), label: xu.title, url: xu.url, kind: 'reference' }] : [], assets: [], prep: [], notes: 'From inspiration ' + xu.id, status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } }; s2.posts.push(np); write(fileName('social'), s2); created = np.id; }
    else if (as === 'script') { var sc = scripts(); var si = { id: newId('s'), title: title, text: '# ' + title + '\n\n## Hook\n\n## Script\n1. \n\n## Inserts\n' + (body ? '\n## Source\n' + body + '\n' : ''), createdAt: Date.now(), updatedAt: Date.now() }; sc.scripts.unshift(si); sc.activeId = si.id; write(fileName('scripts'), sc); created = si.id; }
    else { var nn = notes(); var ni = { id: newId('n'), text: '# ' + title + '\n\n' + body + '\n\n[[AI: turn this into a draft]]\n', images: {}, createdAt: Date.now(), updatedAt: Date.now() }; nn.notes.unshift(ni); nn.activeId = ni.id; write(fileName('writing'), nn); created = ni.id; }
    xu.usedAs.push({ app: as, id: created, at: Date.now() }); xu.status = 'used'; xu.updatedAt = Date.now(); write('inspiration', d);
    return out('✓ [' + xu.id + '] → ' + as + ' ' + created + ' in ' + WS_ID, { item: xu.id, as: as, created: created });
  }
  if (sub === 'ai' || sub === 'brainstorm') {
    var sel = d.items.filter(function (x) { return x.status !== 'archived' && (!flags.ws || x.ws === WS_ID); }).slice(0, parseInt(flags.n, 10) || 20);
    var lines = ['# Inspiration → ' + (flags.into || 'next steps'), '', 'Workspace: ' + WS.title + ' (' + WS_ID + '). Turn the items below into concrete ' + (flags.into || 'next steps') + '.', 'Give me back `node solo.js …` commands I can run, or a short list I can paste. Keep titles short.', ''];
    sel.forEach(function (x, i) { lines.push('## ' + (i + 1) + '. ' + (x.title || x.url) + (x.tags.length ? '  #' + x.tags.join(' #') : '')); if (x.url) lines.push(x.url); if (x.text) lines.push(x.text); lines.push(''); });
    return out(lines, sel);
  }
  fail('Unknown inspo command "' + sub + '". Try: list, show, add, tag, ws, use, archive, rm, ai');
}

/* ---- prompts: built-ins in core/prompts.js, yours in data/prompts.json ------- */
function promptOpts(mode) { return { title: WS.title, id: WS_ID, board: BOARDS[0] ? BOARDS[0].id : 'runway', mode: mode === 'chat' ? 'chat' : 'files', folder: ROOT }; }
function allPrompts(mode, over) {   // built-ins with your edits applied, plus your own — the list the Guide shows
  var d = read('prompts') || {}; var ov = d.overrides || {}, hidden = d.hidden || [], custom = d.custom || [];
  if (!P) fail('core/prompts.js is missing');
  var o = Object.assign(promptOpts(mode), over || {}); var list = P.build(o); var head = P.head(o);
  list.forEach(function (x) { if (ov[x.t]) { if (ov[x.t].d) x.d = ov[x.t].d; if (ov[x.t].p) x.p = ov[x.t].p; x.overridden = true; } });
  list = list.filter(function (x) { return hidden.indexOf(x.t) < 0; });
  custom.forEach(function (c) { list.push({ c: c.c || 'projects', t: c.t || 'My prompt', d: c.d || '', p: String(c.p || '').split('{{head}}').join(head), pages: c.pages || [], custom: true, id: c.id, slug: P.slugOf(c.t) }); });
  return list;
}
function cmdPrompts() {
  var sub = (pos.shift() || 'list').toLowerCase(); var d = read('prompts') || { custom: [], overrides: {}, hidden: [] };
  d.custom = d.custom || []; d.overrides = d.overrides || {}; d.hidden = d.hidden || [];
  if (sub === 'list') return out(['## My prompts (' + d.custom.length + ')'].concat(d.custom.length ? d.custom.map(function (c) { return '- [' + c.id + '] ' + c.t + ' · ' + (c.c || 'projects') + (c.d ? ' — ' + c.d : ''); }) : ['_none yet — prompts add "Title" --cat daily --text "…" (or --file prompt.md)_']).concat(Object.keys(d.overrides).length ? ['', '## Edited built-ins', Object.keys(d.overrides).map(function (k) { return '- ' + k; }).join('\n')] : []).concat(d.hidden.length ? ['', '## Hidden built-ins: ' + d.hidden.join(', ')] : []).concat(['', '_Built-ins: prompts builtin · full text: prompts show <title or /slug> · slash commands: prompts export_']), d);
  if (sub === 'builtin' || sub === 'builtins' || sub === 'all') {
    var all = allPrompts(flags.mode); var L = ['# Guide prompts · ' + WS.title + ' · ' + (flags.mode === 'chat' ? 'chat' : 'files') + ' mode', ''];
    P.CATS.forEach(function (c) { var g = all.filter(function (x) { return x.c === c[0]; }); if (!g.length) return; L.push('## ' + c[1] + ' (' + g.length + ')' + (c[0] === 'setup' || c[0] === 'fix' ? ' — in Guide → Settings' : '')); g.forEach(function (x) { L.push('- **' + x.t + '** · /' + x.slug + (x.custom ? ' · mine' : x.overridden ? ' · edited' : '') + (x.d ? ' — ' + x.d : '')); }); L.push(''); });
    L.push('Full text: `prompts show <title or /slug> [--mode chat|files]`. Slash commands: `prompts export [--for claude|cursor|codex]`. Chat bootstrap: `prompts export --for chat`.');
    return out(L, all.map(function (x) { return { t: x.t, slug: x.slug, c: x.c, d: x.d, pages: x.pages, custom: !!x.custom, overridden: !!x.overridden }; }));
  }
  if (sub === 'show') {
    var all2 = allPrompts(flags.mode); var q = pos.join(' ').trim().toLowerCase().replace(/^\//, ''); if (!q) fail('Which prompt? A title, part of it, or /slug. See: prompts builtin');
    var x = all2.filter(function (p) { return p.id === q || p.slug === q || p.t.toLowerCase() === q; })[0] || all2.filter(function (p) { return p.t.toLowerCase().indexOf(q) >= 0; })[0];
    if (!x) fail('No prompt matches "' + q + '". See: prompts builtin');
    return out(['# ' + x.t + (x.slug ? ' · /' + x.slug : '') + ' · ' + (flags.mode === 'chat' ? 'chat' : 'files') + ' mode', '', x.d || '', '', x.p], x);
  }
  if (sub === 'export') return exportPrompts();
  if (sub === 'add') {
    var title = pos.join(' ').trim() || flags.title; var text = flags.file ? fs.readFileSync(path.resolve(flags.file), 'utf8') : (flags.text || '');
    if (!title || !text) fail('Usage: prompts add "Title" --text "…" | --file prompt.md [--cat daily|weekly|projects|content|fix] [--desc "one line"]\n  {{head}} = agent preamble, {{snapshot}} = your data (chat mode), <blank> = a field to fill');
    var c = { id: 'c' + Date.now().toString(36), t: title, d: flags.desc || '', p: text, c: flags.cat || 'projects', pages: [] }; d.custom.push(c); write('prompts', d);
    return out('✓ Prompt [' + c.id + '] ' + title + ' added to ' + c.c + ' — it shows in the Guide on every page (prompts export adds it as /' + P.slugOf(title) + ')', c);
  }
  if (sub === 'edit') { var e = find(d.custom, pos.join(' '), 'prompt'); if (flags.title) e.t = flags.title; if (flags.desc !== undefined) e.d = flags.desc; if (flags.cat) e.c = flags.cat; if (flags.text) e.p = flags.text; if (flags.file) e.p = fs.readFileSync(path.resolve(flags.file), 'utf8'); write('prompts', d); return out('✓ [' + e.id + '] ' + e.t + ' updated', e); }
  if (sub === 'rm') { var r = find(d.custom, pos.join(' '), 'prompt'); d.custom = d.custom.filter(function (c) { return c.id !== r.id; }); write('prompts', d); return out('✓ Deleted [' + r.id + '] ' + r.t, r); }
  if (sub === 'restore') { d.hidden = []; d.overrides = flags.all ? {} : d.overrides; write('prompts', d); return out('✓ Built-in prompts restored' + (flags.all ? ' (edits cleared too)' : ''), d); }
  fail('Unknown prompts command "' + sub + '". Try: builtin, show, export, list, add, edit, rm, restore');
}
// prompts export: every prompt as a slash command for the agent that runs commands, or the chat bootstrap.
// Only files carrying the generated marker are overwritten or removed; a hand-written command with the same name is left alone.
function exportPrompts() {
  if (!P) fail('core/prompts.js is missing');
  var tool = String(flags['for'] || 'claude').toLowerCase();
  if (tool === 'chat' || tool === 'bootstrap') {
    var bf = path.resolve(flags.out || path.join(ROOT, 'prompts', 'agent-bootstrap.md')); fs.mkdirSync(path.dirname(bf), { recursive: true });
    fs.writeFileSync(bf, '# Paste this once into a ChatGPT or Claude Project (no file access needed)\n\n<!-- ' + P.MARK + ' -->\n\n' + P.bootstrap(promptOpts('chat')) + '\n\nReady? I will paste my snapshot next.\n');
    return out('✓ ' + path.relative(ROOT, bf) + ' written (the Guide\'s "Set up this chat" prompt, as a file)', { file: bf });
  }
  var dirs = { claude: path.join(ROOT, '.claude', 'commands'), cursor: path.join(ROOT, '.cursor', 'commands'), codex: path.join(process.env.CODEX_HOME || path.join(require('os').homedir(), '.codex'), 'prompts') };
  if (!dirs[tool]) fail('--for must be claude (default), cursor, codex or chat');
  var dir = path.resolve(flags.out || dirs[tool]); fs.mkdirSync(dir, { recursive: true });
  var all = allPrompts('files', { folder: '' }).filter(function (x) { return (x.c !== 'setup' || x.slug === 'setup') && x.slug; });   // no absolute path: a slash command runs inside the folder
  var written = [], kept = [], removed = []; var o = promptOpts('files'); o.folder = ''; var rel = path.relative(ROOT, dir); if (rel.indexOf('..') === 0) rel = dir;
  // The shared files are always the built-in text (they are committed with the code). Your own prompts AND your edits of
  // built-ins go to mine/ (git-ignored): /mine:use-inspo is your version, /use-inspo stays the built-in.
  var pristine = P.build(o).filter(function (x) { return (x.c !== 'setup' || x.slug === 'setup') && x.slug; });
  var mine = all.filter(function (x) { return x.custom || x.overridden; });
  var mineDir = path.join(dir, 'mine'); if (mine.length) fs.mkdirSync(mineDir, { recursive: true });
  pristine.concat(mine).forEach(function (x) { var isMine = x.custom || x.overridden; var f = path.join(isMine ? mineDir : dir, x.slug + '.md'); var prev = ''; try { prev = fs.readFileSync(f, 'utf8'); } catch (e) { /* new */ } if (prev && prev.indexOf(P.MARK) < 0) { kept.push(x.slug); return; } fs.writeFileSync(f, P.command(x, o, tool)); written.push((isMine ? 'mine/' : '') + x.slug); });
  [dir, mineDir].forEach(function (d, isMine) { var names = []; try { names = fs.readdirSync(d); } catch (e) { return; } names.forEach(function (n) { if (!/\.md$/.test(n)) return; var slug = n.slice(0, -3); if ((isMine ? mine : pristine).some(function (x) { return x.slug === slug; })) return; var t = ''; try { t = fs.readFileSync(path.join(d, n), 'utf8'); } catch (e) { return; } if (t.indexOf(P.MARK) >= 0) { fs.unlinkSync(path.join(d, n)); removed.push((isMine ? 'mine/' : '') + slug); } }); });
  return out(['✓ ' + written.length + ' slash command' + (written.length === 1 ? '' : 's') + ' for ' + tool + ' in ' + rel + '/ (workspace ' + WS_ID + ')', '  ' + written.filter(function (s) { return s.indexOf('mine/') !== 0; }).map(function (s) { return '/' + s; }).join(' ')].concat(written.some(function (s) { return s.indexOf('mine/') === 0; }) ? ['  yours, in ' + rel + '/mine/ (git-ignored): ' + written.filter(function (s) { return s.indexOf('mine/') === 0; }).map(function (s) { return '/' + s.slice(5); }).join(' ')] : []).concat(kept.length ? ['  kept your own: ' + kept.join(', ')] : []).concat(removed.length ? ['  removed stale: ' + removed.join(', ')] : []).concat(tool === 'claude' ? ['Type /standup in Claude Code opened in this folder. Re-run after editing prompts.'] : tool === 'codex' ? ['Codex loads these on start; restart it once.'] : []), { dir: dir, written: written, kept: kept, removed: removed });
}

/* ---- boards -------------------------------------------------------------- */
function cmdBoards() {
  var sub = (pos.shift() || 'list').toLowerCase();
  var rt = read('boards') || { boards: [] }; rt.boards = Array.isArray(rt.boards) ? rt.boards : [];
  if (sub === 'list') return out(['## Boards (' + BOARDS.length + ')'].concat(BOARDS.map(function (b) {
    var bt = board(b.id).tasks; var dn = bt.filter(function (t) { return t.col === 'done'; }).length; var tot = bt.filter(function (t) { return ['todo', 'doing', 'done'].indexOf(t.col) >= 0; }).length;
    return '- [' + b.id + '] ' + b.title + ' · ' + dn + '/' + tot + ' done · ' + bt.length + ' tasks' + (b.id === BOARD_ID ? ' (default)' : '') + (fs.existsSync(fileOf(prefix() + b.id)) ? '' : ' · no data file yet');
  })), BOARDS);
  if (sub === 'add') {
    var title = pos.join(' ').trim() || flags.title; if (!title) fail('Usage: boards add "Title" [--from blank|sample|<board id>]');
    var id = slug(title); if (!id || RESERVED.indexOf(id) >= 0) fail('Pick a different name.');
    if (BOARDS.some(function (b) { return b.id === id; })) fail('Board "' + id + '" already exists.');
    if (fs.existsSync(fileOf(prefix() + id)) && !flags.force) fail('data/' + prefix() + id + '.json already exists. Re-run with --force to replace it, or pick another name.');
    var from = (flags.from || 'blank').toLowerCase(); var tasks = [];
    if (from === 'sample') { if (!T) fail('core/templates.js missing'); tasks = T.runway().tasks; }
    else if (from !== 'blank') { var src = BOARDS.filter(function (b) { return b.id === slug(from); })[0]; if (!src) fail('No board "' + from + '" to copy.'); tasks = board(src.id).tasks.map(function (t) { return Object.assign({}, t, { id: newId('t') }); }); }
    rt.boards.push({ id: id, title: title, sprintLabel: 'Progress', milestones: [], focus: [], createdAt: Date.now(), ws: WS_ID });
    write('boards', rt); write(prefix() + id, { projects: [], tasks: tasks });
    return out('✓ Board [' + id + '] ' + title + ' created with ' + tasks.length + ' task' + (tasks.length === 1 ? '' : 's') + ' → data/' + prefix() + id + '.json\n  use it: node solo.js week --board ' + id + (WS_ID === PRIMARY ? '' : ' --ws ' + WS_ID) + '   ·   open: runway/marathon-board.html?ws=' + WS_ID + '&board=' + id, { id: id, title: title, tasks: tasks.length });
  }
  if (sub === 'rename') {
    var bid = slug(pos.shift()); var nt = pos.join(' ').trim(); if (!bid || !nt) fail('Usage: boards rename <id> "New title"');
    var meta = BOARDS.filter(function (b) { return b.id === bid; })[0]; if (!meta) fail('No board "' + bid + '".');
    var hit = false; rt.boards = rt.boards.map(function (b) { if (slug(b.id || b.title) === bid && (b.ws || PRIMARY) === WS_ID) { hit = true; b.title = nt; } return b; });
    if (!hit) rt.boards.push(Object.assign({}, meta, { title: nt, ws: WS_ID }));
    write('boards', rt); return out('✓ [' + bid + '] → ' + nt + (cfg.boards && cfg.boards.some(function (b) { return slug(b.id || b.title) === bid; }) ? '  (overrides the title in solo.config.js)' : ''), { id: bid, title: nt });
  }
  if (sub === 'rm') {
    var rid = slug(pos.shift()); if (!rid) fail('Usage: boards rm <id>');
    if (BOARDS.length < 2) fail('Keep at least one board.');
    if (!flags.force) fail('This deletes data/' + rid + '.json. Re-run with --force.');
    rt.boards = rt.boards.filter(function (b) { return !(slug(b.id || b.title) === rid && (b.ws || PRIMARY) === WS_ID); }); write('boards', rt);
    try { fs.unlinkSync(fileOf(prefix() + rid)); } catch (e) { /* none */ }
    return out('✓ Board [' + rid + '] removed' + (cfg.boards && cfg.boards.some(function (b) { return slug(b.id || b.title) === rid; }) ? ' (it is still listed in solo.config.js — remove it there too)' : ''), { id: rid });
  }
  fail('Unknown boards command "' + sub + '". Try: list, add, rename, rm');
}
function cmdWorkspaces() {
  var sub = (pos.shift() || 'list').toLowerCase(); var rt = read('workspaces') || { workspaces: [] }; rt.workspaces = Array.isArray(rt.workspaces) ? rt.workspaces : [];
  if (sub === 'list') return out(['## Workspaces (' + WORKSPACES.length + ')'].concat(WORKSPACES.map(function (w) {
    var apps = ['boards'].filter(function () { return w.boards.length; }).concat(['social', 'scripts', 'writing'].filter(function (a) { return w.apps[a]; }));
    return '- [' + w.id + '] ' + w.title + ' · ' + apps.join(', ') + (w.boards.length ? ' · boards: ' + w.boards.map(function (b) { return b.id; }).join(', ') : '') + (w.id === WS_ID ? ' (default)' : '') + (w.id === PRIMARY ? ' · files: short names' : ' · files: ' + w.id + '-*.json');
  })), WORKSPACES);
  if (sub === 'add') {
    var title = pos.join(' ').trim() || flags.title; if (!title) fail('Usage: workspaces add "Title" [--apps social,scripts,writing] [--boards "Launch,Ops"] [--sample]');
    var id = slug(title); if (!id || RESERVED.indexOf(id) >= 0 || WORKSPACES.some(function (w) { return w.id === id; })) fail('Pick a different name.');
    var apps = flags.apps === undefined ? ['boards', 'social', 'scripts', 'writing'] : split(flags.apps);
    var boards = (flags.boards === undefined ? (apps.indexOf('boards') >= 0 ? ['Board'] : []) : split(flags.boards)).map(function (t) { return { id: slug(t), title: t, sprintLabel: 'Progress', milestones: [], focus: [] }; });
    var w = { id: id, title: title, apps: { social: apps.indexOf('social') >= 0, scripts: apps.indexOf('scripts') >= 0, writing: apps.indexOf('writing') >= 0 }, boards: boards, createdAt: Date.now() };
    rt.workspaces.push(w); write('workspaces', rt);
    var sample = !!flags.sample; var now = new Date(); var pre = id + '-';
    boards.forEach(function (b, i) { write(pre + b.id, { projects: [], tasks: sample && i === 0 && T ? T.runway().tasks : [] }, { noActivity: true }); });
    if (w.apps.social) write(pre + 'social', { posts: sample && T ? T.social(now).posts : [] }, { noActivity: true });
    if (w.apps.scripts) write(pre + 'scripts', sample && T ? T.scripts(now) : { activeId: '', scripts: [] }, { noActivity: true });
    if (w.apps.writing) write(pre + 'writing', sample && T ? T.writing(now) : { activeId: '', notes: [] }, { noActivity: true });
    return out('✓ Workspace [' + id + '] ' + title + ' created (' + apps.join(', ') + (sample ? ', sample content' : ', blank') + ')\n  use it: node solo.js week --ws ' + id + '   ·   open: index.html?ws=' + id, w);
  }
  if (sub === 'rename') { var wid = slug(pos.shift()); var nt = pos.join(' ').trim(); if (!wid || !nt) fail('Usage: workspaces rename <id> "Title"'); var meta = WORKSPACES.filter(function (w) { return w.id === wid; })[0]; if (!meta) fail('No workspace "' + wid + '".'); var hit = false; rt.workspaces = rt.workspaces.map(function (w) { if (slug(w.id || w.title) === wid) { hit = true; w.title = nt; } return w; }); if (!hit) rt.workspaces.push(Object.assign({}, meta, { title: nt })); write('workspaces', rt); return out('✓ [' + wid + '] → ' + nt, { id: wid, title: nt }); }
  if (sub === 'rm') { var rid = slug(pos.shift()); if (!rid) fail('Usage: workspaces rm <id>'); if (WORKSPACES.length < 2) fail('Keep at least one workspace.'); rt.workspaces = rt.workspaces.filter(function (w) { return slug(w.id || w.title) !== rid; }); write('workspaces', rt); return out('✓ Workspace [' + rid + '] removed (its data/' + rid + '-*.json files are kept)', { id: rid }); }
  fail('Unknown workspaces command "' + sub + '". Try: list, add, rename, rm');
}
function cmdLog() {
  var n = parseInt(flags.n || pos[0], 10) || 30; var recs = readLog().slice(-n).reverse();
  out(['# Recent changes (' + recs.length + ')', ''].concat(recs.length ? recs.map(function (r) {
    return '- `' + r.id + '` ' + localStamp(r.ts) + ' · ' + r.source + ' · ' + r.file + (r.note ? ' · ' + r.note : '') + (r.prev == null ? ' · (no snapshot)' : '');
  }) : ['_nothing logged yet — changes made through node serve.js, the CLI and agents land here_']), recs.map(function (r) { return { id: r.id, ts: r.ts, file: r.file, source: r.source, note: r.note, canRevert: r.prev != null }; }));
}
function cmdRevert() {
  var id = pos[0]; if (!id) fail('Usage: revert <log id>   (ids from: node solo.js log)');
  var rec = readLog().filter(function (r) { return r.id === id; })[0];
  if (!rec) fail('No log entry "' + id + '".'); if (rec.prev == null) fail('Entry ' + id + ' has no snapshot (file was new or too large).');
  var target = fileOf(rec.file.replace(/\.json$/, '')); var cur = ''; try { cur = fs.readFileSync(target, 'utf8'); } catch (e) { /* none */ }
  logChange(rec.file, cur, 'revert of ' + id);
  var restored = rec.prev; try { var o = JSON.parse(rec.prev); o.updatedAt = new Date().toISOString(); restored = JSON.stringify(o, null, 2) + '\n'; } catch (e) { /* raw */ }
  fs.writeFileSync(target, restored);
  out('✓ Reverted data/' + rec.file + ' to how it was before ' + localStamp(rec.ts) + ' (' + rec.source + (rec.note ? ': ' + rec.note : '') + ')', { file: rec.file });
}
function cmdActivity() {
  var s = activitySummary(); var a = read('activity') || { days: {} };
  var days = Object.keys(a.days || {}).sort().slice(-14);
  out(['# Activity', '', activityLine(), ''].concat(days.length ? days.map(function (d) { return '- ' + d + ': ' + Object.keys(a.days[d]).map(function (k) { return k + ' ×' + a.days[d][k]; }).join(', '); }) : ['_nothing logged yet_']), s);
}

/* ---- backup: data/ as its own private git repo ---------------------------- */
// data/backup.json: where the copy folder, its last run and the guard's --allow-data decision live. Its own file on purpose:
// the pages mirror settings.json (theme) and would overwrite anything else kept there.
function backupCfg() { var b = read('backup') || {}; return { to: b.to || '', lastAt: b.lastAt || '', guard: b.guard || null }; }
function saveBackupCfg(b) { var o = { to: b.to || '', lastAt: b.lastAt || '' }; if (b.guard) o.guard = b.guard; write('backup', o, { noLog: true, noActivity: true }); }
function whenLocal(iso) { if (!iso) return 'never'; var d = new Date(iso); if (isNaN(d)) return iso; var m = Math.round((Date.now() - d.getTime()) / 60000); var ago = m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' day' + (Math.round(m / 1440) === 1 ? '' : 's') + ' ago'; return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + ' (' + ago + ')'; }
function expandHome(p) { return path.resolve(String(p).replace(/^~(?=\/|$)/, require('os').homedir())); }
// Plain copy of data/ into a folder that syncs (iCloud Drive, Dropbox, Google Drive): no git, no log, no safety copies.
function copyToFolder(dest) {
  fs.mkdirSync(dest, { recursive: true }); var n = 0;
  fs.cpSync(DATA, dest, { recursive: true, dereference: true, filter: function (src) { var rel = path.relative(DATA, src); if (!rel) return true; if (/^(\.git|log\.jsonl|exports)(\/|$)/.test(rel) || /\.(file-)?backup-[\d-]+\.json$/.test(rel)) return false; try { if (fs.statSync(src).isFile()) n++; } catch (e) { /* skip */ } return true; } });
  return n;
}
function exampleFolder() { var h = require('os').homedir(); return process.platform === 'darwin' ? path.join(h, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Solo Ops backup') : path.join(h, 'Dropbox', 'Solo Ops backup'); }
function cmdBackup() {
  var cp = require('child_process'); var sub = (pos[0] || '').toLowerCase();
  function git(args, opts) { try { return cp.execFileSync('git', ['-C', DATA].concat(args), Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts || {})).trim(); } catch (e) { if (opts && opts.soft) return null; fail('git ' + args.join(' ') + ' failed: ' + ((e.stderr || e.message) + '').trim()); } }
  fs.mkdirSync(DATA, { recursive: true });
  var isRepo = fs.existsSync(path.join(DATA, '.git')); var B = backupCfg(); var folder = B.to || '';
  if (flags.status) {
    var L = []; var o = { repo: isRepo, folder: folder || null, folderAt: B.lastAt || null };
    if (isRepo) { var remote = git(['remote', 'get-url', 'origin'], { soft: true }); var last = git(['log', '-1', '--format=%ci %s'], { soft: true }); var dirty = git(['status', '--porcelain'], { soft: true }); L.push('data/ is a git repo', '- remote: ' + (remote || 'none (local commits only)'), '- last backup: ' + (last || 'none'), '- changes since: ' + (dirty ? dirty.split('\n').length + ' file(s)' : 'none')); Object.assign(o, { remote: remote, last: last, dirty: !!dirty }); }
    if (folder) L.push('copy folder: ' + folder, '- last copy: ' + whenLocal(B.lastAt));
    if (!isRepo && !folder) L.push('No backup yet: your data lives only on this computer. Run: node solo.js backup setup');
    return out(L, o);
  }
  if (flags.daily) return backupDaily();
  if (sub === 'setup') { pos.shift(); return backupSetup(); }
  if (flags.to !== undefined) {
    if (flags.to === true || !String(flags.to).trim()) fail('--to needs a folder, e.g. --to "' + exampleFolder() + '"');
    folder = expandHome(flags.to); var relTo = path.relative(ROOT, folder);
    if (!relTo || relTo.indexOf('..') !== 0) fail('Pick a folder outside the Solo Ops folder (' + folder + ' is inside it). A folder that syncs, e.g. --to "' + exampleFolder() + '"');
    B.to = folder;
  }
  // nothing configured and nothing asked for: explain the ways instead of silently making a local-only repo
  if (!isRepo && !folder && !flags.remote) return out(['No backup set up yet: your data lives only on this computer.', 'Pick one:', '  node solo.js backup setup                   # easiest: a private GitHub repo via gh, or it tells you the other ways', '  node solo.js backup --remote <private url>  # a private repo you already created', '  node solo.js backup --to <folder>           # a plain copy into a folder that syncs (iCloud Drive, Dropbox)', 'Then once: node solo.js backup --daily', 'Nothing was copied.'], { repo: false, folder: null, next: 'setup' });
  var results = []; var res = { folder: folder || null };
  if (folder) { B.lastAt = new Date().toISOString(); saveBackupCfg(B); var n = copyToFolder(folder); results.push('✓ Copied ' + n + ' file(s) to ' + folder); res.copied = n; }
  var tail = ['  Status: node solo.js backup --status · every day: node solo.js backup --daily'];
  if (!isRepo && !flags.remote) return out(results.concat(tail).join('\n'), res);
  var wanted = flags.remote ? String(flags.remote) : (isRepo ? (git(['remote', 'get-url', 'origin'], { soft: true }) || '') : '');
  // never push someone's tasks to a public repo: GitHub remotes are checked first, before anything is created
  githubVisibility(wanted, function (vis) {
    if (vis === 'public' && !flags['allow-public']) fail('Refusing: ' + wanted + ' is a PUBLIC repository. Your data would be visible to everyone. Make it private (gh repo edit --visibility private) or use another remote. (--allow-public overrides, on purpose only.)');
    if (!isRepo) {
      git(['init', '-q']); fs.writeFileSync(path.join(DATA, '.gitignore'), 'log.jsonl\n*.backup-*.json\nexports/\n');
      try { cp.execFileSync('git', ['-C', DATA, 'config', 'user.name'], { stdio: 'ignore' }); } catch (e) { git(['config', 'user.name', 'Solo Ops']); git(['config', 'user.email', 'solo-ops@localhost']); }
    }
    if (flags.remote) { if (git(['remote', 'get-url', 'origin'], { soft: true })) git(['remote', 'set-url', 'origin', String(flags.remote)]); else git(['remote', 'add', 'origin', String(flags.remote)]); }
    git(['add', '-A']);
    var changed = git(['status', '--porcelain'], { soft: true });
    var msg = 'backup ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
    if (changed) git(['commit', '-q', '-m', msg]);
    var remoteUrl = git(['remote', 'get-url', 'origin'], { soft: true }); var pushed = '';
    if (remoteUrl) { var branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { soft: true }) || 'main'; var r = git(['push', '-u', 'origin', branch], { soft: true }); pushed = r === null ? 'push FAILED — check the remote URL and your access (is the repo private and yours?)' : 'pushed to ' + remoteUrl + (vis === 'private' ? ' (private ✓)' : vis === '' ? '' : ' (visibility: ' + vis + ')'); }
    results.push('✓ ' + (changed ? 'Committed ' + changed.split('\n').length + ' file(s): ' + msg : 'Nothing new to commit') + (remoteUrl ? '\n  ' + pushed : '\n  No remote yet — add one with: node solo.js backup --remote <private repo url>') + '\n  Backups never include log.jsonl.');
    out(results.concat(tail).join('\n'), Object.assign(res, { committed: !!changed, remote: remoteUrl, visibility: vis, pushed: !!(remoteUrl && pushed.indexOf('FAILED') < 0) }));
  });
}
// backup setup: the one command an agent (or a person) runs on first day. GitHub CLI logged in → a PRIVATE repo
// solo-ops-data is created (or reused) and data/ pushed there. Otherwise it prints the two other ways, both private.
function backupSetup() {
  var cp = require('child_process'); var B = backupCfg(); var isRepo = fs.existsSync(path.join(DATA, '.git')); var remote = '';
  if (isRepo) { try { remote = cp.execFileSync('git', ['-C', DATA, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { remote = ''; } }
  if ((isRepo && remote) || B.to) return out(['✓ Backup is already set up.', remote ? '- private repo: ' + remote : '', B.to ? '- copy folder: ' + B.to + ' (last ' + whenLocal(B.lastAt) + ')' : '', 'Run `node solo.js backup` any time; `node solo.js backup --daily` schedules it.'].filter(Boolean), { done: true, remote: remote || null, folder: B.to || null });
  var gh = false; if (!flags['no-github']) { try { cp.execFileSync('gh', ['auth', 'status'], { stdio: 'ignore', timeout: 8000 }); gh = true; } catch (e) { gh = false; } }
  if (gh) {
    var name = String(flags.name || 'solo-ops-data'); var info = null;
    function view() { try { return JSON.parse(cp.execFileSync('gh', ['repo', 'view', name, '--json', 'url,isPrivate,nameWithOwner'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 })); } catch (e) { return null; } }
    info = view();
    if (info && !info.isPrivate) fail('A repo called ' + name + ' already exists in your GitHub account and it is PUBLIC. Make it private (gh repo edit ' + info.nameWithOwner + ' --visibility private) or pick another name: node solo.js backup setup --name <name>');
    if (!info) { try { cp.execFileSync('gh', ['repo', 'create', name, '--private'], { stdio: 'ignore', timeout: 30000 }); } catch (e) { fail('Could not create a private repo with gh (' + ((e.stderr || e.message) + '').trim().split('\n')[0] + '). Create it at https://github.com/new (Private) and run: node solo.js backup --remote <its url>'); } info = view(); if (!info) fail('Created ' + name + ' but could not read it back; run: node solo.js backup --remote https://github.com/<you>/' + name + '.git'); }
    if (!JSON_OUT) process.stdout.write('✓ Private GitHub repo ' + info.nameWithOwner + '\n');
    flags.remote = info.url.replace(/\/?$/, '.git'); return cmdBackup();
  }
  return out(['No backup yet: your data lives only on this computer. Two ways, both private:', '',
    '1) GitHub (recommended if you have an account)',
    '   Create a PRIVATE repository at https://github.com/new — name it solo-ops-data, tick Private — then run:',
    '   node solo.js backup --remote https://github.com/<your-username>/solo-ops-data.git   (the address GitHub shows on the new repo page)',
    '   Have the GitHub app for the terminal (gh)? Run `gh auth login` once, then `node solo.js backup setup` creates the private repo for you.', '',
    '2) No GitHub: a folder that syncs (iCloud Drive, Dropbox, Google Drive)',
    '   node solo.js backup --to "' + exampleFolder() + '"', '',
    'Either way, finish with:  node solo.js backup --daily'], { done: false, gh: false, options: ['remote', 'folder'], exampleFolder: exampleFolder() });
}
// backup --daily: run `node solo.js backup` every day at --hour (default 21). launchd on macOS, crontab elsewhere; Windows gets the command to paste.
function backupDaily() {
  var cp = require('child_process'); var node = process.execPath; var script = path.join(ROOT, 'solo.js'); var home = require('os').homedir(); var hour = flags.hour === undefined ? 21 : parseInt(flags.hour, 10); if (isNaN(hour) || hour < 0 || hour > 23) fail('--hour must be 0–23 (the hour of the day the backup runs; default 21)'); var hh = (hour < 10 ? '0' : '') + hour;
  function x(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  if (process.platform === 'darwin') {
    var dir = path.join(home, 'Library', 'LaunchAgents'); var plist = path.join(dir, 'com.solo-ops.backup.plist');
    function shq1(t) { return "'" + String(t).replace(/'/g, "'\\''") + "'"; }
    var shell = 'PATH=' + shq1(path.dirname(node)) + ':/opt/homebrew/bin:/usr/local/bin:$PATH; exec node ' + shq1(script) + ' backup';
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n  <key>Label</key><string>com.solo-ops.backup</string>\n  <key>ProgramArguments</key><array><string>/bin/sh</string><string>-c</string><string>' + x(shell) + '</string></array>\n  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>' + hour + '</integer><key>Minute</key><integer>0</integer></dict>\n  <key>StandardOutPath</key><string>/tmp/solo-ops-backup.log</string>\n  <key>StandardErrorPath</key><string>/tmp/solo-ops-backup.log</string>\n</dict></plist>\n';
    if (flags['dry-run']) return out(['Would write ' + plist + ' and load it with launchctl:', '', xml], { plist: plist, xml: xml, dryRun: true });
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(plist, xml);
    try { cp.execFileSync('launchctl', ['unload', plist], { stdio: 'ignore' }); } catch (e) { /* not loaded yet */ }
    try { cp.execFileSync('launchctl', ['load', plist], { stdio: 'ignore' }); } catch (e) { return out('Wrote ' + plist + ' but launchctl load failed; it loads at your next login. Log: /tmp/solo-ops-backup.log', { plist: plist, loaded: false }); }
    return out('✓ Daily backup at ' + hh + ':00 (launchd: ' + plist + '). Log: /tmp/solo-ops-backup.log · remove: launchctl unload "' + plist + '" && rm "' + plist + '"', { plist: plist, loaded: true, hour: hour });
  }
  if (process.platform === 'win32') return out(['Windows: create the task with this one line (PowerShell or cmd):', '  schtasks /Create /SC DAILY /ST ' + hh + ':00 /TN "Solo Ops backup" /TR "\\"' + node + '\\" \\"' + script + '\\" backup"'], { manual: true, hour: hour });
  function shq(t) { return "'" + String(t).replace(/'/g, "'\\''") + "'"; }
  var line = '0 ' + hour + ' * * * cd ' + shq(ROOT) + ' && PATH=' + shq(path.dirname(node)) + ':/usr/local/bin:$PATH node solo.js backup >> /tmp/solo-ops-backup.log 2>&1 # solo-ops';
  if (flags['dry-run']) return out(['Would add to your crontab:', '  ' + line], { line: line, dryRun: true });
  var cur = ''; try { cur = cp.execFileSync('crontab', ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { cur = ''; }
  if (cur.indexOf('# solo-ops') >= 0) return out('✓ Daily backup is already in your crontab (the line marked # solo-ops).', { line: line, existed: true });
  try { cp.execFileSync('crontab', ['-'], { input: cur.replace(/\n?$/, cur ? '\n' : '') + line + '\n' }); } catch (e) { fail('Could not write your crontab (' + e.message.split('\n')[0] + '). Add this line yourself with crontab -e:\n  ' + line); }
  return out('✓ Daily backup at ' + hh + ':00 (crontab, the line marked # solo-ops). Log: /tmp/solo-ops-backup.log', { line: line, hour: hour });
}
// 'public' | 'private' | 'unknown' | '' (not GitHub). Unauthenticated: a private repo answers 404, so 404 = private-or-missing.
// strict: for decisions that let data into a repo. An unauthenticated 404 (private-or-missing) then counts as 'unknown'.
function githubVisibility(remote, cb, strict) {
  var m = String(remote || '').match(/github\.com[:\/]([^\/\s]+)\/([^\/\s]+?)(?:\.git)?\/?$/); if (!m) return cb('');
  try { var o = require('child_process').execFileSync('gh', ['repo', 'view', m[1] + '/' + m[2], '--json', 'isPrivate'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 6000 }); return cb(JSON.parse(o).isPrivate ? 'private' : 'public'); } catch (e) { /* no gh or no access: ask the public API */ }
  var req = require('https').get({ host: 'api.github.com', path: '/repos/' + m[1] + '/' + m[2], headers: { 'User-Agent': 'solo-ops', Accept: 'application/vnd.github+json' }, timeout: 5000 }, function (res) {
    var b = ''; res.on('data', function (c) { b += c; }); res.on('end', function () { if (res.statusCode === 200) { try { cb(JSON.parse(b).private ? 'private' : 'public'); } catch (e) { cb('unknown'); } } else if (res.statusCode === 404) cb(strict ? 'unknown' : 'private'); else cb('unknown'); });
  });
  req.on('timeout', function () { req.destroy(); cb('unknown'); }); req.on('error', function () { cb('unknown'); });
}

/* ---- doctor: is the data folder healthy? ---------------------------------- */
/* ---- guard: the user's content never enters this code repo ----------------- */
// Paths that hold the user's own content. Staging any of them fails the guard.
var PRIVATE_PATHS = [/^data\/(?!SCHEMA\.md$)/, /\.(file-)?backup-[\d-]+\.json$/, /^\.claude\/commands\/mine\//, /^\.cursor\/commands\/mine\//, /^solo-ops-backup-.*\.json$/];
function cmdGuard() {
  var cp = require('child_process');
  if (!fs.existsSync(path.join(ROOT, '.git'))) fail('Not a git repository: nothing to guard.');
  if (flags.install) {
    var hook = path.join(ROOT, '.git', 'hooks', 'pre-commit'); var cur = ''; try { cur = fs.readFileSync(hook, 'utf8'); } catch (e) { /* none */ }
    if (/solo\.js"? guard/.test(cur)) return out('✓ pre-commit hook already runs `node solo.js guard`', { installed: true });
    fs.mkdirSync(path.dirname(hook), { recursive: true });
    fs.writeFileSync(hook, (cur.trim() ? cur.replace(/\n?$/, '\n') : '#!/bin/sh\n') + '# Solo Ops: never commit the user\'s content (data/, exports, personal prompts). Only a human bypasses this (--no-verify).\nnode "$(git rev-parse --show-toplevel)/solo.js" guard || exit 1\n'); fs.chmodSync(hook, 493);
    return out('✓ pre-commit hook installed: every commit runs `node solo.js guard` (a human can bypass with --no-verify; agents never do)', { installed: true });
  }
  function rootRemote() { try { return cp.execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return ''; } }
  var B = backupCfg(); var G = B.guard || {};
  // --allow-data: only for someone's own PRIVATE fork. Checks GitHub visibility; a public or unknown remote keeps the block.
  if (flags['allow-data']) {
    var rem = rootRemote(); if (!rem) fail('This repository has no remote yet, so there is nothing to check. Add a PRIVATE remote first, or keep your content in its own private place: node solo.js backup setup');
    return githubVisibility(rem, function (vis) {
      if (vis !== 'private') fail((vis === 'public' ? rem + ' is PUBLIC.' : 'Could not confirm that ' + rem + ' is private' + (vis === '' ? ' (not a GitHub remote)' : ' (log in with `gh auth login` so GitHub can be asked, and make sure the repo exists)') + '.') + ' Your content stays out of it. Make the repo private first, or use: node solo.js backup setup');
      B.guard = { allowData: true, remote: rem, at: new Date().toISOString() }; saveBackupCfg(B);
      out(['✓ ' + rem + ' is private. The guard now lets data/ through while this remote stays the origin.', 'Last step, by hand: in .gitignore replace the line `data/*` with `data/log.jsonl` (and `data/exports/` if you like), then `git add data` and commit.', 'Point origin at a public repo and the guard blocks again — but commits already made stay in history, so never retarget this repo at a public remote.'], { allowed: true, remote: rem });
    }, true);
  }
  var staged = [];
  try { staged = cp.execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); } catch (e) { fail('git is not available here.'); }
  var allowed = !!(G.allowData && G.remote && G.remote === rootRemote());
  var bad = allowed ? [] : staged.filter(function (f) { return PRIVATE_PATHS.some(function (re) { return re.test(f); }); });
  // solo.config.js is shipped code; a staged copy with a name in `owner` is someone's personal setup
  if (!allowed && staged.indexOf('solo.config.js') >= 0) {
    var stagedCfg = ''; try { stagedCfg = cp.execFileSync('git', ['show', ':solo.config.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { /* unreadable: let it through */ }
    var sc = evalConfigText(stagedCfg);
    if (sc && String(sc.owner || '').trim()) {
      out(['✗ Not committing solo.config.js: its `owner` is "' + String(sc.owner).trim() + '", so this is your personal setup, and this repository is the Solo Ops code (public, like any fork).', '',
        'Your name belongs in data/settings.json, which git never sees:', '  node solo.js config set owner "' + String(sc.owner).trim() + '"        (any solo.config.js key works: config set <setting> <value>, or config set --file your.json)',
        'Then put the shipped file back:   git restore --staged solo.config.js && git restore solo.config.js', '  (a fork that already committed a name: git checkout upstream/main -- solo.config.js)'], { ok: false, blocked: ['solo.config.js'] });
      process.exit(1);
    }
  }
  // a shared slash command that carries an edited prompt is personal text too: it must equal the built-in export
  var po = promptOpts('files'); po.folder = '';
  var edited = P ? staged.filter(function (f) {
    var m = f.match(/^\.(claude|cursor)\/commands\/([a-z0-9-]+)\.md$/); if (!m) return false;
    var x = P.build(po).filter(function (y) { return y.slug === m[2]; })[0]; if (!x) return false;
    var have = ''; try { have = cp.execFileSync('git', ['show', ':' + f], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return false; }
    return have.indexOf(P.MARK) >= 0 && have !== P.command(x, po, m[1]);
  }) : [];
  if (edited.length && !allowed) { out(['✗ Not committing ' + edited.length + ' slash command' + (edited.length === 1 ? '' : 's') + ' that differ from the built-in text (your edit of a prompt is your content):'].concat(edited.map(function (b) { return '  - ' + b; })).concat(['', 'Run `node solo.js prompts export` (and `--for cursor`): the shared files go back to the built-in and your version lands in mine/ (git-ignored, /mine:<name>).']), { ok: false, blocked: edited }); process.exit(1); }
  if (bad.length) {
    out(['✗ Not committing ' + bad.length + ' file' + (bad.length === 1 ? '' : 's') + ': ' + (bad.length === 1 ? 'it is' : 'they are') + ' your content, and this repository is the Solo Ops code.'].concat(bad.map(function (b) { return '  - ' + b; })).concat(['',
      'Why: this repo is public, and so is any fork of it. Your tasks, posts and drafts should live where only you can read them.', '',
      'Do this instead:   node solo.js backup setup         (a private GitHub repo, or a folder that syncs — it tells you)',
      'Own private fork?  node solo.js guard --allow-data   (checks the remote is private, then lets data/ through)',
      'Unstage:           git restore --staged ' + bad.join(' ') + '   (no commits yet? git rm --cached ' + bad.join(' ') + ')']), { ok: false, blocked: bad });
    process.exit(1);
  }
  var warn = [];
  if (staged.indexOf('solo.config.js') >= 0) {   // other values that are usually personal: a warning, not a block (a shipped default may change on purpose)
    var headCfg = null, newCfg = null; try { headCfg = evalConfigText(cp.execFileSync('git', ['show', 'HEAD:solo.config.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); newCfg = evalConfigText(cp.execFileSync('git', ['show', ':solo.config.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch (e) { /* no HEAD yet */ }
    if (headCfg && newCfg) { var pick = function (c) { return JSON.stringify({ n: c.name, e: c.eyebrow, b: (c.boards || []).map(function (b) { return b && b.title; }), p: c.projects }); }; if (pick(headCfg) !== pick(newCfg)) { var sets = []; ['name', 'eyebrow'].forEach(function (k) { if (headCfg[k] !== newCfg[k]) sets.push(k + ' ' + JSON.stringify(newCfg[k])); }); (newCfg.boards || []).forEach(function (b) { var hb = (headCfg.boards || []).filter(function (x) { return x && b && x.id === b.id; })[0]; if (b && hb && hb.title !== b.title) sets.push('boards.' + b.id + '.title ' + JSON.stringify(b.title)); }); if (JSON.stringify(headCfg.projects) !== JSON.stringify(newCfg.projects)) sets.push('projects \'' + JSON.stringify(newCfg.projects || []) + '\''); warn.push('· solo.config.js changes ' + (sets.length ? sets.map(function (x) { return x.split(' ')[0]; }).join(', ') : 'name, eyebrow, board titles or projects') + '. Fine for a shipped default; if these are your own values, keep the file as shipped and set them with: node solo.js config set ' + (sets.join(' ') || '<setting> <value>')); } }
  }
  return out(['✓ guard: nothing personal in the ' + staged.length + ' staged file' + (staged.length === 1 ? '' : 's') + (allowed ? ' (data/ allowed: ' + G.remote + ' is private)' : '')].concat(warn), { ok: true, staged: staged.length, allowed: allowed, warnings: warn });
}

function cmdDoctor() {
  var issues = [], notes = [], files = []; var refs = {}; var browserOnly = 0;
  try { files = fs.readdirSync(DATA).filter(function (f) { return /\.json$/.test(f) && !/\.backup-/.test(f); }); } catch (e) { fail('No data/ folder yet. Run: node solo.js template all'); }
  var shapes = { social: 'posts', scripts: 'scripts', writing: 'notes', inspiration: 'items', boards: 'boards', workspaces: 'workspaces', activity: 'days', settings: 'theme', prompts: null, backup: null };
  files.forEach(function (f) {
    var txt, obj; try { txt = fs.readFileSync(path.join(DATA, f), 'utf8'); obj = JSON.parse(txt); } catch (e) { issues.push(f + ': not valid JSON (' + e.message.split('\n')[0] + ')'); return; }
    if (!obj || typeof obj !== 'object') { issues.push(f + ': not an object'); return; }
    if (!obj.updatedAt) issues.push(f + ': no updatedAt (sync cannot tell which side is newer)'); else if (isNaN(Date.parse(obj.updatedAt))) issues.push(f + ': updatedAt is not an ISO date');
    var base = f.replace(/\.json$/, ''); var kind = Object.keys(shapes).filter(function (k) { return base === k || base.slice(-k.length - 1) === '-' + k; })[0];
    var arrKey = kind ? shapes[kind] : 'tasks';
    if (kind === 'settings') { if (!obj.theme) issues.push(f + ': no theme'); var cp = CfgLib ? CfgLib.check(SHIPPED, obj.config) : []; cp.forEach(function (m) { issues.push(f + ': ' + m + ' (fix: node solo.js config set …; the page ignores it meanwhile)'); }); if (isObj(obj.config) && Object.keys(obj.config).length && !cp.length) notes.push(f + ': your settings: ' + Object.keys(obj.config).join(', ')); }
    else if (kind === 'activity') { if (!obj.days || typeof obj.days !== 'object') issues.push(f + ': no days map'); }
    else if (arrKey) {
      var arr = obj[arrKey]; if (!Array.isArray(arr)) { issues.push(f + ': expected an array "' + arrKey + '"'); return; }
      var seen = {}; arr.forEach(function (x, i) { if (!x || typeof x !== 'object') { issues.push(f + ': ' + arrKey + '[' + i + '] is not an object'); return; } if (x.id == null) issues.push(f + ': ' + arrKey + '[' + i + '] has no id'); else if (seen[x.id]) issues.push(f + ': duplicate id ' + x.id); seen[x.id] = 1;
        ['file', 'files', 'assets'].forEach(function (k) { var v = x[k]; if (!v) return; (typeof v === 'string' ? [v] : Array.isArray(v) ? v.map(function (a) { return a && a.file; }) : Object.keys(v).map(function (q) { return v[q]; })).forEach(function (r) { if (typeof r === 'string' && /^data\/attachments\//.test(r)) refs[r.replace(/^data\/attachments\//, '')] = f; }); });
        if (x.stored === 'browser') browserOnly++; });
      if (arrKey === 'tasks') { var cols = ['todo', 'doing', 'done', 'later', 'bucket']; arr.forEach(function (t) { if (cols.indexOf(t.col) < 0) issues.push(f + ': task ' + t.id + ' has unknown column "' + t.col + '"'); }); }
      notes.push(f + ': ' + arr.length + ' ' + arrKey + ' · ' + Math.round(txt.length / 1024) + ' KB' + (txt.length > 2 * 1024 * 1024 ? '  ⚠ over 2 MB: change-log snapshots are skipped for this file' : ''));
    }
  });
  var bad = 0, logN = 0; try { fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).forEach(function (l) { logN++; try { JSON.parse(l); } catch (e) { bad++; } }); } catch (e) { /* no log */ }
  if (bad) issues.push('log.jsonl: ' + bad + ' unreadable line(s)'); else if (logN) notes.push('log.jsonl: ' + logN + ' entries');
  var adir = path.join(DATA, 'attachments'); var onDisk = []; try { onDisk = fs.readdirSync(adir).filter(function (f) { return f[0] !== '.'; }); } catch (e) { /* none */ }
  var orphans = onDisk.filter(function (f) { return !refs[f]; }); var missing = Object.keys(refs).filter(function (f) { return onDisk.indexOf(f) < 0; });
  if (missing.length) issues.push('attachments: ' + missing.length + ' referenced file(s) missing from data/attachments/: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? '…' : ''));
  if (orphans.length) notes.push('attachments: ' + orphans.length + ' file(s) nothing references (safe to delete): ' + orphans.slice(0, 5).join(', ') + (orphans.length > 5 ? '…' : ''));
  if (browserOnly) issues.push(browserOnly + ' attachment original(s) exist only in a browser (stored: browser). Open the app with node serve.js running so they are written to data/attachments/.');
  var total = 0; onDisk.forEach(function (f) { try { total += fs.statSync(path.join(adir, f)).size; } catch (e) { /* skip */ } }); if (onDisk.length) notes.push('attachments: ' + onDisk.length + ' file(s), ' + (total / 1048576).toFixed(1) + ' MB on disk');
  // dates on tasks: warn, never fail (core/when.js stamps)
  files.forEach(function (f) { var kind = f.replace(/\.json$/, '').replace(/^.*-/, ''); if (shapes.hasOwnProperty(kind)) return; var o = null; try { o = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return; } ((o && o.tasks) || []).forEach(function (t) {
    ['at', 'until'].forEach(function (k) { if (t[k] !== undefined && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(t[k]))) notes.push(f + ' [' + t.id + '] ' + k + ' is not a date stamp: ' + JSON.stringify(t[k])); });
    if (t.due !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(t.due))) notes.push(f + ' [' + t.id + '] due is not a date: ' + JSON.stringify(t.due));
    if (t.at && t.until && String(t.until) < String(t.at)) notes.push(f + ' [' + t.id + '] until is before at');
  }); });
  var repo = fs.existsSync(path.join(DATA, '.git')); var lastBackup = null;
  if (repo) { try { lastBackup = require('child_process').execFileSync('git', ['-C', DATA, 'log', '-1', '--format=%cI'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { /* none */ } }
  var realData = files.some(function (f) { return !/^(settings|activity|boards|workspaces|prompts|backup)\.json$/.test(f); });
  var BC = backupCfg(); var bfolder = BC.to || ''; var bAt = BC.lastAt || ''; var WEEK = 7 * 86400000;
  if (!repo && !bfolder && realData) issues.push('no backup: your data lives only on this computer. Run: node solo.js backup setup');
  else if (repo && lastBackup && Date.now() - Date.parse(lastBackup) > WEEK) issues.push('last backup was ' + Math.round((Date.now() - Date.parse(lastBackup)) / 86400000) + ' days ago. Run: node solo.js backup');
  else if (!repo && bfolder && (!bAt || Date.now() - Date.parse(bAt) > WEEK)) issues.push('last copy to ' + bfolder + ' was ' + (bAt ? Math.round((Date.now() - Date.parse(bAt)) / 86400000) + ' days ago' : 'never') + '. Run: node solo.js backup');
  else if (repo || bfolder) notes.push('backup: ' + [repo ? 'private repo, last ' + (lastBackup || 'never') : '', bfolder ? 'folder ' + bfolder + ', last ' + whenLocal(bAt) : ''].filter(Boolean).join(' · '));
  if (!files.length) notes.push('fresh install: data/ has no files yet. Next: ask your agent for /setup, or `node solo.js template all` for the sample sprint, or `node serve.js` and plan in the app');
  if (fs.existsSync(path.join(ROOT, '.git'))) { var hk = ''; try { hk = fs.readFileSync(path.join(ROOT, '.git', 'hooks', 'pre-commit'), 'utf8'); } catch (e) { /* none */ } if (!/solo\.js"? guard/.test(hk)) notes.push('commit guard not installed: `node solo.js guard --install` makes git refuse commits that contain data/ or personal prompts'); }
  out(['# doctor — ' + (issues.length ? issues.length + ' issue' + (issues.length === 1 ? '' : 's') : 'all good'), ''].concat(issues.map(function (i) { return '⚠ ' + i; })).concat(issues.length ? [''] : []).concat(notes.map(function (n) { return '· ' + n; })), { ok: !issues.length, issues: issues, notes: notes, orphans: orphans, missing: missing, browserOnly: browserOnly, repo: repo, lastBackup: lastBackup });
  if (issues.some(function (i) { return i.indexOf('no backup') !== 0; }) && !JSON_OUT) process.exitCode = 2;   // a missing backup is a reminder, not a broken install
}

/* ---- template / theme / config / serve ----------------------------------- */
function cmdTemplate() {
  if (!T) fail('core/templates.js not found.');
  var which = (pos[0] || 'all').toLowerCase(); var all = ['board', 'social', 'scripts', 'writing', 'inspiration', 'settings'];
  if (which === 'runway') which = 'board';
  var targets = which === 'all' ? all : [which]; if (targets.some(function (t) { return all.indexOf(t) < 0; })) fail('Usage: template [board|social|scripts|writing|settings|all] [--board id] [--force]');
  var done = [];
  targets.forEach(function (t) {
    var name = t === 'board' ? boardFile() : (t === 'settings' || t === 'inspiration') ? t : fileName(t);
    if (fs.existsSync(fileOf(name)) && !flags.force) { done.push('- data/' + name + '.json exists — skipped (use --force to overwrite)'); return; }
    var body = t === 'board' ? T.runway() : t === 'social' ? T.social(new Date()) : t === 'scripts' ? T.scripts(new Date()) : t === 'writing' ? T.writing(new Date()) : t === 'inspiration' ? T.inspiration(new Date()) : T.settings();
    if (t === 'settings') { var curS = read('settings'); if (curS && isObj(curS.config)) body.config = curS.config; }   // the sample theme never drops your settings
    write(name, body, { noActivity: true }); done.push('- wrote data/' + name + '.json (sample content)');
  });
  out(done, { written: targets });
}
function cmdTheme() {
  var sub = (pos.shift() || 'show').toLowerCase(); var s = read('settings') || { theme: (cfg.theme || { mode: 'auto', palette: 'mono' }) };
  var palettes = ['mono', 'warm', 'paper', 'forest', 'dusk'], modes = ['auto', 'light', 'dark'], fonts = ['inter', 'system', 'lato', 'editorial'];
  if (sub === 'show') return out('theme: mode ' + s.theme.mode + ' · palette ' + s.theme.palette + ' · font ' + (s.theme.font || 'inter') + '\npalettes: ' + palettes.join(', ') + '\nmodes: ' + modes.join(', ') + '\nfonts: ' + fonts.join(', '), s.theme);
  if (sub === 'list') return out(palettes.map(function (p) { return '- ' + p + (p === s.theme.palette ? ' (current)' : ''); }), palettes);
  if (sub === 'set') { var p = (pos[0] || '').toLowerCase(); if (palettes.indexOf(p) < 0) fail('Unknown palette. Pick one of: ' + palettes.join(', ')); s.theme.palette = p; write('settings', s); return out('✓ palette → ' + p + ' (open pages switch within a few seconds)', s.theme); }
  if (sub === 'mode') { var m = (pos[0] || '').toLowerCase(); if (modes.indexOf(m) < 0) fail('Mode must be auto, light or dark'); s.theme.mode = m; write('settings', s); return out('✓ mode → ' + m, s.theme); }
  if (sub === 'font') { var f = (pos[0] || '').toLowerCase(); if (fonts.indexOf(f) < 0) fail('Font must be one of: ' + fonts.join(', ')); s.theme.font = f; write('settings', s); return out('✓ font → ' + f, s.theme); }
  fail('Usage: theme [show|list|set <palette>|mode <auto|light|dark>|font <inter|system|lato|editorial>]');
}
// config set <setting> <value> [<setting> <value> …] · config add <list> a b … · config unset <setting> · config set --file x.json · config clear
// Your settings live in data/settings.json → `config`, merged over solo.config.js by the pages and the CLI. Every value is
// checked against the shipped one (core/config.js → Config.override): lists take a,b,c or JSON; one entry of a list by id.
function cmdConfig() {
  var sub = (pos[0] || '').toLowerCase();
  if (sub === 'set' || sub === 'add' || sub === 'unset' || sub === 'clear') {
    if (!CfgLib) fail('core/config.js not found.');
    var s = read('settings') || { theme: cfg.theme || { mode: 'auto', palette: 'mono' } }; var o = isObj(s.config) ? s.config : {}; var labels = []; var changed = false;
    function step(op, p, v) { var r; try { r = CfgLib.override(SHIPPED, o, op, p, v, { force: !!flags.force }); } catch (e) { fail(e.message); } o = r.config; if (!r.unchanged) changed = true; labels.push((r.unchanged ? '· ' : '✓ ') + r.label); }
    if (sub === 'clear') step('clear');
    else if (sub === 'set' && flags.file) {
      var fromFile; try { fromFile = JSON.parse(fs.readFileSync(path.resolve(String(flags.file)), 'utf8')); } catch (e) { fail('Could not read ' + flags.file + ' as JSON.'); }
      if (!isObj(fromFile)) fail('The file must hold one JSON object with solo.config.js keys.');
      var probs = CfgLib.check(SHIPPED, fromFile); if (probs.length && !flags.force) fail(probs.join('\n✗ ') + '\n  (--force keeps them anyway)');
      o = CfgLib.mergeOverrides(o, fromFile); changed = true; labels.push('✓ merged ' + Object.keys(fromFile).join(', ') + ' from ' + flags.file);
    }
    else if (sub === 'set') { var pairs = pos.slice(1); if (pairs.length < 2 || pairs.length % 2) fail('Usage: config set <setting> <value> [<setting> <value> …]\n  e.g. config set owner "Mara" name "Pocket Studio"   ·   quote values with spaces   ·   lists: social.postTypes reel,carousel   ·   one board: boards.runway.title "Launch runway"'); for (var j = 0; j < pairs.length; j += 2) step('set', pairs[j], pairs[j + 1]); }
    else if (sub === 'add') { if (pos.length < 3) fail('Usage: config add <list> <word> [<word> …]   e.g. config add social.postTypes reel carousel'); step('add', pos[1], pos.slice(2).join(',')); }
    else { if (!pos[1]) fail('Usage: config unset <setting>'); step('unset', pos[1]); }
    if (changed) { if (Object.keys(o).length) s.config = o; else delete s.config; write('settings', s); }
    var restart = changed && labels.some(function (l) { return /^✓ sync\./.test(l); }) ? ['  sync.* is read by node serve.js when it starts: restart it.'] : [];
    var left = CfgLib.check(SHIPPED, Object.keys(o).length ? o : undefined).map(function (m) { return '  ✗ already in the file and ignored: ' + m + ' (node solo.js doctor)'; });
    return out(labels.concat(['  Your settings (data/settings.json): ' + (Object.keys(o).length ? Object.keys(o).join(', ') : 'none, solo.config.js as shipped applies') + (Object.keys(o).length ? '   (the values: node solo.js config --json)' : '')].concat(changed ? ['  Open pages pick this up within a few seconds.'] : []).concat(restart).concat(left)), s.config || null);
  }
  var projects = (cfg.projects || []).map(function (p) { return typeof p === 'string' ? p : p.name; });
  out(['# ' + (cfg.name || 'Solo Ops') + ' config', '', '- workspaces: ' + WORKSPACES.map(function (w) { return w.id + ' (' + w.title + ')'; }).join(', ') + '  — default for CLI: ' + WS_ID,
    '- apps in ' + WS_ID + ': ' + ['boards', 'social', 'scripts', 'writing'].filter(appOn).join(', '),
    '- boards: ' + BOARDS.map(function (b) { return b.id + ' (' + b.title + ')'; }).join(', ') + '  — default for CLI: ' + BOARD_ID,
    '- projects: ' + projects.join(', '), '- task tags: ' + ((cfg.board && cfg.board.tags) || (cfg.runway && cfg.runway.tags) || []).join(', '),
    '- post types: ' + ((cfg.social && cfg.social.postTypes) || []).join(', '), '- idle reminder after: ' + ((cfg.activity && cfg.activity.reminderAfterHours) || 24) + ' h', '- theme default: ' + JSON.stringify(cfg.theme || {}), '- data dir: ' + DATA,
    '- files: ' + BOARDS.map(function (b) { return prefix() + b.id; }).concat(['social', 'scripts', 'writing'].map(function (a) { return fileName(a); })).concat(['settings', 'activity']).map(function (f) { return f + '.json' + (fs.existsSync(fileOf(f)) ? ' ✓' : ' (missing)'); }).join(' · '),
    '- your settings (data/settings.json): ' + (OVERRIDES ? JSON.stringify(OVERRIDES) : 'none, solo.config.js as shipped'), '',
    'Change them with `node solo.js config set <setting> <value>` (owner "Mara" · name "Pocket Studio" · social.postTypes reel,carousel · boards.runway.title "Launch runway") or `config add <list> a b`, never by editing solo.config.js: that file is part of the app, the same for everyone.'], cfg);
}
function cmdServe() { require('child_process').spawn(process.execPath, [path.join(ROOT, 'serve.js')].concat(flags.port ? ['--port', String(flags.port)] : []), { stdio: 'inherit' }); }
function cmdHelp() {
  out(['# solo.js — tasks, posts, scripts and notes from the terminal', '',
    'Overviews', '  today                      what is in play now + idle reminder + today\'s schedule', '  calendar [--days 14] [--all]   agenda: overdue, then every dated task, meeting and post by day (--all = every project)',
    '  log [--n 30]               recent changes by page / cli / agent, with ids', '  revert <id>                restore a file to how it was before that change', '  week [--days 7]            tasks by priority + posts + studio for the window', '  review                     same as week', '  activity                   streak + last 14 days', '',
    'Workspaces (one project = its own boards, schedule, scripts, notes; add --ws <id> to any command)', '  workspaces list', '  workspaces add "Title" [--apps social,scripts,writing] [--boards "A,B"] [--sample]   workspaces rename <id> "Title"   workspaces rm <id>', '',
    'Boards (data/<id>.json — every task command takes --board <id>; default: first board)', '  boards list', '  boards add "Title" [--from blank|sample|<id>]   boards rename <id> "Title"   boards rm <id> --force', '',
    'Tasks', '  list [board|all|todo|doing|done|later|bucket] [--proj X] [--tag Y]', '  show <task>                 full task (id or title fragment)',
    '  add "Title" [--proj X] [--pri high] [--tags a,b] [--col later] [--desc "…"] [--steps "a|b"] [--at <when>] [--until HH:MM] [--due <date>] [--ext <calendar id>]', '  at <task> <when|clear> [--until HH:MM]   due <task> <date|clear>      when = 2026-10-15T14:00 · 2026-10-15 (all day) · tomorrow 14:00 · fri 10:00 · +3d 17:30; a meeting = --tags meeting', '  start|done|later|bucket|todo <task>', '  move <task> <column>        pri <task> <high|medium|low>', '  tag <task> +a -b            step <task> "text"   check|uncheck <task> <n>', '  note <task> ["text"]        edit <task> --title … --proj … --pri …', '  rm <task>', '',
    'Share', '  share today [--all]         today as a short card: Doing · Schedule · Next up (the page copies it as an image)', '  share [todo|board|all]      markdown checklist (paste anywhere)', '  import <list.md> [--col]    "- [ ] item" lines become tasks, indented lines become steps', '',
    'Posts (data/social.json)', '  social list|next|week|show <post>', '  social add "Title" [--at 2026-10-20T09:00 | +3d 17:30] [--type launch] [--project X] [--copy "…"] [--prep "a|b"]', '  social posted|ready|draft <post> [--url …]   social move <post> <when>', '  social prep <post> "item"   social check <post> <n>   social copy <post> ["text"]   social rm <post>', '',
    'Inspiration (data/inspiration.json — links, ideas, images; tag with a workspace)', '  inspo list [--ws] [--tag x] [--status new|used|archived]   inspo show <item>', '  inspo add [--file <path>] "https://… or an idea #tag" [--ws <id>] [--tags a,b]   inspo tag <item> +a -b   inspo ws <item> <workspace>', '  inspo use <item> --as task|post|script|note [--ws] [--board]   inspo ai [--into tasks] (prompt to paste into an AI)   inspo archive|rm <item>', '',
    'Prompts (built-ins in core/prompts.js, yours in data/prompts.json)', '  prompts builtin [--mode chat|files]   prompts show <title or /slug>   prompts export [--for claude|cursor|codex|chat] [--out dir]', '  prompts list|add "Title" --text "…"|--file p.md [--cat daily] [--desc "…"]|edit <p> …|rm <p>|restore', '',
    'Studio (data/scripts.json, data/writing.json)', '  scripts list|show <s>|add "Title" [--file x.md]|rm <s>', '  notes list|show <n>|add "Title" [--file x.md]|rm <n>', '',
    'Safety', '  backup setup [--name solo-ops-data] [--no-github]   first time: a PRIVATE GitHub repo via gh, or it tells you the two other ways', '  backup [--remote <private url>] [--to <folder>] [--status]   push data/ to its private repo and/or copy it to a syncing folder; refuses public repos', '  backup --daily [--hour 21] [--dry-run]   run it every evening (launchd / crontab / a schtasks line)', '  guard [--install] [--allow-data]   fail when staged files hold your content; --install = on every commit; --allow-data = your own PRIVATE fork only', '  doctor | health            check every data file, attachments and backup age', '',
    'Setup', '  template [all|board|social|scripts|writing|settings] [--board id] [--force]', '  theme [show|list|set <palette>|mode <auto|light|dark>|font <inter|system|lato|editorial>]', '  config                     the settings in use (solo.config.js + your settings)', '  config set <setting> <value>  your values, kept in data/settings.json: owner "Mara" · name "Pocket Studio" · social.postTypes reel,carousel · boards.runway.title "…"', '  config add <list> a b      add to a list (config unset <setting> · config set --file x.json · config clear)', '  serve [--port 4321]        start the local server (pages write data/ directly)', '',
    'Add --json to any command for machine-readable output. Ids: tasks t…, posts p…, scripts s…, notes n….',
    'Agents: add --as agent (and --note "why") so the change log attributes the edit to you.'], null);
}

/* ---- dispatch ------------------------------------------------------------ */
var commands = {
  help: cmdHelp, '--help': cmdHelp, '-h': cmdHelp,
  today: cmdToday, week: cmdWeek, review: cmdWeek,
  list: cmdList, ls: cmdList, show: cmdShow, add: cmdAdd, edit: cmdEdit,
  done: moveCmd('done', 'Done'), start: moveCmd('doing', 'Started'), later: moveCmd('later', 'Parked'), bucket: moveCmd('bucket', 'Bucketed'), todo: moveCmd('todo', 'Back to To Do'),
  move: cmdMove, pri: cmdPri, tag: cmdTag, at: whenCmd('at'), due: whenCmd('due'), calendar: cmdCalendar, agenda: cmdCalendar, step: cmdStep, check: checkCmd(true), uncheck: checkCmd(false), note: cmdNote, rm: cmdRm, del: cmdRm,
  share: cmdShare, import: cmdImport,
  social: cmdSocial, post: cmdSocial, posts: cmdSocial,
  scripts: cmdScripts, script: cmdScripts, notes: cmdNotes,
  inspo: cmdInspo, inspiration: cmdInspo, prompts: cmdPrompts, prompt: cmdPrompts, boards: cmdBoards, board: cmdBoards, activity: cmdActivity, log: cmdLog, history: cmdLog, revert: cmdRevert, undo: cmdRevert, workspaces: cmdWorkspaces, workspace: cmdWorkspaces, ws: cmdWorkspaces,
  backup: cmdBackup, doctor: cmdDoctor, health: cmdDoctor, guard: cmdGuard, template: cmdTemplate, theme: cmdTheme, config: cmdConfig, serve: cmdServe
};
var fn = commands[cmd];
if (!fn) fail('Unknown command "' + cmd + '". Run: node solo.js help');
fn();
