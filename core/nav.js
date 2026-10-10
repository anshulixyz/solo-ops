/* =========================================================================
   core/nav.js — top navigation shared by every page. Renders into
   <nav data-nav data-root="../"></nav>: workspace switcher, Home, each board
   of the active workspace, and only the apps that workspace includes. Links
   carry ?ws=<id> so the workspace follows you between pages. Global `Nav`.
   ========================================================================= */
(function (global) {
  'use strict';

  var ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z"/></svg>',
    board: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18"/></svg>',
    social: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    script: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4M16 5v4M10 12l4 2.5-4 2.5z"/></svg>',
    writing: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function items(root) {
    var w = Config.ws(); var q = '?ws=' + encodeURIComponent(w.id);
    var here = location.pathname.replace(/.*\//, '');
    var cur = new URLSearchParams(location.search);
    var out = [{ id: 'home', icon: 'home', label: 'Home', href: root + 'index.html' + q, on: here === 'index.html' || here === '' }];
    Config.boards(w.id).forEach(function (b) {
      out.push({ id: 'board:' + b.id, icon: 'board', label: b.title, href: root + 'runway/marathon-board.html' + q + '&board=' + encodeURIComponent(b.id),
        on: here === 'marathon-board.html' && (global.Model ? Model.BOARD === b.id : cur.get('board') === b.id) });
    });
    if (w.apps.social) {
      out.push({ id: 'social', icon: 'social', label: Config.get('social.title'), href: root + 'social/social-board.html' + q, on: here === 'social-board.html' });
      out.push({ id: 'calendar', icon: 'calendar', label: 'Calendar', href: root + 'social/social-calendar.html' + q, on: here === 'social-calendar.html' });
    }
    if (w.apps.scripts) out.push({ id: 'scripts', icon: 'script', label: Config.get('studio.scriptTitle'), href: root + 'studio/script-viewer.html' + q, on: here === 'script-viewer.html' });
    if (w.apps.writing) out.push({ id: 'writing', icon: 'writing', label: Config.get('studio.writingTitle'), href: root + 'studio/writing-viewer.html' + q, on: here === 'writing-viewer.html' });
    return out;
  }

  function render() {
    var slots = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i]; var root = el.getAttribute('data-root') || './';
      var all = Config.workspaces(); var w = Config.ws();
      var sw = all.length > 1
        ? '<select class="nav-ws" title="Workspace" onchange="Nav.switchWs(this.value)">' + all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === w.id ? ' selected' : '') + '>' + esc(x.title) + '</option>'; }).join('') + '</select>'
        : '<span class="nav-ws-one" title="Workspace">' + esc(w.title) + '</span>';
      el.innerHTML = '<div class="nav-left">' + sw + '</div><div class="nav-items">' + items(root).map(function (it) {
        return '<a class="nav-item' + (it.on ? ' on' : '') + '" href="' + it.href + '" data-nav-id="' + esc(it.id) + '">' + ICON[it.icon] + '<span>' + esc(it.label) + '</span></a>';
      }).join('') + '</div>';
    }
  }
  function switchWs(id) {
    Config.setActiveWs(id);
    var here = location.pathname.replace(/.*\//, '');
    var root = (document.querySelector('[data-nav]') || {}).getAttribute ? (document.querySelector('[data-nav]').getAttribute('data-root') || './') : './';
    // board pages belong to one workspace's boards; go to Home for the new one
    if (here === 'marathon-board.html') { location.href = root + 'index.html?ws=' + encodeURIComponent(id); return; }
    location.href = location.pathname + '?ws=' + encodeURIComponent(id);
  }
  function init() {
    Config.setActiveWs(Config.activeWs());
    render();
    if (global.Sync) Sync.on(function (evt, d) { if (evt === 'applied' && d && (d.file === 'boards.json' || d.file === 'workspaces.json')) render(); });
  }
  global.Nav = { render: render, switchWs: switchWs, items: items };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : this);
