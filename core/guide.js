/* =========================================================================
   core/guide.js — the Guide panel: how to run Solo Ops with your AI agent.
   • Agent mode: "runs commands" (Claude Code, Cursor, Claude Desktop with
     the folder) or "chat only" (ChatGPT, Claude.ai). Chat mode packs a
     snapshot of your data into every prompt and asks for commands back.
   • Paste the reply → Apply (core/apply.js) updates boards, posts, scripts,
     notes and inspiration right here. No terminal needed.
   • Prompts grouped by routine; the current page's come first; blanks
     become a small form before copying.
   Opens from the left-edge handle, the nav button, or the ? key.
   ========================================================================= */
(function (global) {
  'use strict';
  var panel = null; var MODE_KEY = 'marathon.guide.mode'; var SEEN_KEY = 'marathon.guide.seen';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mode() { return Store.get(MODE_KEY) === 'files' ? 'files' : (Store.get(MODE_KEY) === 'chat' ? 'chat' : ''); }
  function root() { var n = document.querySelector('[data-nav]'); return (n && n.getAttribute('data-root')) || './'; }
  function page() {
    var h = location.pathname.replace(/.*\//, '');
    return { 'index.html': 'home', '': 'home', 'marathon-board.html': 'board', 'social-board.html': 'social', 'social-calendar.html': 'social', 'script-viewer.html': 'scripts', 'writing-viewer.html': 'writing', 'inspiration.html': 'inspo' }[h] || 'home';
  }
  var ABOUT = {
    home: ['The helicopter view: activity across every project, each workspace with its numbers, what is in play, your inbox and the change log.', 'Switch the open project with the Workspace menu in the nav. "Open project" and everything below it belongs to that one.'],
    board: ['One board = one kanban: To Do → Doing → Done, a Later parking lot and a Bucket List for ideas. Cards carry checklists, priority, project, tags and private notes.', 'n adds a task · 1 / 2 / 3 switch views · ⌘K runs "add Fix the hero @launch #copy !high".'],
    social: ['A posting arc: each post has a date, copy, type, prep checklist, images and video status. Mark it posted to log engagement. Status: draft → ready → scheduled → posted.'],
    scripts: ['Short-form scripts with a light structure: # Title, ## Hook, ## Script (numbered beats), ## Inserts, ## Prep. Reader shows spoken lines only; 9:16 previews the phone; Teleprompter scrolls at your pace.'],
    writing: ['Drafts with track changes you and your agent both read: ~~cut~~, ++add++, [[note for the AI]]. Copy for AI sends the markup; Copy clean sends the final text.'],
    inspo: ['Everything worth keeping lands here. Tag with a project, then Use as task / post / script / draft, or tick a few and Brainstorm with AI. The capture strip on every page saves here.']
  };
  var GO = { board: ['runway/marathon-board.html', 'the board'], social: ['social/social-board.html', 'the schedule'], scripts: ['studio/script-viewer.html', 'the Script Viewer'], writing: ['studio/writing-viewer.html', 'the Writing Viewer'], inspo: ['inspo/inspiration.html', 'Inspiration'], home: ['index.html', 'Home'] };

  /* ---- snapshot of the open workspace (chat mode pastes this) ---------- */
  function snapshot() {
    var w = Config.ws(); var L = ['WORKSPACE: ' + w.title + ' (' + w.id + ')'];
    Config.boards(w.id).forEach(function (b) {
      var tasks = Store.getJSON(Config.boardKey(b.id, w.id), []) || [];
      L.push('', 'BOARD "' + b.title + '" (--board ' + b.id + ')');
      ['doing', 'todo', 'later', 'bucket', 'done'].forEach(function (col) {
        var g = tasks.filter(function (t) { return t.col === col; }); if (!g.length) return;
        L.push('  ' + col + ':');
        g.slice(0, col === 'done' ? 5 : 40).forEach(function (t) { var n = (t.checklist || []).length, d = (t.checklist || []).filter(function (c) { return c.done; }).length; L.push('  - [' + t.id + '] ' + t.title + ' · ' + t.pri + (t.tags.length ? ' · #' + t.tags.join(' #') : '') + (n ? ' · ' + d + '/' + n + ' steps' : '')); });
      });
    });
    if (w.apps.social) { var posts = (Store.getJSON(Config.key('social', w.id), []) || []).slice().sort(function (a, b) { return a.datetime.localeCompare(b.datetime); }); if (posts.length) { L.push('', 'POSTS'); posts.slice(0, 30).forEach(function (p) { var n = (p.prep || []).length, d = (p.prep || []).filter(function (c) { return c.done; }).length; L.push('  - [' + p.id + '] ' + p.datetime.replace('T', ' ') + ' · ' + p.title + ' · ' + p.status + (p.copy ? '' : ' · NO COPY YET') + (n ? ' · prep ' + d + '/' + n : '')); }); } }
    if (w.apps.scripts) { var sc = (Store.getJSON(Config.key('scripts', w.id), { scripts: [] }) || {}).scripts || []; if (sc.length) L.push('', 'SCRIPTS: ' + sc.map(function (s) { return '[' + s.id + '] ' + s.title; }).join(' · ')); }
    if (w.apps.writing) { var nt = (Store.getJSON(Config.key('writing', w.id), { notes: [] }) || {}).notes || []; if (nt.length) L.push('', 'NOTES: ' + nt.map(function (n) { var m = (n.text || '').match(/^#\s+(.+)/m); return '[' + n.id + '] ' + (m ? m[1].slice(0, 50) : 'untitled'); }).join(' · ')); }
    if (global.InspoModel) { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } var ins = InspoModel.list({ status: 'new' }).filter(function (x) { return !x.ws || x.ws === w.id; }); if (ins.length) { L.push('', 'INSPIRATION (unused)'); ins.slice(0, 20).forEach(function (x) { L.push('  - [' + x.id + '] ' + (x.title || x.url) + (x.url ? ' ' + x.url : '') + (x.tags.length ? ' #' + x.tags.join(' #') : '') + (x.text ? ' — ' + x.text.slice(0, 120).replace(/\n/g, ' ') : '')); }); } }
    var act = global.Activity ? Activity.summary() : null; if (act && act.lastActive) L.push('', 'ACTIVITY: last change ' + Activity.ago(act.lastActive) + ', streak ' + act.streak + ' days');
    return L.join('\n');
  }

  /* ---- prompts -------------------------------------------------------- */
  // Each prompt: title, one-line "does", category, pages where it is top, body builder.
  // {read} = how the agent gets data (command in files mode, snapshot in chat mode)
  // {write} = how it should act (run commands / reply with commands)
  function prompts() {
    var w = Config.ws(); var id = w.id; var boards = Config.boards(id); var b = boards[0] ? boards[0].id : 'runway';
    var files = mode() === 'files';
    var head = 'You are my operations partner for my Solo Ops workspace "' + w.title + '" (id ' + id + '). ' +
      (files ? 'The data lives in data/*.json in this folder and the CLI is `node solo.js` (read AGENTS.md first). Use `--ws ' + id + ' --as agent --note "what you changed"` on every write.'
             : 'I cannot run commands, so: read the snapshot I paste, think, and reply with the exact changes as `node solo.js …` command lines in ONE code block at the end (add / done / start / move / pri / step / social add / social copy / scripts add / notes add). I will paste that block back into the app and it applies them. Keep titles short, no ids for new items.') + '\n\n';
    var read = function (cmd, label) { return files ? 'Run `node solo.js ' + cmd + '`' : 'Here is my current ' + (label || 'state') + ' (snapshot below)'; };
    var tail = files ? '' : '\n\nSNAPSHOT:\n{{snapshot}}';
    return [
      // daily
      { c: 'daily', t: 'Daily standup', d: 'Three questions, then the board is updated and you have a plan for today.', pages: ['home', 'board'],
        p: head + read('today --ws ' + id, 'situation') + '. Run a standup with me: ask (1) what I finished since yesterday, (2) the ONE thing today is about, (3) what is blocking me. Wait for my answers. Then update the board (done / start / note / step as needed), and give me today\'s plan: max 3 items, in order, each with what "done" looks like.' + tail },
      { c: 'daily', t: 'What should I do right now?', d: 'Picks the single smallest next step and starts it.', pages: ['home', 'board'],
        p: head + read('today --ws ' + id, 'situation') + '. Pick the single smallest next step that moves the highest-priority Doing task (or the top To Do if nothing is in Doing). Tell me what "done" looks like for it, how long it should take, and start it (`start`).' + tail },
      { c: 'daily', t: 'Wrap up the day', d: 'Logs what happened, parks what slipped, sets up tomorrow.', pages: ['home', 'board'],
        p: head + read('today --ws ' + id, 'situation') + '. Wrap up my day: ask me what actually got done and what did not. Mark done / add notes, move anything stale out of Doing, and leave exactly one task in Doing for tomorrow morning with its first step written.' + tail },
      // weekly
      { c: 'weekly', t: 'Review my week', d: 'Five-line summary, then concrete moves you approve one by one.', pages: ['home', 'board', 'social'],
        p: head + read('week --ws ' + id + ' --json', 'week') + '. Give me: (1) a five-line summary — doing, high and untouched, posts due with open prep, anything overdue, idle time; (2) three concrete moves; (3) after I approve, apply them.' + tail },
      { c: 'weekly', t: 'Retro + plan next week', d: 'What shipped, what slipped, then next week set up.', pages: ['home'],
        p: head + read('week --ws ' + id + ' --json' + (files ? '` and `node solo.js log --n 100 --json' : ''), 'week') + '. Retro: what shipped, what slipped and why, where the idle gaps were. Then plan next week: move stale To Do to Later, keep max 3 in Doing, schedule the posts, split anything bigger than a day into steps. Show the plan, apply after I confirm.' + tail },
      // projects
      { c: 'projects', t: 'Plan a project from scratch', d: 'Asks 5 questions, then builds boards, tasks and a posting arc.', pages: ['home'],
        p: head + 'I am starting "' + w.title + '". Goal: <goal in one sentence>. Deadline: <deadline>. Ask me at most 5 questions, then create: the boards I need (' + (files ? '`boards add`' : 'tell me their names and I will add them') + '), 10–20 tasks in priority order with steps, and a 2-week posting arc (`social add`). Keep it realistic for one person.' + tail },
      { c: 'projects', t: 'Add tasks from this list', d: 'Turns a pasted list into tasks with priority and steps.', pages: ['home', 'board'],
        p: head + 'Turn the list below into tasks on board "' + b + '". One task per line, high priority for anything blocking, steps when a line has obvious sub-steps, tags from the content.\n\nLIST:\n<paste your list — one item per line>', block: 'paste your list — one item per line' },
      { c: 'projects', t: 'Break this task into steps', d: 'A task you keep avoiding becomes 3–7 concrete steps.', pages: ['board'],
        p: head + 'Task: <task title>. Break it into 3–7 concrete steps, each finishable in under an hour, first step something I can start in 5 minutes. Add them with `step`, and if the task is too big for a week, say so and propose the split.' + tail },
      { c: 'projects', t: 'Clean up the board', d: 'Stale, duplicate or vague tasks get fixed or parked.', pages: ['board', 'home'],
        p: head + read('list all --ws ' + id, 'board') + '. Find tasks that are stale (no progress, in Doing too long), duplicates, or too vague to start. Propose: park to Later, merge, rewrite the title, or delete (ask me before deleting). Apply what I approve.' + tail },
      // content
      { c: 'content', t: 'Draft next week\'s posts', d: 'Writes copy for every post that has none.', pages: ['social', 'home'],
        p: head + read('social week --ws ' + id + ' --json', 'schedule') + '. Draft copy for every post without copy: ≤ 240 characters, first line is the hook, plain words, no hashtags, no hype. ' + (files ? 'Write each with `social copy ID "…"`.' : 'Reply with `social copy ID "…"` lines.') + ' Then list what still needs prep.' + tail },
      { c: 'content', t: 'Write a script from an idea', d: 'A 45–60s short-form script, saved to the Script Viewer.', pages: ['scripts', 'inspo'], go: 'scripts',
        p: head + 'Write a 45–60s short-form script about: <idea>. Structure: # Title · ## Hook (one line, under 2 seconds) · ## Script (5–7 numbered beats, one idea each, spoken language) · ## Inserts (what is on screen per beat) · ## Prep (checklist). ' + (files ? 'Save it with `node solo.js scripts add "the title" --file script.md --ws ' + id + '`.' : 'Reply with the line `scripts add "the title"` followed by the script in a ``` code block.') + ' Then I open it in the Script Viewer.' },
      { c: 'content', t: 'Edit this draft using my notes', d: 'Does what the [[notes]] ask, returns the text with changes marked.', pages: ['writing'], go: 'writing',
        p: 'Below is a draft with my markup: ~~remove~~, ++add++, [[instruction for you]]. Do exactly what the [[notes]] ask, keep everything else, and return the full text using the same ~~/++ markup so I can see what changed. No commentary.\n\nDRAFT:\n<paste the draft>', block: 'paste the draft', prefill: function () { var e = document.getElementById('writingInput'); return e ? e.value : ''; } },
      { c: 'content', t: 'Turn inspiration into work', d: 'Each saved link or idea becomes a task, post, script or draft — or is skipped.', pages: ['inspo', 'home'],
        p: head + read('inspo list --ws ' + id, 'inbox') + '. For each inspiration item decide: task (which board), post, script, draft, or skip, in a short table. After I confirm, ' + (files ? 'run `inspo use ID --as task|post|script|note` for each so the link back is kept.' : 'reply with `add` / `social add` / `scripts add` / `notes add` lines for the ones I confirmed.') + tail },
      { c: 'content', t: 'Brainstorm 10 post ideas', d: 'Ideas grounded in what you are actually building this week.', pages: ['social', 'inspo', 'home'],
        p: head + read('week --ws ' + id + ' --json', 'week') + '. From what I am building and shipping, give me 10 post ideas: 5 build-in-public, 3 lessons, 2 asks. One line each, with the hook. Then schedule the 3 I pick with `social add`, spaced 2 days apart from tomorrow 9:00.' + tail },
      // fix
      { c: 'fix', t: 'Undo what the agent just did', d: 'Every change is logged; this reverts the last agent step.', pages: ['home'],
        p: files ? head + 'Run `node solo.js log --n 10`, show me the entries with source "agent", and revert the ones I point at with `node solo.js revert ID`. Confirm each.' : 'No prompt needed: open Home → Recent changes and click Revert on the step (works when `node serve.js` is running). From the terminal: `node solo.js log` then `node solo.js revert ID`.' }
    ];
  }
  var CATS = [['daily', 'Daily'], ['weekly', 'Weekly'], ['projects', 'Projects'], ['content', 'Content'], ['fix', 'Fix']];

  /* ---- render --------------------------------------------------------- */
  function render() {
    var pg = page(); var w = Config.ws(); var m = mode(); var r = root();
    var all = prompts(); var here = all.filter(function (x) { return x.pages.indexOf(pg) >= 0; });
    var connectOpen = !m || !Store.get(SEEN_KEY);
    panel.innerHTML = '<div class="guide-head"><b>Guide</b><span class="guide-sub">' + esc(w.title) + '</span><button type="button" class="guide-close" aria-label="Close">×</button></div>' +
      '<div class="guide-body">' +
      '<details class="guide-sec" ' + (connectOpen ? 'open' : '') + '><summary>1 · Connect your AI agent <span class="guide-hint">' + (m ? (m === 'files' ? 'runs commands' : 'chat only') : 'choose once') + '</span></summary>' +
        '<div class="guide-modes">' +
        '<label class="guide-mode' + (m === 'files' ? ' on' : '') + '"><input type="radio" name="gmode" value="files"' + (m === 'files' ? ' checked' : '') + '><b>My agent can run commands</b><span>Claude Code, Cursor, Claude Desktop with this folder, Codex… It reads your files and runs <code>node solo.js</code> itself.</span></label>' +
        '<label class="guide-mode' + (m === 'chat' ? ' on' : '') + '"><input type="radio" name="gmode" value="chat"' + (m === 'chat' ? ' checked' : '') + '><b>My agent is a chat</b><span>ChatGPT, Claude.ai, Gemini… Prompts carry a snapshot of your data; you paste the reply back below and it applies here. No terminal.</span></label>' +
        '</div>' +
        (m === 'files' ? '<ol class="guide-steps"><li>Open this folder in your agent (Claude Code: <code>cd</code> into it and start).</li><li>Say: <b>"Read AGENTS.md, then run node solo.js week"</b>. That is the whole onboarding.</li><li>From then on, use any prompt below. Keep <code>node serve.js</code> running and the pages update as the agent works.</li></ol>'
         : m === 'chat' ? '<ol class="guide-steps"><li>Start a new chat. Paste a prompt from below — it already contains a snapshot of this workspace.</li><li>Answer its questions. When it replies with a code block of <code>node solo.js …</code> lines, copy that block.</li><li>Paste it into <b>Apply a reply</b> at the bottom of this panel. Done — the board updates and the change is logged.</li></ol>'
         : '<p>Pick one. You can change it any time.</p>') +
      '</details>' +
      (here.length ? '<h4>For this page</h4>' + here.map(card).join('') : '') +
      CATS.map(function (c) { var g = all.filter(function (x) { return x.c === c[0] && here.indexOf(x) < 0; }); if (!g.length) return ''; return '<details class="guide-sec"><summary>' + esc(c[1]) + ' <span class="guide-hint">' + g.length + '</span></summary>' + g.map(card).join('') + '</details>'; }).join('') +
      '<details class="guide-sec" id="guideApply" ' + (m === 'chat' ? 'open' : '') + '><summary>Apply a reply <span class="guide-hint">paste what your agent sent back</span></summary>' +
        '<textarea class="guide-reply" rows="6" placeholder="Paste the code block (node solo.js add … / done … / social add …) or a checklist (- [ ] task). Nothing is deleted from a pasted reply."></textarea>' +
        '<div class="guide-row"><button type="button" class="gp-copy guide-apply">Apply to ' + esc(w.title) + '</button><button type="button" class="guide-snap" title="Copy a text snapshot of this workspace to paste into any chat">Copy snapshot</button></div><div class="guide-result"></div>' +
      '</details>' +
      '<h4>This page</h4>' + (ABOUT[pg] || []).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
      '<h4>Shortcuts</h4><p>⌘K commands · ⌘⇧I capture · ? this guide · n add · 1/2/3 board views</p>' +
      '<h4>Read more</h4><p><a href="' + r + 'README.md" target="_blank">README</a> · <a href="' + r + 'AGENTS.md" target="_blank">AGENTS.md</a> · <a href="' + r + 'prompts/agent-bootstrap.md" target="_blank">bootstrap prompt</a> · <a href="' + r + 'data/SCHEMA.md" target="_blank">data schema</a></p>' +
      '</div>';
    panel.querySelector('.guide-close').onclick = close;
    Array.prototype.forEach.call(panel.querySelectorAll('input[name=gmode]'), function (i) { i.onchange = function () { Store.set(MODE_KEY, i.value, { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-prompt'), function (cardEl) { bindCard(cardEl, all[+cardEl.dataset.i]); });
    panel.querySelector('.guide-apply').onclick = applyReply;
    panel.querySelector('.guide-snap').onclick = function () { copyText(snapshot(), this, 'Snapshot copied'); };
    function card(x) { var i = all.indexOf(x); var n = blanks(x).length; return '<div class="guide-prompt" data-i="' + i + '"><button type="button" class="gp-main"><span class="gp-t">' + esc(x.t) + '</span><span class="gp-p">' + esc(x.d) + '</span>' + (n ? '<span class="gp-n">' + n + ' blank' + (n === 1 ? '' : 's') + ' to fill</span>' : '') + (x.go && x.go !== pg ? '<span class="gp-n gp-go">→ ' + esc(GO[x.go][1]) + '</span>' : '') + '</button><div class="gp-form"></div></div>'; }
  }
  function bindCard(card, x) {
    var form = card.querySelector('.gp-form'); var main = card.querySelector('.gp-main');
    main.onclick = function () {
      if (!mode()) { Store.set(MODE_KEY, 'chat', { silent: true }); }   // sensible default for a first click
      var bl = blanks(x);
      if (!bl.length) { finish(x.p, card, x); return; }
      if (form.innerHTML) { form.innerHTML = ''; card.classList.remove('open'); return; }
      card.classList.add('open');
      form.innerHTML = bl.map(function (b, k) { var isBlock = x.block && b === x.block; return '<label class="gp-field"><span>' + esc(b) + '</span>' + (isBlock ? '<textarea rows="5" data-k="' + k + '">' + esc(x.prefill ? x.prefill() : '') + '</textarea>' : '<input data-k="' + k + '" placeholder="' + esc(b) + '">') + '</label>'; }).join('') + '<button type="button" class="gp-copy">Copy the finished prompt</button>';
      var first = form.querySelector('input,textarea'); if (first) first.focus();
      form.querySelector('.gp-copy').onclick = function () { var out = x.p; bl.forEach(function (b, k) { var el = form.querySelector('[data-k="' + k + '"]'); var v = (el.value || '').trim(); out = out.split('<' + b + '>').join(v || '<' + b + '>'); }); finish(out, card, x); };
    };
  }
  function finish(text, card, x) {
    text = text.replace('{{snapshot}}', snapshot());
    copyText(text, card, 'Copied — paste into your agent' + (x.go && x.go !== page() ? ' · then open ' + GO[x.go][1] : ''));
  }
  function blanks(x) { var seen = {}, out = []; (x.p.match(/<([^<>\n]{2,60})>/g) || []).forEach(function (m) { var k = m.slice(1, -1); if (!seen[k]) { seen[k] = 1; out.push(k); } }); return out; }
  function copyText(text, el, msg) {
    navigator.clipboard.writeText(text).then(function () {
      var t = el.querySelector ? (el.querySelector('.gp-t') || el) : el; var old = t.textContent; el.classList.add('copied'); t.textContent = msg;
      setTimeout(function () { el.classList.remove('copied'); t.textContent = old; }, 2200);
    }).catch(function () { prompt('Copy this:', text); });
  }
  function applyReply() {
    var ta = panel.querySelector('.guide-reply'); var out = panel.querySelector('.guide-result'); var text = ta.value.trim();
    if (!text) { out.textContent = 'Paste the agent\'s reply first.'; return; }
    if (!global.Apply) { out.textContent = 'Apply is not loaded on this page.'; return; }
    var res = Apply.run(text, { ws: Config.activeWs() });
    out.innerHTML = (res.applied.length ? '<b>Applied ' + res.applied.length + ':</b><ul>' + res.applied.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '<b>Nothing applied.</b> ') +
      (res.skipped.length ? '<b>Skipped ' + res.skipped.length + ':</b><ul>' + res.skipped.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
      (res.applied.length ? '<p>Every applied change is in Home → Recent changes and can be reverted.' + ((page() === 'board' || page() === 'social') ? '' : ' Reloading in a moment…') + '</p>' : '');
    if (res.applied.length) {
      ta.value = '';
      if (global.refreshBoard) refreshBoard();
      if (global.refreshSchedule) refreshSchedule();
      var pg = page(); if ((pg === 'scripts' || pg === 'writing' || pg === 'inspo' || pg === 'home')) setTimeout(function () { location.reload(); }, 2500);
    }
  }
  function open() { if (!panel) { panel = document.createElement('aside'); panel.className = 'guide'; document.body.appendChild(panel); } render(); panel.classList.add('open'); document.body.classList.add('guide-open'); }
  function close() { if (panel) { panel.classList.remove('open'); document.body.classList.remove('guide-open'); } }
  function toggle() { if (panel && panel.classList.contains('open')) close(); else open(); }
  function mountHandle() {
    if (document.querySelector('.guide-handle')) return;
    var h = document.createElement('button'); h.type = 'button'; h.className = 'guide-handle'; h.title = 'Guide: run this with your AI agent (?)';
    h.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg><span>Guide</span>';
    h.onclick = toggle; document.body.appendChild(h);
  }
  document.addEventListener('keydown', function (e) {
    var t = (e.target.tagName || '').toLowerCase(); if (t === 'input' || t === 'textarea' || t === 'select' || e.target.isContentEditable) return;
    if (e.key === '?' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); toggle(); }
    if (e.key === 'Escape') close();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHandle); else mountHandle();
  global.Guide = { open: open, close: close, toggle: toggle, snapshot: snapshot, mode: mode };
})(window);
