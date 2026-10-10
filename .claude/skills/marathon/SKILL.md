---
name: marathon
description: Manage the user's Marathon board, posting schedule, scripts and notes from the terminal — review the week, add or move tasks, schedule posts, update drafts. Use when the user asks what to do today/this week, to add/finish/move tasks or posts, or to update data/*.json.
---

# Marathon

The user's tasks, posts, scripts and drafts are JSON files in `data/`. The
CLI `node marathon.js` reads and writes them; open pages pick changes up
automatically when `node serve.js` is running or the folder is linked.

## First, get the picture

```bash
node marathon.js week --json      # or `today`; add --days 14 for a longer window
```

Read `AGENTS.md` for the contract and `data/SCHEMA.md` for fields.

## Then act with the CLI (never hand-edit for single changes)

```bash
node marathon.js add "Title" --proj <project> --pri high|medium|low --tags a,b --steps "step|step"
node marathon.js start|done|later|bucket|todo <id or title fragment>
node marathon.js move <task> <column> ; pri <task> high ; tag <task> +x -y
node marathon.js step <task> "text" ; check <task> <n> ; note <task> "text"
node marathon.js social add "Title" --at 2026-10-20T09:00|+3d 17:30 --type launch --project x --copy "…" --prep "a|b"
node marathon.js social next|week|show <post> ; social posted <post> --url … ; social prep <post> "item"
node marathon.js scripts add "Title" --file x.md ; notes add "Title" --file x.md ; notes show <n>
node marathon.js share todo ; import list.md ; theme set dusk
```

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
`marathon.config.js` unless asked to change projects/tags/labels.
