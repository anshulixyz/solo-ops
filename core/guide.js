/* =========================================================================
   core/guide.js — the left Guide panel: what this page is, how to use it,
   and copy-ready prompts for your agent (Claude, ChatGPT, Claude Code),
   pre-filled with the current workspace. Opens from "?" in the nav or the
   ? key. Global `Guide`.
   ========================================================================= */
(function (global) {
  'use strict';
  var panel = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function page() {
    var h = location.pathname.replace(/.*\//, '');
    return { 'index.html': 'home', '': 'home', 'marathon-board.html': 'board', 'social-board.html': 'social', 'social-calendar.html': 'calendar', 'script-viewer.html': 'scripts', 'writing-viewer.html': 'writing', 'inspiration.html': 'inspo' }[h] || 'home';
  }
  var ABOUT = {
    home: ['Home is the helicopter view: activity across every project, each workspace with its numbers, what is in play, your inbox and the change log.', 'Switch the open project with the Workspace menu in the nav. Everything below "Open project" belongs to it; everything above is all projects.', 'Recent changes lists what pages, the CLI and agents did. Revert any step.'],
    board: ['One board = one kanban: To Do → Doing → Done, a Later parking lot and a Bucket List for ideas. Cards have checklists, priority, project chip, tags and private notes.', 'n adds a task · 1 / 2 / 3 switch views · ⌘K runs commands like "add Fix the hero @launch #copy !high".', 'Create another board with + Board: blank, the sample sprint, or a copy. Each board is its own file in data/.'],
    social: ['A posting arc: each post has a date, copy, type, prep checklist, images and video status. Mark it posted to log engagement.', '⌘K: "add Launch day @launch #launch +3d 9:00". The calendar shows the month and a 52-week streak.', 'Status flows draft → ready → scheduled → posted.'],
    calendar: ['Month grid of scheduled posts plus a GitHub-style streak of posted days. Click a post to open it on the schedule.'],
    scripts: ['Reels and shorts scripts with a light structure: # Title, ## Hook, ## Script with numbered beats, ## Inserts, ## Prep.', 'Reader shows only spoken lines; 9:16 previews the phone; Teleprompter scrolls at your pace. Copy for AI copies the raw script.'],
    writing: ['Drafts with track changes you and your agent both read: ~~cut~~, ++add++, [[note for the AI]]. Copy for AI sends the markup; Copy clean sends the final text.', '⌘S saves · ⌘⇧C copies for AI · Undo/Redo per note.'],
    inspo: ['Everything worth keeping lands here: links, ideas, screenshots. Tag with a project, then Use as a task, post, script or draft, or tick a few and Brainstorm with AI.', 'The capture strip on every page, ⌘⇧I, paste anywhere, and dropping onto any page all save here.']
  };
  function prompts() {
    var w = Config.ws(); var id = w.id; var boards = Config.boards(id); var b = boards[0] ? boards[0].id : 'runway';
    var pre = 'You are managing my Solo Ops workspace "' + w.title + '" (id ' + id + '). The data lives in data/*.json and the CLI is `node solo.js` (see AGENTS.md). Use `--ws ' + id + ' --as agent --note "what you changed"` on every write so I can review and revert.\n\n';
    var noFiles = '\n\n(If you cannot run commands or read files, give me the exact `node solo.js …` commands to paste, in one code block.)';
    var list = [
      { t: 'Review my week', p: pre + 'Run `node solo.js week --ws ' + id + ' --json`, then: 1) five-line summary (doing, high and untouched, posts due with open prep, anything overdue, idle time); 2) propose concrete moves; 3) apply the ones I approve.' + noFiles, pages: ['home', 'board', 'social'] },
      { t: 'Add tasks from this list', p: pre + 'Turn the list below into tasks on board "' + b + '". One task per line, `--pri high` for anything blocking, `--steps "a|b"` when a line has obvious sub-steps, tags from the content. Then show me `node solo.js list todo --ws ' + id + '`.\n\nLIST:\n<paste your list — one item per line>', block: 'paste your list — one item per line', pages: ['home', 'board'] },
      { t: 'Plan this workspace from scratch', p: pre + 'I am starting "' + w.title + '". Goal: <one sentence>. Deadline: <date>. Ask me at most 5 questions, then create: the boards I need (`node solo.js boards add`), 10–20 tasks in priority order with steps, and a 2-week posting arc (`node solo.js social add`). Keep sample content out. Finish with `node solo.js week --ws ' + id + '`.' + noFiles, pages: ['home'] },
      { t: 'Turn my inspiration into tasks / posts', p: pre + 'Read `node solo.js inspo list --ws ' + id + '`. For each item decide: task (which board), post, script, draft, or skip. Propose the mapping as a table; after I confirm, run `node solo.js inspo use ID --as task|post|script|note` for each so the link back is kept.' + noFiles, pages: ['home', 'inspo', 'board'] },
      { t: 'Draft next week’s posts', p: pre + 'Look at `node solo.js social week --ws ' + id + ' --json` and the tasks in Doing. Draft copy for every post without copy (≤ 240 chars, first line is the hook, no hashtags, no hype). Write each with `node solo.js social copy ID "the copy"`, then list what still needs prep.' + noFiles, pages: ['home', 'social', 'calendar'] },
      { t: 'Write a script from this idea', p: pre + 'Write a 45–60s short-form script for: <idea>. Structure: # Title, ## Hook (one line, under 2 seconds), ## Script (5–7 numbered beats, one idea each, spoken language), ## Inserts (what is on screen per beat), ## Prep checklist. Save it with `node solo.js scripts add "the title" --file script.md --ws ' + id + '`.', pages: ['scripts', 'inspo', 'home'] },
      { t: 'Edit this draft using my notes', p: 'Below is a draft with my markup: ~~remove~~, ++add++, [[instruction for you]]. Do exactly what the [[notes]] ask, keep everything else, and return the full text using the same ~~/++ markup so I can see what changed. No commentary.\n\nDRAFT:\n<paste the draft>', block: 'paste the draft', prefill: function () { var e = document.getElementById('writingInput'); return e ? e.value : ''; }, pages: ['writing', 'home'] },
      { t: 'What should I do right now?', p: pre + 'Run `node solo.js today --ws ' + id + '`. Pick the single smallest next step that moves the highest-priority Doing task, tell me what "done" looks like for it, and `node solo.js start` it if it is not started.' + noFiles, pages: ['home', 'board'] },
      { t: 'Weekly retro + plan', p: pre + 'From `node solo.js log --n 100 --json` and `node solo.js week --ws ' + id + ' --json`: what shipped, what slipped and why, streak and idle gaps from `node solo.js activity`. Then set next week: move stale To Do to Later, pick 3 Doing max, schedule posts. Apply after I confirm.' + noFiles, pages: ['home'] }
    ];
    var pg = page();
    return list.filter(function (x) { return x.pages.indexOf(pg) >= 0; }).concat(list.filter(function (x) { return x.pages.indexOf(pg) < 0; }));
  }
  function render() {
    var pg = page(); var w = Config.ws(); var root = (document.querySelector('[data-nav]') || { getAttribute: function () { return './'; } }).getAttribute('data-root') || './';
    panel.innerHTML = '<div class="guide-head"><b>Guide</b><span class="guide-sub">' + esc(w.title) + '</span><button type="button" class="guide-close" aria-label="Close">×</button></div>' +
      '<div class="guide-body">' +
      '<h4>This page</h4>' + (ABOUT[pg] || []).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
      '<h4>Prompts for your agent <span class="guide-hint">click to copy · pre-filled for this workspace</span></h4>' +
      prompts().map(function (x, i) { var n = blanks(x).length; return '<div class="guide-prompt" data-i="' + i + '"><button type="button" class="gp-main"><span class="gp-t">' + esc(x.t) + '</span><span class="gp-p">' + esc(x.p.replace(/\n+/g, ' ').slice(0, 110)) + '…</span>' + (n ? '<span class="gp-n">' + n + ' blank' + (n === 1 ? '' : 's') + ' to fill</span>' : '') + '</button><div class="gp-form"></div></div>'; }).join('') +
      '<h4>No file access? (Claude.ai, ChatGPT)</h4><p>Paste <a href="' + root + 'prompts/agent-bootstrap.md" target="_blank">prompts/agent-bootstrap.md</a> once, then any prompt above; you get back commands to run.</p>' +
      '<h4>Shortcuts</h4><p>⌘K commands · ⌘⇧I capture · ? this guide · n add (boards, posts) · 1/2/3 board views</p>' +
      '<h4>Read more</h4><p><a href="' + root + 'README.md" target="_blank">README</a> · <a href="' + root + 'AGENTS.md" target="_blank">AGENTS.md</a> (the agent contract) · <a href="' + root + 'data/SCHEMA.md" target="_blank">data schema</a></p>' +
      '</div>';
    panel.querySelector('.guide-close').onclick = close;
    var ps = prompts();
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-prompt'), function (card) {
      var x = ps[+card.dataset.i]; var form = card.querySelector('.gp-form'); var main = card.querySelector('.gp-main');
      main.onclick = function () {
        var bl = blanks(x);
        if (!bl.length) { copy(x.p, card); return; }
        if (form.innerHTML) { form.innerHTML = ''; card.classList.remove('open'); return; }
        card.classList.add('open');
        form.innerHTML = bl.map(function (b, k) {
          var isBlock = x.block && b === x.block;
          return '<label class="gp-field"><span>' + esc(b) + '</span>' + (isBlock ? '<textarea rows="5" data-k="' + k + '" placeholder="' + esc(b) + '">' + esc(x.prefill ? x.prefill() : '') + '</textarea>' : '<input data-k="' + k + '" placeholder="' + esc(b) + '">') + '</label>';
        }).join('') + '<button type="button" class="gp-copy">Copy the finished prompt</button>';
        var first = form.querySelector('input,textarea'); if (first) first.focus();
        form.querySelector('.gp-copy').onclick = function () {
          var out = x.p;
          bl.forEach(function (b, k) { var el = form.querySelector('[data-k="' + k + '"]'); var v = (el.value || '').trim(); out = out.split('<' + b + '>').join(v || '<' + b + '>'); });
          copy(out, card);
        };
      };
    });
  }
  // placeholders look like <idea>, <date>, <one sentence>
  function blanks(x) { var seen = {}, out = []; (x.p.match(/<([^<>\n]{2,60})>/g) || []).forEach(function (m) { var k = m.slice(1, -1); if (!seen[k]) { seen[k] = 1; out.push(k); } }); return out; }
  function copy(text, card) {
    navigator.clipboard.writeText(text).then(function () {
      card.classList.add('copied'); var t = card.querySelector('.gp-t'); var old = t.textContent; t.textContent = 'Copied — paste into your agent';
      setTimeout(function () { card.classList.remove('copied'); t.textContent = old; }, 1800);
    }).catch(function () { prompt('Copy this prompt:', text); });
  }
  function open() { if (!panel) { panel = document.createElement('aside'); panel.className = 'guide'; document.body.appendChild(panel); } render(); panel.classList.add('open'); document.body.classList.add('guide-open'); }
  function close() { if (panel) { panel.classList.remove('open'); document.body.classList.remove('guide-open'); } }
  function toggle() { if (panel && panel.classList.contains('open')) close(); else open(); }
  document.addEventListener('keydown', function (e) {
    var t = (e.target.tagName || '').toLowerCase(); if (t === 'input' || t === 'textarea' || t === 'select' || e.target.isContentEditable) return;
    if (e.key === '?' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); toggle(); }
    if (e.key === 'Escape') close();
  });
  function mountHandle() {
    if (document.querySelector('.guide-handle')) return;
    var h = document.createElement('button'); h.type = 'button'; h.className = 'guide-handle'; h.title = 'Guide: what this page does + prompts for your agent (?)';
    h.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg><span>Guide</span>';
    h.onclick = toggle; document.body.appendChild(h);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHandle); else mountHandle();
  global.Guide = { open: open, close: close, toggle: toggle };
})(window);
