// node api/_lib/email.test.js — transport choice and the Resend request, with fetch stubbed.
'use strict';
const assert = require('node:assert/strict');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e.message || e)); } }
function fresh() { delete require.cache[require.resolve('./email')]; return require('./email'); }

(async () => {
  await test('transport: Resend wins when its key is set, Gmail otherwise, none without either', () => {
    process.env.RESEND_API_KEY = 're_x'; process.env.GMAIL_USER = 'a@b.c'; process.env.GMAIL_APP_PASSWORD = 'p';
    assert.equal(fresh().transport(), 'resend');
    delete process.env.RESEND_API_KEY;
    assert.equal(fresh().transport(), 'gmail');
    delete process.env.GMAIL_USER;
    assert.equal(fresh().transport(), null);
  });
  await test('parseFrom splits a display name from the address', () => {
    const { parseFrom } = fresh();
    assert.deepEqual(parseFrom('Flashcards <flashcards@samfinegold.me>'), { name: 'Flashcards', addr: 'flashcards@samfinegold.me' });
    assert.deepEqual(parseFrom('x@y.z'), { name: '', addr: 'x@y.z' });
  });
  await test('resend: posts from/to/subject with the key; an API error becomes a short message with code RESEND', async () => {
    process.env.RESEND_API_KEY = 're_x'; delete process.env.GMAIL_USER;
    const calls = [];
    const realFetch = global.fetch;
    global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ id: 'em_1' }) }; };
    try {
      const { sendEmail } = fresh();
      const r = await sendEmail({ to: 'sam@example.com', subject: 'hi', text: 't', html: '<p>t</p>', from: 'Flashcards <flashcards@samfinegold.me>' });
      assert.equal(r.transport, 'resend'); assert.equal(r.id, 'em_1');
      assert.equal(calls[0].url, 'https://api.resend.com/emails');
      assert.equal(calls[0].opts.headers.Authorization, 'Bearer re_x');
      const body = JSON.parse(calls[0].opts.body);
      assert.equal(body.from, 'Flashcards <flashcards@samfinegold.me>'); assert.equal(body.to, 'sam@example.com'); assert.equal(body.subject, 'hi');
      const r2 = await sendEmail({ to: 'sam@example.com', subject: 'hi', text: 't' });
      assert.equal(JSON.parse(calls[1].opts.body).from, 'Lineup <lineup@samfinegold.me>', 'default sender');
      global.fetch = async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ statusCode: 403, message: 'The samfinegold.me domain is not verified.' }) });
      await assert.rejects(sendEmail({ to: 'sam@example.com', subject: 'hi', text: 't' }), (e) => e.code === 'RESEND' && e.status === 403 && /not verified/.test(e.message));
    } finally { global.fetch = realFetch; }
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
