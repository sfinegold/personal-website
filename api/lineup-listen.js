// /lineup/sf — San Francisco grid view. Venues are columns, grouped into
// Music / Comedy / Sports; the next 5 weeks stack down with a row per day.
// Group bands, venue headers and the current week all stick while scrolling.
// Each cell shows album art + a 30-second Apple Music preview. Reads a snapshot.

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
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function groupOf(cat) {
  return cat === 'comedy' ? 'Comedy' : cat === 'sports' ? 'Sports' : 'Music';
}
const GORDER = { Music: 0, Comedy: 1, Sports: 2 };

const WEEKS = 5;
const MAX_COLS = 16;

function page(snap) {
  const events = (snap && snap.grid) || [];
  const start = (snap && snap.window && snap.window.start) || new Date().toISOString().slice(0, 10);

  // Venue columns, grouped (Music, then Comedy, then Sports), busiest first within a group.
  const counts = {}, venueCat = {};
  events.forEach((e) => { counts[e.venue] = (counts[e.venue] || 0) + 1; if (!venueCat[e.venue]) venueCat[e.venue] = e.category; });
  const venues = Object.keys(counts).sort((a, b) => {
    const g = GORDER[groupOf(venueCat[a])] - GORDER[groupOf(venueCat[b])];
    return g || counts[b] - counts[a];
  }).slice(0, MAX_COLS);

  // contiguous group runs for the group header bands
  const runs = [];
  venues.forEach((v) => {
    const g = groupOf(venueCat[v]);
    const last = runs[runs.length - 1];
    if (last && last.g === g) last.n++; else runs.push({ g, n: 1 });
  });

  const bucket = {};
  let uid = 0;
  events.forEach((e) => {
    if (!venues.includes(e.venue)) return;
    (bucket[e.date + '|' + e.venue] = bucket[e.date + '|' + e.venue] || []).push({ ...e, uid: uid++, term: artistTerm(e.title) });
  });

  // group header row
  let cells = `<div class="cell corner g"></div>` +
    runs.map((r) => `<div class="cell groupband gb-${r.g}" style="grid-column:span ${r.n}">${esc(r.g)}</div>`).join('');
  // venue header row
  cells += `<div class="cell corner d">Day</div>` +
    venues.map((v) => `<div class="cell vhead">${esc(v)}</div>`).join('');

  for (let w = 0; w < WEEKS; w++) {
    const wStart = addDays(start, w * 7);
    cells += `<div class="cell weekband">Week of ${esc(fmtRange(wStart, addDays(wStart, 6)))}</div>`;
    for (let d = 0; d < 7; d++) {
      const day = addDays(wStart, d);
      cells += `<div class="cell daylab">${esc(fmtDay(day))}</div>`;
      for (const v of venues) {
        const evs = bucket[day + '|' + v] || [];
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
  const cols = `var(--dw) repeat(${venues.length}, var(--cw))`;

  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Your Lineup — San Francisco</title><meta name="robots" content="noindex">
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#F7F5F0;--bg2:#EEEAE1;--line:rgba(28,32,38,.14);--text:#191D23;
    --dim:rgba(25,29,35,.62);--faint:rgba(25,29,35,.40);--accent:#4A6E8F;--accent-hi:#33556F;
    --gold:#A8761E;--pick:#3B7A5C;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    --dw:78px;--cw:108px;--gh:22px;--vh:46px}
  html{-webkit-text-size-adjust:100%}
  /* whole page is a fixed-height flex column; the grid wrapper is the only
     scroller (both axes) so position:sticky headers anchor to its viewport */
  body{background:var(--bg);color:var(--text);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden}
  .top{flex:none;padding:1rem 1.1rem .55rem;border-bottom:2px solid var(--text);
    display:flex;align-items:center;justify-content:space-between;gap:.6rem}
  .rbtn{flex:none;font-family:var(--mono);font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;
    padding:.5rem .9rem;border-radius:20px;border:1px solid var(--pick);background:var(--pick);color:#fff;cursor:pointer}
  .rbtn.on{background:transparent;color:var(--pick)}
  h1{font-size:1.35rem;font-weight:700;display:inline}
  .sfx{font-family:var(--mono);font-size:.66rem;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);margin-left:.5rem}
  .rec{flex:none;margin:.65rem 1.1rem .55rem;background:rgba(74,110,143,.09);border-left:3px solid var(--accent);
    border-radius:0 8px 8px 0;padding:.7rem .9rem;font-size:.9rem;line-height:1.5;max-width:60rem}
  .rec b{font-family:var(--mono);font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-hi);display:block;margin-bottom:.2rem}
  .scroll{flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
  .grid{display:grid;grid-template-columns:${cols};min-width:max-content;align-items:stretch}
  .cell{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:3px}
  /* sticky stack: group bands (top:0) -> venue headers (top:gh) -> week band (top:gh+vh) */
  .corner{position:sticky;left:0;background:var(--bg2);display:flex;align-items:center;justify-content:center;
    font-family:var(--mono);font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .corner.g{top:0;z-index:46;height:var(--gh)}
  .corner.d{top:var(--gh);z-index:44;height:var(--vh)}
  .groupband{position:sticky;top:0;z-index:40;height:var(--gh);color:#fff;
    font-family:var(--mono);font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;
    display:flex;align-items:center;justify-content:center}
  .gb-Music{background:var(--accent)}.gb-Comedy{background:var(--gold)}.gb-Sports{background:var(--pick)}
  .vhead{position:sticky;top:var(--gh);z-index:32;background:var(--bg2);height:var(--vh);
    font-size:.68rem;font-weight:700;text-align:center;line-height:1.1;display:flex;align-items:center;justify-content:center}
  .weekband{grid-column:1 / -1;position:sticky;top:calc(var(--gh) + var(--vh));left:0;z-index:24;
    background:var(--text);color:var(--bg);font-family:var(--mono);font-size:.6rem;letter-spacing:.1em;
    text-transform:uppercase;padding:5px 10px}
  .daylab{position:sticky;left:0;z-index:14;background:var(--bg);
    font-family:var(--mono);font-size:.57rem;letter-spacing:0;color:var(--dim);
    display:flex;align-items:center;line-height:1.1;padding:3px 5px}
  .slot{background:var(--bg);min-height:26px;display:flex;flex-direction:column;gap:4px}
  .ev{display:flex;flex-direction:column}
  .thumb{position:relative;width:100%;aspect-ratio:1;border-radius:6px;overflow:hidden;
    background:linear-gradient(135deg,#e4e0d6,#d3ccbe);background-size:cover;background-position:center;border:1px solid var(--line)}
  .thumb::after{content:"\\266A";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:1.5rem;color:rgba(25,29,35,.22)}
  .thumb.hasart::after{display:none}
  .play{position:absolute;right:4px;bottom:4px;width:24px;height:24px;border-radius:50%;border:0;
    background:rgba(255,255,255,.94);color:var(--text);font-size:.55rem;cursor:pointer;display:grid;place-items:center;
    box-shadow:0 1px 4px rgba(0,0,0,.3);opacity:0;transition:opacity .15s}
  .thumb.ready .play{opacity:1}
  .play.playing{background:var(--pick);color:#fff}
  .thumb.now{box-shadow:0 0 0 3px var(--pick)}
  .ea{font-size:.62rem;font-weight:600;line-height:1.12;margin-top:2px;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .et{font-family:var(--mono);font-size:.54rem;color:var(--faint);margin-top:1px}
  .now{position:fixed;left:0;right:0;bottom:0;background:var(--bg2);border-top:1px solid var(--line);
    padding:.55rem .9rem calc(.55rem + env(safe-area-inset-bottom));display:none;align-items:center;gap:.7rem;z-index:60}
  .now.on{display:flex}
  .now .a{width:38px;height:38px;border-radius:6px;background:#ccc;background-size:cover;background-position:center;flex:none}
  .now .n{font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .now .s{font-family:var(--mono);font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .now button{margin-left:auto;border:1px solid var(--line);background:var(--bg);border-radius:18px;
    padding:.35rem .8rem;font-family:var(--mono);font-size:.6rem;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);cursor:pointer}
  .foot{flex:none;padding:.6rem 1.1rem;font-family:var(--mono);font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .foot a{color:var(--accent-hi)}
  @media (max-width:640px){
    :root{--dw:52px;--cw:82px;--gh:19px;--vh:36px}
    h1{font-size:1.1rem}
    .top{padding:.7rem .7rem .4rem}
    .rec{margin:.5rem .7rem 0;font-size:.82rem;padding:.55rem .7rem}
    .vhead{font-size:.58rem}
    .daylab{font-size:.5rem}
    .ea{font-size:.56rem}
  }
</style></head>
<body>
  <div class="top">
    <div><h1>Your Lineup</h1> <span class="sfx">San Francisco · next 5 weeks</span></div>
    <button class="rbtn" id="rbtn" onclick="toggleRadio()">&#9654; Play</button>
  </div>
  ${rec ? `<div class="rec"><b>This week's top pick</b>${esc(rec)}</div>` : ''}
  <div class="scroll"><div class="grid">${cells}</div></div>
  <div class="foot">Play = auto-preview every act · space = play/pause · &rarr; or S = skip · <a href="/lineup/me">edit venues</a></div>
  <div class="now" id="now"><div class="a" id="nA"></div><div><div class="n" id="nN">—</div><div class="s" id="nS">now playing</div></div><button onclick="skip()">Skip &#9197;</button><button onclick="stopAll()">Stop</button></div>
<script>
const audio = new Audio();
const store = {};                 // uid -> {previewUrl, art, p:Promise}
let current = null, qi = null;     // current uid, radio queue index
const $ = (id) => document.getElementById(id);
function big(u){ return u ? u.replace(/\\/[0-9]+x[0-9]+bb?\\./,'/300x300bb.') : u; }

const thumbs = [...document.querySelectorAll('.thumb')];
const queue = thumbs.map(t => ({ uid: t.dataset.uid, term: t.dataset.term }));
const uidIndex = {}; queue.forEach((q,i) => uidIndex[q.uid] = i);

// cached, de-duped preview fetch — also paints art + enables the tile button
function loadPreview(uid, term){
  if (store[uid] && store[uid].p) return store[uid].p;
  store[uid] = store[uid] || {};
  store[uid].p = fetch('/api/outside-lands?preview=' + encodeURIComponent(term)).then(r=>r.json()).then(p=>{
    const el = document.querySelector('.thumb[data-uid="'+uid+'"]');
    const rec = { previewUrl:(p&&p.previewUrl)||null, art:(p&&p.artwork)?big(p.artwork):null };
    store[uid].previewUrl = rec.previewUrl; store[uid].art = rec.art;
    if (el){ if(rec.art){ el.style.backgroundImage='url("'+rec.art+'")'; el.classList.add('hasart'); }
      if(rec.previewUrl){ el.classList.add('ready'); const b=$('p'+uid); if(b) b.disabled=false; } }
    return rec;
  }).catch(()=>({previewUrl:null, art:null}));
  return store[uid].p;
}

// lazy-load art/preview for tiles as they scroll into view
const io = new IntersectionObserver((ents)=>{ ents.forEach(en=>{ if(!en.isIntersecting) return;
  io.unobserve(en.target); if(en.target.dataset.term) loadPreview(en.target.dataset.uid, en.target.dataset.term); }); }, { rootMargin:'400px' });
thumbs.forEach(t => io.observe(t));

function setRbtn(on){ const b=$('rbtn'); b.innerHTML = on ? '&#10073;&#10073; Pause' : '&#9654; Play'; b.classList.toggle('on', on); }
function markNow(uid){ document.querySelectorAll('.thumb.now').forEach(e=>e.classList.remove('now'));
  const el=document.querySelector('.thumb[data-uid="'+uid+'"]'); if(el){ el.classList.add('now'); el.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}); } }

function playIndex(i){
  if (i < 0 || i >= queue.length){ stopAll(); return; }
  const it = queue[i];
  loadPreview(it.uid, it.term).then(rec=>{
    if (qi !== null && queue[qi] !== it && !audio.paused) {} // no-op guard
    if (rec.previewUrl){
      qi = i; current = it.uid;
      audio.src = rec.previewUrl; audio.play().catch(()=>{});
      markNow(it.uid); setRbtn(true);
      const el = document.querySelector('.thumb[data-uid="'+it.uid+'"]');
      $('nN').textContent = el ? el.closest('.ev').querySelector('.ea').textContent : it.term;
      $('nS').textContent = 'now playing · 30s preview';
      $('nA').style.backgroundImage = rec.art ? 'url("'+rec.art+'")' : '';
      $('now').classList.add('on');
    } else {
      playIndex(i + 1); // no preview for this act — skip to the next
    }
  });
}
function toggleRadio(){
  if (current !== null && !audio.paused){ audio.pause(); setRbtn(false); return; }
  if (current !== null && audio.paused && audio.src){ audio.play(); setRbtn(true); return; }
  playIndex(0);
}
function skip(){ playIndex((qi === null ? -1 : qi) + 1); }
function stopAll(){ audio.pause(); document.querySelectorAll('.thumb.now').forEach(e=>e.classList.remove('now'));
  $('now').classList.remove('on'); qi = null; current = null; setRbtn(false); }

// clicking a tile's play button starts the radio from that act
document.addEventListener('click', (ev)=>{ const b = ev.target.closest('.play'); if(!b) return;
  ev.preventDefault(); const uid = b.closest('.thumb').dataset.uid; const i = uidIndex[uid]; if(i != null) playIndex(i); });

// keyboard: space = play/pause, arrow-right / s / n = skip, esc = stop
document.addEventListener('keydown', (e)=>{
  if (e.target.matches('input,textarea,select')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space'){ e.preventDefault(); toggleRadio(); }
  else if (e.key === 'ArrowRight' || k === 's' || k === 'n'){ e.preventDefault(); skip(); }
  else if (e.key === 'Escape'){ stopAll(); }
});
audio.addEventListener('ended', skip); // auto-advance through the lineup
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
