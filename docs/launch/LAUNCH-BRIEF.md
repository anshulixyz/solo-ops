# Solo Ops — launch brief (X first)

The story, the thread, the three posts, then the proof and the answers.
Everything claimed is shipped unless it sits under *Coming*. Screenshots are
in `docs/screenshots/launch/`.

## The problem, in one breath

Every tool today lets you hand a task to an AI. None of them hands the
*managing* to the AI. You still open five apps, add the task, move the card,
save the link, paste the plan into a chat every morning, and keep the
agents in your head. The AI does the work; you do the admin of the work.

## The flip

**Solo Ops switches it.** You decide who does each thing: you, an agent, a
human, or a mix. Everything around that decision is done for you by the AI
you already have: adding the tasks, breaking them into steps, researching,
saving inspiration, keeping the to-dos and the calendar honest, writing the
standup, drafting the replies, telling you what is next. One folder, plain
files, every change logged and undoable.

And it is one folder instead of ten apps. The solo-founder versions of a
board (Trello), notes and drafts (Notion), a script writer and a
teleprompter, a posting scheduler, a calendar, a bookmarks inbox and a
daily planner are all in it, each as small as a solo person needs, all
readable by the same agent.

## Where it comes from (say it plainly)

I built it for myself. I am a creator, a developer, an AI engineer and a
startup founder at the same time, and I kept needing one more tool: a
board, then a posting calendar, then somewhere for scripts, then a
teleprompter, then an inbox for ideas. Each was a SaaS with a login and a
monthly price for a feature I used once a day. The AI was doing more and
more of my work and none of those tools let it in. So I vibe-coded Solo
Ops in phases, one tool at a time, as the need came. SaaS stopped solving
anything here: these are basic things, and your own computer and your own
AI can do them. You do not need heavy or expensive tools for them.

## One line

**Your tasks, meetings, posts and drafts in one folder on your computer,
managed for you by the AI you already use. You decide who does what.**

Shorter: *You decide who does what. Your AI does the rest of the managing.*

## The X thread (post this first)

1. Every tool lets you give a task to an AI. None of them lets the AI
   manage your tasks. You still do the admin: five apps, the card, the
   link, the plan pasted into a chat every morning. I flipped it.
   [`30-home-cockpit`]
2. Solo Ops: you decide who does each thing, you, an agent, a human, or a
   mix. The AI you already use does the managing: adds tasks, breaks them
   into steps, saves inspiration, keeps the board and the calendar honest,
   writes the standup. [`20-term-standup`]
3. It is one folder on your computer. Plain files. Open it by double-click.
   Open source, MIT. No account, no key, no seat. [`01-home-first-run`]
4. One folder instead of ten apps: a board, a calendar, a posting
   schedule, scripts with a teleprompter, drafts, an inbox for ideas, a
   daily brief. The solo-founder size of each. [`32-board-full`]
5. Works with the AI you have. Chat only? Copy a prompt, it carries your
   board; paste the answer back, preview every change, apply.
   [`13-guide-reply-preview`]
6. Terminal? /standup, /plan-project, /fill-calendar are slash commands
   in Claude Code or Cursor. The pages update while the agent works.
   [`21-term-plan-project`]
7. Finished something in another chat? Tell it. The board updates.
   Paste the emails you owe. They become to-dos with deadlines.
   [`16-chat-emails-to-todos`]
8. The calendar has no OAuth. Your AI reads the calendar it is connected
   to and writes the meetings in. The agent is the integration.
   [`34-calendar-agenda`]
9. Everything the agent does is logged in plain words. One click restores a
   file. A pasted reply never deletes anything. [`50-recent-restore`]
10. Your data never enters the code repo. A guard refuses the commit and
    points you to a private repo you own. [`28-term-guard`]
11. I built this for myself: creator, developer, AI engineer, founder, one
    person. One more SaaS per need stopped making sense. Your computer and
    your AI can do these basic things. [`persona-tomas-board`]
12. Coming: collaboration with no API in the middle, your agent and theirs
    updating each other through the files; Telegram and WhatsApp; the phone
    on your own wifi; an MCP server so any agent anywhere can use it; your
    Mac and Windows notes flowing in. The list is public in NEXT.md.
    [`53-about-coming`]
13. github.com/anshulixyz/solo-ops · node ≥ 18, nothing else. Hand the
    folder to your agent and say /setup. [`06-term-setup`]

## Three persona posts (one each, with their board)

**Tomas, the founder.** "My week, one board: a Stripe bug with the fix my
agent found in the note, the feature 11 customers asked for, 9 support
tickets it drafted and 2 it flagged for me, VAT, my kid's school form. I
decide what ships and what I answer myself. The AI does the managing. It
is a folder. Open source." [`persona-tomas-board`]

**Noor, the creator.** "Creator week in one folder: the video I am
filming, a $3,200 sponsor offer I am countering, ten titles my AI drafted
from the script, the teleprompter for the take, the week's posts, Dad's
flight. No new app to log into; my AI already knows the folder."
[`persona-noor-board`]

**Lena, the freelancer.** "One board for everything, because that is what
a week is: Fjord round 2, print files at 300 dpi, an invoice 9 days late,
the proposal my AI drafted from my last two, the vet, Mum's birthday.
Plain files on my laptop, backed up to a private repo I own."
[`persona-lena-board`]

## What to say about what is coming (direction, never shipped)

- **Collaboration without APIs.** An editor or a cofounder installs Solo
  Ops, points their own agent at the same private data repo, and the two
  agents update each other on what they have done, through the files. No
  shared app, no seats, no integration to pay for.
- **Telegram and WhatsApp.** Add, done, next, and "just send me the link"
  from your phone into the inbox.
- **Mobile, still local.** The same pages served from your laptop on your
  own wifi, installed on the phone. No cloud in between.
- **An MCP server.** Solo Ops as tools for any agent anywhere: Claude
  Desktop, ChatGPT, Cursor, the phone. Same files, same log, same guard.
- **Your notes on the Mac and Windows.** Apple Notes and Reminders, Sticky
  Notes and Notepad, any Markdown folder, read into the inbox with a link
  back.
- **More through your AI.** The calendar is live; mail, meeting notes and
  analytics next.

One line for posts: *"Next: your agent and your editor's agent updating
each other through the files, no API in the middle. Telegram and WhatsApp.
The phone on your own wifi. An MCP server so any agent anywhere can use
it."*

## The five differences (for the README and the landing page)

1. **You decide who does what; the AI manages.** Humans, agents, yourself,
   or a mix per task. The admin of the work is the agent's job.
2. **One folder, not ten apps.** Board, calendar, schedule, scripts and
   teleprompter, drafts, inbox, brief: the solo-founder size of each.
3. **Bring your own AI.** Chat or terminal, any vendor. Solo Ops never calls
   a model; there is no key, no account, no seat.
4. **The agent is the integration.** Calendar today; mail, notes and
   collaboration the same way. No OAuth screens here.
5. **Nothing silent, nothing public.** Every change logged and restorable;
   your data never enters the code, enforced by a guard.

## Who we are talking to

| Person | What their week looks like | Proof |
|---|---|---|
| **Tomas**, indie SaaS founder; AI writes code and drafts support | A Stripe webhook bug with the agent's fix, CSV import 11 clinics asked for, 9 tickets drafted, a refund, VAT, a school form | `persona-tomas-board`, `persona-tomas-home`, `20-term-standup`, `23-term-done-elsewhere` |
| **Noor**, YouTube 54k + a Sunday letter | The editor video being filmed, a sponsor offer to counter, ten titles drafted, the media kit, Dad's flight | `persona-noor-board`, `persona-noor-calendar`, `38-scripts`, `36-social-board` |
| **Lena**, freelance brand designer | One board: Fjord round 2, print files, invoice #042 late, the Hale proposal drafted, the vet, Mum's birthday | `persona-lena-board`, `persona-lena-home`, `16-chat-emails-to-todos`, `13-guide-reply-preview` |

## Flows to show

| Flow | Shots | Caption |
|---|---|---|
| First five minutes | `01` → `07`, `06-term-setup` | "Type /setup, answer three questions." |
| Chat only | `10` → `12` → `13` → `14` | "Copy, paste, preview, apply." |
| Any conversation becomes tasks | `15-chat-capture` | "Paste it at the end of any chat." |
| Inbox to to-dos | `16-chat-emails-to-todos` | "Paste the emails you owe." |
| Finished elsewhere | `17`, `23` | "Tell any chat; the board updates." |
| Daily brief | `24`, `30` | "One command, or just open Home." |
| Calendar without OAuth | `25` → `34` | "Your AI reads its calendar." |
| Share today | `41`, `42` | "Today as a card." |
| Trust | `28`, `50`, `51` | "Undoable. Never public." |
| The Ask box (video) | `19`, `19-dark` | "Say it in plain words." |
| Where it is going | `52-about`, `53-about-coming` | "Reachable from wherever you and your agents already are." |

## Objections and the answer

- *"Another task app."* It is a folder. Open it without us. Leave with
  your data. No account to close.
- *"Why not Trello / Notion + an AI plugin?"* They keep the plan behind a
  login and give the agent a plugin's view. Here the agent gets the whole
  folder and one contract, and you keep the log. And it is seven of those
  apps in one, at the size one person needs.
- *"My data in an AI?"* Only what you paste or what your agent reads
  locally. Solo Ops sends nothing anywhere; backups go to a private repo you
  own; the guard stops the one mistake that would publish them.
- *"I am not technical."* Open the pages, copy a prompt, paste the reply.
  The Quick tab needs no AI. Setup is three questions to your agent.
- *"Vibe-coded, so fragile?"* Built in phases for real daily use by one
  person wearing four hats. Sync, log, guard, backups and the reply parser
  are tested code, MIT, read it.

## Voice

Plain words, short sentences, first person where it is the origin story,
no superlatives. Say what it does, show the screen, name what is coming as
coming. The product's own tone: *you steer*.

## Before posting

- README pass with the new story and shots (last item in NEXT.md).
- Clean-machine install: clone, `node solo.js doctor`, `/setup`.
- Backup repo name offered during setup (NEXT.md, must).
- Every image comes from `docs/screenshots/launch/`, none from real data.
