#!/usr/bin/env node
/* Quick save/load roundtrip test for social schedule bundle format */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = __dirname;
var store = { data: {} };
var ctx = {
  window: {},
  localStorage: null,
  indexedDB: null,
  console: console,
  atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
  btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); },
  Blob: function (parts, opts) { this.parts = parts; this.type = (opts && opts.type) || ''; },
  URL: { createObjectURL: function () { return 'blob:test'; }, revokeObjectURL: function () {} },
  document: { createElement: function () { return { click: function () {} }; } }
};
ctx.window = ctx;
ctx.global = ctx;

vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'marathon.config.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'core', 'store.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'core', 'config.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'core', 'templates.js'), 'utf8'), ctx);
ctx.Store = ctx.window.Store; ctx.Config = ctx.window.Config; ctx.MARATHON_TEMPLATES = ctx.window.MARATHON_TEMPLATES;

// Mock SocialAssets in-memory
var blobs = {};
ctx.window.SocialAssets = {
  exportAll: function (ids) {
    var out = {};
    ids.forEach(function (id) {
      if (blobs[id]) out[id] = blobs[id];
    });
    return Promise.resolve(out);
  },
  importAll: function (map) {
    Object.keys(map || {}).forEach(function (k) { blobs[k] = map[k]; });
    return Promise.resolve();
  },
  remove: function () { return Promise.resolve(); },
  removeForPost: function () { return Promise.resolve(); }
};

vm.runInContext(fs.readFileSync(path.join(dir, 'social-model.js'), 'utf8'), ctx);
var SocialModel = ctx.window.SocialModel;

SocialModel.init();
var posts = SocialModel.getState();
if (posts.length !== 5) throw new Error('Expected 5 template posts, got ' + posts.length);

SocialModel.updatePost(posts[0].id, { title: 'Modified title' });
SocialModel.addLink(posts[0].id, 'Test', 'https://example.com', 'reference');

SocialModel.exportBundle().then(function (json) {
  var bundle = JSON.parse(json);
  if (bundle.version !== 2) throw new Error('Bad version');
  if (!bundle.posts || bundle.posts.length !== 5) throw new Error('Bad posts in export');
  if (bundle.posts[0].title !== 'Modified title') throw new Error('Title not persisted in export');
  if (!bundle.posts[0].links.length) throw new Error('Links not in export');

  SocialModel.reset();
  if (SocialModel.getState()[0].title.indexOf('Modified') >= 0) throw new Error('Reset failed');

  return SocialModel.importBundle(json);
}).then(function () {
  var p = SocialModel.getState()[0];
  if (p.title !== 'Modified title') throw new Error('Import title mismatch');
  if (!p.links.length) throw new Error('Import links missing');
  console.log('PASS: save/load roundtrip OK');
  console.log('  - version 2 bundle with posts + assets slot');
  console.log('  - localStorage key:', SocialModel.KEY);
}).catch(function (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
});
