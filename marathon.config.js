/* =========================================================================
   marathon.config.js — the one file to edit to make Marathon yours.
   Loaded by every page as a classic script AND required by the CLI, so it
   must stay plain JavaScript (no imports). Agents: edit values, keep shape.
   ========================================================================= */
(function (root, factory) {
  var cfg = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = cfg;
  else root.MARATHON_CONFIG = cfg;
})(this, function () {
  return {
    /* ---- identity --------------------------------------------------- */
    name: 'Marathon',                 // shown in page titles and the hub
    eyebrow: 'Solo founder ops',      // small label above every page title

    /* ---- projects (shared by the task board and the social schedule) --
       hue: 0–360, drives the colored dot / chip for that project. */
    projects: [
      { name: 'general', hue: 45 },
      { name: 'launch', hue: 20 },
      { name: 'content', hue: 190 }
    ],

    /* ---- task board (runway/) --------------------------------------- */
    runway: {
      title: 'Launch Runway',
      tags: ['coding', 'video', 'demo', 'outreach', 'launch', 'research', 'content', 'setup', 'daily'],
      // curated tag hues (anything else gets a hashed hue)
      tagHues: { coding: 205, video: 20, demo: 145, outreach: 38, launch: 0, research: 270, content: 320, setup: 95 },
      // milestones under the progress bar, left → right
      milestones: ['Setup', 'Build', 'Launch', 'Follow-up'],
      // focus cards under the header (use [] to hide the row)
      focus: [
        { k: 'P1', t: 'Ship the launch', s: 'What has to be live this sprint' },
        { k: 'P2', t: 'Keep the content engine running', s: 'One post a day, one video a week' }
      ],
      sprintLabel: 'Sprint progress'
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
      writingTitle: 'Writing Viewer'
    },

    /* ---- theme defaults (the Theme button overrides these per browser) --
       mode: 'auto' | 'light' | 'dark'
       palette: 'warm' | 'paper' | 'forest' | 'dusk' | 'mono' */
    theme: { mode: 'auto', palette: 'warm' },

    /* ---- sync --------------------------------------------------------
       Data files live in data/. `node serve.js` writes them directly;
       file:// mode links the folder once (Chromium) or uses Save / Load. */
    sync: { port: 4321, pollMs: 3000 }
  };
});
