// Lineup — orchestrates one profile's run: crawl every enabled source, extract
// events, enrich with weather, filter + rank, then either send the email or (for
// preview/dry runs) just return the rendered digest and diagnostics.

const { getProfile, recipientList } = require('./profiles');
const store = require('./store');
const { crawlSource } = require('./crawl');
const { extractEvents } = require('./extract');
const { getForecastHighs } = require('./weather');
const { filterAndRank, eventKey, diversify } = require('./filter');
const { renderHTML, renderText, subjectLine, topPick } = require('./digest');
const { sendEmail } = require('./email');
const { todayYMD, addDaysYMD } = require('./util');

// Run async tasks with a small concurrency cap (be polite to venue sites).
async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function rangeLabel(start, end) {
  const f = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${f(start)} – ${f(end)}`;
}

// Resolve the effective (seed + edits) enabled source list for a profile.
async function effectiveSources(profile) {
  const edits = await store.loadSourceEdits(profile.id);
  const merged = store.mergeSources(profile.sources, edits);
  return merged.filter((s) => s.enabled !== false);
}

// options: { dryRun (don't send, return html), testTo (override recipient), now }
async function runProfile(profileId, options = {}) {
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`unknown profile ${profileId}`);

  const now = options.now || new Date();
  const start = todayYMD(profile.timezone, now);
  const windowEndYMD = addDaysYMD(start, profile.filters.lookaheadDays);

  const sources = await effectiveSources(profile);

  // 1. crawl + 2. extract, per source, with diagnostics
  const perSource = await mapLimit(sources, 8, async (source) => {
    const crawled = await crawlSource(source);
    // Always call extractEvents: an adapter can succeed even if the homepage
    // crawl 404/403s (it hits an API), so a failed crawl isn't fatal by itself.
    try {
      const { events, method } = await extractEvents({
        source,
        crawled,
        interests: profile.interests,
        todayYMD: start,
        windowEndYMD,
      });
      const error = !events.length && !crawled.ok ? crawled.note : null;
      return { source, events, method, error };
    } catch (err) {
      return { source, events: [], method: null, error: String(err.message || err) };
    }
  });

  // Deterministic events + any curated events (written by the Claude routine for
  // JS-rendered venues the parser can't read).
  const curated = await store.getCurated(profile.id);
  const allEvents = perSource.flatMap((r) => r.events).concat(curated);

  // 3. weather (only needed if this profile has an outdoor temp rule)
  const highs = profile.filters.cool ? await getForecastHighs(profile.coords) : {};

  // 4. filter + rank, then cap to the top N picks
  const ranked = filterAndRank(allEvents, profile, { highs, todayYMD: start, windowEndYMD });
  const dropped = ranked.dropped;
  const maxPicks = profile.filters.maxPicks;
  const kept = diversify(ranked.kept, maxPicks, profile.filters.maxPerVenue);
  const trimmed = ranked.kept.length - kept.length; // how many good picks fell below the cap

  // Flag "newly added" = not in the previous digest. First-ever digest flags nothing.
  const prevSent = await store.getSentKeys(profile.id);
  const prevSet = new Set(prevSent || []);
  const hadPrev = Array.isArray(prevSent) && prevSent.length > 0;
  for (const e of kept) e.isNew = hadPrev ? !prevSet.has(eventKey(e)) : false;

  // 5. JUDGE LAYER — a curation-written "top pick" paragraph if it's still FRESH
  // (curation runs ~weekly; a stale paragraph would name past events), else a
  // deterministic fallback highlighting the current #1 ranked event.
  const REC_MAX_AGE_DAYS = 9;
  const rec = await store.getRecommendation(profile.id);
  const recAgeDays = rec && rec.at ? (now - new Date(rec.at)) / 86400000 : Infinity;
  const recFresh = Boolean(rec && rec.paragraph && recAgeDays <= REC_MAX_AGE_DAYS);
  const recommendation = recFresh ? rec.paragraph : topPick(kept);
  const base = process.env.LINEUP_BASE_URL || 'https://samfinegold.me/lineup';
  const meta = {
    rangeLabel: rangeLabel(start, windowEndYMD),
    short: 'window',
    tennisNote: (profile.filters.blackout || []).length > 0,
    recommendation,
    recommendationSource: recFresh ? 'curated' : 'auto',
    adminUrl: `${base}/${profile.id}`,
    listenUrl: profile.listen ? `${base}/sf` : null,
  };
  const html = renderHTML(profile, kept, meta);
  const text = renderText(profile, kept, meta);
  const subject = subjectLine(profile, kept, meta);

  // Snapshot for the web "listen" view (so it never re-crawls).
  await store.setSnapshot(profile.id, {
    city: profile.city,
    window: { start, end: windowEndYMD },
    recommendation,
    kept,
    at: now.toISOString(),
  });

  const diagnostics = {
    window: { start, end: windowEndYMD },
    sources: perSource.map((r) => ({ id: r.source.id, name: r.source.name, found: r.events.length, method: r.method, error: r.error })),
    curated: curated.length,
    totalExtracted: allEvents.length,
    kept: kept.length,
    dropped: dropped.map((d) => ({ title: d.ev.title, venue: d.ev.venue, reason: d.reason })),
  };

  // 6. send (unless dry run)
  let sent = null;
  if (!options.dryRun) {
    const to = options.testTo || recipientList(profile);
    if (to) {
      await sendEmail({ to, subject, html, text });
      sent = { to };
      // Only a real (non-test) send updates the "already sent" set for next time.
      if (!options.testTo) await store.setSentKeys(profile.id, kept.map(eventKey));
    } else {
      diagnostics.sendSkipped = `no recipient (${profile.recipientEnv} unset)`;
    }
    await store.appendLog(profile.id, {
      at: now.toISOString(),
      kept: kept.length,
      extracted: allEvents.length,
      sent: sent ? sent.to : null,
      test: Boolean(options.testTo),
    });
  }

  return { profile: profile.id, subject, html, text, kept, diagnostics, sent };
}

module.exports = { runProfile, effectiveSources };
