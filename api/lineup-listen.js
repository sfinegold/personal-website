// /lineup/sf — the San Francisco grid view. Venues run across the top as columns;
// the next 5 weeks stack downward with a row per day. Each cell holds the shows
// at that venue on that day, with album art + a 30-second Apple Music preview
// (via /api/outside-lands?preview=). Reads a stored snapshot — never re-crawls.

const store = require('./_lib/store');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function artistTerm(title) {
  let t = String(title || '');
  const cut = t.search(/\s[-—–]\s|\s\(|:\s|\swith\s|\sw\/\s|\sfeat\.?\s|\spresents\s/i);
  if (cut > 0) t = t.slice(0, cut);
  return t.replace(/\s+/g, ' ').trim();
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function fmtDay(ymd) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtRange(a, b) {
  const f = (y) => new Date(`${y}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${f(a)} – ${f(b)}`;
}
function fmtTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const WEEKS = 5;
const MAX_COLS = 12;

function page(snap) {
  const events = (snap && snap.grid) || [];
  const start = (snap && snap.window && snap.window.start) || new Date().toISOString().slice(0, 10);

  // Columns = venues with the most events (bounded), preserving overall activity.
  const counts = {};
  events.forEach((e) => { counts[e.venue] = (counts[e.venue] || 0) + 1; });
  const venues = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, MAX_COLS);
  const vIndex = new Map(venues.map((v, i) => [v, i]));

  // Bucket events by date|venue.
  const bucket = {};
  let uid = 0;
  events.forEach((e) => {
    if (!vIndex.has(e.venue)) return;
    const k = e.date + '|' + e.venue;
    (bucket[k] = bucket[k] || []).push({ ...e, uid: uid++, term: artistTerm(e.title) });
  });

  const colTemplate = `78px repeat(${venues.length}, 108px)`;

  // header row
  let cells = `<div class="cell corner">Day</div>` +
    venues.map((v) => `<div class="cell vhead">${esc(v)}</div>`).join('');

  // weeks -> days
  for (let w = 0; w < WEEKS; w++) {
    const wStart = addDays(start, w * 7);
    const wEnd = addDays(wStart, 6);
    cells += `<div class="cell weekband">Week of ${esc(fmtRange(wStart, wEnd))}</div>`;
    for (let d = 0; d < 7; d++) {
      const day = addDays(wStart, d);
      cells += `<div class="cell daylab">${esc(fmtDay(day))}</div>`;
      for (const v of venues) {
        const evs = bucket[day + '|' + v] || [];
        if (!evs.length) { cells += `<div class="cell slot"></div>`; continue; }
        const tiles = evs.map((e) => `
          <div class="ev">
            <div class="thumb" data-term="${esc(e.term)}" data-uid="${e.uid}">
              <button class="play" id="p${e.uid}" disabled aria-label="Preview ${esc(e.term)}">&#9654;</button>
            </div>
            <div class="ea">${esc(e.title)}</div>
            <div class="et">${esc(fmtTime(e.time))}</div>
          </div>`).join('');
        cells += `<div class="cell slot">${tiles}</div>`;
      }
    }
  }

  const rec = snap && snap.recommendation ? snap.recommendation : null;

  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Lineup — San Francisco</title><meta name="robots" content="noindex">
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#F7F5F0;--bg2:#EEEAE1;--line:rgba(28,32,38,.14);--text:#191D23;
    --dim:rgba(25,29,35,.62);--faint:rgba(25,29,35,.40);--accent:#4A6E8F;--accent-hi:#33556F;
    --gold:#A8761E;--pick:#3B7A5C;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
  body{background:var(--bg);color:var(--text);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;padding-bottom:88px}
  .top{padding:1.1rem 1.1rem .6rem;border-bottom:2px solid var(--text)}
  h1{font-size:1.4rem;font-weight:700;display:inline}
  .sfx{font-family:var(--mono);font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-left:.5rem}
  .rec{margin:.7rem 1.1rem 0;background:rgba(74,110,143,.09);border-left:3px solid var(--accent);
    border-radius:0 8px 8px 0;padding:.7rem .9rem;font-size:.9rem;line-height:1.5;max-width:60rem}
  .rec b{font-family:var(--mono);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-hi);display:block;margin-bottom:.2rem}
  .scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;margin-top:.7rem}
  .grid{display:grid;grid-template-columns:${colTemplate};min-width:max-content;
    align-items:stretch}
  .cell{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:3px}
  .corner{position:sticky;left:0;top:0;z-index:30;background:var(--bg2);
    font-family:var(--mono);font-size:.6rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);
    display:flex;align-items:center;justify-content:center}
  .vhead{position:sticky;top:0;z-index:20;background:var(--bg2);
    font-size:.72rem;font-weight:700;text-align:center;display:flex;align-items:center;justify-content:center;
    line-height:1.1;min-height:40px}
  .weekband{grid-column:1 / -1;position:sticky;left:0;background:var(--text);color:var(--bg);
    font-family:var(--mono);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;
    padding:5px 10px}
  .daylab{position:sticky;left:0;z-index:10;background:var(--bg);
    font-family:var(--mono);font-size:.58rem;letter-spacing:.01em;color:var(--dim);
    display:flex;align-items:center;line-height:1.1;padding:3px 5px}
  .slot{background:var(--bg);min-height:26px;display:flex;flex-direction:column;gap:4px}
  .ev{display:flex;flex-direction:column}
  .thumb{position:relative;width:100%;aspect-ratio:1;border-radius:6px;overflow:hidden;
    background:linear-gradient(135deg,#e4e0d6,#d3ccbe);background-size:cover;background-position:center;
    border:1px solid var(--line)}
  /* generic album look when there's no artwork match */
  .thumb::after{content:"\\266A";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:1.6rem;color:rgba(25,29,35,.22)}
  .thumb.hasart::after{display:none}
  .play{position:absolute;right:4px;bottom:4px;width:23px;height:23px;border-radius:50%;border:0;
    background:rgba(255,255,255,.94);color:var(--text);font-size:.55rem;cursor:pointer;display:grid;place-items:center;
    box-shadow:0 1px 4px rgba(0,0,0,.3);opacity:0;transition:opacity .15s}
  .thumb.ready .play{opacity:1}
  .play.playing{background:var(--pick);color:#fff}
  .ea{font-size:.62rem;font-weight:600;line-height:1.12;margin-top:2px;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .et{font-family:var(--mono);font-size:.54rem;color:var(--faint);margin-top:1px}
  .now{position:fixed;left:0;right:0;bottom:0;background:var(--bg2);border-top:1px solid var(--line);
    padding:.6rem 1rem;display:none;align-items:center;gap:.7rem;z-index:60}
  .now.on{display:flex}
  .now .a{width:40px;height:40px;border-radius:6px;background:#ccc;background-size:cover;background-position:center;flex:none}
  .now .n{font-size:.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .now .s{font-family:var(--mono);font-size:.6rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
  .now button{margin-left:auto;border:1px solid var(--line);background:var(--bg);border-radius:18px;
    padding:.35rem .8rem;font-family:var(--mono);font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);cursor:pointer}
  .foot{padding:1rem 1.1rem;font-family:var(--mono);font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .foot a{color:var(--accent-hi)}
</style></head>
<body>
  <div class="top"><h1>Your Lineup</h1><span class="sfx">San Francisco · next 5 weeks · previews</span></div>
  ${rec ? `<div class="rec"><b>This week's top pick</b>${esc(rec)}</div>` : ''}
  <div class="scroll"><div class="grid">${cells}</div></div>
  <div class="foot">Tap &#9654; for a 30-second Apple Music preview · <a href="/lineup/me">edit venues</a></div>
  <div class="now" id="now"><div class="a" id="nA"></div><div><div class="n" id="nN">—</div><div class="s" id="nS">now playing</div></div><button onclick="stopAll()">Stop</button></div>
<script>
const audio = new Audio();
const store = {}; // uid -> {previewUrl, art}
let current = null;
function big(u){ return u ? u.replace(/\\/[0-9]+x[0-9]+bb?\\./,'/300x300bb.') : u; }

const io = new IntersectionObserver((ents) => {
  ents.forEach((en) => {
    if (!en.isIntersecting) return;
    const el = en.target; io.unobserve(el);
    const term = el.dataset.term, uid = el.dataset.uid;
    if (!term) return;
    fetch('/api/outside-lands?preview=' + encodeURIComponent(term)).then(r=>r.json()).then(p=>{
      if (!p) return;
      store[uid] = { previewUrl: p.previewUrl || null, art: big(p.artwork) };
      if (p.artwork) { el.style.backgroundImage = 'url("' + big(p.artwork) + '")'; el.classList.add('hasart'); }
      if (p.previewUrl) { el.classList.add('ready'); const b=document.getElementById('p'+uid); if(b) b.disabled=false; }
    }).catch(()=>{});
  });
}, { rootMargin: '300px' });
document.querySelectorAll('.thumb').forEach(t => io.observe(t));

function ico(uid, on){ const b=document.getElementById('p'+uid); if(b){ b.classList.toggle('playing',on); b.innerHTML = on ? '&#10073;&#10073;' : '&#9654;'; } }
function stopAll(){ audio.pause(); if(current!=null) ico(current,false); current=null; document.getElementById('now').classList.remove('on'); }
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('.play'); if(!b) return;
  ev.preventDefault();
  const thumb = b.closest('.thumb'); const uid = thumb.dataset.uid; const s = store[uid];
  if (!s || !s.previewUrl) return;
  if (current === uid) { stopAll(); return; }
  if (current != null) ico(current, false);
  audio.src = s.previewUrl; audio.play().catch(()=>{});
  current = uid; ico(uid, true);
  const ev2 = thumb.closest('.ev');
  document.getElementById('nN').textContent = ev2 ? ev2.querySelector('.ea').textContent : '';
  document.getElementById('nS').textContent = 'now playing · 30s preview';
  document.getElementById('nA').style.backgroundImage = s.art ? 'url("'+s.art+'")' : '';
  document.getElementById('now').classList.add('on');
});
audio.addEventListener('ended', ()=>{ if(current!=null) ico(current,false); document.getElementById('nS').textContent='ended'; });
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
    res.end('<p>listen view error: ' + esc(err.message) + '</p>');
  }
};
