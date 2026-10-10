/* core/theme-boot.js — runs in <head> before paint: applies the saved theme
   (or the config default) so there is no flash. Load after marathon.config.js. */
(function () {
  var mode = 'auto', palette = 'warm';
  try {
    var cfg = (window.MARATHON_CONFIG && window.MARATHON_CONFIG.theme) || {};
    mode = cfg.mode || mode; palette = cfg.palette || palette;
    var saved = JSON.parse(localStorage.getItem('marathon.theme') || 'null');
    if (saved && typeof saved === 'object') { mode = saved.mode || mode; palette = saved.palette || palette; }
    else {
      // legacy keys from the pre-open-source apps
      var legacy = localStorage.getItem('anshuli.runway.theme') || localStorage.getItem('marathon.scriptViewer.theme');
      if (legacy === 'dark' || legacy === 'light') mode = legacy;
    }
  } catch (e) { /* ignore */ }
  var resolved = mode === 'auto'
    ? ((window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light')
    : mode;
  var el = document.documentElement;
  el.setAttribute('data-theme', resolved);
  el.setAttribute('data-palette', palette);
  el.style.colorScheme = resolved;
})();
