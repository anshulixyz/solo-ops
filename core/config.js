/* =========================================================================
   core/config.js — reads marathon.config.js (window.MARATHON_CONFIG), fills
   defaults, and exposes helpers + a tiny DOM binder. Global `Config`.
   Usage in HTML: <span data-cfg="eyebrow"></span> gets the config value.
   ========================================================================= */
(function (global) {
  'use strict';

  var DEFAULTS = {
    name: 'Marathon', eyebrow: 'Solo founder ops',
    projects: [{ name: 'general', hue: 45 }],
    runway: { title: 'Launch Runway', tags: [], tagHues: {}, milestones: [], focus: [], sprintLabel: 'Sprint progress' },
    social: { title: 'Social Schedule', network: 'X / Twitter', arcLabel: 'Posting arc', milestones: [], focus: [],
      postTypes: ['announcement', 'launch', 'update', 'thread', 'teaser'],
      prepKinds: ['content', 'video', 'dev', 'design', 'outreach', 'other'] },
    studio: { scriptTitle: 'Script Viewer', writingTitle: 'Writing Viewer' },
    theme: { mode: 'auto', palette: 'warm' },
    sync: { port: 4321, pollMs: 3000 }
  };

  function merge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(over || {}).forEach(function (k) {
      var v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = merge(base[k], v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    });
    return out;
  }

  var cfg = merge(DEFAULTS, global.MARATHON_CONFIG || {});
  // normalize projects: allow plain strings
  cfg.projects = (cfg.projects || []).map(function (p) {
    return typeof p === 'string' ? { name: p, hue: hashHue(p) } : { name: p.name, hue: p.hue != null ? p.hue : hashHue(p.name) };
  });
  if (!cfg.projects.length) cfg.projects = [{ name: 'general', hue: 45 }];

  function hashHue(s) {
    var h = 0, i;
    s = String(s || '');
    for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return h % 360;
  }
  function path(obj, p) {
    return String(p).split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  global.Config = {
    get: function (p) { return p ? path(cfg, p) : cfg; },
    all: cfg,
    projectNames: function () { return cfg.projects.map(function (p) { return p.name; }); },
    projectHue: function (name) {
      for (var i = 0; i < cfg.projects.length; i++) if (cfg.projects[i].name === name) return cfg.projects[i].hue;
      return hashHue(name);
    },
    tagHue: function (tag) {
      var h = cfg.runway.tagHues || {};
      return h.hasOwnProperty(tag) ? h[tag] : hashHue(tag);
    },
    hashHue: hashHue,
    // Fill [data-cfg="a.b"] text, [data-cfg-title="runway.title"] document title,
    // and the shared header pieces (milestone ticks, focus cards).
    applyDOM: function () {
      var nodes = document.querySelectorAll('[data-cfg]');
      for (var i = 0; i < nodes.length; i++) {
        var v = path(cfg, nodes[i].getAttribute('data-cfg'));
        if (v != null) nodes[i].textContent = v;
      }
      var t = document.querySelector('[data-cfg-title]');
      if (t) {
        var tv = path(cfg, t.getAttribute('data-cfg-title'));
        if (tv) document.title = tv + ' — ' + cfg.name;
      }
      var ticks = document.querySelectorAll('[data-cfg-ticks]');
      for (var j = 0; j < ticks.length; j++) {
        var arr = path(cfg, ticks[j].getAttribute('data-cfg-ticks')) || [];
        ticks[j].innerHTML = arr.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
        ticks[j].style.display = arr.length ? '' : 'none';
      }
      var focus = document.querySelectorAll('[data-cfg-focus]');
      for (var k = 0; k < focus.length; k++) {
        var cards = path(cfg, focus[k].getAttribute('data-cfg-focus')) || [];
        var extra = focus[k].innerHTML; // static cards already in markup (e.g. cross-links) stay
        focus[k].innerHTML = cards.map(function (c, idx) {
          return '<div class="pri' + (idx % 2 ? ' two' : '') + '"><span class="k">' + esc(c.k || '') + '</span>' +
            '<span><span class="t">' + esc(c.t || '') + '</span><br><span class="s">' + esc(c.s || '') + '</span></span></div>';
        }).join('') + extra;
        focus[k].style.display = focus[k].children.length ? '' : 'none';
      }
    }
  };
})(typeof window !== 'undefined' ? window : this);
