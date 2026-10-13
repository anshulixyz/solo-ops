# Next — features and issues

The working list for Solo Ops. Anyone (person or agent) picking up work
starts here. Keep it honest: move an item to **Done** with the commit hash,
add issues as you find them, keep the order meaning priority.

How to take an item: say which one in your PR or commit title
(`Guide: three tabs by intent (NEXT #M2)`), keep `AGENTS.md` and `README.md`
in step with what you change, and run `node solo.js doctor` plus
`node social/test-social-save.js` before you call it done.

## Major

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

- **Backup repo name is not offered.** `node solo.js backup setup` creates
  `solo-ops-data` unless `--name <name>` is passed, but nothing asks. Offer
  the name: the `/setup` and `/backup-setup` prompts should ask "private repo
  name? (default solo-ops-data)" alongside GitHub-or-folder, the Guide's
  Protect your work option 2 should show the `--name` flag with the copy
  button, and `backup setup` itself should print the name it is about to
  create and how to change it before creating.

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
