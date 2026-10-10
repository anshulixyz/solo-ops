# Social schedule

Plan a posting arc, prep each post, mark it posted, log engagement.

| File | What it is |
|------|------------|
| **`social-board.html`** | Sequence + post detail (copy, images, links, video, prep, posted results) |
| **`social-calendar.html`** | Month grid + 52-week streak heatmap (`#streak` in URL) |

- Data: `../data/social.json` ⇄ this browser (`marathon.social.v3`). Post
  images stay in the browser (IndexedDB) and in **Save file** bundles.
- `⌘K`: `add Launch day @launch #launch +3d 9:00`, `posted …`, `ready …`
- Post types, prep kinds, projects, milestones: `../marathon.config.js`
- Styles extend `../runway/styles.css` (shared theme tokens)

Terminal: `node ../marathon.js social next|week|add|posted`.

Test: `node test-social-save.js` (save/load round trip).
