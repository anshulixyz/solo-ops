# Sharing work with a person — the flow

*Product design, 2026-10-14. The user-facing flow the share feature should
follow. The CLI slice built the same day (NEXT M3) is the plumbing
underneath; this note is what the person sees.*

## The idea in one line

You tag a person on a task the way you tag a topic. From then on, the two
of you see the same task on your own boards, and your agents carry the
details back and forth. Nothing arrives from anyone you have not added.

## The five steps

### 1 · Add a person, once
"Add @maya." You paste the card she sent you, or tap the invite link she
sent, or she tapped yours. Until both of you have each other, nothing from
her exists on your side: no greyed lines, no "unknown sender", nothing.
After that she is in **People**, like a contact in a phone.

### 2 · Tag them on a task
On any task, type `@maya` the way you type a tag. That is the whole act of
sharing. The first time you tag her, your agent sends her the task with its
steps, due date and files. Tag her on a board, and every task on it goes.
Tag two people and both get it. Remove the tag and it stops.

### 3 · They get told
On Maya's Home, a block called **From others**: "Mara tagged you on *Shot
list v2*, 3 steps, due Tuesday." The same line reaches her chat agent, so
"what's up for me?" answers with it, and later her phone. She sees the whole
task before deciding, never a teaser.

### 4 · They accept
One tap. The task lands on the board she chose for you (asked once, the
first time), tagged `from:mara`. Skip, and nothing is written anywhere.
Her agent can accept for her only after she said yes to that item.

### 5 · Work flows both ways
She ticks a step, moves it to Doing, adds a file: your card shows it.
"Maya: 2 of 3 steps, Doing." You change the brief: her card updates. Both
change logs say who did what, and either side can undo. Her private notes
and the rest of her board never travel. Yours never travel either.

## How you know you depend on each other

- On your board, a task you tagged a person on shows their name and their
  progress on the card. That is your dependency, visible without a meeting.
- On their board, the task shows `from:you`. That is theirs.
- **People** shows, per person, what you sent them, what they sent you, and
  what is still open. "Waiting on Maya: 2. Maya waiting on you: 1."
- When something you depend on changes, it shows up in **From others**, not
  in a feed you have to read. Nothing you did not ask about reaches you.

## With the agent in the loop

- "Send Maya the shot list and give her three steps." The agent writes the
  steps, tags her, done. No command typed.
- "What's new from Maya?" The agent lists each item and what accepting does.
- "Accept all from Maya." Only after that sentence does anything land.
- "Tell Maya the deadline moved." The agent changes the date on the task;
  that is the message.

## What never happens

- No shared room, no channel, no feed. There is your board and her board.
- No stranger ever appears. Adding a person is the gate, and it is mutual.
- Nothing lands on a board without a yes, from the person or from their
  agent after the person said yes.
- Notes stay home. Only the task you tagged travels, and only its public
  fields: title, description, steps, dates, files, priority, status.

## What this changes in the slice built today

| Today (CLI slice) | The flow above |
|---|---|
| `share with @maya --tag maya` picks a tag of your choosing | the person's handle **is** the tag: `tag <task> +@maya` sends; `share with` disappears |
| an offer from a stranger shows as a greyed line you can skip | nothing from a stranger is stored or shown; a count at most ("1 from someone you have not added") |
| only the status travels back | status **and ticked steps** travel back, never notes or other tasks |
| accept in the terminal | **From others** on Home with Accept and Skip; the same list in the Guide and through the MCP server |
| cards swapped by hand | an invite link or QR code that pins the sender and opens the first item |
| no per-person view | **People**: who you share with, what each side is waiting on |
| no files | files on a shared task travel by hash and land in attachments |

Build order: the handle-as-tag change and the stranger rule first (small,
CLI only), then From others on Home, then People, then the invite link,
then files.
