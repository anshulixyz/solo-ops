# Security

- `node serve.js` binds to **127.0.0.1 only** and serves the project folder.
  It writes only `data/*.json`, `data/attachments/*`, `data/exports/*` and
  `data/log.jsonl`.
  Do not expose it to a network; it has no authentication by design.
- `/api/meta` fetches a URL you saved to Inspiration to read its title and
  description. It only runs when you save a link and never sends your data.
- Nothing is sent anywhere else. There are no analytics and no third-party
  scripts except Google Fonts (replace the `<link>` in each page to go
  fully offline).
- Your data is plain JSON in `data/`; keep backups private
  (`node solo.js backup --remote <private repo>`).

Report issues by opening a GitHub issue; please do not include your data files.
