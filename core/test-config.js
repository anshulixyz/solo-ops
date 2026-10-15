#!/usr/bin/env node
/* core/test-config.js — your settings over solo.config.js.
   The CLI and the pages merge data/settings.json → `config` over the shipped
   file (objects merge, lists and single values replace, a value of another
   shape is ignored). `config set|add|unset|clear` edit it through the shared
   Config.override, which checks every value against the shipped one.
   Run: node core/test-config.js */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var n = 0, failed = 0;
function ok(cond, msg) { n++; if (!cond) { failed++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); }
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-config-'));
function run(args, raw) { try { var o = cp.execFileSync(process.execPath, [path.join(ROOT, 'solo.js')].concat(args, raw ? [] : ['--json']), { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { SOLO_DATA: dir }), stdio: ['ignore', 'pipe', 'pipe'] }); return raw ? o : JSON.parse(o); } catch (e) { var txt = String(e.stdout || '') + String(e.stderr || ''); return raw ? txt : { error: txt }; } }
function cli(args) { return run(args); }
function settings() { return JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')); }

try {
  console.log('CLI');
  var shipped = cli(['config']);
  ok(shipped.owner === '' || shipped.owner === undefined, 'no settings.json: owner is empty as shipped');
  cli(['config', 'set', 'owner', 'Mara', 'name', 'Pocket Studio']);
  ok(settings().config.owner === 'Mara' && settings().config.name === 'Pocket Studio', 'config set writes owner and name to settings.json');
  ok(settings().theme && settings().theme.mode, 'a fresh settings.json still carries a theme');
  var seen = cli(['config']);
  ok(seen.owner === 'Mara' && seen.name === 'Pocket Studio', 'the CLI merges them over solo.config.js');
  cli(['config', 'set', 'social.postTypes', 'reel, carousel', 'activity.reminderAfterHours', '48']);
  seen = cli(['config']);
  ok(seen.social.postTypes.join() === 'reel,carousel', 'a comma list becomes a list (replaces the shipped one)');
  ok(seen.social.prepKinds && seen.social.prepKinds.length > 0, 'sibling keys of a merged group survive (social.prepKinds)');
  ok(seen.activity.reminderAfterHours === 48, 'a number parses as a number');
  cli(['config', 'set', 'social.postTypes', '["announcement","reel"]']);
  ok(cli(['config']).social.postTypes.join() === 'announcement,reel', 'JSON lists work too');
  cli(['config', 'add', 'social.postTypes', 'carousel', 'story']);
  ok(cli(['config']).social.postTypes.join() === 'announcement,reel,carousel,story', 'config add appends to a list');
  var post = cli(['social', 'add', 'A reel', '--type', 'reel']);
  ok(post.postType === 'reel', 'social add accepts a post type that only your settings know');
  var txt = run(['social', 'add', 'A launch', '--type', 'launch'], true);
  ok(/not in your post types/.test(txt) && /config add social.postTypes launch/.test(txt), 'social add says when a type is not in the list and how to add it');
  cli(['config', 'set', 'boards.runway.title', 'Pocket launch']);
  var boards = cli(['boards']); var bcfg = settings().config.boards[0];
  ok(boards[0] && boards[0].title === 'Pocket launch', 'one board by id: the title changes');
  ok(Array.isArray(bcfg.milestones) && bcfg.milestones.length > 0 && Array.isArray(bcfg.focus), 'the rest of that board (milestones, focus) is copied from the shipped file, since lists replace');
  cli(['config', 'set', 'boards.runway.milestones', 'Build,Ship']);
  ok(settings().config.boards[0].milestones.join() === 'Build,Ship' && settings().config.boards[0].title === 'Pocket launch', 'a second edit of the same board keeps the first');
  var e1 = run(['config', 'set', 'ownr', 'Mara'], true);
  ok(/not a setting/.test(e1) && /Did you mean `owner`/.test(e1), 'an unknown setting is refused with a suggestion');
  var e2 = run(['config', 'set', 'social', 'x'], true);
  ok(/group of settings/.test(e2) && /social\.title/.test(e2), 'setting a whole group as text is refused and the keys are named');
  var e3 = run(['config', 'set', 'boards', 'x'], true);
  ok(/list of entries with an id/.test(e3), 'setting the board list as text is refused');
  var e4 = run(['config', 'set', 'activity.reminderAfterHours', 'soon'], true);
  ok(/is a number/.test(e4), 'a word for a number is refused');
  var e5 = run(['config', 'set', 'owner'], true);
  ok(/Usage: config set/.test(e5) && /quote values with spaces/i.test(e5), 'config set with no value shows the usage, with the quoting hint');
  var e6 = run(['config', 'set', '../x', '1'], true);
  ok(/not a setting/.test(e6) && /owner or social.postTypes/.test(e6), 'a path that is not dotted keys is refused with an example');
  ok(cli(['config']).owner === 'Mara', 'nothing above changed the stored settings');
  var u1 = run(['config', 'unset', 'nothing.here'], true);
  ok(/was not set; nothing changed/.test(u1), 'unset of a missing setting says nothing changed');
  cli(['config', 'unset', 'activity.reminderAfterHours']);
  ok(!settings().config.activity, 'unset removes the key and prunes the empty group');
  var f = path.join(dir, 'over.json'); fs.writeFileSync(f, JSON.stringify({ eyebrow: 'Studio ops', social: { network: 'Instagram' } }));
  cli(['config', 'set', '--file', f]);
  seen = cli(['config']);
  ok(seen.eyebrow === 'Studio ops' && seen.social.network === 'Instagram' && seen.social.postTypes.length === 4, 'set --file merges a JSON object without dropping earlier settings');
  fs.writeFileSync(f, JSON.stringify({ social: { postTypes: 'reel' }, ownr: 1 }));
  var e7 = run(['config', 'set', '--file', f], true);
  ok(/should be a list/.test(e7) && /not a setting/.test(e7), 'set --file refuses a file whose values have the wrong shape or unknown keys');
  cli(['template', 'settings', '--force']);
  ok(settings().config && settings().config.owner === 'Mara', 'template settings --force keeps your settings');
  var s0 = settings(); s0.config.social.postTypes = 'reel'; fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(s0));
  var doc = run(['doctor'], true);
  ok(/social\.postTypes` should be a list/.test(doc), 'doctor reports a value of the wrong shape');
  ok(cli(['config']).social.postTypes.length > 1, 'the CLI ignores that wrong value and keeps the shipped list');
  cli(['config', 'clear']);
  ok(settings().config === undefined && settings().theme, 'config clear removes your settings and keeps the theme');
  ok(cli(['config']).owner === '' || cli(['config']).owner === undefined, 'after clear the shipped values are back');

  console.log('Pages (core/config.js in a sandbox)');
  function page(stored, cfgFile) {
    var store = { data: {} }; if (stored) store.data['marathon.config'] = JSON.stringify(stored);
    var ctx = { MARATHON_CONFIG: cfgFile, Store: { ok: true, getJSON: function (k, fb) { return k in store.data ? JSON.parse(store.data[k]) : fb; }, setJSON: function (k, v) { store.data[k] = JSON.stringify(v); }, get: function (k) { return k in store.data ? store.data[k] : null; }, set: function (k, v) { store.data[k] = v; }, remove: function (k) { delete store.data[k]; } }, setTimeout: function () {} };
    ctx.window = ctx; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'core', 'config.js'), 'utf8'), ctx); return { Config: ctx.Config, store: store };
  }
  var file = { owner: '', name: 'Solo Ops', boards: [{ id: 'runway', title: 'Launch Runway', milestones: ['Setup'] }], social: { postTypes: ['announcement', 'update'] } };
  var p0 = page(null, file);
  ok(p0.Config.get('owner') === '' && p0.Config.boards('main')[0].title === 'Launch Runway', 'no stored settings: the page uses solo.config.js');
  var p1 = page({ owner: 'Mara', boards: [{ id: 'runway', title: 'Pocket launch' }], social: { postTypes: ['announcement', 'reel'] } }, file);
  ok(p1.Config.get('owner') === 'Mara', 'stored settings: owner');
  ok(p1.Config.boards('main')[0].title === 'Pocket launch', 'stored settings: board title replaces the shipped one');
  ok(p1.Config.get('social.postTypes').join() === 'announcement,reel' && p1.Config.get('social.prepKinds').length > 0, 'lists replace, sibling defaults stay');
  var p2 = page({ social: { postTypes: 'reel' }, boards: {} }, file);
  ok(p2.Config.get('social.postTypes').join() === 'announcement,update' && p2.Config.boards('main')[0].title === 'Launch Runway', 'values of the wrong shape are ignored: the page still renders with the shipped ones');
  ok(p1.Config.setOverrides({ owner: 'Mara', boards: [{ id: 'runway', title: 'Pocket launch' }], social: { postTypes: ['announcement', 'reel'] } }) === false, 'the same settings again: no reload');
  ok(p1.Config.setOverrides({ owner: 'Noor' }) === true && JSON.parse(p1.store.data['marathon.config']).owner === 'Noor', 'different settings: stored for the reload');
  ok(p1.Config.setOverrides(null) === true && !('marathon.config' in p1.store.data), 'a file without config clears the stored copy');
  ok(p0.Config.setOverrides(undefined) === false, 'a page without settings and a file without config: nothing to do');
  var p3 = page({ owner: 'Mara' }, file); p3.Config.setOverrides({ owner: 'Noor' }); p3.store.data = {}; var pNoStore = page(null, file); pNoStore.Config;
  var ctxNoStore = (function () { var ctx = { MARATHON_CONFIG: file, Store: { ok: false, getJSON: function () { return null; }, setJSON: function () {}, get: function () { return null; }, set: function () {}, remove: function () {} }, setTimeout: function () {} }; ctx.window = ctx; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'core', 'config.js'), 'utf8'), ctx); return ctx; })();
  ok(ctxNoStore.Config.setOverrides({ owner: 'Noor' }) === false, 'no usable storage (private window): no reload, the page keeps the shipped values');
  var lib = p0.Config; var sh = { owner: '', boards: [{ id: 'runway', title: 'A' }], social: { postTypes: ['x'] } };
  ok(lib.check(sh, { owner: 'M' }).length === 0 && lib.check(sh, { ownr: 1, social: { postTypes: 'x' } }).length === 2, 'Config.check lists unknown keys and wrong shapes');
  ok(lib.override(sh, {}, 'set', 'social.postTypes', 'a, b').config.social.postTypes.join() === 'a,b', 'Config.override in the page: comma list');
  var bad = ''; try { lib.override(sh, {}, 'set', 'boards.0.title', 'x'); } catch (e) { bad = e.message; } ok(/pick an entry by id/.test(bad) && /runway/.test(bad), 'Config.override: a numbered list entry is refused with the ids');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log((failed ? '✗ ' + failed + ' of ' : '✓ ') + n + ' checks' + (failed ? ' failed' : ' passed'));
process.exit(failed ? 1 : 0);
