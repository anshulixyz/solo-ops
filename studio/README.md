# Studio — scripts & writing

| File | Purpose |
|------|---------|
| **`script-viewer.html`** | Reels/shorts scripts — hooks, numbered beats, inserts, prep, teleprompter, 9:16 preview. Scripts library in the sidebar. |
| **`writing-viewer.html`** | Drafts — `~~cuts~~`, `++adds++`, `[[notes for AI]]`, images, undo, copy-for-AI. Notes library in the sidebar. |

- Data: `../data/scripts.json` and `../data/writing.json` ⇄ this browser
  (`marathon.scripts`, `marathon.writing`)
- `⌘K` for commands; `⌘S` saves; `⌘⇧C` copies the draft for an agent
- Both share `script-viewer.css` (tokens, sidebar, toast); `writing-viewer.css`
  adds the track-changes styling

Terminal: `node ../marathon.js scripts list|show|add`, `notes list|show|add`.
Agents get the raw Markdown text and can write back the same way.
