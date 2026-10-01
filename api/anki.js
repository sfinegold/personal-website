// /api/anki — synced progress for the flashcards at /anki, per named profile.
//
// Storage reuses the lineup_state key/value table (see _lib/store.js):
//   anki:profiles        -> [{ id, name, created, updated }]
//   anki:state:<id>      -> { v:2, updated, settings, decks, streak, deck }
//
// Auth: one shared passphrase, ANKI_PASSPHRASE, sent as the x-anki-pass header.
// Without it (or without Supabase) the function answers 503 and the page keeps
// working from local storage.
//
//   GET  /api/anki?op=profiles              -> { profiles: [...] }
//   GET  /api/anki?op=state&profile=ID      -> the document (empty one if none)
//   POST /api/anki  { op:'create', name }   -> { profile }
//   POST /api/anki  { op:'save', profile, state } -> the merged document
//
// Saves merge with what is stored (anki/merge.js), so two devices never
// overwrite each other: per card the later answer wins.

const crypto = require('crypto');
const { getJSON, setJSON, dbEnabled } = require('./_lib/store');
const { mergeState } = require('../anki/merge');

const PROFILES_KEY = 'anki:profiles';
const stateKey = (id) => 'anki:state:' + id;
const MAX_BODY = 1500000;
const MAX_NAME = 24;
const MAX_PROFILES = 20;

function passphrase() { return (process.env.ANKI_PASSPHRASE || '').trim(); }
function authed(req) {
  const p = passphrase();
  const given = String((req.headers && (req.headers['x-anki-pass'] || req.headers['X-Anki-Pass'])) || '').trim();
  if (!p || given.length !== p.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(p));
}
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
const slug = (s) => cleanName(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'profile';
const newId = (name) => slug(name) + '-' + Math.random().toString(36).slice(2, 7);
const emptyDoc = () => ({ v: 2, updated: null, settings: null, decks: {} });

async function profiles() {
  const list = await getJSON(PROFILES_KEY, []);
  return Array.isArray(list) ? list : [];
}
function validDoc(doc) {
  return doc && typeof doc === 'object' && doc.v === 2 && doc.decks && typeof doc.decks === 'object' && !Array.isArray(doc.decks);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!passphrase()) return res.status(503).json({ error: 'Sync is not configured on the server: set ANKI_PASSPHRASE in Vercel.' });
    if (!dbEnabled && !process.env.ANKI_ALLOW_MEMORY) return res.status(503).json({ error: 'Sync is not configured on the server: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing.' });
    if (!authed(req)) return res.status(401).json({ error: 'Wrong passphrase.' });

    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.op === 'profiles') return res.status(200).json({ profiles: await profiles() });
      if (q.op === 'state') {
        const id = String(q.profile || '');
        const list = await profiles();
        if (!list.some((p) => p.id === id)) return res.status(404).json({ error: 'No such profile.' });
        const doc = await getJSON(stateKey(id), null);
        return res.status(200).json(validDoc(doc) ? doc : emptyDoc());
      }
      return res.status(400).json({ error: 'Unknown op.' });
    }

    if (req.method === 'POST') {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (raw.length > MAX_BODY) return res.status(413).json({ error: 'Too large.' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

      if (body.op === 'create') {
        const name = cleanName(body.name);
        if (!name) return res.status(400).json({ error: 'Name required.' });
        const list = await profiles();
        if (list.length >= MAX_PROFILES) return res.status(400).json({ error: 'Too many profiles.' });
        const profile = { id: newId(name), name, created: new Date().toISOString(), updated: null };
        list.push(profile);
        await setJSON(PROFILES_KEY, list);
        await setJSON(stateKey(profile.id), emptyDoc());
        return res.status(200).json({ profile });
      }

      if (body.op === 'save') {
        const id = String(body.profile || '');
        const list = await profiles();
        const profile = list.find((p) => p.id === id);
        if (!profile) return res.status(404).json({ error: 'No such profile.' });
        if (!validDoc(body.state)) return res.status(400).json({ error: 'Bad state document.' });
        const stored = await getJSON(stateKey(id), null);
        const merged = mergeState(validDoc(stored) ? stored : emptyDoc(), body.state);
        merged.updated = new Date().toISOString();
        Object.keys(merged.decks).forEach((d) => { merged.decks[d].undo = []; });   // undo never travels
        await setJSON(stateKey(id), merged);
        profile.updated = merged.updated;
        await setJSON(PROFILES_KEY, list);
        return res.status(200).json(merged);
      }

      return res.status(400).json({ error: 'Unknown op.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
};
