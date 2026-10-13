/* =========================================================================
   core/datepick.js — a native date/time picker next to a text field.
   The text field keeps the fast grammar (tomorrow 14:00 · fri 10:00); the
   button beside it opens the browser's own picker and writes the choice
   back as text the field already understands. Markup:
     <input data-pick="datetime|date|time">   → DatePick.mount(root)
   The native input sits over the button at opacity 0, so a tap on the
   button is a tap on the picker: no showPicker() needed, works on phones.
   Global `DatePick`.
   ========================================================================= */
(function (global) {
  'use strict';
  var ICON = { datetime: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M12 13v4M10 15h4"/></svg>',
    date: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    time: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' };
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  // what the native input should start on, from the text already in the field
  function initial(kind, text, base) {
    var W = global.When; text = String(text || '').trim();
    if (kind === 'time') { var m = text.match(/^(\d{1,2}):(\d{2})$/); return m ? pad(+m[1]) + ':' + m[2] : ''; }
    var p = W && text ? W.parse(text) : null; var stamp = p ? p.stamp : (base || '');
    if (!stamp && W) stamp = W.localDT(new Date()).slice(0, 11) + '09:00';   // empty or unparsable text: start the picker on today 09:00
    if (!stamp) return '';
    if (kind === 'date') return stamp.slice(0, 10);
    return stamp.length === 10 ? stamp + 'T09:00' : stamp.slice(0, 16);
  }
  function attach(input) {
    if (!input || input._dp) return; input._dp = true;
    var k = input.getAttribute('data-pick'); var kind = ICON[k] ? k : 'datetime'; var type = kind === 'datetime' ? 'datetime-local' : kind;
    var wrap = document.createElement('span'); wrap.className = 'dp'; wrap.title = kind === 'time' ? 'Pick a time' : kind === 'date' ? 'Pick a date' : 'Pick a date and time';
    wrap.innerHTML = ICON[kind] + '<input type="' + type + '" class="dp-native" aria-label="' + wrap.title + '">';
    var nat = wrap.querySelector('input');
    function prime() { nat.value = initial(kind, input.value, input.getAttribute('data-pick-base')); }
    // Chrome opens on the stretched indicator by itself; Firefox and Safari need showPicker() (throws without a user gesture, or on iOS when the tap already opened it: ignore)
    function open() { prime(); if (typeof nat.showPicker === 'function') { try { nat.showPicker(); return true; } catch (e) { /* native default action takes over */ } } return false; }
    wrap.addEventListener('mousedown', prime); wrap.addEventListener('touchstart', prime, { passive: true });
    nat.addEventListener('click', function (e) { if (open()) e.preventDefault(); });
    nat.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    nat.addEventListener('change', function () {
      var v = nat.value; if (!v) return;
      input.value = kind === 'datetime' ? v.slice(0, 16).replace('T', ' ') : kind === 'date' ? v.slice(0, 10) : v.slice(0, 5);
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); input.focus();
    });
    input.insertAdjacentElement('afterend', wrap);
  }
  global.DatePick = {
    attach: attach,
    mount: function (root) { Array.prototype.forEach.call((root || document).querySelectorAll('input[data-pick]'), attach); }
  };
})(window);
