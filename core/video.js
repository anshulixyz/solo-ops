/* =========================================================================
   core/video.js — cut a take by its words, on the local file.
   Shared by the CLI (`node solo.js video …`) and, for the pure parts, the
   Video page. Pure functions (phrases, ranges, snapping, captions, imports)
   have no Node dependency; everything that talks to ffmpeg or a
   transcription engine lives under `node` and is only present in Node.

   Rules this file carries (from video-use's production rules):
     never cut inside a word · pad every cut edge, clamped to the gap ·
     per-segment extract with 30 ms audio fades, then lossless concat ·
     captions from measured segment lengths, applied last · transcripts
     cached per source + engine + model · paths never inside filter strings.
   ========================================================================= */
(function (root, factory) {
  var v = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = v;
  else root.Video = v;
})(this, function () {
  'use strict';

  var FILLER_PROMPT = "Umm, let me think like, hmm... Okay, here's what I'm, like, thinking. Uh, so, you know.";
  var DEFAULTS = { padBefore: 0.05, padAfter: 0.08, mergeGap: 0.12, minLen: 0.06, island: 0.3, phraseGap: 0.5 };
  var STYLES = {   // libass force_style; MarginV is a safe-area rule (PlayResY=288 scaling), not taste
    sentence: { max: 5, upper: false, font: 20 },
    bold: { max: 2, upper: true, font: 18 }
  };

  /* ---- helpers ------------------------------------------------------------ */
  function num(x) { var n = Number(x); return isFinite(n) ? n : NaN; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function fmt(sec, ms) {   // 0:02.5 · 1:02:03.4 (ms = 3 decimals)
    sec = Math.max(0, sec || 0); var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var ss = ms ? s.toFixed(3) : s.toFixed(1); if (parseFloat(ss) >= 60) { ss = ms ? '0.000' : '0.0'; m++; if (m === 60) { m = 0; h++; } } if (parseFloat(ss) < 10) ss = '0' + ss;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + ss;
  }
  function fmtTag(sec) { var s = Math.max(0, sec || 0); return (s < 100 ? ('00' + s.toFixed(2)).slice(-6) : s.toFixed(2)); }   // [002.52-005.36]
  function srtTime(sec) { sec = Math.max(0, sec || 0); var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.round((sec - Math.floor(sec)) * 1000); if (ms === 1000) { ms = 0; s++; } function p(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; } return p(h) + ':' + p(m) + ':' + p(s) + ',' + p(ms, 3); }
  function parseTime(t) {   // 2.42 · 0:02.4 · 1:02:03 · 00:00:02,420
    t = String(t || '').trim().replace(',', '.'); if (!t) return NaN;
    if (/^\d+(\.\d+)?$/.test(t)) return num(t);
    var parts = t.split(':'); if (parts.length < 2 || parts.length > 3 || parts.some(function (p) { return !/^\d+(\.\d+)?$/.test(p); })) return NaN;
    var s = 0; parts.forEach(function (p) { s = s * 60 + num(p); }); return s;
  }
  function normWord(w) { return String(w || '').toLowerCase().replace(/[^a-z0-9']+/g, ''); }

  /* ---- words → phrases (the view the agent reads) -------------------------- */
  // words: [{ w, s, e }] sorted by s. Breaks on silence ≥ gap, after a sentence end once the
  // phrase has a few words (whisper words are contiguous, so gaps alone never break), and at
  // ~12 s or 24 words so a long ramble still reads line by line. → [{ s, e, t }]
  function phrases(words, gap) {
    gap = gap || DEFAULTS.phraseGap; var out = [], cur = null, n = 0, ended = false;
    (words || []).forEach(function (x) {
      if (!cur || x.s - cur.e >= gap || (ended && n >= 4) || x.e - cur.s > 12 || n >= 24) { if (cur) out.push(cur); cur = { s: x.s, e: x.e, t: x.w }; n = 1; }
      else { cur.e = Math.max(cur.e, x.e); cur.t += ' ' + x.w; n++; }
      ended = /[.!?]["')]*$/.test(x.w);
    });
    if (cur) out.push(cur);
    return out.map(function (p) { return { s: r3(p.s), e: r3(p.e), t: p.t.replace(/\s+/g, ' ').trim() }; });
  }
  function packed(list) { return (list || []).map(function (p) { return '[' + fmtTag(p.s) + '-' + fmtTag(p.e) + '] ' + p.t; }).join('\n'); }

  // one shape for every engine; drops empty and zero-length tokens, sorts, rounds
  function normalizeWords(list) {
    return (list || []).map(function (x) { return { w: String(x.w == null ? x.text || x.word || '' : x.w).trim(), s: num(x.s != null ? x.s : x.start), e: num(x.e != null ? x.e : x.end) }; })
      .filter(function (x) { return x.w && /[a-z0-9]/i.test(x.w) && !/^[\[(]|[\])]$/.test(x.w) && isFinite(x.s) && isFinite(x.e) && x.e > x.s; })   // [MUSIC] (laughs) [BLANK_AUDIO] are events, not words
      .sort(function (a, b) { return a.s - b.s; })
      .map(function (x) { return { w: x.w, s: r3(x.s), e: r3(x.e) }; });
  }

  /* ---- ranges ------------------------------------------------------------- */
  // "2.42-6.85, 8.10-15.00" or "0:12-1:40" → [{ start, end }]; throws on garbage
  function parseRanges(text) {
    var out = [];
    String(text || '').split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (part) {
      var m = part.match(/^(\S+?)\s*(?:-|–|to)\s*(\S+)$/); if (!m) throw new Error('"' + part + '" is not a range. Write start-end, e.g. 2.42-6.85 or 0:12-1:40');
      var a = parseTime(m[1]), b = parseTime(m[2]); if (!isFinite(a) || !isFinite(b)) throw new Error('"' + part + '": times look like 6.85 or 1:02.5');
      if (b <= a) throw new Error('"' + part + '": the end must come after the start');
      out.push({ start: a, end: b });
    });
    if (!out.length) throw new Error('No ranges given');
    return out;
  }

  // Snap keep ranges to word boundaries (outward), pad the edges clamped to half
  // the gap to the neighbouring word, align to the frame grid without entering a
  // word, merge pieces that nearly touch unless a word (a dropped filler) sits in
  // the gap, refuse too-short pieces. A range may carry fixedStart / fixedEnd
  // (an edge that was snapped before: left exactly as it is) and a reason.
  // words may be [] (a plain trim: no snapping, says so).
  // → { edl: [{ start, end, quote, reason }], notes: [...], runtime }
  function snap(ranges, words, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {}); var fps = opts.fps > 0 ? opts.fps : 0, dur = opts.duration > 0 ? opts.duration : Infinity;
    var W = words || []; var notes = []; var minLen = Math.max(opts.minLen, fps ? 2 / fps : 0);
    function inWord(t) { return W.some(function (w) { return w.s < t - 1e-6 && t + 1e-6 < w.e; }); }
    function wordBetween(a, b) { return W.some(function (w) { var mid = (w.s + w.e) / 2; return mid > a && mid < b; }); }
    var edl = ranges.map(function (r) {
      var start = Math.max(0, r.start), end = Math.min(dur, r.end); var fixS = !!r.fixedStart, fixE = !!r.fixedEnd;
      if (r.end > dur) notes.push(fmt(r.end) + ' is past the end (' + fmt(dur) + '); kept to the end');
      if (W.length) {
        if (!fixS) { var inStart = W.filter(function (w) { return w.s < start && w.e > start; })[0]; if (inStart) start = inStart.s; }   // never cut inside a word
        if (!fixE) { var inEnd = W.filter(function (w) { return w.s < end && w.e > end; })[0]; if (inEnd) end = inEnd.e; }
        var prev = null, next = null; W.forEach(function (w) { if (w.e <= start + 1e-6 && (!prev || w.e > prev.e)) prev = w; if (w.s >= end - 1e-6 && (!next || w.s < next.s)) next = w; });
        if (!fixS) { var padB = prev ? Math.min(opts.padBefore, (start - prev.e) / 2) : opts.padBefore; start = Math.max(0, start - Math.max(0, padB)); }   // the pad never re-enters a dropped word
        if (!fixE) { var padA = next ? Math.min(opts.padAfter, (next.s - end) / 2) : opts.padAfter; end = Math.min(dur, end + Math.max(0, padA)); }
      }
      if (fps) {
        if (!fixS) { var a = Math.floor(start * fps + 1e-6) / fps; if (inWord(a)) a = Math.ceil(start * fps - 1e-6) / fps; start = a; }
        if (!fixE) { var b = Math.ceil(end * fps - 1e-6) / fps; if (inWord(b) || b > dur) b = Math.floor(end * fps + 1e-6) / fps; end = Math.min(dur, b); }
      }
      return { start: r3(start), end: r3(end), reason: r.reason || '' };
    }).sort(function (a, b) { return a.start - b.start; });
    var merged = []; edl.forEach(function (s) {
      var last = merged[merged.length - 1];
      if (last && s.start - last.end < opts.mergeGap && !wordBetween(last.end, s.start)) { if (s.end > last.end) last.end = s.end; if (s.reason && last.reason !== s.reason) last.reason = (last.reason ? last.reason + ' + ' : '') + s.reason; notes.push('joined two pieces at ' + fmt(s.start) + ', less than ' + Math.round(opts.mergeGap * 1000) + ' ms apart'); }
      else merged.push({ start: s.start, end: s.end, reason: s.reason });
    });
    var kept = merged.filter(function (s) { if (s.end - s.start < minLen) { notes.push('dropped a piece at ' + fmt(s.start) + ': shorter than ' + Math.round(minLen * 1000) + ' ms'); return false; } return true; });
    if (!kept.length) throw new Error('Nothing left to keep after snapping');
    kept.forEach(function (s) { s.quote = W.length ? W.filter(function (w) { return w.s >= s.start - 1e-6 && w.e <= s.end + 1e-6; }).map(function (w) { return w.w; }).join(' ').slice(0, 80) : ''; if (!s.reason) delete s.reason; });
    if (!W.length) notes.push('no transcript yet: a plain trim, nothing snapped to words');
    return { edl: kept, notes: notes, runtime: r3(kept.reduce(function (a, s) { return a + (s.end - s.start); }, 0)) };
  }

  // Drop words (or phrases) inside the current keeps. list: ['um', 'you know'].
  // → { ranges: [{ start, end, fixedStart?, fixedEnd? }], hits: n (matches inside the keeps), holes: [{ s, e }] }
  // Edges that come from an existing keep are flagged fixed, so snap() leaves them alone
  // and repeated drops never creep. Pass the ranges through snap().
  function drop(list, words, keeps, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {}); var W = words || [];
    var pats = (list || []).map(function (p) { return String(p).split(/\s+/).map(normWord).filter(Boolean); }).filter(function (p) { return p.length; });
    if (!pats.length) throw new Error('Which words? e.g. --drop "um, uh, you know"');
    var spans = [];
    for (var i = 0; i < W.length; i++) {
      pats.forEach(function (p) {
        if (i + p.length > W.length) return;
        for (var k = 0; k < p.length; k++) if (normWord(W[i + k].w) !== p[k]) return;
        spans.push({ s: W[i].s, e: W[i + p.length - 1].e });
      });
    }
    spans.sort(function (a, b) { return a.s - b.s; });
    var given = !!(keeps && keeps.length); var lastW = W[W.length - 1];
    var base = given ? keeps.map(function (k) { return { start: k.start, end: k.end }; }) : [{ start: 0, end: lastW ? lastW.e : 0 }];
    var out = [], hits = 0, holes = [];
    base.forEach(function (k) {
      var cur = k.start, lastDrop = -1;
      spans.forEach(function (d) {
        if (d.e <= k.start || d.s >= k.end) return;
        hits++; holes.push({ s: d.s, e: d.e });
        var pieceStart = cur, pieceEnd = Math.max(cur, d.s);
        if (pieceEnd > pieceStart) { if (lastDrop >= 0 && pieceEnd - pieceStart < opts.island) { /* an island between two drops goes too */ } else out.push({ start: pieceStart, end: pieceEnd, fixedStart: given && pieceStart === k.start }); }
        cur = Math.max(cur, d.e); lastDrop = d.e;
      });
      if (k.end > cur) {
        if (lastDrop >= 0 && k.end - cur < opts.island && !W.some(function (w) { return w.s >= cur && w.e <= k.end; })) return;   // a word-less tail shorter than the island after a drop is padding, not content
        out.push({ start: cur, end: k.end, fixedStart: given && cur === k.start, fixedEnd: given });
      }
    });
    return { ranges: out, hits: hits, holes: holes };
  }

  // The agent's EDL: numbers, in order, inside the take. → ranges for snap()
  function fromEdl(list, duration) {
    if (!Array.isArray(list) || !list.length) throw new Error('An EDL is a JSON list of { "start": s, "end": s } objects');
    return list.map(function (x, i) {
      var a = num(x.start), b = num(x.end); if (!isFinite(a) || !isFinite(b)) throw new Error('EDL item ' + (i + 1) + ': start and end must be numbers (seconds)');
      if (a < 0 || b <= a || (duration && b > duration + 0.001)) throw new Error('EDL item ' + (i + 1) + ': ' + a + '-' + b + ' is outside the take (0-' + (duration ? r3(duration) : '…') + ')');
      return { start: a, end: b, reason: x.reason || x.beat || '' };
    });
  }

  /* ---- captions ----------------------------------------------------------- */
  // Group the words of one segment into caption chunks. style: sentence | bold
  function chunks(words, style) {
    var st = STYLES[style] || STYLES.sentence; var out = [], cur = null;
    words.forEach(function (w) {
      var ends = /[.!?]["')]*$/.test(w.w);
      if (!cur) cur = { s: w.s, e: w.e, words: [w.w] };
      else if (cur.words.length >= st.max || w.s - cur.e > 0.7) { out.push(cur); cur = { s: w.s, e: w.e, words: [w.w] }; }
      else { cur.words.push(w.w); cur.e = w.e; }
      if (ends && cur.words.length >= Math.min(3, st.max)) { out.push(cur); cur = null; }
    });
    if (cur) out.push(cur);
    return out.map(function (c) { return { s: c.s, e: c.e, t: st.upper ? c.words.join(' ').toUpperCase() : c.words.join(' ') }; });
  }
  // Captions for the output timeline. segments: [{ start, end, offset, duration }] where
  // offset/duration are MEASURED on the rendered pieces. → SRT text
  function srt(segments, words, style, granularity) {
    var lines = [], n = 0;
    segments.forEach(function (seg) {
      var ws = (words || []).filter(function (w) { return w.s >= seg.start - 0.001 && w.e <= seg.end + 0.001; });
      var cs = granularity === 'cue' ? ws.map(function (w) { return { s: w.s, e: w.e, t: w.w }; }) : chunks(ws, style);   // an imported SRT keeps its own cues
      cs.forEach(function (c, i) {
        var a = c.s - seg.start + seg.offset, b = c.e - seg.start + seg.offset;
        if (b - a < 0.6) b = a + 0.6;
        var nextStart = cs[i + 1] ? cs[i + 1].s - seg.start + seg.offset : seg.offset + seg.duration;
        b = Math.min(b, nextStart - 0.02, seg.offset + seg.duration);
        if (b <= a) return;
        n++; lines.push(String(n), srtTime(a) + ' --> ' + srtTime(b), c.t, '');
      });
    });
    return lines.join('\n') + (lines.length ? '\n' : '');
  }
  function forceStyle(style, aspect) {
    var st = STYLES[style] || STYLES.sentence; var margin = aspect === '9:16' ? 90 : 40;
    return 'FontName=Helvetica,FontSize=' + st.font + ',Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=' + margin;
  }

  /* ---- imports: other tools' transcripts → { words, granularity } ----------- */
  function importTranscript(text, kind) {
    kind = String(kind || '').toLowerCase().replace(/^\./, '');
    if (kind === 'json') {
      var j = JSON.parse(text);
      if (j && Array.isArray(j.transcription) && j.transcription.length && j.transcription[0].offsets) return { words: normalizeWords(j.transcription.map(function (t) { return { w: t.text, s: t.offsets.from / 1000, e: t.offsets.to / 1000 }; })), granularity: 'word', engine: 'whisper' };   // whisper.cpp -ojf
      if (j && Array.isArray(j.words) && j.words.length && j.words[0].text !== undefined) return { words: normalizeWords(j.words.filter(function (w) { return !w.type || w.type === 'word'; }).map(function (w) { return { w: w.text, s: w.start, e: w.end }; })), granularity: 'word', engine: 'elevenlabs' };   // Scribe
      if (j && Array.isArray(j.words)) return { words: normalizeWords(j.words), granularity: j.granularity || 'word', engine: j.engine || 'import' };   // ours
      if (Array.isArray(j)) return { words: normalizeWords(j), granularity: 'word', engine: 'import' };
      throw new Error('Unknown JSON transcript shape: expected { words: [{ w, s, e }] }, whisper.cpp or ElevenLabs output');
    }
    if (kind === 'srt' || kind === 'vtt') {
      var cues = []; var re = /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})/;
      String(text).replace(/\r/g, '').split(/\n\n+/).forEach(function (block) {
        var ls = block.split('\n'); var ti = -1; ls.forEach(function (l, i) { if (ti < 0 && re.test(l)) ti = i; }); if (ti < 0) return;
        var m = ls[ti].match(re); var body = ls.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); if (!body) return;
        cues.push({ w: body, s: parseTime(m[1]), e: parseTime(m[2]) });
      });
      if (!cues.length) throw new Error('No cues found in the ' + kind.toUpperCase());
      return { words: normalizeWords(cues), granularity: 'cue', engine: 'import' };
    }
    throw new Error('Transcripts can be imported from .srt, .vtt or .json files');
  }

  var api = { FILLER_PROMPT: FILLER_PROMPT, DEFAULTS: DEFAULTS, STYLES: STYLES, fmt: fmt, fmtTag: fmtTag, parseTime: parseTime, srtTime: srtTime,
    phrases: phrases, packed: packed, normalizeWords: normalizeWords, parseRanges: parseRanges, snap: snap, drop: drop, fromEdl: fromEdl,
    chunks: chunks, srt: srt, forceStyle: forceStyle, importTranscript: importTranscript };

  /* ======================================================================= */
  /* Node only: ffmpeg, engines, render                                        */
  /* ======================================================================= */
  if (typeof require !== 'function' || typeof process === 'undefined' || !process.versions || !process.versions.node) return api;
  var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto'), https = require('https');
  var N = {};

  function which(bin) { var exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']; var dirs = String(process.env.PATH || '').split(path.delimiter); for (var i = 0; i < dirs.length; i++) for (var j = 0; j < exts.length; j++) { var p = path.join(dirs[i], bin + exts[j]); try { if (fs.statSync(p).isFile()) return p; } catch (e) { /* next */ } } return ''; }
  function run(bin, args, opts) {   // sync, argv array, never a shell
    var r = cp.spawnSync(bin, args, Object.assign({ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }, opts || {}));
    if (r.error) throw r.error;
    if (r.status !== 0) { var err = new Error((bin.split(/[\\/]/).pop()) + ' failed: ' + String(r.stderr || '').trim().split('\n').slice(-3).join(' ')); err.stderr = r.stderr; throw err; }
    return r.stdout;
  }
  // which ffmpeg / ffprobe: a configured path, else PATH
  N.tools = function (cfg) {
    var f = (cfg && cfg.ffmpeg) || ''; var ffmpeg = f ? (fs.existsSync(f) ? f : '') : which('ffmpeg');
    var ffprobe = ''; if (ffmpeg) { var cand = path.join(path.dirname(ffmpeg), 'ffprobe' + (process.platform === 'win32' ? '.exe' : '')); ffprobe = fs.existsSync(cand) ? cand : which('ffprobe'); }
    return { ffmpeg: ffmpeg, ffprobe: ffprobe };
  };
  N.NEED_FFMPEG = 'Video needs ffmpeg, a free tool that reads and writes video files. Mac: brew install ffmpeg · Windows: winget install ffmpeg · then run this again. `node solo.js doctor` checks it.';
  var filterCache = {};
  N.hasFilter = function (ffmpeg, name) { if (filterCache[ffmpeg + name] !== undefined) return filterCache[ffmpeg + name]; var ok = false; try { ok = new RegExp('\\s' + name + '\\s').test(run(ffmpeg, ['-hide_banner', '-filters'])); } catch (e) { ok = false; } filterCache[ffmpeg + name] = ok; return ok; };
  N.hasEncoder = function (ffmpeg, name) { try { return new RegExp('\\s' + name + '\\s').test(run(ffmpeg, ['-hide_banner', '-encoders'])); } catch (e) { return false; } };

  // first MB + last MB + size: cheap, good enough to notice a different file
  N.hashFile = function (file) {
    var st = fs.statSync(file); var h = crypto.createHash('sha1'); var fd = fs.openSync(file, 'r'); var MB = 1048576;
    try { var b1 = Buffer.alloc(Math.min(MB, st.size)); fs.readSync(fd, b1, 0, b1.length, 0); h.update(b1); if (st.size > MB) { var b2 = Buffer.alloc(Math.min(MB, st.size)); fs.readSync(fd, b2, 0, b2.length, st.size - b2.length); h.update(b2); } } finally { fs.closeSync(fd); }
    h.update(String(st.size)); return h.digest('hex').slice(0, 20);
  };
  N.probe = function (tools, file) {
    var j = JSON.parse(run(tools.ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,color_transfer,color_primaries,colorspace,pix_fmt:stream_side_data=rotation:stream_tags=rotate', '-of', 'json', file]));
    var v = (j.streams || []).filter(function (s) { return s.codec_type === 'video'; })[0]; var a = (j.streams || []).filter(function (s) { return s.codec_type === 'audio'; })[0];
    if (!v) throw new Error('No video stream in ' + path.basename(file));
    function rate(s) { var m = String(s || '').match(/^(\d+)\/(\d+)$/); if (!m || !Number(m[2])) return 0; return Number(m[1]) / Number(m[2]); }
    var fps = rate(v.avg_frame_rate) || rate(v.r_frame_rate) || 30; var rot = 0;
    (v.side_data_list || []).forEach(function (sd) { if (sd.rotation != null) rot = Number(sd.rotation) || 0; }); if (!rot && v.tags && v.tags.rotate) rot = Number(v.tags.rotate) || 0;
    rot = ((rot % 360) + 360) % 360; var w = v.width, h = v.height; if (rot === 90 || rot === 270) { w = v.height; h = v.width; }
    var hdr = /smpte2084|arib-std-b67/.test(String(v.color_transfer || ''));
    return { duration: r3(num(j.format && j.format.duration) || 0), size: Number(j.format && j.format.size) || fs.statSync(file).size, width: w, height: h, fps: Math.round(fps * 1000) / 1000, rotation: rot, hdr: hdr, vcodec: v.codec_name, acodec: a ? a.codec_name : '', hasAudio: !!a, pixFmt: v.pix_fmt || '', color: { primaries: v.color_primaries || '', trc: v.color_transfer || '', space: v.colorspace || '' }, vfr: rate(v.r_frame_rate) && Math.abs(rate(v.r_frame_rate) - fps) > 0.5 };
  };
  N.duration = function (tools, file) { return r3(num(run(tools.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim()) || 0); };
  N.freeGB = function (dir) { try { if (!fs.statfsSync) return -1; var s = fs.statfsSync(dir); return s.bavail * s.bsize / 1073741824; } catch (e) { return -1; } };
  N.tmpDir = function () { return fs.mkdtempSync(path.join(os.tmpdir(), 'solo-video-')); };
  N.rmrf = function (p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* best effort */ } };

  // 16 kHz mono wav for the engines: a 2 GB take becomes ~2 MB per minute
  N.extractAudio = function (tools, src, wav) { run(tools.ffmpeg, ['-nostdin', '-hide_banner', '-y', '-loglevel', 'error', '-i', path.resolve(src), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]); return wav; };

  /* ---- engines ---- */
  N.whisperBin = function (cfg) { var c = (cfg && cfg.whisper) || ''; if (c) return fs.existsSync(c) ? c : ''; return which('whisper-cli') || which('whisper-cpp') || ''; };
  N.MODEL_URL = function (model) { return 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-' + model + '.bin'; };
  N.modelPath = function (dataDir, model) { return path.join(dataDir, 'models', 'ggml-' + model + '.bin'); };
  // follows redirects by hand (the Hugging Face URL answers 302); writes to .part first
  N.download = function (url, dest, onProgress) {
    return new Promise(function (resolve, reject) {
      fs.mkdirSync(path.dirname(dest), { recursive: true }); var part = dest + '.part';
      (function get(u, hops) {
        if (hops > 6) return reject(new Error('Too many redirects for ' + url));
        https.get(u, { headers: { 'User-Agent': 'solo-ops' } }, function (res) {
          if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0 && res.headers.location) { res.resume(); return get(new URL(res.headers.location, u).toString(), hops + 1); }
          if (res.statusCode !== 200) { res.resume(); return reject(new Error('Download failed (' + res.statusCode + '): ' + url)); }
          var total = Number(res.headers['content-length']) || 0, got = 0; var out = fs.createWriteStream(part);
          res.on('data', function (b) { got += b.length; if (onProgress) onProgress(got, total); });
          res.pipe(out); out.on('finish', function () { out.close(function () { if (total && got !== total) { try { fs.unlinkSync(part); } catch (e) { /* gone */ } return reject(new Error('Download stopped at ' + Math.round(got / 1048576) + ' of ' + Math.round(total / 1048576) + ' MB; run the command again')); } try { fs.renameSync(part, dest); resolve(dest); } catch (e) { reject(e); } }); });
          out.on('error', reject); res.on('error', reject);
        }).on('error', reject);
      })(url, 0);
    });
  };
  N.whisper = function (opts) {   // { bin, model (path), wav, lang, outPrefix, threads } → { words, raw }
    var args = ['-m', opts.model, '-f', opts.wav, '-ml', '1', '-sow', '-ojf', '-of', opts.outPrefix, '-np', '--prompt', opts.prompt || FILLER_PROMPT];
    if (opts.lang) args.push('-l', opts.lang); if (opts.threads) args.push('-t', String(opts.threads));
    run(opts.bin, args, { timeout: opts.timeout || 0 });
    var j = JSON.parse(fs.readFileSync(opts.outPrefix + '.json', 'utf8'));
    var t = importTranscript(JSON.stringify(j), 'json'); return { words: t.words, raw: j };
  };
  N.elevenlabs = function (opts) {   // { key, wav, lang } → Promise<{ words, raw }>; multipart by hand, no npm
    return new Promise(function (resolve, reject) {
      var boundary = '----solo' + Date.now().toString(36); var CR = '\r\n'; var fields = { model_id: 'scribe_v1', timestamps_granularity: 'word', diarize: 'false', tag_audio_events: 'false' }; if (opts.lang) fields.language_code = opts.lang;
      var head = Object.keys(fields).map(function (k) { return '--' + boundary + CR + 'Content-Disposition: form-data; name="' + k + '"' + CR + CR + fields[k] + CR; }).join('');
      head += '--' + boundary + CR + 'Content-Disposition: form-data; name="file"; filename="audio.wav"' + CR + 'Content-Type: audio/wav' + CR + CR;
      var body = Buffer.concat([Buffer.from(head), fs.readFileSync(opts.wav), Buffer.from(CR + '--' + boundary + '--' + CR)]);
      var req = https.request({ host: 'api.elevenlabs.io', path: '/v1/speech-to-text', method: 'POST', headers: { 'xi-api-key': opts.key, 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length } }, function (res) {
        var chunks = []; res.on('data', function (c) { chunks.push(c); }); res.on('end', function () { var txt = Buffer.concat(chunks).toString('utf8'); if (res.statusCode !== 200) return reject(new Error('ElevenLabs answered ' + res.statusCode + ': ' + txt.slice(0, 200))); try { var t = importTranscript(txt, 'json'); resolve({ words: t.words, raw: JSON.parse(txt) }); } catch (e) { reject(e); } });
      });
      req.on('error', reject); req.end(body);
    });
  };

  /* ---- render ---- */
  // opts: { tools, src, probe, edl, dir, preview, burn, style, aspect, words, name, onProgress }
  // Per-segment extract (identical params, 30 ms fades, captions burned per segment as the last filter when asked),
  // lossless concat, captions.srt from MEASURED segment lengths, soft mov_text track unless burned.
  // → { file, duration, segments: [{ start, end, offset, duration }], srt, burned }
  N.render = function (opts) {
    var T = opts.tools, P = opts.probe, dir = opts.dir, edl = opts.edl, fps = P.fps || 30; fs.mkdirSync(dir, { recursive: true });
    var out = path.join(dir, opts.name); if (fs.existsSync(out)) throw new Error(out + ' exists already; exports are never overwritten');
    var work = fs.mkdtempSync(path.join(dir, '.render-')); var burned = !!opts.burn && N.hasFilter(T.ffmpeg, 'subtitles'); var note = '';
    var darwin = process.platform === 'darwin';
    var vt = opts.preview && darwin && !P.hdr && N.hasEncoder(T.ffmpeg, 'h264_videotoolbox');
    // HDR (iPhone HLG / PQ) stays 10-bit and HDR, as HEVC: 10-bit H.264 plays nowhere. Without an HEVC encoder it is flattened to SDR with a note.
    var hevc = P.hdr ? (darwin && N.hasEncoder(T.ffmpeg, 'hevc_videotoolbox') ? 'hevc_videotoolbox' : N.hasEncoder(T.ffmpeg, 'libx265') ? 'libx265' : '') : '';
    if (P.hdr && !hevc) note = 'This take is HDR and this ffmpeg has no HEVC encoder, so the export is plain SDR (colours flatter than the original).';
    var encoder = vt ? 'h264_videotoolbox' : hevc || 'libx264';
    var total = edl.reduce(function (a, s) { return a + (s.end - s.start); }, 0); var doneBefore = 0;
    var style = opts.style || 'sentence', aspect = opts.aspect === '9:16' ? '9:16' : '';
    try {
      var segs = edl.map(function (s, i) {
        var dur = s.end - s.start; var name = 'seg-' + i + '.mp4'; var vf = [];
        if (aspect === '9:16') vf.push("crop='min(iw,ih*9/16)':ih");
        if (opts.preview && P.height > 720) vf.push('scale=-2:720');
        vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
        if (burned) { var segWords = (opts.words || []).filter(function (w) { return w.s >= s.start - 0.001 && w.e <= s.end + 0.001; }); fs.writeFileSync(path.join(work, 'seg-' + i + '.srt'), srt([{ start: s.start, end: s.end, offset: 0, duration: dur }], segWords, style, opts.granularity)); vf.push("subtitles=seg-" + i + ".srt:force_style='" + forceStyle(style, aspect || (P.width < P.height ? '9:16' : '16:9')) + "'"); }
        var args = ['-nostdin', '-hide_banner', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-ss', String(s.start), '-t', String(r3(Math.max(dur - 0.5 / fps, 1 / fps))), '-i', path.resolve(opts.src), '-map', '0:v:0'];   // half a frame short, or ffmpeg keeps the frame that sits exactly on the end
        if (P.hasAudio) args.push('-map', '0:a:0', '-af', 'afade=t=in:st=0:d=0.03,afade=t=out:st=' + r3(Math.max(0, dur - 0.03)) + ':d=0.03', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2');
        args.push('-vf', vf.join(','), '-fps_mode', 'cfr', '-r', String(fps), '-avoid_negative_ts', 'make_zero', '-video_track_timescale', '90000', '-movflags', '+faststart');
        var tags = P.hdr ? ['-color_primaries', P.color.primaries || 'bt2020', '-color_trc', P.color.trc, '-colorspace', P.color.space || 'bt2020nc'] : [];
        if (encoder === 'h264_videotoolbox') args.push('-c:v', 'h264_videotoolbox', '-b:v', '4M', '-pix_fmt', 'yuv420p');
        else if (encoder === 'hevc_videotoolbox') args.push.apply(args, ['-c:v', 'hevc_videotoolbox', '-tag:v', 'hvc1', '-profile:v', 'main10', '-pix_fmt', 'p010le', '-b:v', opts.preview ? '6M' : '24M'].concat(tags));
        else if (encoder === 'libx265') args.push.apply(args, ['-c:v', 'libx265', '-tag:v', 'hvc1', '-preset', opts.preview ? 'veryfast' : 'medium', '-crf', opts.preview ? '26' : '20', '-pix_fmt', 'yuv420p10le'].concat(tags));
        else args.push('-c:v', 'libx264', '-preset', opts.preview ? 'veryfast' : 'medium', '-crf', opts.preview ? '26' : '20', '-pix_fmt', 'yuv420p');
        args.push(name);
        var r = cp.spawnSync(T.ffmpeg, args, { cwd: work, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        if (r.status !== 0) throw new Error('ffmpeg failed on piece ' + (i + 1) + ' (' + fmt(s.start) + '-' + fmt(s.end) + '): ' + String(r.stderr || '').trim().split('\n').slice(-2).join(' '));
        doneBefore += dur; if (opts.onProgress) opts.onProgress(doneBefore, total, i + 1, edl.length);
        return { start: s.start, end: s.end, name: name, duration: N.duration(T, path.join(work, name)) };
      });
      var offset = 0; segs.forEach(function (g) { g.offset = r3(offset); offset = r3(offset + g.duration); });
      fs.writeFileSync(path.join(work, 'concat.txt'), segs.map(function (g) { return "file '" + g.name + "'"; }).join('\n') + '\n');
      run(T.ffmpeg, ['-nostdin', '-hide_banner', '-y', '-loglevel', 'error', '-f', 'concat', '-i', 'concat.txt', '-c', 'copy', 'joined.mp4'], { cwd: work });
      var srtText = srt(segs.map(function (g) { return { start: g.start, end: g.end, offset: g.offset, duration: g.duration }; }), opts.words || [], style, opts.granularity);
      if (!burned && srtText.trim() && N.hasEncoder(T.ffmpeg, 'mov_text')) { fs.writeFileSync(path.join(work, 'captions.srt'), srtText); run(T.ffmpeg, ['-nostdin', '-hide_banner', '-y', '-loglevel', 'error', '-i', 'joined.mp4', '-i', 'captions.srt', '-map', '0', '-map', '1', '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', 'final.mp4'], { cwd: work }); fs.renameSync(path.join(work, 'final.mp4'), out); }
      else fs.renameSync(path.join(work, 'joined.mp4'), out);
      var srtFile = path.join(dir, opts.name.replace(/\.mp4$/, '') + '.srt'); fs.writeFileSync(srtFile, srtText);   // after the video is in place, never before
      return { file: out, duration: N.duration(T, out), segments: segs.map(function (g) { return { start: g.start, end: g.end, offset: g.offset, duration: g.duration }; }), srt: srtFile, burned: burned, softCaptions: !burned && !!srtText.trim(), encoder: encoder, note: note };
    } finally { N.rmrf(work); }
  };

  // one render at a time per take: progress.json is the lock while its pid is alive and it is not finished
  N.lock = function (dir) { var f = path.join(dir, 'progress.json'); try { var p = JSON.parse(fs.readFileSync(f, 'utf8')); if (p.finished) return null; if (Date.now() - Date.parse(p.startedAt || 0) > 86400000) return null; try { process.kill(p.pid, 0); return p; } catch (e) { return null; } } catch (e) { return null; } };
  N.leftovers = function (dir) { try { return fs.readdirSync(dir).filter(function (f) { return /^\.render-/.test(f); }).map(function (f) { return path.join(dir, f); }); } catch (e) { return []; } };
  N.progress = function (dir, obj) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'progress.json'), JSON.stringify(obj) + '\n'); };

  api.node = N;
  return api;
});
