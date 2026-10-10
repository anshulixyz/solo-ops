/* =========================================================================
   core/inspo-quick.js — the "+" on every page: drop a link, note or image
   into the Inspiration inbox without leaving what you are doing.
   Needs InspoModel (inspo/inspo-model.js) loaded on the page.
   ========================================================================= */
(function (global) {
  'use strict';
  var pop = null, pendingImage = '';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function open(prefill) {
    if (pop) { close(); return; }
    if (!global.InspoModel.getState().length && !InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; }
    pop = document.createElement('div'); pop.className = 'inspo-pop';
    var wss = Config.workspaces(); var cur = Config.activeWs();
    pop.innerHTML = '<h4>Add to inspiration</h4>' +
      '<textarea id="inspoQuickText" placeholder="Paste a link, an idea, a quote… #tags work. Drop or paste an image here too.">' + esc(prefill || '') + '</textarea>' +
      '<img class="thumb" id="inspoQuickThumb" style="display:none">' +
      '<div class="row"><select id="inspoQuickWs">' + wss.map(function (w) { return '<option value="' + esc(w.id) + '"' + (w.id === cur ? ' selected' : '') + '>' + esc(w.title) + '</option>'; }).join('') + '<option value="">(no workspace)</option></select>' +
      '<button type="button" class="btn ghost" id="inspoQuickImg">Image…</button><span style="flex:1"></span><button type="button" class="btn primary" id="inspoQuickSave">Save</button></div>' +
      '<div class="hint">Later: open Inspiration → “Use as task / post / script / note”, or “Brainstorm with AI”. Terminal: <code>node marathon.js inspo add "…" --ws ' + esc(cur) + '</code></div>';
    document.body.appendChild(pop);
    var ta = pop.querySelector('#inspoQuickText'); ta.focus();
    ta.addEventListener('paste', function (e) { var f = Array.prototype.filter.call((e.clipboardData || {}).files || [], function (x) { return /^image\//.test(x.type); })[0]; if (f) { e.preventDefault(); readImage(f); } });
    ta.addEventListener('dragover', function (e) { e.preventDefault(); });
    ta.addEventListener('drop', function (e) { var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) { e.preventDefault(); readImage(f); } });
    pop.querySelector('#inspoQuickImg').onclick = function () { var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = function () { if (i.files[0]) readImage(i.files[0]); }; i.click(); };
    pop.querySelector('#inspoQuickSave').onclick = save;
    ta.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(); if (e.key === 'Escape') close(); });
    setTimeout(function () { document.addEventListener('mousedown', onDoc); }, 0);
  }
  function readImage(file) {
    var r = new FileReader(); r.onload = function () { pendingImage = r.result; var t = pop.querySelector('#inspoQuickThumb'); t.src = pendingImage; t.style.display = ''; }; r.readAsDataURL(file);
  }
  function save() {
    var text = pop.querySelector('#inspoQuickText').value.trim(); var ws = pop.querySelector('#inspoQuickWs').value;
    if (!text && !pendingImage) { close(); return; }
    var item = InspoModel.parseQuick(text, { ws: ws, source: 'ui' });
    if (pendingImage) { item.kind = 'image'; item.image = pendingImage; if (!item.title) item.title = 'Image'; }
    InspoModel.add(item);
    if (global.Sync) Sync.note('inspiration.json', 'added: ' + (item.title || item.url || 'image'));
    close();
    toast('Saved to inspiration' + (ws ? ' · ' + ws : ''));
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2200); return; }
    var n = document.getElementById('storeNote') || document.getElementById('flash');
    if (n) { var prev = n.textContent; n.textContent = msg; n.classList && n.classList.add('show'); setTimeout(function () { n.textContent = prev; n.classList && n.classList.remove('show'); }, 2200); }
  }
  function close() { if (pop) { pop.remove(); pop = null; pendingImage = ''; document.removeEventListener('mousedown', onDoc); } }
  function onDoc(e) { if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('.nav-inspo'))) close(); }
  global.InspoQuick = { open: open, close: close };
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); open(); }
  });
})(window);
