# Contributing

Solo Ops is deliberately small: static HTML, CSS and classic JavaScript that
opens from `file://`, plus two zero-dependency Node scripts. Please keep it
that way.

- **No build step, no npm dependencies, no ES modules, no `fetch` of local
  files.** If a change needs any of these, open an issue first.
- Read `AGENTS.md` before touching `core/` — it is the contract the apps, the
  CLI and AI agents all rely on (file names, Store keys, sync rules).
- Each app keeps `model` (data + mutations) / `view` (render only) / `main`
  (handlers, sync registration, palette commands).
- Run `npm test` (syntax check of every script + the social round-trip test)
  and click through the page you changed with `node serve.js` running.
- Sample data comes from `core/templates.js` (`node solo.js template all`);
  nothing in `data/` is tracked. Never commit real
  `data/` content, `data/attachments/`, `data/log.jsonl` or `data/prompts.json`.
- Keep the Guide's built-in prompts short and specific; they are the first
  thing non-technical users see.

Good first contributions: a new palette, a new Guide prompt, a new context
token in `core/context.js`, or a CLI verb in `solo.js` that mirrors a UI action.
