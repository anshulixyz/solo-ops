/* =========================================================================
   inspo-model.js — the Inspiration inbox. Anything you want to keep:
   links, images, notes, half-ideas. Items are tagged with a workspace so a
   brainstorm can later become tasks, posts, scripts or drafts there.
   One global list: Store key `marathon.inspiration`, file data/inspiration.json.
   Item shape:
     { id, kind: 'link'|'image'|'note'|'file', title, url, text,
       image (a small thumbnail data URL; the original is the attachment),
       file ('data/attachments/<name>' once on disk), name, size, type,
       stored: 'disk'|'browser'|'' (where the original is),
       tags: [], ws: '<workspace id>' | '', status: 'new'|'used'|'archived',
       source: 'ui'|'cli'|'agent', usedAs: [{app, id}], createdAt, updatedAt }
   ========================================================================= */
(function (global) {
  'use strict';
  var KEY = 'marathon.inspiration';
  var REVIEWED_KEY = 'marathon.inspiration.reviewedAt';
  var SITE_TAGS = { 'youtube.com': 'youtube', 'youtu.be': 'youtube', 'x.com': 'x', 'twitter.com': 'x', 'github.com': 'github', 'news.ycombinator.com': 'hn', 'reddit.com': 'reddit', 'linkedin.com': 'linkedin', 'producthunt.com': 'producthunt', 'medium.com': 'article', 'substack.com': 'newsletter', 'notion.site': 'notion', 'figma.com': 'figma', 'dribbble.com': 'design', 'behance.net': 'design', 'instagram.com': 'instagram', 'tiktok.com': 'tiktok', 'loom.com': 'video', 'vimeo.com': 'video' };
  function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function siteTag(url) { var d = domainOf(url); var keys = Object.keys(SITE_TAGS); for (var i = 0; i < keys.length; i++) if (d === keys[i] || d.slice(-keys[i].length - 1) === '.' + keys[i]) return SITE_TAGS[keys[i]]; return d ? d.split('.')[0] : ''; }
  var KINDS = ['link', 'image', 'note', 'file'];
  var STATUSES = ['new', 'used', 'archived'];
  var state = [];
  var fresh = false;

  function uid() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function esc(s) { return String(s == null ? '' : s); }
  function norm(x) {
    x = x || {};
    var kind = KINDS.indexOf(x.kind) >= 0 ? x.kind : (x.image ? 'image' : x.url ? 'link' : 'note');
    return {
      id: x.id || uid(), kind: kind, title: esc(x.title), url: esc(x.url), text: esc(x.text), image: x.image || '',
      tags: Array.isArray(x.tags) ? x.tags.map(function (t) { return String(t).toLowerCase().trim(); }).filter(Boolean) : [],
      ws: esc(x.ws), status: STATUSES.indexOf(x.status) >= 0 ? x.status : 'new', source: esc(x.source || 'ui'), file: esc(x.file),
      name: esc(x.name), size: +x.size || 0, type: esc(x.type), stored: esc(x.stored),
      meta: x.meta && typeof x.meta === 'object' ? x.meta : null,
      usedAs: Array.isArray(x.usedAs) ? x.usedAs : [], createdAt: x.createdAt || Date.now(), updatedAt: x.updatedAt || Date.now()
    };
  }
  function load() {
    var raw = Store.getJSON(KEY, null);
    if (raw && Array.isArray(raw.items)) { state = raw.items.map(norm); return; }
    fresh = true;   // a first open: empty (the inbox shows only what the person saved), or the sample items when core/templates.js says so
    state = Store.firstOpen(KEY, { items: [] }, function () { return { items: MARATHON_TEMPLATES.inspiration ? MARATHON_TEMPLATES.inspiration(new Date()).items.map(norm) : [] }; }).items;
  }
  function persist(opts) { Store.setJSON(KEY, { items: state }, opts); }
  function byId(id) { return state.filter(function (x) { return x.id === id; })[0] || null; }
  // "https://… some words #tag" → link; otherwise a note. Title = first line.
  function parseQuick(text, extra) {
    text = String(text || '').trim();
    var tags = []; text = text.replace(/(^|\s)#([\w-]+)/g, function (_, sp, t) { tags.push(t.toLowerCase()); return sp; }).trim();
    var m = text.match(/(https?|file):\/\/\S+/);
    var item = Object.assign({ tags: tags }, extra || {});
    if (m) { item.kind = 'link'; item.url = m[0]; var rest = text.replace(m[0], '').trim(); item.title = rest.split('\n')[0].slice(0, 80) || m[0].replace(/^https?:\/\//, '').split('/')[0]; item.text = rest.split('\n').slice(1).join('\n'); }
    else { item.kind = 'note'; var lines = text.split('\n'); item.title = lines[0].slice(0, 80); item.text = lines.slice(1).join('\n').trim(); }
    return item;
  }
  // basic information every item gets without being asked: kind + site tags,
  // a title, and (server mode) the page's real title and description
  function enrich(it) {
    var tags = it.tags.slice();
    if (it.kind === 'link') { var st = siteTag(it.url); if (st && tags.indexOf(st) < 0) tags.push(st); if (/youtu|vimeo|loom|tiktok/.test(st) && tags.indexOf('video') < 0) tags.push('video'); }
    if (it.kind === 'image' && tags.indexOf('image') < 0) tags.push('image');
    if (it.kind === 'file' && tags.indexOf('file') < 0) tags.push('file');
    if (it.kind === 'link' && /^file:/.test(it.url) && tags.indexOf('local') < 0) tags.push('local');
    if (!it.title) it.title = it.kind === 'image' ? (it.name ? it.name.replace(/\.[^.]+$/, '') : 'Image · ' + new Date(it.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) : it.kind === 'file' ? (it.name || 'File') : it.kind === 'link' ? (/^file:/.test(it.url) ? decodeURIComponent(it.url.split('/').pop() || 'Local file') : domainOf(it.url)) : (it.text || '').split('\n')[0].slice(0, 80) || 'Note';
    it.tags = tags;
    if (it.kind === 'link' && global.Sync && Sync.meta) {
      Sync.meta(it.url).then(function (m) {
        if (!m || (!m.title && !m.description)) return;
        var cur = byId(it.id); if (!cur) return;
        var titleWasDomain = !cur.title || cur.title === domainOf(cur.url) || cur.title === cur.url;
        if (m.title && titleWasDomain) cur.title = m.title.slice(0, 120);
        cur.meta = { title: m.title || '', description: m.description || '', image: m.image || '', site: m.site || '' };
        if (!cur.text && m.description) cur.text = m.description;
        cur.updatedAt = Date.now(); persist();
      });
    }
  }
  // `partial.original` (a data URL of the full image / file) is never kept in
  // the item: it goes to data/attachments/ (or IndexedDB until a connection
  // exists) and the item keeps a thumbnail + the file reference.
  function add(partial) {
    var original = partial.original || (partial.kind !== 'file' && partial.image && !partial.file ? partial.image : ''); delete partial.original;
    var it = norm(partial); enrich(it); state.unshift(it); persist();
    if (original && global.Attach) {
      var name = 'inspo-' + it.id + '.' + Attach.ext(original, it.name);
      var thumbP = it.kind === 'image' ? Attach.thumb(original) : Promise.resolve('');
      thumbP.then(function (t) { var cur = byId(it.id); if (!cur) return; if (t && t !== cur.image) { cur.image = t; persist({ silent: true }); } return Attach.put(name, original); })
        .then(function (r) { var cur = byId(it.id); if (!cur || !r) return; cur.stored = r.where; if (r.file) cur.file = r.file; if (!cur.size) cur.size = Math.round(original.length * 0.75); if (!cur.type) cur.type = (original.match(/^data:([^;]+)/) || [0, ''])[1]; persist({ silent: true }); });
    }
    return it;
  }
  function attachName(it) { return it.file ? it.file.split('/').pop() : 'inspo-' + it.id + '.' + (global.Attach ? Attach.ext(it.type || it.image || '', it.name) : 'png'); }
  function update(id, patch) { var it = byId(id); if (!it) return null; Object.keys(patch).forEach(function (k) { if (k !== 'id') it[k] = patch[k]; }); it.updatedAt = Date.now(); state = state.map(norm); persist(); return byId(id); }
  function remove(id) { state = state.filter(function (x) { return x.id !== id; }); persist(); }
  function markUsed(id, app, targetId) { var it = byId(id); if (!it) return; it.usedAs.push({ app: app, id: targetId, at: Date.now() }); it.status = 'used'; it.updatedAt = Date.now(); persist(); }
  function list(filter) {
    filter = filter || {};
    return state.filter(function (x) {
      if (filter.ws && x.ws !== filter.ws) return false;
      if (filter.status && x.status !== filter.status) return false;
      if (filter.tag && x.tags.indexOf(filter.tag) < 0) return false;
      if (filter.q) { var l = filter.q.toLowerCase(); if ((x.title + ' ' + x.text + ' ' + x.url + ' ' + x.tags.join(' ')).toLowerCase().indexOf(l) < 0) return false; }
      return true;
    });
  }
  function reviewedAt() { return Store.get(REVIEWED_KEY) || ''; }
  function markReviewed() { Store.set(REVIEWED_KEY, new Date().toISOString(), { silent: true }); }
  // items saved since the last assessment (newest first)
  function listNew(ws) { var since = new Date(reviewedAt() || 0).getTime(); return state.filter(function (x) { return x.status === 'new' && x.createdAt > since && (!ws || !x.ws || x.ws === ws); }); }

  // text block for pasting into an agent chat
  function forAI(items, intent) {
    var ws = global.Config ? Config.ws() : null;
    var lines = ['# Inspiration → ' + (intent || 'ideas'), '',
      'Workspace: ' + (ws ? ws.title + ' (' + ws.id + ')' : 'n/a') + '. Turn the items below into concrete ' + (intent || 'next steps') + '.',
      'Give me back CLI commands I can run (node solo.js …) or a short list I can paste into the right app. Keep ids out, keep titles short.', ''];
    items.forEach(function (x, i) {
      lines.push('## ' + (i + 1) + '. ' + (x.title || x.url || 'untitled') + (x.tags.length ? '  #' + x.tags.join(' #') : ''));
      if (x.url) lines.push(x.url + (x.meta && x.meta.site ? ' (' + x.meta.site + ')' : ''));
      if (x.text) lines.push(x.text);
      lines.push('saved ' + new Date(x.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + (x.ws ? ' · project ' + x.ws : ' · no project yet') + ' · id ' + x.id);
      if (x.kind === 'image' || x.kind === 'file') lines.push(x.file ? '(' + x.kind + ': ' + x.file + (x.size ? ', ' + Math.round(x.size / 1024) + ' KB' : '') + ' — open it if you can read files; otherwise ask me to upload it)' : x.kind === 'file' && !x.stored ? '(file "' + (x.name || '') + '" was too large to copy; ask me for its path)' : '(' + x.kind + ' kept in the app only — ask me to upload it if it matters)');
      lines.push('');
    });
    return lines.join('\n');
  }
  global.InspoModel = {
    KEY: KEY, KINDS: KINDS, STATUSES: STATUSES,
    init: load, isFresh: function () { return Store.isFresh(KEY); }, isSample: function () { return Store.isSample(KEY); },
    getState: function () { return state; }, replaceAll: function (items, opts) { state = (items || []).map(norm); persist(opts); return state; },
    byId: byId, parseQuick: parseQuick, add: add, update: update, remove: remove, markUsed: markUsed, list: list, forAI: forAI, norm: norm,
    enrich: enrich, listNew: listNew, reviewedAt: reviewedAt, markReviewed: markReviewed, siteTag: siteTag, attachName: attachName,
    // the full-size original (data URL) of an item, from disk or this browser; '' when neither has it
    original: function (id) { var it = byId(id); if (!it || !global.Attach) return Promise.resolve(it ? it.image : ''); return Attach.get(attachName(it)).then(function (d) { return d || it.image || ''; }); }
  };
  if (global.Attach) Attach.onFlushed(function (name, rel) { var m = name.match(/^inspo-([a-z0-9]+)\./); if (!m) return; var it = byId(m[1]); if (it && !it.file) { it.file = rel; it.stored = 'disk'; persist({ silent: true }); } });
})(window);
