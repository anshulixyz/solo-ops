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
    // sample-data flags: set when a model seeds the template, cleared by the
    // first real write; sync lets a data file win over fresh sample data
    markFresh: function (k) { try { if (ok) localStorage.setItem(FRESH + k, '1'); else mem[FRESH + k] = '1'; } catch (e) { mem[FRESH + k] = '1'; } },
    isFresh: function (k) { return get(FRESH + k) === '1'; }
  };
})(typeof window !== 'undefined' ? window : this);
