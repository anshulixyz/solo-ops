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
  var PKEY = 'marathon.prompts';   // { custom:[{id,t,d,c,p,pages}], overrides:{ title:{t,d,p} }, hidden:[titles] } ↔ data/prompts.json
  function pstore() { var v = Store.getJSON(PKEY, null); return v && typeof v === 'object' ? { custom: v.custom || [], overrides: v.overrides || {}, hidden: v.hidden || [] } : { custom: [], overrides: {}, hidden: [] }; }
  function psave(v) { Store.setJSON(PKEY, v); }
  function registerPromptsSync() {
    if (!global.Sync) return;
    Sync.register({ file: 'prompts.json', key: PKEY, label: 'prompts', activity: false, merge: true,
      read: function () { return pstore(); },
      apply: function (body) { var cur = pstore(); var inc = { custom: body.custom || [], overrides: body.overrides || {}, hidden: body.hidden || [] };
        var seen = {}; var custom = inc.custom.concat(cur.custom).filter(function (c) { if (!c || !c.id || seen[c.id]) return false; seen[c.id] = 1; return true; });
        Store.setJSON(PKEY, { custom: custom, overrides: Object.assign({}, cur.overrides, inc.overrides), hidden: inc.hidden.concat(cur.hidden).filter(function (h, i, a) { return a.indexOf(h) === i; }) }, { silent: true }); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerPromptsSync); else setTimeout(registerPromptsSync, 0);
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
    var w = Config.ws(); var L = ['WORKSPACE: ' + w.title + ' (' + w.id + ')']; var posts = [];
    Config.boards(w.id).forEach(function (b) {
      var tasks = Store.getJSON(Config.boardKey(b.id, w.id), []) || [];
      L.push('', 'BOARD "' + b.title + '" (--board ' + b.id + ')');
      ['doing', 'todo', 'later', 'bucket', 'done'].forEach(function (col) {
        var g = tasks.filter(function (t) { return t.col === col; }); if (!g.length) return;
        L.push('  ' + col + ':');
        g.slice(0, col === 'done' ? 5 : 40).forEach(function (t) { var n = (t.checklist || []).length, d = (t.checklist || []).filter(function (c) { return c.done; }).length; L.push('  - [' + t.id + '] ' + t.title + ' · ' + t.pri + (t.tags.length ? ' · #' + t.tags.join(' #') : '') + (n ? ' · ' + d + '/' + n + ' steps' : '')); });
      });
    });
    if (w.apps.social) { posts = (Store.getJSON(Config.key('social', w.id), []) || []).slice().sort(function (a, b) { return a.datetime.localeCompare(b.datetime); }); if (posts.length) { L.push('', 'POSTS'); posts.slice(0, 30).forEach(function (p) { var n = (p.prep || []).length, d = (p.prep || []).filter(function (c) { return c.done; }).length; L.push('  - [' + p.id + '] ' + p.datetime.replace('T', ' ') + ' · ' + p.title + ' · ' + p.status + (p.copy ? '' : ' · NO COPY YET') + (n ? ' · prep ' + d + '/' + n : '')); }); } }
    if (w.apps.scripts) { var sc = (Store.getJSON(Config.key('scripts', w.id), { scripts: [] }) || {}).scripts || []; if (sc.length) L.push('', 'SCRIPTS: ' + sc.map(function (s) { return '[' + s.id + '] ' + s.title; }).join(' · ')); }
    if (w.apps.writing) { var nt = (Store.getJSON(Config.key('writing', w.id), { notes: [] }) || {}).notes || []; if (nt.length) L.push('', 'NOTES: ' + nt.map(function (n) { var m = (n.text || '').match(/^#\s+(.+)/m); var nf = Object.keys(n.files || {}).length ? ' (' + Object.keys(n.files).length + ' image file' + (Object.keys(n.files).length === 1 ? '' : 's') + ': ' + Object.keys(n.files).map(function (k) { return n.files[k]; }).join(', ') + ')' : (Object.keys(n.images || {}).length ? ' (has images in the app)' : ''); return '[' + n.id + '] ' + (m ? m[1].slice(0, 50) : 'untitled') + nf; }).join(' · ')); }
    if (global.InspoModel) { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } var ins = InspoModel.list({ status: 'new' }).filter(function (x) { return !x.ws || x.ws === w.id; }); if (ins.length) { L.push('', 'INSPIRATION (unused)'); ins.slice(0, 20).forEach(function (x) { L.push('  - [' + x.id + '] ' + (x.title || x.url) + (x.url ? ' ' + x.url : '') + (x.file ? ' [image file: ' + x.file + ']' : (x.image ? ' [image in the app — ask me to upload it]' : '')) + (x.tags.length ? ' #' + x.tags.join(' #') : '') + (x.text ? ' — ' + x.text.slice(0, 120).replace(/\n/g, ' ') : '')); }); } }
    var withFiles = posts.filter ? posts.filter(function (p) { return (p.assets || []).length; }) : [];
    if (withFiles.length) L.push('', 'POST IMAGES: ' + withFiles.map(function (p) { return '[' + p.id + '] ' + p.assets.map(function (a) { return a.file || a.name + ' (in the app)'; }).join(', '); }).join(' · '));
    L.push('', 'ATTACHMENTS: image files live under data/attachments/ (relative to the Solo Ops folder). Links are URLs you can open. If something matters and you cannot read files, ask me to upload or paste it.');
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
      (files ? 'The data lives in data/*.json in this folder and the CLI is `node solo.js` (read AGENTS.md first). Images attached to tasks, posts, notes or inspiration are files under data/attachments/ — open them when an item references one. Use `--ws ' + id + ' --as agent --note "what you changed"` on every write.'
             : 'I cannot run commands, so: read the snapshot I paste, think, and reply with the exact changes as `node solo.js …` command lines in ONE code block at the end (add / done / start / move / pri / step / social add / social copy / scripts add / notes add). I will paste that block back into the app and it applies them. Keep titles short, no ids for new items. When an item mentions an image or link that matters, ask me to upload or paste it before deciding.') + '\n\n';
    var read = function (cmd, label) { return files ? 'Run `node solo.js ' + cmd + '`' : 'Here is my current ' + (label || 'state') + ' (snapshot below)'; };
    var tail = files ? '' : '\n\nSNAPSHOT:\n{{snapshot}}';
    var list = [
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
      { c: 'projects', t: 'Break this task into steps', d: 'The last task you touched becomes 3–7 concrete steps.', pages: ['board'],
        p: head + 'Break this task into 3–7 concrete steps, each finishable in under an hour, first step something I can start in 5 minutes. Add them with `step`, and if the task is too big for a week, say so and propose the split.\n\n{{last_task}}' },
      { c: 'content', t: 'Improve what is open', d: 'The script, draft or post on this page — tightened, with changes marked.', pages: ['scripts', 'writing', 'social'],
        p: 'Below is what I am working on. Tighten it: stronger first line, shorter sentences, cut anything that does not earn its place. Return the full text; for a draft keep the ~~/++ markup so I can see changes; for a script keep the # / ## structure.\n\n{{this}}' },
      { c: 'projects', t: 'Clean up the board', d: 'Stale, duplicate or vague tasks get fixed or parked.', pages: ['board', 'home'],
        p: head + read('list all --ws ' + id, 'board') + '. Find tasks that are stale (no progress, in Doing too long), duplicates, or too vague to start. Propose: park to Later, merge, rewrite the title, or delete (ask me before deleting). Apply what I approve.' + tail },
      // content
      { c: 'content', t: 'Draft next week\'s posts', d: 'Writes copy for every post that has none.', pages: ['social', 'home'],
        p: head + read('social week --ws ' + id + ' --json', 'schedule') + '. Draft copy for every post without copy: ≤ 240 characters, first line is the hook, plain words, no hashtags, no hype. ' + (files ? 'Write each with `social copy ID "…"`.' : 'Reply with `social copy ID "…"` lines.') + ' Then list what still needs prep.' + tail },
      { c: 'content', t: 'Write a script from an idea', d: 'A 45–60s short-form script, saved to the Script Viewer.', pages: ['scripts', 'inspo'], go: 'scripts',
        p: head + 'Write a 45–60s short-form script about: <idea>. Structure: # Title · ## Hook (one line, under 2 seconds) · ## Script (5–7 numbered beats, one idea each, spoken language) · ## Inserts (what is on screen per beat) · ## Prep (checklist). ' + (files ? 'Save it with `node solo.js scripts add "the title" --file script.md --ws ' + id + '`.' : 'Reply with the line `scripts add "the title"` followed by the script in a ``` code block.') + ' Then I open it in the Script Viewer.' },
      { c: 'content', t: 'Edit this draft using my notes', d: 'Does what the [[notes]] ask, returns the text with changes marked.', pages: ['writing'], go: 'writing',
        p: 'Below is a draft with my markup: ~~remove~~, ++add++, [[instruction for you]]. Do exactly what the [[notes]] ask, keep everything else, and return the full text using the same ~~/++ markup so I can see what changed. No commentary.\n\nDRAFT:\n<paste the draft>', block: 'paste the draft', prefill: function () { var e = document.getElementById('writingInput'); return e ? e.value : ''; } },
      { c: 'content', t: 'Assess new inspiration', d: 'Everything saved since last time: what it is, tags, and what it should become.', pages: ['inspo', 'home'], reviews: true,
        p: head + 'Below is what I saved since my last assessment. For each item: one line on what it is and why I probably saved it, 2–3 tags to add, and what it should become — task (which board), post, script, draft, or keep as reference. Reply with `inspo tag ID +tag +tag` lines for the tags' + (files ? ' (run them)' : '') + ', then a short table of your suggestions. I will pick which become work.\n\n{{inspiration_new}}' },
      { c: 'content', t: 'Turn inspiration into work', d: 'Each saved link or idea becomes a task, post, script or draft — or is skipped.', pages: ['inspo', 'home'],
        p: head + read('inspo list --ws ' + id, 'inbox') + '. For each inspiration item decide: task (which board), post, script, draft, or skip, in a short table. After I confirm, ' + (files ? 'run `inspo use ID --as task|post|script|note` for each so the link back is kept.' : 'reply with `add` / `social add` / `scripts add` / `notes add` lines for the ones I confirmed.') + tail },
      { c: 'content', t: 'Brainstorm 10 post ideas', d: 'Ideas grounded in what you are actually building this week.', pages: ['social', 'inspo', 'home'],
        p: head + read('week --ws ' + id + ' --json', 'week') + '. From what I am building and shipping, give me 10 post ideas: 5 build-in-public, 3 lessons, 2 asks. One line each, with the hook. Then schedule the 3 I pick with `social add`, spaced 2 days apart from tomorrow 9:00.' + tail },
      { c: 'daily', t: 'Talk through what I just did', d: 'Your last 10 changes with full context — for a second opinion or the next step.', pages: ['home', 'board', 'social', 'scripts', 'writing', 'inspo'],
        p: head + 'Below is what I just did, newest first, with the current state of each item. Tell me (1) anything that looks like a mistake or a loose end, (2) the single next step, (3) what to leave alone. Short.\n\n{{recent}}' },
      // fix
      { c: 'fix', t: 'Undo what the agent just did', d: 'Every change is logged; this reverts the last agent step.', pages: ['home'],
        p: files ? head + 'Run `node solo.js log --n 10`, show me the entries with source "agent", and revert the ones I point at with `node solo.js revert ID`. Confirm each.' : 'No prompt needed: open Home → Recent changes and click Revert on the step (works when `node serve.js` is running). From the terminal: `node solo.js log` then `node solo.js revert ID`.' }
    ];
    // your edits (data/prompts.json): overrides of built-ins, hidden built-ins, your own prompts
    var ps = pstore();
    list.forEach(function (x) { x.builtin = true; var o = ps.overrides[x.t]; if (o) { if (o.d) x.d = o.d; if (o.p) x.p = o.p; x.overridden = true; } });
    list = list.filter(function (x) { return ps.hidden.indexOf(x.t) < 0; });
    ps.custom.forEach(function (c) { list.push({ c: c.c || 'projects', t: c.t || 'My prompt', d: c.d || '', p: c.p || '', pages: c.pages || [], custom: true, id: c.id, go: c.go }); });
    list.forEach(function (x) { x.p = x.p.split('{{head}}').join(head); if (!files && (x.custom || x.overridden) && x.p.indexOf('{{snapshot}}') < 0 && x.p.indexOf('{{recent}}') < 0) x.p += tail; });
    return list;
  }
  var I = {
    daily: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    weekly: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    projects: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18"/></svg>',
    content: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    fix: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    moves: '<svg viewBox="0 0 24 24"><path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-6-4-8 0 4-3 6-4 9-1 3 1 10 7 10z"/></svg>',
    prompts: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    apply: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    setup: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'
  };
  var CATS = [['daily', 'Daily', 'standup · now · wrap up'], ['weekly', 'Weekly', 'review · retro'], ['projects', 'Projects', 'plan · tasks · clean'], ['content', 'Content', 'posts · scripts · drafts'], ['fix', 'Fix', 'undo']];
  var TAB_KEY = 'marathon.guide.tab';
  function tab() { return Store.get(TAB_KEY) || 'prompts'; }

  /* ---- render: tabs → Moves · Prompts · Apply · Setup ------------------ */
  function render() {
    var pg = page(); var w = Config.ws(); var m = mode(); var r = root();
    var all = prompts(); var here = all.filter(function (x) { return x.pages.indexOf(pg) >= 0; });
    var t = tab(); if (!m && !Store.get(SEEN_KEY)) t = 'setup';
    var TABS = [['moves', 'Moves', I.moves], ['prompts', 'Prompts', I.prompts], ['apply', 'Apply', I.apply], ['setup', 'Setup', I.setup]];
    panel.innerHTML = '<div class="guide-head"><b>Guide</b><span class="guide-sub">' + esc(w.title) + ' · ' + (m === 'files' ? 'agent runs commands' : m === 'chat' ? 'chat agent' : 'agent not set') + '</span><button type="button" class="guide-close" aria-label="Close">×</button></div>' +
      '<div class="guide-tabs">' + TABS.map(function (x) { return '<button type="button" class="guide-tab' + (x[0] === t ? ' on' : '') + '" data-tab="' + x[0] + '" title="' + x[1] + '">' + x[2] + '<span>' + x[1] + '</span></button>'; }).join('') + '</div>' +
      '<div class="guide-body">' +
      (t === 'moves' ? '<div class="guide-moves" id="guideMoves"></div><h4>This page</h4>' + (ABOUT[pg] || []).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '<h4>Shortcuts</h4><p>⌘K commands · ⌘⇧I capture · ? this guide · n add · 1/2/3 board views</p>' : '') +
      (t === 'prompts' ? '<div class="guide-moves compact" id="guideMoves"></div>' +
        (here.length ? '<div class="guide-cat"><span class="cat-ic">' + I.link + '</span><b>For this page</b></div>' + here.map(row).join('') : '') +
        CATS.map(function (c) { var g = all.filter(function (x) { return x.c === c[0] && here.indexOf(x) < 0; }); return '<div class="guide-cat"><span class="cat-ic">' + I[c[0]] + '</span><b>' + esc(c[1]) + '</b><span class="cat-sub">' + esc(c[2]) + '</span><button type="button" class="cat-add" data-cat="' + c[0] + '" title="Add my own prompt here">+</button></div>' + g.map(row).join('') + '<div class="gp-new" data-cat="' + c[0] + '"></div>'; }).join('') +
        '<p class="guide-foot-note">Click a prompt to copy it' + (m === 'chat' ? ' — it carries a snapshot of this workspace' : '') + '. Prompts with blanks ask first. ✎ edits a prompt, + adds your own; they are saved in data/prompts.json. Terminal: <code>node solo.js prompts</code>.</p>' : '') +
      (t === 'apply' ? '<div class="guide-how"><b>How this works.</b> Your agent answers with <code>node solo.js …</code> lines (or a checklist). Paste them here. The app reads those lines and makes the changes in this workspace itself — tasks, posts, scripts, notes, inspiration. Nothing runs on your computer, nothing is deleted, and every change lands in Home → Recent changes where it can be reverted.</div>' +
        '<textarea class="guide-reply" rows="7" placeholder="Paste your agent\'s reply here."></textarea>' +
        '<div class="guide-row"><button type="button" class="gp-copy guide-preview">Preview changes</button><button type="button" class="guide-snap" title="Copy a text snapshot of this workspace for any chat">Copy project</button></div><div class="guide-plan"></div><div class="guide-result"></div>' : '') +
      (t === 'setup' ? '<h4>How does your AI agent work?</h4><div class="guide-modes">' +
        '<label class="guide-mode' + (m === 'files' ? ' on' : '') + '"><input type="radio" name="gmode" value="files"' + (m === 'files' ? ' checked' : '') + '><b>It can run commands</b><span>Claude Code, Cursor, Codex, Claude Desktop with this folder. It reads your files, opens attachments, runs <code>node solo.js</code> itself.</span></label>' +
        '<label class="guide-mode' + (m === 'chat' ? ' on' : '') + '"><input type="radio" name="gmode" value="chat"' + (m === 'chat' ? ' checked' : '') + '><b>It is a chat</b><span>ChatGPT, Claude.ai, Gemini. Prompts carry a snapshot of your data; you paste the reply into Apply. No terminal needed.</span></label></div>' +
        (m === 'files' ? '<ol class="guide-steps"><li>Open this folder in your agent.</li><li>Say: <b>"Read AGENTS.md, then run node solo.js week"</b>.</li><li>Keep <code>node serve.js</code> running; pages update as the agent works. Images you attach are saved to <code>data/attachments/</code> so it can open them.</li></ol>'
         : m === 'chat' ? '<ol class="guide-steps"><li>Copy a prompt from the Prompts tab — it includes a snapshot.</li><li>When the agent replies with a code block, copy it.</li><li>Apply tab → paste → Preview → Apply. If an item has an image the agent needs, upload it in the chat when asked.</li></ol>' : '') +
        (pstore().hidden.length ? '<p><button type="button" class="guide-snap pe-restore">Show ' + pstore().hidden.length + ' hidden built-in prompt' + (pstore().hidden.length === 1 ? '' : 's') + '</button></p>' : '') +
        '<h4>Attachments</h4><p>Images you add to inspiration, notes or posts are kept in the app and, when <code>node serve.js</code> is running or the folder is linked, also written to <code>data/attachments/</code>. Agents with file access open them; chat agents are told to ask you for them.' + (global.Sync && !Sync.attachmentsAvailable() ? ' <b>Right now attachments stay in the browser only.</b>' : '') + '</p>' +
        '<h4>Read more</h4><p><a href="' + r + 'README.md" target="_blank">README</a> · <a href="' + r + 'AGENTS.md" target="_blank">AGENTS.md</a> · <a href="' + r + 'prompts/agent-bootstrap.md" target="_blank">bootstrap prompt</a> · <a href="' + r + 'data/SCHEMA.md" target="_blank">data schema</a></p>' : '') +
      '</div>';
    panel.querySelector('.guide-close').onclick = close;
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-tab'), function (b) { b.onclick = function () { Store.set(TAB_KEY, b.dataset.tab, { silent: true }); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('input[name=gmode]'), function (i) { i.onchange = function () { Store.set(MODE_KEY, i.value, { silent: true }); Store.set(SEEN_KEY, '1', { silent: true }); Store.set(TAB_KEY, 'prompts', { silent: true }); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('.guide-prompt'), function (cardEl) { bindCard(cardEl, all[+cardEl.dataset.i]); });
    Array.prototype.forEach.call(panel.querySelectorAll('.gp-edit'), function (b) { b.onclick = function (e) { e.stopPropagation(); editPrompt(all[+b.dataset.i], b.closest('.guide-prompt')); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('.cat-add'), function (b) { b.onclick = function () { newPrompt(b.dataset.cat, panel.querySelector('.gp-new[data-cat="' + b.dataset.cat + '"]')); }; });
    var pr = panel.querySelector('.pe-restore'); if (pr) pr.onclick = restoreHidden;
    if (t === 'apply') { panel.querySelector('.guide-preview').onclick = previewReply; panel.querySelector('.guide-snap').onclick = function () { copyText(snapshot(), this, 'Snapshot copied'); }; panel.querySelector('.guide-reply').addEventListener('input', function () { panel.querySelector('.guide-plan').innerHTML = ''; }); }
    var foot = document.createElement('div'); foot.className = 'guide-foot';
    foot.innerHTML = '<button type="button" class="guide-foot-apply">' + I.apply + 'Apply a reply</button>' +
      '<div class="guide-ctx"><button type="button" class="guide-foot-ctx" title="Copy context for your agent: recent changes, the last task, this item, the whole project…">' + I.link + 'Copy context <span class="chev">▾</span></button><div class="guide-ctx-menu"></div></div>';
    panel.appendChild(foot);
    foot.querySelector('.guide-foot-apply').onclick = function () { Store.set(TAB_KEY, 'apply', { silent: true }); render(); panel.querySelector('.guide-reply').focus(); };
    var ctxBtn = foot.querySelector('.guide-foot-ctx'); var ctxMenu = foot.querySelector('.guide-ctx-menu');
    ctxBtn.onclick = function (e) {
      e.stopPropagation();
      if (ctxMenu.classList.contains('open')) { ctxMenu.classList.remove('open'); return; }
      ctxMenu.innerHTML = (global.Context ? Context.menu() : []).map(function (it) { return '<button type="button" data-ctx="' + it.id + '"><b>' + esc(it.label) + '</b><span>' + esc(it.hint) + '</span><code>{{' + it.id + '}}</code></button>'; }).join('') + '<div class="guide-ctx-foot">Use any of these as a token inside your own prompts.</div>';
      Array.prototype.forEach.call(ctxMenu.querySelectorAll('[data-ctx]'), function (b) { b.onclick = function () { var txt = Context.get(b.dataset.ctx); ctxMenu.classList.remove('open'); copyText(txt, ctxBtn, 'Copied ' + Context.info(b.dataset.ctx).label.toLowerCase()); }; });
      ctxMenu.classList.add('open');
      setTimeout(function () { document.addEventListener('mousedown', function h(ev) { if (!ctxMenu.contains(ev.target) && ev.target !== ctxBtn) { ctxMenu.classList.remove('open'); document.removeEventListener('mousedown', h); } }); }, 0);
    };
    if (panel.querySelector('#guideMoves')) renderMoves(all);
    function row(x) { var i = all.indexOf(x); var n = blanks(x).length; return '<div class="guide-prompt row' + (x.custom ? ' custom' : '') + '" data-i="' + i + '"><button type="button" class="gp-main"><span class="gp-t">' + esc(x.t) + '</span>' + (x.custom ? '<span class="gp-mine">mine</span>' : x.overridden ? '<span class="gp-mine">edited</span>' : '') + (n ? '<span class="gp-n">' + n + '</span>' : '') + (x.go && x.go !== pg ? '<span class="gp-go">→ ' + esc(GO[x.go] ? GO[x.go][1] : x.go) + '</span>' : '') + '</button><button type="button" class="gp-edit" title="Edit this prompt" data-i="' + i + '"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button><div class="gp-d">' + esc(x.d) + '</div><div class="gp-form"></div></div>'; }
  }

  /* ---- next best moves: read the workspace, suggest up to 4, each wired to a prompt ---- */
  function moves(all) {
    var w = Config.ws(); var out = []; var m = mode();
    var tasks = []; var anyFresh = false;
    Config.boards(w.id).forEach(function (b) { var k = Config.boardKey(b.id, w.id); if (Store.isFresh(k)) anyFresh = true; (Store.getJSON(k, []) || []).forEach(function (t) { tasks.push(t); }); });
    var doing = tasks.filter(function (t) { return t.col === 'doing'; }); var todo = tasks.filter(function (t) { return t.col === 'todo'; });
    var noSteps = tasks.filter(function (t) { return (t.col === 'doing' || (t.col === 'todo' && t.pri === 'high')) && !(t.checklist || []).length; });
    var posts = w.apps.social ? (Store.getJSON(Config.key('social', w.id), []) || []) : [];
    var soon = new Date(Date.now() + 7 * 86400000); var noCopy = posts.filter(function (p) { return p.status !== 'posted' && !p.copy && new Date(p.datetime) <= soon; });
    var unposted = posts.filter(function (p) { return p.status !== 'posted'; });
    var ins = global.InspoModel ? (function () { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } return InspoModel.list({ status: 'new' }).filter(function (x) { return !x.ws || x.ws === w.id; }).length; })() : 0;
    var act = global.Activity ? Activity.summary() : null;
    function by(t) { return all.filter(function (x) { return x.t === t; })[0]; }
    if (!m) out.push({ s: 'Tell the Guide how your agent works — one choice, remembered.', open: 'connect' });
    if (anyFresh) out.push({ s: 'This is still the sample board. Plan your real project.', p: by('Plan a project from scratch') });
    if (act && act.lastActive && act.idle) out.push({ s: 'Nothing has moved for ' + Math.round(act.hoursIdle) + ' hours. A standup gets you back in.', p: by('Daily standup') });
    if (tasks.length && !doing.length) out.push({ s: 'Nothing is in Doing. Pick the next step.', p: by('What should I do right now?') });
    if (doing.length > 3) out.push({ s: doing.length + ' tasks in Doing — more than one person can carry. Trim it.', p: by('Clean up the board') });
    if (noSteps.length) out.push({ s: noSteps.length + ' important task' + (noSteps.length === 1 ? ' has' : 's have') + ' no steps yet: "' + noSteps[0].title.slice(0, 40) + '"…', p: by('Break this task into steps') });
    if (noCopy.length) out.push({ s: noCopy.length + ' post' + (noCopy.length === 1 ? '' : 's') + ' in the next 7 days ' + (noCopy.length === 1 ? 'has' : 'have') + ' no copy.', p: by('Draft next week\'s posts') });
    if (w.apps.social && !unposted.length && !anyFresh) out.push({ s: 'No posts scheduled. Keep the cadence going.', p: by('Brainstorm 10 post ideas') });
    var insNew = global.InspoModel ? InspoModel.listNew(w.id).length : 0;
    if (insNew) out.push({ s: insNew + ' new inspiration item' + (insNew === 1 ? '' : 's') + ' since your last assessment.', p: by('Assess new inspiration') });
    else if (ins >= 3) out.push({ s: ins + ' inspiration items waiting to become work.', p: by('Turn inspiration into work') });
    if (todo.length > 25) out.push({ s: todo.length + ' items in To Do. Park what is not this month.', p: by('Clean up the board') });
    return out.slice(0, 4);
  }
  function renderMoves(all) {
    var el = panel.querySelector('#guideMoves'); var list = moves(all);
    if (!list.length) { el.innerHTML = '<div class="guide-move ok"><span class="dot"></span><span>Board looks healthy. Standup in the morning, wrap up at night.</span></div>'; return; }
    var compact = el.classList.contains('compact');
    el.innerHTML = '<div class="guide-moves-h">Next best moves</div>' + (compact ? list.slice(0, 2) : list).map(function (mv, i) { return '<button type="button" class="guide-move" data-i="' + i + '"><span class="dot"></span><span>' + esc(mv.s) + '</span><span class="go">' + (mv.p ? esc(mv.p.t) + ' →' : 'Choose →') + '</span></button>'; }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.guide-move'), function (b) {
      b.onclick = function () {
        var mv = list[+b.dataset.i];
        if (mv.open === 'connect') { Store.set(TAB_KEY, 'setup', { silent: true }); render(); return; }
        if (!mv.p) return;
        var idx = all.indexOf(mv.p); var card = panel.querySelector('.guide-prompt[data-i="' + idx + '"]');
        if (!card) { Store.set(TAB_KEY, 'prompts', { silent: true }); render(); card = panel.querySelector('.guide-prompt[data-i="' + idx + '"]'); if (!card) return; }
        card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 900);
        if (mv.fill) { card.querySelector('.gp-main').click(); setTimeout(function () { Object.keys(mv.fill).forEach(function (k) { var inp = Array.prototype.filter.call(card.querySelectorAll('.gp-field'), function (f) { return f.querySelector('span').textContent === k; })[0]; if (inp) inp.querySelector('input,textarea').value = mv.fill[k]; }); }, 30); }
      };
    });
  }

  /* ---- edit / add prompts ---- */
  function promptForm(x, cat) {
    return '<div class="gp-editor"><label>Title<input class="pe-t" value="' + esc(x ? x.t : '') + '" placeholder="e.g. Monday planning"></label>' +
      '<label>Category<select class="pe-c">' + CATS.map(function (c) { return '<option value="' + c[0] + '"' + ((x ? x.c : cat) === c[0] ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select></label>' +
      '<label>One line, what it does<input class="pe-d" value="' + esc(x ? x.d : '') + '"></label>' +
      '<label>Prompt<textarea class="pe-p" rows="8">' + esc(x ? x.p : '{{head}}') + '</textarea></label>' +
      '<div class="pe-hint">Blanks like <code>&lt;idea&gt;</code> become fields. <code>{{head}}</code> = agent preamble. Context tokens: <code>{{recent}}</code> <code>{{last_task}}</code> <code>{{this}}</code> <code>{{project}}</code> <code>{{board}}</code> <code>{{doing}}</code> <code>{{posts}}</code> <code>{{inspiration}}</code> <code>{{inspiration_new}}</code> — the same things as the Copy context menu.</div>' +
      '<div class="guide-row"><button type="button" class="gp-copy pe-save">Save</button>' + (x && x.builtin && x.overridden ? '<button type="button" class="guide-snap pe-reset">Reset to default</button>' : '') + (x && x.custom ? '<button type="button" class="guide-snap pe-del">Delete</button>' : x && x.builtin ? '<button type="button" class="guide-snap pe-hide" title="Hide this built-in prompt">Hide</button>' : '') + '<button type="button" class="guide-snap pe-cancel">Cancel</button></div></div>';
  }
  function editPrompt(x, card) {
    var form = card.querySelector('.gp-form'); if (form.querySelector('.gp-editor')) { form.innerHTML = ''; card.classList.remove('open'); return; }
    card.classList.add('open'); form.innerHTML = promptForm(x);
    form.querySelector('.pe-cancel').onclick = function () { form.innerHTML = ''; card.classList.remove('open'); };
    form.querySelector('.pe-save').onclick = function () {
      var ps = pstore(); var v = { t: form.querySelector('.pe-t').value.trim() || x.t, d: form.querySelector('.pe-d').value.trim(), p: form.querySelector('.pe-p').value, c: form.querySelector('.pe-c').value };
      if (x.custom) { ps.custom = ps.custom.map(function (c) { return c.id === x.id ? Object.assign({}, c, v) : c; }); }
      else { ps.overrides[x.t] = { d: v.d, p: v.p }; if (v.c !== x.c || v.t !== x.t) { ps.hidden.push(x.t); ps.custom.push({ id: 'c' + Date.now().toString(36), t: v.t, d: v.d, p: v.p, c: v.c, pages: x.pages }); delete ps.overrides[x.t]; } }
      psave(ps); if (global.Sync) Sync.note('prompts.json', 'edited prompt: ' + v.t); render();
    };
    var rs = form.querySelector('.pe-reset'); if (rs) rs.onclick = function () { var ps = pstore(); delete ps.overrides[x.t]; psave(ps); render(); };
    var dl = form.querySelector('.pe-del'); if (dl) dl.onclick = function () { if (!confirm('Delete "' + x.t + '"?')) return; var ps = pstore(); ps.custom = ps.custom.filter(function (c) { return c.id !== x.id; }); psave(ps); render(); };
    var hd = form.querySelector('.pe-hide'); if (hd) hd.onclick = function () { var ps = pstore(); ps.hidden.push(x.t); psave(ps); render(); };
  }
  function newPrompt(cat, slot) {
    if (slot.innerHTML) { slot.innerHTML = ''; return; }
    slot.innerHTML = promptForm(null, cat);
    slot.querySelector('.pe-cancel').onclick = function () { slot.innerHTML = ''; };
    slot.querySelector('.pe-save').onclick = function () {
      var t = slot.querySelector('.pe-t').value.trim(); if (!t) { slot.querySelector('.pe-t').focus(); return; }
      var ps = pstore(); ps.custom.push({ id: 'c' + Date.now().toString(36), t: t, d: slot.querySelector('.pe-d').value.trim(), p: slot.querySelector('.pe-p').value, c: slot.querySelector('.pe-c').value, pages: [page()] });
      psave(ps); if (global.Sync) Sync.note('prompts.json', 'new prompt: ' + t); render();
    };
    slot.querySelector('.pe-t').focus();
  }
  function restoreHidden() { var ps = pstore(); ps.hidden = []; psave(ps); render(); }

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
    if (x && x.reviews && global.InspoModel) setTimeout(function () { InspoModel.markReviewed(); }, 0);
    text = global.Context ? Context.fill(text) : text.replace('{{snapshot}}', snapshot());
    copyText(text, card, 'Copied — paste into your agent' + (x.go && x.go !== page() ? ' · then open ' + GO[x.go][1] : ''));
  }
  function blanks(x) { var seen = {}, out = []; (x.p.match(/<([^<>\n]{2,60})>/g) || []).forEach(function (m) { var k = m.slice(1, -1); if (!seen[k]) { seen[k] = 1; out.push(k); } }); return out; }
  function copyText(text, el, msg) {
    navigator.clipboard.writeText(text).then(function () {
      var t = el.querySelector ? (el.querySelector('.gp-t') || el) : el; var old = t.textContent; el.classList.add('copied'); t.textContent = msg;
      setTimeout(function () { el.classList.remove('copied'); t.textContent = old; }, 2200);
    }).catch(function () { prompt('Copy this:', text); });
  }
  function previewReply() {
    var ta = panel.querySelector('.guide-reply'); var out = panel.querySelector('.guide-result'); var planEl = panel.querySelector('.guide-plan'); var text = ta.value.trim();
    out.innerHTML = '';
    if (!text) { out.textContent = 'Paste the agent\'s reply first.'; return; }
    if (!global.Apply) { out.textContent = 'Apply is not loaded on this page.'; return; }
    var units = Apply.plan(text, { ws: Config.activeWs() });
    if (!units.length) { out.textContent = 'No commands or checklist items found in that text.'; return; }
    planEl.innerHTML = '<div class="guide-plan-h">' + units.filter(function (u) { return u.ok; }).length + ' change' + (units.length === 1 ? '' : 's') + ' found — untick anything you do not want</div>' +
      units.map(function (u, i) { return '<label class="guide-unit' + (u.ok ? '' : ' off') + '"><input type="checkbox" data-i="' + i + '"' + (u.ok ? ' checked' : ' disabled') + '><span>' + esc(u.label) + (u.ok ? '' : ' <em>' + esc(u.reason) + '</em>') + '</span></label>'; }).join('') +
      '<button type="button" class="gp-copy guide-apply">Apply selected to ' + esc(Config.ws().title) + '</button>';
    planEl.querySelector('.guide-apply').onclick = function () {
      var chosen = Array.prototype.filter.call(planEl.querySelectorAll('input[type=checkbox]'), function (c) { return c.checked && !c.disabled; }).map(function (c) { return units[+c.dataset.i].text; });
      if (!chosen.length) { out.textContent = 'Nothing selected.'; return; }
      applyReply(chosen.join('\n'));
    };
  }
  function applyReply(text) {
    var ta = panel.querySelector('.guide-reply'); var out = panel.querySelector('.guide-result'); var planEl = panel.querySelector('.guide-plan');
    var res = Apply.run(text, { ws: Config.activeWs() });
    planEl.innerHTML = '';
    out.innerHTML = (res.applied.length ? '<b>Applied ' + res.applied.length + ':</b><ul>' + res.applied.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '<b>Nothing applied.</b> ') +
      (res.skipped.length ? '<b>Skipped ' + res.skipped.length + ':</b><ul>' + res.skipped.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
      (res.applied.length ? '<p>Every applied change is in Home → Recent changes and can be reverted.' + ((page() === 'board' || page() === 'social') ? '' : ' Reloading in a moment…') + '</p>' : '');
    if (res.applied.length) {
      ta.value = '';
      if (global.refreshBoard) refreshBoard();
      if (global.refreshSchedule) refreshSchedule();
      var pg = page(); if ((pg === 'scripts' || pg === 'writing' || pg === 'inspo' || pg === 'home')) setTimeout(function () { location.reload(); }, 2500);
      if (global.Sync) Sync.note('inspiration.json', 'agent reply applied');
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
