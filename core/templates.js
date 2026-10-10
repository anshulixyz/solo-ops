/* =========================================================================
   core/templates.js — sample data for first run / "Load template".
   Plain JS so the browser (classic script) and the CLI (require) share it.
   Everything here is deliberately generic: a two-week "ship a side project"
   sprint. Replace it with your own via the UI, the CLI, or your agent.
   ========================================================================= */
(function (root, factory) {
  var T = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.MARATHON_TEMPLATES = T;
})(this, function () {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function at(now, dayOffset, hh, mm) {
    var d = new Date(now.getTime()); d.setDate(d.getDate() + dayOffset); d.setHours(hh, mm || 0, 0, 0);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function cl(arr) {
    return arr.map(function (x) { return Array.isArray(x) ? { text: x[0], done: !!x[1] } : { text: x, done: false }; });
  }
  function task(id, title, proj, col, pri, tags, desc, steps) {
    return { id: id, title: title, proj: proj, col: col, pri: pri, tags: tags, desc: desc || '', notes: '', collapsed: true, checklist: cl(steps || []) };
  }

  function runway() {
    return {
      projects: [],
      tasks: [
        task('t1', 'Write the one-line pitch', 'launch', 'doing', 'high', ['content', 'research'],
          'One sentence a stranger understands in five seconds. Everything else points back to it.',
          [['Collect 5 ways people describe the problem', true], 'Draft 3 versions', 'Test on two friends', 'Pick one, paste into README and landing page']),
        task('t2', 'Landing page with a waitlist form', 'launch', 'todo', 'high', ['coding', 'setup'],
          'Static page, one form, one screenshot. Ship ugly, then iterate.',
          ['Hero + subcopy in the locked tone', 'Form wired to a mailing list', 'Deploy on a free static host', 'Add analytics + UTM links']),
        task('t3', 'Record a 60-second demo', 'content', 'todo', 'high', ['video', 'demo'],
          'Hook in the first two seconds. Captions burned in. Under 90s.',
          ['Script it in the Script viewer', 'Record screen + face', 'Edit + captions', 'Export 16:9 and 9:16']),
        task('t4', 'Set up the sending domain', 'general', 'todo', 'medium', ['setup', 'outreach'],
          'Keep your personal inbox clean; warm the new one slowly.',
          ['Buy the domain', 'SPF / DKIM / DMARC', 'Start warmup drips']),
        task('t5', 'Draft the launch post', 'launch', 'todo', 'high', ['content', 'launch'],
          'First-person, honest, technical. No hype words.',
          ['Outline: problem → what I built → what is next', 'Write draft in the Writing viewer', 'Tighten with your agent', 'Schedule it on the Social board']),
        task('t6', 'Collect 20 friendly early users', 'general', 'todo', 'medium', ['outreach'],
          'People who said "tell me when it is ready". Ask them one specific thing.',
          ['List names from DMs and email', 'Personal note to each', 'Launch-day ping list ready']),
        task('t7', 'Daily content cadence', 'content', 'doing', 'medium', ['content', 'daily'],
          'One build-in-public post a day, one video every other day.',
          ['Pick a posting time', 'Prep 5 post ideas in the Writing viewer', 'Reply to 10 accounts a day']),
        task('t8', 'Pick the recording stack', 'general', 'done', 'medium', ['research', 'video'],
          'Decided: screen recorder + an editing script + ffmpeg.',
          [['Compare 3 recorders', true], ['Test a 30s throwaway', true]]),
        task('t9', 'Set up analytics', 'general', 'done', 'low', ['setup'], '', [['Add page analytics', true], ['Event for form submit', true]]),
        task('t10', 'Launch day checklist', 'launch', 'todo', 'high', ['launch'],
          'Everything that must be true at 9:00 on launch morning.',
          ['Landing page live + form tested', 'Demo video uploaded', 'Launch post scheduled', 'Friendlies pinged', 'Stay in the comments all day']),
        task('t11', 'Write a "how I built this" thread', 'content', 'todo', 'low', ['content'],
          'Five tweets, one screenshot each.', ['Outline the 5 beats', 'Screenshots', 'Draft + schedule']),
        task('t12', 'Pitch two newsletters', 'launch', 'later', 'medium', ['outreach', 'content'],
          'One feature beats a week of posting. Offer an exclusive angle.', ['Shortlist 5 newsletters', 'Draft a per-newsletter pitch']),
        task('t13', 'Explore a paid tier', 'general', 'later', 'low', ['research'], 'Only after 100 signups.', []),
        task('t14', 'Translate the landing page', 'general', 'later', 'low', ['coding'], '', []),
        task('t15', 'Video idea — "the ugly first version"', 'content', 'bucket', 'medium', ['video', 'content'],
          'Show the first prototype next to today. Honest and funny.', ['Dig up the old screenshots', 'Script', 'Record']),
        task('t16', 'Video idea — 3 things I would skip next time', 'content', 'bucket', 'low', ['video', 'content'], '', []),
        task('t17', 'Demo idea — agent updates the board from the terminal', 'content', 'bucket', 'medium', ['demo', 'video'],
          'Terminal on the left, board on the right. No clicking.', [])
      ]
    };
  }

  function social(now) {
    now = now || new Date();
    function post(id, off, hh, title, type, format, project, copy, prep, notes) {
      return {
        id: id, datetime: at(now, off, hh, 0), title: title, postType: type, format: format, project: project, copy: copy,
        video: { title: '', status: format === 'text' ? 'none' : 'idea', notes: '', link: '' },
        links: [], assets: [], prep: prep.map(function (p) { return { text: p[0], done: !!p[1], kind: p[2] || 'content' }; }),
        notes: notes || '', status: 'draft',
        posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' }
      };
    }
    return {
      posts: [
        post('p1', 1, 9, 'Why I am building this', 'announcement', 'text', 'general',
          'I have spent the last year watching the same problem eat my evenings.\n\nSo I am building a small tool to fix it. Sharing the whole thing here as I go.',
          [['Draft copy, personal tone', true], ['Pick a pinned reply', false]], 'Anchor post. Everything after points back here.'),
        post('p2', 3, 17, 'The ugly first version', 'update', 'text+video', 'content',
          'Here is what the first version looked like. It is not pretty. It works.\n\n[15s clip]',
          [['Dig up old screenshots', false, 'content'], ['Record 15s clip', false, 'video']]),
        post('p3', 6, 12, 'Teaser: one feature, no explanation', 'teaser', 'video', 'launch',
          'Something is coming next week.\n\n[10s silent clip of the feature]',
          [['Capture the feature flow', false, 'video'], ['Waitlist page live', false, 'dev']]),
        post('p4', 9, 9, 'Launch day', 'launch', 'text+video', 'launch',
          'It is live.\n\n[one line: what it does]\n[one line: who it is for]\n\nDemo below. Link in the first reply.',
          [['Final demo cut', false, 'video'], ['Landing page tested', false, 'dev'], ['Ping the friendlies', false, 'outreach']], 'Stay in the replies all day.'),
        post('p5', 12, 10, 'How I built this — thread', 'thread', 'text', 'content',
          '1/ Five things I learned shipping this in two weeks.\n\n2/ …',
          [['Outline 5 beats', false], ['Screenshots per beat', false, 'design']])
      ]
    };
  }

  var SCRIPT = '# My Reel Script\n\n## Hook (first 2 seconds)\nStop scrolling — this one change doubled my reply rate.\n\n## Script\n1. I used to send the same cold DM to everyone.\n2. Then I tried one thing: mention something specific from their last post.\n3. Not flattery — one real detail that shows you actually looked.\n4. My reply rate went from 4% to 12% in a week.\n5. Try it on your next five DMs. You\'ll feel the difference.\n\n## Inserts\n- Beat 2: screenshot of generic vs personalized DM\n- Beat 4: simple bar chart — 4% → 12%\n\n(Pause after beat 1 — let it land)\n';
  var SCRIPT2 = '# Launch demo — 60 seconds\n\n## Hook\nI built this in two weeks. Here is the whole thing in one minute.\n\n## Script\n1. The problem: you have a list of things to do, and it lives in six places.\n2. This puts the list in one file your tools and your AI can both read.\n3. Add a task from the terminal — it shows up on the board.\n4. Ask your agent what is due this week — it reads the same file.\n5. Link in the first reply. It is free and it is open source.\n\n## Inserts\n- Beat 3: terminal on the left, board on the right\n- Beat 4: chat window asking "what is due this week?"\n\n## Prep\n- [x] Script locked\n- [ ] Record screen\n- [ ] Captions\n';

  var NOTE = '# The draft I\'m wrestling with\n\n> The best writing feels like you\'re thinking out loud — but on purpose.\n\nThis is the paragraph I\'m shaping for a post about ~~building in public~~ ++shipping in public++.\n\nI want it to land with founders who are tired of performative updates.\n\n[[AI: tighten the second sentence — less preachy, more specific]]\n\n## Alternate hook\n\n++What if your "building in public" post is just another performance?++\n\n---\n\nStill figuring out the close. ~~Let me know what you think.~~ ++Tell me if you\'ve felt this — genuinely curious.++\n';
  var NOTE2 = '# Launch post — draft 1\n\nI have been building a small tool for the last two weeks.\n\nIt does one thing: ~~it keeps your tasks in a file~~ ++it keeps your tasks where both you and your AI can see them++.\n\n[[AI: suggest 3 alternative opening lines, each under 12 words]]\n\n## What it is not\n\nIt is not another project manager. There is no login, no server, no sync service.\n';

  function scripts(now) {
    var ts = (now || new Date()).getTime();
    return { activeId: 's1', scripts: [
      { id: 's1', title: 'My Reel Script', text: SCRIPT, createdAt: ts - 86400000, updatedAt: ts - 86400000 },
      { id: 's2', title: 'Launch demo — 60 seconds', text: SCRIPT2, createdAt: ts, updatedAt: ts }
    ] };
  }
  function writing(now) {
    var ts = (now || new Date()).getTime();
    return { activeId: 'n1', notes: [
      { id: 'n1', text: NOTE, images: {}, createdAt: ts - 3600000, updatedAt: ts - 3600000 },
      { id: 'n2', text: NOTE2, images: {}, createdAt: ts, updatedAt: ts }
    ] };
  }
  function settings() { return { theme: { mode: 'auto', palette: 'warm' } }; }

  return { runway: runway, social: social, scripts: scripts, writing: writing, settings: settings, SCRIPT: SCRIPT, NOTE: NOTE };
});
