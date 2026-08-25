// Lineup — deterministic event extraction. No AI, no per-site scraping: we read
// the structured data that venue pages already publish.
//
//   1. JSON-LD  (<script type="application/ld+json"> with schema.org Event)
//   2. iCal     (BEGIN:VEVENT … blocks)
//   3. RSS/Atom (only when items carry a real event date)
//
// Each returns our normalized event shape; the source supplies category/setting.
// This is the primary path — the LLM in extract.js is only a fallback.

// Categories that read as "sit and watch" -> low physical effort; others medium.
const LOW_EFFORT = new Set(['opera', 'classical', 'lecture', 'comedy', 'live-music', 'electronic', 'theater']);

function defaultEffort(source) {
  return LOW_EFFORT.has(source.category) ? 'low' : 'medium';
}

// Split an ISO datetime ("2026-07-08T19:30:00-05:00" or "2026-07-08") into the
// venue-local date + time. The wall-clock in the string is already local, which
// is exactly what we want, so we slice rather than convert.
function splitDateTime(iso) {
  if (typeof iso !== 'string') return { date: null, time: null };
  const dm = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!dm) return { date: null, time: null };
  const tm = iso.match(/T(\d{2}:\d{2})/);
  let time = tm ? tm[1] : null;
  if (time === '00:00') time = null; // midnight in a feed almost always = date-only placeholder, not a real showtime
  return { date: dm[1], time };
}

function decodeEntities(t) {
  return String(t)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&rsquo;/g, '’');
}

function normalize(ev, source) {
  const url = ev.url || source.url;
  return {
    title: decodeEntities(ev.title),
    date: ev.date,
    time: ev.time || null,
    category: ev.category || source.category,
    price: ev.price != null ? ev.price : null,
    effort: defaultEffort(source),
    note: decodeEntities(decodeEntities(String(ev.note || '')).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 120),
    url,
    sourceId: source.id,
    venue: source.name,
    setting: source.setting,
    membership: Boolean(source.membership),
    ongoing: false, // deterministic feed items are dated one-off events, not standing exhibits
  };
}

// ---- JSON-LD ---------------------------------------------------------------

const EVENT_TYPES = /(?:Event|Festival)$/i; // Event, MusicEvent, TheaterEvent, ExhibitionEvent, Festival…

function isEventType(type) {
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === 'string' && EVENT_TYPES.test(t));
}

function priceFromOffers(offers) {
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  let min = null;
  for (const o of list) {
    const p = o && (o.price != null ? o.price : o.lowPrice);
    if (p == null) continue;
    const n = Number(p);
    if (Number.isNaN(n)) continue;
    if (min == null || n < min) min = n;
  }
  if (min == null) return null;
  return min === 0 ? 'free' : min;
}

// Walk any JSON-LD value, collecting Event-typed objects (handles arrays,
// @graph, and nested sub-events).
function collectEvents(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectEvents(n, out));
    return;
  }
  if (node['@graph']) collectEvents(node['@graph'], out);
  if (isEventType(node['@type']) && (node.name || node.summary)) out.push(node);
  if (node.subEvent) collectEvents(node.subEvent, out);
  if (node.events) collectEvents(node.events, out);
}

function parseJsonLd(html, source) {
  const events = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let json;
    try {
      json = JSON.parse(m[1].trim());
    } catch {
      continue; // skip malformed blocks
    }
    const found = [];
    collectEvents(json, found);
    for (const e of found) {
      const { date, time } = splitDateTime(e.startDate);
      if (!date) continue;
      const name = typeof e.name === 'string' ? e.name : (e.summary || '').toString();
      if (!name) continue;
      const url = typeof e.url === 'string' ? e.url : (e.url && e.url['@id']) || null;
      events.push(normalize({ title: name.trim(), date, time, url, price: priceFromOffers(e.offers), note: typeof e.description === 'string' ? e.description : '' }, source));
    }
  }
  return dedupe(events);
}

// ---- iCal ------------------------------------------------------------------

function unescapeICal(s) {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

// DTSTART forms: 20260708T193000, 20260708T193000Z, 20260708 (all-day),
// or DTSTART;TZID=...:20260708T193000
function parseICalDate(val) {
  const m = val.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return { date: null, time: null };
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : null };
}

function parseICal(text, source) {
  const events = [];
  const blocks = text.split(/BEGIN:VEVENT/i).slice(1);
  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0];
    const field = (name) => {
      const re = new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'im');
      const mm = body.match(re);
      return mm ? unescapeICal(mm[1]) : null;
    };
    const summary = field('SUMMARY');
    const dtstart = field('DTSTART');
    if (!summary || !dtstart) continue;
    const { date, time } = parseICalDate(dtstart);
    if (!date) continue;
    events.push(normalize({ title: summary, date, time, url: field('URL'), note: field('DESCRIPTION') || '' }, source));
  }
  return dedupe(events);
}

// ---- RSS / Atom (weak: only usable if an item has a parseable event date) ---

function parseRss(text, source) {
  const events = [];
  const items = text.split(/<item[\s>]/i).slice(1).concat(text.split(/<entry[\s>]/i).slice(1));
  for (const chunk of items) {
    const get = (tag) => {
      const mm = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return mm ? mm[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() : null;
    };
    const title = get('title');
    // Look for an ISO date anywhere in the item (event date, not pubDate).
    const iso = (chunk.match(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/) || [])[0];
    if (!title || !iso) continue;
    const { date, time } = splitDateTime(iso);
    if (!date) continue;
    const linkMatch = chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || chunk.match(/<link[^>]*href=["']([^"']+)["']/i);
    events.push(normalize({ title, date, time, url: linkMatch ? linkMatch[1].trim() : null, note: get('description') || '' }, source));
  }
  return dedupe(events);
}

function dedupe(events) {
  const seen = new Set();
  return events.filter((e) => {
    const k = `${e.title.toLowerCase()}|${e.date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Primary deterministic pass over a crawl result. Returns [] if nothing found.
function extractDeterministic(crawled, source) {
  const { raw = '', contentType = '' } = crawled || {};
  if (!raw) return { events: [], method: null };

  // iCal
  if (/BEGIN:VCALENDAR/i.test(raw) || /calendar/i.test(contentType)) {
    const events = parseICal(raw, source);
    if (events.length) return { events, method: 'ical' };
  }
  // JSON-LD (works inside normal HTML pages)
  const jsonld = parseJsonLd(raw, source);
  if (jsonld.length) return { events: jsonld, method: 'json-ld' };

  // RSS/Atom
  if (/<rss|<feed|<item[\s>]|<entry[\s>]/i.test(raw)) {
    const events = parseRss(raw, source);
    if (events.length) return { events, method: 'rss' };
  }
  return { events: [], method: null };
}

module.exports = { extractDeterministic, parseJsonLd, parseICal, parseRss, splitDateTime, normalizeEvent: normalize, defaultEffort };
