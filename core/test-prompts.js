/* core/test-prompts.js — the prompt catalogue stays consistent with the Guide and the applier.
   Run: node core/test-prompts.js */
'use strict';
var fs = require('fs'); var path = require('path');
var P = require('./prompts.js');
var applySrc = fs.readFileSync(path.join(__dirname, 'apply.js'), 'utf8');
var fails = 0; function ok(cond, msg) { if (!cond) { fails++; console.error('✗ ' + msg); } }

['chat', 'files'].forEach(function (mode) {
  var list = P.build({ title: 'Demo', id: 'demo', board: 'runway', mode: mode, folder: mode === 'files' ? '/tmp/solo' : '' });
  ok(list.length >= 25, mode + ': expected at least 25 prompts, got ' + list.length);
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
  // the folder path reaches the files-mode preamble
  if (mode === 'files') ok(list[0].p.indexOf('/tmp/solo') >= 0, 'files: folder path missing from the preamble');
  // every page has at least two prompts on top
  ['home', 'board', 'social', 'scripts', 'writing', 'inspo'].forEach(function (pg) { var n = list.filter(function (x) { return x.pages.indexOf(pg) >= 0; }).length; ok(n >= 2, mode + ': page ' + pg + ' has only ' + n + ' prompts'); });
  // the titles the Guide's "next best moves" point at still exist
  ['Plan a project from scratch', 'Daily standup', 'What should I do right now?', 'Clean up the board', 'Break this task into steps', 'Draft next week\'s posts', 'Brainstorm 10 post ideas', 'Assess new inspiration', 'Turn inspiration into work', 'Set up a private backup on GitHub', 'Back up now'].forEach(function (t) { ok(titles[t], mode + ': moves target missing: ' + t); });
});

// every verb the cheat sheet teaches is one core/apply.js accepts
var sheet = P.cheatsheet();
['add', 'start', 'done', 'later', 'bucket', 'todo', 'move', 'pri', 'tag', 'step', 'check', 'note', 'social', 'scripts', 'notes', 'inspo'].forEach(function (v) {
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
