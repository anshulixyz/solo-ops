/* =========================================================================
   core/when.js — dates on tasks and posts, one set of rules for the pages
   and the CLI (plain JS: browser global `When`, Node `require`).
   Stamps are LOCAL time, no zone: 'YYYY-MM-DDTHH:MM' (a moment) or
   'YYYY-MM-DD' (an all-day item). Anything with a zone (Z, +05:30) is
   converted to local first, so an agent pasting a connector's UTC stamp
   gets the right hour.
     When.parse(text, now)       → { stamp, allDay } or null
     When.until(at, text, now)   → full stamp for an end time ('HH:MM' = same day as at)
     When.state(item, now)       → 'overdue' | 'today' | 'past' | 'upcoming' | ''
     When.label(stamp, now)      → 'Today 14:00' · 'Tomorrow' · 'Wed 15 Oct 14:00'
     When.dayKey(stamp)          → 'YYYY-MM-DD'
   ========================================================================= */
(function (root, factory) {
  var W = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.When = W;
})(this, function () {
  'use strict';
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var WEEKDAY = /^(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?)$/;
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function localDT(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function localD(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayKey(stamp) { return String(stamp || '').slice(0, 10); }
  function isAllDay(stamp) { return /^\d{4}-\d{2}-\d{2}$/.test(String(stamp || '')); }
  function toDate(stamp) {   // local Date for a stamp; all-day → 00:00 local
    var s = String(stamp || ''); var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/); if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0, 0);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3] || (m[4] && (+m[4] > 23 || +m[5] > 59))) return null;   // 2026-02-31, 25:00 are not dates
    return d;
  }
  function withTime(d, hh, mm) { var x = new Date(d.getTime()); x.setHours(hh, mm, 0, 0); return x; }

  // text → { stamp, allDay } | null. now = reference Date (tests pass one).
  function parse(text, now) {
    now = now || new Date(); var v = String(text == null ? '' : text).trim(); if (!v) return null;
    var tm = v.match(/\s+(\d{1,2}):(\d{2})$/); var time = tm ? [+tm[1], +tm[2]] : null; var head = tm ? v.slice(0, tm.index).trim().toLowerCase() : v.toLowerCase();
    function day(d) { return time ? { stamp: localDT(withTime(d, time[0], time[1])), allDay: false } : { stamp: localD(d), allDay: true }; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(head)) { var d0 = toDate(head); return d0 && !isNaN(d0) ? day(d0) : null; }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) { return toDate(v) ? { stamp: v, allDay: false } : null; }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(head) && time) { var dh = toDate(head); return dh ? { stamp: localDT(withTime(dh, time[0], time[1])), allDay: false } : null; }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) { var dz = new Date(v); return isNaN(dz) ? null : { stamp: localDT(dz), allDay: false }; }   // seconds and/or a zone → local
    var rel = head.match(/^\+(\d+)d$/); if (rel) { var dr = new Date(now.getTime()); dr.setDate(dr.getDate() + parseInt(rel[1], 10)); return time ? day(dr) : { stamp: localDT(withTime(dr, 9, 0)), allDay: false }; }
    if (head === 'today' || head === 'tod') return day(now);
    if (head === 'tomorrow' || head === 'tmr' || head === 'tom') { var dt = new Date(now.getTime()); dt.setDate(dt.getDate() + 1); return day(dt); }
    if (head === 'now') return { stamp: localDT(now), allDay: false };
    var wd = DAYS.indexOf(head.slice(0, 3)); if (wd >= 0 && WEEKDAY.test(head)) { var dw = new Date(now.getTime()); var diff = (wd - dw.getDay() + 7) % 7 || 7; dw.setDate(dw.getDate() + diff); return day(dw); }
    if (!tm && /^\d{1,2}:\d{2}$/.test(v)) { var hm = v.split(':'); return { stamp: localDT(withTime(now, +hm[0], +hm[1])), allDay: false }; }
    // last resort only for an explicit written date with a four-digit year ("20 Oct 2026 14:00"); never a bare number or a word
    if (/^(\d{1,2}\s+[a-z]{3,9}\.?,?\s+(19|20)\d{2}|[a-z]{3,9}\.?\s+\d{1,2},?\s+(19|20)\d{2})(\s+\d{1,2}:\d{2})?$/i.test(v)) { var dx = new Date(v); if (!isNaN(dx)) return { stamp: localDT(dx), allDay: false }; }
    return null;
  }
  // end time: 'HH:MM' = same day as at; anything else parses on its own. Returns a full stamp or ''.
  function until(at, text, now) {
    var v = String(text == null ? '' : text).trim(); if (!v) return '';
    var hm = v.match(/^(\d{1,2}):(\d{2})$/); var base = toDate(at); var end = '';
    if (hm && base) { if (+hm[1] > 23 || +hm[2] > 59) return ''; end = localDT(withTime(base, +hm[1], +hm[2])); }
    else { var p = parse(v, now); end = p ? (p.allDay ? p.stamp + 'T23:59' : p.stamp) : ''; }
    return end && at && end < String(at).slice(0, 16) ? '' : end;   // an end before the start is no end
  }
  // overdue = due before today, or a moment in the past with no end and not done; past = ended; today; upcoming.
  function state(item, now) {
    now = now || new Date(); var today = localD(now); var at = item.at || '', due = item.due || '', untilS = item.until || '';
    var done = item.col === 'done' || item.status === 'posted';
    if (!at && !due) return '';
    if (!done) {
      if (due && due < today) return 'overdue';
      if (at && !untilS && !isAllDay(at) && toDate(at) < now) return 'overdue';
      if (at && isAllDay(at) && at < today) return 'overdue';
    }
    if (at && untilS && toDate(untilS) < now) return 'past';
    if (done && (at || due) && (dayKey(at || due) < today)) return 'past';
    if ((at && dayKey(at) === today) || (!at && due === today)) return 'today';
    return 'upcoming';
  }
  function label(stamp, now, opts) {
    now = now || new Date(); var s = String(stamp || ''); if (!s) return ''; var d = toDate(s); if (!d) return s;
    var today = localD(now); var tm = new Date(now.getTime()); tm.setDate(tm.getDate() + 1);
    var key = dayKey(s); var time = isAllDay(s) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes());
    var dayPart = key === today ? 'Today' : key === localD(tm) ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    if (opts && opts.short && key === today && time) return time;
    return time ? dayPart + ' ' + time : dayPart;
  }
  function timeOf(stamp) { return isAllDay(stamp) ? '' : String(stamp).slice(11, 16); }
  function range(at, untilS) { var a = timeOf(at); if (!a) return 'all day'; var u = untilS ? timeOf(untilS) : ''; return u && dayKey(untilS) === dayKey(at) ? a + '–' + u : a; }
  // A date at the end of a title becomes the task's time or deadline. Only when it is unmistakable: a time is present,
  // the token is date-shaped (2026-10-20, +3d), or a keyword precedes it (at · on · due · by). "Prepare for Monday" stays a title.
  function extract(text, now) {
    var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim(); var out = { title: s, at: '', until: '', due: '' };
    var toks = s.split(' '); if (toks.length < 2 || parse(s, now)) return out;   // the whole text is a date → it is the title, not a date
    var last = toks[toks.length - 1]; var rng = last.match(/^(\d{1,2}:\d{2})[-–](\d{1,2}:\d{2})$/); var untilTxt = '';
    if (rng) { untilTxt = rng[2]; toks = toks.slice(0, -1).concat([rng[1]]); }
    for (var n = Math.min(2, toks.length - 1); n >= 1; n--) {
      var tail = toks.slice(-n).join(' '); var p = parse(tail, now); if (!p) continue;
      var head = toks.slice(0, -n); var kw = (head[head.length - 1] || '').toLowerCase();
      var isDue = kw === 'due' || kw === 'by'; var hasKw = isDue || kw === 'at' || kw === 'on';
      var hasTime = /\d{1,2}:\d{2}/.test(tail); var shaped = /^(\d{4}-\d{2}-\d{2}|\+\d+d)/.test(tail);
      if (!hasTime && !shaped && !hasKw) continue;
      if (hasKw) head = head.slice(0, -1); if (!head.length) return out;
      out.title = head.join(' ').replace(/[,:;–-]+$/, '').trim(); if (!out.title) return { title: s, at: '', until: '', due: '' };
      if (isDue) out.due = dayKey(p.stamp); else { out.at = p.stamp; if (untilTxt && !p.allDay) out.until = until(p.stamp, untilTxt, now); }
      return out;
    }
    return out;
  }
  return { parse: parse, until: until, extract: extract, WEEKDAY: WEEKDAY, state: state, label: label, dayKey: dayKey, isAllDay: isAllDay, toDate: toDate, localDT: localDT, localD: localD, timeOf: timeOf, range: range, pad: pad };
});
