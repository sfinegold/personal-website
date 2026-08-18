// Lineup — turn a crawled page into structured events.
//
// PRIMARY path is deterministic (parse.js: JSON-LD / iCal / RSS) — no AI, no key.
// The Claude Messages API is only a FALLBACK, used when the deterministic parse
// finds nothing AND a key is available. So the app runs with no key at all; the
// LLM just widens coverage on sites that publish no structured data.
//
// Control:
//   ANTHROPIC_API_KEY   if unset, the LLM fallback is skipped entirely
//   LINEUP_USE_LLM=0    force-disable the LLM fallback even if a key is set

const { extractDeterministic } = require('./parse');
const { getAdapter } = require('./adapters');
const { crawlSource } = require('./crawl');

// When a venue's landing page yields nothing, probe its likely events pages —
// most venues keep structured data (JSON-LD etc.) on these, not the homepage.
const EVENT_PATHS = ['/events', '/calendar', '/shows', '/events/', '/calendar/', '/schedule'];

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.LINEUP_MODEL || 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';

function buildPrompt({ source, text, interests, todayYMD, windowEndYMD }) {
  return `You extract upcoming public events from a venue web page's text.

VENUE: ${source.name} (${source.url})
VENUE PRIMARY CATEGORY HINT: ${source.category}
TODAY: ${todayYMD}
ONLY INCLUDE EVENTS DATED FROM ${todayYMD} THROUGH ${windowEndYMD} (inclusive). Skip anything outside that window or with no determinable date.

Return STRICT JSON, no prose, of the form:
{"events":[{
  "title": string,
  "date": "YYYY-MM-DD",            // the event date; pick the specific day
  "time": "HH:mm" | null,          // 24h local start time if stated, else null
  "category": one of ${JSON.stringify(interests.concat(['other']))},
  "price": "free" | number | null, // number = approx USD; "free" if free; null if unknown
  "effort": "low" | "medium" | "high",  // physical exertion to attend: sitting concert/lecture=low; museum stroll=medium; long walking tour/all-day fair=high
  "url": string | null,            // link to the specific event if present, else the venue url
  "note": string                   // <= 12 words on what it is / why notable
}]}

Rules:
- Prefer specific dated events (a concert on a night, a lecture, an exhibit's run). For an ongoing exhibit, use its next open date within the window.
- If the page shows a series/run, emit distinct dated entries only when specific dates are given; otherwise one entry on the soonest applicable date.
- Do not invent events. If none are datable within the window, return {"events":[]}.
- Category must be from the allowed list; use "other" if nothing fits.

PAGE TEXT:
"""
${text}
"""`;
}

// Pull the first JSON object out of a model text response.
function parseJSON(txt) {
  if (!txt) return { events: [] };
  const start = txt.indexOf('{');
  const end = txt.lastIndexOf('}');
  if (start === -1 || end === -1) return { events: [] };
  try {
    const obj = JSON.parse(txt.slice(start, end + 1));
    return Array.isArray(obj.events) ? obj : { events: [] };
  } catch {
    return { events: [] };
  }
}

const llmEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.LINEUP_USE_LLM !== '0';

// Orchestrator: deterministic first, LLM only as a gated fallback.
// Returns { events, method } where method ∈ {json-ld, ical, rss, llm, null}.
async function extractEvents({ source, crawled, interests, todayYMD, windowEndYMD }) {
  // 0. custom adapter (tailored, fast) — tried first; may not need the crawl at all
  const adapter = getAdapter(source.adapter);
  if (adapter) {
    try {
      const events = await adapter(source, { todayYMD, windowEndYMD });
      if (events && events.length) return { events, method: `adapter:${source.adapter}` };
    } catch (err) {
      // fall through to generic extraction
    }
  }
  // 1. generic deterministic (JSON-LD / iCal / RSS) on the landing page
  const det = extractDeterministic(crawled, source);
  if (det.events.length) return { events: det.events, method: det.method };
  // 1b. probe the venue's likely events pages (structured data often lives there)
  try {
    const origin = new URL(source.url).origin;
    const seen = new Set([source.url.replace(/\/$/, ''), source.url]);
    for (const p of EVENT_PATHS) {
      const u = origin + p;
      if (seen.has(u.replace(/\/$/, ''))) continue;
      seen.add(u.replace(/\/$/, ''));
      const c = await crawlSource({ ...source, url: u });
      if (!c.ok) continue;
      const d = extractDeterministic(c, source);
      if (d.events.length) return { events: d.events, method: `${d.method}@${p}` };
    }
  } catch (err) { /* bad URL — fall through */ }
  // 2. optional LLM fallback
  if (!llmEnabled()) return { events: [], method: null };
  const events = await extractWithLLM({ source, text: crawled.text, interests, todayYMD, windowEndYMD });
  return { events, method: 'llm' };
}

async function extractWithLLM({ source, text, interests, todayYMD, windowEndYMD }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildPrompt({ source, text, interests, todayYMD, windowEndYMD }) }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const txt = (data.content || []).map((b) => b.text || '').join('');
  const { events } = parseJSON(txt);

  // Stamp each event with its source's setting/category/membership so the
  // filter can apply indoor/outdoor and ranking rules.
  return events.map((e) => ({
    ...e,
    sourceId: source.id,
    venue: source.name,
    setting: source.setting,
    membership: Boolean(source.membership),
    url: e.url || source.url,
  }));
}

module.exports = { extractEvents, extractWithLLM, parseJSON, llmEnabled };
