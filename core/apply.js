/* =========================================================================
   core/apply.js — applies an agent's reply in the browser, no terminal.
   Understands the same verbs as solo.js (one per line, with or without the
   `node solo.js` prefix) plus a plain "- [ ] task" checklist. Writes go to
   the same Store keys the apps use, so sync carries them to data/*.json.
   Global `Apply` → Apply.run(text, { ws }) → { applied:[…], skipped:[…] }
   ========================================================================= */
(function (global) {
  'use strict';
  var COLS = ['todo', 'doing', 'done', 'later', 'bucket'];

  function tokens(line) {   // shell-ish: quotes, --flag value, --flag=value
    var out = [], i = 0, cur = '', q = null, had = false;
    while (i < line.length) {
      var c = line[i];
      if (q) { if (c === q) { q = null; } else if (c === '\\' && line[i + 1] === q) { cur += q; i++; } else cur += c; }
      else if (c === '"' || c === "'") { q = c; had = true; }
      else if (/\s/.test(c)) { if (cur || had) { out.push(cur); cur = ''; had = false; } }
      else cur += c;
      i++;
    }
    if (cur || had) out.push(cur);
    return out;
  }
  function parseArgs(toks) {
    var pos = [], flags = {};
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.indexOf('--') === 0) { var eq = t.indexOf('='); if (eq > -1) flags[t.slice(2, eq)] = t.slice(eq + 1); else if (i + 1 < toks.length && toks[i + 1].indexOf('--') !== 0) { flags[t.slice(2)] = toks[++i]; if (t === '--at' && i + 1 < toks.length && /^\d{1,2}:\d{2}$/.test(toks[i + 1])) flags.at += ' ' + toks[++i]; } else flags[t.slice(2)] = true; }
      else pos.push(t);
    }
    return { pos: pos, flags: flags };
  }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function split(v) { return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function localDT(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function parseWhen(v) {   // posts: date-only means 09:00; zones are converted to local (core/when.js)
    var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    if (!v) return localDT(d);
    var p = global.When ? When.parse(v) : null; if (p) return p.allDay ? p.stamp + 'T09:00' : p.stamp;
    var d2 = new Date(v); return isNaN(d2) ? localDT(d) : localDT(d2);
  }
  // when does a line count as a command? Bare `at` / `due` only when it ends in something date-shaped (chat prose says "at this point" a lot).
  function looksCmd(line) {
    if (/^(\$\s*)?(node\s+solo\.js|node\s+marathon\.js|solo|marathon)\s+/.test(line)) return true;
    if (/^(add|done|start|later|bucket|todo|move|pri|tag|step|check|note|rm|del|social|post|scripts|notes|inspo|config)\s/.test(line)) return true;
    if (/^video\s+(cut|render|transcribe|add|post|show|list|open|rm|source|key|title|rename|word|correct|proxy)\s/.test(line)) return true;   // "video editing is fun" is prose
    if (/^(link|connect)\s+("[^"]+"|\S+)\s+("[^"]+"|\S+)(\s+--off)?\s*$/.test(line)) return true;   // link <id> <id> [--off]: one story ("link it with the script" is prose)
    if (/^(at|due)\s/.test(line)) { var toks = line.trim().replace(/\s--\w+(=\S+|\s+\S+)?/g, '').split(/\s+/); /* flags (--until 11:00) do not hide the date */ var last = (toks[toks.length - 1] || '').toLowerCase(); var prev = (toks[toks.length - 2] || '').toLowerCase(); var WD = global.When ? When.WEEKDAY : /^(mon|tue|wed|thu|fri|sat|sun)$/; return toks.length >= 3 && (last === 'clear' || /^\d{4}-\d{2}-\d{2}/.test(last) || /^\+\d+d$/.test(last) || /^(today|tomorrow|now)$/.test(last) || WD.test(last) || (/^\d{1,2}:\d{2}$/.test(last) && (/^\d{4}-\d{2}-\d{2}$/.test(prev) || /^\+\d+d$/.test(prev) || /^(today|tomorrow)$/.test(prev) || WD.test(prev)))); }
    return false;
  }
  // `at <task> <when>` / `due <task> <date>`: the date is the trailing one or two tokens; the rest names the task
  function splitWhen(posArr) {
    for (var n = Math.min(2, posArr.length - 1); n >= 1; n--) { var tail = posArr.slice(-n).join(' '); if (tail.toLowerCase() === 'clear' || (global.When && When.parse(tail))) return { q: posArr.slice(0, -n).join(' '), when: tail }; }
    return null;
  }


  function ctx(wsId, dry) {
    var ws = wsId || Config.activeWs(); var boards = Config.boards(ws);
    var touched = {}; var mem = {};   // mem: dry-run overlay, so a preview sees its own earlier adds
    function boardKey(id) { return Config.boardKey(id, ws); }
    function loadBoard(id) { if (dry && mem['b:' + id]) return mem['b:' + id]; return Store.getJSON(boardKey(id), []) || []; }
    function saveBoard(id, tasks) { if (dry) { mem['b:' + id] = tasks; return; } Store.setJSON(boardKey(id), tasks); touched[Config.boardFile(id, ws)] = 1; }
    function pickBoard(flags) {
      var want = flags.board ? Config.slug(flags.board) : null;
      var b = want ? boards.filter(function (x) { return x.id === want || x.title.toLowerCase().indexOf(String(flags.board).toLowerCase()) >= 0; })[0] : boards[0];
      return b ? b.id : null;
    }
    function findTask(q, flags) {
      q = String(q || '').trim().toLowerCase(); var hits = [];
      var ids = flags.board ? [pickBoard(flags)] : boards.map(function (b) { return b.id; });
      ids.forEach(function (bid) { if (!bid) return; loadBoard(bid).forEach(function (t) { if (t.id === q || t.title.toLowerCase().indexOf(q) >= 0) hits.push({ board: bid, t: t }); }); });
      var exact = hits.filter(function (h) { return h.t.id === q || h.t.title.toLowerCase() === q; });
      return exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : (hits.length ? { ambiguous: hits.length } : null);
    }
    function mutateTask(q, flags, fn) {
      var h = findTask(q, flags); if (!h) return 'no task matches "' + q + '"'; if (h.ambiguous) return h.ambiguous + ' tasks match "' + q + '" — use the id';
      var tasks = loadBoard(h.board); var t = tasks.filter(function (x) { return x.id === h.t.id; })[0]; var r = fn(t); saveBoard(h.board, tasks); return r;
    }
    function sched() { if (dry && mem.s) return mem.s; return Store.getJSON(Config.key('social', ws), []) || []; }
    function saveSched(p) { if (dry) { mem.s = p; return; } Store.setJSON(Config.key('social', ws), p); touched[Config.file('social', ws)] = 1; }
    function findPost(q) { q = String(q || '').trim().toLowerCase(); var hits = sched().filter(function (p) { return p.id === q || p.title.toLowerCase().indexOf(q) >= 0; }); return hits.length === 1 ? hits[0] : null; }
    return { ws: ws, dry: !!dry, boards: boards, touched: touched, loadBoard: loadBoard, saveBoard: saveBoard, pickBoard: pickBoard, mutateTask: mutateTask, sched: sched, saveSched: saveSched, findPost: findPost };
  }

  // The ``` block that carries a script / note body after line k. The command
  // usually sits inside the commands block, so that block's closing fence comes
  // first; a short prose line ("Here is the script:") may sit between.
  function bodyAfter(lines, k, inFence) {
    var j = k + 1; function fence(n) { return n < lines.length && lines[n].trim().indexOf('```') === 0; }
    if (inFence) { while (j < lines.length && !lines[j].trim()) j++; if (!fence(j)) return null; j++; }
    var hops = 0; while (j < lines.length && !fence(j) && hops < 3) { var h = lines[j].trim(); if (h && (looksCmd(h) || /^[-*]\s/.test(h))) return null; if (h) hops++; j++; }   // a command or checklist item in between: no body here
    if (!fence(j)) return null;
    var body = []; j++; while (j < lines.length && !fence(j)) { body.push(lines[j]); j++; }
    var firstLine = body.map(function (l) { return l.trim(); }).filter(Boolean)[0] || ''; if (looksCmd(firstLine)) return null;   // that block is more commands, not a body
    return { text: body.join('\n'), end: j };   // end = the closing fence (or past the last line)
  }
  // Split a reply into units: one command (plus its fenced block) or one
  // checklist item (plus its indented steps). Used for the preview.
  function segment(text) {
    var lines = String(text || '').split('\n'); var units = []; var i = 0; var inFence = false;
    function isCmd(line) { return looksCmd(line); }
    while (i < lines.length) {
      var raw = lines[i]; var line = raw.trim();
      if (line.indexOf('```') === 0) { inFence = !inFence; i++; continue; }
      if (!line || (line.indexOf('#') === 0)) { i++; continue; }
      var cl = raw.match(/^(\s*)[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/);
      if (cl && !isCmd(line) && cl[1].length === 0) {
        var block = [raw]; var j = i + 1;
        while (j < lines.length) { var m2 = lines[j].match(/^(\s+)[-*]\s+/); if (m2 && !isCmd(lines[j].trim())) { block.push(lines[j]); j++; } else break; }
        units.push({ text: block.join('\n') }); i = j; continue;
      }
      if (isCmd(line)) {
        var block2 = [raw]; var k = i + 1; while (k < lines.length && !lines[k].trim()) k++;
        if (/^(scripts|notes)\s+add|solo\.js\s+(scripts|notes)\s+add|^(solo|marathon)\s+(scripts|notes)\s+add/.test(line.replace(/^\$\s*/, ''))) {
          var fb = /\s--text(=|\s)/.test(line) ? null : bodyAfter(lines, i, inFence);   // --text carries the body inline
          if (fb) { units.push({ text: raw + '\n```\n' + fb.text + '\n```' }); i = fb.end + 1; inFence = false; continue; }   // self-contained: the unit re-runs on its own
        }
        units.push({ text: raw }); i++; continue;
      }
      i++;
    }
    return units;
  }
  // Preview: what each unit would do, without writing anything.
  function plan(text, opts) {
    var c = ctx(opts && opts.ws, true);
    return segment(text).map(function (u) {
      var r = exec(c, u.text);
      return { text: u.text, label: r.applied[0] || r.skipped[0] || u.text.slice(0, 80), ok: !!r.applied.length, reason: r.applied.length ? '' : '' };
    });
  }

  function run(text, opts) { return exec(ctx(opts && opts.ws, !!(opts && opts.dry)), text); }
  function exec(c, text) {
    var applied = [], skipped = []; var dry = c.dry;
    var lines = String(text || '').split('\n'); var i = 0; var inFence = false;
    var lastTask = null;
    while (i < lines.length) {
      var raw = lines[i]; var line = raw.trim();
      if (line.indexOf('```') === 0) { inFence = !inFence; i++; continue; }
      if (!line || line.indexOf('#') === 0 && !/^#\s*\[/.test(line)) { i++; continue; }
      // checklist item
      var cl = raw.match(/^(\s*)[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/);
      var isCmd = looksCmd(line);
      if (cl && !isCmd) {
        var indent = cl[1].length, done = (cl[2] || '').toLowerCase() === 'x', title = cl[3].trim();
        if (indent === 0) {
          var pri = /\((high|low)\)/i.test(title) ? title.match(/\((high|low)\)/i)[1].toLowerCase() : 'medium';
          title = title.replace(/\s*\((high|low|medium)\)/i, '').replace(/\s*·\s*\S+$/, '').trim();
          var bid = c.pickBoard({}); if (!bid) { skipped.push('no board in this workspace for: ' + title); i++; continue; }
          var tasks = c.loadBoard(bid); var t = { id: uid('t'), title: title, desc: '', proj: Config.projectNames()[0], col: done ? 'done' : 'todo', pri: pri, tags: [], notes: '', collapsed: true, checklist: [] };
          tasks.unshift(t); c.saveBoard(bid, tasks); lastTask = { board: bid, id: t.id }; applied.push('added task: ' + title);
        } else if (lastTask) {
          var ts = c.loadBoard(lastTask.board); var lt = ts.filter(function (x) { return x.id === lastTask.id; })[0]; if (lt) { lt.checklist.push({ text: title, done: done }); c.saveBoard(lastTask.board, ts); }
        }
        i++; continue;
      }
      if (!isCmd) { i++; continue; }
      var toks = tokens(line.replace(/^\$\s*/, '').replace(/^(node\s+solo\.js|node\s+marathon\.js|solo|marathon)\s+/, ''));
      var a = parseArgs(toks); var cmd = (a.pos.shift() || '').toLowerCase(); var q = a.pos.join(' ');
      try {
        if (cmd === 'add') {
          var bid2 = c.pickBoard(a.flags); if (!bid2) { skipped.push('no board for: ' + q); i++; continue; }
          var tasks2 = c.loadBoard(bid2);
          var nt = { id: uid('t'), title: q, desc: a.flags.desc || '', proj: a.flags.proj || Config.projectNames()[0], col: COLS.indexOf(a.flags.col) >= 0 ? a.flags.col : 'todo', pri: ['high', 'medium', 'low'].indexOf(a.flags.pri) >= 0 ? a.flags.pri : 'medium', tags: split(a.flags.tags).map(function (s) { return s.toLowerCase(); }), notes: a.flags.notes || '', collapsed: true, checklist: String(a.flags.steps || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { text: s, done: false }; }) };
          var untilDropped = false;
          if (a.flags.at && global.When) { var pa = When.parse(a.flags.at); if (pa) { nt.at = pa.stamp; if (a.flags.until) { nt.until = When.until(nt.at, a.flags.until); if (!nt.until) untilDropped = true; } } }
          if (a.flags.due && global.When) { var pd = When.parse(a.flags.due); if (pd) nt.due = When.dayKey(pd.stamp); }
          if (a.flags.ext) nt.ext = String(a.flags.ext);
          var same = nt.ext ? tasks2.filter(function (x) { return x.ext === nt.ext; })[0] : null;
          if (same) { same.title = nt.title; if (nt.at) same.at = nt.at; if (nt.until) same.until = nt.until; if (nt.due) same.due = nt.due; nt.tags.forEach(function (g) { if (same.tags.indexOf(g) < 0) same.tags.push(g); }); c.saveBoard(bid2, tasks2); lastTask = { board: bid2, id: same.id }; applied.push('updated (same ext): ' + same.title); }
          else { tasks2.unshift(nt); c.saveBoard(bid2, tasks2); lastTask = { board: bid2, id: nt.id }; applied.push('added task: ' + q + (nt.at ? ' · ' + nt.at.replace('T', ' ') : '') + (untilDropped ? ' (end time ignored: before the start)' : '')); }
        } else if (['done', 'start', 'later', 'bucket', 'todo'].indexOf(cmd) >= 0) {
          var col = { done: 'done', start: 'doing', later: 'later', bucket: 'bucket', todo: 'todo' }[cmd];
          var r = c.mutateTask(q, a.flags, function (t) { t.col = col; return cmd + ': ' + t.title; }); (/^no |tasks match/.test(r) ? skipped : applied).push(r);
        } else if (cmd === 'move') {
          var col2 = a.pos.pop(); var r2 = c.mutateTask(a.pos.join(' '), a.flags, function (t) { t.col = COLS.indexOf(col2) >= 0 ? col2 : t.col; return 'moved to ' + col2 + ': ' + t.title; }); (/^no |tasks match/.test(r2) ? skipped : applied).push(r2);
        } else if (cmd === 'pri') {
          var p = a.pos.pop(); var r3 = c.mutateTask(a.pos.join(' '), a.flags, function (t) { t.pri = p === 'med' ? 'medium' : p; return 'priority ' + t.pri + ': ' + t.title; }); (/^no |tasks match/.test(r3) ? skipped : applied).push(r3);
        } else if (cmd === 'tag') {
          var ops = a.pos.filter(function (x) { return /^[+-]/.test(x); }); var qq = a.pos.filter(function (x) { return !/^[+-]/.test(x); }).join(' ');
          var r4 = c.mutateTask(qq, a.flags, function (t) { ops.forEach(function (o) { var tg = o.slice(1).toLowerCase(); if (o[0] === '+' && t.tags.indexOf(tg) < 0) t.tags.push(tg); if (o[0] === '-') t.tags = t.tags.filter(function (x) { return x !== tg; }); }); return 'tags ' + t.tags.join(', ') + ': ' + t.title; }); (/^no |tasks match/.test(r4) ? skipped : applied).push(r4);
        } else if (cmd === 'step') {
          var txt = a.flags.text || a.pos.slice(1).join(' '); var r5 = c.mutateTask(a.flags.text ? q : a.pos[0], a.flags, function (t) { t.checklist.push({ text: txt, done: false }); return 'step added: ' + t.title; }); (/^no |tasks match/.test(r5) ? skipped : applied).push(r5);
        } else if (cmd === 'check' || cmd === 'uncheck') {
          var n = parseInt(a.pos.pop(), 10); var r6 = c.mutateTask(a.pos.join(' '), a.flags, function (t) { if (t.checklist[n - 1]) t.checklist[n - 1].done = cmd === 'check'; return cmd + ' ' + n + ': ' + t.title; }); (/^no |tasks match/.test(r6) ? skipped : applied).push(r6);
        } else if (cmd === 'note') {
          var txt2 = a.flags.text || a.pos.slice(1).join(' '); var r7 = c.mutateTask(a.flags.text ? q : a.pos[0], a.flags, function (t) { t.notes = (t.notes ? t.notes + '\n' : '') + txt2; return 'note added: ' + t.title; }); (/^no |tasks match/.test(r7) ? skipped : applied).push(r7);
        } else if (cmd === 'at' || cmd === 'due') {
          var sw = splitWhen(a.pos); if (!sw) { skipped.push(cmd + ': give a task and a date, e.g. `' + cmd + ' t3 tomorrow 14:00`'); i++; continue; }
          var r8 = c.mutateTask(sw.q, a.flags, function (t) {
            if (sw.when.toLowerCase() === 'clear') { if (cmd === 'at') { delete t.at; delete t.until; } else delete t.due; return (cmd === 'at' ? 'unscheduled: ' : 'due date removed: ') + t.title; }
            var pw = When.parse(sw.when); if (cmd === 'at') { t.at = pw.stamp; var u8 = a.flags.until ? When.until(t.at, a.flags.until) : ''; if (u8) t.until = u8; else delete t.until; return 'at ' + t.at.replace('T', ' ') + (u8 ? '–' + When.timeOf(u8) : a.flags.until ? ' (end time ignored: before the start)' : '') + ': ' + t.title; }
            t.due = When.dayKey(pw.stamp); return 'due ' + t.due + ': ' + t.title;
          }); (/^no |tasks match/.test(r8) ? skipped : applied).push(r8);
        } else if (cmd === 'link' || cmd === 'connect') {   // one story: the page writes its own field itself, anything else goes through the server; without it, the terminal
          if (!global.Story || !Story.connect) skipped.push('link: paste it on the Drafts, Scripts, Video or Schedule page (they show the story), or run it in the terminal');
          else if (dry) applied.push((a.flags.off ? 'disconnect ' : 'connect ') + (a.pos[0] || '') + ' and ' + (a.pos[1] || ''));
          else { var lp = a.flags.off ? Story.disconnect(a.pos[0], a.pos[1]) : Story.connect(a.pos[0], a.pos[1]); lp.then(function () { if (global.flash) flash('Connected: ' + a.pos[0] + ' and ' + a.pos[1]); }).catch(function (e) { if (global.flash) flash('link: ' + (e && e.message || e)); }); applied.push('connecting ' + (a.pos[0] || '') + ' and ' + (a.pos[1] || '') + ' (the page shows it when done)'); }
        } else if (cmd === 'rm' || cmd === 'del') {
          skipped.push('not deleting "' + q + '" from a pasted reply — delete it yourself if you agree');
        } else if (cmd === 'social' || cmd === 'post') {
          var sub = (a.pos.shift() || '').toLowerCase(); var sq = a.pos.join(' ');
          if (sub === 'add') {
            var posts = c.sched(); var np = { id: uid('p'), datetime: parseWhen(a.flags.at), title: sq, postType: a.flags.type || 'update', format: a.flags.format || 'text', project: a.flags.project || a.flags.proj || Config.projectNames()[0], copy: a.flags.copy || '', video: { title: '', status: 'none', notes: '', link: '' }, links: [], assets: [], prep: String(a.flags.prep || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { text: s, done: false, kind: 'content' }; }), notes: a.flags.notes || '', status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } };
            if (a.flags.draft) np.noteId = String(a.flags.draft); if (a.flags.script) np.scriptId = String(a.flags.script);   // the post remembers the draft or the script it came from
            posts.push(np); c.saveSched(posts); applied.push('scheduled post: ' + sq + ' · ' + np.datetime.replace('T', ' '));
            if (a.flags.take && !dry && global.Story && Story.connect) Story.connect(String(a.flags.take), np.id).catch(function (e) { if (global.flash) flash('link: ' + (e && e.message || e)); });   // --take: the take's postId lives on the take, written through the server
          } else if (['posted', 'ready', 'draft'].indexOf(sub) >= 0) {
            var pp = c.findPost(sq); if (!pp) skipped.push('no post matches "' + sq + '"'); else { var ps = c.sched(); ps.forEach(function (x) { if (x.id === pp.id) { x.status = sub; if (sub === 'posted') { x.posted = x.posted || {}; x.posted.postedAt = x.posted.postedAt || localDT(new Date()); if (a.flags.url) x.posted.url = a.flags.url; } } }); c.saveSched(ps); applied.push(sub + ': ' + pp.title); }
          } else if (sub === 'copy') {
            var ctext = a.flags.text || a.pos.slice(1).join(' '); var cp = c.findPost(a.flags.text ? sq : a.pos[0]); if (!cp) skipped.push('no post matches'); else { var ps2 = c.sched(); ps2.forEach(function (x) { if (x.id === cp.id) x.copy = ctext; }); c.saveSched(ps2); applied.push('copy written: ' + cp.title); }
          } else if (sub === 'prep') {
            var ptext = a.flags.text || a.pos.slice(1).join(' '); var pq = c.findPost(a.flags.text ? sq : a.pos[0]); if (!pq) skipped.push('no post matches'); else { var ps3 = c.sched(); ps3.forEach(function (x) { if (x.id === pq.id) x.prep.push({ text: ptext, done: false, kind: 'content' }); }); c.saveSched(ps3); applied.push('prep added: ' + pq.title); }
          } else if (sub === 'move') {
            var when = a.pos.pop(); var mp = c.findPost(a.pos.join(' ')); if (!mp) skipped.push('no post matches'); else { var ps4 = c.sched(); ps4.forEach(function (x) { if (x.id === mp.id) x.datetime = parseWhen(when); }); c.saveSched(ps4); applied.push('rescheduled: ' + mp.title); }
          } else skipped.push('social ' + sub + ' is not supported here');
        } else if (cmd === 'scripts' || cmd === 'notes') {
          var sub2 = (a.pos.shift() || '').toLowerCase(); var title2 = a.pos.join(' ');
          if (sub2 !== 'add') { skipped.push(cmd + ' ' + sub2 + ' is not supported here'); i++; continue; }
          var fence = a.flags.text ? null : bodyAfter(lines, i, inFence); var body = a.flags.text || (fence ? fence.text : '');
          if (cmd === 'scripts') {
            var k = Config.key('scripts', c.ws); var lib = Store.getJSON(k, { activeId: '', scripts: [] }) || { activeId: '', scripts: [] }; lib.scripts = lib.scripts || [];
            var si = { id: uid('s'), title: title2 || 'Untitled', text: body || ('# ' + title2 + '\n\n## Hook\n\n## Script\n1. \n'), createdAt: Date.now(), updatedAt: Date.now() , noteId: a.flags.draft ? String(a.flags.draft) : '' }; lib.scripts.unshift(si); lib.activeId = si.id; if (!dry) { Store.setJSON(k, lib); c.touched[Config.file('scripts', c.ws)] = 1; } applied.push('script added: ' + si.title + (body ? '' : ' (empty — no code block followed)'));
          } else {
            var k2 = Config.key('writing', c.ws); var nl = Store.getJSON(k2, { activeId: '', notes: [] }) || { activeId: '', notes: [] }; nl.notes = nl.notes || [];
            var ni = { id: uid('n'), text: body || ('# ' + title2 + '\n\n'), images: {}, createdAt: Date.now(), updatedAt: Date.now() }; nl.notes.unshift(ni); nl.activeId = ni.id; if (!dry) { Store.setJSON(k2, nl); c.touched[Config.file('writing', c.ws)] = 1; } applied.push('note added: ' + (title2 || 'untitled'));
          }
          if (fence) { i = fence.end; inFence = false; }   // the body's closing fence is consumed with it
        } else if (cmd === 'inspo') {
          var sub3 = (a.pos.shift() || '').toLowerCase();
          if (sub3 === 'add' && global.InspoModel) { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } var it = InspoModel.parseQuick(a.pos.join(' '), { ws: c.ws, source: 'agent' }); if (a.flags.tags) it.tags = (it.tags || []).concat(split(a.flags.tags)); if (!dry) InspoModel.add(it); applied.push('inspiration saved: ' + (it.title || it.url)); }
          else if ((sub3 === 'tag' || sub3 === 'ws' || sub3 === 'archive') && global.InspoModel) {
            if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; }
            var q3 = a.pos.filter(function (x) { return !/^[+-]/.test(x); }); var ops3 = a.pos.filter(function (x) { return /^[+-]/.test(x); });
            var target = sub3 === 'ws' ? q3.slice(0, -1).join(' ') : q3.join(' '); var l3 = target.toLowerCase();
            var hits = InspoModel.getState().filter(function (x) { return x.id === target || (x.title || '').toLowerCase().indexOf(l3) >= 0; });
            if (hits.length !== 1) { skipped.push((hits.length ? 'several' : 'no') + ' inspiration items match "' + target + '"'); }
            else if (sub3 === 'tag') { var tg = hits[0].tags.slice(); ops3.forEach(function (o) { var t3 = o.slice(1).toLowerCase(); if (o[0] === '+' && tg.indexOf(t3) < 0) tg.push(t3); if (o[0] === '-') tg = tg.filter(function (y) { return y !== t3; }); }); if (!dry) InspoModel.update(hits[0].id, { tags: tg }); applied.push('tags #' + tg.join(' #') + ': ' + (hits[0].title || hits[0].url)); }
            else if (sub3 === 'ws') { var wsId3 = Config.slug(q3[q3.length - 1]); if (!dry) InspoModel.update(hits[0].id, { ws: wsId3 }); applied.push('project ' + wsId3 + ': ' + (hits[0].title || hits[0].url)); }
            else { if (!dry) InspoModel.update(hits[0].id, { status: 'archived' }); applied.push('archived: ' + (hits[0].title || hits[0].url)); }
          }
          else skipped.push('inspo ' + sub3 + ' is not supported here');
        } else if (cmd === 'config' && ['set', 'add', 'unset', 'clear'].indexOf((a.pos[0] || '').toLowerCase()) >= 0) {
          // your settings (data/settings.json → config): the page keeps them in the browser and the settings sync writes the file
          var csub = a.pos.shift().toLowerCase();
          if (!global.Config || !Config.override || !global.Sync || !Sync.exportsOnDisk || !Sync.exportsOnDisk()) skipped.push('config ' + csub + ': run this one in the terminal (this page cannot write settings.json here)');
          else {
            var shipped = global.MARATHON_CONFIG || {}; var curCfg = c.config === undefined ? (Config.overrides() || {}) : c.config;
            try {
              if (csub === 'clear') { var rc = Config.override(shipped, curCfg, 'clear'); c.config = rc.config; applied.push(rc.label); }
              else if (csub === 'unset') { var ru = Config.override(shipped, curCfg, 'unset', a.pos[0]); c.config = ru.config; (ru.unchanged ? skipped : applied).push(ru.label); }
              else if (csub === 'add') { var ra = Config.override(shipped, curCfg, 'add', a.pos[0], a.pos.slice(1).join(','), { force: !!a.flags.force }); c.config = ra.config; applied.push(ra.label); }
              else { if (a.pos.length < 2 || a.pos.length % 2) throw new Error('config set needs a setting and a value, e.g. `config set owner "Mara"`'); for (var ci = 0; ci < a.pos.length; ci += 2) { var rs = Config.override(shipped, c.config === undefined ? curCfg : c.config, 'set', a.pos[ci], a.pos[ci + 1], { force: !!a.flags.force }); c.config = rs.config; applied.push(rs.label); } }
            } catch (e) { skipped.push('config ' + csub + ': ' + e.message); }
          }
        } else if (['week', 'today', 'list', 'show', 'log', 'activity', 'boards', 'workspaces', 'config', 'help', 'share', 'review'].indexOf(cmd) >= 0) {
          /* read-only commands: nothing to apply */
        } else if (cmd === 'video') {
          // `video cut <take> --keep "…"` / `--drop "…"` writes the cut (the Video page renders it; a reply never renders). Every other video step needs ffmpeg: the terminal, or the page's buttons.
          var vsub = (a.pos.shift() || '').toLowerCase(); var vid = a.pos.join(' ');
          if (vsub === 'title' || vsub === 'rename') {   // video title <take> "New": the take's title
            var tq = a.pos[0] || ''; var tt = a.pos.slice(1).join(' ') || a.flags.title || ''; var vkT = Config.key('videos', c.ws); var vlT = Store.getJSON(vkT, null); var vtT = vlT && (vlT.videos || []).filter(function (x) { return x.id === tq || (x.title || '').toLowerCase() === tq.toLowerCase(); })[0];
            if (!vtT) skipped.push('no take matches "' + tq + '"'); else if (!tt.trim()) skipped.push('video title: give the new title'); else { if (!dry) { if (global.VideoModel && VideoModel.rename) VideoModel.rename(vtT, tt); else { vtT.title = tt.trim().slice(0, 120); vtT.renamedAt = Date.now(); vtT.updatedAt = Date.now(); Store.setJSON(vkT, vlT); c.touched[Config.file('videos', c.ws)] = 1; if (global.Sync && Sync.note) Sync.note(Config.file('videos', c.ws), 'video title ' + vtT.id + ': ' + tt); } } applied.push('renamed take: ' + tt.trim()); }
          }
          else if (vsub === 'word' || vsub === 'correct') {   // video word <take> <n>[-<m>] "text": only the Video page with the server can write the transcript
            if (!global.VideoModel || !global.correctWords) skipped.push('video word: open the Video page with node serve.js running and paste this there (it writes the transcript), or run it in the terminal');
            else if (dry) applied.push('correct word ' + (a.pos[1] || '') + ' → ' + a.pos.slice(2).join(' '));
            else { try { var pw = global.correctWords(a.pos[0], a.pos[1], a.pos.slice(2).join(' ') || a.flags.text, !!a.flags.all); if (pw && pw.catch) pw.catch(function (e) { if (global.flash) global.flash('video word: ' + (e && e.message || e)); }); applied.push('correcting word ' + (a.pos[1] || '') + ' → ' + a.pos.slice(2).join(' ') + ' (the page shows it when done)'); } catch (e) { skipped.push('video word: ' + e.message); } }
          }
          else if (vsub !== 'cut') skipped.push('video ' + vsub + ': this runs in your terminal or from the Video page\'s buttons, not from a reply' + (vsub === 'render' ? ' — the cut is here; press Render a preview on the Video page' : ''));
          else if (a.flags.edl) skipped.push('video cut --edl: that names a file on disk; run the line in your terminal, or paste the pieces as --keep "start-end, …"');
          else if (!global.Video) skipped.push('video cut: open the Video page (it has the cut logic) and paste this there, or run the line in your terminal');
          else if (global.VideoModel) {
            if (dry) { var dt = VideoModel.get(vid) || VideoModel.list().filter(function (x) { return x.title.toLowerCase() === vid.toLowerCase(); })[0]; if (!dt) skipped.push('no take matches "' + vid + '"'); else if ((a.flags.drop || a.flags.tidy || a.flags['drop-silence']) && !VideoModel.hasWords(dt.id)) skipped.push('video cut --drop / --tidy needs the words: open the Video page with node serve.js running, or run it in the terminal'); else { try { if (a.flags.keep) Video.parseRanges(String(a.flags.keep)); applied.push('cut take: ' + dt.title + ' (' + (a.flags.keep ? 'keep ' + a.flags.keep : a.flags.drop ? 'drop ' + a.flags.drop : a.flags.tidy ? 'remove fillers and pauses' : 'shorten pauses') + ')'); } catch (e) { skipped.push('video cut: ' + e.message); } } }
            else { try { var vr = VideoModel.cutFromLine(vid, a.flags); applied.push('cut applied: ' + vr.take.title + ' — ' + vr.edl.length + ' piece' + (vr.edl.length === 1 ? '' : 's') + ', ' + VideoModel.fmt(vr.runtime) + '. Next: Render a preview (the reply cannot render)'); } catch (e) { skipped.push('video cut: ' + e.message); } }
          } else if (a.flags.drop || a.flags.tidy || a.flags['drop-silence']) skipped.push('video cut --drop / --tidy needs the words: paste this on the Video page with node serve.js running, or run it in the terminal');
          else if (!a.flags.keep) skipped.push('video cut needs --keep "start-end, …" or --drop "um, uh"');
          else {   // core/video.js without the Video page's model (today only the test sandbox; kept so another page could load core/video.js): --keep lands on the sentences
            var vk = Config.key('videos', c.ws); var vlib = Store.getJSON(vk, null); var vt = vlib && (vlib.videos || []).filter(function (x) { return x.id === vid || (x.title || '').toLowerCase() === vid.toLowerCase(); })[0];
            if (!vt) skipped.push('no take matches "' + vid + '"');
            else { try { var vs = vt.sources && vt.sources[0] || {}; var vres = Video.snap(Video.parseRanges(String(a.flags.keep)), (vt.phrases || []).map(function (p) { return { w: p.t, s: p.s, e: p.e }; }), { fps: vs.fps, duration: vs.duration }); if (!dry) { vt.edl = vres.edl; vt.edlHash = Video.edlHash(vres.edl); if (['recorded', 'transcribed', 'rendered'].indexOf(vt.status) >= 0) vt.status = 'cut'; vt.updatedAt = Date.now(); Store.setJSON(vk, vlib); c.touched[Config.file('videos', c.ws)] = 1; if (global.Sync && Sync.note) Sync.note(Config.file('videos', c.ws), 'video cut ' + vt.id + ' (' + vres.edl.length + ' pieces, from a reply)'); } applied.push('cut applied: ' + vt.title + ' — ' + vres.edl.length + ' piece' + (vres.edl.length === 1 ? '' : 's') + ', ' + Video.fmt(vres.runtime) + '. Next: Render a preview on the Video page'); } catch (e) { skipped.push('video cut: ' + e.message); } }
          }
        }
        else skipped.push('unknown command: ' + line.slice(0, 60));
      } catch (e) { skipped.push('could not apply: ' + line.slice(0, 60)); }
      i++;
    }
    if (!dry) Object.keys(c.touched).forEach(function (f) { if (global.Sync) { Sync.touch(f); Sync.note(f, 'agent reply applied'); } });
    if (!dry && c.config !== undefined && global.Config && Config.OVR_KEY) {
      // store the new settings (the settings.json sync picks the key up and writes the file), then reload once the file is written
      Store.set('marathon.config.dirty', '1', { silent: true });   // this page's copy wins the next settings.json write
      if (Object.keys(c.config).length) Store.setJSON(Config.OVR_KEY, c.config); else Store.set(Config.OVR_KEY, 'null');
      Sync.note('settings.json', 'settings changed from a reply');
      var reloaded = false; var go = function () { if (reloaded) return; reloaded = true; location.reload(); };
      Sync.on(function (ev, d) { if (ev === 'wrote' && d && d.file === 'settings.json') setTimeout(go, 300); });
      setTimeout(go, 4000);
    }
    return { applied: applied, skipped: skipped };
  }
  global.Apply = { run: run, plan: plan, segment: segment, tokens: tokens };
})(window);
