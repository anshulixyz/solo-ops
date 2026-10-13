#!/usr/bin/env node
/* docs/launch/week.js <scratch copy> <step> — the launch video's week, one step at a time, on a scratch copy.
   Everything invented (Mara, Pocket Studio). Runs the real CLI so ids, stamps and the log are genuine. The video's
   beats are shot between steps (week.sh does the order). Steps:
     reset     wipe data/, set the config (name, eyebrow, owner)
     mon-a     /plan-project begins: the board and the first 3 tasks (the ones the terminal frame shows)
     mon-b     4 more tasks       mon-c  4 more       mon-d  the last 3, the testers' call, four posts; Mara starts two
     tue-standup   the standup's four commands (shot 20)        tue-cal   the four calendar adds (shot 25)
     wed-mail  the three to-dos from the mail reply, as the Guide applies them
     thu       the demo script (/script) and the post (/ship-post)
     agent     the two commands from the website chat (shot 23)
   Never point this at the owner's folder: reset refuses a data/ that has a log with more than a handful of lines. */
var fs = require('fs'), path = require('path'), cp = require('child_process');
var ROOT = process.argv[2], STEP = process.argv[3]; if (!ROOT || !STEP) { console.error('usage: node week.js <scratch copy> <step>'); process.exit(1); }
var DATA = path.join(ROOT, 'data');
function solo(args, src) { var a = ['solo.js'].concat(args); if (src) a.push('--as', src, '--note', arguments[2] || ''); var r = cp.spawnSync('node', a, { cwd: ROOT, encoding: 'utf8' }); if (r.status !== 0) { console.error('✗ node solo.js ' + args.join(' ') + '\n' + r.stderr + r.stdout); process.exit(1); } process.stdout.write(r.stdout.split('\n').filter(function (l) { return /^[✓→]/.test(l.trim()); }).join('\n') + '\n'); return r.stdout; }
var B = ['--board', 'launch-runway'];
function add(title, flags, who, note) { return solo(['add', title].concat(B, flags || []), who || 'agent', note || 'plan-project'); }
var steps = {
  reset: function () {
    if (fs.existsSync(path.join(DATA, 'log.jsonl')) && fs.readFileSync(path.join(DATA, 'log.jsonl'), 'utf8').split('\n').length > 400) { console.error('refusing: this data/ looks like a real one'); process.exit(1); }
    fs.readdirSync(DATA).forEach(function (f) { if (f !== 'SCHEMA.md') fs.rmSync(path.join(DATA, f), { recursive: true, force: true }); });
    var cfg = path.join(ROOT, 'solo.config.js'), s = fs.readFileSync(cfg, 'utf8');
    s = s.replace(/name: '[^']*',/, "name: 'Pocket Studio',").replace(/eyebrow: '[^']*',/, "eyebrow: 'Mara · building in public',").replace(/owner: '[^']*',/, "owner: 'Mara',")
      .replace("title: 'Launch Runway',", "title: 'Ops',");   // the config's own board keeps the day-to-day; /plan-project adds "Launch runway" beside it (as the terminal frame shows)
    fs.writeFileSync(cfg, s); solo(['template', 'settings']); console.log('reset');
  },
  'mon-a': function () {
    solo(['boards', 'add', 'Launch runway', '--from', 'blank']);
    add('Name and one-line pitch', ['--proj', 'launch', '--pri', 'high', '--steps', 'Ten names|Say each out loud|Pick one, domain check']);
    add('Landing page with a waitlist', ['--proj', 'launch', '--pri', 'high', '--tags', 'website', '--steps', 'One sentence|One button|Email capture']);
    add('Record the 60-second demo', ['--proj', 'launch', '--pri', 'high', '--tags', 'video', '--steps', 'Script the three beats|Record|Pick the take']);
  },
  'mon-b': function () {
    add('Landing page copy', ['--proj', 'launch', '--pri', 'high', '--tags', 'website,copy', '--steps', 'The problem line|One sentence|The button text']);
    add('Fix the export crash on long clips', ['--proj', 'launch', '--pri', 'high', '--tags', 'bug,beta', '--steps', 'Reproduce with a 3-minute clip|Check memory during export|Ship 0.9.2 to the testers']);
    add('Write the launch post', ['--proj', 'content', '--pri', 'high', '--tags', 'content', '--due', '2026-11-02', '--steps', 'The problem line|What it does, in three lines|One screenshot|The link']);
    add('Onboarding email sequence (3 emails)', ['--proj', 'launch', '--pri', 'medium', '--tags', 'email', '--steps', 'Welcome|Day 2: the one feature|Day 5: ask for a reply']);
  },
  'mon-c': function () {
    add('Beta to 10 people', ['--proj', 'launch', '--pri', 'medium', '--tags', 'beta', '--steps', 'List 10|DM each|Collect one line of feedback']);
    add('Set up the waitlist form', ['--proj', 'launch', '--pri', 'medium', '--tags', 'website']);
    add('Pricing page: one plan', ['--proj', 'launch', '--pri', 'medium', '--tags', 'pricing', '--steps', 'The number|One table|No FAQ on the page']);
    add('Press list: 10 newsletters to email', ['--proj', 'launch', '--pri', 'low', '--tags', 'press']);
  },
  'mon-d': function () {
    add('Analytics: the sign-up funnel', ['--proj', 'launch', '--pri', 'low', '--tags', 'website']);
    add('Reply to the 12 testers with the beta link', ['--proj', 'launch', '--pri', 'medium', '--tags', 'beta', '--due', '2026-10-16']);
    add('Launch day checklist', ['--proj', 'launch', '--pri', 'high', '--due', '2026-11-03', '--steps', 'Page live|Demo out|Post up|Reply to everyone for two hours|Write down what broke']);
    add('Beta call with the testers', ['--at', '2026-10-14T11:00', '--until', '11:45', '--pri', 'high', '--tags', 'meeting,beta']);
    ['Why I am building this|2026-10-20T09:00|story|Every founder I know records a demo on their phone, then spends a Sunday fixing it on a laptop. Pocket Studio is the Sunday, gone.',
     'The ugly first version|2026-10-23T17:00|update|Here is what it looked like three weeks ago. Shipping anyway.',
     'Beta: twelve testers, one request|2026-10-27T12:00|update|',
     'Launch day: it is live|2026-11-03T09:00|launch|'].forEach(function (p) { var x = p.split('|'); solo(['social', 'add', x[0], '--at', x[1], '--type', x[2]].concat(x[3] ? ['--copy', x[3]] : []), 'agent', 'plan-project'); });
    solo(['start', 'Landing page copy'].concat(B)); solo(['start', 'Record the 60-second demo'].concat(B)); solo(['check', 'Record the 60-second demo', '1'].concat(B));
  },
  'tue-standup': function () {
    solo(['done', 'Landing page copy'].concat(B), 'agent', 'standup: finished last night');
    solo(['start', 'Write the launch post'].concat(B), 'agent', 'standup: today is about this');
    solo(['note', 'Write the launch post', 'Lead with the Sunday line from the first post'].concat(B), 'agent', 'standup');
    solo(['add', 'Reply to Priya before the intro', '--pri', 'high', '--due', '2026-10-14'].concat(B), 'agent', 'standup: blocker');
  },
  'tue-cal': function () {
    [['Investor intro (Priya)', '2026-10-15T14:00', '14:45', 'meeting', '7f3a23'], ['Design review: onboarding screens', '2026-10-16T11:30', '12:15', 'meeting,design', '7f3a24'], ['Dentist', '2026-10-19', '', 'meeting', '7f3a30'], ['Weekly check-in with Sam', '2026-10-21T10:00', '10:30', 'meeting', '7f3a31']]
      .forEach(function (m) { solo(['add', m[0], '--at', m[1]].concat(m[2] ? ['--until', m[2]] : [], ['--tags', m[3], '--ext', 'gcal:' + m[4]], B), 'agent', 'from Google Calendar'); });
  },
  'wed-mail': function () {
    solo(['add', 'Reply to Jonas: send the new beta build', '--pri', 'high', '--due', '2026-10-14', '--tags', 'email,beta'].concat(B), 'agent', 'from your mail');
    solo(['note', 'Reply to Jonas', 'His export crash is the open bug: Fix the export crash on long clips'].concat(B), 'agent', 'from your mail');
    solo(['add', "Refund Lena's duplicate charge, then reply", '--pri', 'high', '--due', '2026-10-14', '--tags', 'email,support'].concat(B), 'agent', 'from your mail');
    solo(['add', 'Reply to Dana (The Maker Hour): pick a November week', '--pri', 'medium', '--due', '2026-10-16', '--tags', 'email,press'].concat(B), 'agent', 'from your mail');
  },
  thu: function () {
    var f = path.join(require('os').tmpdir(), 'wk-demo.md');
    fs.writeFileSync(f, '# Demo: 60 seconds, one phone\n\n## Hook\nYou recorded it on your phone. Why does publishing need a laptop?\n\n## Script\n1. Phone in hand, record a clip, 4 seconds.\n2. Tap once: trimmed, captioned.\n3. Pick the thumbnail from three frames.\n4. Publish to X and YouTube from the same screen.\n5. Show the result on both feeds.\n6. "That was one minute. Here is the link."\n7. End card: Pocket Studio · pocketstudio.app\n\n## Inserts\n- Screen recording of the trim gesture\n- The three-frame picker, slow\n\n## Prep\n- [x] Charge the phone\n- [ ] Clean the lens\n- [ ] Print the beats\n');
    solo(['scripts', 'add', 'Demo: 60 seconds, one phone', '--file', f], 'agent', '/script: from the demo task');
    solo(['check', 'Record the 60-second demo', '2'].concat(B)); solo(['note', 'Record the 60-second demo', 'Take 1 is fine until the pricing line. Re-record from beat 2.'].concat(B));
    solo(['social', 'add', 'The demo is out: 60 seconds, one phone', '--at', '2026-10-16T17:00', '--type', 'update', '--copy', 'Recorded the launch demo on the thing I am launching. One phone, one tap, 60 seconds. Link below.', '--prep', 'Export the 9:16 cut|Caption file|Pin the thread'], 'agent', '/ship-post');
  },
  agent: function () {
    solo(['done', 'Onboarding email'].concat(B), 'agent', 'shipped, said so in the website chat');
    solo(['add', 'Watch the first 20 replies to the onboarding email', '--pri', 'medium', '--tags', 'email', '--due', '2026-10-16'].concat(B), 'agent', 'follow-up');
  }
};
if (!steps[STEP]) { console.error('unknown step ' + STEP + ' (' + Object.keys(steps).join(', ') + ')'); process.exit(1); }
steps[STEP]();
