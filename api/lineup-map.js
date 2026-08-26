// /lineup/map — explore Bay Area venues on a map. Leaflet + CartoDB Positron
// (greyscale, matches the mono palette); markers are divIcon SVG discs in the
// design system's icon idiom, with an upcoming-show count badge. Server-rendered
// from venues/bayarea.json (loc baked in) + the snapshot grid.

const store = require('./_lib/store');
const venues = require('./_lib/venues/bayarea.json');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDay = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// glyph per venue vibe — 24px box, 1.75px stroke, currentColor (system icon idiom)
const GLYPHS = {
  note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  sax: '<path d="M7 4v7a7 7 0 0 0 14 0v-1"/><path d="M5 4h4"/><circle cx="18" cy="6" r="1"/><circle cx="15" cy="8" r="1"/>',
  disco: '<circle cx="12" cy="11" r="6"/><path d="M12 5v12M6.8 8h10.4M6.8 14h10.4M12 17l-2 4M12 17l2 4"/>',
  tent: '<path d="M3 20L12 5l9 15"/><path d="M12 11l5 9M12 11l-5 9"/><path d="M2 20h20"/>',
  stadium: '<ellipse cx="12" cy="7" rx="9" ry="3"/><path d="M3 7v9c0 1.7 4 3 9 3s9-1.3 9-3V7"/>',
  mic: '<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v4"/>',
  boat: '<path d="M4 15l8-2 8 2-2 5H6z"/><path d="M12 13V4l5 5h-5"/>',
  theater: '<path d="M4 5h16v6a8 8 0 0 1-16 0z"/><path d="M8 9h.01M16 9h.01M9 12a4 3 0 0 0 6 0"/>',
};
const glyphOf = (v) => {
  const id = v.id;
  if (['mrtipples', 'yoshis', 'keysjazz', 'kuumbwa', 'sfjazz'].includes(id)) return 'sax';
  if (['f8', 'audiosf', 'halcyon', 'temple', 'endup', '1015', 'publicworks', 'monarch', 'greatnorthern', 'dnalounge', 'midway'].includes(id)) return 'disco';
  if (['shoreline', 'greekberkeley', 'frost', 'sterngrove', 'mountainwinery', 'concordpavilion'].includes(id)) return 'tent';
  if (['chase', 'oracle', 'levis', 'oaklandarena', 'sapcenter', 'sjcivic'].includes(id)) return 'stadium';
  if (['punchline', 'cobbs', 'improvsj'].includes(id)) return 'mic';
  if (v.category === 'comedy') return 'mic';
  if (v.category === 'theater' || ['palacefinearts', 'orpheum', 'goldengatetheatre', 'curran'].includes(id)) return 'theater';
  if (v.setting === 'outdoor') return 'tent';
  if (v.category === 'electronic') return 'disco';
  return 'note';
};

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');

  let grid = [];
  try { const snap = await store.getSnapshot('me'); grid = (snap && snap.grid) || []; } catch (e) { /* map renders without shows */ }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

  const pins = venues.filter((v) => v.loc && v.region !== 'aggregator').map((v) => {
    const shows = grid.filter((e) => e.sourceId === v.id && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    return {
      id: v.id, name: v.name, loc: v.loc, region: v.region, glyph: glyphOf(v),
      count: shows.length,
      next: shows.slice(0, 3).map((e) => ({ t: e.title.slice(0, 60), d: fmtDay(e.date), u: e.url || '' })),
    };
  });

  res.statusCode = 200;
  res.end(`<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Venue Map — Lineup SF</title>
<meta name="description" content="Explore ${pins.length} Bay Area music, comedy and sports venues on a map — with upcoming shows from Lineup.">
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232440a8'/%3E%3Ctext x='32' y='46' font-family='Helvetica,Arial,sans-serif' font-size='40' font-weight='800' fill='white' text-anchor='middle'%3EL%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@700;800&family=Instrument+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#fafafa;--bg2:#f0f0f1;--card:#ffffff;--line:#e4e4e7;--text:#111113;--dim:#52525b;
    --faint:#71717a;--accent:#2440a8;--accent7:#1a2f7d;--soft:#e1e6f8;
    --mono:"IBM Plex Mono","SF Mono",ui-monospace,Menlo,monospace}
  html,body{height:100%}
  body{background:var(--bg);color:var(--text);font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif;
    letter-spacing:-.012em;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column}
  .top{background:var(--bg);padding:.8rem 1rem .6rem;border-bottom:1px solid var(--line);
    background-image:linear-gradient(90deg,#1a2f7d 0%,#2440a8 52%,#7c96f4 100%);background-size:100% 3px;background-repeat:no-repeat;background-position:top;
    display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}
  h1{font-family:Jost,'Trebuchet MS',sans-serif;font-size:1.3rem;font-weight:800;letter-spacing:-.025em}
  .bk{font-family:var(--mono);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);text-decoration:none}
  .bk:hover{color:var(--accent)}
  .legend{margin-left:auto;font-family:var(--mono);font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  #map{flex:1;min-height:0}
  .vpin{background:none;border:none}
  .vpin .disc{width:34px;height:34px;border-radius:999px;background:var(--card);border:1px solid var(--line);
    box-shadow:0 1px 2px rgba(17,17,19,.12),0 1px 1px rgba(17,17,19,.06);display:flex;align-items:center;justify-content:center;
    color:var(--accent);position:relative;transition:transform .12s}
  .vpin:hover .disc{transform:translateY(-1px)}
  .vpin .disc svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .vpin .n{position:absolute;top:-5px;right:-7px;min-width:16px;height:16px;border-radius:999px;background:var(--accent);color:#fff;
    font-family:var(--mono);font-size:.56rem;display:flex;align-items:center;justify-content:center;padding:0 4px}
  .vpin.quiet .disc{color:var(--faint)}
  .leaflet-popup-content-wrapper{border-radius:10px;box-shadow:0 2px 6px rgba(17,17,19,.06),0 14px 30px -16px rgba(17,17,19,.26);
    border:1px solid var(--line);background:var(--card);color:var(--text)}
  .leaflet-popup-content{margin:12px 14px;font-family:'Instrument Sans',sans-serif;font-size:.85rem;line-height:1.4}
  .pp h3{font-family:Jost,sans-serif;font-weight:700;font-size:1.05rem;letter-spacing:-.02em;margin-bottom:2px}
  .pp .m{font-family:var(--mono);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:.5rem}
  .pp ul{list-style:none;margin:0 0 .6rem}
  .pp li{font-size:.8rem;padding:2px 0}
  .pp li .d{font-family:var(--mono);font-size:.66rem;color:var(--dim);margin-right:6px;font-variant-numeric:tabular-nums}
  .pp a.pill{font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;color:var(--accent7);
    border:1px solid var(--accent7);border-radius:999px;padding:3px 10px;text-decoration:none;display:inline-block;margin-right:6px}
  .pp a.pill:hover{background:var(--soft)}
  .leaflet-container{font:inherit}
  @media (max-width:560px){ h1{font-size:1.1rem} .legend{display:none} }
</style></head>
<body>
  <div class="top">
    <a class="bk" href="/lineup/sf">&#8592; Lineup</a>
    <h1>Venue Map</h1>
    <span class="legend">${pins.length} venues &middot; badge = upcoming shows</span>
  </div>
  <div id="map"></div>
<script>
const PINS = ${JSON.stringify(pins)};
const GLYPHS = ${JSON.stringify(GLYPHS)};
const map = L.map('map', { zoomControl: true }).setView([37.77, -122.35], 10);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  maxZoom: 19
}).addTo(map);
function icon(p){
  return L.divIcon({ className: 'vpin' + (p.count ? '' : ' quiet'), iconSize: [34,34], iconAnchor: [17,17], popupAnchor: [0,-16],
    html: '<div class="disc"><svg viewBox="0 0 24 24">' + GLYPHS[p.glyph] + '</svg>' + (p.count ? '<span class="n">' + p.count + '</span>' : '') + '</div>' });
}
function popup(p){
  let h = '<div class="pp"><h3>' + p.name + '</h3><div class="m">' + p.region + (p.count ? ' &middot; ' + p.count + ' upcoming' : '') + '</div>';
  if (p.next.length){ h += '<ul>' + p.next.map(s => '<li><span class="d">' + s.d + '</span>' + s.t + '</li>').join('') + '</ul>'; }
  h += '<a class="pill" href="/lineup/venue/' + p.id + '">Venue page</a>';
  h += '<a class="pill" href="/lineup/sf">Lineup</a></div>';
  return h;
}
const markers = PINS.map(p => L.marker(p.loc, { icon: icon(p), title: p.name, zIndexOffset: p.count }).bindPopup(popup(p), { maxWidth: 300 }).addTo(map));
// deep link ?v=<id> centers that venue and opens its popup
const vq = new URLSearchParams(location.search).get('v');
if (vq){ const i = PINS.findIndex(p => p.id === vq); if (i >= 0){ map.setView(PINS[i].loc, 14); markers[i].openPopup(); } }
</script>
</body></html>`);
};
