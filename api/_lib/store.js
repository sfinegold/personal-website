// Lineup — persistence on Supabase (Postgres via its PostgREST HTTP API, no SDK).
//
// One tiny key/value table backs everything:
//
//   create table if not exists lineup_state (
//     key text primary key,
//     value jsonb,
//     updated_at timestamptz default now()
//   );
//
// Reached over REST from BOTH the local job and the Vercel admin:
//   SUPABASE_URL                 e.g. https://abcd.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service role key (server-side only; bypasses RLS)
//
// If those aren't set, we fall back to an in-process Map so code runs locally /
// in tests without a database.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const dbEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);
const TABLE = 'lineup_state';

const memory = new Map(); // fallback store

function headers(extra) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function getJSON(key, fallback = null) {
  if (!dbEnabled) return memory.has(key) ? memory.get(key) : fallback;
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}&select=value`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`supabase get ${res.status}`);
  const rows = await res.json();
  return rows.length && rows[0].value != null ? rows[0].value : fallback;
}

async function setJSON(key, value) {
  if (!dbEnabled) {
    memory.set(key, value);
    return;
  }
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`supabase set ${res.status}: ${detail.slice(0, 160)}`);
  }
}

// ---- domain helpers ---------------------------------------------------------

const sourcesKey = (id) => `lineup:sources:${id}`;
const logKey = (id) => `lineup:log:${id}`;
const curatedKey = (id) => `lineup:curated:${id}`;
const lastSentKey = (id) => `lineup:lastsent:${id}`;
const sentKeysKey = (id) => `lineup:sentkeys:${id}`;
const recommendationKey = (id) => `lineup:recommendation:${id}`;
const snapshotKey = (id) => `lineup:snapshot:${id}`;

// Live source list = seed defaults overlaid with stored edits.
async function loadSourceEdits(id) {
  return getJSON(sourcesKey(id), { overrides: {}, added: [], removed: [] });
}
async function saveSourceEdits(id, edits) {
  await setJSON(sourcesKey(id), edits);
}

function mergeSources(seed, edits) {
  const removed = new Set(edits.removed || []);
  const overrides = edits.overrides || {};
  const base = seed.filter((s) => !removed.has(s.id)).map((s) => ({ ...s, ...(overrides[s.id] || {}) }));
  const added = (edits.added || []).map((s) => ({ ...s, ...(overrides[s.id] || {}) }));
  return [...base, ...added];
}

// Curated events written by the Claude curation routine (for JS-rendered venues
// deterministic parsing can't read). Merged into the event pool at run time.
async function getCurated(id) {
  const data = await getJSON(curatedKey(id), { events: [], at: null });
  return data.events || [];
}
async function setCurated(id, events) {
  await setJSON(curatedKey(id), { events, at: new Date().toISOString() });
}

async function appendLog(id, entry, keep = 20) {
  const log = await getJSON(logKey(id), []);
  log.unshift(entry);
  await setJSON(logKey(id), log.slice(0, keep));
}
async function getLog(id) {
  return getJSON(logKey(id), []);
}

// Send guard so the schedule-aware local job sends at most once per send-day.
async function getLastSent(id) {
  return getJSON(lastSentKey(id), null);
}
async function setLastSent(id, ymd) {
  await setJSON(lastSentKey(id), ymd);
}

// Event keys included in the last real digest — used to flag "newly added".
// null means no digest has been sent yet (so nothing is flagged new the first time).
async function getSentKeys(id) {
  return getJSON(sentKeysKey(id), null);
}
async function setSentKeys(id, keys) {
  await setJSON(sentKeysKey(id), keys);
}

// "Judge" paragraph written by the weekly Claude curation session — a short
// write-up of the single best pick, rendered at the top of the digest.
async function getRecommendation(id) {
  return getJSON(recommendationKey(id), null); // { paragraph, at } | null
}
async function setRecommendation(id, paragraph) {
  await setJSON(recommendationKey(id), paragraph ? { paragraph, at: new Date().toISOString() } : null);
}

// Snapshot of the last computed digest — read by the web "listen" view so it
// never has to re-crawl. Written by the engine on every run.
async function getSnapshot(id) {
  return getJSON(snapshotKey(id), null);
}
async function setSnapshot(id, snap) {
  await setJSON(snapshotKey(id), snap);
}

module.exports = {
  dbEnabled,
  getJSON,
  setJSON,
  loadSourceEdits,
  saveSourceEdits,
  mergeSources,
  getCurated,
  setCurated,
  appendLog,
  getLog,
  getLastSent,
  setLastSent,
  getSentKeys,
  setSentKeys,
  getRecommendation,
  setRecommendation,
  getSnapshot,
  setSnapshot,
};
