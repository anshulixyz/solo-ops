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
  var ONE = { chat: ['tasks-from-list', 'script', 'fill-calendar', 'setup-folder'], files: ['tasks-from-list', 'script'] };   // edit-draft reads the open draft ({{this}}) since 2026-10-21   // setup-folder: the path, only while the folder is unknown
  list.forEach(function (x) { var b = P.blanks(x.p); var want = ONE[mode].indexOf(x.slug) >= 0 ? 1 : 0; ok(b.length === want, mode + ': ' + x.t + ' should have ' + want + ' blank(s), has ' + b.length + (b.length ? ' (' + b.join(', ') + ')' : '')); });
  // the folder path reaches the files-mode preamble
  if (mode === 'files') ok(list[0].p.indexOf('/tmp/solo') >= 0, 'files: folder path missing from the preamble');
  // the video prompts: both read the take through {{take}}, confirm before cutting; the chat cut goes into Reply on the Video page, the post line to the terminal
  ['cut-take', 'ship-video'].forEach(function (sl) { var x = list.filter(function (y) { return y.slug === sl; })[0]; ok(x && x.c === 'content' && x.arg === 'take', mode + ': ' + sl + ' must be a Content prompt with a take argument'); if (x) ok(x.p.indexOf('{{take}}') >= 0, mode + ': ' + sl + ' must carry {{take}}'); });
  var ct = list.filter(function (y) { return y.slug === 'cut-take'; })[0];
  if (ct) { ok(/wait for my yes/i.test(ct.p) && ct.p.indexOf('--preview') >= 0 && ct.p.indexOf(mode === 'files' ? '--edl' : '--keep') >= 0 && ct.p.indexOf('--aspect 9:16') >= 0, mode + ': cut-take must wait for a yes, cut with ' + (mode === 'files' ? '--edl' : '--keep') + ', pick the aspect and render a preview'); if (mode === 'chat') ok(/Reply on the Video page/.test(ct.p.split('Below is')[0]) && !/commands I run myself in my terminal/.test(ct.p), 'chat: cut-take has one ending, Reply on the Video page (not the terminal)'); if (mode === 'chat') ok(/HOW TO REPLY WITH CHANGES \(the cut/.test(ct.p) && ct.p.indexOf('video cut <take> --keep') > 0, 'chat: cut-take ends with the cut lines Reply applies'); }
  var sv2 = list.filter(function (y) { return y.slug === 'ship-video'; })[0]; if (sv2 && mode === 'chat') ok(/commands I run myself in my terminal/.test(sv2.p), 'chat: ship-video ends with the terminal line (video post)');
  var sv = list.filter(function (y) { return y.slug === 'ship-video'; })[0]; if (sv) ok(sv.p.indexOf('video post') >= 0 && /two copies/.test(sv.p), mode + ': ship-video must write two copies and run video post');
  ['standup', 'week'].forEach(function (sl) { var x = list.filter(function (y) { return y.slug === sl; })[0]; ok(x && /take is waiting/.test(x.p), mode + ': ' + sl + ' must mention a waiting take'); });
  // every video flag a prompt names exists in the CLI
  var soloSrc = fs.readFileSync(path.join(__dirname, '..', 'solo.js'), 'utf8'); ['--edl', '--drop', '--keep', '--preview', '--aspect', '--style', '--copy', '--at'].forEach(function (fl) { ok(soloSrc.indexOf("flags." + fl.slice(2)) >= 0 || soloSrc.indexOf(fl) >= 0, 'cmdVideo does not know ' + fl); });
  // bringing work in: the import prompts carry the untrusted-content fence, the ext rule, a cap and a show-first step
  ['bring-in', 'start-day'].forEach(function (sl) { var x = list.filter(function (y) { return y.slug === sl; })[0]; ok(!!x, mode + ': ' + sl + ' missing'); if (!x) return;
    ok(x.p.indexOf(P.UNTRUSTED) >= 0, mode + ': ' + sl + ' must carry the untrusted-content fence');
    ok(x.p.indexOf('--ext') >= 0, mode + ': ' + sl + ' must use --ext so re-runs update'); });
  var bi = list.filter(function (y) { return y.slug === 'bring-in'; })[0];
  if (bi) { ok(/At most 20|at most 20/.test(bi.p) && /yes/.test(bi.p), mode + ': bring-in caps new items and waits for a yes');
    if (mode === 'files') ok(bi.p.indexOf('--dry-run') >= 0 && bi.p.indexOf('import data/imports/') >= 0 && bi.p.indexOf('--as agent') >= 0 && /never through a shell/.test(bi.p), 'files: bring-in writes one import file, dry-runs it, never passes imported text through a shell, logs as agent'); }
  var sd = list.filter(function (y) { return y.slug === 'start-day'; })[0]; if (sd && mode === 'files') ok(/unattended/i.test(sd.p) && /at most 10 new/.test(sd.p), 'files: start-day says what an unattended run may do');
  var wr = list.filter(function (y) { return y.slug === 'wrap'; })[0]; if (wr && mode === 'files') ok(/git -C/.test(wr.p) && /--ext log:/.test(wr.p) && /never paste diffs or secrets/.test(wr.p), 'files: wrap gathers from the conversation and git, logs finished work once');
  // /setup: one round of three questions, blank start, work brought in, the backup with its name, the menu at the end
  var su = list.filter(function (y) { return y.slug === 'setup'; })[0];
  if (su) ok(/three together, in one message/.test(su.p) && su.p.indexOf('template blank') >= 0 && su.p.indexOf('/bring-in') >= 0 && su.p.indexOf('backup setup --name') >= 0 && su.p.indexOf('node solo.js menu') >= 0 && su.p.indexOf('guard --install') >= 0 && su.p.indexOf('solo.config.js is shipped code') >= 0, mode + ': /setup is one round, starts blank, brings work in, names the backup repo, ends with the menu');
  var bs = list.filter(function (y) { return y.slug === 'backup-setup'; })[0]; if (bs && mode === 'files') ok(bs.p.indexOf('--name') >= 0 && /solo-ops-data unless I pick another/.test(bs.p), 'files: /backup-setup offers the repo name');
  // every page has at least two prompts on top
  ['home', 'board', 'social', 'scripts', 'writing', 'inspo', 'calendar'].forEach(function (pg) { var n = list.filter(function (x) { return x.pages.indexOf(pg) >= 0; }).length; ok(n >= 2, mode + ': page ' + pg + ' has only ' + n + ' prompts'); });
  // the titles the Guide's "next best moves" point at still exist
  ['Bring in my work', 'Plan a project from scratch', 'Daily standup', 'What should I do right now?', 'Clean up the board', 'Break this task into steps', 'Draft next week\'s posts', 'Brainstorm 10 post ideas', 'Assess new inspiration', 'Turn inspiration into work', 'Set up a private backup', 'Back up now'].forEach(function (t) { ok(titles[t], mode + ': moves target missing: ' + t); });
});

// the menu: one list for `menu`, /menu, the Guide and AGENTS.md
var built = P.build({ title: 'Solo Ops', id: 'main', mode: 'files' }); var bySlug = {}; built.forEach(function (x) { bySlug[x.slug] = x; });
P.MENU.forEach(function (g) { g[2].forEach(function (sl) { ok(!!bySlug[sl], 'menu names /' + sl + ', which is not a prompt'); }); });
Object.keys(P.FOR_PAGE).forEach(function (pg) { P.FOR_PAGE[pg].forEach(function (sl) { ok(!!bySlug[sl] && bySlug[sl].pages.indexOf(pg) >= 0, 'For this page on ' + pg + ' names /' + sl + ', which is not a prompt of that page'); }); });
P.GET_STARTED.forEach(function (sl) { ok(!!bySlug[sl], 'GET_STARTED names /' + sl + ', which is not a prompt'); });
ok(bySlug.menu && bySlug.menu.slash && bySlug.setup && bySlug.setup.slash && bySlug['setup-video'] && bySlug['setup-video'].slash, 'menu, setup and setup-video are exported as slash commands');
var agents = fs.readFileSync(path.join(__dirname, '..', 'AGENTS.md'), 'utf8'); var am = agents.match(/<!-- menu:begin[^>]*-->\n```\n([\s\S]*?)\n```\n<!-- menu:end -->/);
ok(am && am[1] === P.menuText({ title: 'Solo Ops', id: 'main', mode: 'files' }), 'AGENTS.md carries the menu as `prompts export` writes it (run: node solo.js prompts export)');
// docs/guide-prompts.md is generated from this file and must match it byte for byte
var catFile = ''; try { catFile = fs.readFileSync(path.join(__dirname, '..', 'docs', 'guide-prompts.md'), 'utf8'); } catch (e) {}
ok(catFile === P.catalogue() + '\n', 'docs/guide-prompts.md is what `node solo.js prompts export --for docs` writes (run it after changing core/prompts.js)');
Object.keys(P.PAGES).forEach(function (k) { var pg = P.PAGES[k]; ok(pg.title && pg.file && fs.existsSync(path.join(__dirname, '..', pg.file)) && Array.isArray(pg.chips) && pg.about.length, 'PAGES.' + k + ' names a real page, its chips and its help'); });
// slash names Claude Code (or another tool) keeps for itself, or an installed skill uses, are never ours
var RESERVED = ['hooks', 'init', 'review', 'doctor', 'config', 'memory', 'status', 'help', 'agents', 'model', 'schedule', 'loop', 'export', 'resume', 'context', 'clear', 'compact', 'cost', 'login', 'logout', 'mcp', 'permissions', 'vim', 'bug', 'add-dir', 'ide', 'upgrade', 'todos', 'rewind', 'usage', 'statusline', 'plugin', 'output-style', 'security-review', 'release-notes', 'terminal-setup', 'pr-comments', 'morning'];
built.forEach(function (x) { ok(RESERVED.indexOf(x.slug) < 0, '/' + x.slug + ' collides with a built-in command or an installed skill'); });

// the {{take}} token has a CLI reading, and the browser side knows it
var T = P.cliTokens({ id: 'demo' }); ok(T.take && T.take.indexOf('video show') >= 0 && T.take.indexOf('$ARGUMENTS') >= 0, 'cliTokens.take must point at video show and take the argument');
var ctxSrc = fs.readFileSync(path.join(__dirname, 'context.js'), 'utf8'); ok(/\n\s+take: \{ label:/.test(ctxSrc) && ctxSrc.indexOf("'take'") >= 0, 'core/context.js must define the take token and put it in the Context menu');
Object.keys(T).forEach(function (k) { if (k === 'snapshot') return; ok(new RegExp('\\n\\s+' + k + ': \\{ label:').test(ctxSrc), 'context.js has no ' + k + ' token (cliTokens has one)'); });   // snapshot is an alias of project in the browser

// every verb the cheat sheet teaches is one core/apply.js accepts
var sheet = P.cheatsheet();
ok(sheet.indexOf('--ext') >= 0 && sheet.indexOf('done ext:') >= 0 && sheet.indexOf('--col') >= 0 && applySrc.indexOf("indexOf('ext:') === 0") >= 0, 'the cheat sheet teaches --ext, --col and done ext:, and apply.js reads the ext: selector');
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
