/* =========================================================================
   core/prompts.js — the Guide's built-in prompts, one source for everyone.
   Plain JS so the browser (classic script → MARATHON_PROMPTS) and the CLI
   (require) share it. The Guide renders these; `node solo.js prompts export`
   writes them as slash commands (.claude/commands, .cursor/commands, Codex
   prompts) and as the chat bootstrap (prompts/agent-bootstrap.md).

   Each prompt: { c: group, t: title, d: one line, slug, pages: where it is
   shown on top, p: text }. Text is built per mode:
     files — the agent runs `node solo.js` itself (Claude Code, Cursor, Codex)
     chat  — the agent only talks (ChatGPT, Claude.ai): the prompt carries a
             snapshot of the workspace and ends with the reply format, so a
             fresh chat needs no setup.
   {{tokens}} inside a prompt are filled by core/context.js in the browser
   and replaced by CLI instructions in exported commands (see CLI_TOKENS).
   ========================================================================= */
(function (root, factory) {
  var P = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else root.MARATHON_PROMPTS = P;
})(this, function () {
  'use strict';

  // groups: the first four show in the Guide's Ask tab; setup and fix live in Settings
  var CATS = [
    ['daily', 'Daily', 'standup · now · wrap up · stuck'],
    ['weekly', 'Weekly', 'plan · close · reality check'],
    ['projects', 'Projects', 'plan · tasks · steps · scope'],
    ['content', 'Content', 'posts · scripts · drafts · inspiration'],
    ['setup', 'Set up', 'this chat · this folder'],
    ['fix', 'Safety', 'undo · backups']
  ];
  var ASK = ['daily', 'weekly', 'projects', 'content'];

  // The reply contract for chat agents. Mirrors exactly what core/apply.js
  // accepts, so a fresh ChatGPT tab answers in a form the app can apply.
  function cheatsheet() {
    return [
      'HOW TO REPLY WITH CHANGES (the app applies these lines itself; nothing else runs):',
      'Put the commands at the end of your reply in one ``` block, one per line, in order.',
      '  add "Title" --pri high|medium|low --tags a,b --steps "step|step" [--board <id>]',
      '  start | done | later | bucket | todo <id or title fragment>',
      '  move <task> todo|doing|done|later|bucket · pri <task> high|medium|low · tag <task> +a -b',
      '  step <task> "text" · check <task> <n> · note <task> "text"',
      '  social add "Title" --at 2026-10-20T09:00 (or +3d 17:30) --type launch --copy "…" --prep "a|b"',
      '  social copy <post> "text" · social prep <post> "item" · social move <post> <when> · social ready|posted <post>',
      '  scripts add "Title" / notes add "Title": that line alone, then the full text in its own ``` block right under it',
      '  inspo tag <item> +a +b · inspo ws <item> <project id> · inspo archive <item>',
      'Ids are the [t…] [p…] [s…] [n…] [i…] in the snapshot; new items get no id. Never rm (it is ignored).',
      'A plain "- [ ] task" checklist with indented "- [ ] step" lines also works.'
    ].join('\n');
  }

  // o = { title, id, board, mode: 'files'|'chat', folder }
  function head(o) {
    var files = o.mode === 'files';
    var where = o.folder ? 'The Solo Ops folder is ' + o.folder + '.' : 'The Solo Ops folder is the one you are opened in (it has AGENTS.md and data/SCHEMA.md).';
    return 'You are my operations partner for my Solo Ops workspace "' + o.title + '" (id ' + o.id + '). ' +
      (files
        ? where + ' The data lives in data/*.json there and the CLI is `node solo.js` (read AGENTS.md first if you have not). Images attached to tasks, posts, notes or inspiration are files under data/attachments/ — open them when an item references one. Use `--ws ' + o.id + ' --as agent --note "what you changed"` on every write, and show me the plan before you change anything.'
        : 'You cannot run commands or open files, so: read the snapshot I paste, think, ask me what you need, and when we agree on changes end your reply with them as command lines (format at the end of this message). I will paste that block into the app and it applies them. Keep titles short, no ids for new items. When an item mentions an image or link that matters, ask me to upload or paste it before deciding.') + '\n\n';
  }
  function snapTail() { return '\n\nSNAPSHOT:\n{{snapshot}}'; }
  function tail(o, opts) {   // what a chat prompt ends with: snapshot (if it needs one) + the reply format (if it writes)
    if (o.mode !== 'chat') return '';
    return ((opts && opts.snap) ? snapTail() : '') + ((opts && opts.writes) ? '\n\n' + cheatsheet() : '');
  }

  function build(o) {
    o = o || {}; o.mode = o.mode === 'files' ? 'files' : 'chat'; var id = o.id || 'main'; var b = o.board || 'runway'; var files = o.mode === 'files';
    var H = head(o);
    var read = function (cmd, label) { return files ? 'Run `node solo.js ' + cmd + '`' : 'Here is my current ' + (label || 'state') + ' (snapshot below)'; };
    var ws = ' --ws ' + id;
    var W = { snap: true, writes: true };     // snapshot + reply format
    var R = { writes: true };                 // reply format only (context comes from a token)
    var S = { snap: true };                   // snapshot, read-only
    var list = [
      /* ---- daily: the ritual spine ---------------------------------------- */
      { c: 'daily', slug: 'standup', t: 'Daily standup', d: 'Three questions, then the board is updated and you have a plan for today.', pages: ['home', 'board'],
        p: H + read('today' + ws, 'situation') + '. Run a standup with me: ask (1) what I finished since yesterday, (2) the ONE thing today is about, (3) what is blocking me. Wait for my answers. Then update the board (done / start / note / step as needed), and give me today\'s plan: max 3 items, in order, each with what "done" looks like.' + tail(o, W) },
      { c: 'daily', slug: 'now', t: 'What should I do right now?', d: 'Asks how long you have, picks the single smallest next step that fits, starts it.', pages: ['home', 'board'],
        p: H + read('today' + ws, 'situation') + '. Ask me one question first: how much time do I have right now? Then pick the single smallest next step that fits it and moves the highest-priority Doing task (or the top To Do if nothing is in Doing). Tell me what "done" looks like for it, then start it (`start`).' + tail(o, W) },
      { c: 'daily', slug: 'wrap', t: 'Wrap up the day', d: 'Logs what happened, parks what slipped, sets up tomorrow.', pages: ['home', 'board'],
        p: H + read('today' + ws, 'situation') + '. Wrap up my day: ask me what actually got done and what did not. Mark done / add notes, move anything stale out of Doing, and leave exactly one task in Doing for tomorrow morning with its first step written.' + tail(o, W) },
      { c: 'daily', slug: 'stuck', t: 'I\'m stuck', d: 'Names the real blocker on the task you are on, then splits, reframes or parks it.', pages: ['board', 'home'], arg: 'task',
        p: H + 'I am stuck on the task below. Ask me one question: what exactly stopped me the last time I tried it. Then offer three ways out and let me pick: (a) split it so the first step takes 10 minutes, (b) shrink what "done" means, (c) park it to Later with a note on why and what would unblock it. Apply the one I pick (step / note / later).\n\n{{last_task}}' + tail(o, R) },
      { c: 'daily', slug: 'second-opinion', t: 'Second opinion on what I just did', d: 'Your last 10 changes with full context — a check for mistakes and the next step.', pages: ['home', 'board', 'social', 'scripts', 'writing', 'inspo'],
        p: H + 'Below is what I just did, newest first, with the current state of each item. Tell me (1) anything that looks like a mistake or a loose end, (2) the single next step, (3) what to leave alone. Short.\n\n{{recent}}' },

      /* ---- weekly: two calendar moments and one anxiety moment ------------ */
      { c: 'weekly', slug: 'week', t: 'Review my week', d: 'Five-line summary, then concrete moves you approve one by one.', pages: ['home', 'board', 'social'],
        p: H + read('week' + ws + ' --json', 'week') + '. Give me: (1) a five-line summary — doing, high and untouched, posts due with open prep, anything overdue, idle time; (2) three concrete moves; (3) after I approve, apply them.' + tail(o, W) },
      { c: 'weekly', slug: 'plan-week', t: 'Plan the week', d: 'Monday: what this week is for, Doing set to max 3, posts covered, the rest parked.', pages: ['home'],
        p: H + read('week' + ws + ' --json', 'week') + '. Plan my week: (1) ask me what this week is for, in one sentence; (2) propose what goes in Doing (max 3), what stays in To Do, what moves to Later, and which posts need copy or prep before their date; (3) split anything bigger than a day into steps. Show the plan, apply after I confirm.' + tail(o, W) },
      { c: 'weekly', slug: 'close-week', t: 'Close the week', d: 'Friday: what shipped, what slipped and why, where the gaps were. Nothing changes without a yes.', pages: ['home'],
        p: H + read('week' + ws + ' --json' + (files ? '` and `node solo.js log --n 100 --json' : ''), 'week') + '. Close my week: what shipped, what slipped and why, where the idle gaps were, and the one thing to do differently next week. Then propose the cleanups (done / later / notes) and apply what I approve.' + tail(o, W) },
      { c: 'weekly', slug: 'overcommitted', t: 'Am I overcommitted?', d: 'Open work and posts against the days left. What will not happen, and what to park.', pages: ['home', 'board'],
        p: H + read('week' + ws + ' --days 14 --json', 'next two weeks') + '. Reality check: count what is in Doing, the high-priority To Do and the posts due in the next 14 days, against my working days (ask if it is not 5 a week). Say plainly what will not happen at this pace. Propose what to park to Later and what to drop or move in the schedule. Apply what I approve.' + tail(o, W) },

      /* ---- projects: shaping work ----------------------------------------- */
      { c: 'projects', slug: 'plan-project', t: 'Plan a project from scratch', d: 'Five questions, then boards, tasks with steps and a posting arc.', pages: ['home'],
        p: H + 'I am starting "' + o.title + '". Ask me at most 5 questions: the goal in one sentence, the deadline, what already exists, what "done" looks like, what I will not do. Then create: the boards I need (' + (files ? '`boards add`' : 'tell me their names and I will add them') + '), 10–20 tasks in priority order with steps, and a 2-week posting arc (`social add`). Keep it realistic for one person. Show it, apply after I confirm.' + tail(o, W) },
      { c: 'projects', slug: 'tasks-from-list', t: 'Add tasks from this list', d: 'Turns a pasted list into tasks with priority and steps.', pages: ['home', 'board'],
        p: H + 'Turn the list below into tasks on board "' + b + '". One task per line, high priority for anything blocking, steps when a line has obvious sub-steps, tags from the content.\n\nLIST:\n<paste your list — one item per line>' + tail(o, R), block: 'paste your list — one item per line' },
      { c: 'projects', slug: 'steps', t: 'Break this task into steps', d: 'The last task you touched becomes 3–7 concrete steps.', pages: ['board'], arg: 'task',
        p: H + 'Break this task into 3–7 concrete steps, each finishable in under an hour, first step something I can start in 5 minutes. Add them with `step`, and if the task is too big for a week, say so and propose the split.\n\n{{last_task}}' + tail(o, R) },
      { c: 'projects', slug: 'cleanup', t: 'Clean up the board', d: 'Stale, duplicate or vague tasks get fixed or parked.', pages: ['board', 'home'],
        p: H + read('list all' + ws, 'board') + '. Find tasks that are stale (no progress, in Doing too long), duplicates, or too vague to start. Propose: park to Later, merge, rewrite the title, or delete (ask me before deleting). Apply what I approve.' + tail(o, W) },
      { c: 'projects', slug: 'cut-scope', t: 'Cut scope to ship by a date', d: 'Must / should / won\'t against the days left, so the date holds.', pages: ['board', 'home'],
        p: H + read('list all' + ws, 'board') + '. Ask me two things: the date I must ship by, and what the launch has to do for a first user. Then sort every open task into must (ships), should (after launch) and won\'t (cut). Be ruthless: if the musts do not fit the days left, cut again. Show me the three lists; after I confirm, move should → Later, won\'t → Bucket, and set the musts to high priority.' + tail(o, W) },
      { c: 'projects', slug: 'capture', t: 'Turn this conversation into tasks', d: 'Everything we agreed above becomes tasks with steps. Paste it at the end of any chat.', pages: ['home', 'board'],
        p: H + 'From everything above in this conversation, pull out the work: one task per concrete thing to do, steps when we discussed how, high priority for anything blocking, tags from the topic. Skip what is already on the board. Show me the list, then add it to board "' + b + '".' + tail(o, W) },

      /* ---- content: where chat users live --------------------------------- */
      { c: 'content', slug: 'improve', t: 'Improve what is open', d: 'The script, draft or post on this page — tightened, with changes marked.', pages: ['scripts', 'writing', 'social'], arg: 'item',
        p: 'Below is what I am working on. Tighten it: stronger first line, shorter sentences, cut anything that does not earn its place. Return the full text; for a draft keep the ~~/++ markup so I can see changes; for a script keep the # / ## structure.\n\n{{this}}' },
      { c: 'content', slug: 'hooks', t: 'Ten hooks for this', d: 'Ten first lines for the open item, four angles, ranked.', pages: ['scripts', 'writing', 'social'], arg: 'item',
        p: 'Below is what I am working on. Give me 10 hooks (first lines) for it: 3 that name the pain, 3 that make a claim, 2 that start with a number, 2 that ask a question. Under 12 words each, plain language. Rank them and say in one line why the top one wins.\n\n{{this}}' },
      { c: 'content', slug: 'edit-draft', t: 'Edit this draft using my notes', d: 'Does what the [[notes]] ask, returns the text with changes marked.', pages: ['writing'], go: 'writing',
        p: 'Below is a draft with my markup: ~~remove~~, ++add++, [[instruction for you]]. Do exactly what the [[notes]] ask, keep everything else, and return the full text using the same ~~/++ markup so I can see what changed. No commentary.\n\nDRAFT:\n<paste the draft>', block: 'paste the draft', prefill: 'writingInput' },
      { c: 'content', slug: 'repurpose', t: 'Repurpose this', d: 'The open script or draft becomes a post, a thread and a newsletter blurb.', pages: ['scripts', 'writing'], arg: 'item',
        p: H + 'Below is a finished piece. Turn it into: (1) one post under 240 characters, hook as the first line; (2) a 5-part thread, one idea per part; (3) a 3-sentence newsletter blurb with a link placeholder. Keep my voice, no hashtags, no hype. Show all three, then schedule the post for the slot I pick (`social add … --copy "…"`).\n\n{{this}}' + tail(o, R) },
      { c: 'content', slug: 'script', t: 'Write a script from an idea', d: 'A 45–60s short-form script, saved to the Script Viewer.', pages: ['scripts', 'inspo'], go: 'scripts',
        p: H + 'Write a 45–60s short-form script about: <idea>. Structure: # Title · ## Hook (one line, under 2 seconds) · ## Script (5–7 numbered beats, one idea each, spoken language) · ## Inserts (what is on screen per beat) · ## Prep (checklist). ' + (files ? 'Save it with `node solo.js scripts add "the title" --file script.md' + ws + '`.' : 'Reply with the line `scripts add "the title"` followed by the script in a ``` code block.') + ' Then I open it in the Script Viewer.' + tail(o, R) },
      { c: 'content', slug: 'draft-posts', t: 'Draft next week\'s posts', d: 'Writes copy for every post that has none.', pages: ['social', 'home'],
        p: H + read('social week' + ws + ' --json', 'schedule') + '. Draft copy for every post without copy: ≤ 240 characters, first line is the hook, plain words, no hashtags, no hype. ' + (files ? 'Write each with `social copy ID "…"`.' : 'Reply with `social copy ID "…"` lines.') + ' Then list what still needs prep.' + tail(o, W) },
      { c: 'content', slug: 'ship-post', t: 'Post about what I just shipped', d: 'Build in public: one post from what you just finished, two versions, scheduled.', pages: ['board', 'social', 'home'],
        p: H + 'Below is what I finished recently. Write ONE post about it for people building alongside me: first line is the hook (what changed for them, not for me), then 2–3 plain sentences, under 240 characters in total, no hashtags, no hype. Give me two versions. Then schedule the one I pick for tomorrow 9:00 (`social add "…" --at +1d 9:00 --type update --copy "…"`).\n\n{{shipped}}' + tail(o, R) },
      { c: 'content', slug: 'post-ideas', t: 'Brainstorm 10 post ideas', d: 'Ideas grounded in what you are actually building this week.', pages: ['social', 'inspo', 'home'],
        p: H + read('week' + ws + ' --json', 'week') + '. From what I am building and shipping, give me 10 post ideas: 5 build-in-public, 3 lessons, 2 asks. One line each, with the hook. Then schedule the 3 I pick with `social add`, spaced 2 days apart from tomorrow 9:00.' + tail(o, W) },
      { c: 'content', slug: 'assess-inspo', t: 'Assess new inspiration', d: 'Everything saved since last time: what it is, tags, and what it should become.', pages: ['inspo', 'home'], reviews: true,
        p: H + 'Below is what I saved since my last assessment. For each item: one line on what it is and why I probably saved it, 2–3 tags to add, and what it should become — task (which board), post, script, draft, or keep as reference. Reply with `inspo tag ID +tag +tag` lines for the tags' + (files ? ' (run them)' : '') + ', then a short table of your suggestions. I will pick which become work.\n\n{{inspiration_new}}' + tail(o, R) },
      { c: 'content', slug: 'use-inspo', t: 'Turn inspiration into work', d: 'Each saved link or idea becomes a task, post, script or draft — or is skipped.', pages: ['inspo', 'home'],
        p: H + read('inspo list' + ws, 'inbox') + '. For each inspiration item decide: task (which board), post, script, draft, or skip, in a short table. After I confirm, ' + (files ? 'run `inspo use ID --as task|post|script|note` for each so the link back is kept.' : 'reply with `add` / `social add` / `scripts add` / `notes add` lines for the ones I confirmed.') + tail(o, W) },

      /* ---- setup: one-time, lives in Settings ----------------------------- */
      { c: 'setup', slug: 'setup', t: 'Set up Solo Ops for me', d: 'First run: name the project, pick the parts, sample or empty, server, backup. The agent does it; you answer three questions.', pages: [],
        p: H + 'Set Solo Ops up for me in this folder' + (files ? '' : ' — you cannot run commands, so give me each command to run and wait for my answer') + '. Ask me three things first: what I am building (one line; it becomes the project name), which parts I want (boards · posting schedule · scripts · drafts), and whether I want the sample sprint to look at or an empty board. Then, in order: (1) `node solo.js doctor` — a fresh install says so; (2) set `name` and `eyebrow` in solo.config.js (keep the shape), or `node solo.js workspaces add "Title" --apps …` for a second project; (3) `node solo.js template all` for the sample, or nothing — we plan the real thing next with the "Plan a project from scratch" prompt (/plan-project); (4) start `node serve.js` and tell me to open http://localhost:4321 (Install in Chrome/Edge makes it an app); (5) show me `node solo.js week' + ws + '`; (6) the backup is not optional — before you finish, ask me which I want: a PRIVATE GitHub repo (you create it with `node solo.js backup setup` when the gh tool is logged in; otherwise I create it at github.com/new and give you the URL for `node solo.js backup --remote <url>`), or no GitHub: a folder that syncs like iCloud Drive or Dropbox (`node solo.js backup --to "<folder>"`). Then `node solo.js backup --daily` and show me `node solo.js backup --status`. Also `node solo.js guard --install`. My tasks never enter this code repo: data/ is git-ignored on purpose, and the backup is their private home. Finish with the three things I will use most: the Guide (left edge, ? key), /standup, /now.' },
      { c: 'setup', slug: 'setup-chat', t: 'Set up this chat', d: 'Paste once into a ChatGPT or Claude Project\'s instructions. Every later prompt can then be short.', pages: [],
        p: bootstrap(o) },
      { c: 'setup', slug: 'setup-folder', t: 'Set up this folder', d: 'For an agent that was not opened in the folder: where it is, what to read, what to run first.', pages: [],
        p: 'You will help me run Solo Ops, my local tasks / posts / scripts / drafts tool. ' + (o.folder ? 'The folder is ' + o.folder + '.' : 'The folder is <path to my Solo Ops folder>.') + ' Open it and read AGENTS.md there (the whole contract: files, schema, CLI). Then run `node solo.js workspaces` and `node solo.js week' + ws + '`, and summarise what you see in five lines. From now on: prefer the CLI over editing JSON, add `--ws ' + id + ' --as agent --note "why"` to every write, show me the plan before changing anything, never delete without asking.' },

      /* ---- fix: safety, lives in Settings → Protect your work ------------- */
      { c: 'fix', slug: 'backup-setup', t: 'Set up a private backup', d: 'A private home for your data: GitHub repo or a syncing folder, then daily. Never public.', pages: ['home'],
        p: (files ? H : '') + 'Set up the private backup of my Solo Ops data (the `data/` folder: it is git-ignored by the code repo on purpose and lives only on this computer right now). First ask me which I want: (a) a PRIVATE GitHub repo — if the GitHub CLI is logged in (`gh auth status`) you create it, otherwise I create it at github.com/new and give you the URL; or (b) no GitHub: a folder that syncs, like iCloud Drive or Dropbox. Then run `node solo.js backup setup` for (a) (or `node solo.js backup --remote <url>` with my URL), or `node solo.js backup --to "<folder>"` for (b). Then `node solo.js backup --daily` so it repeats every evening, and show me `node solo.js backup --status`. Never a public repo; the command refuses one anyway.' },
      { c: 'fix', slug: 'backup', t: 'Back up now', d: 'Commit and push the data folder.', pages: ['home'],
        p: (files ? H : '') + 'Run `node solo.js backup` in my Solo Ops folder and tell me what was committed and whether the push succeeded. If no remote is set, say so and offer to set one up privately.' },
      { c: 'fix', slug: 'restore', t: 'Restore from backup', d: 'Bring the data folder back from the private repo or a backup file.', pages: ['home'],
        p: (files ? H : '') + 'I need to restore my Solo Ops data. Options: (a) from the private repo: in the Solo Ops folder run `node solo.js backup --status` to see the repo, then `git -C data log --oneline -20` and check out the version I point at; (b) from an exported backup file: tell me to open any page → Guide → Settings → Import. Before changing anything, back up the current data/ (`node solo.js backup` or a copy of the folder) and show me what will change.' },
      { c: 'fix', slug: 'undo-agent', t: 'Undo what the agent just did', d: 'Every change is logged; this reverts the last agent step.', pages: ['home'],
        p: files ? H + 'Run `node solo.js log --n 10`, show me the entries with source "agent", and revert the ones I point at with `node solo.js revert ID`. Confirm each.' : 'No prompt needed: open Home → Recent changes and click Revert on the step (works when `node serve.js` is running). From the terminal: `node solo.js log` then `node solo.js revert ID`.' }
    ];
    list.forEach(function (x) { x.builtin = true; });
    return list;
  }

  // The one-time text for a ChatGPT / Claude Project (also prompts/agent-bootstrap.md).
  function bootstrap(o) {
    var id = o.id || 'main';
    return 'You are helping me run Solo Ops, a local set of tools for my tasks, social posts, video scripts and drafts. Everything is JSON files in a data/ folder on my machine with a CLI, `node solo.js`. You cannot run commands or open files: I paste data in, you think with me, and you hand back changes as command lines that the app applies itself.\n\n' +
      'My workspace is "' + o.title + '" (id ' + id + ').\n\n' +
      'WHAT I WILL PASTE\n' +
      '- A SNAPSHOT: boards with tasks as [t…] title · priority · #tags · steps; POSTS as [p…] date · title · status; SCRIPTS [s…]; NOTES [n…]; INSPIRATION [i…] with links. Columns: todo | doing | done | later (parked) | bucket (ideas). Priority: high | medium | low.\n' +
      '- Sometimes one item in full: a task card, a draft with ~~cut~~ ++add++ [[note for you]] markup, or a script (# Title / ## Hook / ## Script numbered beats / ## Inserts / ## Prep).\n\n' +
      'HOW TO WORK\n' +
      '1. Read the snapshot, then ask what you need (one or two questions), or make one proposal. Short turns, no reports.\n' +
      '2. Summaries are five lines: what is in Doing, what is high and untouched, posts due with open prep, anything overdue, idle time.\n' +
      '3. Show changes before you make them. When I say yes, end the reply with the commands.\n' +
      '4. A draft with [[notes]]: do what the notes ask, return the full text with the same ~~/++ markup. A script: keep the structure, beats numbered, hook under two seconds.\n' +
      '5. Never delete or reset. Keep ids. If an item mentions an image or link that matters, ask me to upload or paste it.\n\n' +
      cheatsheet();
  }

  /* ---- slash commands: the files-mode prompt with tokens turned into CLI steps ---- */
  function cliTokens(o) {
    var ws = ' --ws ' + (o.id || 'main'); var arg = o.argToken || '$ARGUMENTS';
    return {
      snapshot: 'Run `node solo.js week --json' + ws + '` for the whole picture.',
      project: 'Run `node solo.js week --json' + ws + '` for the whole picture.',
      board: 'Run `node solo.js list all' + ws + '` for the board.',
      doing: 'Run `node solo.js list doing' + ws + '`.',
      posts: 'Run `node solo.js social week' + ws + ' --json` for the upcoming posts.',
      recent: 'Run `node solo.js log --n 10' + ws + '` for my last changes, then `node solo.js show <id>` (or `social show`, `scripts show`, `notes show`) on each item it touched.',
      shipped: 'Run `node solo.js log --n 30' + ws + '` and `node solo.js list done' + ws + '`: what I finished recently is there.',
      last_task: 'The task: ' + arg + ' (an id or part of the title). If that is empty, use the task in Doing (`node solo.js list doing' + ws + '`). Read it with `node solo.js show <task>' + ws + '`.',
      this: 'The item: ' + arg + ' (a script s…, note n…, post p… or task t… id, or part of its title). If that is empty, ask me which. Read it with `node solo.js scripts show`, `notes show`, `social show` or `show`, with' + ws + '.',
      inspiration: 'Run `node solo.js inspo list' + ws + '`.',
      inspiration_new: 'Run `node solo.js inspo list' + ws + ' --status new`.'
    };
  }
  var MARK = 'generated by `node solo.js prompts export` — edit core/prompts.js or data/prompts.json, not this file';
  // x = a prompt built in files mode; tool = claude | cursor | codex
  function command(x, o, tool) {
    var T = cliTokens({ id: o.id, argToken: tool === 'cursor' ? '(the item I name in my message)' : '$ARGUMENTS' });
    var body = String(x.p).replace(/\{\{(\w+)\}\}/g, function (m, k) { return T[k] || m; });
    var front = tool === 'cursor' ? '' : '---\ndescription: ' + String(x.d || x.t).replace(/\n/g, ' ') + '\n' + (x.arg ? 'argument-hint: [' + x.arg + ' id or title]\n' : '') + '---\n';
    return front + '<!-- ' + MARK + ' -->\n' + body + '\n';
  }
  function slugOf(t) { return String(t || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }

  return { CATS: CATS, ASK: ASK, build: build, head: head, tail: tail, cheatsheet: cheatsheet, bootstrap: bootstrap, command: command, cliTokens: cliTokens, slugOf: slugOf, MARK: MARK };
});
