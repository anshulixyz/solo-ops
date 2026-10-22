#!/usr/bin/env node
/* core/test-studio-keep.js — the Writing and Script pages keep the fields they do not own. Invented content only.
   A draft's `files` (the originals under data/attachments/, written when an image is dropped in) and any field
   the CLI or an agent adds must survive every way the page takes a library in, and the next write after it:
     1. the page starts from its browser copy (loadLibrary)
     2. a newer file comes in (the Sync apply)
     3. a pasted reply lands (window.refreshNotes / window.refreshScripts, called by the Guide after Apply)
     4. Duplicate note: the copy points at the same originals
   An image's link must also reach the file when the drafts change under it:
     5. a file pull lands while the image uploads
     6. without the server the original waits in the browser; when it reaches data/attachments/ the draft links it
     7. the same when it reached the disk while another page was open (core/attach.js remembers it; tested at the end)
     8. ... but never before the first pull: a link made on an older browser copy would be written over a newer file
     9. a copy Duplicate made while the original was waiting is linked with it
    10. back to a tab that was hidden while an agent edited the file: the page pulls first, then links
    11. a first pull that failed: nothing is linked on the copy here
    12. a title with — ’ or an emoji: the change note no longer breaks the save (fetch refuses non-Latin-1 headers),
        and serve.js logs it as written (tested at the end with the real server)
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
  var puts = []; var notes = []; var els = {}; var created = [];
  function res(status, body) { return Promise.resolve({ status: status, ok: status >= 200 && status < 300, json: function () { return Promise.resolve(body); } }); }
  var doc = el('document'); doc.readyState = 'loading'; doc.visibilityState = 'visible'; doc.body = el('body'); doc.head = el('head'); doc.documentElement = el('html');
  doc.createElement = function (t) { var e = el(t); created.push(e); return e; }; doc.getElementById = function (id) { return doc.querySelector('#' + id); };
  doc.querySelector = function (s) { return els[s] || (els[s] = el('div')); };   // the same element each time, so a test can type into it
  var ready = [];
  var on = {}; doc.addEventListener = function (ev, fn) { if (ev === 'DOMContentLoaded') ready.push(fn); else (on[ev] = on[ev] || []).push(fn); };
  var ctx = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () { return 0; }, clearInterval: function () {}, URLSearchParams: URLSearchParams, Blob: Blob, Promise: Promise,
    URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
    localStorage: { getItem: function (k) { return k in ls ? ls[k] : null; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } },
    location: { protocol: 'http:', pathname: '/' + rel, search: '', host: 'localhost:9', reload: function () {} },
    navigator: { platform: 'MacIntel', clipboard: { writeText: function () { return Promise.resolve(); } } },
    document: doc, confirm: function () { return true; }, alert: function () {}, prompt: function () {}, matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
    requestAnimationFrame: function (f) { return setTimeout(f, 0); }, cancelAnimationFrame: clearTimeout, getComputedStyle: function () { return {}; },
    Palette: { init: function () {}, register: function () {} },
    FileReader: function () { var r = this; r.readAsDataURL = function () { setTimeout(function () { r.result = 'data:image/png;base64,T1JJRw=='; r.onload(); }, 0); }; },
    fetch: function (url, o) {
      var hv = o && o.headers ? Object.keys(o.headers).map(function (k) { return String(o.headers[k]); }).join('') : '';
      if (/[^\u0000-\u00ff]/.test(hv)) return Promise.reject(new TypeError("Failed to execute 'fetch': String contains non ISO-8859-1 code point."));   // as Chrome does
      if (url === '/api/ping') return res(200, { marathon: true });
      var m = String(url).match(/^\/api\/data\/([^?]+)/);
      if (m && (!o || !o.method || o.method === 'GET') && opts.failGet && opts.failGet[decodeURIComponent(m[1])] > 0) { opts.failGet[decodeURIComponent(m[1])]--; return Promise.reject(new TypeError('Failed to fetch')); }   // opts.failGet: { file: how many reads fail }
      if (m && (!o || !o.method || o.method === 'GET')) { var nm = decodeURIComponent(m[1]); var got = disk[nm] ? res(200, copy(disk[nm])) : res(404, null); return opts.slowGet && opts.slowGet[nm] ? new Promise(function (r) { setTimeout(function () { r(got); }, opts.slowGet[nm]); }) : got; }   // opts.slowGet: { file: ms }
      if (m && o.method === 'PUT') { var nm2 = decodeURIComponent(m[1]); puts.push(nm2); var hn = String((o.headers || {})['X-Marathon-Note'] || ''); try { hn = decodeURIComponent(hn); } catch (e) { /* as serve.js: kept as it came */ } notes.push(nm2 + ': ' + hn); disk[nm2] = JSON.parse(o.body); return res(200, { ok: true }); }
      return res(404, null);
    } };
  ctx.window = ctx; ctx.global = ctx; ctx.self = ctx; if (opts.attach) ctx.Attach = opts.attach;   // core/attach.js itself needs a real browser; tested on its own below
  vm.createContext(ctx);
  srcs.forEach(function (f) { if (!SKIP.test(f)) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); });
  doc.readyState = 'complete'; ready.forEach(function (fn) { fn(); });   // the page's own init(), as the browser would run it
  return { W: ctx, doc: doc, fire: function (ev) { (on[ev] || []).forEach(function (fn) { fn({}); }); }, ls: ls, puts: puts, notes: notes, disk: disk, created: created, run: function (code) { return vm.runInContext(code, ctx); } };
}
// Attach as the Writing page uses it, with the upload held until the test lets it finish.
function fakeAttach(where) {
  var A = { where: where, puts: [], flushed: [], savedList: [],
    thumb: function (d) { return Promise.resolve(d); }, ext: function () { return 'png'; },
    put: function (name) { return new Promise(function (res) { A.puts.push({ name: name, done: function () { res(A.where === 'disk' ? { file: 'data/attachments/' + name, where: 'disk' } : { file: '', where: 'browser' }); } }); }); },
    onFlushed: function (fn) { A.flushed.push(fn); },
    saved: function (match) { A.asked = (A.asked || 0) + 1; return Promise.resolve(A.savedList.filter(function (x) { return typeof match === 'function' ? match(x.name) : x.name.indexOf(match) === 0; })); } };
  return A;
}
function dropImage(p) { p.run('insertImage()'); var input = p.created.filter(function (e) { return e.type === 'file'; }).pop(); input.files = [{ name: 'shot.png', type: 'image/png' }]; input.onchange(); }   // the Image button, a file picked
// IndexedDB as core/attach.js uses it (open, one store, put / get / getAllKeys, oncomplete after the requests).
function fakeIDB() {
  var data = {}; var later = setImmediate;
  function req(fn) { var r = {}; later(function () { r.result = fn(); if (r.onsuccess) r.onsuccess(); }); return r; }
  var db = { createObjectStore: function () {}, transaction: function () {
    var tx = {}; var st = { put: function (v, k) { data[k] = copy(v); }, get: function (k) { return req(function () { return data[k] ? copy(data[k]) : undefined; }); }, getAllKeys: function () { return req(function () { return Object.keys(data); }); } };
    tx.objectStore = function () { return st; }; later(function () { later(function () { if (tx.oncomplete) tx.oncomplete(); }); }); return tx; } };
  return { open: function () { var r = {}; later(function () { r.result = db; if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); }); return r; } };
}
function noteOf(p, id) { return p.disk['writing.json'].notes.filter(function (n) { return n.id === id; })[0]; }
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

  // 5 · an image upload that a file pull overtakes: the link lands on the drafts as they are now, not on the replaced copy
  var A5 = fakeAttach('disk');
  p = page('studio/writing-viewer.html', { 'writing.json': stamp({ activeId: 'n7', notes: [draft('n7'), { id: 'n8', text: '# Other' }] }) }, { attach: A5 }); await wait(120);
  dropImage(p); await wait(50);
  ok(A5.puts.length === 1 && A5.puts[0].name === 'note-n7-3.png', 'writing 5 · the Image button starts the upload of note-n7-3.png');
  await wait(1200);   // the page saves the draft with [Image uploaded 3] while the upload runs
  var newer = copy(p.disk['writing.json']); newer.notes.filter(function (n) { return n.id === 'n8'; })[0].text = '# Other, edited by an agent'; newer.updatedAt = new Date(Date.now() + 1000).toISOString(); p.disk['writing.json'] = newer;
  await p.W.Sync.pullAll(true); await wait(50);
  ok(p.run('library').notes.filter(function (n) { return n.id === 'n8'; })[0].text === '# Other, edited by an agent', 'writing 5 · a newer file comes in mid-upload and replaces the drafts');
  A5.puts[0].done(); await wait(700);
  var n5 = noteOf(p, 'n7');
  ok(n5.files['3'] === 'data/attachments/note-n7-3.png' && n5.files['1'] === FILES[1] && /\[Image uploaded 3\]/.test(n5.text), 'writing 5 · the finished upload\'s link still reaches writing.json, and the older links stay');

  // 6 · the image is added without the server: the original waits in this browser; once it reaches data/attachments/ the draft links it
  A5.where = 'browser'; dropImage(p); await wait(50); A5.puts[1].done(); await wait(1200);
  var n6 = noteOf(p, 'n7');
  ok(n6.images['4'] && !n6.files['4'], 'writing 6 · without the server the image is in the draft but has no link yet');
  A5.savedList = [{ name: 'note-n7-4.png', file: 'data/attachments/note-n7-4.png' }, { name: 'note-zz-1.png', file: 'data/attachments/note-zz-1.png' }];   // flush marks them before it says so
  A5.flushed.forEach(function (fn) { fn('inspo-i1.png', 'data/attachments/inspo-i1.png'); fn('note-zz-1.png', 'data/attachments/note-zz-1.png'); fn('note-n7-4.png', 'data/attachments/note-n7-4.png'); });
  await wait(1200);
  ok(noteOf(p, 'n7').files['4'] === 'data/attachments/note-n7-4.png', 'writing 6 · when the original is written to data/attachments/ while the page is open, the draft links it');
  ok(p.disk['writing.json'].notes.length === 2 && !noteOf(p, 'zz'), 'writing 6 · an original of another kind, or of a draft that is not here, changes nothing');

  // 7 · it reached the disk while another page was open (every page writes waiting originals): linked when the Writing page opens
  var A7 = fakeAttach('disk'); var d7 = draft('n7'); d7.images['5'] = 'data:image/png;base64,CCCC'; d7.text += '[Image uploaded 5]\n';
  A7.savedList = [{ name: 'note-n7-5.png', file: 'data/attachments/note-n7-5.png' }, { name: 'note-n7-1.webp', file: 'data/attachments/note-n7-1.webp' }, { name: 'note-n7-9.png', file: 'data/attachments/note-n7-9.png' }, { name: 'note-zz-1.png', file: 'data/attachments/note-zz-1.png' }];
  p = page('studio/writing-viewer.html', { 'writing.json': stamp({ activeId: 'n7', notes: [d7] }) }, { attach: A7 }); await wait(1000);
  var n7b = noteOf(p, 'n7');
  ok(n7b && n7b.files['5'] === 'data/attachments/note-n7-5.png', 'writing 7 · an original written while another page was open is linked when the Writing page opens');
  ok(n7b.files['1'] === FILES[1] && !n7b.files['9'] && p.disk['writing.json'].notes.length === 1, 'writing 7 · an existing link is never replaced, and an image the draft does not have is not linked');
  ok(p.notes.some(function (x) { return x === 'writing.json: linked the original of image 5 in "Launch notes"'; }), 'writing 7 · the write says what it did in the change log');

  // 8 · the original is announced before the first pull finishes (a slow read): the link waits for the file, so the newer file is never written over
  var A8 = fakeAttach('disk'); var old8 = draft('n7', { text: '# Launch notes\n\nOld text in this browser\n[Image uploaded 5]\n' }); old8.images['5'] = 'data:image/png;base64,CCCC';
  var new8 = copy(old8); new8.text = '# Launch notes\n\nRewritten by an agent\n[Image uploaded 5]\n';
  A8.savedList = [{ name: 'note-n7-5.png', file: 'data/attachments/note-n7-5.png' }];
  var local8 = {}; local8[WKEY] = JSON.stringify({ activeId: 'n7', notes: [old8] }); local8['marathon.sync.meta'] = JSON.stringify({ 'writing.json': { updatedAt: new Date(Date.now() - 7200000).toISOString() } });
  p = page('studio/writing-viewer.html', { 'writing.json': stamp({ activeId: 'n7', notes: [new8] }) }, { attach: A8, local: local8, slowGet: { 'writing.json': 600 } });
  A8.flushed.forEach(function (fn) { fn('note-n7-5.png', 'data/attachments/note-n7-5.png'); });   // the page's own 3-second flush, landing first
  await wait(1600);
  var n8 = noteOf(p, 'n7');
  ok(/Rewritten by an agent/.test(n8.text) && /Rewritten by an agent/.test(p.run('library').notes[0].text), 'writing 8 · an original announced before the first pull does not put the older browser copy over the newer file');
  ok(n8.files['5'] === 'data/attachments/note-n7-5.png', 'writing 8 · it is linked right after the file is in');

  // 9 · Duplicate while the original still waits in the browser: the copy shows the same image and gets the same link
  var A9 = fakeAttach('browser');
  p = page('studio/writing-viewer.html', { 'writing.json': stamp({ activeId: 'n7', notes: [draft('n7')] }) }, { attach: A9 }); await wait(120);
  dropImage(p); await wait(50); A9.puts[0].done(); await wait(100);
  p.run('duplicateActiveNote()'); await wait(1200);
  var copy9 = p.disk['writing.json'].notes.filter(function (n) { return n.id !== 'n7'; })[0];
  ok(copy9 && copy9.images['3'] && !copy9.files['3'], 'writing 9 · a copy made while image 3 waits in the browser has the image, no link yet');
  A9.savedList = [{ name: 'note-n7-3.png', file: 'data/attachments/note-n7-3.png' }];
  A9.flushed.forEach(function (fn) { fn('note-n7-3.png', 'data/attachments/note-n7-3.png'); }); await wait(1200);
  ok(noteOf(p, 'n7').files['3'] === 'data/attachments/note-n7-3.png' && noteOf(p, copy9.id).files['3'] === 'data/attachments/note-n7-3.png', 'writing 9 · when the original reaches the disk, the draft and its copy are both linked');

  // 10 · the tab was hidden (polls pause) while an agent rewrote the draft and Home wrote the original: back to the tab, pull first, then link
  var A10 = fakeAttach('disk'); var d10 = draft('n7'); d10.images['5'] = 'data:image/png;base64,CCCC'; d10.text += '[Image uploaded 5]\n';
  p = page('studio/writing-viewer.html', { 'writing.json': stamp({ activeId: 'n7', notes: [d10] }) }, { attach: A10 }); await wait(300);
  p.doc.visibilityState = 'hidden';
  var agent10 = copy(p.disk['writing.json']); agent10.notes[0].text = '# Launch notes\n\nRewritten by an agent while the tab was hidden\n[Image uploaded 5]\n'; agent10.updatedAt = new Date(Date.now() + 1000).toISOString(); p.disk['writing.json'] = agent10;
  A10.savedList = [{ name: 'note-n7-5.png', file: 'data/attachments/note-n7-5.png' }];
  p.doc.visibilityState = 'visible'; p.fire('visibilitychange'); await wait(1200);
  var n10 = noteOf(p, 'n7');
  ok(/while the tab was hidden/.test(n10.text) && /while the tab was hidden/.test(p.run('library').notes[0].text), 'writing 10 · back to a hidden tab: the agent\'s newer text stays');
  ok(n10.files['5'] === 'data/attachments/note-n7-5.png', 'writing 10 · and the original is linked on top of it');

  // 11 · the first pull fails (a read error): the copy here may be old, so nothing is linked on it and nothing is written over the file
  var A11 = fakeAttach('disk'); A11.savedList = [{ name: 'note-n7-5.png', file: 'data/attachments/note-n7-5.png' }];
  p = page('studio/writing-viewer.html', { 'writing.json': stamp({ activeId: 'n7', notes: [copy(new8)] }) }, { attach: A11, local: local8, failGet: { 'writing.json': 1 } }); await wait(500);
  A11.flushed.forEach(function (fn) { fn('note-n7-5.png', 'data/attachments/note-n7-5.png'); }); p.fire('visibilitychange'); await wait(1200);
  ok(/Rewritten by an agent/.test(p.disk['writing.json'].notes[0].text) && p.puts.indexOf('writing.json') < 0, 'writing 11 · after a failed first pull nothing is linked, so the older copy here is not written over the file');

  // 12 · a title with — ’ and an emoji: two originals linked in one save, one log line naming both, and the next edit still saves
  var A12 = fakeAttach('disk'); var d12 = draft('n7', { text: '# Launch day — notes ’✓\n\n[Image uploaded 5]\n[Image uploaded 6]\n' }); d12.images['5'] = 'data:image/png;base64,CCCC'; d12.images['6'] = 'data:image/png;base64,DDDD';
  A12.savedList = [{ name: 'note-n7-5.png', file: 'data/attachments/note-n7-5.png' }, { name: 'note-n7-6.png', file: 'data/attachments/note-n7-6.png' }];
  p = page('studio/writing-viewer.html', { 'writing.json': stamp({ activeId: 'n7', notes: [d12] }) }, { attach: A12 }); await wait(1000);
  var n12 = noteOf(p, 'n7');
  ok(n12.files['5'] === 'data/attachments/note-n7-5.png' && n12.files['6'] === 'data/attachments/note-n7-6.png', 'writing 12 · a title with — ’ ✓: both originals reach the file');
  ok(p.notes.indexOf('writing.json: linked the originals of image 5 in "Launch day — notes ’✓", image 6 in "Launch day — notes ’✓"') >= 0, 'writing 12 · one change-log line names both, the title intact');
  p.run("document.querySelector('#writingInput').value += 'Typed after.\\n'; refresh();"); await wait(700);
  ok(/Typed after/.test(noteOf(p, 'n7').text), 'writing 12 · the next edit still saves');

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
    wf.notes[0].images = { 1: 'data:image/png;base64,AAAA', 2: 'data:image/png;base64,BBBB' }; delete wf.notes[0].files; fs.writeFileSync(path.join(D, 'writing.json'), JSON.stringify(wf));   // image 1 is on disk, 2 only in a browser
    fs.mkdirSync(path.join(D, 'attachments')); ['note-' + nid + '-1.png', 'note-gone-1.png'].forEach(function (f) { fs.writeFileSync(path.join(D, 'attachments', f), 'x'); });
    doc = solo(['doctor']);
  } finally { fs.rmSync(D, { recursive: true, force: true }); }   // before the checks: a failing ok() exits on the spot
  var safe = (doc.match(/nothing references \(safe to delete\): ([^\n]*)/) || [])[1] || '';
  ok(nid && safe.indexOf('note-' + nid + '-1.png') < 0 && /not linked to their draft yet \(not safe to delete/.test(doc) && doc.indexOf('note-' + nid + '-1.png') > 0, 'doctor · the original of a draft without its link is listed as not linked yet, not safe to delete');
  var only = (doc.match(/only in a browser[^\n]*/) || [''])[0];
  ok(only.indexOf('[' + nid + '] image 2') > 0 && only.indexOf('image 1') < 0, 'doctor · a draft image whose original is only in a browser is named, so an agent knows to ask');
  ok(safe.indexOf('note-gone-1.png') >= 0, 'doctor · an image whose draft is gone is still safe to delete');

  /* ================= core/attach.js ================= */
  // the other half of 6 and 7: an original that waited in the browser is written once a connection appears, announced, and remembered
  var onDisk = false, written = [], heard = [], syncOn = [], clock = Date.now(), refuse = {};
  var actx = { console: console, setTimeout: function (f) { setImmediate(f); return 0; }, Promise: Promise, indexedDB: fakeIDB(), Date: { now: function () { return clock; } },   // timers run at once; the clock is the test's
    Sync: { on: function (fn) { syncOn.push(fn); }, attachmentsAvailable: function () { return onDisk; }, saveAttachment: function (name) { written.push(name); return Promise.resolve(refuse[name] ? '' : 'data/attachments/' + name); } } };
  actx.window = actx; vm.createContext(actx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/attach.js'), 'utf8'), actx, { filename: 'core/attach.js' });
  var At = actx.Attach; At.onFlushed(function (n, r) { heard.push(n + ' → ' + r); });
  var r1 = await At.put('note-n7-6.png', 'data:image/png;base64,AAAA');
  ok(r1.where === 'browser' && !r1.file && (await At.saved('note-')).length === 0, 'attach · without a connection the original waits in this browser, not yet listed as saved');
  onDisk = true; syncOn.forEach(function (fn) { fn('wrote', { file: 'writing.json' }); }); await wait(50);   // the server is back: the tab's next write gets through
  ok(written[0] === 'note-n7-6.png' && heard[0] === 'note-n7-6.png → data/attachments/note-n7-6.png', 'attach · the next write that gets through writes it to data/attachments/ and announces it (no reload needed)');
  var sv = await At.saved('note-');
  ok(sv.length === 1 && sv[0].name === 'note-n7-6.png' && sv[0].file === 'data/attachments/note-n7-6.png', 'attach · saved() lists it for a page that opens later');
  ok((await At.saved(function (k) { return k.indexOf('note-n7-6.') === 0; })).length === 1 && (await At.saved(function (k) { return k.indexOf('note-n7-7.') === 0; })).length === 0, 'attach · saved() takes the name test the Writing page passes');
  syncOn.forEach(function (fn) { fn('wrote', { file: 'writing.json' }); }); await wait(50);
  ok((await At.saved('inspo-')).length === 0 && (await At.flush()) === 0 && written.length === 1, 'attach · saved() keeps to the prefix asked for; later writes and flushes write nothing again');
  // an original that never saves (a disk error): retried after a write at most once a minute, not on every edit; one that is not data is never sent
  onDisk = false; await At.put('note-n7-8.png', 'data:image/png;base64,EEEE'); await At.put('note-n7-9.png', 'data:'); refuse['note-n7-8.png'] = 1; onDisk = true; clock += 61000;
  var wrote = function () { syncOn.forEach(function (fn) { fn('wrote', { file: 'writing.json' }); }); return wait(50); };
  await wrote(); var tries = written.filter(function (x) { return x === 'note-n7-8.png'; }).length;
  clock += 10000; await wrote(); await wrote();
  ok(tries === 1 && written.filter(function (x) { return x === 'note-n7-8.png'; }).length === 1, 'attach · a failing original is retried once, then not again within the minute');
  clock += 61000; await wrote();
  ok(written.filter(function (x) { return x === 'note-n7-8.png'; }).length === 2 && written.indexOf('note-n7-9.png') < 0, 'attach · a minute later it is retried; an entry that is not image data is never sent');

  /* ================= serve.js ================= */
  // the other half of 12: the server decodes the note the page sends percent-encoded, and keeps an older page's plain note as it came
  var net = require('net'), http = require('http');
  var port = await new Promise(function (res) { var s = net.createServer(); s.listen(0, '127.0.0.1', function () { var p0 = s.address().port; s.close(function () { res(p0); }); }); });
  var SD = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-keep-srv-')); var srv = null; var logged = [];
  function putTo(file, body, note) { return new Promise(function (res, rej) { var rq = http.request({ host: '127.0.0.1', port: port, path: '/api/data/' + file, method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Marathon-Source': 'ui', 'X-Marathon-Note': note } }, function (r) { r.resume(); r.on('end', function () { res(r.statusCode); }); }); rq.on('error', rej); rq.end(JSON.stringify(body)); }); }
  try {
    srv = cp.spawn(process.execPath, [path.join(ROOT, 'serve.js'), '--port', String(port), '--data', SD], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error('serve.js did not start')); }, 8000); srv.stdout.on('data', function (b) { if (/Solo Ops/.test(String(b))) { clearTimeout(t); res(); } }); });
    await putTo('writing.json', stamp({ activeId: 'n1', notes: [{ id: 'n1', text: '# One' }] }), 'first');
    await putTo('writing.json', stamp({ activeId: 'n1', notes: [{ id: 'n1', text: '# Two' }] }), encodeURIComponent('linked the original of image 2 in "Launch day — notes ’✓"'));
    await putTo('writing.json', stamp({ activeId: 'n1', notes: [{ id: 'n1', text: '# Three' }] }), 'theme: 100% plain');
    logged = fs.readFileSync(path.join(SD, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(function (l) { return JSON.parse(l).note; });
  } finally { if (srv) srv.kill(); fs.rmSync(SD, { recursive: true, force: true }); }
  ok(logged.indexOf('linked the original of image 2 in "Launch day — notes ’✓"') >= 0, 'serve · a percent-encoded note is logged as written, — ’ ✓ intact');
  ok(logged.indexOf('theme: 100% plain') >= 0, 'serve · an older page\'s plain note (with a %) is logged as it came');

  console.log('\n' + passed + ' passed');
  process.exit(0);
})().catch(function (e) { console.error(e); process.exit(1); });
