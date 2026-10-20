# Try it: one task, from draft to post

Ten minutes. Use a take that already has its words, or allow a minute for
*On this computer*. Open http://localhost:4322 (the branch copy running
next to your own server); after the merge your own http://localhost:4321
shows the same once `node serve.js` is restarted.

## The idea

The board card is the unit. A task tagged `writing`, `script` or `video`
carries its pieces: four pills, **Draft · Script · Take · Post**, filled
when the piece exists, and one button for the next step. Every other task
looks as it always did.

## The flow

1. **Board.** Add a task "Record the onboarding video" with the tag
   `video`. You should see: four empty pills under the title and the
   button **Start the script**. Press it. The Script Viewer opens on a new
   script titled like the task, and its toolbar reads **Task: Record the
   onboarding video** with a filled **Script** pill.
2. **Script Viewer.** Write the beats. Open the board again: the card's
   button now reads **Add the take**. Press it. Video opens with the
   recording box and *For Task: Record the onboarding video*. Drop any
   short video in. You should see: the take with **Task: …** under its
   title and the **Take** pill filled on the card.
3. **Video.** Get the words, press the round play button on the picture
   (or Space), select a sentence and press **K** to keep only that, render
   a preview, then the final. When the final is done the card's button
   reads **Make the post**; the Video page's own button under the title
   does the same. Press one. The post appears on the schedule with
   **Task: …** above the copy, and the card shows all four pills.
4. **Suggestions.** Add another task tagged `writing`. Open the Writing
   Viewer: the list starts with *From your board* and that task, with
   **Write the draft**. Press it: a draft titled like the task opens,
   already attached.
5. **Connect something that exists.** On any draft, script or take, press
   **Connect with a task…** in the toolbar: pick a board, find the task, or
   type a title and **Create** a new one on that board with the item
   attached (Video too).
   On a card, **attach** (next to notes) does the reverse. **×** next to
   the task name detaches; nothing is deleted.
6. **Ask your agent.** `node solo.js story <task>` prints the task and its
   pieces; `node solo.js link <task> <piece>` connects; `scripts add --task
   <task>` makes a script for it. The Guide's Ask box on the three views
   carries "Task: …" in `{{this}}`.
