// /api/outside-lands — shared picks for the Outside Lands planner, plus an
// Apple Music preview lookup.
//
// Storage reuses the existing lineup_state key/value table (see _lib/store.js),
// so there is nothing new to provision. Everything lives under one key.
//
//   GET  /api/outside-lands                -> { people: [...] }
//   GET  /api/outside-lands?preview=NAME   -> { previewUrl, artwork, track }
//   POST /api/outside-lands  { action, ... }
//        addPerson  { name }             -> creates a column
//        rename     { id, name }
//        remove     { id }
//        toggle     { id, setKey }       -> add/remove one set from a column
//
// Concurrency: friends edit different columns, so a read-modify-write of the
// whole document is fine here. Writes are small and rare.

const { getJSON, setJSON } = require('./_lib/store');

const KEY = 'outside_lands_2026';
const MAX_PEOPLE = 12;
const MAX_NAME = 24;

const blank = () => ({ people: [], updated: null });

function clean(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}
const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function load() {
  const s = (await getJSON(KEY, null)) || blank();
  if (!Array.isArray(s.people)) s.people = [];
  return s;
}
async function save(state) {
  state.updated = new Date().toISOString();
  await setJSON(KEY, state);
  return state;
}

// --- Apple Music / iTunes preview. Public endpoint, no key, 30-second clips. --
// Proxied server-side so the browser never hits a CORS wall.
async function preview(term) {
  const url =
    'https://itunes.apple.com/search?media=music&entity=musicTrack&limit=1&term=' +
    encodeURIComponent(term);
  const r = await fetch(url, { headers: { 'User-Agent': 'samfinegold.me/ol' } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const hit = j && j.results && j.results[0];
  if (!hit || !hit.previewUrl) return null;
  return {
    previewUrl: hit.previewUrl,
    artwork: (hit.artworkUrl100 || '').replace('100x100', '300x300'),
    track: hit.trackName,
    artist: hit.artistName,
    link: hit.trackViewUrl,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const term = req.query && req.query.preview;
      if (term) {
        const p = await preview(term);
        return res.status(200).json(p || { previewUrl: null });
      }
      return res.status(200).json(await load());
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const state = await load();
      const { action } = body;

      if (action === 'addPerson') {
        const name = clean(body.name) || 'Someone';
        if (state.people.length >= MAX_PEOPLE)
          return res.status(400).json({ error: 'That is enough columns.' });
        state.people.push({ id: newId(), name, picks: [] });
        return res.status(200).json(await save(state));
      }

      if (action === 'rename') {
        const p = state.people.find((x) => x.id === body.id);
        if (!p) return res.status(404).json({ error: 'No such column.' });
        p.name = clean(body.name) || p.name;
        return res.status(200).json(await save(state));
      }

      if (action === 'remove') {
        state.people = state.people.filter((x) => x.id !== body.id);
        return res.status(200).json(await save(state));
      }

      if (action === 'toggle') {
        const p = state.people.find((x) => x.id === body.id);
        if (!p) return res.status(404).json({ error: 'No such column.' });
        const k = String(body.setKey || '');
        if (!k) return res.status(400).json({ error: 'Missing set.' });
        p.picks = Array.isArray(p.picks) ? p.picks : [];
        p.picks = p.picks.includes(k)
          ? p.picks.filter((x) => x !== k)
          : p.picks.concat(k);
        return res.status(200).json(await save(state));
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
};
