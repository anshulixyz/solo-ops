# Try it: one story from a draft to a post

Ten minutes. Use a take that already has its words, or allow a minute for
*On this computer*. The story line is on main since PR #1; the player's
Play button, the captions and the trim are on PR #2.

## Where to look

Open http://localhost:4322/studio/video.html (the branch copy running next
to your own server). After PR #2 is merged, your own http://localhost:4321
shows the same once `node serve.js` is restarted. On every page the story
sits in the same place:

| Page | Where the line is |
|------|-------------------|
| Writing Viewer | above the preview, under the toolbar |
| Script Viewer | at the top of the preview |
| Video | under the take's title |
| Social Schedule | under the date and type of the open post, above the copy |

When nothing is connected yet you see only the next step and a quiet
link: on a draft **Start the script · Make the post · Connect to a script
or post…**; on a script **Add the take · Make the post · Connect…**; on a
take **Connect to a script or post…**; on a post **Connect to a draft,
script or take…**. Once two things are connected the line appears:
`Draft: … → Script: … → Take: … → Post: …`, each piece a link.

## The flow, in order

1. **Writing Viewer.** Click **+**, write three lines with a `# Title`.
   Press **Start the script**. You should see: the Script Viewer opens on a
   new script with your title and your clean text under `## Script`, and the
   line reads `Draft: Title → Script: Title`. Click **Draft: Title** to jump
   back.
2. **Script Viewer.** Press **Add the take**. Video opens with the
   recording box and says *For Script: Title*. Drop any short video onto
   the page (or paste its path). You should see: the toast "Added: …" and
   the new take with the line `Draft → Script → Take`.
3. **Video.** Get the words (ElevenLabs is option 1; *On this computer* is
   option 2). Press **▶ Play** or click the picture: the take plays with
   captions. Select a sentence, press **Keep only this** (K): the rest goes,
   the toast says what is kept, **Undo** brings it back. Press **Render a
   preview** under the title; when it is done it plays in the same player
   with its own captions. You should see: the toast "Done: the preview is
   playing above". Then **Render the final** and, once it is done, **Make
   the post** under the title.
4. **The post.** A toast says the draft post is on the schedule. The line
   under the title gains `Post: Title`; click it (or **Open the schedule**)
   to see it there, dated tomorrow 09:00, the final linked. The line reads
   `Draft → Script → Take → Post`. Change the date or the copy as you like.
5. **Connect something that already exists.** On any piece press
   **Connect to …**, pick from the list (same titles show their date;
   "already with …" warns you it will move), press **Connect**. Hover a
   piece: **×** disconnects it; nothing is deleted.
6. **Ask your agent.** In Claude Code: `node solo.js story <id>` prints the
   chain; `node solo.js link <a> <b>` connects two things; the Guide's
   Ask box on any of the four pages carries the same line in `{{this}}`.

## What to expect

- Every change is in `node solo.js log` and `revert <id>` undoes it.
- A piece you delete shows as *missing* on the others until you press ×.
- The player folds with **Hide the video** for this session only; captions
  and Bigger are remembered.
