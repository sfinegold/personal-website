// Adapter: Ticketmaster Discovery API (free key). Covers every TM/Live Nation-
// ticketed venue — Shoreline, Fox Oakland, Warfield, Greek Berkeley, Chase
// Center, SAP, Bill Graham, etc. — with clean structured data.
//
// Source needs `tmVenueId` (resolve once with scripts/lineup-tm-map.js) and
// `adapter: 'ticketmaster'`. Env: TICKETMASTER_API_KEY.

const { normalizeEvent } = require('../parse');

async function ticketmaster(source, ctx = {}) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) throw new Error('TICKETMASTER_API_KEY not set');
  if (!source.tmVenueId) throw new Error('source missing tmVenueId');

  const params = new URLSearchParams({
    venueId: source.tmVenueId,
    size: '100',
    sort: 'date,asc',
    apikey: key,
  });
  if (ctx.todayYMD) params.set('startDateTime', `${ctx.todayYMD}T00:00:00Z`);
  if (ctx.windowEndYMD) params.set('endDateTime', `${ctx.windowEndYMD}T23:59:59Z`);

  const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
  if (!res.ok) throw new Error(`ticketmaster ${res.status}`);
  const data = await res.json();
  const rows = (data._embedded && data._embedded.events) || [];

  const seen = new Set();
  return rows
    .map((e) => {
      const start = e.dates && e.dates.start;
      const date = start && start.localDate;
      if (!date || !e.name) return null;
      const k = `${e.name}|${date}`;
      if (seen.has(k)) return null; // TM sometimes lists dupes (presales etc.)
      seen.add(k);
      const price = e.priceRanges && e.priceRanges[0] && e.priceRanges[0].min != null
        ? Math.round(e.priceRanges[0].min) : null;
      const cls = (e.classifications && e.classifications[0]) || {};
      const genre = cls.genre ? cls.genre.name : '';
      const seg = cls.segment ? cls.segment.name : '';
      // per-EVENT category: arenas host concerts, ballparks host comedy nights, etc.
      let category = source.category;
      if (/^sports$/i.test(seg)) category = 'sports';
      else if (/^music$/i.test(seg)) category = /dance|electronic/i.test(genre) ? 'electronic' : /jazz/i.test(genre) ? 'jazz' : 'live-music';
      else if (/comedy/i.test(genre) || /^comedy$/i.test(seg)) category = 'comedy';
      else if (/arts & theater/i.test(seg)) category = 'theater';
      // arenas/ballparks: only explicit Sports events stay sports — anything else is a show
      if (category === 'sports' && !/^sports$/i.test(seg)) category = 'live-music';
      return normalizeEvent(
        {
          title: e.name.trim(),
          category,
          date,
          time: start.localTime ? start.localTime.slice(0, 5) : null,
          // Z-prefixed ids are partner-fed listings (AXS/box-office venues) whose
          // ticketmaster.com pages often 404 — send those to the venue site instead.
          url: (e.url && !/\/event\/Z/.test(e.url)) ? e.url : source.url,
          price: price === 0 ? 'free' : price,
          note: genre && genre !== 'Undefined' ? genre : '',
        },
        source
      );
    })
    .filter(Boolean);
}

module.exports = ticketmaster;
