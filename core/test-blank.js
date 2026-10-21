#!/usr/bin/env node
/* core/test-blank.js — a first open starts blank, and blank never costs anyone data.
   Runs the real core/store.js, core/config.js, core/sync.js and the board, schedule and inspiration
   models in a vm, against a fake browser (localStorage, document) and a fake `node serve.js` whose
   data/ folder lives in memory. Scenarios:
     1. fresh browser, no files        → the pages are empty, nothing is written, not "the sample"
     2. fresh browser, files with work  → the files win, no question asked, nothing overwritten
     3. fresh browser, empty files      → (template blank) applied, no question, no write
     4. first real change on a blank page → the file gets exactly that change, no sample tasks
     5. an older browser holding the untouched sample + a real file → the file wins (as before)
     6. real content in the browser, no stamp, a different file → the question is still asked (as before)
   Run: node core/test-blank.js */
'use strict';
var fs = require('fs'); var path = require('path'); var vm = require('vm');
var ROOT = path.join(__dirname, '..');
var passed = 0;
function ok(cond, msg) { if (!cond) { console.error('✗ ' + msg); process.exit(1); } passed++; console.log('✓ ' + msg); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function browser(disk, opts) {
  opts = opts || {};
  var ls = {}; Object.keys(opts.local || {}).forEach(function (k) { ls[k] = opts.local[k]; });
  var puts = []; var confirms = [];
  var localStorage = { getItem: function (k) { return k in ls ? ls[k] : null; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } };
  function res(status, body) { return Promise.resolve({ status: status, ok: status >= 200 && status < 300, json: function () { return Promise.resolve(body); } }); }
  var ctx = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () { return 0; }, clearInterval: function () {},
    localStorage: localStorage, URLSearchParams: URLSearchParams, Blob: Blob, URL: { createObjectURL: function () { return 'blob:test'; }, revokeObjectURL: function () {} },
    location: { protocol: 'http:', pathname: '/runway/marathon-board.html', search: '', host: 'localhost:4321' },
    document: { readyState: 'complete', visibilityState: 'visible', querySelectorAll: function () { return []; }, addEventListener: function () {}, createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {}, click: function () {}, remove: function () {} }; }, body: { appendChild: function () {} } },
    confirm: function (q) { confirms.push(q); return true; },
    fetch: function (url, o) {
      if (url === '/api/ping') return res(200, { marathon: true });
      var m = String(url).match(/^\/api\/data\/([^?]+)/);
      if (m && (!o || !o.method || o.method === 'GET')) return disk[m[1]] ? res(200, JSON.parse(JSON.stringify(disk[m[1]]))) : res(404, null);
      if (m && o.method === 'PUT') { var b = JSON.parse(o.body); puts.push(m[1]); disk[m[1]] = b; return res(200, { ok: true }); }
      return res(404, null);
    }
  };
  ctx.window = ctx; ctx.global = ctx;
  vm.createContext(ctx);
  ['solo.config.js', 'core/store.js', 'core/config.js', 'core/templates.js', 'core/sync.js', 'runway/model.js', 'social/social-model.js', 'inspo/inspo-model.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
    if (f === 'core/templates.js' && opts.firstOpen) ctx.window.MARATHON_TEMPLATES.FIRST_OPEN = opts.firstOpen;   // the one switch (core/templates.js)
  });
  var W = ctx.window;
  W.SocialModel.init(); W.InspoModel.init();
  // the same specs the pages register (runway/main.js, social/social-main.js, inspo/inspo-main.js)
  W.Sync.register({ file: W.Config.boardFile(W.Model.BOARD), keys: [W.Model.KEY, W.Model.PROJ_KEY], label: 'board', isFresh: W.Model.isFresh,
    read: function () { return { projects: W.Model.getCustomProjects(), tasks: W.Model.getState() }; },
    apply: function (body) { if (Array.isArray(body.tasks)) W.Model.replaceAll(body.tasks, { silent: true }); } });
  W.Sync.register({ file: W.Config.file('social'), key: W.SocialModel.KEY, label: 'schedule', isFresh: W.SocialModel.isFresh,
    read: function () { return { posts: W.SocialModel.getState() }; }, apply: function (body) { if (Array.isArray(body.posts)) W.SocialModel.replaceAll(body.posts, { silent: true }); } });
  W.Sync.register({ file: 'inspiration.json', key: W.InspoModel.KEY, label: 'inspiration', isFresh: W.InspoModel.isFresh,
    read: function () { return { items: W.InspoModel.getState() }; }, apply: function (body) { if (Array.isArray(body.items)) W.InspoModel.replaceAll(body.items, { silent: true }); } });
  return { W: W, ls: ls, puts: puts, confirms: confirms, disk: disk };
}
function content(puts) { return puts.filter(function (f) { return !/^(boards|workspaces)\.json$/.test(f); }); }
function stamp(body) { return Object.assign({ version: 1, updatedAt: new Date(Date.now() - 60000).toISOString() }, body); }
var T = require(path.join(ROOT, 'core', 'templates.js'));

(async function () {
  // 1
  var b = browser({}); await wait(80);
  ok(b.W.Model.getState().length === 0 && b.W.SocialModel.getState().length === 0 && b.W.InspoModel.getState().length === 0, '1 · a first open is empty: board, schedule, inspiration');
  ok(b.W.Store.isFresh(b.W.Model.KEY) && !b.W.Store.isSample(b.W.Model.KEY) && !b.W.Model.isSample(), '1 · blank is fresh for sync and not "the sample"');
  ok(content(b.puts).length === 0, '1 · no content file is written while nobody changed anything (the registries boards.json / workspaces.json are, as before)');

  // 2
  var disk2 = { 'runway.json': stamp({ projects: [], tasks: [{ id: 't1', title: 'Real work', col: 'doing', pri: 'high', tags: [], checklist: [] }] }), 'social.json': stamp({ posts: [{ id: 'p1', title: 'Real post', datetime: '2026-10-25T09:00', status: 'draft' }] }), 'inspiration.json': stamp({ items: [{ id: 'i1', title: 'Saved link', url: 'https://example.com', kind: 'link' }] }) };
  var before2 = JSON.stringify(disk2);
  b = browser(disk2); await wait(80);
  ok(b.W.Model.getState().length === 1 && b.W.Model.getState()[0].title === 'Real work', '2 · an existing board file wins over the blank first open');
  ok(b.W.SocialModel.getState().length === 1 && b.W.InspoModel.getState().length === 1, '2 · the schedule and the inbox come from the files');
  ok(b.confirms.length === 0, '2 · no question asked');
  ok(content(b.puts).length === 0 && ['runway.json', 'social.json', 'inspiration.json'].every(function (f) { return JSON.stringify(b.disk[f]) === JSON.stringify(JSON.parse(before2)[f]); }), '2 · the content files are not touched');

  // 3
  var disk3 = { 'runway.json': stamp({ projects: [], tasks: [] }), 'social.json': stamp({ posts: [] }), 'inspiration.json': stamp({ items: [] }) };
  b = browser(disk3); await wait(80);
  ok(b.W.Model.getState().length === 0 && b.confirms.length === 0 && content(b.puts).length === 0, '3 · empty files (template blank) apply quietly');

  // 4
  b = browser({}); await wait(80);
  b.W.Model.add({ title: 'My first real task' }); await wait(600);
  var f4 = b.disk['runway.json'];
  ok(f4 && f4.tasks.length === 1 && f4.tasks[0].title === 'My first real task', '4 · the first change writes exactly that task, no sample tasks');
  ok(!b.W.Store.isFresh(b.W.Model.KEY), '4 · after a real change the board is no longer fresh');

  // 5 (an older browser: the sample seeded and flagged '1', never touched)
  var sample = JSON.stringify(T.runway().tasks);
  b = browser({ 'runway.json': stamp({ projects: [], tasks: [{ id: 't9', title: 'From the file', col: 'todo', pri: 'medium', tags: [], checklist: [] }] }) }, { local: { 'marathon.board.runway': sample, 'marathon.fresh:marathon.board.runway': '1' } });
  ok(b.W.Model.isSample(), '5 · an untouched sample in an older browser still reads as the sample');
  await wait(80);
  ok(b.W.Model.getState().length === 1 && b.W.Model.getState()[0].title === 'From the file' && b.confirms.length === 0, '5 · the file wins over it, as before');

  // 6 (real content in this browser, no sync stamp, a different file: ask, as before)
  b = browser({ 'runway.json': stamp({ projects: [], tasks: [{ id: 't1', title: 'File version', col: 'todo', pri: 'medium', tags: [], checklist: [] }] }) }, { local: { 'marathon.board.runway': JSON.stringify([{ id: 't2', title: 'Browser version', col: 'todo', pri: 'medium', tags: [], checklist: [] }]) } });
  await wait(80);
  ok(b.confirms.length === 1, '6 · real content on both sides still asks which one to keep');

  // 6b · template blank's empty files (stamped 1970) never beat a browser that already holds real work with a sync stamp
  var epoch = { 'runway.json': { version: 1, updatedAt: '1970-01-01T00:00:00.000Z', projects: [], tasks: [] } };
  b = browser(epoch, { local: { 'marathon.board.runway': JSON.stringify([{ id: 't5', title: 'Real work in this browser', col: 'todo', pri: 'medium', tags: [], checklist: [] }]), 'marathon.sync.meta': JSON.stringify({ 'runway.json': { updatedAt: new Date(Date.now() - 86400000).toISOString() } }) } });
  await wait(600);
  ok(b.W.Model.getState().length === 1 && b.disk['runway.json'].tasks.length === 1 && b.confirms.length === 0, '6b · an empty 1970 file loses to the real browser copy, which goes back to the file');

  // 7 · what you type on a blank page is yours from the first write: an older file never replaces it (the stuck-flag bug)
  b = browser({}); await wait(80);
  b.W.SocialModel.replaceAll([{ id: 'p9', title: 'Typed on the blank page', datetime: '2026-10-25T09:00', status: 'draft' }]); await wait(600);
  ok(!b.W.SocialModel.isFresh() && !b.W.Model.isFresh() === false, '7 · after a real change the schedule is no longer fresh (the board, untouched, still is)');
  b.disk['social.json'] = stamp({ posts: [{ id: 'p1', title: 'Older file', datetime: '2026-10-20T09:00', status: 'draft' }] }); b.disk['social.json'].updatedAt = new Date(Date.now() - 3600000).toISOString();
  await b.W.Sync.pullAll(true); await wait(80);
  ok(b.W.SocialModel.getState().length === 1 && b.W.SocialModel.getState()[0].title === 'Typed on the blank page' && b.disk['social.json'].posts[0].title === 'Typed on the blank page', '7 · an older file does not replace what was typed; the browser copy goes back to the file');

  // 8 · the one switch: FIRST_OPEN = 'sample' brings the sample back on a first open, flagged as the sample, still fresh
  b = browser({}, { firstOpen: 'sample' }); await wait(80);
  ok(b.W.Model.getState().length > 10 && b.W.Model.isSample() && b.W.Model.isFresh() && b.W.SocialModel.getState().length === 5 && b.W.InspoModel.getState().length > 0, '8 · FIRST_OPEN = sample: the sample board, posts and inbox, flagged as the sample');
  ok(content(b.puts).length === 0, '8 · and still nothing written until someone changes something');

  // the CLI side: template blank / template sample / doctor, in a throwaway data folder
  var os = require('os'); var cp = require('child_process');
  var D = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-blank-'));
  function solo(args) { var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'solo.js')].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { SOLO_DATA: D }) }); return (r.stdout || '') + (r.stderr || ''); }
  function json(name) { return JSON.parse(fs.readFileSync(path.join(D, name + '.json'), 'utf8')); }
  try {
    ok(/fresh install/.test(solo(['doctor'])), 'cli · doctor says fresh install on an empty folder');
    solo(['template', 'blank', '--name', 'Pocket Studio']);
    ok(['runway', 'social', 'scripts', 'writing', 'videos', 'inspiration'].every(function (f) { return fs.existsSync(path.join(D, f + '.json')); }), 'cli · template blank writes an empty file per app and the inbox');
    ok(json('runway').tasks.length === 0 && json('inspiration').items.length === 0 && json('runway').updatedAt === '1970-01-01T00:00:00.000Z', 'cli · those files are empty and stamped 1970 (any real browser copy is newer)');
    var cfgS = json('settings').config; ok(cfgS.name === 'Pocket Studio' && cfgS.boards[0].title === 'Pocket Studio' && !cfgS.boards[0].focus.length && !cfgS.boards[0].milestones.length, 'cli · --name names the project and its board, no sprint cards (data/settings.json)');
    ok(/fresh install/.test(solo(['doctor'])), 'cli · empty files still read as a fresh install');
    solo(['add', 'Keep me']); var again = solo(['template', 'blank']);
    ok(/never overwritten/.test(again) && json('runway').tasks.length === 1, 'cli · template blank again never overwrites');
    ok(!/fresh install/.test(solo(['doctor'])), 'cli · one real task and the install is no longer fresh');
    solo(['template', 'sample']);
    var wsr = json('workspaces').workspaces.filter(function (w) { return w.id === 'sample-project'; })[0];
    ok(wsr && wsr.sample === true && json('sample-project-runway').tasks.length > 10, 'cli · template sample adds a separate Sample project, marked sample, with the sprint');
    ok(/already there/.test(solo(['template', 'sample'])), 'cli · template sample twice keeps the one there');
    solo(['add', 'Sample meeting', '--ws', 'sample-project', '--at', 'tomorrow 10:00']); solo(['add', 'My meeting', '--at', 'tomorrow 11:00']);
    var cal = solo(['calendar', '--all']); ok(/My meeting/.test(cal) && !/Sample meeting/.test(cal), 'cli · calendar --all leaves the Sample project out');
    var d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-blank3-')); var D1 = D; D = d3;
    solo(['template', 'sample']); var doc3 = solo(['doctor']);
    ok(/fresh install/.test(doc3) && !/no backup/.test(doc3) && !/template sample/.test(solo(['today'])), 'cli · with only the Sample project the install is still fresh, and nothing offers a second sample');
    fs.rmSync(d3, { recursive: true, force: true }); D = D1;
    var d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-blank2-')); var D0 = D; D = d2;
    solo(['template', 'blank']); solo(['template', 'board']);
    ok(json('runway').tasks.length > 10, 'cli · template board fills an empty board file (a blank start, then the sample on purpose)');
    solo(['add', 'Mine']); ok(/has content — skipped/.test(solo(['template', 'board'])), 'cli · template board never overwrites a board with tasks');
    fs.rmSync(d2, { recursive: true, force: true }); D = D0;
  } finally { fs.rmSync(D, { recursive: true, force: true }); }

  console.log('\n✓ ' + passed + ' blank-start checks passed');
  process.exit(0);
})().catch(function (e) { console.error(e); process.exit(1); });
