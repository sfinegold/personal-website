#!/usr/bin/env node
// Lineup — write curated events for a profile into the shared store.
//
// This is the hand-off point for the Claude curation routine: a Claude Code
// session reads Milton's JS-rendered venue pages (which deterministic parsing
// can't), extracts events as JSON, then runs this to persist them. The engine
// merges this `curated` bucket with deterministic events at send time.
//
// Usage:
//   node scripts/lineup-curate.js milton events.json      # replace curated set
//   node scripts/lineup-curate.js milton --show           # print current curated set
//
// events.json shape:  [{ title, date:"YYYY-MM-DD", time:"HH:mm"|null,
//   category, setting:"indoor"|"outdoor", price:"free"|number|null,
//   effort:"low"|"medium"|"high", note, url, venue, sourceId }]
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (else writes to in-memory store).

const fs = require('fs');
const path = require('path');
const LIB = path.join(__dirname, '..', 'api', '_lib');
require(path.join(LIB, 'loadenv.js')).loadEnv();
const { getProfile } = require(path.join(LIB, 'profiles.js'));
const store = require(path.join(LIB, 'store.js'));

const [id, arg] = process.argv.slice(2);

if (!id || !getProfile(id)) {
  console.error('Usage: node scripts/lineup-curate.js <milton|me> <events.json | --show>');
  process.exit(1);
}

const REQUIRED = ['title', 'date', 'category'];

function validate(events) {
  if (!Array.isArray(events)) throw new Error('events JSON must be an array');
  events.forEach((e, i) => {
    for (const f of REQUIRED) if (!e[f]) throw new Error(`event[${i}] missing "${f}"`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error(`event[${i}] date must be YYYY-MM-DD`);
  });
  // Normalize defaults so curated events match the deterministic shape.
  return events.map((e) => ({
    title: e.title,
    date: e.date,
    time: e.time || null,
    category: e.category,
    setting: e.setting === 'outdoor' ? 'outdoor' : 'indoor',
    price: e.price != null ? e.price : null,
    effort: e.effort || 'low',
    note: (e.note || '').slice(0, 120),
    url: e.url || null,
    venue: e.venue || 'Curated',
    sourceId: e.sourceId || 'curated',
    membership: Boolean(e.membership),
    ongoing: Boolean(e.ongoing), // true = standing exhibit / on-view, ranked below dated events
  }));
}

(async () => {
  if (arg === '--show') {
    const events = await store.getCurated(id);
    console.log(`${id}: ${events.length} curated events`);
    for (const e of events) console.log(`  ${e.date} ${e.time || ''}  ${e.title}  @${e.venue}`);
    return;
  }
  if (!arg) {
    console.error('Provide an events.json path (or --show).');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(arg, 'utf8'));
  // Accept either an events array, or { events, recommendation } (the "judge" write-up).
  // Array form never touches the stored recommendation; object form updates it only
  // when a `recommendation` key is present.
  const isObj = !Array.isArray(raw);
  const events = validate(isObj ? raw.events : raw);
  await store.setCurated(id, events);
  const setsRec = isObj && Object.prototype.hasOwnProperty.call(raw, 'recommendation');
  if (setsRec) await store.setRecommendation(id, raw.recommendation || null);
  const where = store.dbEnabled ? 'Supabase' : 'in-memory (set SUPABASE_URL to persist)';
  console.log(`Wrote ${events.length} curated events${setsRec ? ' + recommendation' : ''} for ${id} to ${where}.`);
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
