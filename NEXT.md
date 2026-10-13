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

**After**: M3, M5, M6, M7, the rest of M4. Freeze everything else and spend
the remaining time on the first-run path.

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

### M6 · Telegram
Design in `docs/telegram.md`: `/add`, `/done`, `/next`, and any link or
photo into Inspiration. A small Node process beside `serve.js`, token in
`data/settings.json` (never in the repo).

### M7 · Phone install, still local
`node serve.js --host` plus a QR code on Home; the phone on the same wifi
installs the PWA. Needs: bind to the LAN address with a one-line warning,
QR rendered without a dependency, capture strip and boards usable at
375px.

## Minor / issues

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
