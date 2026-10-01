// node api/anki.test.js — exercises the handler with mock req/res and the in-memory store.
'use strict';
const assert = require('node:assert/strict');
process.env.ANKI_ALLOW_MEMORY = '1';
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_KEY;
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e.message || e)); } }
function call(handler, { method = 'GET', query = {}, body, pass } = {}) {
  const headers = pass !== undefined ? { 'x-anki-pass': pass } : {};
  const req = { method, query, body, headers };
  const out = { status: 0, json: null, headers: {} };
  const res = { setHeader: (k, v) => { out.headers[k] = v; }, status: (c) => { out.status = c; return res; }, json: (j) => { out.json = j; return res; } };
  return handler(req, res).then(() => out);
}
const card = (last, ivl) => ({ type: 'review', step: 0, due: 0, ivl, ease: 2.5, reps: 1, lapses: 0, leech: false, last });
const doc = (cards, updated) => ({ v: 2, updated, settings: { newPerDay: 20 }, decks: { greek: { cards, day: { day: 1, newDone: 1, revDone: 0, extraNew: 0 }, undo: [{ x: 1 }], stamp: null, boost: [] } } });

(async () => {
  delete process.env.ANKI_PASSPHRASE;
  let handler = require('./anki.js');
  await test('503 when no passphrase is configured', async () => {
    const r = await call(handler, { query: { op: 'profiles' }, pass: 'x' });
    assert.equal(r.status, 503); assert.match(r.json.error, /ANKI_PASSPHRASE/);
  });
  process.env.ANKI_PASSPHRASE = 'olive tree';
  await test('401 on a wrong or missing passphrase', async () => {
    assert.equal((await call(handler, { query: { op: 'profiles' }, pass: 'olive' })).status, 401);
    assert.equal((await call(handler, { query: { op: 'profiles' } })).status, 401);
  });
  await test('profiles start empty; create adds one with a slug id', async () => {
    const r0 = await call(handler, { query: { op: 'profiles' }, pass: 'olive tree' });
    assert.equal(r0.status, 200); assert.deepEqual(r0.json.profiles, []);
    const r1 = await call(handler, { method: 'POST', body: { op: 'create', name: '  Caroline  ' }, pass: 'olive tree' });
    assert.equal(r1.status, 200); assert.equal(r1.json.profile.name, 'Caroline'); assert.match(r1.json.profile.id, /^caroline-[a-z0-9]{5}$/);
    const r2 = await call(handler, { query: { op: 'profiles' }, pass: 'olive tree' });
    assert.equal(r2.json.profiles.length, 1);
  });
  let id;
  await test('state is empty until saved; save merges rather than overwrites', async () => {
    const list = (await call(handler, { query: { op: 'profiles' }, pass: 'olive tree' })).json.profiles; id = list[0].id;
    const e = await call(handler, { query: { op: 'state', profile: id }, pass: 'olive tree' });
    assert.equal(e.status, 200); assert.deepEqual(e.json.decks, {}); assert.equal(e.json.updated, null);
    const phone = await call(handler, { method: 'POST', body: { op: 'save', profile: id, state: doc({ 'a:fwd': card(10, 1), 'b:fwd': card(10, 1) }, '2026-10-01T10:00:00Z') }, pass: 'olive tree' });
    assert.equal(phone.status, 200); assert.ok(phone.json.updated); assert.deepEqual(phone.json.decks.greek.undo, []);
    const laptop = await call(handler, { method: 'POST', body: { op: 'save', profile: id, state: doc({ 'a:fwd': card(20, 5), 'c:fwd': card(3, 2) }, '2026-10-01T11:00:00Z') }, pass: 'olive tree' });
    const g = laptop.json.decks.greek.cards;
    assert.equal(g['a:fwd'].ivl, 5); assert.equal(g['b:fwd'].ivl, 1); assert.equal(g['c:fwd'].ivl, 2);
    const again = await call(handler, { query: { op: 'state', profile: id }, pass: 'olive tree' });
    assert.equal(Object.keys(again.json.decks.greek.cards).length, 3);
    const profiles = (await call(handler, { query: { op: 'profiles' }, pass: 'olive tree' })).json.profiles;
    assert.ok(profiles[0].updated);
  });
  await test('bad inputs: unknown profile 404, bad document 400, oversized 413, PUT 405, unknown op 400', async () => {
    assert.equal((await call(handler, { query: { op: 'state', profile: 'nope' }, pass: 'olive tree' })).status, 404);
    assert.equal((await call(handler, { method: 'POST', body: { op: 'save', profile: id, state: { v: 1 } }, pass: 'olive tree' })).status, 400);
    assert.equal((await call(handler, { method: 'POST', body: 'x'.repeat(1600000), pass: 'olive tree' })).status, 413);
    assert.equal((await call(handler, { method: 'PUT', pass: 'olive tree' })).status, 405);
    assert.equal((await call(handler, { method: 'POST', body: { op: 'zap' }, pass: 'olive tree' })).status, 400);
    assert.equal((await call(handler, { method: 'POST', body: { op: 'create', name: '   ' }, pass: 'olive tree' })).status, 400);
  });
  console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
