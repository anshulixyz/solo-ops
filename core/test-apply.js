/* core/test-apply.js — core/apply.js (the pasted-reply applier) in Node against an in-memory store:
   every verb of the reply legend, fenced script/note bodies, the checklist form, preview (dry) and the skips.
   Invented content only. Run: node core/test-apply.js */
'use strict';
var vm = require('vm'); var fs = require('fs'); var path = require('path');
var ROOT = path.join(__dirname, '..');
var mem = {}; var touched = []; var notes = [];
var sb = {};
sb.window = sb; sb.console = console; sb.Date = Date; sb.Math = Math; sb.JSON = JSON; sb.String = String; sb.parseInt = parseInt; sb.isNaN = isNaN; sb.Object = Object; sb.Array = Array; sb.RegExp = RegExp;
sb.When = require(path.join(ROOT, 'core', 'when.js'));
sb.Store = { getJSON: function (k, d) { return k in mem ? JSON.parse(JSON.stringify(mem[k])) : d; }, setJSON: function (k, v) { mem[k] = JSON.parse(JSON.stringify(v)); } };
var BOARDS = [{ id: 'runway', title: 'Launch Runway' }, { id: 'content', title: 'Content' }];
sb.Config = { activeWs: function () { return 'main'; }, boards: function () { return BOARDS; }, boardKey: function (id) { return 'marathon.board.' + id; }, boardFile: function (id) { return id + '.json'; }, key: function (app) { return 'marathon.' + app; }, file: function (app) { return app + '.json'; }, slug: function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }, projectNames: function () { return ['general']; } };
sb.Sync = { touch: function (f) { touched.push(f); }, note: function (f, n) { notes.push(f + ': ' + n); } };
var inspo = [{ id: 'i1', title: 'Great thread on hooks', url: 'https://example.com/a', tags: ['twitter'], status: 'new' }];
sb.InspoModel = { _inited: true, init: function () {}, getState: function () { return inspo; }, parseQuick: function (t, o) { var m = t.match(/https?:\S+/); return { id: 'i' + (inspo.length + 1), title: t.replace(/https?:\S+/, '').replace(/#\S+/g, '').trim() || (m ? m[0] : t), url: m ? m[0] : '', tags: (t.match(/#(\S+)/g) || []).map(function (x) { return x.slice(1); }), status: 'new', ws: o.ws, source: o.source }; }, add: function (it) { inspo.push(it); }, update: function (id, p) { inspo.forEach(function (x) { if (x.id === id) Object.assign(x, p); }); } };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'core', 'apply.js'), 'utf8'), sb);
var Apply = sb.Apply;

function task(id, title, col, pri, extra) { return Object.assign({ id: id, title: title, desc: '', proj: 'general', col: col, pri: pri, tags: ['content'], notes: '', collapsed: true, checklist: [] }, extra || {}); }
function seed() {
  mem['marathon.board.runway'] = [task('t1', 'Write the README', 'todo', 'high'), task('t2', 'Fix the hero', 'doing', 'medium', { at: '2026-10-14T09:00', until: '2026-10-14T10:00' }), task('t3', 'Pricing page', 'todo', 'low'), task('t4', 'Old idea', 'todo', 'low'), task('t5', 'Parked thing', 'later', 'low'), task('t6', 'Record demo A', 'todo', 'medium'), task('t7', 'Record demo B', 'todo', 'medium')];
  mem['marathon.board.content'] = [];
  mem['marathon.social'] = [{ id: 'p1', datetime: '2026-10-18T09:00', title: 'Teaser', postType: 'update', format: 'text', project: 'general', copy: '', prep: [], links: [], assets: [], notes: '', status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' }, video: {} }];
  mem['marathon.scripts'] = { activeId: '', scripts: [] }; mem['marathon.writing'] = { activeId: '', notes: [] };
}
var REPLY = [
  'Here is what I suggest. First the plan, then the changes.',
  'At this point we should keep it tight, and at the end ship. Due to time, no more.',
  '',
  '```',
  'add "Write the launch post" --pri high --tags content,launch --steps "outline|draft|edit" --at tomorrow 14:00 --until 15:00 --due 2026-10-20',
  'add "Call with Sam" --at 2026-10-16T10:00 --until 10:30 --tags meeting --ext gcal:abc',
  'add "Call with Sam (moved)" --at 2026-10-16T11:00 --until 11:45 --tags meeting --ext gcal:abc',
  'add "On the content board" --board content --pri low',
  'node solo.js add "With the prefix" --pri medium',
  'at t1 fri 10:00 --until 11:00',
  'due t1 2026-10-25',
  'at t2 clear',
  'start t1',
  'done Fix the hero',
  'later t3',
  'bucket t4',
  'todo t5',
  'move t1 doing',
  'pri t1 low',
  'tag t1 +urgent -content',
  'step t1 "write the hook"',
  'check t1 1',
  'note t1 "talk to Sam first"',
  'done Record demo',
  'done nothing-like-this',
  'social add "Launch thread" --at 2026-10-20T09:00 --type launch --copy "Hook line" --prep "image|link"',
  'social copy p1 "Fresh copy for the teaser"',
  'social prep p1 "add alt text"',
  'social move p1 2026-10-22T09:00',
  'social ready p1',
  'social posted Teaser --url https://x.com/1',
  'scripts add "Agent in 5 prompts"',
  '```',
  '```',
  '# Agent in 5 prompts',
  '## Hook',
  'Five prompts. One agent.',
  '## Script',
  '1. Beat one',
  '```',
  '```',
  'notes add "Newsletter draft"',
  '```',
  '```',
  '# Newsletter draft',
  'Hello ~~world~~ ++everyone++',
  '```',
  '```',
  'inspo add "https://example.com/post #hooks"',
  'inspo tag i1 +ai +video',
  'inspo ws i1 launch',
  'inspo archive i1',
  'rm t1',
  'node solo.js frobnicate t1',
  'week',
  '```',
  '',
  '- [ ] Record the demo (high)',
  '  - [ ] set up lights',
  '  - [x] charge battery',
  '- [x] Already done thing'
].join('\n');

var fails = 0; function ok(c, m) { if (!c) { fails++; console.error('✗ ' + m); } else console.log('✓ ' + m); }
function T(id) { return (mem['marathon.board.runway'].concat(mem['marathon.board.content'])).filter(function (t) { return t.id === id; })[0]; }
function byTitle(t) { return (mem['marathon.board.runway'].concat(mem['marathon.board.content'])).filter(function (x) { return x.title === t; })[0]; }

// 1. preview (dry): nothing written, every unit labelled
seed(); var before = JSON.stringify(mem);
var plan = Apply.plan(REPLY, { ws: 'main' });
ok(JSON.stringify(mem) === before, 'preview writes nothing');
ok(plan.length === 37, 'preview finds 37 units (bare `week` is prose) (got ' + plan.length + ')');
var bad = plan.filter(function (u) { return !u.ok; }).map(function (u) { return u.label; });
ok(bad.length === 4, 'preview marks exactly 4 units as not applicable: ' + bad.join(' | '));
ok(!plan.some(function (u) { return /^At this point|^Due to time/.test(u.text); }), 'prose starting with at/due is not a command');
ok(plan.some(function (u) { return /ambiguous|2 tasks match/.test(u.label); }), 'ambiguous title fragment is reported');

// 2. apply for real
seed(); touched = []; var res = Apply.run(REPLY, { ws: 'main' });
console.log('\napplied ' + res.applied.length + ', skipped ' + res.skipped.length + '\n  skipped: ' + res.skipped.join(' | ') + '\n');
var lp = byTitle('Write the launch post');
ok(lp && lp.pri === 'high' && lp.tags.join() === 'content,launch' && lp.checklist.length === 3 && /T14:00$/.test(lp.at) && /T15:00$/.test(lp.until) && lp.due === '2026-10-20', 'add: pri, tags, steps, at, until, due');
var sam = mem['marathon.board.runway'].filter(function (t) { return t.ext === 'gcal:abc'; });
ok(sam.length === 1 && sam[0].title === 'Call with Sam (moved)' && sam[0].at === '2026-10-16T11:00' && sam[0].until === '2026-10-16T11:45', 'add --ext: re-run updates instead of duplicating');
ok(mem['marathon.board.content'].length === 1 && mem['marathon.board.content'][0].title === 'On the content board', 'add --board goes to the named board');
ok(byTitle('With the prefix'), 'node solo.js prefix accepted');
var t1 = T('t1');
ok(t1.col === 'doing' && t1.pri === 'low' && t1.tags.indexOf('urgent') >= 0 && t1.tags.indexOf('content') < 0, 'start/move/pri/tag on t1');
ok(t1.checklist.length === 1 && t1.checklist[0].done && t1.checklist[0].text === 'write the hook', 'step + check');
ok(t1.notes === 'talk to Sam first', 'note');
ok(/^\d{4}-\d{2}-\d{2}T10:00$/.test(t1.at) && /T11:00$/.test(t1.until) && t1.due === '2026-10-25', 'at fri 10:00 --until 11:00 and due');
ok(T('t2').col === 'done' && !T('t2').at && !T('t2').until, 'done by title + at clear');
ok(T('t3').col === 'later' && T('t4').col === 'bucket' && T('t5').col === 'todo', 'later / bucket / todo');
ok(T('t6').col === 'todo' && T('t7').col === 'todo', 'ambiguous "done Record demo" touched nothing');
var posts = mem['marathon.social']; var lt = posts.filter(function (p) { return p.title === 'Launch thread'; })[0]; var p1 = posts.filter(function (p) { return p.id === 'p1'; })[0];
ok(lt && lt.datetime === '2026-10-20T09:00' && lt.postType === 'launch' && lt.copy === 'Hook line' && lt.prep.length === 2, 'social add with copy and prep');
ok(p1.copy === 'Fresh copy for the teaser' && p1.prep.length === 1 && p1.datetime === '2026-10-22T09:00' && p1.status === 'posted' && p1.posted.url === 'https://x.com/1' && p1.posted.postedAt, 'social copy / prep / move / ready / posted --url');
var sc = mem['marathon.scripts'].scripts[0]; ok(sc && sc.title === 'Agent in 5 prompts' && /## Hook\nFive prompts/.test(sc.text) && mem['marathon.scripts'].activeId === sc.id, 'scripts add with fenced body');
var nt = mem['marathon.writing'].notes[0]; ok(nt && /~~world~~ \+\+everyone\+\+/.test(nt.text), 'notes add with fenced body keeps markup');
ok(inspo.length === 2 && inspo[1].url === 'https://example.com/post' && inspo[1].tags.indexOf('hooks') >= 0, 'inspo add');
var i1 = inspo[0]; ok(i1.tags.indexOf('ai') >= 0 && i1.tags.indexOf('video') >= 0 && i1.ws === 'launch' && i1.status === 'archived', 'inspo tag / ws / archive');
ok(res.skipped.some(function (s) { return /not deleting "t1"/.test(s); }) && T('t1'), 'rm is refused and the task stays');
ok(res.skipped.some(function (s) { return /unknown command: .*frobnicate/.test(s); }), 'unknown verb skipped');
var rd = byTitle('Record the demo'); ok(rd && rd.pri === 'high' && rd.col === 'todo' && rd.checklist.length === 2 && rd.checklist[1].done, 'checklist item with (high) and indented steps');
ok(byTitle('Already done thing') && byTitle('Already done thing').col === 'done', 'checked checklist item lands in done');
ok(touched.indexOf('runway.json') >= 0 && touched.indexOf('content.json') >= 0 && touched.indexOf('social.json') >= 0 && touched.indexOf('scripts.json') >= 0 && touched.indexOf('writing.json') >= 0, 'sync is told about every touched file: ' + touched.filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', '));
ok(res.applied.length === 33 && res.skipped.length === 4, 'counts: 33 applied, 4 skipped (got ' + res.applied.length + '/' + res.skipped.length + ')');

// 3. a bare checklist, no code block (what a plain chat answer looks like)
seed(); var r2 = Apply.run('Sure! Here you go:\n- [ ] Ship it\n- [ ] Tell people (low)\n', { ws: 'main' });
ok(r2.applied.length === 2 && byTitle('Tell people').pri === 'low', 'plain checklist without fences');
// 4. an answer with no changes at all
seed(); var r3 = Apply.run('I think you should focus on the README first. At 10:00 you have a call.', { ws: 'main' });
ok(r3.applied.length === 0 && r3.skipped.length === 0 && Apply.plan('nothing here', { ws: 'main' }).length === 0, 'prose-only answer applies nothing');
seed(); var r4 = Apply.run('```\nadd "Before"\nscripts add "Tagged"\n```\nHere is the script:\n```markdown\n# Tagged\n## Hook\nGo.\n```\nThen:\n```\nnotes add "After"\n```\n```\n# After\nbody\n```\nadd "Last one"\n', { ws: 'main' });
ok(mem['marathon.scripts'].scripts[0] && /## Hook\nGo\./.test(mem['marathon.scripts'].scripts[0].text), 'script body found past a prose line and a ```markdown tag');
ok(mem['marathon.writing'].notes[0] && /# After\nbody/.test(mem['marathon.writing'].notes[0].text) && byTitle('Before') && byTitle('Last one'), 'note body found; commands before and after still apply');
seed(); var units = Apply.segment(REPLY).filter(function (u) { return /^(scripts|notes) add/.test(u.text); }); units.forEach(function (u) { Apply.run(u.text, { ws: 'main' }); });
ok(/Five prompts/.test(mem['marathon.scripts'].scripts[0].text) && /everyone/.test(mem['marathon.writing'].notes[0].text), 'preview units for scripts/notes are self-contained and re-run alone');
seed(); var r5 = Apply.run('```\nscripts add "A"\n```\nAnd the tasks:\n```\nadd "Z"\ndone t1\n```\n', { ws: 'main' });
ok(mem['marathon.scripts'].scripts[0] && !/add "Z"/.test(mem['marathon.scripts'].scripts[0].text) && byTitle('Z') && T('t1').col === 'done', 'a following commands block is not taken as a script body');
seed(); var r6 = Apply.run('```\nscripts add "A"\n```\n- [ ] Between item\n```\n# A\nreal body\n```\n', { ws: 'main' });
ok(byTitle('Between item') && !/real body/.test(mem['marathon.scripts'].scripts[0].text), 'a checklist item between stops the body search');
seed(); var r7 = Apply.run('```\nadd "Y"\nscripts add "A" --text "inline body"\n```\n```\nadd "Z"\n```\n', { ws: 'main' });
ok(mem['marathon.scripts'].scripts[0].text === 'inline body' && byTitle('Y') && byTitle('Z') && Apply.segment('scripts add "A" --text "x"\n```\nadd "Q"\n```').length === 2, '--text keeps the body inline and the next block applies');
console.log(fails ? '\n' + fails + ' FAILED' : '\nALL APPLY TESTS PASS');
process.exit(fails ? 1 : 0);
