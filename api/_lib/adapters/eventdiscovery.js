// Adapter: the TicketWeb "event-discovery" WordPress plugin (jquery.fullcalendar).
//
// Used by many independent SF venues (The Independent, and others). The calendar
// loads via admin-ajax action `get_events_for_calendar`, guarded by a WordPress
// nonce. We fetch a page to lift the nonce, then POST the feed — returning the
// venue's FULL, always-fresh calendar (no manual curation).
//
//   set `adapter: 'eventdiscovery'` on the source.

const { normalizeEvent } = require('../parse');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const PARAMS = JSON.stringify({
  id: null, type: 'calendar2', event_id: null, event_ids: null, tags: null, excludetags: null,
  genres: null, start: null, end: null, venue: null, org: null, template: null, featured: null,
  sort: null, showname: null, showdescription: null,
});

const NAMED = { amp: '&', quot: '"', apos: "'", ouml: 'ö', uuml: 'ü', auml: 'ä', 0: 'ö', eacute: 'é', egrave: 'è', ntilde: 'ñ', aacute: 'á', oacute: 'ó', iacute: 'í', uacute: 'ú', ldquo: '“', rdquo: '”', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…' };
function decode(s) {
  return String(s)
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => (NAMED[name.toLowerCase()] != null ? NAMED[name.toLowerCase()] : m));
}

function to24(s) {
  const m = String(s || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

async function eventdiscovery(source, ctx = {}) {
  const origin = new URL(source.url).origin;

  // 1. lift the nonce + ajax url from a rendered page
  let html = '';
  for (const p of ['/calendar', '/']) {
    const r = await fetch(origin + p, { headers: { 'User-Agent': UA } });
    if (!r.ok) continue;
    html = await r.text();
    if (/get_events_for_calendar/.test(html)) break;
  }
  const nonce = (html.match(/nonce["'\s:=]+["']([a-f0-9]{6,})["']/i) || [])[1];
  const ajax = (html.match(/ajax_url["'\s:=]+["']([^"']+admin-ajax\.php)["']/i) || [])[1] || `${origin}/wp-admin/admin-ajax.php`;
  if (!nonce) throw new Error('eventdiscovery: no nonce');

  // 2. pull the feed for the window (pad the end a little)
  const start = ctx.todayYMD || new Date().toISOString().slice(0, 10);
  const end = ctx.windowEndYMD || start;
  const body = new URLSearchParams({ action: 'get_events_for_calendar', nonce, start, end, params: PARAMS });
  const res = await fetch(ajax, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`eventdiscovery ${res.status}`);
  const data = await res.json();
  const rows = Array.isArray(data.events) ? data.events : [];

  return rows
    .map((e) => {
      const date = String(e.start || '').match(/^\d{4}-\d{2}-\d{2}/) ? e.start.slice(0, 10) : null;
      if (!date || !e.title) return null;
      return normalizeEvent(
        { title: decode(String(e.title).trim()), date, time: to24(e.displayTime || e.doors), url: source.url, price: null, note: '' },
        source
      );
    })
    .filter(Boolean);
}

module.exports = eventdiscovery;
