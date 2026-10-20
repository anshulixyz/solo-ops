/* core/test-video.js — cut-by-transcript rules and the `video` CLI on a synthetic clip.
   Needs ffmpeg; without it the file says so and exits 0. No footage, no key, no network.
   Run: node core/test-video.js */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
var V = require('./video.js'); var fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.error('✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function inside(t, words) { return words.some(function (w) { return t > w.s + 1e-6 && t < w.e - 1e-6; }); }

/* ---- pure rules ------------------------------------------------------------ */
var words = []; for (var i = 0; i < 20; i++) words.push({ w: i === 4 ? 'um,' : i === 9 ? 'Uh' : i === 12 ? 'you' : i === 13 ? 'know' : 'word' + i + (i === 7 ? '.' : ''), s: i * 0.5, e: i * 0.5 + 0.3 });
var ph = V.phrases(words.concat([{ w: 'late', s: 11, e: 11.3 }]));
eq(ph.length, 3, 'phrases break on a silence of 0.5 s or more and after a sentence end');
var cont = []; for (var k = 0; k < 40; k++) cont.push({ w: k === 9 ? 'end.' : k === 30 ? 'stop?' : 'w' + k, s: k * 0.3, e: k * 0.3 + 0.3 });
var cph = V.phrases(cont); ok(cph.length === 3 && /end\.$/.test(cph[0].t) && /stop\?$/.test(cph[1].t), 'contiguous words break after a sentence end (' + cph.length + ')');
var longrun = []; for (var q = 0; q < 60; q++) longrun.push({ w: 'w' + q, s: q * 0.3, e: q * 0.3 + 0.3 }); eq(V.phrases(longrun).length, 3, 'a ramble with no sentence end breaks every 24 words');
ok(/^\[000\.00-003\.80\] word0 word1/.test(V.packed(ph)), 'packed line format [sss.ss-sss.ss] text');
ok(V.parseRanges('2.42-6.85, 8.10-15.00').length === 2 && V.parseRanges('0:12-1:40')[0].end === 100, 'ranges parse seconds and m:ss');
var threw = false; try { V.parseRanges('6-2'); } catch (e) { threw = true; } ok(threw, 'an end before its start is refused');
var r = V.snap([{ start: 0.65, end: 2.1 }, { start: 4.0, end: 6.0 }], words, { fps: 30, duration: 10 });
ok(r.edl.every(function (s) { return !inside(s.start, words) && !inside(s.end, words); }), 'no cut edge falls inside a word');
ok(r.edl[0].start <= 0.5 && r.edl[0].start >= 0.3, 'start snaps out to the word start and the pad stays out of the previous word (' + r.edl[0].start + ')');
ok(r.edl[0].end >= 2.3 && r.edl[0].end <= 2.5, 'end snaps out to the word end and the pad stays out of the next word (' + r.edl[0].end + ')');
ok(r.edl.every(function (s) { return Math.abs(s.start * 30 - Math.round(s.start * 30)) < 0.05 && Math.abs(s.end * 30 - Math.round(s.end * 30)) < 0.05; }), 'edges sit on the frame grid (to the millisecond)');
var m = V.snap([{ start: 1, end: 2 }, { start: 2.05, end: 3 }], words, { fps: 30, duration: 10 });
eq(m.edl.length, 1, 'two keeps closer than 120 ms merge into one');
var sh = V.snap([{ start: 1, end: 2 }, { start: 5.0, end: 5.02 }], [], { fps: 30, duration: 10 });
eq(sh.edl.length, 1, 'a piece shorter than two frames is dropped, with a note'); ok(sh.notes.some(function (n) { return /no transcript/.test(n); }), 'a plain trim says nothing was snapped');
var d = V.drop(['um', 'you know'], words, null);
eq(d.hits, 2, '--drop finds a word and a two-word phrase, punctuation and case ignored');
ok(d.ranges.length === 3 && d.ranges.every(function (x) { return !(x.start < 2.3 && x.end > 2.0) && !(x.start < 6.8 && x.end > 6.0); }), 'the dropped spans are cut out of the keeps');
var d2 = V.drop(['word5', 'word6'], words, null); ok(d2.ranges.length === 2 && d2.ranges.every(function (x) { return x.end <= 2.5 + 1e-6 || x.start >= 3.3 - 1e-6; }), 'an island under 300 ms between two drops goes too');
var ed = V.fromEdl([{ start: 1, end: 2, beat: 'HOOK' }], 10); eq(ed[0].reason, 'HOOK', 'an agent EDL keeps its reason');
// pauses: a 1.2 s gap, a 0.4 s gap, leading and trailing silence
var pw = [{ w: 'so', s: 1.0, e: 1.3 }, { w: 'then', s: 2.5, e: 2.8 }, { w: 'we', s: 3.2, e: 3.5 }, { w: 'go.', s: 3.6, e: 3.9 }];
var ps = V.pauses(pw, { duration: 6 });
ok(ps.length === 3 && ps[0].s === 0 && Math.abs(ps[1].s - 1.345) < 1e-6 && Math.abs(ps[1].e - 2.425) < 1e-6 && ps[2].e === 6, 'pauses: leading, the 1.2 s gap and the tail are shortened, the 0.4 s gap stays (' + JSON.stringify(ps) + ')');
var pr = V.snap(V.cutOut(null, ps, 6), pw, { fps: 30, duration: 6 });
var beat = (pr.edl[0].end - 1.3) + (2.5 - pr.edl[1].start);   // what remains around the join on the output timeline
ok(pr.edl.length === 2 && Math.abs(beat - 0.25) < 0.04 && Math.abs((1.0 - pr.edl[0].start) - 0.25) < 0.04 && Math.abs((pr.edl[1].end - 3.9) - 0.25) < 0.04 && pr.edl.every(function (s) { return !inside(s.start, pw) && !inside(s.end, pw); }), 'after snapping, one beat (0.25 s) remains at the join, before the first word and after the last; no edge inside a word (' + JSON.stringify(pr.edl.map(function (s) { return [s.start, s.end]; })) + ')');
var co = V.cutOut([{ start: 1, end: 4 }], [{ s: 2, e: 2.5 }], 10); ok(co.length === 2 && co[0].fixedStart === true && co[1].fixedEnd === true && !co[0].fixedEnd, 'cutOut flags the keep\'s own edges as fixed');
ok(V.packed([{ s: 0, e: 1, t: 'a' }, { s: 2.5, e: 3, t: 'b' }], { pauses: V.pauses([{ w: 'a', s: 0, e: 1 }, { w: 'b', s: 2.5, e: 3 }], null, { duration: 3 }) }).indexOf('[pause 1.5 s]') > 0, 'packed shows a long pause between phrases');
var fw = [{ w: 'so', s: 1.0, e: 1.3 }, { w: 'um', s: 1.35, e: 1.45 }, { w: 'here', s: 1.5, e: 1.9 }, { w: 'we', s: 2.0, e: 2.3 }, { w: 'go.', s: 2.4, e: 2.7 }];
var fd = V.snap(V.drop(['um'], fw, null).ranges, fw, { fps: 30, duration: 3 });
ok(fd.edl.length === 2 && !fd.edl.some(function (s) { return s.start < 1.45 && s.end > 1.35; }), 'a 100 ms filler is not stitched back by the merge rule (' + JSON.stringify(fd.edl) + ')');
var again = V.snap(V.drop(['we'], fw, fd.edl).ranges, fw, { fps: 30, duration: 3 }); var again2 = V.snap(V.drop(['we'], fw, again.edl).ranges, fw, { fps: 30, duration: 3 });
eq(JSON.stringify(again2.edl.map(function (s) { return [s.start, s.end]; })), JSON.stringify(again.edl.map(function (s) { return [s.start, s.end]; })), 'repeating a drop never moves the edges');
ok(again.edl.every(function (s) { return !(s.start < 2.3 && s.end > 2.0); }), 'the second drop removed its word');
var rs = V.snap(V.fromEdl([{ start: 1, end: 2, reason: 'HOOK' }], 3), fw, { fps: 30, duration: 3 }); eq(rs.edl[0].reason, 'HOOK', 'the reason survives snapping');
eq(V.normalizeWords([{ w: '[EERIE', s: 0, e: 1 }, { w: 'MUSIC]', s: 1, e: 2 }, { w: '(laughs)', s: 2, e: 3 }, { w: 'hi', s: 3, e: 4 }]).length, 1, 'whisper event tags are not words');
var cueSrt = V.srt([{ start: 0, end: 10, offset: 0, duration: 10 }], [{ w: 'First cue is long enough to be a sentence', s: 1, e: 2.5 }, { w: 'Second cue', s: 3, e: 4 }], 'sentence', 'cue');
eq((cueSrt.match(/-->/g) || []).length, 2, 'a cue-level transcript keeps one caption per cue');
threw = false; try { V.fromEdl([{ start: 1, end: 20 }], 10); } catch (e) { threw = true; } ok(threw, 'an EDL outside the take is refused');
var srtText = V.srt([{ start: 0.45, end: 2.4, offset: 0, duration: 1.95 }, { start: 4.0, end: 6.0, offset: 1.95, duration: 2.0 }], words, 'sentence');
var times = []; srtText.replace(/(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})/g, function (_, a, b) { times.push([V.parseTime(a), V.parseTime(b)]); });
ok(times.length >= 2 && times.every(function (t, i) { return t[1] > t[0] && (!i || t[0] >= times[i - 1][1] - 1e-6); }), 'captions are monotonic on the output timeline');
ok(times.every(function (t) { return t[1] <= 3.95 + 1e-6; }), 'no caption runs past the total');
ok(/word8/.test(srtText) && !/word14/.test(srtText) && !/word6/.test(srtText), 'captions carry only the kept words');
var bold = V.srt([{ start: 0, end: 10, offset: 0, duration: 10 }], words, 'bold'); ok(/WORD0 WORD1\n/.test(bold), 'bold style: two uppercase words per caption');
var imp = V.importTranscript('1\n00:00:01,000 --> 00:00:02,500\nHello there\n\n2\n00:00:03,000 --> 00:00:04,000\n<i>Second</i> cue\n', 'srt');
eq(imp.granularity, 'cue', 'SRT import is cue-level'); eq(imp.words[1].w, 'Second cue', 'SRT tags are stripped'); eq(imp.words[0].e, 2.5, 'SRT times parse');
var vtt = V.importTranscript('WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n', 'vtt'); eq(vtt.words[0].s, 1, 'VTT m:ss times parse');
var wh = V.importTranscript(JSON.stringify({ transcription: [{ text: ' Hello', offsets: { from: 100, to: 400 } }, { text: '', offsets: { from: 0, to: 20 } }, { text: ' -', offsets: { from: 20, to: 50 } }] }), 'json');
eq(wh.words.length, 1, 'whisper.cpp output: empty and punctuation-only tokens are dropped'); eq(wh.words[0].s, 0.1, 'whisper ms offsets become seconds');
var el = V.importTranscript(JSON.stringify({ words: [{ text: 'Hi', start: 0.1, end: 0.4, type: 'word' }, { text: ' ', start: 0.4, end: 0.5, type: 'spacing' }] }), 'json');
eq(el.words.length, 1, 'ElevenLabs output: spacing tokens are dropped');
var ours = V.importTranscript(JSON.stringify({ words: [{ w: 'a', s: 1, e: 1.2 }], granularity: 'word' }), 'json'); eq(ours.words[0].w, 'a', 'our own shape imports');

// contiguous whisper words: a cut between them never lands inside the neighbour (the frame grid yields to the word boundary)
var cw3 = [{ w: 'a', s: 1.0, e: 1.21 }, { w: 'b', s: 1.21, e: 1.52 }, { w: 'c', s: 1.52, e: 1.83 }];
var ce = V.snap(V.cutOut(null, [{ s: 1.21, e: 1.52 }], 3), cw3, { fps: 30, duration: 3 }).edl;
ok(ce.length === 2 && ce[0].end === 1.21 && ce[1].start === 1.52, 'cutting the middle of three contiguous words keeps the exact boundaries (' + JSON.stringify(ce.map(function (s) { return [s.start, s.end]; })) + ')');
// a filler right after a long pause: one hole, one join, no silent sliver between them
var w4 = [{ w: 'so', s: 1.0, e: 1.3 }, { w: 'um', s: 2.7, e: 2.9 }, { w: 'then', s: 3.0, e: 3.3 }];
var t4 = V.tidy(w4, null, null, { duration: 5, fps: 30, fillers: V.FILLERS }); var e4 = V.snap(t4.ranges, w4, { fps: 30, duration: 5 }).edl;
ok(t4.holes.length === 3 && e4.length === 2 && !e4.some(function (s) { return s.end - s.start < 0.3; }), 'pause + filler merge into one hole (lead, the merged middle, tail): no sliver piece (' + JSON.stringify(e4.map(function (s) { return [s.start, s.end]; })) + ')');
var sw = V.trimToSilences([{ w: 'so', s: 1.0, e: 3.5 }, { w: 'then', s: 3.5, e: 3.9 }], [{ s: 1.3, e: 3.2 }]);
ok(sw[0].s === 3.2 && sw[0].e === 3.5, 'a word running over a whole silence is cut to its shorter side (' + JSON.stringify(sw) + ')');
ok(V.pauses(sw, null, { duration: 4 }).some(function (h) { return h.gs <= 1.0 && h.ge >= 3.2; }), 'and the silence it hid becomes a pause');
// the recordings folder: stable twice, untouched 5 s, pending when there at the first look, queued while an add runs, backoff on failure
var rdir = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-rec-')); var rf = path.join(rdir, 'Screen Recording 2026-10-20 at 10.31.22.mov'); fs.writeFileSync(rf, Buffer.alloc(70000, 1));
var rst = { files: {}, firstLook: true }; V.node.scanRecordings(rdir, rst, Date.now()); rst.firstLook = false;
ok(rst.files[rf] && rst.files[rf].pending === true, 'a file there at the first look is pending (waits for a yes)');
var rf2 = path.join(rdir, 'new.mp4'); fs.writeFileSync(rf2, Buffer.alloc(70000, 2)); var t0 = Date.now() + 6000;
ok(V.node.scanRecordings(rdir, rst, t0).length === 0 && V.node.scanRecordings(rdir, rst, t0 + 4000).length === 0, 'a new file is not ready on its first two looks');
var rdy = V.node.scanRecordings(rdir, rst, t0 + 8000); ok(rdy.length === 1 && rdy[0].path === rf2 && rst.files[rf2].queued === true, 'stable for two looks and 5 s old: ready once, then queued');
ok(V.node.scanRecordings(rdir, rst, t0 + 12000).length === 0, 'a queued file is not handed out again');
V.node.recResult(rst, rf2, null, t0 + 12000); ok(!rst.files[rf2].queued && rst.files[rf2].tries === 1 && rst.files[rf2].nextAt > t0 + 12000, 'a failed add backs off');
ok(V.node.scanRecordings(rdir, rst, t0 + 13000).length === 0 && V.node.scanRecordings(rdir, rst, t0 + 30000).length === 1, 'not before the backoff, again after it');
V.node.recResult(rst, rf2, 'v9', t0 + 30000); ok(rst.files[rf2].takeId === 'v9' && !rst.files[rf2].queued, 'a successful add remembers the take');
V.node.recResult(rst, rf, 'v1', t0, true); ok(/same recording/.test(rst.files[rf].skipped), 'a duplicate of another take is skipped, not a take of its own');
fs.writeFileSync(path.join(rdir, 'tiny.mp4'), Buffer.alloc(100)); fs.writeFileSync(path.join(rdir, 'voice.m4a'), Buffer.alloc(70000)); fs.writeFileSync(path.join(rdir, '.hidden.mp4'), Buffer.alloc(70000));
V.node.scanRecordings(rdir, rst, t0 + 40000); ok(!rst.files[path.join(rdir, 'tiny.mp4')] && !rst.files[path.join(rdir, 'voice.m4a')] && !rst.files[path.join(rdir, '.hidden.mp4')], 'tiny files, audio files and dotfiles are ignored');
eq(V.node.titleFromFile('Screen Recording 2026-10-20 at 10.31.22.mov'), 'Recording 2026-10-20 10.31', 'a recorder file name becomes a title');
fs.rmSync(rdir, { recursive: true, force: true });

/* ---- the CLI on a synthetic clip ------------------------------------------- */
var tools = V.node.tools({});
if (!tools.ffmpeg || !tools.ffprobe) { console.log((fails ? '✗ ' + fails + ' failed of ' + checks : '✓ ' + checks + ' checks') + ' · ffmpeg not found, the render tests were skipped'); process.exit(fails ? 1 : 0); }
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solo video 'test-")); var data = path.join(tmp, 'data'); fs.mkdirSync(data);
var clip = path.join(tmp, "take one's.mp4");
cp.execFileSync(tools.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '10', '-af', "volume=enable='between(t,3,4.5)':volume=0", '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);   // silent from 3.0 to 4.5 s: a real pause for tidy up
var sil = V.node.silences(tools, clip, { duration: 10 }); ok(sil.length === 1 && Math.abs(sil[0].s - 3) < 0.15 && Math.abs(sil[0].e - 4.5) < 0.15, 'silencedetect finds the 1.5 s silence (' + JSON.stringify(sil) + ')');
var transcript = path.join(tmp, 'words.json'); fs.writeFileSync(transcript, JSON.stringify({ words: words }));
var ROOT = path.join(__dirname, '..');
function solo(args, opts) { var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'solo.js')].concat(args).concat(['--json']), { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { SOLO_DATA: data }) }); var o = null; try { o = JSON.parse(r.stdout.trim()); } catch (e) { try { o = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e2) { o = null; } } return { code: r.status, out: o, stdout: r.stdout, stderr: r.stderr }; }
function abs(rel) { return path.join(data, rel.replace(/^data\//, '')); }
function probe(file, what) { return cp.execFileSync(tools.ffprobe, ['-v', 'error'].concat(what).concat([file]), { encoding: 'utf8' }).trim(); }
try {
  var a = solo(['video', 'add', 'Test take', '--file', clip]); eq(a.code, 0, 'video add runs (' + (a.stderr || '').trim() + ')');
  var id = a.out && a.out.id; ok(/^v/.test(id || ''), 'the take has a v… id'); eq(a.out.sources[0].duration, 10, 'ffprobe duration recorded'); eq(a.out.sources[0].fps, 30, 'fps recorded');
  eq(a.out.sources[0].path, clip, 'the file is referenced by path'); ok(!fs.existsSync(path.join(data, 'videos', id, path.basename(clip))), 'the footage is not copied');
  var ask = solo(['video', 'transcribe', id]); eq(ask.code, 0, 'transcribe with no engine prints the ways and stops'); eq(ask.out && ask.out.ask, 'engine', 'it asks for the engine');
  var t = solo(['video', 'transcribe', id, '--from', transcript]); eq(t.code, 0, 'transcribe --from imports (' + (t.stderr || '').trim() + ')'); eq(t.out.transcript.words, 20, '20 words imported'); eq(t.out.status, 'transcribed', 'status moves to transcribed');
  ok(fs.existsSync(path.join(data, 'videos', id, 'transcript.json')), 'transcript.json written on disk'); ok(Array.isArray(t.out.phrases) && t.out.phrases.length === 2, 'phrases stored on the item');
  var t2 = solo(['video', 'transcribe', id, '--engine', 'whisper', '--from', transcript]); eq(t2.code, 0, '--from wins over --engine');
  var c = solo(['video', 'cut', id, '--keep', '0.65-2.1, 4.0-6.0']); eq(c.code, 0, 'video cut --keep runs (' + (c.stderr || '').trim() + ')'); eq(c.out.edl.length, 2, 'two pieces');
  ok(c.out.edl.every(function (s) { return !inside(s.start, words) && !inside(s.end, words); }), 'CLI cut never lands inside a word');
  var dr = solo(['video', 'cut', id, '--drop', 'um, you know']); eq(dr.code, 0, '--drop inside the current cut runs'); ok(dr.out && dr.out.edl.length >= 2 && dr.out.edl.every(function (s) { return !(s.start < 2.3 && s.end > 2.0); }) && !dr.out.edl.some(function (s) { return s.end - s.start < 0.2; }), 'the um is gone from the cut and no padding fragment is left behind (' + JSON.stringify(dr.out && dr.out.edl) + ')');
  var nt = solo(['video', 'cut', id, '--drop-silence']); ok(nt.code !== 0 && /Nothing to tidy/.test((nt.out && nt.out.error) || ''), 'words every 0.5 s: no pause to shorten, says so');
  var dup = solo(['video', 'add', 'Again', '--file', clip]); ok(dup.code === 0 && dup.out.existing === true && dup.out.id === id, 'adding the same file again returns the existing take');
  // a second take on the same clip whose words stop over the 1.5 s silence (3.0–4.5): the pause is real, fillers too
  var dup2 = solo(['video', 'add', 'With a pause', '--file', clip, '--again', '--no-open']); ok(dup2.code === 0 && dup2.out.id !== id, '--again adds it once more'); var id2 = dup2.out.id;
  var words2 = words.map(function (w, i) { return i < 6 ? w : { w: w.w, s: w.s + 1.5, e: w.e + 1.5 }; }).filter(function (w) { return w.e <= 10; }); fs.writeFileSync(path.join(tmp, 'words2.json'), JSON.stringify({ words: words2 }));
  var t2i = solo(['video', 'transcribe', id2, '--from', path.join(tmp, 'words2.json')]); eq(t2i.code, 0, 'second take transcribed');
  var trJ = JSON.parse(fs.readFileSync(path.join(data, 'videos', id2, 'transcript.json'), 'utf8')); ok(Array.isArray(trJ.silences) && trJ.silences.length === 1, 'transcript.json carries the silence measured on the audio (the import path measures it too)');
  var ts = solo(['video', 'cut', id2, '--drop-silence']); ok(ts.code === 0 && ts.out.runtime < 8.9 && ts.out.runtime > 8.4 && ts.out.edl.length === 2 && ts.out.edl.every(function (s) { return !inside(s.start, words2) && !inside(s.end, words2); }) && /shortened 1 pause over 0.7 s/.test(JSON.stringify(ts.out.notes)), '--drop-silence shortens the 1.5 s pause to a beat, edges outside words (' + JSON.stringify(ts.out && ts.out.edl) + ' ' + (ts.stderr || '').trim() + ')');
  var nt2 = solo(['video', 'cut', id2, '--drop-silence']); ok(nt2.code !== 0 && /Nothing to tidy/.test((nt2.out && nt2.out.error) || ''), 'a shortened pause does not count again');
  var tt = solo(['video', 'cut', id2, '--tidy']); ok(tt.code === 0 && /dropped \d+ filler/.test(JSON.stringify(tt.out.notes)), '--tidy then drops the fillers inside the current cut (' + JSON.stringify(tt.out && tt.out.notes) + ')');
  solo(['video', 'cut', id2, '--keep', '0-10']); var tidyCli = solo(['video', 'cut', id2, '--tidy']);
  var tw = V.trimToSilences(trJ.words, trJ.silences); var tPure = V.tidy(tw, [], null, { pause: 0.7, duration: 10, fps: 30, fillers: V.FILLERS }); var pureEdl = V.snap(tPure.ranges, tw, { fps: 30, duration: 10 }).edl;
  ok(tidyCli.code === 0 && V.edlHash(tidyCli.out.edl) === V.edlHash(pureEdl), '--tidy on the CLI = Video.tidy + snap (what the page runs): same EDL, same hash (' + V.edlHash(tidyCli.out.edl) + ')');
  solo(['video', 'rm', id2]);
  var bad = solo(['video', 'cut', id, '--keep', '5-50']); ok(bad.code === 0 && bad.out.edl[0].end <= 10 && bad.out.notes.some(function (n) { return /past the end/.test(n); }), 'a range past the end is clipped to the take and says so');
  var edlFile = path.join(tmp, 'cut.json'); fs.writeFileSync(edlFile, JSON.stringify([{ start: 1, end: 2, reason: 'HOOK' }, { start: 4, end: 5, reason: 'CTA' }]));
  var ce = solo(['video', 'cut', id, '--edl', edlFile]); eq(ce.code, 0, '--edl through the CLI runs'); eq(ce.out.edl[0].reason, 'HOOK', 'the stored cut keeps the reason'); ok(ce.out.notes.some(function (n) { return /replaced the previous cut/.test(n); }), 'replacing a cut says so');
  var lg0 = solo(['log', '--n', '3']); ok(/video cut v/.test(JSON.stringify(lg0.out)) && /2 pieces/.test(JSON.stringify(lg0.out)), 'the change log names the step (' + JSON.stringify(lg0.out).slice(0, 120) + ')');
  var revId = lg0.out[0].id; var rv = solo(['revert', revId]); var afterRv = solo(['video', 'show', id]);
  ok(rv.code === 0 && afterRv.out.edl.length === 1 && afterRv.out.edl[0].end <= 10 && afterRv.out.edl[0].start >= 4.9, 'revert brings the previous cut back (' + JSON.stringify(afterRv.out.edl) + ')');
  var c2 = solo(['video', 'cut', id, '--keep', '0.65-2.1, 4.0-6.0']); var runtime = c2.out.runtime;
  var lockDir = path.join(data, 'videos', id); fs.writeFileSync(path.join(lockDir, 'progress.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), finished: false }));
  var locked = solo(['video', 'render', id, '--preview']); ok(locked.code !== 0 && /already running/.test(locked.out && locked.out.error || ''), 'a second render is refused while one runs'); fs.unlinkSync(path.join(lockDir, 'progress.json'));
  var p = solo(['video', 'render', id, '--preview']); eq(p.code, 0, 'preview render runs (' + (p.stderr || '').trim() + ')');
  var pAgain = solo(['video', 'render', id, '--preview']); ok(pAgain.code !== 0 && /already this cut/.test((pAgain.out && pAgain.out.error) || ''), 'the same cut is not rendered twice without --again');
  var pOut = path.join(tmp, "out dir", "my cut.mp4"); var po = solo(['video', 'render', id, '--preview', '--again', '--out', pOut, '--style', 'bold', '--aspect', '9:16']); eq(po.code, 0, '--out --again --style bold --aspect 9:16 render runs (' + (po.stderr || '').trim() + ')');
  ok(fs.existsSync(pOut), '--out lands where asked'); var poW = probe(pOut, ['-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0']); eq(poW.trim(), '202,360', '9:16 centre crop of a 640×360 source');
  var pf = abs(p.out.file); ok(fs.existsSync(pf), 'preview file exists: ' + p.out.file); ok(/preview-1\.mp4$/.test(p.out.file), 'preview is numbered, never overwritten');
  var f = solo(['video', 'render', id, '--burn']); eq(f.code, 0, 'final render runs (' + (f.stderr || '').trim() + ')');
  var ff = abs(f.out.file); ok(fs.existsSync(ff), 'final file exists');
  var canBurn = V.node.hasFilter(tools.ffmpeg, 'subtitles'); eq(f.out.captions, canBurn ? 'burned' : 'track+srt', 'captions burned when ffmpeg can, otherwise a track + srt'); if (!canBurn) ok(/libass/.test(f.out.note || ''), 'the burn fallback says why');
  var streams = probe(ff, ['-show_entries', 'stream=codec_type,codec_name,width,height', '-of', 'csv=p=0']).split('\n');
  ok(streams.some(function (s) { return /h264/.test(s) && /640,360/.test(s); }), 'final is h264 at the source size (' + streams.join(' | ') + ')');
  ok(streams.some(function (s) { return /aac/.test(s); }), 'final has aac audio'); if (!canBurn) ok(streams.some(function (s) { return /mov_text/.test(s); }), 'final carries a mov_text caption track');
  var dur = Number(probe(ff, ['-show_entries', 'format=duration', '-of', 'csv=p=0']));
  ok(Math.abs(dur - runtime) <= 1 / 30 + 2 * 0.0214 + 0.05, 'output duration ' + dur + ' matches the cut ' + runtime + ' within a frame + audio priming');
  var frames = Number(probe(ff, ['-select_streams', 'v', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0']));
  eq(frames, Math.round(runtime * 30), 'frame count = runtime × fps exactly');
  var srtFile = abs(f.out.file.replace(/\.mp4$/, '.srt')); ok(fs.existsSync(srtFile), 'captions.srt written next to the export');
  var st = []; fs.readFileSync(srtFile, 'utf8').replace(/(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})/g, function (_, x, y) { st.push([V.parseTime(x), V.parseTime(y)]); });
  ok(st.length && st.every(function (x, i) { return x[1] > x[0] && x[1] <= dur + 0.01 && (!i || x[0] >= st[i - 1][1] - 1e-6); }), 'srt cues are monotonic and inside the output');
  var sh2 = solo(['video', 'show', id]); eq(sh2.code, 0, 'video show runs'); eq(sh2.out.exports.length, 3, 'three exports listed'); ok(/latest final/.test(sh2.stdout) === false, 'json output carries no markers');
  var c3 = solo(['video', 'cut', id, '--keep', '1-3']); var sh3 = solo(['video', 'show', id, '--json']); ok(sh3.out.exports.every(function (e) { return e.edlHash !== sh3.out.edlHash; }), 'exports remember the cut they were made from (stale after a new cut)');
  var stale = solo(['video', 'post', id, '--at', '2030-01-01T09:00']); ok(stale.code !== 0 && /rendered before the current cut/.test((stale.out && stale.out.error) || ''), 'posting a final that predates the cut is refused');
  var cback = solo(['video', 'cut', id, '--keep', '0.65-2.1, 4.0-6.0']); var fin2 = solo(['video', 'render', id]); ok(fin2.code !== 0 && /already this cut/.test((fin2.out && fin2.out.error) || ''), 'the earlier final is recognised as this cut again');
  var post = solo(['video', 'post', id, '--at', '2030-01-01T09:00']); eq(post.code, 0, 'video post runs (' + (post.stderr || '').trim() + ')'); eq(post.out.post.format, 'video', 'the post is a video post'); ok(/^file:\/\/\//.test(post.out.post.video.link) && post.out.post.video.link.indexOf(' ') < 0, 'the cut is linked as a proper file URL, not copied'); ok(!fs.existsSync(path.join(data, 'attachments')), 'nothing lands in attachments');
  var lst = solo(['video', 'list']); eq(lst.out[0].postId, post.out.post.id, 'the take remembers its post');
  var lg = solo(['log', '--n', '30']); ok(JSON.stringify(lg.out).indexOf('videos.json') >= 0, 'cuts are in the change log');
  var ks = solo(['config', 'set', 'video.elevenlabsKey', 'abc']); ok(ks.code !== 0 && /video key set/.test((ks.out && ks.out.error) || ''), 'config set refuses a key');
  var kin = cp.spawnSync(process.execPath, [path.join(ROOT, 'solo.js'), 'video', 'key', 'set', 'elevenlabs', '--stdin', '--json'], { cwd: ROOT, encoding: 'utf8', input: 'sk-test\n', env: Object.assign({}, process.env, { SOLO_DATA: data }) });
  ok(kin.status === 0 && JSON.parse(fs.readFileSync(path.join(data, 'secrets.json'), 'utf8')).elevenlabs === 'sk-test', 'the key arrives through stdin into secrets.json');
  var kbad = solo(['video', 'key', 'set', 'foo', 'x']); ok(kbad.code !== 0, 'only known services take a key');
  // a silent screen recording and a rotated phone clip
  var silent = path.join(tmp, 'silent.mp4'); cp.execFileSync(tools.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-t', '3', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', silent]);
  var sa = solo(['video', 'add', '--file', silent]); eq(sa.code, 0, 'a silent take is added'); eq(sa.out.title, 'silent', 'the title falls back to the file name'); eq(sa.out.sources[0].hasAudio, false, 'no audio is recorded');
  var st2 = solo(['video', 'transcribe', sa.out.id, '--engine', 'whisper']); ok(st2.code !== 0 && /no audio track/.test((st2.out && st2.out.error) || ''), 'transcribing a silent take says why');
  var sc2 = solo(['video', 'cut', sa.out.id, '--keep', '0.5-2']); var sr2 = solo(['video', 'render', sa.out.id, '--preview']); eq(sr2.code, 0, 'a silent take still trims and renders (' + (sr2.stderr || '').trim() + ')');
  var rot = path.join(tmp, 'rot.mp4'); cp.execFileSync(tools.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-display_rotation', '90', '-i', silent, '-c', 'copy', rot]);
  var ra = solo(['video', 'add', '--file', rot]); ok(ra.code === 0 && ra.out.sources[0].width === 180 && ra.out.sources[0].height === 320, 'a rotated phone clip reports its upright size (' + JSON.stringify(ra.out && ra.out.sources[0]) + ')');
  // backup: the ignore list reaches an existing data repo and keeps renders out
  cp.execFileSync('git', ['-C', data, 'init', '-q']); cp.execFileSync('git', ['-C', data, 'config', 'user.email', 't@t']); cp.execFileSync('git', ['-C', data, 'config', 'user.name', 't']);
  fs.writeFileSync(path.join(data, '.gitignore'), 'log.jsonl\n'); fs.mkdirSync(path.join(data, 'models'), { recursive: true }); fs.writeFileSync(path.join(data, 'models', 'ggml-x.bin'), 'x'); fs.writeFileSync(path.join(data, 'secrets.json'), '{}');
  var b = solo(['backup']); eq(b.code, 0, 'backup runs on an existing repo (' + (b.stderr || '').trim() + ')');
  var tracked = cp.execFileSync('git', ['-C', data, 'ls-files'], { encoding: 'utf8' }).split('\n');
  ok(tracked.indexOf('videos/' + id + '/transcript.json') >= 0, 'the transcript is backed up');
  ok(tracked.some(function (x) { return /^videos\/.*\.srt$/.test(x); }), 'the captions are backed up');
  ok(!tracked.some(function (x) { return /\.mp4$/.test(x) || /^models\//.test(x) || x === 'secrets.json' || /progress\.json$/.test(x); }), 'renders, the model, secrets and progress files are not (' + tracked.filter(function (x) { return /mp4|models|secrets|progress/.test(x); }).join(', ') + ')');
  var ign = fs.readFileSync(path.join(data, '.gitignore'), 'utf8'); ok(/videos\/\*\*/.test(ign) && /models\//.test(ign), '.gitignore gained the new lines');
  var folder = path.join(tmp, 'copy'); var bc = solo(['backup', '--to', folder]); eq(bc.code, 0, 'backup --to runs (' + (bc.stderr || '').trim() + ')');
  ok(fs.existsSync(path.join(folder, 'videos', id, 'transcript.json')) && !fs.existsSync(path.join(folder, 'videos', id, path.basename(p.out.file))) && !fs.existsSync(path.join(folder, 'models')), 'the folder copy skips renders and the model');
  var dc = solo(['doctor']); ok(JSON.stringify(dc.out.notes).indexOf('video: ffmpeg') >= 0, 'doctor reports the video tools');
  fs.renameSync(clip, clip + '.moved'); var dm = solo(['doctor']); ok(JSON.stringify(dm.out.issues).indexOf('footage not found') >= 0, 'doctor notices a moved source');
  var src = solo(['video', 'source', id, clip + '.moved']); eq(src.code, 0, 'video source re-points (' + (src.stderr || '').trim() + ')'); eq(src.out.transcript.words, 20, 'same recording: the words are kept');
  var rm = solo(['video', 'rm', id]); eq(rm.code, 0, 'video rm runs'); ok(fs.existsSync(lockDir), 'rm keeps the folder without --files');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(fails ? '✗ ' + fails + ' failed of ' + checks + ' checks' : '✓ ' + checks + ' checks passed (video rules + CLI on a synthetic clip)');
process.exit(fails ? 1 : 0);
