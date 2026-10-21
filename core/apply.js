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

  // Quotes as chats write them: "…", “…”, „…“, '…', ‘…’. A quote opens an argument only where an argument starts
  // (`--copy "…"`, `--copy=“…”`); inside one, other quote marks are the user's text and stay as typed (“ship it”,
  // don’t). An apostrophe inside a word never opens a quote; a single quote closes only before a space or the end.
  var CLOSE = { '"': '"', '\u201c': '\u201d', '\u201e': '\u201c', "'": "'", '\u2018': '\u2019' };
  function opensAt(line, i, cur) { var c = line[i]; if (!CLOSE[c]) return false; if (c === "'" || c === '\u2018') return cur === '' || /=$/.test(cur); return true; }
  function closesAt(line, i, q) { var c = line[i]; if (q === '\u201d') return c === '\u201d' || c === '\u201c' && /[\s]|^$/.test(line[i + 1] || ''); if (c !== q) return false; return q === '"' || /^(\s|$)/.test(line[i + 1] || ''); }
  function tokens(line) {   // shell-ish: quotes, --flag value, --flag=value
    var out = [], i = 0, cur = '', q = null, had = false;
    while (i < line.length) {
      var c = line[i];
      if (q) { if (closesAt(line, i, q)) { q = null; } else if (c === '\\' && line[i + 1] === q) { cur += q; i++; } else cur += c; }
      else if (opensAt(line, i, cur)) { q = CLOSE[c]; had = true; }
      else if (/\s/.test(c)) { if (cur || had) { out.push(cur); cur = ''; had = false; } }
      else cur += c;
      i++;
    }
    if (cur || had) out.push(cur);
    return out;
  }
  var TIME_WORD = /^(\d{1,2}:\d{2}|\d{1,2}(:\d{2})?\s*[ap]\.?m\.?)$/i;
  function parseArgs(toks) {
    var pos = [], flags = {};
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.indexOf('--') === 0) { var eq = t.indexOf('='); if (eq > -1) flags[t.slice(2, eq)] = t.slice(eq + 1); else if (i + 1 < toks.length && toks[i + 1].indexOf('--') !== 0) { flags[t.slice(2)] = toks[++i]; if (/^--(at|due|until)$/.test(t) && i + 1 < toks.length && TIME_WORD.test(toks[i + 1])) flags[t.slice(2)] += ' ' + toks[++i]; } else flags[t.slice(2)] = true;   // --at sat 9am: the time stays with its date (and an unreadable one is refused whole)
        if (/^--as(=|$)/.test(t) && typeof flags.as === 'string') (flags.asAll = flags.asAll || []).push(flags.as.toLowerCase()); }   // --as post … --as agent: both kept
      else pos.push(t);
    }
    return { pos: pos, flags: flags };
  }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function cleanTag(g) { return String(g || '').toLowerCase().trim().replace(/^@+/, '').replace(/\s+/g, '-'); }   // an imported label: never an @contact (that shares the task), never spaces
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
    if (/^(link|connect)\s+("[^"]+"|\u201c[^\u201d]+\u201d|\S+)\s+("[^"]+"|\u201c[^\u201d]+\u201d|\S+)(\s+--off)?\s*$/.test(line)) return true;
    if (/^(at|due)\s+(\[?(t\d+|t(?=[a-z0-9]*\d)[a-z0-9]{8,})\]?|ext:\S+|"[^"]+"|\u201c[^\u201d]+\u201d)\s+\S/i.test(line)) return true;   // at t3 …, due "Landing page" …: a task, then whatever date (an unreadable one is shown with the reason)   // link <id> <id> [--off]: one story ("link it with the script" is prose)
    if (/^(at|due)\s/.test(line)) { var toks = line.trim().replace(/\s--\w+(=\S+|\s+\S+)?/g, '').split(/\s+/); /* flags (--until 11:00) do not hide the date */ var last = (toks[toks.length - 1] || '').toLowerCase(); var prev = (toks[toks.length - 2] || '').toLowerCase(); var WD = global.When ? When.WEEKDAY : /^(mon|tue|wed|thu|fri|sat|sun)$/; return toks.length >= 3 && (last === 'clear' || /^\d{4}-\d{2}-\d{2}/.test(last) || /^\+\d+d$/.test(last) || /^(today|tomorrow|now)$/.test(last) || WD.test(last) || (/^\d{1,2}:\d{2}$/.test(last) && (/^\d{4}-\d{2}-\d{2}$/.test(prev) || /^\+\d+d$/.test(prev) || /^(today|tomorrow)$/.test(prev) || WD.test(prev)))); }
    return false;
  }
  // The way chats really write: CRLF, smart quotes, numbered or bulleted command lines, a quoted value over several lines.
  // segment() and exec() both start here, so preview and apply read the same lines.
  var LIST_MARK = /^(\s*)(?:\d{1,3}[.)]|[-*\u2022])\s+/;
  // The body of `scripts|notes add|set` (the next ``` block) is the user's text: copied as typed, never read as lines.
  var BODY_CMD = /^(\$\s*)?((node\s+solo\.js|node\s+marathon\.js|solo|marathon)\s+)?(scripts|notes)\s+(add|set)\b/;
  function cmdShaped(rest) { return /^(\$\s*)?(node\s+solo\.js|solo|marathon)\s/.test(rest) || (!/^add\s/.test(rest) && /^((social|inspo|scripts|notes|video)\s+\S+|\S+)\s+\[?([a-z]\d+|[a-z](?=[a-z0-9]*\d)[a-z0-9]{8,}|ext:\S+)\]?(\s|$)/i.test(rest)) || /["\u201c\u201e]|\s--\w/.test(rest); }   // "1. done t1", "2. add \"X\"": an id after the verb, a quote or a flag; not "3. add a demo gif" or "2. add v2 landing page"
  function normLines(text) {   // → the logical lines (a joined multi-line quote stays one entry)
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');   // quotes stay as typed: tokens() reads curly ones, and the text keeps them
    var out = []; var inFence = false; var bodyNext = false;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i]; var tr = l.trim();
      if (tr.indexOf('```') === 0) {
        var firstIn = ''; for (var f0 = i + 1; f0 < lines.length && lines[f0].trim().indexOf('```') !== 0; f0++) { if (lines[f0].trim()) { firstIn = lines[f0].trim(); break; } }
        if (!inFence && bodyNext && !looksCmd(firstIn)) {   // a script or draft body: as typed, up to its closing fence (a block of commands is not a body)
          out.push(l); var j = i + 1; while (j < lines.length && lines[j].trim().indexOf('```') !== 0) { out.push(lines[j]); j++; } if (j < lines.length) out.push(lines[j]);
          i = j; bodyNext = false; continue;
        }
        inFence = !inFence; out.push(l); continue;
      }
      var m = l.match(LIST_MARK);
      if (m && !/^\s*[-*]\s+\[[ xX]\]/.test(l)) { var rest = l.slice(m[0].length); if (looksCmd(rest.trim()) && (inFence || cmdShaped(rest.trim()))) l = m[1] + rest; }   // "1. done t1", "- start t2": the command, not a list item
      if (looksCmd(l.trim()) && quotesOpen(l)) { var k = i + 1; var joined = l; while (k < lines.length && k - i < 30 && quotesOpen(joined)) { joined += '\n' + lines[k]; k++; } if (!quotesOpen(joined)) { l = joined; i = k - 1; } }   // --copy "line one ⏎ line two"
      if (looksCmd(l.trim())) bodyNext = BODY_CMD.test(l.trim()) && !/\s--text(=|\s)/.test(l);
      out.push(l);
    }
    return out;
  }
  function normalize(text) { return normLines(text).join('\n'); }
  function quotesOpen(l) {   // a double-quoted argument left open at the end of the line (its copy goes on below)
    var q = null, cur = '';
    for (var k = 0; k < l.length; k++) { var c = l[k];
      if (q) { if (c === '\\') { k++; continue; } if (closesAt(l, k, q)) q = null; }
      else if ((c === '"' || c === '\u201c' || c === '\u201e') && opensAt(l, k, cur)) q = CLOSE[c];
      else cur = /\s/.test(c) ? '' : cur + c; }
    return !!q;
  }
  function unbracket(t) { var m = /^\[([a-z]+[a-z0-9]*)\]$/i.exec(t); return m ? m[1] : t; }   // [t7], as the snapshot shows ids
  var MISS = /^no |tasks match|^paste this line on /;   // what mutateTask returns when nothing changed
  function boxed(l) { return /^\s*[-*]\s+\[[ xX]\]\s+/.test(l); }   // "- [ ] task" is a checklist item; "- Doing: …" is prose
  // `at <task> <when>` / `due <task> <date>`: the date is the trailing one or two tokens; the rest names the task
  function splitWhen(posArr) {
    for (var n = Math.min(2, posArr.length - 1); n >= 1; n--) { var tail = posArr.slice(-n).join(' '); if (tail.toLowerCase() === 'clear' || (global.When && When.parse(tail))) return { q: posArr.slice(0, -n).join(' '), when: tail }; }
    return null;
  }


  // --ext rules, the same as solo.js (extProblem, extMerge); core/test-apply.js runs both and compares
  function extProblem(x) {
    x = String(x); if (/^share:/i.test(x)) return '--ext share:… is reserved for tasks that arrived through a share';
    if (/\s/.test(x) || x.length > 200) return '--ext takes one id without spaces, at most 200 characters';
    return '';
  }
  var COL_NAME = { todo: 'To Do', doing: 'Doing', done: 'Done', later: 'Later', bucket: 'Bucket List' };
  function extMerge(same, t, f, notes) {   // the same rule as solo.js: status and priority follow the source only when the source changed them
    var ch = [];
    if (same.title !== t.title) { same.title = t.title; ch.push('title'); }
    if (f.at !== undefined) { if (t.at) { if (same.at !== t.at) ch.push('time'); else if ((same.until || '') !== (t.until || '')) ch.push('end'); same.at = t.at; if (t.until) same.until = t.until; else delete same.until; } else if (same.at) { delete same.at; delete same.until; ch.push('time removed'); } }
    if (f.due !== undefined) { if (t.due) { if (same.due !== t.due) ch.push('due'); same.due = t.due; } else if (same.due) { delete same.due; ch.push('due removed'); } }
    if (f.col !== undefined && COLS.indexOf(f.col) >= 0) {
      var moved = same.extCol !== undefined ? same.extCol !== f.col : (same.col !== 'done' && same.col !== 'later');
      if (moved && same.col !== f.col) { ch.push('moves ' + COL_NAME[same.col] + ' \u2192 ' + COL_NAME[f.col]); same.col = f.col; }
      else if (same.col !== f.col && notes) notes.push(COL_NAME[same.col] + ' here, still ' + COL_NAME[f.col] + ' there: close it there, or move it here');
      if (same.extCol !== f.col) { same.extCol = f.col; if (!ch.length) ch.push('source status noted'); }
    }
    if (f.pri !== undefined && ['high', 'medium', 'low'].indexOf(f.pri) >= 0) {
      if ((same.extPri === undefined || same.extPri !== f.pri) && same.pri !== f.pri) { ch.push(same.pri + ' \u2192 ' + f.pri); same.pri = f.pri; }
      if (same.extPri !== f.pri) same.extPri = f.pri;
    }
    if (t.desc && same.desc !== t.desc) { same.desc = t.desc; ch.push('description'); }
    if (t.notes && !same.notes) { same.notes = t.notes; ch.push('notes'); }
    t.tags.map(cleanTag).filter(Boolean).forEach(function (g) { if (same.tags.indexOf(g) < 0) { same.tags.push(g); ch.push('#' + g); } });
    return ch;
  }
  function ctx(wsId, dry, holdAll) {   // holdAll: a preview of what a line would do on the page that saves its file
    var ws = wsId || Config.activeWs(); var boards = Config.boards(ws);
    var touched = {}; var mem = {};   // mem: dry-run overlay, so a preview sees its own earlier adds
    // A reply writes the browser copy; the page's sync writes the file. With files on disk (node serve.js or a linked
    // folder) only a page that keeps that file in sync itself may change it: elsewhere the browser copy can be missing
    // or older than the file, and writing it would overwrite newer work (or never reach the file). Such a line is
    // skipped with the page to paste it on. Without files (file://, nothing linked) the browser copy is the only one.
    var S = global.Sync; var onDisk = !!(S && S.getMode && (S.getMode() === 'server' || S.getMode() === 'folder'));
    function holds(file) { if (holdAll || !onDisk || (S.specs || []).some(function (sp) { return sp.file === file && !sp.readOnly; })) return true; lastAway = file; return false; }
    var lastAway = null;   // the file the last refused line needs (the Guide hands those lines to the page that saves it)
    function pageFor(file) {
      if (file === Config.file('social', ws)) return 'the Schedule or the Calendar';
      if (file === Config.file('scripts', ws)) return 'the Script Viewer';
      if (file === Config.file('writing', ws)) return 'the Writing Viewer';
      if (file === Config.file('videos', ws)) return 'the Video page';
      if (file === 'inspiration.json') return 'the Inspiration page or Home';
      var b = boards.filter(function (x) { return Config.boardFile(x.id, ws) === file; })[0];
      return 'Home, the Calendar' + (b ? ' or the ' + b.title + ' board' : ' or that board');
    }
    function notHere(file) { return 'paste this line on ' + pageFor(file) + ' instead: that page saves this file, and saving it from here could overwrite newer work'; }
    function boardKey(id) { return Config.boardKey(id, ws); }
    function loadBoard(id) { if (dry && mem['b:' + id]) return mem['b:' + id]; return Store.getJSON(boardKey(id), []) || []; }
    function saveBoard(id, tasks) { if (dry) { mem['b:' + id] = tasks; return; } Store.setJSON(boardKey(id), tasks); touched[Config.boardFile(id, ws)] = 1; }
    function pickBoard(flags) {   // --board, else the board open on this page, else the first
      var want = flags.board ? Config.slug(flags.board) : null;
      var open = global.Model && Model.BOARD ? boards.filter(function (x) { return x.id === Model.BOARD; })[0] : null;
      var b = want ? boards.filter(function (x) { return x.id === want || x.title.toLowerCase().indexOf(String(flags.board).toLowerCase()) >= 0; })[0] : (open || boards[0]);
      return b ? b.id : null;
    }
    function findTask(q, flags) {
      q = String(q || '').trim().toLowerCase(); var hits = [];
      var ids = flags.board ? [pickBoard(flags)] : boards.map(function (b) { return b.id; });
      if (q.indexOf('ext:') === 0) { var xq = q.slice(4); ids.forEach(function (bid) { if (!bid) return; loadBoard(bid).forEach(function (t) { if (t.ext && String(t.ext).toLowerCase() === xq) hits.push({ board: bid, t: t }); }); }); return hits.length ? hits[0] : null; }   // done ext:linear:<id>: the task an import made
      ids.forEach(function (bid) { if (!bid) return; loadBoard(bid).forEach(function (t) { if (t.id === q || t.title.toLowerCase().indexOf(q) >= 0) hits.push({ board: bid, t: t }); }); });
      var exact = hits.filter(function (h) { return h.t.id === q || h.t.title.toLowerCase() === q; });
      return exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : (hits.length ? { ambiguous: hits.length } : null);
    }
    function mutateTask(q, flags, fn) {
      var h = findTask(q, flags); if (!h) return 'no task matches "' + q + '"'; if (h.ambiguous) return h.ambiguous + ' tasks match "' + q + '" — use the id';
      if (!holds(Config.boardFile(h.board, ws))) return notHere(Config.boardFile(h.board, ws));
      var tasks = loadBoard(h.board); var t = tasks.filter(function (x) { return x.id === h.t.id; })[0]; var r = fn(t); saveBoard(h.board, tasks); return r;
    }
    function sched() { if (dry && mem.s) return mem.s; return Store.getJSON(Config.key('social', ws), []) || []; }
    function saveSched(p) { if (dry) { mem.s = p; return; } Store.setJSON(Config.key('social', ws), p); touched[Config.file('social', ws)] = 1; }
    function findPost(q) { q = String(q || '').trim().toLowerCase(); var hits = sched().filter(function (p) { return p.id === q || p.title.toLowerCase().indexOf(q) >= 0; }); return hits.length === 1 ? hits[0] : null; }
    function findExt(ext) { var hit = null; boards.forEach(function (b) { if (hit) return; var ts = loadBoard(b.id); var t = ts.filter(function (x) { return x.ext === ext; })[0]; if (t) hit = { board: b.id, tasks: ts, t: t }; }); return hit; }   // the same import on any board of the workspace
    return { ws: ws, dry: !!dry, boards: boards, touched: touched, spawn: [], holds: holds, notHere: notHere, pageFor: pageFor, takeAway: function () { var f = lastAway; lastAway = null; return f; }, boardFile: function (id) { return Config.boardFile(id, ws); }, loadBoard: loadBoard, saveBoard: saveBoard, pickBoard: pickBoard, mutateTask: mutateTask, sched: sched, saveSched: saveSched, findPost: findPost, findExt: findExt };
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
    var lines = normLines(text); var units = []; var i = 0; var inFence = false;
    function isCmd(line) { return looksCmd(line); }
    function steps(j, into) { while (j < lines.length) { var m2 = lines[j].match(/^(\s+)[-*]\s+/); if (m2 && !isCmd(lines[j].trim()) && (boxed(lines[j]) || inFence)) { into.push(lines[j]); j++; } else break; } return j; }   // indented "- [ ] step" lines belong to the line above
    while (i < lines.length) {
      var raw = lines[i]; var line = raw.trim();
      if (line.indexOf('```') === 0) { inFence = !inFence; i++; continue; }
      if (!line || (line.indexOf('#') === 0)) { i++; continue; }
      var cl = raw.match(/^(\s*)[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/);
      if (cl && !isCmd(line) && cl[1].length === 0 && (boxed(raw) || inFence)) {
        var block = [raw]; var j = steps(i + 1, block);
        units.push({ text: inFence && !boxed(raw) || inFence && block.length > 1 ? '```\n' + block.join('\n') + '\n```' : block.join('\n') }); i = j; continue;   // inside a block: the unit keeps it, so apply reads "- item" and its steps as the preview did
      }
      if (isCmd(line)) {
        var block2 = [raw]; var k = i + 1; while (k < lines.length && !lines[k].trim()) k++;
        if (/^(\$\s*)?((node\s+solo\.js|solo|marathon)\s+)?add\s/.test(line)) { var bj = steps(i + 1, block2); if (block2.length > 1) { units.push({ text: inFence ? '```\n' + block2.join('\n') + '\n```' : block2.join('\n') }); i = bj; continue; } }
        if (/^(scripts|notes)\s+(add|set)|solo\.js\s+(scripts|notes)\s+(add|set)|^(solo|marathon)\s+(scripts|notes)\s+(add|set)/.test(line.replace(/^\$\s*/, ''))) {
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
    var c = ctx(opts && opts.ws, true); var cAll = null;
    return segment(text).map(function (u) {
      c.takeAway(); var r = lines(c, u.text); var away = r.applied.length ? null : c.takeAway();
      var first = u.text.split('\n').filter(function (l) { return l.trim() && l.trim().indexOf('```') !== 0; })[0] || u.text;
      var there = away ? lines(cAll || (cAll = ctx(opts && opts.ws, true, true)), u.text).applied[0] : '';   // what it will do on that page ("scheduled post: …"), when this page's copy can tell
      return { text: u.text, label: r.applied[0] || there || first.trim().slice(0, 80), ok: !!r.applied.length, away: away || undefined, reason: r.applied.length ? '' : (r.skipped[0] || 'not a change a reply can make') };
    });
  }
  // What the Guide's Reply does: preview every unit, then apply the ones ticked (all that can apply, by default).
  // Preview and apply run the same unit texts, so what the preview showed is what lands.
  function reply(text, opts) {
    var units = plan(text, opts);
    return { units: units, apply: function (picks) {   // each unit on its own, as the preview ran it (joined back, a unit's block could read as the one before's body)
      var idx = picks || units.map(function (u, i) { return u.ok ? i : -1; }).filter(function (i) { return i >= 0; });
      var c = ctx(opts && opts.ws, false); var out = { applied: [], skipped: [], spawn: [] };
      idx.forEach(function (i) { var r = lines(c, units[i].text); out.applied = out.applied.concat(r.applied); out.skipped = out.skipped.concat(r.skipped); });
      finish(c); out.spawn = c.spawn; return out;
    } };
  }

  function run(text, opts) { var c = ctx(opts && opts.ws, !!(opts && opts.dry)); var r = lines(c, text); finish(c); r.spawn = c.spawn; return r; }
  function exec(c, text) { var r = lines(c, text); finish(c); return r; }
  function lines(c, text) {
    var applied = [], skipped = []; var dry = c.dry;
    function linkTask(task, pieceId) {   // --task <t>: the piece shows on that task's card (through the server, as `node solo.js link`)
      if (!task || task === true) return '';
      if (dry) return ' · for task ' + task;
      if (global.Story && Story.connect) { Story.connect(String(task), pieceId).catch(function (e) { if (global.flash) flash('link: ' + (e && e.message || e)); }); return ' · linked to task ' + task; }
      return ' · not linked to task ' + task + ' here: node solo.js link ' + task + ' ' + pieceId;
    }
    var lines = normLines(text); var i = 0; var inFence = false;
    var lastTask = null;
    while (i < lines.length) {
      var raw = lines[i]; var line = raw.trim();
      if (line.indexOf('```') === 0) { inFence = !inFence; i++; continue; }
      if (!line || line.indexOf('#') === 0 && !/^#\s*\[/.test(line)) { i++; continue; }
      // checklist item
      var cl = raw.match(/^(\s*)[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/);
      var isCmd = looksCmd(line);
      if (cl && !isCmd && !boxed(raw) && !inFence) { i++; continue; }   // a prose bullet ("- Doing: …"), not a task
      if (cl && !isCmd) {
        var indent = cl[1].length, done = (cl[2] || '').toLowerCase() === 'x', title = cl[3].trim();
        if (indent === 0) {
          var pri = /\((high|low)\)/i.test(title) ? title.match(/\((high|low)\)/i)[1].toLowerCase() : 'medium';
          title = title.replace(/\s*\((high|low|medium)\)/i, '').replace(/\s*·\s*\S+$/, '').trim();
          var bid = c.pickBoard({}); if (!bid) { skipped.push('no board in this workspace for: ' + title); i++; continue; }
          if (!c.holds(c.boardFile(bid))) { skipped.push(c.notHere(c.boardFile(bid)) + ' (' + title + ')'); lastTask = null; i++; continue; }
          var tasks = c.loadBoard(bid); var t = { id: uid('t'), title: title, desc: '', proj: Config.projectNames()[0], col: done ? 'done' : 'todo', pri: pri, tags: [], notes: '', collapsed: true, checklist: [] };
          tasks.unshift(t); c.saveBoard(bid, tasks); lastTask = { board: bid, id: t.id }; applied.push('added task: ' + title);
        } else if (lastTask) {
          var ts = c.loadBoard(lastTask.board); var lt = ts.filter(function (x) { return x.id === lastTask.id; })[0]; if (lt) { lt.checklist.push({ text: title, done: done }); c.saveBoard(lastTask.board, ts); }
        }
        i++; continue;
      }
      if (!isCmd) { i++; continue; }
      var toks = tokens(line.replace(/^\$\s*/, '').replace(/^(node\s+solo\.js|node\s+marathon\.js|solo|marathon)\s+/, ''));
      var a = parseArgs(toks); a.pos = a.pos.map(unbracket); var cmd = (a.pos.shift() || '').toLowerCase(); var q = a.pos.join(' ');
      try {
        if (cmd === 'add') {
          var bid2 = c.pickBoard(a.flags); if (!bid2) { skipped.push('no board for: ' + q); i++; continue; }
          var tasks2 = c.loadBoard(bid2);
          var nt = { id: uid('t'), title: q, desc: a.flags.desc || '', proj: a.flags.proj || Config.projectNames()[0], col: COLS.indexOf(a.flags.col) >= 0 ? a.flags.col : 'todo', pri: ['high', 'medium', 'low'].indexOf(a.flags.pri) >= 0 ? a.flags.pri : 'medium', tags: split(a.flags.tags).map(function (s) { return s.toLowerCase(); }), notes: a.flags.notes || '', collapsed: true, checklist: String(a.flags.steps || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { text: s, done: false }; }) };
          var untilDropped = false;
          if (a.flags.at && global.When) { var pa = When.parse(a.flags.at); if (pa) { nt.at = pa.stamp; if (a.flags.until) { nt.until = When.until(nt.at, a.flags.until); if (!nt.until) untilDropped = true; } } }
          if (a.flags.due && global.When) { var pd = When.parse(a.flags.due); if (pd) nt.due = When.dayKey(pd.stamp); }
          var badWhen = ['at', 'until', 'due'].filter(function (k) { var v = a.flags[k]; return v !== undefined && v !== true && String(v).toLowerCase() !== 'clear' && global.When && (k === 'until' ? (!nt.at || !When.until(nt.at, v)) : !When.parse(v)); })[0];
          if (badWhen) { skipped.push('could not read --' + badWhen + ' "' + a.flags[badWhen] + '" (' + q + '): write it as 2026-10-30, tomorrow 14:00, fri 10:00 or +3d, then paste the line again'); i++; continue; }   // a task never lands without the date it was given
          if (a.flags.ext) nt.tags = nt.tags.map(cleanTag).filter(Boolean);
          if (a.flags.ext) { var xp = extProblem(a.flags.ext); if (xp) { skipped.push(xp + ' (' + q + ')'); i++; continue; } nt.ext = String(a.flags.ext); if (COLS.indexOf(a.flags.col) >= 0) nt.extCol = a.flags.col; if (['high', 'medium', 'low'].indexOf(a.flags.pri) >= 0) nt.extPri = a.flags.pri; }
          var hitX = nt.ext ? c.findExt(nt.ext) : null; var same = hitX ? hitX.t : null;
          if (!same && !c.holds(c.boardFile(bid2))) { skipped.push(c.notHere(c.boardFile(bid2)) + ' (' + q + ')'); i++; continue; }   // after the checks: a date it cannot read is said here, not after a hop
          [['draft', 'noteId', 'writing'], ['script', 'scriptId', 'script'], ['take', 'takeId', 'video'], ['post', 'postId', '']].forEach(function (r) { if (a.flags[r[0]] && typeof a.flags[r[0]] === 'string') { nt[r[1]] = String(a.flags[r[0]]); if (r[2] && nt.tags.indexOf(r[2]) < 0) nt.tags.push(r[2]); } });   // add … --draft n1 | --script s1 | --take v1 | --post p1: the task carries its piece and the tag (core/story.js)
          if (same && !c.holds(c.boardFile(hitX.board))) { skipped.push(c.notHere(c.boardFile(hitX.board)) + ' (' + q + ')'); i++; continue; }
          if (same) { var ntX = []; var chX = extMerge(same, nt, a.flags, ntX); if (chX.length) c.saveBoard(hitX.board, hitX.tasks); lastTask = { board: hitX.board, id: same.id }; applied.push((chX.length ? 'update: ' + same.title + ' · ' + chX.join(', ') : 'up to date: ' + same.title) + (ntX.length ? ' · ' + ntX.join('; ') : '')); }
          else { tasks2.unshift(nt); c.saveBoard(bid2, tasks2); lastTask = { board: bid2, id: nt.id }; applied.push('added task: ' + q + (nt.at ? ' · ' + nt.at.replace('T', ' ') : '') + (untilDropped ? ' (end time ignored: before the start)' : '')); }
        } else if (['done', 'start', 'later', 'bucket', 'todo'].indexOf(cmd) >= 0) {
          var col = { done: 'done', start: 'doing', later: 'later', bucket: 'bucket', todo: 'todo' }[cmd];
          var r = c.mutateTask(q, a.flags, function (t) { t.col = col; return cmd + ': ' + t.title; }); (MISS.test(r) ? skipped : applied).push(r);
        } else if (cmd === 'move') {
          var col2 = a.pos.pop(); var r2 = c.mutateTask(a.pos.join(' '), a.flags, function (t) { t.col = COLS.indexOf(col2) >= 0 ? col2 : t.col; return 'moved to ' + col2 + ': ' + t.title; }); (MISS.test(r2) ? skipped : applied).push(r2);
        } else if (cmd === 'pri') {
          var p = a.pos.pop(); var r3 = c.mutateTask(a.pos.join(' '), a.flags, function (t) { t.pri = p === 'med' ? 'medium' : p; return 'priority ' + t.pri + ': ' + t.title; }); (MISS.test(r3) ? skipped : applied).push(r3);
        } else if (cmd === 'tag') {
          var ops = a.pos.filter(function (x) { return /^[+-]/.test(x); }); var qq = a.pos.filter(function (x) { return !/^[+-]/.test(x); }).join(' ');
          var r4 = c.mutateTask(qq, a.flags, function (t) { ops.forEach(function (o) { var tg = o.slice(1).toLowerCase(); if (o[0] === '+' && t.tags.indexOf(tg) < 0) t.tags.push(tg); if (o[0] === '-') t.tags = t.tags.filter(function (x) { return x !== tg; }); }); return 'tags ' + t.tags.join(', ') + ': ' + t.title; }); (MISS.test(r4) ? skipped : applied).push(r4);
        } else if (cmd === 'step') {
          var txt = a.flags.text || a.pos.slice(1).join(' '); var r5 = c.mutateTask(a.flags.text ? q : a.pos[0], a.flags, function (t) { t.checklist.push({ text: txt, done: false }); return 'step added: ' + t.title; }); (MISS.test(r5) ? skipped : applied).push(r5);
        } else if (cmd === 'check' || cmd === 'uncheck') {
          var n = parseInt(a.pos.pop(), 10); var r6 = c.mutateTask(a.pos.join(' '), a.flags, function (t) { if (t.checklist[n - 1]) t.checklist[n - 1].done = cmd === 'check'; return cmd + ' ' + n + ': ' + t.title; }); (MISS.test(r6) ? skipped : applied).push(r6);
        } else if (cmd === 'note') {
          var txt2 = a.flags.text || a.pos.slice(1).join(' '); var r7 = c.mutateTask(a.flags.text ? q : a.pos[0], a.flags, function (t) { t.notes = (t.notes ? t.notes + '\n' : '') + txt2; return 'note added: ' + t.title; }); (MISS.test(r7) ? skipped : applied).push(r7);
        } else if (cmd === 'at' || cmd === 'due') {
          var idFirst = a.pos.length >= 2 && /^(t\d+|t(?=[a-z0-9]*\d)[a-z0-9]{8,}|ext:\S+)$/i.test(a.pos[0]);   // at t3 <when>: everything after the id is the date
          var sw = idFirst ? { q: a.pos[0], when: a.pos.slice(1).join(' ') } : splitWhen(a.pos);
          var WHEN_HELP = 'write it as 2026-10-30, 2026-10-30T14:00, tomorrow 14:00, fri 10:00 or +3d, then paste the line again';
          if (!sw) { skipped.push(a.pos.length >= 2 ? 'could not read a date at the end of "' + a.pos.join(' ') + '": ' + WHEN_HELP : cmd + ': give a task and a date, e.g. `' + cmd + ' t3 tomorrow 14:00`'); i++; continue; }
          if (sw.when.toLowerCase() !== 'clear' && !(global.When && When.parse(sw.when))) { skipped.push('could not read the date "' + sw.when + '" for ' + sw.q + ': ' + WHEN_HELP); i++; continue; }
          var r8 = c.mutateTask(sw.q, a.flags, function (t) {
            if (sw.when.toLowerCase() === 'clear') { if (cmd === 'at') { delete t.at; delete t.until; } else delete t.due; return (cmd === 'at' ? 'unscheduled: ' : 'due date removed: ') + t.title; }
            var pw = When.parse(sw.when); if (cmd === 'at') { t.at = pw.stamp; var u8 = a.flags.until ? When.until(t.at, a.flags.until) : ''; if (u8) t.until = u8; else delete t.until; return 'at ' + t.at.replace('T', ' ') + (u8 ? '–' + When.timeOf(u8) : a.flags.until ? ' (end time ignored: before the start)' : '') + ': ' + t.title; }
            t.due = When.dayKey(pw.stamp); return 'due ' + t.due + ': ' + t.title;
          }); (MISS.test(r8) ? skipped : applied).push(r8);
        } else if (cmd === 'link' || cmd === 'connect') {   // one story: the page writes its own field itself, anything else goes through the server; without it, the terminal
          if (!global.Story || !Story.connect) skipped.push('link: paste it on the Drafts, Scripts, Video or Schedule page (they show the story), or run it in the terminal');
          else if (dry) applied.push((a.flags.off ? 'disconnect ' : 'connect ') + (a.pos[0] || '') + ' and ' + (a.pos[1] || ''));
          else { var lp = a.flags.off ? Story.disconnect(a.pos[0], a.pos[1]) : Story.connect(a.pos[0], a.pos[1]); lp.then(function () { if (global.flash) flash('Connected: ' + a.pos[0] + ' and ' + a.pos[1]); }).catch(function (e) { if (global.flash) flash('link: ' + (e && e.message || e)); }); applied.push((a.flags.off ? 'disconnecting ' : 'connecting ') + (a.pos[0] || '') + ' and ' + (a.pos[1] || '') + ' (the page shows it when done)'); }
        } else if (cmd === 'rm' || cmd === 'del') {
          skipped.push('not deleting "' + q + '" from a pasted reply — delete it yourself if you agree');
        } else if (cmd === 'social' || cmd === 'post') {
          var sub = (a.pos.shift() || '').toLowerCase(); var sq = a.pos.join(' ');
          var socialHere = c.holds(Config.file('social', c.ws)) || (c.takeAway(), false);   // add and move say a bad date first, then where they go
          if (['posted', 'ready', 'draft', 'copy', 'prep'].indexOf(sub) >= 0 && !c.holds(Config.file('social', c.ws))) { skipped.push(c.notHere(Config.file('social', c.ws))); i++; continue; }
          if (sub === 'add') {
            var posts = c.sched(); var np = { id: uid('p'), datetime: parseWhen(a.flags.at), title: sq, postType: a.flags.type || 'update', format: a.flags.format || 'text', project: a.flags.project || a.flags.proj || Config.projectNames()[0], copy: a.flags.copy || '', video: { title: '', status: 'none', notes: '', link: '' }, links: [], assets: [], prep: String(a.flags.prep || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { text: s, done: false, kind: 'content' }; }), notes: a.flags.notes || '', status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } };
            if (a.flags.draft) np.noteId = String(a.flags.draft); if (a.flags.script) np.scriptId = String(a.flags.script);   // the post remembers the draft or the script it came from
            if (a.flags.at && a.flags.at !== true && global.When && !When.parse(String(a.flags.at))) { skipped.push('could not read --at "' + a.flags.at + '" (' + sq + '): write it as 2026-10-30T09:00, tomorrow 9:00, fri 10:00 or +3d 9:00, then paste the line again'); i++; continue; }
            if (!socialHere) { c.holds(Config.file('social', c.ws)); skipped.push(c.notHere(Config.file('social', c.ws))); i++; continue; }
            posts.push(np); c.saveSched(posts); applied.push('scheduled post: ' + sq + ' · ' + np.datetime.replace('T', ' ') + linkTask(a.flags.task, np.id));
            if (a.flags.take && !dry && global.Story && Story.connect) Story.connect(String(a.flags.take), np.id).catch(function (e) { if (global.flash) flash('link: ' + (e && e.message || e)); });   // --take: the take's postId lives on the take, written through the server
          } else if (['posted', 'ready', 'draft'].indexOf(sub) >= 0) {
            var pp = c.findPost(sq); if (!pp) skipped.push('no post matches "' + sq + '"'); else { var ps = c.sched(); ps.forEach(function (x) { if (x.id === pp.id) { x.status = sub; if (sub === 'posted') { x.posted = x.posted || {}; x.posted.postedAt = x.posted.postedAt || localDT(new Date()); if (a.flags.url) x.posted.url = a.flags.url; } } }); c.saveSched(ps); applied.push(sub + ': ' + pp.title); }
          } else if (sub === 'copy') {
            var ctext = a.flags.text || a.pos.slice(1).join(' '); var cp = c.findPost(a.flags.text ? sq : a.pos[0]); if (!cp) skipped.push('no post matches'); else { var ps2 = c.sched(); ps2.forEach(function (x) { if (x.id === cp.id) x.copy = ctext; }); c.saveSched(ps2); applied.push('copy written: ' + cp.title); }
          } else if (sub === 'prep') {
            var ptext = a.flags.text || a.pos.slice(1).join(' '); var pq = c.findPost(a.flags.text ? sq : a.pos[0]); if (!pq) skipped.push('no post matches'); else { var ps3 = c.sched(); ps3.forEach(function (x) { if (x.id === pq.id) x.prep.push({ text: ptext, done: false, kind: 'content' }); }); c.saveSched(ps3); applied.push('prep added: ' + pq.title); }
          } else if (sub === 'move') {
            var when = a.pos.pop(); if (/^\d{1,2}:\d{2}$/.test(when) && a.pos.length > 1) when = a.pos.pop() + ' ' + when;   // "+7d 09:00"
            if (global.When && !When.parse(when)) { skipped.push('could not read the new time "' + when + '": write it as 2026-10-30T09:00, tomorrow 9:00 or +3d 9:00'); i++; continue; }
            if (!socialHere) { c.holds(Config.file('social', c.ws)); skipped.push(c.notHere(Config.file('social', c.ws))); i++; continue; }
            var mp = c.findPost(a.pos.join(' ')); if (!mp) skipped.push('no post matches'); else { var ps4 = c.sched(); ps4.forEach(function (x) { if (x.id === mp.id) x.datetime = parseWhen(when); }); c.saveSched(ps4); applied.push('rescheduled: ' + mp.title); }
          } else skipped.push('social ' + sub + ' is not supported here');
        } else if (cmd === 'scripts' || cmd === 'notes') {
          var sub2 = (a.pos.shift() || '').toLowerCase(); var title2 = a.pos.join(' ');
          if (sub2 !== 'add' && sub2 !== 'set') { skipped.push(cmd + ' ' + sub2 + ': run it in your terminal (a reply adds or replaces ' + cmd + ', nothing else)'); i++; continue; }
          var fence = a.flags.text ? null : bodyAfter(lines, i, inFence); var body = a.flags.text || (fence ? fence.text : '');
          var fileSN = Config.file(cmd === 'scripts' ? 'scripts' : 'writing', c.ws);
          if (!c.holds(fileSN)) { skipped.push(c.notHere(fileSN)); if (fence) { i = fence.end; inFence = false; } i++; continue; }   // the body goes with its line
          if (sub2 === 'set') {   // scripts set <id> / notes set <id>: the full new text in the block under it replaces the item's text (Improve, Edit this draft, Ten hooks)
            var kS = Config.key(cmd === 'scripts' ? 'scripts' : 'writing', c.ws); var libS = Store.getJSON(kS, null) || {}; var arr = (cmd === 'scripts' ? libS.scripts : libS.notes) || [];
            var tq2 = title2.toLowerCase(); var headOf = function (x) { return ((x.text || '').match(/^#\s+(.+)/m) || [])[1] || ''; };   // a draft has no title field: its first heading
            var hitS = arr.filter(function (x) { return x.id === title2 || (x.title || headOf(x)).trim().toLowerCase() === tq2; })[0];
            if (!hitS) skipped.push('no ' + (cmd === 'scripts' ? 'script' : 'draft') + ' matches "' + title2 + '": use its id (' + (cmd === 'scripts' ? 's…' : 'n…') + ') as the prompt shows it');
            else if (!body.trim()) skipped.push(cmd + ' set ' + title2 + ': the new text goes in a ``` block right under this line');
            else { if (!dry) { hitS.text = body; if (cmd === 'scripts') hitS.title = (body.match(/^#\s+(.+)/m) || [])[1] || hitS.title; hitS.updatedAt = Date.now(); Store.setJSON(kS, libS); c.touched[Config.file(cmd === 'scripts' ? 'scripts' : 'writing', c.ws)] = 1; } applied.push((cmd === 'scripts' ? 'script' : 'draft') + ' rewritten: ' + (hitS.title || (body.match(/^#\s+(.+)/m) || [])[1] || hitS.id)); }
            if (fence) { i = fence.end; inFence = false; } i++; continue;
          }
          if (cmd === 'scripts') {
            var k = Config.key('scripts', c.ws); var lib = Store.getJSON(k, { activeId: '', scripts: [] }) || { activeId: '', scripts: [] }; lib.scripts = lib.scripts || [];
            var si = { id: uid('s'), title: title2 || 'Untitled', text: body || ('# ' + title2 + '\n\n## Hook\n\n## Script\n1. \n'), createdAt: Date.now(), updatedAt: Date.now() , noteId: a.flags.draft ? String(a.flags.draft) : '' }; lib.scripts.unshift(si); lib.activeId = si.id; if (!dry) { Store.setJSON(k, lib); c.touched[Config.file('scripts', c.ws)] = 1; } applied.push('script added: ' + si.title + (body ? '' : ' (empty — no code block followed)') + linkTask(a.flags.task, si.id));
          } else {
            var k2 = Config.key('writing', c.ws); var nl = Store.getJSON(k2, { activeId: '', notes: [] }) || { activeId: '', notes: [] }; nl.notes = nl.notes || [];
            var ni = { id: uid('n'), text: body || ('# ' + title2 + '\n\n'), images: {}, createdAt: Date.now(), updatedAt: Date.now() }; nl.notes.unshift(ni); nl.activeId = ni.id; if (!dry) { Store.setJSON(k2, nl); c.touched[Config.file('writing', c.ws)] = 1; } applied.push('note added: ' + (title2 || 'untitled') + linkTask(a.flags.task, ni.id));
          }
          if (fence) { i = fence.end; inFence = false; }   // the body's closing fence is consumed with it
        } else if (cmd === 'inspo' && (a.pos[0] || '').toLowerCase() === 'make') {   // the second half of `inspo use` from a page that saves inspiration but not the piece (core/guide.js carries it here)
          var mk = String(a.pos[1] || '').toLowerCase(); var dm = null; try { dm = JSON.parse(decodeURIComponent(String(a.flags.data || ''))); } catch (e) { dm = null; }
          var idM = String(a.flags.id || ''); var fileM = mk === 'task' ? null : Config.file(mk === 'post' ? 'social' : mk === 'script' ? 'scripts' : 'writing', c.ws);
          var bM = mk === 'task' ? c.pickBoard(dm && dm.board ? { board: dm.board } : {}) : null; if (mk === 'task') fileM = bM ? c.boardFile(bM) : null;
          var lM = mk === 'script' || mk === 'note' ? (Store.getJSON(Config.key(mk === 'script' ? 'scripts' : 'writing', c.ws), null) || {}) : null;
          var taken = mk === 'task' ? c.boards.some(function (b) { return c.loadBoard(b.id).some(function (x) { return x.id === idM; }); }) : mk === 'post' ? c.sched().some(function (x) { return x.id === idM; }) : ((mk === 'script' ? lM.scripts : lM && lM.notes) || []).some(function (x) { return x.id === idM; });
          if (!dm || !dm.t || ['task', 'post', 'script', 'note'].indexOf(mk) < 0 || !/^[tpsn][a-z0-9]{6,}$/.test(idM)) skipped.push('inspo make: this line comes from Continue on … after inspo use; paste the inspo use line instead');
          else if (!fileM) skipped.push('no board matches "' + dm.board + '"');
          else if (!c.holds(fileM)) skipped.push(c.notHere(fileM));
          else if (taken) skipped.push('already made: ' + dm.t + ' (this hand-off was applied before)');   // Back and Continue again never makes a second one
          else {
            var refM = dm.ref || '';
            if (mk === 'task') { var tM = c.loadBoard(bM); tM.unshift({ id: idM, title: dm.t, desc: '', proj: Config.projectNames()[0], col: 'todo', pri: 'medium', tags: (dm.tags || []).map(cleanTag).filter(Boolean), notes: refM, collapsed: true, checklist: [] }); c.saveBoard(bM, tM); }
            else if (mk === 'post') { var pM = c.sched(); pM.push({ id: idM, datetime: parseWhen(''), title: dm.t, postType: 'update', format: 'text', project: Config.projectNames()[0], copy: '', video: { title: '', status: 'none', notes: '', link: '' }, links: /^https?:/.test(refM) ? [{ label: 'inspiration', url: refM.split('\n')[0], kind: 'reference' }] : [], assets: [], prep: [], notes: refM, status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } }); c.saveSched(pM); }
            else { var kM = Config.key(mk === 'script' ? 'scripts' : 'writing', c.ws); var listM = mk === 'script' ? (lM.scripts = lM.scripts || []) : (lM.notes = lM.notes || []); var txtM = '# ' + dm.t + '\n\n' + refM + '\n'; listM.unshift(mk === 'script' ? { id: idM, title: dm.t, text: txtM, createdAt: Date.now(), updatedAt: Date.now(), noteId: '' } : { id: idM, text: txtM, images: {}, createdAt: Date.now(), updatedAt: Date.now() }); lM.activeId = idM; if (!dry) { Store.setJSON(kM, lM); c.touched[fileM] = 1; } }
            applied.push((mk === 'note' ? 'draft' : mk) + ' made from inspiration: ' + dm.t);
          }
        } else if (cmd === 'inspo') {
          var sub3 = (a.pos.shift() || '').toLowerCase();
          if (['add', 'tag', 'ws', 'archive', 'use'].indexOf(sub3) >= 0 && !c.holds('inspiration.json')) { skipped.push(c.notHere('inspiration.json')); i++; continue; }
          if (!dry && ['add', 'tag', 'ws', 'archive', 'use'].indexOf(sub3) >= 0) c.touched['inspiration.json'] = 1;   // logged as the reply's (InspoModel writes the key itself)
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
          else if (sub3 === 'use' && global.InspoModel) {   // inspo use <item> --as task|post|script|note: the piece, with the link back, and the item marked used
            if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; }
            var uq = a.pos.join(' '); var ul = uq.toLowerCase(); var uh = InspoModel.getState().filter(function (x) { return x.id === uq || (x.title || '').toLowerCase().indexOf(ul) >= 0; });
            var as = (a.flags.asAll || []).map(function (v) { return v === 'draft' ? 'note' : v; }).filter(function (v) { return ['task', 'post', 'script', 'note'].indexOf(v) >= 0; })[0] || (a.flags.post === true ? 'post' : a.flags.script === true ? 'script' : a.flags.draft === true ? 'note' : (a.flags.asAll || []).filter(function (v) { return v !== 'agent' && v !== 'cli'; })[0] || 'task');
            if (uh.length !== 1) skipped.push((uh.length ? 'several' : 'no') + ' inspiration items match "' + uq + '"');
            else if (['task', 'post', 'script', 'note'].indexOf(as) < 0) skipped.push('inspo use: --as task, post, script or note');
            else if (as === 'task' && !c.pickBoard(a.flags)) skipped.push('no board matches "' + a.flags.board + '"');
            else if (!c.holds(as === 'task' ? c.boardFile(c.pickBoard(a.flags)) : Config.file(as === 'post' ? 'social' : as === 'script' ? 'scripts' : 'writing', c.ws))) {
              // the piece's file is saved on another page: mark the item used here (this page saves inspiration) with the piece's id
              // reserved, and hand the line that makes it, carrying that id, to its page (Continue on … after Apply)
              var pf = c.takeAway(); var itS = uh[0]; var ttlS = (itS.title || itS.url || 'From inspiration').slice(0, 120); var refS = [itS.url, itS.text].filter(Boolean).join('\n');
              var idS = uid(as === 'task' ? 't' : as === 'post' ? 'p' : as === 'script' ? 's' : 'n');
              var dataS = encodeURIComponent(JSON.stringify({ t: ttlS, ref: refS, tags: (itS.tags || []).slice(0, 3), from: itS.id, board: a.flags.board && a.flags.board !== true ? String(a.flags.board) : '' }));   // one token: no space, quote, newline or fence survives encoding
              var lineS = 'inspo make ' + as + ' --id ' + idS + ' --data ' + dataS;
              c.spawn.push({ file: pf, text: lineS });
              if (!dry) InspoModel.markUsed(itS.id, as === 'note' ? 'writing' : as === 'script' ? 'scripts' : as === 'post' ? 'social' : 'board', idS);
              applied.push('marked as used: ' + ttlS + ' · the ' + (as === 'note' ? 'draft' : as) + ' is made on the page that saves it (Continue below after Apply)');
            }
            else {
              var it2 = uh[0]; var ttl = (it2.title || it2.url || 'From inspiration').slice(0, 120); var ref = [it2.url, it2.text].filter(Boolean).join('\n'); var made = '';
              if (as === 'task') { var bu = c.pickBoard(a.flags); if (bu) { var tu = c.loadBoard(bu); var ntu = { id: uid('t'), title: ttl, desc: '', proj: Config.projectNames()[0], col: 'todo', pri: 'medium', tags: (it2.tags || []).slice(0, 3), notes: ref, collapsed: true, checklist: [] }; tu.unshift(ntu); c.saveBoard(bu, tu); made = ntu.id; } }
              else if (as === 'post') { var pu = c.sched(); var npu = { id: uid('p'), datetime: parseWhen(''), title: ttl, postType: 'update', format: 'text', project: Config.projectNames()[0], copy: '', video: { title: '', status: 'none', notes: '', link: '' }, links: it2.url ? [{ label: 'inspiration', url: it2.url, kind: 'reference' }] : [], assets: [], prep: [], notes: ref, status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } }; pu.push(npu); c.saveSched(pu); made = npu.id; }
              else { var kU = Config.key(as === 'script' ? 'scripts' : 'writing', c.ws); var lU = Store.getJSON(kU, null) || {}; var listU = as === 'script' ? (lU.scripts = lU.scripts || []) : (lU.notes = lU.notes || []); var idU = uid(as === 'script' ? 's' : 'n'); var txtU = '# ' + ttl + '\n\n' + ref + '\n'; listU.unshift(as === 'script' ? { id: idU, title: ttl, text: txtU, createdAt: Date.now(), updatedAt: Date.now(), noteId: '' } : { id: idU, text: txtU, images: {}, createdAt: Date.now(), updatedAt: Date.now() }); lU.activeId = idU; if (!dry) { Store.setJSON(kU, lU); c.touched[Config.file(as === 'script' ? 'scripts' : 'writing', c.ws)] = 1; } made = idU; }
              if (!dry && made) InspoModel.markUsed(it2.id, as === 'note' ? 'writing' : as === 'script' ? 'scripts' : as === 'post' ? 'social' : 'board', made);
              applied.push('used as ' + (as === 'note' ? 'a draft' : 'a ' + as) + ': ' + ttl);
            }
          }
          else skipped.push('inspo ' + sub3 + ': run it in your terminal (a reply adds, tags, files, archives or uses inspiration)');
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
        } else if (['week', 'today', 'list', 'show', 'log', 'activity', 'boards', 'workspaces', 'config', 'help', 'share', 'review', 'calendar', 'menu', 'story'].indexOf(cmd) >= 0) {
          skipped.push(['boards', 'workspaces', 'config'].indexOf(cmd) >= 0 && a.pos.length ? cmd + ' ' + a.pos[0] + ': run it in your terminal (a reply cannot change boards, projects or settings here)' : cmd + ': a command that only shows things, nothing for a reply to apply');
        } else if (cmd === 'video') {
          // `video cut <take> --keep "…"` / `--drop "…"` writes the cut (the Video page renders it; a reply never renders). Every other video step needs ffmpeg: the terminal, or the page's buttons.
          var vsub = (a.pos.shift() || '').toLowerCase(); var vid = a.pos.join(' ');
          if (vsub === 'title' || vsub === 'rename') {   // video title <take> "New": the take's title
            var tq = a.pos[0] || ''; var tt = a.pos.slice(1).join(' ') || a.flags.title || ''; var vkT = Config.key('videos', c.ws); var vlT = Store.getJSON(vkT, null); var vtT = vlT && (vlT.videos || []).filter(function (x) { return x.id === tq || (x.title || '').toLowerCase() === tq.toLowerCase(); })[0];
            if (!global.VideoModel && !c.holds(Config.file('videos', c.ws))) skipped.push(c.notHere(Config.file('videos', c.ws)));
            else if (!vtT) skipped.push('no take matches "' + tq + '"'); else if (!tt.trim()) skipped.push('video title: give the new title'); else { if (!dry) { if (global.VideoModel && VideoModel.rename) VideoModel.rename(vtT, tt); else { vtT.title = tt.trim().slice(0, 120); vtT.renamedAt = Date.now(); vtT.updatedAt = Date.now(); Store.setJSON(vkT, vlT); c.touched[Config.file('videos', c.ws)] = 1; if (global.Sync && Sync.note) Sync.note(Config.file('videos', c.ws), 'video title ' + vtT.id + ': ' + tt); } } applied.push('renamed take: ' + tt.trim()); }
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
            if (dry) { var dt = VideoModel.get(vid) || VideoModel.list().filter(function (x) { return x.title.toLowerCase() === vid.toLowerCase(); })[0]; if (!dt) skipped.push('no take matches "' + vid + '"'); else if ((a.flags.drop || a.flags.tidy || a.flags['drop-silence'] || a.flags.retakes) && !VideoModel.hasWords(dt.id)) skipped.push('video cut --drop / --tidy needs the words: open the Video page with node serve.js running, or run it in the terminal'); else { try { if (a.flags.keep) Video.parseRanges(String(a.flags.keep)); applied.push('cut take: ' + dt.title + ' (' + (a.flags.keep ? 'keep ' + a.flags.keep : a.flags.drop ? 'drop ' + a.flags.drop : a.flags.tidy ? 'remove fillers and pauses' : 'shorten pauses') + ')'); } catch (e) { skipped.push('video cut: ' + e.message); } } }
            else { try { var vr = VideoModel.cutFromLine(vid, a.flags); c.touched[Config.file('videos', c.ws)] = 1; applied.push('cut applied: ' + vr.take.title + ' — ' + vr.edl.length + ' piece' + (vr.edl.length === 1 ? '' : 's') + ', ' + VideoModel.fmt(vr.runtime) + '. Next: Render a preview (the reply cannot render)'); } catch (e) { skipped.push('video cut: ' + e.message); } }
          } else if (a.flags.drop || a.flags.tidy || a.flags['drop-silence'] || a.flags.retakes) skipped.push('video cut --drop / --tidy / --retakes needs the words: paste this on the Video page with node serve.js running, or run it in the terminal');
          else if (!a.flags.keep) skipped.push('video cut needs --keep "start-end, …" or --drop "um, uh"');
          else {   // core/video.js without the Video page's model (today only the test sandbox; kept so another page could load core/video.js): --keep lands on the sentences
            var vk = Config.key('videos', c.ws); var vlib = Store.getJSON(vk, null); var vt = vlib && (vlib.videos || []).filter(function (x) { return x.id === vid || (x.title || '').toLowerCase() === vid.toLowerCase(); })[0];
            if (!c.holds(Config.file('videos', c.ws))) skipped.push(c.notHere(Config.file('videos', c.ws)));
            else if (!vt) skipped.push('no take matches "' + vid + '"');
            else { try { var vs = vt.sources && vt.sources[0] || {}; var vres = Video.snap(Video.parseRanges(String(a.flags.keep)), (vt.phrases || []).map(function (p) { return { w: p.t, s: p.s, e: p.e }; }), { fps: vs.fps, duration: vs.duration }); if (!dry) { vt.edl = vres.edl; vt.edlHash = Video.edlHash(vres.edl); if (['recorded', 'transcribed', 'rendered'].indexOf(vt.status) >= 0) vt.status = 'cut'; vt.updatedAt = Date.now(); Store.setJSON(vk, vlib); c.touched[Config.file('videos', c.ws)] = 1; if (global.Sync && Sync.note) Sync.note(Config.file('videos', c.ws), 'video cut ' + vt.id + ' (' + vres.edl.length + ' pieces, from a reply)'); } applied.push('cut applied: ' + vt.title + ' — ' + vres.edl.length + ' piece' + (vres.edl.length === 1 ? '' : 's') + ', ' + Video.fmt(vres.runtime) + '. Next: Render a preview on the Video page'); } catch (e) { skipped.push('video cut: ' + e.message); } }
          }
        }
        else skipped.push('not a command a reply knows: ' + line.slice(0, 60));
      } catch (e) { skipped.push('could not apply: ' + line.slice(0, 60)); }
      i++;
    }
    return { applied: applied, skipped: skipped };
  }
  function finish(c) {   // once per apply: label the files the reply changed, store new settings
    var dry = c.dry; if (c.finished) return; c.finished = true;
    if (!dry) Object.keys(c.touched).forEach(function (f) { if (global.Sync) { Sync.touch(f); Sync.note(f, 'a pasted reply', 'reply'); } });
    if (!dry && c.config !== undefined && global.Config && Config.OVR_KEY) {
      // store the new settings (the settings.json sync picks the key up and writes the file), then reload once the file is written
      Store.set('marathon.config.dirty', '1', { silent: true });   // this page's copy wins the next settings.json write
      if (Object.keys(c.config).length) Store.setJSON(Config.OVR_KEY, c.config); else Store.set(Config.OVR_KEY, 'null');
      Sync.note('settings.json', 'settings changed from a reply', 'reply');
      var reloaded = false; var go = function () { if (reloaded) return; reloaded = true; location.reload(); };
      Sync.on(function (ev, d) { if (ev === 'wrote' && d && d.file === 'settings.json') setTimeout(go, 300); });
      setTimeout(go, 4000);
    }
  }
  global.Apply = { run: run, plan: plan, reply: reply, segment: segment, tokens: tokens, normalize: normalize };
})(window);
