/* =========================================================================
   solo.config.js — the shipped defaults. This file is part of the app and
   identical for everyone, so DO NOT put your name or your own setup in it.
   Your values go next to your data: `node solo.js config set owner "Mara"`
   (any key below works: config set social.postTypes reel,carousel) writes
   them to data/settings.json, and the pages and the CLI read them over this
   file. The guard refuses to commit a personalised copy.
   Loaded by every page as a classic script AND required by the CLI, so it
   must stay plain JavaScript (no imports). Agents: never edit the values
   here for a user; use `config set`.
   ========================================================================= */
(function (root, factory) {
  var cfg = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = cfg;
  else root.MARATHON_CONFIG = cfg;
})(this, function () {
  return {
    /* ---- identity --------------------------------------------------- */
    name: 'Solo Ops',                 // the product / first project name: page titles, the eyebrow on Home
    eyebrow: 'Solo founder ops',      // small label above every page title
    owner: '',                        // leave empty here; `node solo.js config set owner "Mara"` makes Home say "Mara's workspaces"

    /* ---- workspaces --------------------------------------------------
       One workspace = one project: its own boards, posting schedule,
       scripts and notes, each in its own data/ file. The nav on every page
       shows only what the active workspace includes. Leave this empty to
       get a single workspace built from `apps` and `boards` below, or list
       several here. More can be created from Home or the CLI
       (`workspaces add`). The first workspace keeps the short file names. */
    workspaces: [],

    /* ---- which apps the default workspace uses ----------------------- */
    apps: { boards: true, social: true, scripts: true, writing: true },

    /* ---- projects (shared by boards and the social schedule) ---------
       hue: 0–360, drives the colored dot / chip for that project. */
    projects: [
      { name: 'general', hue: 45 },
      { name: 'launch', hue: 20 },
      { name: 'content', hue: 190 }
    ],

    /* ---- boards of the default workspace ------------------------------
       Each board is its own kanban (To Do / Doing / Done + Later + Bucket)
       with its own data file: data/<id>.json. Add as many as you like here,
       or create them from the board page ("+ Board") / CLI (boards add).
       milestones: labels under the progress bar. focus: cards under the
       header ([] hides them). */
    boards: [
      {
        id: 'runway',
        title: 'Launch Runway',
        sprintLabel: 'Sprint progress',
        milestones: ['Setup', 'Build', 'Launch', 'Follow-up'],
        focus: [
          { k: 'P1', t: 'Ship the launch', s: 'What has to be live this sprint' },
          { k: 'P2', t: 'Keep the content engine running', s: 'One post a day, one video a week' }
        ]
      }
    ],

    /* ---- shared board settings -------------------------------------- */
    board: {
      tags: ['coding', 'video', 'demo', 'outreach', 'launch', 'research', 'content', 'setup', 'daily'],
      // curated tag hues (anything else gets a hashed hue)
      tagHues: { coding: 205, video: 20, demo: 145, outreach: 38, launch: 0, research: 270, content: 320, setup: 95 }
    },

    /* ---- social schedule (social/) ---------------------------------- */
    social: {
      title: 'Social Schedule',
      network: 'X / Twitter',
      arcLabel: 'Posting arc',
      milestones: ['Announce', 'Teaser', 'Launch', 'Follow-up', 'Recap'],
      focus: [
        { k: '→', t: 'Anchor post sets the narrative', s: 'Everything after builds on it' }
      ],
      postTypes: ['announcement', 'launch', 'update', 'thread', 'teaser'],
      prepKinds: ['content', 'video', 'dev', 'design', 'outreach', 'other']
    },

    /* ---- studio (studio/) ------------------------------------------- */
    studio: {
      scriptTitle: 'Script Viewer',
      writingTitle: 'Writing Viewer',
      videoTitle: 'Video'
    },

    /* ---- video: cut a take by its words, on the local file (core/video.js)
       engine: '' asks on first use · whisper (local, free) · elevenlabs (the
       audio, not the video, is sent; key via `video key set`, never here).
       ffmpeg / whisper: paths when the tools are not on PATH (Windows zips).
       model: the whisper.cpp model (small.en recommended; base.en is lighter).
       captions: style sentence | bold; burn needs an ffmpeg with libass,
       otherwise captions ride along as a track and a .srt file. ---------- */
    video: { engine: '', ffmpeg: '', whisper: '', model: 'small.en', captions: { style: 'sentence', burn: false }, pause: 0.7, recordings: '' },   // pause: a silence longer than this (s) is shortened by "tidy up"; recordings: the folder new recordings are picked up from (default ~/Movies/Solo Ops takes)

    /* ---- activity --------------------------------------------------
       Every change (page or CLI) is logged per day in data/activity.json.
       Home shows a streak + heatmap and turns amber after this many idle
       hours; `node solo.js today` prints the same reminder. */
    activity: { reminderAfterHours: 24 },
    /* ---- attachments: images keep a small thumbnail inside the item; the
       original is written to data/attachments/ (or kept in the browser until
       the folder is connected). Other files are copied up to copyMaxMB; bigger
       ones are recorded by name and size and you paste a path or link. ---- */
    attachments: { thumbMaxPx: 640, thumbMaxKB: 200, copyMaxMB: 25 },

    /* ---- theme defaults (the Theme button overrides these per browser) --
       mode: 'auto' | 'light' | 'dark'
       palette: 'warm' | 'paper' | 'forest' | 'dusk' | 'mono' */
    theme: { mode: 'auto', palette: 'mono', font: 'inter' },   // palette: mono | warm | paper | forest | dusk   // font: inter | system | lato | editorial

    /* ---- sync --------------------------------------------------------
       Data files live in data/. `node serve.js` writes them directly;
       file:// mode links the folder once (Chromium) or uses Save / Load. */
    sync: { port: 4321, pollMs: 3000 }
  };
});
