// Adapter: Bay Area music-festival scan (Ticketmaster Discovery, keyword+geo).
// Attached to a virtual "festivals" source; surfaces multi-day fests (Outside
// Lands, Portola, ...) wherever they're ticketed. Real venue name kept per event.

const { normalizeEvent } = require('../parse');

async function tmfestivals(source, ctx = {}) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) throw new Error('no TM key');
  const params = new URLSearchParams({
    classificationName: 'music', keyword: 'festival',
    latlong: '37.7749,-122.4194', radius: '60', unit: 'miles',
    size: '100', sort: 'date,asc', apikey: key,
  });
  if (ctx.todayYMD) params.set('startDateTime', `${ctx.todayYMD}T00:00:00Z`);
  // festivals are planned far out — always scan a full year ahead
  const end = new Date((ctx.todayYMD || new Date().toISOString().slice(0,10)) + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 365);
  params.set('endDateTime', end.toISOString().slice(0, 10) + 'T23:59:59Z');
  const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
  if (!res.ok) throw new Error(`tmfestivals ${res.status}`);
  const data = await res.json();
  const rows = (data._embedded && data._embedded.events) || [];
  const seen = new Set();
  return rows.map((e) => {
    const start = e.dates && e.dates.start;
    const date = start && start.localDate;
    if (!date || !e.name) return null;
    const k = `${e.name}|${date}`;
    if (seen.has(k)) return null;
    seen.add(k);
    const venueName = (e._embedded && e._embedded.venues && e._embedded.venues[0] && e._embedded.venues[0].name) || source.name;
    const ev = normalizeEvent({
      title: e.name.trim(), date,
      time: start.localTime ? start.localTime.slice(0, 5) : null,
      url: e.url || source.url,
      price: e.priceRanges && e.priceRanges[0] && e.priceRanges[0].min != null ? Math.round(e.priceRanges[0].min) : null,
      note: 'Festival',
    }, source);
    ev.venue = venueName; // keep the festival's real grounds/venue
    return ev;
  }).filter(Boolean);
}

module.exports = tmfestivals;
