# CURRENT.md — pick-up-and-go state

Single source of truth for **what this repo is, how it's built, and how to work
on it safely**. Read this first (then `README.md` for the user-facing summary).

Last updated: 2026-10-10 (open-source refactor).

---

## 1. What this is

A **single-page, zero-dependency Kanban board** for solo-builder ops, part of
the Marathon toolkit. Pure HTML + CSS + vanilla JS. **No backend, no build
step, no install** — open `runway/marathon-board.html` directly (double-click /
`file://`) and it runs. The browser's `localStorage` is the working copy;
`../data/runway.json` is the file agents and the CLI read and write
(see `../core/sync.js` and `../data/SCHEMA.md`).

## 2. How to run / develop

```bash
open "runway/marathon-board.html"     # macOS — or double-click it
```

There is **no dev server and no build**. Edit a file, refresh the browser.

**Hard constraint — keep it openable over `file://`.** That's why the JS is
loaded as **classic scripts** (`<script src>`), NOT ES modules. Do **not**
convert to `import`/`export` or `type="module"` — ES modules are blocked by the
`file://` CORS policy and would break double-click opening. Same for `fetch()`
of local files. Keep everything self-contained.

Optional sanity check before committing:

```bash
for f in *.js; do node --check "$f"; done   # syntax only
```

## 3. File layout & architecture

```
runway/
  marathon-board.html   # structure + <script> includes (load order matters)
  CURRENT.md            # this file
  README.md             # user-facing overview
  styles.css            # all styles + the default ('warm') theme tokens (shared with social/)
  model.js   -> global `Model`   data: template seed, migration/normalize, state + all mutations
  view.js    -> global `View`    rendering only (HTML out, no state mutation)
  main.js    -> (handlers)       UI state, handlers, drag&drop, sync registration, palette, init
../core/
  store.js     -> `Store`     localStorage w/ in-memory fallback + change events
  config.js    -> `Config`    reads ../marathon.config.js (projects, tags, labels)
  templates.js -> `MARATHON_TEMPLATES`  sample data (also required by the CLI)
  theme.js     -> `Theme`, global toggleTheme()   mode + palette, picker
  sync.js      -> `Sync`      data/*.json ⇄ browser (server / folder / manual)
  palette.js   -> `Palette`   ⌘K command palette
```

Repo hub: `../index.html` · Agent contract: `../AGENTS.md` · Social apps: `../social/`

**Load order in the HTML is significant:** `marathon.config.js → theme-boot`
in `<head>`, then `store → config → templates → theme → sync → palette → model
→ view → main`. Each file attaches one global; later files depend on earlier
ones.

**Data flow (one direction):**

```
user event → global handler in main.js → Model.<mutation>() (mutates + persists)
           → render() in main.js → View.render(...) rebuilds the DOM
```

- `main.js` owns **ephemeral UI state**: `view`
  (`'board'|'later'|'bucket'`), multi-select project/tag filter Sets,
  `notesOpen` (Set of ids), and the add-panel tag picker state
  (`pickerTags`, `newTags`).
- `model.js` owns **durable state**: the task array + every mutation, and it
  persists to `localStorage` on every change.
- `view.js` is **pure rendering** — it reads `Model.getState()` and writes DOM.
  It never mutates state.
- Inline `onclick="..."` in generated markup calls the **global** handlers
  defined in `main.js`. If you rename a handler, update the markup that
  references it (grep both `view.js` and `marathon-board.html`).

**Rendering is full-innerHTML re-render** on each change (fine at this scale).
Two deliberate exceptions that must NOT trigger a re-render (they'd lose input
focus): the notes textarea (`onNotesInput` saves silently) and the checklist
"add step" / tag inputs.

## 4. Data model & storage

`localStorage` keys (per board, `<id>` from `?board=`):
- `marathon.board.<id>` — the whole board (JSON array of tasks). The `runway`
  board migrates once from `marathon.runway.v3` / the legacy `anshuli.runway.v2`.
- `marathon.board.<id>.projects` — user-added project names (array of strings).
- `marathon.boards` — boards created at runtime (`../data/boards.json`).
- `marathon.theme` — `{ mode, palette }` (shared by every app, owned by core/theme.js).
- `marathon.sync.meta` — per-file `updatedAt` stamps used by core/sync.js.

File: `../data/<id>.json` = `{ version, updatedAt, projects, tasks }`. Any
`Store.set` on the two board keys schedules a write; a newer file on disk
replaces state via `Model.replaceAll(tasks, { silent: true })` + re-render.

Task shape:

```js
{
  id, title, desc,
  proj: 'general' | 'launch' | 'content' | <any project from config or added>,
  col:  'todo' | 'doing' | 'done' | 'later' | 'bucket',
  pri:  'high' | 'medium' | 'low',
  tags: ['coding', 'video', …],   // any number, free-text; colored by hue
  notes: '',                       // private rough-ideas notepad
  collapsed: true,                 // per-card collapse state
  checklist: [{ text, done }]
}
```

**Migration is automatic** in `Model.normalize()` (runs on every load/import):
- legacy `type` (string) → becomes a `tags` entry;
- tasks mentioning video/recording get a `video` tag **once** (skipped as soon
  as a `tags` array exists, so user edits stick);
- missing `notes` → `''`, missing `collapsed` → `true`.

The **built-in seed** (`Model.seed()`) is the generic sample sprint from
`../core/templates.js`. If you change the model shape, update the template,
`normalize()`, `../data/SCHEMA.md` and the CLI together, and bump the storage
key only as a deliberate migration.

## 5. Features (current)

- Collapsible cards; collapsed = compact row + **circular progress ring**
  (checklist %). Per-card chevron + global **Collapse/Expand all**. Persisted.
- Board (`todo/doing/done`) + **Later** parking lot + a separate **Bucket List**
  for video/demo ideas. All three use the same full task fields. Drag & drop +
  `←/→` moves.
  Add-panel Column dropdown can drop a new task straight into Later; a Later
  card has a **"→ To Do"** button (`sendToBoard`) to promote it onto the board.
- Per-card checklists with progress meter; add/remove steps inline.
- **Three distinct chip "tones" so categories never get confused** (see §7):
  - **Priority** (select) — mono/uppercase, saturated: High=solid, Med=soft,
    Low=outline. Urgency tone.
  - **Project** (`.tag.proj`) — sans/sentence-case, neutral chip + colored dot.
    Structural tone. Hue via `projHue()`.
  - **Tag** (`.tag.hue`) — mono/uppercase, soft pastel `#hue` fill. Descriptive
    tone. Hue via `hueFor()`.
- **Multiple tags per task.** Add-panel uses a **click-to-select chip picker**
  + custom-tag input (NOT a `<datalist>` — that broke on comma-separated
  multi-values). Inline add/remove on cards.
- **User-addable projects.** Projects are dynamic: `Model.getProjects()` =
  config projects ∪ user-added (persisted under `marathon.runway.projects`) ∪ any
  project seen on a task. Add via the add-panel "New project" input
  (`addNewProject` → `Model.addProject`).
- **Multi-select filters:** by project and by tag (two rows). Multiple values
  within one group match with OR; project and tag groups combine with AND.
  Clicking `all` clears that group. Both rows are built from what's in use and
  kept in sync; project filter chips carry a dot, tag chips don't.
- **Move between board & Later both ways:** Later cards have **"→ To Do"**
  (`sendToBoard`), board cards have **"→ Later"** (`sendToLater`).
- **Bucket List workflow:** create a task directly in Bucket List, send Board or
  Later items there with **"→ Bucket"**, and promote a Bucket item to To Do.
  Later and Bucket items are excluded from sprint progress.
- **Per-task notes** — hidden by default, click **notes** to open/edit,
  autosaves. When a note exists the **notes button is highlighted** (accent
  background + dot); `onNotesInput` toggles the `has-notes` class live.
- Priority dropdown per card; cards sort by priority.
- Theme: mode (auto/light/dark) × palette presets, shared across apps
  (`../core/theme.js`), mirrored to `../data/settings.json`.
- `localStorage` with safe in-memory fallback when storage is blocked.
- **⌘K command palette** (`../core/palette.js`): `add <title> @proj #tag !high
  >later`, `done`, `start`, `move … <col>`, `find`, `rm`, views, export, sample.
  Shortcuts: `n` add, `1/2/3` views, `/` palette.
- **Sync pill** (`../core/sync.js`): served → writes `data/runway.json` on every
  change; linked folder (Chromium, file://) → same via File System Access API;
  otherwise Save/Load file.

## 6. Save / Load / Reset — data-safety behavior (READ BEFORE TOUCHING)

- **Save file** (`exportState`) → downloads `runway-<timestamp>.json` in the
  same `{version, updatedAt, projects, tasks}` wrapper as `data/runway.json`,
  so it can be dropped into `data/` directly.
- **Export MD** (`exportMarkdown`) → downloads the currently visible,
  filtered tasks from the active tab. Board exports To Do + Doing; Later and
  Bucket export their own items. Done tasks are always excluded. Each task
  includes status, project, priority, tags, description, checklist/progress,
  notes, and task ID.
- **Load file** (`importState`) → accepts the wrapper or a bare legacy array
  of `{id,title,…}`, **confirms** before replacing, then `Model.replaceAll()`
  (which normalizes). Round-trips every field.
- **Sample** (`loadTemplate`) and **Start blank** (`clearBoard`, palette) →
  **destructive**: replace the entire board. Both **auto-download a backup of
  the current board first**. Flow: `confirm → downloadBoard() → Model.reset()`.
  **If you edit these, keep the auto-backup-before-wipe.** `downloadBoard()` is
  the shared helper used by Save and the backups.
- **Sync first contact** (`core/sync.js`): when a data file exists and the
  browser has no sync stamp yet, identical content just adopts the stamp,
  sample content yields to the file, and real local content asks the user
  (backup downloads before loading the file).

`localStorage` is per-browser and easy to lose (cleared cache, other machine,
private window). Encourage exporting; treat Reset/Load as the only destructive
actions and always back up before them.

## 7. Conventions / gotchas

- **Classic scripts only** (see §2). No modules, no bundler, no `fetch` of local
  files.
- **All user text is HTML-escaped** via `esc()` in `view.js` before insertion.
- **Handlers are global** (attached to `window`) because markup uses inline
  `on*`. Keep new handlers global and defined in `main.js`.
- **Chip colors:** never hard-code per-value colors — emit a hue via inline
  `--h` (from `Config.projectHue` / `Config.tagHue`) and let CSS shade it. Keep
  the three category *treatments* distinct (priority=saturated,
  project=neutral+dot, tag=`#`soft) so they're never mistaken for each other.
- **Store.set with `{ silent: true }`** skips change listeners — use it only
  when applying data that came *from* the file (otherwise sync writes it back).
- **No re-render inside text inputs** (notes/step/tag inputs) — it drops focus.
- Fonts load from a CDN (Google Fonts); there's no offline fallback yet.

## 8. Scope / next candidates

See `README.md` "Scope of improvements" for the full list. Most-requested next
steps: inline edit of title/desc, due dates, search, and archive for done tasks.

---

### Change log (high level)
- Modularized single HTML → `css/` + `js/{store,model,view,main}`.
- Added collapsible cards + progress ring, multiple tags, per-task notes.
- Replaced broken comma/datalist tag entry with a chip picker; per-tag hue
  colors; added a tag filter row.
- Made **Reset auto-download a backup** before wiping. Verified JSON
  export/import round-trips every field losslessly.
- **v2 sprint board (2026-07-09):** storage key bumped `v1 → v2`; seed replaced
  with a two-launch video sprint. New tags for video formats and `daily`. Old
  v1 boards still import cleanly via Load file.
- **Filtered Markdown + Bucket List (2026-07-13):** project/tag filters became
  multi-select, visible non-Done tasks can export to detailed Markdown, and a
  full-task Bucket List was added for video/demo ideas.
- **Open-source refactor (2026-10-10):** `store.js` moved to `../core/`;
  projects/tags/labels/milestones read from `../marathon.config.js`; seed is
  the generic template; storage keys renamed to `marathon.*` with one-time
  migration; data mirrors to `../data/runway.json` via `core/sync.js`; ⌘K
  palette, keyboard shortcuts, theme palettes; Reset became Sample / Start
  blank; CLI `../marathon.js` operates on the same file.
