#!/usr/bin/env node
/* =========================================================================
   relay.js — a small, dumb relay for sealed Solo Ops events.
     node relay.js                 → http://127.0.0.1:4400 (this machine only)
     node relay.js --port 4400 --public     bind every interface (behind a tunnel or on a VPS)
   It holds encrypted events until they are fetched or expire (30 days). It
   verifies the outer signature so it stores only well-formed events; it
   cannot read, alter or forge them. Storage: relay-data/events.jsonl
   (append-only, git-ignored). Zero dependencies.
     POST /publish            body = sealed event (core/net.js seal)
     GET  /inbox?to=<enc pub>&since=<seq>   events for that key after seq
     GET  /                   relay info
   ========================================================================= */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var Net = require('./core/net.js');

var args = process.argv.slice(2);
if (args.indexOf('--help') > -1 || args.indexOf('-h') > -1) { console.log('node relay.js [--port 4400] [--public]   holds sealed Solo Ops events until fetched (30 days). --public binds every interface (put it behind a tunnel or on a small server); default is this machine only.'); process.exit(0); }
var argPort = args.indexOf('--port');
var PORT = argPort > -1 ? parseInt(args[argPort + 1], 10) : 4400;
var HOST = args.indexOf('--public') > -1 ? '0.0.0.0' : '127.0.0.1';
var DIR = path.join(__dirname, 'relay-data');
var FILE = path.join(DIR, 'events.jsonl');
var MAX_PER_KEY = 2000, MAX_PER_SENDER = 500, MAX_EVENTS = 50000, MAX_BYTES = 200 * 1024 * 1024, PAGE = 200, RATE = { perMinute: 120 };
var totalBytes = 0;

var events = [], seq = 0, byId = {};
try { fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).forEach(function (l) { try { var e = JSON.parse(l); if (Date.parse(e.exp) > Date.now() && !byId[e.id]) { events.push(e); byId[e.id] = 1; seq = Math.max(seq, e.seq || 0); } } catch (x) { /* skip */ } }); } catch (e) { /* fresh */ }

var hits = {};
function limited(ip) { var m = Math.floor(Date.now() / 60000); var k = ip + ':' + m; hits[k] = (hits[k] || 0) + 1; Object.keys(hits).forEach(function (q) { if (q.split(':').pop() !== String(m)) delete hits[q]; }); return hits[k] > RATE.perMinute; }
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function sweep() { var now = Date.now(); var keep = events.filter(function (e) { return Date.parse(e.exp) > now; }); if (keep.length !== events.length) { events = keep; byId = {}; events.forEach(function (e) { byId[e.id] = 1; }); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, events.map(function (e) { return JSON.stringify(e); }).join('\n') + (events.length ? '\n' : '')); } }
setInterval(sweep, 3600000).unref();

var server = http.createServer(function (req, res) {
  var ip = req.socket.remoteAddress || '?';
  if (limited(ip)) return json(res, 429, { error: 'slow down' });
  var u = new URL(req.url, 'http://x'); if (u.pathname === '/v0/inbox' || u.pathname === '/v0/publish') u.pathname = u.pathname.slice(3);   // relay.v0 paths, as the OHAN box serves them
  if (req.method === 'GET' && u.pathname === '/') return json(res, 200, { relay: 'solo-ops-relay', version: 1, protocol: Net.PROTOCOL, events: events.length, ttlDays: 30, maxBytes: Net.MAX_EVENT_BYTES });
  if (req.method === 'GET' && u.pathname === '/inbox') {
    var to = u.searchParams.get('to') || '', since = parseInt(u.searchParams.get('since') || '0', 10) || 0;
    if (!/^[0-9a-f]{64}$/.test(to)) return json(res, 400, { error: 'to must be a 64-hex public key' });
    var list = events.filter(function (e) { return e.to === to && e.seq > since; }).slice(0, PAGE);
    return json(res, 200, { events: list, seq: list.length ? list[list.length - 1].seq : since, more: events.some(function (e) { return e.to === to && e.seq > (list.length ? list[list.length - 1].seq : since); }) });
  }
  if (req.method === 'POST' && u.pathname === '/publish') {
    var chunks = [], size = 0;
    req.on('data', function (c) { size += c.length; if (size > Net.MAX_EVENT_BYTES) { json(res, 413, { error: 'event over ' + (Net.MAX_EVENT_BYTES / 1024) + ' KB' }); req.destroy(); } else chunks.push(c); });
    req.on('end', function () {
      if (res.writableEnded) return;
      var ev; try { ev = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return json(res, 400, { error: 'invalid json' }); }
      if (ev && ev.seq !== undefined) delete ev.seq;
      var err = Net.checkEvent(ev); if (err) return json(res, 400, { error: err });
      if (byId[ev.id]) return json(res, 200, { ok: true, seq: (events.filter(function (e) { return e.id === ev.id; })[0] || {}).seq, duplicate: true });
      if (events.filter(function (e) { return e.to === ev.to; }).length >= MAX_PER_KEY) return json(res, 429, { error: 'inbox full for that key' });
      if (events.filter(function (e) { return e.from_key === ev.from_key; }).length >= MAX_PER_SENDER) return json(res, 429, { error: 'too many undelivered events from that key' });
      if (events.length >= MAX_EVENTS || totalBytes >= MAX_BYTES) return json(res, 503, { error: 'relay full' });
      ev.seq = ++seq; events.push(ev); byId[ev.id] = 1; totalBytes += size;
      fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(FILE, JSON.stringify(ev) + '\n');
      return json(res, 200, { ok: true, seq: ev.seq });
    });
    return;
  }
  json(res, 404, { error: 'not found' });
});
server.on('error', function (e) { if (e.code === 'EADDRINUSE') { console.error('Port ' + PORT + ' is in use. Try: node relay.js --port ' + (PORT + 1)); process.exit(1); } throw e; });
server.listen(PORT, HOST, function () { console.log('Solo Ops relay → http://' + (HOST === '0.0.0.0' ? '0.0.0.0' : 'localhost') + ':' + PORT + '   (' + events.length + ' sealed events · stores relay-data/events.jsonl · Ctrl-C to stop)'); });
