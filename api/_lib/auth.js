// Lineup — shared password gate, mirroring the milton-finance-review pattern:
// a password-only login issues an httpOnly cookie; the token is derived from the
// password (kept in an env var), so nothing sensitive is committed to the repo.
// If a profile has no password env set, its page is open (fine for Milton).

const crypto = require('crypto');

function tokenFor(password) {
  return crypto.createHash('sha256').update(`${password}::lineup`).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

// Read a urlencoded POST body into an object.
function readForm(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
      if (b.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      const params = new URLSearchParams(b);
      const obj = {};
      for (const [k, v] of params) obj[k] = v;
      resolve(obj);
    });
    req.on('error', () => resolve({}));
  });
}

function isAuthed(req, cookieName, password) {
  if (!password) return true; // no gate configured
  const cookies = parseCookies(req);
  return cookies[cookieName] === tokenFor(password);
}

function setAuthCookie(res, cookieName, password) {
  const val = tokenFor(password);
  res.setHeader('Set-Cookie', `${cookieName}=${val}; HttpOnly; Path=/lineup; Max-Age=2592000; SameSite=Lax; Secure`);
}

function loginPage(title, error) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head>
  <body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f4f5;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
    <form method="POST" style="background:#fff;padding:32px;border-radius:12px;min-width:300px;box-shadow:0 1px 4px rgba(0,0,0,.08);">
      <div style="font-size:22px;font-weight:800;margin-bottom:4px;">${title}</div>
      <div style="color:#777;font-size:14px;margin-bottom:16px;">Enter password to continue</div>
      ${error ? `<div style="color:#b91c1c;font-size:14px;margin-bottom:10px;">${error}</div>` : ''}
      <input type="hidden" name="action" value="login">
      <input type="password" name="password" autofocus style="width:100%;padding:10px;font-size:16px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box;">
      <button type="submit" style="margin-top:14px;width:100%;padding:10px;font-size:16px;font-weight:600;color:#fff;background:#7c3aed;border:none;border-radius:8px;cursor:pointer;">Enter</button>
    </form>
  </body></html>`;
}

module.exports = { tokenFor, parseCookies, readForm, isAuthed, setAuthCookie, loginPage };
