/* =========================================================================
   inspo-model.js — the Inspiration inbox. Anything you want to keep:
   links, images, notes, half-ideas. Items are tagged with a workspace so a
   brainstorm can later become tasks, posts, scripts or drafts there.
   One global list: Store key `marathon.inspiration`, file data/inspiration.json.
   Item shape:
     { id, kind: 'link'|'image'|'note', title, url, text, image (data URL),
       tags: [], ws: '<workspace id>' | '', status: 'new'|'used'|'archived',
       source: 'ui'|'cli'|'agent', usedAs: [{app, id}], createdAt, updatedAt }
   ========================================================================= */
(function (global) {
  'use strict';
  var KEY = 'marathon.inspiration';
  var KINDS = ['link', 'image', 'note'];
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
      ws: esc(x.ws), status: STATUSES.indexOf(x.status) >= 0 ? x.status : 'new', source: esc(x.source || 'ui'),
      usedAs: Array.isArray(x.usedAs) ? x.usedAs : [], createdAt: x.createdAt || Date.now(), updatedAt: x.updatedAt || Date.now()
    };
  }
  function load() {
    var raw = Store.getJSON(KEY, null);
    if (raw && Array.isArray(raw.items)) { state = raw.items.map(norm); return; }
    fresh = true;
    state = MARATHON_TEMPLATES.inspiration ? MARATHON_TEMPLATES.inspiration(new Date()).items.map(norm) : [];
    persist({ silent: true }); Store.markFresh(KEY);
  }
  function persist(opts) { Store.setJSON(KEY, { items: state }, opts); }
  function byId(id) { return state.filter(function (x) { return x.id === id; })[0] || null; }
  // "https://… some words #tag" → link; otherwise a note. Title = first line.
  function parseQuick(text, extra) {
    text = String(text || '').trim();
    var tags = []; text = text.replace(/(^|\s)#([\w-]+)/g, function (_, sp, t) { tags.push(t.toLowerCase()); return sp; }).trim();
    var m = text.match(/https?:\/\/\S+/);
    var item = Object.assign({ tags: tags }, extra || {});
    if (m) { item.kind = 'link'; item.url = m[0]; var rest = text.replace(m[0], '').trim(); item.title = rest.split('\n')[0].slice(0, 80) || m[0].replace(/^https?:\/\//, '').split('/')[0]; item.text = rest.split('\n').slice(1).join('\n'); }
    else { item.kind = 'note'; var lines = text.split('\n'); item.title = lines[0].slice(0, 80); item.text = lines.slice(1).join('\n').trim(); }
    return item;
  }
  function add(partial) { var it = norm(partial); state.unshift(it); persist(); return it; }
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
  // text block for pasting into an agent chat
  function forAI(items, intent) {
    var ws = global.Config ? Config.ws() : null;
    var lines = ['# Inspiration → ' + (intent || 'ideas'), '',
      'Workspace: ' + (ws ? ws.title + ' (' + ws.id + ')' : 'n/a') + '. Turn the items below into concrete ' + (intent || 'next steps') + '.',
      'Give me back CLI commands I can run (node solo.js …) or a short list I can paste into the right app. Keep ids out, keep titles short.', ''];
    items.forEach(function (x, i) {
      lines.push('## ' + (i + 1) + '. ' + (x.title || x.url || 'untitled') + (x.tags.length ? '  #' + x.tags.join(' #') : ''));
      if (x.url) lines.push(x.url);
      if (x.text) lines.push(x.text);
      if (x.kind === 'image') lines.push('(image attached in the app — describe it to me if relevant)');
      lines.push('');
    });
    return lines.join('\n');
  }
  global.InspoModel = {
    KEY: KEY, KINDS: KINDS, STATUSES: STATUSES,
    init: load, isFresh: function () { return fresh || Store.isFresh(KEY); },
    getState: function () { return state; }, replaceAll: function (items, opts) { state = (items || []).map(norm); persist(opts); return state; },
    byId: byId, parseQuick: parseQuick, add: add, update: update, remove: remove, markUsed: markUsed, list: list, forAI: forAI, norm: norm
  };
})(window);
