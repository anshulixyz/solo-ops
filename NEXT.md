# Next — features and issues

The working list for Solo Ops. Anyone (person or agent) picking up work
starts here. Keep it honest: move an item to **Done** with the commit hash,
add issues as you find them, keep the order meaning priority.

How to take an item: say which one in your PR or commit title
(`Guide: three tabs by intent (NEXT #M2)`), keep `AGENTS.md` and `README.md`
in step with what you change, and run `node solo.js doctor` plus
`node social/test-social-save.js` before you call it done.

## Release 1 — what ships, what waits

**Must, before the public launch**
- ~~M8 · Calendar + dates~~ — shipped 2026-10-13 (see Done).
- Backup repo name offered during setup (first item under Minor).

**Should, first week after**
- ~~*Share today* as an image~~ and ~~Home as a dashboard~~ — shipped 2026-10-13 (see Done).
- **Last before launch:** README pass — copy for the new Home, Share today and the mono default, fresh screenshots (`docs/screenshots`).

**After launch (moved out of release 1 on 2026-10-13)**
- M1 undo / redo in the browser. Trimmed first version agreed: a ring of the
  last 50 steps per browser kept at the one write path (`Store.set`, non-silent
  writes only, so sync-applied file changes are never steps), labels from
  Recent changes, one pasted reply = one step; undo writes the previous value
  back through the same path so the file and the log follow; a toast with
  Undo after each change, Undo / Redo in the Guide footer, ⌘Z when no field
  is focused; if the file changed underneath since the step, say so and ask.
  CLI undo and IndexedDB wait for the full M1.

**After**: M9 (MCP server) and M10 (Mac and Windows notes) are the first two
after launch, then M3, M5, M6, M7, the rest of M4. Freeze everything else and
spend the remaining time on the first-run path.

## Major

### M8 · Calendar + dates (release blocker; design agreed 2026-10-13)
Today only posts carry a date, so meetings have nowhere to live and the
board cannot answer "what is on today". Two parts, built together, shown
for review after each.

**1 · Dates on tasks.** Optional fields on a task: `at` (`YYYY-MM-DDTHH:MM`,
local, same format as posts), `until` (end time, `HH:MM` or a full stamp,
for meetings), `due` (`YYYY-MM-DD`). A meeting is a task with `at` and the
tag `meeting`: it lands on a board, can carry a prep checklist and notes, is
marked done after, and shows in Recent changes like everything else. No
separate event type. CLI: `add --at … [--until …] [--due …]`, `at <task>
<when|clear>`, `due <task> <date|clear>`; `today` gains a **Schedule** block
(dated tasks + posts in time order, overdue first); `week` lists dated items
by day; new `calendar [--days 14] [--all]` prints the agenda. `core/apply.js`
accepts the same, so chat replies can schedule. Cards show the date; the
board sorts dated items first inside a column.

**2 · The Calendar app** (`calendar/`, like the studio apps: model · view ·
main). Replaces `social/social-calendar.html`, which redirects. Nav item
*Calendar* on every workspace. Views: **Month** (grid, items as chips),
**Week** (7 columns with times, meetings as blocks), **Agenda** (today →
next 14 days, time-ordered: the "what do I have to get done" view). Filters
as chips, remembered: source (each board · meetings · posts), project
(this workspace · all), state (open · done). Click opens the item in its
app; drag between days reschedules (keeps the time). *+ on a day* adds a
task with `at` on the default board, or a post. The posting heatmap moves
here under the posts filter. Home gets a Calendar card: today's count and
the next item.

**3 · The agent fills it.** New Guide group *Bring in* (M4 starts here):
*Fill my calendar* — in command mode the agent reads the calendar it is
connected to (Google, Apple, Outlook through Claude or ChatGPT connectors)
for the next 7 days and adds each meeting as a `meeting` task with `--at`
and `--until`, skipping ones already there (same title + start); if it has
no calendar connector it says how to connect one in Claude or ChatGPT and
waits. In chat mode the user pastes their week and gets the command block.
*Plan today around my meetings* — meetings fixed, top 3 tasks placed in
the gaps, the rest parked. Standup and What-now read the schedule. Both
ship as slash commands.

Not built: an OAuth calendar integration inside Solo Ops. The agent is the
integration (files over services).

### M1 · Undo / redo that works everywhere (agreed design)
Today a change can only be reverted when `node serve.js` runs, because the
previous content lives in `data/log.jsonl`, which only the server and the CLI
can read back. A page opened by double-click has nothing to revert from.

- Keep an undo history **in the browser** as well: every write already goes
  through one function (`Store.setJSON` via each app's `persist`), so each
  write keeps the previous value in an IndexedDB ring, last 50 steps per
  workspace, with a label ("done: Write the README", "applied reply, 12
  changes") and the source (ui / agent / cli).
- **Semantics like ⌘Z:** undo takes back the most recent step, press again
  for the one before; **redo** re-applies. Order is always preserved, so
  nothing after the step is lost by accident. One pasted reply = one step.
  One CLI batch (`import`) = one step.
- Works identically on file://, linked folder and server. In server and
  folder mode the undo also writes the file, like any change.
- The server log (`log.jsonl`) stays as the long, cross-session history.
  "Restore this file to before X" stays on Home → Recent changes as the
  advanced tool, with a sentence saying what it will discard.
- Surface: one **Undo** button (and Redo) in the Guide footer that names the
  step; ⌘Z / ⇧⌘Z when no field is focused; `node solo.js undo` / `redo` in
  the CLI using the same ring exported to `data/undo.json`.

### M9 · An MCP server: Solo Ops anywhere, with any agent
One local process (`node solo.js mcp`, stdio) that exposes the CLI's verbs as
Model Context Protocol tools: `today`, `week`, `calendar`, `add`, `done`,
`start`, `move`, `at`, `due`, `step`, `note`, `social add`, `share today`,
plus `prompt <slug>` returning a Guide prompt with the snapshot filled in.
Same files, same `log.jsonl` (source `mcp:<client>`), same guard and backup.
Claude Desktop, ChatGPT (when it speaks MCP), Cursor and a phone client then
use the folder without pasting. Zero dependencies: the protocol is JSON over
stdio, written by hand like `serve.js`. Ships with a `/setup-mcp` prompt that
writes the client's config entry.

### M10 · Your notes on the Mac and on Windows flow in
A watcher (`node solo.js watch`) that reads what people already write in:
Apple Notes and Reminders on the Mac (AppleScript / the Notes SQLite, read
only), Sticky Notes and Notepad on Windows, and any Markdown folder
(Obsidian, iA Writer). New notes or new `- [ ]` lines become inbox items or
tasks with a link back to the note; a tag like `#solo` or a folder name picks
the project. Nothing is moved or edited at the source. The Guide gets
*Assess new notes* next to *Assess new inspiration*.

### M3 · Collaborators through agents, no shared app
An editor or writer installs Solo Ops, points their agent at the same
private data repo (`node solo.js backup --remote …`), and the two agents
hand work back and forth through the files. Needs: per-person `source`
in the log, a "mine / theirs" filter on Home, conflict rule when both push
(last writer wins per file + a note in the log), and M5.

### M4 · Pull from the apps the agent is connected to
Nothing to build in Solo Ops beyond prompts: "take my last 20 emails and
make tasks", "put this week's calendar as posts". Add a *Bring in* category
to the Guide with 4–5 such prompts, and document the pattern in AGENTS.md.
*Turn this conversation into tasks* (`/capture`) is the first of these.
Also wanted: an *Across all my projects* weekly prompt, which needs a
cross-workspace context token.

### M5 · Briefing packs — `node solo.js brief --for <role>`
A filtered snapshot (this workspace, open work only), AGENTS.md, the role's
prompts, and a one-paragraph "how we work" from `solo.config.js`. Output as
one Markdown file to hand to a person or paste into their agent.

### M6 · Telegram (and WhatsApp the same way)
Design in `docs/telegram.md`: `/add`, `/done`, `/next`, and any link or
photo into Inspiration. A small Node process beside `serve.js`, token in
`data/settings.json` (never in the repo).

### M7 · Phone install, still local
`node serve.js --host` plus a QR code on Home; the phone on the same wifi
installs the PWA. Needs: bind to the LAN address with a one-line warning,
QR rendered without a dependency, capture strip and boards usable at
375px.

## Minor / issues

- **Launch kit docs (hygiene review 2026-10-13):** `docs/launch/SHOTLIST.md`
  names `shoot.sh` / `seed.sh` (the files are `.js`), says shots land in
  `docs/screenshots/` (they go to `docs/screenshots/launch/`, git-ignored;
  `shoot.js --out` should default there) and documents `video/` without
  saying it is local only. Left to the session editing those files.

- **Home, after launch (owner review 2026-10-13):** a layout pass — one header
  row (title · scope · actions), projects as compact rows past two, This week
  in two columns (Tasks in play with actions | Schedule + posts), a quieter
  source tag in Recent changes and "loaded from file" instead of "deleted" when
  sample content yields to the file, the first-run banner only while every
  project is sample, a project picker on the quick-add. The owner name lives in
  `solo.config.js` for now; move it to `data/settings.json` so Home can edit it
  in place. Naming: the nav says *Workspace*, Home says *Projects*; pick one.
  The Calendar's Share today offers one scope; give it every project like Home.

- **Guide, after the ask box (design reviewed 2026-10-13, tech + usability):**
  (1) *Ask AI* on items: a button in the task card **header** row (the footer
  only renders on expanded cards; new tasks are collapsed), on the selected
  post in the social detail panel, beside Copy for AI in both viewers; plus
  right-click on a card as the shortcut, never the only route. Opens the Guide
  on Ask with one chip, "This task: <title>", a status line "Asking about:
  <title>" with × to detach, cursor in the box. Needs `Guide.askAbout(kind,
  id)` using the `pendingSlug` pattern (open() re-renders twice) and a
  `Context.item(kind, id)` builder by id (posts are matched by title today).
  (2) A **"My AI already has the setup text"** switch in Settings that drops
  the preamble and reply legend from every copy. Exact-string removal must
  happen inside `prompts()` (same `o` as `P.build`), chat mode only, and
  custom prompts carry the head baked in from the editor; cut from launch
  because a user who pasted the setup into a plain chat flips it and the next
  day's chat answers in prose. (3) Prompts as presets that fill the ask box,
  "Save as prompt" from the box, a simpler prompt editor. (4) Paste-anywhere
  into Reply (⌘V with no field focused): conflicts with the capture strip,
  which saves such a paste to Inspiration; rule: text `Apply.segment()` parses
  as commands goes to Reply while the Guide is open. (5) After Apply, each
  change links to and flashes its card (apply.js returns labels, not ids).

- **Meetings pile into To Do** (UX review 2026-10-13). Four meetings and a
  dentist sit between real work on the board. Group `meeting`-tagged cards
  under a collapsed *Meetings (n)* strip at the bottom of To Do, or hide them
  behind a chip by default, since the Calendar is their home.
- **Date pickers**: the board's When field accepts "due fri" as text, but
  picking a date with the button writes a plain date-time and so turns the
  deadline into a timed task; give the add row a separate Deadline picker
  or a Time/Deadline toggle. Firefox and macOS Safari show no popup for
  `type=time` (the Until button there just focuses the field).
- **Calendar, later**: Week view with time blocks; drag to reschedule in
  Month; a now-line; auto-tick a meeting whose end has passed (with undo).

- **Backup repo name is not offered.** `node solo.js backup setup` creates
  `solo-ops-data` unless `--name <name>` is passed, but nothing asks. Offer
  the name: the `/setup` and `/backup-setup` prompts should ask "private repo
  name? (default solo-ops-data)" alongside GitHub-or-folder, the Guide's
  Protect your work option 2 should show the `--name` flag with the copy
  button, and `backup setup` itself should print the name it is about to
  create and how to change it before creating.

- **From the Home/Share reviews (2026-10-13), not done:** a week-ahead glance
  (Mon–Sun with dots for meetings and posts) on Home; keyboard shortcuts `n`
  new task, `/` focus the capture strip; a size toggle on the share card
  (square only today); Recent changes on Home only knows edits made while a
  page was open (the file log covers the rest, under *Restore a file*);
  another origin's theme is applied on first contact (sync.js applies
  settings.json like any file); Firefox below 127 cannot copy an image, the
  dialog saves the file instead and says so. The sync pill still says
  "Synced to data/"; "Saved to your folder" reads better for non-technical
  users.
- **Fresh folder, server running, no data files yet**: every page logs one
  404 per missing data file in the console. Harmless; `serve.js` could answer
  204 for a missing data file instead.

- **Home**: peeks every workspace file and logs a 404 for apps whose file
  does not exist yet (e.g. `launch-writing.json`). Harmless; skip the peek
  when the app has never been opened.
- **Inspiration**: a PNG screenshot's thumbnail can be as large as the
  original (PNG at 640px). Use JPEG when the PNG thumbnail is not at least
  30% smaller, keep PNG only for transparency.
- **Social images** still use their own browser store
  (`social-image-store.js`) instead of `core/attach.js`; migrate so posts
  get thumbnails + originals on disk the same way inspiration and notes do.
- **CLI `inspo show`** does not print `name`/`size`/`stored` for file items.
- **`doctor --fix`**: delete orphan attachments and set missing
  `updatedAt` on request.
- **Revert from Home → Recent changes** restores a whole file to that
  moment; the confirm should say what later changes to that file will be
  lost (until M1 replaces it for everyday use).
- **Service worker** logs "unknown error fetching the script" inside some
  embedded browsers (Claude's preview pane). Not reproducible in Chrome;
  guard registration with a try/catch and stay quiet.
- **Never verified by hand**: the file:// linked-folder flow (File System
  Access API) end to end, and dragging an image from another app's window
  into the capture strip. Both are code-reviewed only.
- **Theme fonts** load from Google Fonts; offline or on file:// without a
  network the presets fall back to system fonts. Consider bundling Inter
  and Lato under `fonts/` (license allows it).
- **README screenshots** predate the new logo and the Protect block;
  retake with `docs/screenshots` script when M2 lands.

## Done

- 2026-10-13 · Fresh-install pass before the announcement (a clone followed
  the README step by step, plus a repo hygiene review). `node serve.js` on a
  taken port says so and suggests `--port` instead of a stack trace;
  `--help` works. Untouched sample data no longer lands in `data/` the first
  time a served page opens (it stays in the browser until the user changes
  something or runs `template all`), so `doctor` keeps saying "fresh install"
  and the inbox shows nothing the user did not save. `log` and `revert` show
  local time. `doctor` exits 0 when the only issue is a missing backup.
  README terminal examples run as written (`--ws launch` was a project id,
  `start "launch post"` was ambiguous), the first write of a file is noted as
  having no snapshot, `prompts export --for codex` says it writes to
  `~/.codex/prompts`. `npm test` runs every test file; CONTRIBUTING names the
  guard; SECURITY lists `data/exports/`; LICENSE says Solo Ops.

- 2026-10-13 · Privacy: the committed `/use-inspo` slash command carried the
  owner's edited prompt text (export applied `data/prompts.json` overrides to
  the shared files). `prompts export` now writes the built-in text to the
  shared files and the user's edits of built-ins to `mine/` (git-ignored,
  `/mine:<name>`), and `guard` refuses a shared command whose text differs
  from the built-in export. Found by a fresh-clone test before the
  announcement.

- 2026-10-13 · README and About for launch: new copy (one folder, your own
  AI, who it is for, three ways in), eight fresh screenshots from a seeded
  scratch copy, roadmap in step with `about.html` and M9/M10. Launch film
  and launch screenshots stay out of the repo (`.gitignore`). Sample data
  yielding to a file is no longer logged as agent deletions, and the fresh
  flag clears after that first apply so later agent/CLI edits are logged
  (`core/sync.js`, `Store.clearFresh`). Overdue chip readable in dark
  palettes (`--on-accent`). `doctor | health` in help.

- 2026-10-13 · Home: owner name, scope, Start/Done across projects, create →
  Home. `owner` in `solo.config.js` makes the title "Anshuli’s workspaces"
  (the brand moves to the eyebrow; `/setup` asks for the name). Creating a
  project now lands on Home with a toast saying Board and Calendar switched to
  it (the "my data is gone" report was the app switching projects, nothing on
  disk changed); an empty board names the other projects and their open
  counts. The Today strip gets scope chips (All · each project) that filter
  Today, This week and Recent changes, remembered per browser. Tasks in play
  rows get ▶ Start / ✓ Done for any project: `Quick.setCol` writes the browser
  copy at once and, with a server or linked folder, re-applies the change on
  the file itself (the file is the copy that counts for a board this page did
  not pull). Share today offers every project plus All.

- 2026-10-13 · Launch screenshots: `docs/launch/SHOTLIST.md` (the script), `seed.js`
  (the Pocket Studio sample project), `personas.js` (Tomas · Noor · Lena, the
  three hero workspaces), `capture.sh` (real CLI output for the terminal
  frames), `mock/chat.html` + `mock/term.html` (reproductions with verbatim
  content), `mock/frame.html` + `shoot.js` (headless Chrome, 1440×900 @2×).
  57 images in `docs/screenshots/launch/` (local only, git-ignored like the
  film; README images live in `docs/screenshots/`) plus the week
  (`week.js`/`week.sh`: one week of the sample project run step by step with
  the real CLI, a frame shot between steps). The launch video (60 s,
  `docs/launch/VIDEO-SCRIPT.md`, reviewed by a tech-marketing and a copy
  reviewer before the build), a 46 s teaser and the earlier 72 s film in
  `docs/launch/video/` (Remotion, synthesised soundtracks). README pass still
  to come.
- 2026-10-13 · Calendar: boards created at runtime were missing on a fresh
  browser's first load (the registry `boards.json` lands silently, so the
  calendar never registered their files until a reload). Found while shooting
  the week; fixed in `calendar/calendar-main.js` by re-registering on the
  registry's `applied` event.

- 2026-10-13 · Guide: ask box + blanks fix (plan reviewed by a tech and a
  usability agent before building; scope cut to what both agreed). The field
  pile on prompt cards was a bug: `blanks()` read the reply legend's notation
  (`<task>`, `<when|clear>`…) as fields, so 23 of 27 Ask prompts showed up to nine
  bogus inputs in chat mode and *Fill my calendar* showed seven in files mode.
  Now `P.blanks()` (core/prompts.js) ignores the legend and anything inside
  backticks; `core/test-prompts.js` asserts 4 one-field Ask prompts in chat mode
  (list, draft, idea, your week) plus the folder path in *Set up this folder*,
  3 in files mode, zero elsewhere. New at
  the top of **Ask**: *Ask your AI* — one box in plain words, "Sends along"
  chips named after the item ("This task: …", "This board", "My schedule"…,
  defaults per page), **Copy for my AI** composes preamble + each chip's
  context + `WHAT I WANT:` + the sentence + the reply legend (files mode: no
  legend, a line about `node solo.js show <id>`); the box and chips survive
  the Guide's async re-renders; Reply then reads "Your ask copied…". Chat mode
  shows *New chat? Paste this first, once.* with Copy setup above the box.
  Reply placeholder: "Paste the whole answer here. The changes are picked out
  for you, and nothing happens until you press Preview."
  Footer button on other tabs: *Paste the answer*. "Recent context" chip
  renamed *Recent changes*. Prompt texts and the slash-command export are
  byte-identical. A Node harness ran every verb of the reply legend through
  `core/apply.js` against an in-memory store and found two real bugs, fixed:
  `at <task> fri 10:00 --until 11:00` was not recognised as a command (the
  *Plan today* answers would have been ignored), and a `scripts add` /
  `notes add` whose body block followed the commands block (how every chat AI
  formats it, often with a ```markdown tag or a "Here is the script:" line)
  produced an empty script or note. `bodyAfter()` now tracks fences; preview
  units for scripts and notes are self-contained. A user's edited or own
  prompt that carries `{{snapshot}}` but no reply legend now gets the legend.

- 2026-10-13 · CLI: `check <task> <n>` ran `doctor` (the alias `check: cmdDoctor` came
  later in the command table and won). The doctor alias is now `health`.

- 2026-10-13 · Share today + Home as a dashboard (reviewed twice before
  building). `core/share-card.js`: a 1080×1080 card of today (Doing · Schedule
  · Next up, titles only, light palette, system fonts, streak only from 7 days)
  built as SVG, drawn to canvas, **Copy image** (clipboard, Safari-safe),
  **Copy as text**, **Save as file** into `data/exports/today-<date>.png`
  (`Sync.saveFile` carries a Blob; `serve.js` accepts png). Same text from
  `node solo.js share today [--all]`. Home rebuilt around a **Today strip**
  (date, now / next with "in 2 h", Doing with project chips, overdue · done
  today · due · meetings · posts this week, quick add with a date at the end
  via `Quick.addLines`, Share today · Calendar · Plan today), one card per
  project (Doing or Next, progress, chips) opening `overview.html` (boards,
  apps, rename / apps / remove — the old "Open project" block), *This week*
  grouped by project without ids, Recent changes in plain words from the
  browser's events with the file log folded under *Restore a file*, activity
  heatmap collapsed, terminal block reduced to a footer line, "project"
  on every Home label. Home's script moved to `core/home.js` (+ `home.css`),
  covered by the `node --check` loop. Fixed on the way: a typo in `?ws=`
  no longer becomes a phantom workspace whose files pages would create;
  theme writes carry a log note, do not bump activity, and a browser that
  never chose a theme adopts the file instead of asking; `serve.js` does not
  log a write that differs only by `updatedAt`; `Guide.openPrompt(slug)`;
  Share today on the Calendar toolbar and in ⌘K; quick-add activity is
  credited to the right board. After the post-build reviews: Home registers
  the open project's boards (a quick add writes the file at once and an
  agent's edit redraws the strip), the quick add form is static markup so a
  background re-render never eats what is being typed, priority sorting
  treats high as high (`rank()`), *Copy as text* is plain text for chats,
  ended meetings drop off the card and read "ended" on Home, the Overview
  looks at a project without switching the open one (`data-no-persist` on
  its nav) and owns Rename / Apps / Remove in place, a deep link to a project
  the browser has not seen reloads once `workspaces.json` arrives, boards and
  workspaces files stay restorable. **Mono is the default palette** (owner's
  call): `solo.config.js`, `theme-boot.js`, the picker order, the sample
  settings and the CLI default say `mono`; the app icon, favicon, manifest
  colours and every page's `theme-color` follow (#222222 on #F2F2F2). Warm,
  paper, forest and dusk stay in the picker; a browser or `settings.json`
  that already chose a palette keeps it. Project chips keep their own hues
  (they come from `solo.config.js → projects`, not the theme).

- 2026-10-13 · M8 Calendar + dates. Tasks carry `at` / `until` / `due` / `ext`
  (`core/when.js` parses `tomorrow 14:00`, `fri 10:00`, `+3d 17:30`, zoned
  stamps → local; `normalize()` keeps the fields). CLI: `add --at --until
  --due --ext` (same `ext` updates instead of duplicating), `at`, `due`,
  `calendar [--days] [--all]`, Schedule block in `today`, By day in `week`,
  doctor warnings. Reply tab accepts the same (`at`/`due` only when the line
  ends in a date). New `calendar/` app: Agenda + Month, filters by board ·
  meetings · posts · open/done · all projects (other workspaces peeked
  read-only), tick to finish, + on a day, every file shown registered with
  sync. Nav Calendar for every workspace; the posts page is now Streak.
  Home: Schedule card. Guide: *Bring in* group with *Fill my calendar* and
  *Plan today around my meetings*, `{{schedule}}` token, calendar page
  prompts. Sample sprint has one meeting. Cut for release 1 (from review):
  Week view with time blocks, drag reschedule, writes across workspaces,
  ⌘K/Quick date token, `import`/`share` dates.

- 2026-10-13 · Backup as part of setup, for non-technical users: `node solo.js
  backup setup` (gh logged in → private repo `solo-ops-data` created and
  pushed; otherwise the two human ways), `backup --to <folder>` (plain copy
  into iCloud Drive / Dropbox, remembered in `data/backup.json`), `backup --daily`
  (launchd / crontab / schtasks line). Guide: pending *Save your data
  somewhere private* card on every tab until done, Protect your work shows
  the why and three ways with copy buttons, *Mark as done* for pages that
  cannot see the server. Guard message leads with the why; `guard
  --allow-data` for a private fork (checks visibility). `/setup` and
  `/backup-setup` prompts ask GitHub or folder before creating anything.

- 2026-10-13 · Privacy hard line + first run: `node solo.js guard [--install]`
  refuses commits that stage `data/`, exports or personal prompts (pre-commit
  hook); AGENTS.md *Privacy boundary* and *First run* sections; `/setup`
  prompt (asks three questions, then doctor → name → sample or plan → serve →
  week → private backup → guard); `today`/`week`/`doctor` say what to do next
  on an empty install.

- 2026-10-13 · Exports land in `data/exports/` (server `PUT /api/export/<name>`,
  linked folder via `Sync.saveFile`) instead of the browser's download folder:
  Export everything, board JSON + Markdown, the social bundle, and the safety
  copies before Load template / Clear / first-contact conflicts. Download stays
  the fallback on plain `file://`.

- 2026-10-13 · Guide prompts rebuilt from one source (`core/prompts.js`, shared
  with the CLI). Chat-mode prompts carry the reply format, so a fresh ChatGPT
  or Claude tab needs no setup; *Set up this chat* / *Set up this folder* in
  Settings; command-mode prompts name the folder path (server `/api/ping`,
  `file://` pathname). New: I'm stuck, Plan the week / Close the week,
  Am I overcommitted?, Cut scope to ship by a date, Turn this conversation
  into tasks, Post about what I just shipped, Repurpose this, Ten hooks for
  this; Safety prompts moved to Settings. `node solo.js prompts builtin |
  show | export [--for claude|cursor|codex|chat]`: every prompt is a slash
  command in `.claude/commands/` and `.cursor/commands/` (the user's own in a
  git-ignored `mine/`). `{{shipped}}` context token. `core/test-prompts.js`.

- 2026-10-12 · Nothing in `data/` is tracked any more (only SCHEMA.md); sample
  content comes from templates. Fixed: the Script and Writing viewers applied
  a newer file in memory only, so a reload brought the old library back.

- 2026-10-10 · Guide Quick tab: what are you doing (free text → the matching
  task moves to Doing, any project), add tasks one per line, top tasks across
  all projects with start / done / priority. Footer quick actions restored.
  Board columns can no longer push past the page.

- 2026-10-10 · `777d996` Guide redesigned by intent (was M2): Do · Reply · Settings,
  search, visible agent switch, groups collapsed, Reply status line, Settings
  with details folded away.

- 2026-10-10 · `54bfe7e` Guide tabs work before an agent mode is chosen;
  manifest only over http.
- 2026-10-10 · `d492846` About page, font presets, safer backups, `doctor`,
  attachments with originals on disk.
