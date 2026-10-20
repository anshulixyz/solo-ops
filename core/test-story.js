/* core/test-story.js — one story across a draft, a script, its takes and the posts (core/story.js):
   the resolver both ways, missing members, the pair rule, the CLI `link` / `story` and the add flags.
   Invented content only. Run: node core/test-story.js */
'use strict';
var fs = require('fs'); var path = require('path'); var os = require('os'); var cp = require('child_process');
var ROOT = path.join(__dirname, '..'); var S = require(path.join(ROOT, 'core', 'story.js'));
var fails = 0, checks = 0; function ok(c, m) { checks++; if (!c) { fails++; console.error('✗ ' + m); } else console.log('✓ ' + m); }

// ---- the pure part on a fixture ----
var data = { task: [{ id: 't1', title: 'Record the onboarding video', col: 'doing', tags: ['video'], scriptId: 's1', _board: 'runway' }, { id: 't2', title: 'Write the README', col: 'todo', tags: ['docs'] }, { id: 't3', title: 'Second video', col: 'todo', tags: ['video'], _board: 'content' }, { id: 't4', title: 'Essay', col: 'done', tags: ['writing'] }], note: [{ id: 'n1', text: '# Why we killed onboarding\n\nWe built it ~~once~~ ++twice++. [[tighten]]', updatedAt: 1 }],
  script: [{ id: 's1', title: 'Why we killed onboarding', text: '# Why…', noteId: 'n1', createdAt: 2 }, { id: 's9', title: 'Another script', text: '', createdAt: 3 }],
  take: [{ id: 'v1', title: 'Take one', status: 'cut', scriptId: 's1', postId: 'p1', edl: [{ start: 0, end: 23 }], createdAt: 4 }, { id: 'v2', title: 'Take two', status: 'recorded', scriptId: 's1', sources: [{ duration: 40 }], createdAt: 5 }, { id: 'v3', title: 'Orphan', scriptId: 'sGONE', createdAt: 6 }],
  post: [{ id: 'p1', title: 'Why we killed onboarding', datetime: '2099-01-02T09:00', status: 'scheduled' }, { id: 'p2', title: 'Later post', datetime: '2099-01-09T09:00', status: 'draft', scriptId: 's1' }] };
// the task kind: a task holds its pieces; the story of a piece reaches its task; only tagged tasks (or ones with a piece) are content tasks
var tm = S.of(data, 'task', 't1'); var tg = S.byKind(tm); ok(tg.task.length === 1 && tg.script.length === 1 && tg.take.length === 2 && tg.post.length === 2, 'from the task: its script and everything that hangs on it (' + tm.length + ' members)');
ok(S.taskOf(data, 'post', 'p1') && S.taskOf(data, 'post', 'p1').id === 't1', 'a post reaches its task through the take and the script');
ok(S.taskOf(data, 'script', 's9') === null, 'a script on no task says so');
var pc = S.piecesOf(data, 't1'); ok(pc.script && pc.script.id === 's1' && pc.take && pc.post && pc.note && pc.note.id === 'n1', 'piecesOf: one per kind; the post through take.postId and the draft through script.noteId count');
ok(S.isContent(data.task[0]) && !S.isContent(data.task[1]) && S.isContent({ tags: [], noteId: 'n1' }), 'a content task: tagged, or holding a piece; a plain task is not');
ok(S.nextStep(data, data.task[2]).label === 'Start the script' && S.nextStep(data, data.task[1]) === null && S.nextStep(data, { id: 'tx', tags: ['writing'] }).label === 'Write the draft' && S.nextStep(data, data.task[0]) === null, 'the next step follows the tag and what exists; a video task never starts with a draft; a finished chain has none');
ok(S.nextStep(data, { id: 'ty', tags: ['video'], scriptId: 's9' }).label === 'Add the take', 'script present: Add the take');
var sg = S.suggestions(data, 'take', 5); ok(sg.list.length === 1 && sg.list[0].id === 't3' && sg.more === 0, 'suggestions for Video: tagged video, open, without a take (t1 has one, t4 is done)');
ok(S.suggestions(data, 'note', 5).list.length === 0, 'a done writing task is not suggested');
var tp = S.pair(data, 't3', 's9'); ok(tp.holder.kind === 'task' && tp.field === 'scriptId', 'task + script: the task holds scriptId');
ok(/^Task: Record the onboarding video \(Doing\) \[t1\] → Draft: .* → Script:/.test(S.text(tm)), 'the text line starts with the task: ' + S.text(tm).slice(0, 50) + '…');
ok(S.of(data, 'task', 't3').length === 1 && !S.connected(S.of(data, 'task', 't3')), 'a tagged task with no piece yet stands alone');
ok(S.scriptFrom('task', data.task[0]).text.indexOf('# Record the onboarding video') === 0 && S.noteFrom({ title: 'X', desc: 'why' }).text === '# X\n\nwhy\n', 'pieces made from a task carry its title and description');
var ms = S.of(data, 'note', 'n1'); var g = S.byKind(ms);
ok(g.note.length === 1 && g.script.length === 1 && g.take.length === 2 && g.post.length === 2, 'from the draft: the script, both takes and both posts (' + ms.length + ' members)');
ok(S.of(data, 'post', 'p1').some(function (m) { return m.id === 'n1'; }), 'from a post: back up through take.postId and take.scriptId to the draft');
ok(g.take[0].id === 'v2' && g.take[1].id === 'v1', 'takes newest first');
ok(g.post[0].id === 'p1' && g.post[1].id === 'p2', 'posts by date');
ok(g.take[0].state === 'no words yet' && g.take[1].state === 'cut 0:23', 'take states read plainly (' + g.take[1].state + ')');
var txt = S.text(ms); ok(/^Task: .* → Draft: Why we killed onboarding \[n1\] → Script: .* → Takes: .* → Posts: /.test(txt), 'the text line reads in story order: ' + txt.slice(0, 60) + '…');
var orphan = S.of(data, 'take', 'v3'); var gone = orphan.filter(function (m) { return m.missing; })[0]; ok(orphan.length === 2 && gone && gone.id === 'sGONE' && gone.kind === 'script', 'a pointer to a deleted script shows as missing, never auto-removed');
ok(!S.connected(S.of(data, 'script', 's9')), 'a script with nothing around it is not connected');
ok(S.clean(data.note[0].text) === 'We built it twice.', 'clean(): markup gone, the title line gone, spaces tidy (' + JSON.stringify(S.clean(data.note[0].text)) + ')');
// pairs
var p1 = S.pair(data, 'n1', 's9'); ok(p1.holder.kind === 'script' && p1.field === 'noteId' && p1.target.item.id === 'n1', 'draft + script: the script holds noteId');
var p2 = S.pair(data, 'p1', 'v2'); ok(p2.holder.kind === 'take' && p2.field === 'postId', 'take + post: the take holds postId (the edge video post already writes)');
var p3 = S.pair(data, 's9', 'p1'); ok(p3.holder.kind === 'post' && p3.field === 'scriptId', 'script + post: the post holds scriptId');
var p4 = S.pair(data, 'n1', 'p1'); ok(p4.holder.kind === 'post' && p4.field === 'noteId', 'draft + post: the post holds noteId (a text post straight from a draft)');
var bad = ''; try { S.pair(data, 'n1', 'v2'); } catch (e) { bad = e.message; } ok(/through a script/.test(bad), 'draft + take is refused with the reason');
bad = ''; try { S.pair(data, 's1', 's9'); } catch (e) { bad = e.message; } ok(/Two scripts/.test(bad), 'two scripts are refused');
bad = ''; try { S.pair(data, 'nope', 's9'); } catch (e) { bad = e.message; } ok(/matches "nope"/.test(bad), 'an unknown id is refused');
var pm = S.pair(data, 'v3', 'sGONE'); ok(pm.target.missing && pm.holder.item.id === 'v3' && pm.field === 'scriptId', 'a deleted script is still a pair through the take that points at it (so --off can forget it)');
ok(S.direct(data, 'n1', 's1') && !S.direct(data, 'n1', 'v1'), 'direct(): the draft holds the script, not the take (that one hangs on the script)');
ok(S.dupTitles([{ kind: 'script', item: data.script[0] }, { kind: 'script', item: { id: 'sX', title: 'why we killed onboarding' } }], function (m) { return m.kind; })('script', data.script[0]), 'same titles are told apart');
bad = ''; try { S.lookup(data, 'killed onboarding'); } catch (e) { bad = e.message; } ok(/Several match/.test(bad), 'an ambiguous title asks for the id');
ok(S.lookup(data, 'Another').item.id === 's9', 'a unique title substring resolves');
var pf = S.postFrom('script', data.script[0]); ok(pf.scriptId === 's1' && pf.format === 'video' && pf.video.status === 'scripted' && /T09:00$/.test(pf.datetime), 'a post from a script: video format, scripted, tomorrow 09:00');
var sf = S.scriptFrom('note', data.note[0]); ok(sf.noteId === 'n1' && /## Script\nWe built it twice\./.test(sf.text), 'a script from a draft carries the clean text under ## Script');

// ---- the CLI on a scratch data folder ----
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-story-')); var env = Object.assign({}, process.env, { SOLO_DATA: dir });
function solo(args) { var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'solo.js')].concat(args, ['--json', '--as', 'agent', '--note', 'test']), { env: env, encoding: 'utf8' }); var out = null; try { out = JSON.parse(r.stdout.slice(r.stdout.indexOf(r.stdout.match(/[\[{]/) ? r.stdout.match(/[\[{]/)[0] : '{'))); } catch (e) { out = null; } return { code: r.status, out: out, raw: r.stdout + r.stderr }; }
try {
  var n = solo(['notes', 'add', '--text', '# Launch day\n\nWe ship ++today++.']); ok(n.code === 0 && n.out && n.out.id, 'notes add');
  var sc = solo(['scripts', 'add', '--draft', n.out.id]); ok(sc.code === 0 && sc.out.noteId === n.out.id && /## Script\nWe ship today\./.test(sc.out.text), 'scripts add --draft: the script carries the draft and its clean text');
  var po = solo(['social', 'add', '--script', sc.out.id]); ok(po.code === 0 && po.out.scriptId === sc.out.id && po.out.format === 'video' && po.out.video.status === 'scripted', 'social add --script: the post carries the script, video format, scripted');
  var po2 = solo(['social', 'add', '--draft', n.out.id]); ok(po2.code === 0 && po2.out.noteId === n.out.id && po2.out.copy === 'We ship today.', 'social add --draft: a text post with the clean draft as its copy');
  var st = solo(['story', n.out.id]); ok(st.code === 0 && st.out.members.length === 4 && st.out.members.filter(function (m) { return m.kind === 'post'; }).length === 2, 'story <draft> lists the script and both posts');
  var off = solo(['link', n.out.id, po2.out.id, '--off']); ok(off.code === 0 && off.out.off === true, 'link --off disconnects');
  var st2 = solo(['story', po2.out.id]); ok(st2.code === 0 && st2.out.members.length === 1, 'the disconnected post stands alone');
  var on = solo(['link', po2.out.id, n.out.id]); ok(on.code === 0 && on.out.field === 'noteId' && on.out.on === po2.out.id, 'link in either order writes the one pointer');
  var dup = solo(['link', po.out.id, po2.out.id]); ok(dup.code !== 0 && /Two posts/.test((dup.out && dup.out.error) || dup.raw), 'two posts are refused');
  var nc = solo(['link', sc.out.id, po2.out.id, '--off']); ok(nc.code === 0 && nc.out.changed === false, 'link --off on a pair with no direct link says so and writes nothing');
  var mv = solo(['link', sc.out.id, po2.out.id]); ok(mv.code === 0 && mv.out.was === '' && mv.out.changed === true, 'connecting a post to the script: no previous script, nothing replaced');
  fs.rmSync(path.join(dir, 'writing.json')); var st3 = solo(['story', sc.out.id]); ok(st3.code === 0 && st3.out.members.some(function (m) { return m.missing && m.kind === 'note'; }), 'a deleted draft shows as missing');
  var forget = solo(['link', sc.out.id, n.out.id, '--off']); ok(forget.code === 0 && forget.out.changed === true, 'link --off forgets the deleted draft');
  var cant = solo(['link', sc.out.id, n.out.id]); ok(cant.code !== 0 && /deleted/.test((cant.out && cant.out.error) || cant.raw), 'connecting to a deleted one is refused in a sentence');
  var amb = cp.spawnSync(process.execPath, [path.join(ROOT, 'solo.js'), 'story', 'Launch'], { env: env, encoding: 'utf8' }); ok(/Several match/.test(amb.stdout + amb.stderr) && !/at .*solo\.js/.test(amb.stderr), 'story with an ambiguous title answers in a sentence, no stack trace');
  var show = cp.spawnSync(process.execPath, [path.join(ROOT, 'solo.js'), 'social', 'show', po.out.id], { env: env, encoding: 'utf8' }).stdout; ok(/- story: .*Script: Launch day/.test(show), 'social show prints the story line');
  var log = solo(['log']); ok(log.code === 0 && JSON.stringify(log.out).indexOf('link: connected post') >= 0, 'link is in the change log');
  // tasks: a task on the board, --task on the adds, a task born with a piece, link task↔piece across boards
  var ta = solo(['add', 'Record the onboarding video', '--tags', 'video', '--desc', 'Two minutes, talking head.']); ok(ta.code === 0 && ta.out.id, 'add a video task');
  var ts = solo(['scripts', 'add', '--task', ta.out.id]); var bd = JSON.parse(fs.readFileSync(path.join(dir, 'runway.json'), 'utf8')); var t1 = bd.tasks.filter(function (x) { return x.id === ta.out.id; })[0];
  ok(ts.code === 0 && t1.scriptId === ts.out.id && t1.tags.indexOf('script') >= 0 && /Two minutes/.test(ts.out.text), 'scripts add --task: the task holds the script, gets the tag, the script carries the description');
  var tn = solo(['notes', 'add', '--task', ta.out.id]); var tpst = solo(['social', 'add', '--task', ta.out.id]); bd = JSON.parse(fs.readFileSync(path.join(dir, 'runway.json'), 'utf8')); t1 = bd.tasks.filter(function (x) { return x.id === ta.out.id; })[0];
  ok(tn.code === 0 && t1.noteId === tn.out.id && tpst.code === 0 && t1.postId === tpst.out.id && tpst.out.scriptId === ts.out.id, 'notes add --task and social add --task attach too; the post takes the task\'s script');
  var st4 = solo(['story', ta.out.id]); ok(st4.code === 0 && st4.out.members.filter(function (m) { return m.kind === 'task'; }).length === 1 && st4.out.members.length === 4, 'story <task> lists the task and its three pieces');
  var tb = solo(['add', 'Second cut', '--script', ts.out.id]); bd = JSON.parse(fs.readFileSync(path.join(dir, 'runway.json'), 'utf8')); var t2 = bd.tasks.filter(function (x) { return x.id === tb.out.id; })[0];
  ok(tb.code === 0 && t2.scriptId === ts.out.id && t2.tags.indexOf('script') >= 0, 'add --script: a task born with the piece and its tag');
  var off2 = solo(['link', tb.out.id, ts.out.id, '--off']); bd = JSON.parse(fs.readFileSync(path.join(dir, 'runway.json'), 'utf8')); t2 = bd.tasks.filter(function (x) { return x.id === tb.out.id; })[0]; ok(off2.code === 0 && !t2.scriptId, 'link --off detaches a piece from a task');
  var two = solo(['boards', 'add', 'Content']); var tc = solo(['add', 'Essay', '--board', 'content', '--tags', 'writing']); var lk = tc.code === 0 ? solo(['link', 'Essay', po.out.id]) : { code: 1 }; var bc = tc.code === 0 ? JSON.parse(fs.readFileSync(path.join(dir, 'content.json'), 'utf8')) : { tasks: [] }; var t3 = bc.tasks.filter(function (x) { return x.id === (tc.out && tc.out.id); })[0];
  ok(two.code === 0 && tc.code === 0 && lk.code === 0 && t3 && t3.postId === po.out.id, 'a task on a second board is found by title and written through its own file (' + ((lk.out && lk.out.error) || 'ok') + ')');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

console.log(fails ? '\n' + fails + ' FAILED of ' + checks : '\n✓ ' + checks + ' story checks passed'); process.exit(fails ? 1 : 0);
