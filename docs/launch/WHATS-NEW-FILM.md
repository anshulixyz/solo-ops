# The what's-new film: how the last one was made, how this one is

The script lives in the owner's Scripts ("What's new in Solo Ops: your AI
cuts the video"), on the board card *Launch film: what's new*. This note is
the production side: the pipeline, the shots, the assembly. Everything
shown is real or a verbatim reproduction, as in `SHOTLIST.md`.

## How the week film was made (October 13)

- **A scratch project, never the real one.** `seed.js` builds "Pocket
  Studio" (Mara, 24 tasks, 9 posts, 3 scripts, 3 drafts) in a copy served
  on its own port; `week.js` steps it through Monday to Friday; `week.sh`
  shoots a frame after each step.
- **Real frames, headless.** `shoot.js` opens each page through
  `mock/frame.html` (sets the browser state, runs click/type/wait actions)
  in headless Chrome at 1440×900 @2×. Chat and terminal frames are
  reproductions in `mock/`, their content captured by `capture.sh` from the
  real CLI.
- **No voice.** Twelve captions carry the film (serif line + mono kicker);
  a day chip per beat; 60 s main, 45 s teaser. The frames were assembled
  into the film in the owner's video studio (Recordly for footage,
  ElevenLabs Scribe for words, an agent with ffmpeg for the cut and the
  burned captions).

## How this film is made

The difference is the point of the film: the talking head is cut on the
Solo Ops Video page, by the owner and her AI, and that edit is recorded as
the demo. The studio's transcription and cutting tools are not needed for
it; only the final burn for X stays with ffmpeg.

1. **The talking head (beats 1 and 8).** Record both in one take with
   Recordly into `~/Movies/Solo Ops takes`; the Video page picks it up.
   Get the words (on this computer). Cut on the page: select, Delete,
   Remove fillers and pauses, Keep only this for the two beats. Render the
   final with captions. That final is the spine of the film.
2. **The self-edit (beats 2 to 5), over the shoulder.** Screen-record the
   editing of the talking-head take with Recordly as a second take: the
   drop, the words arriving, the click on a word, the struck sentence
   skipped, the Remove button, K, the Correct box, then the Guide's *Cut
   this take* with the reply pasted and the cut landing, Render a preview.
   Cut that second take on the Video page too (it has no words worth
   keeping: cut by sentence or `--keep` the stretches by time).
3. **The board and the views (beat 6).** Extend `seed.js` with one video
   task that already has its four pieces (a draft, a script, a take with
   words and a cut, a scheduled post) and shoot with `shoot.js`:
   `wk-card-pieces` (the card expanded: four pills, the next step),
   `wk-script-task-line` (the Script Viewer toolbar with *Task: …*),
   `wk-connect-panel` (the panel open: board, search, new task). Add the
   three shots to `shoot.js` under the week block; the actions are
   `expand("Record the 60-second demo")` and
   `js:taskConnect('script', library.activeId)`.
4. **Sharing (beat 7).** Two scratch copies with their own identities and
   `node relay.js` on 127.0.0.1:4400 (the share MVP's flow script), shot
   as three frames: both boards, *From others* on Home, the card moving on
   the left. The chip reads "shipping now" once the share work is on main;
   until then "coming next".
5. **The end card (beat 9).** Type on the mono palette, as in the week
   film: the lockup, one action, the repo, MIT.
6. **Assembly.** One ffmpeg concat of: the talking-head final (beats 1,
   8), the self-edit final (beats 2 to 5, with the spoken lines as
   captions from the first take's `.srt`), the three still beats held for
   their seconds, the end card. 1080p 16:9, under 75 s, captions burned
   for X with the studio's ffmpeg (the Solo Ops final carries them as a
   track and a `.srt`; the owner's ffmpeg has no subtitle filter, the
   studio's does).

## Truth checks

- The take on screen is the owner's own, not Pocket Studio's; the board
  and the views are the scratch seed. Never the real workspace on screen.
- "You do not need Descript" is said over the page that just did the cut.
- The share beat is the only "coming" claim; it is labelled.
- No "CLI", "EDL", "transcript.json" or "ffmpeg" in a caption.

## Timing

| Beat | s | Source |
|---|---|---|
| 1 | 6 | talking head, final from the Video page |
| 2–5 | 26 | the self-edit take, cut on the Video page |
| 6 | 6 | three still frames from shoot.js |
| 7 | 9 | three still frames, share scratch copies |
| 8 | 7 | talking head |
| 9 | 5 | end card |
| total | 59 | one minute; the 45 s teaser drops beats 4 and 7 |
