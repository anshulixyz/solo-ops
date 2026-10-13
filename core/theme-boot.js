/* core/theme-boot.js — runs in <head> before paint: applies the saved theme
   (or the config default) so there is no flash. Load after solo.config.js. */
(function () {
  var mode = 'auto', palette = 'mono', font = 'inter';
  try {
    var cfg = (window.MARATHON_CONFIG && window.MARATHON_CONFIG.theme) || {};
    mode = cfg.mode || mode; palette = cfg.palette || palette; font = cfg.font || font;
    var saved = JSON.parse(localStorage.getItem('marathon.theme') || 'null');
    if (saved && typeof saved === 'object') { mode = saved.mode || mode; palette = saved.palette || palette; font = saved.font || font; }
    else {
      // legacy keys from the pre-open-source apps
      var legacy = localStorage.getItem('anshuli.runway.theme') || localStorage.getItem('marathon.scriptViewer.theme');
      if (legacy === 'dark' || legacy === 'light') mode = legacy;
    }
  } catch (e) { /* ignore */ }
  try { var qt = new URLSearchParams(location.search).get('theme'); if (qt === 'dark' || qt === 'light') mode = qt; var qp = new URLSearchParams(location.search).get('palette'); if (qp) palette = qp; var qf = new URLSearchParams(location.search).get('font'); if (qf) font = qf; } catch (e) { /* ignore */ }
  var resolved = mode === 'auto'
    ? ((window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light')
    : mode;
  var el = document.documentElement;
  el.setAttribute('data-theme', resolved);
  el.setAttribute('data-palette', palette);
  el.setAttribute('data-font', font);
  el.style.colorScheme = resolved;
})();
