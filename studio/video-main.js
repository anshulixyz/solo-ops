/* =========================================================================
   studio/video-main.js — handlers, sync, palette, the server calls, the
   selection. The takes live in data/videos.json (VideoModel); a cut writes
   through Sync like every app. With `node serve.js` running the buttons run
   the CLI for the ffmpeg work (transcribe, render) and poll its progress;
   without it they show the line that does it, agent first.
   ========================================================================= */
'use strict';
var M = VideoModel, VV = VideoView;
var ctx = { server: false, ready: false, chat: false, doctor: null, recordings: null, words: false, tidy: null, job: null, left: '', undo: false, redo: false, showAll: false, aspect: Store.get('marathon.video.aspect') || '', showRenderError: false, selection: null, tokens: [], renaming: false, showKey: false, addOpen: false,
  reviewOpen: false, reviewTicked: {}, reviewCount: null, wordsGone: {}, oldServer: false, keyCard: false, pendingTask: '', correcting: null, engine: '', player: { src: 'take', time: 0, playing: false }, playerHidden: false, captions: Store.get('marathon.video.captions') !== '0', playerBig: Store.get('marathon.video.playerBig') === '1' };   // the fold lasts a session; captions and the size are remembered
var pollTimer = null; var wordsLoading = {}; var renderStartedAt = 0; var dragging = false; var anchor = -1; var moved = false;
function $(id) { return document.getElementById(id); }
function esc(s) { return VV.esc(s); }
function flash(msg, undoable) {   // the toast; undoable = true shows an Undo button in it
  var t = $('toast'); if (!t) return; t.innerHTML = esc(msg) + (undoable ? ' <button type="button" onclick="undoCut()">Undo</button>' : ''); t.classList.add('show'); t.classList.toggle('with-undo', !!undoable);
  clearTimeout(flash._t); flash._t = setTimeout(function () { t.classList.remove('show'); }, undoable ? 5000 : 2600);
}
function isServer() { return Sync.getMode() === 'server'; }
function api(path, body) {
  return fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || ('the server answered ' + r.status)); e.status = r.status; e.body = j; throw e; } return j; }); });
}

/* ---- sync: registered at script evaluation, writable (core/context.js then leaves videos.json to this page) ---- */
M.init();
Sync.register({ file: M.FILE, key: M.KEY, label: 'takes', app: 'videos',
  isFresh: function () { var d = Store.getJSON(M.KEY, null); return !d || !(d.videos || []).length; },   // an empty browser never writes an empty file over the CLI's
  read: function () { return M.read(); },
  reconcile: function (fileBody) { return M.reconcile(fileBody); },   // the file is the base of every write; the page overlays only the cut (and a rename)
  apply: function (body) { var before = M.active(); var hadNone = !before; var wordsWere = before && before.transcript ? before.transcript.wordsAt || 0 : -1; M.applyFile(body); var now = M.active(); if (now) loadWords(now); if (now && before && now.id !== before.id && !hadNone) { M.setActive(before.id); flash('New take: ' + now.title + ' — at the top of the list'); } else if (now && (!before || before.id !== now.id)) checkJobs(now); var nowAt = M.active() && M.active().transcript ? M.active().transcript.wordsAt || 0 : -1; if (ctx.correcting && (!M.active() || !before || M.active().id !== before.id || nowAt !== wordsWere)) { ctx.correcting = null; clearSelection(); } paint(); }   // a take that just arrived opens only when nothing was open; it may be getting its words by itself
});
Sync.on(function (ev) { if (ev === 'pulled' || ev === 'linked') { if (ctx.wantedTake && M.get(ctx.wantedTake)) { M.setActive(ctx.wantedTake); ctx.wantedTake = ''; clearSelection(); } ctx.server = isServer(); ctx.ready = true; checkDoctor(false); loadRecordings(); var v = M.active(); if (v) { loadWords(v); checkJobs(v); } paint(); } });
Store.onChange(function (k) { if (k === M.KEY) paint(); });   // a reply applied in the Guide (core/apply.js) lands here too

/* ---- paint ---- */
function paint() {
  var v = M.active(); var takes = M.list();
  $('takesList').innerHTML = VV.list(takes, v ? v.id : ''); var slot = $('storySlot'); if (slot) slot.innerHTML = v && window.Story && Story.taskLine ? Story.taskLine('take', v.id) : '';   // "Task: …" with its pills, or "Connect with a task…", in the toolbar
  ctx.chat = !!(window.Guide && Guide.mode && Guide.mode() === 'chat'); ctx.engine = String(Config.get('video.auto') || '').toLowerCase();
  ctx.words = !!(v && M.hasWords(v.id)); ctx.tidy = v && ctx.words ? M.tidyCount(v) : null; ctx.undo = !!(v && M.canUndo(v)); ctx.redo = !!(v && M.canRedo(v));
  if (ctx.reviewOpen && ctx.tidy) ctx.reviewCount = reviewCounts();
  var pathVal = $('addPath') ? $('addPath').value : ''; var foundHtml = $('addFound') ? $('addFound').innerHTML : '';
  var editing = v && v.transcript && (v.phrases || []).length;
  $('strip').innerHTML = editing ? VV.strip(v, ctx) : ''; $('review').innerHTML = editing ? VV.review(v, ctx) : '';
  paintPlayer(v);
  $('main').innerHTML = VV.main(v, ctx);
  if ($('addBox') && (ctx.addOpen || !v)) { $('addBox').style.display = ''; if ($('addPath')) $('addPath').value = pathVal; if ($('addFound')) $('addFound').innerHTML = foundHtml; }
  if (ctx.renaming && $('titleInput')) { $('titleInput').focus(); $('titleInput').select(); }
  if (ctx.correcting && $('correctInput')) { $('correctInput').focus(); $('correctInput').select(); }
  var cut = $('cutWithAiBtn'); if (cut) cut.disabled = !v;
  markNow();
}

/* ---- the player: the take with the cuts skipped (or a render), above the words, never re-created ---- */
var vid = null; var playerFor = ''; var metaOnce = null; var cues = []; var cueIdx = -1; var cueKey = ''; var freeUntil = -1; var following = true; var rafId = null;
function hasProxy(v) { return !!(v.proxy && v.proxy.file && v.proxy.hash === (M.src(v).hash || '')); }
function canPlayHere(v) {   // from the codecs `video add` stored: HEVC/HDR needs hardware support, PCM/ALAC audio plays silent, .mkv never; the error event remains the catch-all
  if (hasProxy(v)) return true; var s = M.src(v); var p = String(s.path || '').toLowerCase();
  if (/\.mkv$/.test(p)) return false;
  if (/hevc|h265/.test(s.vcodec || '') && !(window.MediaSource && MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"'))) return false;
  if (s.hdr) return false;
  if (s.acodec && !/^(aac|mp3|opus|vorbis|mp4a)/.test(s.acodec)) return false;
  return true;
}
function playerSource(v) { return hasProxy(v) ? '/api/video/' + encodeURIComponent(v.id) + '/proxy.mp4' : '/api/video/' + encodeURIComponent(v.id) + '/source'; }
var timeMemory = {};   // source url → where she was, for Back to the take
function paintPlayer(v) {
  var row = $('playerRow'); var cap = $('playerCap'); var editing = v && v.transcript && (v.phrases || []).length && ctx.server;
  if (!editing) { row.style.display = 'none'; cap.innerHTML = v ? VV.playerPlaceholder(v, ctx) : ''; if (vid) { vid.pause(); } var tp = $('top'); if (tp) { tp.classList.remove('big', 'tight'); tp.style.removeProperty('--v-room'); } return; }   // no player: the block is the plain 42vh one
  row.classList.toggle('big', !!ctx.playerBig);
  if (!vid) { vid = $('player'); vid.addEventListener('error', function () { if (ctx.player.src === 'take') ctx.player.cannotPlay = true; else flash('That render does not play in this browser'); paintPlayerChrome(M.active()); }); vid.addEventListener('play', function () { ctx.player.playing = true; following = true; loop(); paintPlayerChrome(M.active()); }); vid.addEventListener('pause', function () { ctx.player.playing = false; paintPlayerChrome(M.active()); }); vid.addEventListener('loadedmetadata', function () { ctx.player.duration = vid.duration; paintPlayerChrome(M.active()); }); vid.addEventListener('seeked', function () { paintCaption(); }); vid.addEventListener('timeupdate', function () { ctx.player.time = vid.currentTime; var t = $('ptime'); if (t) t.textContent = M.fmt(vid.currentTime); paintCaption(); markNow(); skipRule(); }); vid.addEventListener('play', function () { var v2 = M.active(); var ps2 = v2 ? M.pieces(v2) : null; if (ps2 && ctx.player.src === 'take' && vid.currentTime >= freeUntil && Video.nextPlayable(ps2, vid.currentTime) < 0) vid.currentTime = ps2[0].start; }); }
  var want = ctx.player.src === 'take' ? playerSource(v) : '/api/video/' + encodeURIComponent(v.id) + '/' + ctx.player.src;
  if (playerFor !== v.id + '|' + want) {
    if (playerFor) timeMemory[playerFor] = vid.currentTime || 0;
    playerFor = v.id + '|' + want; ctx.player.cannotPlay = ctx.player.src === 'take' && !canPlayHere(v); vid.pause();
    if (!ctx.player.cannotPlay) { vid.src = want; vid.load(); var back = timeMemory[playerFor] || 0; if (metaOnce) { vid.removeEventListener('loadedmetadata', metaOnce); metaOnce = null; } if (back) { metaOnce = function () { vid.removeEventListener('loadedmetadata', metaOnce); metaOnce = null; vid.currentTime = back; }; vid.addEventListener('loadedmetadata', metaOnce); } ctx.player.time = back; } else { vid.removeAttribute('src'); ctx.player.time = 0; }
  }
  vid.style.display = ctx.player.cannotPlay ? 'none' : ''; var cb = $('captionBox'); if (cb && ctx.player.cannotPlay) cb.style.display = 'none';
  var ck = v.id + ':' + ctx.player.src + ':' + (M.hasWords(v.id) ? 'w' : 'p') + ':' + ((v.captions && v.captions.style) || 'sentence'); if (ck !== cueKey) { cueKey = ck; loadCues(); }   // the captions follow what plays: the take's chunks, or the render's own .srt
  paintPlayerChrome(v);
}
function paintPlayerChrome(v) { if (!v) return; var row = $('playerRow'); var folded = ctx.playerHidden || ctx.reviewOpen; if (row) row.style.display = folded ? 'none' : ''; var pb = $('playBtn'); if (pb) pb.style.display = ctx.player.playing || ctx.player.cannotPlay || !ctx.server ? 'none' : ''; var side = $('playerSide'); if (side) side.innerHTML = VV.playerSide(v, ctx); var cap = $('playerCap'); if (cap) cap.innerHTML = (folded ? VV.playerBar(v, ctx) : '') + VV.playerCap(v, ctx); var top = $('top'); if (top) top.classList.toggle('big', !!ctx.playerBig && !folded && !!row && row.style.display !== 'none'); fitPlayer(); }   // the list open: the player folds to its bar so the words stay reachable; .big (half the window) only while the big player shows
// the sticky block is capped (42vh, half the window for Bigger); the player takes what the strip and the lines around it leave, so the whole frame, its caption band and the play button stay in view at any window height. Measured, not assumed: the strip wraps to more rows in a narrow window
function fitPlayer() {
  var top = $('top'); var row = $('playerRow'); if (!top || !row || row.style.display === 'none' || !vid || vid.style.display === 'none') return;
  top.classList.remove('tight'); top.style.removeProperty('--v-room');   // measure at the full size first; the CSS falls back to its own heights
  var over = top.scrollHeight - top.clientHeight; if (over <= 0) return;
  var h = row.offsetHeight; if (!h) return;   // the row: the frame, or the side column when that is taller
  if (h - over < 120) { top.classList.add('tight'); over = top.scrollHeight - top.clientHeight; if (over <= 0) return; }   // at the floor the help lines go first; only then does the block scroll
  top.style.setProperty('--v-room', Math.max(120, Math.floor(h - over)) + 'px');   // never under 120px: below that the block scrolls rather than the player vanishing
}
var fitTimer = 0; function fitSoon() { clearTimeout(fitTimer); fitTimer = setTimeout(function () { fitTimer = 0; fitPlayer(); }, 120); }   // one measurement once the window stops moving (a timer, not a frame: a frame can wait while nothing paints)
// while the take plays: a hole (a cut) is skipped the moment playback enters it from a piece; a seek INTO a hole plays it to its end (she wanted to hear it)
function skipRule() {   // on the frame loop and on timeupdate (which survives a hidden tab): a hole worth a jump (> 80 ms) is skipped one frame early; a seek into a hole plays it out
  var v = M.active(); if (!vid || vid.paused || vid.seeking || !v || ctx.player.src !== 'take') return;
  var ps = M.pieces(v); if (!ps) return; var fps = Number(M.src(v).fps) || 30; var t = vid.currentTime + 1 / fps;
  var next = Video.nextPlayable(ps, t); if (next < 0) { if (t < freeUntil) return; vid.pause(); return; }   // past the last piece: stop, unless she asked to hear the trailing cut
  if (next !== t && t >= freeUntil && next - t > 0.08) vid.currentTime = next;
}
function loop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; if (!vid || vid.paused) return; skipRule(); paintCaption(); rafId = requestAnimationFrame(loop); }
/* captions in the player: the take's own chunks (the same the renders write), a render's .srt on its own time axis; written only when the cue changes */
function loadCues() {
  var v = M.active(); cues = []; cueIdx = -1; if (!v) return paintCaption();
  if (ctx.player.src === 'take') { cues = M.captionCues(v); return paintCaption(); }
  var ex = (v.exports || []).filter(function (e) { return e.file.replace(/.*\//, '') === ctx.player.src; })[0]; var srt = ex && ex.srt ? ex.srt.replace(/.*\//, '') : ''; var key = cueKey;
  if (!srt || !/^(preview|final)-\d+\.srt$/.test(srt)) return paintCaption();
  fetch('/api/video/' + encodeURIComponent(v.id) + '/' + srt, { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) { if (cueKey !== key) return; cues = Video.srtCues(t); cueIdx = -1; paintCaption(); }).catch(function () { /* no captions for this render */ });   // the key, not just the name: another take's render with the same name must not get these cues
}
function paintCaption() {
  var box = $('captionBox'), el = $('caption'); if (!box || !el) return;
  var i = ctx.captions && vid && cues.length && !ctx.player.cannotPlay ? Video.cueAt(cues, vid.currentTime || 0, cueIdx) : -1;
  if (i === cueIdx && (i >= 0 ? box.style.display !== 'none' : box.style.display === 'none')) return;
  cueIdx = i; if (i < 0) { box.style.display = 'none'; el.textContent = ''; } else { el.textContent = cues[i].t; box.style.display = ''; }
}
function toggleCaptions() { ctx.captions = !ctx.captions; Store.set('marathon.video.captions', ctx.captions ? '1' : '0', { silent: true }); cueIdx = -2; paintCaption(); paintPlayerChrome(M.active()); }
function togglePlayerSize() { ctx.playerBig = !ctx.playerBig; Store.set('marathon.video.playerBig', ctx.playerBig ? '1' : '0', { silent: true }); paintPlayer(M.active()); }
function holeEnd(v, t) { var ps = M.pieces(v); if (!ps) return -1; var n = Video.nextPlayable(ps, t); return n === t ? -1 : n < 0 ? M.dur(v) : n; }
function seekTo(t) {   // a click on a word or a Review row: the playhead moves, the play state does not; into a cut it plays the cut until it ends
  var v = M.active(); if (!vid || !v || !ctx.server) return;
  if (ctx.player.src !== 'take') { ctx.player.src = 'take'; paintPlayer(v); }
  if (ctx.player.cannotPlay) return; if (Math.abs((vid.currentTime || 0) - t) < 0.3 && !vid.paused) return;   // a double-click does not restart a word that is playing
  freeUntil = holeEnd(v, t); vid.currentTime = t; ctx.player.time = t; var el = $('ptime'); if (el) el.textContent = M.fmt(t); following = true; markNow();
}
function playFrom(t) { seekTo(t); if (vid && vid.paused && !ctx.player.cannotPlay && ctx.server) { following = true; vid.play().catch(function () {}); } }   // a Review row: go there and play
function togglePlay() { var v = M.active(); if (!vid || !v || !ctx.server || ctx.player.cannotPlay) return; if (vid.paused) { following = true; vid.play().catch(function () {}); } else vid.pause(); }
function togglePlayer() { ctx.playerHidden = !ctx.playerHidden; paintPlayer(M.active()); }   // for this session only: a fold must never hide the player from every take forever
function watchRender(name) { ctx.player.src = name; var v = M.active(); var ex = (v.exports || []).filter(function (e) { return e.file.replace(/.*\//, '') === name; })[0]; ctx.player.kind = ex ? ex.kind : 'render'; ctx.player.label = ex ? (ex.kind === 'final' ? 'the final' : 'the preview') + ' (' + M.fmt(ex.duration || 0) + ')' : name; ctx.player.stale = !!(ex && ex.edlHash !== v.edlHash); ctx.playerHidden = false; paintPlayer(v); vid.play().catch(function () {}); $('top').scrollIntoView({ block: 'start' }); }
function watchTake() { ctx.player.src = 'take'; paintPlayer(M.active()); }
function makeProxy() { var v = M.active(); if (!v) return; api('/api/video/proxy', { id: v.id, ws: Config.activeWs() }).then(function () { flash('Making a copy that plays here…'); ctx.job = Object.assign({}, ctx.job || {}, { proxy: { finished: false } }); paintPlayerChrome(v); startPoll(v.id); }).catch(function (e) { flash(e.message); }); }
// the word being spoken: an accent underline; the text follows it while playing unless she scrolled herself
function markNow() {
  var t = ctx.player.time || 0; var now = null; var els = document.querySelectorAll('#phrases .w');
  for (var i = 0; i < els.length; i++) { var k = ctx.tokens[+els[i].dataset.i]; var on = !!(k && k.kind === 'word' && ctx.player.src === 'take' && t >= k.s - 0.02 && t < k.e + 0.02); els[i].classList.toggle('now', on); if (on) now = els[i]; }
  var pn = $('pnow'); var ci = cues.length ? Video.cueAt(cues, t, cueIdx) : -1; ctx.player.nowText = ci >= 0 ? cues[ci].t.slice(0, 80) : ''; if (pn) { if (ci >= 0) pn.textContent = cues[ci].t.slice(0, 80); else if (now) pn.textContent = now.closest('.ph') ? now.closest('.ph').querySelector('.x').textContent.slice(0, 80) : ''; }   // the folded bar captions too
  if (now && following && !dragging && vid && !vid.paused) { var r = now.getBoundingClientRect(); var pane = $('pane').getBoundingClientRect(); var topH = $('top').getBoundingClientRect().height; if (r.top < pane.top + topH + 10 || r.bottom > pane.bottom - 40) now.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

/* ---- the selection: tokens in DOM order (words, pause pills, or whole sentences without the words) ---- */
function selStats(a, b) {   // "Put back" only when every selected token is cut; the label counts by kind: "3 words and 1 pause", "1 sentence"
  var n = 0, cut = 0, k = { word: 0, pause: 0, sentence: 0 }; for (var i = a; i <= b; i++) { var t = ctx.tokens[i]; if (!t) continue; n++; if (t.cut) cut++; k[t.kind || 'word']++; }
  var parts = [k.word ? k.word + (k.word === 1 ? ' word' : ' words') : '', k.pause ? k.pause + (k.pause === 1 ? ' pause' : ' pauses') : '', k.sentence ? k.sentence + (k.sentence === 1 ? ' sentence' : ' sentences') : ''].filter(Boolean);
  var same = true; var first = ctx.tokens[a]; for (var j = a; j <= b; j++) { var tj = ctx.tokens[j]; if (!tj || tj.kind !== 'word' || !first || tj.ph !== first.ph) same = false; }
  return { a: a, b: b, count: n, cut: n > 0 && cut === n, label: parts.join(' and '), correctable: n > 0 && same && ctx.server && !!(first && first.wi != null), keepable: (k.word > 1 || k.sentence > 0) && cut < n };   // keepable: more than a word, with something still playing
}
function selectSentenceOf(i) { var t = ctx.tokens[i]; if (!t || t.ph == null) return; var a = i, b = i; while (a > 0 && ctx.tokens[a - 1].ph === t.ph) a--; while (b < ctx.tokens.length - 1 && ctx.tokens[b + 1].ph === t.ph) b++; while (b > a && ctx.tokens[b].kind === 'pause') b--; selectRange(a, b); }   // the pause after the sentence is not the sentence (a trim ends on the last word)
function setSelection(a, b) { if (a < 0 || b < 0) { ctx.selection = null; } else { ctx.selection = selStats(Math.min(a, b), Math.max(a, b)); } paintSelection(); }
function clearSelection() { ctx.selection = null; anchor = -1; }
function paintSelection() {   // cheap: toggle classes, re-render the strip only
  var sel = ctx.selection; var on = {}; if (sel) for (var k = sel.a; k <= sel.b; k++) on[k] = 1;
  Array.prototype.forEach.call(document.querySelectorAll('#phrases .w'), function (el) { el.classList.toggle('sel', !!on[+el.dataset.i]); });
  var v = M.active(); if (!v || !v.transcript) return; $('strip').innerHTML = VV.strip(v, ctx);
}
function tokDown(ev, i) { if (ev.button !== 0) return; if (ctx.renaming) saveTitle(); if (ctx.correcting) cancelCorrect(); ev.preventDefault(); if (ev.shiftKey && anchor >= 0) { setSelection(anchor, i); moved = true; return; } anchor = i; dragging = true; moved = false; setSelection(i, i); }
function tokEnter(ev, i) { if (!dragging || anchor < 0) return; if (ev.buttons !== undefined && !(ev.buttons & 1)) { dragging = false; return; } if (i !== anchor) moved = true; setSelection(anchor, i); }
function tokUp(ev, i) { if (ev.button !== 0) return; var t = ctx.tokens[i]; if (dragging && !moved && t) seekTo(t.s); else if (dragging && moved && ctx.selection) { var a = ctx.tokens[ctx.selection.a]; if (a) seekTo(a.s); } dragging = false; }
function tokDouble(ev, i) { ev.preventDefault(); selectSentenceOf(i); var t = ctx.tokens[ctx.selection ? ctx.selection.a : i]; if (t) seekTo(t.s); }
document.addEventListener('mouseup', function () { dragging = false; });
$('pane').addEventListener('wheel', function () { following = false; }, { passive: true }); $('pane').addEventListener('touchmove', function () { following = false; }, { passive: true });
function selectRange(a, b) { anchor = a; setSelection(a, b); }
function selectedSpans() {   // consecutive tokens become one span each
  var sel = ctx.selection; if (!sel) return []; var spans = []; var cur = null;
  for (var i = sel.a; i <= sel.b; i++) { var t = ctx.tokens[i]; if (!t) continue; if (cur && t.s <= cur.e + 0.35) cur.e = Math.max(cur.e, t.e); else { cur = { s: t.s, e: t.e }; spans.push(cur); } }
  return spans;
}
function keepOnly() {   // the trim: everything before and after the selection goes; what is inside stays as it is
  var v = M.active(); var sel = ctx.selection; if (!v || !sel || !sel.keepable) return;
  var spans = selectedSpans(); if (!spans.length) return; var s = Math.min.apply(null, spans.map(function (x) { return x.s; })), e = Math.max.apply(null, spans.map(function (x) { return x.e; }));
  try { var r = M.keepOnly(v, s, e, 'kept only ' + sel.label); if (!r || r.same) { flash('That is already everything that plays'); return; } flash('Kept ' + M.fmt(r.kept) + ' of ' + M.fmt(r.was), true); } catch (err) { flash(err.message); return; }
  clearSelection(); paint();
}
function actOnSelection() {
  var v = M.active(); var sel = ctx.selection; if (!v || !sel || !sel.count) return;
  var spans = selectedSpans(); var what = sel.label;
  try {
    if (sel.cut) { M.keepSpans(v, spans, 'put back ' + what); flash('Put back ' + what); }
    else { M.cutSpans(v, spans, 'cut ' + what); flash('Cut ' + what, true); }
  } catch (e) { flash(e.message); }
  clearSelection(); paint();
}
function moveSelection(delta, extend) {
  var sel = ctx.selection; var n = ctx.tokens.length; if (!n) return;
  if (!sel) { setSelection(0, 0); return; }
  if (extend) { var b = Math.max(0, Math.min(n - 1, (anchor === sel.a ? sel.b : sel.a) + delta)); setSelection(anchor >= 0 ? anchor : sel.a, b); }
  else { var i = Math.max(0, Math.min(n - 1, (delta > 0 ? sel.b : sel.a) + delta)); anchor = i; setSelection(i, i); }
  var el = document.querySelector('#phrases .w[data-i="' + (ctx.selection ? (delta > 0 ? ctx.selection.b : ctx.selection.a) : 0) + '"]'); if (el) el.scrollIntoView({ block: 'nearest' });
}

/* ---- takes ---- */
function selectTake(id) { ctx.wantedTake = ''; if (M.setActive(id)) { ctx.showAll = false; ctx.showRenderError = false; ctx.renaming = false; ctx.reviewOpen = false; ctx.correcting = null; ctx.player = { src: 'take', time: 0, playing: false }; freeUntil = -1; clearSelection(); var v = M.active(); loadWords(v); checkJobs(v); paint(); } }
function loadWords(v) {   // the words with their times from data/videos/<id>/transcript.json: server or linked folder; elsewhere the sentences stand in
  if (!v || !v.transcript || M.hasWords(v.id) || wordsLoading[v.id]) return;
  if (!isServer() && !(Sync.readTakeFile)) return;
  var p = isServer() ? api('/api/video/' + encodeURIComponent(v.id) + '/transcript.json') : Sync.readTakeFile ? Sync.readTakeFile(v.id, 'transcript.json') : Promise.resolve(null);
  wordsLoading[v.id] = true;
  p.then(function (t) { if (t && Array.isArray(t.words) && t.words.length) { delete ctx.wordsGone[v.id]; M.setWords(v.id, t.words, t.silences); paint(); } }).catch(function (e) { if (e && e.status === 404 && isServer()) { ctx.wordsGone[v.id] = true; paint(); } }).then(function () { wordsLoading[v.id] = false; });   // 404 with the server: the file is gone, say so (elsewhere the sentences stand in)
}
/* ---- Review first: tick what goes, see the count, then remove ---- */
function toggleReview() { ctx.reviewOpen = !ctx.reviewOpen; if (ctx.reviewOpen) ctx.reviewTicked = {}; paint(); }
function reviewTick(el) { ctx.reviewTicked[el.dataset.key] = el.checked; ctx.reviewCount = reviewCounts(); paint(); }
function reviewKeys() { var tc = ctx.tidy; if (!tc) return []; var on = []; (tc.fillerHoles || []).concat(tc.pauseHoles || []).forEach(function (h) { if (ctx.reviewTicked[h.key] !== false) on.push(h.key); }); (tc.allRetakes || []).forEach(function (r) { var k = 'r:' + r.s.toFixed(2); if (ctx.reviewTicked[k] === true) on.push(k); }); return on; }
function reviewCounts() { var keys = reviewKeys(); return { fillers: keys.filter(function (k) { return k.indexOf('f:') === 0; }).length, pauses: keys.filter(function (k) { return k.indexOf('p:') === 0; }).length, retakes: keys.filter(function (k) { return k.indexOf('r:') === 0; }).length }; }
function removeTicked() { var v = M.active(); if (!v) return; var keys = reviewKeys(); if (!keys.length) return; try { var r = M.tidy(v, 'both', null, keys, true); flash('Removed ' + [r.fillers ? r.fillers + ' filler' + (r.fillers === 1 ? '' : 's') : '', r.pauses ? r.pauses + ' pause' + (r.pauses === 1 ? '' : 's') : '', r.retakes ? r.retakes + ' said twice' : ''].filter(Boolean).join(' and '), true); } catch (e) { flash(e.message); } ctx.reviewOpen = false; clearSelection(); paint(); }
function setPauseMin(val) { var n = Number(val); if (!(n >= 0.2 && n <= 5)) return flash('Between 0.2 and 5 seconds'); setVideoSetting('video.pause', String(n)); paint(); }
function setEngine(eng) { setVideoSetting('video.auto', eng || ''); if (eng) setVideoSetting('video.engine', eng); flash(eng === 'elevenlabs' ? 'New takes go to ElevenLabs by themselves (your credits)' : eng ? 'New takes get their words by themselves' : 'The page asks each time again'); paint(); }
// a video.* setting from the page: the same path the Reply tab uses (Config.override → settings.json); `video` settings apply in place, no reload
function setVideoSetting(pathKey, value) {
  var shipped = window.MARATHON_CONFIG || {}; var cur = Config.overrides() || {};
  try { var r = Config.override(shipped, cur, 'set', pathKey, value); Store.set('marathon.config.dirty', '1', { silent: true }); if (Object.keys(r.config).length) Store.setJSON(Config.OVR_KEY, r.config); else Store.set(Config.OVR_KEY, 'null'); Config.setOverrides(r.config); if (window.Sync && Sync.note) Sync.note('settings.json', pathKey + ' set from the Video page'); } catch (e) { flash(e.message); }
}
/* ---- Correct: retype what was said; the audio and the cut do not change ---- */
function startCorrect() {
  var v = M.active(); var sel = ctx.selection; if (!v || !sel || !sel.correctable) return;
  var W = M.wordsFor(v); var from = ctx.tokens[sel.a].wi, to = ctx.tokens[sel.b].wi; var text = W.slice(from, to + 1).map(function (w) { return w.w; }).join(' ');
  var others = from === to ? W.filter(function (w, k) { return k !== from && Video.normWord(w.w) === Video.normWord(W[from].w); }).length : 0;
  ctx.correcting = { from: from, to: to, text: text, others: others }; paint();
}
function correctKey(ev) { if (ev.key === 'Enter') { ev.preventDefault(); saveCorrect(); } if (ev.key === 'Escape') { ev.preventDefault(); cancelCorrect(); } ev.stopPropagation(); }
function cancelCorrect() { ctx.correcting = null; paint(); }
function saveCorrect() {
  var v = M.active(); var c = ctx.correcting; var el = $('correctInput'); if (!v || !c || !el) return; var text = el.value.trim();
  if (!text) return flash('Type the word you heard. To take it out, press Delete.');
  var W = M.wordsFor(v); var oldLast = W[c.to] ? W[c.to].w : ''; var punct = (oldLast.match(/[.,!?]+$/) || [''])[0]; if (punct && !/[.,!?]$/.test(text)) text += punct;   // the sentence end stays unless she typed her own
  var all = !!($('correctAll') && $('correctAll').checked); ctx.correcting = null;
  correctWords(v.id, c.from + '-' + c.to, text, all, W.slice(c.from, c.to + 1).map(function (w) { return w.w; }).join(' ')).then(function () { flashUndoWord('Corrected: ' + text); }).catch(function (e) { flash(e.message); });
}
function flashUndoWord(msg) { var t = $('toast'); if (!t) return; t.innerHTML = esc(msg) + ' <button type="button" onclick="undoWord()">Undo</button>'; t.classList.add('show'); t.classList.add('with-undo'); clearTimeout(flash._t); flash._t = setTimeout(function () { t.classList.remove('show'); }, 6000); }
function undoWord() { var v = M.active(); if (!v) return; api('/api/video/word', { id: v.id, undo: true, ws: Config.activeWs() }).then(function (r) { M.setWords(v.id, r.words || [], r.silences); return Sync.pullAll(false); }).then(function () { clearSelection(); paint(); flash('The word is back as it was'); }).catch(function (e) { flash(e.message); }); }
// the same path a pasted `video word` line takes (core/apply.js calls it): the server writes the transcript, the page re-pulls the words
function correctWords(id, range, text, all, expect) {
  if (!isServer()) return Promise.reject(new Error('Fixing a word needs the server (the card at the top).'));
  var m = String(range).match(/^(\d+)(?:-(\d+))?$/); var said = m ? '' : String(range || '').trim(); if (!m && !said) return Promise.reject(new Error('which words?'));   // word numbers, or the words as they are said
  var v = M.get(id) || M.list().filter(function (x) { return x.title.toLowerCase() === String(id).toLowerCase(); })[0]; if (!v) return Promise.reject(new Error('no take matches "' + id + '"'));
  var body = { id: v.id, text: text, all: !!all, ws: Config.activeWs() }; if (m) { body.from = +m[1]; body.to = m[2] !== undefined ? +m[2] : +m[1]; } else body.said = said.slice(0, 200); if (expect) body.expect = expect;
  return api('/api/video/word', body).then(function (r) { if (r && Array.isArray(r.words)) M.setWords(v.id, r.words, r.silences); return Sync.pullAll(false); }).then(function () { clearSelection(); paint(); });   // the words come back with the answer: no wait for the poll
}
window.correctWords = correctWords;
function removeNoise() { var v = M.active(); if (!v) return; try { var r = M.tidy(v); var parts = [r.fillers ? r.fillers + ' filler' + (r.fillers === 1 ? '' : 's') : '', r.pauses ? r.pauses + ' pause' + (r.pauses === 1 ? '' : 's') : ''].filter(Boolean); flash('Removed ' + parts.join(' and '), true); } catch (e) { flash(e.message); } clearSelection(); paint(); }
function keepEverything() { var v = M.active(); if (v && M.keepEverything(v)) flash('Everything plays again', true); clearSelection(); paint(); }
function undoCut() { var v = M.active(); if (v && M.undo(v)) flash('Undone'); clearSelection(); paint(); }
function redoCut() { var v = M.active(); if (v && M.redo(v)) flash('Redone'); clearSelection(); paint(); }
function showAllPhrases() { ctx.showAll = true; paint(); }
function startRename() { ctx.renaming = true; paint(); }
function titleKey(ev) { if (ev.key === 'Enter') { ev.preventDefault(); saveTitle(); } if (ev.key === 'Escape') { ctx.renaming = false; paint(); } }
function saveTitle() { if (!ctx.renaming) return; var v = M.active(); var el = $('titleInput'); ctx.renaming = false; if (v && el && M.rename(v, el.value)) flash('Renamed'); paint(); }
function removeTake() {
  var v = M.active(); if (!v) return;
  if (!confirm('Remove “' + v.title + '” from Solo Ops?\n\nThe recording stays where it is. The words and renders stay in data/videos/' + v.id + '/.')) return;
  M.remove(v); flash('Removed from the list; the files stay'); clearSelection(); paint();
}

/* ---- copy / agent ---- */
function copyText(text, msg) { return navigator.clipboard.writeText(text).then(function () { flash(msg || 'Copied'); return true; }).catch(function () { try { prompt('Copy this:', text); } catch (e) { /* embedded */ } return false; }); }
function copyAgent(line) { copyText(line === 'node serve.js' ? 'In my Solo Ops folder, start `node serve.js` and leave it running, then tell me the address it prints.' : 'In my Solo Ops folder, run `' + line + '` and tell me when it is done.', 'Copied — paste it into Claude Code or Cursor'); }
function addLine() {   // the add line, from what she typed in the box (no server here)
  var p = ($('addPath') && $('addPath').value || '').trim(); var line = M.terminal(null, 'add');
  if (p) { var title = p.replace(/.*[\/\\]/, '').replace(/\.[^.]+$/, ''); line = line.replace('"Title"', JSON.stringify(title)).replace('"<path to the recording>"', JSON.stringify(p)); }
  var code = $('addLineCode'); if (code) code.textContent = line; return line;
}
function copyForAI() { var v = M.active(); if (!v) return flash('Add a take first'); copyText(M.copyText(v), 'Copied the take — paste it into your agent chat'); }
function copyLine(what) { var v = M.active(); if (!v) return; var ws = Config.activeWs() !== Config.PRIMARY ? ' --ws ' + Config.activeWs() : ''; copyText(what === 'folder' ? 'data/videos/' + v.id + '/' : 'node solo.js video show ' + v.id + ws, 'Copied'); }
function cutWithAI() { var v = M.active(); if (!v) return flash('Add a take first'); if (!v.transcript) return flash('Get the words first, then your agent can read them'); if (window.Guide && Guide.openPrompt) Guide.openPrompt('cut-take'); }

/* ---- the server: doctor, recordings, jobs, add, transcribe, key, render, post ---- */
function checkDoctor(force, say) {
  if (!isServer()) { ctx.doctor = null; return; }
  if (!force && ctx.doctor && Date.now() - ctx.doctor.at < 300000) return;
  api('/api/video/doctor' + (force ? '?fresh=1' : '')).then(function (d) { d.at = Date.now(); ctx.doctor = d; ctx.oldServer = false; paint(); if (say) flash(d.ffmpeg ? 'ffmpeg found' : 'Still no ffmpeg'); }).catch(function (e) { ctx.doctor = null; if (e && e.status === 404) { ctx.oldServer = true; paint(); } });   // 404: a node serve.js from before the Video page is still running
}
function loadRecordings() { if (!isServer()) { ctx.recordings = null; return; } api('/api/video/recordings').then(function (r) { ctx.recordings = r; paint(); }).catch(function () { ctx.recordings = null; }); }
function openRecordings() { api('/api/video/recordings', { open: true }).then(function () { flash('Opened the folder'); loadRecordings(); }).catch(function (e) { flash(e.message); }); }
function addWaiting() { api('/api/video/recordings', { add: true }).then(function (r) { flash('Added ' + (r.added || []).length + ' take' + ((r.added || []).length === 1 ? '' : 's')); return Sync.pullAll(false); }).then(function () { loadRecordings(); paint(); }).catch(function (e) { flash(e.message); }); }
function checkJobs(v) {   // on open: is something running for this take (a render or a transcription started earlier)?
  if (!isServer() || !v) return;
  api('/api/video/' + encodeURIComponent(v.id) + '/status').then(function (st) { ctx.job = st; if (st && ((st.render && !st.render.finished) || (st.renderJob && !st.renderJob.finished) || (st.transcribe && !st.transcribe.finished) || (st.proxy && !st.proxy.finished))) startPoll(v.id); paint(); }).catch(function () { /* none */ });
}
function startPoll(id) {
  stopPoll(); var t0 = Date.now(); var seenDone = false; var lastSt = '';
  pollTimer = setInterval(function () {
    var v = M.active(); if (!v || v.id !== id) return stopPoll();
    api('/api/video/' + encodeURIComponent(id) + '/status').then(function (st) {
      var sig = JSON.stringify(st); var changed = sig !== lastSt; lastSt = sig;
      ctx.job = st; var pr = st.render;
      if (pr && !pr.finished && pr.total && pr.done > 0) { var el = (Date.now() - Date.parse(pr.startedAt || t0)) / 1000; var left = el / pr.done * (pr.total - pr.done); ctx.left = left > 50 ? Math.max(1, Math.round(left / 60)) + ' min' : left > 5 ? Math.round(left) + ' s' : ''; } else ctx.left = '';
      var rendering = (pr && !pr.finished) || (st.renderJob && !st.renderJob.finished); var transcribing = st.transcribe && !st.transcribe.finished; var proxying = st.proxy && !st.proxy.finished;
      if (!rendering && !transcribing && !proxying && !seenDone) {
        seenDone = true; stopPoll(); var failed = (st.renderJob && st.renderJob.finished && st.renderJob.code !== 0 && Date.parse(st.renderJob.endedAt || 0) > renderStartedAt - 1000) || (st.transcribe && st.transcribe.finished && st.transcribe.code !== 0) || (st.proxy && st.proxy.finished && st.proxy.code !== 0);
        ctx.showRenderError = !!(st.renderJob && st.renderJob.finished && st.renderJob.code !== 0 && Date.parse(st.renderJob.endedAt || 0) >= renderStartedAt - 1000);
        Sync.pullAll(false).then(function () {
          var nv = M.active(); if (nv) loadWords(nv); paint();
          if (failed) return flash('It did not finish; the reason is on the page');
          if (st.transcribe && Date.parse(st.transcribe.endedAt || 0) > t0 - 1000) return flash('The words are in');
          if (st.proxy && Date.parse(st.proxy.endedAt || 0) > t0 - 1000) { ctx.player.cannotPlay = false; playerFor = ''; paintPlayer(nv); return flash('The copy plays here now'); }
          var latest = nv && (nv.exports || []).slice(-1)[0]; if (latest) { watchRender(latest.file.replace(/.*\//, '')); flash('Done: the ' + (latest.kind === 'final' ? 'final' : 'preview') + ' is playing above'); }
        });
      }
      if (changed) paint();   // not every tick: a re-render drops the selection and anything typed
    }).catch(function () { /* keep polling */ });
  }, 1500);
}
function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
function openAdd() { ctx.addOpen = true; paint(); var i = $('addPath'); if (i) i.focus(); var c = $('recordCard'); if (c) c.scrollIntoView({ block: 'nearest' }); }
function closeAdd() { ctx.addOpen = false; ctx.pendingTask = ''; paint(); }
function forgetTask() { ctx.pendingTask = ''; paint(); }
function dropOver(ev) { ev.preventDefault(); ev.currentTarget.classList.add('over'); }
function dropLeave(ev) { ev.currentTarget.classList.remove('over'); }
function dropFile(ev) { ev.preventDefault(); if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('over'); var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) fileArrived(f); }
// a recording dropped anywhere on the page, or pasted: the browser gives its name and size, the server finds where it lives
function fileArrived(f) {
  if (!/\.(mov|mp4|m4v|mkv|webm)$/i.test(f.name) && !/^video\//.test(f.type || '')) { flash(f.name + ' is not a video file'); return; }
  ctx.addOpen = true; paint(); var found = $('addFound'); var box = $('addPath');
  if (!isServer()) { if (box) { box.value = f.name; box.focus(); box.setSelectionRange(0, 0); } if (found) found.innerHTML = '<span class="muted">Only the name arrives without the server (' + esc(f.name) + '). Start it (the card at the top) and drop the file again, or type the folder in front of the name.</span>'; return; }
  found.textContent = 'Looking for ' + f.name + '…';
  api('/api/video/find', { name: f.name, size: f.size }).then(function (r) {
    if (!r.found || !r.found.length) { found.innerHTML = '<span class="muted">Not found in Movies (Videos on Windows), Desktop, Downloads or Documents. Type where it is:</span>'; $('addPath').value = f.name; $('addPath').focus(); $('addPath').setSelectionRange(0, 0); return; }
    $('addPath').value = r.found[0].path; found.innerHTML = 'Found it: <code>' + esc(r.found[0].path) + '</code>' + (r.found.length > 1 ? ' <span class="muted">(' + (r.found.length - 1) + ' more with that name; the newest is picked)</span>' : '') + ' <span class="muted">Not it? Type where it is.</span>';
    addTake();   // found by name and size: add it without another click
  }).catch(function (e) { found.textContent = e.message; });
}
// the whole page takes a drop or a paste, not only the box
document.addEventListener('dragover', function (ev) { if (ev.dataTransfer && Array.prototype.some.call(ev.dataTransfer.types || [], function (t) { return t === 'Files'; })) { ev.preventDefault(); document.body.classList.add('v-dropping'); } });
document.addEventListener('dragleave', function (ev) { if (!ev.relatedTarget) document.body.classList.remove('v-dropping'); });
document.addEventListener('drop', function (ev) { document.body.classList.remove('v-dropping'); var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (!f) return; ev.preventDefault(); fileArrived(f); });
document.addEventListener('paste', function (ev) { var inField = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName); var files = ev.clipboardData && ev.clipboardData.files; if (files && files.length) { ev.preventDefault(); fileArrived(files[0]); } else if (!inField && ev.clipboardData) { var t = ev.clipboardData.getData('text') || ''; if (/^(\/|~\/|[A-Za-z]:\\).*\.(mov|mp4|m4v|mkv|webm)$/i.test(t.trim())) { ctx.addOpen = true; paint(); $('addPath').value = t.trim(); addTake(); } } });
function addTake() {
  var p = ($('addPath') && $('addPath').value || '').trim(); if (!p) return flash('Where is the recording? Drop it above or paste its path.');
  if (!isServer()) return flash('Without the server, your agent adds it: the button below');
  var btn = document.querySelector('#addBox .btn.primary'); if (btn) { btn.disabled = true; btn.textContent = 'Reading the file…'; }
  api('/api/video/add', { path: p, ws: Config.activeWs(), task: ctx.pendingTask || '' }).then(function (r) { ctx.pendingTask = ''; flash(r.existing ? 'Already a take: ' + r.title : r.wordsStarted ? 'Added: ' + r.title + '. Getting the words…' : 'Added: ' + r.title + '. Next: get the words.'); $('addPath').value = ''; $('addFound').textContent = ''; ctx.addOpen = false; return Sync.pullAll(false).then(function () { if (r.id && M.get(r.id)) { M.setActive(r.id); if (r.wordsStarted) checkJobs(M.active()); } paint(); }); })
    .catch(function (e) { flash(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Add this recording'; } });
}
function pointAgain() {
  var v = M.active(); var p = ($('movedPath') && $('movedPath').value || '').trim(); if (!v || !p) return;
  api('/api/video/source', { id: v.id, path: p }).then(function () { flash('Pointed at the file again'); checkDoctor(true); return Sync.pullAll(false); }).then(paint).catch(function (e) { flash(e.message); });
}
function transcribe(engine) {
  var v = M.active(); if (!v) return; var s = M.src(v);
  if (engine === 'elevenlabs') { var est = (s.duration || 0) / 3600 * 0.40; var price = est < 0.005 ? 'less than $0.01' : 'about $' + est.toFixed(2); if (!confirm('Send ' + M.fmt(s.duration) + ' of audio to ElevenLabs for ' + price + '?\n\nThe video stays on this computer; only the audio goes.')) return; }
  api('/api/video/transcribe', { id: v.id, engine: engine, yes: engine === 'elevenlabs', ws: Config.activeWs() }).then(function (r) { ctx.job = Object.assign({}, ctx.job || {}, { transcribe: { finished: false, engine: engine, startedAt: r.startedAt } }); paint(); startPoll(v.id); })
    .catch(function (e) { flash(e.message); });
}
function importChosen(input) {
  var f = input.files && input.files[0]; var v = M.active(); input.value = ''; if (!f || !v) return;
  var ext = (f.name.match(/\.(srt|vtt|json)$/i) || [])[1]; if (!ext) return flash('A transcript file is .srt, .vtt or .json');
  var rd = new FileReader(); rd.onload = function () { flash('Reading ' + f.name + '…'); api('/api/video/transcribe', { id: v.id, engine: 'import', text: String(rd.result), ext: ext.toLowerCase(), ws: Config.activeWs() }).then(function (r) { return Sync.pullAll(false).then(function () { var nv = M.active(); if (nv) loadWords(nv); paint(); flash((r.transcript ? r.transcript.words : '') + ' words from ' + f.name); }); }).catch(function (e) { flash(e.message); }); };
  rd.readAsText(f);
}
function saveKey() {
  var el = $('elevenKey'); var key = el ? el.value.trim() : ''; if (!key) return flash('Paste the key first');
  api('/api/video/key', { service: 'elevenlabs', key: key }).then(function () { if (el) el.value = ''; ctx.showKey = false; ctx.keyCard = false; flash('Key saved on this computer'); checkDoctor(true); }).catch(function (e) { flash(e.message); });
}
function showKeyCard() { ctx.keyCard = true; paint(); var el = $('elevenKey'); if (el) el.focus(); var c = $('keyCard'); if (c) c.scrollIntoView({ block: 'nearest' }); }
function closeKeyCard() { ctx.keyCard = false; paint(); }
function replaceKey() { ctx.showKey = !ctx.showKey; paint(); var el = $('elevenKey'); if (el) el.focus(); }
function rememberAspect(el) { ctx.aspect = el.checked ? '9:16' : ''; Store.set('marathon.video.aspect', ctx.aspect, { silent: true }); }
function startRender(preview) {
  var v = M.active(); if (!v) return; if (!isServer()) return flash('Rendering needs the server; the line is on the page');
  if (!(v.edl || []).length) return flash('Nothing to render yet: cut something first');
  renderStartedAt = Date.now(); ctx.showRenderError = false;
  api('/api/video/render', { id: v.id, preview: preview, aspect: ctx.aspect, ws: Config.activeWs() }).then(function () { flash(preview ? 'Rendering a preview…' : 'Rendering the final…'); ctx.job = Object.assign({}, ctx.job || {}, { renderJob: { finished: false }, render: null }); paint(); startPoll(v.id); })
    .catch(function (e) { if (e.status === 409) { flash('A render of this take is already running'); startPoll(v.id); } else flash(e.message); });
}
function makePost() {
  var v = M.active(); if (!v) return;
  api('/api/video/post', { id: v.id, ws: Config.activeWs() }).then(function () { flash('A draft post for tomorrow 09:00 is on the schedule with the final linked'); return Sync.pullAll(false); }).then(paint).catch(function (e) { flash(e.message); });
}

/* ---- init ---- */
function init() {
  Config.applyDOM();
  if (window.Story) { var wantedTake = Story.openParam('open'); if (wantedTake) { if (M.get(wantedTake)) M.setActive(wantedTake); else ctx.wantedTake = wantedTake; } if (Story.openParam('add')) { ctx.addOpen = true; ctx.pendingTask = Story.openParam('task') || ''; } if (Story.clearQuery) Story.clearQuery(['open', 'add', 'task']); if (Story.onWrite) Story.onWrite(function () { paint(); }); }   // ?open=<take> and ?add=1&task=<id> come from a card or a suggestion
  Palette.init({ root: '../' });
  Palette.register([
    { label: 'Add a recording', hint: 'video', keywords: 'new take record', run: openAdd },
    { label: 'Remove fillers and pauses', hint: 'video', keywords: 'um uh tidy silence', run: removeNoise },
    { label: 'Start over (everything plays)', hint: 'video', keywords: 'clear cut keep everything', run: keepEverything },
    { label: 'Undo the last cut', hint: 'video', keywords: 'revert', run: undoCut },
    { label: 'Redo', hint: 'video', run: redoCut },
    { label: 'Render a preview', hint: 'video', keywords: 'export', run: function () { startRender(true); } },
    { label: 'Render the final', hint: 'video', keywords: 'export', run: function () { startRender(false); } },
    { label: 'Cut it with my AI', hint: 'guide', keywords: 'agent prompt', run: cutWithAI },
    { label: 'Copy take for AI', hint: 'export', keywords: 'clipboard words', run: copyForAI },
    { label: 'Rename this take', hint: 'video', run: startRename },
    { label: 'Open take', prefix: 'find', hint: 'find <title>', keywords: 'search switch', run: function (q) { var l = q.toLowerCase(); var m = M.list().filter(function (v) { return v.title.toLowerCase().indexOf(l) >= 0; }); if (m.length === 1) selectTake(m[0].id); else flash(m.length ? 'Several takes match — be more specific' : 'No take matches'); } },
    { label: 'Remove this take', hint: 'video', run: removeTake },
    { label: 'Go to script viewer', hint: 'nav', run: function () { location.href = 'script-viewer.html?ws=' + encodeURIComponent(Config.activeWs()); } }
  ]);
  ctx.server = isServer(); ctx.ready = Sync.ready();
  window.addEventListener('resize', fitSoon);   // the room the block leaves changes with the window
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSoon);   // the strip can rewrap when the webfonts land
  var v = M.active(); if (v) loadWords(v);
  paint();
  document.addEventListener('keydown', function (e) {
    var ae = document.activeElement || {}; var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable; if (inField) return;
    if (document.body.classList.contains('guide-open') && e.key === 'Escape') return;   // the Guide closes itself
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redoCut(); else undoCut(); return; }
    if (e.key === ' ') { if (ae.tagName === 'VIDEO') return; e.preventDefault(); if (ae.tagName === 'BUTTON') ae.blur(); togglePlay(); return; }   // never re-click a focused button
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter') { if (ctx.selection && ctx.selection.count) { e.preventDefault(); if (ae.tagName === 'BUTTON') ae.blur(); actOnSelection(); } return; }   // nothing selected: nothing happens
    if (e.key === 'c' || e.key === 'C') { if (!mod && ctx.selection && ctx.selection.correctable) { e.preventDefault(); startCorrect(); } return; }
    if (e.key === 'k' || e.key === 'K') { if (!mod && ctx.selection && ctx.selection.keepable) { e.preventDefault(); if (ae.tagName === 'BUTTON') ae.blur(); keepOnly(); } return; }   // nothing selected: nothing (not play/pause)
    if (e.key === 'Escape') { if (ctx.selection) { clearSelection(); paintSelection(); } return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { if (!ctx.tokens.length) return; e.preventDefault(); if (ctx.selection) moveSelection(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey); else if (vid && ctx.server) seekTo(Math.max(0, (vid.currentTime || 0) + (e.key === 'ArrowRight' ? 1 : -1))); }
  });
}
document.addEventListener('DOMContentLoaded', function () { init(); if (ctx.addOpen && ctx.pendingTask) setTimeout(function () { var c = $('addBox'); if (c) c.scrollIntoView({ block: 'center' }); }, 500); });   // came from a card: the box is what she came for
