# CURRENT.md — pick-up-and-go state

Single source of truth for **what this repo is, how it's built, and how to work
on it safely**. Read this first (then `README.md` for the user-facing summary).

Last updated: 2026-07-13.

---

## 1. What this is

A **single-page, zero-dependency Kanban board** ("5-Day Runway") for solo-founder
ops. Pure HTML + CSS + vanilla JS. **No backend, no build step, no install** —
you open `runway/marathon-board.html` directly (double-click / `file://`) and it runs.
All data lives in the browser's `localStorage`, with JSON export/import as the
only way data leaves or enters.

Private repo: `github.com/anshulixyz/runway-board` · branch `main`.

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
  marathon-board.html   # structure + font links + <script> includes (load order matters)
  CURRENT.md            # this file
  README.md             # user-facing overview
  styles.css            # all styles + theme tokens (shared with social/)
  store.js   -> global `Store`   persistence: localStorage w/ in-memory fallback
  model.js   -> global `Model`   data: seed, migration/normalize, state + all mutations
  view.js    -> global `View`    rendering only (HTML out, no state mutation)
  main.js    -> (handlers)       UI state, event handlers, drag&drop, theme, init
```

Repo hub: `../index.html` · Agent map: `../AGENTS.md` · Social apps: `../social/`

**Load order in the HTML is significant:** `store → model → view → main`. Each
file attaches one global; later files depend on earlier globals.

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

`localStorage` keys:
- `anshuli.runway.v2` — the whole board (JSON array of tasks).
- `anshuli.runway.projects.v1` — user-added project names (array of strings).
- `anshuli.runway.theme` — `'light'` | `'dark'`.

Task shape:

```js
{
  id, title, desc,
  proj: 'openDM' | 'nextmillion' | 'general',
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

The **built-in seed** (`Model.seed()`) is the user's latest real board. If you
change the model shape, update `seed()` and `normalize()` together, and consider
bumping the storage key (`v1` → `v2`) only as a deliberate migration.

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
  defaults ∪ user-added (persisted under `anshuli.runway.projects.v1`) ∪ any
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
- Light/dark theme (respects `prefers-color-scheme`, remembered).
- `localStorage` with safe in-memory fallback when storage is blocked.

## 6. Save / Load / Reset — data-safety behavior (READ BEFORE TOUCHING)

- **Save file** (`exportState`) → downloads `runway-board-<timestamp>.json`
  containing the full board (all fields — verified lossless round-trip).
- **Export MD** (`exportMarkdown`) → downloads the currently visible,
  filtered tasks from the active tab. Board exports To Do + Doing; Later and
  Bucket export their own items. Done tasks are always excluded. Each task
  includes status, project, priority, tags, description, checklist/progress,
  notes, and task ID.
- **Load file** (`importState`) → validates the JSON is an array of
  `{id,title,…}`, **confirms** before replacing, then `Model.replaceAll()`
  (which normalizes). Round-trips every field.
- **Reset** (`resetBoard`) → **destructive**: replaces the entire board with the
  seed and clears all your tasks/notes/checklists. To make this non-losable, it
  now **auto-downloads a backup of the current board first**, then resets, then
  tells you the backup was saved. Flow: `confirm → downloadBoard() → Model.reset()`.
  **If you edit reset, keep the auto-backup-before-wipe.** `downloadBoard()` is
  the shared helper used by both Save and the Reset backup.

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
  `--h` and let CSS shade it (so custom tags/projects + theme all work). Keep the
  three category *treatments* distinct (priority=saturated, project=neutral+dot,
  tag=`#`soft) so they're never mistaken for each other.
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
  with the video + launch sprint (nmai HN/PH next week, openDM surprise reveal
  ~1wk after). New tags: `f1`–`f4` (video formats: face+screen, launch film,
  raw screen demo, Remotion concept piece) and `daily`. Old v1 boards still
  import cleanly via Load file. Header updated for the two-launch runway.
- **Filtered Markdown + Bucket List (2026-07-13):** project/tag filters became
  multi-select, visible non-Done tasks can export to detailed Markdown, and a
  full-task Bucket List was added for video/demo ideas.
