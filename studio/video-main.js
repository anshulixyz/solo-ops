/* =========================================================================
   studio/video-main.js — handlers, sync, palette, the server calls.
   The takes live in data/videos.json (VideoModel); clicks write the cut
   through Sync like every app. With `node serve.js` running the buttons run
   the CLI for the ffmpeg work (transcribe, render) and poll its progress;
   without it they show the line that does it.
   ========================================================================= */
'use strict';
var M = VideoModel, VV = VideoView;
var ctx = { server: false, ready: false, chat: false, doctor: null, words: false, fillers: null, fillerList: null, job: null, left: '', undo: false, showAll: false, aspect: Store.get('marathon.video.aspect') || '', showRenderError: false };
var lastClick = -1; var pollTimer = null; var wordsLoading = {}; var renderStartedAt = 0;
function $(id) { return document.getElementById(id); }
function esc(s) { return VV.esc(s); }
function flash(msg) { var t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(flash._t); flash._t = setTimeout(function () { t.classList.remove('show'); }, 2600); }
function isServer() { return Sync.getMode() === 'server'; }
function api(path, body) {
  return fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; if (!r.ok) { var e = new Error(j.error || ('the server answered ' + r.status)); e.status = r.status; e.body = j; throw e; } return j; }); });
}

/* ---- sync: registered at script evaluation, writable (core/context.js then leaves videos.json to this page) ---- */
M.init();
Sync.register({ file: M.FILE, key: M.KEY, label: 'takes', app: 'videos',
  isFresh: function () { var d = Store.getJSON(M.KEY, null); return !d || !(d.videos || []).length; },   // an empty browser never writes an empty file over the CLI's
  read: function () { return M.read(); },
  reconcile: function (fileBody) { return M.reconcile(fileBody); },   // the file is the base of every write; the page overlays only the cut
  apply: function (body) { M.applyFile(body); var now = M.active(); if (now) loadWords(now); paint(); }   // loadWords is a no-op once the words are here; a transcript that just arrived (CLI) gets them
});
Sync.on(function (ev) { if (ev === 'pulled' || ev === 'linked') { ctx.server = isServer(); ctx.ready = true; checkDoctor(false); var v = M.active(); if (v) { loadWords(v); checkJobs(v); } paint(); } });
Store.onChange(function (k) { if (k === M.KEY) paint(); });   // a reply applied in the Guide (core/apply.js) lands here too

/* ---- paint ---- */
function paint() {
  var v = M.active(); var takes = M.list();
  $('takesList').innerHTML = VV.list(takes, v ? v.id : '');
  ctx.chat = !!(window.Guide && Guide.mode && Guide.mode() === 'chat');
  ctx.words = !!(v && M.hasWords(v.id)); ctx.fillers = v ? M.fillers(v, ctx.fillerList) : null; ctx.undo = !!(v && M.canUndo(v));
  var pathVal = $('addPath') ? $('addPath').value : ''; var foundHtml = $('addFound') ? $('addFound').innerHTML : '';
  $('main').innerHTML = VV.main(v, ctx);
  if ($('addBox') && (ctx.addOpen || !v)) { $('addBox').style.display = ''; if ($('addPath')) $('addPath').value = pathVal; if ($('addFound')) $('addFound').innerHTML = foundHtml; }
  var cut = $('cutWithAiBtn'); if (cut) cut.disabled = !v;
}

/* ---- takes ---- */
function selectTake(id) { if (M.setActive(id)) { ctx.showAll = false; ctx.showRenderError = false; var v = M.active(); loadWords(v); checkJobs(v); paint(); } }
function loadWords(v) {   // the words with their times from data/videos/<id>/transcript.json: server or linked folder; elsewhere the sentences stand in
  if (!v || !v.transcript || M.hasWords(v.id) || wordsLoading[v.id]) return;
  var p = isServer() ? api('/api/video/' + encodeURIComponent(v.id) + '/transcript.json') : Sync.readTakeFile ? Sync.readTakeFile(v.id, 'transcript.json') : Promise.resolve(null);
  wordsLoading[v.id] = true;
  p.then(function (t) { if (t && Array.isArray(t.words) && t.words.length) { M.setWords(v.id, t.words); paint(); } }).catch(function () { /* the sentences stand in */ }).then(function () { wordsLoading[v.id] = false; });
}
function phraseClick(ev, i) {
  if (ev.target && (ev.target.classList.contains('filler') || ev.target.classList.contains('hole'))) return;
  var v = M.active(); if (!v) return;
  try { if (ev.shiftKey && lastClick >= 0 && lastClick !== i) M.toggle(v, i, lastClick); else M.toggle(v, i); } catch (e) { flash(e.message); }
  lastClick = i; paint(); var el = document.querySelector('.ph[data-i="' + i + '"]'); if (el) el.focus();
}
function phraseKey(ev, i) {
  if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); phraseClick(ev, i); return; }
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); var n = document.querySelector('.ph[data-i="' + (i + (ev.key === 'ArrowDown' ? 1 : -1)) + '"]'); if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); } }
}
function spareFiller(ev, el) { ev.stopPropagation(); var v = M.active(); if (!v) return; var on = M.spare(v, { s: +el.dataset.s, e: +el.dataset.e }); flash(on ? 'Kept: the drop skips this one' : 'The drop takes this one again'); paint(); }
function restoreHole(ev, el) { ev.stopPropagation(); var v = M.active(); if (!v) return; try { M.restore(v, { s: +el.dataset.s, e: +el.dataset.e }); } catch (e) { flash(e.message); } paint(); }
function dropFillers() { var v = M.active(); if (!v) return; try { var n = M.dropFillers(v, ctx.fillerList); flash('Dropped ' + n + ' filler' + (n === 1 ? '' : 's') + ' · Undo takes it back'); } catch (e) { flash(e.message); } paint(); }
function keepEverything() { var v = M.active(); if (v && M.keepEverything(v)) flash('Everything plays again'); paint(); }
function undoCut() { var v = M.active(); if (v && M.undo(v)) flash('Undone'); paint(); }
function showAllPhrases() { ctx.showAll = true; paint(); }
function removeTake() {
  var v = M.active(); if (!v) return;
  if (!confirm('Remove “' + v.title + '” from Solo Ops?\n\nThe recording stays where it is. The words and renders stay in data/videos/' + v.id + '/.')) return;
  M.remove(v); flash('Removed from the list; the files stay'); paint();
}

/* ---- copy / agent ---- */
function copyText(text, msg) { return navigator.clipboard.writeText(text).then(function () { flash(msg || 'Copied'); return true; }).catch(function () { try { prompt('Copy this:', text); } catch (e) { /* embedded */ } return false; }); }
function copyAgent(line) { copyText(line === 'node serve.js' ? 'In my Solo Ops folder, start `node serve.js` and leave it running, then tell me the address it prints (http://localhost:' + ((Config.get('sync.port')) || 4321) + ').' : 'In my Solo Ops folder, run `' + line + '` and tell me when it is done.', 'Copied — paste it into Claude Code or Cursor'); }
function addLine() {   // the add line, from what she typed in the box (no server here)
  var p = ($('addPath') && $('addPath').value || '').trim(); var line = M.terminal(null, 'add');
  if (p) { var title = p.replace(/.*[\/\\]/, '').replace(/\.[^.]+$/, ''); line = line.replace('"Title"', JSON.stringify(title)).replace('"<path to the recording>"', JSON.stringify(p)); }
  var code = $('addLineCode'); if (code) code.textContent = line; return line;
}
function copyForAI() { var v = M.active(); if (!v) return flash('Add a take first'); copyText(M.copyText(v), 'Copied the take — paste it into your agent chat'); }
function copyLine(what) { var v = M.active(); if (!v) return; var ws = Config.activeWs() !== Config.PRIMARY ? ' --ws ' + Config.activeWs() : ''; copyText(what === 'folder' ? 'data/videos/' + v.id + '/' : 'node solo.js video show ' + v.id + ws, 'Copied'); }
function cutWithAI() { var v = M.active(); if (!v) return flash('Add a take first'); if (!v.transcript) return flash('Get the words first, then your agent can read them'); if (window.Guide && Guide.openPrompt) Guide.openPrompt('cut-take'); }

/* ---- the server: doctor, jobs, add, transcribe, render, post ---- */
function checkDoctor(force, say) {
  if (!isServer()) { ctx.doctor = null; return; }
  if (!force && ctx.doctor && Date.now() - ctx.doctor.at < 300000) return;
  api('/api/video/doctor' + (force ? '?fresh=1' : '')).then(function (d) { d.at = Date.now(); ctx.doctor = d; paint(); if (say) flash(d.ffmpeg ? 'ffmpeg found' : 'Still no ffmpeg'); }).catch(function () { ctx.doctor = null; });
}
function checkJobs(v) {   // on open: is something running for this take (a render or a transcription started earlier)?
  if (!isServer() || !v) return;
  api('/api/video/' + encodeURIComponent(v.id) + '/status').then(function (st) { ctx.job = st; if (st && ((st.render && !st.render.finished) || (st.renderJob && !st.renderJob.finished) || (st.transcribe && !st.transcribe.finished))) startPoll(v.id); paint(); }).catch(function () { /* none */ });
}
function startPoll(id) {
  stopPoll(); var t0 = Date.now(); var seenDone = false;
  var lastSt = '';
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
      if (changed) paint();   // not every tick: a re-render drops keyboard focus and anything typed
    }).catch(function () { /* keep polling */ });
  }, 1500);
}
function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
function openAdd() { ctx.addOpen = true; var b = $('addBox'); if (!b) return; b.style.display = ''; var i = $('addPath'); if (i) i.focus(); b.scrollIntoView({ block: 'nearest' }); }
function closeAdd() { ctx.addOpen = false; var b = $('addBox'); if (b && M.active()) b.style.display = 'none'; }
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
  if (!isServer()) return flash('Without the server, the line below adds it');
  var btn = document.querySelector('#addBox .btn.primary'); if (btn) { btn.disabled = true; btn.textContent = 'Reading the file…'; }
  api('/api/video/add', { path: p, ws: Config.activeWs() }).then(function (r) { flash('Added: ' + r.title + '. Next: get the words.'); $('addPath').value = ''; $('addFound').textContent = ''; closeAdd(); return Sync.pullAll(false).then(function () { if (r.id && M.get(r.id)) M.setActive(r.id); paint(); }); })
    .catch(function (e) { flash(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Add this take'; } });
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
  api('/api/video/post', { id: v.id, ws: Config.activeWs() }).then(function (r) { flash('A draft post for tomorrow 09:00 is on the schedule with the final linked'); return Sync.pullAll(false); }).then(paint).catch(function (e) { flash(e.message); });
}

/* ---- init ---- */
function init() {
  Config.applyDOM();
  Palette.init({ root: '../' });
  Palette.register([
    { label: 'Add a take', hint: 'video', keywords: 'new recording', run: openAdd },
    { label: 'Drop the fillers', hint: 'video', keywords: 'um uh', run: dropFillers },
    { label: 'Keep everything', hint: 'video', keywords: 'clear cut', run: keepEverything },
    { label: 'Undo the last cut', hint: 'video', keywords: 'revert', run: undoCut },
    { label: 'Render a preview', hint: 'video', keywords: 'export', run: function () { startRender(true); } },
    { label: 'Render the final', hint: 'video', keywords: 'export', run: function () { startRender(false); } },
    { label: 'Cut it with my AI', hint: 'guide', keywords: 'agent prompt', run: cutWithAI },
    { label: 'Copy take for AI', hint: 'export', keywords: 'clipboard words', run: copyForAI },
    { label: 'Open take', prefix: 'find', hint: 'find <title>', keywords: 'search switch', run: function (q) { var l = q.toLowerCase(); var m = M.list().filter(function (v) { return v.title.toLowerCase().indexOf(l) >= 0; }); if (m.length === 1) selectTake(m[0].id); else flash(m.length ? 'Several takes match — be more specific' : 'No take matches'); } },
    { label: 'Remove this take', hint: 'video', run: removeTake },
    { label: 'Go to script viewer', hint: 'nav', run: function () { location.href = 'script-viewer.html?ws=' + encodeURIComponent(Config.activeWs()); } }
  ]);
  ctx.server = isServer(); ctx.ready = Sync.ready();
  var v = M.active(); if (v) loadWords(v);
  paint();
  document.addEventListener('keydown', function (e) { var mod = e.metaKey || e.ctrlKey; if (mod && e.key === 'z' && !e.shiftKey && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); undoCut(); } });
}
document.addEventListener('DOMContentLoaded', init);
