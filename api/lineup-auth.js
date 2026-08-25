// /lineup/auth — passwordless email (magic-link) sign-in for Lineup.
//
//   POST {action:'request', email}  -> emails a 15-min sign-in link
//   GET  ?token=...                 -> verifies, sets signed httpOnly cookie, -> /lineup/sf
//   GET  ?whoami=1                  -> {email|null}; ?hearts=1 -> {keys:[...]}
//   POST {action:'hearts', keys}    -> save signed-in user's hearts (cross-device)
//   POST {action:'logout'}          -> clears cookie
//
// Tokens + hearts live in the existing Supabase lineup_state table. Cookie is
// email + HMAC so it can't be forged without the server secret.

const crypto = require('crypto');
const { getJSON, setJSON } = require('./_lib/store');
const { sendEmail } = require('./_lib/email');

const SECRET = process.env.LINEUP_AUTH_SECRET || process.env.GMAIL_APP_PASSWORD || 'lineup-dev';
const sign = (e) => crypto.createHmac('sha256', SECRET).update(e).digest('hex').slice(0, 32);

function userFromCookie(req) {
  const m = (req.headers.cookie || '').match(/lineup_user=([^;]+)/);
  if (!m) return null;
  const [email, sig] = decodeURIComponent(m[1]).split('|');
  return email && sig === sign(email) ? email : null;
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' && url.searchParams.get('whoami')) return json(res, 200, { email: userFromCookie(req) });

  if (req.method === 'GET' && url.searchParams.get('hearts')) {
    const email = userFromCookie(req);
    if (!email) return json(res, 401, { keys: null });
    return json(res, 200, { keys: (await getJSON(`lineup:hearts:${email}`, [])) });
  }

  if (req.method === 'GET' && url.searchParams.get('token')) {
    const t = url.searchParams.get('token');
    const rec = await getJSON(`lineup:magic:${t}`, null);
    if (!rec || rec.exp < Date.now()) { res.statusCode = 200; return res.end('<p style="font-family:sans-serif">Link expired. <a href="/lineup/sf">Back to Lineup</a></p>'); }
    await setJSON(`lineup:magic:${t}`, null);
    const val = encodeURIComponent(`${rec.email}|${sign(rec.email)}`);
    res.setHeader('Set-Cookie', `lineup_user=${val}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
    res.statusCode = 302; res.setHeader('Location', '/lineup/sf'); return res.end();
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (body.action === 'request' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email || '')) {
      const t = crypto.randomBytes(24).toString('hex');
      await setJSON(`lineup:magic:${t}`, { email: body.email.toLowerCase(), exp: Date.now() + 15 * 60 * 1000 });
      const link = `https://samfinegold.me/lineup/auth?token=${t}`;
      await sendEmail({
        to: body.email, subject: 'Your Lineup sign-in link',
        html: `<p style="font-family:sans-serif;font-size:16px">Tap to sign in to Lineup:</p><p><a href="${link}" style="font-family:sans-serif;font-size:18px;font-weight:700;color:#3B7A5C">Sign in to Lineup &rarr;</a></p><p style="font-family:sans-serif;color:#888;font-size:13px">Link expires in 15 minutes. If you didn't request this, ignore it.</p>`,
        text: `Sign in to Lineup: ${link} (expires in 15 minutes)`,
      });
      return json(res, 200, { sent: true });
    }
    if (body.action === 'hearts') {
      const email = userFromCookie(req);
      if (!email) return json(res, 401, { ok: false });
      await setJSON(`lineup:hearts:${email}`, (body.keys || []).slice(0, 2000));
      return json(res, 200, { ok: true });
    }
    if (body.action === 'logout') {
      res.setHeader('Set-Cookie', 'lineup_user=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure');
      return json(res, 200, { ok: true });
    }
  }
  json(res, 400, { error: 'bad request' });
};
