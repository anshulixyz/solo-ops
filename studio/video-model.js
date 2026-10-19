/* =========================================================================
   studio/video-model.js — the Video page's data: the takes of this workspace
   (Store key `marathon.videos` ↔ data/videos.json) and the cut logic the
   clicks run. No DOM here; core/test-video-page.js runs this file in Node.

   The page owns four fields of a take: activeId (library), edl, edlHash,
   status (and updatedAt). Everything else (sources, transcript, phrases,
   exports, postId) is written by the CLI (`node solo.js video …`, also when
   serve.js runs it for a button) and only ever read here. Every write goes
   through Sync like the other apps and carries a note, so `revert` undoes it.
   Global `VideoModel`.
   ========================================================================= */
(function (global) {
  'use strict';
  var KEY = Config.key('videos'); var FILE = Config.file('videos');
  var FILLERS = ['um', 'uh', 'uhm', 'umm', 'erm', 'hmm', 'you know', 'I mean'];
  var STATUS_LABEL = { recorded: 'No words yet', transcribed: 'Words ready', cut: 'Cut', rendered: 'Rendered', posted: 'Posted' };
  var lib = { activeId: '', videos: [] };
  var wordsCache = {};      // take id → [{ w, s, e }] once the page could read transcript.json (server or linked folder)
  var history = {};         // take id → previous EDLs this session (Undo)
  var removed = {};         // take ids removed on this page this session (so a stale file copy cannot bring them back on a write)
  var V = global.Video;

  function r3(x) { return Math.round(x * 1000) / 1000; }
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function normTake(v) {
    if (!v || typeof v !== 'object' || !v.id) return null;
    return Object.assign({}, v, { title: v.title || 'Untitled take', status: v.status || 'recorded', sources: Array.isArray(v.sources) ? v.sources : [], phrases: Array.isArray(v.phrases) ? v.phrases : [], edl: Array.isArray(v.edl) ? v.edl : [], edlHash: v.edlHash || '', cutAt: Number(v.cutAt) || 0, exports: Array.isArray(v.exports) ? v.exports : [], captions: v.captions || { style: 'sentence', burn: false } });
  }
  function normalize(body) {
    var vids = (body && Array.isArray(body.videos) ? body.videos : []).map(normTake).filter(Boolean);
    var activeId = body && body.activeId; if (!vids.some(function (v) { return v.id === activeId; })) activeId = vids[0] ? vids[0].id : '';
    return { activeId: activeId, videos: vids };
  }
  function init() { lib = normalize(Store.getJSON(KEY, null)); return lib; }
  function src(v) { return (v && v.sources && v.sources[0]) || {}; }
  function list() { return lib.videos.slice().sort(function (a, b) { return (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0); }); }   // newest take first, and a click never reorders the list
  function get(id) { return lib.videos.filter(function (v) { return v.id === id; })[0] || null; }
  function active() { return get(lib.activeId); }
  function setActive(id) { if (!get(id) || id === lib.activeId) return false; lib.activeId = id; Store.setJSON(KEY, lib, { silent: true }); return true; }   // no log line per click: the next real change carries it to the file
  function persist(note) { if (global.Sync && Sync.note) Sync.note(FILE, note || ''); Store.setJSON(KEY, lib); }

  /* ---- file ⇄ page -------------------------------------------------------- */
  // The file arrived (CLI wrote it, or another page): it is the truth for every field. Takes removed here this session stay removed only until the file confirms it.
  // whose cut is newer: the cut carries its own stamp (cutAt, written by every cut here and in the CLI), so an export or a transcript landing in the file never outranks a click
  function overlayCut(fv, lv) { if (lv && (lv.cutAt || 0) > (fv.cutAt || 0)) { fv.edl = lv.edl; fv.edlHash = lv.edlHash; fv.cutAt = lv.cutAt; if (lv.status === 'cut' || fv.status === 'cut' || fv.status === 'rendered') fv.status = lv.status; if ((lv.updatedAt || 0) > (fv.updatedAt || 0)) fv.updatedAt = lv.updatedAt; } }
  function applyFile(body) {
    var before = lib.activeId; var known = {}; lib.videos.forEach(function (v) { known[v.id] = v; });
    var next = normalize(body);
    next.videos.forEach(function (fv) { var lv = known[fv.id]; overlayCut(fv, lv); if (lv && JSON.stringify(lv.transcript || null) !== JSON.stringify(fv.transcript || null)) delete wordsCache[fv.id]; });   // new words (transcribe --force, video source): the old ones go
    var still = {}; next.videos = next.videos.filter(function (fv) { if (removed[fv.id]) { still[fv.id] = 1; return false; } return true; }); removed = still;   // removed here, not yet gone from the file: stays removed until the file drops it
    var isNew = next.activeId && !known[next.activeId];   // the CLI just added a take: open it; otherwise stay on what was open
    lib = next; if (!isNew && get(before)) lib.activeId = before; if (!get(lib.activeId)) lib.activeId = lib.videos[0] ? lib.videos[0].id : ''; Store.setJSON(KEY, lib, { silent: true }); return lib;
  }
  // About to write the file: start from the file's copy (the CLI may have added a transcript or an export since the last poll) and overlay only what this page owns.
  function reconcile(fileBody) {
    var file = normalize(fileBody); if (!fileBody || !Array.isArray(fileBody.videos)) return lib;
    var out = { activeId: lib.activeId, videos: [] }; var seen = {};
    file.videos.forEach(function (fv) {
      seen[fv.id] = 1; if (removed[fv.id]) return;
      var lv = get(fv.id); if (!lv) { out.videos.push(fv); return; }   // the CLI added it; the page did not know yet
      var m = Object.assign({}, fv); overlayCut(m, lv);   // the page's cut when it is newer than the file's
      out.videos.push(m);
    });
    lib.videos.forEach(function (lv) { if (!seen[lv.id] && !removed[lv.id]) { /* only in the browser: the CLI removed it (rm) or this browser holds an old copy; the file wins */ } });
    if (!out.videos.some(function (v) { return v.id === out.activeId; })) out.activeId = out.videos[0] ? out.videos[0].id : '';
    lib = out; Store.setJSON(KEY, lib, { silent: true }); return lib;
  }
  function read() { return { activeId: lib.activeId, videos: lib.videos }; }

  /* ---- words: real words when the page could read transcript.json, else the phrases stand in ---- */
  function setWords(id, words) { wordsCache[id] = V ? V.normalizeWords(words) : words; }
  function hasWords(id) { return Array.isArray(wordsCache[id]) && wordsCache[id].length > 0; }
  function wordsFor(v) { if (!v) return []; if (hasWords(v.id)) return wordsCache[v.id]; return (v.phrases || []).map(function (p) { return { w: p.t, s: p.s, e: p.e }; }); }   // phrase-level: cuts land between sentences
  function cueLevel(v) { return !!(v && v.transcript && v.transcript.granularity === 'cue'); }

  /* ---- the cut: what the toggles derive from and write back ---------------- */
  function dur(v) { return num(src(v).duration); }
  function pieces(v) { return (v.edl || []).length ? v.edl.map(function (s) { return { start: num(s.start), end: num(s.end) }; }) : null; }   // null = nothing cut: everything plays
  function covered(ps, a, b) { if (!ps) return b - a; var t = 0; ps.forEach(function (p) { var s = Math.max(a, p.start), e = Math.min(b, p.end); if (e > s) t += e - s; }); return t; }
  // one flag per phrase: kept when any of its words still plays (with the words), else when more than half of it plays
  function keptFlags(v) {
    var ps = pieces(v); var W = hasWords(v.id) ? wordsCache[v.id] : null;
    return (v.phrases || []).map(function (p) {
      if (!ps) return true;
      if (W) { var inside = W.filter(function (w) { return w.s >= p.s - 0.001 && w.e <= p.e + 0.001; }); if (inside.length) return inside.some(function (w) { var mid = (w.s + w.e) / 2; return ps.some(function (q) { return mid > q.start && mid < q.end; }); }); }
      var len = Math.max(0.001, p.e - p.s); return covered(ps, p.s, p.e) / len > 0.5;
    });
  }
  // the dropped spans inside a kept phrase (a filler that went): [{ s, e }]
  function holes(v, i) {
    var p = (v.phrases || [])[i]; var ps = pieces(v); if (!p || !ps) return [];
    var out = []; var cur = p.s; ps.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (q) { if (q.end <= cur || q.start >= p.e) return; if (q.start > cur) out.push({ s: r3(cur), e: r3(q.start) }); cur = Math.max(cur, q.end); }); if (cur < p.e - 0.02) out.push({ s: r3(cur), e: r3(p.e) });
    return out.filter(function (h) { return h.e - h.s > 0.02; });
  }
  function runtime(v) { var ps = pieces(v); return r3(ps ? ps.reduce(function (a, p) { return a + p.end - p.start; }, 0) : dur(v)); }
  function subtract(ps, a, b) { var out = []; ps.forEach(function (p) { if (p.end <= a || p.start >= b) { out.push(p); return; } if (p.start < a) out.push({ start: p.start, end: a }); if (p.end > b) out.push({ start: b, end: p.end }); }); return out; }
  function union(ps, a, b) { var out = [{ start: a, end: b }].concat(ps).sort(function (x, y) { return x.start - y.start; }); var m = []; out.forEach(function (p) { var l = m[m.length - 1]; if (l && p.start <= l.end + 1e-6) l.end = Math.max(l.end, p.end); else m.push({ start: p.start, end: p.end }); }); return m; }
  // everything plays again? then the cut is cleared rather than kept as one piece over the whole take
  function coversAll(v, edl) { if (edl.length !== 1) return false; var ph = v.phrases || []; if (!ph.length) return edl[0].start <= 0.001 && edl[0].end >= dur(v) - 0.001; return edl[0].start <= ph[0].s + 0.001 && edl[0].end >= ph[ph.length - 1].e - 0.001; }
  function snapTo(v, ranges) { var words = wordsFor(v); return V.snap(ranges, words, { fps: num(src(v).fps), duration: dur(v) }); }
  // edges that already sit on the current cut are left exactly where they are (snap() honours fixedStart / fixedEnd), so a cut and a keep of the same sentence give back the same EDL and hash
  function markFixed(ps, cur) { var E = (cur || []).map(function (s) { return [num(s.start), num(s.end)]; }); return ps.map(function (p) { var o = { start: p.start, end: p.end }; if (E.some(function (e) { return Math.abs(e[0] - p.start) < 1e-6; })) o.fixedStart = true; if (E.some(function (e) { return Math.abs(e[1] - p.end) < 1e-6; })) o.fixedEnd = true; return o; }); }
  function sameEdl(a, b) { return a.length === b.length && a.every(function (s, i) { return Math.abs(num(s.start) - num(b[i].start)) < 0.0015 && Math.abs(num(s.end) - num(b[i].end)) < 0.0015; }); }
  // flip one phrase (or a run i..j): cut phrases are subtracted from the pieces, kept ones added back, then every edge snaps to a word
  function toggle(v, i, j) {
    var flags = keptFlags(v); var ph = v.phrases || []; if (!ph.length) throw new Error('No words yet');
    var a = Math.min(i, j == null ? i : j), b = Math.max(i, j == null ? i : j); var ps = pieces(v) || [{ start: 0, end: dur(v) }];
    var target = !flags[i];   // the clicked phrase decides the direction for the whole run
    var memo = cutMemo[v.id] = cutMemo[v.id] || {};
    for (var k = a; k <= b; k++) {
      var p = ph[k]; if (!p) continue;
      if (target) { ps = union(ps, p.s, p.e); (memo[k] || []).forEach(function (h) { ps = subtract(ps, h.s, h.e); }); delete memo[k]; }   // back as it was: the fillers dropped inside it stay dropped
      else { memo[k] = holes(v, k); ps = subtract(ps, p.s, p.e); }
    }
    var W = hasWords(v.id) ? wordsCache[v.id] : null;
    ps = ps.filter(function (p) { if (p.end - p.start <= 0.02) return false; if (W) return W.some(function (w) { var mid = (w.s + w.e) / 2; return mid > p.start && mid < p.end; }); return ph.some(function (q) { return Math.min(q.e, p.end) - Math.max(q.s, p.start) > 0.02; }); });   // a leftover with no word in it is silence: it goes
    if (!ps.length) throw new Error('That would cut everything. Keep at least one sentence.');
    var res = snapTo(v, markFixed(ps, v.edl));
    if (coversAll(v, res.edl)) return setEdl(v, [], 'kept everything again');
    return setEdl(v, res.edl, (target ? 'kept' : 'cut') + (b > a ? ' ' + (b - a + 1) + ' sentences' : ' "' + ph[i].t.slice(0, 40) + '"'), res.notes);
  }
  function fillerList(custom) { return (custom && custom.length ? custom : FILLERS).map(function (x) { return String(x).trim(); }).filter(Boolean); }
  // how many fillers the button would take, and where they are (for the highlight)
  function fillers(v, custom) {
    if (!v || !hasWords(v.id) || cueLevel(v)) return { hits: 0, holes: [] };
    try { var d = V.drop(fillerList(custom), wordsCache[v.id], pieces(v)); return { hits: d.holes.filter(function (h) { return !isSpared(v.id, h); }).length, holes: d.holes }; } catch (e) { return { hits: 0, holes: [] }; }
  }
  var cutMemo = {};  // take id → { phrase index → the holes it had when it was cut }, so keeping it again does not bring its fillers back
  var spared = {};   // take id → [{ s, e }] fillers the user clicked to keep (this session)
  function sparedOf(id) { return spared[id] || []; }
  function isSpared(id, h) { return sparedOf(id).some(function (x) { return Math.abs(x.s - h.s) < 0.01 && Math.abs(x.e - h.e) < 0.01; }); }
  function spare(v, h) { var l = spared[v.id] = sparedOf(v.id); if (isSpared(v.id, h)) spared[v.id] = l.filter(function (x) { return !(Math.abs(x.s - h.s) < 0.01 && Math.abs(x.e - h.e) < 0.01); }); else l.push({ s: h.s, e: h.e }); return isSpared(v.id, h); }
  function dropFillers(v, custom) {
    if (!hasWords(v.id)) throw new Error('Dropping fillers needs the words with their times: start node serve.js and open this page there.');
    if (cueLevel(v)) throw new Error('These words came from captions (whole lines), so single fillers cannot be dropped. Get the words on this computer for that.');
    var d = V.drop(fillerList(custom), wordsCache[v.id], pieces(v)); var keep = sparedOf(v.id); var hits = d.holes.filter(function (h) { return !isSpared(v.id, h); }).length;
    if (!hits) throw new Error('No fillers found in what plays.');
    var ps = d.ranges.map(function (r) { return { start: r.start, end: r.end }; }); keep.forEach(function (h) { if (d.holes.some(function (x) { return Math.abs(x.s - h.s) < 0.01; })) ps = union(ps, h.s, h.e); });   // the ones she clicked to keep go back in
    var res = snapTo(v, markFixed(ps, v.edl)); setEdl(v, res.edl, 'dropped ' + hits + ' filler' + (hits === 1 ? '' : 's'), res.notes); return hits;
  }
  // a struck word inside a kept sentence, clicked: it plays again
  function restore(v, h) { var ps = union(pieces(v) || [{ start: 0, end: dur(v) }], h.s, h.e); var res = snapTo(v, markFixed(ps, v.edl)); if (coversAll(v, res.edl)) return setEdl(v, [], 'kept everything again'); return setEdl(v, res.edl, 'put a word back'); }
  function keepEverything(v) { if (!(v.edl || []).length) return false; setEdl(v, [], 'kept everything again'); return true; }
  // the one write: edl + hash + status + updatedAt, logged with the step
  function setEdl(v, edl, what, notes) {
    var t = get(v.id); if (!t) throw new Error('This take is gone');
    if (sameEdl(t.edl || [], edl)) return { edl: t.edl, runtime: runtime(t), notes: notes || [], note: '', same: true };   // nothing moved: nothing written, nothing to undo
    (history[t.id] = history[t.id] || []).push({ edl: t.edl, edlHash: t.edlHash, status: t.status, cutAt: t.cutAt }); if (history[t.id].length > 50) history[t.id].shift();
    t.edl = edl; t.edlHash = edl.length ? V.edlHash(edl) : ''; t.cutAt = Date.now();
    if (edl.length) { if (['recorded', 'transcribed', 'rendered'].indexOf(t.status) >= 0) t.status = 'cut'; } else if (t.status === 'cut' || t.status === 'rendered') t.status = t.transcript ? 'transcribed' : 'recorded';
    t.updatedAt = Date.now();
    var note = 'video cut ' + t.id + ' (' + (edl.length ? edl.length + ' piece' + (edl.length === 1 ? '' : 's') + ', ' + fmt(runtime(t)) : 'cleared') + '): ' + what;
    persist(note); return { edl: t.edl, runtime: runtime(t), notes: notes || [], note: note };
  }
  function canUndo(v) { return !!(v && history[v.id] && history[v.id].length); }
  function undo(v) { var h = v && history[v.id]; if (!h || !h.length) return false; var t = get(v.id); if (!t) { delete history[v.id]; return false; } var prev = h.pop(); t.edl = prev.edl; t.edlHash = prev.edlHash; t.status = prev.status; t.cutAt = Date.now(); t.updatedAt = Date.now(); persist('video cut ' + t.id + ': undo'); return true; }
  function remove(v) { var t = get(v.id); if (!t) return false; removed[t.id] = 1; lib.videos = lib.videos.filter(function (x) { return x.id !== t.id; }); if (lib.activeId === t.id) lib.activeId = lib.videos[0] ? lib.videos[0].id : ''; persist('video rm ' + t.id + ' ' + t.title); return true; }
  // a reply's `video cut <id> --keep "…"` / `--drop "…"` (core/apply.js on this page)
  function cutFromLine(id, flags) {
    var t = get(id) || lib.videos.filter(function (x) { return x.title.toLowerCase() === String(id).toLowerCase(); })[0]; if (!t) throw new Error('no take matches "' + id + '"');
    var res;
    if (flags.drop) { var custom = String(flags.drop).split(/[,;]+/); if (!hasWords(t.id)) throw new Error('dropping words needs the transcript; open the Video page with node serve.js running'); var d = V.drop(custom, wordsCache[t.id], pieces(t)); if (!d.hits) throw new Error('none of those words are in what plays'); res = snapTo(t, d.ranges); setEdl(t, res.edl, 'dropped ' + d.hits + ' (from a reply)', res.notes); }
    else if (flags.keep) { res = snapTo(t, V.parseRanges(String(flags.keep))); setEdl(t, res.edl, 'from a reply' + (flags.note ? ': ' + String(flags.note).slice(0, 60) : ''), res.notes); }
    else throw new Error('video cut needs --keep "…" or --drop "…"');
    return { take: t, edl: res.edl, runtime: res.runtime };
  }

  /* ---- text ------------------------------------------------------------------ */
  function fmt(sec) { return V ? V.fmt(sec) : String(sec); }
  function tag(sec) { return V ? V.fmtTag(sec) : String(sec); }
  function size(b) { b = b || 0; return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : b < 10 * 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b < 1073741824 ? Math.round(b / 1048576) + ' MB' : (b / 1073741824).toFixed(1) + ' GB'; }
  function latestExport(v, kind) { return (v.exports || []).filter(function (e) { return e.kind === kind; }).slice(-1)[0] || null; }
  // `posted` is never stored on the take: the linked post says so (social posted <post>)
  function statusOf(v) { if (!v.postId) return v.status; var posts = Store.getJSON(Config.key('social'), []) || []; var p = posts.filter(function (x) { return x && x.id === v.postId; })[0]; return p && p.status === 'posted' ? 'posted' : v.status; }
  function statusLabel(st) { return STATUS_LABEL[st] || st; }
  // what the page says to do next, with the button that does it (the CLI's videoNext prints terminal lines; here the buttons are the lines)
  function nextStep(v) {
    var st = v.status; var fin = latestExport(v, 'final'), pre = latestExport(v, 'preview');
    if (st === 'recorded') return { text: 'Next: get the words.', action: 'transcribe', label: 'Get the words' };
    if (st === 'transcribed') return { text: 'Next: pick what stays. Click a sentence to cut it, or drop the fillers.', action: '' };
    if (st === 'cut') return pre && pre.edlHash === v.edlHash ? { text: 'Next: the final, same cut, full quality.', action: 'final', label: 'Render the final' } : { text: 'Next: watch a preview.', action: 'preview', label: 'Render a preview' };
    if (st === 'rendered') return fin && fin.edlHash === v.edlHash ? (v.postId ? { text: statusOf(v) === 'posted' ? 'Posted. Nothing left to do here.' : 'It is on the schedule. Mark it posted there once it is up.', action: 'post-open' } : { text: 'Next: post it.', action: 'post', label: 'Make the post' }) : { text: 'The cut changed after the last final. Render again.', action: 'final', label: 'Render the final' };
    return { text: '', action: '' };
  }
  // the take as text for an agent: the same lines the {{take}} token carries, then how to answer so the cut lands on this page
  function copyText(v) {
    var s = src(v); var L = ['# Take [' + v.id + '] ' + v.title + ' · ' + v.status + (s.duration ? ' · ' + fmt(s.duration) : '') + (s.fps ? ' · ' + s.fps + ' fps' : '') + (s.width ? ' · ' + s.width + '×' + s.height : '') + (v.transcript && v.transcript.words ? ' · ' + v.transcript.words + ' words' : ''), ''];
    if ((v.phrases || []).length) { L.push('## Words ([start-end] in seconds' + (cueLevel(v) ? ', cue-level: cuts snap to cues' : '') + ')', ''); v.phrases.forEach(function (p) { L.push('[' + tag(p.s) + '-' + tag(p.e) + '] ' + p.t); }); L.push(''); }
    else L.push('(no words yet)', '');
    if ((v.edl || []).length) { L.push('## Cut (' + v.edl.length + ' piece' + (v.edl.length === 1 ? '' : 's') + ', ' + fmt(runtime(v)) + ')'); v.edl.forEach(function (p, i) { L.push((i + 1) + '. ' + fmt(p.start) + '-' + fmt(p.end) + (p.quote ? '  "' + p.quote + '"' : '')); }); L.push(''); }
    L.push('## How to answer', 'Propose the cut in plain words first (what goes, what stays, the runtime). After my yes, end with one line I paste into Guide → Reply on the Video page, and the cut appears there:', '  video cut ' + v.id + ' --keep "2.4-6.8, 8.1-15.0"     (the pieces to keep, seconds, in order)', '  video cut ' + v.id + ' --drop "um, uh, you know"      (only fillers go)', 'Rendering happens on the page, not from the reply.');
    return L.join('\n');
  }
  function terminal(v, what) {   // the terminal line for a step, when the page cannot run it
    var ws = Config.activeWs && Config.PRIMARY && Config.activeWs() !== Config.PRIMARY ? ' --ws ' + Config.activeWs() : '';
    var id = v ? v.id : '<take>';
    return { transcribe: 'node solo.js video transcribe ' + id + ws, whisper: 'node solo.js video transcribe ' + id + ' --engine whisper' + ws, elevenlabs: 'node solo.js video transcribe ' + id + ' --engine elevenlabs --yes' + ws, 'import': 'node solo.js video transcribe ' + id + ' --from <file.srt>' + ws, preview: 'node solo.js video render ' + id + ' --preview' + ws, final: 'node solo.js video render ' + id + ws, post: 'node solo.js video post ' + id + ' --at "tomorrow 09:00"' + ws, add: 'node solo.js video add "Title" --file "<path to the recording>"' + ws, serve: 'node serve.js' }[what] || '';
  }

  global.VideoModel = { KEY: KEY, FILE: FILE, FILLERS: FILLERS, init: init, lib: function () { return lib; }, list: list, get: get, active: active, setActive: setActive, src: src,
    normalize: normalize, applyFile: applyFile, reconcile: reconcile, read: read, setWords: setWords, hasWords: hasWords, wordsFor: wordsFor, cueLevel: cueLevel,
    keptFlags: keptFlags, holes: holes, runtime: runtime, pieces: pieces, toggle: toggle, fillers: fillers, fillerList: fillerList, dropFillers: dropFillers, spare: spare, isSpared: isSpared, restore: restore, keepEverything: keepEverything, setEdl: setEdl, canUndo: canUndo, undo: undo, remove: remove, cutFromLine: cutFromLine,
    fmt: fmt, tag: tag, size: size, latestExport: latestExport, statusOf: statusOf, statusLabel: statusLabel, nextStep: nextStep, copyText: copyText, terminal: terminal, dur: dur };
})(typeof window !== 'undefined' ? window : this);
