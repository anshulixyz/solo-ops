# data/ — the contract

Everything Solo Ops knows lives in this folder as plain JSON. The pages, the
CLI (`node solo.js`) and your agents all read and write these same files.
Edit them by hand or with a script; open pages pick up changes within seconds
(in served or linked-folder mode), and the CLI reads them fresh every run.

Every file has the same envelope:

```json
{ "version": 1, "updatedAt": "2026-10-10T09:00:00.000Z", ...body }
```

`updatedAt` is how sync decides who is newer. **Bump it to now (ISO 8601, UTC)
whenever you change a file.** The CLI does this for you.

Full-size images are never stored here. Items keep a small thumbnail
(`image`) and a reference (`file`) to the original under `data/attachments/`;
until the server ran or the folder was linked the original waits in the
browser (`stored: "browser"`). Post images follow the same idea with their
own browser store.

## File names and workspaces

A workspace is one project. The **first workspace** (from `solo.config.js`,
id `main` unless you list your own) uses the short names below. Every other
workspace prefixes its id: `side-project-social.json`,
`ops-admin.json` (board `admin` in workspace `ops`).

## workspaces.json — workspaces created at runtime

```json
{ "workspaces": [{ "id": "side-project", "title": "Side project", "apps": { "social": false, "scripts": true, "writing": true }, "boards": [], "createdAt": 0 }] }
```

Workspaces listed in `solo.config.js` are implicit. Merged on sync.
`"sample": true` marks the separate Sample project (`node solo.js template sample`, or Home →
Look around a sample project): its boards, schedule, scripts and drafts hold the sample sprint,
and "all projects" views (Home's Today and This week, `calendar --all`, `share today --all`)
leave it out. Remove it like any project (`workspaces rm sample-project`).

A first open starts blank: a page that finds no copy of its data in the browser starts empty
(flagged fresh, so any file in `data/` still wins) instead of seeding the sample.
`node solo.js template blank` writes those empty files on purpose, never over an existing one.

## imports/*.json — what an agent brings in from another tool

Written by the agent with its file tool (never through a shell), read by
`node solo.js import <file> [--dry-run]`. One write per board file, logged.

```json
{ "source": "linear",                         // the tool; an item without ext gets <source>:<hash of its title>
  "items": [{ "title": "Fix the login bug",
              "ext": "linear:9f1c…",          // the tool's own id: the same ext updates the task (any board of the workspace)
              "col": "doing", "pri": "high",  // optional; a re-run moves the task only when the source changed them (extCol / extPri)
              "due": "2026-10-28", "at": "", "until": "",
              "notes": "https://linear.app/…", "tags": ["coding"], "steps": ["a", "b"], "board": "runway" }] }
```

Labels lose a leading `@` (an @-tag would share the task with a contact) and
their spaces. Nothing is ever deleted by an import. The sources "Start my
day" looks at live in `settings.json` → `config.bringIn.sources`.

## `<board>.json` — one board's tasks

One file per board, named by the board id (`runway.json` for the sample
board, `business-as-usual.json` for a board called "Business as usual").
Board ids are slugs: lowercase, digits and dashes; `social`, `scripts`,
`writing`, `settings`, `activity`, `boards` are reserved.

```json
{
  "projects": ["sideproject"],           // user-added projects (config projects are implicit)
  "tasks": [{
    "id": "t1",                           // unique, prefix t
    "title": "Write the one-line pitch",
    "desc": "",                           // optional longer description
    "proj": "launch",                     // a project name (config or projects[])
    "col": "todo",                        // todo | doing | done | later | bucket
    "pri": "high",                        // high | medium | low
    "tags": ["content", "research"],      // free text, lowercase
    "notes": "",                          // private rough notes
    "collapsed": true,                    // UI state, safe to ignore
    "checklist": [{ "text": "Draft 3 versions", "done": false }],
    "at": "2026-10-15T14:00",                // optional: when (local, no zone); "2026-10-15" alone = all day
    "until": "2026-10-15T14:30",             // optional end, full stamp; meetings have one
    "due": "2026-10-20",                     // optional deadline (date)
    "ext": "gcal:abc123",                   // optional: where an imported item came from (gcal:<event>, notion:<page>, linear:<issue>, github:<owner>/<repo>#<n>…); the same ext on any board of the workspace is the same item, so `add --ext` / `import items.json` update it instead of duplicating; `share:` is reserved for shares
    "extCol": "todo", "extPri": "high",    // optional, set by imports: the status and priority the source had last time; a re-run moves the task only when the source changed them, so work you finished here stays finished
    "noteId": "", "scriptId": "", "takeId": "", "postId": ""   // optional: the pieces this task carries (core/story.js); set by `link`, `--task` on the adds, `add --draft|--script|--take|--post`
  }]
}

A **meeting** is a task with `at` (and usually `until`) and the tag `meeting`.
State rules (core/when.js): overdue = `due` before today, or `at` in the past
with no `until`; past = `until` has passed; today; upcoming. Absent fields are
absent, not empty strings.
```

`later` is the parking lot, `bucket` is the ideas list (video/demo ideas by
convention). Only `todo/doing/done` count toward sprint progress.

## boards.json — boards created at runtime

```json
{ "boards": [{ "id": "business-as-usual", "ws": "main", "title": "Business as usual", "sprintLabel": "Progress", "milestones": [], "focus": [], "createdAt": 0 }] }
```

Boards listed in `solo.config.js` are implicit and need no entry here. A
runtime entry with the same id overrides the config title. Merged, never
replaced, on sync.

## activity.json — daily activity (written automatically)

```json
{ "days": { "2026-10-10": { "runway": 5, "social": 1 } }, "lastActive": "2026-10-10T09:12:00.000Z", "lastByApp": { "runway": "…" } }
```

Pages and the CLI both increment counts; sync merges by taking the larger
count per cell. Home reads it for the streak, heatmap and idle reminder;
`node solo.js activity` prints it. Agents should not edit it.

## social.json — posting schedule

```json
{
  "posts": [{
    "id": "p1",
    "datetime": "2026-10-11T09:00",       // local time, no zone
    "title": "Why I am building this",
    "postType": "announcement",           // one of config social.postTypes
    "format": "text",                     // text | video | text+video
    "project": "general",
    "copy": "The actual post text…",
    "noteId": "", "scriptId": "",            // the draft / the script this post came from (one story; core/story.js). The take → post edge lives on the take (postId)
    "video": { "title": "", "status": "none", "notes": "", "link": "" },
                                          // status: none|idea|scripted|recorded|edited|ready
    "links": [{ "id": "l1", "label": "", "url": "", "kind": "reference" }],
    "assets": [],                         // image metadata; blobs live in the browser
    "prep": [{ "text": "Draft copy", "done": true, "kind": "content" }],
                                          // kind: one of config social.prepKinds
    "notes": "",
    "status": "draft",                    // draft | ready | scheduled | posted
    "posted": { "url": "", "postedAt": "", "stats": { "views": "", "likes": "", "reposts": "", "replies": "", "bookmarks": "" }, "notes": "", "screenshotId": "" }
  }]
}
```

## scripts.json — video scripts

```json
{
  "activeId": "s1",
  "scripts": [{ "id": "s1", "title": "My Reel Script", "text": "# My Reel Script\n\n## Hook\n…", "noteId": "", "createdAt": 0, "updatedAt": 0 }]   // noteId: the draft it was written from (one story)
}
```

Script text is Markdown with a light convention the viewer understands:
`# Title`, `## Hook`, `## Script` with numbered beats, `## Inserts` bullets,
`## Prep` with `- [ ]` checkboxes, `NAME:` dialogue, `(stage directions)`.

## videos.json — takes, cut by their words (`<ws>-videos.json`)

```json
{
  "activeId": "v1",
  "videos": [{
    "id": "v1", "title": "Why we killed onboarding", "scriptId": "s3", "postId": "", "linkedAt": 0,   // scriptId / postId: the story (link, video add --script, video post); linkedAt: when they last changed
    "status": "recorded",             // recorded | transcribed | cut | rendered  (posted = the linked post's status says so)
    "sources": [{ "id": "a", "path": "/Users/me/Movies/take-3.mov", "size": 2147483648, "duration": 312.4,
                  "width": 1920, "height": 1080, "fps": 29.97, "rotation": 0, "hdr": false, "vcodec": "hevc", "acodec": "aac", "hash": "sha1 of first MB + last MB + size" }],
    "proxy": { "file": "data/videos/v1/proxy.mp4", "size": 0, "hash": "the source hash it was made from", "at": 0 },   // a 720p copy for the page's player only (video proxy); never posted, never backed up
    "transcript": { "engine": "whisper", "model": "small.en", "lang": "en", "granularity": "word", "words": 1840, "file": "data/videos/v1/transcript.json" },
    "phrases": [{ "s": 2.52, "e": 5.36, "t": "Ninety percent of what a web agent does is wasted." }],
    "edl": [{ "start": 2.42, "end": 6.85, "quote": "…", "reason": "" }],   // the cut: pieces kept, in order, edges on word boundaries
    "edlHash": "…", "cutAt": 0,   // the cut's own stamp (ms): the page and the CLI compare it to see whose cut is newer
    "captions": { "style": "sentence", "burn": false },
    "exports": [{ "file": "data/videos/v1/final-1.mp4", "kind": "final", "duration": 61.2, "edlHash": "…", "captions": "track+srt", "srt": "data/videos/v1/final-1.srt", "at": 0 }],
    "notes": "", "createdAt": 0, "updatedAt": 0
  }]
}
```

The footage is referenced by `path`, never copied; `hash` notices a changed
file. `phrases` is the packed view (word-level times live in
`data/videos/<id>/transcript.json` as `{ words: [{ w, s, e }], silences: [{ s, e }], edits: [{ at, from, was, now, all }] }`
(the silences measured on the audio by ffmpeg; the words are trimmed to them
so a pause is a real gap between words; `edits` is the trail of `video word`
corrections, popped by `--undo`; `transcript.wordsAt` on the take changes
with every correction so open pages reload the words), one shape
whatever the engine; `granularity: "cue"` for an imported SRT/VTT). An export
whose `edlHash` differs from the take's was rendered before the current cut.
`data/videos/<id>/` also holds `progress.json` (the running render, unlogged)
and the renders `preview-<n>.mp4` / `final-<n>.mp4`, which the backup skips
(only `transcript.json` and the `.srt` files travel). When the Video page
starts a job through `node serve.js`, the folder gains `render.json` /
`transcribe.json` (pid, started, finished, exit code) and `render.log` /
`transcribe.log` (the CLI's output), plus `import.<srt|vtt|json>` for a
transcript dropped on the page: machine state, unlogged, not backed up.
The page writes only `activeId`, `edl`, `edlHash`, `cutAt`, `status`, `title`
(`renamedAt`) and `updatedAt`; the CLI owns the rest and both merge the
other's copy before writing.

## recordings.json — the recordings folder's memory

```json
{ "files": { "/Users/me/Movies/Solo Ops takes/take-3.mov": { "size": 0, "mtime": 0, "stable": 2, "tries": 0, "takeId": "v1", "at": 0, "pending": false, "skipped": "" } } }
```

Written by `node serve.js` (which polls the folder while it runs) and
`node solo.js video watch`. A path listed with a `takeId` is never added
twice; one with `skipped` stays out (a take removed later, or a file that
would not probe after five tries); `pending` marks files that were already
there when the watcher started (they wait for *Add them* on the Video page
or `video recordings --add`); `queued` while an add runs. Files under 64 KB,
dotfiles and audio-only files are ignored; entries for files gone from the
folder for a week are dropped. `video recordings --forget <path>` lets a
file in again (the server reloads the file when the CLI wrote it). Machine
state: unlogged, not backed up. `data/secrets.json`
(`video key set`) and `data/models/` (the whisper model) stay out of it too.

## writing.json — drafts / notes

```json
{
  "activeId": "n1",
  "notes": [{ "id": "n1", "text": "# Title\n\n~~cut~~ ++add++ [[note for AI]]", "images": {}, "createdAt": 0, "updatedAt": 0 }]
}
```

Track-changes markup: `~~removed~~`, `++added++`, `[[instruction for the AI]]`.
`images` maps `"1"` → data URL for `[Image uploaded 1]` references; agents can
leave it empty.

## inspiration.json — the inbox (global, items tagged with a workspace)

```json
{ "items": [{ "id": "i1", "kind": "link|image|note|file", "title": "…", "url": "https://… or file:///…", "text": "…",
    "image": "data:… (small thumbnail only)", "file": "data/attachments/inspo-i1.png", "name": "shot.png", "size": 184221, "type": "image/png", "stored": "disk|browser|",
  "tags": ["launch"], "ws": "main", "status": "new|used|archived", "source": "ui|cli|agent|telegram",
  "usedAs": [{ "app": "task|post|script|note", "id": "t…", "at": 0 }], "createdAt": 0, "updatedAt": 0 }] }
```

`ws` is the workspace it belongs to (empty = unsorted). "Use as…" (page) or
`inspo use <item> --as task|post|script|note` (CLI) creates the target item and
records it in `usedAs`. Images are data URLs; agents can ignore them.

## log.jsonl — change log (append-only, one JSON object per line)

```json
{ "id": "mv2…", "ts": "2026-10-10T07:18:00.000Z", "file": "runway.json", "source": "ui|cli|agent|revert", "note": "done: Write the README", "prev": "<previous file content>", "prevBytes": 9603 }
```

Written by `node serve.js` (page writes), the CLI, agents using the CLI, and
the linked-folder mode. `prev` is the whole previous file (skipped above
2 MB), which is what `revert <id>` restores. Capped at the last 400 entries.
Never edit by hand; never commit (it is in `.gitignore` via `data/*`).

## exports/ — files the pages save for you

`data/exports/<name>` holds whatever a page exports: `today-<date>[-<ws>].png` (Share today, 1080×1080), `solo-ops-backup-<stamp>.json`
(Guide → Settings → Export everything; a bundle `{ version, exportedAt, files: { "<file>.json": <that file> } }`,
Import reads it back), `<board>-<stamp>.json` (a board in its file format),
`runway-<view>-<stamp>.md`, `social-schedule-<date>.json` / `social-backup-<stamp>.json`
(the social bundle with images), and `<file>.backup-<stamp>.json` /
`<file>.file-backup-<stamp>.json` (the losing side when a file and the browser
disagree on first contact). Written only when the server runs or the folder is
linked; otherwise the browser downloads the same file. Nothing reads this folder
automatically; `backup` commits it with the rest of `data/`.

## prompts.json — your Guide prompts

```json
{ "custom": [{ "id": "c…", "t": "Monday planning", "d": "one line", "p": "{{head}}Plan my Monday…", "c": "weekly", "pages": [] }],
  "overrides": { "Daily standup": { "d": "…", "p": "…" } },
  "hidden": ["Undo what the agent just did"] }
```

Built-in prompts are not in this file: they live in `core/prompts.js` and are
keyed by title here. `node solo.js prompts export` writes built-ins and your
own as slash commands (`.claude/commands/`, yours under `mine/`).

`custom` are your own prompts (`c` is daily | weekly | projects | content |
fix). `overrides` replace a built-in's text by its title; `hidden` removes
built-ins from the Guide. In a prompt, `{{head}}` inserts the agent preamble
(workspace, how to reply); context tokens insert data: `{{recent}}` (last 10
changes with state), `{{last_task}}`, `{{this}}` (what is open on the page),
`{{project}}` (full snapshot; `{{snapshot}}` is an alias), `{{board}}`,
`{{doing}}`, `{{posts}}`, `{{inspiration}}`; `<blank>` becomes a field to
fill. Merged on sync.

## settings.json — theme and your personal config

```json
{
  "theme": { "mode": "auto", "palette": "warm" },
  "config": {                               // optional: your values over solo.config.js, same keys and shapes
    "owner": "Mara",
    "boards": [{ "id": "runway", "title": "Pocket Studio launch", "milestones": ["Build", "Ship"] }],
    "social": { "postTypes": ["announcement", "update", "reel", "carousel"] }
  }
}
```

`solo.config.js` is shipped code (the repository is public), so anything
personal goes here: `node solo.js config set owner "Mara"` writes it, the
pages and the CLI merge it over the config file (objects merge, arrays and
scalars replace; a value of another shape than the shipped one is ignored
and `doctor` reports it). Lists of words take the comma form
(`social.postTypes reel,carousel`) or JSON; `config add <list> a b` appends;
one entry of a list of entries is addressed by id (`boards.runway.title`),
which copies the whole list first because lists replace. The browser keeps
the last copy it saw in `localStorage` (`marathon.config`) and reloads once
when the file changes; the file's copy wins every write of `settings.json`
unless the page itself changed it through a pasted reply.

## backup.json — where the copies go (CLI only)

```json
{ "to": "/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Solo Ops backup", "lastAt": "2026-10-13T20:00:00.000Z",
  "guard": { "allowData": true, "remote": "git@github.com:me/my-private-fork.git", "at": "…" } }
```

`to` is the syncing folder `node solo.js backup --to` copies into (empty when
the backup is a git remote only); `lastAt` the last copy. `guard` exists only
after `node solo.js guard --allow-data` confirmed a private remote; the guard
lets `data/` through while `origin` equals `remote`. Its own file, not part of
`settings.json`, because the pages mirror `settings.json` (theme) and would
overwrite anything else kept there. The server reads it for `/api/backup`.

`mode`: auto | light | dark. `palette`: warm | paper | forest | dusk | mono.

## Rules of thumb for agents

- Prefer the CLI (`node solo.js …`) for single changes; edit JSON directly
  for bulk changes, then set `updatedAt` to now.
- Never invent new fields; unknown fields are dropped on load.
- Keep ids stable. New ids: prefix + anything unique (`t` tasks, `p` posts,
  `s` scripts, `n` notes).
- `node solo.js week --json` is the cheapest way to get the whole picture.
