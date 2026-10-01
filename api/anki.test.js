// node api/anki.test.js — the flashcards sign-in: codes, cookie, progress.
// Runs against the in-memory store (no SUPABASE_URL) with email sending stubbed.
const assert = require('assert');
const Module = require('module');
const sent = [];
const realLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === './_lib/email') return { sendEmail: async (m) => { sent.push(m); return { id: 'x' }; } };
  return realLoad.call(this, request, parent, ...rest);
};
delete process.env.SUPABASE_URL;
process.env.ANKI_AUTH_SECRET = 'test-secret';
const handler = require('./anki');

function call(method, { body, cookie, query = '' } = {}) {
  return new Promise((resolve) => {
    const { Readable } = require('stream');
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = method; req.url = `/api/anki${query}`; req.headers = { cookie: cookie || '' };
    const headers = {};
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: (data) => resolve({ status: res.statusCode, headers, body: data ? JSON.parse(data) : null }) };
    handler(req, res);
  });
}

(async () => {
  const email = 'caroline@example.com';
  let r = await call('POST', { body: { action: 'send', email: 'Caroline@Example.com ' } });
  assert.equal(r.status, 200);
  const code = sent[0].subject.match(/\d{6}/)[0];
  assert.ok(sent[0].text.includes(code));

  r = await call('POST', { body: { action: 'send', email } });
  assert.equal(r.status, 429, 'a second code within a minute is refused');

  r = await call('POST', { body: { action: 'verify', email, code: code === '000000' ? '111111' : '000000' } });
  assert.equal(r.status, 400, 'a wrong code fails');

  r = await call('POST', { body: { action: 'verify', email, code } });
  assert.equal(r.status, 200);
  const cookie = r.headers['set-cookie'];
  assert.match(cookie, /anki_user=.+Max-Age=31536000.+HttpOnly|anki_user=.+HttpOnly.+Max-Age=31536000/, 'a year-long httpOnly cookie');
  const jar = cookie.split(';')[0];

  r = await call('POST', { body: { action: 'verify', email, code } });
  assert.equal(r.status, 400, 'a code works once');

  r = await call('GET', { cookie: jar, query: '?me=1' });
  assert.equal(r.body.email, email);
  r = await call('GET', { cookie: jar.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), query: '?me=1' });
  assert.equal(r.body.email, null, 'a tampered cookie is nobody');

  const progress = { v: 2, deck: 'greek', settings: {}, decks: { greek: { cards: { 'g1:fwd': { due: 1 } } } } };
  r = await call('POST', { cookie: jar, body: { action: 'save', progress } });
  assert.equal(r.status, 200);
  r = await call('GET', { cookie: jar, query: '?progress=1' });
  assert.deepEqual(r.body.progress.decks, progress.decks);
  r = await call('POST', { body: { action: 'save', progress } });
  assert.equal(r.status, 401, 'saving needs a signed-in person');

  process.env.ANKI_ALLOWED_EMAILS = 'sam@example.com';
  const before = sent.length;
  r = await call('POST', { body: { action: 'send', email: 'stranger@example.com' } });
  assert.equal(r.status, 200);
  assert.equal(sent.length, before, 'an address outside the list gets no email');

  r = await call('POST', { cookie: jar, body: { action: 'logout' } });
  assert.match(r.headers['set-cookie'], /Max-Age=0/);
  console.log('anki api: ok');
})().catch((e) => { console.error(e); process.exit(1); });
