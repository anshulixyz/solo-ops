/* =========================================================================
   social-graph-main.js — visual timeline page wiring
   ========================================================================= */
(function (global) {
  'use strict';

  var THEME_KEY = 'anshuli.runway.theme';

  global.toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') || 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    Store.set(THEME_KEY, next);
  };

  function init() {
    SocialModel.init();
    var params = new URLSearchParams(location.search);
    var highlightId = params.get('id') || null;
    SocialGraphView.render(highlightId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
