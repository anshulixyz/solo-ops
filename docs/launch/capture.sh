#!/bin/sh
# docs/launch/capture.sh <seeded copy> — captures the real command output the terminal frames show.
# Runs the agent's commands on a throwaway COPY of the seeded project (so the shots of the pages stay untouched),
# and the first-run commands on an empty copy. Output lands in docs/launch/conversations/*.txt next to terms.js.
set -e
SEED="$1"; [ -d "$SEED/data" ] || { echo "usage: capture.sh <seeded copy>"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"; OUT="$HERE/conversations"; TMP="$(dirname "$SEED")"
# from the seed as it is: the brief and the agenda
( cd "$SEED" && node solo.js today > "$OUT/24-today.txt" && node solo.js calendar --days 7 > "$OUT/26-calendar.txt" )
# the agent's writes, on a copy
rm -rf "$TMP/term-copy"; cp -R "$SEED" "$TMP/term-copy"; cd "$TMP/term-copy"
run() { echo "\$ node solo.js $*"; eval node solo.js "$@"; }
{ run done '"Landing page copy"' --as agent --note '"standup: finished last night"'
  run start '"Write the launch post"' --as agent --note '"standup: today is about this"'
  run note '"Write the launch post"' '"Lead with the Sunday line from the first post"' --as agent --note standup
  run add '"Reply to Priya before the intro"' --pri high --due 2026-10-14 --as agent --note '"standup: blocker"'; } > "$OUT/20-standup-cmds.txt" 2>&1
{ echo '$ node ~/Documents/pocket-studio/solo.js done "Onboarding email" --as agent --note "shipped, said so in the website chat"'; node solo.js done "Onboarding email" --as agent --note "shipped, said so in the website chat"
  echo '$ node ~/Documents/pocket-studio/solo.js add "Watch the first 20 replies to the onboarding email" --pri medium --tags email --due 2026-10-16 --as agent --note "follow-up"'; node solo.js add "Watch the first 20 replies to the onboarding email" --pri medium --tags email --due 2026-10-16 --as agent --note "follow-up"; } > "$OUT/23-done-elsewhere.txt" 2>&1
{ run at '"Write the launch post"' today 10:00 --until 11:30 --as agent --note '"plan today"'
  run at '"Fix the export crash"' today 13:00 --until 14:30 --as agent --note '"plan today"'
  run at '"Set up the waitlist form"' today 16:00 --until 17:00 --as agent --note '"plan today"'; } > "$OUT/27-plan-today.txt" 2>&1
{ run add '"Investor intro (Priya)"' --at 2026-10-15T14:00 --until 14:45 --tags meeting --ext gcal:7f3a23 --as agent --note '"from Google Calendar"'
  run add '"Design review: onboarding screens"' --at 2026-10-16T11:30 --until 12:15 --tags meeting,design --ext gcal:7f3a24 --as agent --note '"from Google Calendar"'
  run add '"Dentist"' --at 2026-10-19 --tags meeting --ext gcal:7f3a30 --as agent --note '"from Google Calendar"'
  run add '"Weekly check-in with Sam"' --at 2026-10-21T10:00 --until 10:30 --tags meeting --ext gcal:7f3a31 --as agent --note '"from Google Calendar"'; } > "$OUT/25-fill-calendar.txt" 2>&1
{ echo '$ node solo.js boards add "Launch runway" --from blank'; node solo.js boards add "Launch runway" --from blank
  run add '"Name and one-line pitch"' --board launch-runway --proj launch --pri high --steps '"Ten names|Say each out loud|Pick one, domain check"' --as agent --note plan-project
  run add '"Landing page with a waitlist"' --board launch-runway --proj launch --pri high --steps '"One sentence|One button|Email capture"' --as agent --note plan-project
  run add '"Record the 60-second demo"' --board launch-runway --proj launch --pri high --tags video --steps '"Script the three beats|Record|Pick the take"' --as agent --note plan-project
  run add '"Beta to 10 people"' --board launch-runway --proj launch --pri medium --steps '"List 10|DM each|Collect one line of feedback"' --as agent --note plan-project
  run social add '"Why I am building this"' --at 2026-10-20T09:00 --type story --as agent --note plan-project
  run social add '"The ugly first version"' --at 2026-10-23T17:00 --type update --as agent --note plan-project; } > "$OUT/21-plan-project.txt" 2>&1
# first run and the guard, on an empty copy
rm -rf "$TMP/empty-copy"; mkdir -p "$TMP/empty-copy/data"; rsync -a --exclude .git --exclude data --exclude node_modules --exclude '.claude/commands/mine' --exclude '.cursor/commands/mine' "$HERE/../../" "$TMP/empty-copy/"; cp "$HERE/../../data/SCHEMA.md" "$TMP/empty-copy/data/"
cd "$TMP/empty-copy" && node solo.js doctor > "$OUT/05-doctor-fresh.txt" 2>&1 || true
node solo.js template all > "$OUT/06-template.txt"
rm -rf data/*.json; git init -q . && git add -A >/dev/null 2>&1
echo '{"version":1,"updatedAt":"2026-10-13T09:00:00.000Z","tasks":[{"id":"t1","title":"Call the bank about the loan","col":"todo","pri":"high","tags":[],"checklist":[]}]}' > data/runway.json
git add -f data/runway.json; node solo.js guard > "$OUT/28-guard.txt" 2>&1 || true
echo "✓ captured into $OUT"
