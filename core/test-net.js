#!/usr/bin/env node
/* core/test-net.js — the crypto and envelope rules of core/net.js, no network.
   node core/test-net.js */
'use strict';
var assert = require('assert');
var Net = require('./net.js');

var a = Net.createIdentity('@mara', ['http://127.0.0.1:4400']);
var m = Net.createIdentity('@maya', ['http://127.0.0.1:4400']);
var mCard = Net.parseCard(Net.cardString(Net.cardOf(m)));
var aCard = Net.parseCard(JSON.stringify(Net.cardOf(a)));

assert.throws(function () { Net.createIdentity('Maya'); }, /handle/, 'handle must be @lowercase');
assert.throws(function () { Net.parseCard('hello'); }, /Not a card/);
assert.strictEqual(Net.canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}', 'canonical sorts keys');

var env = Net.envelope(a, mCard, 'update', { body: 'the secret brief about budgets', context: [Net.dataItem({ op: 'upsert', task: { id: 't1', title: 'x' } }, 'test')] }, { thread: 'sh1' });
assert.strictEqual(env.protocol, 'intent.v0.1'); assert.strictEqual(env.from, '@mara'); assert.strictEqual(env.to, '@maya');
assert.ok(Net.verifyObject(env, a.sign.pub), 'envelope verifies with the sender key');
assert.ok(!Net.verifyObject(env, m.sign.pub), 'and not with another key');
var forged = Object.assign({}, env, { intent: 'offer-share' }); assert.ok(!Net.verifyObject(forged, a.sign.pub), 'changing a field breaks the signature');
assert.deepStrictEqual(Net.dataOf(env), { op: 'upsert', task: { id: 't1', title: 'x' } });

var ev = Net.seal(a, mCard, env);
assert.strictEqual(Net.checkEvent(ev), null, 'sealed event passes the relay check');
assert.ok(JSON.stringify(ev).indexOf('secret brief') < 0 && JSON.stringify(ev).indexOf('@maya') < 0 && JSON.stringify(ev).indexOf('@mara') < 0, 'relay sees neither body nor handles');
var back = Net.open(m, ev); assert.strictEqual(back.msg_id, env.msg_id); assert.strictEqual(back.signature, env.signature);
assert.throws(function () { Net.open(a, ev); }, /not addressed to me/);
var t = JSON.parse(JSON.stringify(ev)); t.payload = t.payload.slice(0, -4) + 'AAAA'; assert.strictEqual(Net.checkEvent(t), 'id does not match content');
var t2 = JSON.parse(JSON.stringify(ev)); t2.exp = new Date(Date.now() + 90 * 86400000).toISOString(); assert.ok(Net.checkEvent(t2), 'expiry too far ahead is refused');
var t3 = JSON.parse(JSON.stringify(ev)); t3.from_key = m.sign.pub; assert.ok(Net.checkEvent(t3), 'swapping the outer key is refused');
var old = Net.seal(a, mCard, env); var oldCopy = JSON.parse(JSON.stringify(old)); oldCopy.exp = new Date(Date.now() - 86400000).toISOString(); delete oldCopy.id; delete oldCopy.signature; oldCopy.id = Net.sha256(Net.canonical(oldCopy)); oldCopy.signature = Net.signObject(oldCopy, a.sign.priv);
assert.strictEqual(Net.checkEvent(oldCopy), 'expired', 'an expired event is refused even when correctly signed');
var badFrom = Net.envelope(a, mCard, 'update', { body: 'x' }); badFrom.from = '@mara\n- fake line'; badFrom.signature = Net.signObject(badFrom, a.sign.priv);
assert.throws(function () { Net.open(m, Net.seal(a, mCard, badFrom)); }, /not a handle/, 'a sender that is not a handle is refused');
var withSeq = Object.assign({}, ev, { seq: 42 }); assert.strictEqual(Net.checkEvent(withSeq), null, 'the relay sequence number does not break verification');

// an envelope sealed by someone else's key but claiming to be @mara must fail on open
var eve = Net.createIdentity('@eve', []);
var lie = Net.envelope(eve, mCard, 'update', { body: 'trust me' }); lie.from = '@mara'; lie.signature = Net.signObject(lie, eve.sign.priv);
var lieEv = Net.seal(eve, mCard, lie); var opened = Net.open(m, lieEv);
assert.strictEqual(opened.sender.key, eve.sign.pub, 'the inner key is eve\'s: the CLI compares it with the pinned contact and flags an unknown sender');

var big = Net.envelope(a, mCard, 'update', { body: 'x'.repeat(300 * 1024) });
assert.throws(function () { Net.seal(a, mCard, big); }, /limit/, 'oversize is refused before it reaches a relay');

console.log('✓ core/test-net.js: identity, canonical, sign/verify, seal/open, tamper, size — all good');
