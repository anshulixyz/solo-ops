/* =========================================================================
   store.js — persistence layer
   Wraps localStorage with a safe in-memory fallback so the board still works
   when storage is blocked (e.g. some private-browsing contexts). Exposes a
   single global `Store`.
   ========================================================================= */
(function (global) {
  'use strict';

  var mem = {};
  var ok = false;
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    ok = true;
  } catch (e) {
    ok = false;
  }

  global.Store = {
    ok: ok,
    get: function (k) {
      try {
        return ok ? localStorage.getItem(k) : (k in mem ? mem[k] : null);
      } catch (e) {
        return k in mem ? mem[k] : null;
      }
    },
    set: function (k, v) {
      try {
        if (ok) { localStorage.setItem(k, v); } else { mem[k] = v; }
      } catch (e) {
        mem[k] = v;
      }
    }
  };
})(window);
