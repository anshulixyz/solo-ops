/* =========================================================================
   core/net.js — OHAN identity, cards, signed envelopes and sealed relay events.
   Zero dependencies (node:crypto). The same file as box/net.js in the ohan
   repo; Node only, the pages never see a private key.
   Zero dependencies: ed25519 + x25519 + AES-256-GCM from node:crypto.

     identity   = Net.createIdentity('@mara', ['http://127.0.0.1:4400'])
     card       = Net.cardOf(identity)                 // public: handle, keys, relays
     envelope   = Net.envelope(identity, toCard, 'update', { body, context })   // openDM intent.v0.1 shape, signed
     event      = Net.seal(identity, toCard, envelope) // what the relay stores: it sees recipient key, size, time
     envelope   = Net.open(identity, event)            // decrypt + verify the inner signature
     Net.publish(relayUrl, event) / Net.fetch(relayUrl, toEncPub, sinceSeq)   (promises, plain http)
   ========================================================================= */
'use strict';
var crypto = require('crypto');
var http = require('http');
var https = require('https');

var PROTOCOL = 'intent.v0.1';
var ED_SPKI = Buffer.from('302a300506032b6570032100', 'hex');   // DER prefix for a raw ed25519 public key
var X_SPKI = Buffer.from('302a300506032b656e032100', 'hex');    // DER prefix for a raw x25519 public key
var MAX_EVENT_BYTES = 256 * 1024;
var EVENT_TTL_MS = 30 * 86400000;

/* ---- canonical json (sorted keys, no whitespace) ------------------------- */
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function (k) { return v[k] === undefined ? null : JSON.stringify(k) + ':' + canonical(v[k]); }).filter(Boolean).join(',') + '}';
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

/* ---- keys ---------------------------------------------------------------- */
function rawPub(keyObj) { return keyObj.export({ type: 'spki', format: 'der' }).slice(-32).toString('hex'); }
function pubFromHex(hex, kind) {
  if (!/^[0-9a-f]{64}$/.test(String(hex))) throw new Error('bad public key');
  return crypto.createPublicKey({ key: Buffer.concat([kind === 'x' ? X_SPKI : ED_SPKI, Buffer.from(hex, 'hex')]), type: 'spki', format: 'der' });
}
function privFromB64(b64) { return crypto.createPrivateKey({ key: Buffer.from(b64, 'base64'), type: 'pkcs8', format: 'der' }); }
function privToB64(keyObj) { return keyObj.export({ type: 'pkcs8', format: 'der' }).toString('base64'); }

function createIdentity(handle, relays) {
  if (!/^@[a-z0-9][a-z0-9-]{0,30}(\.[a-z0-9-]{1,20})?$/.test(handle)) throw new Error('A handle is @ plus lowercase letters, digits and dashes, like @mara (an agent: @mara.ops).');
  var s = crypto.generateKeyPairSync('ed25519'), e = crypto.generateKeyPairSync('x25519');
  return { handle: handle, sign: { pub: rawPub(s.publicKey), priv: privToB64(s.privateKey) }, enc: { pub: rawPub(e.publicKey), priv: privToB64(e.privateKey) }, relays: (relays || []).slice(), createdAt: new Date().toISOString() };
}
function cardOf(id) { return { handle: id.handle, sign: id.sign.pub, enc: id.enc.pub, relays: (id.relays || []).slice() }; }
function cardString(card) { return 'solo-card:' + Buffer.from(JSON.stringify(card)).toString('base64'); }
function parseCard(s) {
  s = String(s || '').trim();
  var obj;
  try { obj = JSON.parse(s.indexOf('solo-card:') === 0 ? Buffer.from(s.slice(10), 'base64').toString('utf8') : s); } catch (e) { throw new Error('Not a card. Paste the solo-card:… string from `node solo.js id card`.'); }
  if (!obj || typeof obj.handle !== 'string' || !/^[0-9a-f]{64}$/.test(obj.sign || '') || !/^[0-9a-f]{64}$/.test(obj.enc || '') || !Array.isArray(obj.relays)) throw new Error('Card is missing handle, sign, enc or relays.');
  return { handle: obj.handle, sign: obj.sign, enc: obj.enc, relays: obj.relays.filter(function (r) { return /^https?:\/\//.test(r); }) };
}

/* ---- signing ------------------------------------------------------------- */
function signObject(obj, privB64) {
  var copy = Object.assign({}, obj); delete copy.signature;
  return crypto.sign(null, Buffer.from(canonical(copy)), privFromB64(privB64)).toString('base64');
}
function verifyObject(obj, pubHex) {
  if (!obj || typeof obj.signature !== 'string') return false;
  var copy = Object.assign({}, obj); delete copy.signature;
  try { return crypto.verify(null, Buffer.from(canonical(copy)), pubFromHex(pubHex, 'ed'), Buffer.from(obj.signature, 'base64')); } catch (e) { return false; }
}

/* ---- envelopes (openDM intent.v0.1 shape) -------------------------------- */
function envelope(id, toCard, intent, content, opts) {
  opts = opts || {};
  var env = {
    protocol: PROTOCOL, msg_id: crypto.randomUUID(), ts: new Date().toISOString(),
    from: id.handle, to: toCard.handle, sender: { key: id.sign.pub, endpoint: (id.relays || [])[0] || '' },
    intent: intent, urgency: opts.urgency || 'low',
    content: { body: String((content && content.body) || intent), attachments: (content && content.attachments) || [], context: (content && content.context) || [] },
    proofs: opts.proofs || [], thread: { id: opts.thread || null, reply_to: opts.reply_to || null },
    policy: { retention: 'until-deleted', shareable_with: opts.shareable_with || 'recipient-only' }
  };
  env.signature = signObject(env, id.sign.priv);
  return env;
}
function dataItem(obj, provenance) { return { type: 'data', inline: JSON.stringify(obj), provenance: provenance || '' }; }
function dataOf(env) {   // first data context item, parsed
  var c = ((env.content || {}).context || []).filter(function (x) { return x.type === 'data' && x.inline; })[0];
  if (!c) return null; try { return JSON.parse(c.inline); } catch (e) { return null; }
}

/* ---- sealing (what the relay holds) -------------------------------------- */
function kdf(shared, epkHex, toHex) { return crypto.createHash('sha256').update(shared).update(Buffer.from(epkHex, 'hex')).update(Buffer.from(toHex, 'hex')).digest(); }
function seal(id, toCard, env) {
  var eph = crypto.generateKeyPairSync('x25519');
  var epk = rawPub(eph.publicKey);
  var shared = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: pubFromHex(toCard.enc, 'x') });
  var key = kdf(shared, epk, toCard.enc), nonce = crypto.randomBytes(12);
  var c = crypto.createCipheriv('aes-256-gcm', key, nonce); c.setAAD(Buffer.from(toCard.enc, 'hex'));
  var ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(env), 'utf8')), c.final()]);
  var ev = { to: toCard.enc, ts: new Date().toISOString(), exp: new Date(Date.now() + EVENT_TTL_MS).toISOString(), kind: 'sealed', epk: epk, from_key: id.sign.pub,
    payload: Buffer.concat([nonce, c.getAuthTag(), ct]).toString('base64') };
  ev.id = sha256(canonical(ev));
  ev.signature = signObject(ev, id.sign.priv);
  var bytes = Buffer.byteLength(JSON.stringify(ev));
  if (bytes > MAX_EVENT_BYTES) throw new Error('Update is ' + Math.round(bytes / 1024) + ' KB; the limit is ' + (MAX_EVENT_BYTES / 1024) + ' KB.');
  return ev;
}
function checkEvent(ev) {   // what a relay (or a cautious client) verifies without being able to read it
  if (!ev || typeof ev !== 'object') return 'not an object';
  if (!/^[0-9a-f]{64}$/.test(ev.to || '') || !/^[0-9a-f]{64}$/.test(ev.epk || '') || !/^[0-9a-f]{64}$/.test(ev.from_key || '')) return 'bad keys';
  if (typeof ev.payload !== 'string' || ev.kind !== 'sealed') return 'bad payload';
  if (isNaN(Date.parse(ev.ts)) || isNaN(Date.parse(ev.exp))) return 'bad timestamps';
  if (Date.parse(ev.exp) - Date.now() > EVENT_TTL_MS + 60000) return 'expiry too far ahead';
  if (Date.parse(ev.exp) < Date.now()) return 'expired';
  var copy = Object.assign({}, ev); delete copy.signature; delete copy.id; delete copy.seq;
  if (sha256(canonical(copy)) !== ev.id) return 'id does not match content';
  if (!verifyObject(stripSeq(ev), ev.from_key)) return 'signature does not verify';
  return null;
}
function stripSeq(ev) { var c = Object.assign({}, ev); delete c.seq; return c; }
function open(id, ev) {
  var err = checkEvent(ev); if (err) throw new Error('relay event rejected: ' + err);
  if (ev.to !== id.enc.pub) throw new Error('not addressed to me');
  var buf = Buffer.from(ev.payload, 'base64'); var nonce = buf.slice(0, 12), tag = buf.slice(12, 28), ct = buf.slice(28);
  var shared = crypto.diffieHellman({ privateKey: privFromB64(id.enc.priv), publicKey: pubFromHex(ev.epk, 'x') });
  var d = crypto.createDecipheriv('aes-256-gcm', kdf(shared, ev.epk, id.enc.pub), nonce); d.setAAD(Buffer.from(id.enc.pub, 'hex')); d.setAuthTag(tag);
  var env = JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
  if (env.protocol !== PROTOCOL && env.protocol !== 'intent.v0') throw new Error('unknown protocol ' + env.protocol);
  if (!env.sender || env.sender.key !== ev.from_key) throw new Error('inner sender does not match outer key');
  if (!verifyObject(env, env.sender.key)) throw new Error('envelope signature does not verify');
  if (env.to !== id.handle) throw new Error('envelope addressed to ' + env.to + ', I am ' + id.handle);
  if (typeof env.from !== 'string' || !/^@[a-z0-9][a-z0-9-]{0,30}(\.[a-z0-9-]{1,20})?$/.test(env.from)) throw new Error('envelope sender is not a handle');
  return env;
}

/* ---- http ---------------------------------------------------------------- */
function request(url, method, body) {
  return new Promise(function (resolve, reject) {
    var u; try { u = new URL(url); } catch (e) { return reject(new Error('bad relay url ' + url)); }
    var mod = u.protocol === 'https:' ? https : http;
    var data = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    var req = mod.request({ hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}, timeout: 8000 }, function (res) {
      var chunks = []; res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { var txt = Buffer.concat(chunks).toString('utf8'); var obj = null; try { obj = JSON.parse(txt); } catch (e) { /* raw */ } if (res.statusCode >= 400) return reject(new Error((obj && obj.error) || ('relay ' + res.statusCode))); resolve(obj); });
    });
    req.on('timeout', function () { req.destroy(new Error('relay timed out: ' + u.host)); });
    req.on('error', function (e) { reject(new Error('relay unreachable: ' + u.host + ' (' + (e.code || e.message) + ')')); });
    if (data) req.write(data); req.end();
  });
}
function publish(relayUrl, ev) { return request(relayUrl.replace(/\/$/, '') + '/v0/publish', 'POST', ev); }
function fetchInbox(relayUrl, toEncPub, since) { return request(relayUrl.replace(/\/$/, '') + '/v0/inbox?to=' + toEncPub + '&since=' + (since || 0), 'GET'); }

/* ---- base58 (for did documents' multibase keys) --------------------------- */
var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(buf) { var n = BigInt('0x' + buf.toString('hex')); var out = ''; while (n > 0n) { out = B58[Number(n % 58n)] + out; n = n / 58n; } for (var i = 0; i < buf.length && buf[i] === 0; i++) out = '1' + out; return out; }

/* ---- cards (card.v0): the signed public record of a handle --------------- */
function card(id, extra) {   // extra: listed, profile, apps, accepts, endpoint, rotation
  var c = Object.assign({ protocol: 'card.v0', handle: id.handle, sign: id.sign.pub, enc: id.enc.pub, relays: (id.relays || []).slice(), listed: false, ts: new Date().toISOString() }, extra || {});
  var rot = c.rotation; delete c.rotation; delete c.signature;
  c.signature = signObject(c, id.sign.priv);
  if (rot) c.rotation = rot;
  return c;
}
function rotationSignature(oldPrivB64, newCard) { var body = Object.assign({}, newCard); delete body.rotation; delete body.signature; return signObject(body, oldPrivB64); }
function verifyCard(c) { if (!c || typeof c !== 'object' || typeof c.sign !== 'string') return false; var x = Object.assign({}, c); delete x.rotation; return verifyObject(x, c.sign); }
function cardFromCard(c) { return { handle: c.handle, sign: c.sign, enc: c.enc, relays: (c.relays || []).slice() }; }   // the compact contact form clients pin
function resolve(boxUrl, handle) { return request(boxUrl.replace(/\/$/, '') + '/v0/resolve/' + encodeURIComponent(handle), 'GET').then(function (r) { if (!r || !r.card || !verifyCard(r.card) || r.card.handle !== handle) throw new Error('card for ' + handle + ' did not verify'); return r.card; }); }
function register(boxUrl, signedCard) { return request(boxUrl.replace(/\/$/, '') + '/v0/profile', 'POST', signedCard); }

module.exports = { PROTOCOL: PROTOCOL, base58: base58, card: card, rotationSignature: rotationSignature, verifyCard: verifyCard, cardFromCard: cardFromCard, resolve: resolve, register: register, MAX_EVENT_BYTES: MAX_EVENT_BYTES, EVENT_TTL_MS: EVENT_TTL_MS, canonical: canonical, sha256: sha256,
  createIdentity: createIdentity, cardOf: cardOf, cardString: cardString, parseCard: parseCard,
  signObject: signObject, verifyObject: verifyObject, envelope: envelope, dataItem: dataItem, dataOf: dataOf,
  seal: seal, open: open, checkEvent: checkEvent, request: request, publish: publish, fetch: fetchInbox };
