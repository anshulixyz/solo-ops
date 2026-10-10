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
    writing: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    inspo: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    install: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>'
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
    out.push({ id: 'inspo', icon: 'inspo', label: 'Inspiration', href: root + 'inspo/inspiration.html' + q, on: here === 'inspiration.html' });
    return out;
  }

  function render() {
    var slots = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i]; var root = el.getAttribute('data-root') || './';
      var all = Config.workspaces(); var w = Config.ws();
      var sw = '<label class="nav-wsbox" title="Switch workspace"><span class="nav-wslabel">Workspace</span>' +
        '<select class="nav-ws" onchange="Nav.switchWs(this.value)">' + all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === w.id ? ' selected' : '') + '>' + esc(x.title) + '</option>'; }).join('') +
        '<option disabled>──────</option><option value="__new">+ New workspace…</option></select>' +
        '<svg class="nav-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></label>';
      el.innerHTML = '<div class="nav-left">' + sw + '</div><div class="nav-items">' + items(root).map(function (it) {
        return '<a class="nav-item' + (it.on ? ' on' : '') + '" href="' + it.href + '" data-nav-id="' + esc(it.id) + '">' + ICON[it.icon] + '<span>' + esc(it.label) + '</span></a>';
      }).join('') +
      (global.InspoQuick ? '<button type="button" class="nav-item nav-inspo" title="Save to inspiration (⌘⇧I) — a link, an idea, an image" onclick="InspoQuick.open()">' + ICON.plus + '<span>Inspo</span></button>' : '') +
      (global.Guide ? '<button type="button" class="nav-item nav-guide" title="Guide: what this page does + prompts for your agent (?)" onclick="Guide.toggle()"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg><span>Guide</span></button>' : '') +
      '<button type="button" class="nav-item nav-install" id="navInstall" style="display:none" title="Install Solo Ops as an app">' + ICON.install + '<span>Install</span></button>' +
      '</div>';
      bindInstall();
    }
  }
  function switchWs(id) {
    var root = (document.querySelector('[data-nav]') && document.querySelector('[data-nav]').getAttribute('data-root')) || './';
    if (id === '__new') {
      render();   // reset the select to the current workspace
      if (global.toggleWsPanel) { toggleWsPanel('new'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      location.href = root + 'index.html?ws=' + encodeURIComponent(Config.activeWs()) + '#new-ws'; return;
    }
    Config.setActiveWs(id);
    var here = location.pathname.replace(/.*\//, '');
    // board pages belong to one workspace's boards; go to Home for the new one
    if (here === 'marathon-board.html') { location.href = root + 'index.html?ws=' + encodeURIComponent(id); return; }
    location.href = location.pathname + '?ws=' + encodeURIComponent(id);
  }
  /* ---- PWA: service worker + install button ---- */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; bindInstall(); });
  function bindInstall() {
    var b = document.getElementById('navInstall'); if (!b) return;
    b.style.display = installEvt ? '' : 'none';
    b.onclick = function () { if (!installEvt) return; installEvt.prompt(); installEvt.userChoice.then(function () { installEvt = null; bindInstall(); }); };
  }
  function registerSW(root) {
    if (!('serviceWorker' in navigator) || location.protocol.indexOf('http') !== 0) return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register(root + 'sw.js', { scope: root, updateViaCache: 'none' }).then(function (reg) {
      // look for a newer worker whenever the page is shown again, and every 10 min
      var check = function () { reg.update().catch(function () {}); };
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
      setInterval(check, 10 * 60 * 1000);
    }).catch(function () {});
    // a new worker activated (skipWaiting + claim): offer a reload, never force it
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadController) updateToast(); hadController = true; });
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'sw-activated' && hadController) updateToast(); });
  }
  var toastShown = false;
  function updateToast() {
    if (toastShown) return; toastShown = true;
    var t = document.createElement('div'); t.className = 'update-toast';
    t.innerHTML = '<span>New version ready.</span><button type="button">Reload</button><button type="button" class="later" title="Reload later">×</button>';
    t.querySelector('button').onclick = function () { location.reload(); };
    t.querySelector('.later').onclick = function () { t.remove(); };
    document.body.appendChild(t);
  }
  function init() {
    Config.setActiveWs(Config.activeWs());
    var slot = document.querySelector('[data-nav]'); registerSW(slot ? (slot.getAttribute('data-root') || './') : './');
    render();
    if (global.Sync) Sync.on(function (evt, d) { if (evt === 'applied' && d && (d.file === 'boards.json' || d.file === 'workspaces.json')) render(); });
  }
  global.Nav = { render: render, switchWs: switchWs, items: items };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : this);
