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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232440a8'/%3E%3Ctext x='32' y='46' font-family='Helvetica,Arial,sans-serif' font-size='40' font-weight='800' fill='white' text-anchor='middle'%3EL%3C/text%3E%3C/svg%3E"><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@700;800&family=Instrument+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(v.name)} — Upcoming Shows">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#fafafa;--bg2:#f0f0f1;--card:#ffffff;--line:#e4e4e7;--text:#111113;--dim:#52525b;
    --faint:#71717a;--accent:#2440a8;--accent7:#1a2f7d;--pick:#2440a8;
    --mono:"IBM Plex Mono","SF Mono",ui-monospace,Menlo,monospace}
  body{background:var(--bg);color:var(--text);font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-.012em;
    -webkit-font-smoothing:antialiased;
    background-image:linear-gradient(90deg,#1a2f7d 0%,#2440a8 52%,#7c96f4 100%);background-size:100% 3px;
    background-repeat:no-repeat;background-position:top}
  .wrap{max-width:920px;margin:0 auto;padding:1.2rem 1rem 3rem}
  .bk{font-family:var(--mono);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);text-decoration:none}
  .bk:hover{color:var(--accent)}
  .hero{border-radius:14px;padding:1.6rem 1.4rem;color:var(--bg);margin:.7rem 0 1.4rem;background:var(--text);position:relative}
  .hero::after{content:"";position:absolute;left:0;right:0;bottom:-8px;height:3px;border-radius:2px;
    background:linear-gradient(90deg,#1a2f7d 0%,#2440a8 52%,#7c96f4 100%)}
  .hero h1{font-family:Jost,'Trebuchet MS',sans-serif;font-size:1.7rem;font-weight:800;letter-spacing:-.025em}
  .hero .m{font-family:var(--mono);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;opacity:.85;margin-top:.4rem}
  .hero a{color:#fff}
  h2{font-family:var(--mono);font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin:1.4rem 0 .5rem}
  table{width:100%;border-collapse:collapse;font-size:.88rem}
  td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
  .d,.t{font-family:var(--mono);font-size:.72rem;color:var(--dim);white-space:nowrap;font-variant-numeric:tabular-nums}
  .n{font-weight:600}
  .tix{font-family:var(--mono);font-size:.62rem;letter-spacing:.04em;text-transform:uppercase;color:var(--pick);
    border:1px solid var(--pick);border-radius:11px;height:22px;display:inline-flex;align-items:center;padding:0 9px;text-decoration:none;white-space:nowrap}
  .tix:hover{background:var(--pick);color:#fff}
  .others a{display:inline-block;font-size:.78rem;color:var(--accent7);border:1px solid var(--line);border-radius:999px;background:var(--card);padding:.3rem .7rem;margin:0 .35rem .45rem 0;text-decoration:none}
  .others a:hover{border-color:var(--accent)}
  .foot{margin-top:2rem;font-family:var(--mono);font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .foot a{color:var(--accent7)}
</style></head>
<body><div class="wrap">
  <a class="bk" href="/lineup/sf">&#8592; Your Lineup</a>
  <div class="hero">
    <h1>${esc(v.name)}</h1>
    <div class="m">${esc(v.region === 'SF' ? 'San Francisco' : v.region)}, CA · ${esc(v.category.replace('-', ' '))} · <a href="${esc(v.url)}" rel="noopener">official site</a></div>
  </div>
  <h2>Upcoming shows${shows.length ? ` (${shows.length})` : ''}</h2>
  ${shows.length ? `<table><tbody>${rows}</tbody></table>` : '<p style="color:#71717a">No shows found in the current window — check the official site.</p>'}
  <h2>More ${esc(v.region === 'SF' ? 'San Francisco' : v.region)} venues</h2>
  <div class="others">${others.map((o) => `<a href="/lineup/venue/${o.id}">${esc(o.name)}</a>`).join('')}</div>
  <div class="foot">Part of <a href="/lineup/sf">Lineup SF</a> — live-music discovery for the Bay Area. Listings via Ticketmaster &amp; venue calendars, updated weekly.</div>
</div></body></html>`);
};
