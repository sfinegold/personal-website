// /lineup/sf — San Francisco listen view. Compact day×group matrix: columns are
// the groups (Music, Sports, Comedy — comedy on the right), rows are days that
// have shows (empty days removed). Small cards so ~a week fits on screen; each
// card = album art + 30-sec Apple Music preview, with venue next to the time.
// Group headers stick to the top, day labels to the left. Reads a snapshot.

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
function fmtTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDay(ymd) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function groupOf(cat) {
  return cat === 'comedy' ? 'Comedy' : cat === 'sports' ? 'Sports' : 'Music';
}
const GROUP_ORDER = ['Music', 'Sports', 'Comedy']; // comedy on the right

function page(snap) {
  const events = (snap && snap.grid) || [];
  const rec = snap && snap.recommendation ? snap.recommendation : null;

  const groups = GROUP_ORDER.filter((g) => events.some((e) => groupOf(e.category) === g));
  const byCell = {}; const daySet = new Set();
  events.forEach((e) => {
    const d = e.date, g = groupOf(e.category);
    byCell[d] = byCell[d] || {}; (byCell[d][g] = byCell[d][g] || []).push(e); daySet.add(d);
  });
  const days = [...daySet].sort();

  let uid = 0;
  const card = (e) => {
    const id = uid++;
    const term = artistTerm(e.title);
    const key = esc(`${e.sourceId}|${e.title}|${e.date}`);
    const meta = [fmtTime(e.time), e.venue].filter(Boolean).join(' · ');
    return `<div class="ev" data-key="${key}">
      <div class="thumb" data-term="${esc(term)}" data-uid="${id}">
        <button class="heart" aria-label="Save show">&#9825;</button>
        <button class="play" id="p${id}" disabled aria-label="Preview ${esc(term)}">&#9654;</button>
      </div>
      <div class="ea">${esc(e.title)}</div>
      <div class="cm">${esc(meta)}</div>
    </div>`;
  };

  const cols = `62px repeat(${groups.length}, minmax(118px, 1fr))`;
  let cells = `<div class="cell corner">Day</div>` +
    groups.map((g) => `<div class="cell ghead gb-${g}">${g}</div>`).join('');
  for (const d of days) {
    cells += `<div class="cell daylab">${esc(fmtDay(d))}</div>`;
    for (const g of groups) {
      const evs = (byCell[d][g] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      cells += `<div class="cell cbody">${evs.map(card).join('')}</div>`;
    }
  }
  if (!days.length) cells = '<div class="empty">No shows in the current window yet.</div>';

  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Your Lineup — San Francisco</title><meta name="robots" content="noindex">
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#F7F5F0;--bg2:#EEEAE1;--line:rgba(28,32,38,.14);--text:#191D23;
    --dim:rgba(25,29,35,.62);--faint:rgba(25,29,35,.40);--accent:#4A6E8F;--accent-hi:#33556F;
    --gold:#A8761E;--pick:#3B7A5C;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--cw:74px}
  html{-webkit-text-size-adjust:100%}
  body{background:var(--bg);color:var(--text);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden}
  .top{flex:none;padding:.85rem 1.1rem .5rem;border-bottom:2px solid var(--text);
    display:flex;align-items:center;justify-content:space-between;gap:.6rem}
  h1{font-size:1.3rem;font-weight:700;display:inline}
  .sfx{font-family:var(--mono);font-size:.64rem;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);margin-left:.5rem}
  .rbtn{flex:none;font-family:var(--mono);font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;
    padding:.5rem .9rem;border-radius:20px;border:1px solid var(--pick);background:var(--pick);color:#fff;cursor:pointer}
  .rbtn.on{background:transparent;color:var(--pick)}
  .rbtn.heartbtn{border-color:#c0324b;background:transparent;color:#c0324b}
  .rbtn.heartbtn.on{background:#c0324b;color:#fff}
  .rec{flex:none;margin:.6rem 1.1rem .5rem;background:rgba(74,110,143,.09);border-left:3px solid var(--accent);
    border-radius:0 8px 8px 0;padding:.6rem .85rem;font-size:.86rem;line-height:1.45;max-width:64rem}
  .rec b{font-family:var(--mono);font-size:.56rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-hi);display:block;margin-bottom:.15rem}
  .scroll{flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
  .grid{display:grid;grid-template-columns:${cols};min-width:max-content;align-items:stretch}
  .cell{border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
  .corner{position:sticky;top:0;left:0;z-index:40;background:var(--bg2);display:flex;align-items:center;justify-content:center;
    font-family:var(--mono);font-size:.56rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);height:26px}
  .ghead{position:sticky;top:0;z-index:30;height:26px;color:#fff;font-family:var(--mono);font-size:.6rem;
    letter-spacing:.14em;text-transform:uppercase;display:flex;align-items:center;justify-content:center}
  .gb-Music{background:var(--accent)}.gb-Comedy{background:var(--gold)}.gb-Sports{background:var(--pick)}
  .daylab{position:sticky;left:0;z-index:14;background:var(--bg);
    font-family:var(--mono);font-size:.56rem;letter-spacing:0;color:var(--dim);
    display:flex;align-items:center;line-height:1.1;padding:4px 5px}
  .cbody{background:var(--bg);display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;padding:5px;min-height:24px}
  .ev{width:var(--cw);display:flex;flex-direction:column}
  .thumb{position:relative;width:100%;aspect-ratio:1;border-radius:6px;overflow:hidden;
    background:linear-gradient(135deg,#e4e0d6,#d3ccbe);background-size:cover;background-position:center;border:1px solid var(--line)}
  .thumb::after{content:"\\266A";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:1.3rem;color:rgba(25,29,35,.22)}
  .thumb.hasart::after{display:none}
  .heart{position:absolute;top:3px;left:3px;width:18px;height:18px;border:0;border-radius:50%;
    background:rgba(255,255,255,.85);color:#c0324b;font-size:.58rem;cursor:pointer;display:grid;place-items:center;line-height:1;opacity:0;transition:opacity .12s;z-index:2}
  .thumb:hover .heart{opacity:1}
  .ev.hearted .heart{opacity:1;background:#c0324b;color:#fff}
  .play{position:absolute;right:3px;bottom:3px;width:20px;height:20px;border-radius:50%;border:0;
    background:rgba(255,255,255,.94);color:var(--text);font-size:.5rem;cursor:pointer;display:grid;place-items:center;
    box-shadow:0 1px 3px rgba(0,0,0,.3);opacity:0;transition:opacity .15s}
  .thumb.ready .play{opacity:1}
  .play.playing,.thumb.now .play{background:var(--pick);color:#fff}
  .thumb.now{box-shadow:0 0 0 2px var(--pick)}
  .ea{font-size:.6rem;font-weight:600;line-height:1.1;margin-top:3px;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .cm{font-size:.55rem;color:var(--faint);margin-top:1px;line-height:1.15;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .empty{padding:2rem;color:var(--dim)}
  body.hearts-only .ev:not(.hearted){display:none}
  .now{position:fixed;left:0;right:0;bottom:0;background:var(--bg2);border-top:1px solid var(--line);
    padding:.55rem .9rem calc(.55rem + env(safe-area-inset-bottom));display:none;align-items:center;gap:.7rem;z-index:60}
  .now.on{display:flex}
  .now .a{width:38px;height:38px;border-radius:6px;background:#ccc;background-size:cover;background-position:center;flex:none}
  .now .n{font-size:.84rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .now .s{font-family:var(--mono);font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .now button{border:1px solid var(--line);background:var(--bg);border-radius:18px;
    padding:.4rem .8rem;font-family:var(--mono);font-size:.6rem;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);cursor:pointer}
  .now .sk{margin-left:auto}
  @media (max-width:560px){ :root{--cw:66px} h1{font-size:1.05rem} .top{padding:.6rem .7rem .4rem} .rec{margin:.5rem .7rem .4rem;font-size:.8rem} }
</style></head>
<body>
  <div class="top">
    <h1>Your Lineup</h1>
    <div style="display:flex;gap:.5rem;flex:none">
      <button class="rbtn heartbtn" id="heartsBtn" onclick="toggleHeartsOnly()">&#9829; <span id="hc">0</span></button>
      <button class="rbtn" id="rbtn" onclick="toggleRadio()">&#9654; Play</button>
    </div>
  </div>
  <div class="scroll"><div class="grid">${cells}</div></div>
  <div class="now" id="now"><div class="a" id="nA"></div><div><div class="n" id="nN">—</div><div class="s" id="nS">now playing</div></div><button class="sk" onclick="skip()">Skip &#9197;</button><button onclick="stopAll()">Stop</button></div>
<script>
const audio = new Audio();
const store = {};
let current = null, qi = null;
const $ = (id) => document.getElementById(id);
function big(u){ return u ? u.replace(/\\/[0-9]+x[0-9]+bb?\\./,'/300x300bb.') : u; }
const thumbs = [...document.querySelectorAll('.thumb')];
const queue = thumbs.map(t => ({ uid: t.dataset.uid, term: t.dataset.term }));
const uidIndex = {}; queue.forEach((q,i) => uidIndex[q.uid] = i);
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
const io = new IntersectionObserver((ents)=>{ ents.forEach(en=>{ if(!en.isIntersecting) return;
  io.unobserve(en.target); if(en.target.dataset.term) loadPreview(en.target.dataset.uid, en.target.dataset.term); }); }, { rootMargin:'400px' });
thumbs.forEach(t => io.observe(t));
function setRbtn(on){ const b=$('rbtn'); b.innerHTML = on ? '&#10073;&#10073; Pause' : '&#9654; Play'; b.classList.toggle('on', on); }
function markNow(uid, scroll){ document.querySelectorAll('.thumb.now').forEach(e=>e.classList.remove('now'));
  const el=document.querySelector('.thumb[data-uid="'+uid+'"]'); if(el){ el.classList.add('now'); if(scroll) el.scrollIntoView({block:'center',behavior:'smooth'}); } }
function playIndex(i, scroll){
  if (i < 0 || i >= queue.length){ stopAll(); return; }
  const it = queue[i];
  loadPreview(it.uid, it.term).then(rec=>{
    if (rec.previewUrl){
      qi = i; current = it.uid;
      audio.src = rec.previewUrl; audio.play().catch(()=>{});
      markNow(it.uid, scroll); setRbtn(true);
      const el = document.querySelector('.thumb[data-uid="'+it.uid+'"]');
      $('nN').textContent = el ? el.closest('.ev').querySelector('.ea').textContent : it.term;
      $('nS').textContent = 'now playing · 30s preview';
      $('nA').style.backgroundImage = rec.art ? 'url("'+rec.art+'")' : '';
      $('now').classList.add('on');
    } else { playIndex(i + 1, scroll); }
  });
}
function toggleRadio(){
  if (current !== null && !audio.paused){ audio.pause(); setRbtn(false); return; }
  if (current !== null && audio.paused && audio.src){ audio.play(); setRbtn(true); return; }
  playIndex(0, true);
}
function skip(){ playIndex((qi === null ? -1 : qi) + 1, true); }
function stopAll(){ audio.pause(); document.querySelectorAll('.thumb.now').forEach(e=>e.classList.remove('now'));
  $('now').classList.remove('on'); qi = null; current = null; setRbtn(false); }
document.addEventListener('click', (ev)=>{ const b = ev.target.closest('.play'); if(!b) return;
  ev.preventDefault(); const uid = b.closest('.thumb').dataset.uid; const i = uidIndex[uid]; if(i != null) playIndex(i, false); });
document.addEventListener('keydown', (e)=>{
  if (e.target.matches('input,textarea,select')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space'){ e.preventDefault(); toggleRadio(); }
  else if (e.key === 'ArrowRight' || k === 's' || k === 'n'){ e.preventDefault(); skip(); }
  else if (e.key === 'Escape'){ stopAll(); }
});
audio.addEventListener('ended', skip);
const HK = 'lineup_sf_hearts';
let hearts; try { hearts = new Set(JSON.parse(localStorage.getItem(HK) || '[]')); } catch(e){ hearts = new Set(); }
function updateHc(){ const el = $('hc'); if(el) el.textContent = hearts.size; }
function saveHearts(){ try { localStorage.setItem(HK, JSON.stringify([...hearts])); } catch(e){} updateHc(); }
function markHeart(ev, on){ ev.classList.toggle('hearted', on); const h = ev.querySelector('.heart'); if(h) h.innerHTML = on ? '&#9829;' : '&#9825;'; }
document.querySelectorAll('.ev').forEach(ev => { if (hearts.has(ev.dataset.key)) markHeart(ev, true); });
updateHc();
document.addEventListener('click', (e) => {
  const h = e.target.closest('.heart'); if(!h) return;
  e.preventDefault(); e.stopPropagation();
  const ev = h.closest('.ev'), k = ev.dataset.key;
  if (hearts.has(k)) { hearts.delete(k); markHeart(ev, false); } else { hearts.add(k); markHeart(ev, true); }
  saveHearts();
});
function toggleHeartsOnly(){ const on = document.body.classList.toggle('hearts-only'); $('heartsBtn').classList.toggle('on', on); }
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
