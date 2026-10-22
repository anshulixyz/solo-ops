#!/usr/bin/env node
/* core/test-studio-keep.js — the Writing and Script pages keep the fields they do not own. Invented content only.
   A draft's `files` (the originals under data/attachments/, written when an image is dropped in) and any field
   the CLI or an agent adds must survive every way the page takes a library in, and the next write after it:
     1. the page starts from its browser copy (loadLibrary)
     2. a newer file comes in (the Sync apply)
     3. a pasted reply lands (window.refreshNotes / window.refreshScripts, called by the Guide after Apply)
     4. Duplicate note: the copy points at the same originals
   and `node solo.js doctor` never calls the original of a draft that lost its link "safe to delete".
   Each page's real scripts (read from its HTML) run in a vm with a small DOM shim and a fake `node serve.js` whose
   data/ folder lives in memory; "the next write" is the PUT the page sends after an edit.
   Run: node core/test-studio-keep.js */
'use strict';
var fs = require('fs'); var path = require('path'); var vm = require('vm'); var os = require('os'); var cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var passed = 0;
function ok(cond, msg) { if (!cond) { console.error('✗ ' + msg); process.exit(1); } passed++; console.log('✓ ' + msg); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function copy(x) { return JSON.parse(JSON.stringify(x)); }

// An element that answers anything the pages ask of it: known fields hold values, any other property is a no-op method.
function el(tag) {
  var t = { tagName: String(tag || 'div').toUpperCase(), style: { setProperty: function () {} }, dataset: {}, children: [], className: '', innerHTML: '', textContent: '', value: '',
    selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollHeight: 0, clientHeight: 0, offsetHeight: 0, disabled: false, checked: false,
    classList: { _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; }, contains: function (c) { return !!this._s[c]; }, toggle: function () {} },
    getAttribute: function () { return null; }, appendChild: function (c) { this.children.push(c); return c; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, closest: function () { return null; } };
  return new Proxy(t, { get: function (o, k) { return k in o || typeof k === 'symbol' ? o[k] : function () {}; } });
}

var SKIP = /(theme-boot|theme|palette|nav|attach|inspo-quick)\.js$/;   // chrome a page runs without; Palette is stubbed
function page(rel, disk, opts) {
  opts = opts || {};
  var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  var srcs = (html.match(/<script src="[^"]+"/g) || []).map(function (s) { return path.normalize(path.join(path.dirname(rel), s.slice(13, -1))); });
  var ls = {}; Object.keys(opts.local || {}).forEach(function (k) { ls[k] = opts.local[k]; });
  var puts = []; var els = {};
  function res(status, body) { return Promise.resolve({ status: status, ok: status >= 200 && status < 300, json: function () { return Promise.resolve(body); } }); }
  var doc = el('document'); doc.readyState = 'loading'; doc.visibilityState = 'visible'; doc.body = el('body'); doc.head = el('head'); doc.documentElement = el('html');
  doc.createElement = el; doc.getElementById = function (id) { return doc.querySelector('#' + id); };
  doc.querySelector = function (s) { return els[s] || (els[s] = el('div')); };   // the same element each time, so a test can type into it
  var ready = [];
  doc.addEventListener = function (ev, fn) { if (ev === 'DOMContentLoaded') ready.push(fn); };
  var ctx = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () { return 0; }, clearInterval: function () {}, URLSearchParams: URLSearchParams, Blob: Blob, Promise: Promise,
    URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
    localStorage: { getItem: function (k) { return k in ls ? ls[k] : null; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } },
    location: { protocol: 'http:', pathname: '/' + rel, search: '', host: 'localhost:9', reload: function () {} },
    navigator: { platform: 'MacIntel', clipboard: { writeText: function () { return Promise.resolve(); } } },
    document: doc, confirm: function () { return true; }, alert: function () {}, prompt: function () {}, matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
    requestAnimationFrame: function (f) { return setTimeout(f, 0); }, cancelAnimationFrame: clearTimeout, getComputedStyle: function () { return {}; },
    Palette: { init: function () {}, register: function () {} },
    fetch: function (url, o) {
      if (url === '/api/ping') return res(200, { marathon: true });
      var m = String(url).match(/^\/api\/data\/([^?]+)/);
      if (m && (!o || !o.method || o.method === 'GET')) { var nm = decodeURIComponent(m[1]); return disk[nm] ? res(200, copy(disk[nm])) : res(404, null); }
      if (m && o.method === 'PUT') { var nm2 = decodeURIComponent(m[1]); puts.push(nm2); disk[nm2] = JSON.parse(o.body); return res(200, { ok: true }); }
      return res(404, null);
    } };
  ctx.window = ctx; ctx.global = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  srcs.forEach(function (f) { if (!SKIP.test(f)) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); });
  doc.readyState = 'complete'; ready.forEach(function (fn) { fn(); });   // the page's own init(), as the browser would run it
  return { W: ctx, ls: ls, puts: puts, disk: disk, run: function (code) { return vm.runInContext(code, ctx); } };
}
function stamp(body, ago) { return Object.assign({ version: 1, updatedAt: new Date(Date.now() - (ago || 60000)).toISOString() }, body); }

var FILES = { 1: 'data/attachments/note-n7-1.png', 2: 'data/attachments/note-n7-2.jpg' };
function draft(id, extra) { return Object.assign({ id: id, text: '# Launch notes\n\n[Image uploaded 1]\n[Image uploaded 2]\n', images: { 1: 'data:image/png;base64,AAAA', 2: 'data:image/jpeg;base64,BBBB' }, files: copy(FILES), from: 'agent', createdAt: 1, updatedAt: 2 }, extra || {}); }
function script(id, extra) { return Object.assign({ id: id, title: 'Teaser', text: '# Teaser\n\n## Hook\n\n## Script\n1. One line\n', noteId: 'n7', files: { 1: 'data/attachments/script-s7-1.png' }, from: 'agent', createdAt: 1, updatedAt: 2 }, extra || {}); }
function keepsDraft(n) { return n && JSON.stringify(n.files) === JSON.stringify(FILES) && n.from === 'agent' && n.images && n.images['1'] === 'data:image/png;base64,AAAA'; }
function keepsScript(s) { return s && s.files && s.files['1'] === 'data/attachments/script-s7-1.png' && s.from === 'agent' && s.noteId === 'n7'; }

(async function () {
  /* ================= Writing ================= */
  var WKEY = 'marathon.writing';
  // 1 · the page starts from its browser copy; no file yet, so its first write sends the browser copy
  var p = page('studio/writing-viewer.html', {}, { local: (function () { var o = {}; o[WKEY] = JSON.stringify({ activeId: 'n7', notes: [draft('n7')] }); return o; })() });
  ok(p.W.Config.key('writing') === WKEY, 'writing: the page reads ' + WKEY);
  await wait(80);
  ok(keepsDraft(p.run('library').notes[0]), 'writing 1 · the browser copy keeps files and an agent\'s field through loadLibrary');
  p.run("document.querySelector('#writingInput').value += 'One more line.\\n'; refresh();"); await wait(700);
  var f1 = p.disk['writing.json'];
  ok(f1 && /One more line/.test(f1.notes[0].text), 'writing 1 · an edit writes data/writing.json');
  ok(keepsDraft(f1.notes[0]), 'writing 1 · that write keeps files and the agent\'s field');
  ok(keepsDraft(JSON.parse(p.ls[WKEY]).notes[0]), 'writing 1 · and so does the browser copy');

  // 2 · a newer file comes in (the Sync apply), then the page writes
  var disk2 = { 'writing.json': stamp({ activeId: 'n7', notes: [draft('n7'), { id: 'n8', text: '# Bare' }, null, 'stray text', ['a']] }) };
  p = page('studio/writing-viewer.html', disk2); await wait(120);
  var lib2 = p.run('library');
  ok(lib2.notes.length === 2 && keepsDraft(lib2.notes[0]), 'writing 2 · a file pulled in keeps files and the agent\'s field through the Sync apply');
  ok(lib2.notes.every(function (n) { return typeof n.id === 'string' && !('0' in n); }), 'writing 2 · entries that are not drafts (null, a string, a list) are skipped, not turned into drafts');
  ok(p.W.Guide.snapshot().indexOf('image files: data/attachments/note-n7-1.png, data/attachments/note-n7-2.jpg') > 0, 'writing 2 · the snapshot an agent gets lists the draft\'s image files');
  ok(lib2.notes[1].text === '# Bare' && JSON.stringify(lib2.notes[1].images) === '{}' && lib2.notes[1].createdAt > 0 && !('files' in lib2.notes[1]), 'writing 2 · a bare draft still gets the page\'s defaults, and no files it never had');
  ok(keepsDraft(JSON.parse(p.ls[WKEY]).notes[0]), 'writing 2 · the browser copy follows the file with files intact');
  p.run("document.querySelector('#writingInput').value += 'Edited after the pull.\\n'; refresh();"); await wait(700);
  ok(p.puts.indexOf('writing.json') >= 0 && /Edited after the pull/.test(p.disk['writing.json'].notes[0].text), 'writing 2 · an edit after the pull writes the file');
  ok(keepsDraft(p.disk['writing.json'].notes[0]), 'writing 2 · that write keeps files and the agent\'s field');

  // 3 · a pasted reply lands in the browser copy; the Guide calls refreshNotes; the next write keeps files
  var cur = JSON.parse(p.ls[WKEY]); cur.notes.unshift(draft('n9', { text: '# From a reply\n\n[Image uploaded 1]\n' })); cur.activeId = 'n9';
  p.W.Store.setJSON(WKEY, cur, { silent: true }); p.run('window.refreshNotes()');
  ok(keepsDraft(p.run('library').notes.filter(function (n) { return n.id === 'n9'; })[0]), 'writing 3 · refreshNotes keeps files and the agent\'s field');
  p.run("document.querySelector('#writingInput').value += 'Typed after the reply.\\n'; refresh();"); await wait(700);
  var w3 = p.disk['writing.json'].notes;
  ok(keepsDraft(w3.filter(function (n) { return n.id === 'n9'; })[0]) && keepsDraft(w3.filter(function (n) { return n.id === 'n7'; })[0]), 'writing 3 · the write after it keeps files on both drafts');

  // 4 · Duplicate note: the copy points at the same originals (deleting a draft never deletes them; new images in the copy get its own id)
  p.run("switchNote('n7'); duplicateActiveNote();"); await wait(700);
  var dup = p.disk['writing.json'].notes[0];
  ok(dup.id !== 'n7' && JSON.stringify(dup.files) === JSON.stringify(FILES) && dup.files !== p.run('library').notes.filter(function (n) { return n.id === 'n7'; })[0].files, 'writing 4 · Duplicate note copies the files map (its own copy of it) and writes it');
  ok(!('from' in dup), 'writing 4 · and nothing else the page does not own');

  /* ================= Scripts ================= */
  var SKEY;
  // 1 · browser copy → loadLibrary → write
  p = page('studio/script-viewer.html', {}, { local: (function () { var o = {}; o['marathon.scripts'] = JSON.stringify({ activeId: 's7', scripts: [script('s7')] }); return o; })() });
  SKEY = p.W.Config.key('scripts'); ok(SKEY === 'marathon.scripts', 'scripts: the page reads ' + SKEY);
  await wait(80);
  ok(keepsScript(p.run('library').scripts[0]), 'scripts 1 · the browser copy keeps noteId and fields the page does not own through loadLibrary');
  p.run("document.querySelector('#scriptInput').value += '2. Another line\\n'; updatePreview();"); await wait(700);
  var s1 = p.disk['scripts.json'];
  ok(s1 && /Another line/.test(s1.scripts[0].text) && keepsScript(s1.scripts[0]), 'scripts 1 · an edit writes data/scripts.json and keeps noteId and those fields');

  // 2 · a newer file → Sync apply → write
  p = page('studio/script-viewer.html', { 'scripts.json': stamp({ activeId: 's7', scripts: [script('s7'), { id: 's8', text: '# Bare' }] }) }); await wait(120);
  var sl = p.run('library').scripts;
  ok(keepsScript(sl[0]) && sl[1].title === 'Bare' && sl[1].noteId === '' && !('files' in sl[1]), 'scripts 2 · a file pulled in keeps noteId and the fields the page does not own; a bare script still gets the defaults');
  p.run("document.querySelector('#scriptInput').value += '2. After the pull\\n'; updatePreview();"); await wait(700);
  ok(/After the pull/.test(p.disk['scripts.json'].scripts[0].text) && keepsScript(p.disk['scripts.json'].scripts[0]), 'scripts 2 · the write after the pull keeps noteId and those fields');

  // 3 · refreshScripts
  var sc = JSON.parse(p.ls[SKEY]); sc.scripts.unshift(script('s9', { title: 'From a reply' })); sc.activeId = 's9';
  p.W.Store.setJSON(SKEY, sc, { silent: true }); p.run('window.refreshScripts()');
  ok(keepsScript(p.run('library').scripts.filter(function (s) { return s.id === 's9'; })[0]), 'scripts 3 · refreshScripts keeps noteId and those fields');
  p.run("document.querySelector('#scriptInput').value += '2. Typed after the reply\\n'; updatePreview();"); await wait(700);
  var s3 = p.disk['scripts.json'].scripts.filter(function (s) { return s.id === 's9'; })[0];
  ok(s3 && /Typed after the reply/.test(s3.text) && keepsScript(s3), 'scripts 3 · the write after it keeps them too');

  /* ================= doctor ================= */
  // A draft that lost its files link before this fix still has its original on disk: doctor must not call it safe to delete.
  var D = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-keep-'));
  function solo(args) { var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'solo.js')].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { SOLO_DATA: D }) }); return (r.stdout || '') + (r.stderr || ''); }
  var doc = '', nid = '';
  try {
    solo(['template', 'all']);
    var wf = JSON.parse(fs.readFileSync(path.join(D, 'writing.json'), 'utf8')); nid = wf.notes[0].id;
    wf.notes[0].images = { 1: 'data:image/png;base64,AAAA' }; delete wf.notes[0].files; fs.writeFileSync(path.join(D, 'writing.json'), JSON.stringify(wf));
    fs.mkdirSync(path.join(D, 'attachments')); ['note-' + nid + '-1.png', 'note-gone-1.png'].forEach(function (f) { fs.writeFileSync(path.join(D, 'attachments', f), 'x'); });
    doc = solo(['doctor']);
  } finally { fs.rmSync(D, { recursive: true, force: true }); }   // before the checks: a failing ok() exits on the spot
  var safe = (doc.match(/nothing references \(safe to delete\): ([^\n]*)/) || [])[1] || '';
  ok(nid && safe.indexOf('note-' + nid + '-1.png') < 0 && /not safe to delete/.test(doc) && doc.indexOf('note-' + nid + '-1.png') > 0, 'doctor · the original of a draft that lost its link is listed as not safe to delete');
  ok(safe.indexOf('note-gone-1.png') >= 0, 'doctor · an image whose draft is gone is still safe to delete');

  console.log('\n' + passed + ' passed');
  process.exit(0);
})().catch(function (e) { console.error(e); process.exit(1); });
