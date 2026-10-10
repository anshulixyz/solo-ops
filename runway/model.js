/* =========================================================================
   model.js — data model & state
   Owns the task list, the seed, migration/normalization, and every mutation.
   No DOM here. Exposes a single global `Model`.

   Task shape:
     { id, title, desc, proj, col, pri, tags:[], notes:'', collapsed:bool,
       checklist:[{text, done}] }
   ========================================================================= */
(function (global) {
  'use strict';

  var KEY = 'anshuli.runway.v2';  // v2: video+launch sprint seed
  var PROJ_KEY = 'anshuli.runway.projects.v1';
  var PRI_RANK = { high: 0, medium: 1, low: 2 };
  var COLS = ['todo', 'doing', 'done', 'later', 'bucket'];
  var DEFAULT_PROJECTS = ['openDM', 'nextmillion', 'general'];
  var KNOWN_TAGS = ['coding', 'video', 'demo', 'outreach', 'launch', 'research', 'content', 'setup', 'f1', 'f2', 'f3', 'f4', 'daily'];

  /* ---- projects (user-extendable) ------------------------------------ */
  function loadCustomProjects() {
    var raw = Store.get(PROJ_KEY);
    if (raw) {
      try {
        var a = JSON.parse(raw);
        if (Array.isArray(a)) return a.filter(function (x) { return typeof x === 'string' && x.trim(); });
      } catch (e) { /* ignore */ }
    }
    return [];
  }
  var customProjects = loadCustomProjects();

  // defaults + user-added + any project seen on a task, deduped (first wins)
  function getProjects() {
    var seen = {}, out = [];
    DEFAULT_PROJECTS.concat(customProjects).forEach(function (p) {
      if (p && !seen[p]) { seen[p] = 1; out.push(p); }
    });
    state.forEach(function (t) {
      if (t.proj && !seen[t.proj]) { seen[t.proj] = 1; out.push(t.proj); }
    });
    return out;
  }
  // add a project; returns its canonical name (existing match or the new one)
  function addProject(name) {
    var v = (name || '').trim();
    if (!v) return null;
    var match = getProjects().filter(function (p) { return p.toLowerCase() === v.toLowerCase(); })[0];
    if (match) return match;
    customProjects.push(v);
    Store.set(PROJ_KEY, JSON.stringify(customProjects));
    return v;
  }

  /* ---- seed: the video + launch sprint board -------------------------- */
  // Tracks live as tags; video format tags: f1 face+screen, f2 launch film,
  // f3 raw screen demo, f4 programmatic Remotion piece.
  function seed() {
    var id = 0;
    var n = function () { return 't' + (++id); };
    var cl = function (arr) {
      return arr.map(function (x) {
        return Array.isArray(x) ? { text: x[0], done: !!x[1] } : { text: x, done: false };
      });
    };
    return [
      /* ---- T0 · setup (before building anything) ---- */
      { id: n(), title: "Recording stack — install + test the full chain", proj: "general", col: "doing", pri: "high", tags: ["setup", "video"], desc: "Recordly → video-use (Claude Code) → ffmpeg skill → Remotion. One 60s throwaway through the whole chain; after that every video is just recording.", notes: "", collapsed: true, checklist: cl([["Pick the stack — Recordly + video-use + ffmpeg-skill + Remotion", true], "Install Recordly (webcam bubble on for F1)", "Install video-use — paste its install prompt into Claude Code", "Add ElevenLabs API key (Scribe transcription)", "Install claude-ffmpeg-skill", "npx skills add remotion-dev/skills", "Test: 60s F1 recording → edit → final.mp4"]) },
      { id: n(), title: "openDM copy + tone lock — website, marketing, videos", proj: "openDM", col: "todo", pri: "high", tags: ["content", "research"], desc: "One tone doc from all the research so far, so every video, page and post sounds like the same product.", notes: "", collapsed: true, checklist: cl(["Collate all openDM research + narrative notes into one doc", "Lock the voice: vocabulary, sentence rhythm, what we never say", "Website hero + subcopy in that tone", "Video-script style guide: hook patterns, phrasing, CTA lines", "Tone pass over the 4-5 launch video scripts"]) },
      { id: n(), title: "Burner sending domains — optional cold-volume infra", proj: "general", col: "todo", pri: "low", tags: ["setup", "outreach"], desc: "Optional — subscribers-first made this non-blocking. Only if we later add cold volume; never opendm.live or personal gmail.", notes: "", collapsed: true, checklist: cl(["Buy 2-3 cheap domains", "SPF / DKIM / DMARC on each", "Connect to the sending tool", "Start warming (low volume first)"]) },
      { id: n(), title: "Set up opendm.live email + warmup", proj: "openDM", col: "doing", pri: "medium", tags: ["setup", "outreach"], desc: "Clean identity for the openDM beta list — warm it slowly, keep it off blast duty.", notes: "", collapsed: true, checklist: cl([["Create opendm.live mailbox", true], "SPF / DKIM / DMARC on the domain", "Start warmup drips (weeks of low volume)", "Draft openDM intro email", "Integrations required for openDM v0 live"]) },
      { id: n(), title: "openDM beta / waitlist page (hidden until reveal)", proj: "openDM", col: "todo", pri: "high", tags: ["setup", "coding"], desc: "Signup + test-drive page, unlisted until the surprise drop.", notes: "", collapsed: true, checklist: cl(["One-shot the page with Claude (tone doc applied)", "Signup form wired to a list", "Host on Vercel/Pages free tier", "Keep unlisted; link goes live with the hero video"]) },
      { id: n(), title: "nextmillionai — analytics + UTM setup", proj: "nextmillion", col: "todo", pri: "high", tags: ["setup"], desc: "", notes: "", collapsed: true, checklist: cl(["Add Google Analytics", "Add event tracking", "UTM links for every video / post / email"]) },
      { id: n(), title: "PH + HN account prep", proj: "nextmillion", col: "todo", pri: "medium", tags: ["setup", "launch"], desc: "", notes: "", collapsed: true, checklist: cl(["Product Hunt maker account + draft listing", "HN account sanity check", "Schedule: HN first, PH staggered 1-2 days later"]) },
      { id: n(), title: "Contacts collate — one sheet, segmented", proj: "general", col: "todo", pri: "high", tags: ["setup", "outreach"], desc: "", notes: "", collapsed: true, checklist: cl(["LinkedIn data export (Settings → Data privacy)", "Google Contacts export", "Claude + Gmail sweep of past threads for addresses", "Segment: devs / founders / hiring folks / friendlies"]) },

      /* ---- T1 · nextmillionai launch (next week) ---- */
      { id: n(), title: "HN + Product Hunt launch — nextmillionai", proj: "nextmillion", col: "todo", pri: "high", tags: ["launch"], desc: "A2A hiring demo anchors it. Two spikes: HN, then PH.", notes: "", collapsed: true, checklist: cl(["Lock the launch date", "Draft the Show HN post (first-person, technical, honest)", "PH gallery: 6-8 images", "PH video: under 2 min (from the F2 cut)", "First-comment + FAQ drafts", "Reach out to people to review Show HN, tool and PH", "Warm up connects to help before launch - all subscribers too", "Launch day: live in comments all day", "Optional: one manual build-story post (r/ClaudeAI or r/SideProject) — real numbers, launch day"]) },
      { id: n(), title: "F1 — \"What I'm building with nmai\"", proj: "nextmillion", col: "todo", pri: "high", tags: ["video", "f1"], desc: "The intent demo sent to Prasanna, re-recorded — including the \"I think I've seen AGI\" beat.", notes: "", collapsed: true, checklist: cl(["Script it (hook in first 2s)", "Record face + screen (Recordly bubble)", "video-use edit pass + captions", "Post with UTM"]) },
      { id: n(), title: "F2 hero — nmai launch film", proj: "nextmillion", col: "todo", pri: "high", tags: ["video", "f2", "launch"], desc: "Recut from F1 + F3 footage. The PH/HN-facing cut.", notes: "", collapsed: true, checklist: cl(["Assemble from existing footage", "Remotion overlays + music + captions", "Cut to under 2 min", "Export PH + X versions"]) },
      { id: n(), title: "F3 — Claude ↔ Cursor: hiring manager / developer", proj: "openDM", col: "doing", pri: "high", tags: ["demo", "video", "f3"], desc: "The intent python project, live.", notes: "", collapsed: true, checklist: cl(["Research/prep: clean the python env + script", "Build/fix the Claude↔Cursor bridge", "Dry-run the handshake", "Record the live demo"]) },
      { id: n(), title: "F3 — Hiring example (HTML) walkthrough", proj: "nextmillion", col: "doing", pri: "high", tags: ["coding", "video", "f3"], desc: "Build is done — recording task.", notes: "", collapsed: true, checklist: cl([["Build the HTML example", true], "Update the HTML with more realistic examples", "Record the walkthrough", "video-use edit + post"]) },
      { id: n(), title: "F1+F3 — Loops video (4 problems / 4 non-problems)", proj: "nextmillion", col: "doing", pri: "medium", tags: ["video", "f1", "f3"], desc: "How I made my project work in loops — who decides, how work divides, benchmarks vs before.", notes: "", collapsed: true, checklist: cl([["Pick up loops implementation", true], ["Get it running", true], "Outline: 4 problems people expect / 4 that don't appear", "Record F1 intro + F3 body", "Benchmarks section", "Edit + post"]) },
      { id: n(), title: "F3 — \"1-shot nmai website\" example", proj: "nextmillion", col: "doing", pri: "high", tags: ["content", "video", "f3"], desc: "Example of the one-shot build.", notes: "", collapsed: true, checklist: cl([["Capture the 1-shot build", true], "Write script and record video"]) },
      { id: n(), title: "Original website launch and more views", proj: "nextmillion", col: "todo", pri: "high", tags: ["coding", "video"], desc: "", notes: "", collapsed: true, checklist: cl(["Website overall edit with new understanding for nextmillionai", "Compare to pages with weave, pixel", "Include video demo on the website (profile building + A2A hiring)", "All backlinking work etc"]) },
      { id: n(), title: "F3 — Claude chat with Cursor/Cline, no API", proj: "general", col: "todo", pri: "medium", tags: ["video", "f3"], desc: "Use your highest-model Claude chat with Cursor or VS Code Cline.", notes: "", collapsed: true, checklist: cl(["Prep the setup", "Record", "Edit + post"]) },

      /* ---- T2 · openDM (surprise reveal ~1 week after) ---- */
      { id: n(), title: "openDM — top 5 demos to show", proj: "openDM", col: "doing", pri: "high", tags: ["demo", "video", "f3"], desc: "Including agents working for users.", notes: "", collapsed: true, checklist: cl([["Pick the 5 demos", true], ["Build / prep each demo flow", true], "Dry-run each end to end", "Record clean takes"]) },
      { id: n(), title: "openDM finalization — lock spec + flows", proj: "openDM", col: "doing", pri: "high", tags: ["coding"], desc: "", notes: "", collapsed: true, checklist: cl([["Review the doc set for gaps", true], ["Lock v0 architecture decisions", true], "Finalize the 5-layer gateway flow"]) },
      { id: n(), title: "Research agents integrations for openDM", proj: "openDM", col: "doing", pri: "high", tags: ["research", "coding", "setup"], desc: "", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "F2 hero — \"50 DMs, no one responded\"", proj: "openDM", col: "todo", pri: "high", tags: ["video", "f2", "launch"], desc: "The surprise-reveal film. Fold in signal-to-noise.", notes: "", collapsed: true, checklist: cl(["Script in the locked tone", "Storyboard", "VO + Remotion overlays", "Cut to under 90s", "Beta page link ready in the post"]) },
      { id: n(), title: "openDM launch cut set — edit the 5 demos", proj: "openDM", col: "todo", pri: "medium", tags: ["video", "f3"], desc: "video-use pass per demo: teammate context-share, interface choice (slack vs whatsapp views), signals/intents, agents + video calling.", notes: "", collapsed: true, checklist: cl(["Edit demo 1 — teammate context-share", "Edit demo 2 — interface choice", "Edit demo 3 — signals/intents (a job post is an intent)", "Edit demo 4 — agents + video calling", "Captions + 60-90s X cuts for each"]) },
      { id: n(), title: "F4 — Notifications screen, reimagined", proj: "openDM", col: "todo", pri: "medium", tags: ["video", "f4", "content"], desc: "A phone with no notifications — 10 min, 30 min, 2 hrs, 3 hrs. Pure Remotion concept piece.", notes: "", collapsed: true, checklist: cl(["Storyboard the timeline", "Claude Code + Remotion build", "Render + post"]) },
      { id: n(), title: "F1 — \"Everything online is AI-written\"", proj: "openDM", col: "todo", pri: "medium", tags: ["video", "f1", "content"], desc: "Why are you reading it yourself? Pre-reveal narrative, no product shown.", notes: "", collapsed: true, checklist: cl(["Script", "Record face + screen", "Edit + post"]) },
      { id: n(), title: "F1 — \"Last time you were on your phone, WhatsApp was born\"", proj: "openDM", col: "todo", pri: "medium", tags: ["video", "f1", "content"], desc: "When you are always on your LLM, why go somewhere else to communicate.", notes: "", collapsed: true, checklist: cl(["Script", "Record face + screen", "Edit + post"]) },
      { id: n(), title: "Intent Pad — log app data, suggest actions/agents", proj: "openDM", col: "todo", pri: "medium", tags: ["coding"], desc: "Only if it unblocks a demo — parked below launch work this sprint.", notes: "", collapsed: true, checklist: cl(["Research: scope what app data to log", "Build: logging of apps data + details", "Build: suggest actions / AI agents per workflow", "Connect: agentic browser integration", "Connect: agent marketplace (saved Solana products)"]) },

      /* ---- T3 · X engine + T4 · outreach (daily) ---- */
      { id: n(), title: "X engine — daily cadence", proj: "general", col: "doing", pri: "high", tags: ["outreach", "content", "daily"], desc: "This is where the 10k-direct actually comes from.", notes: "", collapsed: true, checklist: cl(["Typefully set up", "10-20 native replies/day on big AI accounts (Neil-post pattern)", "1 build-in-public post/day", "1 video every 1-2 days", "15-20 engaged-first DMs/day on X (reply first, DM the relevant)", "10-15 LinkedIn touches/day — hiring managers live there; engage, then connect with a note", "Mirror to LinkedIn, native uploads"]) },
      { id: n(), title: "5-part series — reverse hiring / A2A coordination", proj: "nextmillion", col: "todo", pri: "high", tags: ["content"], desc: "What agent-to-agent coordination is.", notes: "", collapsed: true, checklist: cl(["Outline all 5 parts", "Script part 1", "Plan visuals / demo per part"]) },
      { id: n(), title: "Email engine — subscribers first", proj: "general", col: "todo", pri: "high", tags: ["outreach"], desc: "Warmest list first: previous subscribers + past users. Three sends across the sprint.", notes: "", collapsed: true, checklist: cl(["Claude drafts per-segment from the contacts sheet", "Send 1: nmai intro w/ video (personal gmail)", "Send 2: launch morning — we're live on HN/PH", "Send 3: openDM beta invite (from opendm.live)", "Track replies back into the sheet"]) },
      { id: n(), title: "Launch crew — 20-30 friendlies", proj: "general", col: "todo", pri: "high", tags: ["outreach", "launch"], desc: "The launch multiplier: people committed to engage in the first hour, organically.", notes: "", collapsed: true, checklist: cl(["List 20-30 friendlies: subscribers, past collaborators, X mutuals", "Personal note to each this week — what's coming + one specific ask", "Launch-day ping list ready (no vote-begging on HN — just 'we're live')"]) },
      { id: n(), title: "AI newsletter features — pitch 10", proj: "general", col: "todo", pri: "medium", tags: ["outreach", "content"], desc: "One feature = 10k-100k+ exactly-right readers. Durable links, zero platform risk.", notes: "", collapsed: true, checklist: cl(["Shortlist ~10 AI newsletters (2-3 big, rest niche builder ones)", "Claude drafts a per-newsletter pitch w/ the A2A demo GIF", "Send during launch week", "Offer an exclusive angle to 1-2 big ones"]) },
      { id: n(), title: "Send nextmillionai intro email (video attached)", proj: "nextmillion", col: "todo", pri: "medium", tags: ["outreach", "video"], desc: "Introduce what I'm doing.", notes: "", collapsed: true, checklist: cl(["Attach the nextmillionai video", "Write intro: what I'm building", "Send to the list"]) },

      /* ---- support / misc ---- */
      { id: n(), title: "Find best recording + demo video tools", proj: "general", col: "done", pri: "high", tags: ["research", "video"], desc: "Locked: Recordly + video-use + claude-ffmpeg-skill + Remotion.", notes: "", collapsed: true, checklist: cl([["Review saved tools", true], ["Pick a recorder + a demo tool", true]]) },
      { id: n(), title: "nextmillionai dev taskers — prioritize + execute", proj: "nextmillion", col: "todo", pri: "medium", tags: ["coding"], desc: "From rough note drafts + the post-launch md.", notes: "", collapsed: true, checklist: cl(["Pull rough drafts from notes", "Review post-launch md", "Prioritize + sequence the dev tasks"]) },
      { id: n(), title: "Test Cline + GLP & other OSS models", proj: "general", col: "todo", pri: "low", tags: ["research"], desc: "", notes: "", collapsed: true, checklist: cl(["Test Cline", "Try GLP + other OSS models", "Note which to use for demos"]) },
      { id: n(), title: "F3 — Claim repo video", proj: "general", col: "todo", pri: "low", tags: ["video", "f3"], desc: "4 things you need to build an agent · designed in a couple of hours · use cases.", notes: "", collapsed: true, checklist: cl(["Outline the 4-things structure", "Prep the claim-repo walkthrough", "Write script and record video"]) },
      { id: n(), title: "Daughter's teddy that talks to her", proj: "general", col: "todo", pri: "high", tags: ["content"], desc: "Home AI — also a content piece.", notes: "", collapsed: true, checklist: cl(["Order stuff to make it", "Assemble", "Code + make live", "Record videos"]) },

      /* ---- later ---- */
      { id: n(), title: "Futuristic AI features + YouTube plan", proj: "general", col: "later", pri: "medium", tags: ["content", "f4"], desc: "", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "Kloned & Nokk videos", proj: "general", col: "later", pri: "low", tags: ["content", "video"], desc: "", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "\"Everything carries its own context\"", proj: "general", col: "later", pri: "low", tags: ["content"], desc: "Concept piece.", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "\"No file types — everything is an AI\"", proj: "general", col: "later", pri: "low", tags: ["content"], desc: "Concept piece.", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "Scrollable AI-generated study reels", proj: "general", col: "later", pri: "low", tags: ["content"], desc: "Reels on topics you want to study.", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "User behaviour in a post-AI world", proj: "general", col: "later", pri: "low", tags: ["content"], desc: "Refer the Indian story I built.", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "Make home systems talk with AI", proj: "general", col: "later", pri: "low", tags: ["content"], desc: "Ambient home AI.", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "Async clicky", proj: "general", col: "later", pri: "low", tags: ["content", "video"], desc: "Don't like heyclicky being synchronous.", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "Hub of my agents talking to each other", proj: "general", col: "later", pri: "medium", tags: ["video", "f3", "demo"], desc: "", notes: "", collapsed: true, checklist: [] },
      { id: n(), title: "\"Build an agent under 5 prompts\"", proj: "general", col: "later", pri: "low", tags: ["video", "f3", "content"], desc: "", notes: "", collapsed: true, checklist: [] }
    ];
  }

  /* ---- migration / normalization ------------------------------------- */
  // Derive tags from legacy `type`, and auto-add a 'video' tag to anything
  // that is clearly about recording/video. Runs ONCE per task: as soon as a
  // task carries a `tags` array we treat it as user-managed and leave it alone.
  function deriveTags(t) {
    if (Array.isArray(t.tags)) return t.tags.slice();
    var tags = t.type ? [String(t.type)] : [];
    var hay = (String(t.title || '') + ' ' +
      (Array.isArray(t.checklist) ? t.checklist.map(function (c) {
        return c && c.text ? c.text : '';
      }).join(' ') : '')).toLowerCase();
    if (/\bvideo|record/.test(hay) && tags.indexOf('video') === -1) tags.push('video');
    return tags;
  }

  function normalize(arr) {
    return arr.map(function (t) {
      var o = {
        id: t.id || ('t' + Math.abs(hash(JSON.stringify(t)))),
        title: t.title || '',
        desc: t.desc || '',
        proj: t.proj || 'general',
        col: COLS.indexOf(t.col) !== -1 ? t.col : 'todo',
        pri: PRI_RANK.hasOwnProperty(t.pri) ? t.pri : (t.p1 ? 'high' : 'medium'),
        tags: deriveTags(t),
        notes: typeof t.notes === 'string' ? t.notes : '',
        collapsed: t.collapsed !== undefined ? !!t.collapsed : true,
        checklist: Array.isArray(t.checklist) ? t.checklist.map(function (c) {
          return { text: (c && c.text) || '', done: !!(c && c.done) };
        }) : []
      };
      return o;
    });
  }

  // tiny deterministic fallback id (avoids Date.now collisions on import)
  function hash(s) {
    var h = 0, i;
    for (i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return h;
  }

  /* ---- state + persistence ------------------------------------------- */
  var state = load();

  function load() {
    var raw = Store.get(KEY);
    if (raw) {
      try {
        var d = JSON.parse(raw);
        if (Array.isArray(d) && d.length) return normalize(d);
      } catch (e) { /* fall through to seed */ }
    }
    var s = normalize(seed());
    persist(s);
    return s;
  }
  function persist(s) { Store.set(KEY, JSON.stringify(s || state)); }
  function save() { persist(state); }
  function byId(id) { return state.find(function (x) { return x.id === id; }); }

  /* ---- mutations ----------------------------------------------------- */
  function add(t) { state.unshift(t); save(); }
  function del(id) { state = state.filter(function (t) { return t.id !== id; }); save(); }
  function setPri(id, val) {
    var t = byId(id); if (!t) return;
    t.pri = PRI_RANK.hasOwnProperty(val) ? val : 'medium'; save();
  }
  function move(id, dir) {
    var order = ['todo', 'doing', 'done'];
    var t = byId(id); if (!t) return;
    var ni = order.indexOf(t.col) + dir;
    if (ni < 0 || ni >= order.length) return;
    t.col = order[ni]; save();
  }
  function moveTo(id, col) {
    var t = byId(id);
    if (t && COLS.indexOf(col) !== -1) { t.col = col; save(); }
  }
  function toggleStep(id, idx) {
    var t = byId(id); if (!t || !t.checklist[idx]) return;
    t.checklist[idx].done = !t.checklist[idx].done; save();
  }
  function addStep(id, text) {
    var v = (text || '').trim(); if (!v) return;
    var t = byId(id); if (!t) return;
    t.checklist.push({ text: v, done: false }); save();
  }
  function delStep(id, idx) {
    var t = byId(id); if (!t) return;
    t.checklist.splice(idx, 1); save();
  }
  function addTag(id, tag) {
    var v = (tag || '').trim().toLowerCase(); if (!v) return;
    var t = byId(id); if (!t) return;
    if (t.tags.indexOf(v) === -1) t.tags.push(v); save();
  }
  function removeTag(id, tag) {
    var t = byId(id); if (!t) return;
    t.tags = t.tags.filter(function (x) { return x !== tag; }); save();
  }
  function setNotes(id, text) {
    var t = byId(id); if (!t) return;
    t.notes = text || ''; save();
  }
  function toggleCollapse(id) {
    var t = byId(id); if (!t) return;
    t.collapsed = !t.collapsed; save();
  }
  function setCollapsedAll(val) {
    state.forEach(function (t) { t.collapsed = !!val; }); save();
  }
  function reset() { state = normalize(seed()); save(); return state; }
  function replaceAll(arr) { state = normalize(arr); save(); return state; }

  /* ---- public API ---------------------------------------------------- */
  global.Model = {
    KEY: KEY, PRI_RANK: PRI_RANK, COLS: COLS, DEFAULT_PROJECTS: DEFAULT_PROJECTS, KNOWN_TAGS: KNOWN_TAGS,
    getProjects: getProjects, addProject: addProject,
    seed: seed, normalize: normalize,
    getState: function () { return state; },
    save: save,
    add: add, del: del, setPri: setPri, move: move, moveTo: moveTo,
    toggleStep: toggleStep, addStep: addStep, delStep: delStep,
    addTag: addTag, removeTag: removeTag, setNotes: setNotes,
    toggleCollapse: toggleCollapse, setCollapsedAll: setCollapsedAll,
    reset: reset, replaceAll: replaceAll
  };
})(window);
