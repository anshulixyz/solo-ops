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
  function parseWhen(v) {
    var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    if (!v) return localDT(d);
    var m = String(v).match(/^\+(\d+)d(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (m) { d = new Date(); d.setDate(d.getDate() + parseInt(m[1], 10)); d.setHours(m[2] ? +m[2] : 9, m[3] ? +m[3] : 0, 0, 0); return localDT(d); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v + 'T09:00';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v.slice(0, 16);
    var d2 = new Date(v); return isNaN(d2) ? localDT(d) : localDT(d2);
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

  // Split a reply into units: one command (plus its fenced block) or one
  // checklist item (plus its indented steps). Used for the preview.
  function segment(text) {
    var lines = String(text || '').split('\n'); var units = []; var i = 0;
    function isCmd(line) { return /^(\$\s*)?(node\s+solo\.js|node\s+marathon\.js|solo|marathon)\s+/.test(line) || /^(add|done|start|later|bucket|todo|move|pri|tag|step|check|note|rm|del|social|post|scripts|notes|inspo)\s/.test(line); }
    while (i < lines.length) {
      var raw = lines[i]; var line = raw.trim();
      if (!line || line.indexOf('```') === 0 || (line.indexOf('#') === 0)) { i++; continue; }
      var cl = raw.match(/^(\s*)[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/);
      if (cl && !isCmd(line) && cl[1].length === 0) {
        var block = [raw]; var j = i + 1;
        while (j < lines.length) { var m2 = lines[j].match(/^(\s+)[-*]\s+/); if (m2 && !isCmd(lines[j].trim())) { block.push(lines[j]); j++; } else break; }
        units.push({ text: block.join('\n') }); i = j; continue;
      }
      if (isCmd(line)) {
        var block2 = [raw]; var k = i + 1; while (k < lines.length && !lines[k].trim()) k++;
        if (/^(scripts|notes)\s+add|solo\.js\s+(scripts|notes)\s+add|^(solo|marathon)\s+(scripts|notes)\s+add/.test(line.replace(/^\$\s*/, '')) && k < lines.length && lines[k].trim().indexOf('```') === 0) {
          block2.push(lines[k]); k++; while (k < lines.length && lines[k].trim().indexOf('```') !== 0) { block2.push(lines[k]); k++; } if (k < lines.length) { block2.push(lines[k]); k++; }
          units.push({ text: block2.join('\n') }); i = k; continue;
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
    var lines = String(text || '').split('\n'); var i = 0;
    function fenceAfter(k) {   // a ``` block right after line k → its content
      var j = k + 1; while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length || lines[j].trim().indexOf('```') !== 0) return null;
      var body = []; j++; while (j < lines.length && lines[j].trim().indexOf('```') !== 0) { body.push(lines[j]); j++; }
      return { text: body.join('\n'), end: j };
    }
    var lastTask = null;
    while (i < lines.length) {
      var raw = lines[i]; var line = raw.trim();
      if (!line || line.indexOf('```') === 0 || line.indexOf('#') === 0 && !/^#\s*\[/.test(line)) { i++; continue; }
      // checklist item
      var cl = raw.match(/^(\s*)[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/);
      var isCmd = /^(\$\s*)?(node\s+solo\.js|node\s+marathon\.js|solo|marathon)\s+/.test(line) || /^(add|done|start|later|bucket|todo|move|pri|tag|step|check|note|rm|social|scripts|notes|inspo)\s/.test(line);
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
          tasks2.unshift(nt); c.saveBoard(bid2, tasks2); lastTask = { board: bid2, id: nt.id }; applied.push('added task: ' + q);
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
        } else if (cmd === 'rm' || cmd === 'del') {
          skipped.push('not deleting "' + q + '" from a pasted reply — delete it yourself if you agree');
        } else if (cmd === 'social' || cmd === 'post') {
          var sub = (a.pos.shift() || '').toLowerCase(); var sq = a.pos.join(' ');
          if (sub === 'add') {
            var posts = c.sched(); var np = { id: uid('p'), datetime: parseWhen(a.flags.at), title: sq, postType: a.flags.type || 'update', format: a.flags.format || 'text', project: a.flags.project || a.flags.proj || Config.projectNames()[0], copy: a.flags.copy || '', video: { title: '', status: 'none', notes: '', link: '' }, links: [], assets: [], prep: String(a.flags.prep || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { text: s, done: false, kind: 'content' }; }), notes: a.flags.notes || '', status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } };
            posts.push(np); c.saveSched(posts); applied.push('scheduled post: ' + sq + ' · ' + np.datetime.replace('T', ' '));
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
          var fence = fenceAfter(i); var body = a.flags.text || (fence ? fence.text : '');
          if (cmd === 'scripts') {
            var k = Config.key('scripts', c.ws); var lib = Store.getJSON(k, { activeId: '', scripts: [] }) || { activeId: '', scripts: [] }; lib.scripts = lib.scripts || [];
            var si = { id: uid('s'), title: title2 || 'Untitled', text: body || ('# ' + title2 + '\n\n## Hook\n\n## Script\n1. \n'), createdAt: Date.now(), updatedAt: Date.now() }; lib.scripts.unshift(si); lib.activeId = si.id; if (!dry) { Store.setJSON(k, lib); c.touched[Config.file('scripts', c.ws)] = 1; } applied.push('script added: ' + si.title + (body ? '' : ' (empty — no code block followed)'));
          } else {
            var k2 = Config.key('writing', c.ws); var nl = Store.getJSON(k2, { activeId: '', notes: [] }) || { activeId: '', notes: [] }; nl.notes = nl.notes || [];
            var ni = { id: uid('n'), text: body || ('# ' + title2 + '\n\n'), images: {}, createdAt: Date.now(), updatedAt: Date.now() }; nl.notes.unshift(ni); nl.activeId = ni.id; if (!dry) { Store.setJSON(k2, nl); c.touched[Config.file('writing', c.ws)] = 1; } applied.push('note added: ' + (title2 || 'untitled'));
          }
          if (fence) i = fence.end;
        } else if (cmd === 'inspo') {
          var sub3 = (a.pos.shift() || '').toLowerCase();
          if (sub3 === 'add' && global.InspoModel) { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } var it = InspoModel.parseQuick(a.pos.join(' '), { ws: c.ws, source: 'agent' }); if (a.flags.tags) it.tags = (it.tags || []).concat(split(a.flags.tags)); if (!dry) InspoModel.add(it); applied.push('inspiration saved: ' + (it.title || it.url)); }
          else skipped.push('inspo ' + sub3 + ' is not supported here');
        } else if (['week', 'today', 'list', 'show', 'log', 'activity', 'boards', 'workspaces', 'config', 'help', 'share', 'review'].indexOf(cmd) >= 0) {
          /* read-only commands: nothing to apply */
        } else skipped.push('unknown command: ' + line.slice(0, 60));
      } catch (e) { skipped.push('could not apply: ' + line.slice(0, 60)); }
      i++;
    }
    if (!dry) Object.keys(c.touched).forEach(function (f) { if (global.Sync) { Sync.touch(f); Sync.note(f, 'agent reply applied'); } });
    return { applied: applied, skipped: skipped };
  }
  global.Apply = { run: run, plan: plan, segment: segment, tokens: tokens };
})(window);
