# Video: cut by transcript, on your own files (plan v2, 2026-10-19)

Status: **proposal, reviewed, nothing built.** v1 was reviewed by two
independent agents (product experience, technical) on 2026-10-19; every
finding is folded in below, and the "Review changes" section at the end
lists what moved, so the diff from v1 can be checked.

## The use case

A creator cuts her videos in Descript because it is the only tool she knows
that lets her edit by the transcript. Descript makes her upload the footage,
so a multi-GB file becomes a lowered-quality proxy and the cut happens on
that. She wants the same modality on the local file.

That is what Solo Ops already promises for tasks and posts: your files, your
machine, your AI does the work. Video is the same promise applied to
footage: **the footage never moves, only its words do.**

In one sentence: *add a take, get its words with times, say in plain words
(or click) what to keep, get the cut back at the original quality, with
captions, ready to post.*

**Naming rule** (one noun per thing, everywhere): the app and the CLI group
are **Video** / `video …`; the item the user adds is a **take**; the result
is **the cut**; the page is `studio/video.html`, nav label "Video". Never
"Video Viewer" or "Takes" in the nav; "video" alone already means a tag, a
prep kind and a post section in this product.

## What video-studio has, and what we take

`~/Documents/video-studio` is a prompt-and-skills repo around three vendored
tools. Read on 2026-10-19:

| Part of video-studio | What it is | Take it? |
|---|---|---|
| **video-use hard rules** (its SKILL.md) | 12 production-correctness rules: never cut inside a word, pad cut edges 30–200 ms, per-segment extract then lossless concat, 30 ms audio fades at every boundary, subtitles applied last, SRT times on the output timeline, cache transcripts per source, confirm the strategy before touching the cut | **Yes, all of them.** They become the render code and the Guide prompt. This is the real value of that repo. |
| `pack_transcripts.py` | word-level JSON → phrases `[002.52-005.36] text`, breaking on silence ≥ 0.5 s; the thing the agent reads to pick cuts, at a tenth of the tokens | **Yes**, ported to Node (`core/video.js`, ~40 lines), shared by CLI and page. |
| `render.py` | EDL JSON → per-segment ffmpeg extract with fades → concat → captions | **The pipeline yes**, ported to Node, ffmpeg only. Not its hardcoded `-r 24` and `scale=1920:-2` (we keep the source frame rate and size), not its second full encode (see Render), not grade presets, overlays or loudnorm. |
| `transcribe.py` | 16 kHz mono wav via ffmpeg → ElevenLabs Scribe, word timestamps | **The shape yes, the engine as one option.** |
| EDL shape `[{source,start,end,quote,reason}]` | cut decisions as data | **Yes**, stored on the take so the cut is reproducible and revertable. |
| Caption default (engines.md) | sentence case, 3–5 word chunks, inside the platform safe area | **Yes** as the shipped style; burned only when the user's ffmpeg can (see Captions). |
| machine.md | one render at a time, 720p preview first, check free disk, never delete a final | **Yes**, as behaviour of `video render`. |
| Status ladder `idea → … → published` per spec.md | per-video state | **Folded in.** Scripts already carry idea/prep/beats; the take carries `recorded → transcribed → cut → rendered`, and `posted` is read from the linked post. |
| The 10 slash commands | role prompts | **Already here** as the owner's own prompts (`mine:video-*`). Two become built-ins (cut this take, post this video). |
| `claude-ffmpeg-skill` | recipes | **No.** Our render code is the recipe. |
| **OpenMontage**, Remotion, HyperFrames, Recordly | generated video, composition, a GUI recorder | **No.** Paid APIs, Python venvs, AGPL and generated video are a different product. The docs say "any recorder that makes a clean MP4". |
| `voices/`, `brands/` | tone and claim files | **No**, not in this release. |

## Design

Follows the AGENTS.md recipe for a new app, plus the plumbing list below
(the recipe under-counts the places an app switch touches).

### Data

`data/videos.json` (`<ws>-videos.json` in other workspaces):

```json
{ "activeId": "v1", "updatedAt": "…",
  "videos": [{
    "id": "v1", "title": "Why we killed onboarding", "scriptId": "s3", "postId": "",
    "status": "recorded",            // recorded | transcribed | cut | rendered  (posted = the linked post says so)
    "sources": [{ "id": "a", "path": "/Users/me/Movies/take-3.mov", "size": 2147483648, "duration": 312.4,
                  "width": 3840, "height": 2160, "fps": 29.97, "rotation": 0, "hdr": false,
                  "hash": "sha1 of first MB + last MB + size" }],
    "transcript": { "engine": "whisper|elevenlabs|import", "model": "small.en", "lang": "en",
                    "granularity": "word|cue", "words": 1840, "file": "data/videos/v1/transcript.json" },
    "phrases": [{ "s": 2.52, "e": 5.36, "t": "Ninety percent of what a web agent does is wasted." }],
    "edl": [{ "source": "a", "start": 2.42, "end": 6.85, "quote": "…", "reason": "hook" }],
    "edlHash": "…",
    "captions": { "style": "sentence", "burn": false },
    "exports": [{ "file": "data/videos/v1/final-1.mp4", "kind": "final|preview", "duration": 61.2, "edlHash": "…", "at": 0 }],
    "notes": "", "createdAt": 0, "updatedAt": 0 }] }
```

- **`sources[]` from day one** (several takes is a week-one ask; the EDL
  already names its source). Release one's CLI only ever creates one
  (`video add`); `video add-take <v> --file` lands in release two.
- **`phrases` live in `videos.json`** so the page can read them on
  `file://` and linked folders, where nothing can read
  `data/videos/<id>/`. About 20–40 KB for a 10-minute take; `doctor` warns
  above 500 KB and the page lazy-renders long takes. The word-level
  `transcript.json` stays on disk for the CLI's snapping and is never put
  in the JSON (log.jsonl snapshots whole files).
- `data/videos/<id>/` holds `transcript.json`, `captions.srt`,
  `progress.json` (unlogged, see Render), the exports `preview-<n>.mp4`
  and `final-<n>.mp4`, never overwritten.
- The source is referenced by path, never copied. Exports record the
  `edlHash` they were made from; `video show` says "the cut changed after
  this render" when they differ.

### Media, backups and secrets

- **Backup ignore, applied on every run, not only on init.** `cmdBackup`
  writes `data/.gitignore` only when it creates the repo today, so the
  owner's existing repo would stage a 2 GB final, GitHub would refuse it
  and every later push would fail. New `ensureIgnore()` appends missing
  lines each run. Allow-list, not extensions: `videos/**`, `!videos/*/`,
  `!videos/*/transcript.json`, `!videos/*/captions.srt`, plus `models/`,
  `secrets.json`. The same patterns filter `backup --to <folder>` (today
  it copies everything but `.git`, `log.jsonl`, `exports/`), Export
  everything in the Guide, and `doctor`, which also warns when the data
  repo tracks a file over 50 MB.
- **No secret in `settings.json`**: it is mirrored into every page's
  localStorage, served by the API, committed to the backup and bundled by
  Export everything. The ElevenLabs key comes from `ELEVENLABS_API_KEY` or
  `data/secrets.json`, written by `video key set elevenlabs <key>`,
  excluded from backup like `identity.json`, refused by `safeDataFile`,
  never read by a page. `config set video.elevenlabsKey` refuses with that
  pointer. The key is never read from another tool's `.env`.
- `guard` refuses any staged `*.mp4 *.mov *.wav *.m4a` in the code repo.
- The whisper model downloads to `data/models/` (follow redirects by hand:
  the Hugging Face URL answers 302 and `https.get` does not).

### Settings

A `video` group in `solo.config.js` and in `Config` defaults, because
`Config.override` refuses unknown top-level keys:
`{ engine: '', ffmpeg: '', whisper: '', model: 'small.en', captions: { style: 'sentence', burn: false } }`.
`config set video.engine whisper` remembers the engine; `video.ffmpeg` and
`video.whisper` are paths for machines where they are not on `PATH`
(Windows zips). `studio.videoTitle` is the nav label.

### CLI group `video …`

```
video add "Title" --file ./take.mov [--script s3]        ffprobe the file, register it by path
video list | show <v> | open <v> [--preview] | rm <v> [--files]
video source <v> <new path>                              the file moved: re-hash, keep the transcript when it matches
video transcribe <v> [--engine whisper|elevenlabs] [--lang en] [--from x.srt|x.vtt|x.json] [--yes]
video cut <v> --keep "2.42-6.85, 8.10-15.00" [--note "…"] ranges snap to word boundaries, padded
video cut <v> --drop "um, uh, you know"                   drop filler words (a word list, not magic)
video cut <v> --edl edl.json                              the agent's full EDL, re-validated
video render <v> [--preview] [--burn] [--aspect 9:16] [--out path]
video post <v> [--at …]                                   a post with the cut linked, never copied
video key set elevenlabs <key>                            data/secrets.json, out of the backup
```

Every `videos.json` write goes through `write()` and `log.jsonl` like any
change, so `revert` undoes a cut. `--as agent --note` as everywhere. `today`
and `week` print a Video line ("1 take recorded 3 days ago, not cut") and
`week --json` carries it, so standup and the weekly review can mention it.

- **Every `video` command starts with `requireFfmpeg()`**, one text:
  *"Video needs ffmpeg, a free tool that reads and writes video files.
  Mac: `brew install ffmpeg` · Windows: `winget install ffmpeg` · then run
  this again. `node solo.js doctor` checks it."* `video add` is the first
  wall, so it carries the same message.
- **add**: ffprobe → duration, size, fps, rotation (swap width/height on
  90°/270°), HDR flag (`color_transfer`), cheap hash. Phone footage is
  often VFR and HLG; we record both and the render handles them.
- **transcribe**: with nothing set and no `--engine`, prints three lines
  and stops (no interactive question, like `backup setup`):
  *(1) On this computer: free, nothing leaves your machine, about real
  time on this Mac · `--engine whisper`* / *(2) ElevenLabs: the audio, not
  the video, is sent to them; about $0.40 per hour; needs a key ·
  `--engine elevenlabs`* / *(3) I already have a transcript (SRT, VTT or
  JSON from YouTube or Descript) · `--from file`*. A paid engine always
  prints the estimated cost and runs only with `--yes` (agents pass it
  after the user agreed); `--engine` never auto-picks a paid one. ffmpeg
  extracts 16 kHz mono wav into a mkdtemp folder removed in `finally` (a
  2 GB take becomes ~30 MB of audio). Output: `transcript.json` in one
  shape `{ words: [{ w, s, e }] }`, `phrases` on the item, status
  `transcribed`. Cache key = source hash + engine + model. Progress line:
  *"Listening to 5:12 of audio on this computer · about 5 min"*.
  - whisper.cpp: binary `whisper-cli` (Homebrew ≥ 1.7.2, the Windows zip)
    or `main` on older builds, or `config.video.whisper`. Flags `-ml 1
    -sow` (word boundaries, not BPE pieces), `-ojf -of <prefix>`, a
    filler `--prompt` by default (see slice 0), read
    `transcription[].offsets` (ms) and `.text`. Model `small.en` (~470 MB,
    ~1 GB RAM); `base.en` (148 MB) when `--model base` or when step 0
    finds small too slow. Honest note in the docs: whisper is not
    verbatim, it drops some fillers, so `--drop "um"` finds fewer of them
    than ElevenLabs does.
  - ElevenLabs Scribe: multipart POST over `https` written by hand (no
    npm), `timestamps_granularity=word`, diarize off.
  - Import: SRT/VTT → one "word" per cue, `granularity: 'cue'`; `cut`
    says it snapped to cues and `--drop` refuses with the reason. JSON
    accepts our shape, whisper's and ElevenLabs'.
- **cut**: validation rules, stated: ranges snap outward to word
  boundaries (rule 6); pad 50 ms before / 80 ms after, **clamped to half
  the gap to the neighbouring word** so the pad never re-enters a dropped
  word; edges then snap to the source frame grid; segments shorter than
  max(2 frames, 60 ms) are refused (two 30 ms fades need them); keeps with
  a gap under 120 ms merge (no cut inside continuous speech); `--drop`
  normalises words (lowercase, punctuation stripped), matches multi-word
  phrases on the word sequence, applies inside the current keeps and
  drops islands under 300 ms between two drops; `--edl` is numeric,
  `0 ≤ start < end ≤ duration`, one source, then re-snapped and re-padded
  whatever the agent sent. `--keep` before any transcript works as a
  plain trim and says "no transcript yet, not snapped". Prints the
  runtime and every boundary; `--json` returns the EDL.
- **render**: per-segment extract with identical parameters
  (`-ss` before `-i`, `-fps_mode cfr -r <fps>`, `-map 0:v:0 -map 0:a:0`,
  30 ms `afade` in and out), lossless `-c copy` concat, **one encode**:
  captions, when burned, go into the segment pass with a segment-local
  SRT as the last filter (rule 1 holds, there are no overlays in release
  one; this halves a 4K render). Every segment is then ffprobed and
  `captions.srt` is built from **measured** offsets, not EDL arithmetic
  (frame and AAC-frame quantisation drift otherwise). Preview:
  `h264_videotoolbox` at 720p on a Mac (near real time), libx264
  elsewhere; final: libx264 CRF 20 at source size. HDR sources keep 10-bit
  with the colour tags copied, never silently flattened. `--aspect 9:16`
  centre-crops and picks the caption margin for that aspect. Free disk
  via `fs.statfsSync` when present; a lock is `progress.json` with the
  pid (stale when the pid is gone); "a render is already running since
  14:02" instead of a bare error. Progress from `-progress pipe:1`:
  *"Rendering 2:14 of 4:10 · about 3 min left"*, the estimate from the
  first segment's measured speed. Done: *"Done: 1:01, 1080p, 84 MB. Open
  it: node solo.js video open v1"*. `--out` refuses an existing file.
- **Paths never enter filter strings or concat lists**: every ffmpeg runs
  with `cwd: data/videos/<id>/` and references names we generated
  (`seg-03.mp4`, `concat.txt` with `file 'seg-03.mp4'`, `captions.srt`);
  the source only through argv `-i <resolved path>`; always `execFile` /
  `spawn` with arrays, `-nostdin -hide_banner`; `force_style` quoted.
- **post**: creates the post with `format: 'video'`, `video.status:
  'edited'`, `video.link` to the export (a link, never a copy into
  attachments), sets `postId` on the take. The take reads `posted` from
  the post; `social posted` is what flips it.
- **rm** removes the item and says "the transcript and exports stay in
  data/videos/v1/; `--files` deletes the folder". A final is never deleted
  by anything else.
- **doctor**: ffmpeg found and whether it has the `subtitles` filter, an
  engine found, model present, sources that moved (stat + hash), listed
  exports missing, orphan `data/videos/*` folders, stale locks, size on
  disk, phrases over 500 KB, tracked files over 50 MB in the backup repo.

### Captions

**Verified 2026-10-19: this machine's ffmpeg 8.1.1 has no `subtitles`,
`ass` or `drawtext` filter (built without libass and libfreetype).** So
the shipped default is a **sidecar `captions.srt` plus a soft `mov_text`
track** in the MP4 (works everywhere, YouTube and most players read it).
`--burn` burns them when the filter exists; otherwise one line: *"Burned
captions need an ffmpeg with libass. Mac: the standard Homebrew ffmpeg has
it; Windows: the gyan.dev builds do."* Style `sentence` (3–5 words,
sentence case, safe-area margin per aspect, font size scaled with height)
or `bold` (2-word uppercase).

### serve.js

- `POST /api/video/render` `{ id, preview }` spawns `solo.js video render
  <id> --json --as ui` detached and answers `202 { job }` at once (the
  existing `solo()` helper has a 20 s timeout and a 1 MB buffer; a render
  is minutes). `409` when the lock exists. The page polls
  `progress.json` the way it polls files today.
- `GET /api/video/<id>/<name>` serves exports: `id` matched by
  `^v[a-z0-9]+$` against `videos.json`, `name` by
  `^(preview|final)-\d+\.mp4$`, `fs.createReadStream` with `Range` →
  `206`, `Content-Range`, `Accept-Ranges: bytes`, `video/mp4` (Safari
  refuses `<video>` without ranges; the static route reads whole files
  into memory).
- **Found on the way:** the static route serves anything under the
  project folder, so `GET /data/identity.json` works today. Block `/data/`
  in the static route (the pages use `/api/data/`). Fix in slice 1.

### The page: `studio/video.html` (slice 3)

The Descript modality in our own words, in the Studio next to scripts:
the takes of this workspace on the left; on the right the take as phrases
with timestamps, each a toggle (kept / cut), fillers highlighted with one
button to drop them all; clicking writes the EDL the same way the CLI does
and the runtime updates live. **Copy for my AI** carries the phrases and
the reply legend. Render preview / Render final through serve.js with the
progress line; without the server the button shows the command. Preview
plays inline from `/api/video/…`. A pending card *"Video needs ffmpeg"*
until `doctor` says yes (like the backup card). Model / view / main split;
all text through `esc()`.

### Guide prompts (core/prompts.js, group Content)

- **Cut this take** (`/cut-take <video>`): reads the phrases, lists
  verbal slips, asks which platform (that decides captions and aspect),
  proposes the cut in 4–8 plain sentences with the runtime, **waits for a
  yes** (rule 11), then `video cut --edl`, `video render --preview`, and
  says what to check. Chat mode: ends with `node solo.js video cut …`
  lines and says the render needs the terminal (slice 2); in slice 3
  `apply.js` learns a `video cut` verb that writes the EDL to the Store
  and never renders from a pasted reply. A `{{take}}` context token (the
  phrases of the open or latest take) feeds the Ask box without the page.
- **Post this video** (`/ship-video`): two copies in the user's voice from
  the script and the transcript, `video post`, scheduled.

The owner's `mine:video-*` prompts stay as they are.

### Plumbing list (what "a new app" touches)

`apps` is hard-coded to `social/scripts/writing` in `core/config.js`
normWs and `solo.js` normWs (an `apps.video` flag is dropped on load
today), and enumerated again in `nav.js`, `home.js` (peek and the count
chips), `guide.js` dataFiles (Export everything), the workspace editor
checkboxes, `workspaces add --apps`, doctor's `shapes` map, the Guide
page ids and the Content group subtitle. Add `videos`, `video`, `models`
to `RESERVED` in both files (a board titled "Videos" would write
`data/videos.json` today). Slice 1 ships the CLI always on, with no
`apps.video` toggle; the toggle and the Home chip ("1 take waiting to be
cut") come with the page in slice 3.

### Docs

AGENTS.md: a `videos.json` row, the `video …` lines, a Video convention
paragraph (footage never copied, transcript cached, confirm the cut before
rendering, never delete a final). SCHEMA.md: the shape above, next to the
post's `video` ladder so both are visible together. README: one section
with the promise and a screenshot. Home card copy: **Video** · *Cut your
takes by their words. The footage stays where it is.*

## Slices, in order

0. **whisper.cpp on this machine: PASSED (2026-10-19).** Pass criteria
   were `small.en` on a 60 s clip in ≤ 2× real time, under 1.5 GB RAM,
   and the fillers `--drop "um"` needs. Measured on the M2 8 GB with
   whisper.cpp 1.9.5 (`brew install whisper-cpp`, binary `whisper-cli`)
   and `ggml-small.en.bin` (488 MB, now in `data/models/`, `models/`
   added to the backup's `.gitignore`), on a real 720p talking-head
   recording of the owner:

   | Clip | Wall time | Peak RAM |
   |---|---|---|
   | 60 s (includes ~15 s model load and Metal warm-up) | 22.1 s | 805 MB |
   | 240 s | 17.4 s | 866 MB |

   The GPU does the work (CPU user time under 6 s), so a 10-minute take
   is about a minute. **Fillers: the plain invocation drops them all**
   (0 of 6 "uh" in the first minute; "you know" and "I mean" survive).
   Passing `--prompt` with fillers in it ("Umm, let me think like, hmm...
   Okay, here's what I'm, like, thinking. Uh, so, you know.") brings
   them back (6 of 6 in the first minute, 13 across 4 minutes), so the
   whisper engine passes that prompt by default. Word timestamps from
   `-ml 1 -sow -ojf` are per word in ms; a few zero-length tokens
   (punctuation, a leading "-") must be filtered. Proper names come out
   phonetically ("Anshali"), which does not matter for cutting. Verdict:
   `small.en` is the recommended local engine on an Apple-silicon Mac;
   `base.en` stays an option for older machines, not a fallback here.
1. **Core + CLI**: `core/video.js`, `solo.js video …`, settings group,
   backup `ensureIgnore` + folder filter, `guard` media rule, `doctor`,
   the `/data/` static fix in serve.js, `today`/`week` line.
   `core/test-video.js` on a synthetic clip (`testsrc` + `sine`, 10 s, in
   a temp folder whose name has a quote and a space, synthetic words):
   snapping, clamped padding, merge, short-segment refusal, `--drop`,
   render streams and size, `|duration − Σ segments| ≤ 1 frame + n × 21 ms`,
   SRT monotonic and within the total, imports (SRT, VTT, whisper shape,
   ElevenLabs shape) → `{ w, s, e }`, cache hit, lock refuses a second
   render, burn skipped with the message when the filter is absent, the
   whole file skips cleanly without ffmpeg. Under 10 s, in `npm test`.
2. **Guide prompts + slash commands**, `{{take}}` token, `prompts export`,
   `test-prompts`.
3. **The page**, `apps.video`, the Home chip, serve.js render and range
   routes, `apply.js` `video cut`.
4. **Docs, SCHEMA, AGENTS, README**, and a 60 s demo on a scratch copy.

**Announcement wording, decided now:** release one (slices 0–2) is
*"today with a coding agent (Claude Code, Cursor, Codex) from the
terminal; the click version next"*. It answers the thread for people who
use an agent that runs commands; chat-only users get the command lines
and run them; the page is the second release.

## Not in this release

Several takes in the UI (schema ready), color grade, overlays and
animations, speed ramps, zooms, music beds, generated video, a recorder,
`--drop-silence` (Descript's "remove silences") and `video frame <v> <t>`
for a thumbnail: both small, both in *Next* for release two.

## Decisions (taken 2026-10-19)

1. **Transcription is pluggable; the user picks.** whisper.cpp (local,
   free), ElevenLabs (audio only leaves the machine), an imported
   transcript, more later (macOS on-device speech, OpenAI, Deepgram)
   behind the same `{ words: [{ w, s, e }] }` shape. With nothing set the
   CLI prints the three ways and stops; a paid engine needs `--yes`.
2. Exports live next to the transcript in `data/videos/<id>/`, excluded
   from the backup by an allow-list applied on every backup run.
3. Slices 0–2 ship first; the page follows in the next release, with the
   announcement wording above.
4. Built-ins: cut this take · post this video (captions are a question
   inside cut this take). The other `mine:video-*` prompts stay personal.

## Review changes (v1 → v2, 2026-10-19)

Product review: chat path made real (`{{take}}`, command lines in slice 2,
`apply.js` verb in slice 3, announcement wording fixed now); phrases moved
into `videos.json` so the page works on `file://`; secrets and models out
of backup and iCloud copies; render through serve.js as a detached job
with a progress file; `requireFfmpeg()` and every progress/error text
specified; engine choice as three printed lines, paid engines need
`--yes`, no auto-pick; `sources[]` now; one status ladder with the post's,
`video post` links and never copies; plumbing list; naming rule; 9:16 as
`--aspect`; `video source` for moved files, `rm` semantics, exports carry
`edlHash`; `--keep` as a plain trim and `video open`; captions folded
into cut this take; `today`/`week` line; the key never read from another
tool's `.env`; step 0 pass criteria.

Tech review: captions default to sidecar + `mov_text` because this
ffmpeg has no `subtitles` filter (verified); backup ignore applied on
every run with an allow-list, folder copy filtered, 50 MB check; serve.js
render as `spawn` + 202 + progress file, range-served exports, `/data/`
blocked in the static route; `video` settings group so `config set`
accepts it, key in `secrets.json`; SRT from measured segment durations,
CFR extraction, frame-grid snapping; one encode with captions in the
segment pass, videotoolbox previews; paths never in filter strings, cwd
per take, mkdtemp cleanup; cut validation rules (clamped pads, minimum
segment, merge under 120 ms, `--drop` normalisation, `--edl`
re-validation, cue-granularity imports); whisper-cli flags `-ml 1 -sow
-ojf`, redirect-following download, cache key with engine + model;
plumbing in both normWs and `RESERVED`; never overwrite exports, progress
unlogged; HDR, rotation, VFR and multi-track handling; the test list.
