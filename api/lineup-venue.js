// /lineup/venue/:id — SEO-forward venue page (indexable, unlike other lineup
// pages). Server-rendered from venues/bayarea.json + the snapshot grid; emits
// MusicVenue + Event JSON-LD for Google's event surfaces.

const store = require('./_lib/store');
const venues = require('./_lib/venues/bayarea.json');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDay = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
const fmtPrice = (p) => (p === 'free' || p === 0 ? 'Free' : typeof p === 'number' ? '$' + p : '');
const hueOf = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const id = (url.searchParams.get('id') || '').toLowerCase();
  const v = venues.find((x) => x.id === id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!v) { res.statusCode = 404; return res.end('<p>Unknown venue. <a href="/lineup/sf">Back to Lineup</a></p>'); }

  let shows = [];
  try {
    const snap = await store.getSnapshot('me');
    shows = ((snap && snap.grid) || []).filter((e) => e.sourceId === v.id).sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) { /* render without shows */ }

  const canonical = `https://samfinegold.me/lineup/venue/${v.id}`;
  const desc = `Upcoming shows, set times, and tickets at ${v.name} (${v.region === 'SF' ? 'San Francisco' : v.region}, CA). ${shows.length ? shows.length + ' events in the next 5 weeks — updated weekly.' : 'Updated weekly.'}`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicVenue',
    name: v.name,
    url: v.url,
    address: { '@type': 'PostalAddress', addressRegion: 'CA', addressCountry: 'US' },
    event: shows.slice(0, 25).map((e) => ({
      '@type': 'Event',
      name: e.title,
      startDate: e.date + (e.time ? 'T' + e.time : ''),
      location: { '@type': 'MusicVenue', name: v.name },
      ...(e.url ? { url: e.url } : {}),
      ...(typeof e.price === 'number' ? { offers: { '@type': 'Offer', price: e.price, priceCurrency: 'USD' } } : {}),
    })),
  };
  const others = venues.filter((x) => x.region === v.region && x.id !== v.id && x.region !== 'aggregator').slice(0, 8);
  const hue = hueOf(v.name);

  const rows = shows.map((e) => `<tr>
    <td class="d">${esc(fmtDay(e.date))}</td>
    <td class="n">${esc(e.title)}</td>
    <td class="t">${esc(fmtTime(e.time))}</td>
    <td class="t">${esc(fmtPrice(e.price))}</td>
    <td>${e.url ? `<a class="tix" href="${esc(e.url)}" target="_blank" rel="noopener">Tickets</a>` : ''}</td>
  </tr>`).join('');

  res.statusCode = 200;
  res.end(`<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(v.name)} — Upcoming Shows &amp; Tickets | Lineup SF</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(v.name)} — Upcoming Shows">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#F7F5F0;color:#191D23;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:860px;margin:0 auto;padding:1.2rem 1rem 3rem}
  .hero{border-radius:12px;padding:1.6rem 1.4rem;color:#fff;margin-bottom:1rem;
    background:linear-gradient(135deg,hsl(${hue},32%,42%),hsl(${hue},36%,28%))}
  .hero h1{font-size:1.7rem}
  .hero .m{font-family:ui-monospace,Menlo,monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;opacity:.85;margin-top:.3rem}
  .hero a{color:#fff}
  table{width:100%;border-collapse:collapse;font-size:.88rem}
  td{padding:8px 8px;border-bottom:1px solid rgba(28,32,38,.14);vertical-align:middle}
  .d,.t{font-family:ui-monospace,Menlo,monospace;font-size:.74rem;color:rgba(25,29,35,.62);white-space:nowrap}
  .n{font-weight:600}
  .tix{font-family:ui-monospace,Menlo,monospace;font-size:.62rem;letter-spacing:.04em;text-transform:uppercase;color:#3B7A5C;
    border:1px solid #3B7A5C;border-radius:12px;padding:2px 9px;text-decoration:none;white-space:nowrap}
  .tix:hover{background:#3B7A5C;color:#fff}
  h2{font-size:1rem;margin:1.4rem 0 .5rem}
  .others a{display:inline-block;margin:0 .5rem .4rem 0;color:#33556F;font-size:.82rem}
  .foot{margin-top:2rem;font-family:ui-monospace,Menlo,monospace;font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:rgba(25,29,35,.4)}
  .foot a{color:#33556F}
</style></head>
<body><div class="wrap">
  <div class="hero">
    <h1>${esc(v.name)}</h1>
    <div class="m">${esc(v.region === 'SF' ? 'San Francisco' : v.region)}, CA · ${esc(v.category.replace('-', ' '))} · <a href="${esc(v.url)}" rel="noopener">official site</a></div>
  </div>
  <h2>Upcoming shows${shows.length ? ` (${shows.length})` : ''}</h2>
  ${shows.length ? `<table><tbody>${rows}</tbody></table>` : '<p style="color:rgba(25,29,35,.62)">No shows found in the current window — check the official site.</p>'}
  <h2>More ${esc(v.region === 'SF' ? 'San Francisco' : v.region)} venues</h2>
  <div class="others">${others.map((o) => `<a href="/lineup/venue/${o.id}">${esc(o.name)}</a>`).join('')}</div>
  <div class="foot">Part of <a href="/lineup/sf">Lineup SF</a> — live-music discovery for the Bay Area. Listings via Ticketmaster &amp; venue calendars, updated weekly.</div>
</div></body></html>`);
};
