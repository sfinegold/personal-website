// /api/anki — profiles for the flashcards: sign in with an emailed code, and
// keep each person's study progress on the server so it follows them.
//
//   POST {action:'send', email}          -> emails a 6-digit code (10 minutes)
//   POST {action:'verify', email, code}  -> sets a signed, year-long cookie
//   GET  ?me=1                           -> {email|null}
//   GET  ?progress=1                     -> {email, progress|null} for the signed-in person
//   POST {action:'save', progress}       -> stores it (the whole study state, ~tens of KB)
//   POST {action:'logout'}               -> clears the cookie
//
// Codes are stored hashed, expire after 10 minutes, allow 5 tries, and a new
// one can be sent at most once a minute and 6 times an hour per address.
// ANKI_ALLOWED_EMAILS (comma-separated), when set, limits who can sign in.
// The cookie is email + HMAC, so it cannot be forged without the secret.
// Everything lives in the site's existing Supabase lineup_state table.

const crypto = require('crypto');
const { getJSON, setJSON } = require('./_lib/store');
const { sendEmail } = require('./_lib/email');

const SECRET = process.env.ANKI_AUTH_SECRET || process.env.LINEUP_AUTH_SECRET || process.env.GMAIL_APP_PASSWORD || 'anki-dev';
const COOKIE = 'anki_user';
const YEAR = 365 * 24 * 3600;
const CODE_TTL = 10 * 60 * 1000;
const MAX_TRIES = 5;
const MAX_PROGRESS = 900000; // bytes of JSON

const sign = (email) => crypto.createHmac('sha256', SECRET).update(`anki:${email}`).digest('hex').slice(0, 32);
const hashCode = (email, code) => crypto.createHmac('sha256', SECRET).update(`code:${email}:${code}`).digest('hex');
const validEmail = (value) => typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim()) && value.length <= 200;
const keys = {
  code: (email) => `anki:code:${email}`,
  progress: (email) => `anki:progress:${email}`,
};

function userFromCookie(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)anki_user=([^;]+)/);
  if (!m) return null;
  const [email, sig] = decodeURIComponent(m[1]).split('|');
  if (!email || !sig) return null;
  const expected = sign(email);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? email : null;
}

function setCookie(res, value, maxAge) {
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`);
}

function allowed(email) {
  const list = (process.env.ANKI_ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(email);
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > MAX_PROGRESS + 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

async function sendCode(email) {
  const now = Date.now();
  const held = await getJSON(keys.code(email), null);
  const recent = (held && Array.isArray(held.sent) ? held.sent : []).filter((t) => now - t < 3600 * 1000);
  if (recent.length && now - recent[recent.length - 1] < 60 * 1000) return { error: 'A code was just sent. Check your email, or try again in a minute.', status: 429 };
  if (recent.length >= 6) return { error: 'Too many codes this hour. Try again later.', status: 429 };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await setJSON(keys.code(email), { hash: hashCode(email, code), exp: now + CODE_TTL, tries: 0, sent: [...recent, now] });
  await sendEmail({
    to: email,
    subject: `${code} is your flashcards code`,
    text: `Your code for Sam's flashcards is ${code}. It works for 10 minutes.\n\nIf you didn't ask for it, ignore this email.`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;color:#1b1b1f">
      <p>Your code for Sam's flashcards:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
      <p style="color:#666">It works for 10 minutes. If you didn't ask for it, ignore this email.</p></div>`,
  });
  return { ok: true };
}

async function verifyCode(email, code) {
  const held = await getJSON(keys.code(email), null);
  if (!held || !held.hash || held.exp < Date.now()) return { error: 'That code has expired. Send a new one.', status: 400 };
  if (held.tries >= MAX_TRIES) return { error: 'Too many wrong tries. Send a new code.', status: 429 };
  const given = hashCode(email, String(code || '').replace(/\D/g, ''));
  const ok = given.length === held.hash.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(held.hash));
  if (!ok) {
    await setJSON(keys.code(email), { ...held, tries: held.tries + 1 });
    return { error: 'That code is not right.', status: 400 };
  }
  // Used once: keep only the send history for the rate limit.
  await setJSON(keys.code(email), { sent: held.sent || [] });
  return { ok: true };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://x');

  try {
    if (req.method === 'GET') {
      const email = userFromCookie(req);
      if (url.searchParams.get('progress')) {
        if (!email) return json(res, 401, { email: null, progress: null });
        return json(res, 200, { email, progress: await getJSON(keys.progress(email), null) });
      }
      return json(res, 200, { email });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
    const body = await readBody(req);

    if (body.action === 'send') {
      if (!validEmail(body.email)) return json(res, 400, { error: 'Enter a real email address.' });
      const email = body.email.trim().toLowerCase();
      // Same answer whether or not the address may sign in, so the list can't be probed.
      if (!allowed(email)) return json(res, 200, { ok: true });
      const result = await sendCode(email);
      return json(res, result.status || 200, result);
    }

    if (body.action === 'verify') {
      if (!validEmail(body.email)) return json(res, 400, { error: 'Enter a real email address.' });
      const email = body.email.trim().toLowerCase();
      if (!allowed(email)) return json(res, 400, { error: 'That code is not right.' });
      const result = await verifyCode(email, body.code);
      if (!result.ok) return json(res, result.status, result);
      setCookie(res, encodeURIComponent(`${email}|${sign(email)}`), YEAR);
      return json(res, 200, { email, progress: await getJSON(keys.progress(email), null) });
    }

    if (body.action === 'save') {
      const email = userFromCookie(req);
      if (!email) return json(res, 401, { error: 'Signed out' });
      const progress = body.progress;
      if (!progress || typeof progress !== 'object' || progress.v !== 2) return json(res, 400, { error: 'bad progress' });
      if (JSON.stringify(progress).length > MAX_PROGRESS) return json(res, 413, { error: 'too large' });
      await setJSON(keys.progress(email), { ...progress, savedAt: new Date().toISOString() });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'logout') {
      setCookie(res, '', 0);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'unknown action' });
  } catch (error) {
    return json(res, 500, { error: 'Something went wrong. Try again.' });
  }
};

module.exports._test = { sign, hashCode, userFromCookie, allowed };
