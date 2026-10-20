/* =========================================================================
   studio/video-main.js — handlers, sync, palette, the server calls, the
   selection. The takes live in data/videos.json (VideoModel); a cut writes
   through Sync like every app. With `node serve.js` running the buttons run
   the CLI for the ffmpeg work (transcribe, render) and poll its progress;
   without it they show the line that does it, agent first.
   ========================================================================= */
'use strict';
var M = VideoModel, VV = VideoView;
var ctx = { server: false, ready: false, chat: false, doctor: null, recordings: null, words: false, tidy: null, job: null, left: '', undo: false, redo: false, showAll: false, aspect: Store.get('marathon.video.aspect') || '', showRenderError: false, selection: null, tokens: [], renaming: false, showKey: false, addOpen: false };
var pollTimer = null; var wordsLoading = {}; var renderStartedAt = 0; var dragging = false; var anchor = -1;
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
  apply: function (body) { var before = M.active(); var hadNone = !before; M.applyFile(body); var now = M.active(); if (now) loadWords(now); if (now && before && now.id !== before.id && !hadNone) { M.setActive(before.id); flash('New take: ' + now.title + ' — at the top of the list'); } clearSelection(); paint(); }   // a take that just arrived opens only when nothing was open
});
Sync.on(function (ev) { if (ev === 'pulled' || ev === 'linked') { ctx.server = isServer(); ctx.ready = true; checkDoctor(false); loadRecordings(); var v = M.active(); if (v) { loadWords(v); checkJobs(v); } paint(); } });
Store.onChange(function (k) { if (k === M.KEY) paint(); });   // a reply applied in the Guide (core/apply.js) lands here too

/* ---- paint ---- */
function paint() {
  var v = M.active(); var takes = M.list();
  $('takesList').innerHTML = VV.list(takes, v ? v.id : '');
  ctx.chat = !!(window.Guide && Guide.mode && Guide.mode() === 'chat');
  ctx.words = !!(v && M.hasWords(v.id)); ctx.tidy = v && ctx.words ? M.tidyCount(v) : null; ctx.undo = !!(v && M.canUndo(v)); ctx.redo = !!(v && M.canRedo(v));
  var pathVal = $('addPath') ? $('addPath').value : ''; var foundHtml = $('addFound') ? $('addFound').innerHTML : '';
  $('main').innerHTML = VV.main(v, ctx);
  if ($('addBox') && (ctx.addOpen || !v)) { $('addBox').style.display = ''; if ($('addPath')) $('addPath').value = pathVal; if ($('addFound')) $('addFound').innerHTML = foundHtml; }
  if (ctx.renaming && $('titleInput')) { $('titleInput').focus(); $('titleInput').select(); }
  var cut = $('cutWithAiBtn'); if (cut) cut.disabled = !v;
}

/* ---- the selection: tokens in DOM order (words, pause pills, or whole sentences without the words) ---- */
function selStats(a, b) {   // "Put back" only when every selected token is cut; the label counts by kind: "3 words and 1 pause", "1 sentence"
  var n = 0, cut = 0, k = { word: 0, pause: 0, sentence: 0 }; for (var i = a; i <= b; i++) { var t = ctx.tokens[i]; if (!t) continue; n++; if (t.cut) cut++; k[t.kind || 'word']++; }
  var parts = [k.word ? k.word + (k.word === 1 ? ' word' : ' words') : '', k.pause ? k.pause + (k.pause === 1 ? ' pause' : ' pauses') : '', k.sentence ? k.sentence + (k.sentence === 1 ? ' sentence' : ' sentences') : ''].filter(Boolean);
  return { a: a, b: b, count: n, cut: n > 0 && cut === n, label: parts.join(' and ') };
}
function selectSentenceOf(i) { var t = ctx.tokens[i]; if (!t || t.ph == null) return; var a = i, b = i; while (a > 0 && ctx.tokens[a - 1].ph === t.ph) a--; while (b < ctx.tokens.length - 1 && ctx.tokens[b + 1].ph === t.ph) b++; selectRange(a, b); }
function setSelection(a, b) { if (a < 0 || b < 0) { ctx.selection = null; } else { ctx.selection = selStats(Math.min(a, b), Math.max(a, b)); } paintSelection(); }
function clearSelection() { ctx.selection = null; anchor = -1; }
function paintSelection() {   // cheap: toggle classes, re-render the strip only
  var sel = ctx.selection; var on = {}; if (sel) for (var k = sel.a; k <= sel.b; k++) on[k] = 1;
  Array.prototype.forEach.call(document.querySelectorAll('#phrases .w'), function (el) { el.classList.toggle('sel', !!on[+el.dataset.i]); });
  var v = M.active(); var old = document.querySelector('.v-strip'); if (!old || !v) return;
  var tmp = document.createElement('div'); tmp.innerHTML = VV.main(v, ctx); var fresh = tmp.querySelector('.v-strip'); if (fresh) old.replaceWith(fresh);
}
function tokDown(ev, i) { if (ev.button !== 0) return; if (ctx.renaming) saveTitle(); ev.preventDefault(); if (ev.shiftKey && anchor >= 0) { setSelection(anchor, i); return; } anchor = i; dragging = true; setSelection(i, i); }
function tokEnter(ev, i) { if (!dragging || anchor < 0) return; if (ev.buttons !== undefined && !(ev.buttons & 1)) { dragging = false; return; } setSelection(anchor, i); }
document.addEventListener('mouseup', function () { dragging = false; });
function selectRange(a, b) { anchor = a; setSelection(a, b); }
function selectedSpans() {   // consecutive tokens become one span each
  var sel = ctx.selection; if (!sel) return []; var spans = []; var cur = null;
  for (var i = sel.a; i <= sel.b; i++) { var t = ctx.tokens[i]; if (!t) continue; if (cur && t.s <= cur.e + 0.35) cur.e = Math.max(cur.e, t.e); else { cur = { s: t.s, e: t.e }; spans.push(cur); } }
  return spans;
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
function selectTake(id) { if (M.setActive(id)) { ctx.showAll = false; ctx.showRenderError = false; ctx.renaming = false; clearSelection(); var v = M.active(); loadWords(v); checkJobs(v); paint(); } }
function loadWords(v) {   // the words with their times from data/videos/<id>/transcript.json: server or linked folder; elsewhere the sentences stand in
  if (!v || !v.transcript || M.hasWords(v.id) || wordsLoading[v.id]) return;
  var p = isServer() ? api('/api/video/' + encodeURIComponent(v.id) + '/transcript.json') : Sync.readTakeFile ? Sync.readTakeFile(v.id, 'transcript.json') : Promise.resolve(null);
  wordsLoading[v.id] = true;
  p.then(function (t) { if (t && Array.isArray(t.words) && t.words.length) { M.setWords(v.id, t.words, t.silences); paint(); } }).catch(function () { /* the sentences stand in */ }).then(function () { wordsLoading[v.id] = false; });
}
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
  api('/api/video/doctor' + (force ? '?fresh=1' : '')).then(function (d) { d.at = Date.now(); ctx.doctor = d; paint(); if (say) flash(d.ffmpeg ? 'ffmpeg found' : 'Still no ffmpeg'); }).catch(function () { ctx.doctor = null; });
}
function loadRecordings() { if (!isServer()) { ctx.recordings = null; return; } api('/api/video/recordings').then(function (r) { ctx.recordings = r; paint(); }).catch(function () { ctx.recordings = null; }); }
function openRecordings() { api('/api/video/recordings', { open: true }).then(function () { flash('Opened the folder'); loadRecordings(); }).catch(function (e) { flash(e.message); }); }
function addWaiting() { api('/api/video/recordings', { add: true }).then(function (r) { flash('Added ' + (r.added || []).length + ' take' + ((r.added || []).length === 1 ? '' : 's')); return Sync.pullAll(false); }).then(function () { loadRecordings(); paint(); }).catch(function (e) { flash(e.message); }); }
function checkJobs(v) {   // on open: is something running for this take (a render or a transcription started earlier)?
  if (!isServer() || !v) return;
  api('/api/video/' + encodeURIComponent(v.id) + '/status').then(function (st) { ctx.job = st; if (st && ((st.render && !st.render.finished) || (st.renderJob && !st.renderJob.finished) || (st.transcribe && !st.transcribe.finished))) startPoll(v.id); paint(); }).catch(function () { /* none */ });
}
function startPoll(id) {
  stopPoll(); var t0 = Date.now(); var seenDone = false; var lastSt = '';
  pollTimer = setInterval(function () {
    var v = M.active(); if (!v || v.id !== id) return stopPoll();
    api('/api/video/' + encodeURIComponent(id) + '/status').then(function (st) {
      var sig = JSON.stringify(st); var changed = sig !== lastSt; lastSt = sig;
      ctx.job = st; var pr = st.render;
      if (pr && !pr.finished && pr.total && pr.done > 0) { var el = (Date.now() - Date.parse(pr.startedAt || t0)) / 1000; var left = el / pr.done * (pr.total - pr.done); ctx.left = left > 50 ? Math.max(1, Math.round(left / 60)) + ' min' : left > 5 ? Math.round(left) + ' s' : ''; } else ctx.left = '';
      var rendering = (pr && !pr.finished) || (st.renderJob && !st.renderJob.finished); var transcribing = st.transcribe && !st.transcribe.finished;
      if (!rendering && !transcribing && !seenDone) {
        seenDone = true; stopPoll(); var failed = (st.renderJob && st.renderJob.finished && st.renderJob.code !== 0 && Date.parse(st.renderJob.endedAt || 0) > renderStartedAt - 1000) || (st.transcribe && st.transcribe.finished && st.transcribe.code !== 0);
        ctx.showRenderError = !!(st.renderJob && st.renderJob.finished && st.renderJob.code !== 0 && Date.parse(st.renderJob.endedAt || 0) >= renderStartedAt - 1000);
        Sync.pullAll(false).then(function () { var nv = M.active(); if (nv) loadWords(nv); paint(); if (!failed) flash(st.transcribe && Date.parse(st.transcribe.endedAt || 0) > t0 - 1000 ? 'The words are in' : 'Done: the render is below'); else flash('It did not finish; the reason is on the page'); });
      }
      if (changed) paint();   // not every tick: a re-render drops the selection and anything typed
    }).catch(function () { /* keep polling */ });
  }, 1500);
}
function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
function openAdd() { ctx.addOpen = true; paint(); var i = $('addPath'); if (i) i.focus(); var c = $('recordCard'); if (c) c.scrollIntoView({ block: 'nearest' }); }
function closeAdd() { ctx.addOpen = false; paint(); }
function dropOver(ev) { ev.preventDefault(); ev.currentTarget.classList.add('over'); }
function dropLeave(ev) { ev.currentTarget.classList.remove('over'); }
function dropFile(ev) {
  ev.preventDefault(); ev.currentTarget.classList.remove('over'); var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (!f) return;
  var found = $('addFound'); found.textContent = 'Looking for ' + f.name + '…';
  api('/api/video/find', { name: f.name, size: f.size }).then(function (r) {
    if (!r.found || !r.found.length) { found.innerHTML = '<span class="muted">Not found in Movies (Videos on Windows), Desktop, Downloads or Documents. Type where it is:</span>'; $('addPath').value = f.name; $('addPath').focus(); $('addPath').setSelectionRange(0, 0); return; }
    $('addPath').value = r.found[0].path; found.innerHTML = 'Found it: <code>' + esc(r.found[0].path) + '</code>' + (r.found.length > 1 ? ' <span class="muted">(' + (r.found.length - 1) + ' more with that name; the newest is picked)</span>' : '') + ' <span class="muted">Not it? Type where it is.</span>';
  }).catch(function (e) { found.textContent = e.message; });
}
function addTake() {
  var p = ($('addPath') && $('addPath').value || '').trim(); if (!p) return flash('Where is the recording? Drop it above or paste its path.');
  if (!isServer()) return flash('Without the server, your agent adds it: the button below');
  var btn = document.querySelector('#addBox .btn.primary'); if (btn) { btn.disabled = true; btn.textContent = 'Reading the file…'; }
  api('/api/video/add', { path: p, ws: Config.activeWs() }).then(function (r) { flash(r.existing ? 'Already a take: ' + r.title : 'Added: ' + r.title + '. Next: get the words.'); $('addPath').value = ''; $('addFound').textContent = ''; ctx.addOpen = false; return Sync.pullAll(false).then(function () { if (r.id && M.get(r.id)) M.setActive(r.id); paint(); }); })
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
  api('/api/video/key', { service: 'elevenlabs', key: key }).then(function () { if (el) el.value = ''; ctx.showKey = false; flash('Key saved on this computer'); checkDoctor(true); }).catch(function (e) { flash(e.message); });
}
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
  var v = M.active(); if (v) loadWords(v);
  paint();
  document.addEventListener('keydown', function (e) {
    var inField = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName) || (document.activeElement && document.activeElement.isContentEditable); if (inField) return;
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redoCut(); else undoCut(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter') { if (ctx.selection && ctx.selection.count) { e.preventDefault(); actOnSelection(); } return; }   // nothing selected: nothing happens
    if (e.key === 'Escape') { if (ctx.selection) { clearSelection(); paintSelection(); } return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { if (!ctx.tokens.length) return; e.preventDefault(); moveSelection(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey); }
  });
}
document.addEventListener('DOMContentLoaded', init);
