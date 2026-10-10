#!/usr/bin/env node
/* =========================================================================
   serve.js — zero-dependency local server for Marathon.
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
try { cfg = require(path.join(ROOT, 'marathon.config.js')); } catch (e) { /* defaults */ }
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

var server = http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api/ping') return json(res, 200, { marathon: true, version: 1, data: 'data/' });

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
  console.log('Marathon → http://localhost:' + PORT + '   (writes data/*.json · Ctrl-C to stop)');
});
