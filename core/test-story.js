/* core/test-story.js — one story across a draft, a script, its takes and the posts (core/story.js):
   the resolver both ways, missing members, the pair rule, the CLI `link` / `story` and the add flags.
   Invented content only. Run: node core/test-story.js */
'use strict';
var fs = require('fs'); var path = require('path'); var os = require('os'); var cp = require('child_process');
var ROOT = path.join(__dirname, '..'); var S = require(path.join(ROOT, 'core', 'story.js'));
var fails = 0, checks = 0; function ok(c, m) { checks++; if (!c) { fails++; console.error('✗ ' + m); } else console.log('✓ ' + m); }

// ---- the pure part on a fixture ----
var data = { note: [{ id: 'n1', text: '# Why we killed onboarding\n\nWe built it ~~once~~ ++twice++. [[tighten]]', updatedAt: 1 }],
  script: [{ id: 's1', title: 'Why we killed onboarding', text: '# Why…', noteId: 'n1', createdAt: 2 }, { id: 's9', title: 'Another script', text: '', createdAt: 3 }],
  take: [{ id: 'v1', title: 'Take one', status: 'cut', scriptId: 's1', postId: 'p1', edl: [{ start: 0, end: 23 }], createdAt: 4 }, { id: 'v2', title: 'Take two', status: 'recorded', scriptId: 's1', sources: [{ duration: 40 }], createdAt: 5 }, { id: 'v3', title: 'Orphan', scriptId: 'sGONE', createdAt: 6 }],
  post: [{ id: 'p1', title: 'Why we killed onboarding', datetime: '2099-01-02T09:00', status: 'scheduled' }, { id: 'p2', title: 'Later post', datetime: '2099-01-09T09:00', status: 'draft', scriptId: 's1' }] };
var ms = S.of(data, 'note', 'n1'); var g = S.byKind(ms);
ok(g.note.length === 1 && g.script.length === 1 && g.take.length === 2 && g.post.length === 2, 'from the draft: the script, both takes and both posts (' + ms.length + ' members)');
ok(S.of(data, 'post', 'p1').some(function (m) { return m.id === 'n1'; }), 'from a post: back up through take.postId and take.scriptId to the draft');
ok(g.take[0].id === 'v2' && g.take[1].id === 'v1', 'takes newest first');
ok(g.post[0].id === 'p1' && g.post[1].id === 'p2', 'posts by date');
ok(g.take[0].state === 'no words yet' && g.take[1].state === 'cut 0:23', 'take states read plainly (' + g.take[1].state + ')');
var txt = S.text(ms); ok(/^Draft: Why we killed onboarding \[n1\] → Script: .* → Takes: .* → Posts: /.test(txt), 'the text line reads in story order: ' + txt.slice(0, 60) + '…');
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
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

console.log(fails ? '\n' + fails + ' FAILED of ' + checks : '\n✓ ' + checks + ' story checks passed'); process.exit(fails ? 1 : 0);
