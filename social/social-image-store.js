/* =========================================================================
   social-image-store.js — image data separate from post JSON (avoids quota issues)
   ========================================================================= */
(function (global) {
  'use strict';

  var KEY = 'marathon.social.imgdata';
  Store.migrate('anshuli.social.imgdata.v1', KEY);
  var cache = null;

  function load() {
    if (cache) return cache;
    cache = {};
    try {
      var raw = Store.get(KEY);
      if (raw) cache = JSON.parse(raw);
    } catch (e) { cache = {}; }
    return cache;
  }

  function save() {
    try {
      Store.set(KEY, JSON.stringify(cache));
      return true;
    } catch (e) {
      return false;
    }
  }

  global.SocialImageStore = {
    KEY: KEY,

    get: function (id) {
      return load()[id] || '';
    },

    set: function (id, dataUrl) {
      load()[id] = dataUrl;
      return save();
    },

    remove: function (id) {
      if (cache && cache[id]) delete cache[id];
      save();
    },

    exportAll: function () {
      return load();
    },

    importAll: function (map) {
      cache = map || {};
      save();
    },

    clear: function () {
      cache = {};
      save();
    }
  };
})(window);
