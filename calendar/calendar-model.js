/* =========================================================================
   calendar/calendar-model.js — everything with a date, in one list.
   Tasks with `at` / `due` (meetings = tasks tagged `meeting`) from every
   board of the workspace, plus posts; with "all projects" on, every
   workspace. Reads the same Store keys the apps use; workspaces this
   browser never opened are peeked from their files, read-only.
   Writes (done, add) go through the Store key; calendar-main registers
   every file shown, so sync writes it and the change log attributes it.
   Global `CalModel`.
   ========================================================================= */
(function (global) {
  'use strict';
  var UI_KEY = 'marathon.calendar.ui';   // { view, all, off: { <source id>: true }, state }
  var peeked = {};                         // file → body for read-only workspaces

  function ui() {
    var v = Store.getJSON(UI_KEY, null) || {};
    return { view: v.view === 'month' ? 'month' : 'agenda', all: !!v.all, off: v.off || {}, state: ['done', 'all'].indexOf(v.state) >= 0 ? v.state : 'open' };
  }
  function setUi(patch) { Store.setJSON(UI_KEY, Object.assign(ui(), patch), { silent: true }); }
  function wsList() { var open = Config.activeWs(); return ui().all ? Config.workspaces().filter(function (w) { return !w.sample || w.id === open; }) : [Config.ws()]; }   // "all projects" leaves the Sample project out unless it is the open one
  function boardTasks(b, w) { var v = Store.getJSON(Config.boardKey(b.id, w.id), null); if (Array.isArray(v)) return v; var f = Config.boardFile(b.id, w.id); return (peeked[f] && peeked[f].tasks) || []; }
  function wsPosts(w) { var v = Store.getJSON(Config.key('social', w.id), null); if (Array.isArray(v)) return v; var f = Config.file('social', w.id); return (peeked[f] && peeked[f].posts) || []; }

  // filter chips: one per board shown, plus Meetings and Posts
  function sources() {
    var out = []; var many = ui().all && Config.workspaces().length > 1;
    wsList().forEach(function (w) { Config.boards(w.id).forEach(function (b) { out.push({ id: 'board:' + w.id + ':' + b.id, label: b.title + (many ? ' · ' + w.title : ''), kind: 'board' }); }); });
    out.push({ id: 'meetings', label: 'Meetings', kind: 'meetings' });
    if (wsList().some(function (w) { return w.apps.social; })) out.push({ id: 'posts', label: 'Posts', kind: 'posts' });
    return out;
  }
  function items(unfiltered) {
    var u = ui(); var now = new Date(); var out = [];
    wsList().forEach(function (w) {
      Config.boards(w.id).forEach(function (b) {
        boardTasks(b, w).forEach(function (t) {
          if (!t.at && !t.due) return; var meeting = (t.tags || []).indexOf('meeting') >= 0;
          out.push({ kind: 'task', meeting: meeting, id: t.id, title: t.title, at: t.at || '', until: t.until || '', due: t.due || '', col: t.col, pri: t.pri, tags: t.tags || [], proj: t.proj, ws: w.id, wsTitle: w.title, board: b.id, boardTitle: b.title, key: Config.boardKey(b.id, w.id), file: Config.boardFile(b.id, w.id), src: meeting ? 'meetings' : 'board:' + w.id + ':' + b.id, open: t.col !== 'done', ext: t.ext || '' });
        });
      });
      if (w.apps.social) wsPosts(w).forEach(function (p) {
        if (!p.datetime) return;
        out.push({ kind: 'post', meeting: false, id: p.id, title: p.title, at: String(p.datetime).slice(0, 16), until: '', due: '', status: p.status, proj: p.project, ws: w.id, wsTitle: w.title, key: Config.key('social', w.id), file: Config.file('social', w.id), src: 'posts', open: p.status !== 'posted' });
      });
    });
    out.forEach(function (i) { i.when = i.at || i.due; i.state = When.state(i, now); i.day = When.dayKey(i.when); i.readOnly = Store.get(i.key) == null; });
    if (!unfiltered) out = out.filter(function (i) { if (u.off[i.src]) return false; if (u.state === 'open') return i.open; if (u.state === 'done') return !i.open; return true; });
    out.sort(function (a, b) { return (a.when + (a.at ? '' : 'T00:00')).localeCompare(b.when + (b.at ? '' : 'T00:00')); });
    return out;
  }
  // agenda: overdue first, then one group per day from today
  function agenda(days, list) {
    var all = list || items(); var now = new Date(); var today = When.localD(now);
    var overdue = all.filter(function (i) { return i.state === 'overdue'; }); var groups = [];
    var earlier = all.filter(function (i) { return i.state === 'past' && i.open; });   // meetings that happened and were never ticked
    var d = new Date(now.getTime()); d.setHours(0, 0, 0, 0);
    for (var k = 0; k < days; k++) { var key = When.localD(d); groups.push({ day: key, label: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), today: key === today, items: all.filter(function (i) { return i.day === key && i.state !== 'overdue'; }) }); d.setDate(d.getDate() + 1); }
    return { overdue: overdue, earlier: earlier, groups: groups, total: all.length, hidden: Math.max(0, items(true).length - all.length) };
  }
  function byDay(list) { var map = {}; (list || items()).forEach(function (i) { (map[i.day] = map[i.day] || []).push(i); }); return map; }

  function note(file, text) { if (global.Sync) { Sync.touch(file); Sync.note(file, text); } if (global.Activity && Activity.bump) { try { Activity.bump('board'); } catch (e) { /* optional */ } } }
  function setDone(item, done) {
    if (item.readOnly) return false;
    if (item.kind === 'task') {
      var list = Store.getJSON(item.key, []) || []; var t = list.filter(function (x) { return x.id === item.id; })[0]; if (!t) return false;
      t.col = done ? 'done' : 'todo'; t.updatedAt = Date.now(); Store.setJSON(item.key, list); note(item.file, (done ? 'done: ' : 'reopened: ') + t.title); return true;
    }
    var posts = Store.getJSON(item.key, []) || []; var p = posts.filter(function (x) { return x.id === item.id; })[0]; if (!p) return false;
    p.status = done ? 'posted' : 'ready'; if (done) { p.posted = p.posted || {}; p.posted.postedAt = p.posted.postedAt || When.localDT(new Date()); }
    Store.setJSON(item.key, posts); note(item.file, (done ? 'post posted: ' : 'post ready: ') + p.title); return true;
  }
  // + on a day: a task (or meeting) on the workspace's first board, or a post
  function addTask(o) {
    var w = Config.ws(); var boards = Config.boards(w.id); var b = boards.filter(function (x) { return x.id === o.board; })[0] || boards[0]; if (!b) return null;
    var key = Config.boardKey(b.id, w.id); var list = Store.getJSON(key, []) || [];
    var t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: o.title, desc: '', proj: Config.projectNames()[0], col: 'todo', pri: 'medium', tags: o.meeting ? ['meeting'] : [], notes: '', collapsed: true, checklist: [] };
    if (o.at) t.at = o.at; if (o.until) t.until = o.until; if (o.due) t.due = o.due;
    list.unshift(t); Store.setJSON(key, list); note(Config.boardFile(b.id, w.id), 'added from calendar: ' + t.title); return t;
  }
  function addPost(o) {
    var w = Config.ws(); if (!w.apps.social) return null; var key = Config.key('social', w.id); var posts = Store.getJSON(key, []) || [];
    var p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), datetime: o.at, title: o.title, postType: 'update', format: 'text', project: Config.projectNames()[0], copy: '', video: { title: '', status: 'none', notes: '', link: '' }, links: [], assets: [], prep: [], notes: '', status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } };
    posts.push(p); Store.setJSON(key, posts); note(Config.file('social', w.id), 'scheduled from calendar: ' + p.title); return p;
  }
  // "all projects": files of workspaces this browser never opened, read once, read-only
  function peekOthers(cb) {
    if (!global.Sync || !Sync.peek) { cb(); return; } var jobs = [];
    Config.workspaces().forEach(function (w) {
      if (w.id === Config.activeWs()) return;
      Config.boards(w.id).forEach(function (b) { if (Store.get(Config.boardKey(b.id, w.id)) == null) jobs.push(Config.boardFile(b.id, w.id)); });
      if (w.apps.social && Store.get(Config.key('social', w.id)) == null) jobs.push(Config.file('social', w.id));
    });
    jobs = jobs.filter(function (f) { return !peeked[f]; }); if (!jobs.length) { cb(); return; }
    Promise.all(jobs.map(function (f) { return Sync.peek(f).then(function (body) { if (body) peeked[f] = body; else if (Sync.getMode() !== 'manual') peeked[f] = { tasks: [], posts: [] }; }); })).then(cb, cb);
  }
  function showAll() { setUi({ off: {}, state: 'open' }); }
  global.CalModel = { ui: ui, setUi: setUi, showAll: showAll, sources: sources, items: items, agenda: agenda, byDay: byDay, setDone: setDone, addTask: addTask, addPost: addPost, peekOthers: peekOthers };
})(window);
