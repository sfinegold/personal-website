// /api/anki — synced flashcard progress, one account per email address.
//
// Sign-in: the person enters their email, gets a 6-digit code by email, and
// exchanges it for a session token (header x-anki-token). Everything else is
// per account: the progress document and a display name.
//
// Storage reuses the lineup_state key/value table (see _lib/store.js):
//   anki:code:<uid>       { hash, exp, tries, sentAt }   one pending code
//   anki:session:<token>  { uid, email, created }
//   anki:user:<uid>       { uid, email, name, created, updated }
//   anki:state:<uid>      { v:2, updated, settings, decks, streak, deck }
// uid = 'u' + sha256(lowercased email)[0..16], so keys never carry the address.
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (storage), RESEND_API_KEY or
// GMAIL_USER + GMAIL_APP_PASSWORD (the code email, via _lib/email.js), optional
// ANKI_FROM (sender, default "Flashcards <flashcards@samfinegold.me>"),
// optional ANKI_ALLOWED_EMAILS: comma-separated list; when set, only those
// addresses can sign in (others get the same neutral reply).
//
//   POST { op:'request', email }        -> { ok:true, isNew }  code sent (or neutral); isNew = no account yet
//   POST { op:'verify', email, code, first?, last? } -> { token, user }   a new account needs first and last name
//   GET  ?op=me                         -> { user }
//   GET  ?op=state                      -> the document (empty one if none)
//   POST { op:'save', state }           -> the merged document
//   POST { op:'rename', name }          -> { user }
//   POST { op:'signout' }               -> { ok:true }
//   POST { op:'draft', deck:{meta}, text, examples, tags } -> { note }      Claude drafts one card
//   POST { op:'draftDeck', text }       -> { meta, notes }                 Claude drafts a new deck
// Saves merge with what is stored (anki/merge.js): per card the later answer wins.
// Drafting needs ANTHROPIC_API_KEY and a signed-in account; DRAFTS_PER_DAY caps each account.

const crypto = require('crypto');
const { getJSON, setJSON, dbEnabled } = require('./_lib/store');
const { sendEmail, transport } = require('./_lib/email');
const { mergeState } = require('../anki/merge');
const draft = require('./_lib/draft');

const MAX_BODY = 1500000;
const MAX_NAME = 24;
const CODE_TTL = 10 * 60 * 1000;
const CODE_COOLDOWN = 45 * 1000;
const CODE_TRIES = 5;
const SESSION_TTL = 365 * 86400000;
const DRAFTS_PER_DAY = 80;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
const uidOf = (email) => 'u' + sha(email).slice(0, 16);
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
const emptyDoc = () => ({ v: 2, updated: null, settings: null, decks: {} });
const now = () => Date.now();
const kCode = (uid) => 'anki:code:' + uid;
const kSession = (t) => 'anki:session:' + t;
const kUser = (uid) => 'anki:user:' + uid;
const kState = (uid) => 'anki:state:' + uid;
const kQuota = (uid) => 'anki:quota:' + uid + ':' + new Date().toISOString().slice(0, 10);

function allowed(email) {
  const list = (process.env.ANKI_ALLOWED_EMAILS || '').split(',').map(normEmail).filter(Boolean);
  return !list.length || list.includes(email);
}
function validDoc(doc) {
  return doc && typeof doc === 'object' && doc.v === 2 && doc.decks && typeof doc.decks === 'object' && !Array.isArray(doc.decks);
}
async function session(req) {
  const token = String((req.headers && req.headers['x-anki-token']) || '').trim();
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const s = await getJSON(kSession(token), null);
  if (!s || !s.uid || (s.created && now() - Date.parse(s.created) > SESSION_TTL)) return null;
  s.token = token;
  return s;
}
const publicUser = (u) => ({ uid: u.uid, email: u.email, name: u.name, first: u.first || '', last: u.last || '', updated: u.updated || null });

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!dbEnabled && !process.env.ANKI_ALLOW_MEMORY) return res.status(503).json({ error: 'Sync is not configured on the server: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing.' });

    if (req.method === 'POST') {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (raw.length > MAX_BODY) return res.status(413).json({ error: 'Too large.' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

      if (body.op === 'request') {
        const email = normEmail(body.email);
        if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
        if (!transport() && !process.env.ANKI_ALLOW_MEMORY) return res.status(503).json({ error: 'Sign-in email is not configured on the server (RESEND_API_KEY, or GMAIL_USER and GMAIL_APP_PASSWORD).' });
        const neutral = { ok: true, message: 'If that address can sign in, a code is on its way.', isNew: true };
        if (!allowed(email)) return res.status(200).json(neutral);
        const uid = uidOf(email);
        neutral.isNew = !(await getJSON(kUser(uid), null));
        const pending = await getJSON(kCode(uid), null);
        if (pending && now() - pending.sentAt < CODE_COOLDOWN) return res.status(429).json({ error: 'A code was just sent. Wait a minute and try again.' });
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        await setJSON(kCode(uid), { hash: sha(code + ':' + uid), exp: now() + CODE_TTL, tries: 0, sentAt: now() });
        if (process.env.ANKI_ALLOW_MEMORY && process.env.ANKI_ECHO_CODE) return res.status(200).json({ ok: true, code });
        try {
          await sendEmail({
            to: email,
            from: process.env.ANKI_FROM || 'Flashcards <flashcards@samfinegold.me>',
            subject: code + ' is your Flashcards code',
            text: 'Your sign-in code is ' + code + '. It works for 10 minutes.\n\nIf you did not ask for it, ignore this email.',
            html: '<p style="font:16px Helvetica,Arial,sans-serif">Your Flashcards sign-in code is</p><p style="font:700 32px Helvetica,Arial,sans-serif;letter-spacing:.2em">' + code + '</p><p style="font:14px Helvetica,Arial,sans-serif;color:#666">It works for 10 minutes. If you did not ask for it, ignore this email.</p>',
          });
        } catch (err) {
          console.error('anki: code email failed', err && err.code, err && err.message, err && err.detail);
          await setJSON(kCode(uid), { hash: '', exp: 0, tries: CODE_TRIES, sentAt: 0 });   // no cooldown on a failed send
          const msg = err && err.code === 'EAUTH' ? 'The server\'s email password was rejected. Sam needs to fix GMAIL_APP_PASSWORD or set RESEND_API_KEY in Vercel.'
            : err && err.code === 'RESEND' && err.status >= 400 && err.status < 500 ? 'Email is not set up on the server yet: ' + err.message
            : 'The sign-in email could not be sent right now. Try again in a minute.';
          return res.status(502).json({ error: msg });
        }
        return res.status(200).json(neutral);
      }

      if (body.op === 'verify') {
        const email = normEmail(body.email), code = String(body.code || '').replace(/\D/g, '');
        if (!validEmail(email) || code.length !== 6) return res.status(400).json({ error: 'Enter the 6-digit code.' });
        const uid = uidOf(email);
        const pending = await getJSON(kCode(uid), null);
        if (!pending || now() > pending.exp) return res.status(401).json({ error: 'That code has expired. Request a new one.' });
        if (pending.tries >= CODE_TRIES) return res.status(401).json({ error: 'Too many tries. Request a new code.' });
        const ok = crypto.timingSafeEqual(Buffer.from(pending.hash), Buffer.from(sha(code + ':' + uid)));
        if (!ok) { pending.tries += 1; await setJSON(kCode(uid), pending); return res.status(401).json({ error: 'That code is not right.' }); }
        let user = await getJSON(kUser(uid), null);
        const first = cleanName(body.first), last = cleanName(body.last);
        // A new account needs a name. The code stays valid, so the person can add the name and try again.
        if (!user && (!first || !last)) return res.status(400).json({ error: 'Enter your first and last name to create your account.', needName: true });
        await setJSON(kCode(uid), { hash: '', exp: 0, tries: CODE_TRIES, sentAt: pending.sentAt });   // single use
        if (!user) {
          user = { uid, email, first, last, name: first, created: new Date().toISOString(), updated: null };
          await setJSON(kUser(uid), user);
          await setJSON(kState(uid), emptyDoc());
        }
        const token = crypto.randomBytes(24).toString('hex');
        await setJSON(kSession(token), { uid, email, created: new Date().toISOString() });
        return res.status(200).json({ token, user: publicUser(user) });
      }

      const s = await session(req);
      if (!s) return res.status(401).json({ error: 'Please sign in.' });

      if (body.op === 'save') {
        if (!validDoc(body.state)) return res.status(400).json({ error: 'Bad state document.' });
        const stored = await getJSON(kState(s.uid), null);
        const merged = mergeState(validDoc(stored) ? stored : emptyDoc(), body.state);
        merged.updated = new Date().toISOString();
        Object.keys(merged.decks).forEach((d) => { merged.decks[d].undo = []; });
        await setJSON(kState(s.uid), merged);
        const user = await getJSON(kUser(s.uid), null);
        if (user) { user.updated = merged.updated; await setJSON(kUser(s.uid), user); }
        return res.status(200).json(merged);
      }
      if (body.op === 'rename') {
        const name = cleanName(body.name);
        if (!name) return res.status(400).json({ error: 'Name required.' });
        const user = await getJSON(kUser(s.uid), null);
        if (!user) return res.status(404).json({ error: 'No such account.' });
        user.name = name; await setJSON(kUser(s.uid), user);
        return res.status(200).json({ user: publicUser(user) });
      }
      if (body.op === 'draft' || body.op === 'draftDeck') {
        const used = (await getJSON(kQuota(s.uid), null)) || { n: 0 };
        if (used.n >= DRAFTS_PER_DAY) return res.status(429).json({ error: 'Daily drafting limit reached (' + DRAFTS_PER_DAY + '). Try again tomorrow.' });
        await setJSON(kQuota(s.uid), { n: used.n + 1 });
        try {
          if (body.op === 'draft') {
            const note = await draft.draftCard({ meta: body.deck && typeof body.deck === 'object' ? body.deck : {}, input: body.text, examples: body.examples, tags: body.tags });
            return res.status(200).json({ note, left: DRAFTS_PER_DAY - used.n - 1 });
          }
          const d = await draft.draftDeck({ input: body.text });
          return res.status(200).json({ meta: d.meta, notes: d.notes, left: DRAFTS_PER_DAY - used.n - 1 });
        } catch (e) {
          return res.status(e.status || 500).json({ error: e.message });
        }
      }
      if (body.op === 'signout') {
        await setJSON(kSession(s.token), { uid: '', email: '', created: '1970-01-01T00:00:00Z' });
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'Unknown op.' });
    }

    if (req.method === 'GET') {
      const q = req.query || {};
      const s = await session(req);
      if (!s) return res.status(401).json({ error: 'Please sign in.' });
      if (q.op === 'me') {
        const user = await getJSON(kUser(s.uid), null);
        return user ? res.status(200).json({ user: publicUser(user) }) : res.status(404).json({ error: 'No such account.' });
      }
      if (q.op === 'state') {
        const doc = await getJSON(kState(s.uid), null);
        return res.status(200).json(validDoc(doc) ? doc : emptyDoc());
      }
      return res.status(400).json({ error: 'Unknown op.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
};
