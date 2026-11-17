const crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const TTL = 30 * 86400000;
const COOKIE = '__Host-workout_session';
const validRecord = key => /^(log:|workout:|exercise:|setting:|rehab:)/.test(key) && key.length <= 300;
const empty = () => ({ revision: 0, records: {} });

module.exports = function createHandler(db, password) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie');
    const reply = (code, data) => res.status(code).json(data);
    const cookie = value => res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${value ? TTL / 1000 : 0}`);
    try {
      if (!db.enabled || !password) return reply(503, { error: 'Account service is unavailable. Your workouts are still saved on this device.' });
      if (!['GET', 'POST'].includes(req.method)) return reply(405, { error: 'Method not allowed.' });
      if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `https://${req.headers.host}`) return reply(403, { error: 'Invalid request origin.' });
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (Buffer.byteLength(raw) > 1500000) return reply(413, { error: 'Too much workout data in one request.' });
      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch { return reply(400, { error: 'Invalid request.' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Invalid request.' });
      if (req.method === 'POST' && body.op === 'login') {
        const email = String(body.email || '').trim().toLowerCase();
        if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Enter a valid email address.' });
        const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0];
        const window = Math.floor(Date.now() / 900000);
        for (const [kind, identifier, max] of [['ip', ip, 40], ['email', email, 20]]) {
          const key = `workout:limit:${kind}:${sha(identifier)}:${window}`;
          const count = await db.get(key, 0);
          if (count >= max) return reply(429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
          await db.set(key, count + 1);
        }
        if (!crypto.timingSafeEqual(Buffer.from(sha(String(body.password || ''))), Buffer.from(sha(password)))) return reply(401, { error: 'Email or password is incorrect.' });
        const uid = sha(email);
        const user = { uid, email };
        const token = crypto.randomBytes(32).toString('hex');
        await db.set(`workout:user:${uid}`, user);
        await db.set(`workout:session:${sha(token)}`, { ...user, expires: Date.now() + TTL });
        cookie(token);
        return reply(200, { user });
      }
      const token = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
      const session = /^[a-f0-9]{64}$/.test(token || '') ? await db.get(`workout:session:${sha(token)}`, null) : null;
      if (!session || session.expires <= Date.now()) { cookie(''); return reply(401, { error: 'Sign in to sync your workouts.' }); }
      const user = { uid: session.uid, email: session.email };
      if (req.method === 'POST' && body.op === 'logout') {
        await db.set(`workout:session:${sha(token)}`, null); cookie(''); return reply(200, { ok: true });
      }
      const key = `workout:state:${session.uid}`;
      if (req.method === 'GET') return reply(200, { user, state: await db.get(key, null) || empty() });
      if (body.op !== 'sync' || !body.mutations || typeof body.mutations !== 'object' || Array.isArray(body.mutations)) return reply(400, { error: 'Invalid workout update.' });
      const mutations = Object.entries(body.mutations);
      if (mutations.length > 5000 || mutations.some(([k, v]) => !validRecord(k) || (v !== null && typeof v !== 'string') || (typeof v === 'string' && v.length > 100000))) return reply(400, { error: 'Invalid workout data.' });
      for (let attempt = 0; attempt < 8; attempt++) {
        const stored = await db.get(key, null);
        const state = stored || empty();
        const records = { ...state.records };
        for (const [k, v] of mutations) { if (v === null) delete records[k]; else records[k] = v; }
        const next = { revision: state.revision + 1, records, updated: new Date().toISOString() };
        if (Buffer.byteLength(JSON.stringify(next)) > 4000000) return reply(413, { error: 'This account has reached its workout storage limit.' });
        if (await db.compareSet(key, stored ? state.revision : null, next)) return reply(200, { user, state: next });
      }
      return reply(409, { error: 'Another device is saving. Try syncing again.' });
    } catch (error) {
      console.error('workout account request failed:', error.message);
      return reply(503, { error: 'Could not sync right now. Your edits are saved on this device.' });
    }
  };
};
