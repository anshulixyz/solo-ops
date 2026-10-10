# Telegram (planned) — update Solo Ops from your phone

Not built yet. This is the design so the pieces already in place (CLI, change
log, inspiration inbox) line up with it.

## How it will work

1. You create a Telegram bot (BotFather) and put its token in a local,
   git-ignored file (`.solo-ops/telegram.json`). Nothing else leaves your
   machine.
2. `node solo.js telegram` runs a tiny long-polling loop (zero
   dependencies, Node's `https`). It only answers your own chat id.
3. Messages are either **commands** or **inspiration**:
   - `/today`, `/week`, `/add Write the launch post #launch !high`,
     `/done launch post`, `/next` (next unposted post), `/posted p4 https://…`
     → mapped 1:1 onto the CLI, reply is the CLI's Markdown output.
   - anything else (a link, a photo, a voice note transcription, a thought)
     → `inspo add …` tagged with the workspace you set with `/ws launch`.
4. Every change is written through the same `write()` as the CLI, so it lands
   in `data/log.jsonl` with `source: "telegram"` and can be reverted.
5. **Agent in the loop (optional):** with Claude Code (or any agent) open on
   the laptop, `/ask plan my week` hands the message to the agent via a file
   drop (`.solo-ops/inbox/*.md`) that the `marathon` skill watches; the agent
   replies with a proposal, you confirm with `/yes`, and only then does it run
   the commands. Confirmations are logged with `source: "agent"`.

## Why later

The CLI and log are the contract. Once they are stable the bot is ~200 lines.
If you want it sooner, the pieces to build are: token file, polling loop,
command → CLI mapping, photo download into `inspo add --image`.
