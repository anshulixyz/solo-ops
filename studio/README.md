# Studio — writing & scripts

Tools for video and social copy while iterating with AI.

| File | Purpose |
|------|---------|
| **`script-viewer.html`** | Reels/shorts scripts — hooks, numbered beats, inserts, teleprompter, 9:16 preview |
| **`writing-viewer.html`** | General drafts — `~~cuts~~`, `++adds++`, `[[notes]]`, multiple notes (sidebar), copy-for-AI |

Both use Lora/Inter styling; writing viewer imports `script-viewer.css` for shared chrome.

**Storage:** `localStorage` per app (`marathon.scriptViewer`, `marathon.writingViewer.library`). Uploaded images in writing viewer are stored on the note object, referenced in text as `[Image uploaded 1]`.

**Video pipeline docs** (commands, specs): `../videos docs/` — not part of this folder.

**Related:** launch tasks `../runway/marathon-board.html`, posts `../social/social-board.html`.
