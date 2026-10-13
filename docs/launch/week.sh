#!/bin/sh
# docs/launch/week.sh <week copy> [out dir] — runs the launch video's week on a scratch copy and shoots each beat.
# The copy must be served on $WEEK (default http://localhost:4413); shoot.js takes the frames between the steps.
set -e
COPY="$1"; [ -d "$COPY" ] || { echo "usage: week.sh <week copy> [out dir]"; exit 1; }
OUT="${2:-$(dirname "$0")/../screenshots/launch}"; HERE="$(cd "$(dirname "$0")" && pwd)"
step() { node "$HERE/week.js" "$COPY" "$1"; sleep 1; }
shot() { node "$HERE/shoot.js" --only "$1" --out "$OUT"; }
step reset
shot 06-term-setup; shot 18-chat-mail-connector
step mon-a; shot wk-mon-a
step mon-b; shot wk-mon-b
step mon-c; shot wk-mon-c
step mon-d; shot wk-mon-board
step tue-standup; shot wk-tue-board
step tue-cal; shot wk-tue-calendar
shot wk-wed-reply
step wed-mail; shot wk-wed-board
step thu; shot wk-thu-scripts; shot wk-thu-prompter; shot wk-thu-social
shot wk-fri-home-typing; shot wk-fri-share
step agent; shot wk-agent-recent
echo "✓ the week is shot into $OUT"
