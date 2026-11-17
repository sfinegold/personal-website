const { getJSON, setJSON, dbEnabled } = require('../_lib/store');
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const headers = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
// Compare-and-swap prevents simultaneous device saves from discarding each other.
async function compareSet(key, revision, value) {
  const endpoint = `${url}/rest/v1/lineup_state`;
  const response = revision === null
    ? await fetch(endpoint, { method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) })
    : await fetch(`${endpoint}?key=eq.${encodeURIComponent(key)}&value->>revision=eq.${revision}`, { method: 'PATCH', headers, body: JSON.stringify({ value, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error('Workout storage unavailable');
  return (await response.json()).length > 0;
}
module.exports = { get: getJSON, set: setJSON, compareSet, enabled: dbEnabled };
