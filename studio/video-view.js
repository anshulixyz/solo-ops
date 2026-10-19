/* =========================================================================
   studio/video-view.js — render only. Takes the model's state and a context
   (server or not, what ffmpeg says, running jobs) and returns HTML; handlers
   are globals in video-main.js (markup uses on*). Every user string goes
   through esc(). Global `VideoView`.
   ========================================================================= */
(function (global) {
  'use strict';
  var M = global.VideoModel;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function attr(s) { return esc(s); }
  function fmt(x) { return M.fmt(x); }
  function mac() { return typeof navigator !== 'undefined' && navigator.platform.indexOf('Mac') >= 0; }
  function cmd(line) { return '<div class="v-cmd"><code title="' + attr(line) + '">' + esc(line) + '</code><button type="button" class="btn" onclick="copyText(this.previousElementSibling.textContent, \'Copied the line\')">Copy</button></div>'; }
  // the two doors every terminal fallback shows: an agent that runs commands, or the terminal yourself
  function doors(line, chat, dyn) {   // dyn: the name of a global that builds the line at copy time (the add box reads the typed path)
    var agent = dyn ? 'copyAgent(' + dyn + '())' : 'copyAgent(' + attr(JSON.stringify(line)) + ')'; var copy = dyn ? 'copyText(' + dyn + '(), \'Copied the line\')' : 'copyText(this.previousElementSibling.textContent, \'Copied the line\')';
    return '<div class="v-doors"><div class="v-door"><b>1 · Let your agent do it</b>' + (chat ? 'ChatGPT cannot run this. Ask a coding agent (Claude Code, Cursor) opened in your Solo Ops folder, or do it yourself in Terminal.' : 'Copy a sentence and paste it into Claude Code or Cursor opened in your Solo Ops folder.') +
      '<button type="button" class="btn" onclick="' + agent + '">Copy for my agent</button></div>' +
      '<div class="v-door"><b>2 · Do it yourself, one line</b>Terminal: ' + (mac() ? '⌘-space, type Terminal' : 'Start, type Terminal') + ', <code>cd</code> into your Solo Ops folder, paste, Enter.<div class="v-cmd"><code' + (dyn ? ' id="' + dyn + 'Code"' : '') + ' title="' + attr(line) + '">' + esc(line) + '</code><button type="button" class="btn" onclick="' + copy + '">Copy</button></div></div></div>';
  }

  /* ---- the left list ---- */
  function list(takes, activeId) {
    if (!takes.length) return '<div class="muted" style="padding:14px 10px;font-size:12.5px">No takes yet. Add one: the recording stays where it is.</div>';
    return takes.map(function (v) {
      var s = M.src(v); var st = M.statusOf(v); var n = (v.edl || []).length;
      return '<button type="button" class="note-item' + (v.id === activeId ? ' active' : '') + '" data-id="' + attr(v.id) + '" onclick="selectTake(this.dataset.id)">' +
        '<span class="note-item-title">' + esc(v.title) + '</span>' +
        '<span class="note-item-preview">' + esc((v.phrases || [])[0] ? v.phrases[0].t : s.path ? s.path.replace(/.*\//, '') : '') + '</span>' +
        '<span class="note-item-meta">' + (s.duration ? esc(fmt(s.duration)) + ' · ' : '') + (v.transcript && v.transcript.words ? esc(Number(v.transcript.words)) + ' words · ' : '') + (n ? 'cut: ' + n + ' piece' + (n === 1 ? '' : 's') + ' · ' : '') + '<span class="v-chip ' + attr(st) + '">' + esc(M.statusLabel(st)) + '</span></span></button>';
    }).join('');
  }

  /* ---- cards ---- */
  function ffmpegCard(doc) {
    var line = doc && doc.install ? doc.install : (mac() ? 'brew install ffmpeg' : 'winget install Gyan.FFmpeg');
    if (!mac() && /winget install ffmpeg$/.test(line)) line = 'winget install Gyan.FFmpeg';
    return '<div class="vcard warn"><h3>Video needs ffmpeg</h3><p>A free tool that reads and writes video files. ' + (mac() ? 'Mac (needs Homebrew, <a href="https://brew.sh" target="_blank" rel="noopener">brew.sh</a>): ' : 'Windows: ') + '<code>' + esc(line) + '</code>' + (mac() ? '' : ' (that build burns captions too)') + '. Then Check again.</p>' +
      '<div class="v-row"><button type="button" class="btn" onclick="copyText(' + attr(JSON.stringify(line)) + ', \'Copied\')">Copy the line</button><button type="button" class="btn primary" onclick="checkDoctor(true, true)">Check again</button></div></div>';
  }
  function noServerCard(chat) {
    return '<div class="vcard quiet"><p><b>Clicking still saves your cut.</b> Getting the words and rendering from this page need the Solo Ops server running.</p>' + doors('node serve.js', chat) + '<p class="v-term">Then open <code>http://localhost:' + esc(String((global.Config && Config.get('sync.port')) || 4321)) + '/studio/video.html</code>. Until then, every step below shows the line that does it.</p></div>';
  }
  function empty(ctx) {
    return '<div class="v-empty"><h2>Cut your takes by their words.</h2><p class="lead">The footage stays where it is. A take is one recording, as it came off the phone or camera. Add it, get its words, click what goes, render the cut with captions.</p>' + addBox(ctx, true) + '</div>';
  }
  function addBox(ctx, open) {
    var hint = mac() ? 'Mac: in Finder, right-click the file, hold ⌥ Option, “Copy … as Pathname”, paste here.' : 'Windows: Shift + right-click the file → “Copy as path”, paste here.';
    return '<div class="vcard v-add" id="addBox"' + (open ? '' : ' style="display:none"') + '><h3>Add a take</h3>' +
      (ctx.server ? '<div class="v-drop" id="dropZone" ondragover="dropOver(event)" ondragleave="dropLeave(event)" ondrop="dropFile(event)">Drop the recording here: the page looks for it in Movies (Videos on Windows), Desktop, Downloads and Documents.</div>' : '<p class="muted" style="font-size:13px;margin:0">Start the server first (the card above) and you can drop the recording here. Or paste its path and add it from the terminal:</p>') +
      '<input type="text" id="addPath" placeholder="…or the whole path to the file, e.g. ' + (mac() ? '~/Movies/take-3.mov' : 'C:\\Users\\you\\Videos\\take-3.mp4') + '" onkeydown="if(event.key===\'Enter\')addTake()">' +
      '<div class="v-found" id="addFound"></div>' +
      '<p class="muted" style="font-size:12px;margin:6px 0 0">' + esc(hint) + ' Nothing is copied or moved.</p>' +
      (ctx.server ? '<div class="v-row"><button type="button" class="btn primary" onclick="addTake()">Add this take</button><button type="button" class="btn ghost" onclick="closeAdd()">Cancel</button></div>'
        : '<details class="v-details" style="margin-top:10px"><summary>Add it from the terminal</summary>' + doors(M.terminal(null, 'add'), ctx.chat, 'addLine') + '</details>') + '</div>';
  }

  /* ---- the open take ---- */
  function head(v, ctx) {
    var s = M.src(v); var st = M.statusOf(v); var next = M.nextStep(v); var moved = ctx.doctor && (ctx.doctor.moved || []).indexOf(v.id) >= 0;
    var btn = next.action === 'transcribe' ? '' : next.action === 'preview' ? '<button type="button" class="btn primary" onclick="startRender(true)">Render a preview</button>' : next.action === 'final' ? '<button type="button" class="btn primary" onclick="startRender(false)">Render the final</button>' : next.action === 'post' ? '<button type="button" class="btn primary" onclick="makePost()">Make the post</button>' : next.action === 'post-open' ? '<a class="btn" href="../social/social-board.html?ws=' + attr(encodeURIComponent(Config.activeWs())) + '">Open the schedule</a>' : '';
    if (!ctx.server && /^(preview|final|post)$/.test(next.action)) btn = '';
    return '<div class="v-head"><h2>' + esc(v.title) + ' <span class="v-chip ' + attr(st) + '">' + esc(M.statusLabel(st)) + '</span></h2>' +
      '<div class="v-meta">' + (s.duration ? '<span>' + esc(fmt(s.duration)) + '</span>' : '') + (s.width ? '<span>' + esc(s.width + '×' + s.height) + '</span>' : '') + (s.fps ? '<span>' + esc(s.fps + ' fps') + '</span>' : '') + (s.size ? '<span>' + esc(M.size(s.size)) + '</span>' : '') + (s.hdr ? '<span>HDR</span>' : '') + (v.transcript && v.transcript.words ? '<span>' + esc(Number(v.transcript.words)) + ' words</span>' : '') + '</div>' +
      (s.path ? '<div class="v-file" title="' + attr(s.path) + '">' + esc(s.path) + '</div>' : '') +
      (moved ? '<div class="vcard warn" style="margin:12px 0 0"><p><b>The recording is not where it was.</b> Point at it again:</p><input type="text" id="movedPath" placeholder="the whole path to the file now" onkeydown="if(event.key===\'Enter\')pointAgain()"><div class="v-row" style="margin-top:8px"><button type="button" class="btn primary" onclick="pointAgain()">Use this file</button></div></div>' : '') +
      (next.text ? '<div class="v-next"><span>' + esc(next.text) + '</span>' + btn + '</div>' : '') + '</div>';
  }
  function engineCard(v, ctx) {
    var s = M.src(v); var doc = ctx.doctor || {}; var est = (s.duration || 0) / 3600 * 0.40; var price = est < 0.005 ? 'less than $0.01' : 'about $' + est.toFixed(2);
    if (ctx.job && ctx.job.transcribe && !ctx.job.transcribe.finished) {
      var dl = doc.model === false && doc.whisper ? ' First time: downloading the model once (490 MB), a few minutes.' : '';
      return '<div class="vcard"><h3>Getting the words…</h3><p>' + esc(ctx.job.transcribe.engine === 'elevenlabs' ? 'The audio is with ElevenLabs; the words come back in a minute.' : 'On this computer, about a minute for a 10-minute take.' + dl) + ' You can leave this page; it carries on.</p><div class="v-bar"><i style="width:40%;animation:vpulse 1.2s infinite alternate"></i></div></div>';
    }
    var failed = ctx.job && ctx.job.transcribe && ctx.job.transcribe.finished && ctx.job.transcribe.code !== 0 && v.status === 'recorded';
    if (s.hasAudio === false) return '<div class="vcard"><h3>No audio track</h3><p>Nothing to transcribe. You can still trim it from the terminal:</p>' + cmd('node solo.js video cut ' + v.id + ' --keep "0-' + fmt(s.duration) + '"') + '</div>';
    var chat = ctx.chat;
    var one = '<div class="v-choice"><span class="n">1</span><div class="body"><b>On this computer</b>Free · nothing leaves your ' + (mac() ? 'Mac' : 'computer') + ' · about a minute per 10 minutes.' + (doc.whisper === false ? ' <span class="muted">Needs one install first' + (mac() ? ' (needs Homebrew, brew.sh):' : ': whisper-cli from the whisper.cpp releases, then tell Solo Ops where it is:') + '</span>' + cmd(mac() ? 'brew install whisper-cpp' : 'node solo.js config set video.whisper "C:\\…\\whisper-cli.exe"') : doc.model === false ? ' <span class="muted">First time: downloads a 490 MB model once.</span>' : '') + '</div>' +
      (ctx.server ? '<button type="button" class="btn primary" onclick="transcribe(\'whisper\')"' + (doc.whisper === false ? ' disabled title="Install whisper.cpp first"' : '') + '>Get the words here</button>' : '') + '</div>';
    var two = '<div class="v-choice"><span class="n">2</span><div class="body"><b>ElevenLabs</b>The audio is sent to them, the video stays here · ' + esc(price) + ' for this take · the words come back and are kept only in <code>' + esc('data/videos/' + v.id + '/') + '</code>.' + (doc.elevenlabsKey === false ? ' <span class="muted">Needs a key first: get one at elevenlabs.io (Profile → API keys), then paste this in Terminal and add the key at the end. It stays in data/secrets.json, never in the backup.</span>' + cmd('node solo.js video key set elevenlabs') : '') + '</div>' +
      (ctx.server ? '<button type="button" class="btn" onclick="transcribe(\'elevenlabs\')"' + (doc.elevenlabsKey === false ? ' disabled title="Add the key first"' : '') + '>Send the audio</button>' : '') + '</div>';
    var three = '<div class="v-choice"><span class="n">3</span><div class="body"><b>I already have a transcript</b>An SRT, VTT or JSON from YouTube, Descript or another tool (Descript: File → Export → Subtitles). Cuts then land on whole captions, not words, and fillers cannot be dropped; for word-level, pick 1.</div>' +
      (ctx.server ? '<button type="button" class="btn" onclick="document.getElementById(\'importFile\').click()">Choose the file</button>' : '') + '</div>';
    return '<div class="vcard"><h3>Which way do you want the words?</h3>' + (failed ? '<div class="vcard warn" style="margin:8px 0"><p><b>It did not finish.</b> ' + esc(ctx.job.transcribe.tail || 'No reason was given.') + '</p></div>' : '') +
      '<div class="v-choices">' + one + two + three + '</div>' +
      (ctx.server ? '' : '<div class="v-term">Pick one and run its line (the card at the top says how):' + cmd(M.terminal(v, 'whisper')) + cmd(M.terminal(v, 'elevenlabs')) + cmd(M.terminal(v, 'import')) + '</div>') + '</div>';
  }
  function strip(v, ctx) {
    var n = (v.edl || []).length; var rt = M.runtime(v); var total = M.dur(v); var fl = ctx.fillers || { hits: 0 };
    var where = ctx.words ? 'cuts land between words' : 'cuts land between sentences' + (ctx.server ? '' : ' (word-level needs the server)');
    var fillerBtn = M.cueLevel(v) ? '<span class="muted" title="These words came from captions (whole lines), so single fillers cannot be dropped. Get the words on this computer for that.">fillers: not with captions</span>'
      : !ctx.words ? '<span class="muted" title="Dropping fillers needs the words with their times; start node serve.js for that.">fillers: needs the server</span>'
      : fl.hits ? '<button type="button" class="btn primary" onclick="dropFillers()" title="' + attr(M.fillerList(ctx.fillerList).join(', ')) + ' — whisper hears most fillers, not all. Listen to the preview. Click a highlighted one to keep it.">Drop ' + fl.hits + ' filler' + (fl.hits === 1 ? '' : 's') + '</button>'
      : '<span class="muted" title="' + attr(M.fillerList(ctx.fillerList).join(', ')) + '">no fillers</span>';
    return '<div class="v-strip"><span class="rt">' + (n ? '<b>' + esc(fmt(rt)) + '</b> of ' + esc(fmt(total)) + ' · ' + n + ' piece' + (n === 1 ? '' : 's') : '<b>' + esc(fmt(total)) + '</b> · nothing cut yet') + '</span><span class="sp"></span>' +
      (n ? '<button type="button" class="btn ghost" onclick="keepEverything()">Keep everything</button>' : '') + '<button type="button" class="btn ghost" onclick="undoCut()"' + (ctx.undo ? '' : ' disabled') + '>Undo</button>' + fillerBtn + '</div>' +
      '<div class="v-legend">' + esc(where.charAt(0).toUpperCase() + where.slice(1)) + ' · click a sentence to cut it, click again to keep it · <kbd>Shift</kbd>-click for a run · <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Space</kbd> work too · every change is saved and logged; Undo takes it back.</div>';
  }
  // one sentence: its words, with the dropped ones struck and the fillers marked
  function phrase(v, i, kept, ctx) {
    var p = v.phrases[i]; var html;
    var words = ctx.words ? M.wordsFor(v).filter(function (w) { return w.s >= p.s - 0.001 && w.e <= p.e + 0.001; }) : null;
    var holes = kept ? M.holes(v, i) : []; var fl = (ctx.fillers && ctx.fillers.holes) || [];
    function inSpan(w, h) { return w.s >= h.s - 0.011 && w.e <= h.e + 0.011; }
    if (words && words.length) {
      html = words.map(function (w) {
        var hole = holes.filter(function (h) { return inSpan(w, h); })[0]; if (hole) return '<s class="hole" data-s="' + hole.s + '" data-e="' + hole.e + '" title="Cut. Click to put it back" onclick="restoreHole(event,this)">' + esc(w.w) + '</s>';
        var f = kept ? fl.filter(function (h) { return inSpan(w, h); })[0] : null; if (f) { var sp = M.isSpared(v.id, f); return '<mark class="filler' + (sp ? ' spared' : '') + '" data-s="' + f.s + '" data-e="' + f.e + '" title="' + (sp ? 'Kept on purpose. Click to let the drop take it' : 'A filler. Drop the fillers takes it; click to keep it') + '" onclick="spareFiller(event,this)">' + esc(w.w) + '</mark>'; }
        return esc(w.w);
      }).join(' ');
    } else html = esc(p.t) + (holes.length ? ' <span class="muted">(part cut)</span>' : '');
    return '<div class="ph ' + (kept ? 'kept' : 'cut') + '" data-i="' + i + '" tabindex="0" role="button" aria-pressed="' + (kept ? 'false' : 'true') + '" title="' + (kept ? 'Click to cut' : 'Click to keep') + '" onclick="phraseClick(event,' + i + ')" onkeydown="phraseKey(event,' + i + ')"><span class="t">' + esc(fmt(p.s) + ' – ' + fmt(p.e)) + '</span><span class="x">' + html + '</span><span class="st">' + (kept ? '' : 'cut') + '</span></div>';
  }
  function phrases(v, ctx) {
    var flags = M.keptFlags(v); var lim = ctx.showAll ? v.phrases.length : Math.min(v.phrases.length, 200);
    var out = '<div class="v-phrases">'; for (var i = 0; i < lim; i++) out += phrase(v, i, flags[i], ctx); out += '</div>';
    if (lim < v.phrases.length) out += '<div class="v-more"><button type="button" class="btn" onclick="showAllPhrases()">Show ' + (v.phrases.length - lim) + ' more sentences</button></div>';
    return out;
  }
  function exportsSection(v, ctx) {
    var n = (v.edl || []).length; var pre = M.latestExport(v, 'preview'), fin = M.latestExport(v, 'final'); var job = ctx.job || {}; var running = (job.render && !job.render.finished) || (job.renderJob && !job.renderJob.finished);
    var pr = job.render; var out = '<div class="v-exports"><h3>Renders</h3>';
    if (!ctx.server) out += '<p class="muted" style="font-size:13px;margin:0 0 8px">Start the server (the card at the top) and the buttons appear here. From the terminal:</p>' + cmd(M.terminal(v, 'preview')) + cmd(M.terminal(v, 'final'));
    else if (running) {
      var pct = pr && pr.total ? Math.round(Math.min(1, (pr.done || 0) / pr.total) * 100) : 0; var left = ctx.left;
      out += '<div class="v-progress"><b>' + (pr ? 'Rendering piece ' + esc(Number(pr.piece) || 1) + ' of ' + esc(Number(pr.pieces) || n) + ' · ' + esc(fmt(Number(pr.done) || 0)) + ' of ' + esc(fmt(Number(pr.total) || 0)) : 'Starting the render…') + '</b>' + (left ? ' · about ' + esc(left) + ' left' : '') + '<div class="v-bar"><i style="width:' + pct + '%"></i></div><p class="muted" style="font-size:12px;margin:6px 0 0">One render at a time. You can leave this page; it carries on.</p></div>';
    } else {
      var finalDone = fin && fin.edlHash === v.edlHash; var finalOk = !finalDone && pre && pre.edlHash === v.edlHash;   // after the final of this cut, nothing to render is primary any more
      out += '<div class="v-row"><button type="button" class="btn' + (finalOk || finalDone ? '' : ' primary') + '" onclick="startRender(true)"' + (n ? '' : ' disabled title="Nothing to render yet: cut something first, or render as it is from the terminal"') + '>Render a preview (720p, fast)</button>' +
        '<button type="button" class="btn' + (finalOk ? ' primary' : '') + '" onclick="startRender(false)"' + (!n ? ' disabled' : finalOk || finalDone ? '' : ' title="Watch the preview first"') + '>Render the final (full quality)</button>' +
        '<label class="muted" style="font-size:12px;margin-left:6px"><input type="checkbox" id="aspect916" onchange="rememberAspect(this)"' + (ctx.aspect === '9:16' ? ' checked' : '') + '> 9:16 for Instagram / TikTok</label></div>';
      if (job.renderJob && job.renderJob.finished && job.renderJob.code !== 0 && ctx.showRenderError) out += '<div class="vcard warn" style="margin:10px 0 0"><p><b>The render did not finish.</b> ' + esc(job.renderJob.tail || 'No reason was given.') + '</p></div>';
    }
    var latest = fin && (!pre || (fin.at || 0) >= (pre.at || 0)) ? fin : pre;
    if (latest && ctx.server) {
      var stale = latest.edlHash !== v.edlHash; var name = latest.file.replace(/.*\//, '');
      out += '<div class="v-player"><video controls preload="metadata" src="/api/video/' + attr(v.id) + '/' + attr(name) + '"></video><div class="cap">' + (stale ? '<b>This ' + esc(latest.kind) + ' is from an older cut.</b> Render again to see the current one. ' : latest.kind === 'preview' ? '<b>Check the opening, each join, and the captions.</b> Happy? Render the final. ' : '<b>The final.</b> Captions ride along as a track and a .srt next to it. ') + '</div></div>';
    }
    (v.exports || []).slice().reverse().slice(0, 6).forEach(function (e) {
      var nm = e.file.replace(/.*\//, ''); var stale = e.edlHash !== v.edlHash;
      out += '<div class="v-export"><span>' + esc(e.kind === 'final' ? 'Final' : 'Preview') + ' · ' + esc(fmt(e.duration || 0)) + (e.size ? ' · ' + esc(M.size(e.size)) : '') + (e.aspect ? ' · ' + esc(e.aspect) : '') + '</span><span class="path" title="' + attr(e.file) + '">' + esc(e.file) + '</span>' + (stale ? '<span class="stale">from an older cut</span>' : '') +
        '<button type="button" class="btn small" onclick="copyText(' + attr(JSON.stringify(e.file)) + ', \'Copied the path (inside your Solo Ops folder)\')">Copy path</button>' + (ctx.server && e.srt ? '<a class="btn small" href="/api/video/' + attr(v.id) + '/' + attr(nm.replace(/\.mp4$/, '.srt')) + '" target="_blank" rel="noopener">.srt</a>' : '') + '</div>';
    });
    if (fin && !v.postId && ctx.server) out += '<div class="v-row" style="margin-top:12px"><button type="button" class="btn primary" onclick="makePost()">Make the post</button><span class="muted" style="font-size:12.5px">A draft on the schedule (tomorrow 09:00, move it there) with the final linked, never copied. “Post this video” in the Guide writes two captions in your voice.</span></div>';
    return out + '</div>';
  }
  function main(v, ctx) {
    var out = '';
    if (ctx.server && ctx.doctor && ctx.doctor.ffmpeg === false) out += ffmpegCard(ctx.doctor);
    if (!ctx.server && ctx.ready) out += noServerCard(ctx.chat);
    if (!v) return out + empty(ctx);
    out += addBox(ctx, !!ctx.addOpen) + head(v, ctx);
    if (!v.transcript || !(v.phrases || []).length) return out + engineCard(v, ctx);
    out += strip(v, ctx) + phrases(v, ctx) + exportsSection(v, ctx);
    return out;
  }
  global.VideoView = { esc: esc, list: list, main: main, doors: doors, cmd: cmd };
})(window);
