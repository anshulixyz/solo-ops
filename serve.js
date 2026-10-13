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
var DATA = path.join(ROOT, 'data');
var cfg = {};
try { cfg = require(path.join(ROOT, 'solo.config.js')); } catch (e) { /* defaults */ }
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
  if (!/^[a-z0-9_-]+\.json$/i.test(name)) return null;
  return path.join(DATA, name);
}
var LOG = path.join(DATA, 'log.jsonl');
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

var server = http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api/ping') return json(res, 200, { marathon: true, version: 1, data: 'data/', log: true, folder: ROOT });

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
  var ex = url.match(/^\/api\/export\/([A-Za-z0-9._-]+\.(json|md|txt|csv))$/);
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
          if (prev !== body && !/^(activity|log)\.json$/.test(m[1])) logChange(m[1], prev, req.headers['x-marathon-source'] || 'ui', req.headers['x-marathon-note'] || '');
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
  if (abs.indexOf(ROOT) !== 0) return send(res, 403, 'forbidden', 'text/plain');
  fs.stat(abs, function (err, st) {
    if (!err && st.isDirectory()) abs = path.join(abs, 'index.html');
    fs.readFile(abs, function (err2, buf) {
      if (err2) return send(res, 404, 'not found: ' + rel, 'text/plain');
      send(res, 200, buf, MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream');
    });
  });
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('Solo Ops → http://localhost:' + PORT + '   (writes data/*.json · Ctrl-C to stop)');
});
