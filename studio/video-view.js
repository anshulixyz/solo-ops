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
    var sugg = window.Story && Story.suggestionsHtml ? Story.suggestionsHtml('take') : '';
    if (!takes.length) return sugg + '<div class="muted" style="padding:14px 10px;font-size:12.5px">No takes yet. Record one, or add a recording: the file stays where it is.</div>';
    return sugg + takes.map(function (v) {
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
  // the page is open but the server is not answering: a saved copy of the page in the browser (http, the server at this address stopped), or a file:// / folder-linked page. The address and the start line follow where the page actually is.
  function noServerCard(chat) {
    var http = typeof location !== 'undefined' && /^http/.test(location.protocol); var port = http && location.port ? location.port : String((global.Config && Config.get('sync.port')) || 4321);
    var line = 'node serve.js' + (port !== '4321' ? ' --port ' + port : ''); var here = http ? location.origin + location.pathname : 'http://localhost:' + port + '/studio/video.html';
    var why = http ? '<p><b>The Solo Ops server at ' + esc(location.host) + ' is not running right now</b>, so this is a saved copy of the page: your cuts still save in this browser, but getting the words, rendering and the recordings folder wait until it is back.</p>'
      : '<p><b>Your cuts save without it.</b> Getting the words, rendering and the recordings folder need the Solo Ops server running.</p>';
    return '<div class="vcard quiet">' + why + doors(line, chat, 'In my Solo Ops folder, start `' + line + '` and leave it running, then tell me when ' + here + ' answers.') + '<p class="v-term">Then ' + (http ? 'reload this page' : 'open <code>' + esc(here) + '</code>') + '.</p></div>';
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
    var forScript = ''; if (ctx.pendingTask && window.Story) { var sd = Story.load(); var tk = sd.task.filter(function (x) { return x.id === ctx.pendingTask; })[0]; forScript = '<p class="muted v-for" style="margin:-4px 0 8px">For ' + esc(tk ? Story.describe('task', tk) : 'the task you came from') + ' · <button type="button" class="guide-link" onclick="forgetTask()">not this one</button></p>'; }   // came from a card's or a suggestion's "Add the take"
    return '<div class="vcard v-add" id="addBox"' + (open ? '' : ' style="display:none"') + '><h3>Add a recording</h3>' + forScript +
      '<div class="v-drop" id="dropZone" ondragover="dropOver(event)" ondragleave="dropLeave(event)" ondrop="dropFile(event)">' + (ctx.server ? 'Drop the recording anywhere on this page (or paste it): the page finds it in Movies (Videos on Windows), Desktop, Downloads and Documents.' : 'Drop the recording here once the server is running (the card above): the page then finds it by its name. A browser never tells a page where a file lives, so without the server only the name arrives.') + '</div>' +
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
    var story = '';   // the task line lives in the toolbar (#storySlot), like the other views
    return '<div class="v-head"><h2>' + title + ' <span class="v-chip ' + attr(st) + '">' + esc(M.statusLabel(st)) + '</span></h2>' + story +
      '<div class="v-meta">' + (s.duration ? '<span>' + esc(fmt(s.duration)) + '</span>' : '') + (s.width ? '<span>' + esc(s.width + '×' + s.height) + '</span>' : '') + (s.fps ? '<span>' + esc(s.fps + ' fps') + '</span>' : '') + (s.size ? '<span>' + esc(M.size(s.size)) + '</span>' : '') + (s.hdr ? '<span>HDR</span>' : '') + (v.transcript && v.transcript.words ? '<span>' + esc(Number(v.transcript.words)) + ' words</span>' : '') + '</div>' +
      (s.path ? '<div class="v-file" title="' + attr(s.path) + '">' + esc(s.path) + '</div>' : '') +
      (moved ? '<div class="vcard warn" style="margin:12px 0 0"><p><b>The recording is not where it was.</b> Point at it again:</p><input type="text" id="movedPath" autocomplete="off" placeholder="the whole path to the file now" onkeydown="if(event.key===\'Enter\')pointAgain()"><div class="v-row" style="margin-top:8px"><button type="button" class="btn primary" onclick="pointAgain()">Use this file</button></div></div>' : '') +
      (next.text ? '<div class="v-next"><span>' + esc(next.text) + '</span>' + btn + '</div>' : '') + '</div>';
  }
  function keyCard(ctx) {   // More → ElevenLabs key…: replace or add the key from any take
    var doc = ctx.doctor || {};
    return '<div class="vcard" id="keyCard"><h3>ElevenLabs key</h3><p>' + (doc.elevenlabsKey ? 'A key is saved on this computer. Pasting a new one replaces it; it is never shown again.' : 'No key saved yet. Three steps: a free account at elevenlabs.io · Profile → API keys → Create · paste the key here once.') + '</p>' +
      (ctx.server ? keyField() : '<p class="muted">Needs <code>node serve.js</code> running; or in the terminal: <code>node solo.js video key set elevenlabs --stdin</code> (it asks for the key, nothing is echoed).</p>') +
      '<div class="v-row" style="margin-top:8px"><button type="button" class="btn ghost" onclick="closeKeyCard()">Close</button></div></div>';
  }
  function keyField() {
    return '<div class="v-key"><label for="elevenKey">ElevenLabs API key</label><div class="v-row"><input type="password" id="elevenKey" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="paste it here" onkeydown="if(event.key===\'Enter\')saveKey()"><button type="button" class="btn" onclick="saveKey()">Save the key</button></div>' +
      '<p class="muted" style="font-size:12px;margin:6px 0 0">Kept on this computer only, in data/secrets.json. Never in the backup, never shown again, never sent anywhere but ElevenLabs.</p></div>';
  }
  var ELEVEN_SENTENCE = 'Help me set up ElevenLabs for the words of my videos: sign up at elevenlabs.io (free tier), then Profile → API keys → Create. Walk me through it step by step, then tell me to paste the key into the key field on my Video page in Solo Ops (More → ElevenLabs key…). Never ask me to paste the key in this chat.';
  function engineCard(v, ctx) {
    var s = M.src(v); var doc = ctx.doctor || {}; var est = (s.duration || 0) / 3600 * 0.40; var price = est < 0.005 ? 'less than $0.01' : 'about $' + est.toFixed(2);
    if (ctx.job && ctx.job.transcribe && !ctx.job.transcribe.finished) {
      var dl = doc.model === false && doc.whisper ? ' First time: downloading the model once (490 MB), a few minutes.' : '';
      return '<div class="vcard"><h3>Getting the words…</h3><p>' + esc(ctx.job.transcribe.engine === 'elevenlabs' ? 'The audio is with ElevenLabs' + (ctx.job.transcribe.est ? ' (' + ctx.job.transcribe.est + ')' : '') + '; the words come back in a minute.' : 'On this computer, about a minute for a 10-minute take.' + dl) + ' You can leave this page; it carries on.</p><div class="v-bar"><i style="width:40%"></i></div>' + (ctx.job.transcribe.auto ? '<p class="muted" style="font-size:12.5px;margin:8px 0 0">Started by itself, as you asked. <button type="button" class="guide-link" onclick="setEngine(\'\')">Ask me each time instead</button></p>' : '') + '</div>';
    }
    var failed = ctx.job && ctx.job.transcribe && ctx.job.transcribe.finished && ctx.job.transcribe.code !== 0 && v.status === 'recorded';
    if (s.hasAudio === false) return '<div class="vcard"><h3>No audio track</h3><p>Nothing to transcribe. You can still trim it from the terminal:</p>' + cmd('node solo.js video cut ' + v.id + ' --keep "0-' + fmt(s.duration) + '"') + '</div>';
    var one = '<div class="v-choice"><span class="n">2</span><div class="body"><b>On this computer</b>Free · nothing leaves your ' + (mac() ? 'Mac' : 'computer') + ' · about a minute per 10 minutes. It uses Whisper, OpenAI\'s open speech-to-text model, running here: the first time it downloads the model once (490 MB, the English "small" one), after that it works offline.' +
      (doc.whisper === false ? ' <span class="muted">Needs one install first.</span><div class="v-row" style="margin-top:6px"><button type="button" class="btn small" onclick="copyText(' + attr(JSON.stringify(SETUP_SENTENCE)) + ', \'Copied — paste it into Claude Code or Cursor\')">Ask my agent to install it</button></div>' : doc.model === false ? ' <span class="muted">Not downloaded yet: it happens on the first run.</span>' : '') +
      (ctx.server && doc.whisper === true ? '<label class="v-always"><input type="checkbox" onchange="setEngine(this.checked ? \'whisper\' : \'\')"' + (ctx.engine === 'whisper' ? ' checked' : '') + '> Get the words this way for every new take, without asking</label>' : '') + '</div>' +
      (ctx.server ? '<button type="button" class="btn primary" onclick="transcribe(\'whisper\')"' + (doc.whisper === false ? ' disabled title="Install whisper.cpp first"' : '') + '>Get the words here</button>' : '') + '</div>';
    var two = '<div class="v-choice"><span class="n">1</span><div class="body"><b>ElevenLabs</b>The most accurate words, in about a minute · ' + esc(price) + ' for this take (a free account covers a few hours a month) · only the audio is sent, the video stays here · the words come back and are kept only in <code>' + esc('data/videos/' + v.id + '/') + '</code>.' +
      (ctx.server && doc.elevenlabsKey === false ? '<ol class="v-steps"><li>Create a free account at <a href="https://elevenlabs.io" target="_blank" rel="noopener">elevenlabs.io</a>.</li><li>In your profile, open <strong>API keys</strong> and press <strong>Create</strong>; copy the key it shows.</li><li>Paste it here once. It stays on this computer.</li></ol>' + keyField() + '<div class="v-row" style="margin-top:8px"><button type="button" class="btn small" onclick="copyText(' + attr(JSON.stringify(ELEVEN_SENTENCE)) + ', \'Copied — paste it into Claude Code or Cursor\')">Ask my agent to set it up</button></div>' : ctx.server && doc.elevenlabsKey ? ' <span class="muted">Key saved · <button type="button" class="guide-link" onclick="replaceKey()">Replace</button></span>' + (ctx.showKey ? keyField() : '') : '') +
      (ctx.server && doc.elevenlabsKey ? '<label class="v-always"><input type="checkbox" onchange="setEngine(this.checked ? \'elevenlabs\' : \'\')"' + (ctx.engine === 'elevenlabs' ? ' checked' : '') + '> Send every new take to ElevenLabs without asking · about $0.40 per hour of audio from your ElevenLabs credits · a take over ' + esc(String(M.autoMaxMin())) + ' minutes waits for you · untick to stop</label>' : '') + '</div>' +
      (ctx.server ? '<button type="button" class="btn" onclick="transcribe(\'elevenlabs\')"' + (doc.elevenlabsKey === false ? ' disabled title="Save the key first"' : '') + '>Send the audio</button>' : '') + '</div>';
    var three = '<div class="v-choice"><span class="n">3</span><div class="body"><b>I already have a transcript</b>An SRT, VTT or JSON from YouTube, Descript or another tool (Descript: File → Export → Subtitles). Cuts then land on whole captions, not words, and fillers cannot be removed; to cut single words, pick 1 or 2.</div>' +
      (ctx.server ? '<button type="button" class="btn" onclick="document.getElementById(\'importFile\').click()">Choose the file</button>' : '') + '</div>';
    return '<div class="vcard"><h3>Which way do you want the words?</h3>' + (failed ? '<div class="vcard warn" style="margin:8px 0"><p><b>It did not finish.</b> ' + esc(ctx.job.transcribe.tail || 'No reason was given.') + '</p></div>' : '') +
      '<div class="v-choices">' + two + one + three + '</div>' +
      (ctx.server ? '' : '<div class="v-term">Without the server, pick one and run its line (the card at the top says how):' + cmd(M.terminal(v, 'elevenlabs')) + cmd(M.terminal(v, 'whisper')) + cmd(M.terminal(v, 'import')) + '</div>') + '</div>';
  }
  function strip(v, ctx) {
    var n = (v.edl || []).length; var rt = M.runtime(v); var total = M.dur(v); var tc = ctx.tidy || { fillers: 0, pauses: 0, retakes: 0, allRetakes: [] };
    var parts = [tc.fillers ? tc.fillers + ' filler' + (tc.fillers === 1 ? '' : 's') : '', tc.pauses ? tc.pauses + ' pause' + (tc.pauses === 1 ? '' : 's') : ''].filter(Boolean);
    var removeBtn = !ctx.words ? '<button type="button" class="btn" disabled title="' + (ctx.server ? 'Needs the words with their times: get the words first.' : 'Needs the words with their times: start node serve.js for that.') + '">Remove fillers and pauses</button>'
      : parts.length ? '<button type="button" class="btn" onclick="removeNoise()" title="um, uh, you know, I mean… and pauses longer than ' + esc(String(M.pauseMin())) + ' s. Highlighted words are what goes. Undo takes it back.">Remove ' + esc(parts.join(' and ')) + '</button>'
      : '<button type="button" class="btn" disabled title="No fillers and no long pauses left in what plays.">Remove fillers and pauses</button>';
    var twice = (tc.allRetakes || []).length;
    var review = ctx.words && (parts.length || twice) ? '<button type="button" class="guide-link" onclick="toggleReview()">' + (ctx.reviewOpen ? 'Close the list' : 'Review first' + (twice ? ' · ' + twice + ' said twice' : '')) + '</button>' : '';
    if (ctx.reviewOpen) removeBtn = '';   // the list's own button is the action while it is open
    var sel = ctx.selection || null;
    var act = sel && sel.count ? '<span class="v-act"><button type="button" class="btn primary" onclick="actOnSelection()">' + (sel.cut ? 'Put back ' : 'Cut ') + esc(sel.label) + '</button>' + (sel.keepable ? '<button type="button" class="btn ghost" onclick="keepOnly()" title="Everything before and after goes. Undo brings it back (K)">Keep only this</button>' : '') + (sel.correctable ? '<button type="button" class="btn ghost" onclick="startCorrect()" title="Retype what was said (C). The audio and the cut do not change; Undo in the toast takes it back.">Correct</button>' : '') + '<span class="muted">or press Delete</span></span>' : '';
    var keys = 'Space plays and pauses · ←/→ step a second, or move the selection · Delete cuts, Enter puts back, K keeps only the selection · C corrects · ⌘Z / ⇧⌘Z · Esc clears';
    var selRow = act || '<span class="muted v-hint">' + (ctx.words ? 'Select words: Delete takes them out, K keeps only them, C corrects · a crossed-out word: select it to put it back' : 'Select a sentence: Delete takes it out · a crossed-out sentence: select it to put it back' + (ctx.server ? '' : ' · word by word needs the server')) + '</span>';
    return '<div class="v-strip"><span class="rt" title="' + attr(keys) + '">' + (n ? '<b>' + esc(fmt(rt)) + '</b> of ' + esc(fmt(total)) : '<b>' + esc(fmt(total)) + '</b>') + '</span><span class="sp"></span>' +
      removeBtn + review + '<button type="button" class="btn ghost" onclick="undoCut()"' + (ctx.undo ? '' : ' disabled') + ' title="⌘Z">Undo</button><button type="button" class="btn ghost" onclick="redoCut()"' + (ctx.redo ? '' : ' disabled') + ' title="⇧⌘Z">Redo</button>' +
      (n ? '<button type="button" class="btn ghost" onclick="keepEverything()" title="Everything plays again; Undo brings the cut back.">Start over</button>' : '') +
      '<div class="v-selrow">' + selRow + '</div></div>' +   // the second row is always there, so a selection never pushes the words down
      (ctx.reviewOpen ? '' : '<div class="v-legend">' + (ctx.words ? 'Click a word to go there, Space plays · double-click selects the sentence · there is no bar to drag: you trim by selecting words, and the grey pause chips count as words.' : 'Click a sentence to go there, Space plays.') + '</div>');
  }
  // the list before Remove: every filler, pause and "said twice" as one row with a checkbox; collapsed groups with counts; capped height
  function review(v, ctx) {
    var tc = ctx.tidy; if (!ctx.reviewOpen || !tc) return '';
    var W = M.wordsFor(v); var ticked = ctx.reviewTicked || {};
    function around(s, e) { var i = -1; W.forEach(function (w, k) { if (i < 0 && w.s >= s - 0.011) i = k; }); if (i < 0) return ''; var j = i; while (j < W.length && W[j].e <= e + 0.011) j++; var pre = W.slice(Math.max(0, i - 3), i).map(function (w) { return w.w; }).join(' '); var mid = W.slice(i, j).map(function (w) { return w.w; }).join(' '); var post = W.slice(j, j + 3).map(function (w) { return w.w; }).join(' '); return '<span class="muted">…' + esc(pre) + '</span> <b>' + esc(mid) + '</b> <span class="muted">' + esc(post) + '…</span>'; }
    function row(key, s, html) { var on = ticked[key] !== false && !(key.indexOf('r:') === 0 && ticked[key] !== true); return '<label class="v-rrow"><input type="checkbox" data-key="' + attr(key) + '"' + (on ? ' checked' : '') + ' onchange="reviewTick(this)"><button type="button" class="t" onclick="playFrom(' + s + ')" title="Play from here">' + esc(fmt(s)) + '</button><span>' + html + '</span></label>'; }
    var fills = (tc.fillerHoles || []).map(function (h) { return row(h.key, h.s, around(h.s, h.e)); });
    var pauses = (tc.pauseHoles || []).map(function (h) { return row(h.key, h.gs, around(Math.max(0, h.gs - 0.01), h.gs) + ' <span class="w pause" style="cursor:default">' + esc((h.ge - h.gs).toFixed(1) + ' s') + '</span>'); });
    var twice = (tc.allRetakes || []).map(function (r) { return row('r:' + r.s.toFixed(2), r.s, '“' + esc(r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text) + '” <span class="muted">· said again at ' + esc(fmt(r.again.s)) + '</span>'); });
    var fcount = {}; (tc.fillerHoles || []).forEach(function (h) { var t = W.filter(function (w) { return w.s >= h.s - 0.011 && w.e <= h.e + 0.011; }).map(function (w) { return w.w.toLowerCase().replace(/[^a-z']/g, ''); }).join(' '); fcount[t] = (fcount[t] || 0) + 1; });
    function group(title, rows, open, sub) { if (!rows.length) return ''; return '<details class="v-rgroup"' + (open ? ' open' : '') + '><summary><b>' + esc(title) + ' (' + rows.length + ')</b>' + (sub ? ' <span class="muted">· ' + esc(sub) + '</span>' : '') + '</summary>' + rows.join('') + '</details>'; }
    var c = ctx.reviewCount || { fillers: 0, pauses: 0, retakes: 0 }; var lab = [c.fillers ? c.fillers + ' filler' + (c.fillers === 1 ? '' : 's') : '', c.pauses ? c.pauses + ' pause' + (c.pauses === 1 ? '' : 's') : '', c.retakes ? c.retakes + ' said twice' : ''].filter(Boolean);
    return '<div class="v-review"><div class="v-rbody">' +
      group('Fillers', fills, fills.length <= 12, Object.keys(fcount).map(function (k) { return k + ' ×' + fcount[k]; }).join(', ')) + group('Pauses', pauses, pauses.length <= 12, 'longer than ' + M.pauseMin() + ' s') + group('Said twice', twice, true, 'the later one stays; tick a row to take the first try out') +
      '</div><div class="v-rfoot"><label class="muted">A pause counts from <input type="number" step="0.1" min="0.2" max="5" value="' + attr(String(M.pauseMin())) + '" onchange="setPauseMin(this.value)"> s (for every take)</label><span class="sp"></span><button type="button" class="btn primary" onclick="removeTicked()"' + (lab.length ? '' : ' disabled') + '>' + (lab.length ? 'Remove ' + esc(lab.join(' and ')) : 'Nothing ticked') + '</button><button type="button" class="btn ghost" onclick="toggleReview()">Close</button></div></div>';
  }
  // beside and under the player: what plays, the time, Watch / Back to the take, Hide
  function playerSide(v, ctx) {
    var p = ctx.player || {}; var srcLabel = p.src === 'take' ? 'The take, with your cuts skipped' : 'Watching ' + esc(p.label || 'a render');
    return '<div class="v-pwhat">' + srcLabel + '</div><div class="v-ptime"><span class="v-tm"><b id="ptime">' + esc(fmt(p.time || 0)) + '</b> <span class="muted">of ' + esc(fmt(p.src === 'take' ? M.dur(v) : (p.duration || 0))) + '</span></span></div>' +
      '<div class="v-row">' + (p.src !== 'take' ? '<button type="button" class="btn small" onclick="watchTake()">Back to the take</button>' : '') + '<label class="v-ck" title="The captions, as the final will carry them"><input type="checkbox" onchange="toggleCaptions()"' + (ctx.captions ? ' checked' : '') + '> Captions</label><button type="button" class="btn small ghost" onclick="togglePlayerSize()">' + (ctx.playerBig ? 'Smaller' : 'Bigger') + '</button><button type="button" class="btn small ghost" onclick="togglePlayer()">' + (ctx.playerHidden ? 'Show the video' : 'Hide the video') + '</button></div>';
  }
  function playerCap(v, ctx) {
    var p = ctx.player || {};
    if (p.cannotPlay) { var pj = ctx.job && ctx.job.proxy; var making = pj && !pj.finished; return '<div class="v-pcap warn">This browser cannot play this recording as it is. ' + (making ? 'Making a copy that plays here… a few minutes; you can keep editing.' : ctx.server ? '<button type="button" class="btn small" onclick="makeProxy()">Make a copy that plays here (720p, a few minutes)</button> or render a preview and the cut plays here.' : 'Render a preview and the cut plays here.') + '</div>'; }
    if (ctx.playerHidden || ctx.reviewOpen) return '';
    if (p.src === 'take') return '<div class="v-pcap muted">Cuts sound a little rough here; the render is clean.</div>';
    return '<div class="v-pcap">' + (p.stale ? '<b>This ' + esc(p.kind || 'render') + ' is from an older cut.</b> Render again to see the current one.' : p.kind === 'preview' ? '<b>Check the opening, each join, and the captions.</b> Happy? Render the final.' : '<b>The final.</b> Captions ride along as a track and a .srt next to it.') + '</div>';
  }
  function playerPlaceholder(v, ctx) {   // where the player will be, so nobody wonders whether a video ever shows here
    return '<div class="v-pbar muted">' + (ctx.server ? 'The video plays here, with your cuts skipped, once the take has its words.' : 'The video plays here once <code>node serve.js</code> runs (the card at the top).') + '</div>';
  }
  function playerBar(v, ctx) {   // the collapsed player: one line
    var p = ctx.player || {}; return '<div class="v-pbar"><button type="button" class="btn small" onclick="togglePlay()">' + (p.playing ? '❚❚' : '▶') + '</button><b id="ptime">' + esc(fmt(p.time || 0)) + '</b><span class="muted v-pnow" id="pnow">' + esc(p.nowText || (p.src === 'take' ? v.title : p.label) || '') + '</span><span class="sp"></span>' + (ctx.reviewOpen ? '<span class="muted">The video is back when the list closes</span>' : '<button type="button" class="btn small ghost" onclick="togglePlayer()">Show the video</button>') + '</div>';
  }
  // the transcript as tokens: words (and long pauses as pills), each selectable; cut ones struck. ctx.tokens is built in DOM order for the selection
  function phrases(v, ctx) {
    var tokens = []; var out = '<div class="v-phrases" id="phrases">';
    var W = ctx.words ? M.wordsFor(v) : null; var tc = ctx.tidy || { pauseHoles: [], fillerHoles: [], allPauses: [] }; var sel = ctx.selection; var selOn = {}; if (sel) for (var k = sel.a; k <= sel.b; k++) selOn[k] = 1;
    var kindOf = { pause: 'pause', sentence: 'sentence' };
    var RT = (tc.allRetakes || []); var corr = ctx.correcting;
    function tok(cls, s, e, text, title, cutOverride, ph, wi) {
      var i = tokens.length; var cut = cutOverride != null ? cutOverride : !M.playing(v, s, e); var twice = cls === '' && RT.some(function (r) { return s >= r.s - 0.011 && e <= r.e + 0.011; });
      tokens.push({ i: i, s: s, e: e, cut: cut, kind: kindOf[cls] || 'word', ph: ph, wi: wi });
      if (corr && wi != null && wi >= corr.from && wi <= corr.to) return wi === corr.from ? '<span class="v-correct" onmousedown="event.stopPropagation()"><input type="text" id="correctInput" value="' + attr(corr.text) + '" autocomplete="off" spellcheck="false" onkeydown="correctKey(event)">' + (corr.others ? '<label><input type="checkbox" id="correctAll"> also the ' + corr.others + ' other' + (corr.others === 1 ? '' : 's') + '</label>' : '') + '<button type="button" class="btn small primary" onclick="saveCorrect()">Save</button><button type="button" class="btn small ghost" onclick="cancelCorrect()">Cancel</button></span>' : '';
      return '<span class="w ' + cls + (cut ? ' cut' : '') + (selOn[i] ? ' sel' : '') + (twice ? ' twice' : '') + '" data-i="' + i + '"' + (title ? ' title="' + attr(title) + '"' : twice ? ' title="Said twice. The later one stays; Review first → Said twice takes this one out."' : '') + ' onmousedown="tokDown(event,' + i + ')" onmouseenter="tokEnter(event,' + i + ')" onmouseup="tokUp(event,' + i + ')" ondblclick="tokDouble(event,' + i + ')">' + esc(text) + '</span>';
    }
    // a long pause (open or already shortened) between two words becomes a pill after the word it follows: its length, crossed out once shortened
    function pill(a, b, ph) { if (!a || !b) return ''; var h = (tc.allPauses || []).filter(function (x) { return Math.abs(x.gs - a.e) < 0.06 && Math.abs(x.ge - b.s) < 0.06; })[0]; if (!h) return ''; return ' ' + tok('pause', h.s, h.e, (h.ge - h.gs).toFixed(1) + ' s', h.open ? 'A pause. Remove fillers and pauses shortens it; or select it and press Delete.' : 'A pause, shortened to a beat. Select it and press Delete to bring it back.', !h.open, ph); }
    var lim = ctx.showAll ? v.phrases.length : Math.min(v.phrases.length, 200);
    var byPhrase = W && W.length ? v.phrases.map(function (p) { return W.filter(function (w) { return w.s >= p.s - 0.001 && w.e <= p.e + 0.001; }); }) : null;
    for (var i = 0; i < lim; i++) {
      var p = v.phrases[i]; var html; var first = tokens.length;
      if (byPhrase) {
        var words = byPhrase[i]; var nextFirst = byPhrase[i + 1] ? byPhrase[i + 1][0] : null;
        html = words.map(function (w, j) {
          var f = (tc.fillerHoles || []).some(function (h) { return w.s >= h.s - 0.011 && w.e <= h.e + 0.011; }) && !(ctx.reviewTicked && ctx.reviewTicked[(tc.fillerHoles.filter(function (h) { return w.s >= h.s - 0.011 && w.e <= h.e + 0.011; })[0] || {}).key] === false);
          return tok(f ? 'filler' : '', w.s, w.e, w.w, f ? 'A filler: Remove fillers takes it' : '', null, i, W.indexOf(w)) + (j < words.length - 1 ? pill(w, words[j + 1], i) : '');
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
      var next = M.nextStep(v); var finalDone = fin && fin.edlHash === v.edlHash;   // the one render button is the next step under the title; here only what that does not offer, as quiet links
      var again = []; var previewFresh = pre && pre.edlHash === v.edlHash;
      if (n && next.action !== 'preview') again.push('<button type="button" class="guide-link" onclick="startRender(true)">Render a preview' + (pre ? ' again' : '') + '</button>');
      if (n && next.action !== 'final' && !finalDone && previewFresh) again.push('<button type="button" class="guide-link" onclick="startRender(false)" title="Full quality">Render the final</button>');
      if (n && finalDone) again.push('<button type="button" class="guide-link" onclick="startRender(false)">Render the final again</button>');
      out += '<div class="v-row" style="gap:12px"><span class="muted" style="font-size:12.5px">' + (n ? (next.action === 'preview' || next.action === 'final' ? 'Next: ' + esc(next.label || (next.action === 'preview' ? 'Render a preview' : 'Render the final')) + ' — the button under the title.' : '') : 'Nothing to render yet: cut something first.') + '</span>' + again.join('') +
        '<label class="muted" style="font-size:12px;margin-left:auto"><input type="checkbox" id="aspect916" onchange="rememberAspect(this)"' + (ctx.aspect === '9:16' ? ' checked' : '') + '> 9:16 for Instagram / TikTok</label></div>';
      if (job.renderJob && job.renderJob.finished && job.renderJob.code !== 0 && ctx.showRenderError) out += '<div class="vcard warn" style="margin:10px 0 0"><p><b>The render did not finish.</b> ' + esc(job.renderJob.tail || 'No reason was given.') + '</p></div>';
    }
    (v.exports || []).slice().reverse().slice(0, 6).forEach(function (e) {
      var nm = e.file.replace(/.*\//, ''); var stale = e.edlHash !== v.edlHash;
      out += '<div class="v-export"><span>' + esc(e.kind === 'final' ? 'Final' : 'Preview') + ' · ' + esc(fmt(e.duration || 0)) + (e.size ? ' · ' + esc(M.size(e.size)) : '') + (e.aspect ? ' · ' + esc(e.aspect) : '') + '</span><span class="path" title="' + attr(e.file) + '">' + esc(e.file) + '</span>' + (stale ? '<span class="stale">from an older cut</span>' : '') +
        (ctx.server ? '<button type="button" class="btn small" onclick="watchRender(' + attr(JSON.stringify(nm)) + ')">Watch</button>' : '') + '<button type="button" class="btn small" onclick="copyText(' + attr(JSON.stringify(e.file)) + ', \'Copied the path (inside your Solo Ops folder)\')">Copy path</button>' + (ctx.server && e.srt ? '<a class="btn small" href="/api/video/' + attr(v.id) + '/' + attr(nm.replace(/\.mp4$/, '.srt')) + '" target="_blank" rel="noopener">.srt</a>' : '') + '</div>';
    });
    if (fin && fin.edlHash === v.edlHash && !v.postId && ctx.server) out += '<p class="muted" style="font-size:12.5px;margin:12px 0 0">The final is ready: <b>Make the post</b> under the title puts it on the schedule (tomorrow 09:00) with the final linked, never copied. “Post this video” in the Guide writes two captions in your voice.</p>';   // the one button is under the title; a final from an older cut is never offered
    return out + '</div>';
  }
  function main(v, ctx) {
    var out = '';
    if (ctx.server && ctx.oldServer) out += '<div class="vcard warn"><h3>The server that is running is older than this page</h3><p>It was started before Video existed, so its buttons answer "not found". In the terminal where <code>node serve.js</code> runs, press Ctrl-C and run it again; then reload this page.</p></div>';
    if (ctx.keyCard) out += keyCard(ctx);
    if (ctx.server && ctx.doctor && ctx.doctor.ffmpeg === false) out += ffmpegCard(ctx.doctor);
    if (!ctx.server && ctx.ready) out += noServerCard(ctx.chat);
    if (!v) return out + empty(ctx);
    out += (ctx.addOpen ? recordCard(ctx) : '') + addBox(ctx, !!ctx.addOpen) + head(v, ctx);
    if (!v.transcript || !(v.phrases || []).length) return out + engineCard(v, ctx);
    if (ctx.wordsGone && ctx.wordsGone[v.id]) return out + '<div class="vcard warn"><p><b>The words file is gone</b> (<code>' + esc('data/videos/' + v.id + '/transcript.json') + '</code>), so only the sentences are left. Get the words again:</p></div>' + engineCard(v, ctx);
    out += phrases(v, ctx) + exportsSection(v, ctx);
    return out;
  }
  global.VideoView = { esc: esc, list: list, main: main, strip: strip, review: review, playerSide: playerSide, playerCap: playerCap, playerBar: playerBar, playerPlaceholder: playerPlaceholder, doors: doors, cmd: cmd, SETUP_SENTENCE: SETUP_SENTENCE };
})(window);
