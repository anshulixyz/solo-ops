#!/usr/bin/env node
/* core/test-guide-browser.js — the Guide in a real browser, every page, both modes (npm run test:guide).
   Serves a scratch copy of the sample project with serve.js on a free port, runs headless Chrome on core/guide-check.html
   (which loads each page in a same-origin iframe and drives the Guide like a person), and checks what came back: the panel
   opens on every page without an error, Start and a prompt card copy prompts with every token filled, Ask your AI composes,
   Reply previews and applies on the board, Settings and Quick render. Skipped (exit 0) when Chrome is not installed.
   CHROME=/path/to/chrome overrides the browser. Never touches the real data/ or port 4321. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
var ROOT = path.join(__dirname, '..');
var CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(function (p) { return fs.existsSync(p); })[0];
if (!CHROME) { console.log('· test-guide-browser: no Chrome found (set CHROME=…); skipped'); process.exit(0); }
var passed = 0, fails = 0; function ok(c, m) { if (c) passed++; else { fails++; console.error('✗ ' + m); } }
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-guide-browser-')); var D = path.join(TMP, 'data'); fs.mkdirSync(D);
cp.spawnSync(process.execPath, [path.join(ROOT, 'solo.js'), 'template', 'all'], { env: Object.assign({}, process.env, { SOLO_DATA: D, HOME: TMP }) });
var PORT = 47000 + Math.floor(Math.random() * 900);
var srv = cp.spawn(process.execPath, [path.join(ROOT, 'serve.js'), '--port', String(PORT), '--data', D], { env: Object.assign({}, process.env, { HOME: TMP }), stdio: 'ignore' });
function done(code) { try { srv.kill(); } catch (e) {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} process.exit(code); }
function ping(n) { return new Promise(function (r) { http.get('http://localhost:' + PORT + '/api/ping', function (res) { res.resume(); r(res.statusCode === 200); }).on('error', function () { r(false); }); }).then(function (up) { return up || n <= 0 ? up : new Promise(function (r) { setTimeout(function () { r(ping(n - 1)); }, 200); }); }); }
var REPLY_PAGES = 'runway/marathon-board.html,studio/script-viewer.html,studio/writing-viewer.html,social/social-calendar.html,index.html,overview.html,inspo/inspiration.html';   // chat mode pastes an answer on each; core/guide-check.html holds what
var PAGES = ['index.html', 'overview.html', 'about.html', 'runway/marathon-board.html', 'calendar/calendar.html', 'social/social-board.html', 'social/social-calendar.html', 'studio/script-viewer.html', 'studio/writing-viewer.html', 'studio/video.html', 'inspo/inspiration.html'];
ping(40).then(function (up) {
  if (!up) { console.error('✗ serve.js did not start on ' + PORT); done(1); }
  ['files', 'chat'].forEach(function (mode) {
    var url = 'http://localhost:' + PORT + '/core/guide-check.html?mode=' + mode + '&reply=' + (mode === 'chat' ? REPLY_PAGES : 'runway/marathon-board.html') + '&pages=' + PAGES.join(',');
    var prof = path.join(TMP, 'chrome-' + mode);
    var r = cp.spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + prof, '--virtual-time-budget=120000', '--dump-dom', url], { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1048576 });
    var m = (r.stdout || '').match(/RESULT (\[[\s\S]*?\]) END/);
    ok(!!m, mode + ': the check page finished (' + String(r.stderr || '').split('\n').filter(Boolean).slice(-1)[0] + ')'); if (!m) return;
    JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')).forEach(function (x) {
      var at = mode + ' · ' + x.page + ': ';
      ok(!x.crash, at + 'the check ran (' + (x.crash || '') + ')'); if (x.crash) return;
      ok(x.open, at + 'the Guide opens'); if (!x.open) return;
      ok(!x.errors.length, at + 'no script error: ' + x.errors.join(' | '));
      ok(x.tabs === 4, at + 'four tabs');
      ok(x.start >= 1, at + 'Start here / Start with one shows something');
      ok(x.start === 0 || x.startEffect !== 'nothing', at + 'the first Start button copies, opens its form or says what it needs (' + x.startEffect + ')');
      ok(x.cardCopied >= 1, at + 'a For this page card copies a prompt');
      ok(x.tokensLeft === 0, at + 'no {{token}} left in what was copied');
      ok(x.askCopied, at + 'Ask your AI composes what was typed');
      ok(x.settings && x.quick, at + 'Settings and Quick render');
      if (x.previewUnits !== undefined) {
        var want = { 'runway/marathon-board.html': 2, 'overview.html': 0 }[x.page]; if (want === undefined) want = 1;
        ok(x.previewUnits === want, at + 'Reply previews ' + want + ' change(s) here (' + x.previewUnits + ')'); if (want) ok(new RegExp('Applied ' + want).test(x.applied), at + 'Reply applies them: ' + x.applied.slice(0, 120));
        if (['overview.html', 'index.html', 'inspo/inspiration.html'].indexOf(x.page) >= 0) {   // the lines another page saves: Continue on …, previewed there, applied there
          ok(x.carry, at + 'Continue on … is offered for what another page saves');
          ok(x.carriedUnits === 1, at + 'the next page opens with that line previewed (' + x.carriedUnits + ')');
          ok(/Applied 1/.test(x.carriedApplied || ''), at + 'and applies it there: ' + String(x.carriedApplied || '').slice(0, 100) + ' (plan: ' + (x.carriedPlan || '') + ')');
        }
      }
    });
  });
  // the board file now carries the change the browser applied
  setTimeout(function () {
    var b = JSON.parse(fs.readFileSync(path.join(D, 'runway.json'), 'utf8')); var t2 = b.tasks.filter(function (t) { return t.id === 't2'; })[0];
    ok(t2 && t2.col === 'doing' && /From the browser check/.test(t2.notes), 'the reply applied in the browser reached data/runway.json');
    var J = function (f) { return JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); };   // the pages that answer the file write from their own copy (Script, Writing, Streak) take the reply first
    var s1 = (J('scripts.json').scripts || []).filter(function (s) { return s.id === 's1'; })[0]; ok(s1 && /From the browser check/.test(s1.text) && s1.title === 'Browser check script', 'scripts set on the Script page reached data/scripts.json');
    var n1 = (J('writing.json').notes || []).filter(function (n) { return n.id === 'n1'; })[0]; ok(n1 && /From the browser check/.test(n1.text), 'notes set on the Writing page reached data/writing.json');
    var p1 = (J('social.json').posts || []).filter(function (p) { return p.id === 'p1'; })[0]; ok(p1 && p1.copy === 'From the browser check', 'social copy on the Streak page reached data/social.json');
    var p2 = (J('social.json').posts || []).filter(function (p) { return p.id === 'p2'; })[0]; ok(p2 && p2.copy === 'From the browser check', 'the post copy from a reply on Home reached data/social.json through the Calendar');
    var i2 = (J('inspiration.json').items || []).filter(function (x) { return x.id === 'i2'; })[0] || {}; var made = ((i2.usedAs || [])[0] || {}).id;
    ok(i2.status === 'used' && made && (J('scripts.json').scripts || []).some(function (x) { return x.id === made; }), 'inspo use on the Inspiration page: the item is used and the script it names was made on the Script Viewer (' + made + ')');
    var tk = function (id) { return (J('runway.json').tasks || []).filter(function (t) { return t.id === id; })[0] || {}; };
    ok(tk('t4').pri === 'high', 'a task line on Home reached data/runway.json'); ok(tk('t3').pri === 'high', 'the line handed from Overview to Home reached data/runway.json');
    var log = fs.readFileSync(path.join(D, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); });
    ['runway.json', 'scripts.json', 'writing.json', 'social.json'].forEach(function (f) { ok(log.some(function (e) { return e.file === f && e.source === 'reply'; }), 'the change log says ' + f + ' changed from a pasted reply'); });
    console.log(fails ? '\n' + fails + ' FAILED, ' + passed + ' passed' : '\n✓ ' + passed + ' browser guide checks passed');
    done(fails ? 1 : 0);
  }, 1500);
});
