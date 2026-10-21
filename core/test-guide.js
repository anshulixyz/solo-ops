#!/usr/bin/env node
/* core/test-guide.js — the Guide, end to end, in Node (zero dependencies). Invented content only.
   1. Pages: each page's real scripts (read from its HTML) run in a vm with a small DOM shim, a fixed clock and the
      sample project's data. On every page × mode (files / chat) × state (empty / sample / an item open) every prompt
      the page offers is copied through Guide.copyPrompt: no {{token}} left, nothing undefined, the right blanks, and a
      prompt that needs an open item never copies empty context (it says what to open instead).
   2. Reply: for every prompt whose chat answer is command lines, an answer shaped the way ChatGPT and Claude write
      them runs through the Guide's own path (Apply.reply: preview units → apply the ticked ones) and must make the
      change the prompt asked for; preview and apply agree; a set of messy answers and refusals behave.
   3. CLI: every `node solo.js …` line a files-mode prompt or slash command names runs in a scratch copy (sandboxed HOME,
      scratch data) and must exit 0 without leaving a flag unread; the few that touch the outside world are only
      checked to exist.
   Run: node core/test-guide.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var passed = 0, fails = 0; function ok(c, m) { if (c) passed++; else { fails++; console.error('✗ ' + m); } }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---- scratch data: the sample project, a take with words, a fresh empty folder ---- */
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-guide-')); var D = path.join(TMP, 'data'); var EMPTY = path.join(TMP, 'empty'); var HOME = path.join(TMP, 'home');
[D, EMPTY, HOME].forEach(function (d) { fs.mkdirSync(d, { recursive: true }); });
function solo(args, data) { return cp.spawnSync(process.execPath, [path.join(ROOT, 'solo.js')].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { SOLO_DATA: data || D, HOME: HOME }) }); }
solo(['template', 'all']);
fs.writeFileSync(path.join(D, 'videos.json'), JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), activeId: 'v1', videos: [{ id: 'v1', title: 'Demo take', status: 'transcribed', sources: [{ file: path.join(TMP, 'take.mov'), duration: 20, fps: 30, width: 1280, height: 720 }], transcript: { engine: 'import', granularity: 'word', words: 12 }, phrases: [{ s: 0.5, e: 2.1, t: 'So um this is the demo.' }, { s: 3.4, e: 6.0, t: 'Here is what changed this week.' }], edl: [], createdAt: Date.now(), updatedAt: Date.now() }] }, null, 2));
function rd(dir, n) { try { return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch (e) { return null; } }

/* ---- a page in a vm ---- */
var FIXED = (function () { var d = new Date(); d.setHours(10, 0, 0, 0); return d.getTime(); })();   // 10:00 today: the morning's Start with one
function FDate() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(Date, [null].concat(a)))() : new Date(FIXED); }
FDate.now = function () { return FIXED; }; FDate.UTC = Date.UTC; FDate.parse = Date.parse; FDate.prototype = Date.prototype;
function el(tag) {
  return { tagName: String(tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [], className: '', innerHTML: '', textContent: '', value: '',
    classList: { _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; }, contains: function (c) { return !!this._s[c]; }, toggle: function () {} },
    setAttribute: function () {}, getAttribute: function () { return null; }, appendChild: function (c) { this.children.push(c); return c; }, remove: function () {}, insertBefore: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, addEventListener: function () {}, removeEventListener: function () {}, focus: function () {}, blur: function () {}, click: function () {}, closest: function () { return null; }, scrollIntoView: function () {} };
}
var PAGES = { home: 'index.html', overview: 'overview.html', about: 'about.html', board: 'runway/marathon-board.html', calendar: 'calendar/calendar.html', social: 'social/social-board.html', streak: 'social/social-calendar.html', scripts: 'studio/script-viewer.html', writing: 'studio/writing-viewer.html', video: 'studio/video.html', inspo: 'inspo/inspiration.html' };
var SKIP = /(theme-boot|theme|palette|nav|home|share-card|attach|inspo-quick|datepick)\.js$|\/(main|view|social-main|social-view|social-calendar-main|social-calendar-view|social-image|social-image-store|social-assets-store|script-viewer|writing-viewer|video-view|video-main|calendar-view|calendar-main|inspo-main)\.js$/;
function page(key, opts) {
  opts = opts || {}; var rel = PAGES[key]; var dir = opts.data || D;
  var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  var srcs = (html.match(/<script src="[^"]+"/g) || []).map(function (s) { return path.normalize(path.join(path.dirname(rel), s.slice(13, -1))); });
  var ls = {}; Object.keys(opts.local || {}).forEach(function (k) { ls[k] = opts.local[k]; });
  var clip = [];
  function res(status, body) { return Promise.resolve({ status: status, ok: status >= 200 && status < 300, json: function () { return Promise.resolve(body); } }); }
  var doc = el('document'); doc.readyState = 'complete'; doc.visibilityState = 'visible'; doc.body = el('body'); doc.head = el('head'); doc.documentElement = el('html'); doc.createElement = el; doc.getElementById = function () { return null; };
  doc.querySelector = function (s) { if (s === '.detail-title' && opts.postTitle) { var t = el('input'); t.value = opts.postTitle; return t; } return null; };
  var ctx = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () { return 0; }, clearInterval: function () {}, URLSearchParams: URLSearchParams, Blob: Blob, Promise: Promise, Date: FDate,
    URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
    localStorage: { getItem: function (k) { return k in ls ? ls[k] : null; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } },
    location: { protocol: 'http:', pathname: '/' + rel, search: opts.search || '', host: 'localhost:9', reload: function () { ctx.__reloaded = (ctx.__reloaded || 0) + 1; } },
    navigator: { platform: 'MacIntel', clipboard: { writeText: function (t) { clip.push(t); return Promise.resolve(); } } },
    document: doc, confirm: function () { return true; }, alert: function () {}, prompt: function () {},
    fetch: function (url, o) {
      if (url === '/api/ping') return res(200, { marathon: true, folder: '/tmp/solo-folder' });
      var m = String(url).match(/^\/api\/data\/([^?]+)/);
      if (m && (!o || !o.method || o.method === 'GET')) { var nm = decodeURIComponent(m[1]); if (opts.files && opts.files[nm]) return res(200, JSON.parse(JSON.stringify(opts.files[nm]))); var f = path.join(dir, nm); return fs.existsSync(f) ? res(200, JSON.parse(fs.readFileSync(f, 'utf8'))) : res(404, null); }   // opts.files: what the page before saved (a hand-off)
      if (m) return res(200, { ok: true });   // never write the scratch folder from the vm
      return res(404, null);
    } };
  ctx.window = ctx; ctx.global = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  srcs.forEach(function (f) {
    if (SKIP.test(f)) return;
    if (/context\.js$/.test(f) && opts.library) vm.runInContext('var library = ' + JSON.stringify(opts.library) + ';', ctx);   // the viewers' open library (a page global)
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  });
  if (opts.seed !== false && dir === D) seed(ctx);
  holds(key, ctx);
  return { W: ctx, ls: ls, clip: clip };
}
// The files each real page saves itself (its own main script registers them, and the vm skips those scripts):
// core/apply.js applies a reply line only on a page that saves that line's file.
function filesFrom(W) {   // the files as a page that saved everything it holds would leave them (the vm never writes the scratch folder)
  var C = W.Config, S = W.Store, w = C.ws(), at = new Date(FIXED + 60000).toISOString(), out = {};
  C.boards(w.id).forEach(function (b) { var t = S.getJSON(C.boardKey(b.id, w.id), null); if (t) out[C.boardFile(b.id, w.id)] = { version: 1, updatedAt: at, projects: S.getJSON(C.boardKey(b.id, w.id) + '.projects', []) || [], tasks: t }; });
  var po = S.getJSON(C.key('social', w.id), null); if (po) out[C.file('social', w.id)] = { version: 1, updatedAt: at, posts: po };
  ['scripts', 'writing'].forEach(function (a) { var l = S.getJSON(C.key(a, w.id), null); if (l) out[C.file(a, w.id)] = Object.assign({ version: 1, updatedAt: at }, l); });
  var ins = S.getJSON('marathon.inspiration', null); if (ins) out['inspiration.json'] = { version: 1, updatedAt: at, items: ins.items || [] };
  return out;
}
function holds(key, W) {
  var C = W.Config, w = C.ws(); if (!W.Sync || !W.Sync.specs) return;
  var boards = C.boards(w.id).map(function (b) { return C.boardFile(b.id, w.id); });
  var F = { home: boards.concat(['inspiration.json']), board: W.Model ? [C.boardFile(W.Model.BOARD, w.id)] : [], calendar: boards.concat([C.file('social', w.id)]),
    social: [C.file('social', w.id)], streak: [C.file('social', w.id)], scripts: [C.file('scripts', w.id)], writing: [C.file('writing', w.id)], video: [C.file('videos', w.id)], inspo: ['inspiration.json'], overview: [], about: [] }[key] || [];
  F.forEach(function (f) { W.Sync.specs.push({ file: f, key: 'test:' + f, read: function () { return {}; }, apply: function () {} }); });
}
function seed(W) {   // the sample project into the page's store, as the first pull would
  var C = W.Config, S = W.Store, w = C.ws();
  C.boards(w.id).forEach(function (b) { var f = rd(D, C.boardFile(b.id, w.id)); if (f) S.setJSON(C.boardKey(b.id, w.id), f.tasks, { silent: true }); });
  var so = rd(D, C.file('social', w.id)); if (so) S.setJSON(C.key('social', w.id), so.posts, { silent: true });
  ['scripts', 'writing', 'videos'].forEach(function (a) { var f = rd(D, C.file(a, w.id)); if (f) { delete f.version; delete f.updatedAt; S.setJSON(C.key(a, w.id), f, { silent: true }); } });
  var ins = rd(D, 'inspiration.json'); if (ins) S.setJSON('marathon.inspiration', { items: ins.items }, { silent: true });
  if (W.InspoModel) { W.InspoModel.init(); W.InspoModel._inited = true; }
  if (W.VideoModel) W.VideoModel.init();   // the Video page does this when it starts (studio/video-main.js)
}
var EL = { querySelector: function () { return null; }, classList: { add: function () {}, remove: function () {} }, textContent: '' };

(async function () {
  var P = require(path.join(ROOT, 'core', 'prompts.js'));

  /* ================= 1 · every prompt on every page, both modes, three states ================= */
  var LIB = { scripts: { activeId: 's1', scripts: (rd(D, 'scripts.json') || {}).scripts }, writing: { activeId: 'n1', notes: (rd(D, 'writing.json') || {}).notes } };
  var states = ['empty', 'sample', 'open'];
  var copied = 0;
  for (var pk in PAGES) {
    for (var mi = 0; mi < 2; mi++) {
      var mode = mi ? 'chat' : 'files';
      for (var si = 0; si < states.length; si++) {
        var st = states[si];
        var opts = { local: { 'marathon.guide.mode': mode }, data: st === 'empty' ? EMPTY : D };
        if (st === 'open' && (pk === 'scripts' || pk === 'writing')) opts.library = LIB[pk];
        if (st === 'open' && (pk === 'social' || pk === 'streak')) opts.postTitle = (rd(D, 'social.json').posts[0] || {}).title;
        var p = page(pk, opts); await wait(30);
        if (st === 'open' && pk === 'board' && p.W.Model) { var t1 = p.W.Model.getState().filter(function (t) { return t.id === 't3'; })[0]; if (t1) p.W.Model.update('t3', { notes: 'opened' }); }   // the last task touched
        var G = p.W.Guide; ok(G && G._t, pk + ': the Guide loads (' + mode + ', ' + st + ')'); if (!G || !G._t) continue;
        ok(G._t.page() === pk, pk + ': the Guide knows which page it is on (got ' + G._t.page() + ')');
        var list = G._t.prompts().filter(function (x) { return x.pages.indexOf(pk) >= 0 || G._t.startSlugs().indexOf(x.slug) >= 0; });
        if (['home', 'board', 'calendar', 'social', 'scripts', 'writing', 'video', 'inspo'].indexOf(pk) >= 0) ok(list.length >= 2, pk + ': at least two prompts on this page (' + mode + ', ' + st + ')');
        var fp = G._t.forPage(pk);
        if (st === 'empty' && ['home', 'board', 'calendar'].indexOf(pk) >= 0) ok(fp.every(function (sl) { return P.EMPTY_OK.indexOf(sl) >= 0; }), pk + ': on an empty project For this page offers only what works without tasks: ' + fp.join(', '));
        for (var li = 0; li < list.length; li++) {
          var x = list[li]; p.clip.length = 0;
          var need = G._t.needs(x.slug); var r = await G.copyPrompt(x.slug, EL); var text = p.clip[0] || '';
          if (need) { ok(!r && !text, pk + '/' + mode + '/' + st + ': ' + x.slug + ' needs "' + need + '" and copies nothing without it'); continue; }
          copied++;
          ok(r && text.length > 40, pk + '/' + mode + '/' + st + ': ' + x.slug + ' copies a prompt');
          ok(!/\{\{\w+\}\}/.test(text), pk + '/' + mode + '/' + st + ': ' + x.slug + ' left a token: ' + (text.match(/\{\{\w+\}\}/g) || []).join(','));
          ok(!/\bundefined\b|\[object |\bNaN\b/.test(text), pk + '/' + mode + '/' + st + ': ' + x.slug + ' copies undefined/NaN/[object]');
          var want = P.blanks(x.p).length; ok(P.blanks(text).length === want, pk + '/' + mode + '/' + st + ': ' + x.slug + ' blanks ' + P.blanks(text).join('|') + ' (want ' + want + ')');
          if (mode === 'chat' && x.reply === 'lines') ok(text.indexOf('HOW TO REPLY') > 0, pk + '/chat: ' + x.slug + ' asks for lines but carries no reply format');
          if (mode === 'chat' && x.reply !== 'lines') ok(!/format at the end of this message/.test(text) || text.indexOf('HOW TO REPLY') > 0, pk + '/chat: ' + x.slug + ' promises a format it never gives');
          if (mode === 'files' && /\bnode solo\.js\s+(add|done|start|step|note|social|scripts|notes|inspo|import|at|due|later|move|pri|tag|video cut|video post|config)\b/.test(text)) ok(text.indexOf('--as agent') > 0, pk + '/files: ' + x.slug + ' writes without --as agent in the preamble');
        }
      }
    }
  }
  ok(copied > 400, 'copied ' + copied + ' prompts across pages, modes and states');

  // edits, hidden prompts, removals: what the panel keeps in marathon.prompts (↔ data/prompts.json)
  var edited = JSON.stringify({ custom: [], overrides: { 'Daily standup': { p: 'MY OWN STANDUP {{head}}', mode: 'files' } }, hidden: ['Bring in my work'], removed: [], shown: [] });
  var pf = page('home', { local: { 'marathon.guide.mode': 'files', 'marathon.prompts': edited }, data: EMPTY }); await wait(20);
  var pc = page('home', { local: { 'marathon.guide.mode': 'chat', 'marathon.prompts': edited }, data: EMPTY }); await wait(20);
  var stF = pf.W.Guide._t.prompts().filter(function (x) { return x.slug === 'standup'; })[0]; var stC = pc.W.Guide._t.prompts().filter(function (x) { return x.slug === 'standup'; })[0];
  ok(stF && /MY OWN STANDUP/.test(stF.p) && stF.overridden, 'an edit made in files mode is used in files mode');
  ok(stC && !/MY OWN STANDUP/.test(stC.p) && /HOW TO REPLY/.test(stC.p), 'and the chat mode keeps its own built-in text (an edit belongs to its mode)');
  ok(pf.W.Guide._t.startSlugs().indexOf('bring-in') < 0 && !pf.W.Guide._t.prompts().some(function (x) { return x.slug === 'bring-in'; }), 'a hidden prompt is never offered, not even in Start here');
  pf.clip.length = 0; ok(!(await pf.W.Guide.copyPrompt('bring-in', EL)) && !pf.clip.length, 'copying a hidden prompt copies nothing');
  var pb = page('board', { local: { 'marathon.guide.mode': 'chat' } }); await wait(20);
  ok(/Open or start a task first/.test(pb.W.Guide._t.needs('stuck')) || pb.W.Guide._t.needs('stuck') === '', 'stuck says what it needs, or has a task to work on');
  var ps0 = page('scripts', { local: { 'marathon.guide.mode': 'chat' } }); await wait(20);
  ok(/Open a script, draft or post first/.test(ps0.W.Guide._t.needs('improve')), 'Improve with nothing open says to open a script, draft or post first');
  ok(page('overview', {}).W.Guide._t.about.overview && page('streak', {}).W.Guide._t.page() === 'streak', 'Overview and Streak have their own help text and page');

  /* ================= 2 · Reply: realistic answers through the Guide's own path ================= */
  var F = [
    { slug: 'standup', pg: 'home', reply: 'Nice work yesterday. Here is today, in order:\n1. Finish the pitch (done = it is in the README)\n2. Start the landing page\n\n```\ndone [t1]\nstart t2\nnote t2 "Start with the hero copy"\nstep t2 "Write the headline"\n```', expect: function (s) { return s.task('t1').col === 'done' && s.task('t2').col === 'doing' && /hero copy/.test(s.task('t2').notes) && s.task('t2').checklist.some(function (c) { return c.text === 'Write the headline'; }); } },
    { slug: 'start-day', pg: 'home', reply: 'Your calendar has one meeting today. Plan:\n- the landing page\n- the demo\n\n```bash\nadd "Call with Sam" --at today 15:00 --until 15:30 --tags meeting --ext gcal:sam1\n```\nDoes that hold?', expect: function (s) { var t = s.byTitle('Call with Sam'); return t && /T15:00$/.test(t.at) && t.ext === 'gcal:sam1' && s.count === s.before + 1; } },
    { slug: 'now', pg: 'board', reply: 'You have 25 minutes. Smallest step: the hero headline.\n```\nstart t2\n```', expect: function (s) { return s.task('t2').col === 'doing'; } },
    { slug: 'wrap', pg: 'home', reply: 'Here is what I see:\n- You finished the pitch\n- The signup bug fix is not on the board\n\n```\n$ node solo.js done t1\nnode solo.js note t1 "Shipped v2 of the pitch"\nadd "Fix the signup bug" --col done\nlater t6\n```', expect: function (s) { return s.task('t1').col === 'done' && s.byTitle('Fix the signup bug').col === 'done' && s.task('t6').col === 'later'; } },
    { slug: 'stuck', pg: 'board', open: true, reply: 'Option (a): split it.\n```\nstep t3 "Write the 3 lines I will say"\nnote t3 "Blocked on the mic"\n```', expect: function (s) { return s.task('t3').checklist.some(function (c) { return /3 lines/.test(c.text); }); } },
    { slug: 'second-opinion', pg: 'home', reply: '(1) The pitch is done but still says draft. (2) Next: the landing page. (3) Leave the bucket alone.\n```\nnote t1 "Remove the draft label"\n```', expect: function (s) { return /draft label/.test(s.task('t1').notes); } },
    { slug: 'week', pg: 'home', carry: true, reply: 'Summary… Three moves:\n```\npri t2 high\nlater t10\nsocial copy p1 "Why I am building this: one folder, your AI."\n```', expect: function (s) { return s.task('t2').pri === 'high' && s.task('t10').col === 'later' && /one folder/.test(s.post('p1').copy); } },
    { slug: 'plan-week', pg: 'home', reply: 'This week is for the landing page.\n```\nstart t3\nlater t11\nstep t2 "Deploy to the static host"\n```', expect: function (s) { return s.task('t3').col === 'doing' && s.task('t11').col === 'later'; } },
    { slug: 'close-week', pg: 'home', reply: 'Shipped: the cadence.\n```\ndone t7\nnote t7 "Kept it up 5 days"\n```', expect: function (s) { return s.task('t7').col === 'done'; } },
    { slug: 'overcommitted', pg: 'board', carry: true, reply: 'At this pace the paid tier will not happen.\n```\nlater t10\nsocial move p4 +7d 09:00\n```', expect: function (s) { return s.task('t10').col === 'later' && s.post('p4').datetime.slice(11) === '09:00'; } },
    { slug: 'plan-project', pg: 'home', carry: true, reply: 'Here is the plan.\n```\nadd "Pick a domain" --pri high --steps "List 5 names|Check the price" --tags launch\nsocial add "Building in public: day 1" --at +2d 09:00 --type update --copy "Day 1: the plan."\n```', expect: function (s) { var t = s.byTitle('Pick a domain'); return t && t.checklist.length === 2 && s.postByTitle('Building in public: day 1'); } },
    { slug: 'tasks-from-list', pg: 'board', reply: '```\nadd "Call the accountant" --pri high\nadd "Renew the domain" --due 2026-11-30\n```', expect: function (s) { return s.byTitle('Call the accountant').pri === 'high' && s.byTitle('Renew the domain').due === '2026-11-30'; } },
    { slug: 'steps', pg: 'board', open: true, reply: 'Five steps:\n```\nstep t3 "Pick the mic"\nstep t3 "Record three takes"\n```', expect: function (s) { return s.task('t3').checklist.length >= 2; } },
    { slug: 'cleanup', pg: 'board', reply: '```\nlater t6\ntag t2 +launch\n```', expect: function (s) { return s.task('t6').col === 'later' && s.task('t2').tags.indexOf('launch') >= 0; } },
    { slug: 'cut-scope', pg: 'board', reply: 'Must: landing page. Won\'t: translations.\n```\nlater t11\nbucket t14\npri t2 high\n```', expect: function (s) { return s.task('t14').col === 'bucket' && s.task('t2').pri === 'high'; } },
    { slug: 'capture', pg: 'home', reply: '```\nadd "Email Maya the draft" --tags outreach\nadd "Fix the CSS bug" --pri high\n```', expect: function (s) { return s.byTitle('Email Maya the draft') && s.byTitle('Fix the CSS bug').pri === 'high'; } },
    { slug: 'repurpose', pg: 'scripts', open: true, carry: true, reply: 'Post:\n> It was ugly.\n```\nsocial add "Thread: the ugly first version" --at +1d 09:00 --type thread --copy "1/ It was ugly. 2/ It worked."\n```', expect: function (s) { return s.postByTitle('Thread: the ugly first version'); } },
    { slug: 'script', pg: 'scripts', reply: '```\nscripts add "Why files beat apps"\n```\n```markdown\n# Why files beat apps\n## Hook\nYour tasks are a file.\n## Script\n1. Open the folder.\n```', expect: function (s) { var x = s.scripts().filter(function (y) { return y.title === 'Why files beat apps'; })[0]; return x && /Your tasks are a file/.test(x.text); } },
    { slug: 'draft-posts', pg: 'social', reply: '```\nsocial copy p1 "I am building this because my tasks lived in five apps."\nsocial copy p2 "The ugly first version shipped in a weekend."\n```', expect: function (s) { return /five apps/.test(s.post('p1').copy) && /weekend/.test(s.post('p2').copy); } },
    { slug: 'ship-post', pg: 'social', reply: 'Version A is better.\n```\nsocial add "Shipped: the welcome card" --at +1d 09:00 --type update --copy "New: a blank start that stays blank."\n```', expect: function (s) { return s.postByTitle('Shipped: the welcome card'); } },
    { slug: 'post-ideas', pg: 'social', reply: '```\nsocial add "Idea: the folder is the app" --at +2d 09:00\nsocial add "Idea: one agent, every tool" --at +4d 09:00\n```', expect: function (s) { return s.postByTitle('Idea: the folder is the app') && s.postByTitle('Idea: one agent, every tool'); } },
    { slug: 'assess-inspo', pg: 'inspo', reply: '| item | becomes |\n|---|---|\n| i1 | post |\n```\ninspo tag i1 +launch +structure\ninspo tag i2 +hook\n```', expect: function (s) { return s.inspo('i1').tags.indexOf('structure') >= 0 && s.inspo('i2').tags.indexOf('hook') >= 0; } },
    { slug: 'use-inspo', pg: 'inspo', spawn: true, reply: '```\ninspo use i1 --as task\ninspo use i3 --as post\ninspo use i2 --as script\n```', expect: function (s) { return s.inspo('i1').status === 'used' && s.inspo('i3').status === 'used' && s.inspo('i2').status === 'used' && s.byTitle(s.inspo('i1').title) && s.postByTitle(s.inspo('i3').title) && s.scripts().some(function (x) { return /Hook idea/.test(x.title); }); } },
    { slug: 'bring-in', pg: 'home', reply: 'From Linear, 1 open issue assigned to you:\n```\nadd "Fix the login bug" --col doing --pri high --due 2026-10-28 --ext linear:9f1c --notes "https://linear.app/x/ENG-12"\n```', expect: function (s) { var t = s.byTitle('Fix the login bug'); return t && t.col === 'doing' && t.ext === 'linear:9f1c'; } },
    { slug: 'fill-calendar', pg: 'calendar', reply: '```\nadd "Standup" --at tomorrow 09:00 --until 09:15 --tags meeting\n```', expect: function (s) { var t = s.byTitle('Standup'); return t && /T09:00$/.test(t.at) && /T09:15$/.test(t.until); } },
    { slug: 'plan-today', pg: 'calendar', reply: 'Gaps: 14:00–15:30.\n```\nat t2 today 14:00 --until 15:30\n```', expect: function (s) { return /T14:00$/.test(s.task('t2').at || ''); } },
    { slug: 'overdue', pg: 'calendar', reply: '```\ndue t2 2026-11-05\nlater t4\n```', expect: function (s) { return s.task('t2').due === '2026-11-05' && s.task('t4').col === 'later'; } },
    { slug: 'improve', pg: 'scripts', open: true, reply: 'Tightened:\n```\nscripts set s1\n```\n```markdown\n# My Reel Script\n## Hook\nOne folder. Your AI.\n```', expect: function (s) { return /One folder\. Your AI\./.test(s.script('s1').text); } },
    { slug: 'edit-draft', pg: 'writing', open: true, reply: '```\nnotes set n1\n```\n```\n# The draft I\'m wrestling with\n\n++Shorter now.++\n```', expect: function (s) { return /Shorter now/.test(s.note('n1').text); } },
    { slug: 'cut-take', pg: 'video', reply: 'Slips: "um" at 0.6. The cut keeps the first sentence (1.6 s). Where does it go?\n```\nvideo cut v1 --keep "0.5-2.1"\n```', expect: function (s) { var v = s.take('v1'); return v && (v.edl || []).length === 1; } },
    { slug: 'ten-hooks', pg: 'social', open: true, reply: '1. Stop typing your tasks twice.\n2. …\nTop pick: 1.\n```\nsocial copy p1 "Stop typing your tasks twice. One folder, your AI."\n```', expect: function (s) { return /Stop typing/.test(s.post('p1').copy); } }
  ];
  // prompts whose chat answer is lines must all have a fixture
  P.build({ title: 'Demo', id: 'main', mode: 'chat' }).filter(function (x) { return x.reply === 'lines' && x.c !== 'setup'; }).forEach(function (x) { ok(F.some(function (f) { return f.slug === x.slug; }), 'Reply fixture missing for ' + x.slug); });
  function state(W) {
    var C = W.Config, S = W.Store, w = C.ws();
    var tasks = []; C.boards(w.id).forEach(function (b) { (S.getJSON(C.boardKey(b.id, w.id), []) || []).forEach(function (t) { tasks.push(t); }); });
    var posts = S.getJSON(C.key('social', w.id), []) || [];
    return { tasks: tasks, posts: posts, count: tasks.length,
      task: function (id) { return tasks.filter(function (t) { return t.id === id; })[0] || {}; }, byTitle: function (ti) { return tasks.filter(function (t) { return t.title === ti; })[0]; },
      post: function (id) { return posts.filter(function (x) { return x.id === id; })[0] || {}; }, postByTitle: function (ti) { return posts.filter(function (x) { return x.title === ti; })[0]; },
      scripts: function () { return (S.getJSON(C.key('scripts', w.id), {}) || {}).scripts || []; }, script: function (id) { return this.scripts().filter(function (x) { return x.id === id; })[0] || {}; },
      note: function (id) { return ((S.getJSON(C.key('writing', w.id), {}) || {}).notes || []).filter(function (x) { return x.id === id; })[0] || {}; },
      take: function (id) { return (((S.getJSON(C.key('videos', w.id), {}) || {}).videos) || []).filter(function (x) { return x.id === id; })[0]; },
      inspo: function (id) { return ((S.getJSON('marathon.inspiration', {}) || {}).items || []).filter(function (x) { return x.id === id; })[0] || {}; } };
  }
  function strip(W) { var s = state(W); return JSON.stringify({ t: s.tasks.map(function (t) { return [t.title, t.col, t.pri, t.at || '', t.until || '', t.due || '', (t.checklist || []).length, t.notes || '', (t.tags || []).join()]; }).sort(), p: s.posts.map(function (x) { return [x.title, x.datetime, x.copy, x.status]; }).sort(), s: s.scripts().map(function (x) { return x.text; }).sort() }); }
  for (var fi = 0; fi < F.length; fi++) {
    var f = F[fi];
    var po = { local: { 'marathon.guide.mode': 'chat' } }; if (f.open && f.pg === 'scripts') po.library = LIB.scripts; if (f.open && f.pg === 'writing') po.library = LIB.writing; if (f.open && f.pg === 'social') po.postTitle = 'Why I am building this';
    var A = page(f.pg, po); await wait(10); var before = state(A.W).count;
    var rep = A.W.Apply.reply(f.reply, { ws: 'main' }); var groups = A.W.Guide._t.awayGroups(rep.units);
    var away = rep.units.filter(function (u) { return !u.ok && u.away; }); var here = rep.units.filter(function (u) { return u.ok; });
    ok(rep.units.length > 0 && here.length + away.length === rep.units.length && (!!f.carry === !!away.length), f.slug + ': every line previews as a change here' + (f.carry ? ' or on the page that saves it' : '') + ' (' + rep.units.filter(function (u) { return !u.ok; }).map(function (u) { return u.label + ' · ' + u.reason; }).join(' | ') + ')');
    var res = rep.apply(); var s = state(A.W); s.before = before;
    ok(res.applied.length === here.length && !res.skipped.length, f.slug + ': applied what the preview showed (' + res.skipped.join(' | ') + ')');
    if (f.spawn) { var sg = A.W.Guide._t.awayGroups((res.spawn || []).map(function (sp) { return { ok: false, away: sp.file, text: sp.text }; })); ok(sg.length >= 1, f.slug + ': what another page saves is handed on after Apply (' + sg.map(function (g) { return g.name; }).join(', ') + ')'); groups = A.W.Guide._t.mergeGroups(groups, sg); }
    if (away.length) ok(groups.reduce(function (n, g) { return n + g.texts.length; }, 0) === away.length && away.every(function (u) { return u.label && !/^(social|inspo|scripts|notes) /.test(u.label); }), f.slug + ': every line saved elsewhere is in a Continue group and labelled with what it will do (' + away.map(function (u) { return u.label; }).join(' | ') + ')');
    var ls = A.ls; var prevW = A.W;
    for (var gi = 0; gi < groups.length; gi++) {   // Continue on …: each group on the page that saves it, one after the other, carrying the store along
      var gk = Object.keys(PAGES).filter(function (k) { return PAGES[k] === groups[gi].file; })[0];
      var Tg = page(gk, { local: Object.assign({}, ls), seed: false, files: filesFrom(prevW) }); await wait(10);
      var rt = Tg.W.Apply.reply(groups[gi].texts.join('\n'), { ws: 'main' });
      ok(rt.units.length === groups[gi].texts.length && rt.units.every(function (u) { return u.ok; }), f.slug + ': on ' + gk + ' the carried lines preview as changes (' + rt.units.filter(function (u) { return !u.ok; }).map(function (u) { return u.reason; }).join(' | ') + ')');
      rt.apply(); ls = Tg.ls; prevW = Tg.W; s = state(Tg.W); s.before = before;
    }
    var good = false; try { good = !!f.expect(s); } catch (e) { good = false; } ok(good, f.slug + ': the answer made the change the prompt asked for' + (good ? '' : ' (groups: ' + groups.map(function (g) { return g.name + ': ' + g.texts.join(' / ').slice(0, 160); }).join(' || ') + ')'));
    var B = page(f.pg, po); await wait(10); B.W.Apply.run(f.reply, { ws: 'main' }); ok(strip(A.W) === strip(B.W), f.slug + ': preview + apply and a straight run end in the same state');
  }

  // messy answers: the ways chats really format lines
  var MESSY = [
    ['CRLF line ends', '```\r\ndone t1\r\nstart t2\r\n```', function (s) { return s.task('t1').col === 'done' && s.task('t2').col === 'doing'; }],
    ['smart quotes', '```\nnote t2 “Hero copy first”\n```', function (s) { return /Hero copy first/.test(s.task('t2').notes) && !/“/.test(s.task('t2').notes); }],
    ['numbered command lines', '1. done t1\n2. start t2', function (s) { return s.task('t1').col === 'done' && s.task('t2').col === 'doing'; }],
    ['bulleted command lines', '- done t1\n- start t2', function (s) { return s.task('t1').col === 'done' && s.task('t2').col === 'doing'; }],
    ['[t…] ids as the snapshot shows them', '```\nstart [t2]\npri [t3] high\n```', function (s) { return s.task('t2').col === 'doing' && s.task('t3').pri === 'high'; }],
    ['leftover --ws --as --note', '```\ndone t1 --ws main --as agent --note "from chat"\n```', function (s) { return s.task('t1').col === 'done'; }],
    ['two blocks', '```\ndone t1\n```\nAnd:\n```\nstart t2\n```', function (s) { return s.task('t1').col === 'done' && s.task('t2').col === 'doing'; }],
    ['multi-line quoted copy', '```\nsocial copy p1 "Line one.\nLine two."\n```', function (s) { return s.post('p1').copy === 'Line one.\nLine two.'; }],
    ['steps under an add', '```\nadd "Ship the docs"\n  - [ ] Outline\n  - [ ] Draft\n```', function (s) { var t = s.byTitle('Ship the docs'); return t && t.checklist.length === 2; }],
    ['a plain checklist', '- [ ] Buy a mic (high)\n  - [ ] Compare three', function (s) { var t = s.byTitle('Buy a mic'); return t && t.pri === 'high' && t.checklist.length === 1; }],
    ['curly quotes inside a quoted copy stay as typed', '```\nsocial copy p1 "He said \u201cship it\u201d and I don\u2019t stop."\n```', function (s) { return s.post('p1').copy === 'He said \u201cship it\u201d and I don\u2019t stop.'; }],
    ['apostrophes in unquoted words', '```\nnote t1 Don\u2019t forget Sam\u2019s review\nnote t2 Don\'t skip it\n```', function (s) { return /Don\u2019t forget Sam\u2019s review/.test(s.task('t1').notes) && /Don't skip it/.test(s.task('t2').notes); }],
    ['steps under an add inside a block, without boxes', '```\nadd "Launch post"\n  - outline\n  - record\n```', function (s) { var t = s.byTitle('Launch post'); return t && t.checklist.length === 2; }],
    ['a list item inside a block', '```\n- Buy a tripod\n```', function (s) { return !!s.byTitle('Buy a tripod'); }],
    ['inspo use with the kind and --as agent', '```\ninspo use i1 --as task --ws main --as agent --note "from the inbox"\n```', function (s) { return s.inspo('i1').status === 'used' && !!s.byTitle(s.inspo('i1').title); }, 'home']
  ];
  for (var mj = 0; mj < MESSY.length; mj++) {
    var m = MESSY[mj]; var Am = page(m[3] || 'calendar', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10);
    var rm = Am.W.Apply.reply(m[1], { ws: 'main' }); var rr = rm.apply(); var good2 = false; try { good2 = !!m[2](state(Am.W)); } catch (e) {}
    ok(good2 && !rr.skipped.length, 'messy answer, ' + m[0] + ': applied right (' + rm.units.map(function (u) { return (u.ok ? '+' : '-') + u.label; }).join(' | ') + ')');
  }
  // prose stays prose: bullets and bold outside a block are never tasks
  var Ap = page('home', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10); var cnt0 = state(Ap.W).count;
  var rp = Ap.W.Apply.reply('Summary:\n- **Doing:** Write the one-line pitch (1/4 steps)\n- Posts due: Launch day\n* Overdue: none\n\nShall I go ahead?', { ws: 'main' });
  ok(rp.units.length === 0, 'prose bullets outside a block are not changes (' + rp.units.map(function (u) { return u.label; }).join(' | ') + ')'); rp.apply(); ok(state(Ap.W).count === cnt0, 'and nothing is added');
  // flags without a value are read (--post, --off, --tidy …), and a used item's piece is handed to its page with the id kept
  var Af = page('home', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10);
  var rf = Af.W.Apply.reply('```\ninspo use i2 --post\n```', { ws: 'main' }); var resf = rf.apply();
  var spf = (resf.spawn || [])[0] || {}; var idf = (spf.text || '').match(/--id (p[a-z0-9]+)/);
  ok(rf.units[0] && rf.units[0].ok && /marked as used/.test(rf.units[0].label) && /^inspo make post --id p\S+ --data \S+$/.test(spf.text || '') && idf && state(Af.W).inspo('i2').usedAs.some(function (u) { return u.id === idf[1]; }), 'inspo use --post: the item is marked used with the post\'s id, and the post goes on to the Calendar as data (' + (rf.units[0] ? rf.units[0].label : '') + ')');
  var Acf = page('calendar', { local: Object.assign({}, Af.ls), seed: false, files: filesFrom(Af.W) }); await wait(10); var rmk = Acf.W.Apply.reply(spf.text || '', { ws: 'main' }); rmk.apply();
  ok(idf && state(Acf.W).post(idf[1]).title === state(Af.W).inspo('i2').title && /made from inspiration/.test(rmk.units[0].label), 'and on the Calendar the post is made with that id (' + (rmk.units[0] || {}).label + ')');
  var rmk2 = Acf.W.Apply.reply(spf.text || '', { ws: 'main' });
  ok(rmk2.units.length === 1 && !rmk2.units[0].ok && /already made/.test(rmk2.units[0].reason), 'the same hand-off applied twice says already made, never a second post');
  // the item's own text is data: a fence, a "done t1" line, 40 lines, none of it becomes a command
  var LONG = 'Notes on the launch\n```\ndone t1\n```\n' + Array.apply(null, Array(40)).map(function (_, k) { return 'line ' + k; }).join('\n');
  var lsI = Object.assign({}, Af.ls); var insI = JSON.parse(lsI['marathon.inspiration']); insI.items.push({ id: 'i9', kind: 'note', title: 'Long note', text: LONG, url: '', tags: [], status: 'new', ws: 'main', usedAs: [], createdAt: FIXED, updatedAt: FIXED }); lsI['marathon.inspiration'] = JSON.stringify(insI);
  var Ai = page('inspo', { local: lsI, seed: false }); await wait(10); if (Ai.W.InspoModel) { Ai.W.InspoModel.init(); Ai.W.InspoModel._inited = true; }
  var ri = Ai.W.Apply.reply('```\ninspo use i9 --as script\n```', { ws: 'main' }); var resi = ri.apply(); var lineI = ((resi.spawn || [])[0] || {}).text || '';
  var Asi = page('scripts', { local: Object.assign({}, Ai.ls), seed: false, files: filesFrom(Ai.W) }); await wait(10); var rsi = Asi.W.Apply.reply(lineI, { ws: 'main' });
  ok(ri.units.length === 1 && rsi.units.length === 1 && rsi.units[0].ok, 'a long item with a fence and a command inside is one line to carry, and one change on the Script Viewer (' + rsi.units.map(function (u) { return u.label; }).join(' | ') + ')');
  rsi.apply(); var made = state(Asi.W).scripts().filter(function (x) { return x.title === 'Long note'; })[0];
  ok(made && made.text.indexOf(LONG) >= 0 && state(Asi.W).task('t1').col !== 'done', 'and the script holds the whole text, fence and all, while t1 stays where it was');
  // the preview is what applies: a script with no body, then a block with a task, stay two things
  var Ad = page('calendar', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10);
  var rd2 = Ad.W.Apply.reply('```\nadd "Record it"\n```\n```\n- Edit it\n  - trim\n```', { ws: 'main' }); rd2.apply();
  ok(rd2.units.length === 2 && state(Ad.W).byTitle('Record it') && (state(Ad.W).byTitle('Edit it') || {}).checklist.length === 1, 'two units in two blocks apply as two units (' + rd2.units.map(function (u) { return u.label; }).join(' | ') + ')');
  var As2 = page('scripts', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10); var nS = state(As2.W).scripts().length;
  var rs2 = As2.W.Apply.reply('```\nscripts add "Launch script"\n```\n```\n- Record it\n  - trim\n```', { ws: 'main' }); rs2.apply();
  var ls2 = state(As2.W).scripts().filter(function (x) { return x.title === 'Launch script'; })[0];
  ok(ls2 && /Record it/.test(ls2.text) === /Record it/.test(rs2.units[0].text), 'scripts add: the body the preview showed is the body applied');
  // numbered prose outside a block stays prose ("3. add a demo gif" is advice, not a command)
  var An = page('home', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10);
  var rn = An.W.Apply.reply('Three ideas:\n1. start with the problem\n2. post it on Friday\n3. add a demo gif\n4. add v2 landing page\n5. due top3 list friday', { ws: 'main' });
  ok(rn.units.length === 0, 'numbered prose outside a block is not a change (' + rn.units.map(function (u) { return u.label; }).join(' | ') + ')');
  // a script body is the user's text: copied as typed, quotes, numbers and bullets included
  var BODY = '# Why files\n\n## Hook\n\u201cFive prompts.\u201d It\u2019s all you need.\n\n## Script\n1. start with the problem\n- add a CTA\n- post it on Friday';
  var Asb = page('scripts', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10);
  var rsb = Asb.W.Apply.reply('Here:\n```\nscripts set s1\n```\n```markdown\n' + BODY + '\n```', { ws: 'main' }); rsb.apply();
  ok(state(Asb.W).script('s1').text === BODY, 'scripts set keeps the body exactly as typed (got ' + JSON.stringify(state(Asb.W).script('s1').text).slice(0, 120) + ')');
  var Awb = page('writing', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10);
  var rwb = Awb.W.Apply.reply('```\nnotes set "The draft I\'m wrestling with"\n```\n```\n# The draft I\'m wrestling with\n\nShorter.\n```', { ws: 'main' });
  ok(rwb.units.length === 1 && rwb.units[0].ok, 'notes set finds a draft by its heading (' + (rwb.units[0] ? rwb.units[0].reason : 'no unit') + ')');
  // a page applies only what it saves: Overview saves nothing, so its lines go to Home in one click
  var Ao = page('overview', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10);
  var ro = Ao.W.Apply.reply('```\ndone t1\n```', { ws: 'main' });
  var go0 = Ao.W.Guide._t.awayGroups(ro.units)[0];
  ok(ro.units.length === 1 && !ro.units[0].ok && /paste this line on Home/.test(ro.units[0].reason) && go0 && go0.file === 'index.html', 'on Overview a task line is handed to Home (' + (ro.units[0] ? ro.units[0].reason : '') + ')');
  var rm2 = Ao.W.Apply.reply('```\ndone t1\nsocial copy p1 "Moved from Overview"\n```', { ws: 'main' }); var g2 = Ao.W.Guide._t.awayGroups(rm2.units);
  ok(g2.length === 1 && g2[0].file === 'calendar/calendar.html' && g2[0].texts.length === 2, 'tasks with posts go to the Calendar in one hop (it saves both): ' + g2.map(function (g) { return g.name + ' ' + g.texts.length; }).join(', '));
  // prompt edits: a reset (here, another browser, or prompts restore --all) beats every older copy of the edit; a newer edit beats the reset
  var Ae = page('home', { local: { 'marathon.prompts': JSON.stringify({ custom: [], overrides: { 'Daily standup': { p: 'OLD EDIT', at: 1000 }, 'Wrap up the day': { p: 'NEW EDIT', at: 3000 } }, hidden: [], removed: [], shown: [] }) }, data: EMPTY }); await wait(20);
  var pspec = Ae.W.Sync.specs.filter(function (x) { return x.file === 'prompts.json'; })[0];
  if (pspec) pspec.apply({ custom: [], overrides: {}, hidden: [], removed: [], shown: [], reset: { 'Daily standup': 2000, 'Wrap up the day': 2000 } });
  var merged = Ae.W.Store.getJSON('marathon.prompts', {});
  ok(pspec && !merged.overrides['Daily standup'] && merged.overrides['Wrap up the day'] && merged.reset['Daily standup'] === 2000, 'a reset in the file removes an older edit kept by an open page, and keeps a newer one');
  var PD = path.join(TMP, 'prompts-reset'); fs.mkdirSync(PD); fs.writeFileSync(path.join(PD, 'prompts.json'), JSON.stringify({ custom: [], overrides: { 'Daily standup': { p: 'X' } }, hidden: ['Clean up the board'], shown: ['Clean up the board'] }));
  solo(['prompts', 'restore', '--all'], PD); var pr = rd(PD, 'prompts.json');
  ok(pr && !Object.keys(pr.overrides).length && pr.reset && pr.reset['Daily standup'] > 0 && pr.shown.filter(function (h) { return h === 'Clean up the board'; }).length === 1, 'prompts restore --all records the reset and never doubles an entry in shown');
  // refusals: shown as skipped, with the reason, never applied
  var REFUSE = [
    ['rm', 'rm t1', /not deleting/],
    ['an unknown id', 'done t999', /no task matches/],
    ['a date it cannot read', 'add "Call the bank" --due "next friday"', /could not read --due/],
    ['an unquoted date it cannot read', 'add "Call the bank" --due next friday', /could not read --due/],
    ['a post time it cannot read', 'social add "Launch" --at "Saturday 9am"', /could not read --at/],
    ['a command a reply cannot run', 'node solo.js boards add "Side"', /terminal|reply/],
    ['an am/pm time', 'add "Call with Sam" --at Saturday 9am', /could not read --at "Saturday 9am"/],
    ['a task time it cannot read', 'at t1 Saturday 9am', /could not read the date "Saturday 9am" for t1/],
    ['a due date it cannot read', 'due t1 next friday', /could not read the date "next friday" for t1/],
    ['a month-name date', 'due t1 Oct 30', /could not read the date "Oct 30"/],
    ['a board that does not exist', 'inspo use i1 --as task --board nosuch', /no board matches "nosuch"/],
    ['a draft this page does not save', 'notes add "Side idea"', /paste this line on the Writing Viewer/]
  ];
  for (var ri = 0; ri < REFUSE.length; ri++) {
    var q = REFUSE[ri]; var Ar = page('home', { local: { 'marathon.guide.mode': 'chat' } }); await wait(10); var c0 = state(Ar.W).count;
    var rq = Ar.W.Apply.reply('```\n' + q[1] + '\n```', { ws: 'main' });
    ok(rq.units.length === 1 && !rq.units[0].ok && q[2].test(rq.units[0].reason), 'refused, ' + q[0] + ': ' + (rq.units[0] ? rq.units[0].label + ' · ' + rq.units[0].reason : 'no unit'));
    rq.apply(); ok(state(Ar.W).count === c0, 'refused, ' + q[0] + ': nothing added');
  }

  /* ================= 3 · CLI: every command a files-mode prompt or slash command names ================= */
  var COPY = path.join(TMP, 'copy'); fs.mkdirSync(COPY);
  cp.spawnSync('rsync', ['-a', '--exclude', '.git', '--exclude', 'data', '--exclude', 'docs', ROOT + '/', COPY + '/']);
  var src = fs.readFileSync(path.join(COPY, 'solo.js'), 'utf8'); var anchor = 'var JSON_OUT = !!flags.json;';
  ok(src.indexOf(anchor) > 0, 'the flag audit finds its anchor in solo.js');
  fs.writeFileSync(path.join(COPY, 'solo.js'), src.replace(anchor, 'if (process.env.SOLO_FLAG_AUDIT) flags = (function (f) { var read = {}; process.on("exit", function () { var un = Object.keys(f).filter(function (k) { return !read[k]; }); if (un.length) process.stderr.write("UNREAD_FLAGS " + JSON.stringify(un) + "\\n"); }); return new Proxy(f, { get: function (t, k) { if (typeof k === "string") read[k] = 1; return t[k]; } }); })(flags);\n' + anchor));
  var CD = path.join(TMP, 'cli-data'); fs.mkdirSync(CD); cp.spawnSync('cp', ['-R', D + '/.', CD]);
  // the prompts name files relative to the Solo Ops folder (data/imports/…, data/videos/<take>/cut.json): the agent writes them there
  [path.join(COPY, 'data', 'imports'), path.join(COPY, 'data', 'videos', 'v1')].forEach(function (d) { fs.mkdirSync(d, { recursive: true }); });
  fs.writeFileSync(path.join(COPY, 'data', 'imports', 'linear-test.json'), JSON.stringify({ source: 'linear', items: [{ title: 'Imported task', ext: 'linear:x1' }] }));
  ['s1', 'n1'].forEach(function (id) { fs.writeFileSync(path.join(COPY, 'data', 'imports', id + '.md'), '# New text for ' + id + '\n\nTighter.\n'); });
  fs.writeFileSync(path.join(COPY, 'data', 'videos', 'v1', 'cut.json'), JSON.stringify([{ start: 0.5, end: 2.1, reason: 'keep' }]));
  fs.writeFileSync(path.join(TMP, 'script.md'), '# A script\n## Hook\nHi.\n'); fs.writeFileSync(path.join(TMP, 'cut.json'), JSON.stringify([{ start: 0.5, end: 2.1, reason: 'keep' }]));
  function run(args) { return cp.spawnSync(process.execPath, [path.join(COPY, 'solo.js')].concat(args), { encoding: 'utf8', cwd: COPY, env: Object.assign({}, process.env, { SOLO_DATA: CD, HOME: HOME, SOLO_FLAG_AUDIT: '1', PATH: '/usr/bin:/bin' }) }); }
  var NEVER = /^(backup( setup| --daily| --remote| --to)?|guard --install|prompts export|video (transcribe|render|proxy|add|open|watch|key|recordings)|serve)\b/;   // the outside world: GitHub, schedulers, git hooks, ffmpeg, money, files in the repo
  var FILL = [[/<task>|<the task>/g, 't2'], [/<post>/g, 'p1'], [/<take>/g, 'v1'], [/<item>/g, 'i1'], [/<script>|<s>/g, 's1'], [/<note>|<n>/g, 'n1'], [/<first name>/g, 'Mara'], [/<the project>|<project>/g, 'Pocket Studio'], [/<part>/g, 'video'], [/<name>/g, 'solo-ops-test'],
    [/<YYYY-MM-DDTHH:MM>/g, '2026-11-02T10:00'], [/<YYYY-MM-DD>/g, '2026-11-02'], [/<HH:MM>/g, '11:00'], [/<calendar>:<event id>/g, 'gcal:e1'], [/<tool>\[:<project or database>\],…|<tool>\[:[^\]]*\][^"]*/g, 'linear'], [/<tool>/g, 'linear'], [/<calendar name>|<what you changed>|<what changed>|<what went, and where it goes>|<why>/g, 'test'], [/<title>/g, 'A title'],
    [/data\/imports\/<file>/g, 'data/imports/linear-test.json'], [/--file script\.md/g, '--file ' + path.join(TMP, 'script.md')], [/<id>|\bID\b/g, null]];   // <id> / ID: the right kind for the command (below)
  var seen = {}; var ran = 0;
  ['claude'].forEach(function () {
    P.build({ title: 'Solo Ops', id: 'main', mode: 'files' }).forEach(function (x) {
      var T = P.cliTokens({ id: 'main', argToken: '' }); var text = String(x.p).replace(/\{\{(\w+)\}\}/g, function (mm, k) { return T[k] || mm; });
      (text.match(/`[^`\n]+`/g) || []).forEach(function (span) {
        span.slice(1, -1).split(/\s*(?:&&|;)\s*/).forEach(function (part) {
          var mm = part.match(/^node solo\.js\s+(.*)$/); if (!mm) return; var line = mm[1];
          if (/…/.test(line) || /--copy "…"|<url>|<path>|<folder>|<take> --file/.test(line)) return;   // a shape, not a line to run
          if (NEVER.test(line) || /^revert\b/.test(line) || /^(scripts|notes|social) show$|^show$/.test(line)) return;   // revert needs a log id; a bare "show" is a list of verbs, not a line
          FILL.forEach(function (fl) { if (fl[1] !== null) line = line.replace(fl[0], fl[1]); else { var kind = /^scripts/.test(line) ? 's1' : /^notes/.test(line) ? 'n1' : /^social/.test(line) ? 'p1' : /^inspo/.test(line) ? 'i1' : /^video/.test(line) ? 'v1' : 't2'; line = line.replace(fl[0], kind); } });
          line = line.replace(/data\/imports\/(t2|p1|i1|v1)\.md/, function (m0, k) { return 'data/imports/' + (/^notes/.test(line) ? 'n1' : 's1') + '.md'; });
          if (/<[^>]+>/.test(line)) { ok(false, x.slug + ': a placeholder the check cannot fill: ' + line); return; }
          if (seen[line]) return; seen[line] = 1;
          var toks = line.match(/"[^"]*"|'[^']*'|\S+/g).map(function (t) { return t.replace(/^"(.*)"$/, '$1'); });
          var r2 = run(toks); ran++;
          var unread = ((r2.stderr || '').match(/UNREAD_FLAGS (\[.*\])/) || [])[1];
          ok(r2.status === 0 || (/^doctor\b/.test(line) && r2.status === 2), x.slug + ': `node solo.js ' + line + '` exits ' + r2.status + ': ' + String(r2.stderr || r2.stdout).split('\n')[0].slice(0, 160));
          ok(!unread || JSON.parse(unread).every(function (k) { return ['ws', 'as', 'note', 'json'].indexOf(k) >= 0; }), x.slug + ': `node solo.js ' + line + '` passes flags the command never reads: ' + unread);
        });
      });
    });
  });
  ok(ran > 25, 'ran ' + ran + ' CLI lines the prompts name');

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fails ? '\n' + fails + ' FAILED, ' + passed + ' passed' : '\n✓ ' + passed + ' guide checks passed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (x) {} process.exit(1); });
