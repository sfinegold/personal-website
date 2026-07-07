// Lineup — the "is this good for them?" gate + ranking.
//
// Pure functions (no I/O) so this is unit-testable. Given a list of extracted
// events, the profile, a weather-highs map, and today's date, it returns the
// kept+ranked events and a parallel list of drops with reasons (for the admin).

const { weekdayOfYMD, hourOf, daysBetween } = require('./util');

const EFFORT_RANK = { low: 1, medium: 2, high: 3 };

function withinWindow(ev, profile, todayYMD, windowEndYMD) {
  if (!ev.date) return false;
  if (ev.date < todayYMD) return false;
  if (windowEndYMD && ev.date > windowEndYMD) return false;
  return true;
}

function matchesInterest(ev, profile) {
  return ev.category && ev.category !== 'other' && profile.interests.includes(ev.category);
}

// True if the event falls inside a blackout window (e.g. Tue/Thu 4pm+).
function inBlackout(ev, profile) {
  const blackout = profile.filters.blackout || [];
  if (!blackout.length) return false;
  const weekday = weekdayOfYMD(ev.date);
  const hour = hourOf(ev.time);
  return blackout.some((b) => {
    if (b.weekday !== weekday) return false;
    if (b.afterHour == null) return true; // whole-day blackout
    // Only block if we actually know the time and it's at/after the cutoff.
    if (hour == null) return false;
    return hour >= b.afterHour;
  });
}

// Cool rule — only applies to outdoor events. Returns {blocked, high}.
// Uses the 7-day forecast where available; for events further out (the month-long
// window) it falls back to the city's average monthly high so summer outdoor
// events are still filtered.
function tempCheck(ev, profile, highs) {
  const cool = profile.filters.cool;
  if (!cool || ev.setting !== cool.appliesTo) return { blocked: false, high: null };
  let high = highs ? highs[ev.date] : null;
  if (high == null && profile.climate) {
    const month = parseInt(ev.date.slice(5, 7), 10);
    if (month >= 1 && month <= 12) high = profile.climate[month - 1];
  }
  if (high == null) return { blocked: false, high: null }; // truly unknown -> don't block
  return { blocked: high >= cool.maxTempF, high };
}

function effortTooHigh(ev, profile) {
  const max = profile.filters.maxEffort;
  if (!max) return false;
  const e = EFFORT_RANK[ev.effort] || EFFORT_RANK.medium;
  return e > EFFORT_RANK[max];
}

function eventKey(ev) {
  return `${ev.sourceId}|${(ev.title || '').toLowerCase().trim()}|${ev.date}`;
}

function scoreEvent(ev, profile, todayYMD) {
  let score = 0;
  const f = profile.filters;
  // Prefer dated happenings (lectures/talks/performances) over standing exhibits.
  if (f.preferEvents && ev.ongoing) score -= 40;
  if (ev.membership) score += 50; // e.g. Opera in the Heights membership
  if (profile.favorites.includes(ev.category)) score += 20;
  if (f.freeBoost && (ev.price === 'free' || ev.price === 0)) score += 15;
  // Sooner events rank a little higher (max ~10 for today, decaying).
  const away = Math.max(0, daysBetween(todayYMD, ev.date));
  score += Math.max(0, 10 - away);
  // Weekend preference (Sam).
  if (f.weekendPreferred) {
    const wd = weekdayOfYMD(ev.date);
    if (wd === 'Fri' || wd === 'Sat' || wd === 'Sun') score += 8;
  }
  // Low-effort nudge when a profile cares about effort.
  if (f.maxEffort && ev.effort === 'low') score += 5;
  return score;
}

// Main entry. events: extracted events across all sources.
function filterAndRank(events, profile, { highs, todayYMD, windowEndYMD }) {
  const kept = [];
  const dropped = [];
  const seen = new Set();

  for (const ev of events) {
    if (!withinWindow(ev, profile, todayYMD, windowEndYMD)) {
      dropped.push({ ev, reason: 'outside date window' });
      continue;
    }
    if (!matchesInterest(ev, profile)) {
      dropped.push({ ev, reason: `not an interest (${ev.category})` });
      continue;
    }
    if (inBlackout(ev, profile)) {
      dropped.push({ ev, reason: 'tennis-night blackout (Tue/Thu 4pm+)' });
      continue;
    }
    const temp = tempCheck(ev, profile, highs);
    if (temp.blocked) {
      dropped.push({ ev, reason: `too hot (${temp.high}°F outdoor)` });
      continue;
    }
    if (effortTooHigh(ev, profile)) {
      dropped.push({ ev, reason: `too much exertion (${ev.effort})` });
      continue;
    }
    const key = eventKey(ev);
    if (seen.has(key)) {
      dropped.push({ ev, reason: 'duplicate' });
      continue;
    }
    seen.add(key);
    kept.push({ ...ev, forecastHigh: temp.high, score: scoreEvent(ev, profile, todayYMD) });
  }

  kept.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  return { kept, dropped };
}

// Select up to `maxPicks` from a ranked list while capping how many come from any
// one venue, so a single prolific venue can't dominate the digest. Diverse-first:
// walks the ranked list and skips a venue once it hits the cap (no backfill — a
// short, varied digest is better than a long, monotonous one).
function diversify(ranked, maxPicks, maxPerVenue) {
  if (!maxPerVenue) return maxPicks ? ranked.slice(0, maxPicks) : ranked;
  const counts = {};
  const picked = [];
  for (const e of ranked) {
    const v = e.venue || e.sourceId || 'unknown';
    if ((counts[v] || 0) >= maxPerVenue) continue;
    counts[v] = (counts[v] || 0) + 1;
    picked.push(e);
    if (maxPicks && picked.length >= maxPicks) break;
  }
  return picked;
}

module.exports = {
  filterAndRank,
  eventKey,
  diversify,
  // exported for testing:
  matchesInterest,
  inBlackout,
  tempCheck,
  effortTooHigh,
  scoreEvent,
};
