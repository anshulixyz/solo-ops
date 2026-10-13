/* =========================================================================
   calendar/calendar-view.js — render only. Agenda (today → next 14 days,
   overdue first) and Month (grid, items as chips). Handlers are globals in
   calendar-main.js because the markup uses inline on*. Global `CalView`.
   ========================================================================= */
(function (global) {
  'use strict';
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function href(i) {
    var q = '?ws=' + encodeURIComponent(i.ws);
    return i.kind === 'post' ? '../social/social-board.html' + q + '&id=' + encodeURIComponent(i.id) : '../runway/marathon-board.html' + q + '&board=' + encodeURIComponent(i.board) + '&id=' + encodeURIComponent(i.id);
  }
  function kindLabel(i) { return i.kind === 'post' ? 'post' + (i.status ? ' · ' + i.status : '') : i.meeting ? 'meeting' : i.boardTitle; }
  function timeText(i) { return i.at ? When.range(i.at, i.until) : 'due'; }

  function controlsHTML(u, srcs, many) {
    return '<div class="controls">' +
      '<div class="tabs"><button type="button" class="tab' + (u.view === 'agenda' ? ' active' : '') + '" onclick="calSetView(\'agenda\')">Agenda</button><button type="button" class="tab' + (u.view === 'month' ? ' active' : '') + '" onclick="calSetView(\'month\')">Month</button></div>' +
      '<div class="right-controls"><span data-sync-pill></span>' +
      '<button class="theme-btn" onclick="toggleTheme()" title="Toggle theme" aria-label="Toggle theme"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2"/></svg></button></div></div>' +
      '<div class="cal-filters">' +
      srcs.map(function (s) { return '<button type="button" class="chip kind-' + esc(s.kind) + (u.off[s.id] ? ' off' : ' on') + '" onclick="calToggleSrc(\'' + esc(s.id) + '\')" title="Show or hide ' + esc(s.label) + '"><i></i>' + esc(s.label) + '</button>'; }).join('') +
      '<span class="cal-sep"></span>' +
      '<select class="cal-state" onchange="calSetState(this.value)" title="Open, done or everything"><option value="open"' + (u.state === 'open' ? ' selected' : '') + '>Open</option><option value="done"' + (u.state === 'done' ? ' selected' : '') + '>Done</option><option value="all"' + (u.state === 'all' ? ' selected' : '') + '>All</option></select>' +
      (many ? '<label class="cal-all"><input type="checkbox" onchange="calToggleAll(this.checked)"' + (u.all ? ' checked' : '') + '> All projects</label>' : '') +
      '<button type="button" class="btn small" onclick="calShare()" title="A clean card of today: copy it as an image or text">Share today</button>' +
      '<button type="button" class="btn small cal-addbtn" onclick="calAddOpen()">+ Add</button>' +
      '</div><div id="calAdd"></div>';
  }
  function addFormHTML(day) {
    var w = Config.ws(); var boards = Config.boards(w.id);
    return '<form class="cal-add panel" onsubmit="return calAddSubmit(this)">' +
      '<input name="title" placeholder="What? e.g. Call with Priya" required autocomplete="off">' +
      '<span class="dp-row grow"><input name="when" data-pick="datetime" placeholder="When? tomorrow 14:00 · fri 10:00" value="' + esc(day ? day + ' 10:00' : '') + '" required autocomplete="off"></span>' +
      '<span class="dp-row"><input name="until" data-pick="time" placeholder="until 14:30" size="10" autocomplete="off"></span>' +
      '<select name="kind"><option value="meeting">Meeting</option><option value="task">Timed task</option><option value="due">Deadline</option>' + (w.apps.social ? '<option value="post">Post</option>' : '') + '</select>' +
      (boards.length > 1 ? '<select name="board">' + boards.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.title) + '</option>'; }).join('') + '</select>' : '') +
      '<button type="submit" class="btn primary small">Add</button><button type="button" class="btn ghost small" onclick="calAddClose()">Cancel</button>' +
      '<span class="cal-add-hint">Enter saves. Terminal: <code>node solo.js add "Call with X" --at tomorrow 14:00 --until 14:30 --tags meeting</code>. Have an agent? Guide → Ask → <i>Fill my calendar</i>.</span></form>';
  }
  function itemRow(i, idx) {
    var cls = 'ag-item kind-' + i.kind + (i.meeting ? ' meeting' : '') + ' state-' + (i.state || 'none') + (i.open ? '' : ' is-done');
    return '<div class="' + cls + '">' +
      (i.readOnly ? '<span class="ag-check ro" title="Open that project to change it"></span>' : '<input type="checkbox" class="ag-check" ' + (i.open ? '' : 'checked') + ' onchange="calDone(' + idx + ', this.checked)" title="' + (i.kind === 'post' ? 'Mark posted' : 'Mark done') + '">') +
      '<span class="ag-time">' + esc(timeText(i)) + '</span>' +
      '<a class="ag-title" href="' + esc(href(i)) + '">' + esc(i.title) + '</a>' +
      '<span class="ag-src kind-' + i.kind + (i.meeting ? ' meeting' : '') + '" style="--h:' + Config.projectHue(i.proj) + '">' + esc(kindLabel(i)) + (i.readOnly ? ' · ' + esc(i.wsTitle) : '') + '</span>' +
      (i.state === 'overdue' ? '<span class="ag-flag">overdue</span>' : '') +
      '</div>';
  }
  function agendaHTML(a, index) {
    var html = '';
    if (!a.total && a.hidden) return '<div class="agenda"><div class="cal-empty-state"><b>' + a.hidden + ' item' + (a.hidden === 1 ? ' is' : 's are') + ' hidden by the filters.</b> <button type="button" class="guide-link" onclick="calShowAll()">Show everything</button></div></div>';
    if (a.earlier.length) html += '<details class="ag-day earlier"><summary>Earlier · ' + a.earlier.length + ' not ticked <span>meetings that happened; tick them or leave them</span></summary>' + a.earlier.map(function (i) { return itemRow(i, index(i)); }).join('') + '</details>';
    if (a.overdue.length) html += '<section class="ag-day overdue"><h3>Overdue <span>' + a.overdue.length + '</span></h3>' + a.overdue.map(function (i) { return itemRow(i, index(i)); }).join('') + '</section>';
    a.groups.forEach(function (g) {
      html += '<section class="ag-day' + (g.today ? ' today' : '') + (g.items.length ? '' : ' empty') + '"><h3>' + esc(g.label) + (g.today ? ' <em>today</em>' : '') + '<button type="button" class="ag-plus" onclick="calAddOpen(\'' + g.day + '\')" title="Add on this day">+</button></h3>' +
        (g.items.length ? g.items.map(function (i) { return itemRow(i, index(i)); }).join('') : (g.today ? '<div class="ag-none">Nothing with a time today.</div>' : '')) + '</section>';
    });
    if (!a.total) return '<div class="agenda"><div class="cal-empty-state"><b>Nothing has a date yet.</b> Click <b>+ Add</b> for a meeting, a timed task or a deadline. On a board, any card gets a date from its <b>+ date</b> chip. Terminal: <code>node solo.js add "Call with X" --at tomorrow 14:00 --tags meeting</code>. Have an agent? Guide → Ask → <i>Fill my calendar</i> reads the calendar it is connected to.</div>' + html + '</div>';
    return '<div class="agenda">' + html + '</div>';
  }
  function monthHTML(y, m, map, index) {
    var first = new Date(y, m, 1); var days = new Date(y, m + 1, 0).getDate(); var off = (first.getDay() + 6) % 7; var cells = []; var k;
    for (k = 0; k < off; k++) cells.push(null); for (k = 1; k <= days; k++) cells.push(k); while (cells.length % 7) cells.push(null);
    var today = When.localD(new Date());
    var html = '<div class="cal-nav"><button type="button" class="btn ghost" onclick="calPrev()">←</button><div class="cal-month"><span class="cal-month-name">' + MONTHS[m] + '</span> <span class="cal-year">' + y + '</span></div><button type="button" class="btn ghost" onclick="calNext()">→</button><button type="button" class="btn" onclick="calToday()">Today</button></div>';
    html += '<div class="cal-scroll"><div class="cal-grid">' + DOW.map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('');
    cells.forEach(function (day) {
      if (day === null) { html += '<div class="cal-cell cal-empty"></div>'; return; }
      var key = y + '-' + pad2(m + 1) + '-' + pad2(day); var list = map[key] || [];
      html += '<div class="cal-cell' + (key === today ? ' cal-today' : '') + '"><div class="cal-daynum">' + day + '<button type="button" class="cal-plus" onclick="calAddOpen(\'' + key + '\')" title="Add on this day">+</button></div><div class="cal-items">' +
        list.map(function (i) { return '<a class="cal-item kind-' + i.kind + (i.meeting ? ' meeting' : '') + ' state-' + (i.state || 'none') + (i.open ? '' : ' is-done') + '" href="' + esc(href(i)) + '" title="' + esc(i.title + ' · ' + kindLabel(i)) + '" style="--h:' + Config.projectHue(i.proj) + '"><span class="t">' + esc(i.at ? When.timeOf(i.at) || 'all day' : 'due') + '</span>' + esc(i.title) + '</a>'; }).join('') +
        '</div></div>';
    });
    return html + '</div></div>';
  }

  var lastItems = [];
  global.CalView = {
    items: function () { return lastItems; },
    render: function (root, state) {
      var u = CalModel.ui(); var srcs = CalModel.sources(); var many = Config.workspaces().length > 1;
      lastItems = CalModel.items(); var index = function (i) { return lastItems.indexOf(i); };
      var body = u.view === 'month' ? monthHTML(state.y, state.m, CalModel.byDay(lastItems), index) : agendaHTML(CalModel.agenda(14, lastItems), index);
      root.innerHTML = controlsHTML(u, srcs, many) + body;
      if (state.addDay !== undefined) { var slot = document.getElementById('calAdd'); if (slot) { slot.innerHTML = addFormHTML(state.addDay); var f = slot.querySelector('input[name=title]'); if (f) f.focus(); } }
    }
  };
})(window);
