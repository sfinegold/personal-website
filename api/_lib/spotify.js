// Spotify — just enough of the Web API to turn a lineup into a playlist.
//
// Everything here runs as ONE user: the site owner. Spotify's Development Mode
// allows 5 authorised users per app (each added by hand in the dashboard, and
// the owner needs Premium), and Extended Quota Mode now wants a registered
// business with 250k monthly actives. Per-friend export is therefore off the
// table. Instead the owner authorises once, and every friend's picks become a
// public playlist in the owner's library that anyone can open or follow.
//
// Two more Development Mode constraints shape the code below:
//   * GET /artists/{id}/top-tracks was removed in Feb 2026, so an artist's
//     songs have to come from /search instead.
//   * /search returns at most 10 results per call (was 50).
//
// Env:
//   SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET   from the developer dashboard
// Stored in lineup_state:
//   spotify:auth          { refresh_token }     written once by /api/spotify-auth
//   spotify:artist:<slug> resolved tracks, or { miss:true } — cached forever,
//                         so the ~132 lineup artists are looked up once ever.

const { getJSON, setJSON } = require('./store');

const API = 'https://api.spotify.com/v1';
const AUTH_KEY = 'spotify:auth';
const TRACKS_PER_ARTIST = 2;
const SEARCH_LIMIT = 10; // Development Mode ceiling

// Names in the lineup that need a decision made for them. Keys are lowercased
// billings; the value is what to search for, or null to skip the act.
// Anything not listed goes through the generic cleanup below.
const OVERRIDES = {
  'surprise guest': null,
  'open mic hosted by rainbow girls': null,
  'hot goth freak show': null,
  'dj hopeless & hot goth pole show': null,
  'the emo night tour': null,
  'bingo loco': null,
  'romy (dj set)': 'Romy',
  'frost children (dj set)': 'Frost Children',
  'rio kosta (dj set)': 'RIO KOSTA',
  'odd mob & omnom present hyperbeam': 'ODD MOB',
  '¥øu$uk€ ¥uk1mat$u': 'Yousuke Yukimatsu',
  // Themed nights. The half after the colon is a host or resident DJ, mostly
  // not on Spotify, and searching it lands on unrelated artists — "Diva Pop"
  // and "UK Garage & House" are genres, not acts.
  'bootie mashup: diva pop w/ dj tyme': null,
  'bootie mashup: hip hop fuego w/ dj airsun': null,
  'help me lose my mind: uk garage & house w/ mphd': 'MPHD',
  "out tonight: a musical singalong feat. d'arcy drollinger": null,
  'oasis dj set: beverly chills': null,
  'oasis dj set: dj ion the prize': null,
  'princess dj set: dj ion the prize': null,
  'princess w/ tito soto feat. lydia b kollins': null,
  'reparations w/ dj newoncé': null,
  'reparations w/ nicki jizz feat. kori king': null,
};

const slug = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const fold = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

// Turn a billing into something worth searching for, or null to skip the act.
// Deliberately conservative: a wrong guess puts a stranger's song in someone's
// playlist, which is worse than an act being missing and reported as missing.
function searchName(raw) {
  const key = String(raw).toLowerCase().trim();
  if (Object.prototype.hasOwnProperty.call(OVERRIDES, key)) return OVERRIDES[key];
  // A colon in this lineup always introduces a themed night rather than an
  // artist ("Bootie Mashup: …", "OASIS DJ Set: …"). Without an entry above,
  // there is nothing safe to search for.
  if (key.includes(':')) return null;
  const n = String(raw)
    .replace(/\s*\((dj set|live|b2b)[^)]*\)\s*/gi, ' ')
    .replace(/\s+(w\/|with|feat\.?|featuring|presents?|hosted by)\s+.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return n.length >= 2 ? n : null;
}

/* ---------------- auth ---------------- */

function basic() {
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set');
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

// Refresh tokens don't expire, access tokens last an hour. Nothing is cached
// across invocations because serverless containers come and go; one extra round
// trip per export is cheap.
async function accessToken() {
  const saved = await getJSON(AUTH_KEY, null);
  if (!saved || !saved.refresh_token) {
    const e = new Error('Spotify is not connected yet.');
    e.needsAuth = true;
    throw e;
  }
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refresh_token }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    const e = new Error(`Spotify refresh failed: ${j.error_description || j.error || res.status}`);
    e.needsAuth = res.status === 400;
    throw e;
  }
  // Spotify occasionally hands back a rotated refresh token; keep it if so.
  if (j.refresh_token && j.refresh_token !== saved.refresh_token) {
    await setJSON(AUTH_KEY, { ...saved, refresh_token: j.refresh_token });
  }
  return j.access_token;
}

async function api(token, path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const quota = body && body.error && body.error.reason === 'QUOTA_EXCEEDED';
    throw new Error(quota ? 'Spotify daily quota exceeded — try again tomorrow.'
                          : `Spotify rate limited; retry after ${res.headers.get('retry-after') || '?'}s`);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Spotify ${init.method || 'GET'} ${path} -> ${res.status} ${t.slice(0, 140)}`);
  }
  return res.status === 204 ? null : res.json();
}

/* ---------------- artist -> tracks ---------------- */

// Resolved once per artist and cached in Supabase. Returns an array of track
// URIs (possibly empty) — an empty result is cached too, so a name that isn't
// on Spotify doesn't cost a search on every future export.
async function tracksFor(token, artist) {
  const key = 'spotify:artist:' + slug(artist);
  const hit = await getJSON(key, null);
  if (hit) return hit;

  const q = searchName(artist);
  if (!q) {
    const miss = { name: artist, uris: [], reason: 'not a recording artist' };
    await setJSON(key, miss);
    return miss;
  }

  // Field-qualified first — it is far less likely to return a cover band or a
  // song that merely has the artist's name in its title.
  let found = await searchTracks(token, `artist:"${q}"`, q);
  if (!found.length) found = await searchTracks(token, q, q);

  const out = { name: artist, query: q, uris: found.slice(0, TRACKS_PER_ARTIST).map((t) => t.uri) };
  if (!out.uris.length) out.reason = 'no match on Spotify';
  await setJSON(key, out);
  return out;
}

async function searchTracks(token, q, wanted) {
  const j = await api(token,
    `/search?type=track&limit=${SEARCH_LIMIT}&market=US&q=${encodeURIComponent(q)}`);
  const items = (j && j.tracks && j.tracks.items) || [];
  const want = fold(wanted);
  // Search is roughly popularity-ordered, so keeping order gives us the
  // best-known songs without the top-tracks endpoint.
  return items.filter((t) =>
    (t.artists || []).some((a) => {
      const got = fold(a.name);
      return got === want || got.includes(want) || want.includes(got);
    }));
}

/* ---------------- playlist ---------------- */

async function syncPlaylist(token, { playlistId, name, description, uris }) {
  let id = playlistId;
  if (id) {
    // Confirm it still exists — the owner may have deleted it by hand.
    try { await api(token, `/playlists/${id}?fields=id`); }
    catch { id = null; }
  }
  if (!id) {
    const made = await api(token, '/me/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, description, public: true }),
    });
    id = made.id;
  } else {
    await api(token, `/playlists/${id}`, {
      method: 'PUT', body: JSON.stringify({ name, description }),
    });
  }
  // PUT replaces the whole list, so re-exporting mirrors the current picks
  // rather than piling duplicates on. 100 URIs max per call.
  await api(token, `/playlists/${id}/items`, {
    method: 'PUT', body: JSON.stringify({ uris: uris.slice(0, 100) }),
  });
  for (let i = 100; i < uris.length; i += 100) {
    await api(token, `/playlists/${id}/items`, {
      method: 'POST', body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
  return { id, url: `https://open.spotify.com/playlist/${id}` };
}

module.exports = { accessToken, tracksFor, syncPlaylist, searchName, slug };
