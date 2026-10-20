#!/usr/bin/env node
/* =========================================================================
   serve.js — zero-dependency local server for Solo Ops.
     node serve.js            → http://localhost:4321
     node serve.js --port 5000
   Serves the repo as static files and gives the pages a tiny write API so
   every change lands in data/*.json immediately (no "Link folder" needed).
   Only files inside data/ with a .json name can be written. Binds to
   127.0.0.1 only.
   ========================================================================= */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var argData = process.argv.indexOf('--data');
var DATA = argData > -1 ? path.resolve(process.argv[argData + 1]) : process.env.SOLO_DATA ? path.resolve(process.env.SOLO_DATA) : path.join(ROOT, 'data');   // --data / SOLO_DATA: another data folder (tests, a second identity), same as solo.js
var cfg = {};
try { cfg = require(path.join(ROOT, 'solo.config.js')); } catch (e) { /* defaults */ }
try {   // the user's own values (data/settings.json → config, written by `node solo.js config set`) over the shipped file, e.g. sync.port
  var ownCfg = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8')).config; var CfgLib = require(path.join(ROOT, 'core', 'config.js')).Config;
  if (ownCfg && typeof ownCfg === 'object' && !Array.isArray(ownCfg) && CfgLib && CfgLib.mergeOverrides) cfg = CfgLib.mergeOverrides(cfg, ownCfg);
} catch (e) { /* as shipped */ }
if (process.argv.indexOf('--help') > -1 || process.argv.indexOf('-h') > -1) { console.log('node serve.js [--port 4321] [--data <folder>]   serves Solo Ops at http://localhost:<port> and writes data/*.json (binds to 127.0.0.1 only)'); process.exit(0); }
var argPort = process.argv.indexOf('--port');
var PORT = argPort > -1 ? parseInt(process.argv[argPort + 1], 10) : ((cfg.sync && cfg.sync.port) || 4321);

var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function json(res, code, obj) { send(res, code, JSON.stringify(obj)); }
function safeDataFile(name) {
  if (!/^[a-z0-9_-]+\.json$/i.test(name) || /^(identity|secrets)\.json$/i.test(name)) return null;   // keys never go over HTTP
  return path.join(DATA, name);
}
var LOG = path.join(DATA, 'log.jsonl');
function sameButStamp(a, b) {   // true when two bodies differ only by updatedAt (theme re-saves, first-contact pushes)
  try { var x = JSON.parse(a), y = JSON.parse(b); delete x.updatedAt; delete y.updatedAt; return JSON.stringify(x) === JSON.stringify(y); } catch (e) { return false; }
}
var LOG_MAX = 400, SNAP_MAX = 2 * 1024 * 1024;
// Append one change record (with the previous content as a snapshot) so any
// write — page, CLI or agent — can be reverted. Same format as solo.js.
function logChange(file, prevText, source, note) {
  var rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: new Date().toISOString(), file: file, source: source || 'ui', note: note || '',
    prev: prevText && prevText.length <= SNAP_MAX ? prevText : null, prevBytes: prevText ? prevText.length : 0 };
  var lines = [];
  try { lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean); } catch (e) { /* new */ }
  lines.push(JSON.stringify(rec));
  if (lines.length > LOG_MAX) lines = lines.slice(lines.length - LOG_MAX);
  fs.writeFileSync(LOG, lines.join('\n') + '\n');
  return rec;
}
function readLog() { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } }

var crypto = require('crypto');
var versionCache = { at: 0, v: '' };
function buildVersion() {
  if (Date.now() - versionCache.at < 2000) return versionCache.v;
  var h = crypto.createHash('sha1');
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function (n) {
      if (n === 'data' || n === '.git' || n === 'node_modules' || n[0] === '.') return;
      var p = path.join(dir, n); var st = fs.statSync(p);
      if (st.isDirectory()) walk(p); else if (/\.(html|js|css|json|svg|png)$/.test(n)) h.update(p + ':' + st.mtimeMs + ':' + st.size);
    });
  })(ROOT);
  versionCache = { at: Date.now(), v: h.digest('hex').slice(0, 10) };
  return versionCache.v;
}

function decodeEntities(t) { return String(t || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function meta(html, url) {
  var m = function (re) { var x = html.match(re); return x ? decodeEntities(x[1]) : ''; };
  var og = function (prop) { return m(new RegExp('<meta[^>]+property=["\']og:' + prop + '["\'][^>]+content=["\']([^"\']+)', 'i')) || m(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:' + prop + '["\']', 'i')); };
  return { url: url, title: og('title') || m(/<title[^>]*>([^<]{1,200})/i), description: (og('description') || m(/<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)/i)).slice(0, 300), image: og('image'), site: m(/<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)/i) };
}

/* ---- video routes ------------------------------------------------------------
   GET  /api/video/doctor                       ffmpeg, libass, whisper, the model, an ElevenLabs key (never the key), takes whose file moved
   POST /api/video/add        { path, title, ws }          runs `video add` (ffprobe only, fast) and returns the take
   POST /api/video/transcribe { id, engine, lang, yes, ws, text, ext }   import: writes the pasted file, runs --from; whisper/elevenlabs: detached, 202
   POST /api/video/render     { id, preview, burn, aspect, style, ws }    detached, 202; 409 while a render of this take runs
   GET  /api/video/<id>/status                  { render: progress.json, transcribe: transcribe.json + log tail }
   GET  /api/video/<id>/<name>                  preview-n.mp4 / final-n.mp4 (Range → 206), their .srt, transcript.json
   The id must be a take in a videos.json of this folder; names are whitelisted; nothing else under data/videos/ is reachable. */
var VideoLib = null; try { VideoLib = require(path.join(ROOT, 'core', 'video.js')); } catch (e) { VideoLib = null; }
// the video settings as they are now (settings.json changes while the server runs: the remembered engine, the pause, the folder)
var liveCfgCache = { at: 0, v: null };
function videoCfg() {
  if (Date.now() - liveCfgCache.at < 3000 && liveCfgCache.v) return liveCfgCache.v;
  var v = Object.assign({ engine: '', model: 'small.en', pause: 0.7, recordings: '', captions: { style: 'sentence', burn: false } }, cfg.video || {});
  try { var own = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8')).config; if (own && own.video && typeof own.video === 'object') Object.keys(own.video).forEach(function (k) { if (own.video[k] !== undefined && own.video[k] !== null) v[k] = own.video[k]; }); } catch (e) { /* as shipped */ }
  liveCfgCache = { at: Date.now(), v: v }; return v;
}
// a take just arrived: when an engine is remembered and usable, the words follow by themselves (ElevenLabs only with the standing yes that is the setting)
function autoWords(takeId) {
  var vc = videoCfg(); var eng = String(vc.auto || '').toLowerCase(); if (!/^(whisper|elevenlabs)$/.test(eng) || !VideoLib) return false;   // video.auto is the standing yes; video.engine alone only skips the question
  var doc = videoDoctor(); if (eng === 'whisper' && !doc.whisper) return false; if (eng === 'elevenlabs' && !doc.elevenlabsKey) return false;
  var t = findTake(takeId); if (!t || t.take.transcript) return false; var dir = takeDir(t.id); var tj = jobState(dir, 'transcribe'); if (tj && !tj.finished) return false;
  var durS = Number(t.take.sources && t.take.sources[0] && t.take.sources[0].duration) || 0; if (durS > (Number(vc.autoMaxMin) || 30) * 60) return false;   // a two-hour screen recording is not what she meant: the card asks
  var est = eng === 'elevenlabs' ? (durS / 3600 * 0.40 < 0.005 ? 'less than $0.01' : 'about $' + (durS / 3600 * 0.40).toFixed(2)) : '';
  soloJob('transcribe', dir, ['video', 'transcribe', t.id, '--engine', eng].concat(eng === 'elevenlabs' ? ['--yes'] : []).concat(soloArgs(t.ws)), { engine: eng, auto: true, est: est }); return true;
}
var SOLO = path.join(ROOT, 'solo.js');
function readBody(req, res, limit, cb) {   // JSON bodies only: a plain-text POST from another site never reaches a route (no preflight is granted here)
  if (!/^application\/json/i.test(String(req.headers['content-type'] || ''))) { req.resume(); return json(res, 415, { error: 'send JSON (Content-Type: application/json)' }); }
  var chunks = [], n = 0, over = false;
  req.on('data', function (c) { if (over) return; n += c.length; if (n > limit) { over = true; req.pause(); res.on('finish', function () { req.destroy(); }); return json(res, 413, { error: 'body over ' + Math.round(limit / 1048576) + ' MB' }); } chunks.push(c); });
  req.on('end', function () { if (over) return; var txt = Buffer.concat(chunks).toString('utf8'); var obj = null; try { obj = txt ? JSON.parse(txt) : {}; } catch (e) { return cb(new Error('invalid json')); } cb(null, obj && typeof obj === 'object' ? obj : {}); });
  req.on('error', function () { if (!over) cb(new Error('read failed')); });
}
function wsFile(ws) { ws = String(ws || '').toLowerCase(); if (!/^[a-z0-9-]{0,32}$/.test(ws)) return null; return ws ? ws + '-videos.json' : 'videos.json'; }
// the take by id, wherever it lives: { id, ws (file prefix), take } or null. ids are v + base36, never a path.
function findTake(id) {
  if (!/^v[a-z0-9]{1,24}$/.test(String(id || ''))) return null;
  var names = []; try { names = fs.readdirSync(DATA).filter(function (n) { return /^([a-z0-9-]+-)?videos\.json$/.test(n); }); } catch (e) { return null; }
  for (var i = 0; i < names.length; i++) { try { var d = JSON.parse(fs.readFileSync(path.join(DATA, names[i]), 'utf8')); var v = (d.videos || []).filter(function (x) { return x && x.id === id; })[0]; if (v) return { id: id, file: names[i], ws: names[i].replace(/videos\.json$/, '').replace(/-$/, ''), take: v }; } catch (e) { /* next */ } }
  return null;
}
function takeDir(id) { return path.join(DATA, 'videos', id); }
function soloArgs(ws) { return ['--json', '--as', 'ui'].concat(ws ? ['--ws', ws] : []); }
function soloEnv() { return Object.assign({}, process.env, { SOLO_DATA: DATA }); }
// the CLI, synchronously, for the quick commands (add: one ffprobe). → { code, out }. opts.input feeds stdin (a key, never on argv)
function soloRun(args, timeout, opts) {
  var r = require('child_process').spawnSync(process.execPath, [SOLO].concat(args), Object.assign({ cwd: ROOT, encoding: 'utf8', env: soloEnv(), timeout: timeout || 20000, maxBuffer: 8 * 1048576 }, opts || {}));
  var out = null; try { var so = String(r.stdout || '').trim(); var si = so.search(/[\[{]/); out = si >= 0 ? JSON.parse(so.slice(si)) : null; } catch (e) { out = null; }   // --json output is one pretty-printed object
  if (r.error && r.error.code === 'ETIMEDOUT') return { code: 1, out: { error: 'solo.js took more than ' + Math.round((timeout || 20000) / 1000) + ' s and was stopped' } };
  return { code: r.status, out: out || { error: String(r.stderr || r.stdout || 'solo.js failed').trim().slice(0, 400) } };
}
// the CLI detached for the long jobs; stdout+stderr land in <dir>/<job>.log, <dir>/<job>.json carries pid/finished for the page
function soloJob(job, dir, args, extra) { return VideoLib.node.job(job, dir, [SOLO].concat(args), extra, soloEnv()); }   // the same detached job `video watch` uses (core/video.js)
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return false; } }
function jobState(dir, job) {   // the job file plus the last lines of its log; null when the job never ran
  var mf = path.join(dir, job + '.json'); var m = null; try { m = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { return null; }
  var j = null, t = ''; try { t = fs.readFileSync(path.join(dir, job + '.log'), 'utf8'); j = JSON.parse(t.slice(t.indexOf('{'))); } catch (e) { j = null; }   // --json output is one pretty-printed object, after any progress lines
  if (!m.finished && (!alive(m.pid) || Date.now() - Date.parse(m.startedAt || 0) > 86400000)) {   // the server was not there to see it end (restart, reboot): the log says how it went
    m.finished = true; m.lost = true; m.code = j ? (j.error ? 1 : 0) : -1;
    try { fs.writeFileSync(mf, JSON.stringify(m) + '\n'); } catch (e) { /* read-only */ }
  }
  m.tail = String(j && j.error ? j.error : j ? '' : t.trim().split('\n').filter(Boolean).slice(-3).join(' ')).slice(0, 400); m.file = 'data/videos/' + path.basename(dir) + '/' + job + '.json'; return m;
}
var doctorCache = { at: 0, v: null };
function videoDoctor() {
  if (Date.now() - doctorCache.at < 60000 && doctorCache.v) return doctorCache.v;
  var v = { ffmpeg: false, libass: false, whisper: false, model: false, elevenlabsKey: false, moved: [] };
  if (VideoLib && VideoLib.node) {
    var vc = Object.assign({ model: 'small.en' }, cfg.video || {}); var t = VideoLib.node.tools(vc);
    v.ffmpeg = !!(t.ffmpeg && t.ffprobe); if (v.ffmpeg) v.libass = VideoLib.node.hasFilter(t.ffmpeg, 'subtitles');
    v.whisper = !!VideoLib.node.whisperBin(vc); v.model = fs.existsSync(VideoLib.node.modelPath(DATA, vc.model || 'small.en'));
    try { v.elevenlabsKey = !!(process.env.ELEVENLABS_API_KEY || JSON.parse(fs.readFileSync(path.join(DATA, 'secrets.json'), 'utf8')).elevenlabs); } catch (e) { v.elevenlabsKey = !!process.env.ELEVENLABS_API_KEY; }
    try { fs.readdirSync(DATA).filter(function (n) { return /^([a-z0-9-]+-)?videos\.json$/.test(n); }).forEach(function (n) { JSON.parse(fs.readFileSync(path.join(DATA, n), 'utf8')).videos.forEach(function (x) { var p = x && x.sources && x.sources[0] && x.sources[0].path; if (p && !fs.existsSync(p)) v.moved.push(x.id); }); }); } catch (e) { /* none */ }
  }
  v.install = process.platform === 'darwin' ? 'brew install ffmpeg' : process.platform === 'win32' ? 'winget install Gyan.FFmpeg' : 'sudo apt install ffmpeg';
  var rd = recordingsDir(); v.recordings = { path: rd, exists: !!rd && fs.existsSync(rd), watching: !!recState.timer }; v.recordly = process.platform === 'darwin' ? (fs.existsSync('/Applications/Recordly.app') || fs.existsSync(path.join(require('os').homedir(), 'Applications', 'Recordly.app'))) : null;
  doctorCache = { at: Date.now(), v: v }; return v;
}
function localOnly(req) {   // the browser on this computer, not a page from elsewhere: Host is localhost and Origin (when sent) is this server
  var host = String(req.headers.host || ''); var origin = String(req.headers.origin || ''); var site = String(req.headers['sec-fetch-site'] || '');
  if (site && site !== 'same-origin' && site !== 'none') return false;   // a <video src> or <img> on another site sends no Origin but does say cross-site
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) && (!origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin));
}
/* the recordings folder: polled while the server runs; what lands there becomes a take */
var recState = { timer: null, dir: '', busy: false, queue: [], lastAdded: null };
function recordingsDir() { return VideoLib && VideoLib.node ? VideoLib.node.recordingsDir(videoCfg()) : ''; }
function knownTakes() { var ids = {}, paths = {}; try { fs.readdirSync(DATA).filter(function (n) { return /^([a-z0-9-]+-)?videos\.json$/.test(n); }).forEach(function (n) { JSON.parse(fs.readFileSync(path.join(DATA, n), 'utf8')).videos.forEach(function (x) { ids[x.id] = 1; (x.sources || []).forEach(function (s) { if (s.path) paths[s.path] = 1; }); }); }); } catch (e) { /* none */ } return { ids: ids, paths: paths }; }
// one state in memory while the server runs, saved after every change; reloaded when the CLI (`video recordings --add | --forget`) wrote the file meanwhile
function recMtime() { try { return fs.statSync(path.join(DATA, 'recordings.json')).mtimeMs; } catch (e) { return 0; } }
function recST() { var m = recMtime(); if (!recState.st || (m && m !== recState.stMtime)) { recState.st = VideoLib.node.recLoad(DATA); recState.stMtime = m; } return recState.st; }
function recSaveNow() { try { VideoLib.node.recSave(DATA, recST()); recState.stMtime = recMtime(); } catch (e) { /* read-only data folder */ } }
function recordingsWaiting(dir) {   // files in the folder that are not takes yet (not added, not skipped): the ones "Add them" takes
  var st = recST(); var k = knownTakes(); var names = []; try { names = fs.readdirSync(dir).filter(function (n) { return n[0] !== '.' && VideoLib.node.MEDIA_RE.test(n) && !/\.(part|tmp|download|crdownload|icloud)$/i.test(n); }); } catch (e) { names = []; }
  return names.filter(function (n) { var p = path.join(dir, n); var f = st.files[p]; var m = 0; try { m = fs.statSync(p).mtimeMs; } catch (e) { return false; } return !k.paths[p] && !(f && (f.skipped || f.takeId || f.queued)) && (f && f.pending || Date.now() - m > 5000); });   // not one still being written
}
// add one file as a take, asynchronously, one at a time (an AirDrop of twenty clips must not block the server). cb(take | null)
function addRecording(p, cb) {
  recState.queue.push({ p: p, cb: cb }); if (recState.busy) return; recState.busy = true;
  (function next() {
    var job = recState.queue.shift(); if (!job) { recState.busy = false; return; }
    var child = require('child_process').spawn(process.execPath, [SOLO, 'video', 'add', '--title=' + VideoLib.node.titleFromFile(path.basename(job.p)), '--file', job.p, '--no-open', '--note', 'arrived in the recordings folder', '--json', '--as', 'ui'], { cwd: ROOT, env: soloEnv(), stdio: ['ignore', 'pipe', 'ignore'] });
    var buf = ''; child.stdout.on('data', function (c) { buf += c; }); var done = false;
    function finish(code) { if (done) return; done = true; var o = null; try { o = JSON.parse(buf.slice(buf.search(/[\[{]/))); } catch (e) { o = null; } job.cb(code === 0 && o && o.id ? o : null); setImmediate(next); }
    child.on('exit', finish); child.on('error', function () { finish(1); }); setTimeout(function () { if (!done) { try { child.kill(); } catch (e) { /* gone */ } finish(1); } }, 60000);
  })();
}
function watchRecordings() {
  var dir = recordingsDir(); if (!dir || !VideoLib) return; recState.dir = dir;
  if (recState.timer) clearInterval(recState.timer);
  var st0 = recST(); if (fs.existsSync(dir)) { st0.firstLook = true; VideoLib.node.scanRecordings(dir, st0); st0.firstLook = false; recSaveNow(); }   // what is there already waits for a yes
  recState.timer = setInterval(function () {
    if (!fs.existsSync(dir)) return;
    var st = recST(); var k = knownTakes(); var now = Date.now(); var before = JSON.stringify(st.files);
    Object.keys(st.files).forEach(function (p) { var f = st.files[p]; if (f.takeId && !k.ids[f.takeId]) { if (now - (f.at || 0) < 20000) { delete f.takeId; delete f.at; } else if (!f.skipped) f.skipped = 'removed'; } });   // gone within 20 s: a page write raced it (reconcile reads the file right before each write), add again; gone later: she removed it, leave it out
    var ready = VideoLib.node.scanRecordings(dir, st, now); if (JSON.stringify(st.files) !== before) recSaveNow();
    ready.forEach(function (f) { addRecording(f.path, function (v) { VideoLib.node.recResult(recST(), f.path, v ? v.id : null, Date.now(), !!(v && v.existing)); recSaveNow(); if (v && !v.existing) { recState.lastAdded = { id: v.id, title: v.title, at: Date.now() }; autoWords(v.id); } }); });
  }, 4000);
  recState.timer.unref();
}
function videoApi(req, res, url) {
  if (url === '/api/video/recordings') {   // GET: the folder and what waits in it · POST { create } | { open } | { add: true } (the files already there)
    var rdir = recordingsDir(); if (!rdir) return json(res, 500, { error: 'core/video.js missing' });
    if (req.method === 'GET') return json(res, 200, { folder: rdir, exists: fs.existsSync(rdir), waiting: fs.existsSync(rdir) ? recordingsWaiting(rdir) : [], lastAdded: recState.lastAdded || null, home: require('os').homedir() });
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    return readBody(req, res, 4096, function (err, b) {
      if (err) return json(res, 400, { error: err.message });
      if (b.create) { fs.mkdirSync(rdir, { recursive: true }); watchRecordings(); return json(res, 200, { ok: true, folder: rdir }); }
      if (b.open) { if (!fs.existsSync(rdir)) fs.mkdirSync(rdir, { recursive: true }); var opener = process.platform === 'darwin' ? ['open', [rdir]] : process.platform === 'win32' ? ['explorer', [rdir]] : ['xdg-open', [rdir]]; try { require('child_process').spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { return json(res, 500, { error: 'could not open the folder' }); } return json(res, 200, { ok: true, folder: rdir }); }
      if (b.add) {   // the files already there when the watcher started: add them now, one after the other
        var list = recordingsWaiting(rdir); if (!list.length) return json(res, 200, { added: [] }); var added = []; var left = list.length;
        list.forEach(function (n) { var p = path.join(rdir, n); var f = recST().files[p]; if (f) delete f.pending; addRecording(p, function (v) { VideoLib.node.recResult(recST(), p, v ? v.id : null, Date.now(), !!(v && v.existing)); recSaveNow(); if (v && !v.existing) { added.push({ id: v.id, title: v.title }); autoWords(v.id); } if (--left === 0) json(res, 200, { added: added }); }); });
        return;
      }
      return json(res, 400, { error: 'create, open or add' });
    });
  }
  if (url === '/api/video/key') {   // the key goes to the CLI's stdin and into data/secrets.json; it is never logged, never answered back, never accepted from another site
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    if (!localOnly(req)) return json(res, 403, { error: 'only from this computer' });
    return readBody(req, res, 4096, function (err, b) {
      if (err) return json(res, 400, { error: err.message });
      var service = String(b.service || '').toLowerCase(); if (service !== 'elevenlabs') return json(res, 400, { error: 'unknown service' });
      var key = String(b.key || '').trim(); if (!/^[\x21-\x7e]{8,256}$/.test(key)) return json(res, 400, { error: 'that does not look like a key' });
      var r = soloRun(['video', 'key', 'set', service, '--stdin', '--json', '--as', 'ui'], 20000, { input: key + '\n' }); doctorCache.at = 0;
      return json(res, r.code === 0 ? 200 : 400, r.code === 0 ? { ok: true, service: service } : { error: (r.out && r.out.error) || 'could not save the key' });
    });
  }
  if (url === '/api/video/doctor') { if (req.method !== 'GET') return json(res, 405, { error: 'method' }); if (/[?&]fresh=1/.test(req.url)) doctorCache.at = 0; return json(res, 200, videoDoctor()); }   // ?fresh=1 = Check again
  if (url === '/api/video/find') {   // a dropped file: the browser gives its name and size, not its folder; look where recordings usually land
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    return readBody(req, res, 65536, function (err, b) {
      if (err) return json(res, 400, { error: err.message });
      var name = String(b.name || '').replace(/[\/\\]/g, ''); var size = Number(b.size) || 0; if (!name) return json(res, 400, { error: 'name required' });
      var home = require('os').homedir(); var roots = ['Movies', 'Desktop', 'Downloads', 'Documents', 'Videos'].map(function (d) { return path.join(home, d); }); var hits = []; var budget = 4000;
      function walk(dir, depth) { if (budget <= 0 || hits.length >= 5) return; var names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; } names.forEach(function (ent) { if (budget-- <= 0 || hits.length >= 5) return; var p = path.join(dir, ent.name); if (ent.isDirectory()) { if (depth < 2 && ent.name[0] !== '.' && !/node_modules|Library/.test(ent.name)) walk(p, depth + 1); } else if (ent.name === name) { try { var st = fs.statSync(p); if (!size || st.size === size) hits.push({ path: p, size: st.size, mtime: st.mtime.toISOString() }); } catch (e) { /* skip */ } } }); }
      roots.forEach(function (r) { walk(r, 0); });
      return json(res, 200, { name: name, found: hits });
    });
  }
  if (url === '/api/video/add' || url === '/api/video/transcribe' || url === '/api/video/render' || url === '/api/video/source' || url === '/api/video/post' || url === '/api/video/title' || url === '/api/video/word' || url === '/api/video/proxy') {
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    return readBody(req, res, 25 * 1048576, function (err, b) {
      if (err) return json(res, 400, { error: err.message });
      var ws = wsFile(b.ws); if (ws === null) return json(res, 400, { error: 'bad workspace id' }); ws = String(b.ws || '').toLowerCase();
      if (url === '/api/video/add') {
        var p = String(b.path || '').trim(); if (!p) return json(res, 400, { error: 'path required' });
        if (p.indexOf('~/') === 0) p = path.join(require('os').homedir(), p.slice(2));
        if (!path.isAbsolute(p)) return json(res, 400, { error: 'Give the whole path, from the top: /Users/you/Movies/take.mov (Mac) or C:\\Users\\you\\Videos\\take.mp4 (Windows). Finder: right-click the file, hold ⌥ (Option), "Copy … as Pathname".' });
        if (!fs.existsSync(p)) return json(res, 404, { error: 'No file at ' + p + '. Check the folder and the name (it has to match exactly, with the ending like .mov or .mp4).' });
        var args = ['video', 'add'].concat(b.title ? ['--title=' + String(b.title).slice(0, 120)] : []).concat(['--file', p]).concat(soloArgs(ws));
        var r = soloRun(args, 30000); if (r.code === 0 && r.out && r.out.id && !r.out.existing) r.out.wordsStarted = autoWords(r.out.id); return json(res, r.code === 0 ? 200 : 400, r.out);
      }
      var t = findTake(b.id); if (!t) return json(res, 404, { error: 'no take with id ' + String(b.id || '').slice(0, 20) });
      if (t.ws !== ws) ws = t.ws;   // the take decides which workspace file is written
      var dir = takeDir(t.id);
      if (url === '/api/video/source') {   // the recording moved: point the take at it again (ffprobe only, fast)
        var np = String(b.path || '').trim(); if (np.indexOf('~/') === 0) np = path.join(require('os').homedir(), np.slice(2));
        if (!np || !path.isAbsolute(np)) return json(res, 400, { error: 'Give the whole path to the recording.' }); if (!fs.existsSync(np)) return json(res, 404, { error: 'No file at ' + np });
        var rs = soloRun(['video', 'source', t.id, np].concat(soloArgs(ws)), 30000); return json(res, rs.code === 0 ? 200 : 400, rs.out);
      }
      if (url === '/api/video/proxy') {   // a copy that plays here: detached like a render, the page polls status.proxy
        var pj = jobState(dir, 'proxy'); if (pj && !pj.finished) return json(res, 409, { error: 'The copy is being made already.', job: pj });
        var pm = soloJob('proxy', dir, ['video', 'proxy', t.id].concat(soloArgs(ws))); return json(res, 202, { job: 'proxy', id: t.id, startedAt: pm.startedAt });
      }
      if (url === '/api/video/word') {   // correct the words from..to (or undo the last correction): the audio and the cut stay; transcript.json and the phrases change
        if (b.undo) { var ru = soloRun(['video', 'word', t.id, '--undo'].concat(soloArgs(ws)), 20000); return json(res, ru.code === 0 ? 200 : 400, ru.out); }
        var said = b.from === undefined && typeof b.said === 'string' ? b.said.trim().slice(0, 200) : ''; if (/^-/.test(said)) return json(res, 400, { error: 'which words?' });   // a positional that looks like a flag never reaches the CLI var fromW = parseInt(b.from, 10), toW = b.to === undefined ? fromW : parseInt(b.to, 10); if (!said && !(fromW >= 0 && toW >= fromW)) return json(res, 400, { error: 'which words?' });
        var textW = String(b.text || '').trim().slice(0, 400); if (!textW) return json(res, 400, { error: 'type the words as they should read' });
        var rw = soloRun(['video', 'word', t.id, said || (fromW + '-' + toW), '--text=' + textW].concat(b.all ? ['--all'] : []).concat(b.expect !== undefined ? ['--expect=' + String(b.expect).slice(0, 400)] : []).concat(soloArgs(ws)), 20000); return json(res, rw.code === 0 ? 200 : rw.out && /moved/.test(rw.out.error || '') ? 409 : 400, rw.out);
      }
      if (url === '/api/video/title') { var nt = String(b.title || '').trim().slice(0, 120); if (!nt) return json(res, 400, { error: 'a title is needed' }); var rt = soloRun(['video', 'title', t.id, '--title=' + nt].concat(soloArgs(ws)), 20000); return json(res, rt.code === 0 ? 200 : 400, rt.out); }
      if (url === '/api/video/post') {   // a draft post with the final linked, never copied (fast, no ffmpeg)
        var pargs = ['video', 'post', t.id].concat(b.at ? ['--at=' + String(b.at).slice(0, 40)] : []).concat(soloArgs(ws));
        var rp = soloRun(pargs, 20000); return json(res, rp.code === 0 ? 200 : 400, rp.out);
      }
      if (url === '/api/video/transcribe') {
        var engine = String(b.engine || '').toLowerCase(); if (['whisper', 'elevenlabs', 'import'].indexOf(engine) < 0) return json(res, 400, { error: 'engine must be whisper, elevenlabs or import' });
        var lang = String(b.lang || '').toLowerCase(); if (lang && !/^[a-z]{2,3}$/.test(lang)) return json(res, 400, { error: 'lang is a two-letter code' });
        var tj = jobState(dir, 'transcribe'); if (tj && !tj.finished) return json(res, 409, { error: 'This take is being transcribed already (since ' + tj.startedAt + '). If nothing is running, delete ' + tj.file + ' and try again.', job: tj });
        var targs = ['video', 'transcribe', t.id].concat(lang ? ['--lang', lang] : []).concat(soloArgs(ws));
        if (engine === 'import') {
          var ext = String(b.ext || '').toLowerCase().replace(/^\./, ''); if (['srt', 'vtt', 'json'].indexOf(ext) < 0) return json(res, 400, { error: 'a transcript file is .srt, .vtt or .json' });
          var text = String(b.text || ''); if (!text.trim()) return json(res, 400, { error: 'the file is empty' });
          fs.mkdirSync(dir, { recursive: true }); var imp = path.join(dir, 'import.' + ext); fs.writeFileSync(imp, text);
          var ri = soloRun(targs.concat(['--from', imp]), 60000); return json(res, ri.code === 0 ? 200 : 400, ri.out);
        }
        if (engine === 'elevenlabs' && b.yes !== true) return json(res, 400, { error: 'ElevenLabs costs credits; the page asks you first and sends yes: true' });
        var meta = soloJob('transcribe', dir, targs.concat(['--engine', engine]).concat(engine === 'elevenlabs' ? ['--yes'] : []).concat(b.force ? ['--force'] : []), { engine: engine });
        return json(res, 202, { job: 'transcribe', id: t.id, pid: meta.pid, startedAt: meta.startedAt });
      }
      // render: one at a time per take. The job we spawned is checked first (progress.json appears only once ffmpeg starts, seconds later), then the CLI's own lock.
      var rj = jobState(dir, 'render'); if (rj && !rj.finished) return json(res, 409, { error: 'A render of this take is already running since ' + rj.startedAt + '. If nothing is running, delete ' + rj.file + ' and try again.', job: rj });
      if (VideoLib && VideoLib.node && VideoLib.node.lock(dir)) { var lk = VideoLib.node.lock(dir); return json(res, 409, { error: 'A render of this take is already running since ' + lk.startedAt + '.', progress: lk }); }
      if (!t.take.edl || !t.take.edl.length) return json(res, 400, { error: 'Nothing to render yet: say what to keep first.' });
      var rargs = ['video', 'render', t.id].concat(b.preview ? ['--preview'] : []).concat(b.burn ? ['--burn'] : []).concat(b.aspect === '9:16' ? ['--aspect', '9:16'] : []).concat(b.again ? ['--again'] : []);
      if (b.style !== undefined) { var style = String(b.style); if (!/^[a-z]{1,20}$/.test(style)) return json(res, 400, { error: 'bad caption style' }); rargs.push('--style', style); }
      var rm = soloJob('render', dir, rargs.concat(soloArgs(ws)), { kind: b.preview ? 'preview' : 'final' });
      return json(res, 202, { job: 'render', id: t.id, pid: rm.pid, startedAt: rm.startedAt });
    });
  }
  var mm = url.match(/^\/api\/video\/([^/]+)\/([^/]+)$/); if (!mm) return json(res, 404, { error: 'no such video route' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });
  var tk = findTake(mm[1]); if (!tk) return json(res, 404, { error: 'no such take' }); var d2 = takeDir(tk.id); var name = mm[2];
  if (name === 'status') { var pr = null; try { pr = JSON.parse(fs.readFileSync(path.join(d2, 'progress.json'), 'utf8')); if (!pr.finished && !alive(pr.pid)) { pr.finished = true; pr.lost = true; } } catch (e) { pr = null; } return json(res, 200, { id: tk.id, render: pr, renderJob: jobState(d2, 'render'), transcribe: jobState(d2, 'transcribe'), proxy: jobState(d2, 'proxy'), updatedAt: tk.take.updatedAt || 0 }); }
  if (name === 'progress') { var pg = null; try { pg = JSON.parse(fs.readFileSync(path.join(d2, 'progress.json'), 'utf8')); } catch (e) { pg = null; } return json(res, 200, pg || { none: true }); }
  if (name === 'source') {   // the take's own file, so the page can play it: the path never leaves this side
    var sp = tk.take.sources && tk.take.sources[0] && tk.take.sources[0].path; var sst; try { sst = sp ? fs.statSync(sp) : null; } catch (e) { sst = null; }
    if (!sst) return json(res, 404, { error: 'the recording is not where it was' });
    var ext = path.extname(sp).toLowerCase(); var stype = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm' }[ext];   // .mov is the same container as .mp4 to a browser; .mkv never plays: the copy does
    if (!stype) return json(res, 415, { error: 'this container does not play in a browser; make the copy' });
    return streamFile(req, res, sp, sst, stype);
  }
  if (name === 'transcript.json') {   // the words only: the file also carries the footage's absolute path, which stays on this side
    var tr = null; try { tr = JSON.parse(fs.readFileSync(path.join(d2, 'transcript.json'), 'utf8')); } catch (e) { return json(res, 404, { error: 'no transcript yet' }); }
    return json(res, 200, { id: tk.id, engine: tr.engine || '', granularity: tr.granularity || 'word', words: Array.isArray(tr.words) ? tr.words : [], silences: Array.isArray(tr.silences) ? tr.silences : null });
  }
  var type = /^(preview|final)-\d+\.mp4$/.test(name) || name === 'proxy.mp4' ? 'video/mp4' : /^(preview|final)-\d+\.srt$/.test(name) ? 'text/plain; charset=utf-8' : '';
  if (!type) return json(res, 404, { error: 'not a file this route serves' });
  var file = path.join(d2, name); var st; try { st = fs.statSync(file); } catch (e) { return json(res, 404, { error: 'no such export' }); }
  return streamFile(req, res, file, st, type);
}
// a media file with Range (206 + Content-Range) so <video> can seek; HEAD answers the headers only
function streamFile(req, res, file, st, type) {
  var size = st.size; var head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Last-Modified': st.mtime.toUTCString() };
  var range = req.headers.range; var start = 0, end = size - 1, code = 200;
  if (range && /,/.test(String(range))) range = '';   // several ranges at once: answer the whole file
  if (range) {
    var rm2 = String(range).match(/^bytes=(\d*)-(\d*)$/);
    if (!rm2 || (rm2[1] === '' && rm2[2] === '')) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end(); }
    if (rm2[1] === '') { start = Math.max(0, size - parseInt(rm2[2], 10)); } else { start = parseInt(rm2[1], 10); if (rm2[2] !== '') end = Math.min(size - 1, parseInt(rm2[2], 10)); }
    if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end(); }
    code = 206; head['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  }
  head['Content-Length'] = end - start + 1; res.writeHead(code, head);
  if (req.method === 'HEAD' || size === 0) return res.end();
  var stream = fs.createReadStream(file, { start: start, end: end }); stream.on('error', function () { try { res.destroy(); } catch (e) { /* gone */ } }); req.on('close', function () { stream.destroy(); }); stream.pipe(res);
}

var server = http.createServer(function (req, res) {
  var url; try { url = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return send(res, 400, 'bad url', 'text/plain'); }

  if (url === '/api/ping') return json(res, 200, { marathon: true, version: 1, data: 'data/', log: true, folder: ROOT, video: true });
  if (url.indexOf('/api/') === 0 && !localOnly(req)) return json(res, 403, { error: 'this computer only' });   // Host must be localhost and Origin, when sent, this server: a page elsewhere cannot read the data or the footage through DNS rebinding

  // link metadata for inspiration items (title, description) — fetched here so the browser is not blocked by CORS
  if (url === '/api/meta') {
    var q = new URL(req.url, 'http://x').searchParams.get('url') || '';
    if (!/^https?:\/\//.test(q)) return json(res, 400, { error: 'http(s) url required' });
    var lib = q.indexOf('https:') === 0 ? require('https') : require('http');
    var done = false; function finish(code, obj) { if (done) return; done = true; json(res, code, obj); }
    try {
      var r = lib.get(q, { headers: { 'User-Agent': 'Mozilla/5.0 SoloOps/1.0', 'Accept': 'text/html' }, timeout: 6000 }, function (rs) {
        if (rs.statusCode >= 300 && rs.statusCode < 400 && rs.headers.location) { rs.resume(); var next = new URL(rs.headers.location, q).href; return finish(200, { redirect: next }); }
        var buf = ''; rs.setEncoding('utf8');
        rs.on('data', function (c) { buf += c; if (buf.length > 300000) { finish(200, meta(buf, q)); rs.destroy(); } });
        rs.on('end', function () { finish(200, meta(buf, q)); }); rs.on('error', function () { finish(200, meta(buf, q)); }); rs.on('close', function () { finish(200, meta(buf, q)); });
      });
      r.on('timeout', function () { r.destroy(); finish(200, {}); }); r.on('error', function () { finish(200, {}); });
    } catch (e) { finish(200, {}); }
    return;
  }

  // backup status for the Guide (data/ as its own git repo)
  if (url === '/api/backup') {
    var cpx = require('child_process'); var repo = fs.existsSync(path.join(DATA, '.git'));
    var bk = {}; try { bk = JSON.parse(fs.readFileSync(path.join(DATA, 'backup.json'), 'utf8')); } catch (e) { bk = {}; }
    var fold = { folder: bk.to || '', folderAt: bk.lastAt || '' };
    if (!repo) return json(res, 200, Object.assign({ repo: false }, fold));
    function g(args) { try { return cpx.execFileSync('git', ['-C', DATA].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).trim(); } catch (e) { return ''; } }
    var dirty = g(['status', '--porcelain']);
    return json(res, 200, Object.assign({ repo: true, remote: g(['remote', 'get-url', 'origin']), lastAt: g(['log', '-1', '--format=%cI']), dirty: dirty ? dirty.split('\n').length : 0 }, fold));
  }
  if (url === '/api/log') {
    var n = parseInt((req.url.split('?')[1] || '').replace(/.*n=(\d+).*/, '$1'), 10) || 40;
    return json(res, 200, readLog().slice(-n).reverse().map(function (r) { return { id: r.id, ts: r.ts, file: r.file, source: r.source, note: r.note, canRevert: r.prev != null }; }));
  }
  var rv = url.match(/^\/api\/revert\/([a-z0-9]+)$/);
  if (rv && req.method === 'POST') {
    var rec = readLog().filter(function (r) { return r.id === rv[1]; })[0];
    if (!rec || rec.prev == null) return json(res, 404, { error: 'nothing to revert' });
    var target = safeDataFile(rec.file); if (!target) return json(res, 400, { error: 'bad file' });
    var cur = ''; try { cur = fs.readFileSync(target, 'utf8'); } catch (e) { /* none */ }
    logChange(rec.file, cur, 'revert', 'revert of ' + rec.id);
    // bump updatedAt so open pages and the CLI pick the restored content up
    var restored = rec.prev;
    try { var o = JSON.parse(rec.prev); o.updatedAt = new Date().toISOString(); restored = JSON.stringify(o, null, 2) + '\n'; } catch (e) { /* keep raw */ }
    fs.writeFileSync(target, restored);
    return json(res, 200, { ok: true, file: rec.file });
  }

  // exports: whole-workspace backups, board files, Markdown, the safety copies made before a destructive action — into data/exports/ instead of ~/Downloads
  var ex = url.match(/^\/api\/export\/([A-Za-z0-9._-]+\.(json|md|txt|csv|png))$/);
  if (ex) {
    var edir = path.join(DATA, 'exports'); var efile = path.join(edir, ex[1]);
    if (req.method === 'PUT') {
      var eparts = [];
      req.on('data', function (c) { eparts.push(c); });
      req.on('end', function () { fs.mkdir(edir, { recursive: true }, function () { fs.writeFile(efile, Buffer.concat(eparts), function (err) { if (err) return json(res, 500, { error: err.code }); json(res, 200, { ok: true, path: 'data/exports/' + ex[1] }); }); }); });
      return;
    }
    if (req.method === 'GET') return fs.readFile(efile, function (err, buf) { if (err) return json(res, 404, { error: 'none' }); send(res, 200, buf, MIME[path.extname(efile).toLowerCase()] || 'application/octet-stream'); });
    return json(res, 405, { error: 'method' });
  }

  // attachments: images the pages save, as real files agents can open
  var at = url.match(/^\/api\/attach\/([A-Za-z0-9._-]+)$/);
  if (at) {
    var adir = path.join(DATA, 'attachments'); var afile = path.join(adir, at[1]);
    if (req.method === 'PUT') {
      var parts = [];
      req.on('data', function (c) { parts.push(c); });
      req.on('end', function () {
        var txt = Buffer.concat(parts).toString('utf8'); var dm = txt.match(/^data:([^;]+);base64,(.*)$/s);
        if (!dm) return json(res, 400, { error: 'expected a data URL' });
        fs.mkdir(adir, { recursive: true }, function () { fs.writeFile(afile, Buffer.from(dm[2], 'base64'), function (err) { if (err) return json(res, 500, { error: err.code }); json(res, 200, { ok: true, path: 'data/attachments/' + at[1] }); }); });
      });
      return;
    }
    if (req.method === 'GET') return fs.readFile(afile, function (err, buf) { if (err) return json(res, 404, { error: 'none' }); send(res, 200, buf, MIME[path.extname(afile).toLowerCase()] || 'application/octet-stream'); });
    return json(res, 405, { error: 'method' });
  }

  // video: the Studio page's buttons. ffmpeg work (transcribe, render) runs the CLI detached and the page polls;
  // exports stream with Range so <video> can seek. Every id is checked against videos.json before a path is built.
  if (url.indexOf('/api/video') === 0) return videoApi(req, res, url);

  var m = url.match(/^\/api\/data\/([^/]+)$/);
  if (m) {
    var file = safeDataFile(m[1]);
    if (!file) return json(res, 400, { error: 'bad file name' });
    if (req.method === 'GET') {
      return fs.readFile(file, 'utf8', function (err, txt) {
        if (err) return json(res, err.code === 'ENOENT' ? 404 : 500, { error: err.code });
        send(res, 200, txt);
      });
    }
    if (req.method === 'PUT') {
      var chunks = [];
      req.on('data', function (c) { chunks.push(c); });
      req.on('end', function () {
        var body = Buffer.concat(chunks).toString('utf8');
        try { JSON.parse(body); } catch (e) { return json(res, 400, { error: 'invalid json' }); }
        fs.mkdir(DATA, { recursive: true }, function () {
          var prev = ''; try { prev = fs.readFileSync(file, 'utf8'); } catch (e) { /* new file */ }
          if (prev !== body && !/^(activity|log)\.json$/.test(m[1]) && !sameButStamp(prev, body)) logChange(m[1], prev, req.headers['x-marathon-source'] || 'ui', req.headers['x-marathon-note'] || '');
          fs.writeFile(file, body.replace(/\n?$/, '\n'), 'utf8', function (err) {
            if (err) return json(res, 500, { error: err.code });
            json(res, 200, { ok: true });
          });
        });
      });
      return;
    }
    return json(res, 405, { error: 'method' });
  }

  // service worker: version = hash of every shipped file's mtime, so each code
  // change becomes a new worker and open pages learn about it
  if (url === '/sw.js') {
    return fs.readFile(path.join(ROOT, 'sw.js'), 'utf8', function (err, txt) {
      if (err) return send(res, 404, 'not found', 'text/plain');
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
      res.end(txt.replace('__VERSION__', 'solo-ops-' + buildVersion()));
    });
  }

  // static files
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });
  var rel = url === '/' ? '/index.html' : url;
  var abs = path.normalize(path.join(ROOT, rel));
  if (abs !== ROOT && abs.indexOf(ROOT + path.sep) !== 0) return send(res, 403, 'forbidden', 'text/plain');
  var inside = path.relative(ROOT, abs).split(path.sep).join('/');   // after normalising, so /./data, //data and ..%2F cannot slip past
  if (/^data(\/|$)/i.test(inside) && !/^data\/(attachments|exports)\/[^/]+$/i.test(inside)) return send(res, 403, 'data files go through /api/data/', 'text/plain');   // never identity.json, secrets.json, log.jsonl or a take's folder by URL
  fs.stat(abs, function (err, st) {
    if (!err && st.isDirectory()) abs = path.join(abs, 'index.html');
    fs.readFile(abs, function (err2, buf) {
      if (err2) return send(res, 404, 'not found: ' + rel, 'text/plain');
      send(res, 200, buf, MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream');
    });
  });
});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') { console.error('Port ' + PORT + ' is already in use (another Solo Ops or another app). Try: node serve.js --port ' + (PORT + 1)); process.exit(1); }
  throw e;
});
server.listen(PORT, '127.0.0.1', function () {
  console.log('Solo Ops → http://localhost:' + PORT + '   (writes data/*.json · Ctrl-C to stop)');
  try { watchRecordings(); if (recState.dir && fs.existsSync(recState.dir)) console.log('Recordings folder → ' + recState.dir + '   (a file saved there becomes a take)'); } catch (e) { /* no video module */ }
});
