#!/usr/bin/env node
/* core/test-hidden.js — hidden boards.
   data/boards.json → hidden ["<ws>/<board id>"]: a hidden board is out of
   sight (the board menu, nav, Home, Calendar, quick add; today, week,
   calendar and the default board in the CLI) and never out of the data
   (its file, its sync, --board and task ids still reach it).
   Run: node core/test-hidden.js */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var n = 0, failed = 0;
function ok(cond, msg) { n++; if (!cond) { failed++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); }
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-hidden-'));
function run(args, raw) { try { var o = cp.execFileSync(process.execPath, [path.join(ROOT, 'solo.js')].concat(args, raw ? [] : ['--json']), { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { SOLO_DATA: dir }), stdio: ['ignore', 'pipe', 'pipe'] }); return raw ? o : JSON.parse(o); } catch (e) { var txt = String(e.stdout || '') + String(e.stderr || ''); return raw ? txt : { error: txt }; } }
function reg() { return JSON.parse(fs.readFileSync(path.join(dir, 'boards.json'), 'utf8')); }
function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

try {
  console.log('CLI');
  run(['template', 'blank', '--name', 'Pocket']);
  var first = run(['boards'])[0].id;
  run(['boards', 'add', 'Daily']);
  run(['add', 'On the first board', '--due', today(), '--board', first]);
  run(['add', 'On the daily board', '--due', today(), '--board', 'daily']);
  var h = run(['boards', 'hide', 'daily']);
  ok(h.hidden === true && reg().hidden.join() === 'main/daily', 'boards hide writes "<ws>/<id>" into boards.json');
  ok(run(['boards']).filter(function (b) { return b.id === 'daily'; })[0].hidden === true, 'boards list says which board is hidden');
  var t = run(['today']); var titles = t.doing.concat(t.high, t.schedule).map(function (x) { return x.title; });
  ok(titles.indexOf('On the daily board') < 0 && titles.indexOf('On the first board') >= 0, 'today leaves the hidden board out, keeps the others');
  ok(/_Hidden: Daily/.test(run(['week'], true)), 'week names the hidden board and how to bring it back');
  ok(run(['calendar']).error === undefined && !/On the daily board/.test(run(['calendar'], true)), 'calendar leaves it out too');
  ok(/On the daily board/.test(run(['list', '--board', 'daily'], true)), '--board still reaches a hidden board');
  ok(run(['done', 'On the daily board', '--board', 'daily']).error === undefined && /## Done \(1\)/.test(run(['list', '--board', 'daily'], true)), 'a task on a hidden board can still be marked done with --board');
  ok(/No board "nope"/.test(run(['boards', 'hide', 'nope'], true)), 'hiding a board that does not exist is refused');
  ok(/Usage: boards hide/.test(run(['boards', 'hide'], true)) && /Usage: boards show/.test(run(['boards', 'show'], true)), 'hide / show with no board print the usage');
  ok(/boards show daily_/.test(run(['week'], true)), 'the hint names the real id, not a placeholder');
  var stamp = reg().updatedAt; var again = run(['boards', 'hide', 'daily'], true);
  ok(/Already hidden/.test(again) && reg().updatedAt === stamp, 'hiding a hidden board says so and writes nothing');
  run(['boards', 'add', 'Site and writing']); run(['boards', 'hide', 'Site', 'and', 'writing']);
  ok(reg().hidden.indexOf('main/site-and-writing') >= 0, 'an unquoted title is read as one board');
  run(['boards', 'rm', 'site-and-writing', '--force']);
  run(['boards', 'show', 'Dai']);
  ok(reg().hidden === undefined, 'boards show takes part of a title too');
  run(['boards', 'hide', 'daily']);
  run(['add', 'Dated on the first board', '--at', today() + 'T23:30', '--board', first]);
  run(['boards', 'hide', first]);
  var allHid = run(['today'], true);
  ok(!/Dated on the first board/.test(allHid) && !/Nothing here yet/.test(allHid), 'every board hidden: no hidden task comes back, and no "nothing here yet" nudge');
  ok(/Dated on the first board/.test(run(['today', '--board', first], true)), 'today --board <hidden> shows that board\'s schedule');
  ok(!/Dated on the first board/.test(run(['share', 'today'], true)), 'share today leaves it out too');
  ok(run(['add', 'Where does this go']).error === undefined && /Where does this go/.test(run(['list', '--board', first], true)), 'every board hidden: the default is still the first board, not nothing');
  run(['boards', 'show', first]);
  run(['boards', 'show', 'daily']);
  ok(reg().hidden === undefined, 'showing the last hidden board removes the list from the file');
  run(['boards', 'hide', 'daily']); run(['boards', 'rm', 'daily', '--force']);
  ok(reg().hidden === undefined && !reg().boards.some(function (b) { return b.id === 'daily'; }), 'boards rm forgets the board in the hidden list too');
  ok(run(['log'], true).indexOf('boards.json') >= 0, 'hiding is logged, so revert undoes it');

  console.log('Pages (core/config.js in a sandbox)');
  function page(stored) {
    var store = { data: {} }; Object.keys(stored || {}).forEach(function (k) { store.data[k] = JSON.stringify(stored[k]); });
    var specs = [];
    var ctx = {
      MARATHON_CONFIG: { name: 'Solo Ops', boards: [{ id: 'runway', title: 'Launch Runway' }] },
      Store: { ok: true, getJSON: function (k, fb) { return k in store.data ? JSON.parse(store.data[k]) : fb; }, setJSON: function (k, v) { store.data[k] = JSON.stringify(v); }, get: function (k) { return k in store.data ? store.data[k] : null; }, set: function (k, v) { store.data[k] = v; }, remove: function (k) { delete store.data[k]; } },
      Sync: { register: function (s) { specs.push(s); }, on: function () {} },
      document: { readyState: 'complete', addEventListener: function () {} },
      setTimeout: function (fn) { fn(); }, URLSearchParams: URLSearchParams
    };
    ctx.window = ctx; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'core', 'config.js'), 'utf8'), ctx);
    return { Config: ctx.Config, store: store, spec: specs.filter(function (s) { return s.file === 'boards.json'; })[0] };
  }
  var p = page({ 'marathon.boards': { boards: [{ id: 'daily', title: 'Daily', ws: 'main' }], hidden: ['main/daily'] } });
  var C = p.Config;
  ok(C.boards('main').length === 2 && C.shownBoards('main').map(function (b) { return b.id; }).join() === 'runway', 'shownBoards leaves the hidden one out; boards still has both (so its file keeps syncing)');
  ok(C.hiddenBoards('main')[0].id === 'daily' && C.isHidden('daily', 'main') && !C.isHidden('runway', 'main'), 'hiddenBoards / isHidden');
  C.addBoard({ id: 'ideas', title: 'Ideas' }, 'main');
  ok(C.isHidden('daily', 'main'), 'adding a board keeps the hidden list');
  C.updateBoard('ideas', { title: 'Big ideas' }, 'main');
  ok(C.isHidden('daily', 'main'), 'renaming a board keeps the hidden list');
  C.setHidden('runway', true, 'main');
  ok(C.isHidden('runway', 'main') && C.shownBoards('main').map(function (b) { return b.id; }).join() === 'ideas', 'a board from solo.config.js can be hidden too');
  C.setHidden('runway', false, 'main');
  ok(!C.isHidden('runway', 'main') && C.isHidden('daily', 'main'), 'setHidden(false) shows only that board');
  ok(JSON.stringify(p.spec.read().hidden) === '["main/daily"]', 'the page writes the hidden list into boards.json');
  C.setHidden('runway', true, 'main');
  ok(C.firstBoard('main').id === 'ideas', 'firstBoard skips a hidden board');
  ok(C.boardsInView('main').map(function (b) { return b.id; }).join() === 'ideas', 'boardsInView = the shown boards when no board page is open');
  C.removeBoard('runway', 'main');
  ok(C.isHidden('runway', 'main'), 'removing the runtime entry of a board from solo.config.js keeps it hidden');
  C.setHidden('runway', false, 'main');
  C.removeBoard('daily', 'main');
  ok(!('hidden' in p.spec.read()), 'removing a hidden board drops it from the list; an empty list is not written');
  C.setHidden('ideas', true, 'main');
  p.spec.apply({ boards: [{ id: 'ideas', title: 'Big ideas', ws: 'main' }], hidden: ['main/runway'] });
  ok(C.isHidden('runway', 'main') && !C.isHidden('ideas', 'main'), 'a newer file brings its own hidden list: the file is the truth');
  p.spec.apply({ boards: [{ id: 'ideas', title: 'Big ideas', ws: 'main' }] });
  ok(!C.isHidden('runway', 'main'), 'a newer file without the list means nothing is hidden');
  C.setHidden('ideas', true, 'other');
  ok(C.isHidden('ideas', 'other') && !C.isHidden('ideas', 'main'), 'hidden is per project: the same board id elsewhere stays shown');
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* tmp */ }
}
console.log('\n' + (failed ? '✗ ' + failed + ' of ' + n + ' hidden-board checks failed' : '✓ ' + n + ' hidden-board checks passed'));
process.exit(failed ? 1 : 0);
