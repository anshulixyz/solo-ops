---
name: solo-ops
description: Manage the user's Solo Ops board, posting schedule, scripts and notes from the terminal — review the week, add or move tasks, schedule posts, update drafts. Use when the user asks what to do today/this week, to add/finish/move tasks or posts, or to update data/*.json.
---

# Solo Ops

The user's tasks, posts, scripts and drafts are JSON files in `data/`. The
CLI `node solo.js` reads and writes them; open pages pick changes up
automatically when `node serve.js` is running or the folder is linked.

## First, get the picture

```bash
node solo.js workspaces       # projects; pass --ws <id> to every command (default: first)
node solo.js week --json      # every board of the workspace; or `today`; --days 14 for a longer window
node solo.js boards           # ids to pass as --board <id> (default: first board)
```

The first line of `today`/`week` is the activity line. If it says idle, lead
your reply with one small next step.

Read `AGENTS.md` for the contract and `data/SCHEMA.md` for fields.

## Then act with the CLI (never hand-edit for single changes)

Always add `--as agent --note "short reason"` to writes. The user sees it on
Home → Recent changes and can revert.

```bash
node solo.js add "Title" --proj <project> --pri high|medium|low --tags a,b --steps "step|step"
node solo.js start|done|later|bucket|todo <id or title fragment>
node solo.js move <task> <column> ; pri <task> high ; tag <task> +x -y
node solo.js step <task> "text" ; check <task> <n> ; note <task> "text"
node solo.js social add "Title" --at 2026-10-20T09:00|+3d 17:30 --type launch --project x --copy "…" --prep "a|b"
node solo.js social next|week|show <post> ; social posted <post> --url … ; social prep <post> "item"
node solo.js scripts add "Title" --file x.md ; notes add "Title" --file x.md ; notes show <n>
node solo.js share todo ; import list.md ; theme set dusk
node solo.js inspo list --ws <id> ; inspo use <item> --as task|post|script|note ; inspo ai --into tasks
node solo.js log ; revert <id>
node solo.js boards add "Title" --from blank|sample|<id> ; boards rename <id> "Title"
```

Every task command accepts `--board <id>`; every command accepts `--ws <id>`.
`workspaces add "Title" --apps scripts,writing --boards "A,B" --sample` creates a project.

Ids: tasks `t…`, posts `p…`, scripts `s…`, notes `n…`. Title fragments work
when unambiguous; the CLI tells you when they are not.

## Review pattern (weekly / daily)

1. Run `week`. 2. Summarise in 5 lines: what is in Doing, what is high and
untouched, posts due with open prep, anything overdue. 3. Propose concrete
moves (start X, park Y, split Z into steps). 4. Apply the ones the user
approves with CLI commands. 5. Re-run `week` to confirm.

## Bulk edits

For many changes, edit the JSON (keep shapes, keep ids, set `updatedAt` to
now in UTC ISO) or write a temporary `list.md` and `import` it.

## Don'ts

No deletes/resets unless asked. Don't invent fields. Don't touch
`solo.config.js` unless asked to change projects/tags/labels.
