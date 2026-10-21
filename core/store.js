/* =========================================================================
   core/store.js — persistence layer (shared by every app)
   Wraps localStorage with a safe in-memory fallback, adds change events so
   core/sync.js can mirror app data to files, and migrates legacy keys.
   Exposes a single global `Store`.
   ========================================================================= */
(function (global) {
  'use strict';

  var mem = {};
  var ok = false;
  var listeners = [];
  var FRESH = 'marathon.fresh:';   // flag: this key holds untouched sample data
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    ok = true;
  } catch (e) {
    ok = false;
  }

  function get(k) {
    try {
      return ok ? localStorage.getItem(k) : (k in mem ? mem[k] : null);
    } catch (e) {
      return k in mem ? mem[k] : null;
    }
  }
  function set(k, v, opts) {
    try {
      if (ok) { localStorage.setItem(k, v); } else { mem[k] = v; }
    } catch (e) {
      mem[k] = v;
    }
    if (opts && opts.silent) return;
    remove(FRESH + k);   // any real write means this key is no longer sample data
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](k, v); } catch (err) { /* ignore */ }
    }
  }
  function remove(k) {
    try { if (ok) localStorage.removeItem(k); } catch (e) { /* ignore */ }
    delete mem[k];
  }
  // Copy a legacy key to its new name once (old key is left untouched).
  function migrate(oldKey, newKey) {
    if (get(newKey) != null) return false;
    var v = get(oldKey);
    if (v == null) return false;
    set(newKey, v, { silent: true });
    return true;
  }
  function getJSON(k, fallback) {
    var raw = get(k);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function setJSON(k, v, opts) { set(k, JSON.stringify(v), opts); }
  function flag(k, v) { try { if (ok) localStorage.setItem(FRESH + k, v); else mem[FRESH + k] = v; } catch (e) { mem[FRESH + k] = v; } }
  function seedBlank(k, value) {   // a first open starts empty: written silently, flagged fresh so any data file still wins
    set(k, typeof value === 'string' ? value : JSON.stringify(value), { silent: true }); flag(k, 'blank');
  }

  global.Store = {
    ok: ok,
    get: get,
    set: set,
    remove: remove,
    migrate: migrate,
    getJSON: getJSON,
    setJSON: setJSON,
    // onChange(fn) — fn(key, value) runs after every non-silent set()
    onChange: function (fn) { listeners.push(fn); },
    // "fresh" flags, cleared by the first real write; sync lets a data file win over a fresh key.
    // Two kinds: '1' = the sample was seeded (markFresh), 'blank' = an empty first open (seedBlank).
    // isFresh is the sync meaning (no real copy here, the file wins); isSample is what the pages
    // tell a person ("this is the sample board").
    markFresh: function (k) { try { if (ok) localStorage.setItem(FRESH + k, '1'); else mem[FRESH + k] = '1'; } catch (e) { mem[FRESH + k] = '1'; } },
    seedBlank: seedBlank,
    // A page's first open, in one place: blank (seedBlank), or the sample when core/templates.js says FIRST_OPEN = 'sample'
    // (written silently, flagged '1': "the sample"). Either way the key is fresh, so any data file still wins. → the value used
    firstOpen: function (k, blank, sample) {
      var T = global.MARATHON_TEMPLATES;
      if (T && T.FIRST_OPEN === 'sample' && typeof sample === 'function') { var v = sample(); set(k, JSON.stringify(v), { silent: true }); flag(k, '1'); return v; }
      seedBlank(k, blank); return blank;
    },
    isFresh: function (k) { var f = get(FRESH + k); return f === '1' || f === 'blank'; },
    isSample: function (k) { return get(FRESH + k) === '1'; },
    clearFresh: function (k) { remove(FRESH + k); }   // sample data has yielded to the file: from now on file changes are real changes
  };
})(typeof window !== 'undefined' ? window : this);
