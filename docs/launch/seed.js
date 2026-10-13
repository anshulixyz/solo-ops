#!/usr/bin/env node
/* docs/launch/seed.js <folder> — builds the launch-screenshot sample project
   ("Pocket Studio", see SHOTLIST.md) inside a scratch copy of Solo Ops.
   Everything invented. Runs the real CLI so the log, ids and stamps are
   genuine; only activity.json, posted stats and link titles are written
   directly (the pages fetch titles when they save a link; the CLI does not).
   Never point this at the owner's folder: it refuses a data/ that has files. */
var fs = require('fs'), path = require('path'), cp = require('child_process');
var ROOT = process.argv[2]; if (!ROOT) { console.error('usage: node seed.js <scratch copy>'); process.exit(1); }
var DATA = path.join(ROOT, 'data');
if (fs.existsSync(DATA) && fs.readdirSync(DATA).some(function (f) { return /\.json$/.test(f); })) { console.error('refusing: ' + DATA + ' already holds data files'); process.exit(1); }
fs.mkdirSync(DATA, { recursive: true });
function solo(args, src) { var a = ['solo.js'].concat(args); if (src) a.push('--as', src.who, '--note', src.note); var r = cp.spawnSync('node', a, { cwd: ROOT, encoding: 'utf8' }); if (r.status !== 0) { console.error('✗ node solo.js ' + args.join(' ') + '\n' + r.stderr); process.exit(1); } return r.stdout; }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function stamp(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function day(d) { return stamp(d).slice(0, 10); }
function at(offsetDays, hh, mm) { var d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(hh, mm || 0, 0, 0); return d; }
var now = new Date();
var AG = { who: 'agent', note: '' }; function agent(note) { return { who: 'agent', note: note }; }

/* ---- workspace + boards ---- */
fs.writeFileSync(path.join(ROOT, 'solo.config.js'), fs.readFileSync(path.join(ROOT, 'solo.config.js'), 'utf8')
  .replace("name: 'Solo Ops',", "name: 'Pocket Studio',").replace("eyebrow: 'Solo founder ops',", "eyebrow: 'Mara · building in public',"));
solo(['template', 'settings']);
solo(['boards', 'add', 'Ops', '--from', 'blank']);
solo(['workspaces', 'add', 'Newsletter', '--apps', 'social', '--boards', 'Issues']);

/* ---- Launch runway: 24 tasks ---- */
var T = [];
function add(title, flags, src) { var out = solo(['add', title].concat(flags || []), src); var m = out.match(/\[(t[a-z0-9]+)\]/); T.push({ id: m ? m[1] : '', title: title }); return m ? m[1] : ''; }
// doing (3)
var tDemo = add('Record the 60-second demo', ['--proj', 'launch', '--pri', 'high', '--tags', 'video', '--steps', 'Script the three beats|Set up the light and the phone|Record take 1|Record take 2 with the new hook|Pick the take|Export 1080p'], agent('from the plan we made on Monday'));
solo(['start', tDemo]); solo(['check', tDemo, '1']); solo(['check', tDemo, '2']); solo(['check', tDemo, '3']);
solo(['note', tDemo, 'Take 1 is fine until the pricing line. Re-record from beat 2.']);
var tCopy = add('Landing page copy, final pass', ['--proj', 'launch', '--pri', 'high', '--tags', 'website,copy', '--due', day(at(2, 0))]);
solo(['start', tCopy]);
var tEmail = add('Onboarding email sequence (3 emails)', ['--proj', 'launch', '--pri', 'medium', '--tags', 'email', '--steps', 'Welcome|Day 2: the one feature|Day 5: ask for a reply']);
solo(['start', tEmail]); solo(['check', tEmail, '1']);
// meetings this week (4)
var callStart = new Date(now.getTime() - 10 * 60000), callEnd = new Date(now.getTime() + 20 * 60000);
var tCall = add('Call with the editor', ['--proj', 'launch', '--tags', 'meeting', '--at', stamp(callStart), '--until', pad(callEnd.getHours()) + ':' + pad(callEnd.getMinutes()), '--ext', 'gcal:7f3a21'], agent('from Google Calendar'));
solo(['step', tCall, 'Agree the cut for the launch video']); solo(['step', tCall, 'Ask about the thumbnail']);
add('Weekly check-in with Sam', ['--proj', 'general', '--tags', 'meeting', '--at', stamp(at(1, 10, 0)), '--until', '10:30', '--ext', 'gcal:7f3a22'], agent('from Google Calendar'));
add('Investor intro (Priya)', ['--proj', 'launch', '--tags', 'meeting', '--at', stamp(at(2, 14, 0)), '--until', '14:45', '--ext', 'gcal:7f3a23'], agent('from Google Calendar'));
add('Design review: onboarding screens', ['--proj', 'launch', '--tags', 'meeting,design', '--at', stamp(at(3, 11, 30)), '--until', '12:15', '--ext', 'gcal:7f3a24'], agent('from Google Calendar'));
// to do (11 incl. deadlines)
add('Submit the App Store listing', ['--proj', 'launch', '--pri', 'high', '--tags', 'release', '--due', day(at(5, 0)), '--steps', 'Screenshots in three sizes|Description under 170 words|Privacy answers']);
add('Send the press kit to 10 writers', ['--proj', 'launch', '--pri', 'high', '--tags', 'press', '--due', day(at(-1, 0))]);
add('Set up the waitlist form', ['--proj', 'launch', '--pri', 'high', '--tags', 'website', '--steps', 'Form on the landing page|Thank-you page|Test with two addresses']);
add('Pricing page: two tiers, one table', ['--proj', 'launch', '--pri', 'medium', '--tags', 'website,copy']);
add('Write the launch post', ['--proj', 'launch', '--pri', 'high', '--tags', 'content', '--steps', 'The problem in one line|What Pocket Studio does|Who it is for|The ask']);
add('Thumbnail A/B for the demo', ['--proj', 'content', '--pri', 'medium', '--tags', 'video,design']);
add('Export the demo in 9:16 for Shorts', ['--proj', 'content', '--pri', 'medium', '--tags', 'video']);
add('Reply to the beta testers (6 emails)', ['--proj', 'general', '--pri', 'medium', '--tags', 'email']);
add('Set up the sending domain', ['--proj', 'general', '--pri', 'low', '--tags', 'setup,email', '--steps', 'DNS records|Warm up for a week|Test from Gmail']);
add('Fix the export crash on long clips', ['--proj', 'general', '--pri', 'high', '--tags', 'bug']);
add('Launch day checklist', ['--proj', 'launch', '--pri', 'medium', '--tags', 'release', '--steps', 'Post at 9:00|Email the waitlist|Reply to every comment for 2 hours|Screenshot the numbers']);
// done (6)
['Name and one-line pitch', 'Logo and app icon', 'Beta build to 12 testers', 'Set up Pocket Studio on the Mac', 'Trim the demo to 60 seconds', 'Write the FAQ'].forEach(function (t, i) { var id = add(t, ['--proj', i < 3 ? 'launch' : 'general', '--pri', i === 0 ? 'high' : 'medium', '--tags', i === 1 ? 'design' : i === 4 ? 'video' : 'launch']); solo(['done', id], i === 4 ? agent('you said it was done in our chat') : undefined); });
// later (3) + bucket (1)
add('Localize the landing page (ES, PT)', ['--proj', 'launch', '--pri', 'low', '--col', 'later', '--tags', 'website']);
add('Affiliate program', ['--proj', 'launch', '--pri', 'low', '--col', 'later']);
add('Podcast appearances: list 5 shows', ['--proj', 'content', '--pri', 'low', '--col', 'later', '--tags', 'press']);
add('A template gallery inside the app', ['--proj', 'general', '--pri', 'low', '--col', 'bucket']);

/* ---- Ops board: 8 tasks ---- */
var ops = ['--board', 'ops'];
['Monthly invoices', 'Renew the domain', 'Bookkeeping: September', 'Update the privacy policy'].forEach(function (t) { solo(['add', t, '--proj', 'general', '--pri', 'medium'].concat(ops)); });
var tInv = solo(['add', 'Pay the editor', '--proj', 'general', '--pri', 'high', '--due', day(at(3, 0))].concat(ops)).match(/\[(t[a-z0-9]+)\]/)[1];
solo(['add', 'Backup the raw footage drive', '--proj', 'general', '--pri', 'low', '--col', 'later'].concat(ops));
['Set up the business bank account', 'Cancel the unused SaaS'].forEach(function (t) { var id = solo(['add', t, '--proj', 'general', '--pri', 'low'].concat(ops)).match(/\[(t[a-z0-9]+)\]/)[1]; solo(['done', id].concat(ops)); });

/* ---- posts: 9 ---- */
var P = [];
function post(title, flags) { var out = solo(['social', 'add', title].concat(flags)); var m = out.match(/\[(p[a-z0-9]+)\]/); P.push(m ? m[1] : ''); return m ? m[1] : ''; }
var p1 = post('Why I am building Pocket Studio', ['--at', stamp(at(-9, 9, 0)), '--type', 'story', '--project', 'launch', '--copy', 'Every founder I know records a demo on their phone, then spends a Sunday fixing it on a laptop. Pocket Studio is the Sunday, gone.']);
var p2 = post('The ugly first version', ['--at', stamp(at(-6, 17, 0)), '--type', 'update', '--project', 'launch', '--copy', 'Here is what it looked like three weeks ago. Shipping anyway.']);
var p3 = post('Beta: twelve testers, one request', ['--at', stamp(at(-2, 12, 0)), '--type', 'update', '--project', 'launch', '--copy', 'Twelve people, one thing they all asked for: captions. Building it this week.']);
[p1, p2, p3].forEach(function (id, i) { solo(['social', 'posted', id, '--url', 'https://x.com/mara/status/18' + (40 + i) + '0'], i === 2 ? agent('marked posted after you pasted the link') : undefined); });
var p4 = post('Teaser: one feature, no explanation', ['--at', stamp(at(1, 12, 0)), '--type', 'teaser', '--project', 'launch', '--copy', '15 seconds. Sound on.', '--prep', 'Export the 9:16 cut|Caption file|Schedule in X']);
solo(['social', 'check', p4, '1']); solo(['social', 'ready', p4]);
var p5 = post('How the demo was made (thread)', ['--at', stamp(at(3, 9, 0)), '--type', 'thread', '--project', 'content', '--prep', 'Pick 5 screenshots|Write the first line 10 ways']);
var p6 = post('Launch day', ['--at', stamp(at(6, 9, 0)), '--type', 'launch', '--project', 'launch', '--copy', 'Pocket Studio is live. Record on your phone, publish from your phone.', '--prep', 'Final video|Link checked|Reply window blocked in the calendar']);
solo(['social', 'ready', p6]);
post('What the first 100 users did', ['--at', stamp(at(9, 9, 0)), '--type', 'update', '--project', 'launch']);
post('Three mistakes from launch week', ['--at', stamp(at(11, 17, 0)), '--type', 'story', '--project', 'content']);
post('Captions are here', ['--at', stamp(at(13, 12, 0)), '--type', 'update', '--project', 'launch']);
// posted stats (the page records these; the CLI does not)
var sf = path.join(DATA, 'social.json'); var sj = JSON.parse(fs.readFileSync(sf, 'utf8'));
var stats = { }; stats[p1] = { views: '12400', likes: '318', reposts: '41', replies: '27', bookmarks: '66' }; stats[p2] = { views: '6100', likes: '142', reposts: '12', replies: '19', bookmarks: '20' }; stats[p3] = { views: '9800', likes: '240', reposts: '30', replies: '44', bookmarks: '51' };
sj.posts.forEach(function (p) { if (stats[p.id]) { p.posted = p.posted || {}; p.posted.stats = stats[p.id]; } });
fs.writeFileSync(sf, JSON.stringify(sj, null, 2) + '\n');

/* ---- Newsletter workspace ---- */
var nw = ['--ws', 'newsletter'];
['Issue 12: the demo story', 'Fix the broken archive link', 'Move the list to the new sender', 'Issue 13: launch recap', 'Ask three readers for a quote'].forEach(function (t, i) { var id = solo(['add', t, '--pri', i < 2 ? 'high' : 'medium'].concat(nw)).match(/\[(t[a-z0-9]+)\]/)[1]; if (i === 0) solo(['start', id].concat(nw)); if (i === 1) solo(['done', id].concat(nw)); });
solo(['social', 'add', 'Issue 12 goes out', '--at', stamp(at(2, 8, 0)), '--type', 'update'].concat(nw));
solo(['social', 'add', 'Issue 13 goes out', '--at', stamp(at(9, 8, 0)), '--type', 'update'].concat(nw));

/* ---- scripts, notes ---- */
var tmp = path.join(ROOT, '.seed-tmp'); fs.mkdirSync(tmp, { recursive: true });
function file(name, text) { var f = path.join(tmp, name); fs.writeFileSync(f, text); return f; }
solo(['scripts', 'add', 'Demo: 60 seconds, one phone', '--file', file('s1.md', '# Demo: 60 seconds, one phone\n\n## Hook\nYou recorded it on your phone. Why does publishing need a laptop?\n\n## Script\n1. Phone in hand, record a clip, 4 seconds.\n2. Tap once: trimmed, captioned.\n3. Pick the thumbnail from three frames.\n4. Publish to X and YouTube from the same screen.\n5. Show the result on both feeds.\n6. "That was one minute. Here is the link."\n7. End card: Pocket Studio · pocketstudio.app\n\n## Inserts\n- Screen recording of the trim gesture\n- The three-frame picker, slow\n\n## Prep\n- [x] Charge the phone\n- [ ] Clean the lens\n- [ ] Print the beats\n')]);
solo(['scripts', 'add', 'Thread: how the demo was made', '--file', file('s2.md', '# Thread: how the demo was made\n\n## Hook\nI made the launch demo on the thing I am launching.\n\n## Script\n1. The problem with laptop editing.\n2. Why one tap matters.\n3. The capture, the trim, the captions.\n4. What broke (the export crash).\n5. The fix, in one commit.\n\n## Inserts\n- Screenshot of the crash log\n\n## Prep\n- [ ] Five screenshots\n')]);
solo(['scripts', 'add', 'Captions, in 30 seconds', '--file', file('s3.md', '# Captions, in 30 seconds\n\n## Hook\nTwelve beta testers asked for one thing.\n\n## Script\n1. Record.\n2. Captions appear.\n3. Fix one word.\n4. Done.\n\n## Inserts\n\n## Prep\n')], agent('from your idea in Inspiration'));
solo(['notes', 'add', 'Launch post, draft 2', '--file', file('n1.md', '# Launch post, draft 2\n\nEvery founder I know has a folder called "demo" with eleven files in it. ~~None of them are published.~~ ++Ten of them never got published.++\n\nPocket Studio records, trims and captions on the phone, and publishes from the same screen. [[Add one line about the price here, keep it under 12 words]]\n\nIt is live today. ~~Link in bio.~~ ++Link below.++\n')]);
solo(['notes', 'add', 'FAQ', '--file', file('n2.md', '# FAQ\n\n**Does it work offline?** Recording and trimming, yes. Captions need a connection.\n\n**Which platforms?** X and YouTube today. TikTok next.\n\n**Price?** Free for 10 clips a month, then one plan.\n')]);
solo(['notes', 'add', 'Investor intro: what to say', '--file', file('n3.md', '# Investor intro: what to say\n\n- 12 testers, 9 weekly active\n- Demo on launch day, no laptop involved\n- Ask: two intros, not money\n')]);
fs.rmSync(tmp, { recursive: true, force: true });

/* ---- inspiration ---- */
var I = [];
function inspo(text, flags) { var out = solo(['inspo', 'add', text].concat(flags || [])); var m = out.match(/\[(i[a-z0-9]+)\]/); I.push(m ? m[1] : ''); return m ? m[1] : ''; }
var i1 = inspo('https://example.com/blog/show-your-work #launch #story', ['--ws', 'main']);
var i2 = inspo('https://example.com/posts/the-one-tap-rule #design', ['--ws', 'main']);
var i3 = inspo('https://example.com/talks/demo-first #video', ['--ws', 'main']);
var i4 = inspo('Idea: captions as the whole pitch — one clip, no words, just the captions appearing #content #video', ['--ws', 'main']);
var i5 = inspo('Quote: "Nobody finishes the tutorial. Everybody finishes the demo." #copy', ['--ws', 'main']);
var i6 = inspo('Idea: a newsletter issue that is only screenshots #newsletter', ['--ws', 'newsletter']);
var inf = path.join(DATA, 'inspiration.json'); var ij = JSON.parse(fs.readFileSync(inf, 'utf8'));
var titles = {}; titles[i1] = ['Show your work: a launch in public', 'Why posting the ugly version first beats the polished reveal.']; titles[i2] = ['The one-tap rule', 'If the main action needs two taps, it needs a redesign.']; titles[i3] = ['Demo first, explain never', 'A 20-minute talk on leading with the product.'];
ij.items.forEach(function (x) { if (titles[x.id]) { x.title = titles[x.id][0]; x.meta = { title: titles[x.id][0], description: titles[x.id][1], site: 'example.com' }; } });
fs.writeFileSync(inf, JSON.stringify(ij, null, 2) + '\n');
solo(['inspo', 'use', i4, '--as', 'script'], agent('turned the idea into a script'));
solo(['inspo', 'use', i5, '--as', 'post']);

/* ---- activity: 12-day streak, 14 weeks of history, 9 changes today ---- */
var days = {}; var d = new Date(); d.setHours(12, 0, 0, 0);
for (var i = 0; i < 98; i++) { var k = day(d); var w = d.getDay(); if (i < 12 || (w !== 0 && w !== 6 && (i % 3 !== 0)) || i % 7 === 2) { var n = i === 0 ? 9 : 1 + ((i * 7) % 6); days[k] = { runway: Math.max(1, n - 1), social: i % 2 ? 1 : 0, writing: i % 4 === 0 ? 1 : 0 }; } d.setDate(d.getDate() - 1); }
fs.writeFileSync(path.join(DATA, 'activity.json'), JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), days: days, lastActive: new Date(now.getTime() - 60000).toISOString(), lastByApp: { runway: new Date(now.getTime() - 60000).toISOString(), social: new Date(now.getTime() - 3 * 3600000).toISOString(), scripts: new Date(now.getTime() - 26 * 3600000).toISOString(), writing: new Date(now.getTime() - 5 * 3600000).toISOString(), inspiration: new Date(now.getTime() - 2 * 3600000).toISOString() } }, null, 2) + '\n');

/* ---- backup: a real folder copy, dated yesterday evening ---- */
var bdir = path.join(path.dirname(ROOT), 'pocket-studio-backup'); fs.mkdirSync(bdir, { recursive: true });
solo(['backup', '--to', bdir]);
var bf = path.join(DATA, 'backup.json'); var bj = JSON.parse(fs.readFileSync(bf, 'utf8')); bj.lastAt = at(-1, 21, 0).toISOString(); fs.writeFileSync(bf, JSON.stringify(bj, null, 2) + '\n');

console.log('✓ Pocket Studio seeded in ' + ROOT + '\n  ' + solo(['today']).split('\n').slice(0, 3).join('\n  '));
