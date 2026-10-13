/* =========================================================================
   calendar/calendar-main.js — handlers, sync registration, palette.
   The page registers every file it can write (each board of the active
   workspace + its posts) with isFresh, so a board this browser never
   opened is adopted from its file without the first-contact question.
   ========================================================================= */
(function (global) {
  'use strict';
  var state = { y: 0, m: 0, addDay: undefined };
  var root, pillNode = null;
  // the view re-renders its controls; the sync pill is mounted once and moved into the new slot each time
  function placePill() { var slot = root && root.querySelector('[data-sync-pill]'); if (!slot || !global.Sync) return; if (!pillNode) pillNode = slot.querySelector('.sync-pill') || Sync.mount(slot); else if (!slot.contains(pillNode)) slot.appendChild(pillNode); }
  function render() { if (root) { CalView.render(root, state); placePill(); if (global.DatePick) DatePick.mount(root); } }
  function toast(msg) { var el = document.getElementById('toast'); if (!el) return; el.textContent = msg; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 2200); }

  global.calSetView = function (v) { CalModel.setUi({ view: v }); render(); };
  global.calToggleSrc = function (id) { var u = CalModel.ui(); var off = Object.assign({}, u.off); if (off[id]) delete off[id]; else off[id] = true; CalModel.setUi({ off: off }); render(); };
  global.calSetState = function (v) { CalModel.setUi({ state: v }); render(); };
  global.calShowAll = function () { CalModel.showAll(); render(); };
  global.calToggleAll = function (on) { CalModel.setUi({ all: !!on }); if (on) CalModel.peekOthers(render); render(); };
  global.calPrev = function () { state.m--; if (state.m < 0) { state.m = 11; state.y--; } render(); };
  global.calNext = function () { state.m++; if (state.m > 11) { state.m = 0; state.y++; } render(); };
  global.calToday = function () { var n = new Date(); state.y = n.getFullYear(); state.m = n.getMonth(); render(); };
  global.calDone = function (idx, done) { var i = CalView.items()[idx]; if (!i) return; if (CalModel.setDone(i, done)) toast((done ? (i.kind === 'post' ? 'Posted: ' : 'Done: ') : 'Reopened: ') + i.title); render(); };
  global.calAddOpen = function (day) { state.addDay = day || ''; render(); };
  // Share today: this project's tasks from the browser copy (every board here is registered, so it is current)
  global.calShare = function () {
    if (!global.ShareCard) return; var w = Config.ws(); var tasks = [];
    Config.boards(w.id).forEach(function (b) { (Store.getJSON(Config.boardKey(b.id, w.id), []) || []).forEach(function (t) { tasks.push(t); }); });
    ShareCard.open({ scopes: [{ id: w.id, title: w.title }], streak: global.Activity ? Activity.summary().streak : 0, data: function () { return { scope: w.title, tasks: tasks }; }, onPlan: function () { if (global.Guide && Guide.openPrompt) Guide.openPrompt('plan-today'); } });
  };
  global.calAddClose = function () { state.addDay = undefined; render(); };
  global.calAddSubmit = function (form) {
    var title = form.title.value.trim(); var whenTxt = form.when.value.trim(); var kind = form.kind.value; var untilTxt = (form.until && form.until.value || '').trim(); var board = form.board ? form.board.value : '';
    var p = When.parse(whenTxt); if (!title || !p) { toast('Could not read that date. Try "tomorrow 14:00" or "fri 10:00".'); return false; }
    if (kind === 'post') { var pst = CalModel.addPost({ title: title, at: p.allDay ? p.stamp + 'T09:00' : p.stamp }); if (pst) toast('Post scheduled: ' + title); }
    else if (kind === 'due') { CalModel.addTask({ title: title, due: When.dayKey(p.stamp), board: board }); toast('Task due ' + When.label(When.dayKey(p.stamp)) + ': ' + title); }
    else { var until = untilTxt ? When.until(p.stamp, untilTxt) : ''; if (untilTxt && !until) { toast('The end time is before the start. Try "until 15:30".'); return false; } CalModel.addTask({ title: title, at: p.stamp, until: until, meeting: kind === 'meeting', board: board }); toast((kind === 'meeting' ? 'Meeting' : 'Task') + ' ' + When.label(p.stamp) + ': ' + title); }
    state.addDay = undefined; render(); return false;
  };

  var registered = {};
  function registerSync() {
    if (!global.Sync) return; var w = Config.ws();
    Config.boards(w.id).forEach(function (b) {
      var key = Config.boardKey(b.id, w.id); var pk = key + '.projects'; if (registered[key]) return; registered[key] = 1;
      Sync.register({ file: Config.boardFile(b.id, w.id), keys: [key, pk], label: 'board', app: b.id, isFresh: function () { return Store.get(key) == null; },
        read: function () { return { projects: Store.getJSON(pk, []) || [], tasks: Store.getJSON(key, []) || [] }; },
        apply: function (body) { if (Array.isArray(body.tasks)) Store.setJSON(key, body.tasks, { silent: true }); if (Array.isArray(body.projects)) Store.setJSON(pk, body.projects, { silent: true }); render(); } });
    });
    if (w.apps.social && !registered.social) {
      registered.social = 1; var sk = Config.key('social', w.id);
      Sync.register({ file: Config.file('social', w.id), key: sk, label: 'schedule', isFresh: function () { return Store.get(sk) == null; },
        read: function () { return { posts: Store.getJSON(sk, []) || [] }; },
        apply: function (body) { if (Array.isArray(body.posts)) Store.setJSON(sk, body.posts, { silent: true }); render(); } });
    }
  }
  function init() {
    Config.applyDOM(); root = document.getElementById('calendarRoot');
    var n = new Date(); state.y = n.getFullYear(); state.m = n.getMonth();
    var params = new URLSearchParams(location.search);
    if (params.get('view') === 'month' || params.get('view') === 'agenda') CalModel.setUi({ view: params.get('view') });
    if (params.get('add') !== null) state.addDay = params.get('add') || '';
    var intro = document.getElementById('calIntro'); if (intro) { intro.open = Store.get('marathon.calendar.intro') !== 'closed'; intro.addEventListener('toggle', function () { Store.set('marathon.calendar.intro', intro.open ? 'open' : 'closed', { silent: true }); }); }
    registerSync();
    if (CalModel.ui().all) CalModel.peekOthers(render);
    render();
    Store.onChange(function (k) { if (k === Config.BOARDS_KEY) registerSync(); if (k === Config.BOARDS_KEY || /^marathon\.(board\.|[^.]+\.social|social)/.test(k)) render(); });
    if (global.Palette) {
      Palette.init({ root: '../' });
      Palette.register([
        { label: 'Agenda view', hint: 'calendar', run: function () { global.calSetView('agenda'); } },
        { label: 'Month view', hint: 'calendar', run: function () { global.calSetView('month'); } },
        { label: 'Add a meeting', hint: 'calendar', keywords: 'new event time', run: function () { global.calAddOpen(''); } },
        { label: 'Share today', hint: 'calendar', keywords: 'image card copy png', run: function () { global.calShare(); } },
        { label: 'Today', hint: 'calendar', run: global.calToday },
        { label: 'Posting streak', hint: 'nav', run: function () { location.href = '../social/social-calendar.html?ws=' + encodeURIComponent(Config.activeWs()) + '#streak'; } }
      ]);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
