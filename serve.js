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

var server = http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api/ping') return json(res, 200, { marathon: true, version: 1, data: 'data/', log: true });

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
