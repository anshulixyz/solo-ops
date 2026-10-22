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
var RESERVED = ['social', 'scripts', 'writing', 'settings', 'activity', 'boards', 'workspaces', 'calendar', 'home', 'prompts', 'inspiration', 'log', 'attachments', 'backup', 'exports', 'videos', 'video', 'models', 'secrets', 'recordings'];
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
      if (/^--(at|due|until)$/.test(a) && i + 1 < argv.length && /^(\d{1,2}:\d{2}|\d{1,2}(:\d{2})?\s*[ap]\.?m\.?)$/i.test(argv[i + 1])) flags[a.slice(2)] += ' ' + argv[++i];   // --at +3d 9:00 without quotes; --at sat 9am stays whole (and is refused whole)
    } else flags[a.slice(2)] = true;
  } else pos.push(a);
}
var JSON_OUT = !!flags.json;
var cmd = pos.shift() || 'help';
// --as can come twice: `inspo use i1 --as post … --as agent` names the kind and who made the change. Keep every value.
var AS_ALL = []; argv.forEach(function (x, j) { if (x === '--as' && j + 1 < argv.length && argv[j + 1].indexOf('--') !== 0) AS_ALL.push(String(argv[j + 1]).toLowerCase()); else if (x.indexOf('--as=') === 0) AS_ALL.push(x.slice(5).toLowerCase()); });

/* ---- io ------------------------------------------------------------------ */
function fileOf(name) { return path.join(DATA, name + '.json'); }
function read(name) {
  try { return JSON.parse(fs.readFileSync(fileOf(name), 'utf8')); } catch (e) { return null; }
}
var LOG = path.join(DATA, 'log.jsonl');
var LOG_MAX = 400, SNAP_MAX = 2 * 1024 * 1024;
var SOURCE = AS_ALL.filter(function (v) { return ['agent', 'cli', 'ui'].indexOf(v) >= 0; })[0] || (process.env.MARATHON_AGENT ? 'agent' : 'cli');
function logChange(file, prevText, note) {
  var rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: new Date().toISOString(), file: file, source: SOURCE, note: note || flags.note || (cmd + ' ' + pos.join(' ')).trim().slice(0, 120),
    prev: prevText && prevText.length <= SNAP_MAX ? prevText : null, prevBytes: prevText ? prevText.length : 0 };
  var lines = []; try { lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean); } catch (e) { /* new */ }
  lines.push(JSON.stringify(rec)); if (lines.length > LOG_MAX) lines = lines.slice(lines.length - LOG_MAX);
  fs.writeFileSync(LOG, lines.join('\n') + '\n'); return rec;
}
function readLog() { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } }
function write(name, body, opts) {
  body.version = 1; body.updatedAt = (opts && opts.stamp) || new Date().toISOString();   // opts.stamp: an empty file from template blank is stamped 1970, so a browser that already holds real work still wins
  fs.mkdirSync(DATA, { recursive: true });
  var text = JSON.stringify(body, null, 2) + '\n';
  if (name !== 'activity' && !(opts && opts.noLog)) { var prev = ''; try { prev = fs.readFileSync(fileOf(name), 'utf8'); } catch (e) { /* new */ } if (prev !== text) logChange(name + '.json', prev, opts && opts.note); }
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
  var apps = Object.assign({ social: true, scripts: true, writing: true, video: true }, w.apps || {});
  var boards = (Array.isArray(w.boards) ? w.boards : []).map(normBoard).filter(Boolean);
  if (w.boards === undefined && apps.boards !== false && !boards.length) boards = [normBoard({ id: 'runway', title: 'Launch Runway', sprintLabel: 'Sprint progress' })];
  return { id: id, title: w.title || id, apps: { social: apps.social !== false, scripts: apps.scripts !== false, writing: apps.writing !== false, video: apps.video !== false }, boards: boards, sample: w.sample === true };
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
function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
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
  if (f.ext !== undefined) { if (String(f.ext).toLowerCase() === 'clear' || !f.ext) delete t.ext; else { var xe = extProblem(f.ext); if (xe) fail(xe); t.ext = String(f.ext); } }
}
// --ext is where an imported item came from (gcal:<event>, notion:<page>, linear:<issue>, github:<owner>/<repo>#<n>…): the same ext
// on any board of the workspace is the same item, so a re-run updates instead of duplicating. share: ids belong to the share code.
function extProblem(x) {
  x = String(x); if (/^share:/i.test(x)) return '--ext share:… is reserved for tasks that arrived through a share; pick another source name.';
  if (/\s/.test(x) || x.length > 200) return '--ext takes one id without spaces, at most 200 characters, like notion:<page id> or github:owner/repo#12.';
  return '';
}
function cleanTag(g) { return String(g || '').toLowerCase().trim().replace(/^@+/, '').replace(/\s+/g, '-'); }   // an imported label: never an @contact (that shares the task), never spaces
function findExt(ext) {   // → { id: board id, b: board, t: task } across every board of the workspace
  var hit = null; BOARDS.forEach(function (bm) { if (hit) return; var bb = board(bm.id); var t = bb.tasks.filter(function (x) { return x.ext === ext; })[0]; if (t) hit = { id: bm.id, b: bb, t: t }; }); return hit;
}
// the update rule for a re-import (core/apply.js has the same; core/test-apply.js checks they agree)
// Status and priority follow the source only when the SOURCE changed them since the last import (extCol / extPri remember what
// it said): a task you finished here stays finished while it is still open there, and is named in `notes` instead.
function extMerge(same, t, f, notes) {
  var ch = [];
  if (same.title !== t.title) { same.title = t.title; ch.push('title'); }
  if (f.at !== undefined) { if (t.at) { if (same.at !== t.at) ch.push('time'); else if ((same.until || '') !== (t.until || '')) ch.push('end'); same.at = t.at; if (t.until) same.until = t.until; else delete same.until; } else if (same.at) { delete same.at; delete same.until; ch.push('time removed'); } }
  if (f.due !== undefined) { if (t.due) { if (same.due !== t.due) ch.push('due'); same.due = t.due; } else if (same.due) { delete same.due; ch.push('due removed'); } }
  if (f.col !== undefined && COLS.indexOf(f.col) >= 0) {
    var moved = same.extCol !== undefined ? same.extCol !== f.col : (same.col !== 'done' && same.col !== 'later');   // never recorded: move unless it is finished or parked here
    if (moved && same.col !== f.col) { ch.push('moves ' + COL_LABEL[same.col] + ' \u2192 ' + COL_LABEL[f.col]); same.col = f.col; }
    else if (same.col !== f.col && notes) notes.push(same.title + ': ' + COL_LABEL[same.col] + ' here, still ' + COL_LABEL[f.col] + ' there');
    if (same.extCol !== f.col) { same.extCol = f.col; if (!ch.length) ch.push('source status noted'); }
  }
  if (f.pri !== undefined && PRI.hasOwnProperty(f.pri)) {
    if ((same.extPri === undefined || same.extPri !== f.pri) && same.pri !== f.pri) { ch.push(same.pri + ' \u2192 ' + f.pri); same.pri = f.pri; }
    if (same.extPri !== f.pri) same.extPri = f.pri;
  }
  if (t.desc && same.desc !== t.desc) { same.desc = t.desc; ch.push('description'); }
  if (t.notes && !same.notes) { same.notes = t.notes; ch.push('notes'); }
  t.tags.map(cleanTag).filter(Boolean).forEach(function (g) { if (same.tags.indexOf(g) < 0) { same.tags.push(g); ch.push('#' + g); } });
  return ch;
}
function tomorrow9() { var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }
function progress(items) { var n = (items || []).length, d = (items || []).filter(function (c) { return c.done; }).length; return n ? d + '/' + n : ''; }
function find(list, q, label) {
  q = String(q || '').trim();
  if (!q) fail('Which ' + label + '? Give an id or part of the title.');
  var exact = list.filter(function (x) { return x.id === q; });
  if (exact.length) return exact[0];
  if (/^ext:/i.test(q)) { var xq = q.slice(4).toLowerCase(); var xh = list.filter(function (x) { return x.ext && String(x.ext).toLowerCase() === xq; }); if (xh.length) return xh[0]; fail('No ' + label + ' carries --ext ' + q.slice(4) + (BOARDS.length > 1 ? ' on any board of this workspace.' : '.')); }
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
  return '- [' + t.id + ']' + (t._board ? ' (' + t._board + ')' : '') + ' ' + t.title + ' · ' + t.proj + ' · ' + t.pri + whenText(t) + (t.tags && t.tags.length ? ' · #' + t.tags.join(' #') : '') + (p ? ' · ' + p + ' steps' : '') + (t.ext && !/^share:/.test(t.ext) ? ' · ext ' + t.ext : '');   // ext: an imported task's source id, so a re-run updates it
}
// at <task> <when|clear> [--until HH:MM] · due <task> <date|clear>: the date is the trailing one or two words
function whenCmd(kind) {
  return function () {
    var b = board(); var q = null, when = null;
    if (pos.length >= 2 && /^(\[?(t\d+|t(?=[a-z0-9]*\d)[a-z0-9]{8,})\]?|ext:\S+)$/i.test(pos[0])) {   // at t3 <when>: everything after the id is the date ("due t1 next friday" is a date it cannot read, not a task called "t1 next")
      q = pos[0].replace(/^\[|\]$/g, ''); var rest = pos.slice(1).join(' ');
      if (rest.toLowerCase() !== 'clear' && !(When && When.parse(rest))) fail('Could not read the date "' + rest + '". Use 2026-10-15T14:00, 2026-10-15, +3d 17:30, tomorrow 14:00 or fri 10:00.');
      when = rest;
    }
    for (var n = Math.min(2, pos.length - 1); n >= 1 && !when; n--) { var tail = pos.slice(-n).join(' '); if (tail.toLowerCase() === 'clear' || (When && When.parse(tail))) { q = pos.slice(0, -n).join(' '); when = tail; } }
    if (!when) fail('Usage: ' + kind + ' <task> <' + (kind === 'at' ? 'when' : 'date') + '|clear>' + (kind === 'at' ? ' [--until 15:00]' : '') + '   e.g. ' + kind + ' t3 tomorrow 14:00');
    var t = find(b.tasks, q, 'task'); var f = {}; f[kind] = when; if (flags.until !== undefined) f.until = flags.until; applyDates(t, f); saveBoard(b);
    out('✓ [' + t.id + '] ' + t.title + (when.toLowerCase() === 'clear' ? (kind === 'at' ? ' · time removed' : ' · due date removed') : whenText(t)), t);
  };
}
function realWorkspaces() { return WORKSPACES.filter(function (w) { return !w.sample; }); }   // "all projects" never mixes the sample project in
// every dated item of a workspace (tasks with at/due on any of its boards + posts), for today / week / calendar
function boardsOf(wsId) {
  var w = WORKSPACES.filter(function (x) { return x.id === wsId; })[0]; if (!w) return []; var seen = {}, outB = []; var rt = read('boards');
  w.boards.concat((rt && Array.isArray(rt.boards) ? rt.boards : []).filter(function (b) { return (b.ws || PRIMARY) === wsId; })).map(normBoard).filter(Boolean).forEach(function (b) { if (!seen[b.id]) { seen[b.id] = 1; outB.push(b); } });
  return outB;
}
function datedItems(all) {
  var items = []; var now = new Date();
  (all ? realWorkspaces() : [WS]).forEach(function (w) {
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
  if (!title) fail('Usage: add "Task title" [--proj X] [--pri high|medium|low] [--tags a,b] [--col todo|doing|later|bucket] [--desc "..."] [--steps "a|b|c"] [--at <when>] [--until <HH:MM>] [--due <date>] [--ext <tool>:<id>]');
  var b = board();
  var projects = ((cfg.projects || []).map(function (p) { return typeof p === 'string' ? p : p.name; })).concat(b.projects || []);
  var t = {
    id: newId('t'), title: title, desc: flags.desc || '', proj: flags.proj || projects[0] || 'general',
    col: COLS.indexOf(flags.col) >= 0 ? flags.col : 'todo', pri: PRI.hasOwnProperty(flags.pri) ? flags.pri : 'medium',
    tags: split(flags.tags).map(function (s) { return s.toLowerCase(); }), notes: flags.notes || '', collapsed: true,
    checklist: String(flags.steps || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { text: s, done: false }; })
  };
  applyDates(t, flags);
  (function () {   // add "Title" --draft n1 | --script s1 | --take v1 | --post p1: the task is born with its piece attached, and the tag that goes with it
    var sdA = null; [['draft', 'note', 'noteId', 'writing'], ['script', 'script', 'scriptId', 'script'], ['take', 'take', 'takeId', 'video'], ['post', 'post', 'postId', '']].forEach(function (r) {
      if (!flags[r[0]]) return; sdA = sdA || storyData(); var it = (sdA[r[1]] || []).filter(function (x) { return x.id === String(flags[r[0]]); })[0]; if (!it) fail('No ' + (r[1] === 'note' ? 'draft' : r[1]) + ' has the id ' + flags[r[0]]);
      t[r[2]] = it.id; if (r[3] && t.tags.indexOf(r[3]) < 0) t.tags.push(r[3]); });
  })();
  // --ext: where the item came from (a calendar event, a Notion page, a Linear issue…). The same ext on any board of this
  // workspace → update that task, never a duplicate (safe re-import). What the source says wins for the title, the times and
  // what was passed explicitly (--col, --pri, --due, --desc); steps, your notes and the board stay yours.
  if (t.ext) t.tags = t.tags.map(cleanTag).filter(Boolean);   // an import's labels: no @contact, no spaces
  if (t.ext && flags.col !== undefined && COLS.indexOf(flags.col) >= 0) t.extCol = flags.col; if (t.ext && flags.pri !== undefined && PRI.hasOwnProperty(flags.pri)) t.extPri = flags.pri;   // what the source said, so a re-run moves it only when the source changes
  var hitX = t.ext ? findExt(t.ext) : null;
  if (hitX) {
    var same = hitX.t; var nts = []; var ch = extMerge(same, t, flags, nts);
    if (ch.length) saveBoard(hitX.b, hitX.id); return out('✓ ' + (ch.length ? 'Updated' : 'Up to date:') + ' [' + same.id + '] ' + same.title + ' (same --ext ' + same.ext + (ch.length ? ': ' + ch.join(', ') : '') + ')' + whenText(same) + (nts.length ? '\n  check: ' + nts.join('; ') + ' (close it there, or move it here)' : ''), same);
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
  ['noteId', 'scriptId', 'takeId', 'postId'].forEach(function (k) { if (flags[k] !== undefined) t[k] = String(flags[k] === true ? '' : flags[k]); });   // edit t1 --takeId v1 (or --takeId "" to detach); `link` is the friendlier way
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
var EMPTY_NUDGE = '_Nothing here yet. Bring your work in: /bring-in (Notion, Linear, Todoist, a list…) · plan something new: /plan-project · everything you can ask: /menu · first time: /setup' + (WORKSPACES.some(function (w) { return w.sample; }) ? '' : ' · look around a sample project: `node solo.js template sample`') + '_';
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
  var vn = videoNudge(); if (vn) md.push('## Video', vn, '');
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
  var vn2 = videoNudge(); if (vn2) md.push('## Video', vn2, '');
  out(md, { byDay: dayGroups, overdueDated: wkOverdue, window: { from: now.toISOString(), days: days }, activity: activitySummary(), boards: BOARDS.map(function (b) { return b.id; }), doing: doing, todo: todo, done: done.length, posts: posts, overdue: overdue, prepOpen: prepOpen, scripts: sc.scripts.length, notes: n.notes.length, videos: videos().videos.length, videoNudge: videoNudge() });
}
function latestOf(arr) { return arr.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })[0]; }

/* ---- share / import ------------------------------------------------------ */
var SC = safeRequire(path.join(ROOT, 'core', 'share-card.js'));   // Share today: model + text (shared with the pages)
function cmdShare() {
  var which = (pos[0] || 'todo').toLowerCase();
  if (which === 'today') {   // the card's text version: Doing · Schedule · Next up, titles only
    if (!SC) fail('core/share-card.js missing');
    var all = flags.all === true; var tasks = [];
    (all ? realWorkspaces() : [WS]).forEach(function (w) { var wb = boardsOf(w.id); if (!wb.length) wb = [{ id: 'runway' }]; wb.forEach(function (bm) { var bf = read(prefix(w.id) + bm.id); ((bf && bf.tasks) || []).forEach(function (t) { tasks.push(t); }); }); });
    var m = SC.model({ now: new Date(), scope: all ? 'All projects' : WS.title, tasks: tasks, streak: activitySummary().streak });
    return out(SC.markdown(m), m);
  }
  var b = board();
  var cols = which === 'all' ? COLS : which === 'board' ? ['todo', 'doing', 'done'] : [which];
  if (cols.some(function (c) { return COLS.indexOf(c) < 0; })) fail('Usage: share [todo|board|all] (a checklist to paste) · share today (the day card)');
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
// import <items.json> [--dry-run]: what an agent brings in from Notion, Linear, Todoist, GitHub… as one JSON file it writes with
// its file tool (no imported title ever passes through a shell). Each item: { title, ext, col, pri, due, at, until, tags, notes,
// desc, steps, board }. The same ext anywhere in the workspace updates that task (the rule of add --ext); a missing ext becomes
// <source>:<hash of the title>, so a re-run never duplicates. Nothing is deleted. One write per board file = one log entry,
// one `revert`. --dry-run prints what would change and writes nothing.
function importJson(file) {
  var raw; try { raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (e) { fail('Cannot read ' + file + ' as JSON: ' + e.message.split('\n')[0]); }
  var items = Array.isArray(raw) ? raw : raw && Array.isArray(raw.items) ? raw.items : null; if (!items) fail('The file needs { "items": [ { "title": "…", "ext": "notion:<page id>" } ] } (or a plain list of items).');
  if (items.length > 200) fail(items.length + ' items is more than one import takes (200). Split it, or bring in the open ones first.');
  var source = slug((raw && raw.source) || 'import') || 'import'; var dry = !!flags['dry-run'];
  var crypto = require('crypto'); var boards = {}; function bd(id) { return boards[id] || (boards[id] = board(id)); }
  var ids = {}; BOARDS.forEach(function (bm) { bd(bm.id).tasks.forEach(function (x) { ids[x.id] = 1; }); }); function freshId() { var x; do { x = newId('t'); } while (ids[x]); ids[x] = 1; return x; }   // never two tasks with one id
  var added = [], updated = [], same = [], skipped = [], checks = [];
  items.forEach(function (it, n) {
    var why = function (m) { skipped.push('#' + (n + 1) + ' ' + (it && it.title ? '"' + String(it.title).slice(0, 60) + '"' : '') + ': ' + m); };
    if (!it || typeof it !== 'object') return why('not an object');
    var title = String(it.title || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200); if (!title) return why('no title');
    ['col', 'pri', 'due', 'at', 'until', 'board', 'ext'].forEach(function (k) { if (it[k] === null || it[k] === '') delete it[k]; });   // null is absent
    var ext = it.ext ? String(it.ext) : source + ':' + crypto.createHash('sha1').update(title.toLowerCase()).digest('hex').slice(0, 12);
    if (ext.indexOf(':') < 0 || /^clear$/i.test(ext)) ext = source + ':' + ext;   // an id without its tool gets the source in front
    var xp = extProblem(ext); if (xp) return why(xp);
    var bid = it.board ? slug(it.board) : BOARD_ID; if (!BOARDS.some(function (b) { return b.id === bid; })) return why('no board "' + it.board + '" (boards: ' + BOARDS.map(function (b) { return b.id; }).join(', ') + ')');
    if (it.col !== undefined && COLS.indexOf(it.col) < 0) return why('col must be one of ' + COLS.join(', '));
    if (it.pri !== undefined && !PRI.hasOwnProperty(it.pri)) return why('pri must be high, medium or low');
    var f = {}; ['at', 'until', 'due', 'col', 'pri'].forEach(function (k) { if (it[k] !== undefined && it[k] !== null && it[k] !== '') f[k] = String(it[k]); });
    var t = { id: freshId(), title: title, desc: String(it.desc || '').slice(0, 2000), proj: ((cfg.projects || [])[0] || {}).name || 'general', col: f.col || 'todo', pri: f.pri || 'medium',
      tags: (Array.isArray(it.tags) ? it.tags : split(it.tags)).map(cleanTag).filter(Boolean).slice(0, 12), notes: String(it.notes || '').slice(0, 2000), collapsed: true,
      checklist: (Array.isArray(it.steps) ? it.steps : []).map(function (x) { return { text: String(x).slice(0, 200), done: false }; }).filter(function (c) { return c.text.trim(); }).slice(0, 30) };
    try { var ff = Object.assign({}, f); delete ff.col; delete ff.pri; applyDatesSoft(t, ff); } catch (e) { return why(e.message); }
    t.ext = ext; if (f.col) t.extCol = f.col; if (f.pri) t.extPri = f.pri;
    var hit = null; BOARDS.forEach(function (bm) { if (hit) return; var x = bd(bm.id).tasks.filter(function (y) { return y.ext === ext; })[0]; if (x) hit = { id: bm.id, t: x }; });
    if (hit) { var ch = extMerge(hit.t, t, f, checks); if (ch.length) { updated.push({ id: hit.t.id, title: hit.t.title, board: hit.id, changes: ch }); bd(hit.id)._dirty = true; } else same.push(hit.t.title); return; }
    bd(bid).tasks.unshift(t); bd(bid)._dirty = true; added.push({ id: t.id, title: t.title, board: bid, col: t.col });
  });
  var lines = ['# Import' + (dry ? ' (dry run: nothing written)' : '') + ' · ' + WS.title, '',
    added.length + ' new · ' + updated.length + ' updated · ' + same.length + ' unchanged · ' + skipped.length + ' skipped', ''];
  if (added.length) lines.push('## New'), added.forEach(function (a) { lines.push('- ' + a.title + ' → ' + COL_LABEL[a.col] + (BOARDS.length > 1 ? ' (' + a.board + ')' : '')); });
  if (updated.length) lines.push('', '## Updated'), updated.forEach(function (u) { lines.push('- [' + u.id + '] ' + u.title + ': ' + u.changes.join(', ')); });
  if (checks.length) lines.push('', '## Check (left as they are here)'), checks.forEach(function (x) { lines.push('- ' + x + ': close it there, or move it here'); });
  if (skipped.length) lines.push('', '## Skipped'), skipped.forEach(function (x) { lines.push('- ' + x); });
  if (!dry) Object.keys(boards).forEach(function (id) { if (boards[id]._dirty) { delete boards[id]._dirty; saveBoard(boards[id], id); } });
  if (!dry && (added.length || updated.length)) lines.push('', 'Logged as one change per board file: `node solo.js log` shows it, `revert <id>` undoes it.');
  out(lines, { dryRun: dry, added: added, updated: updated, unchanged: same.length, skipped: skipped, check: checks });
}
function applyDatesSoft(t, f) {   // applyDates, but a bad date is a reason to skip one item, not to stop the import
  var clear = function (v) { return String(v).toLowerCase() === 'clear'; };
  var pa = f.at !== undefined && !clear(f.at) && When ? When.parse(f.at) : null;
  if (f.at !== undefined && !clear(f.at) && When && !pa) throw new Error('could not read the time "' + f.at + '"');
  if (f.until !== undefined && pa && !clear(f.until) && (!When.until(pa.stamp, f.until) || When.until(pa.stamp, f.until) < pa.stamp)) throw new Error('could not read the end "' + f.until + '" (or it is before the start)');
  if (f.due !== undefined && !clear(f.due) && When && !When.parse(f.due)) throw new Error('could not read the due date "' + f.due + '"');
  applyDates(t, f);
}
function cmdImport() {
  if (pos[0] && /\.json$/i.test(pos[0])) return importJson(pos[0]);
  var file = pos[0]; if (!file) fail('Usage: import <list.md> [--col todo] [--proj X] [--pri medium]   ·   import <items.json> [--dry-run] (what your agent brings in from another tool)');
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
  if (sub === 'show') { var p = find(s.posts, pos.join(' '), 'post'); var md = ['# ' + p.title, '', '- id: ' + p.id, '- when: ' + fmtDT(p.datetime), '- type: ' + p.postType + ' · ' + p.format + ' · ' + p.project, '- status: ' + p.status].concat(storyLine('post', p.id) ? ['- story: ' + storyLine('post', p.id)] : []).concat(['', '## Copy', '', p.copy || '_empty_', '']); if (p.prep && p.prep.length) { md.push('## Prep'); p.prep.forEach(function (x, i) { md.push('- [' + (x.done ? 'x' : ' ') + '] ' + (i + 1) + '. ' + x.text + ' (' + x.kind + ')'); }); md.push(''); } if (p.notes) md.push('## Notes', '', p.notes); return out(md, p); }
  if (sub === 'add') {
    var fromK = flags.draft ? 'note' : flags.script ? 'script' : flags.take ? 'take' : ''; var fromFlag = flags.draft || flags.script || flags.take; var fromIt = null; var pf = null;   // social add --draft n1 | --script s1 | --take v1: the post comes from that item and the story holds
    var forTaskP = flags.task ? findTaskAny(flags.task) : null;   // --task t1: the post is made for that task (its script or take when it has one, else its title and description)
    if (forTaskP && !fromK) { var tp = forTaskP.task; if (tp.takeId) { fromK = 'take'; fromFlag = tp.takeId; } else if (tp.scriptId) { fromK = 'script'; fromFlag = tp.scriptId; } else if (tp.noteId) { fromK = 'note'; fromFlag = tp.noteId; } }
    if (fromK) { var sd = storyData(); fromIt = (sd[fromK] || []).filter(function (x) { return x.id === fromFlag; })[0]; if (!fromIt) fail('No ' + (fromK === 'note' ? 'draft' : fromK) + ' has the id ' + fromFlag); if (ST) pf = ST.postFrom(fromK, fromIt); }
    else if (forTaskP && ST) pf = ST.postFrom('task', forTaskP.task);
    var title = pos.join(' ').trim() || flags.title || (pf && pf.title); if (!title) fail('Usage: social add "Title" [--at 2026-10-20T09:00 | +3d 17:30] [--type launch] [--project X] [--format text|video|text+video] [--copy "..."] [--prep "a|b"] [--draft n1 | --script s1 | --take v1]');
    var types = (cfg.social && cfg.social.postTypes) || ['announcement', 'launch', 'update', 'thread', 'teaser'];
    var np = { id: newId('p'), datetime: flags.at ? parseWhen(flags.at) : pf ? pf.datetime : parseWhen(flags.at), title: title, postType: types.indexOf(flags.type) >= 0 ? flags.type : (types.indexOf('update') >= 0 ? 'update' : types[0] || 'update'), format: ['text', 'video', 'text+video'].indexOf(flags.format) >= 0 ? flags.format : (pf ? pf.format : 'text'),
      project: flags.project || flags.proj || ((cfg.projects || [])[0] || {}).name || 'general', copy: flags.copy || (pf ? pf.copy : ''), video: pf ? pf.video : { title: '', status: 'none', notes: '', link: '' }, links: [], assets: [],
      prep: String(flags.prep || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return { text: x, done: false, kind: 'content' }; }),
      notes: flags.notes || '', status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } };
    if (pf) { if (pf.noteId) np.noteId = pf.noteId; if (pf.scriptId) np.scriptId = pf.scriptId; }
    s.posts.push(np); write(fileName('social'), s);
    if (fromK === 'take') { flags.note = 'link: connected take ' + fromIt.id + ' to post ' + np.id + (flags.note ? ' · ' + flags.note : ''); patchVideo(fromIt, function (f) { f.postId = np.id; f.linkedAt = Date.now(); }); }
    if (forTaskP) attachToTask(forTaskP.task.id, 'postId', np.id, '', 'for task ' + forTaskP.task.id);
    return out('✓ Scheduled [' + np.id + '] ' + np.title + ' · ' + fmtDT(np.datetime) + (forTaskP ? '\n  For task: ' + forTaskP.task.title + ' [' + forTaskP.task.id + ']' : '') + (fromK ? '\n  Story: ' + storyLine('post', np.id) : '') + (flags.type && types.indexOf(flags.type) < 0 ? '\n  · type "' + flags.type + '" is not in your post types (' + types.join(', ') + '), so it is "' + np.postType + '". Add it: node solo.js config add social.postTypes ' + flags.type : ''), np);
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
    if (sub === 'show') { var it = find(items, pos.join(' '), label); var sl = storyLine(name === 'scripts' ? 'script' : 'note', it.id); return out(it.text + (sl ? '\n\n_Story: ' + sl + '_' : ''), it); }
    if (sub === 'add') {
      var title = pos.join(' ').trim() || flags.title; var text = flags.file ? fs.readFileSync(path.resolve(flags.file), 'utf8') : (flags.text || (title ? '# ' + title + '\n\n' : ''));
      var srcN = null; if (name === 'scripts' && flags.draft) { srcN = notes().notes.filter(function (n) { return n.id === flags.draft; })[0]; if (!srcN) fail('No draft has the id ' + flags.draft + ' (node solo.js notes list)'); if (!flags.file && !flags.text && ST) { text = ST.scriptFrom('note', srcN).text; if (title) text = text.replace(/^#\s+.+/m, '# ' + title); } }   // --title only renames; the draft's text still comes along
      var forTask = flags.task ? findTaskAny(flags.task) : null;   // --task t1: the piece is made for that task (its title and description when nothing else is given) and the card shows it
      if (forTask && !srcN && !flags.file && !flags.text && !title && ST) { if (name === 'scripts') { var tdraft = forTask.task.noteId ? notes().notes.filter(function (n) { return n.id === forTask.task.noteId; })[0] : null; if (tdraft) { srcN = tdraft; text = ST.scriptFrom('note', tdraft).text; } else text = ST.scriptFrom('task', forTask.task).text; } else text = ST.noteFrom(forTask.task).text; }   // scripts add --draft n1: the draft's clean text becomes the script, and the script remembers the draft
      if (!text.trim()) fail('Usage: ' + name + ' add "Title"   or   ' + name + ' add --file draft.md' + (name === 'scripts' ? '   or   scripts add --draft <draft id>' : ''));
      var item = mk(text); if (srcN) item.noteId = srcN.id;
      list.unshift(item); d.activeId = item.id; write(fileName(name), d);
      if (forTask) attachToTask(forTask.task.id, name === 'scripts' ? 'scriptId' : 'noteId', item.id, name === 'scripts' ? 'script' : 'writing', 'for task ' + forTask.task.id);
      return out('✓ Added [' + item.id + '] ' + (item.title || titleOf(item.text)) + (forTask ? '\n  For task: ' + forTask.task.title + ' [' + forTask.task.id + ']' : '') + (item.noteId ? '\n  Story: ' + storyLine(name === 'scripts' ? 'script' : 'note', item.id) : ''), item);
    }
    if (sub === 'set') {   // scripts set <s> --file x.md | --text "…": the new text replaces the script's or draft's text (Improve, Edit this draft, Ten hooks); logged, revertable
      var tq = pos.join(' ').trim(); if (!tq) fail('Usage: ' + name + ' set <id or title> --file new.md   (or --text "…")');
      var hitS = find(items, tq, label); var nt = flags.file ? fs.readFileSync(path.resolve(String(flags.file)), 'utf8') : (flags.text !== undefined && flags.text !== true ? String(flags.text) : '');
      if (!nt.trim()) fail(name + ' set needs the new text: --file new.md or --text "…"');
      var row = list.filter(function (x) { return x.id === hitS.id; })[0]; row.text = nt; if (name === 'scripts') row.title = titleOf(nt); row.updatedAt = Date.now(); write(fileName(name), d);
      return out('✓ Rewrote [' + row.id + '] ' + (row.title || titleOf(nt)) + ' (' + nt.split('\n').length + ' lines; `node solo.js log` shows it, `revert` undoes it)', row);
    }
    if (sub === 'rm') { var r = find(items, pos.join(' '), label); d[key] = list.filter(function (x) { return x.id !== r.id; }); if (d.activeId === r.id) d.activeId = d[key][0] ? d[key][0].id : ''; write(fileName(name), d); return out('✓ Deleted [' + r.id + '] ' + r.title, r); }
    fail('Unknown ' + name + ' command "' + sub + '". Try: list, show, add, set, rm');
  };
}
var cmdScripts = libCmd('scripts', 'scripts', 'script', function (text) { return { id: newId('s'), title: titleOf(text), text: text, createdAt: Date.now(), updatedAt: Date.now() }; });
var cmdNotes = libCmd('writing', 'notes', 'note', function (text) { return { id: newId('n'), text: text, images: {}, createdAt: Date.now(), updatedAt: Date.now() }; });

/* ---- video: cut a take by its words, on the local file (core/video.js) ------
   data/videos.json holds the takes; data/videos/<id>/ the transcript, the
   captions and the exports. The footage is referenced by path, never copied. */
var V = safeRequire(path.join(ROOT, 'core', 'video.js'));
function videos() { var d = read(fileName('videos')); return d && Array.isArray(d.videos) ? d : { activeId: '', videos: [] }; }
function videoCfg() { return Object.assign({ engine: '', ffmpeg: '', whisper: '', model: 'small.en', captions: { style: 'sentence', burn: false }, pause: 0.7, recordings: '', auto: '', autoMaxMin: 30 }, cfg.video || {}); }
function videoDir(id) { return path.join(DATA, 'videos', id); }
function relData(abs) { return 'data/' + path.relative(DATA, abs).split(path.sep).join('/'); }
function absData(rel) { return path.isAbsolute(rel) ? rel : /^data\//.test(rel) ? path.join(DATA, rel.replace(/^data\//, '')) : path.join(ROOT, rel); }
function fmtSize(b) { b = b || 0; return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : b < 10 * 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b < 1073741824 ? Math.round(b / 1048576) + ' MB' : (b / 1073741824).toFixed(1) + ' GB'; }
function requireFfmpeg() { if (!V) fail('core/video.js not found.'); var t = V.node.tools(videoCfg()); if (!t.ffmpeg || !t.ffprobe) fail(V.node.NEED_FFMPEG); return t; }
function secrets() { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'secrets.json'), 'utf8')) || {}; } catch (e) { return {}; } }
function edlHash(edl) { return V.edlHash(edl); }   // one function for the CLI and the page (core/video.js)
// Write one take's fields onto a FRESH copy of videos.json: transcribe and render take minutes, and the Video page
// (or another command) may have written the file meanwhile. fn(freshTake) patches only what this command owns.
function patchVideo(v, fn) { var d2 = videos(); var fresh = d2.videos.filter(function (x) { return x.id === v.id; })[0]; if (!fresh) { d2.videos.unshift(v); fresh = v; } fn(fresh); fresh.updatedAt = Date.now(); write(fileName('videos'), d2); Object.assign(v, fresh); return fresh; }
var NO_LIBASS = 'Burned captions need an ffmpeg built with libass, and Homebrew\'s is not. The captions are in the file as a track and next to it as a .srt, which YouTube, LinkedIn and TikTok read when you upload it. For burned-in captions: brew trust homebrew-ffmpeg/ffmpeg && brew tap homebrew-ffmpeg/ffmpeg && brew install homebrew-ffmpeg/ffmpeg/ffmpeg (it compiles, takes a while), or point video.ffmpeg at another ffmpeg: node solo.js config set video.ffmpeg /path/to/ffmpeg';
function videoStatus(v, s) {   // posted = the linked post says so
  if (v.postId) { var p = (s || schedule()).posts.filter(function (x) { return x.id === v.postId; })[0]; if (p && p.status === 'posted') return 'posted'; }
  return v.status || 'recorded';
}
function latestExport(v, kind) { return (v.exports || []).filter(function (e) { return e.kind === kind; }).pop() || null; }
function videoLine(v, s) { var src = (v.sources || [])[0] || {}; var ex = (v.exports || []).filter(function (e) { return e.kind === 'final'; }); return '- [' + v.id + '] ' + v.title + ' · ' + videoStatus(v, s) + (src.duration ? ' · ' + V.fmt(src.duration) : '') + (src.width ? ' · ' + src.width + '×' + src.height : '') + (v.transcript && v.transcript.words ? ' · ' + v.transcript.words + ' words' : '') + (v.edl && v.edl.length ? ' · cut: ' + v.edl.length + ' piece' + (v.edl.length === 1 ? '' : 's') : '') + (ex.length ? ' · ' + ex.length + ' final' + (ex.length === 1 ? '' : 's') : ''); }
function readTranscript(v) { var f = v.transcript && v.transcript.file ? absData(v.transcript.file) : ''; if (!f || !fs.existsSync(f)) return null; try { var t = JSON.parse(fs.readFileSync(f, 'utf8')); return t && Array.isArray(t.words) ? t : null; } catch (e) { return null; } }
function wsFlag() { return WS_ID === PRIMARY ? '' : ' --ws ' + WS_ID; }
// the example in a Next line comes from the take itself, so the numbers exist
function keepExample(v) { var ph = v.phrases || []; if (ph.length < 2) return ph[0] ? '"' + ph[0].s.toFixed(1) + '-' + ph[0].e.toFixed(1) + '"' : '"2.4-6.8, 8.1-15.0"'; var a = ph[0], b = ph[ph.length - 1]; return '"' + a.s.toFixed(1) + '-' + a.e.toFixed(1) + ', ' + b.s.toFixed(1) + '-' + b.e.toFixed(1) + '"'; }
function videoNext(v, s) {
  var st = videoStatus(v, s);
  if (st === 'recorded') return 'node solo.js video transcribe ' + v.id + wsFlag();
  if (st === 'transcribed') return 'node solo.js video cut ' + v.id + ' --keep ' + keepExample(v) + '   (the [start-end] numbers are seconds; keep what you want, in that order)   or   --drop "um, uh"';
  if (st === 'cut') return 'node solo.js video render ' + v.id + ' --preview' + wsFlag();
  if (st === 'rendered') return v.postId ? 'node solo.js social posted ' + v.postId + ' --url … once it is up' : 'node solo.js video post ' + v.id + ' --at "tomorrow 09:00"' + wsFlag();
  return '';
}
// one line for today/week: the take that waits for its next step, or nothing
function videoNudge() {
  if (!V) return ''; var d = read(fileName('videos')); if (!d || !Array.isArray(d.videos) || !d.videos.length) return '';
  var s = schedule(); var waiting = d.videos.filter(function (v) { return ['recorded', 'transcribed', 'cut'].indexOf(videoStatus(v, s)) >= 0; }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  if (!waiting.length) return '';
  var v = waiting[0]; var st = videoStatus(v, s); var what = st === 'recorded' ? 'not transcribed yet' : st === 'transcribed' ? 'words ready, not cut yet' : 'cut, not rendered yet';
  return '- ' + waiting.length + ' take' + (waiting.length === 1 ? '' : 's') + ' waiting · [' + v.id + '] ' + v.title + ' · ' + st + ' ' + ago(new Date(v.updatedAt || 0).toISOString()) + ' · ' + what + ' → ' + videoNext(v, s).split('   ')[0];
}
function cmdVideo() {
  if (!V) fail('core/video.js not found.');
  var sub = (pos.shift() || 'list').toLowerCase(); var d = videos(); var VC = videoCfg();
  function note(t) { flags.note = flags.note ? t + ' · ' + flags.note : t; }   // the change log names the step, and keeps the agent's note after it
  if (sub === 'key') {   // video key set elevenlabs <key> | --stdin → data/secrets.json (never settings.json, never the backup)
    var service = String(pos[1] || '').toLowerCase(); if ((pos[0] || '') !== 'set' || service !== 'elevenlabs') fail('Usage: video key set elevenlabs <key>   (or --stdin to paste it without leaving it in your shell history). Kept in data/secrets.json, which the backup never includes.');
    var keyVal = flags.stdin ? fs.readFileSync(0, 'utf8').trim() : String(pos[2] || ''); if (!keyVal) fail('No key given. Paste it: echo <key> | node solo.js video key set elevenlabs --stdin');
    var sec = secrets(); sec[service] = keyVal; fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'secrets.json'), JSON.stringify(sec, null, 2) + '\n', { mode: 384 }); try { fs.chmodSync(path.join(DATA, 'secrets.json'), 384); } catch (e) { /* windows */ }
    return out('✓ ' + service + ' key saved in data/secrets.json (not in settings.json, not in the backup)' + (flags.stdin ? '' : '\n  Tip: --stdin keeps it out of your shell history next time.'), { saved: service });
  }
  if (sub === 'list') { var sl = schedule(); return out(['## Takes (' + d.videos.length + ')'].concat(d.videos.length ? d.videos.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).map(function (v) { return videoLine(v, sl); }) : ['_no takes yet: node solo.js video add --file ./take.mov_']), d.videos.map(function (v) { return { id: v.id, title: v.title, status: videoStatus(v, sl), sources: v.sources, transcript: v.transcript, edl: v.edl, exports: v.exports, postId: v.postId, next: videoNext(v, sl) }; })); }
  if (sub === 'add') {
    if (!flags.file) fail('Usage: video add ["Title"] --file ./take.mov [--script s3]   (no title: the file name is used)');
    var T = requireFfmpeg(); var abs = path.resolve(String(flags.file)); if (!fs.existsSync(abs)) fail('No such file: ' + flags.file);
    var title = pos.join(' ').trim() || flags.title || path.basename(abs).replace(/\.[^.]+$/, '');
    var pr; try { pr = V.node.probe(T, abs); } catch (e) { fail(path.basename(abs) + ' is not a video or audio file ffmpeg can read. Takes are .mov, .mp4, .mkv, .webm (or audio: .wav, .m4a).' + (JSON_OUT ? ' [' + e.message + ']' : '')); }
    var h0 = V.node.hashFile(abs); var realp = (function () { try { return fs.realpathSync(abs); } catch (e) { return abs; } })();
    var dup = d.videos.filter(function (x) { return (x.sources || []).some(function (sx) { var sp = sx.path || ''; try { sp = fs.realpathSync(sp); } catch (e) { /* moved */ } return sx.hash === h0 || sp === realp || (process.platform !== 'linux' && sp.toLowerCase() === realp.toLowerCase()); }); })[0];
    if (dup && !flags.again) return out('✓ Already a take: [' + dup.id + '] ' + dup.title + ' (the same recording; --again adds it once more)', Object.assign({ existing: true }, dup));
    var scriptId = ''; if (flags.script) { var sc = find(scripts().scripts.map(function (x) { return { id: x.id, title: x.title || titleOf(x.text) }; }), String(flags.script), 'script'); scriptId = sc.id; }
    var v = { id: newId('v'), title: title, scriptId: scriptId, postId: '', status: 'recorded', sources: [{ id: 'a', path: abs, size: pr.size, duration: pr.duration, width: pr.width, height: pr.height, fps: pr.fps, rotation: pr.rotation, hdr: pr.hdr, hasAudio: pr.hasAudio, vcodec: pr.vcodec || '', acodec: pr.acodec || '', hash: h0 }], transcript: null, phrases: [], edl: [], edlHash: '', captions: { style: VC.captions.style || 'sentence', burn: !!VC.captions.burn }, exports: [], notes: flags.notes || '', createdAt: Date.now(), updatedAt: Date.now() };
    var forTaskV = flags.task ? findTaskAny(flags.task) : null; if (forTaskV && !scriptId && forTaskV.task.scriptId) { v.scriptId = forTaskV.task.scriptId; scriptId = v.scriptId; }   // --task t1: the take belongs to that task (and to its script when it has one)
    note('video add ' + v.id + ' ' + title); d.videos.unshift(v); if (!flags['no-open']) d.activeId = v.id; write(fileName('videos'), d);
    if (forTaskV) attachToTask(forTaskV.task.id, 'takeId', v.id, 'video', 'for task ' + forTaskV.task.id);   // --no-open: the watcher adds without switching the open take
    return out(['✓ Added take [' + v.id + '] ' + v.title + (pos.length || flags.title ? '' : '   (title from the file name; rename with --title)'), '  ' + abs, '  ' + V.fmt(pr.duration) + ' · ' + pr.width + '×' + pr.height + ' · ' + pr.fps + ' fps · ' + fmtSize(pr.size) + (pr.hdr ? ' · HDR' : '') + (pr.rotation ? ' · rotated ' + pr.rotation + '°' : '') + (pr.hasAudio ? '' : ' · no audio track (no words to transcribe; --keep trims still work)'), '  The file stays where it is; nothing was copied.', '  Next: ' + videoNext(v)], v);
  }
  if (!read(fileName('videos')) && sub !== 'recordings' && sub !== 'watch') fail('No takes yet. Add one: node solo.js video add --file ./take.mov   (or save a recording in the folder: node solo.js video recordings)');
  if (sub === 'show') {
    var v1 = find(d.videos, pos.join(' '), 'take'); var src1 = v1.sources[0] || {}; var s1 = schedule();
    var md = ['# ' + v1.title, '', '- id: ' + v1.id + ' · status: ' + videoStatus(v1, s1) + (v1.scriptId ? ' · script: ' + v1.scriptId : '') + (v1.postId ? ' · post: ' + v1.postId : '')].concat(storyLine('take', v1.id) ? ['- story: ' + storyLine('take', v1.id)] : []).concat([ '- file: ' + src1.path + (fs.existsSync(src1.path || '') ? '' : '  ⚠ not found (moved? node solo.js video source ' + v1.id + ' <new path>)'), '- ' + V.fmt(src1.duration) + ' · ' + src1.width + '×' + src1.height + ' · ' + src1.fps + ' fps · ' + fmtSize(src1.size) + (src1.hdr ? ' · HDR' : '') + (src1.hasAudio === false ? ' · no audio track' : ''), '']);
    if (v1.transcript) md.push('## Words (' + v1.transcript.words + ', ' + v1.transcript.engine + (v1.transcript.model ? ' ' + v1.transcript.model : '') + (v1.transcript.granularity === 'cue' ? ', cue-level: cuts snap to cues' : '') + ')', '', V.packed(v1.phrases || [], (function () { var trS = readTranscript(v1); var tw = trS ? V.trimToSilences(trS.words, trS.silences || []) : []; return { pauses: trS ? V.pauses(tw, null, { pause: Number(VC.pause) || 0.7, duration: src1.duration }) : [], retakes: trS ? V.retakes(tw) : [] }; })()), '');
    else md.push('_No transcript yet: node solo.js video transcribe ' + v1.id + '_', '');
    if (v1.edl && v1.edl.length) { md.push('## Cut (' + v1.edl.length + ' piece' + (v1.edl.length === 1 ? '' : 's') + ', ' + V.fmt(v1.edl.reduce(function (a, s) { return a + s.end - s.start; }, 0)) + ')'); v1.edl.forEach(function (s, i) { md.push((i + 1) + '. ' + V.fmt(s.start) + '-' + V.fmt(s.end) + (s.quote ? '  "' + s.quote + '"' : '') + (s.reason ? '  (' + s.reason + ')' : '')); }); md.push(''); }
    if (v1.exports && v1.exports.length) { md.push('## Exports'); var lf = latestExport(v1, 'final'), lp = latestExport(v1, 'preview'); v1.exports.forEach(function (e) { var fp = absData(e.file); var there = fs.existsSync(fp); md.push('- ' + e.file + ' · ' + e.kind + ' · ' + V.fmt(e.duration) + (e.aspect ? ' · ' + e.aspect : '') + (e.style && e.style !== 'sentence' ? ' · ' + e.style + ' captions' : '') + (there ? ' · ' + fmtSize(fs.statSync(fp).size) : '  ⚠ file missing') + (e === lf ? '  ← latest final (open / post use this)' : e === lp ? '  ← latest preview' : '') + (e.edlHash !== v1.edlHash ? '  ⚠ rendered before the current cut: node solo.js video render ' + v1.id : '')); }); md.push(''); }
    if (v1.notes) md.push('## Notes', '', v1.notes, '');
    var nx = videoNext(v1, s1); if (nx) md.push('Next: ' + nx);
    return out(md, v1);
  }
  if (sub === 'proxy' || sub === 'copy') {   // video proxy <take>: a 720p copy that plays in any browser, for the page's player (iPhone HEVC/HDR footage does not)
    var vx = find(d.videos, pos.join(' '), 'take'); var Tx = requireFfmpeg(); var sx = vx.sources[0]; if (!sx || !fs.existsSync(sx.path)) fail('The file is not where it was: ' + (sx && sx.path));
    var dx = videoDir(vx.id); var px = Object.assign({ hasAudio: true, hdr: false, height: 0 }, sx, V.node.probe(Tx, sx.path)); var lkx = V.node.lock(dx); if (lkx) fail('A render of this take is running; wait for it.');
    if (!JSON_OUT) process.stdout.write('Making a copy that plays in the browser (' + Math.min(720, px.height || 720) + 'p) …\n');
    var rx; try { rx = V.node.proxy({ tools: Tx, src: sx.path, probe: px, dir: dx }); } catch (e) { fail(e.message); }
    var stx = fs.statSync(rx.file); note('video proxy ' + vx.id); patchVideo(vx, function (f) { f.proxy = { file: relData(rx.file), size: stx.size, hash: sx.hash, at: Date.now() }; });
    return out('✓ ' + relData(rx.file) + ' · ' + fmtSize(stx.size) + ' · ' + rx.took + ' s. The page plays this copy; renders still come from the original.', { id: vx.id, file: relData(rx.file), size: stx.size, took: rx.took });
  }
  if (sub === 'word' || sub === 'correct') {   // video word <take> <n>[-<m>] "text" [--all] [--expect "old"] | --undo: the words change, the audio and the cut do not
    var vw = find(d.videos, pos[0], 'take'); var trw = readTranscript(vw); if (!trw) fail('No transcript yet: node solo.js video transcribe ' + vw.id);
    trw.words = V.normalizeWords(trw.words); trw.edits = Array.isArray(trw.edits) ? trw.edits : [];
    function saveWords(nw2, what) { trw.words = nw2; trw.text = nw2.map(function (x) { return x.w; }).join(' '); trw.correctedAt = Date.now(); fs.writeFileSync(absData(vw.transcript.file), JSON.stringify(trw, null, 1) + '\n'); note('video word ' + vw.id + ': ' + what); patchVideo(vw, function (f) { f.phrases = V.phrases(nw2); f.transcript = Object.assign(f.transcript || {}, { words: nw2.length, wordsAt: trw.correctedAt }); (f.edl || []).forEach(function (sgm) { sgm.quote = nw2.filter(function (w) { return w.s >= sgm.start - 1e-6 && w.e <= sgm.end + 1e-6; }).map(function (w) { return w.w; }).join(' ').slice(0, 80); }); }); }   // wordsAt: the page drops its copy of the words; the EDL's quotes follow
    if (flags.undo) { var last = trw.edits.pop(); if (!last) fail('Nothing to undo in the words of ' + vw.id); var cur = trw.words.slice(last.from, last.from + last.now.length).map(function (x) { return x.w; }).join(' '); if (cur !== last.now.map(function (x) { return x.w; }).join(' ')) fail('The words changed since that correction; nothing undone.'); var backW = trw.words.slice(0, last.from).concat(last.was, trw.words.slice(last.from + last.now.length)); (last.hits || []).forEach(function (h) { if (backW[h.i] && backW[h.i].w === h.now) backW[h.i] = Object.assign({}, backW[h.i], { w: h.was }); }); saveWords(backW, 'undo ' + last.now.map(function (x) { return x.w; }).join(' ').slice(0, 30) + ' → ' + last.was.map(function (x) { return x.w; }).join(' ').slice(0, 30)); return out('✓ Undone: the words read "' + last.was.map(function (x) { return x.w; }).join(' ') + '" again' + ((last.hits || []).length ? ' (and the ' + last.hits.length + ' other place' + (last.hits.length === 1 ? '' : 's') + ')' : ''), { id: vw.id, undone: last, words: trw.words, silences: trw.silences || [] }); }
    var rng = String(pos[1] || '').match(/^(\d+)(?:-(\d+))?$/); var fromW, toW; var textW = pos.slice(2).join(' ').trim() || flags.text;
    if (rng) { fromW = Number(rng[1]); toW = rng[2] !== undefined ? Number(rng[2]) : fromW; }
    else {   // video word <take> "what it says" "what it should say": the first place those words are said in what plays (else anywhere)
      var said = String(pos[1] || '').trim(); if (!said || !textW) fail('Usage: video word <take> "what it says" "what it should say" [--all]   or   video word <take> <n>[-<m>] "text"   or   video word <take> --undo');
      var normW = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim(); }; var want = normW(said).split(' '); var hitsW = [];
      for (var wi0 = 0; wi0 + want.length <= trw.words.length; wi0++) { var okW = true; for (var wj = 0; wj < want.length; wj++) if (normW(trw.words[wi0 + wj].w) !== want[wj]) { okW = false; break; } if (okW) hitsW.push(wi0); }
      if (!hitsW.length) fail('"' + said + '" is not in the words of ' + vw.id + ' (node solo.js video show ' + vw.id + ' prints them).');
      var plays = function (i) { var w0 = trw.words[i], w1 = trw.words[i + want.length - 1]; return !(vw.edl || []).length || vw.edl.some(function (sgm) { return w0.s >= sgm.start - 1e-6 && w1.e <= sgm.end + 1e-6; }); };
      fromW = (hitsW.filter(plays)[0] !== undefined ? hitsW.filter(plays)[0] : hitsW[0]); toW = fromW + want.length - 1;
      if (hitsW.length > 1 && !flags.all) out('"' + said + '" is said ' + hitsW.length + ' times; correcting the first one that plays (--all for every one).');
    }
    if (!textW) fail('Give the words as they should read.');
    if (!(toW < trw.words.length)) fail('Those words are not in the transcript (it has ' + trw.words.length + ')');
    var before = trw.words.slice(fromW, toW + 1).map(function (x) { return x.w; }).join(' ');
    if (flags.expect !== undefined && String(flags.expect).trim() !== before) fail('Those words read "' + before + '" now, not "' + flags.expect + '": the transcript moved; reload and try again.');
    var cueW = vw.transcript && vw.transcript.granularity === 'cue'; if (cueW && flags.all) fail('Correct all needs word-level words; this transcript is caption lines.');
    var sW = trw.words[fromW].s, eW = trw.words[toW].e; if ((vw.edl || []).some(function (sgm) { return (sgm.start > sW + 1e-6 && sgm.start < eW - 1e-6) || (sgm.end > sW + 1e-6 && sgm.end < eW - 1e-6); })) fail('A cut edge sits inside those words; put them back first, then correct them.');
    var nw; try { nw = V.correct(trw.words, fromW, toW, textW, !!flags.all, cueW); } catch (e) { fail(e.message); }
    var nowRun = nw.slice(fromW, fromW + (nw.length - trw.words.length) + (toW - fromW + 1)); var changedN = nw.filter(function (x, i) { return !trw.words[i] || trw.words[i].w !== x.w; }).length;
    var hitsAll = []; if (flags.all) nw.forEach(function (x, i) { if ((i < fromW || i > toW) && trw.words[i] && trw.words[i].w !== x.w) hitsAll.push({ i: i, was: trw.words[i].w, now: x.w }); });   // --all keeps the run the same length, so the other places keep their index
    trw.edits.push({ at: Date.now(), from: fromW, was: trw.words.slice(fromW, toW + 1), now: nowRun, all: !!flags.all, hits: hitsAll }); if (trw.edits.length > 100) trw.edits.shift();
    saveWords(nw, before.slice(0, 30) + ' → ' + textW.slice(0, 30) + (flags.all ? ' (all)' : ''));
    return out('✓ "' + before + '" → "' + textW + '"' + (changedN > 1 && flags.all ? ' (' + changedN + ' places)' : '') + ' · the audio and the cut are untouched; captions follow at the next render · video word ' + vw.id + ' --undo takes it back (revert restores the phrases only)', { id: vw.id, from: fromW, to: toW, text: textW, changed: changedN, words: nw, silences: trw.silences || [] });
  }
  if (sub === 'title' || sub === 'rename') { var vn = find(d.videos, pos[0], 'take'); var nt2 = pos.slice(1).join(' ').trim() || flags.title; if (!nt2) fail('Usage: video title <take> "New title"'); note('video title ' + vn.id + ': ' + nt2); patchVideo(vn, function (f) { f.title = String(nt2).slice(0, 120); f.renamedAt = Date.now(); }); return out('✓ [' + vn.id + '] ' + vn.title, vn); }
  if (sub === 'recordings' || sub === 'watch') {   // the folder any recorder saves into; `watch` adds what lands there (the server does the same while it runs)
    var rdir = V.node.recordingsDir(VC);
    if (flags.set) fail('Set it with: node solo.js config set video.recordings "<folder>"   (then node solo.js video recordings)');
    if (flags.init || flags.create || sub === 'watch') fs.mkdirSync(rdir, { recursive: true });
    var state = V.node.recLoad(DATA); if (sub === 'watch' || flags.add) requireFfmpeg();
    if (flags.forget) { var fp = path.resolve(String(flags.forget)); if (!state.files[fp]) fail('Not in the list: ' + fp); delete state.files[fp]; V.node.recSave(DATA, state); return out('✓ Forgot ' + fp + '; it is added again the next time it is seen', { forgot: fp }); }
    // add one file as a take (same as `video add`, without switching the open take); dedupe lives in `video add` itself
    function addOne(fl) { var r4 = null; try { var so4 = require('child_process').spawnSync(process.execPath, [__filename, 'video', 'add', V.node.titleFromFile(fl.name), '--file', fl.path, '--no-open', '--json', '--as', SOURCE, '--note', 'arrived in the recordings folder'].concat(WS_ID === PRIMARY ? [] : ['--ws', WS_ID]), { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { SOLO_DATA: DATA }) }).stdout || ''; r4 = JSON.parse(so4.slice(so4.search(/[\[{]/))); } catch (e) { r4 = null; } V.node.recResult(state, fl.path, r4 && r4.id ? r4.id : null, Date.now(), !!(r4 && r4.existing)); V.node.recSave(DATA, state); return r4 && r4.id && !r4.existing ? r4 : null; }
    if (sub === 'recordings') {
      var there = []; try { there = fs.readdirSync(rdir).filter(function (n) { return n[0] !== '.' && V.node.MEDIA_RE.test(n); }); } catch (e) { there = []; }
      var waiting = there.filter(function (n) { var fp3 = path.join(rdir, n); var f = state.files[fp3]; var m3 = 0; try { m3 = fs.statSync(fp3).mtimeMs; } catch (e) { return false; } return !(f && (f.takeId || f.skipped)) && Date.now() - m3 > 5000; });
      if (flags.add && waiting.length) { var added = waiting.map(function (n) { var fp2 = path.join(rdir, n); if (state.files[fp2]) delete state.files[fp2].pending; var st = fs.statSync(fp2); return addOne({ path: fp2, name: n, size: st.size }); }).filter(Boolean); return out(['✓ Added ' + added.length + ' take' + (added.length === 1 ? '' : 's') + ' from ' + rdir].concat(added.map(function (x) { return '- [' + x.id + '] ' + x.title; })), added); }
      return out(['## Recordings folder', '', rdir + (fs.existsSync(rdir) ? '' : '   (not there yet: node solo.js video recordings --init)'), '', 'Save a recording into it (Recordly, QuickTime, your phone\'s file) and it becomes a take: by itself while `node serve.js` runs, or with `node solo.js video watch`.', waiting.length ? waiting.length + ' file' + (waiting.length === 1 ? '' : 's') + ' not added yet: ' + waiting.slice(0, 5).join(', ') + '   → node solo.js video recordings --add' : 'Nothing waiting in it.', 'Change it: node solo.js config set video.recordings "<folder>" · a file added by mistake and removed stays out; --forget <path> lets it in again'], { folder: rdir, exists: fs.existsSync(rdir), waiting: waiting });
    }
    if (!JSON_OUT) process.stdout.write('Watching ' + rdir + ' — save a recording there and it becomes a take. Ctrl-C to stop.\n');
    state.firstLook = true; V.node.scanRecordings(rdir, state); state.firstLook = false; V.node.recSave(DATA, state);   // what is there already waits for --add
    setInterval(function () { V.node.scanRecordings(rdir, state).forEach(function (fl) { var v5 = addOne(fl); if (v5 && !JSON_OUT) process.stdout.write('✓ New take [' + v5.id + '] ' + v5.title + ' · ' + V.fmt(v5.sources[0].duration) + '\n');
      var eng5 = flags.transcribe && flags.transcribe !== true ? String(flags.transcribe) : VC.auto;   // --transcribe <engine> names one; bare --transcribe = video.auto (the standing yes) and nothing else: video.engine alone never spends
      if (v5 && eng5 && v5.sources[0].duration <= (Number(VC.autoMaxMin) || 30) * 60) { V.node.job('transcribe', videoDir(v5.id), [__filename, 'video', 'transcribe', v5.id, '--engine', eng5].concat(eng5 === 'elevenlabs' ? ['--yes'] : []).concat(['--json', '--as', SOURCE]).concat(WS_ID === PRIMARY ? [] : ['--ws', WS_ID]), { engine: eng5, auto: true }, Object.assign({}, process.env, { SOLO_DATA: DATA })); if (!JSON_OUT) process.stdout.write('  getting the words (' + eng5 + ') …\n'); } }); }, 4000);
    return;
  }
  if (sub === 'rm') { var vr = find(d.videos, pos.join(' '), 'take'); note('video rm ' + vr.id + ' ' + vr.title); d.videos = d.videos.filter(function (x) { return x.id !== vr.id; }); if (d.activeId === vr.id) d.activeId = d.videos[0] ? d.videos[0].id : ''; write(fileName('videos'), d); var dirR = videoDir(vr.id); var hasDir = fs.existsSync(dirR); if (flags.files && hasDir) V.node.rmrf(dirR); return out('✓ Removed take [' + vr.id + '] ' + vr.title + (hasDir ? (flags.files ? ' and deleted ' + relData(dirR) : '. The transcript and exports stay in ' + relData(dirR) + '/ (add --files to delete them). The footage was never touched.') : ''), vr); }
  if (sub === 'source') {
    var vs = find(d.videos, pos[0], 'take'); var np = pos.slice(1).join(' ').trim() || flags.file; if (!np) fail('Usage: video source <take> <new path>');
    var Ts = requireFfmpeg(); var abs2 = path.resolve(np); if (!fs.existsSync(abs2)) fail('No such file: ' + np);
    var pr2; try { pr2 = V.node.probe(Ts, abs2); } catch (e) { fail(path.basename(abs2) + ' is not a video or audio file ffmpeg can read.'); } var h2 = V.node.hashFile(abs2); var same = vs.sources[0] && vs.sources[0].hash === h2;
    vs.sources[0] = { id: 'a', path: abs2, size: pr2.size, duration: pr2.duration, width: pr2.width, height: pr2.height, fps: pr2.fps, rotation: pr2.rotation, hdr: pr2.hdr, hasAudio: pr2.hasAudio, hash: h2 };
    if (!same) { vs.transcript = null; vs.phrases = []; vs.edl = []; vs.edlHash = ''; vs.cutAt = Date.now(); vs.status = 'recorded'; }
    note('video source ' + vs.id + (same ? ' (same file)' : ' (different file)')); vs.updatedAt = Date.now(); write(fileName('videos'), d);
    return out('✓ [' + vs.id + '] now points at ' + abs2 + (same ? ' (same recording: the words and the cut are kept)' : ' (a different recording: transcribe it again; the old words and cut were cleared)'), vs);
  }
  if (sub === 'transcribe') {
    var vt = find(d.videos, pos.join(' '), 'take'); var T2 = requireFfmpeg(); var src = vt.sources[0]; if (!src || !fs.existsSync(src.path)) fail('The file is not where it was: ' + (src && src.path) + '. Point at it again: node solo.js video source ' + vt.id + ' <new path>');
    if (src.hasAudio === false) fail('This take has no audio track, so there are no words to transcribe. You can still trim it: node solo.js video cut ' + vt.id + ' --keep "0-' + V.fmt(src.duration) + '"');
    var dir = videoDir(vt.id); fs.mkdirSync(dir, { recursive: true }); var lang = flags.lang ? String(flags.lang).toLowerCase() : ''; var model = String(flags.model || VC.model || 'small.en');
    if (!/^[a-z0-9.-]+$/.test(model)) fail('video.model "' + model + '" is not a model name (small.en, base.en, small, medium …)');
    var engine = flags.from ? 'import' : String(flags.engine || VC.engine || '').toLowerCase();
    if (!engine) return out(['Which way do you want the words? Pick one and run it:', '', '  (1) On this computer: free, nothing leaves your machine, about a minute per 10 minutes of audio on a recent Mac (first time: downloads a 490 MB model into data/models/, once).', '      node solo.js video transcribe ' + vt.id + ' --engine whisper', '  (2) ElevenLabs: the audio (not the video) is sent to them; about $0.40 per hour of audio; needs a key (node solo.js video key set elevenlabs <key>). It shows the price for this take and asks before spending.', '      node solo.js video transcribe ' + vt.id + ' --engine elevenlabs', '  (3) I already have a transcript (an SRT, VTT or JSON from YouTube, Descript or another tool).', '      node solo.js video transcribe ' + vt.id + ' --from captions.srt', '', 'Remember the choice: node solo.js config set video.engine whisper'], { ask: 'engine', options: ['whisper', 'elevenlabs', 'import'] });
    if (['whisper', 'elevenlabs', 'import'].indexOf(engine) < 0) fail('Unknown engine "' + engine + '". Engines: whisper (local) · elevenlabs (audio only leaves the machine) · --from <file> (import)');
    var tFile = path.join(dir, 'transcript.json'); var cached = null; try { cached = JSON.parse(fs.readFileSync(tFile, 'utf8')); } catch (e) { cached = null; }
    function finish(words, granularity, raw, eng, mdl, langUsed, silences) {
      if (silences && silences.length) words = V.trimToSilences(words, silences);   // whisper glues silence into the neighbouring word; the audio knows better
      var t = { engine: eng, model: mdl || '', lang: langUsed || '', granularity: granularity, source: { hash: src.hash, path: src.path }, words: words, silences: silences || [], text: words.map(function (w) { return w.w; }).join(' '), createdAt: Date.now() };
      fs.writeFileSync(tFile, JSON.stringify(t, null, 1) + '\n'); if (raw) fs.writeFileSync(path.join(dir, 'transcript-raw.json'), JSON.stringify(raw) + '\n');
      var changed = cached && cached.words && JSON.stringify(cached.words) !== JSON.stringify(words); var cutNote = '';
      if (changed && vt.edl && vt.edl.length) { vt.edl = []; vt.edlHash = ''; cutNote = '\n  · the words changed, so the earlier cut (made on the old words) was cleared; node solo.js revert <id> brings it back'; }
      note('video transcribe ' + vt.id + ' (' + words.length + ' words, ' + eng + ')');
      patchVideo(vt, function (f) { f.transcript = { engine: eng, model: mdl || '', lang: langUsed || '', granularity: granularity, words: words.length, file: relData(tFile) }; f.phrases = V.phrases(words); if (changed && f.edl && f.edl.length) { f.edl = []; f.edlHash = ''; f.cutAt = Date.now(); } if (f.status === 'recorded' || (changed && f.status === 'cut')) f.status = 'transcribed'; });
      var md2 = ['✓ ' + words.length + ' words from ' + eng + (mdl ? ' ' + mdl : '') + (granularity === 'cue' ? ' (cue-level: cuts will snap to the cues, not to words)' : '') + ' → ' + relData(tFile) + cutNote, '', V.packed(vt.phrases.slice(0, 12)) + (vt.phrases.length > 12 ? '\n… ' + (vt.phrases.length - 12) + ' more: node solo.js video show ' + vt.id : ''), '', 'Next: say what to keep — ' + videoNext(vt)];
      return out(md2, vt);
    }
    var editsNote = function () { if (cached && cached.edits && cached.edits.length) out('Note: the words were corrected ' + cached.edits.length + ' time' + (cached.edits.length === 1 ? '' : 's') + ' (video word); getting them again discards those corrections. Keep them with video word, not by transcribing again.'); };
    if (engine === 'import') {
      editsNote();
      var f = path.resolve(String(flags.from)); if (!fs.existsSync(f)) fail('No such file: ' + flags.from);
      var imp; try { imp = V.importTranscript(fs.readFileSync(f, 'utf8'), path.extname(f)); } catch (e) { fail(e.message); }
      var silI = []; try { var tmpI = V.node.tmpDir(); V.node.extractAudio(T2, src.path, path.join(tmpI, 'audio.wav')); silI = V.node.silences(T2, path.join(tmpI, 'audio.wav'), { duration: src.duration }); V.node.rmrf(tmpI); } catch (e) { silI = []; }   // pauses come from the audio even for an imported transcript
      return finish(imp.words, imp.granularity, null, imp.engine === 'import' ? 'import' : imp.engine, '', lang, silI);
    }
    if (engine === 'whisper' && lang && lang !== 'en' && /\.en$/.test(model) && !flags.model) model = model.replace(/\.en$/, '');   // the .en models are English only
    var langUsed = engine === 'whisper' ? (lang || (/\.en$/.test(model) ? 'en' : 'auto')) : lang;
    if (cached && cached.source && cached.source.hash === src.hash && cached.engine === engine && (engine !== 'whisper' || cached.model === model) && !flags.force) { note('video transcribe ' + vt.id + ' (cached)'); patchVideo(vt, function (f) { f.transcript = Object.assign(f.transcript || {}, { engine: cached.engine, model: cached.model, lang: cached.lang || '', granularity: cached.granularity || 'word', words: cached.words.length, file: relData(tFile) }); f.phrases = V.phrases(cached.words); if (f.status === 'recorded') f.status = 'transcribed'; }); return out('✓ Already transcribed with ' + engine + (cached.model ? ' ' + cached.model : '') + ' (cached, the file did not change). --force runs it again.\n\nNext: ' + videoNext(vt), vt); }
    editsNote();
    var tmp = V.node.tmpDir(); var wav = path.join(tmp, 'audio.wav');
    function say(t) { if (!JSON_OUT) process.stdout.write(t + '\n'); }
    try {
      if (engine === 'whisper') {
        var bin = V.node.whisperBin(VC); if (!bin) fail('whisper.cpp is not installed. Mac: brew install whisper-cpp · Windows: download whisper-cli from github.com/ggml-org/whisper.cpp/releases and set its path: node solo.js config set video.whisper "C:\\\\…\\\\whisper-cli.exe". Or use --engine elevenlabs / --from <file>.');
        var mp = V.node.modelPath(DATA, model);
        var p0 = Promise.resolve();
        if (lang && lang !== 'en' && !/\.en$/.test(model) && !flags.model) say('Language ' + lang + ': using the multilingual ' + model + ' model' + (fs.existsSync(mp) ? '' : ' (another download, once)'));
        if (!fs.existsSync(mp)) { say('Downloading the ' + model + ' model (once, ' + (model.indexOf('small') === 0 ? '~490 MB' : model.indexOf('base') === 0 ? '~150 MB' : model.indexOf('tiny') === 0 ? '~80 MB' : 'a few hundred MB or more') + ') into data/models/ …'); p0 = V.node.download(V.node.MODEL_URL(model), mp, function (got, total) { if (!JSON_OUT && process.stdout.isTTY && total) process.stdout.write('\r  ' + Math.round(got / total * 100) + '%   '); }).then(function () { if (!JSON_OUT && process.stdout.isTTY) process.stdout.write('\r'); }); }
        return p0.then(function () {
          say('Listening to ' + V.fmt(src.duration) + ' of audio on this computer · about ' + Math.max(1, Math.round(src.duration / 600 + 0.5)) + ' min');
          V.node.extractAudio(T2, src.path, wav); var silW = V.node.silences(T2, wav, { duration: src.duration }); var r = V.node.whisper({ bin: bin, model: mp, wav: wav, lang: langUsed, outPrefix: path.join(tmp, 'words') }); V.node.rmrf(tmp);
          return finish(r.words, 'word', r.raw, 'whisper', model, langUsed, silW);
        }).catch(function (e) { V.node.rmrf(tmp); fail(e.message); });
      }
      var key = process.env.ELEVENLABS_API_KEY || secrets().elevenlabs || ''; if (!key) fail('ElevenLabs needs a key: node solo.js video key set elevenlabs <key>  (or set ELEVENLABS_API_KEY). The key stays in data/secrets.json, out of the backup.');
      var est = src.duration / 3600 * 0.40; var estText = est < 0.005 ? 'less than $0.01' : 'about $' + est.toFixed(2);
      if (!flags.yes) fail('ElevenLabs costs credits: ' + estText + ' for ' + V.fmt(src.duration) + ' (the audio is sent to them, the video stays here). Run again with --yes to go ahead.');
      say('Sending ' + V.fmt(src.duration) + ' of audio to ElevenLabs (' + estText + ') …');
      V.node.extractAudio(T2, src.path, wav); var silE = V.node.silences(T2, wav, { duration: src.duration });
      return V.node.elevenlabs({ key: key, wav: wav, lang: lang }).then(function (r) { V.node.rmrf(tmp); return finish(r.words, 'word', r.raw, 'elevenlabs', 'scribe_v1', lang, silE); }).catch(function (e) { V.node.rmrf(tmp); fail(e.message); });
    } catch (e) { V.node.rmrf(tmp); fail(e.message); }
  }
  if (sub === 'cut') {
    var vc = find(d.videos, pos.join(' '), 'take'); var srcC = vc.sources[0] || {}; var tr = readTranscript(vc) || {}; var words = V.trimToSilences(tr.words || [], tr.silences || []);   // word times trimmed to the measured silences, so no edge lands in glued silence
    var opts = { fps: srcC.fps, duration: srcC.duration }; var ranges, notes = []; var had = vc.edl && vc.edl.length ? vc.edl.length : 0;
    if (flags.edl) { var ej; try { ej = JSON.parse(fs.readFileSync(path.resolve(String(flags.edl)), 'utf8')); } catch (e) { fail('Could not read ' + flags.edl + ': ' + e.message); } try { ranges = V.fromEdl(Array.isArray(ej) ? ej : ej.edl, srcC.duration); } catch (e) { fail(e.message); } }
    else if (flags['drop-silence'] || flags.tidy || flags.retakes) {   // tidy up: long pauses shortened to a beat (and, with --tidy, the fillers gone; with --retakes, the first of a phrase said twice), inside the current cut
      if (!words.length) fail('No transcript yet, so there are no pauses to find: node solo.js video transcribe ' + vc.id);
      var minP = flags['min-pause'] !== undefined ? Number(flags['min-pause']) : Number(VC.pause) || 0.7; if (!(minP > 0.1)) fail('--min-pause is seconds, e.g. 0.7');
      if (!Array.isArray(tr.silences) && fs.existsSync(srcC.path || '')) {   // an older transcript: measure the silences once and keep them
        try { var Tb = requireFfmpeg(); var tmpB = V.node.tmpDir(); V.node.extractAudio(Tb, srcC.path, path.join(tmpB, 'audio.wav')); tr.silences = V.node.silences(Tb, path.join(tmpB, 'audio.wav'), { duration: srcC.duration }); V.node.rmrf(tmpB); tr.words = V.trimToSilences(tr.words || [], tr.silences); fs.writeFileSync(absData(vc.transcript.file), JSON.stringify(tr, null, 1) + '\n'); notes.push('measured the silences on the audio (kept in the transcript)'); words = tr.words; patchVideo(vc, function (f) { f.phrases = V.phrases(tr.words); }); } catch (e) { tr.silences = []; }
      }
      var keepsNow = had ? vc.edl : null; var cue = !!(vc.transcript && vc.transcript.granularity === 'cue');
      var onlyRetakes = flags.retakes && !flags.tidy && !flags['drop-silence'];
      var td = V.tidy(words, tr.silences || [], keepsNow, { pause: onlyRetakes ? 1e9 : minP, duration: srcC.duration, fps: srcC.fps, cue: cue, fillers: flags.tidy ? (flags.tidy === true ? V.FILLERS : String(flags.tidy).split(/[,;]+/)) : false, retakes: !!flags.retakes });
      if (!td.holes.length) fail('Nothing to tidy: ' + (onlyRetakes ? 'nothing said twice' : 'no pause over ' + minP + ' s' + (flags.tidy ? ' and no fillers' : '') + (flags.retakes ? ', nothing said twice' : '')) + (had ? ' inside the current cut' : '') + '.');
      ranges = td.ranges; notes.push([td.pauseHits ? 'shortened ' + td.pauseHits + ' pause' + (td.pauseHits === 1 ? '' : 's') + ' over ' + minP + ' s' : '', td.fillerHits ? 'dropped ' + td.fillerHits + ' filler' + (td.fillerHits === 1 ? '' : 's') : '', td.retakeHits ? 'took out ' + td.retakeHits + ' first ' + (td.retakeHits === 1 ? 'try' : 'tries') + ' of something said twice' : ''].filter(Boolean).join(', ') + (had ? ' inside the current cut' : ''));
    }
    else if (flags.drop) { if (!words.length) fail('No transcript yet, so there are no words to drop: node solo.js video transcribe ' + vc.id); if (vc.transcript && vc.transcript.granularity === 'cue') fail('This transcript is cue-level (imported captions), so single words cannot be dropped. Use --keep with the cue times from `video show`, or transcribe with --engine whisper.'); var dr = V.drop(String(flags.drop).split(/[,;]+/), words, had ? vc.edl : null, { duration: srcC.duration }); if (!dr.hits) fail('None of those words are in ' + (had ? 'the current cut' : 'the transcript') + '.'); ranges = dr.ranges; notes.push('dropped ' + dr.hits + ' match' + (dr.hits === 1 ? '' : 'es') + (had ? ' inside the current cut' : '')); }
    else if (flags.keep) { try { ranges = V.parseRanges(String(flags.keep)); } catch (e) { fail(e.message); } }
    else fail('Usage: video cut <take> --keep "2.42-6.85, 8.10-15.00"   or   --drop "um, uh, you know"   or   --drop-silence [--min-pause 0.7]   or   --tidy (fillers + pauses)   or   --retakes (the first of a phrase said twice)   or   --edl cut.json');
    var res; try { res = V.snap(ranges, words, opts); } catch (e) { fail(e.message); }
    if (had && !flags.drop && !flags['drop-silence'] && !flags.tidy) notes.push('replaced the previous cut (' + had + ' piece' + (had === 1 ? '' : 's') + '); node solo.js revert <id> brings it back (node solo.js log)');
    note('video cut ' + vc.id + ' (' + res.edl.length + ' piece' + (res.edl.length === 1 ? '' : 's') + ', ' + V.fmt(res.runtime) + (flags.tidy ? ', tidy up' : flags.retakes ? ', retakes' : flags['drop-silence'] ? ', pauses' : flags.drop ? ', drop ' + String(flags.drop).slice(0, 30) : flags.edl ? ', from an EDL' : '') + ')');
    patchVideo(vc, function (f) { f.edl = res.edl; f.edlHash = edlHash(res.edl); f.cutAt = Date.now(); if (['recorded', 'transcribed', 'rendered'].indexOf(f.status) >= 0) f.status = 'cut'; });   // a fresh copy of the file: a correction or a render may have landed meanwhile; cutAt is the cut's own stamp
    var md3 = ['✓ Cut: ' + res.edl.length + ' piece' + (res.edl.length === 1 ? '' : 's') + ', ' + V.fmt(res.runtime) + ' of ' + V.fmt(srcC.duration) + (words.length ? ' (edges snapped to words, padded)' : '')];
    res.edl.forEach(function (s, i) { md3.push('  ' + (i + 1) + '. ' + V.fmt(s.start) + '-' + V.fmt(s.end) + (s.quote ? '  "' + s.quote + (s.quote.length >= 80 ? '…' : '') + '"' : '') + (s.reason ? '  (' + s.reason + ')' : '')); });
    notes.concat(res.notes).forEach(function (n) { md3.push('  · ' + n); });
    md3.push('', 'Next: node solo.js video render ' + vc.id + ' --preview   (fast, small) · then without --preview for the final');
    return out(md3, { id: vc.id, edl: res.edl, runtime: res.runtime, notes: notes.concat(res.notes) });
  }
  if (sub === 'render') {
    var vd = find(d.videos, pos.join(' '), 'take'); var T3 = requireFfmpeg(); var srcR = vd.sources[0]; if (!srcR || !fs.existsSync(srcR.path)) fail('The file is not where it was: ' + (srcR && srcR.path) + '. Point at it again: node solo.js video source ' + vd.id + ' <new path>');
    if (!vd.edl || !vd.edl.length) fail('Nothing to render yet: say what to keep first — node solo.js video cut ' + vd.id + ' --keep ' + keepExample(vd) + ' (or --drop / --edl)');
    var dirR2 = videoDir(vd.id); fs.mkdirSync(dirR2, { recursive: true }); var lk = V.node.lock(dirR2); if (lk) { fail('A render of this take is already running since ' + localStamp(lk.startedAt) + '. Wait for it. If nothing is rendering (the window was closed), delete the file ' + relData(path.join(dirR2, 'progress.json')) + ' and run this again.'); }
    V.node.leftovers(dirR2).forEach(V.node.rmrf);   // an interrupted render's pieces
    var preview = !!flags.preview; var kind = preview ? 'preview' : 'final';
    var same = (vd.exports || []).filter(function (e) { return e.kind === kind && e.edlHash === vd.edlHash && fs.existsSync(absData(e.file)); }).pop();
    if (same && !flags.again && !flags.out) fail(path.basename(same.file) + ' is already this cut. Open it: node solo.js video open ' + vd.id + (preview ? ' --preview' : '') + ' · to render it again anyway add --again');
    var free = V.node.freeGB(dirR2); if (free >= 0 && free < 2) fail('Only ' + free.toFixed(1) + ' GB free on this disk. Make room before rendering.'); if (free >= 0 && free < 15 && !JSON_OUT) process.stdout.write('⚠ ' + free.toFixed(0) + ' GB free on this disk: enough for this render, but keep an eye on it.\n');
    var n = 1; try { fs.readdirSync(dirR2).forEach(function (f) { var m = f.match(new RegExp('^' + kind + '-(\\d+)\\.mp4$')); if (m && Number(m[1]) >= n) n = Number(m[1]) + 1; }); } catch (e) { /* new */ } var name = kind + '-' + n + '.mp4';
    var outPath = flags.out ? path.resolve(String(flags.out)) : ''; if (outPath && fs.existsSync(outPath)) fail(outPath + ' exists already; exports are never overwritten.');
    var style = String(flags.style || vd.captions.style || VC.captions.style || 'sentence'); if (!V.STYLES[style]) fail('Caption style "' + style + '" is not one of: ' + Object.keys(V.STYLES).join(', '));
    var burn = flags.burn !== undefined ? !!flags.burn && flags.burn !== 'false' : !!vd.captions.burn; var canBurn = V.node.hasFilter(T3.ffmpeg, 'subtitles');
    var burnNote = burn && !canBurn ? NO_LIBASS : ''; if (burnNote && !JSON_OUT) process.stdout.write('⚠ ' + burnNote + '\n');
    var tr2 = readTranscript(vd); var pr3 = Object.assign({ hasAudio: true, color: {} }, srcR, V.node.probe(T3, srcR.path));
    var total = vd.edl.reduce(function (a, s) { return a + s.end - s.start; }, 0); var t0 = Date.now(); var outH = preview ? Math.min(720, pr3.height) : pr3.height;
    if (!JSON_OUT) process.stdout.write('Rendering ' + V.fmt(total) + ' in ' + vd.edl.length + ' piece' + (vd.edl.length === 1 ? '' : 's') + (preview ? ' (' + outH + 'p preview)' : ' (' + pr3.width + '×' + pr3.height + ' final)') + ' → ' + relData(path.join(dirR2, name)) + '\n');
    function prog(extra) { V.node.progress(dirR2, Object.assign({ pid: process.pid, startedAt: new Date(t0).toISOString(), kind: kind, total: total, out: relData(path.join(dirR2, name)), finished: false }, extra)); }
    prog({ done: 0 }); var res2, finalFile, err;
    try {
      res2 = V.node.render({ tools: T3, src: srcR.path, probe: pr3, edl: vd.edl, dir: dirR2, preview: preview, burn: burn, style: style, aspect: flags.aspect === '9:16' ? '9:16' : '', words: tr2 ? tr2.words : [], granularity: vd.transcript && vd.transcript.granularity, name: name, onProgress: function (done, tot, i, nseg) {
        var el = (Date.now() - t0) / 1000; var left = done > 0 && (el >= 10 || i >= 2) ? el / done * (tot - done) : 0; prog({ done: done, piece: i, pieces: nseg });
        if (!JSON_OUT) process.stdout.write((process.stdout.isTTY ? '\r' : '') + '  piece ' + i + ' of ' + nseg + ' · ' + V.fmt(done) + ' of ' + V.fmt(tot) + (left > 5 ? ' · about ' + Math.max(1, Math.round(left / 60)) + ' min left' : '') + '     ' + (process.stdout.isTTY ? '' : '\n'));
      } });
      finalFile = res2.file;
      if (outPath) { fs.mkdirSync(path.dirname(outPath), { recursive: true }); try { fs.renameSync(res2.file, outPath); } catch (e) { if (e.code !== 'EXDEV') throw e; fs.copyFileSync(res2.file, outPath); fs.unlinkSync(res2.file); } finalFile = outPath; }
    } catch (e) { err = e; }
    finally { prog({ done: err ? 0 : total, finished: true, error: err ? err.message : undefined, took: Math.round((Date.now() - t0) / 1000) }); }
    if (err) fail(err.message);
    if (!JSON_OUT && process.stdout.isTTY) process.stdout.write('\n');
    var rel = outPath ? outPath : relData(finalFile); var st = fs.statSync(finalFile);
    var exportRec = { file: rel, kind: kind, duration: res2.duration, size: st.size, edlHash: vd.edlHash, captions: res2.burned ? 'burned' : res2.softCaptions ? 'track+srt' : 'none', srt: relData(res2.srt), encoder: res2.encoder, aspect: flags.aspect === '9:16' ? '9:16' : '', style: style, at: Date.now() };
    note('video render ' + vd.id + ' (' + name + ')'); patchVideo(vd, function (f) { f.exports = (f.exports || []).concat([exportRec]); if (!preview && f.edlHash === exportRec.edlHash) f.status = 'rendered'; });   // the cut may have changed on the page while this rendered: then it stays `cut`
    var notes2 = [burnNote, res2.note].filter(Boolean);
    return out(['✓ Done: ' + V.fmt(res2.duration) + ', ' + (preview ? outH + 'p preview' : pr3.width + '×' + pr3.height) + ', ' + fmtSize(st.size) + ', ' + Math.round((Date.now() - t0) / 1000) + ' s' + (res2.burned ? ', captions burned in' : res2.softCaptions ? ', captions as a track + ' + relData(res2.srt) : ''), '  ' + rel].concat(res2.note ? ['  ⚠ ' + res2.note] : []).concat(['  Open it: node solo.js video open ' + vd.id + (preview ? ' --preview' : '') + (preview ? ' · happy? node solo.js video render ' + vd.id + ' for the final' : ' · post it: node solo.js video post ' + vd.id + ' --at "tomorrow 09:00"')]), { id: vd.id, file: rel, duration: res2.duration, size: st.size, preview: preview, captions: res2.burned ? 'burned' : res2.softCaptions ? 'track+srt' : 'none', segments: res2.segments, encoder: res2.encoder, took: Math.round((Date.now() - t0) / 1000), note: notes2.join(' ') });
  }
  if (sub === 'open') {
    var vo = find(d.videos, pos.join(' '), 'take'); var ex = latestExport(vo, flags.preview ? 'preview' : 'final') || (vo.exports || []).slice(-1)[0];
    if (!ex) fail('No export yet: node solo.js video render ' + vo.id + (flags.preview ? ' --preview' : ''));
    var fp = absData(ex.file); if (!fs.existsSync(fp)) fail('The export is gone: ' + ex.file + '. Render again: node solo.js video render ' + vo.id);
    var opener = process.platform === 'darwin' ? ['open', [fp]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', fp]] : ['xdg-open', [fp]];
    try { require('child_process').spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { fail('Could not open it; the file is ' + fp); }
    return out('✓ Opening ' + ex.file, ex);
  }
  if (sub === 'post') {
    var vp = find(d.videos, pos.join(' '), 'take'); var exF = latestExport(vp, 'final'); if (!exF) fail('No final yet: node solo.js video render ' + vp.id);
    if (!fs.existsSync(absData(exF.file))) fail('The final is gone: ' + exF.file + '. Render again: node solo.js video render ' + vp.id);
    if (exF.edlHash !== vp.edlHash && !flags.force) fail(path.basename(exF.file) + ' was rendered before the current cut. Render the final again first: node solo.js video render ' + vp.id + '   (or --force to post it anyway)');
    var s2 = schedule(); var types = (cfg.social && cfg.social.postTypes) || ['announcement', 'launch', 'update', 'thread', 'teaser']; var link = require('url').pathToFileURL(absData(exF.file)).href;
    var np = { id: newId('p'), datetime: parseWhen(flags.at), title: flags.title || vp.title, postType: types.indexOf(flags.type) >= 0 ? flags.type : (types.indexOf('update') >= 0 ? 'update' : types[0] || 'update'), format: 'video', scriptId: vp.scriptId || '', project: flags.project || flags.proj || ((cfg.projects || [])[0] || {}).name || 'general', copy: flags.copy || '', video: { title: vp.title, status: 'edited', notes: 'cut from take ' + vp.id + (vp.scriptId ? ', script ' + vp.scriptId : ''), link: link }, links: [{ id: newId('l'), label: 'the cut (' + V.fmt(exF.duration) + ')', url: link, kind: 'video' }], assets: [], prep: [{ text: 'Watch the cut full-screen, sound off and on', done: false, kind: 'video' }, { text: 'Write the copy', done: !!flags.copy, kind: 'content' }], notes: '', status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } };
    note('video post ' + vp.id + ' → ' + np.id); s2.posts.push(np); write(fileName('social'), s2); patchVideo(vp, function (f) { f.postId = np.id; });
    if (flags.task) attachToTask(flags.task, 'postId', np.id, '', 'for task ' + flags.task);   // --task t1: the card's Post pill fills (it would anyway through the take, but the task knows the post directly)
    return out(['✓ Post [' + np.id + '] ' + np.title + ' · ' + fmtDT(np.datetime) + ' · video linked (not copied): ' + exF.file, '  Copy: node solo.js social copy ' + np.id + ' "…" · mark posted: node solo.js social posted ' + np.id + ' --url … (the take then reads posted)'], { post: np, video: vp.id });
  }
  fail('Unknown video command "' + sub + '". Try: list, add, show, transcribe, cut, word, render, proxy, open, post, title, source, recordings, watch, rm, key');
}
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
    var items = d.items.filter(function (x) { return (!flags.ws || !x.ws || x.ws === WS_ID) && (flags.status ? x.status === flags.status : x.status !== 'archived') && (!flags.tag || x.tags.indexOf(flags.tag) >= 0); });
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
    var as = AS_ALL.map(function (v) { return v === 'draft' ? 'note' : v; }).filter(function (v) { return ['task', 'post', 'script', 'note'].indexOf(v) >= 0; })[0]   // never --note: that is the log's note
      || (flags.task === true ? 'task' : flags.post === true ? 'post' : flags.script === true ? 'script' : flags.draft === true ? 'note' : null);
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
// the shared slash commands are committed with the code: they carry the shipped names, never your project's name (that stays in mine/)
function sharedPromptOpts() { var sw = Array.isArray(SHIPPED.workspaces) && SHIPPED.workspaces[0]; var sb = Array.isArray(SHIPPED.boards) && SHIPPED.boards[0];
  return { title: (sw && sw.title) || SHIPPED.name || 'Solo Ops', id: (sw && slug(sw.id || sw.title)) || 'main', board: (sb && slug(sb.id || sb.title)) || 'runway', mode: 'files', folder: '' }; }
function allPrompts(mode, over) {   // built-ins with your edits applied, plus your own — the list the Guide shows
  var d = read('prompts') || {}; var ov = d.overrides || {}, hidden = d.hidden || [], custom = d.custom || [];
  if (!P) fail('core/prompts.js is missing');
  var o = Object.assign(promptOpts(mode), over || {}); var list = P.build(o); var head = P.head(o);
  list.forEach(function (x) { if (ov[x.t] && (!ov[x.t].mode || ov[x.t].mode === o.mode)) { if (ov[x.t].d) x.d = ov[x.t].d; if (ov[x.t].p) x.p = ov[x.t].p; x.overridden = true; } });   // an edit belongs to the mode it was made in (older edits: both)
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
  if (sub === 'rm') { var r = find(d.custom, pos.join(' '), 'prompt'); d.custom = d.custom.filter(function (c) { return c.id !== r.id; }); d.removed = (d.removed || []).concat([r.id]); write('prompts', d); return out('✓ Deleted [' + r.id + '] ' + r.t, r); }   // removed: an open page's merge never brings it back
  if (sub === 'restore') { d.shown = (d.shown || []).concat(d.hidden).filter(function (h, i, a) { return a.indexOf(h) === i; }); d.hidden = [];
    if (flags.all) { d.reset = d.reset || {}; Object.keys(d.overrides).forEach(function (t) { d.reset[t] = Date.now(); }); d.overrides = {}; }   // reset: an open page's older copy of an edit never comes back
    write('prompts', d); return out('✓ Built-in prompts restored' + (flags.all ? ' (edits cleared too)' : ''), d); }
  fail('Unknown prompts command "' + sub + '". Try: builtin, show, export, list, add, edit, rm, restore');
}
// prompts export: every prompt as a slash command for the agent that runs commands, or the chat bootstrap.
// Only files carrying the generated marker are overwritten or removed; a hand-written command with the same name is left alone.
// AGENTS.md carries the menu between <!-- menu:begin --> and <!-- menu:end -->; prompts export rewrites it from core/prompts.js
function writeAgentsMenu() {
  var f = path.join(ROOT, 'AGENTS.md'); var t; try { t = fs.readFileSync(f, 'utf8'); } catch (e) { return false; }
  var a = t.indexOf('<!-- menu:begin'), b = t.indexOf('<!-- menu:end -->'); if (a < 0 || b < a) return false;
  var head = t.slice(a, t.indexOf('-->', a) + 3);
  var next = t.slice(0, a) + head + '\n```\n' + P.menuText(Object.assign(sharedPromptOpts(), { mode: 'files' })) + '\n```\n' + t.slice(b);
  if (next !== t) fs.writeFileSync(f, next); return next !== t;
}
// menu: what you can ask, by moment of the day (core/prompts.js MENU; the same list as /menu and the Guide's Start with one)
function cmdMenu() {
  if (!P) fail('core/prompts.js is missing');
  var list = allPrompts('files'); var by = {}; list.forEach(function (x) { by[x.slug] = x; });
  var groups = P.MENU.map(function (g) { return { id: g[0], title: g[1], items: g[2].filter(function (sl) { return by[sl]; }).map(function (sl) { return { slug: sl, title: by[sl].t, d: by[sl].d }; }) }; });
  out(P.menuText({ mode: 'files', title: WS.title, id: WS_ID }), { groups: groups });
}
function exportPrompts() {
  if (!P) fail('core/prompts.js is missing');
  var tool = String(flags['for'] || 'claude').toLowerCase();
  if (tool === 'docs') {   // docs/guide-prompts.md: the catalogue of every built-in prompt and page, from core/prompts.js (never from your edits)
    var df = path.resolve(flags.out || path.join(ROOT, 'docs', 'guide-prompts.md')); fs.mkdirSync(path.dirname(df), { recursive: true }); fs.writeFileSync(df, P.catalogue() + '\n');
    return out('✓ ' + path.relative(ROOT, df) + ' written (every prompt, page and the reply format, from core/prompts.js)', { file: df });
  }
  if (tool === 'chat' || tool === 'bootstrap') {
    var bf = path.resolve(flags.out || path.join(ROOT, 'prompts', 'agent-bootstrap.md')); fs.mkdirSync(path.dirname(bf), { recursive: true });
    fs.writeFileSync(bf, '# Paste this once into a ChatGPT or Claude Project (no file access needed)\n\n<!-- ' + P.MARK + ' -->\n\n' + P.bootstrap(flags.out ? promptOpts('chat') : Object.assign(sharedPromptOpts(), { mode: 'chat' })) + '\n\nReady? I will paste my snapshot next.\n');
    return out('✓ ' + path.relative(ROOT, bf) + ' written (the Guide\'s "Set up this chat" prompt, as a file)', { file: bf });
  }
  var dirs = { claude: path.join(ROOT, '.claude', 'commands'), cursor: path.join(ROOT, '.cursor', 'commands'), codex: path.join(process.env.CODEX_HOME || path.join(require('os').homedir(), '.codex'), 'prompts') };
  if (!dirs[tool]) fail('--for must be claude (default), cursor, codex, chat or docs');
  var dir = path.resolve(flags.out || dirs[tool]); fs.mkdirSync(dir, { recursive: true });
  if (tool === 'claude' && !flags.out) writeAgentsMenu();
  var all = allPrompts('files', { folder: '' }).filter(function (x) { return (x.c !== 'setup' || x.slash) && x.slug; });   // no absolute path: a slash command runs inside the folder
  var written = [], kept = [], removed = []; var o = promptOpts('files'); o.folder = ''; var rel = path.relative(ROOT, dir); if (rel.indexOf('..') === 0) rel = dir;
  // The shared files are always the built-in text (they are committed with the code). Your own prompts AND your edits of
  // built-ins go to mine/ (git-ignored): /mine:use-inspo is your version, /use-inspo stays the built-in.
  var inRepo = !flags.out && tool !== 'codex'; var oS = inRepo ? sharedPromptOpts() : o; var pristine = P.build(oS).filter(function (x) { return (x.c !== 'setup' || x.slash) && x.slug; });
  var mine = all.filter(function (x) { return x.custom || x.overridden; });
  var mineDir = path.join(dir, 'mine'); if (mine.length) fs.mkdirSync(mineDir, { recursive: true });
  pristine.concat(mine).forEach(function (x) { var isMine = x.custom || x.overridden; var f = path.join(isMine ? mineDir : dir, x.slug + '.md'); var prev = ''; try { prev = fs.readFileSync(f, 'utf8'); } catch (e) { /* new */ } if (prev && prev.indexOf(P.MARK) < 0) { kept.push(x.slug); return; } fs.writeFileSync(f, P.command(x, isMine ? o : oS, tool)); written.push((isMine ? 'mine/' : '') + x.slug); });
  var hasOwn = !!read('prompts');   // no data/prompts.json here (a fresh checkout, a worktree): mine/ belongs to another data folder, leave it alone
  [dir, mineDir].forEach(function (d, isMine) { if (isMine && !hasOwn) return; var names = []; try { names = fs.readdirSync(d); } catch (e) { return; } names.forEach(function (n) { if (!/\.md$/.test(n)) return; var slug = n.slice(0, -3); if ((isMine ? mine : pristine).some(function (x) { return x.slug === slug; })) return; var t = ''; try { t = fs.readFileSync(path.join(d, n), 'utf8'); } catch (e) { return; } if (t.indexOf(P.MARK) >= 0) { fs.unlinkSync(path.join(d, n)); removed.push((isMine ? 'mine/' : '') + slug); } }); });
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
    var apps = ['boards'].filter(function () { return w.boards.length; }).concat(['social', 'scripts', 'writing', 'video'].filter(function (a) { return w.apps[a]; }));
    return '- [' + w.id + '] ' + w.title + (w.sample ? ' (sample)' : '') + ' · ' + apps.join(', ') + (w.boards.length ? ' · boards: ' + w.boards.map(function (b) { return b.id; }).join(', ') : '') + (w.id === WS_ID ? ' (default)' : '') + (w.id === PRIMARY ? ' · files: short names' : ' · files: ' + w.id + '-*.json');
  })), WORKSPACES);
  if (sub === 'add') {
    var title = pos.join(' ').trim() || flags.title; if (!title) fail('Usage: workspaces add "Title" [--apps social,scripts,writing,video] [--boards "Launch,Ops"] [--sample]');
    var id = slug(title); if (!id || RESERVED.indexOf(id) >= 0 || WORKSPACES.some(function (w) { return w.id === id; })) fail('Pick a different name.');
    var apps = flags.apps === undefined ? ['boards', 'social', 'scripts', 'writing', 'video'] : split(flags.apps);
    var boards = (flags.boards === undefined ? (apps.indexOf('boards') >= 0 ? ['Board'] : []) : split(flags.boards)).map(function (t) { return { id: slug(t), title: t, sprintLabel: 'Progress', milestones: [], focus: [] }; });
    var w = { id: id, title: title, apps: { social: apps.indexOf('social') >= 0, scripts: apps.indexOf('scripts') >= 0, writing: apps.indexOf('writing') >= 0, video: apps.indexOf('video') >= 0 }, boards: boards, createdAt: Date.now() };
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
// What never leaves this computer with a backup: the change log, safety copies, keys, the inbox, the whisper
// model, and every rendered or temporary video file (data/videos/<id>/ keeps only transcript.json and the .srt).
var BACKUP_IGNORE = ['log.jsonl', '*.backup-*.json', 'exports/', 'identity.json', 'inbox.json', 'secrets.json', 'recordings.json', 'models/', 'videos/**', '!videos/*/', '!videos/*/transcript.json', '!videos/*/*.srt'];
function backupSkip(rel) {   // same rule for the folder copy (rel = path inside data/, forward slashes)
  rel = rel.split(path.sep).join('/');
  if (/^(\.git|log\.jsonl|exports|models|identity\.json|inbox\.json|secrets\.json|recordings\.json)(\/|$)/.test(rel) || /\.(file-)?backup-[\d-]+\.json$/.test(rel)) return true;
  var m = rel.match(/^videos\/[^/]+\/(.+)$/); if (m) return !/^(transcript\.json|[^/]+\.srt)$/.test(m[1]);
  return false;
}
function ensureIgnore() {   // runs on every backup: an old data repo gets the new lines too
  var f = path.join(DATA, '.gitignore'); var cur = ''; try { cur = fs.readFileSync(f, 'utf8'); } catch (e) { cur = ''; }
  var have = cur.split('\n').map(function (l) { return l.trim(); }); var add = BACKUP_IGNORE.filter(function (l) { return have.indexOf(l) < 0; });
  if (add.length) fs.writeFileSync(f, (cur.trim() ? cur.replace(/\n?$/, '\n') : '') + add.join('\n') + '\n');
  return add;
}
function copyToFolder(dest) {
  fs.mkdirSync(dest, { recursive: true }); var n = 0;
  fs.cpSync(DATA, dest, { recursive: true, dereference: true, filter: function (src) { var rel = path.relative(DATA, src); if (!rel) return true; if (backupSkip(rel)) return false; try { if (fs.statSync(src).isFile()) n++; } catch (e) { /* skip */ } return true; } });
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
      git(['init', '-q']);
      try { cp.execFileSync('git', ['-C', DATA, 'config', 'user.name'], { stdio: 'ignore' }); } catch (e) { git(['config', 'user.name', 'Solo Ops']); git(['config', 'user.email', 'solo-ops@localhost']); }
    }
    if (flags.remote) { if (git(['remote', 'get-url', 'origin'], { soft: true })) git(['remote', 'set-url', 'origin', String(flags.remote)]); else git(['remote', 'add', 'origin', String(flags.remote)]); }
    ensureIgnore(); git(['add', '-A']);
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
    if (flags.name !== undefined && (flags.name === true || !/^[A-Za-z0-9._-]{1,100}$/.test(String(flags.name)))) fail('--name takes a repository name: letters, digits, dots, dashes and underscores, e.g. --name solo-ops-data');
    var name = String(flags.name || 'solo-ops-data'); var info = null;
    function view() { try { return JSON.parse(cp.execFileSync('gh', ['repo', 'view', name, '--json', 'url,isPrivate,nameWithOwner'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 })); } catch (e) { return null; } }
    info = view();
    if (info && !info.isPrivate) fail('A repo called ' + name + ' already exists in your GitHub account and it is PUBLIC. Make it private (gh repo edit ' + info.nameWithOwner + ' --visibility private) or pick another name: node solo.js backup setup --name <name>');
    if (!info && !JSON_OUT) process.stdout.write('Creating a PRIVATE GitHub repo called ' + name + (flags.name ? '' : ' (another name: node solo.js backup setup --name <name>)') + '\n');   // say the name before anything is created
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
var PRIVATE_PATHS = [/^data\/(?!SCHEMA\.md$)/, /\.(file-)?backup-[\d-]+\.json$/, /^\.claude\/commands\/mine\//, /^\.cursor\/commands\/mine\//, /^solo-ops-backup-.*\.json$/, /\.(mp4|mov|m4v|mkv|webm|wav|m4a|aac)$/i];   // footage and renders are content, never code
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
  var po = sharedPromptOpts();
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
  var issues = [], notes = [], files = []; var refs = {}; var browserOnly = 0; var drafts = {};
  try { files = fs.readdirSync(DATA).filter(function (f) { return /\.json$/.test(f) && !/\.backup-/.test(f); }); } catch (e) { fail('No data/ folder yet. Run: node solo.js template all'); }
  var shapes = { social: 'posts', scripts: 'scripts', writing: 'notes', inspiration: 'items', boards: 'boards', workspaces: 'workspaces', activity: 'days', settings: 'theme', prompts: null, backup: null, identity: null, contacts: null, shares: 'shares', inbox: 'items', videos: 'videos', secrets: null, recordings: 'recordings' };
  files.forEach(function (f) {
    var txt, obj; try { txt = fs.readFileSync(path.join(DATA, f), 'utf8'); obj = JSON.parse(txt); } catch (e) { issues.push(f + ': not valid JSON (' + e.message.split('\n')[0] + ')'); return; }
    if (!obj || typeof obj !== 'object') { issues.push(f + ': not an object'); return; }
    var base = f.replace(/\.json$/, ''); var kind = Object.keys(shapes).filter(function (k) { return base === k || base.slice(-k.length - 1) === '-' + k; })[0];
    var machineOnly = ['secrets', 'recordings', 'backup', 'identity'].indexOf(kind) >= 0;   // never synced, so no stamp to check
    if (!obj.updatedAt) { if (!machineOnly) issues.push(f + ': no updatedAt (sync cannot tell which side is newer)'); } else if (isNaN(Date.parse(obj.updatedAt))) issues.push(f + ': updatedAt is not an ISO date');
    var arrKey = kind ? shapes[kind] : 'tasks';
    if (kind === 'settings') { if (!obj.theme) issues.push(f + ': no theme'); var cp = CfgLib ? CfgLib.check(SHIPPED, obj.config) : []; cp.forEach(function (m) { issues.push(f + ': ' + m + ' (fix: node solo.js config set …; the page ignores it meanwhile)'); }); if (isObj(obj.config) && Object.keys(obj.config).length && !cp.length) notes.push(f + ': your settings: ' + Object.keys(obj.config).join(', ')); }
    else if (kind === 'activity') { if (!obj.days || typeof obj.days !== 'object') issues.push(f + ': no days map'); }
    else if (kind === 'recordings') { if (!obj.files || typeof obj.files !== 'object' || Array.isArray(obj.files)) issues.push(f + ': no files map (node solo.js video recordings --init rewrites it)'); }
    else if (arrKey) {
      var arr = obj[arrKey]; if (!Array.isArray(arr)) { issues.push(f + ': expected an array "' + arrKey + '"'); return; }
      var seen = {}; arr.forEach(function (x, i) { if (!x || typeof x !== 'object') { issues.push(f + ': ' + arrKey + '[' + i + '] is not an object'); return; } if (x.id == null) issues.push(f + ': ' + arrKey + '[' + i + '] has no id'); else if (seen[x.id]) issues.push(f + ': duplicate id ' + x.id); seen[x.id] = 1;
        ['file', 'files', 'assets'].forEach(function (k) { var v = x[k]; if (!v) return; (typeof v === 'string' ? [v] : Array.isArray(v) ? v.map(function (a) { return a && a.file; }) : Object.keys(v).map(function (q) { return v[q]; })).forEach(function (r) { if (typeof r === 'string' && /^data\/attachments\//.test(r)) refs[r.replace(/^data\/attachments\//, '')] = f; }); });
        if (kind === 'writing' && x.id != null) drafts[x.id] = 1;   // its note-<id>-<n> originals stay in use even when the draft lost its files link
        if (x.stored === 'browser') browserOnly++; });
      if (arrKey === 'tasks') { var cols = ['todo', 'doing', 'done', 'later', 'bucket']; arr.forEach(function (t) { if (cols.indexOf(t.col) < 0) issues.push(f + ': task ' + t.id + ' has unknown column "' + t.col + '"'); }); }
      notes.push(f + ': ' + arr.length + ' ' + arrKey + ' · ' + Math.round(txt.length / 1024) + ' KB' + (txt.length > 2 * 1024 * 1024 ? '  ⚠ over 2 MB: change-log snapshots are skipped for this file' : ''));
    }
  });
  var bad = 0, logN = 0; try { fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).forEach(function (l) { logN++; try { JSON.parse(l); } catch (e) { bad++; } }); } catch (e) { /* no log */ }
  if (bad) issues.push('log.jsonl: ' + bad + ' unreadable line(s)'); else if (logN) notes.push('log.jsonl: ' + logN + ' entries');
  var adir = path.join(DATA, 'attachments'); var onDisk = []; try { onDisk = fs.readdirSync(adir).filter(function (f) { return f[0] !== '.'; }); } catch (e) { /* none */ }
  var unlinked = onDisk.filter(function (f) { var m = f.match(/^note-(.+)-\d+\.[^.]+$/); return !refs[f] && m && drafts[m[1]]; });
  var orphans = onDisk.filter(function (f) { return !refs[f] && unlinked.indexOf(f) < 0; }); var missing = Object.keys(refs).filter(function (f) { return onDisk.indexOf(f) < 0; });
  if (missing.length) issues.push('attachments: ' + missing.length + ' referenced file(s) missing from data/attachments/: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? '…' : ''));
  if (unlinked.length) notes.push('attachments: ' + unlinked.length + ' image(s) of a draft that lost its link to them (not safe to delete: the draft is still here): ' + unlinked.slice(0, 5).join(', ') + (unlinked.length > 5 ? '…' : ''));
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
  var samplePre = WORKSPACES.filter(function (w) { return w.sample; }).map(function (w) { return w.id + '-'; });
  var realData = files.some(function (f) { return !/^(settings|activity|boards|workspaces|prompts|backup)\.json$/.test(f) && !samplePre.some(function (p) { return f.indexOf(p) === 0; }) && hasContent(f.replace(/\.json$/, '')); });   // empty files and the Sample project are not your data yet   // empty files from a blank start are not data yet
  var BC = backupCfg(); var bfolder = BC.to || ''; var bAt = BC.lastAt || ''; var WEEK = 7 * 86400000;
  if (!repo && !bfolder && realData) issues.push('no backup: your data lives only on this computer. Run: node solo.js backup setup');
  else if (repo && lastBackup && Date.now() - Date.parse(lastBackup) > WEEK) issues.push('last backup was ' + Math.round((Date.now() - Date.parse(lastBackup)) / 86400000) + ' days ago. Run: node solo.js backup');
  else if (!repo && bfolder && (!bAt || Date.now() - Date.parse(bAt) > WEEK)) issues.push('last copy to ' + bfolder + ' was ' + (bAt ? Math.round((Date.now() - Date.parse(bAt)) / 86400000) + ' days ago' : 'never') + '. Run: node solo.js backup');
  else if (repo || bfolder) notes.push('backup: ' + [repo ? 'private repo, last ' + (lastBackup || 'never') : '', bfolder ? 'folder ' + bfolder + ', last ' + whenLocal(bAt) : ''].filter(Boolean).join(' · '));
  doctorVideo(files, issues, notes, repo);
  if (!realData) notes.push('fresh install: no tasks, posts, scripts or notes yet. Next: ask your agent for /setup (or /bring-in to bring your work in from Notion, Linear, Todoist…), or open the app with `node serve.js`. A sample to look around: `node solo.js template sample`');
  if (fs.existsSync(path.join(ROOT, '.git'))) { var hk = ''; try { hk = fs.readFileSync(path.join(ROOT, '.git', 'hooks', 'pre-commit'), 'utf8'); } catch (e) { /* none */ } if (!/solo\.js"? guard/.test(hk)) notes.push('commit guard not installed: `node solo.js guard --install` makes git refuse commits that contain data/ or personal prompts'); }
  out(['# doctor — ' + (issues.length ? issues.length + ' issue' + (issues.length === 1 ? '' : 's') : 'all good'), ''].concat(issues.map(function (i) { return '⚠ ' + i; })).concat(issues.length ? [''] : []).concat(notes.map(function (n) { return '· ' + n; })), { ok: !issues.length, issues: issues, notes: notes, orphans: orphans, missing: missing, browserOnly: browserOnly, repo: repo, lastBackup: lastBackup });
  if (issues.some(function (i) { return i.indexOf('no backup') !== 0; }) && !JSON_OUT) process.exitCode = 2;   // a missing backup is a reminder, not a broken install
}

// Video: the tools, the model, every take's file and exports, stale locks, big files in the backup repo.
function doctorVideo(files, issues, notes, repo) {
  if (!V) return; var vfiles = files.filter(function (f) { return /(^|-)videos\.json$/.test(f); }); var dirs = []; try { dirs = fs.readdirSync(path.join(DATA, 'videos')).filter(function (f) { return f[0] !== '.'; }); } catch (e) { dirs = []; }
  if (!vfiles.length && !dirs.length && cfg.apps && cfg.apps.video === false) return;   // the app is off and was never used: nothing to say; otherwise the tools are worth a line before the first take
  var T = V.node.tools(videoCfg()); var VC = videoCfg();
  if (!T.ffmpeg) issues.push('video: ffmpeg not found. ' + V.node.NEED_FFMPEG); else notes.push('video: ffmpeg ' + T.ffmpeg + (V.node.hasFilter(T.ffmpeg, 'subtitles') ? ', can burn captions' : ', no libass: captions go in as a track + .srt (burned-in ones need another build; `video render --burn` says how)'));
  var wb = V.node.whisperBin(VC); var mp = V.node.modelPath(DATA, VC.model || 'small.en'); var key = !!(process.env.ELEVENLABS_API_KEY || secrets().elevenlabs);
  notes.push('video: engines: ' + [wb ? 'whisper (' + (fs.existsSync(mp) ? 'model ' + path.basename(mp) + ' ready' : 'model downloads on first use') + ')' : '', key ? 'elevenlabs (key set)' : '', 'import'].filter(Boolean).join(' · ') + (VC.engine ? ' · default: ' + VC.engine : ' · no default yet (config set video.engine whisper)'));
  var rdir2 = V.node.recordingsDir(VC); notes.push('video: recordings folder ' + rdir2 + (fs.existsSync(rdir2) ? '' : ' (not created yet: node solo.js video recordings --init)') + (process.platform === 'darwin' ? ' · Recordly ' + (fs.existsSync('/Applications/Recordly.app') ? 'installed' : 'not installed (recordly.dev; QuickTime works too)') : ''));
  var seen = {}; var size = 0;
  vfiles.forEach(function (f) { var o = null; try { o = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return; } (o.videos || []).forEach(function (v) {
    seen[v.id] = 1; var src = (v.sources || [])[0];
    if (!src || !src.path) issues.push(f + ' [' + v.id + '] has no source file'); else if (!fs.existsSync(src.path)) issues.push(f + ' [' + v.id + '] footage not found: ' + src.path + ' (moved? node solo.js video source ' + v.id + ' <new path>)'); else { try { if (V.node.hashFile(src.path) !== src.hash) issues.push(f + ' [' + v.id + '] the footage changed since it was added (words and cut may not match): node solo.js video source ' + v.id + ' "' + src.path + '"'); } catch (e) { /* unreadable */ } }
    (v.exports || []).forEach(function (e) { var fp = absData(e.file); if (!fs.existsSync(fp)) notes.push(f + ' [' + v.id + '] export missing on disk: ' + e.file); else { try { size += fs.statSync(fp).size; } catch (x) { /* skip */ } } });
    if (v.transcript && v.transcript.file && !fs.existsSync(absData(v.transcript.file))) issues.push(f + ' [' + v.id + '] transcript file missing: ' + v.transcript.file + ' (node solo.js video transcribe ' + v.id + ')');
    var ph = JSON.stringify(v.phrases || []).length; if (ph > 500 * 1024) notes.push(f + ' [' + v.id + '] phrases are ' + Math.round(ph / 1024) + ' KB (a very long take; the page will be slow on it)');
    var lk = V.node.lock(videoDir(v.id)); if (lk) notes.push(f + ' [' + v.id + '] a render is running since ' + localStamp(lk.startedAt));
    var lo = V.node.leftovers(videoDir(v.id)); if (lo.length && !lk) notes.push(f + ' [' + v.id + '] ' + lo.length + ' leftover folder(s) from an interrupted render in ' + relData(videoDir(v.id)) + '/ (the next render removes them)');
    var pf = path.join(videoDir(v.id), 'progress.json'); try { var p = JSON.parse(fs.readFileSync(pf, 'utf8')); if (!p.finished && !lk) notes.push(f + ' [' + v.id + '] a render was interrupted (stale progress.json, safe to delete)'); } catch (e) { /* none */ }
  }); });
  var orphans = dirs.filter(function (id) { return !seen[id]; }); if (orphans.length) notes.push('video: ' + orphans.length + ' folder(s) in data/videos/ no take references (safe to delete): ' + orphans.slice(0, 5).join(', '));
  if (size) notes.push('video: exports ' + (size / 1048576).toFixed(0) + ' MB on disk (never in the backup)');
  if (repo) { try { var big = require('child_process').execFileSync('git', ['-C', DATA, 'ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean).filter(function (f) { try { return fs.statSync(path.join(DATA, f)).size > 50 * 1048576; } catch (e) { return false; } }); if (big.length) issues.push('backup repo tracks ' + big.length + ' file(s) over 50 MB (GitHub refuses over 100 MB): ' + big.join(', ') + ' — git -C data rm --cached <file>, then node solo.js backup'); } catch (e) { /* no git */ } }
}

/* ---- template / theme / config / serve ----------------------------------- */
// A data file "has content" when one of its lists holds something; empty files (a blank start) do not count.
function hasContent(name) { var d = read(name); return !!d && ['tasks', 'posts', 'scripts', 'notes', 'items', 'videos'].some(function (k) { return Array.isArray(d[k]) && d[k].length > 0; }); }
var SAMPLE_WS = { id: 'sample-project', title: 'Sample project' };
function cmdTemplate() {
  if (!T) fail('core/templates.js not found.');
  var which = (pos[0] || 'all').toLowerCase(); var all = ['board', 'social', 'scripts', 'writing', 'inspiration', 'settings'];
  if (which === 'runway') which = 'board';
  if (which === 'blank') return templateBlank();
  if (which === 'sample') return templateSample();
  var targets = which === 'all' ? all : [which]; if (targets.some(function (t) { return all.indexOf(t) < 0; })) fail('Usage: template blank [--name "My project"] (empty files, never overwrites) · template sample (a separate Sample project) · template [board|social|scripts|writing|settings|all] [--board id] [--force] (sample content into this project)');
  var done = [];
  targets.forEach(function (t) {
    var name = t === 'board' ? boardFile() : (t === 'settings' || t === 'inspiration') ? t : fileName(t);
    if (fs.existsSync(fileOf(name)) && !flags.force && (t === 'settings' || hasContent(name))) { done.push('- data/' + name + '.json has content — skipped (use --force to overwrite)'); return; }   // an empty file (a blank start) is filled
    var body = t === 'board' ? T.runway() : t === 'social' ? T.social(new Date()) : t === 'scripts' ? T.scripts(new Date()) : t === 'writing' ? T.writing(new Date()) : t === 'inspiration' ? T.inspiration(new Date()) : T.settings();
    if (t === 'settings') { var curS = read('settings'); if (curS && isObj(curS.config)) body.config = curS.config; }   // the sample theme never drops your settings
    write(name, body, { noActivity: true }); done.push('- wrote data/' + name + '.json (sample content)');
  });
  out(done, { written: targets });
}
// template blank: the open project starts empty on purpose. Writes an empty file for each of its boards and apps (and the
// inspiration inbox) where none exists, so every page shows it empty instead of a first-open sample; never overwrites.
// --name "My project" (the first project only) names the project and its first board and drops the sample sprint framing,
// through your settings (data/settings.json), never solo.config.js.
function templateBlank() {
  var made = [], kept = [];
  function blank(name, body) { if (fs.existsSync(fileOf(name))) { kept.push('data/' + name + '.json'); return; } write(name, body, { noActivity: true, note: 'blank start', stamp: '1970-01-01T00:00:00.000Z' }); made.push('data/' + name + '.json'); }   // the oldest stamp: never newer than a browser's real copy
  BOARDS.forEach(function (b) { blank(prefix() + b.id, { projects: [], tasks: [] }); });
  if (appOn('social')) blank(fileName('social'), { posts: [] });
  if (appOn('scripts')) blank(fileName('scripts'), { activeId: '', scripts: [] });
  if (appOn('writing')) blank(fileName('writing'), { activeId: '', notes: [] });
  if (appOn('video')) blank(fileName('videos'), { activeId: '', videos: [] });
  blank('inspiration', { items: [] });
  var nameNew = flags.name !== undefined && flags.name !== true ? String(flags.name).trim() : '';
  var lines = ['# Blank start · ' + (nameNew && WS_ID === PRIMARY ? nameNew : WS.title), ''].concat(made.length ? made.map(function (f) { return '- wrote ' + f + ' (empty)'; }) : ['- nothing to write']).concat(kept.length ? ['- kept ' + kept.join(', ') + ' (already there, never overwritten)'] : []);
  var name = flags.name !== undefined && flags.name !== true ? String(flags.name).trim() : '';
  if (name) {
    if (WS_ID !== PRIMARY) lines.push('', '--name names the first project only. For this one: node solo.js workspaces rename ' + WS_ID + ' "' + name + '"');
    else {
      if (!CfgLib) fail('core/config.js not found.');
      var s = read('settings') || { theme: cfg.theme || { mode: 'auto', palette: 'mono' } }; var o = isObj(s.config) ? s.config : {}; var b0 = BOARDS[0];
      var steps = [['name', name]].concat(b0 ? [['boards.' + b0.id + '.title', name], ['boards.' + b0.id + '.sprintLabel', 'Progress'], ['boards.' + b0.id + '.milestones', '[]'], ['boards.' + b0.id + '.focus', '[]']] : []);
      steps.forEach(function (st) { try { o = CfgLib.override(SHIPPED, o, 'set', st[0], st[1], {}).config; } catch (e) { fail(e.message); } });
      s.config = o; write('settings', s, { note: 'blank start: project named ' + name });
      lines.push('- named the project and its board "' + name + '" (data/settings.json; the sample sprint cards are gone)');
    }
  }
  lines.push('', 'Next: bring your work in (/bring-in), or plan something new (/plan-project). Everything you can ask: /menu.');
  out(lines, { made: made, kept: kept, name: name || null });
}
// template sample: a separate "Sample project" with the sample sprint, schedule, scripts and drafts, so it never mixes into
// your own work. Marked sample: true (left out of "all projects" views); remove it any time: workspaces rm sample-project.
function templateSample() {
  var rt = read('workspaces') || { workspaces: [] }; rt.workspaces = Array.isArray(rt.workspaces) ? rt.workspaces : [];
  var had = WORKSPACES.filter(function (w) { return w.id === SAMPLE_WS.id; })[0];
  if (had && had.boards[0] && hasContent(SAMPLE_WS.id + '-' + had.boards[0].id)) return out('· The Sample project is already there: node solo.js week --ws ' + SAMPLE_WS.id + ' · open: index.html?ws=' + SAMPLE_WS.id, { id: SAMPLE_WS.id, existed: true });
  if (had) {   // made in a browser without the server: the entry is there, the files are not yet
    var hb = had.boards[0] || { id: 'runway' }; var nw = new Date(); var hp = SAMPLE_WS.id + '-';
    if (!hasContent(hp + hb.id)) write(hp + hb.id, { projects: [], tasks: T.runway().tasks }, { noActivity: true }); if (!hasContent(hp + 'social')) write(hp + 'social', { posts: T.social(nw).posts }, { noActivity: true });
    if (!hasContent(hp + 'scripts')) write(hp + 'scripts', T.scripts(nw), { noActivity: true }); if (!hasContent(hp + 'writing')) write(hp + 'writing', T.writing(nw), { noActivity: true });
    return out('✓ The Sample project now has its files too: node solo.js week --ws ' + SAMPLE_WS.id, { id: SAMPLE_WS.id, filled: true });
  }
  var sb = (SHIPPED.boards && SHIPPED.boards[0]) || { id: 'runway', title: 'Launch Runway', sprintLabel: 'Sprint progress', milestones: [], focus: [] };
  var w = { id: SAMPLE_WS.id, title: SAMPLE_WS.title, apps: { social: true, scripts: true, writing: true, video: true }, boards: [{ id: slug(sb.id || sb.title), title: sb.title, sprintLabel: sb.sprintLabel || 'Progress', milestones: sb.milestones || [], focus: sb.focus || [] }], sample: true, createdAt: Date.now() };
  rt.workspaces.push(w); write('workspaces', rt, { note: 'sample project added' });
  var pre = w.id + '-'; var now = new Date();
  write(pre + w.boards[0].id, { projects: [], tasks: T.runway().tasks }, { noActivity: true });
  write(pre + 'social', { posts: T.social(now).posts }, { noActivity: true });
  write(pre + 'scripts', T.scripts(now), { noActivity: true });
  write(pre + 'writing', T.writing(now), { noActivity: true });
  out(['✓ Sample project added: a two-week sprint, a posting arc, scripts and drafts to look around.', '  It is its own project, so nothing mixes into yours; "all projects" views leave it out.', '  Look: node solo.js week --ws ' + w.id + '   ·   open: index.html?ws=' + w.id, '  Remove it: node solo.js workspaces rm ' + w.id + ' (its files stay in data/ until you delete them)'], w);
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
    function step(op, p, v) { if ((op === 'set' || op === 'add') && /key|secret|token|password/i.test(String(p))) fail('Keys never go in settings.json (it is copied into the backup and into every page). Use: node solo.js video key set elevenlabs <key>'); var r; try { r = CfgLib.override(SHIPPED, o, op, p, v, { force: !!flags.force }); } catch (e) { fail(e.message); } o = r.config; if (!r.unchanged) changed = true; labels.push((r.unchanged ? '· ' : '✓ ') + r.label); }
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
    '  add "Title" [--proj X] [--pri high] [--tags a,b] [--col later] [--desc "…"] [--steps "a|b"] [--at <when>] [--until HH:MM] [--due <date>] [--ext <tool>:<id>]', '  at <task> <when|clear> [--until HH:MM]   due <task> <date|clear>      when = 2026-10-15T14:00 · 2026-10-15 (all day) · tomorrow 14:00 · fri 10:00 · +3d 17:30; a meeting = --tags meeting', '  start|done|later|bucket|todo <task>', '  move <task> <column>        pri <task> <high|medium|low>', '  tag <task> +a -b            step <task> "text"   check|uncheck <task> <n>', '  note <task> ["text"]        edit <task> --title … --proj … --pri …', '  rm <task>', '',
    'Share', '  share today [--all]         today as a short card: Doing · Schedule · Next up (the page copies it as an image)', '  share [todo|board|all]      markdown checklist (paste anywhere)', '  import <list.md> [--col]    "- [ ] item" lines become tasks, indented lines become steps', '  import <items.json> [--dry-run]   what your agent brings in from Notion, Linear…: same ext = update, never a duplicate; one write per board', '  done ext:<tool>:<id>        any task command takes ext:<id> (the task an import made, on any board)', '',
    'Posts (data/social.json)', '  social list|next|week|show <post>', '  social add "Title" [--at 2026-10-20T09:00 | +3d 17:30] [--type launch] [--project X] [--copy "…"] [--prep "a|b"]', '  social posted|ready|draft <post> [--url …]   social move <post> <when>', '  social prep <post> "item"   social check <post> <n>   social copy <post> ["text"]   social rm <post>', '',
    'Inspiration (data/inspiration.json — links, ideas, images; tag with a workspace)', '  inspo list [--ws] [--tag x] [--status new|used|archived]   inspo show <item>', '  inspo add [--file <path>] "https://… or an idea #tag" [--ws <id>] [--tags a,b]   inspo tag <item> +a -b   inspo ws <item> <workspace>', '  inspo use <item> --as task|post|script|note [--ws] [--board]   inspo ai [--into tasks] (prompt to paste into an AI)   inspo archive|rm <item>', '',
    'Prompts (built-ins in core/prompts.js, yours in data/prompts.json)', '  menu                       what you can ask your agent, by moment of the day (the same as /menu)', '  prompts builtin [--mode chat|files]   prompts show <title or /slug>   prompts export [--for claude|cursor|codex|chat] [--out dir]', '  prompts list|add "Title" --text "…"|--file p.md [--cat daily] [--desc "…"]|edit <p> …|rm <p>|restore', '',
    'Studio (data/scripts.json, data/writing.json)', '  scripts list|show <s>|add "Title" [--file x.md]|set <s> --file x.md|--text "…"|rm <s>', '  notes list|show <n>|add "Title" [--file x.md]|set <n> --file x.md|--text "…"|rm <n>', '',
    'Video (data/videos.json + data/videos/<id>/ — cut a take by its words; the footage stays where it is, needs ffmpeg)', '  video add "Title" --file ./take.mov [--script s3]   video list|show <v>|open <v> [--preview]|rm <v> [--files]   video source <v> <new path>',
    '  video transcribe <v> [--engine whisper|elevenlabs] [--lang en] [--from captions.srt] [--yes]   whisper = on this computer; elevenlabs = audio only leaves (needs video key set elevenlabs --stdin)',
    '  video cut <v> --keep "2.4-6.8, 8.1-15.0" | --drop "um, uh" | --tidy | --drop-silence [--min-pause 0.7] | --retakes | --edl cut.json     edges snap to words and are padded; logged, revertable',
    '  video word <v> "what it says" "what it should say" [--all] | <n>[-<m>] "text" | --undo   a misheard word: the text changes, the audio and the cut do not',
    '  video title <v> "New title"   video proxy <v> (a 720p copy for the page\'s player)   video key set elevenlabs --stdin',
    '  video recordings [--init|--add|--forget <path>]   video watch [--transcribe [engine]]   the folder any recorder saves into; what lands there becomes a take (serve.js watches it too)',
    '  video render <v> [--preview] [--burn] [--aspect 9:16] [--style sentence|bold] [--out file]   one encode, captions as a track + .srt (burned with libass)', '  video post <v> [--at <when>] [--type update] [--copy "…"]   a post dated then, in draft, with the cut linked, never copied', '',
    'A task carries its pieces (a draft, a script, a take, a post; the card shows them as pills with one next step; never across workspaces)', '  link <task> <piece> [--off]   connect a task with a draft, script, take or post by id or title (also piece↔piece)   story <id>   print what belongs together',
    '  notes add --task t1   scripts add --task t1 [--draft n1]   social add --task t1   video add "Title" --file … --task t1   the piece is made for that task and the card shows it',
    '  add "Title" --tags video --script s1 | --draft n1 | --take v1 | --post p1   a task born with its piece; tags writing · script · video make a task a suggestion in that view', '',
    'Safety', '  backup setup [--name solo-ops-data] [--no-github]   first time: a PRIVATE GitHub repo via gh, or it tells you the two other ways', '  backup [--remote <private url>] [--to <folder>] [--status]   push data/ to its private repo and/or copy it to a syncing folder; refuses public repos', '  backup --daily [--hour 21] [--dry-run]   run it every evening (launchd / crontab / a schtasks line)', '  guard [--install] [--allow-data]   fail when staged files hold your content; --install = on every commit; --allow-data = your own PRIVATE fork only', '  doctor | health            check every data file, attachments and backup age', '',
    'Setup', '  template blank [--name "My project"]   empty files for this project (never overwrites); --name names it and its first board', '  template sample            a separate Sample project to look around (left out of "all projects")', '  template [all|board|social|scripts|writing|settings] [--board id] [--force]   sample content into this project (fills empty files)', '  theme [show|list|set <palette>|mode <auto|light|dark>|font <inter|system|lato|editorial>]', '  config                     the settings in use (solo.config.js + your settings)', '  config set <setting> <value>  your values, kept in data/settings.json: owner "Mara" · name "Pocket Studio" · social.postTypes reel,carousel · boards.runway.title "…"', '  config add <list> a b      add to a list (config unset <setting> · config set --file x.json · config clear)', '  serve [--port 4321]        start the local server (pages write data/ directly)', '',
    'Add --json to any command for machine-readable output. Ids: tasks t…, posts p…, scripts s…, notes n….',
    'Agents: add --as agent (and --note "why") so the change log attributes the edit to you.'], null);
}

/* ---- story: one chain across a draft, a script, its takes and the posts (core/story.js) ----
   `link a b` writes the one pointer the pair needs (script.noteId, take.scriptId, take.postId,
   post.noteId / post.scriptId); `story <id>` prints the chain. Never across workspaces. */
var ST = safeRequire(path.join(ROOT, 'core', 'story.js'));
function storyData() { var tasks = []; BOARDS.forEach(function (b) { board(b.id).tasks.forEach(function (t) { tasks.push(Object.assign({ _board: b.id }, t)); }); }); return { task: tasks, note: notes().notes, script: scripts().scripts, take: videos().videos, post: schedule().posts }; }
function findTaskAny(q) {   // a task on any board of the workspace, by id or a unique title; → { task, boardId }
  q = String(q || '').trim(); if (!q) fail('Which task? Give an id or part of the title.'); var hits = [];
  BOARDS.forEach(function (b) { board(b.id).tasks.forEach(function (t) { if (t.id === q) hits.unshift({ task: t, boardId: b.id, exact: true }); else if ((t.title || '').toLowerCase().indexOf(q.toLowerCase()) >= 0) hits.push({ task: t, boardId: b.id }); }); });
  if (hits[0] && hits[0].exact) return hits[0]; if (hits.length === 1) return hits[0]; if (!hits.length) fail('No task matches "' + q + '" on any board'); fail('Several tasks match "' + q + '": ' + hits.slice(0, 6).map(function (h) { return h.task.title + ' [' + h.task.id + ']'; }).join(' · ') + '. Give the id.');
}
function attachToTask(taskQ, field, pieceId, tagToAdd, what) {   // the task's pointer and, when asked, its tag; written through its board file so the log and the sync see it
  var h = findTaskAny(taskQ); var bd = board(h.boardId); var t = bd.tasks.filter(function (x) { return x.id === h.task.id; })[0]; if (!t) fail('The task vanished while writing');
  if (t[field] && t[field] !== pieceId && !JSON_OUT) out('Note: ' + t.title + ' already had a ' + field.replace(/Id$/, '') + ' (' + t[field] + '); now it is this one.');
  t[field] = pieceId; if (tagToAdd) { t.tags = Array.isArray(t.tags) ? t.tags : []; if (t.tags.indexOf(tagToAdd) < 0) t.tags.push(tagToAdd); }
  flags.note = (what || 'link: connected task ' + t.id + ' to ' + field.replace(/Id$/, '') + ' ' + pieceId) + (flags.note ? ' · ' + flags.note : ''); saveBoard(bd, h.boardId); return t;
}
function storyLine(kind, id) { if (!ST) return ''; var ms = ST.of(storyData(), kind, id); return ST.connected(ms) ? ST.text(ms) : ''; }
function cmdLink() {
  if (!ST) fail('core/story.js is missing'); function note(t) { flags.note = flags.note ? t + ' · ' + flags.note : t; }
  var a = pos[0], b = pos[1]; if (!a || !b) fail('Usage: link <task or piece> <piece> [--off]   a task and its draft, script, take or post (or two pieces) become one story; node solo.js story <id> shows it');
  var p; try { p = ST.pair(storyData(), a, b); } catch (e) { fail(e.message); }
  var off = !!flags.off; var val = off ? '' : p.target.item.id;
  if (!off && (p.target.missing || p.holder.missing)) fail('One of those was deleted; it cannot be connected. (--off forgets it.)');
  if (off && p.holder.missing) fail('That one was deleted; nothing holds the connection any more.');
  if (off && p.holder.item[p.field] !== p.target.item.id) return out('Not connected: ' + ST.describe(p.up.kind, p.up.item) + ' and ' + ST.describe(p.down.kind, p.down.item) + ' hold no direct link (they may be connected through another piece).', { off: true, changed: false });
  var wasId = !off && p.holder.item[p.field] && p.holder.item[p.field] !== val ? p.holder.item[p.field] : ''; var was = wasId ? (ST.lookup(storyData(), wasId) || null) : null;
  if (wasId && !JSON_OUT) out('Note: ' + ST.describe(p.holder.kind, p.holder.item) + ' was connected to ' + (was ? ST.describe(was.kind, was.item) : wasId) + '; now it is this one.');
  var what = (off ? 'disconnected ' : 'connected ') + ST.WORD[p.holder.kind].toLowerCase() + ' ' + p.holder.item.id + (off ? ' from ' : ' to ') + ST.WORD[p.target.kind].toLowerCase() + ' ' + p.target.item.id;
  note('link: ' + what);
  if (p.holder.kind === 'task') { var bdL = board(p.holder.item._board); var tL = bdL.tasks.filter(function (x) { return x.id === p.holder.item.id; })[0]; if (!tL) fail('The task vanished while writing'); tL[p.field] = val; if (!off) { var tagL = { note: 'writing', script: 'script', take: 'video' }[p.target.kind]; if (tagL) { tL.tags = Array.isArray(tL.tags) ? tL.tags : []; if (tL.tags.indexOf(tagL) < 0) tL.tags.push(tagL); } } saveBoard(bdL, p.holder.item._board); }
  else if (p.holder.kind === 'take') patchVideo(p.holder.item, function (f) { f[p.field] = val; f.linkedAt = Date.now(); });
  else { var app = ST.APP[p.holder.kind]; var d = app === 'scripts' ? scripts() : app === 'writing' ? notes() : schedule(); var arr = app === 'social' ? d.posts : app === 'scripts' ? d.scripts : d.notes; var it = arr.filter(function (x) { return x.id === p.holder.item.id; })[0]; it[p.field] = val; it.updatedAt = Date.now(); write(fileName(app), d); }
  return out('✓ ' + (off ? 'Disconnected' : 'Connected') + ': ' + ST.describe(p.up.kind, p.up.item) + ' → ' + ST.describe(p.down.kind, p.down.item) + (off ? '' : '\n  Story: ' + storyLine(p.holder.kind, p.holder.item.id)), { up: p.up.item.id, down: p.down.item.id, field: p.field, on: p.holder.item.id, off: off, changed: true, was: wasId });
}
function cmdStory() {
  if (!ST) fail('core/story.js is missing');
  var q = pos.join(' ').trim(); if (!q) fail('Usage: story <id or title>   prints the draft, script, takes and posts that belong together');
  var d = storyData(); var hit; try { hit = ST.lookup(d, q); } catch (e) { fail(e.message); } if (!hit) fail('No task, draft, script, take or post here matches "' + q + '"');
  var ms = ST.of(d, hit.kind, hit.item.id); var g = ST.byKind(ms); var dup = ST.dupTitles(ms.filter(function (m) { return !m.missing; }), function (m) { return m.kind; });
  var md = ['# Story of ' + ST.describe(hit.kind, hit.item), ''];
  ST.KINDS.forEach(function (k) { if (!g[k].length) { md.push('- ' + ST.WORD[k] + ': —'); return; } g[k].forEach(function (m) { md.push('- ' + (m.missing ? ST.WORD[k] + ': missing [' + m.id + '] (deleted; node solo.js link <other> ' + m.id + ' --off forgets it)' : ST.describe(k, m.item) + (dup(k, m.item) && ST.tag(m.item) ? ' · ' + ST.tag(m.item) : '') + ' [' + m.id + ']')); }); });
  if (!ST.connected(ms)) md.push('', 'Nothing connected yet: node solo.js link ' + hit.item.id + ' <id of the draft, script, take or post it belongs with>');
  return out(md, { members: ms.map(function (m) { return { kind: m.kind, id: m.id, title: m.title, state: m.state, missing: !!m.missing }; }) });
}

/* ---- dispatch ------------------------------------------------------------ */
var commands = {
  help: cmdHelp, '--help': cmdHelp, '-h': cmdHelp,
  today: cmdToday, week: cmdWeek, review: cmdWeek,
  list: cmdList, ls: cmdList, show: cmdShow, add: cmdAdd, edit: cmdEdit,
  done: moveCmd('done', 'Done'), start: moveCmd('doing', 'Started'), later: moveCmd('later', 'Parked'), bucket: moveCmd('bucket', 'Bucketed'), todo: moveCmd('todo', 'Back to To Do'),
  move: cmdMove, pri: cmdPri, tag: cmdTag, at: whenCmd('at'), due: whenCmd('due'), calendar: cmdCalendar, agenda: cmdCalendar, step: cmdStep, check: checkCmd(true), uncheck: checkCmd(false), note: cmdNote, rm: cmdRm, del: cmdRm,
  share: cmdShare, import: cmdImport, link: cmdLink, connect: cmdLink, story: cmdStory,
  social: cmdSocial, post: cmdSocial, posts: cmdSocial,
  scripts: cmdScripts, script: cmdScripts, notes: cmdNotes, video: cmdVideo, videos: cmdVideo, take: cmdVideo, takes: cmdVideo,
  inspo: cmdInspo, inspiration: cmdInspo, prompts: cmdPrompts, prompt: cmdPrompts, menu: cmdMenu, boards: cmdBoards, board: cmdBoards, activity: cmdActivity, log: cmdLog, history: cmdLog, revert: cmdRevert, undo: cmdRevert, workspaces: cmdWorkspaces, workspace: cmdWorkspaces, ws: cmdWorkspaces,
  backup: cmdBackup, doctor: cmdDoctor, health: cmdDoctor, guard: cmdGuard, template: cmdTemplate, theme: cmdTheme, config: cmdConfig, serve: cmdServe
};
// `done ext:linear:<id>` (any task command): the board that holds that import, unless --board says otherwise
(function () { if (flags.board || cmd === 'add' || cmd === 'import') return; var xa = pos.filter(function (p) { return /^ext:/i.test(String(p)); })[0]; if (!xa) return; var want = String(xa).slice(4).toLowerCase();
  BOARDS.some(function (bm) { var bf = read(boardFile(bm.id)); if (bf && Array.isArray(bf.tasks) && bf.tasks.some(function (t) { return t.ext && String(t.ext).toLowerCase() === want; })) { BOARD_ID = bm.id; return true; } return false; }); })();
var fn = commands[cmd];
if (!fn) fail('Unknown command "' + cmd + '". Run: node solo.js help');
Promise.resolve(fn()).catch(function (e) { fail(e && e.message ? e.message : String(e)); });
