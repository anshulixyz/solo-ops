# data/ — the contract

Everything Marathon knows lives in this folder as plain JSON. The pages, the
CLI (`node marathon.js`) and your agents all read and write these same files.
Edit them by hand or with a script; open pages pick up changes within seconds
(in served or linked-folder mode), and the CLI reads them fresh every run.

Every file has the same envelope:

```json
{ "version": 1, "updatedAt": "2026-10-10T09:00:00.000Z", ...body }
```

`updatedAt` is how sync decides who is newer. **Bump it to now (ISO 8601, UTC)
whenever you change a file.** The CLI does this for you.

Images are never stored here. Post images and note images stay in the browser
(and in Save-file bundles) so these files remain small and readable.

## File names and workspaces

A workspace is one project. The **first workspace** (from `marathon.config.js`,
id `main` unless you list your own) uses the short names below. Every other
workspace prefixes its id: `side-project-social.json`,
`ops-admin.json` (board `admin` in workspace `ops`).

## workspaces.json — workspaces created at runtime

```json
{ "workspaces": [{ "id": "side-project", "title": "Side project", "apps": { "social": false, "scripts": true, "writing": true }, "boards": [], "createdAt": 0 }] }
```

Workspaces listed in `marathon.config.js` are implicit. Merged on sync.

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

Boards listed in `marathon.config.js` are implicit and need no entry here. A
runtime entry with the same id overrides the config title. Merged, never
replaced, on sync.

## activity.json — daily activity (written automatically)

```json
{ "days": { "2026-10-10": { "runway": 5, "social": 1 } }, "lastActive": "2026-10-10T09:12:00.000Z", "lastByApp": { "runway": "…" } }
```

Pages and the CLI both increment counts; sync merges by taking the larger
count per cell. Home reads it for the streak, heatmap and idle reminder;
`node marathon.js activity` prints it. Agents should not edit it.

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

## settings.json — theme

```json
{ "theme": { "mode": "auto", "palette": "warm" } }
```

`mode`: auto | light | dark. `palette`: warm | paper | forest | dusk | mono.

## Rules of thumb for agents

- Prefer the CLI (`node marathon.js …`) for single changes; edit JSON directly
  for bulk changes, then set `updatedAt` to now.
- Never invent new fields; unknown fields are dropped on load.
- Keep ids stable. New ids: prefix + anything unique (`t` tasks, `p` posts,
  `s` scripts, `n` notes).
- `node marathon.js week --json` is the cheapest way to get the whole picture.
