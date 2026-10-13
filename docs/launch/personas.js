#!/usr/bin/env node
/* docs/launch/personas.js <folder> <persona> — seeds one of three launch personas
   into a scratch copy (same rules as seed.js: real CLI, invented people, refuses
   a data/ that already has files). Personas, each a real kind of solo builder:
     tomas  · indie SaaS founder; AI writes code and answers support with him
     noor   · YouTube + newsletter creator; sponsors, scripts, a posting arc
     lena   · freelance designer; ONE board for clients, money and life
   The data is deliberately specific: amounts, invoice numbers, tools, half-done
   steps, notes in the person's own words, personal errands between work. */
var fs = require('fs'), path = require('path'), cp = require('child_process');
var ROOT = process.argv[2], WHO = process.argv[3]; if (!ROOT || !WHO) { console.error('usage: node personas.js <scratch copy> tomas|noor|lena'); process.exit(1); }
var DATA = path.join(ROOT, 'data');
if (fs.existsSync(DATA) && fs.readdirSync(DATA).some(function (f) { return /\.json$/.test(f); })) { console.error('refusing: ' + DATA + ' already holds data files'); process.exit(1); }
fs.mkdirSync(DATA, { recursive: true });
function solo(args, note) { var a = ['solo.js'].concat(args); if (note) a.push('--as', note.who || 'agent', '--note', note.note); var r = cp.spawnSync('node', a, { cwd: ROOT, encoding: 'utf8' }); if (r.status !== 0) { console.error('✗ node solo.js ' + args.join(' ') + '\n' + r.stderr + r.stdout); process.exit(1); } return r.stdout; }
function idOf(out, p) { var m = out.match(new RegExp('\\[(' + p + '[a-z0-9]+)\\]')); return m ? m[1] : ''; }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function stamp(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function day(d) { return stamp(d).slice(0, 10); }
function at(offsetDays, hh, mm) { var d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(hh, mm || 0, 0, 0); return d; }
var now = new Date(); var nowIn = function (min) { return new Date(now.getTime() + min * 60000); };
function config(name, eyebrow, projects, board) {
  var f = path.join(ROOT, 'solo.config.js'); var s = fs.readFileSync(f, 'utf8');
  s = s.replace(/name: '[^']*',/, "name: '" + name + "',").replace(/eyebrow: '[^']*',/, "eyebrow: '" + eyebrow + "',");
  if (board) s = s.replace("title: 'Launch Runway',", "title: '" + board.title + "',").replace("sprintLabel: 'Sprint progress',", "sprintLabel: '" + board.label + "',").replace(/milestones: \[[^\]]*\],/, 'milestones: [' + board.milestones.map(function (m) { return "'" + m + "'"; }).join(', ') + '],').replace(/focus: \[[\s\S]*?\n        \]/, 'focus: [\n' + board.focus.map(function (x) { return "          { k: '" + x[0] + "', t: '" + x[1].replace(/'/g, "\\'") + "', s: '" + x[2].replace(/'/g, "\\'") + "' }"; }).join(',\n') + '\n        ]');
  if (projects) s = s.replace(/projects: \[[\s\S]*?\n    \],/, 'projects: [\n' + projects.map(function (p) { return "      { name: '" + p[0] + "', hue: " + p[1] + ' }'; }).join(',\n') + '\n    ],');
  fs.writeFileSync(f, s);
}
// task helper: t(title, { col, pri, proj, tags, steps, done:[n], note, at, until, due, board, src })
function t(title, o) {
  o = o || {}; var args = ['add', title]; if (o.board) args.push('--board', o.board);
  if (o.proj) args.push('--proj', o.proj); if (o.pri) args.push('--pri', o.pri); if (o.tags) args.push('--tags', o.tags); if (o.steps) args.push('--steps', o.steps);
  if (o.at) args.push('--at', o.at); if (o.until) args.push('--until', o.until); if (o.due) args.push('--due', o.due); if (o.ext) args.push('--ext', o.ext);
  if (o.col === 'later' || o.col === 'bucket') args.push('--col', o.col);
  var id = idOf(solo(args, o.src), 't'); var b = o.board ? ['--board', o.board] : [];
  if (o.col === 'doing') solo(['start', id].concat(b)); if (o.col === 'done') solo(['done', id].concat(b), o.src);
  (o.done || []).forEach(function (n) { solo(['check', id, String(n)].concat(b)); });
  if (o.note) solo(['note', id, o.note].concat(b));
  return id;
}
function post(title, o) { var a = ['social', 'add', title, '--at', o.at, '--type', o.type || 'update']; if (o.copy) a.push('--copy', o.copy); if (o.prep) a.push('--prep', o.prep); if (o.project) a.push('--project', o.project); var id = idOf(solo(a), 'p'); if (o.status === 'posted') solo(['social', 'posted', id, '--url', o.url || 'https://x.com/' + WHO + '/status/18' + Math.floor(Math.random() * 900 + 100)]); if (o.status === 'ready') solo(['social', 'ready', id]); return id; }
function activity(streak, perDay) {
  var days = {}; var d = new Date(); d.setHours(12, 0, 0, 0);
  for (var i = 0; i < 98; i++) { var k = day(d); var w = d.getDay(); if (i < streak || (w !== 0 && w !== 6 && i % 4 !== 1)) { var n = i === 0 ? perDay : 1 + ((i * 5) % 6); days[k] = { runway: Math.max(1, n - 1), social: i % 3 ? 1 : 0 }; } d.setDate(d.getDate() - 1); }
  fs.writeFileSync(path.join(DATA, 'activity.json'), JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), days: days, lastActive: nowIn(-2).toISOString(), lastByApp: { runway: nowIn(-2).toISOString(), social: nowIn(-200).toISOString() } }, null, 2) + '\n');
}
function backup() { var bdir = path.join(path.dirname(ROOT), WHO + '-backup'); fs.mkdirSync(bdir, { recursive: true }); solo(['backup', '--to', bdir]); var bf = path.join(DATA, 'backup.json'); var bj = JSON.parse(fs.readFileSync(bf, 'utf8')); bj.lastAt = at(-1, 21, 0).toISOString(); fs.writeFileSync(bf, JSON.stringify(bj, null, 2) + '\n'); }
var AG = function (n) { return { who: 'agent', note: n }; };

var P = {
  /* ---- Tomas: Shiftlog, rota software for small clinics. AI pairs on code and drafts support replies. ---- */
  tomas: function () {
    config('Shiftlog', 'Tomas · rota software for small clinics', [['product', 20], ['support', 190], ['money', 45], ['life', 290]], { title: 'This week', label: 'Week 42', milestones: ['Mon', 'Wed', 'Fri', 'Ship'], focus: [['P1', 'Ship CSV import by Friday', '11 clinics asked; the pilot call wants to see it'], ['P2', 'Zero high tickets open', 'Agent drafts, I approve, same day']] });
    solo(['template', 'settings']); solo(['boards', 'add', 'Support', '--from', 'blank']);
    // doing
    t('Stripe webhook retries fail since Friday', { col: 'doing', pri: 'high', proj: 'product', tags: 'bug,stripe', steps: 'Replay the 3 events from the Stripe dashboard|Find why the signature check fails on retries|Add a test with a replayed event|Email the 3 clinics once they are upgraded', done: [1, 2], note: 'It is the raw body. Express parses JSON before the signature check on the retry route only. Fix is one middleware order change; Claude found it in 4 minutes, took me 2 hours Friday.' });
    t('CSV import for the rota (11 clinics asked)', { col: 'doing', pri: 'high', proj: 'product', tags: 'feature', steps: 'Column mapping screen|Dry run with row errors|Import|Undo an import', done: [1, 2], due: day(at(3, 0)) });
    // meetings
    t('Pilot call: Heath Lane Surgery (Dr Amari)', { pri: 'medium', proj: 'support', tags: 'meeting', at: stamp(nowIn(-15)), until: pad(nowIn(15).getHours()) + ':' + pad(nowIn(15).getMinutes()), ext: 'gcal:a91', src: AG('from Google Calendar'), steps: 'Show the CSV import dry run|Ask about the locum rota|Do not promise the NHS mail integration' });
    t('Weekly call with Ana (accountant)', { proj: 'money', tags: 'meeting', at: stamp(at(1, 16, 0)), until: '16:30', ext: 'gcal:a92', src: AG('from Google Calendar') });
    t('Physio', { proj: 'life', tags: 'meeting', at: stamp(at(2, 8, 15)), until: '09:00', ext: 'gcal:a93', src: AG('from Google Calendar') });
    // to do
    t('Reply to 9 Help Scout tickets (drafted)', { pri: 'high', proj: 'support', tags: 'support', note: 'Agent drafted all 9 this morning from the docs. 2 need a human: the refund (Dr Amari, charged twice, 2 × £49) and the one asking for a feature we will not build.', src: AG('drafted 9 replies, 2 flagged for you') });
    t('Refund Dr Amari: charged twice, 2 × £49', { pri: 'high', proj: 'support', tags: 'support,stripe', due: day(at(0, 0)) });
    t('Sentry: /export crashes with 0 staff (14×)', { pri: 'high', proj: 'product', tags: 'bug', steps: 'Reproduce with the Harbour Dental account|Guard the empty case|Deploy', note: 'Sentry link in the agent note. Harbour Dental hit it 11 of the 14 times.' });
    t('Leave Heroku before the 1 Nov bill ($312)', { pri: 'medium', proj: 'money', tags: 'infra', due: day(at(9, 0)), steps: 'Fly.io or Render: 1-hour spike each|Move Postgres with pg_dump|DNS switch on a Sunday 06:00' });
    t('Changelog 2.4: CSV import + Stripe fix', { pri: 'medium', proj: 'product', tags: 'content' });
    t('Onboarding email 3 sends at 03:00 in the US', { pri: 'medium', proj: 'product', tags: 'bug,email' });
    t('Ask the 3 churned clinics why (Mar, Jun, Sep)', { pri: 'low', proj: 'support', tags: 'research' });
    t('Pay the quarterly VAT (HMRC) — £2,140', { pri: 'high', proj: 'money', tags: 'admin', due: day(at(6, 0)) });
    t('Cancel Adobe before the 19th (used it once this year)', { pri: 'low', proj: 'life', tags: 'admin', due: day(at(5, 0)) });
    t('Sofia\'s allergy form back by Friday', { pri: 'medium', proj: 'life', due: day(at(3, 0)) });
    t('Book the car MOT', { pri: 'low', proj: 'life' });
    // done
    ['Deploy 2.3.1 (hotfix for the locum rota crash)', 'Call with Harbour Dental about the export bug', 'Renew the domain (shiftlog.app, 2 years)', 'Reply to the 12 Monday tickets'].forEach(function (x, i) { t(x, { col: 'done', proj: i === 2 ? 'money' : i === 1 || i === 3 ? 'support' : 'product', pri: i === 0 ? 'high' : 'medium', src: i === 3 ? AG('14 drafts, all approved') : undefined }); });
    // later / bucket
    t('NHS mail integration (3 clinics asked, needs the DSP toolkit)', { col: 'later', proj: 'product', pri: 'low', note: 'Not before 10 paying clinics ask.' });
    t('Rota templates marketplace', { col: 'bucket', proj: 'product', pri: 'low' });
    t('Raise prices for new sign-ups (£49 → £69)', { col: 'later', proj: 'money', pri: 'medium' });
    // support board
    var S = { board: 'support' };
    t('Harbour Dental: export crash (linked to the Sentry task)', Object.assign({ pri: 'high', proj: 'support', tags: 'ticket', note: 'Promised a fix this week. They are the loudest and the nicest.' }, S));
    t('Dr Amari: duplicate charge', Object.assign({ pri: 'high', proj: 'support', tags: 'ticket,refund', col: 'doing' }, S));
    t('Bay Physio: "can locums see their own rota only?"', Object.assign({ pri: 'medium', proj: 'support', tags: 'ticket,feature', note: 'Yes, since 2.2. Agent drafted the how-to with screenshots.' }, S));
    t('Greenway Vets: wants the invoice in their company name', Object.assign({ pri: 'low', proj: 'support', tags: 'ticket' }, S));
    ['Ridge Clinic: password reset loop', 'Oakfield: CSV of last month\'s shifts', 'Two clinics: "where is the iOS app?" (there is none, replied with the PWA guide)'].forEach(function (x) { t(x, Object.assign({ col: 'done', proj: 'support', tags: 'ticket', src: AG('drafted, you approved') }, S)); });
    // posts
    post('Shipped: the Stripe retry bug, and what it taught me about Express middleware', { at: stamp(at(-5, 12, 0)), type: 'update', status: 'posted', copy: 'A webhook that works the first time and fails on every retry. 2 hours of my Friday, 4 minutes of an agent\'s Monday. The bug was middleware order.' });
    post('11 clinics asked for CSV import. Building it this week, in public.', { at: stamp(at(-2, 9, 0)), type: 'story', status: 'posted' });
    post('CSV import: the dry run screen (no imports without one)', { at: stamp(at(2, 12, 0)), type: 'teaser', status: 'ready', prep: 'Record the dry run|Blur the clinic names' });
    post('Changelog 2.4', { at: stamp(at(5, 9, 0)), type: 'launch' });
    post('Why I am leaving Heroku ($312 a month for a rota app)', { at: stamp(at(9, 17, 0)), type: 'story' });
    solo(['inspo', 'add', 'https://example.com/posts/pricing-page-teardowns #pricing', '--ws', 'main']); solo(['inspo', 'add', 'Idea: a public status page as marketing — clinics ask "is it down?" every week #product', '--ws', 'main']); solo(['inspo', 'add', 'Quote from Dr Amari on the call: "I just want to see who is in on Tuesday." #copy', '--ws', 'main']);
    activity(23, 11); backup();
  },

  /* ---- Noor: YouTube (54k) + a Sunday newsletter about running a one-person studio. Sponsors, scripts, an arc. ---- */
  noor: function () {
    config('Studio Noor', 'Noor · YouTube 54k · the Sunday letter', [['video', 20], ['newsletter', 45], ['sponsors', 190], ['life', 290]], { title: 'Pipeline', label: 'October', milestones: ['Script', 'Film', 'Edit', 'Upload'], focus: [['P1', 'Wednesday upload: the editor video', 'Thumbnail test decides the title'], ['P2', 'Close Descript at $4,000', 'Then the Q1 calendar is paid for']] });
    solo(['template', 'settings']);
    t('Film: "I replaced my editor with one prompt"', { col: 'doing', pri: 'high', proj: 'video', tags: 'film', steps: 'Script locked|Shot list|A-roll (2 setups)|Screen recordings of the 3 fails|B-roll: the timeline|Rough cut to Sam', done: [1, 2, 3], note: 'Keep the fail at 4:10 in — that is the video. Thumbnail text: "it deleted my intro".' });
    t('Letter #112: the sponsor math', { col: 'doing', pri: 'high', proj: 'newsletter', tags: 'write', steps: 'Pull the 12-month sponsor table|Three lines on what I turned down|Edit to 600 words', done: [1], due: day(at(4, 0)) });
    t('Descript offered $3,200 — counter at $4,000', { col: 'doing', pri: 'high', proj: 'sponsors', tags: 'deal', note: 'Counter at $4,000 with the usage clause. Last one with them was $2,800 in March and the video did 190k.', due: day(at(1, 0)) });
    t('Sponsor call: Riverside (Mia)', { proj: 'sponsors', tags: 'meeting', at: stamp(nowIn(-20)), until: pad(nowIn(10).getHours()) + ':' + pad(nowIn(10).getMinutes()), ext: 'gcal:n21', src: AG('from Google Calendar'), steps: 'Rate card|Ask about Q1 slots' });
    t('Edit review with Sam (rough cut)', { proj: 'video', tags: 'meeting', at: stamp(at(1, 11, 0)), until: '11:45', ext: 'gcal:n22', src: AG('from Google Calendar') });
    t('Record the podcast guest spot (Creator Economics)', { proj: 'video', tags: 'meeting', at: stamp(at(3, 15, 0)), until: '16:00', ext: 'gcal:n23', src: AG('from Google Calendar') });
    t('Thumbnail A/B: "it deleted my intro" vs face', { pri: 'high', proj: 'video', tags: 'thumbnail', steps: 'Two exports|TubeBuddy test for 24h|Pick' });
    t('10 titles for the editor video, pick 3', { pri: 'high', proj: 'video', tags: 'titles', src: AG('10 titles drafted from the script, in the note'), note: '1. I replaced my editor with one prompt\n2. My AI editor deleted my intro\n3. One prompt, three fails, one video\n4. The $0 editor (it cost me a day)\n5. …' });
    t('Chapters + description, Wednesday upload', { pri: 'medium', proj: 'video', tags: 'publish', due: day(at(2, 0)) });
    t('Community post: ask what broke for them this week', { pri: 'low', proj: 'video', tags: 'community' });
    t('Invoice Riverside: $2,400, due the 28th', { pri: 'medium', proj: 'sponsors', tags: 'invoice', due: day(at(7, 0)) });
    t('Media kit numbers: 54.2k · 31% · 7.1 min', { pri: 'medium', proj: 'sponsors', tags: 'deck' });
    t('Letter #113 draft: the camera I stopped using', { pri: 'medium', proj: 'newsletter', tags: 'write' });
    t('Reply to 40 comments (lighting video)', { pri: 'low', proj: 'video', tags: 'community', src: AG('drafted replies to the 12 questions; the rest are thanks') });
    t('Return the lav mics (wrong connector)', { pri: 'medium', proj: 'life', due: day(at(5, 0)) });
    t('Dad\'s flight — pick him up Sat 14:40', { pri: 'high', proj: 'life', at: stamp(at(4, 14, 40)) });
    t('Gym ×3 this week (1 done)', { pri: 'low', proj: 'life', steps: 'Mon|Wed|Fri', done: [1] });
    ['Upload: "The lighting setup that costs less than a lens"', 'Letter #111: ten things I stopped doing', 'Sponsor: Notion Q4 (signed, $5,500 for 2 videos)', 'Pay Sam (September edits, $1,800)'].forEach(function (x, i) { t(x, { col: 'done', proj: ['video', 'newsletter', 'sponsors', 'sponsors'][i], pri: i === 2 ? 'high' : 'medium' }); });
    t('Course: "one-person studio" (people keep asking; not before 100k)', { col: 'later', proj: 'video', pri: 'low' });
    t('Second channel for the raw talks', { col: 'bucket', proj: 'video', pri: 'low' });
    t('Hire a second editor for shorts', { col: 'later', proj: 'video', pri: 'medium', note: 'When shorts are 3 a week, not 1.' });
    // posts: the arc around the editor video
    post('The lighting video is up', { at: stamp(at(-6, 16, 0)), type: 'launch', status: 'posted', copy: 'New video: the lighting setup that costs less than a lens. 11 minutes, no sponsor, the one I wish I had two years ago.' });
    post('Sponsor math thread (what I turned down this year)', { at: stamp(at(-3, 12, 0)), type: 'thread', status: 'posted' });
    post('Teaser: "it deleted my intro" (15s clip)', { at: stamp(at(1, 18, 0)), type: 'teaser', status: 'ready', prep: 'Export the 4:10 fail as a vertical|Captions' });
    post('Upload day: I replaced my editor with one prompt', { at: stamp(at(2, 16, 0)), type: 'launch', prep: 'Thumbnail winner|Pinned comment with the prompt|Reply window 2h' });
    post('Sunday letter #112 goes out', { at: stamp(at(5, 8, 0)), type: 'update' });
    post('Behind the thumbnail test (the loser got 2.1%)', { at: stamp(at(8, 12, 0)), type: 'story' });
    solo(['scripts', 'add', 'I replaced my editor with one prompt', '--file', (function () { var f = path.join(ROOT, '.s.md'); fs.writeFileSync(f, '# I replaced my editor with one prompt\n\n## Hook\nI gave an AI my whole timeline and one sentence. It deleted my intro.\n\n## Script\n1. The prompt, on screen, 6 seconds.\n2. Fail one: it cut every pause, including the one that was the joke.\n3. Fail two: colour. Everything orange.\n4. Fail three (4:10): the intro is gone. Keep the real reaction.\n5. What it did well: the chapter markers, the captions, the selects.\n6. The honest verdict: an assistant, not an editor. Sam stays.\n7. End: the prompt is in the pinned comment.\n\n## Inserts\n- Timeline before / after\n- The three fails as screen recordings\n\n## Prep\n- [x] Script locked\n- [ ] Thumbnail test\n'); return f; })()]);
    fs.unlinkSync(path.join(ROOT, '.s.md'));
    solo(['inspo', 'add', 'https://example.com/watch/retention-graphs-explained #video #retention', '--ws', 'main']); solo(['inspo', 'add', 'Idea: a video where I only show the analytics, no face #video', '--ws', 'main']); solo(['inspo', 'add', 'Comment from @jen: "the lighting video is the first one I finished" #community', '--ws', 'main']);
    activity(41, 7); backup();
  },

  /* ---- Lena: freelance brand designer. One board. Clients, money and life side by side, because that is the week. ---- */
  lena: function () {
    config('Lena', 'Lena · brand design, one board for everything', [['client', 20], ['money', 45], ['studio', 190], ['life', 290]], { title: 'Everything', label: 'This month', milestones: ['Fjord r2', 'Hale signs', 'Marrow prints', 'VAT'], focus: [['P1', 'Fjord round 2 on Thursday', 'Warmer. Keep the mark.'], ['P2', 'Get paid', 'Marrow is 9 days late; Hale deposit this month']] });
    solo(['template', 'settings']);
    t('Fjord round 2: "warmer, less Scandinavian"', { col: 'doing', pri: 'high', proj: 'client', tags: 'fjord,identity', steps: 'Two warmer palettes|Logotype with the rounded terminal|Cup mockup|Send Thursday before 12', done: [1, 2], note: 'Marit said "it looks like our competitor" about v1 — she means the blue. Keep the mark, change everything around it.', due: day(at(2, 0)) });
    t('Marrow packaging → printer (300 dpi, bleed)', { col: 'doing', pri: 'high', proj: 'client', tags: 'marrow,print', steps: 'Outline the fonts|Check the black is rich black|Upload to the printer portal', done: [1] });
    t('Invoice #042 Marrow €1,850 — 9 days late', { pri: 'high', proj: 'money', tags: 'invoice', due: day(at(-9, 0)), note: 'Second reminder sent Monday. Call Tom if nothing by Thursday.' });
    t('Kickoff: Hale & Co. (Priya, Jon) — website + brand', { proj: 'client', tags: 'meeting,hale', at: stamp(nowIn(-25)), until: pad(nowIn(20).getHours()) + ':' + pad(nowIn(20).getMinutes()), ext: 'gcal:l31', src: AG('from Google Calendar'), steps: 'Scope: brand first, site in Jan|Budget: they said €6–8k|Ask who signs off' });
    t('Fjord: present round 2 (Marit)', { proj: 'client', tags: 'meeting,fjord', at: stamp(at(2, 14, 0)), until: '14:45', ext: 'gcal:l32', src: AG('from Google Calendar') });
    t('Vet: Momo\'s vaccine', { proj: 'life', tags: 'meeting', at: stamp(at(1, 17, 30)), until: '18:00', ext: 'gcal:l33', src: AG('from Google Calendar') });
    t('Dentist', { proj: 'life', tags: 'meeting', at: stamp(at(6, 9, 30)), until: '10:15', ext: 'gcal:l34', src: AG('from Google Calendar') });
    t('Hale & Co. proposal: brand only, €7,200', { pri: 'high', proj: 'client', tags: 'hale,proposal', due: day(at(3, 0)), steps: 'Scope page|Timeline: 5 weeks from deposit|50% deposit clause', src: AG('drafted from your last two proposals; numbers are yours') });
    t('VAT return Q3 — due 7 Nov', { pri: 'high', proj: 'money', tags: 'tax', due: day(at(25, 0)), steps: 'Export Q3 invoices|Receipts folder to Ana|Pay' });
    t('Chase the Studio Vera testimonial (promised in August)', { pri: 'low', proj: 'studio', tags: 'website' });
    t('Portfolio: add Marrow and Fjord once they launch', { pri: 'medium', proj: 'studio', tags: 'website' });
    t('Reply to 3 leads (one is a bike brand)', { pri: 'medium', proj: 'studio', tags: 'leads', src: AG('drafted 3 replies: two polite no, one call invite') });
    t('Adobe yearly before the 19th (saves €240)', { pri: 'medium', proj: 'money', tags: 'admin', due: day(at(5, 0)) });
    t('Mum\'s birthday — the Hockney book', { pri: 'high', proj: 'life', due: day(at(4, 0)) });
    t('Swim Tue / Thu', { pri: 'low', proj: 'life', steps: 'Tue|Thu', done: [1] });
    t('Visa renewal appointment (3-month wait)', { pri: 'medium', proj: 'life', tags: 'admin' });
    t('Flat: the kitchen tap, call the landlord', { pri: 'low', proj: 'life' });
    ['Fjord round 1 presented', 'Marrow: approved the final packaging', 'Invoice #041 Studio Vera — paid', 'Taxes: Q2 paid', 'Momo: new food (the vet\'s brand)'].forEach(function (x, i) { t(x, { col: 'done', proj: ['client', 'client', 'money', 'money', 'life'][i], pri: 'medium' }); });
    t('Raise the day rate to €650 for new clients', { col: 'later', proj: 'money', pri: 'medium', note: 'After Hale signs.' });
    t('A small type foundry (the display face from Marrow)', { col: 'bucket', proj: 'studio', pri: 'low' });
    t('Workshop for founders: "your brand in a day"', { col: 'later', proj: 'studio', pri: 'low' });
    post('Marrow Bakery packaging — a thread on the three bad versions first', { at: stamp(at(-4, 12, 0)), type: 'thread', status: 'posted' });
    post('Fjord Coffee: round 2 coming (warmer)', { at: stamp(at(3, 17, 0)), type: 'teaser', prep: 'Pick the cup mockup|Ask Marit if I can post' });
    post('Marrow on shelves', { at: stamp(at(10, 12, 0)), type: 'launch' });
    solo(['notes', 'add', 'Hale & Co. proposal, draft', '--file', (function () { var f = path.join(ROOT, '.n.md'); fs.writeFileSync(f, '# Hale & Co. — brand identity\n\nScope: naming check, logotype, palette, type, a 12-page guideline. ~~Website included.~~ ++Website as a second phase in January.++\n\nFee: €7,200, 50% deposit, 3 rounds. [[Add the "extra rounds at €650/day" line from the Marrow proposal]]\n\nTimeline: 5 weeks from the deposit.\n'); return f; })()]);
    fs.unlinkSync(path.join(ROOT, '.n.md'));
    solo(['inspo', 'add', 'https://example.com/fonts/grotesk-with-warm-terminals #type', '--ws', 'main']); solo(['inspo', 'add', 'Marit\'s word for the Fjord palette: "a cabin in October" #fjord', '--ws', 'main']); solo(['inspo', 'add', 'Idea: packaging case study as a reel — the three bad versions first #studio', '--ws', 'main']);
    activity(9, 6); backup();
  }
};
if (!P[WHO]) { console.error('unknown persona ' + WHO); process.exit(1); }
P[WHO]();
console.log('✓ ' + WHO + ' seeded in ' + ROOT + '\n  ' + solo(['today']).split('\n').slice(0, 3).join('\n  '));
