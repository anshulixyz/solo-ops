# Next — features and issues

The working list for Solo Ops. Anyone (person or agent) picking up work
starts here. Keep it honest: move an item to **Done** with the commit hash,
add issues as you find them, keep the order meaning priority.

How to take an item: say which one in your PR or commit title
(`Guide: three tabs by intent (NEXT #M2)`), keep `AGENTS.md` and `README.md`
in step with what you change, and run `node solo.js doctor` plus
`node social/test-social-save.js` before you call it done.

## Release 1 — what ships, what waits

**Must, before the public launch**
- ~~M8 · Calendar + dates~~ — shipped 2026-10-13 (see Done).
- ~~Backup repo name offered during setup~~ — done 2026-10-21 in the onboarding pass (see Done).

**Should, first week after**
- ~~*Share today* as an image~~ and ~~Home as a dashboard~~ — shipped 2026-10-13 (see Done).
- **Last before launch:** README pass — copy for the new Home, Share today and the mono default, fresh screenshots (`docs/screenshots`).

**After launch (moved out of release 1 on 2026-10-13)**
- M1 undo / redo in the browser. Trimmed first version agreed: a ring of the
  last 50 steps per browser kept at the one write path (`Store.set`, non-silent
  writes only, so sync-applied file changes are never steps), labels from
  Recent changes, one pasted reply = one step; undo writes the previous value
  back through the same path so the file and the log follow; a toast with
  Undo after each change, Undo / Redo in the Guide footer, ⌘Z when no field
  is focused; if the file changed underneath since the step, say so and ask.
  CLI undo and IndexedDB wait for the full M1.

**After**: M9 (MCP server) and M10 (Mac and Windows notes) are the first two
after launch, then M3, M5, M6, M7, the rest of M4. Freeze everything else and
spend the remaining time on the first-run path.

## Major

### M8 · Calendar + dates (release blocker; design agreed 2026-10-13)
Today only posts carry a date, so meetings have nowhere to live and the
board cannot answer "what is on today". Two parts, built together, shown
for review after each.

**1 · Dates on tasks.** Optional fields on a task: `at` (`YYYY-MM-DDTHH:MM`,
local, same format as posts), `until` (end time, `HH:MM` or a full stamp,
for meetings), `due` (`YYYY-MM-DD`). A meeting is a task with `at` and the
tag `meeting`: it lands on a board, can carry a prep checklist and notes, is
marked done after, and shows in Recent changes like everything else. No
separate event type. CLI: `add --at … [--until …] [--due …]`, `at <task>
<when|clear>`, `due <task> <date|clear>`; `today` gains a **Schedule** block
(dated tasks + posts in time order, overdue first); `week` lists dated items
by day; new `calendar [--days 14] [--all]` prints the agenda. `core/apply.js`
accepts the same, so chat replies can schedule. Cards show the date; the
board sorts dated items first inside a column.

**2 · The Calendar app** (`calendar/`, like the studio apps: model · view ·
main). Replaces `social/social-calendar.html`, which redirects. Nav item
*Calendar* on every workspace. Views: **Month** (grid, items as chips),
**Week** (7 columns with times, meetings as blocks), **Agenda** (today →
next 14 days, time-ordered: the "what do I have to get done" view). Filters
as chips, remembered: source (each board · meetings · posts), project
(this workspace · all), state (open · done). Click opens the item in its
app; drag between days reschedules (keeps the time). *+ on a day* adds a
task with `at` on the default board, or a post. The posting heatmap moves
here under the posts filter. Home gets a Calendar card: today's count and
the next item.

**3 · The agent fills it.** New Guide group *Bring in* (M4 starts here):
*Fill my calendar* — in command mode the agent reads the calendar it is
connected to (Google, Apple, Outlook through Claude or ChatGPT connectors)
for the next 7 days and adds each meeting as a `meeting` task with `--at`
and `--until`, skipping ones already there (same title + start); if it has
no calendar connector it says how to connect one in Claude or ChatGPT and
waits. In chat mode the user pastes their week and gets the command block.
*Plan today around my meetings* — meetings fixed, top 3 tasks placed in
the gaps, the rest parked. Standup and What-now read the schedule. Both
ship as slash commands.

Not built: an OAuth calendar integration inside Solo Ops. The agent is the
integration (files over services).

### M1 · Undo / redo that works everywhere (agreed design)
Today a change can only be reverted when `node serve.js` runs, because the
previous content lives in `data/log.jsonl`, which only the server and the CLI
can read back. A page opened by double-click has nothing to revert from.

- Keep an undo history **in the browser** as well: every write already goes
  through one function (`Store.setJSON` via each app's `persist`), so each
  write keeps the previous value in an IndexedDB ring, last 50 steps per
  workspace, with a label ("done: Write the README", "applied reply, 12
  changes") and the source (ui / agent / cli).
- **Semantics like ⌘Z:** undo takes back the most recent step, press again
  for the one before; **redo** re-applies. Order is always preserved, so
  nothing after the step is lost by accident. One pasted reply = one step.
  One CLI batch (`import`) = one step.
- Works identically on file://, linked folder and server. In server and
  folder mode the undo also writes the file, like any change.
- The server log (`log.jsonl`) stays as the long, cross-session history.
  "Restore this file to before X" stays on Home → Recent changes as the
  advanced tool, with a sentence saying what it will discard.
- Surface: one **Undo** button (and Redo) in the Guide footer that names the
  step; ⌘Z / ⇧⌘Z when no field is focused; `node solo.js undo` / `redo` in
  the CLI using the same ring exported to `data/undo.json`.

### M9 · An MCP server: Solo Ops anywhere, with any agent
One local process (`node solo.js mcp`, stdio) that exposes the CLI's verbs as
Model Context Protocol tools: `today`, `week`, `calendar`, `add`, `done`,
`start`, `move`, `at`, `due`, `step`, `note`, `social add`, `share today`,
plus `prompt <slug>` returning a Guide prompt with the snapshot filled in.
Same files, same `log.jsonl` (source `mcp:<client>`), same guard and backup.
Claude Desktop, ChatGPT (when it speaks MCP), Cursor and a phone client then
use the folder without pasting. Zero dependencies: the protocol is JSON over
stdio, written by hand like `serve.js`. Ships with a `/setup-mcp` prompt that
writes the client's config entry.

### M10 · Your notes on the Mac and on Windows flow in
A watcher (`node solo.js watch`) that reads what people already write in:
Apple Notes and Reminders on the Mac (AppleScript / the Notes SQLite, read
only), Sticky Notes and Notepad on Windows, and any Markdown folder
(Obsidian, iA Writer). New notes or new `- [ ]` lines become inbox items or
tasks with a link back to the note; a tag like `#solo` or a folder name picks
the project. Nothing is moved or edited at the source. The Guide gets
*Assess new notes* next to *Assess new inspiration*.

### M11 · Video: cut by transcript, on your own files (plan v2 2026-10-19, reviewed)
Plan: `docs/video-plan.md` (two review passes folded in, product + tech).
A creator edits by transcript in Descript and has to upload her footage,
so a multi-GB take becomes a low-quality proxy. Solo Ops does it on the
local file: `video add` (ffprobe, referenced by path, never copied),
`video transcribe` (ffmpeg extracts the audio; the user picks the engine:
whisper.cpp local, ElevenLabs audio-only with `--yes`, or an imported
SRT/VTT/JSON), `video show` (phrases with timestamps, the view the agent
reads), `video cut --keep | --drop | --edl` (snapped to word boundaries,
clamped padding, logged and revertable), `video render [--preview]`
(per-segment extract, 30 ms fades, lossless concat, one encode, captions
as sidecar + mov_text by default because slim ffmpeg builds have no
`subtitles` filter, `--burn` when it exists, one render at a time),
`video post` (links the cut to a post, never copies). Step 0 done 2026-10-19:
whisper.cpp `small.en` on the 8 GB M2 does 240 s of audio in 17 s at
866 MB peak, and keeps fillers once a filler prompt is passed (the plain
invocation drops them); details in the plan. Then two Guide prompts (cut
this take · post this video), then a Studio page with phrase toggles and
render through serve.js. Taken from video-studio: video-use's production
rules, the packed transcript, the EDL shape, the caption style, the
machine rules. Not taken: OpenMontage, Remotion, generated video. Media,
models and the ElevenLabs key never enter git or the backup; the backup
ignore is applied on every run. **Slice 1 shipped 2026-10-19, commit `37007f7`:** `core/video.js`, the `video`
CLI group, the `video` settings group, backup ignore on every run +
folder-copy filter, guard media rule, doctor's video block, the `/data/`
static fix in serve.js, `today`/`week` Video line, `core/test-video.js`
(87 checks, in `npm test`), AGENTS/SCHEMA rows. Proven on the owner's
4-minute 720p intro: 623 words in 13 s, first minute kept, 19 fillers
dropped into 10 pieces, preview and final rendered with a caption track.
Reviewed by a fresh-eyes developer and a product engineer (40 findings),
all folded in: a dropped filler shorter than the merge gap is never
stitched back, repeated drops do not move edges, `/data/` cannot be
reached by URL tricks, keys are refused by `config set`, HDR takes render
as HEVC, a final older than the cut cannot be posted, exports of the same
cut are not rendered twice, the log names each step. Still untested on
this machine: `--burn` (no ffmpeg with libass here). 114 checks.
**Slice 2 shipped 2026-10-19, commit `7a9c836`:** two Content prompts,
*Cut this take* (`/cut-take <take>`: slips, platform question, the cut in
plain words with the runtime, a yes, then `video cut --edl`, the preview,
the final only after it was watched; chat mode ends with the terminal
lines) and *Post this video* (`/ship-video <take>`: two copies in the
user's voice, `video post`, scheduled); the `{{take}}` context token
(words with times, the cut, the final) with `videos.json` read into the
browser so the Ask box carries a take before the page exists; `/standup`
and `/week` name a waiting take; the bootstrap explains a pasted take;
test-prompts covers it. Proven on a synthetic take in a scratch data
folder: the prompt's own commands cut, preview, render and post it.
Next: slice 3, the page.
Slice 2 reviewed 2026-10-19 (fresh-eyes developer + product engineer, 28
findings), fixes in `b1994da`.
**Slice 3 shipped 2026-10-19, commit `e293b37`:** the Video page
(`studio/video.html` + model / view / main, nav "Video", `apps.video`
switch everywhere a workspace lists its apps, Home chip and Overview
card, Guide page texts, `{{take}}` reads the open take, Export everything
carries `videos.json`). Sentences as toggles (click = cut, shift-click a
run, keyboard), fillers highlighted with *Drop the fillers* and a click to
spare one, struck words click back in, Undo (⌘Z) and *Keep everything*,
the next step as a sentence with its button, plain status labels. The
cut goes through `core/video.js` exactly as the CLI's (`Video.edlHash`
is now one pure sha1 shared by both sides). serve.js: `/api/video/doctor`
(the ffmpeg card in the Guide once a take exists, inline on the page),
`add` (drop the file: `find` looks in Movies/Desktop/Downloads/Documents),
`transcribe` (three engine cards in the CLI's words, ElevenLabs asks the
price, import reads the dropped SRT), `render` (detached, 202, 409 while
one runs, progress polled, the preview plays inline from a Range route),
`source`, `post`. Two reconcile rules close the page-vs-CLI race: the CLI
patches a fresh copy of `videos.json` (`patchVideo`) and the page rebuilds
every write from the file's copy (`Sync` `reconcile` hook) overlaying only
`edl / edlHash / status`. `core/apply.js` learned `video cut --keep/--drop`
(never render); `core/test-video-page.js` (51 checks) and test-apply cover
it; `npm test` green. Verified on a synthetic take in a scratch `SOLO_DATA`
folder: toggles → EDL on words → preview → final → *Make the post*. Slice
3 was planned with a page plan reviewed by two agents before building
(product + tech, 46 findings) and the diff reviewed by two after
(48 findings: the add route not parsing the CLI's JSON, the race stamp,
stale job files, hash drift on a cut/keep round trip, CSRF on the new
routes, all folded in before the commit).
**Slice 5 shipped 2026-10-20, commit `184091f`: the player follows
the text.** After a research pass over Descript, Riverside, Opus, Veed,
CapCut, Premiere and the open-source editors (auto-editor, LosslessCut,
Kdenlive, Open-Script-Editor, Rescript, CutScript; notes in the side-session
folder, `video-gap-analysis.md`): one player in the sticky top block, the
take with the cuts skipped (click a word to play from there, Space, a seek
into a cut plays it out, the spoken word marked, the text follows unless
she scrolled), or a render through *Watch*; a 720p copy (`video proxy`) when
the browser cannot play the original (decided from the stored codecs;
iPhone HEVC/HDR, PCM audio, .mkv); *Correct* (C) retypes a misheard word
through `video word` (an edits trail, `--undo`, `--expect`, the EDL quotes
follow, a cut edge inside the run is refused, cue-level kept whole);
*Review first* lists fillers, pauses and "said twice" (a run of words
repeated within 3 s, `Video.retakes`) with checkboxes, the pause length as a
live setting (`video.*` settings apply in place, no reload), *Remove
ticked* = `Video.tidy` with `only` (hash parity tested); `video.auto` is
the one standing yes for words on arrival (serve.js and `video watch
--transcribe`, capped by `video.autoMaxMin`, the ElevenLabs estimate in
the card, an off-switch on the card); every `/api/` call is Host/Origin
checked (GET too: the footage stream); `video cut` writes through
`patchVideo`; the `{{take}}` token carries pauses, the filler count and
`[said again at …]`; reply verbs `video title`, `video word`; `?nosw=1`
skips the service worker for debugging in embedded browsers. Plan and diff
each reviewed by two agents; from the diff reviews: `video watch
--transcribe` never falls back to `video.engine` (money only on the
standing yes), a seek into the trailing cut plays it out, a retake hole
runs to the second try, `--all` undo restores every place, `video word
<take> "what it says" "what it should say"` (the agent never sees word
numbers), the list open folds the player to its bar and hides the strip's
Remove. Left for slice 6: tests for the skip rule, the word route (409),
`autoWords` (standing yes, cap) and `/api/video/key`; memoise `tidyCount`
(retakes run on every paint); audio-only takes; a 409 on `/api/data` PUT;
stream the ElevenLabs upload instead of holding the WAV in memory (a
3-hour manual `--yes` is ~700 MB); say in SCHEMA that `import.srt` travels
with the backup (harmless text). Two branch-wide reviews before main
(compatibility/data/security, main-readiness/UX) found no leak and no
unlogged write; their fixes are in: `video recordings` before the first
take, doctor's tool lines before the first take and no false warnings on
the machine-only files, the Home chip counts by status, `help` up to date,
provider errors in plain words, the missing-words card, the stale-server
card, `--title=`/`--at=`/`--expect=` from the routes, `Sec-Fetch-Site`
in the Host check, `recordings.json` out of the backup.
**Captions in the player and the trim, 2026-10-20, commit `197d9ca`.**
The player carries a caption band (the same chunks the renders' `.srt`
holds, from the words; a render plays with its own `.srt`, so an older cut
captions right), Captions on/off and Bigger/Smaller remembered per browser,
the fold for the session only (a click on Hide used to hide the player from
every take forever), and a one-line placeholder where the player will be.
*Keep only this* (K) trims to the selection through `cutSpans` with two
spans in one step; the hash equals `--keep a-b` on a clean take; an earlier
cut inside stays and can still be put back, which needed one memo entry
per hole in `cutSpans` (a keep after a trim could never restore an inner
cut before). `Video.srtCues` / `Video.cueAt` are pure and tested. Also: a deep link
(`?open=`, `?id=`) is applied after the first pull when the browser had no
copy yet, and a page with a sync stamp but no copy now takes the file
(core/sync.js), which a half-cleared site data had turned into an empty
page. Left:
burned-in captions need an ffmpeg with subtitle filters (the owner's has
none); a `<track>` from the `.srt` for Safari's native captions.
**A task carries its pieces, 2026-10-20, commit `9ced6cc`.** The
owner found the story chain "too naive" and asked for the simplest unit:
the task card. A task may hold `noteId`, `scriptId`, `takeId`, `postId`;
`core/story.js` has the kind `task` first (data from every board of the
workspace, read-only mirrors on the views), only a content task (tagged
`writing` / `script` / `video`, or holding a piece) shows pills, one next
step that follows the tag and what exists, and *attach* in the card foot;
the views show *Task: …* with the pills or *Connect with a task…* (a
picker, Doing first, or a new task made in one process with the piece
attached), and tasks tagged for a view as suggestions at the top of its
list with the card's own verb. CLI: `link <task> <piece>`, `story <task>`,
`--task` on `notes|scripts|social add` and `video add`, `add --draft|
--script|--take|--post`; `/api/story` ops `note|script|post` (with `task`)
and `task`. Removed from the two story PRs: the chain of chips, the
per-page Start the script / Add the take / Make the post, the cross-kind
picker, `storyMake`, the `?add=1&script=` flow, `&made=1`. Kept: the
piece-to-piece pointers and `link` between pieces, the deep links after
the first pull, the sync-stamp guard. Left: a Home chip "N content tasks
waiting"; a `{{task}}` token with the pieces; drag a piece onto a card.
**Slice 4 shipped 2026-10-20, commit `1e5ca53`: easy mode.**
The owner's direction: trim the umms and pauses, edit the transcript as
text like Descript, record with Recordly and have the recordings land in
the editor, ElevenLabs easy for the agent, agent-first everywhere,
cleanup over complication. One editing rule on the screen now: a click
selects (a word, a pause pill, a sentence by its time); the action is
**Cut N words / Put back N words** (the button, or Delete), nothing
happens on a click alone; **Remove 12 fillers, 5 pauses** is one button
with live counts; Undo, Redo (⌘Z / ⇧⌘Z), Start over; the title renames
on click; every toast that cut something carries Undo. Pauses are
measured on the audio (ffmpeg silencedetect during transcribe, backfilled
on first use; whisper's word times are trimmed to them) and shown as
pills with their length, struck once shortened to a 0.25 s beat.
`Video.tidy` is one function for the page's button and the CLI's
`video cut --tidy` / `--drop-silence`, so both give the same EDL and
hash; a cut remembers what it removed so a keep restores it exactly.
Recording: `~/Movies/Solo Ops takes` (`video.recordings`), polled by
serve.js and `video watch` with state in `data/recordings.json` (stable
twice, probe-gated with a backoff, pre-existing files wait for *Add
them*, a removed take stays removed, `video add` dedupes by path/hash);
the Record card has *Open the folder*. ElevenLabs: a key field on the
engine card → `POST /api/video/key` → `video key set --stdin`; never in
a log, a response or the chat. Agent first: every fallback shows *Copy
for my agent* as the primary door, the terminal line under "Do it
yourself"; `/setup-video` (Guide → Settings, also a slash command)
installs ffmpeg, whisper, the folder and the recorder in one
conversation, with the Homebrew-password warning up front. Writes to
`/api/` are accepted from this computer only (Host and Origin checks),
JSON bodies only, capped. Settings `video.pause`, `video.recordings`.
Reviewed before building (product + tech, 45 findings: audio-measured
pauses, dedupe, persisted watcher state, the one-rule editing model,
key-field hygiene) and after (tech: a frame-grid edge entering the
neighbouring word, a sliver between a pause and a filler, the page not
trimming its words to the silences; product: the Guide text teaching the
old gesture, counts by kind, the pill at the end of the sentence it
follows). `core/test-video-page.js` 68 checks, `core/test-video.js` 143
(a clip with a real silence, the watcher's pure rules, the edge cases
above); the key route and the live watcher were exercised by hand on the
scratch server, not in `npm test` (a server test is a follow-up).
Not in this slice: a recording button in the page (Recordly has no API),
*Remember this engine* on the page (`config set video.engine` from the
terminal does it), several takes per item, a Video line on Home's Today
strip, the EPIPE and doctor-stale-lock minors, a 409 on `/api/data` PUT
when the file moved underneath (the watcher's two-minute re-add rule
covers the one case that matters today), server tests for the key and
recordings routes, `video add` for audio-only files (the folder watch
takes video files only; `--drop` on an uncut take keeps the tail to the
end of the take while a page cut drops wordless tails: two verbs, two
rules, both logged).
Known: the Claude desktop Browser pane cannot fetch through the service
worker (every page there loads only when the worker is unregistered;
Chrome and Safari are fine).

### M3 · Collaborators through agents, no shared app (work in progress on branch `wip/sharing`)
Design: `docs/share-flow.md` (what the person sees). Built so far on the branch: `core/net.js` (ed25519 +
x25519 + AES-GCM, openDM-shaped `intent.v0.1` envelopes, sealed relay
events), `relay.js` (dumb HTTP relay, 30-day queue), CLI `id` · `contacts` ·
`share with|sync|list|revoke` · `inbox [accept|skip]`; the offer carries its
tasks so accepting lands them; changes are sent on their own after page
edits (serve.js) and after CLI task commands; serve.js polls for what others
sent; `SOLO_DATA` for a second identity on one machine. Nothing lands
without `inbox accept`; `notes` never travel; only the status travels back;
unknown senders wait until their card is added; keys and the inbox stay out
of the backup repo.
2026-10-14, later: `id create` registers the card on the OHAN box
(`OHAN_BOX` / `network.box`), `id publish`
updates it (listed, name, bio), `contacts add @handle` resolves and verifies
the card from the box, tagging a contact on a task is the share.
Also 2026-10-14, later: the **From others** block on Home (reads the inbox
through serve.js, Accept / Skip per item and Accept all, hides when nothing
waits; `GET /api/inbox`, `POST /api/inbox/accept|skip`); offers carry their
tasks and a grown offer replaces the earlier one; `id create --force`
rotates the key with the old key's signature.
Still to do, in order: the box live on ohan.live (count + accept/skip
from the page, reading `inbox.json`); the Guide prompt *What's new from
others*; gift-wrap so the relay does not see the sender key; a `/setup-share`
prompt that walks two people through cards; attachments on shared tasks by
hash; a hosted default relay and the Schnorr wrapper for public Nostr relays;
the MCP tools (M9) `send` / `inbox` / `accept` so a chat agent does it.

### M4 · Pull from the apps the agent is connected to
**Started 2026-10-21 (onboarding pass):** *Bring in my work* (`/bring-in`: Notion, Linear, Todoist, Asana, Trello, Jira, GitHub, Google Tasks, Reminders or a list, only the person's open work, one `import <file>.json`, re-runs update by `ext`), *Start my day* (`/start-day`: calendar + what changed in `bringIn.sources` + the day), *Wrap up the day* gathers from the conversation and `git log`. Still open below: mail and meeting notes as sources, the cross-project weekly prompt.
Nothing to build in Solo Ops beyond prompts: "take my last 20 emails and
make tasks", "put this week's calendar as posts". Add a *Bring in* category
to the Guide with 4–5 such prompts, and document the pattern in AGENTS.md.
*Turn this conversation into tasks* (`/capture`) is the first of these.
Also wanted: an *Across all my projects* weekly prompt, which needs a
cross-workspace context token.

### M5 · Briefing packs — `node solo.js brief --for <role>`
A filtered snapshot (this workspace, open work only), AGENTS.md, the role's
prompts, and a one-paragraph "how we work" from `solo.config.js`. Output as
one Markdown file to hand to a person or paste into their agent.

### M6 · Telegram (and WhatsApp the same way)
Design in `docs/telegram.md`: `/add`, `/done`, `/next`, and any link or
photo into Inspiration. A small Node process beside `serve.js`, token in
`data/settings.json` (never in the repo).

### M7 · Phone install, still local
`node serve.js --host` plus a QR code on Home; the phone on the same wifi
installs the PWA. Needs: bind to the LAN address with a one-line warning,
QR rendered without a dependency, capture strip and boards usable at
375px.

## Minor / issues

- **From the Guide audit (2026-10-21), not done:** (1) *Next* has no overdue
  move: Move what's overdue is first on the Calendar's list whether or not
  anything is overdue, and Home does not mention overdue work. (2) An edited
  built-in keeps the mode it was edited in rather than a mode-neutral text
  with `{{head}}` (the plan's first idea): simpler, but an edit made in chat
  mode does nothing in Runs commands mode. (3) From Reply, `link` works only on
  the pages that show the story (Drafts, Scripts, Video, Schedule) and
  `config set` only with the server or a linked folder; elsewhere they are
  skipped with the reason (run them in a terminal). (4) `npm run test:guide` needs Chrome on the
  machine and is skipped (exit 0) without it. (5) Found, older: the Writing
  page drops a draft's `files` (its attachment links, `data/attachments/
  note-<id>-<n>.<ext>`) when it loads, because `normalizeLibrary`
  (`studio/writing-viewer.js`) keeps only id, text, images and the dates; the
  next write leaves them out of `writing.json`. Keep `files` there (and in the
  Sync apply) and add a test. (6) ⌘K's *Ask: …* entries register once per
  page, so a prompt hidden in the Guide stays in ⌘K until a reload. (7) Hide /
  show have no times (unlike `reset`): with two copies (file:// and the
  server, or two browsers) a later hide can be undone by an older `shown`.
  (8) Dates: `9am`, `Oct 30`, `next friday` are refused with the formats that
  work; teaching `core/when.js` am/pm and month names would let them through
  (CLI and Reply share it). (9) An edit saved before edits had a mode applies
  to both modes, including a files-mode preamble in chat mode: re-save it.
  (10) Reply edges from the second technical review: `'tis the season
  --pri high` swallows the flag into the text; a quote nested inside curly
  quotes loses one mark; a task id with no digit (about 1 in 100 generated
  ids) is not recognised as an id in a numbered line outside a block or before
  an unreadable date (it still works as a title match); a second reply with an
  identical note while the first file write is in flight is logged as `ui`.
  (11) `inspo use` from a chat marks the item used before the piece is made on
  its page: if the person never presses Continue, the item says used with no
  piece (Continue stays offered on that page until another preview).
  (12) A Week review on Home with post lines takes two Applies (Home, then
  the Calendar); an *Apply all on the Calendar* button would make it one.
- **From the onboarding reviews (2026-10-21), not done:**
  (1) *Connect my other agents*: a paragraph for the global agent instructions
  (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) so the agent you code with
  elsewhere logs finished work with `node "<folder>/solo.js" … --as agent`
  (an idempotent marked block, a backup of the file, a diff, a yes per file;
  never project files of other repos). Waits for M9, which covers the same
  need without touching global files. (2) CLI writes are read-modify-write
  without a lock: a scheduled `/start-day`, an agent and `serve.js` writing
  the same board can lose an update; write to a temp file and rename, and
  re-check `updatedAt` before writing. (3) `prompts export --for codex` writes
  to the global `~/.codex/prompts` with a relative `node solo.js` and plain
  names, so `/now` runs in whatever folder Codex is in: use the absolute
  folder and a `solo-` prefix. (4) Renaming the shipped board or the first
  workspace does nothing: the entry in `solo.config.js` shadows the one in
  `boards.json` / `workspaces.json` (`core/config.js boards()`, `workspaces()`;
  solo.js `allBoards()`), while `boards rename runway` prints that it
  overrides the title. `template blank --name` goes through `config set`
  instead. (5) Neutral shipped defaults (no "Launch Runway" sprint framing in
  `solo.config.js`, the sprint only in the Sample project) are the owner's
  call: they change what an existing user without settings sees. (6) On
  `file://` without a linked folder, work typed into a blank page is newer
  than the files when the folder is linked later and overwrites them (as
  before; the empty board now says the work is in this browser only;
  what was typed is no longer thrown away when the folder is linked, see
  Done). (7) The welcome card's *Name it* writes `data/settings.json` with
  the server and keeps the name in this browser on `file://`; with only a
  linked folder it is not offered (a pasted `config set name …` line does
  it). (8) Removing the Sample project (`workspaces rm sample-project`) can
  come back: `workspaces.json` merges by union, so an open page that knows
  the project writes it back (true of any project; tombstones would fix
  it). (9) From the UX review, small: Home says *workspaces* and *project*
  for the same thing; Recent changes shows "you · workspaces.json /
  boards.json" on a first open; the "Solo founder ops · local, file-based,
  agent-native" line is jargon to a newcomer; *Share today* is the main
  button on an empty day; the board's foot note says "Saved in this
  browser" next to "Synced to data/"; the Guide handle covers the first
  letter of "This week" at 800 px and the capture strip's bulb at 375 px,
  where *Settings* is clipped and *Copy context* wraps; two *Preview
  changes* buttons on Reply. (10) The launch kit (the owner has edits in
  progress there, so not touched here): SHOTLIST rows 01 (the welcome card
  needs a blank copy, not `template all`), 02 (the Guide opens on Ask), 06
  (three questions, `template blank`, /bring-in, the menu), 07; `shoot.js`
  FRESH copy and shot 02's `?guide=settings`; `conversations/terms.js` and
  VIDEO-SCRIPT (four questions); reshoot 47-guide-ask and
  19-guide-ask-your-ai (Start with one now sits above the ask box).

- **Video, two clocks (seen 2026-10-20; the Guide half was fixed 2026-10-21: "No posts on the schedule" now shows only when this browser knows the schedule):** two clocks on the Video page can also read as a bug to a careful eye: the strip's "0:48.5 of 0:52.0" (the cut's runtime) next to the player's "0:00.0 of 0:52.0" (the playhead); label the first "cut 0:48.5".

- **Video: after a decode error the black frame stays (2026-10-20):** the
  player's `error` listener sets `cannotPlay` and repaints the chrome, but
  only `paintPlayer` hides the `<video>`, so the empty frame sits above the
  "cannot play this recording" card until the next full paint. Found in
  review, not fixed.

- **Studio pages: the capture strip and the Guide handle overlap (2026-10-19):**
  on Script Viewer, Writing Viewer and Video the Inspiration capture strip
  (`.studio-nav + .capture`, `top:8px`) sits over the "… · STUDIO" eyebrow,
  and once the window scrolls the fixed Guide handle (`top:140px`) covers the
  first letters of the sidebar's active item. The sidebars also size
  themselves to `calc(100vh - 62px)` as if the header were 62px, so the
  window scrolls when it should not. One shared fix in theme.css /
  script-viewer.css.

- **`doctor` does not know the page's job files (2026-10-19):** serve.js
  writes `data/videos/<id>/render.json` / `transcribe.json` with the pid of
  the CLI it spawned; `doctor`'s stale-lock check covers `progress.json`
  only. Extend it, and have `video rm --files` mention them.

- **`video render` dies with EPIPE when stdout closes (2026-10-19):** the
  progress line is written to stdout without an error handler, so
  `node solo.js video render v1 | head -3` throws once `head` exits; the
  render itself finishes and is recorded. Ignore EPIPE on stdout (or stop
  printing progress when it is not a TTY).

- **Launch kit docs (hygiene review 2026-10-13):** `docs/launch/SHOTLIST.md`
  names `shoot.sh` / `seed.sh` (the files are `.js`), says shots land in
  `docs/screenshots/` (they go to `docs/screenshots/launch/`, git-ignored;
  `shoot.js --out` should default there) and documents `video/` without
  saying it is local only. Left to the session editing those files (the kit
  is local only since 2026-10-21).
- **README screenshots need the local launch kit:** `shoot.js`, `seed.js` and
  `mock/frame.html` remake `docs/screenshots/` and live in the git-ignored
  `docs/launch/`. If contributors should reshoot them, move those three (with
  invented content only) into a tracked `tools/screenshots/`.
- **`core/test-apply.js` depends on `gh`:** "backup setup --name without a
  name is refused" fails when gh is not logged in, and `npm test` stops at the
  first failure (`&&` chain). Make it independent of gh.

- **Home, after launch (owner review 2026-10-13):** a layout pass — one header
  row (title · scope · actions), projects as compact rows past two, This week
  in two columns (Tasks in play with actions | Schedule + posts), a quieter
  source tag in Recent changes and "loaded from file" instead of "deleted" when
  sample content yields to the file, the first-run banner only while every
  project is sample, a project picker on the quick-add. The owner name lives in
  `solo.config.js` for now; move it to `data/settings.json` so Home can edit it
  in place. Naming: the nav says *Workspace*, Home says *Projects*; pick one.
  The Calendar's Share today offers one scope; give it every project like Home.

- **Guide, after the ask box (design reviewed 2026-10-13, tech + usability):**
  (1) *Ask AI* on items: a button in the task card **header** row (the footer
  only renders on expanded cards; new tasks are collapsed), on the selected
  post in the social detail panel, beside Copy for AI in both viewers; plus
  right-click on a card as the shortcut, never the only route. Opens the Guide
  on Ask with one chip, "This task: <title>", a status line "Asking about:
  <title>" with × to detach, cursor in the box. Needs `Guide.askAbout(kind,
  id)` using the `pendingSlug` pattern (open() re-renders twice) and a
  `Context.item(kind, id)` builder by id (posts are matched by title today).
  (2) A **"My AI already has the setup text"** switch in Settings that drops
  the preamble and reply legend from every copy. Exact-string removal must
  happen inside `prompts()` (same `o` as `P.build`), chat mode only, and
  custom prompts carry the head baked in from the editor; cut from launch
  because a user who pasted the setup into a plain chat flips it and the next
  day's chat answers in prose. (3) Prompts as presets that fill the ask box,
  "Save as prompt" from the box, a simpler prompt editor. (4) Paste-anywhere
  into Reply (⌘V with no field focused): conflicts with the capture strip,
  which saves such a paste to Inspiration; rule: text `Apply.segment()` parses
  as commands goes to Reply while the Guide is open. (5) After Apply, each
  change links to and flashes its card (apply.js returns labels, not ids).

- **Meetings pile into To Do** (UX review 2026-10-13). Four meetings and a
  dentist sit between real work on the board. Group `meeting`-tagged cards
  under a collapsed *Meetings (n)* strip at the bottom of To Do, or hide them
  behind a chip by default, since the Calendar is their home.
- **Date pickers**: the board's When field accepts "due fri" as text, but
  picking a date with the button writes a plain date-time and so turns the
  deadline into a timed task; give the add row a separate Deadline picker
  or a Time/Deadline toggle. Firefox and macOS Safari show no popup for
  `type=time` (the Until button there just focuses the field).
- **Calendar, later**: Week view with time blocks; drag to reschedule in
  Month; a now-line; auto-tick a meeting whose end has passed (with undo).

- **Your settings, small leftovers (reviews 2026-10-15):** `core/theme-boot.js` reads only the shipped `theme`, so a `config set theme.palette dusk` default paints late (until the user picks a theme); `social/social-calendar.html` keeps a static title and ignores a `name` setting; `social/social-model.js` relabels a post whose type left the list as the third type instead of keeping it (so a shorter `social.postTypes` list rewrites old posts on their next edit); no way to set your name without the terminal or a pasted reply yet (click the Home heading to type it, writing the same setting, is the planned follow-up). `boards.<id>.<key>` copies the whole shipped board into your settings (so a later change to the shipped milestones no longer reaches that board): merge list entries by id at read time instead and store only the changed key. The Reply preview counts a `config set a 1 b 2` line as one change.

- **From the Home/Share reviews (2026-10-13), not done:** a week-ahead glance
  (Mon–Sun with dots for meetings and posts) on Home; keyboard shortcuts `n`
  new task, `/` focus the capture strip; a size toggle on the share card
  (square only today); Recent changes on Home only knows edits made while a
  page was open (the file log covers the rest, under *Restore a file*);
  another origin's theme is applied on first contact (sync.js applies
  settings.json like any file); Firefox below 127 cannot copy an image, the
  dialog saves the file instead and says so. The sync pill still says
  "Synced to data/"; "Saved to your folder" reads better for non-technical
  users.
- **Fresh folder, server running, no data files yet**: every page logs one
  404 per missing data file in the console. Harmless; `serve.js` could answer
  204 for a missing data file instead.

- **Home**: peeks every workspace file and logs a 404 for apps whose file
  does not exist yet (e.g. `launch-writing.json`). Harmless; skip the peek
  when the app has never been opened.
- **Inspiration**: a PNG screenshot's thumbnail can be as large as the
  original (PNG at 640px). Use JPEG when the PNG thumbnail is not at least
  30% smaller, keep PNG only for transparency.
- **Social images** still use their own browser store
  (`social-image-store.js`) instead of `core/attach.js`; migrate so posts
  get thumbnails + originals on disk the same way inspiration and notes do.
- **CLI `inspo show`** does not print `name`/`size`/`stored` for file items.
- **`doctor --fix`**: delete orphan attachments and set missing
  `updatedAt` on request.
- **Revert from Home → Recent changes** restores a whole file to that
  moment; the confirm should say what later changes to that file will be
  lost (until M1 replaces it for everyday use).
- **Service worker** logs "unknown error fetching the script" inside some
  embedded browsers (Claude's preview pane). Not reproducible in Chrome;
  guard registration with a try/catch and stay quiet.
- **Never verified by hand**: the file:// linked-folder flow (File System
  Access API) end to end, and dragging an image from another app's window
  into the capture strip. Both are code-reviewed only.
- **Theme fonts** load from Google Fonts; offline or on file:// without a
  network the presets fall back to system fonts. Consider bundling Inter
  and Lato under `fonts/` (license allows it).
- **README screenshots** predate the new logo and the Protect block;
  retake with `docs/screenshots` script when M2 lands.

## Done

- 2026-10-21 · `d9cd818` · **Sharing off main, launch kit out of the repo.**
  The two-person sharing commands that `a041d5d` ("keep the executable bit")
  carried into main by mistake are reverted (they could not run: `core/net.js`
  was never committed); sharing continues on branch `wip/sharing` (M3). Kept
  on main: the executable bit, every later change, Share today and the
  checklist share, and the guards for when sharing lands (doctor knows the
  sharing files, backups skip keys, imports never make `@person` tags or
  `share:` ids). `docs/launch/` (posts, films, deck, slides, charts, the
  screenshot tooling) is git-ignored and untracked; the files stay on the
  owner's computer, earlier versions in the history.
- 2026-10-21 · `be8be5f` · **The Guide, audited end to end** (every setting against every
  page, every prompt and its answer; plan reviewed by three agents: the
  project's history, product/UX, staff AI engineering). *Checks first:*
  `core/test-guide.js` (in `npm test`) runs every page's real scripts in Node
  and copies every prompt on every page in both modes, empty / sample / an
  item open; feeds a realistic chat answer for every prompt that asks for
  lines through the Guide's own Reply path, plus messy answers and refusals;
  runs every `node solo.js` line a files-mode prompt names in a scratch copy
  with a flag audit. `npm run test:guide` does the same in headless Chrome on
  every page (Reply reaches the file and the log). *Reply:* numbered and
  bulleted lines, `[t7]`, smart quotes, CRLF, multi-line copy all read; prose
  bullets are not tasks; a date it cannot read is a skipped line with the
  reason; preview = apply (`Apply.reply`); applied lines log as source
  `reply`; `--task` links; `inspo use`. Fixed on the way: a reply applied on
  the Script, Writing or Streak page was overwritten by the page's own copy
  a moment later (the file write reads the page, not the browser store);
  they now take the reply first (`refreshScripts`, `refreshNotes`,
  `refreshSchedule`, called by the Guide like `refreshBoard`). *After two
  reviews (staff engineering, product/UX):* with files on disk a line is applied
  only by a page that saves its file (elsewhere it could never reach the file,
  or overwrite newer work; a page still never writes another page's file); the
  rest goes on with **Continue on …**, previewed on the page that saves it and
  chained when a reply needs several pages (tasks with posts: the Calendar in
  one hop); `inspo use` marks the item used where inspiration is saved and
  hands the piece, with its id reserved, to its page as data (`inspo make`,
  once only); each line shows
  what it will do there; Overview and About say to paste on Home; script and draft bodies
  are copied as typed (quotes, numbers, bullets); quotes delimit only where a
  value starts, so curly quotes and apostrophes stay; `9am` stays with its
  date and is refused whole; `at`/`due <id> <date>` refuse an unreadable date
  (CLI too); steps inside a block survive the apply; numbered prose outside a
  block is not a command; `inspo use … --as post --as agent` reads both (CLI
  and Reply); every reply write is logged `reply` and the note is cleared
  after; prompt resets stick (`reset`); Streak no longer offers prompts that
  need an open item; an empty Overview starts like Home; the Reply text and
  preview survive a re-render. *Write back:* `scripts set` / `notes
  set` (CLI and Reply), so Improve, Edit this draft and Ten hooks land in the
  item after a yes. *New:* Move what's overdue (first on the Calendar). *Pages:*
  Overview, About and Streak have their own help and prompts; cards that
  need an open item say what to open; hidden prompts leave no dead end;
  edits belong to the mode they were made in; `prompts rm` / `restore` stick
  (`removed` / `shown`); chat-mode Settings label terminal prompts, Undo is a
  link; the schema link works; a `?guide=` link no longer picks the mode.
  *Docs:* `docs/guide.md` (the three paths, every setting and its storage key,
  tokens, the reply contract, tests, troubleshooting, what changed) and
  `docs/guide-prompts.md`, generated by `prompts export --for docs` from
  `core/prompts.js` (`PAGES`, `catalogue()`) and byte-checked by
  `core/test-prompts.js`. A third "No AI" switch was not added (owner's call):
  Quick and the page buttons are that path, documented.
- 2026-10-21 · `3b0b5b0` · **Onboarding: blank works, your work comes in, one menu, a
  faster setup** (planned, reviewed by three agents: the project's history,
  product/UX, staff AI engineering; then built in four parts). *Blank:* a
  first open starts empty on every page (`Store.seedBlank`, flag `blank`,
  still "fresh" for sync so a file always wins; `Store.isSample` is what a
  page calls the sample), so a first task never drags the 18 sample tasks
  into `data/`; `template blank [--name]` writes empty files and names the
  project through `config set`; the sample is a separate *Sample project*
  (`template sample`, Home → Look around a sample project, `/api/setup`),
  marked `sample: true`, left out of "all projects" views, with a banner on
  every page; Home's welcome card (Bring in my work · Add tasks · the sample ·
  Link folder) shows while nothing real exists; typing into an empty Script
  or Writing Viewer now saves (it was lost); `doctor` says fresh install
  until something real exists; `template` fills empty files.
  *Bring in:* `--ext` matches across every board of the workspace, explicit
  `--col` / `--pri` / `--due` apply on a match, `done ext:<id>`, `share:` ids
  are refused from `add` and pasted replies, ext shows in snapshots and
  lists; `import <items.json> [--dry-run]` is one validated write (one log
  entry, no imported text through a shell); prompts *Bring in my work*
  (`/bring-in`), *Start my day* (`/start-day`), *Wrap up the day* gathers
  first; one untrusted-content rule in every import prompt and AGENTS.md;
  `bringIn.sources` setting. *Menu:* `MENU` in core/prompts.js →
  `node solo.js menu`, `/menu`, the AGENTS.md block (written by `prompts
  export`), the Guide's Start here / Start with one and ⌘K *Ask: …*; the
  Guide opens on Ask, guesses the AI from how the page runs, shows
  `/commands` on cards, orders *For this page* by the page, trims the chips,
  says the right thing to agent users (nothing to paste back); `/hooks` is
  `/ten-hooks` (Claude Code keeps `/hooks`); setup prompts export by a
  `slash` flag; the shared slash commands and the chat bootstrap always carry
  the shipped names (a project name could land in committed files).
  *Setup:* one round of three questions, blank start, the page opened, work
  brought in, the backup with its repo name (also offered in `/backup-setup`,
  the Guide and printed by `backup setup`), the menu last.
  After the build, three more reviews (history, UX, engineering) and their
  fixes: a re-import never reopens work finished here (status and priority
  follow the source only when the source changed them: `extCol` / `extPri`),
  what is typed on a blank page is never replaced by a file on Link folder
  (the pages read the shared fresh flag only), `template blank` stamps its
  files 1970 so a browser holding real work still wins, ids never collide
  in a big import, imported labels never become @contact tags, a pasted
  import with an unreadable date is refused, `ext:` works on any board and
  any case, the Sample project stays out of Quick, Calendar *All* and
  `doctor`, Start here copies on one click, the mode stays a guess until
  picked, one switch for the first open (`FIRST_OPEN` in core/templates.js),
  the menu fits 80 columns and the chat bootstrap carries it.
  Tests: `core/test-blank.js` (the real store, sync and models against a fake
  server: blank never writes, files win, the first change writes only itself,
  older sample browsers and real conflicts behave as before; the CLI side),
  test-apply (re-imports, parity with the CLI, import), test-prompts (menu,
  reserved slash names, import prompts, setup).

- 2026-10-20 · Video: with Bigger on, in a window around 900 px tall, the
  bottom of the player, its caption band and the round play button were cut
  off: the sticky top block (capped at 42vh so the words stay reachable)
  had more in it than fit, and scrolled inside itself. Now the player
  shrinks to the room the block leaves after the strip, the help line above
  it and the hint under it, measured on the page (`fitPlayer` in
  `video-main.js` → `--v-room`), width following at 16:9, and the big
  player's button and captions scale with it; Bigger may take half the
  window, never more. Below a 120 px frame the help line and the hint go
  first, and only then does the block scroll as before. `a95800f`.

- 2026-10-19 · `prompts export` no longer deletes `.claude/commands/mine/`
  when `data/prompts.json` is absent (a worktree, a fresh clone): the
  `mine/` cleanup is skipped without a personal prompts file. `e293b37`.

- 2026-10-15 · Your settings out of the public repo: `solo.config.js` is part of the app, the same for everyone; a person's own values (`owner`, `name`, board titles and milestones, post types, any key) live in `data/settings.json` → `config`, written by `node solo.js config set <setting> <value>` (`add <list> a b`, `unset`, `set --file x.json`, `clear`) and by `config set` lines in a pasted reply (core/apply.js, served or linked pages). One shared library in `core/config.js` (`Config.override` · `check` · `mergeOverrides`) checks every value against the shipped one (comma lists, one list entry by id such as `boards.runway.title`, unknown keys refused with a suggestion), merges them over the file for the pages, the CLI and serve.js, and ignores values of another shape so a hand-edited file cannot blank a page (`doctor` reports them). The browser keeps the last copy as `marathon.config`, reloads once when the file changes (not while typing, never without storage), reconciles after the first pull, and the file's `config` wins every write of settings.json unless the page changed it, so a theme click never drops or rolls back what the CLI wrote. `guard` refuses a staged `solo.config.js` whose `owner` is set and warns on other personal-looking values; `template settings --force` keeps the settings; `/setup` uses `config set`. Reviewed by two agents (technical, usability), findings fixed. `core/test-config.js`.

- 2026-10-13 · Fresh-install pass before the announcement (a clone followed
  the README step by step, plus a repo hygiene review). `node serve.js` on a
  taken port says so and suggests `--port` instead of a stack trace;
  `--help` works. Untouched sample data no longer lands in `data/` the first
  time a served page opens (it stays in the browser until the user changes
  something or runs `template all`), so `doctor` keeps saying "fresh install"
  and the inbox shows nothing the user did not save. `log` and `revert` show
  local time. `doctor` exits 0 when the only issue is a missing backup.
  README terminal examples run as written (`--ws launch` was a project id,
  `start "launch post"` was ambiguous), the first write of a file is noted as
  having no snapshot, `prompts export --for codex` says it writes to
  `~/.codex/prompts`. `npm test` runs every test file; CONTRIBUTING names the
  guard; SECURITY lists `data/exports/`; LICENSE says Solo Ops.

- 2026-10-13 · Privacy: the committed `/use-inspo` slash command carried the
  owner's edited prompt text (export applied `data/prompts.json` overrides to
  the shared files). `prompts export` now writes the built-in text to the
  shared files and the user's edits of built-ins to `mine/` (git-ignored,
  `/mine:<name>`), and `guard` refuses a shared command whose text differs
  from the built-in export. Found by a fresh-clone test before the
  announcement.

- 2026-10-13 · README and About for launch: new copy (one folder, your own
  AI, who it is for, three ways in), eight fresh screenshots from a seeded
  scratch copy, roadmap in step with `about.html` and M9/M10. Launch film
  and launch screenshots stay out of the repo (`.gitignore`). Sample data
  yielding to a file is no longer logged as agent deletions, and the fresh
  flag clears after that first apply so later agent/CLI edits are logged
  (`core/sync.js`, `Store.clearFresh`). Overdue chip readable in dark
  palettes (`--on-accent`). `doctor | health` in help.

- 2026-10-13 · Home: owner name, scope, Start/Done across projects, create →
  Home. `owner` in `solo.config.js` makes the title "Anshuli’s workspaces"
  (the brand moves to the eyebrow; `/setup` asks for the name). Creating a
  project now lands on Home with a toast saying Board and Calendar switched to
  it (the "my data is gone" report was the app switching projects, nothing on
  disk changed); an empty board names the other projects and their open
  counts. The Today strip gets scope chips (All · each project) that filter
  Today, This week and Recent changes, remembered per browser. Tasks in play
  rows get ▶ Start / ✓ Done for any project: `Quick.setCol` writes the browser
  copy at once and, with a server or linked folder, re-applies the change on
  the file itself (the file is the copy that counts for a board this page did
  not pull). Share today offers every project plus All.

- 2026-10-13 · Launch screenshots: `docs/launch/SHOTLIST.md` (the script), `seed.js`
  (the Pocket Studio sample project), `personas.js` (Tomas · Noor · Lena, the
  three hero workspaces), `capture.sh` (real CLI output for the terminal
  frames), `mock/chat.html` + `mock/term.html` (reproductions with verbatim
  content), `mock/frame.html` + `shoot.js` (headless Chrome, 1440×900 @2×).
  57 images in `docs/screenshots/launch/` (local only, git-ignored like the
  film; README images live in `docs/screenshots/`) plus the week
  (`week.js`/`week.sh`: one week of the sample project run step by step with
  the real CLI, a frame shot between steps). The launch video (60 s,
  `docs/launch/VIDEO-SCRIPT.md`, reviewed by a tech-marketing and a copy
  reviewer before the build), a 46 s teaser and the earlier 72 s film in
  `docs/launch/video/` (Remotion, synthesised soundtracks). README pass still
  to come. (All of `docs/launch/` is local only since 2026-10-21.)
- 2026-10-13 · Calendar: boards created at runtime were missing on a fresh
  browser's first load (the registry `boards.json` lands silently, so the
  calendar never registered their files until a reload). Found while shooting
  the week; fixed in `calendar/calendar-main.js` by re-registering on the
  registry's `applied` event.

- 2026-10-13 · Guide: ask box + blanks fix (plan reviewed by a tech and a
  usability agent before building; scope cut to what both agreed). The field
  pile on prompt cards was a bug: `blanks()` read the reply legend's notation
  (`<task>`, `<when|clear>`…) as fields, so 23 of 27 Ask prompts showed up to nine
  bogus inputs in chat mode and *Fill my calendar* showed seven in files mode.
  Now `P.blanks()` (core/prompts.js) ignores the legend and anything inside
  backticks; `core/test-prompts.js` asserts 4 one-field Ask prompts in chat mode
  (list, draft, idea, your week) plus the folder path in *Set up this folder*,
  3 in files mode, zero elsewhere. New at
  the top of **Ask**: *Ask your AI* — one box in plain words, "Sends along"
  chips named after the item ("This task: …", "This board", "My schedule"…,
  defaults per page), **Copy for my AI** composes preamble + each chip's
  context + `WHAT I WANT:` + the sentence + the reply legend (files mode: no
  legend, a line about `node solo.js show <id>`); the box and chips survive
  the Guide's async re-renders; Reply then reads "Your ask copied…". Chat mode
  shows *New chat? Paste this first, once.* with Copy setup above the box.
  Reply placeholder: "Paste the whole answer here. The changes are picked out
  for you, and nothing happens until you press Preview."
  Footer button on other tabs: *Paste the answer*. "Recent context" chip
  renamed *Recent changes*. Prompt texts and the slash-command export are
  byte-identical. A Node harness ran every verb of the reply legend through
  `core/apply.js` against an in-memory store and found two real bugs, fixed:
  `at <task> fri 10:00 --until 11:00` was not recognised as a command (the
  *Plan today* answers would have been ignored), and a `scripts add` /
  `notes add` whose body block followed the commands block (how every chat AI
  formats it, often with a ```markdown tag or a "Here is the script:" line)
  produced an empty script or note. `bodyAfter()` now tracks fences; preview
  units for scripts and notes are self-contained. A user's edited or own
  prompt that carries `{{snapshot}}` but no reply legend now gets the legend.

- 2026-10-13 · CLI: `check <task> <n>` ran `doctor` (the alias `check: cmdDoctor` came
  later in the command table and won). The doctor alias is now `health`.

- 2026-10-13 · Share today + Home as a dashboard (reviewed twice before
  building). `core/share-card.js`: a 1080×1080 card of today (Doing · Schedule
  · Next up, titles only, light palette, system fonts, streak only from 7 days)
  built as SVG, drawn to canvas, **Copy image** (clipboard, Safari-safe),
  **Copy as text**, **Save as file** into `data/exports/today-<date>.png`
  (`Sync.saveFile` carries a Blob; `serve.js` accepts png). Same text from
  `node solo.js share today [--all]`. Home rebuilt around a **Today strip**
  (date, now / next with "in 2 h", Doing with project chips, overdue · done
  today · due · meetings · posts this week, quick add with a date at the end
  via `Quick.addLines`, Share today · Calendar · Plan today), one card per
  project (Doing or Next, progress, chips) opening `overview.html` (boards,
  apps, rename / apps / remove — the old "Open project" block), *This week*
  grouped by project without ids, Recent changes in plain words from the
  browser's events with the file log folded under *Restore a file*, activity
  heatmap collapsed, terminal block reduced to a footer line, "project"
  on every Home label. Home's script moved to `core/home.js` (+ `home.css`),
  covered by the `node --check` loop. Fixed on the way: a typo in `?ws=`
  no longer becomes a phantom workspace whose files pages would create;
  theme writes carry a log note, do not bump activity, and a browser that
  never chose a theme adopts the file instead of asking; `serve.js` does not
  log a write that differs only by `updatedAt`; `Guide.openPrompt(slug)`;
  Share today on the Calendar toolbar and in ⌘K; quick-add activity is
  credited to the right board. After the post-build reviews: Home registers
  the open project's boards (a quick add writes the file at once and an
  agent's edit redraws the strip), the quick add form is static markup so a
  background re-render never eats what is being typed, priority sorting
  treats high as high (`rank()`), *Copy as text* is plain text for chats,
  ended meetings drop off the card and read "ended" on Home, the Overview
  looks at a project without switching the open one (`data-no-persist` on
  its nav) and owns Rename / Apps / Remove in place, a deep link to a project
  the browser has not seen reloads once `workspaces.json` arrives, boards and
  workspaces files stay restorable. **Mono is the default palette** (owner's
  call): `solo.config.js`, `theme-boot.js`, the picker order, the sample
  settings and the CLI default say `mono`; the app icon, favicon, manifest
  colours and every page's `theme-color` follow (#222222 on #F2F2F2). Warm,
  paper, forest and dusk stay in the picker; a browser or `settings.json`
  that already chose a palette keeps it. Project chips keep their own hues
  (they come from `solo.config.js → projects`, not the theme).

- 2026-10-13 · M8 Calendar + dates. Tasks carry `at` / `until` / `due` / `ext`
  (`core/when.js` parses `tomorrow 14:00`, `fri 10:00`, `+3d 17:30`, zoned
  stamps → local; `normalize()` keeps the fields). CLI: `add --at --until
  --due --ext` (same `ext` updates instead of duplicating), `at`, `due`,
  `calendar [--days] [--all]`, Schedule block in `today`, By day in `week`,
  doctor warnings. Reply tab accepts the same (`at`/`due` only when the line
  ends in a date). New `calendar/` app: Agenda + Month, filters by board ·
  meetings · posts · open/done · all projects (other workspaces peeked
  read-only), tick to finish, + on a day, every file shown registered with
  sync. Nav Calendar for every workspace; the posts page is now Streak.
  Home: Schedule card. Guide: *Bring in* group with *Fill my calendar* and
  *Plan today around my meetings*, `{{schedule}}` token, calendar page
  prompts. Sample sprint has one meeting. Cut for release 1 (from review):
  Week view with time blocks, drag reschedule, writes across workspaces,
  ⌘K/Quick date token, `import`/`share` dates.

- 2026-10-13 · Backup as part of setup, for non-technical users: `node solo.js
  backup setup` (gh logged in → private repo `solo-ops-data` created and
  pushed; otherwise the two human ways), `backup --to <folder>` (plain copy
  into iCloud Drive / Dropbox, remembered in `data/backup.json`), `backup --daily`
  (launchd / crontab / schtasks line). Guide: pending *Save your data
  somewhere private* card on every tab until done, Protect your work shows
  the why and three ways with copy buttons, *Mark as done* for pages that
  cannot see the server. Guard message leads with the why; `guard
  --allow-data` for a private fork (checks visibility). `/setup` and
  `/backup-setup` prompts ask GitHub or folder before creating anything.

- 2026-10-13 · Privacy hard line + first run: `node solo.js guard [--install]`
  refuses commits that stage `data/`, exports or personal prompts (pre-commit
  hook); AGENTS.md *Privacy boundary* and *First run* sections; `/setup`
  prompt (asks three questions, then doctor → name → sample or plan → serve →
  week → private backup → guard); `today`/`week`/`doctor` say what to do next
  on an empty install.

- 2026-10-13 · Exports land in `data/exports/` (server `PUT /api/export/<name>`,
  linked folder via `Sync.saveFile`) instead of the browser's download folder:
  Export everything, board JSON + Markdown, the social bundle, and the safety
  copies before Load template / Clear / first-contact conflicts. Download stays
  the fallback on plain `file://`.

- 2026-10-13 · Guide prompts rebuilt from one source (`core/prompts.js`, shared
  with the CLI). Chat-mode prompts carry the reply format, so a fresh ChatGPT
  or Claude tab needs no setup; *Set up this chat* / *Set up this folder* in
  Settings; command-mode prompts name the folder path (server `/api/ping`,
  `file://` pathname). New: I'm stuck, Plan the week / Close the week,
  Am I overcommitted?, Cut scope to ship by a date, Turn this conversation
  into tasks, Post about what I just shipped, Repurpose this, Ten hooks for
  this; Safety prompts moved to Settings. `node solo.js prompts builtin |
  show | export [--for claude|cursor|codex|chat]`: every prompt is a slash
  command in `.claude/commands/` and `.cursor/commands/` (the user's own in a
  git-ignored `mine/`). `{{shipped}}` context token. `core/test-prompts.js`.

- 2026-10-12 · Nothing in `data/` is tracked any more (only SCHEMA.md); sample
  content comes from templates. Fixed: the Script and Writing viewers applied
  a newer file in memory only, so a reload brought the old library back.

- 2026-10-10 · Guide Quick tab: what are you doing (free text → the matching
  task moves to Doing, any project), add tasks one per line, top tasks across
  all projects with start / done / priority. Footer quick actions restored.
  Board columns can no longer push past the page.

- 2026-10-10 · `777d996` Guide redesigned by intent (was M2): Do · Reply · Settings,
  search, visible agent switch, groups collapsed, Reply status line, Settings
  with details folded away.

- 2026-10-10 · `54bfe7e` Guide tabs work before an agent mode is chosen;
  manifest only over http.
- 2026-10-10 · `d492846` About page, font presets, safer backups, `doctor`,
  attachments with originals on disk.
