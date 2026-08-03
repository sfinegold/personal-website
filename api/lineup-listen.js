// /lineup/sf — the San Francisco "listen" view. Renders Sam's latest digest
// snapshot as Apple-Music-style cards: album art + a 30-second preview per
// artist (via the existing /api/outside-lands?preview= iTunes lookup), in the
// Outside Lands warm SF palette. Reads a stored snapshot, so it never re-crawls.

const store = require('./_lib/store');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Reduce an event title to a searchable artist name for the music lookup.
function artistTerm(title) {
  let t = String(title || '');
  // cut at the first structural delimiter (tour name, support, subtitle, parenthetical)
  const cut = t.search(/\s[-—–]\s|\s\(|:\s|\swith\s|\sw\/\s|\sfeat\.?\s|\spresents\s/i);
  if (cut > 0) t = t.slice(0, cut);
  return t.replace(/\s+/g, ' ').trim();
}

const CAT_LABEL = { 'live-music': 'Live', electronic: 'Electronic', comedy: 'Comedy', jazz: 'Jazz', sports: 'Sports', classical: 'Classical', theater: 'Theater' };

function fmtDate(ymd, time) {
  const d = new Date(`${ymd}T12:00:00Z`);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (!time) return day;
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${day} · ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function page(snap) {
  const kept = (snap && snap.kept) || [];
  const cards = kept.map((e, i) => {
    const term = artistTerm(e.title);
    return { i, title: e.title, term, venue: e.venue, when: fmtDate(e.date, e.time), cat: e.cat || e.category, url: e.url };
  });
  const data = JSON.stringify(cards.map((c) => ({ i: c.i, term: c.term })));

  const cardHtml = cards.map((c) => `
    <a class="card" id="card-${c.i}" href="${esc(c.url || '#')}" target="_blank" rel="noopener">
      <div class="art" id="art-${c.i}">
        <button class="play" id="play-${c.i}" aria-label="Preview ${esc(c.term)}" disabled onclick="return toggle(event, ${c.i})">
          <span class="ico">&#9654;</span>
        </button>
      </div>
      <div class="meta">
        <div class="ttl">${esc(c.title)}</div>
        <div class="sub">${esc(c.venue)}</div>
        <div class="sub2"><span class="chip chip-${esc(c.cat)}">${esc(CAT_LABEL[c.cat] || 'Event')}</span> ${esc(c.when)}</div>
      </div>
    </a>`).join('');

  const rec = snap && snap.recommendation ? snap.recommendation : null;
  const range = snap && snap.window ? `${snap.window.start} → ${snap.window.end}` : '';

  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Lineup — San Francisco</title>
<meta name="robots" content="noindex">
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{
    --bg:#F7F5F0;--bg2:#EEEAE1;--line:rgba(28,32,38,.13);--text:#191D23;
    --dim:rgba(25,29,35,.62);--faint:rgba(25,29,35,.40);
    --accent:#4A6E8F;--accent-hi:#33556F;--gold:#A8761E;--pick:#3B7A5C;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }
  body{background:var(--bg);color:var(--text);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;letter-spacing:.01em;padding:0 0 96px}
  .wrap{max-width:1040px;margin:0 auto;padding:1.4rem 1.1rem}
  header{display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap;
    border-bottom:2px solid var(--text);padding-bottom:.5rem}
  h1{font-size:1.5rem;font-weight:700;letter-spacing:.01em}
  .sfx{font-family:var(--mono);font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
  .rec{background:rgba(74,110,143,.09);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;
    padding:.85rem 1rem;margin:1.1rem 0 .3rem}
  .rec .lab{font-family:var(--mono);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;
    color:var(--accent-hi);font-weight:700;margin-bottom:.25rem}
  .rec p{font-size:.95rem;line-height:1.5;color:var(--text)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:1.1rem 1rem;margin-top:1.4rem}
  .card{display:block;text-decoration:none;color:inherit}
  .art{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;
    background:linear-gradient(135deg,#Dfe6e6,#cbd3d8);border:1px solid var(--line);
    background-size:cover;background-position:center;box-shadow:0 1px 3px rgba(28,32,38,.1)}
  .card:hover .art{box-shadow:0 3px 10px rgba(28,32,38,.18)}
  .play{position:absolute;right:8px;bottom:8px;width:38px;height:38px;border-radius:50%;
    border:0;background:rgba(255,255,255,.92);color:var(--text);cursor:pointer;
    display:grid;place-items:center;box-shadow:0 2px 6px rgba(0,0,0,.25);opacity:0;transition:opacity .15s,transform .1s}
  .art.ready .play{opacity:1}
  .play:hover{transform:scale(1.08)}
  .play:disabled{cursor:default}
  .play .ico{font-size:.8rem;margin-left:2px}
  .play.playing .ico{margin-left:0}
  .meta{padding:.5rem .1rem 0}
  .ttl{font-size:.86rem;font-weight:600;line-height:1.25;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .sub{font-size:.78rem;color:var(--dim);margin-top:2px}
  .sub2{font-size:.72rem;color:var(--faint);margin-top:3px;display:flex;align-items:center;gap:.4rem}
  .chip{font-family:var(--mono);font-size:.6rem;letter-spacing:.04em;text-transform:uppercase;
    padding:1px 6px;border-radius:5px;background:rgba(28,32,38,.07);color:var(--dim)}
  .chip-electronic{background:rgba(74,110,143,.16);color:var(--accent-hi)}
  .chip-live-music{background:rgba(168,118,30,.16);color:var(--gold)}
  .chip-jazz{background:rgba(59,122,92,.16);color:var(--pick)}
  .now{position:fixed;left:0;right:0;bottom:0;background:var(--bg2);border-top:1px solid var(--line);
    padding:.7rem 1rem;display:none;align-items:center;gap:.8rem;z-index:50}
  .now.on{display:flex}
  .now .np-art{width:44px;height:44px;border-radius:6px;background-size:cover;background-position:center;flex:none;background:#ccc}
  .now .np-txt{min-width:0}
  .now .np-a{font-size:.9rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .now .np-s{font-family:var(--mono);font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
  .now .np-stop{margin-left:auto;border:1px solid var(--line);background:var(--bg);border-radius:20px;
    padding:.4rem .9rem;font-family:var(--mono);font-size:.66rem;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;color:var(--dim)}
  .empty{margin-top:2rem;color:var(--dim);font-size:.95rem}
  .foot{margin-top:2rem;font-family:var(--mono);font-size:.64rem;letter-spacing:.06em;
    text-transform:uppercase;color:var(--faint)}
  .foot a{color:var(--accent-hi)}
</style></head>
<body>
<div class="wrap">
  <header><h1>Your Lineup</h1><span class="sfx">San Francisco · previews</span></header>
  ${rec ? `<div class="rec"><div class="lab">This week's top pick</div><p>${esc(rec)}</p></div>` : ''}
  ${cards.length ? `<div class="grid">${cardHtml}</div>` : '<div class="empty">No shows in the current window yet.</div>'}
  <div class="foot">Tap &#9654; for a 30-second Apple Music preview · <a href="/lineup/me">edit venues</a></div>
</div>
<div class="now" id="now">
  <div class="np-art" id="npArt"></div>
  <div class="np-txt"><div class="np-a" id="npA">—</div><div class="np-s" id="npS">now playing</div></div>
  <button class="np-stop" onclick="stopAll()">Stop</button>
</div>
<script>
const CARDS = ${data};
const audio = new Audio();
const state = {}; // i -> {previewUrl, art, term}
let current = null;

function big(url){ return url ? url.replace(/\\/[0-9]+x[0-9]+bb?\\./,'/400x400bb.') : url; }

CARDS.forEach(c => {
  if (!c.term) return;
  fetch('/api/outside-lands?preview=' + encodeURIComponent(c.term))
    .then(r => r.json()).then(p => {
      if (!p) return;
      state[c.i] = { previewUrl: p.previewUrl || null, art: big(p.artwork), term: c.term };
      const artEl = document.getElementById('art-' + c.i);
      if (p.artwork && artEl) { artEl.style.backgroundImage = 'url("' + big(p.artwork) + '")'; }
      if (p.previewUrl) {
        artEl && artEl.classList.add('ready');
        const b = document.getElementById('play-' + c.i);
        if (b) b.disabled = false;
      }
    }).catch(()=>{});
});

function setIco(i, playing){
  const b = document.getElementById('play-' + i);
  if (!b) return;
  b.classList.toggle('playing', playing);
  b.querySelector('.ico').innerHTML = playing ? '&#10073;&#10073;' : '&#9654;';
}
function stopAll(){
  audio.pause();
  if (current != null) setIco(current, false);
  current = null;
  document.getElementById('now').classList.remove('on');
}
function toggle(ev, i){
  ev.preventDefault();
  const s = state[i];
  if (!s || !s.previewUrl) return false;
  if (current === i) { stopAll(); return false; }
  if (current != null) setIco(current, false);
  audio.src = s.previewUrl;
  audio.play().catch(()=>{});
  current = i;
  setIco(i, true);
  const card = document.getElementById('card-' + i);
  const ttl = card ? card.querySelector('.ttl').textContent : s.term;
  document.getElementById('npA').textContent = ttl;
  document.getElementById('npS').textContent = 'now playing · 30s preview';
  document.getElementById('npArt').style.backgroundImage = s.art ? 'url("' + s.art + '")' : '';
  document.getElementById('now').classList.add('on');
  return false;
}
audio.addEventListener('ended', () => { if (current != null) setIco(current, false); document.getElementById('npS').textContent = 'ended'; });
</script>
</body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const snap = await store.getSnapshot('me');
    res.statusCode = 200;
    res.end(page(snap));
  } catch (err) {
    res.statusCode = 500;
    res.end('<p>Lineup listen view error: ' + esc(err.message) + '</p>');
  }
};
