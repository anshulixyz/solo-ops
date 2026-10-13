/* docs/launch/conversations/terms.js — the terminal story (Stories 1 and 3).
   Rendered by mock/term.html?t=<id>. `sh` = a plain shell line with its real
   output; `tool` = a command the agent ran (Claude Code shows these as
   ⏺ Bash(...)) with its real output; outputs come from the .txt files next to
   this one, captured on a throwaway copy of the seed project. The agent's
   sentences are what a Claude Code session says when it follows the prompt. */
window.TERMS = {
  '05-term-doctor-fresh': { title: 'pocket-studio — zsh', lines: [
    { t: 'sh', cmd: 'node solo.js doctor', file: '05-doctor-fresh.txt' }
  ] },
  '06-term-setup': { title: 'Claude Code — ~/Documents/pocket-studio', lines: [
    { t: 'user', slash: '/setup', hint: 'Set up Solo Ops for me · .claude/commands/setup.md' },
    { t: 'agent', text: 'Three questions before I touch anything:\n  1. What are you building, in one line? It becomes the project name.\n  2. Which parts do you want: boards · posting schedule · scripts · drafts?\n  3. The sample sprint to look at, or an empty board?' },
    { t: 'user', text: 'Pocket Studio, a tiny video tool for founders. All four. Empty, we plan it next.' },
    { t: 'tool', cmd: 'node solo.js doctor', file: '05-doctor-fresh.txt' },
    { t: 'tool', tool: 'Update', cmd: 'solo.config.js', out: "name: 'Pocket Studio',  eyebrow: 'Mara · building in public'" },
    { t: 'tool', cmd: 'node solo.js template settings', out: '- wrote data/settings.json' },
    { t: 'tool', cmd: 'node serve.js', out: 'Solo Ops → http://localhost:4321\n   (writes data/*.json · Ctrl-C to stop)' },
    { t: 'agent', text: 'It is running: open http://localhost:4321 (Chrome or Edge: Install makes it an app). Last thing, and it is not optional: your tasks never go into this code repo, so they need a private home of their own. GitHub (I create a private repo with gh), or a folder that syncs like iCloud Drive?' },
    { t: 'user', text: 'GitHub. Call it pocket-studio-data.' },
    { t: 'tool', cmd: 'node solo.js backup setup --name pocket-studio-data', out: '✓ Private GitHub repo mara/pocket-studio-data\n✓ Committed 6 file(s): backup 2026-10-13 09:14\n  Pushed to https://github.com/mara/pocket-studio-data.git (private ✓)\n  Backups never include log.jsonl.' },
    { t: 'tool', cmd: 'node solo.js backup --daily', out: '✓ Daily backup at 21:00 (launchd: ~/Library/LaunchAgents/com.solo-ops.backup.plist). Log: /tmp/solo-ops-backup.log' },
    { t: 'tool', cmd: 'node solo.js guard --install', out: '✓ pre-commit hook installed: every commit runs `node solo.js guard` (a human can bypass with --no-verify; agents never do)' },
    { t: 'agent', text: 'Done. The three things you will use most: the Guide (left edge of every page, or the ? key), /standup each morning, /now when you do not know what to pick.' }
  ] },
  '20-term-standup': { title: 'Claude Code — ~/Documents/pocket-studio', lines: [
    { t: 'user', slash: '/standup', hint: 'Daily standup · .claude/commands/standup.md' },
    { t: 'tool', cmd: 'node solo.js today --ws main', file: '24-today.txt', lines: [0, 13] },
    { t: 'agent', text: 'Three questions, one at a time:\n  1. What did you finish since yesterday? Landing page copy and the demo are still in Doing.\n  2. The one thing today is about?\n  3. What is blocking you?' },
    { t: 'user', text: 'Landing page copy is done. Today is the launch post. Blocked: Priya\'s intro is Thursday and I have not replied to her email.' },
    { t: 'agent', text: 'Updating the board, then the plan.' },
    { t: 'tool', cmd: 'node solo.js done "Landing page copy" --as agent --note "standup: finished last night"', file: '20-standup-cmds.txt', lines: [1, 2] },
    { t: 'tool', cmd: 'node solo.js start "Write the launch post" --as agent --note "standup: today is about this"', file: '20-standup-cmds.txt', lines: [3, 4] },
    { t: 'tool', cmd: 'node solo.js note "Write the launch post" "Lead with the Sunday line from the first post" --as agent', file: '20-standup-cmds.txt', lines: [5, 6] },
    { t: 'tool', cmd: 'node solo.js add "Reply to Priya before the intro" --pri high --due 2026-10-14 --as agent --note "standup: blocker"', file: '20-standup-cmds.txt', lines: [7, 8] },
    { t: 'agent', text: 'Today, in order:\n  1. Reply to Priya — 10 minutes, first. Done = sent, Thursday 14:00 confirmed.\n  2. Write the launch post — the four steps are on the card; start with the problem line. Done = four steps ticked, draft in the Writing Viewer.\n  3. Demo, take 2 — only after the 15:00 call; your note says re-record from beat 2.' }
  ] },
  '21-term-plan-project': { title: 'Claude Code — ~/Documents/pocket-studio', lines: [
    { t: 'user', slash: '/plan-project', hint: 'Plan a project from scratch · .claude/commands/plan-project.md' },
    { t: 'agent', text: 'Five questions, then I build it:\n  1. The goal in one sentence?\n  2. The deadline?\n  3. What already exists?\n  4. What does "done" look like?\n  5. What will you not do?' },
    { t: 'user', text: '1. Launch Pocket Studio to the waitlist. 2. Three weeks, Nov 3. 3. A working beta and twelve testers. 4. Landing page live, demo video out, 100 sign-ups in week one. 5. No TikTok, no pricing experiments, no new features.' },
    { t: 'agent', text: 'One board, 14 tasks in priority order with steps, and a two-week posting arc of four posts. Showing the first lines; say go and I apply all of it.' },
    { t: 'user', text: 'go' },
    { t: 'tool', cmd: 'node solo.js boards add "Launch runway" --from blank', file: '21-plan-project.txt', lines: [1, 3] },
    { t: 'tool', cmd: 'node solo.js add "Name and one-line pitch" --board launch-runway --proj launch --pri high --steps "Ten names|Say each out loud|Pick one, domain check" --as agent --note "plan-project"', file: '21-plan-project.txt', lines: [4, 5] },
    { t: 'tool', cmd: 'node solo.js add "Landing page with a waitlist" --board launch-runway --proj launch --pri high --steps "One sentence|One button|Email capture" --as agent --note "plan-project"', file: '21-plan-project.txt', lines: [6, 7] },
    { t: 'tool', cmd: 'node solo.js add "Record the 60-second demo" --board launch-runway --proj launch --pri high --tags video --steps "Script the three beats|Record|Pick the take" --as agent --note "plan-project"', file: '21-plan-project.txt', lines: [8, 9] },
    { t: 'agent', text: '… 11 more tasks added the same way.' },
    { t: 'tool', cmd: 'node solo.js social add "Why I am building this" --at 2026-10-20T09:00 --type story --as agent --note "plan-project"', file: '21-plan-project.txt', lines: [12, 13] },
    { t: 'tool', cmd: 'node solo.js social add "The ugly first version" --at 2026-10-23T17:00 --type update --as agent --note "plan-project"', file: '21-plan-project.txt', lines: [14, 15] },
    { t: 'agent', text: 'Board and arc are in. The page at localhost:4321 already shows them; node solo.js week gives you the picture any time.' }
  ] },
  '23-term-done-elsewhere': { title: 'Claude Code — ~/code/pocket-studio-website', lines: [
    { t: 'user', text: 'The onboarding email sequence shipped this morning. Mark it done in my Solo Ops (~/Documents/pocket-studio) and add a follow-up to watch the first replies.' },
    { t: 'agent', text: 'Reading ~/Documents/pocket-studio/AGENTS.md, then two commands against that folder.' },
    { t: 'tool', cmd: 'node ~/Documents/pocket-studio/solo.js done "Onboarding email" --as agent --note "shipped, said so in the website chat"', file: '23-done-elsewhere.txt', lines: [1, 2] },
    { t: 'tool', cmd: 'node ~/Documents/pocket-studio/solo.js add "Watch the first 20 replies to the onboarding email" --pri medium --tags email --due 2026-10-16 --as agent --note "follow-up"', file: '23-done-elsewhere.txt', lines: [3, 4] },
    { t: 'agent', text: 'Done and logged under "agent" in Home → Recent changes, so you can see or undo it from there. Back to the website.' }
  ] },
  '24-term-today-brief': { title: 'pocket-studio — zsh', lines: [
    { t: 'sh', cmd: 'node solo.js today', file: '24-today.txt' }
  ] },
  '25-term-fill-calendar': { title: 'Claude Code — ~/Documents/pocket-studio', lines: [
    { t: 'user', slash: '/fill-calendar', hint: 'Fill my calendar · .claude/commands/fill-calendar.md' },
    { t: 'agent', text: 'Reading the next 7 days from your Google Calendar through the connector. Six events; skipping two you declined and one marked free. These four:\n  · Thu 15 Oct 14:00–14:45  Investor intro (Priya)\n  · Fri 16 Oct 11:30–12:15  Design review: onboarding screens\n  · Mon 19 Oct all day      Dentist\n  · Wed 21 Oct 10:00–10:30  Weekly check-in with Sam\nTwo are already on the board from last week (same event id) and will be updated, not duplicated. Add them?' },
    { t: 'user', text: 'yes' },
    { t: 'tool', cmd: 'node solo.js add "Investor intro (Priya)" --at 2026-10-15T14:00 --until 14:45 --tags meeting --ext gcal:7f3a23 --as agent --note "from Google Calendar"', file: '25-fill-calendar.txt', lines: [1, 2] },
    { t: 'tool', cmd: 'node solo.js add "Design review: onboarding screens" --at 2026-10-16T11:30 --until 12:15 --tags meeting,design --ext gcal:7f3a24 --as agent --note "from Google Calendar"', file: '25-fill-calendar.txt', lines: [3, 4] },
    { t: 'tool', cmd: 'node solo.js add "Dentist" --at 2026-10-19 --tags meeting --ext gcal:7f3a30 --as agent --note "from Google Calendar"', file: '25-fill-calendar.txt', lines: [5, 6] },
    { t: 'tool', cmd: 'node solo.js add "Weekly check-in with Sam" --at 2026-10-21T10:00 --until 10:30 --tags meeting --ext gcal:7f3a31 --as agent --note "from Google Calendar"', file: '25-fill-calendar.txt', lines: [7, 8] },
    { t: 'tool', cmd: 'node solo.js calendar --days 7', file: '26-calendar.txt', lines: [0, 14] }
  ] },
  '27-term-plan-today': { title: 'Claude Code — ~/Documents/pocket-studio', lines: [
    { t: 'user', slash: '/plan-today', hint: 'Plan today around my meetings · .claude/commands/plan-today.md' },
    { t: 'tool', cmd: 'node solo.js today --ws main', file: '24-today.txt', lines: [0, 7] },
    { t: 'agent', text: 'One meeting is fixed: the editor call at 15:00. Three slots around it, highest priority first, with a break after lunch:\n  10:00–11:30  Write the launch post\n  13:00–14:30  Fix the export crash on long clips\n  16:00–17:00  Set up the waitlist form\nNot today: the press kit (overdue — first thing tomorrow) and the thumbnail A/B. Apply?' },
    { t: 'user', text: 'apply' },
    { t: 'tool', cmd: 'node solo.js at "Write the launch post" today 10:00 --until 11:30 --as agent --note "plan today"', file: '27-plan-today.txt', lines: [1, 2] },
    { t: 'tool', cmd: 'node solo.js at "Fix the export crash" today 13:00 --until 14:30 --as agent --note "plan today"', file: '27-plan-today.txt', lines: [3, 4] },
    { t: 'tool', cmd: 'node solo.js at "Set up the waitlist form" today 16:00 --until 17:00 --as agent --note "plan today"', file: '27-plan-today.txt', lines: [5, 6] },
    { t: 'agent', text: 'On the Calendar and on Home. The press kit stays red until tomorrow morning on purpose.' }
  ] },
  '28-term-guard': { title: 'pocket-studio — zsh', cursor: false, lines: [
    { t: 'sh', cmd: 'git add data/runway.json', out: '' },
    { t: 'sh', cmd: 'git commit -m "my tasks"', file: '28-guard.txt' }
  ] }
};
