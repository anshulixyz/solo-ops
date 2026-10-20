# Studio — scripts, writing & video

| File | Purpose |
|------|---------|
| **`script-viewer.html`** | Reels/shorts scripts — hooks, numbered beats, inserts, prep, teleprompter, 9:16 preview. Scripts library in the sidebar. |
| **`writing-viewer.html`** | Drafts — `~~cuts~~`, `++adds++`, `[[notes for AI]]`, images, undo, copy-for-AI. Notes library in the sidebar. |
| **`video.html`** | Takes — *Task: …* in the toolbar or *Connect with a task…*, tasks tagged `video` as suggestions in the list; a recording by path or from the recordings folder; the words with times as the editor (click a word to play from there with the cuts skipped; select words, Delete or Cut; a crossed-out word: put it back; C corrects a misheard word), *Remove fillers and pauses* in one click or *Review first* (untick single ones, what was said twice), Undo/Redo, *Cut it with my AI*, render a preview / the final through `node serve.js` and watch them in the same player (the captions on it, Bigger/Smaller; *Keep only this* trims to a selection), *Make the post*, the ElevenLabs key pasted once, *Get the words this way for every new take*. The player lives in the sticky top block (`#top`) so repaints never touch it. `video-model.js` (data + the cut logic, runs in Node for `core/test-video-page.js`) · `video-view.js` (render only) · `video-main.js` (handlers, sync, the server calls) · `video.css`. |

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
  the same code the CLI runs (`Video.tidy` is the page's button and the
  CLI's `--tidy`), so a click and `video cut` produce the same EDL and hash.
  A cut remembers what it removed, so putting a span back restores it
  exactly and the hash comes back. Without the server: the sentences stand
  in for the words (cuts land between sentences) and each step the page
  cannot do shows *Copy for my agent* first, the terminal line underneath.

Terminal: `node ../solo.js scripts list|show|add`, `notes list|show|add`,
`video list|show|add|transcribe|cut|render|post`.
Agents get the raw Markdown text and can write back the same way.
