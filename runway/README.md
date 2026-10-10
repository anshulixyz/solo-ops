# Launch Runway — task board

Kanban for build & launch work: **To Do / Doing / Done**, a **Later** parking
lot, and a **Bucket List** for ideas. Collapsible cards with checklists,
priority, project chip, tags, private notes, drag & drop.

**Open:** `marathon-board.html` (double-click, or via `../index.html`).

- Data: `../data/runway.json` ⇄ this browser (`marathon.runway.v3`)
- `⌘K` / `/` opens the command palette (`add …`, `done …`, `move … later`)
- `n` opens the add panel · `1 / 2 / 3` switch Board / Later / Bucket
- **Save file** / **Load file** — JSON in the same format as `data/runway.json`
- **Export MD** — readable Markdown of the visible tasks (not a restore format)
- **Sample** — replace the board with the sample sprint (backup downloads first)

Projects, tags, milestones and the two focus cards come from
`../marathon.config.js`.

Terminal: `node ../marathon.js week`, `add`, `done`, `move` — see `../AGENTS.md`.

Architecture and safety rules: `CURRENT.md`.
