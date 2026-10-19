/* core/test-prompts.js — the prompt catalogue stays consistent with the Guide and the applier.
   Run: node core/test-prompts.js */
'use strict';
var fs = require('fs'); var path = require('path');
var P = require('./prompts.js');
var applySrc = fs.readFileSync(path.join(__dirname, 'apply.js'), 'utf8');
var fails = 0; function ok(cond, msg) { if (!cond) { fails++; console.error('✗ ' + msg); } }

['chat', 'files'].forEach(function (mode) {
  var list = P.build({ title: 'Demo', id: 'demo', board: 'runway', mode: mode, folder: mode === 'files' ? '/tmp/solo' : '' });
  ok(list.length >= 27, mode + ': expected at least 27 prompts, got ' + list.length);
  var slugs = {}, titles = {};
  list.forEach(function (x) {
    ok(x.t && x.d && x.c && x.p && x.slug && Array.isArray(x.pages), mode + ': prompt missing a field: ' + JSON.stringify(x).slice(0, 80));
    ok(!slugs[x.slug], mode + ': duplicate slug ' + x.slug); slugs[x.slug] = 1;
    ok(!titles[x.t], mode + ': duplicate title ' + x.t); titles[x.t] = 1;
    ok(/^[a-z0-9-]+$/.test(x.slug), mode + ': bad slug ' + x.slug);
    ok(x.p.indexOf('{{head}}') < 0, mode + ': {{head}} left in ' + x.t);
    ok(P.CATS.some(function (c) { return c[0] === x.c; }), mode + ': unknown group ' + x.c + ' on ' + x.t);
    if (mode === 'chat' && x.p.indexOf('{{snapshot}}') >= 0) ok(x.p.indexOf('HOW TO REPLY') > x.p.indexOf('{{snapshot}}'), 'chat: reply format must follow the snapshot in ' + x.t);
    if (mode === 'files') { ok(x.p.indexOf('{{snapshot}}') < 0, 'files: snapshot token in ' + x.t); if (x.c !== 'setup') ok(x.p.indexOf('HOW TO REPLY') < 0, 'files: chat reply format in ' + x.t); }
    if (mode === 'files' && x.c !== 'setup') { var cmd = P.command(x, { id: 'demo' }, 'claude'); ok(cmd.indexOf('---\ndescription:') === 0, 'command frontmatter missing for ' + x.slug); ok(cmd.indexOf('{{') < 0, 'command still has a token: ' + x.slug); if (x.arg) ok(cmd.indexOf('$ARGUMENTS') >= 0, 'command ' + x.slug + ' takes an argument but has no $ARGUMENTS'); ok(P.command(x, { id: 'demo' }, 'cursor').indexOf('$ARGUMENTS') < 0, 'cursor command ' + x.slug + ' must not use $ARGUMENTS'); }
  });
  // blanks: only a real <blank> becomes a field; the reply legend and `CLI examples` never do
  var ONE = { chat: ['tasks-from-list', 'edit-draft', 'script', 'fill-calendar', 'setup-folder'], files: ['tasks-from-list', 'edit-draft', 'script'] };   // setup-folder: the path, only while the folder is unknown
  list.forEach(function (x) { var b = P.blanks(x.p); var want = ONE[mode].indexOf(x.slug) >= 0 ? 1 : 0; ok(b.length === want, mode + ': ' + x.t + ' should have ' + want + ' blank(s), has ' + b.length + (b.length ? ' (' + b.join(', ') + ')' : '')); });
  // the folder path reaches the files-mode preamble
  if (mode === 'files') ok(list[0].p.indexOf('/tmp/solo') >= 0, 'files: folder path missing from the preamble');
  // the video prompts: both read the take through {{take}}, confirm before cutting, and the chat version sends the cut to the terminal
  ['cut-take', 'ship-video'].forEach(function (sl) { var x = list.filter(function (y) { return y.slug === sl; })[0]; ok(x && x.c === 'content' && x.arg === 'take', mode + ': ' + sl + ' must be a Content prompt with a take argument'); if (x) ok(x.p.indexOf('{{take}}') >= 0, mode + ': ' + sl + ' must carry {{take}}'); });
  var ct = list.filter(function (y) { return y.slug === 'cut-take'; })[0];
  if (ct) { ok(/wait for my yes/i.test(ct.p) && ct.p.indexOf('--preview') >= 0 && ct.p.indexOf('--edl') >= 0, mode + ': cut-take must wait for a yes, cut with --edl and render a preview'); if (mode === 'chat') ok(/terminal/.test(ct.p) && ct.p.indexOf('HOW TO REPLY') < 0, 'chat: cut-take ends with terminal lines, not the reply legend'); }
  var sv = list.filter(function (y) { return y.slug === 'ship-video'; })[0]; if (sv) ok(sv.p.indexOf('video post') >= 0 && /two copies/.test(sv.p), mode + ': ship-video must write two copies and run video post');
  ['standup', 'week'].forEach(function (sl) { var x = list.filter(function (y) { return y.slug === sl; })[0]; ok(x && /Video line/.test(x.p), mode + ': ' + sl + ' must mention a waiting take (the Video line)'); });
  // every page has at least two prompts on top
  ['home', 'board', 'social', 'scripts', 'writing', 'inspo', 'calendar'].forEach(function (pg) { var n = list.filter(function (x) { return x.pages.indexOf(pg) >= 0; }).length; ok(n >= 2, mode + ': page ' + pg + ' has only ' + n + ' prompts'); });
  // the titles the Guide's "next best moves" point at still exist
  ['Plan a project from scratch', 'Daily standup', 'What should I do right now?', 'Clean up the board', 'Break this task into steps', 'Draft next week\'s posts', 'Brainstorm 10 post ideas', 'Assess new inspiration', 'Turn inspiration into work', 'Set up a private backup', 'Back up now'].forEach(function (t) { ok(titles[t], mode + ': moves target missing: ' + t); });
});

// the {{take}} token has a CLI reading, and the browser side knows it
var T = P.cliTokens({ id: 'demo' }); ok(T.take && T.take.indexOf('video show') >= 0 && T.take.indexOf('$ARGUMENTS') >= 0, 'cliTokens.take must point at video show and take the argument');
var ctxSrc = fs.readFileSync(path.join(__dirname, 'context.js'), 'utf8'); ok(/\n\s+take: \{ label:/.test(ctxSrc) && ctxSrc.indexOf("'take'") >= 0, 'core/context.js must define the take token and put it in the Context menu');
Object.keys(T).forEach(function (k) { if (k === 'snapshot') return; ok(new RegExp('\\n\\s+' + k + ': \\{ label:').test(ctxSrc), 'context.js has no ' + k + ' token (cliTokens has one)'); });   // snapshot is an alias of project in the browser

// every verb the cheat sheet teaches is one core/apply.js accepts
var sheet = P.cheatsheet();
['add', 'start', 'done', 'later', 'bucket', 'todo', 'move', 'pri', 'tag', 'step', 'check', 'note', 'at', 'due', 'social', 'scripts', 'notes', 'inspo'].forEach(function (v) {
  ok(sheet.indexOf(v) >= 0, 'cheat sheet does not mention ' + v);
  ok(new RegExp("'" + v + "'").test(applySrc) || new RegExp('\\|' + v + '[|)]').test(applySrc), 'apply.js does not know verb ' + v);
});
['copy', 'prep', 'move', 'ready', 'posted'].forEach(function (s) { ok(applySrc.indexOf("'" + s + "'") >= 0, 'apply.js does not know social ' + s); });
['tag', 'ws', 'archive'].forEach(function (s) { ok(applySrc.indexOf("'" + s + "'") >= 0, 'apply.js does not know inspo ' + s); });
ok(sheet.indexOf('rm') >= 0 && /Never rm/.test(sheet), 'cheat sheet must forbid rm');

// the bootstrap is self-contained
var boot = P.bootstrap({ title: 'Demo', id: 'demo' });
ok(boot.indexOf('HOW TO REPLY') >= 0 && boot.indexOf('{{') < 0, 'bootstrap must carry the reply format and no tokens');

if (fails) { console.error(fails + ' problem' + (fails === 1 ? '' : 's')); process.exit(1); }
console.log('✓ prompts: catalogue, commands, cheat sheet and bootstrap are consistent');
