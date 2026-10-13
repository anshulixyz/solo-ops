# Handover — Solo Ops, pre-launch (written 2026-10-13)

For whoever picks this up next, human or agent: how we work, what shipped
today, what is next, and the traps. `NEXT.md` stays the live agenda; this
page is the context around it. Read `AGENTS.md` first if you have not.

## How we work (agreed with the owner)

- **Nothing major lands unverified.** Propose in a few lines, get a yes,
  build, then show proof: command output, screenshots, a round trip through
  the file. Small fixes may go straight in, but say what changed and how it
  was checked.
- **Review before commit.** Significant work gets two independent reviewer
  agents before it is committed: one technical (correctness, data loss,
  sync, security) and one product/usability (as a Trello user and as a
  schedule checker). Fix every finding or write it into `NEXT.md`, re-verify,
  then commit and push on the owner's word.
- **Commit and push only when asked.** One commit per approved batch, with
  a message that says what and why; `node solo.js guard` runs as the
  pre-commit hook and refuses anything personal.
- **The privacy hard line** (AGENTS.md → Privacy boundary): the user's
  content never enters this repo. The agent never bypasses the guard.
- **Verify on a scratch copy, not on the owner's data.** `rsync` the tree
  (excluding `.git`, `data`, `node_modules`, `.claude/commands/mine`,
  `.cursor/commands/mine`) into a temp folder, `node solo.js template all`
  there, add a temporary entry to `.claude/launch.json` pointing at that
  copy's `serve.js` on a spare port, and **remove the entry before
  committing**. The owner's own `node serve.js` runs on 4321; after
  changing `serve.js` it needs a restart to pick the change up.
- **Sanity before you call anything done:**
  ```bash
  for f in core/*.js calendar/*.js runway/*.js social/*.js studio/*.js inspo/*.js *.js; do node --check "$f"; done
  node core/test-when.js && node core/test-prompts.js && node social/test-social-save.js && node solo.js doctor
  ```
  After touching `core/prompts.js`:
  `node solo.js prompts export && node solo.js prompts export --for cursor && node solo.js prompts export --for chat`.

## What shipped on 2026-10-13 (all on `main`)

| Commit | What |
|---|---|
| `45b3335` | Guide prompts from one source (`core/prompts.js`); chat prompts carry the reply format; prompts as slash commands (`.claude/commands`, `.cursor/commands`); exports land in `data/exports/`; `node solo.js guard`; AGENTS.md *First run* and *Privacy boundary*; `/setup` |
| `d5e655a` | Backup as part of setup: `backup setup` (private GitHub repo via gh, or the two human ways), `backup --to <folder>`, `backup --daily`; pending card in the Guide; guard explains itself; `--allow-data` for a private fork |
| `38f51d9` | Launch agent without a working directory |
| `011ef9f`, `ec9915a` | NEXT: repo-name task; Release 1 scope and the M8 design |
| `4aaae1f` | **M8 Calendar + dates**: `at` / `until` / `due` / `ext` on tasks, `core/when.js`, CLI `add --at`, `at`, `due`, `calendar`, Schedule in `today`; the `calendar/` app (Agenda · Month · filters · tick · + Add); card date chip + popover; dates parsed out of titles everywhere; Home Calendar card; Guide *Bring in* group (`/fill-calendar`, `/plan-today`) |
| `60c308c` | Date pickers beside every date field (`core/datepick.js`) |
| next | **Share today + Home as a dashboard** (planned with a UI and a tech reviewer, built, reviewed again): `core/share-card.js`, `core/home.js` + `home.css`, `overview.html`; fixes for the phantom `?ws=`, theme log noise, png exports, `Guide.openPrompt` |

## Agenda (mirror of NEXT.md → Release 1)

- **Must before launch:** offer the backup repo name during setup
  (`backup setup --name` exists; the prompts and the Guide should ask).
- **Moved after launch (owner's call, 2026-10-13):** M1 undo/redo in the
  browser; the trimmed design is written under NEXT.md → Release 1.
- **Later:** meetings grouped under a strip at the bottom of To Do; Calendar
  Week view, drag to reschedule, now-line, auto-tick ended meetings;
  M3 collaborators, M5 briefing packs, M6 Telegram, M7 phone install.
- **Pre-launch testing still open:** the `file://` linked-folder flow end to
  end, and dragging an image from another app into the capture strip
  (both code-reviewed only). The legacy `anshuli.*` localStorage migration
  keys in `core/theme-boot.js`, `runway/model.js`, `social/*` are the
  author's old handle in code; harmless, remove when convenient.

## Launch screenshots

`docs/launch/SHOTLIST.md` is the script; `shoot.js` takes every shot with
headless Chrome against two scratch servers (a seeded copy on 4412, a fresh
`template all` copy on 4413, both temporary entries in `.claude/launch.json`
while shooting). Reseed with `seed.js` (Pocket Studio) or `personas.js`
(Tomas, Noor, Lena) into an EMPTY scratch `data/`, never the owner's; run
`capture.sh` after a reseed so the terminal frames quote the new ids. Chat
and terminal frames are reproductions whose content is verbatim and whose
reply blocks were checked through the Reply tab. Shots that write (board
expand, quick add, the dark theme) are made idempotent or silent; profiles
are wiped per run so stale ids never show as deletions.

## Traps and things to remember

- **`runway/model.js normalize()` is a whitelist.** Any new task field must
  be added there or the first browser edit silently erases it from every
  task (and the file follows). `core/apply.js add`, `cmdEdit`, `Quick`
  build tasks too.
- **Pages mirror `data/settings.json` as `{ theme }` only.** Anything else
  kept there is overwritten on the next theme change. CLI-only config goes
  to its own file: backup and guard live in `data/backup.json`.
- **Dates are local stamps without a zone**, `YYYY-MM-DDTHH:MM` or a date
  alone for all-day; `core/when.js` is the only parser. Overdue = deadline
  passed, or a timed item in the past with no end; an ended meeting is
  *past*. Posts keep "date alone = 09:00".
- **A meeting is a task** with `at` and the tag `meeting`. `ext` is the id
  a connected calendar gave it; `add --ext` updates instead of duplicating,
  which is what makes `/fill-calendar` safe to re-run.
- **The Calendar page registers every file it shows** with Sync (isFresh =
  key absent) so it never triggers the first-contact dialog; boards created
  at runtime register when `boards.json` arrives. Writes go through the
  Store key and carry a log note.
- **Prompts are keyed by title** for the user's overrides in
  `data/prompts.json` and for the Guide's next-best-moves; rename with care.
  The reply format in chat prompts must match what `core/apply.js` accepts;
  `core/test-prompts.js` checks it.
- **Backups:** `data/` is its own private git repo pushed to GitHub, plus a
  launchd job every evening; `backup --status` and `doctor` report both.
  A Claude Code session may be refused permission to create a GitHub repo
  on the owner's behalf; the owner runs `node solo.js backup setup`.
- **The exported slash commands say "the folder you are opened in"** on
  purpose; never commit an absolute path. Personal prompts export to the
  git-ignored `mine/`.
- **`.claude/launch.json` is tracked.** Only `marathon` (4321) and
  `marathon-verify` (4399) belong in it.
- **Home and Overview share `core/home.js`.** Every render step checks that
  its element exists (`$('id')`), so a section can be dropped from one page
  without touching the script. Inline `on*` handlers see form controls by
  id as variables: never give an input the same id as a global handler
  (that is why the quick add is `homeQuickAdd` + `#qaInput`).
- **The service worker caches the shell.** After changing a core file the
  open page shows "New version ready"; reload before judging a fix. After
  changing `serve.js` restart the server (exports of `.png` need the new
  regex).
- **Share today** reads only titles and never writes unless the user
  presses Save; the card is always the light palette and system fonts
  (an `<img>`-loaded SVG cannot see web fonts or CSS variables). Section
  spacing is in `svg()`; `fit()` measures text on a canvas and truncates
  with an ellipsis because SVG has no wrapping.
