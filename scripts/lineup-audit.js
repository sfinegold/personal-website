#!/usr/bin/env node
// Lineup — venue coverage audit. Repeatably scans EVERY enabled venue for a
// profile and reports how many shows each yields and via which method
// (adapter / json-ld / ical / rss, incl. which events-page path worked).
// Use it to spot dark venues and decide where an adapter or curation is needed.
//
//   node scripts/lineup-audit.js            # audit Sam's venues
//   node scripts/lineup-audit.js milton     # audit Milton's
//
// Writes a JSON report to Supabase (lineup:coverage:<id>) and prints a table.

const path = require('path');
const LIB = path.join(__dirname, '..', 'api', '_lib');
require(path.join(LIB, 'loadenv.js')).loadEnv();
const { getProfile } = require(path.join(LIB, 'profiles.js'));
const store = require(path.join(LIB, 'store.js'));
const { crawlSource } = require(path.join(LIB, 'crawl.js'));
const { extractEvents } = require(path.join(LIB, 'extract.js'));
const { todayYMD, addDaysYMD } = require(path.join(LIB, 'util.js'));

const id = process.argv[2] || 'me';
const profile = getProfile(id);
if (!profile) { console.error('unknown profile: ' + id); process.exit(1); }

async function mapLimit(items, limit, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

(async () => {
  const start = todayYMD(profile.timezone);
  const end = addDaysYMD(start, profile.filters.lookaheadDays);
  const sources = profile.sources.filter((s) => s.enabled !== false && s.region !== 'aggregator');
  console.log(`Auditing ${sources.length} venues for "${id}" (${start} → ${end})...\n`);

  const rows = await mapLimit(sources, 8, async (source) => {
    try {
      const crawled = await crawlSource(source);
      const { events, method } = await extractEvents({
        source, crawled, interests: profile.interests, todayYMD: start, windowEndYMD: end,
      });
      const inWindow = events.filter((e) => e.date >= start && e.date <= end).length;
      return { id: source.id, name: source.name, region: source.region, found: events.length, inWindow, method, error: crawled.ok ? null : crawled.note };
    } catch (err) {
      return { id: source.id, name: source.name, region: source.region, found: 0, inWindow: 0, method: null, error: String(err.message || err) };
    }
  });

  rows.sort((a, b) => b.inWindow - a.inWindow || b.found - a.found || a.name.localeCompare(b.name));
  const live = rows.filter((r) => r.found > 0);
  const dark = rows.filter((r) => !r.found);

  console.log('── LIVE VENUES ──');
  for (const r of live) console.log(`  ${String(r.inWindow).padStart(3)} in-window (${String(r.found).padStart(3)} total)  ${(r.method || '').padEnd(18)} ${r.name}`);
  console.log(`\n── DARK VENUES (${dark.length}) ──`);
  for (const r of dark) console.log(`  ${r.name}${r.error ? '  [' + r.error + ']' : ''}`);
  console.log(`\n${live.length}/${rows.length} venues yield events; ${live.reduce((n, r) => n + r.inWindow, 0)} in-window shows total.`);

  await store.setJSON(`lineup:coverage:${id}`, { at: new Date().toISOString(), window: { start, end }, rows });
  console.log(`Report saved to Supabase (lineup:coverage:${id}).`);
})();
