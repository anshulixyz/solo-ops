/* =========================================================================
   core/activity.js — daily activity log. Every data change (pages or CLI)
   bumps a counter for that day and app. Home shows a streak + heatmap and
   an inactivity reminder; `solo.js today` prints the same.
   Store key `marathon.activity`, file data/activity.json:
     { days: { "2026-10-10": { runway: 5, social: 1 } }, lastActive: ISO,
       lastByApp: { runway: ISO } }
   Both sides merge on apply (max per cell, latest timestamp), so the browser
   and the CLI can log independently without clobbering each other.
   ========================================================================= */
(function (global) {
  'use strict';

  var KEY = 'marathon.activity';
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function load() { var a = Store.getJSON(KEY, null); return a && a.days ? a : { days: {}, lastActive: '', lastByApp: {} }; }
  function mergeInto(a, b) {
    var out = { days: {}, lastActive: a.lastActive > (b.lastActive || '') ? a.lastActive : (b.lastActive || ''), lastByApp: {} };
    [a, b].forEach(function (src) {
      Object.keys(src.days || {}).forEach(function (d) {
        out.days[d] = out.days[d] || {};
        Object.keys(src.days[d]).forEach(function (app) { out.days[d][app] = Math.max(out.days[d][app] || 0, src.days[d][app] || 0); });
      });
      Object.keys(src.lastByApp || {}).forEach(function (app) { if ((src.lastByApp[app] || '') > (out.lastByApp[app] || '')) out.lastByApp[app] = src.lastByApp[app]; });
    });
    return out;
  }
  function bump(app) {
    app = app || 'other';
    var a = load(); var d = dayKey(); var now = new Date().toISOString();
    a.days[d] = a.days[d] || {}; a.days[d][app] = (a.days[d][app] || 0) + 1;
    a.lastActive = now; a.lastByApp[app] = now;
    Store.setJSON(KEY, a);
  }
  function summary(opts) {
    var a = load(); var now = new Date(); var today = dayKey(now);
    var hours = a.lastActive ? (now - new Date(a.lastActive)) / 3600000 : Infinity;
    var limit = (opts && opts.reminderAfterHours) || (global.Config && Config.get('activity.reminderAfterHours')) || 24;
    // streak: consecutive days ending today or yesterday
    var streak = 0; var d = new Date(now); d.setHours(0, 0, 0, 0);
    if (!a.days[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (a.days[dayKey(d)] && Object.keys(a.days[dayKey(d)]).length) { streak++; d.setDate(d.getDate() - 1); }
    var activeDays = Object.keys(a.days).filter(function (k) { return Object.keys(a.days[k]).length; }).length;
    var todayCount = Object.keys(a.days[today] || {}).reduce(function (s, k) { return s + a.days[today][k]; }, 0);
    return { lastActive: a.lastActive, hoursIdle: hours, idle: hours >= limit, reminderAfterHours: limit, streak: streak,
      activeDays: activeDays, todayCount: todayCount, days: a.days, lastByApp: a.lastByApp };
  }
  function ago(iso) {
    if (!iso) return 'never';
    var m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60); if (h < 48) return h + ' h ago';
    return Math.round(h / 24) + ' days ago';
  }
  function register() {
    if (!global.Sync) return;
    Sync.register({
      file: 'activity.json', key: KEY, label: 'activity', activity: false, merge: true,
      read: function () { return load(); },
      apply: function (body) { Store.setJSON(KEY, mergeInto(load(), { days: body.days || {}, lastActive: body.lastActive || '', lastByApp: body.lastByApp || {} }), { silent: true }); }
    });
  }
  global.Activity = { KEY: KEY, bump: bump, summary: summary, ago: ago, dayKey: dayKey, merge: mergeInto, register: register, load: load };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Activity;
  if (typeof document !== 'undefined' && document.addEventListener) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register(); }
})(typeof window !== 'undefined' ? window : this);
