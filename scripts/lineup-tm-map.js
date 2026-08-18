#!/usr/bin/env node
// One-time (rerunnable) mapper: resolve Ticketmaster venue IDs for our Bay Area
// venue list and tag TM-served venues with adapter:'ticketmaster'. Writes
// tmVenueId into api/_lib/venues/bayarea.json. Safe to rerun; only fills gaps.
//
//   node scripts/lineup-tm-map.js          # resolve + tag dark venues with events
//   node scripts/lineup-tm-map.js --all    # also tag venues that already work

const fs = require('fs');
const path = require('path');
const LIB = path.join(__dirname, '..', 'api', '_lib');
require(path.join(LIB, 'loadenv.js')).loadEnv();

const KEY = process.env.TICKETMASTER_API_KEY;
if (!KEY) { console.error('TICKETMASTER_API_KEY not set'); process.exit(1); }

const FILE = path.join(LIB, 'venues', 'bayarea.json');
const venues = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const BAY_CITIES = new Set(['san francisco', 'oakland', 'berkeley', 'daly city', 'mountain view', 'saratoga', 'san jose', 'santa clara', 'stanford', 'redwood city', 'menlo park', 'santa cruz', 'felton', 'mill valley', 'san rafael', 'novato', 'nicasio', 'bolinas', 'emeryville', 'sausalito'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

async function tm(pathq) {
  const res = await fetch(`https://app.ticketmaster.com/discovery/v2/${pathq}&apikey=${KEY}`);
  if (!res.ok) throw new Error(`TM ${res.status}`);
  return res.json();
}

(async () => {
  const tagAll = process.argv.includes('--all');
  let resolved = 0, tagged = 0;
  for (const v of venues) {
    if (v.region === 'aggregator') continue;
    if (v.tmVenueId && !tagAll) continue;
    try {
      await sleep(260); // stay under 5 req/s
      const q = encodeURIComponent(v.name.replace(/\(.*\)/, '').trim());
      const d = await tm(`venues.json?keyword=${q}&stateCode=CA&size=5`);
      const cands = (d._embedded && d._embedded.venues) || [];
      const hit = cands.find((c) => c.city && BAY_CITIES.has(c.city.name.toLowerCase()) && (norm(c.name).includes(norm(v.name)) || norm(v.name).includes(norm(c.name))));
      if (!hit) { console.log(`  —  ${v.name}: no TM match`); continue; }
      v.tmVenueId = hit.id;
      resolved++;
      // does TM actually have upcoming events here?
      await sleep(260);
      const now = new Date().toISOString().slice(0, 19) + 'Z';
      const ev = await tm(`events.json?venueId=${hit.id}&startDateTime=${now}&size=1&sort=date,asc`);
      const total = (ev.page && ev.page.totalElements) || 0;
      if (total > 0 && (tagAll || !v.adapter)) { v.adapter = v.adapter || 'ticketmaster'; tagged++; }
      console.log(`  ✓  ${v.name}: ${hit.id} (${hit.city.name}) — ${total} upcoming${v.adapter === 'ticketmaster' ? ' [tagged]' : ''}`);
    } catch (err) {
      console.log(`  !  ${v.name}: ${err.message}`);
    }
  }
  fs.writeFileSync(FILE, JSON.stringify(venues, null, 2) + '\n');
  console.log(`\nresolved ${resolved} venue ids; tagged ${tagged} with the ticketmaster adapter. Saved.`);
})();
