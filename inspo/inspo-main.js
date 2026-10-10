/* =========================================================================
   inspo-main.js — Inspiration page: grid, filters, quick add, drop zone,
   "Use as…", brainstorm export, sync + palette.
   ========================================================================= */
(function (global) {
  'use strict';
  var filter = { ws: '', status: '', tag: '', q: '' };
  var selected = new Set();

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ago(ts) { return global.Activity ? Activity.ago(new Date(ts).toISOString()) : ''; }
  function wsTitle(id) { var w = Config.workspace(id); return w ? w.title : id; }
  function flash(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(flash._t); flash._t = setTimeout(function () { t.classList.remove('show'); }, 2400); }

  function targetsFor(ws) {
    var out = []; var w = Config.workspace(ws) || Config.ws();
    Config.boards(w.id).forEach(function (b) { out.push({ v: 'task:' + w.id + ':' + b.id, label: 'Task → ' + b.title }); });
    if (w.apps.social) out.push({ v: 'post:' + w.id, label: 'Post → ' + Config.get('social.title') });
    if (w.apps.scripts) out.push({ v: 'script:' + w.id, label: 'Script' });
    if (w.apps.writing) out.push({ v: 'note:' + w.id, label: 'Draft / note' });
    return out;
  }
  function cardHTML(x) {
    var tags = x.tags.map(function (t) { return '<span class="tag" style="--h:' + Config.hashHue(t) + '">#' + esc(t) + '</span>'; }).join('');
    var targets = targetsFor(x.ws);
    return '<div class="inspo-card ' + (x.status === 'used' ? 'used' : '') + (selected.has(x.id) ? ' selected' : '') + '" data-id="' + esc(x.id) + '">' +
      '<input type="checkbox" class="pick" ' + (selected.has(x.id) ? 'checked' : '') + ' onchange="togglePick(\'' + esc(x.id) + '\')" title="Select for brainstorm">' +
      (x.kind === 'image' && x.image ? '<img src="' + x.image + '" alt="" onclick="SocialImageLightbox(\'' + esc(x.id) + '\')">' : '') +
      '<div class="body"><h3>' + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title || x.url) + ' ↗</a>' : esc(x.title || 'Untitled')) + '</h3>' +
      (x.url ? '<div class="url">' + esc(x.url) + '</div>' : '') + (x.text ? '<div class="txt">' + esc(x.text) + '</div>' : '') +
      '<div class="meta">' + tags + (x.ws ? '<span class="ws">' + esc(wsTitle(x.ws)) + '</span>' : '') + '<span class="when">' + esc(x.source) + ' · ' + esc(ago(x.createdAt)) + (x.status !== 'new' ? ' · ' + esc(x.status) : '') + '</span></div></div>' +
      '<div class="acts"><select onchange="useAs(\'' + esc(x.id) + '\',this.value);this.value=\'\'" title="Create something from this"><option value="">Use as…</option>' +
      targets.map(function (t) { return '<option value="' + esc(t.v) + '">' + esc(t.label) + '</option>'; }).join('') + '</select>' +
      '<button class="mv" onclick="editItem(\'' + esc(x.id) + '\')">Edit</button>' +
      '<button class="mv" onclick="setStatus(\'' + esc(x.id) + '\',\'' + (x.status === 'archived' ? 'new' : 'archived') + '\')">' + (x.status === 'archived' ? 'Unarchive' : 'Archive') + '</button>' +
      '<button class="mv del" onclick="removeItem(\'' + esc(x.id) + '\')">Delete</button></div></div>';
  }
  function render() {
    var items = InspoModel.list(filter);
    document.getElementById('grid').innerHTML = items.length ? items.map(cardHTML).join('') : '<div class="inspo-empty">Nothing here yet. Paste a link or an idea above, drop an image, or from any page press ⌘⇧I.<br>Terminal: <code>node marathon.js inspo add "https://… #tag" --ws ' + esc(Config.activeWs()) + '</code></div>';
    var all = InspoModel.getState(); var tags = {}; all.forEach(function (x) { x.tags.forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    document.getElementById('filters').innerHTML =
      '<select class="meta-sel" onchange="setFilter(\'ws\',this.value)"><option value="">All workspaces</option>' + Config.workspaces().map(function (w) { return '<option value="' + esc(w.id) + '"' + (filter.ws === w.id ? ' selected' : '') + '>' + esc(w.title) + '</option>'; }).join('') + '</select>' +
      '<select class="meta-sel" onchange="setFilter(\'status\',this.value)"><option value="">New + used</option><option value="new"' + (filter.status === 'new' ? ' selected' : '') + '>New only</option><option value="used"' + (filter.status === 'used' ? ' selected' : '') + '>Used</option><option value="archived"' + (filter.status === 'archived' ? ' selected' : '') + '>Archived</option></select>' +
      Object.keys(tags).sort().map(function (t) { return '<button class="chip' + (filter.tag === t ? ' active' : '') + '" onclick="setFilter(\'tag\',\'' + esc(filter.tag === t ? '' : t) + '\')">#' + esc(t) + ' <span style="opacity:.6">' + tags[t] + '</span></button>'; }).join('') +
      '<span style="margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--muted)">' + items.length + ' of ' + all.length + (selected.size ? ' · ' + selected.size + ' selected' : '') + '</span>';
    document.getElementById('brainstormBtn').textContent = selected.size ? 'Brainstorm with AI (' + selected.size + ')' : 'Brainstorm with AI (visible)';
  }
  global.setFilter = function (k, v) { filter[k] = v; render(); };
  global.togglePick = function (id) { if (selected.has(id)) selected.delete(id); else selected.add(id); render(); };
  global.setStatus = function (id, st) { InspoModel.update(id, { status: st }); Sync.note('inspiration.json', st + ': ' + (InspoModel.byId(id) || {}).title); render(); };
  global.removeItem = function (id) { var x = InspoModel.byId(id); if (!x || !confirm('Delete "' + (x.title || x.url || 'this item') + '"?')) return; Sync.note('inspiration.json', 'deleted: ' + x.title); InspoModel.remove(id); render(); };
  global.editItem = function (id) {
    var x = InspoModel.byId(id); if (!x) return;
    var title = prompt('Title', x.title); if (title === null) return;
    var tags = prompt('Tags (comma-separated)', x.tags.join(', ')); if (tags === null) return;
    var text = prompt('Notes', x.text); if (text === null) return;
    InspoModel.update(id, { title: title.trim(), tags: tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean), text: text }); render();
  };
  global.SocialImageLightbox = function (id) { var x = InspoModel.byId(id); if (x && x.image) { var w = window.open(); if (w) w.document.write('<img src="' + x.image + '" style="max-width:100%">'); } };

  // Quick add on this page
  global.quickAdd = function () {
    var ta = document.getElementById('quickText'); var ws = document.getElementById('quickWs').value; var text = ta.value.trim();
    if (!text && !pendingImage) return;
    var item = InspoModel.parseQuick(text, { ws: ws, source: 'ui' });
    if (pendingImage) { item.kind = 'image'; item.image = pendingImage; if (!item.title) item.title = 'Image'; pendingImage = ''; document.getElementById('quickThumb').style.display = 'none'; }
    InspoModel.add(item); Sync.note('inspiration.json', 'added: ' + (item.title || item.url)); ta.value = ''; render(); flash('Saved.');
  };
  var pendingImage = '';
  function readImage(file) { var r = new FileReader(); r.onload = function () { pendingImage = r.result; var t = document.getElementById('quickThumb'); t.src = pendingImage; t.style.display = ''; }; r.readAsDataURL(file); }
  function bindDrop() {
    var z = document.getElementById('drop');
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('over'); }); });
    z.addEventListener('drop', function (e) {
      var files = Array.prototype.slice.call(e.dataTransfer.files || []); var text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      var ws = document.getElementById('quickWs').value;
      files.filter(function (f) { return /^image\//.test(f.type); }).forEach(function (f) { var r = new FileReader(); r.onload = function () { InspoModel.add({ kind: 'image', image: r.result, title: f.name.replace(/\.[^.]+$/, ''), ws: ws, source: 'ui' }); render(); }; r.readAsDataURL(f); });
      if (!files.length && text) { InspoModel.add(InspoModel.parseQuick(text, { ws: ws, source: 'ui' })); render(); }
      if (files.length || text) flash('Dropped into inspiration.');
    });
    document.getElementById('quickText').addEventListener('paste', function (e) { var f = Array.prototype.filter.call((e.clipboardData || {}).files || [], function (x) { return /^image\//.test(x.type); })[0]; if (f) { e.preventDefault(); readImage(f); } });
    document.getElementById('quickImg').onclick = function () { var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = function () { if (i.files[0]) readImage(i.files[0]); }; i.click(); };
    document.getElementById('quickText').addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') quickAdd(); });
  }

  // Use as… : creates the target item in that app's Store key (the app's own
  // page or sync writes the file) and marks the inspiration used.
  global.useAs = function (id, target) {
    if (!target) return; var x = InspoModel.byId(id); if (!x) return;
    var parts = target.split(':'); var kind = parts[0], ws = parts[1], board = parts[2];
    var title = x.title || x.url || 'From inspiration'; var body = [x.url, x.text].filter(Boolean).join('\n');
    var newId;
    if (kind === 'task') {
      var key = Config.boardKey(board, ws); var tasks = Store.getJSON(key, []) || [];
      newId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      tasks.unshift({ id: newId, title: title, desc: body, proj: Config.projectNames()[0], col: 'todo', pri: 'medium', tags: x.tags.slice(), notes: 'From inspiration ' + x.id, collapsed: true, checklist: [] });
      Store.setJSON(key, tasks); Sync.touch(Config.boardFile(board, ws));
    } else if (kind === 'post') {
      var skey = Config.key('social', ws); var posts = Store.getJSON(skey, []) || [];
      newId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      posts.push({ id: newId, datetime: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T09:00', title: title, postType: 'update', format: x.kind === 'image' ? 'text' : 'text', project: Config.projectNames()[0], copy: body, video: { title: '', status: 'none', notes: '', link: '' }, links: x.url ? [{ id: 'l' + Date.now().toString(36), label: x.title, url: x.url, kind: 'reference' }] : [], assets: [], prep: [], notes: 'From inspiration ' + x.id, status: 'draft', posted: { url: '', postedAt: '', stats: {}, notes: '', screenshotId: '' } });
      Store.setJSON(skey, posts); Sync.touch(Config.file('social', ws));
    } else if (kind === 'script') {
      var ckey = Config.key('scripts', ws); var lib = Store.getJSON(ckey, { activeId: '', scripts: [] }) || { activeId: '', scripts: [] };
      newId = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      lib.scripts = lib.scripts || []; lib.scripts.unshift({ id: newId, title: title, text: '# ' + title + '\n\n## Hook\n\n## Script\n1. \n\n## Inserts\n' + (body ? '\n## Source\n' + body + '\n' : ''), createdAt: Date.now(), updatedAt: Date.now() }); lib.activeId = newId;
      Store.setJSON(ckey, lib); Sync.touch(Config.file('scripts', ws));
    } else if (kind === 'note') {
      var nkey = Config.key('writing', ws); var nlib = Store.getJSON(nkey, { activeId: '', notes: [] }) || { activeId: '', notes: [] };
      newId = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      nlib.notes = nlib.notes || []; nlib.notes.unshift({ id: newId, text: '# ' + title + '\n\n' + body + '\n\n[[AI: turn this into a draft]]\n', images: x.kind === 'image' && x.image ? { '1': x.image } : {}, createdAt: Date.now(), updatedAt: Date.now() }); nlib.activeId = newId;
      if (x.kind === 'image' && x.image) nlib.notes[0].text += '\n[Image uploaded 1]\n';
      Store.setJSON(nkey, nlib); Sync.touch(Config.file('writing', ws));
    }
    InspoModel.markUsed(id, kind, newId); Sync.note('inspiration.json', 'used as ' + kind + ': ' + title); render();
    flash('Created a ' + kind + ' in ' + wsTitle(ws) + '. Open it from the nav.');
  };

  global.brainstorm = function () {
    var items = selected.size ? InspoModel.getState().filter(function (x) { return selected.has(x.id); }) : InspoModel.list(filter);
    if (!items.length) { flash('Nothing to brainstorm with.'); return; }
    var intent = document.getElementById('intent').value;
    var text = InspoModel.forAI(items, intent);
    navigator.clipboard.writeText(text).then(function () { flash('Copied ' + items.length + ' item' + (items.length === 1 ? '' : 's') + ' for your AI — paste into Claude or ChatGPT.'); }).catch(function () { prompt('Copy this:', text); });
  };

  function init() {
    Config.applyDOM();
    InspoModel.init(); InspoModel._inited = true;
    filter.ws = new URLSearchParams(location.search).get('all') ? '' : '';
    document.getElementById('quickWs').innerHTML = Config.workspaces().map(function (w) { return '<option value="' + esc(w.id) + '"' + (w.id === Config.activeWs() ? ' selected' : '') + '>' + esc(w.title) + '</option>'; }).join('') + '<option value="">(no workspace)</option>';
    bindDrop();
    Sync.register({ file: 'inspiration.json', key: InspoModel.KEY, label: 'inspiration', app: 'inspiration', isFresh: InspoModel.isFresh,
      read: function () { return { items: InspoModel.getState() }; },
      apply: function (body) { if (Array.isArray(body.items)) { InspoModel.replaceAll(body.items, { silent: true }); render(); } } });
    Palette.init({ root: '../' });
    Palette.register([
      { label: 'Add inspiration', prefix: 'add', hint: 'add <link or idea #tag>', run: function (arg) { if (!arg) return; InspoModel.add(InspoModel.parseQuick(arg, { ws: Config.activeWs(), source: 'ui' })); render(); flash('Saved.'); } },
      { label: 'Brainstorm with AI (copy)', hint: 'ai', run: global.brainstorm },
      { label: 'Show all workspaces', hint: 'filter', run: function () { setFilter('ws', ''); } },
      { label: 'Show this workspace only', hint: 'filter', run: function () { setFilter('ws', Config.activeWs()); } }
    ]);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
