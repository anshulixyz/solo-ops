/* =========================================================================
   social-graph.js — GitHub-style engagement levels for the visual timeline
   ========================================================================= */
(function (global) {
  'use strict';

  function parseStat(v) {
    if (v == null || v === '') return 0;
    var s = String(v).trim().toLowerCase().replace(/,/g, '');
    var n = parseFloat(s);
    if (isNaN(n)) return 0;
    if (s.indexOf('m') >= 0) return n * 1000000;
    if (s.indexOf('k') >= 0) return n * 1000;
    return n;
  }

  function engagementTotal(p) {
    if (!p || p.status !== 'posted') return 0;
    var s = (p.posted && p.posted.stats) || {};
    return parseStat(s.views)
      + parseStat(s.likes) * 10
      + parseStat(s.reposts) * 8
      + parseStat(s.replies) * 5
      + parseStat(s.bookmarks) * 3;
  }

  /** Returns 0 = unposted, 1–4 = posted (darker = more engagement) */
  function levelForPost(p, maxScore) {
    if (p.status !== 'posted') return 0;
    var score = engagementTotal(p);
    if (score <= 0) return 1;
    maxScore = maxScore || 1;
    var r = score / maxScore;
    if (r < 0.2) return 2;
    if (r < 0.45) return 3;
    return 4;
  }

  function levelsForPosts(posts) {
    var max = 0;
    posts.forEach(function (p) {
      var s = engagementTotal(p);
      if (s > max) max = s;
    });
    if (max === 0) max = 1;
    return posts.map(function (p) {
      return { id: p.id, level: levelForPost(p, max), score: engagementTotal(p) };
    });
  }

  global.SocialGraph = {
    parseStat: parseStat,
    engagementTotal: engagementTotal,
    levelForPost: levelForPost,
    levelsForPosts: levelsForPosts
  };
})(window);
