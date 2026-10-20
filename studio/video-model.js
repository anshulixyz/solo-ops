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
  var FILLERS = (global.Video && Video.FILLERS) || ['um', 'uh', 'uhm', 'umm', 'erm', 'hmm', 'you know', 'I mean'];   // one list for the page and the CLI's --tidy
  var STATUS_LABEL = { recorded: 'No words yet', transcribed: 'Words ready', cut: 'Cut', rendered: 'Rendered', posted: 'Posted' };
  var lib = { activeId: '', videos: [] };
  var wordsCache = {};      // take id → [{ w, s, e }] once the page could read transcript.json (server or linked folder)
  var history = {};         // take id → previous EDLs this session (Undo)
  var future = {};          // take id → states undone this session (Redo)
  var removedMemo = {};     // take id → [{ s, e, pieces }]: what each cut took out, so a keep restores it exactly
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
  function init() { lib = normalize(Store.getJSON(KEY, null)); removedMemo = {}; history = {}; future = {}; return lib; }
  function forget(id) { delete removedMemo[id]; }   // the cut's history diverged (undo, redo, start over, an outside cut): what a cut removed no longer applies
  function src(v) { return (v && v.sources && v.sources[0]) || {}; }
  function list() { return lib.videos.slice().sort(function (a, b) { return (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0); }); }   // newest take first, and a click never reorders the list
  function get(id) { return lib.videos.filter(function (v) { return v.id === id; })[0] || null; }
  function active() { return get(lib.activeId); }
  function setActive(id) { if (!get(id) || id === lib.activeId) return false; lib.activeId = id; Store.setJSON(KEY, lib, { silent: true }); return true; }   // no log line per click: the next real change carries it to the file
  function persist(note) { if (global.Sync && Sync.note) Sync.note(FILE, note || ''); Store.setJSON(KEY, lib); }

  /* ---- file ⇄ page -------------------------------------------------------- */
  // The file arrived (CLI wrote it, or another page): it is the truth for every field. Takes removed here this session stay removed only until the file confirms it.
  // whose cut is newer: the cut carries its own stamp (cutAt, written by every cut here and in the CLI), so an export or a transcript landing in the file never outranks a click
  function overlayCut(fv, lv) {
    if (!lv) return;
    if ((lv.cutAt || 0) > (fv.cutAt || 0)) { fv.edl = lv.edl; fv.edlHash = lv.edlHash; fv.cutAt = lv.cutAt; if (lv.status === 'cut' || fv.status === 'cut' || fv.status === 'rendered') fv.status = lv.status; if ((lv.updatedAt || 0) > (fv.updatedAt || 0)) fv.updatedAt = lv.updatedAt; }
    else if ((fv.cutAt || 0) > (lv.cutAt || 0) && fv.edlHash !== lv.edlHash) { delete history[fv.id]; delete future[fv.id]; forget(fv.id); }   // the CLI or an agent cut it since: Undo must not write the page's old cut over theirs
    if ((lv.renamedAt || 0) > (fv.renamedAt || 0)) { fv.title = lv.title; fv.renamedAt = lv.renamedAt; }   // a rename here, same rule
  }
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
  var silCache = {};
  function setWords(id, words, silences) { silCache[id] = Array.isArray(silences) ? silences : []; wordsCache[id] = V ? V.trimToSilences(V.normalizeWords(words), silCache[id]) : words; }
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
  // everything plays again? only when the single piece is the whole take (a trimmed lead or tail is a cut, not "everything")
  function coversAll(v, edl) {
    if (edl.length !== 1) return false; var ph = v.phrases || []; var s = edl[0].start, e = edl[0].end;
    var headOk = s <= 0.001 || (ph.length && Math.abs(s - ph[0].s) < 0.1), tailOk = e >= dur(v) - 0.001 || (ph.length && Math.abs(e - ph[ph.length - 1].e) < 0.1);   // a pad around the first/last word is not a trim; a shortened lead or tail is
    return !!(headOk && tailOk);
  }
  function snapTo(v, ranges) { var words = wordsFor(v); return V.snap(ranges, words, { fps: num(src(v).fps), duration: dur(v) }); }
  // edges that already sit on the current cut are left exactly where they are (snap() honours fixedStart / fixedEnd), so a cut and a keep of the same sentence give back the same EDL and hash
  function markFixed(ps, cur) { var E = (cur || []).map(function (s) { return [num(s.start), num(s.end)]; }); return ps.map(function (p) { var o = { start: p.start, end: p.end }; if (E.some(function (e) { return Math.abs(e[0] - p.start) < 1e-6; })) o.fixedStart = true; if (E.some(function (e) { return Math.abs(e[1] - p.end) < 1e-6; })) o.fixedEnd = true; return o; }); }
  function sameEdl(a, b) { return a.length === b.length && a.every(function (s, i) { return Math.abs(num(s.start) - num(b[i].start)) < 0.0015 && Math.abs(num(s.end) - num(b[i].end)) < 0.0015; }); }
  // flip one phrase (or a run i..j): cut phrases are subtracted from the pieces, kept ones added back, then every edge snaps to a word
  // the spans a sentence is made of: its words, consecutive ones joined (a gap under 0.35 s belongs to the words), or the sentence itself without words
  function sentenceSpans(v, i) {
    var p = (v.phrases || [])[i]; if (!p) return []; var W = hasWords(v.id) ? wordsCache[v.id].filter(function (w) { return w.s >= p.s - 0.001 && w.e <= p.e + 0.001; }) : [];
    if (!W.length) return [{ s: p.s, e: p.e }]; var spans = []; var cur = null;
    W.forEach(function (w) { if (cur && w.s <= cur.e + 0.35) cur.e = Math.max(cur.e, w.e); else { cur = { s: w.s, e: w.e }; spans.push(cur); } }); return spans;
  }
  // a sentence (or a run i..j) goes or comes back, through the same cutSpans / keepSpans the selection uses
  function toggle(v, i, j) {
    var flags = keptFlags(v); var ph = v.phrases || []; if (!ph.length) throw new Error('No words yet');
    var a = Math.min(i, j == null ? i : j), b = Math.max(i, j == null ? i : j); var target = !flags[i]; var spans = [];
    for (var k = a; k <= b; k++) spans = spans.concat(sentenceSpans(v, k));
    var what = (target ? 'kept' : 'cut') + (b > a ? ' ' + (b - a + 1) + ' sentences' : ' "' + ph[i].t.slice(0, 40) + '"');
    return target ? keepSpans(v, spans, what) : cutSpans(v, spans, what);
  }
  function fillerList(custom) { return (custom && custom.length ? custom : FILLERS).map(function (x) { return String(x).trim(); }).filter(Boolean); }
  // the --drop verb of a pasted reply (and the tests): a word list inside what plays. The page's button is tidy() below.
  function fillers(v, custom) {
    if (!v || !hasWords(v.id) || cueLevel(v)) return { hits: 0, holes: [] };
    try { var d = V.drop(fillerList(custom), wordsCache[v.id], pieces(v), { duration: dur(v) }); return { hits: d.holes.length, holes: d.holes }; } catch (e) { return { hits: 0, holes: [] }; }
  }
  function dropFillers(v, custom) {
    if (!hasWords(v.id)) throw new Error('Dropping fillers needs the words with their times: start node serve.js and open this page there.');
    if (cueLevel(v)) throw new Error('These words came from captions (whole lines), so single fillers cannot be dropped. Get the words on this computer for that.');
    var d = V.drop(fillerList(custom), wordsCache[v.id], pieces(v), { duration: dur(v) }); var hits = d.holes.length;
    if (!hits) throw new Error('No fillers found in what plays.');
    var res = snapTo(v, markFixed(d.ranges.map(function (r) { return { start: r.start, end: r.end }; }), v.edl)); setEdl(v, res.edl, 'dropped ' + hits + ' filler' + (hits === 1 ? '' : 's'), res.notes); return hits;
  }
  function keepEverything(v) { if (!(v.edl || []).length) return false; setEdl(v, [], 'kept everything again'); forget(v.id); return true; }
  // the one write: edl + hash + status + updatedAt, logged with the step

  function setEdl(v, edl, what, notes) {
    var t = get(v.id); if (!t) throw new Error('This take is gone');
    if (sameEdl(t.edl || [], edl)) return { edl: t.edl, runtime: runtime(t), notes: notes || [], note: '', same: true };   // nothing moved: nothing written, nothing to undo
    (history[t.id] = history[t.id] || []).push({ edl: t.edl, edlHash: t.edlHash, status: t.status, cutAt: t.cutAt }); if (history[t.id].length > 50) history[t.id].shift(); future[t.id] = [];
    t.edl = edl; t.edlHash = edl.length ? V.edlHash(edl) : ''; t.cutAt = Date.now();
    if (edl.length) { if (['recorded', 'transcribed', 'rendered'].indexOf(t.status) >= 0) t.status = 'cut'; } else if (t.status === 'cut' || t.status === 'rendered') t.status = t.transcript ? 'transcribed' : 'recorded';
    t.updatedAt = Date.now();
    var note = 'video cut ' + t.id + ' (' + (edl.length ? edl.length + ' piece' + (edl.length === 1 ? '' : 's') + ', ' + fmt(runtime(t)) : 'cleared') + '): ' + what;
    persist(note); return { edl: t.edl, runtime: runtime(t), notes: notes || [], note: note };
  }
  function canUndo(v) { return !!(v && history[v.id] && history[v.id].length); }
  function canRedo(v) { return !!(v && future[v.id] && future[v.id].length); }
  function swapState(t, st) { var cur = { edl: t.edl, edlHash: t.edlHash, status: t.status, cutAt: t.cutAt }; t.edl = st.edl; t.edlHash = st.edlHash; t.status = st.status; t.cutAt = Date.now(); t.updatedAt = Date.now(); return cur; }
  function undo(v) { var h = v && history[v.id]; if (!h || !h.length) return false; var t = get(v.id); if (!t) { delete history[v.id]; return false; } (future[t.id] = future[t.id] || []).push(swapState(t, h.pop())); forget(t.id); persist('video cut ' + t.id + ': undo'); return true; }
  function redo(v) { var f = v && future[v.id]; if (!f || !f.length) return false; var t = get(v.id); if (!t) { delete future[v.id]; return false; } (history[t.id] = history[t.id] || []).push(swapState(t, f.pop())); forget(t.id); persist('video cut ' + t.id + ': redo'); return true; }
  /* ---- the editing verbs the page uses: a span of the take (words, a sentence) goes or comes back; tidy up ---- */
  // what a cut took out, exactly, so putting it back restores the same pieces (holes, pauses and silent tails included): the hash comes back
  removedMemo = {};
  function wordInside(v, p) { var W = hasWords(v.id) ? wordsCache[v.id] : null; var ph = v.phrases || []; if (W) return W.some(function (w) { var mid = (w.s + w.e) / 2; return mid > p.start && mid < p.end; }); return ph.some(function (q) { return Math.min(q.e, p.end) - Math.max(q.s, p.start) > 0.02; }); }
  function cutSpans(v, spans, what) {   // the words inside these spans stop playing (one step, one Undo)
    var holes = (spans || []).map(function (x) { return { s: num(x.s), e: num(x.e) }; }).filter(function (h) { return h.e > h.s; }); if (!holes.length) return null;
    var before = pieces(v) || [{ start: 0, end: dur(v) }];
    var ps = V.cutOut(before, holes, dur(v)).filter(function (p) { return wordInside(v, p); });   // a leftover with no word in it (a silent tail) goes with the cut
    if (!ps.length) throw new Error('That would cut everything. Keep at least one word.');
    var res = snapTo(v, markFixed(ps, v.edl)); var r = setEdl(v, res.edl, what || 'cut ' + holes.length + ' span' + (holes.length === 1 ? '' : 's'), res.notes);
    var now = (get(v.id) || v).edl || res.edl; var gone = before; now.forEach(function (p) { gone = subtract(gone, num(p.start), num(p.end)); });   // exactly what left the cut, after the snap
    if (!r.same) holes.forEach(function (h) {   // one memo entry per hole, holding what that hole took (whole pieces, pads included, by their midpoint): a keep on one span never shadows the others (two spans in one step = the trim)
      var mine = gone.filter(function (p) { var mid = (p.start + p.end) / 2; var own = holes.filter(function (o) { return mid >= o.s - 0.001 && mid <= o.e + 0.001; })[0]; if (own) return own === h; return holes.reduce(function (best, o) { var dd = Math.min(Math.abs(mid - o.s), Math.abs(mid - o.e)); return !best || dd < best.d ? { o: o, d: dd } : best; }, null).o === h; });
      if (mine.length) (removedMemo[v.id] = removedMemo[v.id] || []).push({ s: Math.min(h.s, Math.min.apply(null, mine.map(function (p) { return p.start; }))), e: Math.max(h.e, Math.max.apply(null, mine.map(function (p) { return p.end; }))), pieces: mine });   // the entry spans its pieces: a silent gap a hole swallowed (no word in it) is still found by the keep that asks for its sentence
    });
    return r;
  }
  function keepOnly(v, s, e, what) {   // the trim: everything before s and after e goes; what is inside stays as it is (one step, one Undo)
    var d = dur(v); if (!d) { var W0 = wordsFor(v); d = W0.length ? num(W0[W0.length - 1].e) : 0; }   // no probed duration: the last word ends the take
    s = Math.max(0, num(s)); e = d ? Math.min(d, num(e)) : num(e); if (!(e > s)) return null;
    var was = runtime(v); var spans = []; if (s > 0) spans.push({ s: 0, e: s }); if (d && e < d) spans.push({ s: e, e: d });
    if (!spans.length) return { same: true, was: was, kept: was };
    var r = cutSpans(v, spans, what || 'kept only ' + fmt(s) + '-' + fmt(e)); if (!r) return null; r.was = was; r.kept = runtime(get(v.id) || v); return r;
  }
  function captionCues(v) {   // what the player captions: the same chunks the renders' .srt carries (words), else the sentences
    var W = hasWords(v.id) ? wordsCache[v.id] : null; var style = (v.captions && v.captions.style) || 'sentence';
    if (W && W.length) return V.chunks(W, style);
    return (v.phrases || []).map(function (p) { return { s: p.s, e: p.e, t: p.t }; });
  }
  function keepSpans(v, spans, what) {   // the words inside these spans play again, as they were
    var ps = pieces(v) || [{ start: 0, end: dur(v) }]; var cur = pieces(v);
    var memo = (removedMemo[v.id] || []).filter(function (m) { return m.pieces.every(function (p) { return covered(cur, p.start, p.end) < 0.01; }); });   // an entry counts only while what it removed is still cut (an outside change or Undo makes it stale)
    removedMemo[v.id] = memo;
    (spans || []).forEach(function (x) { var s = num(x.s), e = num(x.e); if (e <= s) return;
      var hits = memo.filter(function (m) { return m.s < e + 0.001 && m.e > s - 0.001; });
      hits.forEach(function (m) {   // the part of the remembered cut this span asks for comes back, plus any silent remainder next to it (a tail belongs to nobody else); the rest stays remembered
        var left = [];
        m.pieces.forEach(function (p) { var a = Math.max(p.start, s), b = Math.min(p.end, e); if (b > a) ps = union(ps, a, b); subtract([p], s, e).forEach(function (r) { if (wordInside(v, r)) left.push(r); else if (b > a) ps = union(ps, r.start, r.end); else left.push(r); }); });
        m.pieces = left;
      });
      var rest = [{ start: s, end: e }]; hits.forEach(function (m) { rest = subtract(rest, m.s, m.e); });   // what no remembered cut covers comes back whole
      rest.forEach(function (p) { ps = union(ps, p.start, p.end); }); });
    removedMemo[v.id] = memo.filter(function (m) { return m.pieces.length; });
    var res = snapTo(v, markFixed(ps, v.edl));
    if (coversAll(v, res.edl)) return setEdl(v, [], 'kept everything again');
    return setEdl(v, res.edl, what || 'put back ' + (spans || []).length + ' span' + ((spans || []).length === 1 ? '' : 's'), res.notes);
  }
  function cutSpan(v, s, e, what) { return cutSpans(v, [{ s: s, e: e }], what || 'cut ' + fmt(s) + '-' + fmt(e)); }
  function keepSpan(v, s, e, what) { return keepSpans(v, [{ s: s, e: e }], what || 'kept ' + fmt(s) + '-' + fmt(e)); }
  // is this span playing? (every bit of it inside the pieces)
  function playing(v, s, e) { var ps = pieces(v); if (!ps) return true; var mid = (s + e) / 2; return ps.some(function (p) { return mid > p.start && mid < p.end; }); }   // by the midpoint, like keptFlags: a frame-edge nibble is not a cut
  function rename(v, title) { var t = get(v.id); title = String(title || '').trim().slice(0, 120); if (!t || !title || title === t.title) return false; t.title = title; t.renamedAt = Date.now(); t.updatedAt = Date.now(); persist('video title ' + t.id + ': ' + title); return true; }
  function autoMaxMin() { var n = Number(Config.get('video.autoMaxMin')); return n > 0 ? n : 30; }
  function pauseMin() { var c = global.Config && Config.get ? Config.get('video.pause') : 0; return Number(c) > 0.1 ? Number(c) : V.DEFAULTS.pause; }
  // what tidy up would take right now: the long pauses and the fillers inside what plays
  // what "Remove fillers and pauses" would take right now, through the same Video.tidy the CLI's --tidy runs
  // which: 'both' | 'fillers' | 'pauses' | 'retakes'; custom: a filler list; only: the hole keys ticked in the Review list; retakes: include the first try of something said twice
  function tidyOpts(v, which, custom, only, withRetakes) { return { pause: which === 'retakes' ? 1e9 : pauseMin(), duration: dur(v), fps: num(src(v).fps), cue: cueLevel(v), fillers: which === 'pauses' || which === 'retakes' ? false : fillerList(custom), retakes: which === 'retakes' || !!withRetakes, only: only || null }; }
  function tidyCount(v, which, custom, only, withRetakes) {
    if (!v || !hasWords(v.id)) return { fillers: 0, pauses: 0, retakes: 0, holes: [], pauseHoles: [], fillerHoles: [], retakeHoles: [], allPauses: [] };
    var t = V.tidy(wordsCache[v.id], null, v.edl, tidyOpts(v, which, custom, only, withRetakes)); if (which === 'fillers') { t.pauseHoles = []; t.pauseHits = 0; t.holes = t.fillerHoles; }
    var ps = pieces(v); var all = V.pauses(wordsCache[v.id], null, tidyOpts(v)).map(function (h) { return { s: h.s, e: h.e, gs: h.gs, ge: h.ge, open: t.pauseHoles.some(function (o) { return Math.abs(o.gs - h.gs) < 0.01; }), gone: V.coveredBy(ps, h.gs, h.ge) < 0.02 }; });   // every long pause, open (still long) or shortened, for the pills
    var rt = V.retakes(wordsCache[v.id]).filter(function (r) { return playing(v, r.s, r.e); });   // every "said twice" still playing, for the underline and the Review list
    return { fillers: t.fillerHits, pauses: t.pauseHits, retakes: t.retakeHits, holes: t.holes, pauseHoles: t.pauseHoles, fillerHoles: t.fillerHoles, retakeHoles: t.retakeHoles, allPauses: all, allRetakes: rt };   // t.holes: merged, a pause next to a filler is one hole
  }
  function tidy(v, which, custom, only, withRetakes) {   // one step, one Undo
    if (!hasWords(v.id)) throw new Error('Removing fillers and pauses needs the words with their times: start node serve.js and open this page there.');
    var c = tidyCount(v, which, custom, only, withRetakes); if (!c.holes.length) throw new Error('Nothing to remove' + (which === 'fillers' ? ': no fillers' : which === 'pauses' ? ': no long pauses' : which === 'retakes' ? ': nothing said twice' : '') + ' in what plays.');
    var res = snapTo(v, markFixed(V.cutOut(pieces(v), c.holes, dur(v)), v.edl));
    setEdl(v, res.edl, 'removed ' + [c.fillers ? c.fillers + ' filler' + (c.fillers === 1 ? '' : 's') : '', c.pauses ? c.pauses + ' pause' + (c.pauses === 1 ? '' : 's') : '', c.retakes ? c.retakes + ' first ' + (c.retakes === 1 ? 'try' : 'tries') : ''].filter(Boolean).join(', '), res.notes); return { fillers: c.fillers, pauses: c.pauses, retakes: c.retakes };
  }
  function remove(v) { var t = get(v.id); if (!t) return false; removed[t.id] = 1; lib.videos = lib.videos.filter(function (x) { return x.id !== t.id; }); if (lib.activeId === t.id) lib.activeId = lib.videos[0] ? lib.videos[0].id : ''; persist('video rm ' + t.id + ' ' + t.title); return true; }
  // a reply's `video cut <id> --keep "…"` / `--drop "…"` (core/apply.js on this page)
  function cutFromLine(id, flags) {
    var t = get(id) || lib.videos.filter(function (x) { return x.title.toLowerCase() === String(id).toLowerCase(); })[0]; if (!t) throw new Error('no take matches "' + id + '"');
    var res;
    if (flags.tidy || flags['drop-silence'] || flags.retakes) { if (!hasWords(t.id)) throw new Error('removing fillers and pauses needs the words; open the Video page with node serve.js running'); var tr2 = tidy(t, flags.retakes && !flags.tidy && !flags['drop-silence'] ? 'retakes' : flags.tidy ? 'both' : 'pauses', typeof flags.tidy === 'string' ? flags.tidy.split(/[,;]+/) : null, null, !!flags.retakes); res = { edl: get(t.id).edl, runtime: runtime(get(t.id)) }; res.tidied = tr2; }
    else if (flags.drop) { var custom = String(flags.drop).split(/[,;]+/); if (!hasWords(t.id)) throw new Error('dropping words needs the transcript; open the Video page with node serve.js running'); var d = V.drop(custom, wordsCache[t.id], pieces(t), { duration: dur(t) }); if (!d.hits) throw new Error('none of those words are in what plays'); res = snapTo(t, d.ranges); setEdl(t, res.edl, 'dropped ' + d.hits + ' (from a reply)', res.notes); }
    else if (flags.keep) { res = snapTo(t, V.parseRanges(String(flags.keep))); setEdl(t, res.edl, 'from a reply' + (flags.note ? ': ' + String(flags.note).slice(0, 60) : ''), res.notes); }
    else throw new Error('video cut needs --keep "…", --drop "…", --tidy or --drop-silence');
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
    if (st === 'transcribed') return { text: 'Next: select the words that go and press Delete, keep one part with K (Keep only this), or remove the fillers and pauses.', action: '' };
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
    keptFlags: keptFlags, holes: holes, runtime: runtime, pieces: pieces, toggle: toggle, sentenceSpans: sentenceSpans, keepOnly: keepOnly, captionCues: captionCues, fillers: fillers, fillerList: fillerList, dropFillers: dropFillers, keepEverything: keepEverything, setEdl: setEdl, canUndo: canUndo, canRedo: canRedo, undo: undo, redo: redo, cutSpan: cutSpan, keepSpan: keepSpan, cutSpans: cutSpans, keepSpans: keepSpans, playing: playing, rename: rename, tidy: tidy, tidyCount: tidyCount, pauseMin: pauseMin, autoMaxMin: autoMaxMin, remove: remove, cutFromLine: cutFromLine,
    fmt: fmt, tag: tag, size: size, latestExport: latestExport, statusOf: statusOf, statusLabel: statusLabel, nextStep: nextStep, copyText: copyText, terminal: terminal, dur: dur };
})(typeof window !== 'undefined' ? window : this);
