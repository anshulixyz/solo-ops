# Studio — scripts, writing & video

| File | Purpose |
|------|---------|
| **`script-viewer.html`** | Reels/shorts scripts — hooks, numbered beats, inserts, prep, teleprompter, 9:16 preview. Scripts library in the sidebar. |
| **`writing-viewer.html`** | Drafts — `~~cuts~~`, `++adds++`, `[[notes for AI]]`, images, undo, copy-for-AI. Notes library in the sidebar. |
| **`video.html`** | Takes — a recording by path, its words with times, the sentences as toggles (click = cut), *Drop the fillers*, *Cut it with my AI*, render a preview / the final through `node serve.js`, inline player, *Make the post*. `video-model.js` (data + the cut logic, runs in Node for `core/test-video-page.js`) · `video-view.js` (render only) · `video-main.js` (handlers, sync, the server calls) · `video.css`. |

- Data: `../data/scripts.json`, `../data/writing.json` and `../data/videos.json`
  ⇄ this browser (`marathon.scripts`, `marathon.writing`, `marathon.videos`)
- `⌘K` for commands; `⌘S` saves; `⌘⇧C` copies the draft for an agent; on the
  Video page `⌘Z` undoes the last cut
- All three share `script-viewer.css` (tokens, sidebar, toast);
  `writing-viewer.css` adds the track-changes styling, `video.css` the toggles
- The Video page owns only `edl`, `edlHash`, `status`, `activeId` of a take;
  `sources`, `transcript`, `phrases`, `exports` come from the CLI (also when
  the page's buttons run it) and are merged in before every write. The cut
  logic (`Video.snap`, `Video.drop`, `Video.edlHash`) is `core/video.js`,
  the same code the CLI runs, so a click and `video cut` produce the same EDL
  and hash. Without the server: the sentences stand in for the words (cuts
  land between sentences) and each ffmpeg step shows its terminal line.

Terminal: `node ../solo.js scripts list|show|add`, `notes list|show|add`,
`video list|show|add|transcribe|cut|render|post`.
Agents get the raw Markdown text and can write back the same way.
