// Lineup — fetch a source page and reduce it to plain text for the extractor.
//
// We don't hand-write a parser per venue. We fetch the page (or RSS/JSON feed),
// strip markup down to readable text, and hand that to Claude (see extract.js).
// This keeps the source list a simple editable URL list.

const UA = 'LineupBot/1.0 (+https://samfinegold.me/lineup; personal events digest)';
const MAX_CHARS = 14000; // cap text handed to the model, to bound tokens/cost

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8' },
      signal: controller.signal,
      redirect: 'follow',
    });
    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();
    return { ok: res.ok, status: res.status, contentType, body };
  } finally {
    clearTimeout(timer);
  }
}

// Collapse HTML/XML to text: drop scripts/styles, turn tags into spaces,
// decode a few common entities, squeeze whitespace.
function htmlToText(html) {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&[a-z]+;/gi, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// Fetch + reduce. Returns { ok, raw, text, contentType, note }.
// `raw` is the untouched body (so structured-data parsers can read JSON-LD /
// iCal / RSS); `text` is the flattened fallback for the LLM path.
async function crawlSource(source) {
  try {
    const { ok, status, contentType, body } = await fetchText(source.url);
    if (!ok) return { ok: false, raw: '', text: '', contentType: '', note: `HTTP ${status}` };
    const isFeed = /xml|rss|atom|calendar|json/i.test(contentType) || /^\s*<\?xml|<rss|<feed|BEGIN:VCALENDAR/i.test(body);
    const text = htmlToText(body).slice(0, MAX_CHARS);
    return { ok: true, raw: body, text, contentType, note: isFeed ? 'feed' : 'html' };
  } catch (err) {
    return { ok: false, raw: '', text: '', contentType: '', note: err.name === 'AbortError' ? 'timeout' : String(err.message || err) };
  }
}

module.exports = { crawlSource, htmlToText, fetchText };
