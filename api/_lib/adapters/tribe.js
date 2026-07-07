// Adapter: "The Events Calendar" (Modern Tribe) WordPress plugin.
//
// A large share of independent venues run this plugin, which exposes a free
// JSON REST API at /wp-json/tribe/events/v1/events — so this ONE adapter covers
// every venue using it, key-free and fast (no HTML scraping, no LLM).
//
// Set `adapter: 'tribe'` on a source whose site runs the plugin.

const { normalizeEvent } = require('../parse');

const UA = 'LineupBot/1.0 (+https://samfinegold.me/lineup)';

function parseCost(cost) {
  if (cost == null || cost === '') return null;
  if (/free/i.test(String(cost))) return 'free';
  const n = parseFloat(String(cost).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// (source, ctx) -> normalized events[]. May throw; the caller falls back.
async function tribe(source, ctx = {}) {
  const origin = new URL(source.url).origin;
  const params = new URLSearchParams({ per_page: '50' });
  if (ctx.todayYMD) params.set('start_date', ctx.todayYMD);
  if (ctx.windowEndYMD) params.set('end_date', ctx.windowEndYMD);

  const res = await fetch(`${origin}/wp-json/tribe/events/v1/events?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`tribe ${res.status}`);
  const data = await res.json();
  const rows = Array.isArray(data.events) ? data.events : [];

  return rows
    .map((e) => {
      const [date, time] = String(e.start_date || '').split(' '); // "2026-07-10 20:00:00"
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
      return normalizeEvent(
        {
          title: typeof e.title === 'string' ? e.title : '',
          date,
          time: time ? time.slice(0, 5) : null,
          url: e.url || e.website || source.url,
          price: parseCost(e.cost),
          note: String(e.excerpt || '').replace(/<[^>]+>/g, '').trim().slice(0, 120),
        },
        source
      );
    })
    .filter((e) => e && e.title);
}

module.exports = tribe;
