// Charlotte's Grand Adventure — password-gated page + shared saved state.
//
// One function, three jobs (reached at /charlottes-grand-adventure via a
// vercel.json rewrite, and directly at /api/charlotte for data):
//   GET             -> the page if the cookie is good, else a login page
//   POST (form)     -> login; sets an httpOnly cookie and redirects back
//   GET  ?data=1    -> the shared state JSON            (cookie required)
//   PUT  ?data=1    -> merge {patches:{key:value}} in   (cookie required)
//
// State lives in the existing lineup_state kv table (key 'charlotte:state')
// through api/_lib/store.js. The password lives in CHARLOTTE_PASSWORD — no
// secrets in the repo. The page HTML is generated into api/_charlotte/page.js
// from ~/GDrive/personal/charlottes-grand-adventure/index.html; edit there and
// re-run the wrap step, never edit page.js by hand.

const crypto = require('crypto');
const store = require('./_lib/store');
const PAGE = require('./_charlotte/page.js');

const STATE_KEY = 'charlotte:state';
const COOKIE = 'cga_auth';
const MAX_BODY = 400000; // bytes
const MAX_VALUE = 20000; // chars per field

function password() {
  return (process.env.CHARLOTTE_PASSWORD || '').trim();
}

function token() {
  return crypto.createHash('sha256').update(password().toLowerCase() + '::cga').digest('hex');
}

function authed(req) {
  if (!password()) return false; // no password configured -> stay locked
  const header = req.headers.cookie || '';
  return header.split(';').some((pair) => {
    const i = pair.indexOf('=');
    return i > -1 && pair.slice(0, i).trim() === COOKIE && pair.slice(i + 1).trim() === token();
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
      if (b.length > MAX_BODY) req.destroy();
    });
    req.on('end', () => resolve(b));
    req.on('error', () => resolve(''));
  });
}

function sendJSON(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function sendHTML(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(html);
}

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Charlotte's Grand Adventure</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%230e1726'/%3E%3Cpath d='M38 10 L24 34 L31 34 L26 54 L42 28 L34 28 Z' fill='%23c9a227'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@600&family=IM+Fell+English:ital@1&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;
    background:
      radial-gradient(1px 1px at 18% 30%, #fff8 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 62% 20%, #ffec9e88 50%, transparent 51%),
      radial-gradient(1px 1px at 80% 55%, #fff6 50%, transparent 51%),
      radial-gradient(1px 1px at 35% 70%, #fff6 50%, transparent 51%),
      radial-gradient(ellipse at 50% 120%, #182338, #0e1726 70%);
    font-family:Georgia,serif;color:#f3ead1;text-align:center;
  }
  .door{max-width:420px;width:100%}
  .eyebrow{font-family:'IM Fell English',serif;font-style:italic;color:#cdbf98;font-size:1rem}
  h1{font-family:'Cinzel Decorative',serif;font-weight:900;font-size:clamp(1.6rem,6vw,2.2rem);color:#e7d38a;margin:.7rem 0 1.6rem;line-height:1.2;text-shadow:0 0 26px #c9a22744}
  label{display:block;font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:.26em;text-transform:uppercase;color:#b9a45f;margin-bottom:.7rem}
  input{
    width:100%;padding:.7em 1em;font-size:1.1rem;text-align:center;font-family:Georgia,serif;
    background:#f3e9d2;color:#2a1f12;border:2px solid #c9a227;border-radius:8px;
  }
  input:focus{outline:none;box-shadow:0 0 0 3px #c9a22755}
  button{
    margin-top:1rem;width:100%;padding:.75em;cursor:pointer;
    font-family:'Cinzel',serif;font-size:.85rem;letter-spacing:.22em;text-transform:uppercase;
    background:#7a1f23;color:#f7ecd8;border:none;border-radius:8px;
  }
  button:hover{background:#9c2b30}
  .err{margin-top:1rem;font-family:'IM Fell English',serif;font-style:italic;color:#e08b8b}
</style>
</head>
<body>
  <form class="door" method="POST">
    <p class="eyebrow">The door is locked</p>
    <h1>Charlotte's Grand Adventure</h1>
    <label for="password">Whisper the password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus>
    <button type="submit">Alohomora</button>
    ${error ? '<p class="err">The door didn’t budge. Try again.</p>' : ''}
  </form>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const wantsData = url.searchParams.get('data') === '1';

  if (wantsData) {
    if (!authed(req)) return sendJSON(res, 401, { error: 'locked' });

    if (req.method === 'GET') {
      const state = await store.getJSON(STATE_KEY, {});
      return sendJSON(res, 200, { state });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        return sendJSON(res, 400, { error: 'bad json' });
      }
      const patches = body && body.patches;
      if (!patches || typeof patches !== 'object' || Array.isArray(patches)) {
        return sendJSON(res, 400, { error: 'no patches' });
      }
      const state = await store.getJSON(STATE_KEY, {});
      for (const key of Object.keys(patches)) {
        if (key.length > 80) continue;
        const value = patches[key];
        if (value === null) delete state[key];
        else if (typeof value === 'string' && value.length <= MAX_VALUE) state[key] = value;
      }
      await store.setJSON(STATE_KEY, state);
      return sendJSON(res, 200, { ok: true });
    }

    return sendJSON(res, 405, { error: 'method' });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const form = new URLSearchParams(body);
    const given = String(form.get('password') || '').trim().toLowerCase();
    if (password() && given === password().toLowerCase()) {
      res.setHeader('Set-Cookie', `${COOKIE}=${token()}; HttpOnly; Path=/; Max-Age=15552000; SameSite=Lax; Secure`);
      res.statusCode = 303;
      res.setHeader('Location', '/charlottes-grand-adventure');
      return res.end();
    }
    return sendHTML(res, 401, loginPage(true));
  }

  if (!authed(req)) return sendHTML(res, 401, loginPage(false));
  return sendHTML(res, 200, PAGE);
};
