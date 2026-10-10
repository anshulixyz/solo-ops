/* =========================================================================
   core/palette.js — ⌘K / Ctrl-K command palette. The same verbs as the CLI.
   Apps register commands:
     Palette.register([{ label:'Add task', prefix:'add', hint:'add <title>',
                         run: function (arg) {...}, keywords:'new create' }])
   Typing "add Fix the header" runs the `add` command with that argument.
   ========================================================================= */
(function (global) {
  'use strict';

  var cmds = [];
  var box = null, input = null, list = null;
  var sel = 0, visible = [];
  var root = './';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function register(arr) { (Array.isArray(arr) ? arr : [arr]).forEach(function (c) { cmds.push(c); }); }

  function builtins() {
    var nav = [
      ['Hub', 'index.html'], ['Task board', 'runway/marathon-board.html'], ['Social schedule', 'social/social-board.html'],
      ['Calendar', 'social/social-calendar.html'], ['Script viewer', 'studio/script-viewer.html'], ['Writing viewer', 'studio/writing-viewer.html']
    ].map(function (n) { return { label: 'Go to ' + n[0], hint: 'nav', keywords: 'open page', run: function () { location.href = root + n[1] + (global.Config ? '?ws=' + encodeURIComponent(Config.activeWs()) : ''); } }; });
    var theme = [];
    if (global.Theme) {
      Theme.MODES.forEach(function (m) { theme.push({ label: 'Theme mode: ' + m, hint: 'theme', run: function () { Theme.set({ mode: m }); } }); });
      Theme.PALETTES.forEach(function (p) { theme.push({ label: 'Palette: ' + p.label, hint: 'theme', run: function () { Theme.set({ palette: p.id }); } }); });
      theme.push({ label: 'Open theme picker', hint: 'theme', run: function () { Theme.openPicker(document.querySelector('.palette-btn')); } });
    }
    var sync = [];
    if (global.Sync) {
      sync.push({ label: 'Link data folder', hint: 'sync', keywords: 'connect folder file', run: function () { Sync.linkFolder(); } });
      sync.push({ label: 'Reload from data files', hint: 'sync', keywords: 'pull refresh', run: function () { Sync.pullAll(false); } });
    }
    return nav.concat(theme, sync);
  }

  function match(q) {
    var all = cmds.concat(builtins());
    q = (q || '').trim();
    if (!q) return all.map(function (c) { return { c: c, arg: '' }; });
    var lower = q.toLowerCase();
    var pre = all.filter(function (c) { return c.prefix && (lower === c.prefix || lower.indexOf(c.prefix + ' ') === 0); })
      .map(function (c) { return { c: c, arg: q.slice(c.prefix.length).trim() }; });
    if (pre.length) return pre;
    return all.filter(function (c) { return (c.label + ' ' + (c.keywords || '') + ' ' + (c.prefix || '')).toLowerCase().indexOf(lower) >= 0; })
      .map(function (c) { return { c: c, arg: '' }; });
  }

  function render() {
    visible = match(input.value);
    if (sel >= visible.length) sel = Math.max(0, visible.length - 1);
    if (!visible.length) { list.innerHTML = '<div class="cmdk-empty">No command. Try “add …”, “week”, “theme”.</div>'; return; }
    list.innerHTML = visible.map(function (v, i) {
      return '<div class="cmdk-item ' + (i === sel ? 'on' : '') + '" data-i="' + i + '"><span class="lb">' + esc(v.c.label) +
        (v.arg ? ' <span class="arg">' + esc(v.arg) + '</span>' : '') + '</span><span class="hint">' + esc(v.c.hint || (v.c.prefix ? v.c.prefix + ' …' : '')) + '</span></div>';
    }).join('');
    var items = list.querySelectorAll('.cmdk-item');
    for (var i = 0; i < items.length; i++) {
      items[i].onmouseenter = function () { sel = +this.dataset.i; highlight(); };
      items[i].onclick = function () { sel = +this.dataset.i; run(); };
    }
    var on = list.querySelector('.cmdk-item.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }
  function highlight() {
    var items = list.querySelectorAll('.cmdk-item');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('on', i === sel);
  }
  function run() {
    var v = visible[sel]; if (!v) return;
    if (v.c.prefix && !v.arg && v.c.needsArg !== false) { input.value = v.c.prefix + ' '; render(); return; }
    close();
    try { v.c.run(v.arg); } catch (e) { console.error(e); }
  }
  function ensure() {
    if (box) return;
    box = document.createElement('div'); box.className = 'cmdk';
    box.innerHTML = '<div class="cmdk-box"><input placeholder="Type a command… (add, done, move, week, theme)" spellcheck="false">' +
      '<div class="cmdk-list"></div><div class="cmdk-foot"><span>↑↓ choose</span><span>↵ run</span><span>esc close</span><span>same verbs as node marathon.js</span></div></div>';
    document.body.appendChild(box);
    input = box.querySelector('input'); list = box.querySelector('.cmdk-list');
    input.addEventListener('input', function () { sel = 0; render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(visible.length - 1, sel + 1); highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); highlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(); }
      else if (e.key === 'Escape') { close(); }
    });
    box.addEventListener('mousedown', function (e) { if (e.target === box) close(); });
  }
  function open(prefill) {
    ensure(); box.classList.add('open'); input.value = prefill || ''; sel = 0; render(); input.focus();
  }
  function close() { if (box) box.classList.remove('open'); }
  function isOpen() { return !!(box && box.classList.contains('open')); }

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); isOpen() ? close() : open(); }
  });

  global.Palette = {
    register: register, open: open, close: close, isOpen: isOpen,
    init: function (opts) { root = (opts && opts.root) || './'; }
  };
})(typeof window !== 'undefined' ? window : this);
