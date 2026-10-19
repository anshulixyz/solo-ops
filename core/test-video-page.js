/* core/test-video-page.js — the Video page's model (studio/video-model.js) in Node against an in-memory Store:
   phrase toggles → EDL on word boundaries → the same hash as the CLI, fillers, undo, the file/page reconcile, the reply verb.
   Invented content only. Run: node core/test-video-page.js */
'use strict';
var vm = require('vm'); var fs = require('fs'); var path = require('path'); var crypto = require('crypto');
var ROOT = path.join(__dirname, '..'); var V = require(path.join(ROOT, 'core', 'video.js'));
var mem = {}; var notes = []; var writes = 0;
var sb = { console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array, RegExp: RegExp, Error: Error, isFinite: isFinite };
sb.window = sb; sb.Video = V;
sb.Store = { getJSON: function (k, d) { return k in mem ? JSON.parse(JSON.stringify(mem[k])) : d; }, setJSON: function (k, v, o) { mem[k] = JSON.parse(JSON.stringify(v)); if (!o || !o.silent) writes++; } };
sb.Config = { key: function (app) { return 'marathon.' + app; }, file: function (app) { return app + '.json'; }, activeWs: function () { return 'main'; }, PRIMARY: 'main' };
sb.Sync = { note: function (f, n) { notes.push(f + ': ' + n); } };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'studio', 'video-model.js'), 'utf8'), sb);
var M = sb.VideoModel; var fails = 0, checks = 0;
function ok(c, m) { checks++; if (!c) { fails++; console.error('✗ ' + m); } else console.log('✓ ' + m); }
function cliHash(edl) { return crypto.createHash('sha1').update(JSON.stringify(edl.map(function (s) { return [s.start, s.end]; }))).digest('hex').slice(0, 10); }
function inside(t, words) { return words.some(function (w) { return t > w.s + 1e-6 && t < w.e - 1e-6; }); }

// 20 synthetic words in two sentences, with an "um" and a "you know"
var words = []; for (var i = 0; i < 20; i++) words.push({ w: i === 4 ? 'um,' : i === 9 ? 'Uh' : i === 12 ? 'you' : i === 13 ? 'know' : 'word' + i + (i === 7 ? '.' : ''), s: i * 0.5, e: i * 0.5 + 0.3 });
var phrases = V.phrases(words);
function seed(edl) { mem['marathon.videos'] = { activeId: 'v1', videos: [{ id: 'v1', title: 'Test take', status: edl && edl.length ? 'cut' : 'transcribed', sources: [{ id: 'a', path: '/tmp/x.mp4', duration: 10, fps: 30, width: 640, height: 360, size: 1000 }], transcript: { engine: 'import', granularity: 'word', words: 20 }, phrases: phrases, edl: edl || [], edlHash: edl && edl.length ? cliHash(edl) : '', exports: [], updatedAt: 1000 }] }; M.init(); notes = []; writes = 0; }

seed(); var v = M.active(); ok(v && v.id === 'v1' && phrases.length === 2, 'the model loads the take (' + phrases.length + ' phrases)');
ok(M.keptFlags(v).every(Boolean) && M.runtime(v) === 10, 'nothing cut: every phrase reads kept and the runtime is the whole take');

// toggles on phrase boundaries (no words yet: the sentences stand in)
M.toggle(v, 1); v = M.active();
ok(v.edl.length === 1 && v.status === 'cut' && v.edlHash === cliHash(v.edl), 'cutting the second sentence leaves one piece, status cut, hash = the CLI\'s sha1 (' + v.edlHash + ')');
ok(V.edlHash(v.edl) === cliHash(v.edl), 'Video.edlHash equals Node crypto for the same pairs');
ok(V.edlHash([{ start: 2.42, end: 6.85 }, { start: 8.1, end: 15 }]) === '2723364844' && V.sha1('abc') === 'a9993e364706816aba3e25717850c26c9cd0d89d', 'pinned vectors: sha1("abc") and the pairs hash 2723364844 (exports on disk carry this; a changed sha1 would orphan them)');
ok(v.edl[0].start <= phrases[0].s && v.edl[0].end >= phrases[0].e - 1e-6 && v.edl[0].end <= phrases[1].s, 'the piece spans the first sentence and ends before the second');
ok(M.keptFlags(v).join() === 'true,false', 'flags follow the EDL');
ok(notes.length === 1 && /^videos\.json: video cut v1 \(1 piece, 0:0[45]\.\d\): cut "/.test(notes[0]), 'the write is noted for the log: ' + notes[0]);
M.toggle(v, 1); v = M.active();
ok(v.edl.length === 0 && v.edlHash === '' && v.status === 'transcribed', 'keeping it again clears the cut (one state, not a one-piece EDL)');

// with real words: edges land outside words, fillers can go
seed(); M.setWords('v1', words); v = M.active(); ok(M.hasWords('v1'), 'words attached');
var f = M.fillers(v); ok(f.hits === 3 && f.holes.length === 3, 'three fillers found (um, Uh, you know) with their spans');
var n = M.dropFillers(v); v = M.active();
ok(n === 3 && v.edl.length === 4 && v.edl.every(function (s) { return !inside(s.start, words) && !inside(s.end, words); }), 'dropping the fillers leaves 4 pieces with every edge on a word boundary (' + JSON.stringify(v.edl.map(function (s) { return [s.start, s.end]; })) + ')');
ok(v.edlHash === cliHash(v.edl), 'hash after the drop matches the CLI');
var h0 = M.holes(v, 0); ok(h0.length === 1 && h0[0].s >= 1.9 && h0[0].e <= 2.6, 'the hole in sentence one is where the um was (' + JSON.stringify(h0) + ')');
ok(M.keptFlags(v).join() === 'true,true', 'both sentences still read kept with their holes');
var before4 = v.edl.length; M.toggle(v, 1); M.toggle(M.active(), 1); v = M.active();
ok(v.edl.length === before4 && M.holes(v, 0).length === 1 && M.holes(v, 1).length === 2, 'cutting and keeping a sentence again leaves the filler holes of both sentences as they were (' + v.edl.length + ' pieces)');
ok(M.fillers(v).hits === 0, 'no fillers left to drop');
M.toggle(v, 0); v = M.active();
ok(M.keptFlags(v).join() === 'false,true' && v.edl.every(function (s) { return s.start >= phrases[0].e - 0.001; }) && M.holes(v, 1).length === 2, 'cutting sentence one after the drop keeps sentence two only, with its own holes');
ok(M.canUndo(v) && M.undo(v) && M.keptFlags(M.active()).join() === 'true,true' && M.active().edl.length === 4, 'undo brings the previous cut back');
ok(/undo$/.test(notes[notes.length - 1]), 'undo is logged too');
M.keepEverything(M.active()); ok(M.active().edl.length === 0, 'Keep everything clears the cut');
// a cut and a keep of the same sentence give back the same EDL and hash (untouched edges are not re-padded)
seed(); M.setWords('v1', words); v = M.active(); M.dropFillers(v); var h1 = M.active().edlHash; M.toggle(M.active(), 1); M.toggle(M.active(), 1);
ok(M.active().edlHash === h1, 'cut then keep the same sentence: the hash is back to what it was (' + M.active().edlHash + ' vs ' + h1 + ')');
var w0 = writes; var r0 = M.toggle(M.active(), 0); M.toggle(M.active(), 0); ok(M.active().edlHash === h1, 'and for the first sentence too');
seed([{ start: 0, end: 3.8 }]); mem['marathon.videos'].videos[0].status = 'rendered'; M.init(); M.keepEverything(M.active()); ok(M.active().status === 'transcribed', 'emptying the cut on a rendered take goes back to Words ready');
seed(); M.setWords('v1', words); v = M.active(); var fl2 = M.fillers(v); M.spare(v, fl2.holes[0]); ok(M.fillers(v).hits === 2, 'a spared filler is not counted on the button'); M.spare(v, fl2.holes[0]);   // and back (spares live per take for the session)
ok(M.undo({ id: 'gone' }) === false, 'undo on a take that is gone is a no-op');

// spare one filler before the drop, put one back after
seed(); M.setWords('v1', words); v = M.active(); var fl = M.fillers(v); ok(M.spare(v, fl.holes[1]) === true && M.isSpared('v1', fl.holes[1]), 'a clicked filler is spared');
ok(M.dropFillers(v) === 2 && M.active().edl.some(function (s) { return s.start < 4.5 && s.end > 4.8; }), 'the drop skips the spared one (Uh stays inside a piece)');
v = M.active(); var hh = M.holes(v, 0)[0]; M.restore(v, hh); ok(M.holes(M.active(), 0).length === 0 && M.active().edl.every(function (s) { return !inside(s.start, words) && !inside(s.end, words); }), 'clicking a struck word puts it back, edges still on words');
// a cut made here seconds ago survives an older file copy arriving (its write is still on the way)
seed(); v = M.active(); M.toggle(v, 1); var mineEdl = M.active().edlHash; M.applyFile({ activeId: 'v1', videos: [Object.assign({}, mem['marathon.videos'].videos[0], { edl: [], edlHash: '', cutAt: 0, status: 'transcribed', updatedAt: 900 })] });
ok(M.active().edlHash === mineEdl && M.active().status === 'cut', 'applyFile keeps a newer local cut over an older file copy of the take');
M.applyFile({ activeId: 'v9', videos: [mem['marathon.videos'].videos[0], { id: 'v9', title: 'Just added', status: 'recorded', sources: [], phrases: [], edl: [], updatedAt: Date.now() }] });
ok(M.active().id === 'v9', 'a take the CLI just added becomes the open one');
M.applyFile({ activeId: 'v1', videos: M.lib().videos }); ok(M.active().id === 'v9', 'otherwise the open take stays open across pulls');

// cue-level transcript: no fillers
seed(); M.setWords('v1', words); mem['marathon.videos'].videos[0].transcript.granularity = 'cue'; M.init(); v = M.active();
var threw = ''; try { M.dropFillers(v); } catch (e) { threw = e.message; } ok(/captions/.test(threw) && M.fillers(v).hits === 0, 'cue-level words refuse the filler drop with the reason');

// a run of phrases (shift-click): both sentences cut would leave nothing
seed(); v = M.active(); threw = ''; try { M.toggle(v, 0, 1); } catch (e) { threw = e.message; } ok(/at least one/.test(threw) && M.active().edl.length === 0, 'cutting everything is refused and nothing is written');

// the reply verb
seed(); M.setWords('v1', words); var r = M.cutFromLine('v1', { keep: '0.65-2.1, 4.0-6.0' }); v = M.active();
ok(r.edl.length === 2 && v.edl.every(function (s) { return !inside(s.start, words) && !inside(s.end, words); }) && v.edlHash === cliHash(v.edl), 'video cut --keep from a reply snaps and hashes like the CLI');
var r2 = M.cutFromLine('Test take', { drop: 'um' }); ok(r2.edl.length >= 2 && !r2.edl.some(function (s) { return s.start < 2.3 && s.end > 2.0; }), '--drop by title removes the word inside the current cut');

// reconcile: the CLI added an export and a new take while the page was cutting; the page's cut survives, the CLI's fields win
seed(); v = M.active(); M.toggle(v, 1); var mine = M.active();
var fileCopy = { updatedAt: 'x', activeId: 'v1', videos: [Object.assign({}, mem['marathon.videos'].videos[0], { edl: [], edlHash: '', cutAt: 0, status: 'transcribed', updatedAt: 500, exports: [{ file: 'data/videos/v1/preview-1.mp4', kind: 'preview', edlHash: 'old' }] }), { id: 'v2', title: 'New from the CLI', status: 'recorded', sources: [], phrases: [], edl: [], updatedAt: 2000 }] };
var out = M.reconcile(fileCopy);
ok(out.videos.length === 2 && out.videos[0].exports.length === 1 && out.videos[0].edl.length === 1 && out.videos[0].edlHash === mine.edlHash && out.videos[0].status === 'cut', 'reconcile: the file\'s export and new take are kept, the page\'s newer cut overlays');
var fileNewer = { activeId: 'v1', videos: [Object.assign({}, fileCopy.videos[0], { edl: [{ start: 1, end: 2 }], edlHash: 'cli', status: 'cut', cutAt: Date.now() + 5000, updatedAt: Date.now() + 5000 })] };
out = M.reconcile(fileNewer); ok(out.videos[0].edlHash === 'cli', 'reconcile: a cut the CLI wrote after ours wins (its cutAt is newer)');
// the case that matters: a render lands (newer updatedAt, same old cut) 100 ms after a click, before the click's write
seed(); v = M.active(); M.toggle(v, 1); mine = M.active();
var exportLanded = { activeId: 'v1', videos: [Object.assign({}, mem['marathon.videos'].videos[0], { edl: [], edlHash: '', cutAt: 0, status: 'transcribed', updatedAt: Date.now() + 500, exports: [{ file: 'data/videos/v1/preview-9.mp4', kind: 'preview', edlHash: 'x' }] })] };
out = M.reconcile(exportLanded); ok(out.videos[0].edlHash === mine.edlHash && out.videos[0].exports.length === 1 && out.videos[0].status === 'cut', 'reconcile: an export with a newer take stamp does not outrank the click (cutAt decides), and the export is kept');
M.applyFile(exportLanded); ok(M.active().edlHash === mine.edlHash && M.active().exports.length === 1, 'applyFile: same case, the click survives the pull');
var cliCleared = { activeId: 'v1', videos: [Object.assign({}, exportLanded.videos[0], { cutAt: Date.now() + 9000, status: 'transcribed' })] };
M.applyFile(cliCleared); ok(M.active().edl.length === 0 && M.active().status === 'transcribed', 'applyFile: the CLI clearing the cut later (transcribe --force) wins');
M.remove(M.active()); out = M.reconcile(fileCopy); ok(!out.videos.some(function (x) { return x.id === 'v1'; }) && out.videos.length === 1, 'a take removed on the page does not come back from a stale file copy on the next write');
M.applyFile(fileCopy); ok(M.lib().videos.length === 1 && M.active().id === 'v2', 'a pull that still carries the removed take keeps it removed (the remove is on its way to the file)');
M.applyFile({ activeId: 'v2', videos: [fileCopy.videos[1]] }); M.applyFile(fileCopy); ok(M.lib().videos.length === 2, 'once the file dropped it, a later file copy that has it again is the truth (the CLI re-added it)');

// copy text and next step
seed(); v = M.active(); var txt = M.copyText(v);
ok(/^# Take \[v1\] Test take · transcribed · 0:10\.0 · 30 fps · 640×360 · 20 words/.test(txt) && /\[000\.00-003\.80\] word0/.test(txt) && /video cut v1 --keep/.test(txt) && /Guide → Reply/.test(txt), 'copy text carries the header, the [start-end] lines and the reply legend');
ok(M.nextStep(v).text.indexOf('Click a sentence') >= 0, 'next step for a transcribed take names the toggles');
mem['marathon.videos'].videos[0].status = 'recorded'; M.init(); ok(M.nextStep(M.active()).action === 'transcribe', 'next step for a new take is the words');
seed([{ start: 0, end: 3.8 }]); ok(M.nextStep(M.active()).action === 'preview', 'next step for a cut take is a preview');
mem['marathon.videos'].videos[0].exports = [{ kind: 'preview', edlHash: cliHash([{ start: 0, end: 3.8 }]) }]; M.init(); ok(M.nextStep(M.active()).action === 'final', 'after a preview of this cut, the final');
ok(M.terminal(M.active(), 'preview') === 'node solo.js video render v1 --preview', 'terminal line for the primary workspace carries no --ws');
ok(M.statusLabel('recorded') === 'No words yet' && M.statusLabel('cut') === 'Cut', 'plain status labels');

console.log(fails ? '\n' + fails + ' FAILED of ' + checks : '\nALL VIDEO PAGE TESTS PASS (' + checks + ')');
process.exit(fails ? 1 : 0);
