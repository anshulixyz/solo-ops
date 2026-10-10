/* =========================================================================
   social-calendar-view.js — streak heatmap + monthly calendar
   ========================================================================= */
(function (global) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function projStyle(p) { return 'style="--h:' + Config.projectHue(p) + '"'; }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function dateKeyFromDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function dateKey(dt) {
    if (dt instanceof Date) return dateKeyFromDate(dt);
    return String(dt).slice(0, 10);
  }

  function fmtTime(dt) {
    var d = new Date(dt);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function fmtTipDate(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function postsByDay(posts) {
    var map = {};
    posts.forEach(function (p) {
      var k = dateKey(p.datetime);
      if (!map[k]) map[k] = [];
      map[k].push(p);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) { return a.datetime.localeCompare(b.datetime); });
    });
    return map;
  }

  function buildActivityMap(posts) {
    var map = {};
    posts.forEach(function (p) {
      var k = p.status === 'posted' && p.posted && p.posted.postedAt
        ? dateKey(p.posted.postedAt) : dateKey(p.datetime);
      if (!map[k]) map[k] = { posted: 0, scheduled: 0, titles: [] };
      if (p.status === 'posted') map[k].posted++;
      else map[k].scheduled++;
      map[k].titles.push(p.title);
    });
    return map;
  }

  function cellLevel(data) {
    if (!data || (data.posted === 0 && data.scheduled === 0)) return 0;
    if (data.posted === 0) return 1;
    if (data.posted === 1) return 2;
    if (data.posted === 2) return 3;
    return 4;
  }

  function cellTip(d, data) {
    var label = fmtTipDate(d);
    if (!data || (data.posted === 0 && data.scheduled === 0)) {
      return label + ' · no posts';
    }
    var parts = [];
    if (data.posted) parts.push(data.posted + ' posted');
    if (data.scheduled) parts.push(data.scheduled + ' scheduled');
    return label + ' · ' + parts.join(', ');
  }

  function countStreaks(activity, endDate) {
    var cur = 0;
    var best = 0;
    var run = 0;
    var d = new Date(endDate);
    d.setHours(0, 0, 0, 0);

    while (true) {
      var key = dateKeyFromDate(d);
      if (activity[key] && activity[key].posted > 0) {
        cur++;
        d.setDate(d.getDate() - 1);
      } else break;
    }

    d = new Date(endDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 364);
    for (var j = 0; j < 365; j++) {
      var k2 = dateKeyFromDate(d);
      if (activity[k2] && activity[k2].posted > 0) {
        run++;
        if (run > best) best = run;
      } else run = 0;
      d.setDate(d.getDate() + 1);
    }

    return { current: cur, best: best };
  }

  function totalPosted(activity) {
    var n = 0;
    Object.keys(activity).forEach(function (k) { n += activity[k].posted; });
    return n;
  }

  function heatmapHTML(posts) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var activity = buildActivityMap(posts);
    var streaks = countStreaks(activity, today);
    var postedYear = totalPosted(activity);

    var end = new Date(today);
    var start = new Date(today);
    start.setDate(start.getDate() - 364);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

    var weeks = [];
    var d = new Date(start);
    while (d <= end || weeks.length < 53) {
      var week = [];
      for (var i = 0; i < 7; i++) {
        week.push({ date: new Date(d), key: dateKeyFromDate(d), data: activity[dateKeyFromDate(d)] || null });
        d.setDate(d.getDate() + 1);
      }
      weeks.push(week);
      if (d > end && weeks.length >= 53) break;
    }

    var monthLabels = [];
    var lastMonth = -1;
    weeks.forEach(function (week, wi) {
      var m = week[0].date.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ col: wi, label: MONTHS_SHORT[m] });
        lastMonth = m;
      }
    });

    var html = '<div class="panel streak-panel" id="streak">'
      + '<div class="panel-head"><h2>Posting streak</h2><span class="hint">hover a square</span></div>'
      + '<div class="streak-body">'
      + '<div class="streak-stats">'
      + '<span><b>' + postedYear + '</b> posts in the last year</span>'
      + '<span>·</span>'
      + '<span><b>' + streaks.current + '</b> day current streak</span>'
      + '<span>·</span>'
      + '<span><b>' + streaks.best + '</b> day best streak</span>'
      + '</div>';

    html += '<div class="heatmap-wrap"><div class="heatmap">';

    html += '<div class="hm-months">';
    html += '<div class="hm-day-spacer"></div>';
    monthLabels.forEach(function (ml) {
      html += '<div class="hm-month" style="grid-column:' + (ml.col + 2) + '">' + esc(ml.label) + '</div>';
    });
    html += '</div>';

    html += '<div class="hm-grid">';
    for (var row = 0; row < 7; row++) {
      html += '<div class="hm-dow">' + (row % 2 === 0 ? DOW_LABELS[row] : '') + '</div>';
      for (var w = 0; w < weeks.length; w++) {
        var cell = weeks[w][row];
        var lvl = cellLevel(cell.data);
        var sched = cell.data && cell.data.scheduled > 0 && cell.data.posted === 0;
        var cls = 'hm-cell hm-l' + lvl + (sched ? ' hm-sched' : '');
        if (dateKeyFromDate(cell.date) === dateKeyFromDate(today)) cls += ' hm-today';
        if (cell.date > today) cls += ' hm-future';
        html += '<span class="' + cls + '" data-tip="' + esc(cellTip(cell.date, cell.data)) + '"></span>';
      }
    }
    html += '</div></div>';

    html += '<div class="hm-legend">'
      + '<span>Less</span>'
      + '<span class="hm-cell hm-l0"></span>'
      + '<span class="hm-cell hm-l1"></span>'
      + '<span class="hm-cell hm-l2"></span>'
      + '<span class="hm-cell hm-l3"></span>'
      + '<span class="hm-cell hm-l4"></span>'
      + '<span>More</span>'
      + '<span class="hm-leg-note">green = posted · pale = scheduled only</span>'
      + '</div>';

    html += '</div></div>';
    return html;
  }

  function buildGrid(year, month) {
    var first = new Date(year, month, 1);
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var startOffset = (first.getDay() + 6) % 7;
    var cells = [];
    var i;
    for (i = 0; i < startOffset; i++) cells.push(null);
    for (i = 1; i <= daysInMonth; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  function postCardHTML(p) {
    var posted = p.status === 'posted';
    var thumb = (p.assets || []).find(function (a) { return a.kind === 'post-image'; })
      || (posted && p.posted && p.posted.screenshotId
        ? { id: p.posted.screenshotId, name: 'screenshot', postId: p.id } : null);
    var thumbHtml = thumb
      ? '<div class="cal-thumb" data-asset-id="' + esc(thumb.id) + '" data-asset-post="' + esc(p.id) + '" data-asset-name="' + esc(thumb.name || '') + '"></div>'
      : '';
    return '<a class="cal-post' + (posted ? ' is-posted' : '') + '" href="social-board.html?ws=' + encodeURIComponent(Config.activeWs()) + '&id=' + esc(p.id) + '">'
      + '<div class="cal-post-bar" ' + projStyle(p.project) + '>' + esc(p.project) + '</div>'
      + '<div class="cal-post-time">' + esc(fmtTime(p.datetime)) + '</div>'
      + '<div class="cal-post-title">' + esc(p.title) + '</div>'
      + thumbHtml
      + '</a>';
  }

  function calendarHTML(year, month, posts) {
    var today = new Date();
    var todayKey = dateKeyFromDate(today);
    var byDay = postsByDay(posts);
    var cells = buildGrid(year, month);

    var html = heatmapHTML(posts);

    html += '<div class="panel cal-panel">'
      + '<div class="panel-head"><h2>Month view</h2><span class="hint">click a post to edit</span></div>'
      + '<div class="cal-panel-body">';

    html += '<div class="cal-nav">'
      + '<button type="button" class="btn ghost" onclick="calPrev()">←</button>'
      + '<div class="cal-month"><span class="cal-month-name">' + esc(MONTHS[month]) + '</span> '
      + '<span class="cal-year">' + year + '</span></div>'
      + '<button type="button" class="btn ghost" onclick="calNext()">→</button>'
      + '<button type="button" class="btn" onclick="calToday()">Today</button>'
      + '</div>';

    html += '<div class="cal-legend">'
      + SocialModel.getProjects().map(function (pr) {
        return '<span><i class="leg-swatch" ' + projStyle(pr) + '></i> ' + esc(pr) + '</span>';
      }).join('')
      + '<span class="leg-muted">— faded = not posted yet</span>'
      + '</div>';

    html += '<div class="cal-grid">';
    DOW.forEach(function (dow) {
      html += '<div class="cal-dow">' + dow + '</div>';
    });

    cells.forEach(function (day) {
      if (day === null) {
        html += '<div class="cal-cell cal-empty"></div>';
        return;
      }
      var key = year + '-' + pad2(month + 1) + '-' + pad2(day);
      var isToday = key === todayKey;
      var dayPosts = byDay[key] || [];
      html += '<div class="cal-cell' + (isToday ? ' cal-today' : '') + '">'
        + '<div class="cal-daynum">' + day + '</div>'
        + '<div class="cal-posts">' + dayPosts.map(postCardHTML).join('') + '</div>'
        + '</div>';
    });

    html += '</div></div></div>';
    return html;
  }

  global.SocialCalendarView = {
    render: function (year, month) {
      var posts = SocialModel.getSorted();
      var root = document.getElementById('calendarRoot');
      if (root) root.innerHTML = calendarHTML(year, month, posts);
      return SocialImage.hydrateAll();
    }
  };
})(window);
