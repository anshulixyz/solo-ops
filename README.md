<p align="center"><img src="icons/icon.svg" width="72" alt="Marathon"></p>

<h1 align="center">Marathon</h1>
<p align="center"><b>Solo founder ops, in plain files.</b><br>
Boards · posting schedule · video scripts · drafts · inspiration inbox — local, installable, and native to your AI.</p>

---

Marathon is for people shipping things alone: the indie hacker juggling a
launch, a side project and "business as usual"; the creator with a posting
calendar and a pile of half-written scripts. It gives you the five tools you
actually use, keeps everything in **JSON files on your machine**, and makes
those files the thing your **AI agent** reads and updates — so you stop
re-typing your to-do list into ChatGPT.

```
$ node marathon.js week
# Next 7 days · Oct 10 → Oct 17
Last activity 2 h ago · streak 6 days
**Launch:** 4/11 done (36%)   **Business as usual:** 2/5 done
## Doing (2)
- [t3] Record a 60-second demo · content · high · 1/4 steps
…
```
…and the board in your browser updates by itself.

## Why it is different

| | Marathon |
|---|---|
| **Where your data lives** | `data/*.json` in a folder you own. No account, no server, no sync service. |
| **How your AI uses it** | It reads the same files. Paste `AGENTS.md` into Claude, ChatGPT or Claude Code and it knows the schema and the CLI. Every agent change is logged and revertable. |
| **How you use it without clicking** | `node marathon.js today / week / add / done / social next / inspo add …` |
| **How non-technical people use it** | Download, double-click `index.html`. Or `node serve.js` and click **Install** to get it as an app. |
| **How many projects** | As many **workspaces** as you like, each with its own boards, schedule, scripts and notes — and a Home that shows all of them at once. |

## The apps

| | What it does |
|---|---|
| **Home** | Helicopter view: activity streak + heatmap, idle reminder with a suggested next step, every project with its stats, tasks and posts in play across all projects, inspiration inbox, recent changes with revert. |
| **Boards** | Kanban: To Do / Doing / Done, a Later parking lot, a Bucket List for ideas. Checklists, priority, project chips, tags, notes, drag & drop. One file per board; create boards blank, from the sample sprint, or as a copy. |
| **Social Schedule** | A posting arc: date, copy, type, prep checklist, images, video status; mark posted and log engagement. Calendar with a 52-week streak heatmap. |
| **Script Viewer** | Reels/shorts scripts: hook, numbered beats, inserts, prep. Reader view, 9:16 preview, teleprompter. A library of scripts. |
| **Writing Viewer** | Drafts with `~~cuts~~`, `++adds++` and `[[notes for the AI]]`. Copy for AI, copy clean, change log view, images. |
| **Inspiration** | An inbox for anything worth keeping: links, ideas, screenshots. Tag it with a workspace, then **Use as** task / post / script / draft, or **Brainstorm with AI** (copies the items plus instructions to paste into your chat). `⌘⇧I` or the **+ Inspo** button on any page. |

Every page has a **⌘K command palette** with the same verbs as the CLI, a
**theme picker** (auto/light/dark × five palettes) and a **sync pill** that
tells you where your data is.

## Install

**Just open it.** Download or clone, double-click `index.html`. Everything
works from `file://`. In Chrome/Edge, click **Link folder** once and the pages
write `data/*.json` directly; elsewhere use **File → Save / Load**.

**As an app (recommended).**

```bash
git clone https://github.com/<you>/marathon && cd marathon
node serve.js          # http://localhost:4321
```

Open it, click **Install** in the nav (Chrome/Edge/Safari 17+). It opens from
your dock or home screen, works offline for the shell, and every change hits
`data/` instantly. Zero dependencies; Node is only for the server and the CLI.

## The terminal

```bash
node marathon.js today                          # in play now + idle reminder
node marathon.js week --ws launch --days 14     # a project, a longer window
node marathon.js add "Write the launch post" --proj launch --pri high --tags content --steps "Outline|Draft"
node marathon.js start "launch post" ; done t5 ; move t11 later ; check t5 2
node marathon.js social add "Launch day" --at +3d 9:00 --type launch ; social next ; social posted p4 --url …
node marathon.js scripts add "Teaser" --file teaser.md ; notes list
node marathon.js inspo add "https://… worth stealing #launch" --ws launch
node marathon.js inspo use "worth stealing" --as task
node marathon.js boards add "Business as usual" --from sample
node marathon.js workspaces add "Side project" --apps scripts,writing --sample
node marathon.js share todo | pbcopy            # markdown checklist, anywhere
node marathon.js import list.md                 # "- [ ] item" lines → tasks
node marathon.js log ; node marathon.js revert <id>
node marathon.js help
```

`--json` on anything for machine output. `--ws <id>` and `--board <id>` scope
any command.

## Your AI runs it

- **Claude Code / Cursor / any coding agent:** open the folder. `AGENTS.md`
  (and `CLAUDE.md`) is the contract: files, schema, CLI, conventions. Ask
  "what should I do this week?", "turn my inspiration into tasks", "draft the
  three posts for launch week".
- **Claude.ai / ChatGPT (no file access):** paste `prompts/agent-bootstrap.md`
  once. Then paste `node marathon.js week --json` or an inspiration dump; you
  get back CLI commands or a file to save.
- **Every agent change is logged** with `source: agent` and a note. Home →
  Recent changes shows it; one click reverts it. `node marathon.js log` from
  the terminal.
- **Scheduled nudges:** `node marathon.js today` in cron, a Claude scheduled
  task or a Shortcut. It prints the idle reminder too.
- **Telegram** (planned, design in `docs/telegram.md`): `/add`, `/done`,
  `/next` and "just send me the link" into the inbox from your phone.

## Make it yours

`marathon.config.js` holds the name, workspaces (or just the apps and boards
of the default one), projects with colors, tags, post types, prep kinds,
milestones and focus cards, idle-reminder hours and default theme. Workspaces
and boards can also be created from Home or the CLI; sample content ships in
`data/` and only those five files are tracked by git — everything else you
create stays private.

## How sync works

The browser keeps a working copy in `localStorage`; `data/*.json` is the
source of truth agents and the CLI see. Each file carries `updatedAt`; the
newer side wins. Served and linked-folder modes write on every change and
poll for outside edits every few seconds. On first contact sample data yields
to the file, registries merge, and real content on both sides asks you — the
losing side is downloaded as a backup either way. Details: `data/SCHEMA.md`,
`core/sync.js`.

## Layout

```
index.html              Home (all projects)
marathon.config.js      your settings — plain JS, read by pages and CLI
marathon.js             CLI (node, zero deps)   serve.js  local server + write API + change log
manifest.json sw.js icons/   installable app shell
core/                   store · config · theme · sync · activity · nav · palette · inspo-quick · templates
data/                   per workspace: <board>.json, social, scripts, writing · plus inspiration, boards, workspaces, activity, settings, log.jsonl
runway/ social/ studio/ inspo/   the apps (classic scripts, file:// safe)
prompts/ docs/ .claude/skills/   agent bootstrap, Telegram design, Claude Code skill
```

Keep apps `file://`-compatible: classic `<script src>`, no modules, no `fetch`
of local files. Sanity: `for f in core/*.js runway/*.js social/*.js studio/*.js inspo/*.js *.js; do node --check "$f"; done`
and `node social/test-social-save.js`.

MIT licensed. Contributions welcome — the agent contract in `AGENTS.md` is
also the contributor guide.
