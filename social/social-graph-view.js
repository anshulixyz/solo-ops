/* =========================================================================
   social-graph-view.js — GitHub commit-history style visual timeline
   ========================================================================= */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function projHue(p) {
    var map = { general: 30, openproof: 260, openagents: 145, openhiring: 200, openDM: 12 };
    return map[p] || 30;
  }

  function fmtDay(dt) {
    var d = new Date(dt);
    if (isNaN(d)) return dt;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function fmtTime(dt) {
    var d = new Date(dt);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function typeLabel(t) {
    return { announcement: 'Announcement', launch: 'Launch', update: 'Update', thread: 'Thread', teaser: 'Teaser' }[t] || t;
  }

  function formatIcon(f) {
    if (f === 'video') return 'video';
    if (f === 'text+video') return 'text+video';
    return 'text';
  }

  function statSummary(p) {
    if (p.status !== 'posted') return 'scheduled';
    var s = (p.posted && p.posted.stats) || {};
    var parts = [];
    if (s.views) parts.push(parseStatDisplay(s.views) + ' views');
    if (s.likes) parts.push(parseStatDisplay(s.likes) + ' likes');
    if (s.reposts) parts.push(parseStatDisplay(s.reposts) + ' reposts');
    return parts.length ? parts.join(' · ') : 'posted';
  }

  function parseStatDisplay(v) {
    return String(v).trim() || '0';
  }

  function graphHTML(posts, highlightId) {
    if (!posts.length) {
      return '<div class="empty">No posts yet — add some on the <a href="social-board.html">schedule board</a>.</div>';
    }

    var levels = SocialGraph.levelsForPosts(posts);
    var levelMap = {};
    levels.forEach(function (x) { levelMap[x.id] = x; });

    var html = '<div class="gh-graph">';
    html += '<div class="gh-legend">'
      + '<span class="gh-leg-label">Less</span>'
      + '<span class="gh-cell gh-l0" title="Unposted"></span>'
      + '<span class="gh-cell gh-l1" title="Posted"></span>'
      + '<span class="gh-cell gh-l2"></span>'
      + '<span class="gh-cell gh-l3"></span>'
      + '<span class="gh-cell gh-l4" title="Most engagement"></span>'
      + '<span class="gh-leg-label">More</span>'
      + '</div>';

    html += '<div class="gh-spine">';

    for (var i = 0; i < posts.length; i++) {
      var p = posts[i];
      var meta = levelMap[p.id] || { level: 0, score: 0 };
      var gap = i > 0 ? SocialModel.gapLabel(posts[i - 1].datetime, p.datetime) : '';
      var hi = p.id === highlightId ? ' gh-row-hi' : '';
      var posted = p.status === 'posted' ? ' gh-row-posted' : ' gh-row-pending';

      if (gap) {
        html += '<div class="gh-gap"><span class="gh-gap-line"></span><span class="gh-gap-text">' + esc(gap) + '</span><span class="gh-gap-line"></span></div>';
      }

      html += '<a class="gh-row' + hi + posted + '" href="social-board.html?id=' + esc(p.id) + '">'
        + '<div class="gh-track">'
        + '<span class="gh-connector gh-connector-top"></span>'
        + '<span class="gh-cell gh-l' + meta.level + '" title="' + esc(statSummary(p)) + '"></span>'
        + '<span class="gh-connector gh-connector-bot"></span>'
        + '</div>'
        + '<div class="gh-body">'
        + '<div class="gh-row-head">'
        + '<time datetime="' + esc(p.datetime) + '">' + esc(fmtDay(p.datetime)) + ' · ' + esc(fmtTime(p.datetime)) + '</time>'
        + '<span class="tag proj" style="--h:' + projHue(p.project) + '">' + esc(p.project) + '</span>'
        + '</div>'
        + '<div class="gh-title">' + esc(p.title) + '</div>'
        + '<div class="gh-desc">' + esc(typeLabel(p.postType)) + ' · ' + esc(formatIcon(p.format))
        + (p.status === 'posted' ? ' · <span class="gh-stat">' + esc(statSummary(p)) + '</span>' : ' · <span class="gh-pending-label">not posted</span>')
        + '</div>'
        + '</div>'
        + '</a>';
    }

    html += '</div></div>';
    return html;
  }

  function summaryHTML(posts) {
    var posted = posts.filter(function (p) { return p.status === 'posted'; }).length;
    var pending = posts.length - posted;
    var top = posts.slice().filter(function (p) { return p.status === 'posted'; })
      .sort(function (a, b) { return SocialGraph.engagementTotal(b) - SocialGraph.engagementTotal(a); })[0];
    var topLabel = top ? esc(top.title.slice(0, 40) + (top.title.length > 40 ? '…' : '')) : '—';
    return ''
      + '<span><b>' + posts.length + '</b> posts</span><span>·</span>'
      + '<span><b>' + posted + '</b> posted</span><span>·</span>'
      + '<span><b>' + pending + '</b> upcoming</span>'
      + (top ? '<span class="next-up">Top: ' + topLabel + '</span>' : '');
  }

  global.SocialGraphView = {
    render: function (highlightId) {
      var posts = SocialModel.getSorted();
      var root = document.getElementById('commitGraph');
      var sum = document.getElementById('summaryBar');
      if (root) root.innerHTML = graphHTML(posts, highlightId);
      if (sum) sum.innerHTML = summaryHTML(posts);
    }
  };
})(window);
