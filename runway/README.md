# Boards — kanban

One page, many boards. **To Do / Doing / Done**, a **Later** parking lot, and
a **Bucket List** for ideas. Collapsible cards with checklists, priority,
project chip, tags, private notes, drag & drop.

**Open:** `marathon-board.html?board=<id>` (double-click, or via Home). No
`?board=` opens the first board in `../solo.config.js`.

- Data: `../data/<id>.json` ⇄ this browser (`marathon.board.<id>`)
- **+ Board** creates another board: blank, the sample sprint, or a copy.
  **Rename** / **Delete** act on the current one (backup downloads first).
- `⌘K` / `/` opens the command palette (`add …`, `done …`, `move … later`)
- `n` opens the add panel · `1 / 2 / 3` switch Board / Later / Bucket
- **Save file** / **Load file** — JSON in the same format as `data/runway.json`
- **Export MD** — readable Markdown of the visible tasks (not a restore format)
- **Sample** — replace the board with the sample sprint (backup downloads first)

Projects, tags, milestones and the two focus cards come from
`../solo.config.js`.

Terminal: `node ../solo.js week`, `add`, `done`, `move` — see `../AGENTS.md`.

Architecture and safety rules: `CURRENT.md`.
