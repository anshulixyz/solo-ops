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
    "checklist": [{ "text": "Draft 3 versions", "done": false }]
  }]
}
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
  "scripts": [{ "id": "s1", "title": "My Reel Script", "text": "# My Reel Script\n\n## Hook\n…", "createdAt": 0, "updatedAt": 0 }]
}
```

Script text is Markdown with a light convention the viewer understands:
`# Title`, `## Hook`, `## Script` with numbered beats, `## Inserts` bullets,
`## Prep` with `- [ ]` checkboxes, `NAME:` dialogue, `(stage directions)`.

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

`data/exports/<name>` holds whatever a page exports: `solo-ops-backup-<stamp>.json`
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

## settings.json — theme

```json
{ "theme": { "mode": "auto", "palette": "warm" } }
```

`mode`: auto | light | dark. `palette`: warm | paper | forest | dusk | mono.

## Rules of thumb for agents

- Prefer the CLI (`node solo.js …`) for single changes; edit JSON directly
  for bulk changes, then set `updatedAt` to now.
- Never invent new fields; unknown fields are dropped on load.
- Keep ids stable. New ids: prefix + anything unique (`t` tasks, `p` posts,
  `s` scripts, `n` notes).
- `node solo.js week --json` is the cheapest way to get the whole picture.
