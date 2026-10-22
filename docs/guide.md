# The Guide, end to end

The Guide is the panel on the left edge of every page (the `?` key, the
**Guide** handle, or **Guide** in the nav). It is how Solo Ops works with your
AI. Every built-in prompt, every page's first suggestions and the reply format
are listed, generated from the code, in [guide-prompts.md](guide-prompts.md).
This page explains how it all works: for the owner deciding what lands, for
contributors and agents changing it.

- People read the Guide's own **This page** help (Ask → This page) and the
  README's Guide row. They never need this file.
- The code: `core/guide.js` (the panel), `core/prompts.js` (the prompts, the
  menu, the page list and help texts, the reply format), `core/context.js`
  (the `{{tokens}}`), `core/apply.js` (Reply), `core/quick.js` (Quick).

## The three ways to use it

| You use | You do | Where the answer lands | Undo |
|---|---|---|---|
| **An agent that runs commands** (Claude Code, Cursor, Codex in the Solo Ops folder) | Type `/menu`, `/bring-in`, `/start-day`… in the agent (every prompt is a slash command), or copy a prompt from the Guide (in *Runs commands* mode each card shows its `/command`) | The agent runs `node solo.js … --as agent --note "…"`; the files change; the pages follow within seconds while `node serve.js` runs | Home → Recent changes → Restore, `/undo-agent`, or `node solo.js log` + `revert <id>` |
| **A chat** (ChatGPT, Claude.ai, any chat AI) | Copy a prompt (or type in **Ask your AI** and **Copy for your AI**). It carries what the AI needs (a snapshot of the project, the open item, the take…) and, when it changes something, the reply format. Paste it into the chat | The AI's last lines, in one ``` block → Guide → **Reply** → **Preview** (every line, with what it will do or why not) → **Apply**. A cut goes into Reply *on the Video page* | Same as above: every applied change is logged as source `reply` |
| **No AI** | **Quick** (what are you doing → Doing; add tasks one per line with `@project #tag !high >later`; top tasks with ▶ / ✓ / priority), the pages' own buttons, ⌘K | Your boards and files directly | Recent changes → Restore |

There is no third "No AI" switch on purpose: every prompt assumes an AI, and
Quick plus the pages are the no-AI path. The switch shows **Runs commands** /
**Chat only**; until you pick, Solo Ops guesses from how the page is open
(served by `node serve.js` → runs commands; opened as a file → chat) and says
*guessed*. A `?guide=` link never picks for you.

## The tabs and every setting

| Where | Control | Stored in | What it does |
|---|---|---|---|
| Top of every tab | **Your AI**: Runs commands / Chat only (*guessed* until picked) | `marathon.guide.mode` (this browser) | Picks how every prompt is written: files mode tells the agent which commands to run; chat mode packs a snapshot and the reply format |
| Top of every tab | *Save your data somewhere private* card | reads `/api/backup`; `marathon.backup.ack` when you say you keep a copy elsewhere | Shown until a private backup is set up (the owner's rule: backup is part of setup) |
| Top of every tab | *Video needs ffmpeg* card | reads `/api/video/doctor` | Shown once a take exists and ffmpeg is missing (not on the Video page, which has its own card) |
| Tabs | Quick · Ask · Reply · Settings | `marathon.guide.tab`, `marathon.guide.seen` | The first open lands on **Ask**; later opens return to the last tab |
| Quick | What are you doing? | the board files | A match moves that task to Doing; no match starts a new task in Doing |
| Quick | Add tasks | the board file you pick | One per line; `@project #tag !high >later` and a date at the end work |
| Quick | Top tasks (all projects) | the board files | ▶ start, ✓ done, the badge cycles priority; *copy* copies the list; the Sample project is left out unless it is open |
| Ask | **Start here** / **Start with one** | — | Empty project (Home, Board, Calendar, Overview): Bring in my work · Plan a project from scratch · Fill my calendar. Otherwise the moment of the day: before noon Start my day · What should I do right now? · Plan today around my meetings; until 5 pm What should I do right now? · Turn this conversation into tasks · Break this task into steps; after that Wrap up the day · What should I do right now? · Turn this conversation into tasks. Other pages: their own first three. One click copies; a prompt with blanks opens its form; one that needs an open item says what to open |
| Ask | **Ask your AI** box + **Sends along** chips | the text survives re-renders in memory | Composes: preamble + each ticked chip's context + `WHAT I WANT:` + your words + (chat) the reply format. Each page ticks its own chips first; the rest are behind *+ N more* |
| Ask | Next | — | Up to four moves read from the project: still the sample board, idle for hours, nothing in Doing, more than three in Doing, important tasks without steps, posts in the next 7 days without copy, no posts scheduled, new inspiration (or three waiting), more than 25 in To Do, the last backup a week old. Never one Start already shows or whose prompt is hidden; so none on an empty project |
| Ask | For this page | — | The page's prompts in the order that fits it (core/prompts.js `FOR_PAGE`), never repeating Start; on an empty project only the ones that work without tasks (`EMPTY_OK`) |
| Ask | Groups: Daily · Weekly · Projects · Content · Bring in | `marathon.guide.cats` (which are open) | Every other prompt (Set up and Safety live in Settings); ✎ edits one, + adds your own, the search finds by title or text |
| Ask | This page | — | The page's help text (core/prompts.js `PAGES`) and the shortcuts |
| Ask | ✎ Edit a built-in prompt | `marathon.prompts` ↔ `data/prompts.json` (`overrides[title] = { d, p, mode, at }`, `reset[title]`) | Your edit applies to the mode you made it in (older edits: both); Reset brings the built-in back and records when, so an older copy of the edit (another browser, an open page) never returns, while a newer edit still wins; changing its title or group makes it your own prompt and hides the built-in |
| Ask | + Your own prompt | same file, `custom` | Shown in its group (and on the page you made it on); in chat mode it gets the snapshot (when it names no context) and the reply format; `prompts export` writes it to `.claude/commands/mine/` (git-ignored) |
| Ask | Hide / Show hidden | same file, `hidden` and `shown` | Hidden built-ins disappear everywhere (Start, Next, ⌘K); Show brings them all back; `removed` and `shown` make deletions and restores stick across browsers and the CLI |
| Reply | Paste → **Preview changes** → untick → **Apply selected** · **Continue on …** | the files the lines touch; `marathon.guide.carry` for lines handed to another page | See *Reply* below. The pasted text and its preview survive a re-render. In Runs commands mode the tab says there is nothing to paste back (the agent writes the files) |
| Reply | Copy project | — | The project snapshot, for any chat |
| Reply | Recent agent changes | reads `/api/log` | Runs commands mode with `node serve.js`: the agent's last changes |
| Settings | How does your AI agent work? | `marathon.guide.mode` | The same switch, with what each means |
| Settings | Set up once | — | Chat: *Set up this chat* (paste once into a ChatGPT or Claude Project; it carries the menu and the reply format). Runs commands: *Set up this folder* (for an agent opened elsewhere) |
| Settings | Protect your work | `/api/backup`, `marathon.backup.ack` | The backup state, why it matters, three ways (your agent `/backup-setup`; `node solo.js backup setup --name solo-ops-data`; a syncing folder), *Mark as done* / *Show the setup again*; Back up now, Restore (terminal prompts, labelled so in chat mode); Undo is a link to Recent changes in chat mode |
| Settings | Your data | — | Export everything (one file, into `data/exports/` when served or linked), Import, the files and sizes |
| Settings | Read more | — | About, README, AGENTS.md, the bootstrap prompt, the data schema, this page, NEXT |
| Footer | **What can I ask?** (runs commands) / **Paste the answer** (chat) · **Copy context** ▾ | — | The first jumps to Start; Copy context copies any one token (the same list as the chips) |
| Every page | ⌘K → *Ask: Bring in my work*, … | — | Opens the Guide on that prompt (the menu's prompts) |

Other keys a page keeps: `marathon.guide.lastCopy` (Reply's "copied 2 min ago"
line), `marathon.guide.carry` (lines handed to the page that saves them; read
once, ignored after 30 minutes or in another project), `marathon.inspiration.reviewedAt` (when new inspiration was last
assessed: set when a chat's assessment is applied, or when an agent prompt is
copied). Buttons on the pages that open the Guide on a prompt: Home's welcome card
*Bring in my work* (copies it too), *Plan today* (Home, and Share today → Plan
on Home and the Calendar), *What should I do right now?* (Home, nothing in
Doing), *fill it in* (Home's schedule card → Fill my calendar), the board's
empty state (*bring your tasks in*), Video's *Cut it with my AI* (Cut this take,
with the take in `{{take}}`).

## Prompts

One source, `core/prompts.js`, built per mode: **files** (the agent runs
`node solo.js`; the preamble names the folder and asks for `--ws <id> --as agent
--note "…"` and a plan before any change) and **chat** (the preamble says the AI
cannot run anything; the prompt carries a snapshot or a token and, when it
changes something, the reply format). The same list feeds:

- the Guide (cards, Start, For this page, ⌘K);
- the slash commands (`node solo.js prompts export` → `.claude/commands/`,
  `--for cursor` → `.cursor/commands/`, `--for codex` → `~/.codex/prompts`):
  the files-mode text with each `{{token}}` turned into the CLI line that reads
  the same thing; the shared files carry the shipped names, your edits go to
  `mine/`, and the guard refuses a shared file that differs;
- the chat bootstrap (`--for chat` → `prompts/agent-bootstrap.md`, also
  *Set up this chat*);
- the menu (`node solo.js menu`, `/menu`, the AGENTS.md block, Start with one);
- the catalogue ([guide-prompts.md](guide-prompts.md), `--for docs`).

Each prompt has a **reply kind** per mode (`reply`): files → `agent`; chat →
`lines` (Reply applies them), `terminal` (the chat gives lines for a terminal:
*Post this video*, the backup prompts) or `setup` (one-time text). A prompt
that works on something **needs** it: `item` (an open script, draft or post),
`task` (the last task touched, or one in Doing), `take` (a take on the Video
page); without it the card says what to open instead of copying an empty
prompt. **Blanks** (`<idea>`, `<paste your list>`…) become a small form before
copying. Text prompts write back: *Improve*, *Edit this draft*, *Ten hooks* end
with `scripts set <id>` / `notes set <id>` and the new text, or `social copy`,
after your yes.

### Tokens (what a prompt sends along)

| Token | Sends | Slash-command reading |
|---|---|---|
| `{{snapshot}}` / `{{project}}` | the whole project: boards, posts, scripts, notes, takes waiting, unused inspiration | `week --json` |
| `{{recent}}` | your last 10 changes with each item's state | `log --n 10` + `show` |
| `{{last_task}}` | the last task touched (or the one in Doing), the full card | the argument, or `list doing` |
| `{{this}}` | what is open: a script `[s…]`, a draft `[n…]`, a post, the board's task, the take | the argument + `scripts show` / `notes show` / `social show` / `show` |
| `{{board}}` · `{{doing}}` | the open board · everything in progress | `list all` · `list doing` |
| `{{posts}}` | the next 14 days of posts with copy and prep | `social week --json` |
| `{{schedule}}` | the next 7 days: meetings, timed tasks, deadlines, posts, overdue first | `calendar --days 7` |
| `{{shipped}}` | what you finished recently | `log --n 30` + `list done` |
| `{{inspiration}}` · `{{inspiration_new}}` | the unused inbox · what you saved since the last assessment (the items only, with their ids) | `inspo list` · `inspo list --status new` |
| `{{take}}` | the take's words with `[start-end]` times, pauses, fillers, what was said twice, the cut, the final | `video show` |

## Reply: what a pasted answer can do

Reply reads the answer the way chats write it: CRLF, a ```bash block,
`$ node solo.js` in front, numbered (`1. done t1`) or bulleted (`- start t2`)
command lines, `[t7]` ids as the snapshot shows them, a quoted value over
several lines, leftover `--ws / --as / --note`, two blocks. Quotes: `"…"`,
`“…”`, `„…“` and `'…'` delimit a value; inside one, other quote marks are your
text and stay as typed (`"He said “ship it”"`), and an apostrophe inside a word
(`don’t`, `Sam's`) is never a quote. A numbered or bulleted line outside a
block counts as a command only when it carries an id, a quote or a flag
(`1. done t1` yes, `3. add a demo gif` no). A checklist needs its box:
`- [ ] task` (indented `- [ ] step` lines under it) outside a block; inside a
block a plain `- item` is a task too. A prose bullet (`- Doing: …`) is never a
task. Steps indented under an `add` stay with it. The text under `scripts set` /
`notes set` / `scripts add` / `notes add` is copied exactly as typed.

**Preview** lists every line with what it will do, or why it will not;
**Apply** runs exactly the lines left ticked (preview and apply share one path,
`Apply.reply`). Every file a reply changes is logged with source `reply` and
the note *a pasted reply* (the Video page keeps its own note for a cut), so
Home → Recent changes and `revert` can tell it apart.

**Which page applies a line.** A page never writes another page's file (the
rule from the task-card work, enforced in `core/sync.js`), so a line is applied
by a page that saves its file: tasks on Home, the Calendar or the board the
task is on; posts on the Schedule, the Posting streak or the Calendar; scripts
on the Script Viewer; drafts on the Writing Viewer; inspiration on every page
(the capture strip syncs `inspiration.json` wherever it is); takes on the Video page. Without files on disk (the pages
opened as files, no folder linked) every page applies everything, since the
browser copy is the only one. With `node serve.js` or a linked folder, a line
another page saves is shown with what it will do there and *saved on … ·
Continue on … below*; saving it from here could overwrite newer work in that
file, or never reach it. After you apply what this page saves, **Continue on
…** opens the next page with only those lines, previewed, and says where they
came from; you press Apply there, and any page still to go gets its own
Continue button there. Tasks that come with posts go to the Calendar (it saves
both) in one hop; inspiration is saved on the page you are on; scripts, drafts and takes go to their
page. `inspo use` needs two files: the page that saves inspiration marks the
item used with the new piece's id reserved, and the piece continues to its page
as data (`inspo make <kind> --id … --data …`, the item's text encoded, so a
fence or a command inside it is never read as a line); applying the same
hand-off twice says *already made*. Lines handed to a page
wait for that page only, for 30 minutes and in the same project. Overview and
About save nothing: their Reply tab and copy message say to bring the answer to
the Calendar (tasks and posts); Overview and About save inspiration lines themselves, nothing else. On the Board page an `add` without `--board` lands on the board that is
open.

It accepts the verbs of the reply format (in
[guide-prompts.md](guide-prompts.md#the-reply-format-what-a-chat-answer-may-carry)):
tasks (`add` with `--col --pri --tags --steps --at --until --due --notes
--ext`, `start / done / later / bucket / todo`, `move`, `pri`, `tag`, `step`,
`check`, `note`, `at`, `due`), posts (`social add / copy / prep / move / ready /
posted`), `scripts add|set`, `notes add|set` (the text in the block under the
line), inspiration (`inspo add / tag / ws / archive / use`), `link` (on pages
that show the story, through the server), `config set` (served or linked),
`video cut --keep / --tidy / --retakes` and `video word` (on the Video page).
`--ext <tool>:<id>` re-imports update the same task on any board (status and
priority follow the source only when the source changed them; a task you
finished stays done and the preview says *Done here, still To Do there*);
`--task <t>` links a new script, draft or post to that task.

It refuses, each with its reason in the preview: `rm` (never deletes), an
unknown id, a date it cannot read, on `add`, `at`, `due`, `social add` and
`social move` alike (accepted: `2026-10-30`, `2026-10-30T14:00`,
`tomorrow 14:00`, `fri 10:00`, `+3d 17:30`, `today 15:00`, `clear`; refused
whole, never half-read: `Saturday 9am`, `Oct 30`, `next friday`), commands only
a terminal can run (`video render / transcribe / post`, `boards add`,
`backup`…), `--ext share:…`, a board that does not exist, and read-only
commands (`week`, `list`…: nothing to apply). When nothing in an answer can be
applied, the preview says so above the reasons.

## First run

On a fresh install every page starts blank (core/templates.js `FIRST_OPEN`).
Home shows the welcome card (Name it · Bring in my work · Add tasks · Look
around a sample project); the Guide's first open lands on **Ask** with **Start
here**; Next and For this page offer only what works on an empty project. The
sample is a separate *Sample project* left out of every "all projects" view.

## Tests

| Test | What it proves |
|---|---|
| `core/test-prompts.js` | the catalogue's fields, blanks per mode, reply format ↔ `core/apply.js` verbs, the import prompts' rules, the menu ↔ AGENTS.md, reserved slash names, tokens ↔ slash readings, this catalogue file ↔ the code |
| `core/test-apply.js` | every verb of the reply format against an in-memory store, re-imports, CLI parity |
| `core/test-guide.js` | every page's real scripts in Node: every prompt copied on every page, both modes, empty / sample / an item open (no token left, the right blanks, what it needs); a realistic chat answer for every prompt that asks for lines, through the Guide's own Reply path; messy answers and refusals; every `node solo.js` line a files-mode prompt names, run in a scratch copy with a flag audit |
| `core/test-guide-browser.js` (`npm run test:guide`) | headless Chrome on every page, both modes: the panel opens without an error, Start and a card copy, Ask composes, Settings and Quick render; in chat mode an answer is pasted into Reply on Home, the Board, Script, Writing and Streak pages and the files and the change log (source `reply`) follow; on Overview the line goes to Home with Continue on Home and lands there |

## Adding a page to the Guide

1. `core/prompts.js`: an entry in `PAGES` (title, file, the chips Sends along
   ticks first, the This page help), the page id in the `pages` of the prompts
   that fit it, and its order in `FOR_PAGE`.
2. The page id in `page()` in both `core/guide.js` and `core/context.js` (they
   map the file name to the id), and what `{{this}}` means there in
   `core/context.js`.
3. If the page keeps data in memory and syncs it with `Sync.register`, expose a
   `refresh…` hook that reloads it from the store and call it from
   `applyReply` in `core/guide.js` (as `refreshBoard`, `refreshSchedule`,
   `refreshScripts`, `refreshNotes`): a reply writes the store, and the page's
   next file write must not put its old copy back.
4. If it saves a file other pages also show, check `pageFor` in
   `core/apply.js` and `carryTarget` in `core/guide.js` name it.
5. `node solo.js prompts export --for docs`, then `npm test` and
   `npm run test:guide` (add the page to `PAGES` in `core/test-guide.js`,
   with what it saves in `holds()`, and to `core/test-guide-browser.js`).

## Troubleshooting

- **Copy does nothing**: the browser refused the clipboard (some embedded
  browsers); the Guide shows the text in a box to copy by hand.
- **Reply says there are no lines**: ask the AI to end with the lines in one
  ``` block (the *Set up this chat* text makes every chat do it).
- **Reply skips a line**: the reason is beside it (a date it cannot read, an
  unknown id…); fix the line and paste it again. *Paste this line on …*:
  press **Continue on …** under the preview.
- **The pages do not follow the agent**: run `node serve.js` (or link the
  folder); without it the page keeps its own copy in the browser.
- **Testing in Claude's built-in browser**: add `?nosw=1` (it cannot use the
  service worker).

## What changed

| When | Commit | Change |
|---|---|---|
| 2026-10-10 | `5f29882` | Tabs Moves · Prompts · Apply · Setup; Apply explained |
| 2026-10-10 | `54bfe7e` | Tabs work before a mode is chosen, an Undo quick action |
| 2026-10-10 | `777d996` | Redesigned by intent: Do · Reply · Settings, search, the visible agent switch |
| 2026-10-10 | `e161328` | Quick tab: Quick · Ask · Reply · Settings |
| 2026-10-13 | `45b3335` | Prompts from one source, slash commands, chat prompts self-contained |
| 2026-10-13 | `d5e655a` | The backup card on every tab, Protect your work |
| 2026-10-13 | `7168194` | Ask your AI box and chips, the blanks fix, reply applier fixes |
| 2026-10-13 | `234f93c` | Shared slash commands stay built-in; edits go to `mine/` |
| 2026-10-19 | `7a9c836`, `e293b37` | Cut this take, Post this video, `{{take}}`; the Video page's *Cut it with my AI*, the ffmpeg card |
| 2026-10-20 | `9ced6cc` | A task carries its pieces (`--task`, Connect with a task) |
| 2026-10-21 | this pass | See below |

**This pass, before → after**

| Part | Before | After |
|---|---|---|
| First open | Settings, then the backup block | Ask with **Start here** (empty project) or **Start with one** |
| The AI switch | "pick one"; a first copy saved *chat*; a `?guide=` link pinned chat | guessed from how the page is open, labelled *guessed* until you pick |
| Cards | no slash command shown; copied empty context on pages without an item | `/command` shown in Runs commands mode; *Open a script first* instead of an empty prompt |
| For this page | list order (Second opinion first almost everywhere) | the page's own order, never repeating Start, only what fits an empty project |
| Chips | all 12 | the page's few, *+ N more* |
| Next | "No posts scheduled" on an empty project; repeated the backup card | nothing on an empty project; never repeats Start or the backup card |
| Overview, About, Streak | borrowed Home's or the Schedule's help and prompts | their own page, help and prompts |
| Improve, Ten hooks, Edit this draft | text with nowhere to go | write back with `scripts set` / `notes set` / `social copy` after your yes |
| Cut this take (chat) | said "terminal" and "Reply" | one ending: Reply on the Video page |
| Second opinion (chat) | promised a format it never gave | carries the reply format |
| New prompts | — | Bring in my work, Start my day, Move what's overdue, Show me the menu; Wrap up gathers first; `/hooks` → `/ten-hooks` (Claude Code keeps `/hooks`; your edits, keyed by title, still apply) |
| Reply | prose bullets became tasks; numbered lines, `[t7]`, smart quotes, CRLF, multi-line copy failed; dates it could not read were dropped or misread silently; steps under an `add` lost between preview and apply; on the Script, Writing and Streak pages the page's own copy overwrote what was applied; a line applied on a page that does not save its file (a draft from Home, a post from a script) never reached the file, or overwrote newer work when it did; quotes were straightened inside your text and a script's numbered lines lost their numbers; `9am` fell off the date | all read; a date it cannot read is a skipped line with the reason; preview = apply; logged as `reply`; every page takes the reply before it writes the file; a line is applied only where its file is saved, with **Continue on Home** for the rest; your text is kept as typed |
| Inspiration | the tokens carried the Inspiration page's own "keep ids out" instructions; no `inspo use` from a reply; copying Assess marked the inbox reviewed | the items only; `inspo use`; reviewed when the answer is applied; the page's Brainstorm prompt follows the Guide's mode |
| Edits of built-ins | froze the other mode's wording; a text prompt gained a snapshot and the reply format | belong to the mode they were made in; a text prompt stays what it was |
| Hidden / deleted prompts, resets | showed in ⌘K and Next; deletes from the CLI and `prompts restore --all` could come back from an open page | gone everywhere; `removed` / `shown` / `reset` make them stick |
| `inspo use` | `--as post … --as agent` (the files-mode preamble) made a draft, or failed | every `--as` is read: one names the kind, one who made the change |
| Settings (chat) | offered terminal-only prompts as if they worked in a chat; Undo copied "No prompt needed…" | labelled *ends in commands you run yourself, in a terminal*; Undo is a link to Recent changes |
| Settings → Read more → data schema | 403 | opens |

Known gaps live in `NEXT.md` (Minor: the onboarding and Guide lists).
