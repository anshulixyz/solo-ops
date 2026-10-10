# Marathon

Solo founder ops, in plain files. **Boards** (as many kanbans as you need:
launch, business as usual, a side project), a **social posting schedule**, a
**script viewer** with teleprompter, a **writing viewer** with track changes,
and a **Home** that shows your streak, what is in play, and nudges you when
nothing has moved. No install, no account, no server required — and everything
is **native to agents**: your tasks live in JSON files that Claude, ChatGPT,
Claude Code or a cron job can read and update without you clicking anything.

Use what you need: switch any app off in `marathon.config.js` and it
disappears from Home, navigation and the CLI.

```
node marathon.js week          # terminal on the left…
```
…and the board on the right updates by itself.

## Two ways to run it

**Non-technical:** download the folder, double-click `index.html`. Everything
works from `file://`. In Chrome or Edge, click **Link folder** once and the pages
write `data/*.json` directly; elsewhere use **Save file / Load file**.

**Technical:**

```bash
git clone <this repo> marathon && cd marathon
node serve.js            # → http://localhost:4321 — pages write data/ instantly
node marathon.js week    # the same data from the terminal
```

Zero dependencies. Node is only needed for the server and the CLI; the pages
themselves are plain HTML + CSS + classic JavaScript.

## What is inside

| App | Open | Data |
|-----|------|------|
| Home — activity streak, idle reminder, every board's progress, what is in play | `index.html` | reads all of the below |
| Boards — kanban (To Do / Doing / Done + Later + Bucket List), one file per board | `runway/marathon-board.html?board=<id>` | `data/<id>.json` (`runway.json` by default) |
| Social Schedule — posting arc, prep, calendar, streak | `social/social-board.html` | `data/social.json` |
| Script Viewer — hooks, beats, inserts, teleprompter | `studio/script-viewer.html` | `data/scripts.json` |
| Writing Viewer — `~~cuts~~` `++adds++` `[[notes for AI]]` | `studio/writing-viewer.html` | `data/writing.json` |

**Boards are instances.** The first one is called "Launch Runway" in the
sample config — rename it to "To do", "Kanban", whatever you call it. Create
another from the board page (**+ Board**) or the CLI: blank, from the sample
sprint, or as a copy of an existing board. Each gets its own `data/<id>.json`,
its own progress bar on Home, and `--board <id>` in the CLI.

**Activity.** Every change on any page or from the CLI is logged per day in
`data/activity.json`. Home shows the streak, a 12-week heatmap, when each app
was last touched, and turns amber with a suggested next step after
`activity.reminderAfterHours` idle hours (default 24). `node marathon.js today`
prints the same reminder, so a cron job can nag you.

Every page has a **⌘K / Ctrl-K command palette** with the same verbs as the CLI
(`add …`, `done …`, `move … later`, `theme`), a **theme picker** (light / dark /
auto × five palettes), and a **sync pill** that tells you where your data is.

## Talk to it from the terminal

```bash
node marathon.js today                         # doing + high priority + posts due + idle reminder
node marathon.js week                          # the next 7 days: every board, posts, studio
node marathon.js boards add "Business as usual" --from sample   # or blank, or --from runway (copy)
node marathon.js week --board business-as-usual
node marathon.js add "Write the launch post" --proj launch --pri high --tags content --steps "Outline|Draft"
node marathon.js start "launch post"           # by id or title fragment
node marathon.js done t5
node marathon.js move t11 later
node marathon.js share todo                    # markdown checklist to paste anywhere
node marathon.js import list.md                # "- [ ] item" lines become tasks
node marathon.js social next
node marathon.js social add "Launch day" --at +3d 9:00 --type launch
node marathon.js social posted p4 --url https://x.com/…
node marathon.js scripts add "Teaser" --file teaser.md
node marathon.js theme set dusk
node marathon.js help
```

Add `--json` to anything for machine-readable output.

## Let your agent run it

Marathon is designed so an AI agent can manage it end to end:

- **Claude Code / any coding agent:** open the folder. `AGENTS.md` (and
  `CLAUDE.md`) tell it where the data lives, the schema, and the CLI. Ask
  "what should I do this week?" or "add the three tasks from this email".
- **Claude.ai / ChatGPT (no file access):** paste `prompts/agent-bootstrap.md`
  once, then paste `node marathon.js week --json` output or a data file. It
  hands you back CLI commands or an updated JSON file.
- **Scheduled nudges:** `node marathon.js today` in a cron job, a Claude
  scheduled task, or a Shortcut — pipe it anywhere you read in the morning.

## Make it yours

Everything configurable is in **`marathon.config.js`**: name, which apps you
use, boards (titles, milestones, focus cards), projects (with colors), tags,
post types, prep kinds, idle-reminder hours, default theme.
Sample content ships in `data/`; replace it from the hub (**Start blank**),
with `node marathon.js template --force`, or just start adding.

Keeping your real tasks private in a fork? Uncomment `data/` in `.gitignore`.

## How sync works

`localStorage` is the browser's working copy; `data/*.json` is the source of
truth that agents and the CLI see. Each file carries `updatedAt`; the newer side
wins. Served (`node serve.js`) and linked-folder modes write on every change and
poll for outside edits every few seconds. Details: `data/SCHEMA.md`,
`core/sync.js`.

## Layout

```
index.html            hub
marathon.config.js    your settings (plain JS, read by pages and CLI)
marathon.js           CLI (node, zero deps)
serve.js              local server + write API (node, zero deps)
core/                 shared: store, config, theme, sync, activity, palette, templates
data/                 your data (JSON: one file per board + social, scripts, writing, boards, activity, settings) + SCHEMA.md
runway/ social/ studio/   the apps (classic scripts, file:// safe)
prompts/              bootstrap prompt for chat agents
.claude/skills/       Claude Code skill wrapping the CLI
```

Keep apps `file://`-compatible: classic `<script src>`, no modules, no
`fetch` of local files. Sanity check: `for f in core/*.js runway/*.js social/*.js studio/*.js *.js; do node --check "$f"; done`

MIT licensed.
