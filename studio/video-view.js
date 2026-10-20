/* =========================================================================
   studio/video-view.js — render only. Takes the model's state and a context
   (server or not, what ffmpeg says, running jobs, the selection) and returns
   HTML; handlers are globals in video-main.js (markup uses on*). Every user
   string goes through esc(). Global `VideoView`.

   The editing model, one rule: a click selects (a word, a pause, a sentence
   by its time tag); the action is the button or the Delete key: "Cut 3
   words" when they play, "Put back 3 words" when they are cut. Nothing
   happens on a click alone.
   ========================================================================= */
(function (global) {
  'use strict';
  var M = global.VideoModel;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function attr(s) { return esc(s); }
  function fmt(x) { return M.fmt(x); }
  function mac() { return typeof navigator !== 'undefined' && navigator.platform.indexOf('Mac') >= 0; }
  function cmd(line, id) { return '<div class="v-cmd"><code' + (id ? ' id="' + attr(id) + '"' : '') + ' title="' + attr(line) + '">' + esc(line) + '</code><button type="button" class="btn small" onclick="copyText(this.previousElementSibling.textContent, \'Copied the line\')">Copy</button></div>'; }
  // every step the page cannot do itself: the agent first, the terminal line under "Do it yourself". sentence: what to tell the agent; dyn: a global that builds the line at copy time
  function doors(line, chat, sentence, dyn) {
    var agent = sentence ? 'copyText(' + attr(JSON.stringify(sentence)) + ', \'Copied — paste it into Claude Code or Cursor\')' : dyn ? 'copyAgent(' + dyn + '())' : 'copyAgent(' + attr(JSON.stringify(line)) + ')';
    return '<div class="v-doors"><div class="v-door main"><b>Let your agent do it</b><span>' + (chat ? 'A chat-only agent (ChatGPT) cannot run things on your computer. Open your Solo Ops folder in Claude Code or Cursor and paste this there.' : 'Paste this into Claude Code or Cursor opened in your Solo Ops folder.') + '</span>' +
      '<button type="button" class="btn primary" onclick="' + agent + '">Copy for my agent</button></div>' +
      '<details class="v-details"><summary>Do it yourself</summary><div class="v-door"><span>Terminal: ' + (mac() ? '⌘-space, type Terminal' : 'Start, type Terminal') + ', <code>cd</code> into your Solo Ops folder, paste, Enter.</span>' + cmd(line, dyn ? dyn + 'Code' : '') + '</div></details></div>';
  }
  var SETUP_SENTENCE = 'Open my Solo Ops folder and run the "Set up video on this computer" prompt (/setup-video): ffmpeg, the words on this computer, the recordings folder, my recorder. Tell me when node solo.js doctor is happy.';

  /* ---- the left list ---- */
  function list(takes, activeId) {
    if (!takes.length) return '<div class="muted" style="padding:14px 10px;font-size:12.5px">No takes yet. Record one, or add a recording: the file stays where it is.</div>';
    return takes.map(function (v) {
      var s = M.src(v); var st = M.statusOf(v); var n = (v.edl || []).length;
      return '<button type="button" class="note-item' + (v.id === activeId ? ' active' : '') + '" data-id="' + attr(v.id) + '" onclick="selectTake(this.dataset.id)">' +
        '<span class="note-item-title">' + esc(v.title) + '</span>' +
        '<span class="note-item-preview">' + esc((v.phrases || [])[0] ? v.phrases[0].t : s.path ? s.path.replace(/.*\//, '') : '') + '</span>' +
        '<span class="note-item-meta">' + (s.duration ? esc(fmt(s.duration)) + ' · ' : '') + (v.transcript && v.transcript.words ? esc(Number(v.transcript.words)) + ' words · ' : '') + (n ? 'cut · ' : '') + '<span class="v-chip ' + attr(st) + '">' + esc(M.statusLabel(st)) + '</span></span></button>';
    }).join('');
  }

  /* ---- cards ---- */
  function ffmpegCard(doc) {
    var line = mac() ? 'brew install ffmpeg' : 'winget install Gyan.FFmpeg';
    return '<div class="vcard warn"><h3>Video needs ffmpeg</h3><p>A free tool that reads and writes video files. Your agent can install it (and everything else Video needs) in one go.</p>' +
      doors(line, false, SETUP_SENTENCE) + '<p class="v-term">' + (mac() ? 'Mac: needs Homebrew (brew.sh). ' : 'Windows: that build burns captions too. ') + 'Then <button type="button" class="guide-link" onclick="checkDoctor(true, true)">Check again</button>.</p></div>';
  }
  function noServerCard(chat) {
    return '<div class="vcard quiet"><p><b>Your cuts save without it.</b> Getting the words, rendering and the recordings folder need the Solo Ops server running.</p>' + doors('node serve.js', chat, 'In my Solo Ops folder, start `node serve.js` and leave it running, then tell me the address it prints.') + '<p class="v-term">Then open <code>http://localhost:' + esc(String((global.Config && Config.get('sync.port')) || 4321)) + '/studio/video.html</code>.</p></div>';
  }
  function empty(ctx) {
    return '<div class="v-empty"><h2>Cut your takes by their words.</h2><p class="lead">The footage stays where it is. A take is one recording, as it came off the phone or camera. Add it, get its words, select what goes, render the cut with captions.</p>' + recordCard(ctx) + addBox(ctx, true) + '</div>';
  }
  function recordCard(ctx) {
    var r = ctx.recordings || {}; var folder = r.folder || '~/Movies/Solo Ops takes'; var waiting = (r.waiting || []).length; var short = r.home ? folder.replace(r.home, '~') : folder;
    var body = ctx.server
      ? '<p>Record with any app (Recordly, QuickTime, your phone). Save the file into this folder and it shows up here:</p><div class="v-cmd"><code title="' + attr(folder) + '">' + esc(short) + '</code><button type="button" class="btn small" onclick="openRecordings()">Open the folder</button><button type="button" class="btn small" onclick="copyText(' + attr(JSON.stringify(folder)) + ', \'Copied the folder path\')">Copy the path</button></div>' +
        (waiting ? '<p class="v-found">' + waiting + ' recording' + (waiting === 1 ? '' : 's') + ' already there. <button type="button" class="guide-link" onclick="addWaiting()">Add ' + (waiting === 1 ? 'it' : 'them all') + '</button></p>' : '') +
        '<p class="muted" style="font-size:12.5px">From your phone: AirDrop it, then drag it from Downloads into this folder, or drop it on this page below.</p>'
      : '<p>Record with any app (Recordly, QuickTime, your phone) and save the file into <code>' + esc(short) + '</code>. Start the server (the card above) and new files there show up here on their own; until then, drop the file on the page below.</p>';
    return '<div class="vcard" id="recordCard"><h3>Record a take</h3>' + body + '<div class="v-row" style="margin-top:8px"><button type="button" class="btn" onclick="copyText(' + attr(JSON.stringify(SETUP_SENTENCE)) + ', \'Copied — paste it into Claude Code or Cursor\')">Set up recording with my agent</button><span class="muted" style="font-size:12px">Installs Recordly (free, Mac) or sets up QuickTime, plus ffmpeg and the words engine, and creates the folder.</span></div></div>';
  }
  function addBox(ctx, open) {
    var hint = mac() ? 'Mac: in Finder, right-click the file, hold ⌥ Option, “Copy … as Pathname”, paste here.' : 'Windows: Shift + right-click the file → “Copy as path”, paste here.';
    return '<div class="vcard v-add" id="addBox"' + (open ? '' : ' style="display:none"') + '><h3>Add a recording</h3>' +
      (ctx.server ? '<div class="v-drop" id="dropZone" ondragover="dropOver(event)" ondragleave="dropLeave(event)" ondrop="dropFile(event)">Drop the recording here: the page looks for it in Movies (Videos on Windows), Desktop, Downloads and Documents.</div>' : '<p class="muted" style="font-size:13px;margin:0">Start the server first (the card above) and you can drop the recording here. Or paste its path and add it with your agent:</p>') +
      '<input type="text" id="addPath" autocomplete="off" placeholder="…or the whole path to the file, e.g. ' + (mac() ? '~/Movies/take-3.mov' : 'C:\\Users\\you\\Videos\\take-3.mp4') + '" onkeydown="if(event.key===\'Enter\')addTake()">' +
      '<div class="v-found" id="addFound"></div>' +
      '<p class="muted" style="font-size:12px;margin:6px 0 0">' + esc(hint) + ' Nothing is copied or moved.</p>' +
      (ctx.server ? '<div class="v-row"><button type="button" class="btn primary" onclick="addTake()">Add this recording</button><button type="button" class="btn ghost" onclick="closeAdd()">Cancel</button></div>'
        : '<div style="margin-top:10px">' + doors(M.terminal(null, 'add'), ctx.chat, '', 'addLine') + '</div>') + '</div>';
  }

  /* ---- the open take ---- */
  function head(v, ctx) {
    var s = M.src(v); var st = M.statusOf(v); var next = M.nextStep(v); var moved = ctx.doctor && (ctx.doctor.moved || []).indexOf(v.id) >= 0;
    var btn = next.action === 'preview' ? '<button type="button" class="btn primary" onclick="startRender(true)">Render a preview</button>' : next.action === 'final' ? '<button type="button" class="btn primary" onclick="startRender(false)">Render the final</button>' : next.action === 'post' ? '<button type="button" class="btn primary" onclick="makePost()">Make the post</button>' : next.action === 'post-open' ? '<a class="btn" href="../social/social-board.html?ws=' + attr(encodeURIComponent(Config.activeWs())) + '">Open the schedule</a>' : '';
    if (!ctx.server && /^(preview|final|post)$/.test(next.action)) btn = '';
    var title = ctx.renaming ? '<input type="text" id="titleInput" class="v-title-input" value="' + attr(v.title) + '" maxlength="120" autocomplete="off" onkeydown="titleKey(event)" onblur="saveTitle()">' : '<span class="v-title" title="Click to rename" onclick="startRename()">' + esc(v.title) + '</span>';
    return '<div class="v-head"><h2>' + title + ' <span class="v-chip ' + attr(st) + '">' + esc(M.statusLabel(st)) + '</span></h2>' +
      '<div class="v-meta">' + (s.duration ? '<span>' + esc(fmt(s.duration)) + '</span>' : '') + (s.width ? '<span>' + esc(s.width + '×' + s.height) + '</span>' : '') + (s.fps ? '<span>' + esc(s.fps + ' fps') + '</span>' : '') + (s.size ? '<span>' + esc(M.size(s.size)) + '</span>' : '') + (s.hdr ? '<span>HDR</span>' : '') + (v.transcript && v.transcript.words ? '<span>' + esc(Number(v.transcript.words)) + ' words</span>' : '') + '</div>' +
      (s.path ? '<div class="v-file" title="' + attr(s.path) + '">' + esc(s.path) + '</div>' : '') +
      (moved ? '<div class="vcard warn" style="margin:12px 0 0"><p><b>The recording is not where it was.</b> Point at it again:</p><input type="text" id="movedPath" autocomplete="off" placeholder="the whole path to the file now" onkeydown="if(event.key===\'Enter\')pointAgain()"><div class="v-row" style="margin-top:8px"><button type="button" class="btn primary" onclick="pointAgain()">Use this file</button></div></div>' : '') +
      (next.text ? '<div class="v-next"><span>' + esc(next.text) + '</span>' + btn + '</div>' : '') + '</div>';
  }
  function keyField() {
    return '<div class="v-key"><label for="elevenKey">ElevenLabs API key</label><div class="v-row"><input type="password" id="elevenKey" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="paste it here" onkeydown="if(event.key===\'Enter\')saveKey()"><button type="button" class="btn" onclick="saveKey()">Save the key</button></div>' +
      '<p class="muted" style="font-size:12px;margin:6px 0 0">Kept on this computer only, in data/secrets.json. Never in the backup, never shown again, never sent anywhere but ElevenLabs.</p></div>';
  }
  var ELEVEN_SENTENCE = 'Help me sign up to ElevenLabs (elevenlabs.io, it has a free tier) and get an API key: Profile → API keys → Create. Walk me through it, then tell me to paste the key into the key field on my Video page in Solo Ops. Never ask me to paste the key in this chat.';
  function engineCard(v, ctx) {
    var s = M.src(v); var doc = ctx.doctor || {}; var est = (s.duration || 0) / 3600 * 0.40; var price = est < 0.005 ? 'less than $0.01' : 'about $' + est.toFixed(2);
    if (ctx.job && ctx.job.transcribe && !ctx.job.transcribe.finished) {
      var dl = doc.model === false && doc.whisper ? ' First time: downloading the model once (490 MB), a few minutes.' : '';
      return '<div class="vcard"><h3>Getting the words…</h3><p>' + esc(ctx.job.transcribe.engine === 'elevenlabs' ? 'The audio is with ElevenLabs; the words come back in a minute.' : 'On this computer, about a minute for a 10-minute take.' + dl) + ' You can leave this page; it carries on.</p><div class="v-bar"><i style="width:40%"></i></div></div>';
    }
    var failed = ctx.job && ctx.job.transcribe && ctx.job.transcribe.finished && ctx.job.transcribe.code !== 0 && v.status === 'recorded';
    if (s.hasAudio === false) return '<div class="vcard"><h3>No audio track</h3><p>Nothing to transcribe. You can still trim it from the terminal:</p>' + cmd('node solo.js video cut ' + v.id + ' --keep "0-' + fmt(s.duration) + '"') + '</div>';
    var one = '<div class="v-choice"><span class="n">1</span><div class="body"><b>On this computer</b>Free · nothing leaves your ' + (mac() ? 'Mac' : 'computer') + ' · about a minute per 10 minutes.' +
      (doc.whisper === false ? ' <span class="muted">Needs one install first.</span><div class="v-row" style="margin-top:6px"><button type="button" class="btn small" onclick="copyText(' + attr(JSON.stringify(SETUP_SENTENCE)) + ', \'Copied — paste it into Claude Code or Cursor\')">Ask my agent to install it</button></div>' : doc.model === false ? ' <span class="muted">First time: downloads a 490 MB model once.</span>' : '') + '</div>' +
      (ctx.server ? '<button type="button" class="btn primary" onclick="transcribe(\'whisper\')"' + (doc.whisper === false ? ' disabled title="Install whisper.cpp first"' : '') + '>Get the words here</button>' : '') + '</div>';
    var two = '<div class="v-choice"><span class="n">2</span><div class="body"><b>ElevenLabs</b>The audio is sent to them, the video stays here · ' + esc(price) + ' for this take · the words come back and are kept only in <code>' + esc('data/videos/' + v.id + '/') + '</code>.' +
      (ctx.server && doc.elevenlabsKey === false ? '<p class="muted" style="margin:6px 0 4px">Needs your key first.</p>' + keyField() + '<div class="v-row" style="margin-top:8px"><button type="button" class="btn small" onclick="copyText(' + attr(JSON.stringify(ELEVEN_SENTENCE)) + ', \'Copied — paste it into Claude Code or Cursor\')">Ask my agent to set it up</button></div>' : ctx.server && doc.elevenlabsKey ? ' <span class="muted">Key saved · <button type="button" class="guide-link" onclick="replaceKey()">Replace</button></span>' + (ctx.showKey ? keyField() : '') : '') + '</div>' +
      (ctx.server ? '<button type="button" class="btn" onclick="transcribe(\'elevenlabs\')"' + (doc.elevenlabsKey === false ? ' disabled title="Save the key first"' : '') + '>Send the audio</button>' : '') + '</div>';
    var three = '<div class="v-choice"><span class="n">3</span><div class="body"><b>I already have a transcript</b>An SRT, VTT or JSON from YouTube, Descript or another tool (Descript: File → Export → Subtitles). Cuts then land on whole captions, not words, and fillers cannot be removed; to cut single words, pick 1.</div>' +
      (ctx.server ? '<button type="button" class="btn" onclick="document.getElementById(\'importFile\').click()">Choose the file</button>' : '') + '</div>';
    return '<div class="vcard"><h3>Which way do you want the words?</h3>' + (failed ? '<div class="vcard warn" style="margin:8px 0"><p><b>It did not finish.</b> ' + esc(ctx.job.transcribe.tail || 'No reason was given.') + '</p></div>' : '') +
      '<div class="v-choices">' + one + two + three + '</div>' +
      (ctx.server ? '' : '<div class="v-term">Without the server, pick one and run its line (the card at the top says how):' + cmd(M.terminal(v, 'whisper')) + cmd(M.terminal(v, 'elevenlabs')) + cmd(M.terminal(v, 'import')) + '</div>') + '</div>';
  }
  function strip(v, ctx) {
    var n = (v.edl || []).length; var rt = M.runtime(v); var total = M.dur(v); var tc = ctx.tidy || { fillers: 0, pauses: 0 };
    var parts = [tc.fillers ? tc.fillers + ' filler' + (tc.fillers === 1 ? '' : 's') : '', tc.pauses ? tc.pauses + ' pause' + (tc.pauses === 1 ? '' : 's') : ''].filter(Boolean);
    var removeBtn = !ctx.words ? '<button type="button" class="btn" disabled title="Needs the words with their times: start node serve.js for that.">Remove fillers and pauses</button>'
      : parts.length ? '<button type="button" class="btn" onclick="removeNoise()" title="um, uh, you know, I mean… and pauses longer than ' + esc(String(M.pauseMin())) + ' s. Highlighted words are what goes. Undo takes it back.">Remove ' + esc(parts.join(' and ')) + '</button>'
      : '<button type="button" class="btn" disabled title="No fillers and no long pauses left in what plays.">Remove fillers and pauses</button>';
    var sel = ctx.selection || null;
    var act = sel && sel.count ? '<span class="v-act"><button type="button" class="btn primary" onclick="actOnSelection()">' + (sel.cut ? 'Put back ' : 'Cut ') + esc(sel.label) + '</button><span class="muted">or press Delete</span></span>' : '';
    return '<div class="v-strip"><span class="rt">' + (n ? '<b>' + esc(fmt(rt)) + '</b> of ' + esc(fmt(total)) : '<b>' + esc(fmt(total)) + '</b>') + '</span>' + act + '<span class="sp"></span>' +
      removeBtn + '<button type="button" class="btn ghost" onclick="undoCut()"' + (ctx.undo ? '' : ' disabled') + ' title="⌘Z">Undo</button><button type="button" class="btn ghost" onclick="redoCut()"' + (ctx.redo ? '' : ' disabled') + ' title="⇧⌘Z">Redo</button>' +
      (n ? '<button type="button" class="btn ghost" onclick="keepEverything()" title="Everything plays again; Undo brings the cut back.">Start over</button>' : '') + '</div>' +
      '<div class="v-legend">' + (ctx.words ? 'Select words and press Delete (or Cut) to take them out · select a crossed-out word to put it back · double-click selects the sentence · Esc clears · highlighted words are what Remove fillers takes.' : 'Select a sentence and press Delete (or Cut) to take it out · select a crossed-out sentence to put it back · Esc clears' + (ctx.server ? '' : ' · word by word needs the server') + '.') + '</div>';
  }
  // the transcript as tokens: words (and long pauses as pills), each selectable; cut ones struck. ctx.tokens is built in DOM order for the selection
  function phrases(v, ctx) {
    var tokens = []; var out = '<div class="v-phrases" id="phrases">';
    var W = ctx.words ? M.wordsFor(v) : null; var tc = ctx.tidy || { pauseHoles: [], fillerHoles: [], allPauses: [] }; var sel = ctx.selection; var selOn = {}; if (sel) for (var k = sel.a; k <= sel.b; k++) selOn[k] = 1;
    var kindOf = { pause: 'pause', sentence: 'sentence' };
    function tok(cls, s, e, text, title, cutOverride, ph) { var i = tokens.length; var cut = cutOverride != null ? cutOverride : !M.playing(v, s, e); tokens.push({ i: i, s: s, e: e, cut: cut, kind: kindOf[cls] || 'word', ph: ph }); return '<span class="w ' + cls + (cut ? ' cut' : '') + (selOn[i] ? ' sel' : '') + '" data-i="' + i + '"' + (title ? ' title="' + attr(title) + '"' : '') + ' onmousedown="tokDown(event,' + i + ')" onmouseenter="tokEnter(event,' + i + ')" ondblclick="selectSentenceOf(' + i + ')">' + esc(text) + '</span>'; }
    // a long pause (open or already shortened) between two words becomes a pill after the word it follows: its length, crossed out once shortened
    function pill(a, b, ph) { if (!a || !b) return ''; var h = (tc.allPauses || []).filter(function (x) { return Math.abs(x.gs - a.e) < 0.06 && Math.abs(x.ge - b.s) < 0.06; })[0]; if (!h) return ''; return ' ' + tok('pause', h.s, h.e, (h.ge - h.gs).toFixed(1) + ' s', h.open ? 'A pause. Remove fillers and pauses shortens it; or select it and press Delete.' : 'A pause, shortened to a beat. Select it and press Delete to bring it back.', !h.open, ph); }
    var lim = ctx.showAll ? v.phrases.length : Math.min(v.phrases.length, 200);
    var byPhrase = W && W.length ? v.phrases.map(function (p) { return W.filter(function (w) { return w.s >= p.s - 0.001 && w.e <= p.e + 0.001; }); }) : null;
    for (var i = 0; i < lim; i++) {
      var p = v.phrases[i]; var html; var first = tokens.length;
      if (byPhrase) {
        var words = byPhrase[i]; var nextFirst = byPhrase[i + 1] ? byPhrase[i + 1][0] : null;
        html = words.map(function (w, j) {
          var f = (tc.fillerHoles || []).some(function (h) { return w.s >= h.s - 0.011 && w.e <= h.e + 0.011; });
          return tok(f ? 'filler' : '', w.s, w.e, w.w, f ? 'A filler: Remove fillers takes it' : '', null, i) + (j < words.length - 1 ? pill(w, words[j + 1], i) : '');
        }).join(' ') + (words.length ? pill(words[words.length - 1], nextFirst, i) : '');
        if (!words.length) html = tok('', p.s, p.e, p.t, '', null, i);
      } else html = tok('sentence', p.s, p.e, p.t, '', null, i);
      out += '<div class="ph" data-i="' + i + '"><button type="button" class="t" title="Select this sentence" onclick="selectRange(' + first + ',' + (tokens.length - 1) + ')">' + esc(fmt(p.s)) + '</button><span class="x">' + html + '</span></div>';
    }
    out += '</div>';
    if (lim < v.phrases.length) out += '<div class="v-more"><button type="button" class="btn" onclick="showAllPhrases()">Show ' + (v.phrases.length - lim) + ' more sentences</button></div>';
    ctx.tokens = tokens;
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
      var finalDone = fin && fin.edlHash === v.edlHash; var finalOk = !finalDone && pre && pre.edlHash === v.edlHash;
      var selOn2 = !!(ctx.selection && ctx.selection.count);   // while something is selected, its Cut / Put back is the one primary on the screen
      out += '<div class="v-row"><button type="button" class="btn' + (finalOk || finalDone || selOn2 ? '' : ' primary') + '" onclick="startRender(true)"' + (n ? '' : ' disabled title="Nothing to render yet: cut something first, or render as it is from the terminal"') + '>Render a preview (720p, fast)</button>' +
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
    out += (ctx.addOpen ? recordCard(ctx) : '') + addBox(ctx, !!ctx.addOpen) + head(v, ctx);
    if (!v.transcript || !(v.phrases || []).length) return out + engineCard(v, ctx);
    out += strip(v, ctx) + phrases(v, ctx) + exportsSection(v, ctx);
    return out;
  }
  global.VideoView = { esc: esc, list: list, main: main, doors: doors, cmd: cmd, SETUP_SENTENCE: SETUP_SENTENCE };
})(window);
