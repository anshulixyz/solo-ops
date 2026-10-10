/* =========================================================================
   core/theme.js — mode (auto/light/dark) + palette presets, persisted under
   `marathon.theme` and mirrored to data/settings.json via core/sync.js.
   Global `Theme` + global `toggleTheme()` for the existing buttons.
   ========================================================================= */
(function (global) {
  'use strict';

  var KEY = 'marathon.theme';
  var PALETTES = [
    { id: 'warm', label: 'Warm', sw: ['#F4F1EA', '#CC6B4A'] },
    { id: 'paper', label: 'Paper', sw: ['#F3F4F6', '#4F5BD5'] },
    { id: 'forest', label: 'Forest', sw: ['#EEF2EA', '#3F7A4E'] },
    { id: 'dusk', label: 'Dusk', sw: ['#F0EEF5', '#7A4E8C'] },
    { id: 'mono', label: 'Mono', sw: ['#F2F2F2', '#222222'] }
  ];
  var MODES = ['auto', 'light', 'dark'];
  var cfgDefault = (global.Config && Config.get('theme')) || (global.MARATHON_CONFIG && MARATHON_CONFIG.theme) || {};
  var cur = normalize(Store.getJSON(KEY, null) || cfgDefault);
  var mq = global.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

  function normalize(t) {
    t = t || {};
    return {
      mode: MODES.indexOf(t.mode) >= 0 ? t.mode : 'auto',
      palette: PALETTES.some(function (p) { return p.id === t.palette; }) ? t.palette : 'warm'
    };
  }
  function resolved() {
    if (cur.mode !== 'auto') return cur.mode;
    return (mq && mq.matches) ? 'dark' : 'light';
  }
  function apply() {
    var el = document.documentElement;
    var r = resolved();
    el.setAttribute('data-theme', r);
    el.setAttribute('data-palette', cur.palette);
    el.style.colorScheme = r;
    var dots = document.querySelectorAll('.palette-btn i');
    for (var i = 0; i < dots.length; i++) dots[i].style.background = 'var(--accent)';
  }
  function set(partial, opts) {
    cur = normalize({ mode: partial.mode || cur.mode, palette: partial.palette || cur.palette });
    Store.setJSON(KEY, cur, opts);
    apply();
    if (pop) renderPop();
  }
  function toggleMode() {
    set({ mode: resolved() === 'dark' ? 'light' : 'dark' });
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (cur.mode === 'auto') apply(); });

  /* ---- picker popover ---- */
  var pop = null, anchorEl = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderPop() {
    pop.innerHTML = '<h4>Mode</h4><div class="mt-seg">' + MODES.map(function (m) {
      return '<button type="button" data-mode="' + m + '" class="' + (cur.mode === m ? 'on' : '') + '">' + m + '</button>';
    }).join('') + '</div><h4>Palette</h4><div class="mt-swatches">' + PALETTES.map(function (p) {
      return '<button type="button" class="mt-sw ' + (cur.palette === p.id ? 'on' : '') + '" data-palette="' + p.id + '" title="' + esc(p.label) + '">' +
        '<i style="background:linear-gradient(135deg,' + p.sw[0] + ' 55%,' + p.sw[1] + ' 55%)"></i><span>' + esc(p.label) + '</span></button>';
    }).join('') + '</div><div class="mt-hint">Also from the terminal: <code>node solo.js theme set dusk</code></div>';
    var btns = pop.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = function () {
        if (this.dataset.mode) set({ mode: this.dataset.mode });
        if (this.dataset.palette) set({ palette: this.dataset.palette });
      };
    }
  }
  function openPicker(anchor) {
    if (pop) { closePicker(); return; }
    anchorEl = anchor || null;
    pop = document.createElement('div');
    pop.className = 'mt-pop theme-pop';
    document.body.appendChild(pop);
    renderPop();
    var r = anchorEl ? anchorEl.getBoundingClientRect() : { right: window.innerWidth - 20, bottom: 20 };
    pop.style.top = (r.bottom + 8) + 'px';
    pop.style.right = Math.max(10, window.innerWidth - r.right) + 'px';
    setTimeout(function () { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); }, 0);
  }
  function closePicker() {
    if (!pop) return;
    pop.remove(); pop = null;
    document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey);
  }
  function onDoc(e) { if (pop && !pop.contains(e.target) && e.target !== anchorEl && !(anchorEl && anchorEl.contains(e.target))) closePicker(); }
  function onKey(e) { if (e.key === 'Escape') closePicker(); }

  // Adds a palette button next to every .theme-btn that lacks one.
  function mount() {
    var btns = document.querySelectorAll('.theme-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].nextElementSibling && btns[i].nextElementSibling.classList.contains('palette-btn')) continue;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'palette-btn'; b.title = 'Theme & palette';
      b.innerHTML = '<i></i>Theme';
      b.onclick = function (e) { e.stopPropagation(); openPicker(this); };
      btns[i].insertAdjacentElement('afterend', b);
    }
    apply();
    // mirror to data/settings.json when sync is present
    if (global.Sync) {
      Sync.register({
        file: 'settings.json', key: KEY, label: 'settings',
        read: function () { return { theme: cur }; },
        apply: function (body) { if (body && body.theme) set(body.theme, { silent: true }); }
      });
    }
  }

  global.toggleTheme = toggleMode;
  global.Theme = {
    KEY: KEY, PALETTES: PALETTES, MODES: MODES,
    get: function () { return { mode: cur.mode, palette: cur.palette }; },
    resolved: resolved, set: set, toggleMode: toggleMode, apply: apply,
    openPicker: openPicker, closePicker: closePicker, mount: mount
  };
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})(typeof window !== 'undefined' ? window : this);
