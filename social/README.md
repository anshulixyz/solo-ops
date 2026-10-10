# Social schedule (X / Twitter)

Plan and track a posting arc alongside the launch board.

| File | What it is |
|------|------------|
| **`social-board.html`** | Main schedule — timeline, post editor, OpenThings graph |
| **`social-calendar.html`** | Month grid + streak heatmap (`#streak` in URL) |

**Entry point:** open `social-board.html`.

**Styles:** extends `../runway/styles.css` (shared theme tokens with Launch Runway).

**Scripts:** `social-main.js`, `social-view.js`, `social-model.js`, graph and calendar modules, image/asset stores. Classic global scripts, `file://` safe.

**Tests:** `test-social-save.js` (node) — run manually if touching persistence.

**Related:** build tasks on `../runway/marathon-board.html`.
