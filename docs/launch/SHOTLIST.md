# Launch screenshots — the script

Every screenshot for the launch (README, landing page, posts, docs), in
the order a new person meets the product. One line of truth first:
**everything shown is real.** Pages are the real app on a sample project;
prompts are the real Guide prompts, word for word; agent replies are in the
exact format the Reply tab accepts and each one was pasted and applied
before its screenshot was taken. The only reproductions are the chat and
terminal frames (`mock/`), because a browser cannot screenshot another
app; their content is verbatim. Anyone can retake the chat ones for real
with the paste text in `conversations/`.

Files land in `docs/screenshots/<id>-<slug>.png`, 1440×900 at 2× (desktop),
390×844 at 3× (phone), light, mono palette unless a shot says otherwise.
`shoot.sh` takes them all; `seed.sh` builds the sample project first.

## The sample project (seed.sh)

Invented, generic, nothing from anyone's real data. One founder, Mara,
building **Pocket Studio** (a tiny video tool), launching in three weeks.
Today is a Tuesday with a 15:00 call in progress on the main shots.

| Part | What it holds |
|---|---|
| Workspace *Pocket Studio* (primary) | boards **Launch runway** (24 tasks: 3 doing, 11 to do, 6 done, 3 later, 1 bucket; 4 meetings this week; 3 deadlines; one task with 6 steps half ticked, notes on two) and **Ops** (8 tasks) |
| Posting schedule | 9 posts over two weeks: 3 posted with stats, 2 ready, 4 draft, two with prep lists |
| Scripts | 3 scripts, one with hook + 7 beats + inserts |
| Drafts | 3 notes, one with `~~cut~~ ++add++ [[note for the AI]]` markup |
| Inspiration | 6 items: 3 links with titles, 2 ideas, 1 quote; 2 already used |
| Activity | 12-day streak, 9 changes today, 14 weeks of history |
| Workspace *Newsletter* | one board, 5 tasks, 2 posts — so Home shows two projects |
| Backup | `data/backup.json` says a private repo exists and ran at 21:00 yesterday (so the pending card is gone on the "built" shots; the onboarding shots run **before** this is set) |
| Log | 30 entries: you, the agent and the CLI, with notes |

Names are consistent across shots so the story reads (the same task
moves from To Do to Done between frames).

## Story 1 — First five minutes (onboarding)

| Id | Shot | State to prepare | Caption (what it proves) |
|---|---|---|---|
| 01 | `home-first-run` | Fresh install after `node solo.js template all`, nothing dismissed | "Open it and it already shows you around: sample content, two buttons, nothing to configure." |
| 02 | `guide-first-open` | Guide opened the first time (`?guide=settings`), no agent chosen | "First question: does your AI run commands, or is it a chat? Pick one, done." |
| 03 | `guide-ask` | Guide → Ask on Home, Daily group open | "The prompts live beside your work. Copy one, paste into your AI." |
| 04 | `guide-protect` | Guide → Settings, *Save your data somewhere private* pending card + Protect your work with the three ways | "Your tasks never enter the public code. The Guide nags until they have a private home." |
| 05 | `term-doctor-fresh` | mock terminal: real output of `node solo.js doctor` on an empty `data/` | "Hand the folder to your agent: the first command tells it what state things are in." |
| 06 | `term-setup` | mock terminal: `/setup` in Claude Code — the slash command, the three questions, the commands it then runs (`doctor`, `template all`, `serve.js`, `backup setup`, `guard --install`) | "Or just type /setup and answer three questions." |
| 07 | `home-after-setup` | Home with the sample sprint, Today strip, pending card gone | "Five minutes in." |

## Story 2 — Chat only (ChatGPT or Claude.ai, nothing installed by the AI)

For people who will never open a terminal. The Guide carries a snapshot
of their data inside every prompt; the reply comes back as lines the app
applies itself. Chat frames are reproductions with verbatim content
(`conversations/*.md` has the exact paste text and the reply).

| Id | Shot | State | Caption |
|---|---|---|---|
| 10 | `guide-copy-standup` | Guide → Ask, chat mode, *Daily standup* row just clicked ("Copied — paste into your agent") | "One click copies the prompt **with** your board inside it." |
| 11 | `chat-standup-1` | Chat frame: the pasted prompt (folded), the AI's three questions | "The AI already knows what is on your board." |
| 12 | `chat-standup-2` | Mara's answers; the AI's plan for the day ending in a ``` block of 4 lines (`done`, `start`, `note`, `add --due`) | "It answers with changes, not a lecture." |
| 13 | `guide-reply-preview` | Guide → Reply with that block pasted, Preview showing 4 ticked lines | "Paste the answer back. You see every change before it happens. Untick anything." |
| 14 | `board-after-reply` | Board after Apply: the task in Done, the new one in Doing, Recent changes on Home showing *agent* rows | "Applied. Logged. Revertable." |
| 15 | `chat-capture` | A chat about something else (a pricing discussion, 6 turns), then `/capture`'s prompt pasted at the end; the reply: a list + block of `add … --steps` lines | "Any conversation becomes tasks: paste *Turn this conversation into tasks* at the end." |
| 16 | `chat-emails-to-todos` | Mara pastes three email replies she owes; the AI answers with three `add` lines with `--due` and a `note` each | "Paste your inbox, get your to-dos." |
| 17 | `chat-done-update` | A different chat (the one where she wrote the landing page): "I finished the landing page, update my board" + the reply `done t12` and a `ship-post`-style `social add` | "Finished something in another chat? Tell it, paste the two lines, done." |
| 19 | `guide-ask-your-ai` (+ `-dark`) | Guide → Ask in chat mode, narrow window so the panel is the whole frame: *New chat? Paste this first*, the **Ask your AI** box with its "sends along" chips | "Say it in plain words. The Guide packs the right context and your AI answers with changes." (for the launch video) |
| 18 | `guide-quick` | Guide → Quick tab: "what are you doing" field, add-tasks box, top tasks with start/done | "No AI at hand? The Quick tab does the daily moves without one." |

## Story 3 — With an agent that runs commands (Claude Code, Cursor, Codex)

For people who live in a terminal. The agent reads `AGENTS.md`, runs
`node solo.js`, and the pages follow live. Terminal frames are
reproductions of real command output.

| Id | Shot | State | Caption |
|---|---|---|---|
| 20 | `term-standup` | `/standup` in Claude Code: the agent runs `node solo.js today`, asks the three questions, then runs `done` / `start` / `note` with `--as agent --note` | "Type /standup. The board updates while you talk." |
| 21 | `term-plan-project` | `/plan-project`: five questions, then `boards add`, 14 `add` lines with steps, `social add` ×4 | "A project from nothing in one conversation." |
| 22 | `board-from-agent` | The board the agent just built, cards with steps and tags, Recent changes with *agent* rows and notes | "What that conversation produced." |
| 23 | `term-done-elsewhere` | Another Claude Code session (different folder): "I shipped the onboarding email — mark it done in Solo Ops and add the follow-up" → the agent runs `node solo.js done … --note` and `add …` | "Working somewhere else? Any agent with the folder path can update the board." |
| 24 | `term-today-brief` | `node solo.js today`: activity line, Schedule block with the 15:00 call, Doing, High priority, Posts due | "Your daily brief is one command (or /standup, or the Today strip)." |
| 25 | `term-fill-calendar` | `/fill-calendar`: the agent lists 4 events from the connected calendar, asks, then runs `add … --at … --until … --tags meeting --ext gcal:…` | "Meetings come from the calendar your agent is connected to. No OAuth in Solo Ops." |
| 26 | `calendar-after-fill` | Calendar Agenda after 25: meetings as blocks, filters, one tick | "Where they land." |
| 27 | `term-plan-today` | `/plan-today`: meetings fixed, top 3 tasks placed with `at … today 10:00 --until 11:30` | "The agent plans around the meetings." |
| 28 | `term-guard` | `git commit` refused by `node solo.js guard` with its why and the `backup setup` hint | "The hard line, enforced: personal data never enters the code repo." |

## Story 4 — Fully built: the tour

| Id | Shot | State | Caption |
|---|---|---|---|
| 30 | `home-cockpit` | Home at 15:10: Today strip with *Now · 15:00–15:30 Call with the editor*, 3 Doing, counters (1 overdue · 4 done today · 2 due this week · 4 meetings · 3 posts), two project cards, This week | "Home answers 'what now' before anything else." |
| 31 | `overview` | Overview of Pocket Studio: two boards with progress, four app cards | "Each project in detail." |
| 32 | `board-full` | Launch runway board: three columns full, one card expanded with steps and notes, date chip popover open on another | "Trello you own, as files." |
| 33 | `board-when` | A card's date form open: When, Until, Deadline fields with picker buttons, meeting checkbox | "Dates typed or picked." (the native picker popup cannot be captured headless) |
| 34 | `calendar-agenda` | Calendar Agenda, today → 14 days, meetings · tasks · posts, filter chips, one overdue | "Tasks, meetings and posts on one timeline." |
| 35 | `calendar-month` | Month grid with chips | |
| 36 | `social-board` | Posting schedule: arc of 9 posts, one open with copy, prep list, posted stats | "The posting schedule with prep lists and what actually happened." |
| 37 | `social-streak` | Posting streak heatmap | |
| 38 | `scripts` | Script Viewer: hook + beats, teleprompter button, 9:16 preview | |
| 39 | `writing` | Writing Viewer with `~~cut~~ ++add++ [[note]]` markup visible | "Drafts with instructions for the AI inside the text." |
| 40 | `inspiration` | Inbox with links (titles fetched), an idea, a quote; the capture strip at the top | "Everything you save, tagged, waiting to become work." |
| 41 | `share-dialog` | Share today dialog open, All projects scope | "One click: today as a card for your cofounder or your feed." |
| 42 | `share-card` | The PNG itself (from `data/exports/`) | |
| 43 | `palette` | ⌘K open with "add" typed | "Every command from the keyboard." |
| 44 | `home-dark` | Home, dark, dusk palette | "Four palettes, light and dark." |
| 45 | `phone-home` | 390 px, Today strip | "Install it on the phone from the same folder." |
| 46 | `phone-board` | 390 px, board | |

## Story 5 — Trust

| Id | Shot | State | Caption |
|---|---|---|---|
| 50 | `recent-restore` | Home → Recent changes with *you* and *agent* rows, *Restore a file* unfolded | "Every change by you or the agent is a line you can read and undo." |
| 51 | `guide-backup-ok` | Guide → Settings, Protect your work with "backed up 21:00 · private repo" | "Private backup, daily, yours." |
| 52 | `about` | The About page: who it is for, three ways in, what is coming (MCP server, Mac and Windows notes, more through your AI) | "The direction: reachable from wherever you and your agents already are." |
| 53 | `about-coming` | The same page scrolled to *What is coming* | used in the "what's next" post |
| 54 | `files` | Finder-style mock of the `data/` folder: `runway.json`, `social.json`, `SCHEMA.md`, `exports/`, `attachments/` | "It is just files. Open them, grep them, back them up." |

## Story 6 — Three people (the main launch shots for X)

Three personas, each a complete workspace seeded by `personas.js`, with the
kind of detail a week actually has: amounts, invoice numbers, the tools they
use, half-ticked steps, notes in their own words, errands between the work.
For each: Home (the cockpit), the board at 1440×1100 with the first Doing
card expanded, the Calendar agenda, and the phone. Files:
`persona-<name>-home|board|calendar|phone`.

| Who | Why this person | What the shots show |
|---|---|---|
| **Tomas** · Shiftlog, rota software for small clinics | The indie SaaS founder whose AI pairs on code and drafts support replies | *This week* board with product, support, money and life side by side: a Stripe webhook bug with the agent's note on the fix, the CSV import 11 clinics asked for, nine Help Scout tickets the agent drafted, a refund, the quarterly VAT, a school form, the Heroku bill. A second *Support* board of tickets. The pilot call in progress on Home. |
| **Noor** · YouTube 54k + the Sunday letter | The creator: sponsors, scripts, a posting arc, an editor to pay | *Pipeline* board: the editor video being filmed with the fail at 4:10 kept in, a $3,200 sponsor offer to counter at $4,000, ten titles the agent drafted, the media-kit numbers, Dad's flight on Saturday. A script in the Script Viewer and the week's arc on the schedule. |
| **Lena** · freelance brand designer | One board for everything: clients, money and life, because that is the week | *Everything* board: Fjord round 2 ("warmer, less Scandinavian"), print files at 300 dpi, invoice #042 nine days overdue, the Hale & Co. proposal the agent drafted from her last two, VAT, Mum's birthday, the vet, the visa appointment. Kickoff in progress on Home. |

To retake one: reseed the scratch copy (`personas.js <copy> lena`), then
`node docs/launch/shoot.js --only persona-lena`.

## The launch video

`video/` is a Remotion project (its own `package.json`; the product stays
npm-free) that builds the films from these screenshots. The soundtrack is
synthesised from oscillators and noise (`scripts/soundtrack.py`), no
samples. `npm install` once, then:

- `npm run render` → `out/solo-ops-final.mp4`, **the launch video** (73 s,
  `src/Final.tsx` + `src/finalTimeline.ts`): hook and flip in type; *Set up
  in one command* and the real `/setup` session (06); `/plan-project`
  building the board (21); the *Agent-first* card; "say what shipped" from
  the chat where you are coding (23); `/standup` (20); the no-terminal route,
  emails pasted into Claude and the board that moved (16, 32); Home with
  callouts (30); the wall of twelve features; three people; the claim;
  lockup and what is coming.
- `npm run render:teaser` → the 46-second teaser (two screens, the wall,
  three people, the claim) and `npm run render:film` → the older 72-second
  nine-act film, kept for cutting.
- `npm run frames` for stills (`COMP=Final sh scripts/frames.sh 330 600`),
  `npm run studio` to scrub.

Each composition's timing lives in its timeline file and is mirrored in the
soundtrack script's act plan (`FINAL`, `TEASER`, `FILM`), which writes
`final.wav`, `teaser.wav`, `film.wav`; the render refuses when the two
disagree. Rendered files are kept in `video/video/` (not in git).

## How the frames stay honest

- **Chat frames** (`mock/chat.html`): a plain chat layout — avatar, name
  of the assistant the user chose, message bubbles, a code block. No logo
  or wordmark of ChatGPT or Claude is drawn; the caption says which one
  the person used. Content comes from `conversations/<id>.md` and the
  reply blocks were run through the Reply tab's preview on the seed
  project before the shot; the preview screenshot (13) is of that run.
- **Terminal frames** (`mock/term.html`): a terminal window with the real
  stdout of the commands, captured by `seed.sh` into
  `conversations/<id>.txt`; the agent's sentences in between are what a
  Claude Code session says when it follows the prompt (kept short).
- Nothing is retouched. If a shot cannot be made true, it is cut.

## Order of work

1. `seed.sh` → a scratch copy with the sample project (never the owner's `data/`).
2. Pages: stories 1, 4, 5 (no mocks needed) — `shoot.sh` with headless Chrome.
3. Conversations written and verified through the Reply tab; chat and terminal frames; stories 2 and 3.
4. README pass uses 01, 07, 30, 32, 34, 36, 41/42, 13, 20; the landing page the rest. The posts and the story are in `LAUNCH-BRIEF.md`.
