# Solo Ops — agent contract

You are working in a Solo Ops folder: local tools for a solo builder's tasks,
posting schedule, video scripts and drafts. Everything is plain files. This
document is the whole contract; read it once and you can operate the system.

## Where the data is

| File | Holds | CLI group |
|------|-------|-----------|
| `data/workspaces.json` | workspaces created at runtime (config ones are implicit). A workspace = one project with its own apps, boards and files | `workspaces …` (`--ws <id>` on any command) |
| `data/<board>.json` (default `runway.json`; other workspaces `<ws>-<board>.json`) | one board's tasks (`todo` `doing` `done` `later` `bucket`) | `today` `week` `list` `add` `done` … (`--board <id>`) |
| `data/boards.json` | boards created at runtime, each tagged with its `ws` | `boards …` |
| `data/social.json` (`<ws>-social.json`) | scheduled posts with copy, prep, posted stats | `social …` |
| `data/scripts.json` (`<ws>-scripts.json`) | video scripts (Markdown text) | `scripts …` |
| `data/writing.json` (`<ws>-writing.json`) | drafts / notes with `~~cut~~ ++add++ [[note]]` markup | `notes …` |
| `data/inspiration.json` | the inbox: links, ideas, images the user wants to keep, tagged with a workspace | `inspo …` |
| `data/log.jsonl` | every change with who/when/what + previous content; revertable | `log`, `revert <id>` |
| `data/activity.json` | per-day change counts, last-active stamps (written automatically) | `activity` |
| `data/settings.json` | theme | `theme …` |
| `solo.config.js` | apps on/off, boards, projects, tags, post types, labels, idle hours, default theme | `config` |

Schema with every field: `data/SCHEMA.md`. Every data file carries
`updatedAt` (ISO 8601 UTC); sync uses it to decide which side is newer.

## How to change things

1. **Prefer the CLI** — it validates, stamps `updatedAt`, and logs the change.
   Always pass `--as agent --note "<why>"` so the user can see and revert
   what you did (`node solo.js log`):
   ```bash
   node solo.js workspaces               # which projects exist; add --ws <id> to any command (default: first)
   node solo.js week --json              # read the whole picture (every board of the workspace)
   node solo.js boards                   # which boards exist; add --board <id> to any task command
   node solo.js add "Title" --proj launch --pri high --tags content --steps "a|b" [--board <id>]
   node solo.js done <id or title> ; start … ; move … later ; pri … high
   node solo.js step <task> "text" ; check <task> 2 ; note <task> "text" ; tag <task> +x -y
   node solo.js social add "Title" --at 2026-10-20T09:00 --type launch --copy "…"
   node solo.js social posted <post> --url … ; social prep <post> "item"
   node solo.js scripts add "Title" --file script.md ; notes add "Title" --file draft.md
   node solo.js import list.md           # bulk: "- [ ] item" lines → tasks
   node solo.js inspo list ; inspo add "https://… #tag" --ws <id> ; inspo use <item> --as task|post|script|note
   node solo.js inspo ai --into tasks    # the inbox as a brainstorm prompt
   node solo.js log ; revert <id>        # see / undo any change (yours included)
   node solo.js help                     # everything else
   ```
2. **Editing JSON directly is fine** for bulk changes. Keep ids stable, keep
   the shapes in `data/SCHEMA.md`, and set the file's `updatedAt` to now.
3. Open pages notice file changes within a few seconds when the user runs
   `node serve.js` or has linked the folder. Otherwise tell the user to click
   **Load file** or the sync pill → **Reload from files**.

## Conventions the user relies on

- Workspaces are projects; the first one in config owns the short file names.
  Ask which workspace when the user has more than one and it is not obvious.
- Boards are instances: the same columns, different files. Default = first
  board in config. Never move tasks between boards by editing ids; add + rm.
- `doing` means in progress now; keep it short. `later` is parked, `bucket` is
  ideas. Priority is `high | medium | low`. Tags are lowercase free text.
- `today`/`week` start with an activity line. If it says idle, lead with the
  smallest next step; the user wants a nudge, not a lecture.
- A weekly review = `node solo.js week`: Doing, To Do by priority, posts in
  the window with open prep, studio activity. Summarise, then propose moves.
- Posts: `draft → ready → scheduled → posted`. Marking posted unlocks stats.
- Scripts follow `# Title / ## Hook / ## Script (numbered beats) / ## Inserts /
  ## Prep`. Drafts use `~~remove~~`, `++add++`, `[[instruction for you]]` —
  when a note asks you to edit, answer by editing the text, not by explaining.
- **Inspiration flow:** the user drops links/ideas/images into the inbox (often
  by pasting into you first). When asked to "turn inspiration into…", read
  `inspo list --ws <id>`, propose concrete items, then create them with
  `inspo use` (keeps the link back) or `add` / `social add` / `scripts add`.
- Never delete or reset without the user asking. Every write is logged and
  `revert <id>` undoes it, but say what you changed anyway.

## Working on the code

- Static HTML + CSS + **classic** scripts (`<script src>`), openable over
  `file://`. No ES modules, no bundler, no `fetch` of local files, no npm.
- `core/` is shared: `store.js` (localStorage + change events + sample-data
  flags), `config.js` (reads `solo.config.js`, boards registry, app
  switches), `theme.js` (+ `theme.css`, `theme-boot.js`), `sync.js` (files ⇄
  browser), `activity.js` (daily log), `palette.js` (⌘K), `templates.js`
  (sample data, also `require()`d by the CLI). Load order inside a page:
  `solo.config.js → theme-boot → … → store → config → templates → theme → sync → activity → palette → app scripts`.
- Sync rules worth knowing: a file newer than the browser wins; a browser
  change writes the file; on first contact sample data yields to the file,
  registry files (`boards`, `activity`) merge, and real content on both sides
  asks the user and downloads the losing side as a backup.
- Each app keeps `model` (data + mutations) / `view` (render only) / `main`
  (handlers, sync registration, palette commands). Handlers are globals because
  markup uses inline `on*`. All user text goes through `esc()`.
- Add a new app by: a Store key, a `Sync.register({ file, key, read, apply })`,
  a `data/*.json` shape in `SCHEMA.md`, a CLI group in `solo.js`, a card in
  `index.html`.
- Sanity: `for f in core/*.js runway/*.js social/*.js studio/*.js *.js; do node --check "$f"; done`
  and `node social/test-social-save.js`.

## Attachments

Images added to inspiration items, notes and posts are stored in the app and,
when the user runs `node serve.js` or has linked the folder, also written as
files under `data/attachments/` (`inspo-<id>.png`, `note-<id>-<n>.png`,
`post-<id>-<name>`). Items reference them (`file` on inspiration items and
post assets, `files` on notes). Open them when they matter. Links are plain
URLs. If an item says an image is "in the app" only, ask the user to export
it (run the server) or upload it to you.

## If you are a chat agent without file access

The user pastes a SNAPSHOT (boards, posts, scripts, notes, inspiration) and
expects back ONE code block of `node solo.js …` lines (`add`, `done`,
`start`, `move`, `pri`, `step`, `check`, `note`, `social add|copy|prep|posted|move`,
`scripts add "title"` + a ``` block with the script, `notes add "title"` +
a ``` block, `inspo add`). The app applies that block directly. Keep titles
short, no ids for new items, never `rm` (it is ignored). A plain
`- [ ] task` checklist with indented steps also works.

## Per-folder docs

`runway/CURRENT.md` (deep dive on the board), `runway/README.md`,
`social/README.md`, `studio/README.md`, `data/SCHEMA.md`,
`prompts/agent-bootstrap.md` (for chat agents without file access).
