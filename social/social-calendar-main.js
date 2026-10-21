/* =========================================================================
   social-calendar-main.js
   ========================================================================= */
(function (global) {
  'use strict';

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

  function init() {
    Config.applyDOM();
    SocialModel.init();
    SocialAssets.open().catch(function () {});
    Sync.register({
      file: Config.file('social'), key: SocialModel.KEY, label: 'schedule', isFresh: SocialModel.isFresh,
      read: function () { return { posts: SocialModel.getState() }; },
      apply: function (body) { if (Array.isArray(body.posts)) { SocialModel.replaceAll(body.posts, { silent: true }); render(); } }
    });
    global.refreshSchedule = function () { SocialModel.replaceAll(Store.getJSON(SocialModel.KEY, []) || [], { silent: true }); render(); };   // after a pasted reply (the Guide): the file write reads the model, so it takes the browser copy first
    Palette.init({ root: '../' });
    Palette.register([
      { label: 'Previous month', hint: 'calendar', run: global.calPrev },
      { label: 'Next month', hint: 'calendar', run: global.calNext },
      { label: 'Today', hint: 'calendar', run: global.calToday }
    ]);
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
