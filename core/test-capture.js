#!/usr/bin/env node
/* core/test-capture.js — the capture strip reaches data/inspiration.json from every page, the shipped sample inbox
   yields to a data file, and a first contact with a file is recorded as a load, not as edits. Invented content only.
   Runs the real core/store.js, core/config.js, core/templates.js, core/sync.js, core/recent.js, inspo/inspo-model.js
   and core/inspo-quick.js in a vm against a fake browser and a fake `node serve.js` whose data/ folder lives in memory.
     1. a page without an inbox view (the board): a link typed into the strip is written to the file, logged "saved: …"
     2. a page with its own inbox view (Home, Inspiration) registers the file itself: one registration, the page's, in either order
     3. Undo on the capture toast writes the removal with its own note
     4. the shipped sample items left in a browser (not fresh, a newer stamp) lose to an empty 1970 file (template blank), nothing written
     5. the same sample with no file at all: nothing is written into the folder
     6. the first contact with a file that differs (the person chose the file) is one "loaded from file" row, not "deleted task" rows
   Run: node core/test-capture.js */
'use strict';
var fs = require('fs'); var path = require('path'); var vm = require('vm');
var ROOT = path.join(__dirname, '..');
var passed = 0;
function ok(cond, msg) { if (!cond) { console.error('✗ ' + msg); process.exit(1); } passed++; console.log('✓ ' + msg); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function copy(x) { return JSON.parse(JSON.stringify(x)); }

// An element that answers what the strip asks of it: listeners are kept so a test can fire them, querySelector hands out
// the same child for the same selector, and anything else is a no-op.
function el(tag) {
  var kids = {}; var listeners = {};
  var t = { tagName: String(tag || 'div').toUpperCase(), style: {}, className: '', innerHTML: '', textContent: '', value: '', scrollHeight: 20, children: [],
    classList: { _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; }, contains: function (c) { return !!this._s[c]; }, toggle: function () {} },
    addEventListener: function (ev, fn) { listeners[ev] = fn; }, fire: function (ev, e) { if (listeners[ev]) listeners[ev](e || { preventDefault: function () {} }); },
    getAttribute: function () { return null; }, setAttribute: function () {}, appendChild: function (c) { t.children.push(c); return c; }, remove: function () {}, click: function () {},
    insertAdjacentElement: function (where, node) { t.inserted = node; return node; }, focus: function () {}, blur: function () {},
    querySelector: function (s) { return kids[s] || (kids[s] = el(/textarea|capture-in/.test(s) ? 'textarea' : 'div')); }, querySelectorAll: function () { return []; }, closest: function () { return null; } };
  return t;
}

function browser(disk, opts) {
  opts = opts || {};
  var ls = {}; Object.keys(opts.local || {}).forEach(function (k) { ls[k] = opts.local[k]; });
  var puts = []; var confirms = [];
  var localStorage = { getItem: function (k) { return k in ls ? ls[k] : null; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } };
  function res(status, body) { return Promise.resolve({ status: status, ok: status >= 200 && status < 300, json: function () { return Promise.resolve(body); } }); }
  var slot = el('nav'); var body = el('body');
  var doc = { readyState: 'complete', visibilityState: 'visible', body: body, activeElement: null,
    querySelector: function (s) { return s === '[data-nav]' ? slot : null; }, querySelectorAll: function () { return []; }, getElementById: function () { return null; },
    addEventListener: function () {}, createElement: el };
  var ctx = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () { return 0; }, clearInterval: function () {},
    localStorage: localStorage, URLSearchParams: URLSearchParams, Blob: Blob, URL: { createObjectURL: function () { return 'blob:test'; }, revokeObjectURL: function () {} },
    location: { protocol: 'http:', pathname: opts.page || '/runway/marathon-board.html', search: '', host: 'localhost:4321' },
    document: doc, addEventListener: function () {}, scrollTo: function () {}, Activity: { ago: function () { return 'just now'; }, bump: function () {} },
    confirm: function (q) { confirms.push(q); return opts.confirm !== undefined ? opts.confirm : true; },
    fetch: function (url, o) {
      if (url === '/api/ping') return res(200, { marathon: true });
      var m = String(url).match(/^\/api\/data\/([^?]+)/);
      if (m && (!o || !o.method || o.method === 'GET')) return disk[m[1]] ? res(200, copy(disk[m[1]])) : res(404, null);
      if (m && o.method === 'PUT') { puts.push({ file: m[1], source: o.headers['X-Marathon-Source'], note: o.headers['X-Marathon-Note'], body: JSON.parse(o.body) }); disk[m[1]] = JSON.parse(o.body); return res(200, { ok: true }); }
      return res(404, null);
    }
  };
  ctx.window = ctx; ctx.global = ctx;
  vm.createContext(ctx);
  ['solo.config.js', 'core/store.js', 'core/config.js', 'core/templates.js', 'core/sync.js', 'core/recent.js', 'inspo/inspo-model.js', 'core/inspo-quick.js'].forEach(function (f) {
    if (opts.registerFirst && f === 'core/inspo-quick.js') opts.registerFirst(ctx.window);
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  });
  var W = ctx.window;
  function inspoPuts() { return puts.filter(function (p) { return p.file === 'inspiration.json'; }); }
  function strip() { return slot.inserted; }
  function type(text) { var bar = strip(); var ta = bar.querySelector('.capture-in'); ta.value = text; ta.fire('keydown', { key: 'Enter', shiftKey: false, preventDefault: function () {} }); }
  function inspoSpecs() { return W.Sync.specs.filter(function (s) { return s.file === 'inspiration.json'; }); }
  function pageSpec() { return W.Sync.register({ file: 'inspiration.json', key: W.InspoModel.KEY, label: 'inspiration', app: 'inspiration', isFresh: W.InspoModel.isFresh, read: function () { return { items: W.InspoModel.getState() }; }, apply: function (b) { if (Array.isArray(b.items)) W.InspoModel.replaceAll(b.items, { silent: true }); } }); }
  return { W: W, ls: ls, puts: puts, inspoPuts: inspoPuts, confirms: confirms, disk: disk, strip: strip, type: type, inspoSpecs: inspoSpecs, pageSpec: pageSpec, body: body };
}
var EPOCH = { version: 1, updatedAt: '1970-01-01T00:00:00.000Z', items: [] };
function stamp(body, agoMs) { return Object.assign({ version: 1, updatedAt: new Date(Date.now() - (agoMs || 60000)).toISOString() }, body); }
var T = require(path.join(ROOT, 'core', 'templates.js'));

(async function () {
  // 1 · the board page: no inbox view, the strip alone
  var b = browser({ 'inspiration.json': copy(EPOCH) }); await wait(80);
  ok(b.strip() && b.inspoSpecs().length === 1 && b.inspoSpecs()[0].fallback === true, '1 · the strip registered inspiration.json as the page\'s fallback');
  ok(b.ls['marathon.sync.meta'] && JSON.parse(b.ls['marathon.sync.meta'])['inspiration.json'].updatedAt === EPOCH.updatedAt, '1 · the empty file was pulled in first (its stamp adopted)');
  b.type('https://example.com/launch-story Launch story thread #hook'); await wait(600);
  var f1 = b.disk['inspiration.json'];
  ok(f1.items.length === 1 && f1.items[0].title === 'Launch story thread' && f1.items[0].url === 'https://example.com/launch-story' && f1.items[0].source === 'ui', '1 · the capture is in data/inspiration.json');
  ok(b.inspoPuts().length === 1 && b.inspoPuts()[0].source === 'ui' && b.inspoPuts()[0].note === 'saved: Launch story thread', '1 · one write, logged as "saved: …" from the page (source ui)');
  ok(f1.updatedAt > EPOCH.updatedAt, '1 · the file carries the new stamp, so Home and the inbox page pull it in');

  // 2 · a page with its own inbox view: one registration, the page's, whichever comes first
  b = browser({ 'inspiration.json': copy(EPOCH) }, { page: '/index.html', registerFirst: function (W) { W.Sync.register({ file: 'inspiration.json', key: W.InspoModel.KEY, label: 'inspiration', isFresh: W.InspoModel.isFresh, read: function () { return { items: W.InspoModel.getState() }; }, apply: function (x) { if (Array.isArray(x.items)) W.InspoModel.replaceAll(x.items, { silent: true }); } }); } }); await wait(80);
  ok(b.inspoSpecs().length === 1 && !b.inspoSpecs()[0].fallback, '2 · the page registered before the strip mounted: the strip stays out');
  b.type('A note typed on Home'); await wait(600);
  ok(b.inspoPuts().length === 1 && b.disk['inspiration.json'].items.length === 1, '2 · a capture there is written once');
  b = browser({ 'inspiration.json': copy(EPOCH) }); await wait(80);
  ok(b.inspoSpecs()[0].fallback === true, '2 · (the strip first)');
  b.pageSpec(); await wait(80);
  ok(b.inspoSpecs().length === 1 && !b.inspoSpecs()[0].fallback, '2 · the page registering after the strip replaces the fallback: still one');
  b.type('Another note'); await wait(600);
  ok(b.inspoPuts().length === 1, '2 · and a capture is still written once');

  // 3 · Undo on the toast
  b = browser({ 'inspiration.json': copy(EPOCH) }); await wait(80);
  b.type('https://example.com/undo-me Undo me'); await wait(600);
  var toast = b.body.children.filter(function (c) { return c.className === 'capture-toast'; })[0];
  ok(toast && b.disk['inspiration.json'].items.length === 1, '3 · the capture toast is up and the item is in the file');
  toast.querySelector('button').onclick(); await wait(600);
  ok(b.disk['inspiration.json'].items.length === 0 && b.inspoPuts().length === 2 && b.inspoPuts()[1].note === 'undo save: Undo me', '3 · Undo removes it from the file, logged "undo save: …"');

  // 4 · the shipped sample inbox, left in a browser by an older build or session: not fresh any more, a stamp newer than 1970
  var sample = JSON.stringify(T.inspiration(new Date()));
  b = browser({ 'inspiration.json': copy(EPOCH) }, { local: { 'marathon.inspiration': sample, 'marathon.sync.meta': JSON.stringify({ 'inspiration.json': { updatedAt: new Date(Date.now() - 3600000).toISOString() } }) } });
  ok(b.W.InspoModel.isSample() && b.W.InspoModel.isFresh(), '4 · the untouched sample reads as the sample, and as "no real copy here" for sync');
  await wait(600);
  ok(b.W.InspoModel.getState().length === 0 && b.disk['inspiration.json'].items.length === 0 && b.inspoPuts().length === 0 && b.confirms.length === 0, '4 · the empty 1970 file wins over it: inbox empty, file untouched, no question');
  ok(!b.W.InspoModel.isSample(), '4 · after the file came in the inbox is no longer "the sample"');
  b.type('https://example.com/mine Mine'); await wait(600);
  ok(b.disk['inspiration.json'].items.length === 1 && b.disk['inspiration.json'].items[0].title === 'Mine', '4 · the next capture writes only what was typed');
  var touched = JSON.parse(sample); touched.items[0].tags.push('mine');
  b = browser({ 'inspiration.json': copy(EPOCH) }, { local: { 'marathon.inspiration': JSON.stringify(touched), 'marathon.sync.meta': JSON.stringify({ 'inspiration.json': { updatedAt: new Date(Date.now() - 3600000).toISOString() } }) } });
  ok(!b.W.InspoModel.isSample() && !b.W.InspoModel.isFresh(), '4 · a sample item the person changed (a tag) makes the inbox theirs again: the usual rules apply');
  var fewer = JSON.parse(sample); fewer.items.pop();
  b = browser({ 'inspiration.json': stamp({ items: JSON.parse(sample).items }) }, { local: { 'marathon.inspiration': JSON.stringify(fewer), 'marathon.sync.meta': JSON.stringify({ 'inspiration.json': { updatedAt: new Date().toISOString() } }) } });
  ok(!b.W.InspoModel.isSample() && !b.W.InspoModel.isFresh(), '4 · the sample minus one item the person deleted is theirs too: an older file holding all three does not bring it back');
  await wait(600);
  ok(b.W.InspoModel.getState().length === 2 && b.disk['inspiration.json'].items.length === 2, '4 · the newer browser copy goes to the file, as before');

  // 5 · the same leftover sample, and no inspiration.json in the folder at all
  b = browser({}, { local: { 'marathon.inspiration': sample, 'marathon.sync.meta': JSON.stringify({ 'inspiration.json': { updatedAt: new Date(Date.now() - 3600000).toISOString() } }) } });
  await wait(600);
  ok(!b.disk['inspiration.json'] && b.inspoPuts().length === 0, '5 · nothing is written into the folder for it');

  // 6 · first contact with a board file that differs from this browser's copy, the person chooses the file
  var fileTasks = [{ id: 't1', title: 'From the file', col: 'todo', pri: 'medium', tags: [], checklist: [] }, { id: 't2', title: 'Also from the file', col: 'todo', pri: 'low', tags: [], checklist: [] }];
  var browserTasks = [{ id: 't2', title: 'Also from the file', col: 'todo', pri: 'low', tags: [], checklist: [] }, { id: 't8', title: 'Only in this browser', col: 'doing', pri: 'high', tags: [], checklist: [] }, { id: 't9', title: 'Another only here', col: 'todo', pri: 'low', tags: [], checklist: [] }];
  b = browser({ 'runway.json': stamp({ projects: [], tasks: fileTasks }), 'inspiration.json': copy(EPOCH) }, { local: { 'marathon.board.runway': JSON.stringify(browserTasks) }, confirm: true });
  var key = 'marathon.board.runway';
  b.W.Sync.register({ file: 'runway.json', keys: [key, key + '.projects'], label: 'board', isFresh: function () { return b.W.Store.get(key) == null; }, read: function () { return { projects: [], tasks: JSON.parse(b.ls[key] || '[]') }; }, apply: function (x) { if (Array.isArray(x.tasks)) b.W.Store.setJSON(key, x.tasks, { silent: true }); } });
  await wait(600);
  var ev = JSON.parse(b.ls['marathon.recent'] || '[]');
  ok(b.confirms.length === 1 && JSON.parse(b.ls[key]).length === 2, '6 · the question was asked and the file was loaded');
  ok(ev.length === 1 && ev[0].source === 'file' && ev[0].what === 'loaded from file: 2 tasks · 2 from this browser not in the file (backup saved)', '6 · Recent changes: one row, "loaded from file: 2 tasks · 2 from this browser not in the file (backup saved)", source file — no "deleted task" rows');
  ok(/loaded from file: 2 tasks/.test(b.W.Recent.text(3)) && !/now: \(no longer present\)/.test(b.W.Recent.text(3)), '6 · "What I just did" prints the row without a now: line');
  b.disk['runway.json'] = stamp({ projects: [], tasks: fileTasks.slice(1) }, 0); b.disk['runway.json'].updatedAt = new Date(Date.now() + 1000).toISOString();
  await b.W.Sync.pullAll(false); await wait(80);
  ev = JSON.parse(b.ls['marathon.recent'] || '[]');
  ok(ev.length === 2 && ev[1].source === 'agent or CLI' && ev[1].what === 'deleted task: From the file', '6 · a later change on the file side is still the agent\'s: "deleted task: From the file"');

  console.log('\n✓ ' + passed + ' capture checks passed');
  process.exit(0);
})().catch(function (e) { console.error(e); process.exit(1); });
