# Launch video — the final script (v5: marketing review + copy review folded in; nothing built yet)

Built from the shot list (stories 1–6), the launch brief (the flip, one
folder instead of ten apps, the agent is the integration), the two earlier
cuts, the founder's four changes, a review by a tech-side marketing
specialist and a copy review for plain words and the USP (both summarised at
the end, with what was taken and what was not).

The four changes the film serves, in order:

1. **Setup and onboarding first.** One command on your own computer, then
   the whole project built from inside the chat.
2. **The board is the centre.** Tech tasks, the video with its script and
   the teleprompter, the posting schedule, meetings: one board because it is
   one week, and the parts already know each other.
3. **Four ways in, each shown once:** type it yourself · a Guide prompt ·
   chat with your AI · the terminal. Plus the fifth hand: the apps your AI is
   already connected to (calendar, mail) feeding the board, nothing copied by
   hand.
4. **Tech is one slide.** Agent-first: give the folder to the agent that
   already writes your code and the app becomes optional.

Rules: everything shown is real or a verbatim reproduction (chat and
terminal frames), as in the shot list. Captions carry the film; no voice,
so it works muted. **Every terminal beat ends on a page that moved**, so a
viewer who cannot read mono text still sees the result. No "CLI", "OAuth",
"AGENTS.md" or "MCP" in a caption; the end card may say MCP once, as coming.

## The angle: one week, started in a conversation, run by five hands

One week of Mara's Pocket Studio, from an empty folder on Monday to a shared
card on Friday. A day chip (MON, TUE … day only, no times) sits top-left of
every beat. The board is the recurring shot: each time we return something
moved, and the chip says whose hand moved it. The flip is said once, at the
end, after it has been shown five times.

**Caption under the post on X:** *Monday, an empty folder. Friday, a week
your AI managed. You decide who does what. Plain files on your own computer,
no account.*

## Beats — the 60-second film

| # | s | Chip | On screen | Shot | Caption (serif) · kicker (mono) |
|---|---|---|---|---|---|
| 1 | 3 | — | **Open on motion, not type.** The board from beat 3 filling itself: cards landing in To Do one after another, the posting arc appearing under it. Hook as caption over it | `22-board-from-agent` (card-by-card build in the video code, from the one shot) | **Monday, an empty folder. Friday, a week your AI managed.** |
| 2 | 5 | MON | Title "Set up in one command." with `git clone → open the folder in your agent → /setup`, then three held frames of the real session, not a scroll: `/setup` · the three questions and the answer "Empty, we plan it next" · the last line "Done. The three things you will use most" | `06-term-setup` (**reshoot** with the empty-board answer) | **Three questions. It runs on your computer, no account.** · `/setup · needs only Node · nothing else to install` |
| 3 | 6 | MON | `/plan-project`: the five answers held, a fast scroll of the add lines, then the board it produced, full, matching beat 1 | `21-term-plan-project` → `22-board-from-agent` (**shoot**) | **Say what you are building. Back comes a board, steps, a posting plan.** · `/plan-project · or say it in your own words` |
| 4 | 8 | MON | The board held still; four callouts pop in turn: the export bug with its steps and the agent's note · the demo video task with its script attached · a post waiting in the schedule · Thursday's call with its time | `22-board-from-agent` | **A bug, a video, a post, a meeting. One board, because it is one week.** · `tasks · scripts · schedule · calendar · one folder` |
| 5 | 4 | TUE | `/standup`: only the three answers and the four green ticks, then the board with the two moved cards lit | `20-term-standup` → `32-board-full` (moved state, **reshoot**) | **Talk for a minute. The agent moves the cards.** · `/standup · Claude Code, Cursor, Codex` |
| 6 | 5 | TUE | `/fill-calendar`: the agent lists four events from the calendar it is connected to, "Add them?", "yes", then the Calendar agenda with the meetings in place | `25-term-fill-calendar` → `26-calendar-after-fill` (**shoot**) | **Your AI already has your calendar. Now so does your board.** · `/fill-calendar · the calendar your AI already reads · no setup here` |
| 7 | 5 | WED | A chat with a mail connector: one line typed, "what do I owe replies to this week? check my mail", the tool chip *Searched Gmail · 3 results*, the reply with three `add … --due` lines; then Guide → Reply, the preview with three ticks, Apply, the board | **new** `chat-mail-connector` → `13-guide-reply-preview` → board | **Ask your AI who you owe replies to. They become to-dos with deadlines. You check each one.** · `paste the reply · see every change before it lands · your own mail connector, no mail code here` |
| 8 | 6 | THU | The demo task's card opened; its script in the Script Viewer; the teleprompter rolling; the schedule with the new post and its prep list | `22` (card) → `38-scripts` → **new** `scripts-prompter` → `36-social-board` (after the post, **reshoot**) | **Task, script, teleprompter, post. They were never in four apps.** · `/ship-post · one post from what you just finished` |
| 9 | 4 | FRI | Home: she types "Call Sam Monday 14:00" into the strip, it lands with its time; then the Share today dialog with the card | **new** `home-quick-add-typing` → `41-share-dialog` | **And when typing it is quicker, type it.** · `Home · the Today strip · Share today` |
| 10 | 5 | — | Type card "Agent-first." (1 s), then the one terminal: from the website repo, "the onboarding email shipped, mark it done", two commands, the log note; end on Home → Recent changes with the two *agent* rows | `23-term-done-elsewhere` → `50-recent-restore` | **Already have an agent? Give it the folder. The app is optional.** · `logged as "agent" · undo anything it did · one contract file` |
| 11 | 3 | — | Type, two lines | — | **You decide who does what.** / *Your AI does the managing.* |
| 12 | 6 | — | Lockup, then the one action, then the repo, then one coming line | — | **Solo Ops.** / **Download the folder. Open it in your agent. Type /setup.** · `github.com/anshulixyz/solo-ops · MIT` · *Coming: an MCP server · Telegram and WhatsApp · your agent and your editor's agent, through the files* |

Total 60 s.

## The 45-second teaser

Same film, beats 1 · 3 · 4 · 5 · 7 · 10 · 11 · 12 at the same lengths
(40 s) plus 5 s of air in beats 4 and 12. Setup, calendar, studio and quick
add go to the thread, where people can read them: setup is the thread's last
post with shot 06.

## What each beat proves

- 1–3: setup is a conversation, not a form; the project exists before the
  app is opened. (Change 1.)
- 4: the board is the centre and the parts are aligned because they live in
  one folder. (Change 2.)
- 5, 7, 8, 9: the four ways in, one each, never repeated: terminal, chat,
  prompt, yourself. 6 and 7 together: the AI's own connections feed the
  board. (Change 3.)
- 10: agent-first, one slide. (Change 4.)
- 11–12: the flip said once, then the single action.

## Shots to take before the build (everything else exists)

| Shot | How | Truth check |
|---|---|---|
| `06-term-setup` reshoot | In `conversations/terms.js`, Mara's answer becomes "Pocket Studio, a tiny video tool for founders. All four. Empty, we plan it next." and the `template all` step goes; the rest of the session is unchanged | Keeps the setup and the plan continuous: no sample data appears before `/plan-project` |
| `22-board-from-agent` | Fresh `data/`, run the `/plan-project` commands from `capture.sh` (board, 14 tasks with steps, four posts), add the Thursday call, shoot the board | The board the conversation produced, nothing else on it. Fixes the continuity break of showing a 12-day streak five minutes after setup |
| `32-board-full` moved state | Reseed, apply the standup's four commands, reshoot | Real page, real commands |
| `26-calendar-after-fill` | Reseed, apply the four `--ext gcal:` adds, shoot the agenda | Real page |
| `chat-mail-connector` | New reproduction in `mock/chat.html`: the Guide's *Add tasks from this list* prompt folded, the one line, a tool chip *Searched Gmail · 3 results*, the reply with three `add … --due` lines and one `note`. No vendor logo; the caption says a chat with a mail connector. Footer "Reproduction · content verbatim" stays visible, as on shot 17 | Works today with any chat that has a mail connector; Solo Ops adds nothing and claims nothing. The block is run through Guide → Reply on the seed before the shot. **Owner retakes this one for real in Claude.ai before launch**; it is the only frame in the film a skeptic will test |
| `scripts-prompter` | `frame.html` on the Script Viewer, click the teleprompter button, let it roll | The teleprompter is in `studio/script-viewer.js` |
| `home-quick-add-typing` | `frame.html` on Home, `type` into the strip, no submit | Real page |
| `36-social-board` after the post | Reseed, `social add` with copy as the prompt would, reshoot | Real page |

## Gone from the earlier cuts, and why

- The wall of twelve features in type: the week shows the parts in use.
- The three-persona act: the persona boards are the X image posts.
- Three terminal shots in a row: now one each for standup, calendar and
  agent-first, each ending on a page that moved.
- Pasting emails: replaced by the connector beat.
- "Finished the landing page in another chat" (shot 17): it proved what beat
  10 proves; its slot became the mail beat.
- Type on black as the opener: the board filling itself opens instead.

## The review, and what the owner did with it

Reviewer: a marketing specialist who launches developer tools and uses
Claude Code and Cursor daily. Full notes in the session; the calls:

**Taken.** Open on motion with the hook over the board, not type on black ·
setup as three held frames, 5 s · the continuity break (a 12-day streak five
minutes after setup) fixed by shooting the board the conversation built ·
day-only chips · beat 6 split into calendar (TUE) and mail (WED), each one
frame · shot 17 dropped as redundant with beat 10 · the prompt click dropped
from the studio beat · "AGENTS.md" said as "one contract file", "OAuth" as
"no integration to set up" · the mail kicker owns it plainly: Solo Ops adds
no mail code, the connector is yours · every terminal beat ends on a page
that moved · 60 s main, 45 s teaser with their beat list · the end card
reduced to one action and one coming line.

**Not taken, and why.** The hook "a week that ran itself": it overclaims;
the product's promise is that the AI manages and the person decides, so the
line is "a week your AI managed". The suggestion to drop "nothing to install
but Node" entirely: Node is the honest requirement and the first question
every dev asks, so it stays as two words in the setup kicker.

**Owner's own additions.** The setup frame now ends with an empty board by
choice, so the plan is the first content the viewer sees. Beat 10 ends on
Recent changes rather than the terminal, so the agent's work is seen as
log lines a person can undo. Node stays in the kicker only.

## The copy review, and what the owner did with it

Reviewer: a launch copywriter for non-technical audiences. Test used: the
twelve captions read in a row with no pictures must tell the story, and a
viewer must be able to repeat two sentences to a friend afterwards.

**The twelve captions, final, in a row:** Monday, an empty folder. Friday, a
week your AI managed. · Three questions. It runs on your computer, no
account. · Say what you are building. Back comes a board, steps, a posting
plan. · A bug, a video, a post, a meeting. One board, because it is one
week. · Talk for a minute. The agent moves the cards. · Your AI already has
your calendar. Now so does your board. · Ask your AI who you owe replies to.
They become to-dos with deadlines. You check each one. · Task, script,
teleprompter, post. They were never in four apps. · And when typing it is
quicker, type it. · Already have an agent? Give it the folder. The app is
optional. · You decide who does what. Your AI does the managing. · Solo Ops.
Download the folder. Open it in your agent. Type /setup.

**Taken.** "Posting arc" (insider word) → "posting plan" · "Clone it" →
"Download the folder" (the GitHub line under it tells devs how) · beat 7 now
says the result (to-dos with deadlines) and puts the person's yes on screen
("You check each one") before the flip is stated · "no account" moved into
the setup caption, where the objection is · "integration" out of the
calendar kicker · the studio kicker names the real prompt, `/ship-post` ·
"just" cut · the X caption's fourth sentence now adds "plain files, no
account" instead of repeating "folder".

**Not taken, and why.** The reviewer wanted "Undo anything it does" in the
agent-first caption in place of "The app is optional". The founder's fourth
change is exactly that line, and it is the one argument a Claude Code user
has not heard from a Notion-plus-plugin pitch, so it stays in the caption;
undo moves to the front of that beat's kicker and is in the picture (Recent
changes, two agent rows, Restore).

**The two sentences the film should leave behind:** *It is one folder on my
computer with my board, calendar, posts and scripts, and the AI I already
use keeps it up to date. I say who does each thing, the AI does the admin,
and I can undo anything it did.* Beats 1, 4 and 8 carry the first; 7, 10
and 11 the second.

## Open decisions (two, down from four)

1. **The 45 s cut**: as listed, or keep beat 9 (type it yourself) in it as
   the one moment a non-technical viewer sees something they could do
   themselves, and drop beat 5 instead.
2. **The mail frame**: build the reproduction now and retake for real before
   launch (recommended), or wait and shoot it for real first.

Then the order is: the eight shots above and their stills for a yes, then
the film.
