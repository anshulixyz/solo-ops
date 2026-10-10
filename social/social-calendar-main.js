/* =========================================================================
   social-calendar-main.js
   ========================================================================= */
(function (global) {
  'use strict';

  var THEME_KEY = 'anshuli.runway.theme';
  var viewYear, viewMonth;

  function render() {
    SocialCalendarView.render(viewYear, viewMonth);
  }

  global.calPrev = function () {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    render();
  };

  global.calNext = function () {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    render();
  };

  global.calToday = function () {
    var n = new Date();
    viewYear = n.getFullYear();
    viewMonth = n.getMonth();
    render();
  };

  global.toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') || 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    Store.set(THEME_KEY, next);
  };

  function init() {
    SocialModel.init();
    SocialAssets.open().catch(function () {});
    var n = new Date();
    viewYear = n.getFullYear();
    viewMonth = n.getMonth();
    var params = new URLSearchParams(location.search);
    if (params.get('y')) viewYear = parseInt(params.get('y'), 10) || viewYear;
    if (params.get('m')) viewMonth = (parseInt(params.get('m'), 10) || viewMonth + 1) - 1;
    render();
    if (location.hash === '#streak') {
      setTimeout(function () {
        var el = document.getElementById('streak');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
