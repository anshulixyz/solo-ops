/* =========================================================================
   core/recent.js — "what did I just do?" Records every data change by
   diffing the Store before/after (page edits) and before/after a file is
   applied (CLI / agent edits), as short structured events in
   `marathon.recent` (ring buffer, 40). Recent.text(n) renders the last n
   with the full current state of each item, for pasting into a chat.
   ========================================================================= */
(function (global) {
  'use strict';
  var KEY = 'marathon.recent'; var MAX = 40; var prev = {};
  function esc(s) { return String(s == null ? '' : s); }
  function load() { var r = Store.getJSON(KEY, []); return Array.isArray(r) ? r : []; }
  function push(ev) { var r = load(); ev.ts = new Date().toISOString(); r.push(ev); if (r.length > MAX) r = r.slice(r.length - MAX); Store.setJSON(KEY, r, { silent: true }); }
  function kindOf(key) {
    if (/^marathon\.board\./.test(key) && !/\.projects$/.test(key)) return 'task';
    if (/social/.test(key)) return 'post'; if (/scripts/.test(key)) return 'script'; if (/writing/.test(key)) return 'note'; if (key === 'marathon.inspiration') return 'inspo'; if (/\.videos$/.test(key)) return 'take';
    return null;
  }
  function items(kind, val) {
    if (!val) return [];
    if (kind === 'task' || kind === 'post') return Array.isArray(val) ? val : [];
    if (kind === 'script') return (val.scripts || []); if (kind === 'note') return (val.notes || []); if (kind === 'inspo') return (val.items || []); if (kind === 'take') return (val.videos || []);
    return [];
  }
  function plural(kind, n) { var w = kind === 'inspo' ? 'inspiration item' : kind; return n === 1 ? w : w + 's'; }
  function title(kind, x) { if (kind === 'note') { var m = (x.text || '').match(/^#\s+(.+)/m); return m ? m[1].slice(0, 60) : (x.text || '').split('\n')[0].slice(0, 60) || 'untitled'; } return x.title || x.url || 'untitled'; }
  function sig(kind, x) {   // what counts as "changed"
    if (kind === 'task') return [x.col, x.pri, (x.tags || []).join(','), (x.checklist || []).map(function (c) { return (c.done ? '1' : '0') + c.text; }).join('|'), x.notes, x.desc, x.title, x.at || '', x.until || '', x.due || ''].join('\u0001');
    if (kind === 'post') return [x.datetime, x.status, x.copy, (x.prep || []).map(function (c) { return (c.done ? '1' : '0') + c.text; }).join('|'), x.title, (x.posted || {}).url].join('\u0001');
    if (kind === 'script') return [x.title, x.text].join('\u0001'); if (kind === 'note') return x.text; if (kind === 'inspo') return [x.status, x.title, x.text, (x.tags || []).join(','), x.ws].join('\u0001');
    if (kind === 'take') return [x.status, x.edlHash || '', (x.exports || []).length, x.postId || '', x.transcript ? x.transcript.words : 0].join('\u0001');
    return '';
  }
  function describe(kind, a, b) {   // a = before, b = after (same id)
    if (kind === 'task') {
      if ((a.at || '') !== (b.at || '') || (a.until || '') !== (b.until || '')) return (b.at ? (a.at ? 'rescheduled: ' : 'scheduled: ') : 'unscheduled: ') + b.title;
      if ((a.due || '') !== (b.due || '')) return (b.due ? 'due ' + b.due + ': ' : 'due date removed: ') + b.title;
      if (a.col !== b.col) return (b.col === 'done' ? 'finished' : b.col === 'doing' ? 'started' : 'moved to ' + b.col) + ': ' + b.title;
      var da = (a.checklist || []).filter(function (c) { return c.done; }).length, db = (b.checklist || []).filter(function (c) { return c.done; }).length;
      if ((b.checklist || []).length > (a.checklist || []).length) return 'added a step to: ' + b.title;
      if (db > da) return 'ticked a step on: ' + b.title; if (a.pri !== b.pri) return 'priority ' + b.pri + ': ' + b.title;
      if (a.notes !== b.notes) return 'wrote notes on: ' + b.title; if (a.title !== b.title) return 'renamed task: ' + a.title + ' → ' + b.title;
      return 'edited task: ' + b.title;
    }
    if (kind === 'post') { if (a.status !== b.status) return 'post ' + b.status + ': ' + b.title; if (a.copy !== b.copy) return 'wrote copy for: ' + b.title; if (a.datetime !== b.datetime) return 'rescheduled: ' + b.title; return 'edited post: ' + b.title; }
    if (kind === 'script') return 'edited script: ' + b.title; if (kind === 'note') return 'edited note: ' + title('note', b);
    if (kind === 'inspo') { if (a.status !== b.status) return 'inspiration ' + b.status + ': ' + title('inspo', b); return 'edited inspiration: ' + title('inspo', b); }
    if (kind === 'take') { var n = (b.edl || []).length; if ((a.exports || []).length !== (b.exports || []).length) return 'rendered take: ' + b.title; if ((a.edlHash || '') !== (b.edlHash || '')) return (n ? 'cut take (' + n + ' piece' + (n === 1 ? '' : 's') + '): ' : 'cut cleared: ') + b.title; if (!a.transcript && b.transcript) return 'words ready: ' + b.title; if (a.postId !== b.postId) return 'posted take: ' + b.title; return 'edited take: ' + b.title; }
    return 'edited';
  }
  function diff(key, beforeVal, afterVal, source) {
    var kind = kindOf(key); if (!kind) return;
    var A = items(kind, beforeVal), B = items(kind, afterVal); var am = {}, bm = {};
    A.forEach(function (x) { am[x.id] = x; }); B.forEach(function (x) { bm[x.id] = x; });
    var ws = key.match(/^marathon\.board\.([^.]+)\.([^.]+)$/) ? key.split('.')[2] : (key.match(/^marathon\.([^.]+)\.(social|scripts|writing|videos)$/) ? key.split('.')[1] : Config.PRIMARY);
    if (source === 'file') {   // the first contact with the file (core/sync.js): the file replaces the browser copy. One row says so; nobody deleted or added anything
      var gone = A.filter(function (a) { return !bm[a.id]; }).length;
      var same = !gone && A.length === B.length && B.every(function (b) { return am[b.id] && sig(kind, am[b.id]) === sig(kind, b); });
      if (!same) push({ kind: kind, key: key, ws: ws, what: 'loaded from file: ' + (B.length ? B.length + ' ' + plural(kind, B.length) : kind === 'task' ? 'an empty board' : 'an empty list') + (gone ? ' · ' + gone + ' from this browser not in the file (backup saved)' : ''), source: 'file' });
      return;
    }
    B.forEach(function (b) { var a = am[b.id]; if (!a) push({ kind: kind, id: b.id, key: key, ws: ws, what: (kind === 'task' ? 'added task: ' : kind === 'post' ? 'scheduled post: ' : kind === 'script' ? 'new script: ' : kind === 'note' ? 'new note: ' : kind === 'take' ? 'new take: ' : 'saved inspiration: ') + title(kind, b), source: source }); else if (sig(kind, a) !== sig(kind, b)) push({ kind: kind, id: b.id, key: key, ws: ws, what: describe(kind, a, b), source: source }); });
    A.forEach(function (a) { if (!bm[a.id]) push({ kind: kind, id: a.id, key: key, ws: ws, what: 'deleted ' + kind + ': ' + title(kind, a), source: source, gone: true }); });
  }
  // page edits: Store change events (non-silent)
  function snapshotKey(k) { prev[k] = Store.get(k); }
  Store.onChange(function (k, v) {
    var kind = kindOf(k); if (!kind) return;
    var before = null; try { before = prev[k] != null ? JSON.parse(prev[k]) : null; } catch (e) {}
    var after = null; try { after = JSON.parse(v); } catch (e) {}
    if (before !== null) diff(k, before, after, 'you'); prev[k] = v;
  });
  // file edits (CLI / agent / other device): Sync tells us around applyBody
  global.Recent = {
    KEY: KEY, load: load, diff: diff, prime: function (k) { if (prev[k] == null) snapshotKey(k); },
    beforeApply: function (keys) { keys.forEach(function (k) { prev[k] = Store.get(k); }); },
    afterApply: function (keys, source) { keys.forEach(function (k) { var kind = kindOf(k); if (!kind) return; var b = null, a = null; try { b = prev[k] != null ? JSON.parse(prev[k]) : null; a = JSON.parse(Store.get(k)); } catch (e) {} if (b !== null) diff(k, b, a, source || 'agent or CLI'); prev[k] = Store.get(k); }); },
    current: function (ev) {   // full current state of the item, as text
      if (!ev.id) return '';   // a "loaded from file" row is about the whole list, not one item
      var kind = ev.kind; var val = Store.getJSON(ev.key, null); var x = items(kind, val).filter(function (i) { return i.id === ev.id; })[0];
      if (!x) return ev.gone ? '(deleted)' : '(no longer present)';
      if (kind === 'task') return '[' + x.id + '] ' + x.title + ' · ' + x.col + ' · ' + x.pri + (x.tags.length ? ' · #' + x.tags.join(' #') : '') + (x.desc ? '\n      ' + x.desc : '') + ((x.checklist || []).length ? '\n      steps: ' + x.checklist.map(function (c) { return (c.done ? '[x] ' : '[ ] ') + c.text; }).join(' · ') : '') + (x.notes ? '\n      notes: ' + x.notes.replace(/\n/g, ' / ').slice(0, 300) : '');
      if (kind === 'post') return '[' + x.id + '] ' + x.title + ' · ' + x.datetime.replace('T', ' ') + ' · ' + x.status + (x.copy ? '\n      copy: ' + x.copy.replace(/\n/g, ' / ').slice(0, 400) : '\n      (no copy yet)') + ((x.prep || []).length ? '\n      prep: ' + x.prep.map(function (c) { return (c.done ? '[x] ' : '[ ] ') + c.text; }).join(' · ') : '') + ((x.assets || []).length ? '\n      images: ' + x.assets.map(function (a) { return a.file || a.name; }).join(', ') : '');
      if (kind === 'script') return '[' + x.id + '] ' + x.title + '\n      ' + (x.text || '').slice(0, 600).replace(/\n/g, '\n      ');
      if (kind === 'note') return '[' + x.id + '] ' + title('note', x) + '\n      ' + (x.text || '').slice(0, 600).replace(/\n/g, '\n      ');
      if (kind === 'take') return '[' + x.id + '] ' + x.title + ' · ' + x.status + ((x.edl || []).length ? ' · cut: ' + x.edl.length + ' piece' + (x.edl.length === 1 ? '' : 's') : '') + ((x.exports || []).length ? ' · ' + x.exports.length + ' export' + (x.exports.length === 1 ? '' : 's') : '');
      if (kind === 'inspo') return '[' + x.id + '] ' + (x.title || x.url) + (x.url ? ' ' + x.url : '') + (x.text ? '\n      ' + x.text.slice(0, 300) : '') + (x.file ? '\n      image file: ' + x.file : x.image ? '\n      (image in the app)' : '') + (x.tags.length ? '\n      #' + x.tags.join(' #') : '');
      return '';
    },
    text: function (n) {
      var r = load().slice(-(n || 10)).reverse(); var w = Config.ws();
      var L = ['# What I just did — last ' + r.length + ' change' + (r.length === 1 ? '' : 's') + ' (newest first)', 'Workspace now open: ' + w.title + ' (' + w.id + ')', ''];
      if (!r.length) L.push('(nothing recorded yet — changes you make on any page, and changes agents make through the files, show up here)');
      var seen = {};
      r.forEach(function (ev, i) {
        L.push((i + 1) + '. ' + Activity.ago(ev.ts) + ' · ' + (ev.source || 'you') + (ev.ws && ev.ws !== w.id ? ' · ' + ev.ws : '') + ' — ' + ev.what);
        var k = ev.kind + ':' + ev.id; if (ev.id && !seen[k]) { seen[k] = 1; L.push('   now: ' + global.Recent.current(ev)); }
        L.push('');
      });
      L.push('Use this to discuss what I did, catch mistakes, and suggest the next step. Keep it short.');
      return L.join('\n');
    }
  };
  // prime snapshots for keys already present so the first edit on a page diffs correctly
  try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (kindOf(k)) prev[k] = localStorage.getItem(k); } } catch (e) {}
})(window);
