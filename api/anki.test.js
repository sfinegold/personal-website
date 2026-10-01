// node api/anki.test.js — exercises the handler with mock req/res, the in-memory store and a fake mailer.
'use strict';
const assert = require('node:assert/strict');
process.env.ANKI_ALLOW_MEMORY = '1';
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_KEY; delete process.env.ANKI_ECHO_CODE;
const sent = [];
require.cache[require.resolve('./_lib/email')] = { id: require.resolve('./_lib/email'), filename: require.resolve('./_lib/email'), loaded: true, exports: { sendEmail: async (m) => { sent.push(m); return { id: 'x' }; }, transport: () => 'fake' } };
const handler = require('./anki.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e.message || e)); } }
function call({ method = 'GET', query = {}, body, token } = {}) {
  const headers = token ? { 'x-anki-token': token } : {};
  const req = { method, query, body, headers };
  const out = { status: 0, json: null, headers: {} };
  const res = { setHeader: (k, v) => { out.headers[k] = v; }, status: (c) => { out.status = c; return res; }, json: (j) => { out.json = j; return res; } };
  return handler(req, res).then(() => out);
}
const card = (last, ivl) => ({ type: 'review', step: 0, due: 0, ivl, ease: 2.5, reps: 1, lapses: 0, leech: false, last });
const doc = (cards, updated) => ({ v: 2, updated, settings: { newPerDay: 20 }, decks: { greek: { cards, day: { day: 1, newDone: 1, revDone: 0, extraNew: 0 }, undo: [{ x: 1 }], stamp: null, boost: [] } } });
const codeFrom = (m) => m.subject.match(/^(\d{6})/)[1];

(async () => {
  let token;
  await test('request: validates the address, emails a 6-digit code, cools down', async () => {
    assert.equal((await call({ method: 'POST', body: { op: 'request', email: 'nope' } })).status, 400);
    const r = await call({ method: 'POST', body: { op: 'request', email: ' Sam@Example.com ' } });
    assert.equal(r.status, 200); assert.equal(sent.length, 1); assert.equal(sent[0].to, 'sam@example.com'); assert.match(sent[0].subject, /^\d{6} is your/);
    assert.equal((await call({ method: 'POST', body: { op: 'request', email: 'sam@example.com' } })).status, 429);
  });
  await test('verify: wrong code counts a try, right code signs in and creates the account once', async () => {
    const bad = await call({ method: 'POST', body: { op: 'verify', email: 'sam@example.com', code: '000000' } });
    assert.equal(bad.status, 401);
    const good = await call({ method: 'POST', body: { op: 'verify', email: 'sam@example.com', code: codeFrom(sent[0]) } });
    assert.equal(good.status, 200); assert.match(good.json.token, /^[a-f0-9]{48}$/); assert.equal(good.json.user.email, 'sam@example.com'); assert.equal(good.json.user.name, 'sam');
    token = good.json.token;
    const reuse = await call({ method: 'POST', body: { op: 'verify', email: 'sam@example.com', code: codeFrom(sent[0]) } });
    assert.equal(reuse.status, 401, 'codes are single use');
  });
  await test('session: me and state need the token; state is empty at first', async () => {
    assert.equal((await call({ query: { op: 'me' } })).status, 401);
    assert.equal((await call({ query: { op: 'me' }, token: 'deadbeef' })).status, 401);
    const me = await call({ query: { op: 'me' }, token }); assert.equal(me.status, 200); assert.equal(me.json.user.name, 'sam');
    const st = await call({ query: { op: 'state' }, token }); assert.deepEqual(st.json.decks, {});
  });
  await test('save merges across devices; rename works; signout kills the token', async () => {
    const phone = await call({ method: 'POST', body: { op: 'save', state: doc({ 'a:fwd': card(10, 1), 'b:fwd': card(10, 1) }, '2026-10-01T10:00:00Z') }, token });
    assert.equal(phone.status, 200); assert.deepEqual(phone.json.decks.greek.undo, []);
    const laptop = await call({ method: 'POST', body: { op: 'save', state: doc({ 'a:fwd': card(20, 5), 'c:fwd': card(3, 2) }, '2026-10-01T11:00:00Z') }, token });
    const g = laptop.json.decks.greek.cards; assert.equal(g['a:fwd'].ivl, 5); assert.equal(g['b:fwd'].ivl, 1); assert.equal(g['c:fwd'].ivl, 2);
    const rn = await call({ method: 'POST', body: { op: 'rename', name: '  Sam F ' }, token }); assert.equal(rn.json.user.name, 'Sam F');
    assert.equal((await call({ query: { op: 'me' }, token })).json.user.updated !== null, true);
    assert.equal((await call({ method: 'POST', body: { op: 'signout' }, token })).status, 200);
    assert.equal((await call({ query: { op: 'me' }, token })).status, 401);
  });
  await test('allowlist: addresses outside ANKI_ALLOWED_EMAILS get the neutral reply and no email', async () => {
    process.env.ANKI_ALLOWED_EMAILS = 'sam@example.com, caroline@example.com';
    const before = sent.length;
    const r = await call({ method: 'POST', body: { op: 'request', email: 'stranger@example.com' } });
    assert.equal(r.status, 200); assert.equal(sent.length, before);
    const c = await call({ method: 'POST', body: { op: 'request', email: 'caroline@example.com' } });
    assert.equal(c.status, 200); assert.equal(sent.length, before + 1);
    delete process.env.ANKI_ALLOWED_EMAILS;
  });
  await test('bad inputs: oversized 413, PUT 405, unknown op 400', async () => {
    assert.equal((await call({ method: 'POST', body: 'x'.repeat(1600000) })).status, 413);
    assert.equal((await call({ method: 'PUT' })).status, 405);
    assert.equal((await call({ method: 'POST', body: { op: 'zap' }, token: 'a'.repeat(48) })).status, 401);
  });
  console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
