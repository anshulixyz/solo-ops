/* =========================================================================
   core/inspo-quick.js — frictionless capture into Inspiration, on every page.
   • a slim capture strip under the nav: type / paste anything, Enter saves
   • drag anything toward the page (link, text, image, file) → the strip
     becomes a full-width drop target; drop anywhere to save
   • paste (⌘V) while no field is focused → saved
   • every save: toast with Undo
   Needs InspoModel (inspo/inspo-model.js). Exposes InspoQuick.open() (focus).
   ========================================================================= */
(function (global) {
  'use strict';
  var bar = null, ta = null, wsSel = null, thumb = null, pendingImage = '', dragDepth = 0, lastId = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function model() { if (!InspoModel._inited) { InspoModel.init(); InspoModel._inited = true; } return InspoModel; }
  function typing(el) { var t = (el && el.tagName || '').toLowerCase(); return t === 'input' || t === 'textarea' || t === 'select' || (el && el.isContentEditable); }

  function mount() {
    var slot = document.querySelector('[data-nav]'); if (!slot || bar) return;
    // The strip saves on every page, so every page syncs data/inspiration.json. A page with an inbox view of its own (Home,
    // Inspiration) registers the file itself and that registration counts; on any other page this fallback is what pulls
    // the file in, writes a capture out and logs it ("saved: …"), the same way as there. Without it a capture made on
    // the board stayed in this browser: the file and the browser carried the same stamp, so neither side ever wrote.
    if (global.Sync && Sync.register) Sync.register({ fallback: true, file: 'inspiration.json', key: InspoModel.KEY, label: 'inspiration', app: 'inspiration', isFresh: function () { return InspoModel.isFresh(); },
      read: function () { return { items: model().getState() }; },
      apply: function (body) { if (Array.isArray(body.items)) model().replaceAll(body.items, { silent: true }); } });
    bar = document.createElement('div'); bar.className = 'capture';
    var wss = Config.workspaces(); var cur = Config.activeWs();
    bar.innerHTML = '<div class="capture-row">' +
      '<svg class="capture-ic" viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>' +
      '<textarea class="capture-in" rows="1" placeholder="Save anything to Inspiration — a link, an idea, a quote · paste or drop an image or file · Enter saves, Shift+Enter for a new line"></textarea>' +
      '<img class="capture-thumb" style="display:none" alt="">' +
      '<select class="capture-ws" title="Which project this belongs to">' + wss.map(function (w) { return '<option value="' + esc(w.id) + '"' + (w.id === cur ? ' selected' : '') + '>' + esc(w.title) + '</option>'; }).join('') + '<option value="">no project</option></select>' +
      '<button type="button" class="capture-img" title="Attach an image or a file">File</button>' +
      '<button type="button" class="capture-save">Save</button></div>' +
      '<div class="capture-drop">Drop it here — link, text, image or file — it goes straight into Inspiration</div>';
    slot.insertAdjacentElement('afterend', bar);
    ta = bar.querySelector('.capture-in'); wsSel = bar.querySelector('.capture-ws'); thumb = bar.querySelector('.capture-thumb');
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') { ta.blur(); } });
    ta.addEventListener('paste', function (e) { var f = imageFrom(e.clipboardData); if (f) { e.preventDefault(); saveImageFile(f, ta.value.trim()); ta.value = ''; grow(); } });
    bar.querySelector('.capture-save').onclick = save;
    bar.querySelector('.capture-img').onclick = function () { var i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.onchange = function () { Array.prototype.forEach.call(i.files, function (f) { saveImageFile(f, ta.value.trim()); }); ta.value = ''; grow(); }; i.click(); };
    bindDrag(); bindPaste();
  }
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; }
  function imageFrom(dt) { return Array.prototype.filter.call((dt && dt.files) || [], function (x) { return /^image\//.test(x.type); })[0] || null; }
  function readImage(file) { var r = new FileReader(); r.onload = function () { pendingImage = r.result; thumb.src = pendingImage; thumb.style.display = ''; ta.focus(); }; r.readAsDataURL(file); }
  // images are saved the moment they arrive; details are optional and can be added later
  function saveImageFile(file, note) { saveFile(file, note); }
  // any file: images get a thumbnail + the original on disk; other files are
  // copied up to the size cap; bigger ones are recorded by name and size only
  function saveFile(file, note) {
    var isImg = /^image\//.test(file.type); var big = global.Attach && Attach.tooBig(file);
    var base = note ? InspoModel.parseQuick(note, {}) : { tags: [], title: '' };
    base.name = file.name || ''; base.size = file.size || 0; base.type = file.type || '';
    if (big) { base.kind = isImg ? 'image' : 'file'; base.text = (base.text ? base.text + '\n' : '') + 'Too large to copy (' + Attach.fmtSize(file.size) + ', cap ' + Attach.cfg().copyMaxMB + ' MB). Paste the file\'s path or a link into this item.'; if (!base.title) base.title = file.name.replace(/\.[^.]+$/, ''); add(base); return; }
    var r = new FileReader();
    r.onload = function () { base.kind = isImg ? 'image' : 'file'; base.original = r.result; if (isImg) base.image = r.result; if (!base.title) base.title = file.name ? file.name.replace(/\.[^.]+$/, '') : ''; add(base); };
    r.readAsDataURL(file);
  }

  function add(item) {
    item.ws = item.ws === undefined ? wsSel.value : item.ws; item.source = 'ui';
    var it = model().add(item); lastId = it.id;
    if (global.Sync) Sync.note('inspiration.json', 'saved: ' + (it.title || it.url || it.kind));
    toast('Saved to Inspiration' + (it.ws ? ' · ' + wsTitle(it.ws) : '') + ((it.kind === 'image' || it.kind === 'file') && !(global.Sync && Sync.attachmentsAvailable()) ? ' · original kept in this browser until the folder is connected' : ''), true);
    return it;
  }
  function save() {
    var text = ta.value.trim(); if (!text && !pendingImage) { ta.focus(); return; }
    var item = InspoModel.parseQuick(text, {});
    if (pendingImage) { item.kind = 'image'; item.image = pendingImage; if (!item.title) item.title = 'Image'; }
    add(item);
    ta.value = ''; pendingImage = ''; thumb.style.display = 'none'; grow();
  }
  function saveDropped(dt) {
    var files = Array.prototype.slice.call(dt.files || []); var n = 0;
    files.forEach(function (f) {
      if (/^image\//.test(f.type)) { saveFile(f, ''); n++; }
      else if ((/^text\//.test(f.type) || /\.(md|txt)$/i.test(f.name)) && f.size < 200000) { var r2 = new FileReader(); r2.onload = function () { add(InspoModel.parseQuick(String(r2.result).slice(0, 5000), { title: f.name })); }; r2.readAsText(f); n++; }
      else { saveFile(f, ''); n++; }
    });
    if (n) return;
    var uri = dt.getData('text/uri-list'); var text = dt.getData('text/plain'); var html = dt.getData('text/html');
    if (uri) { var title = ''; if (html) { var m = html.match(/<a[^>]*>([^<]{1,120})<\/a>/i); if (m) title = m[1].replace(/\s+/g, ' ').trim(); } var it = InspoModel.parseQuick(uri.split('\n')[0] + (title ? ' ' + title : '')); add(it); return; }
    if (html && /<img[^>]+src="(data:image[^"]+|https?:[^"]+)"/i.test(html)) { var src = html.match(/<img[^>]+src="([^"]+)"/i)[1]; if (/^data:image/.test(src)) { add({ kind: 'image', image: src, title: 'Image', tags: [] }); } else { add(InspoModel.parseQuick(src)); } return; }
    if (text) { add(InspoModel.parseQuick(text.slice(0, 5000))); return; }
  }
  function external(dt) { var t = Array.prototype.slice.call(dt && dt.types || []); return t.indexOf('Files') >= 0 || t.indexOf('text/uri-list') >= 0 || t.indexOf('text/plain') >= 0 || t.indexOf('text/html') >= 0; }
  function bindDrag() {
    window.addEventListener('dragenter', function (e) { if (!external(e.dataTransfer)) return; dragDepth++; bar.classList.add('dragging'); });
    window.addEventListener('dragleave', function (e) { if (!external(e.dataTransfer)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) bar.classList.remove('dragging'); });
    window.addEventListener('dragover', function (e) { if (!external(e.dataTransfer)) return; if (e.target.closest && e.target.closest('.col, .dropzone, .inspo-drop, .asset-drop')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('drop', function (e) {
      dragDepth = 0; bar.classList.remove('dragging');
      if (!external(e.dataTransfer)) return;
      if (e.target.closest && e.target.closest('.col, .dropzone, .inspo-drop, .asset-drop')) return;   // app-owned drop zones keep their behaviour
      if (typing(e.target) && e.target !== ta && !e.dataTransfer.files.length) return;                // dropping text into a field stays a text drop
      e.preventDefault(); saveDropped(e.dataTransfer);
    });
  }
  function bindPaste() {
    document.addEventListener('paste', function (e) {
      if (typing(document.activeElement)) return;
      var f = imageFrom(e.clipboardData); var text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (f) { e.preventDefault(); var r = new FileReader(); r.onload = function () { add({ kind: 'image', image: r.result, title: 'Pasted image', tags: [] }); }; r.readAsDataURL(f); }
      else if (text && text.trim()) { e.preventDefault(); add(InspoModel.parseQuick(text.trim().slice(0, 5000))); }
    });
  }
  function wsTitle(id) { var w = Config.workspace(id); return w ? w.title : id; }
  var toastEl = null, toastT = null;
  function toast(msg, undo) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'capture-toast'; document.body.appendChild(toastEl); }
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button">Undo</button>' : '') + '<a href="' + (document.querySelector('[data-nav]').getAttribute('data-root') || './') + 'inspo/inspiration.html?ws=' + encodeURIComponent(Config.activeWs()) + '">Open</a>';
    var b = toastEl.querySelector('button'); if (b) b.onclick = function () { if (lastId) { var gone = model().byId(lastId); model().remove(lastId); if (global.Sync && gone) Sync.note('inspiration.json', 'undo save: ' + (gone.title || gone.url || gone.kind)); lastId = null; } toast('Removed.'); };
    toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, undo ? 5000 : 1800);
  }
  global.InspoQuick = { open: function () { if (!bar) mount(); ta.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }, close: function () { if (ta) ta.blur(); }, mount: mount };
  document.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); InspoQuick.open(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(mount, 0); }); else setTimeout(mount, 0);
})(window);
