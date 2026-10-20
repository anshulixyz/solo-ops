#!/usr/bin/env node
/* docs/launch/shoot.js — takes the launch screenshots with headless Chrome.
   Two servers must be running: the seeded "Pocket Studio" copy (BUILT, default
   http://localhost:4412) and a fresh `template all` copy for the onboarding
   shots (FRESH, default http://localhost:4413). Both are scratch copies made
   by seed.js / `node solo.js template all`; never the owner's folder.
     node docs/launch/shoot.js [--only 30,41] [--out docs/screenshots]
   Each shot loads mock/frame.html, which sets localStorage, opens the page
   in an iframe and runs the actions (see frame.html). Pages are shot at
   1440×900 @2×, phones at 390×844 @3×. */
var cp = require('child_process'), fs = require('fs'), path = require('path');
var CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
var BUILT = process.env.BUILT || 'http://localhost:4412', FRESH = process.env.FRESH || 'http://localhost:4413';
var WEEK = process.env.WEEK || 'http://localhost:4413';   // the launch video's week copy (week.js, week.sh)
var BUILT_DIR = process.env.BUILT_DIR || '';   // the seeded copy's folder, for shots that need a CLI change between frames
var args = process.argv.slice(2); function flag(n) { var i = args.indexOf(n); return i > -1 ? args[i + 1] : ''; }
var OUT = path.resolve(flag('--out') || path.join(__dirname, '..', 'screenshots')); fs.mkdirSync(OUT, { recursive: true });
var only = flag('--only') ? flag('--only').split(',') : null;
var BUILT_LS = { 'marathon.hub.sampleOk': '1', 'marathon.guide.mode': 'files', 'marathon.guide.seen': '1', 'marathon.guide.cats': { daily: true } };
var CHAT_LS = Object.assign({}, BUILT_LS, { 'marathon.guide.mode': 'chat' });
var FRESH_LS = { 'marathon.hub.sampleOk': null, 'marathon.guide.mode': null, 'marathon.guide.seen': null, 'marathon.backup.ack': null };
function expand(title) { return "js:(function(){var t=Model.getState().filter(function(x){return x.title.indexOf(" + JSON.stringify(title) + ")===0})[0]; if(t && t.collapsed) toggleCollapse(t.id);})()"; }   // idempotent: the expanded state is saved to the file
function whenForm(title) { return "js:(function(){var t=Model.getState().filter(function(x){return x.title.indexOf(" + JSON.stringify(title) + ")===0})[0]; if(t) toggleWhen(t.id);})()"; }

var SHOTS = [
  // story 1 — onboarding (fresh copy)
  { id: '01-home-first-run', base: FRESH, go: 'index.html', ls: FRESH_LS },
  { id: '02-guide-first-open', base: FRESH, go: 'index.html?guide=settings', ls: Object.assign({}, FRESH_LS, { 'marathon.hub.sampleOk': '1' }) },
  { id: '03-guide-ask', base: FRESH, go: 'index.html?guide=ask', ls: { 'marathon.hub.sampleOk': '1', 'marathon.guide.mode': 'chat', 'marathon.guide.seen': '1', 'marathon.guide.cats': { daily: true } } },
  { id: '04-guide-protect', base: FRESH, go: 'index.html?guide=settings', ls: { 'marathon.hub.sampleOk': '1', 'marathon.guide.mode': 'chat', 'marathon.guide.seen': '1' }, },
  { id: '07-home-after-setup', base: FRESH, go: 'index.html', ls: { 'marathon.hub.sampleOk': '1', 'marathon.guide.mode': 'files', 'marathon.guide.seen': '1', 'marathon.backup.ack': '1' } },
  // story 2 — chat-only pieces that are pages
  { id: '10-guide-copy-standup', base: BUILT, go: 'index.html?guide=ask', ls: CHAT_LS, do: "js:navigator.clipboard.writeText=function(){return Promise.resolve()};;js:(function(){var c=Array.prototype.filter.call(document.querySelectorAll('.guide-prompt'),function(x){return /Daily standup/.test(x.querySelector('.gp-t').textContent)})[0]; if(c){c.scrollIntoView({block:'center'}); c.querySelector('.gp-main').click();}})();;wait:300" },
  { id: '13-guide-reply-preview', base: BUILT, go: 'index.html?guide=reply', ls: CHAT_LS, do: 'type:.guide-reply|' + 'done "Landing page copy"\nstart "Write the launch post"\nnote "Write the launch post" "Lead with the Sunday line from the first post"\nadd "Reply to Priya before the intro" --pri high --due ' + new Date(Date.now() + 86400000).toISOString().slice(0, 10) + ';;click:.guide-preview' },
  { id: '18-guide-quick', base: BUILT, go: 'index.html?guide=quick', ls: BUILT_LS },
  // the Guide fills a narrow window, so the panel is the whole frame (for the launch video)
  { id: '19-guide-ask-your-ai', base: BUILT, go: 'index.html?guide=ask', ls: CHAT_LS, w: 430, h: 900, do: 'wait:2500' },
  { id: '19-guide-ask-your-ai-dark', base: BUILT, go: 'index.html?guide=ask', ls: CHAT_LS, w: 430, h: 900, do: "wait:2500;;js:Theme.set({mode:'dark',palette:'mono'},{silent:true})" },
  // story 4 — the tour (built copy)
  { id: '30-home-cockpit', base: BUILT, go: 'index.html', ls: BUILT_LS },
  { id: '31-overview', base: BUILT, go: 'overview.html?ws=main', ls: BUILT_LS },
  { id: '32-board-full', base: BUILT, go: 'runway/marathon-board.html?ws=main&board=runway', ls: BUILT_LS, do: 'wait:3000;;' + expand('Record the 60-second demo'), budget: 12000 },
  { id: '33-board-when', base: BUILT, go: 'runway/marathon-board.html?ws=main&board=runway', ls: BUILT_LS, do: 'wait:3000;;' + whenForm('Landing page copy'), budget: 12000 },
  { id: '34-calendar-agenda', base: BUILT, go: 'calendar/calendar.html?ws=main&view=agenda', ls: Object.assign({}, BUILT_LS, { 'marathon.calendar.intro': 'closed' }) },
  { id: '35-calendar-month', base: BUILT, go: 'calendar/calendar.html?ws=main&view=month', ls: Object.assign({}, BUILT_LS, { 'marathon.calendar.intro': 'closed' }) },
  { id: '36-social-board', base: BUILT, go: 'social/social-board.html?ws=main', ls: BUILT_LS, do: 'clicktext:.tl-item|Teaser' },
  { id: '37-social-streak', base: BUILT, go: 'social/social-calendar.html?ws=main#streak', ls: BUILT_LS },
  { id: '38-scripts', base: BUILT, go: 'studio/script-viewer.html?ws=main', ls: BUILT_LS, do: 'wait:2500;;clicktext:.note-item|Demo: 60 seconds' },
  { id: '39-writing', base: BUILT, go: 'studio/writing-viewer.html?ws=main', ls: BUILT_LS, do: 'wait:2500;;clicktext:.note-item|Launch post' },
  { id: '40-inspiration', base: BUILT, go: 'inspo/inspiration.html?ws=main', ls: BUILT_LS },
  { id: '41-share-dialog', base: BUILT, go: 'index.html', ls: Object.assign({}, BUILT_LS, { 'marathon.share.scope': 'all' }), do: 'js:shareToday()' },
  { id: '42-share-save', base: BUILT, go: 'index.html', ls: Object.assign({}, BUILT_LS, { 'marathon.share.scope': 'all' }), do: 'js:shareToday();;wait:600;;click:.share-save;;wait:2500' },
  { id: '43-palette', base: BUILT, go: 'runway/marathon-board.html?ws=main&board=runway', ls: BUILT_LS, do: "wait:2500;;js:Palette.open('add')" },
  { id: '44-home-dark', base: BUILT, go: 'index.html', ls: BUILT_LS, do: "wait:2500;;js:Theme.set({mode:'dark',palette:'dusk'},{silent:true})" },   // silent: the shot must not write the copy's settings.json
  { id: '45-phone-home', base: BUILT, go: 'index.html', ls: BUILT_LS, phone: true },
  { id: '46-phone-board', base: BUILT, go: 'runway/marathon-board.html?ws=main&board=runway', ls: BUILT_LS, phone: true },
  // stories 2 and 3 — chat and terminal frames (reproductions, verbatim content)
  { id: '11-chat-standup-1', base: BUILT, go: 'docs/launch/mock/chat.html?c=11-chat-standup-1', budget: 6000 },
  { id: '12-chat-standup-2', base: BUILT, go: 'docs/launch/mock/chat.html?c=12-chat-standup-2', budget: 6000 },
  { id: '15-chat-capture', h: 1300, base: BUILT, go: 'docs/launch/mock/chat.html?c=15-chat-capture', budget: 6000 },
  { id: '16-chat-emails-to-todos', h: 1100, base: BUILT, go: 'docs/launch/mock/chat.html?c=16-chat-emails-to-todos', budget: 6000 },
  { id: '17-chat-done-update', h: 1000, base: BUILT, go: 'docs/launch/mock/chat.html?c=17-chat-done-update', budget: 6000 },
  { id: '05-term-doctor-fresh', base: BUILT, go: 'docs/launch/mock/term.html?t=05-term-doctor-fresh', budget: 6000 },
  { id: '20-term-standup', h: 1350, base: BUILT, go: 'docs/launch/mock/term.html?t=20-term-standup', budget: 6000 },
  { id: '21-term-plan-project', h: 1400, base: BUILT, go: 'docs/launch/mock/term.html?t=21-term-plan-project', budget: 6000 },
  { id: '23-term-done-elsewhere', base: BUILT, go: 'docs/launch/mock/term.html?t=23-term-done-elsewhere', budget: 6000 },
  { id: '24-term-today-brief', base: BUILT, go: 'docs/launch/mock/term.html?t=24-term-today-brief', budget: 6000 },
  { id: '25-term-fill-calendar', h: 1350, base: BUILT, go: 'docs/launch/mock/term.html?t=25-term-fill-calendar', budget: 6000 },
  { id: '27-term-plan-today', h: 1150, base: BUILT, go: 'docs/launch/mock/term.html?t=27-term-plan-today', budget: 6000 },
  { id: '28-term-guard', base: BUILT, go: 'docs/launch/mock/term.html?t=28-term-guard', budget: 6000 },
  // persona tomas (seed with personas.js before shooting: node docs/launch/personas.js <copy> tomas)
  { id: 'persona-tomas-home', base: BUILT, go: 'index.html', ls: BUILT_LS, h: 1000, budget: 10000 },
  { id: 'persona-tomas-board', base: BUILT, go: 'runway/marathon-board.html?ws=main&board=runway', ls: BUILT_LS, h: 1500, do: 'wait:3000;;' + "js:(function(){var t=Model.getState().filter(function(x){return x.col==='doing'})[0]; if(t && t.collapsed) toggleCollapse(t.id);})()", budget: 12000 },
  { id: 'persona-tomas-calendar', base: BUILT, go: 'calendar/calendar.html?ws=main&view=agenda', ls: Object.assign({}, BUILT_LS, { 'marathon.calendar.intro': 'closed' }), budget: 10000 },
  { id: 'persona-tomas-phone', base: BUILT, go: 'index.html', ls: BUILT_LS, phone: true, budget: 10000 },
  // persona noor (seed with personas.js before shooting: node docs/launch/personas.js <copy> noor)
  { id: 'persona-noor-home', base: BUILT, go: 'index.html', ls: BUILT_LS, h: 1000, budget: 10000 },
  { id: 'persona-noor-board', base: BUILT, go: 'runway/marathon-board.html?ws=main&board=runway', ls: BUILT_LS, h: 1500, do: 'wait:3000;;' + "js:(function(){var t=Model.getState().filter(function(x){return x.col==='doing'})[0]; if(t && t.collapsed) toggleCollapse(t.id);})()", budget: 12000 },
  { id: 'persona-noor-calendar', base: BUILT, go: 'calendar/calendar.html?ws=main&view=agenda', ls: Object.assign({}, BUILT_LS, { 'marathon.calendar.intro': 'closed' }), budget: 10000 },
  { id: 'persona-noor-phone', base: BUILT, go: 'index.html', ls: BUILT_LS, phone: true, budget: 10000 },
  // persona lena (seed with personas.js before shooting: node docs/launch/personas.js <copy> lena)
  { id: 'persona-lena-home', base: BUILT, go: 'index.html', ls: BUILT_LS, h: 1000, budget: 10000 },
  { id: 'persona-lena-board', base: BUILT, go: 'runway/marathon-board.html?ws=main&board=runway', ls: BUILT_LS, h: 1500, do: 'wait:3000;;' + "js:(function(){var t=Model.getState().filter(function(x){return x.col==='doing'})[0]; if(t && t.collapsed) toggleCollapse(t.id);})()", budget: 12000 },
  { id: 'persona-lena-calendar', base: BUILT, go: 'calendar/calendar.html?ws=main&view=agenda', ls: Object.assign({}, BUILT_LS, { 'marathon.calendar.intro': 'closed' }), budget: 10000 },
  { id: 'persona-lena-phone', base: BUILT, go: 'index.html', ls: BUILT_LS, phone: true, budget: 10000 },
  // the launch video's week (week.js runs the steps between these; week.sh is the order). Board = launch-runway, the one /plan-project made
  { id: 'wk-mon-a', base: WEEK, go: 'runway/marathon-board.html?ws=main&board=launch-runway', ls: BUILT_LS, budget: 10000 },
  { id: 'wk-mon-b', base: WEEK, go: 'runway/marathon-board.html?ws=main&board=launch-runway', ls: BUILT_LS, budget: 10000 },
  { id: 'wk-mon-c', base: WEEK, go: 'runway/marathon-board.html?ws=main&board=launch-runway', ls: BUILT_LS, budget: 10000 },
  { id: 'wk-mon-d', base: WEEK, go: 'runway/marathon-board.html?ws=main&board=launch-runway', ls: BUILT_LS, budget: 10000 },
  { id: 'wk-mon-board', base: WEEK, go: 'runway/marathon-board.html?ws=main&board=launch-runway', ls: BUILT_LS, h: 1300, do: 'wait:3000;;' + expand('Fix the export crash') + ';;' + expand('Record the 60-second demo'), budget: 12000 },
  { id: 'wk-tue-board', base: WEEK, go: 'runway/marathon-board.html?ws=main&board=launch-runway', ls: BUILT_LS, h: 1100, do: 'wait:3000;;' + expand('Write the launch post'), budget: 12000 },
  { id: 'wk-tue-calendar', base: WEEK, go: 'calendar/calendar.html?ws=main&view=agenda', ls: Object.assign({}, BUILT_LS, { 'marathon.calendar.intro': 'closed' }), budget: 10000 },
  { id: 'wk-wed-reply', base: WEEK, go: 'index.html?guide=reply', ls: CHAT_LS, do: 'type:.guide-reply|' + 'add "Reply to Jonas: send the new beta build" --pri high --due 2026-10-14 --tags email,beta\nnote "Reply to Jonas" "His export crash is the open bug: Fix the export crash on long clips"\nadd "Refund Lena\'s duplicate charge, then reply" --pri high --due 2026-10-14 --tags email,support\nadd "Reply to Dana (The Maker Hour): pick a November week" --pri medium --due 2026-10-16 --tags email,press' + ';;click:.guide-preview', budget: 10000 },
  { id: 'wk-wed-board', base: WEEK, go: 'runway/marathon-board.html?ws=main&board=launch-runway', ls: BUILT_LS, h: 1100, budget: 12000 },
  { id: 'wk-thu-scripts', base: WEEK, go: 'studio/script-viewer.html?ws=main', ls: BUILT_LS, do: 'wait:2500;;clicktext:.note-item|Demo: 60 seconds', budget: 10000 },
  { id: 'wk-thu-prompter', base: WEEK, go: 'studio/script-viewer.html?ws=main', ls: BUILT_LS, do: 'wait:2500;;clicktext:.note-item|Demo: 60 seconds;;wait:600;;click:#teleprompterBtn;;wait:600;;click:#prompterPlayBtn;;wait:2200', budget: 12000 },
  { id: 'wk-thu-social', base: WEEK, go: 'social/social-board.html?ws=main', ls: BUILT_LS, do: 'clicktext:.tl-item|The demo is out', budget: 10000 },
  { id: 'wk-fri-home-typing', base: WEEK, go: 'index.html', ls: BUILT_LS, do: 'wait:2500;;type:#qaInput|Call Sam Monday 14:00;;focus:#qaInput;;wait:400', budget: 10000 },
  { id: 'wk-fri-share', base: WEEK, go: 'index.html', ls: Object.assign({}, BUILT_LS, { 'marathon.share.scope': 'all' }), do: 'wait:2500;;js:shareToday();;wait:800', budget: 10000 },
  { id: 'wk-agent-recent', base: WEEK, go: 'index.html', ls: BUILT_LS, h: 1100, do: 'wait:3500;;js:document.querySelector("#logCard").scrollIntoView({block:"center"})', budget: 12000 },
  { id: '18-chat-mail-connector', h: 1100, base: WEEK, go: 'docs/launch/mock/chat.html?c=18-chat-mail-connector', budget: 6000 },
  { id: '06-term-setup', h: 1500, base: WEEK, go: 'docs/launch/mock/term.html?t=06-term-setup', budget: 6000 },
  // story 5 — trust
  // 50 is two frames on one browser profile: Mara works on Home (events recorded), the agent changes a file from the terminal, Home shows both
  { id: '50a-prime', base: BUILT, go: 'index.html', ls: BUILT_LS, profile: 'p50', keep: false, do: "wait:3000;;js:(function(){var r=Quick.rows().filter(function(x){return /Fix the export crash/.test(x.task.title)})[0]; if(r) Quick.setCol(r,'doing');})();;wait:500;;type:#qaInput|Reply to the beta testers tomorrow 09:30;;js:homeQuickAdd();;wait:2500" },
  { id: '50-recent-restore', base: BUILT, go: 'index.html', ls: BUILT_LS, profile: 'p50', before: ['done', 'Set up the waitlist form', '--as', 'agent', '--note', 'you said it shipped in our chat'], do: 'wait:3500;;click:.restore summary;;wait:300;;js:document.querySelector("#logCard").scrollIntoView({block:"center"})', budget: 12000 },
  { id: '52-about', base: BUILT, go: 'about.html', ls: BUILT_LS, h: 1300 },
  { id: '53-about-coming', base: BUILT, go: 'about.html', ls: BUILT_LS, h: 1300, do: "wait:800;;js:(function(){var h=Array.prototype.filter.call(document.querySelectorAll('h2'),function(x){return /What is coming/.test(x.textContent)})[0]; if(h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 24);})()" },
  { id: '51-guide-backup-ok', base: BUILT, go: 'index.html?guide=settings', ls: BUILT_LS },
  // README: the Guide on Ask over the built Home, and the Video page on the demo take (TAKE = its id; headless Chrome paints no
  // video frame, so TAKE_POSTER, the take's first frame exported with ffmpeg, stands in as the poster; the seed's take is synthetic,
  // and its scratch path is shown as ~/Movies/pocket-studio/demo-take-2.mp4, the one cosmetic replacement in these shots)
  { id: '47-guide-ask', base: BUILT, go: 'index.html?guide=ask', ls: CHAT_LS, do: 'wait:2500' },
  { id: '48-video', base: BUILT, go: 'studio/video.html?ws=main' + (process.env.TAKE ? '&open=' + process.env.TAKE : ''), ls: Object.assign({}, BUILT_LS, { 'marathon.video.captions': '1', 'marathon.video.playerBig': '0' }), h: 1100, budget: 12000,
    do: 'wait:3500;;' + "js:(function(){var i=ctx.tokens.findIndex(function(t){return t.kind==='word'&&t.ph===5});if(i>=0)selectSentenceOf(i)})();;wait:300;;" + (process.env.TAKE_POSTER ? "js:(function(){var v=document.getElementById('player');if(!v)return;v.pause();v.setAttribute('poster'," + JSON.stringify(process.env.TAKE_POSTER) + ");v.removeAttribute('src');v.load();var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);var n;while((n=w.nextNode()))if(n.nodeValue.indexOf('/demo-take-2.mp4')>-1)n.nodeValue='~/Movies/pocket-studio/demo-take-2.mp4';})();;wait:800" : 'wait:1') }
];

function frameUrl(s) {
  var q = new URLSearchParams(); q.set('go', s.go); if (s.ls) q.set('ls', JSON.stringify(s.ls)); if (s.do) q.set('do', s.do);
  return s.base + '/docs/launch/mock/frame.html?' + q.toString();
}
var done = 0;
// profiles never survive a run: a shared profile from an earlier seed would show stale ids as deletions
fs.readdirSync(require('os').tmpdir()).filter(function (d) { return d.indexOf('solo-shoot-') === 0; }).forEach(function (d) { fs.rmSync(path.join(require('os').tmpdir(), d), { recursive: true, force: true }); });
SHOTS.forEach(function (s) {
  if (only && !only.some(function (o) { return s.id.indexOf(o) === 0; })) return;
  if (s.before && BUILT_DIR) { var b = cp.spawnSync('node', ['solo.js'].concat(s.before), { cwd: BUILT_DIR, encoding: 'utf8' }); if (b.status !== 0) console.log('  before failed: ' + b.stderr); }
  var out = path.join(s.keep === false ? require('os').tmpdir() : OUT, s.id + '.png'); var prof = path.join(require('os').tmpdir(), 'solo-shoot-' + (s.profile || s.id)); if (!s.profile) fs.rmSync(prof, { recursive: true, force: true });
  var size = s.phone ? '390,844' : (s.w || 1440) + ',' + (s.h || 900), scale = (s.phone || (s.w && s.w < 700)) ? '3' : '2';
  var a = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + prof, '--window-size=' + size, '--force-device-scale-factor=' + scale, '--virtual-time-budget=' + (s.budget || 9000), '--screenshot=' + out, frameUrl(s)];
  var r = cp.spawnSync(CHROME, a, { encoding: 'utf8', timeout: 90000 });
  var ok = fs.existsSync(out) && fs.statSync(out).size > 10000;
  if (ok && s.crop) { var c = s.crop; cp.spawnSync('sips', ['--cropOffset', String(c[1]), String(c[0]), '-c', String(c[3]), String(c[2]), out], { encoding: 'utf8' }); }   // [x, y, w, h] in device pixels
  console.log((ok ? '✓ ' : '✗ ') + s.id + (ok ? ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB)' : ' ' + (r.stderr || '').split('\n').slice(-3).join(' | ')));
  if (ok) done++;
});
console.log(done + ' screenshot(s) in ' + OUT);
