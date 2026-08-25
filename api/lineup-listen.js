// /lineup/sf — San Francisco listen view. One column of days (empty days removed);
// within each day the shows flow as small cards, grouped by type (music, then
// sports, then comedy) with a small color accent per type (blue=music,
// green=comedy, gold=sports). Each card = album art + a 30-sec Apple Music
// preview, venue next to the time. Reads a stored snapshot.

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
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function groupOf(cat) {
  return cat === 'comedy' ? 'Comedy' : cat === 'sports' ? 'Sports' : 'Music';
}
const GORDER = { Music: 0, Sports: 1, Comedy: 2 };

function page(snap) {
  const events = (snap && snap.grid) || [];

  const byDay = {}; const daySet = new Set();
  events.forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); daySet.add(e.date); });
  const days = [...daySet].sort();

  // Per-venue generic art: hash the venue name to a stable hue; show the venue's
  // initials on that tint until real album art loads.
  const hueOf = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
  const initialsOf = (v) => String(v || '').replace(/^The\s+/i, '').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  let uid = 0;
  const card = (e) => {
    const id = uid++;
    const g = groupOf(e.category);
    const term = artistTerm(e.title);
    const key = esc(`${e.sourceId}|${e.title}|${e.date}`);
    const meta = [fmtTime(e.time), e.venue].filter(Boolean).join(' · ');
    const hue = hueOf(e.venue || '');
    const vbg = `linear-gradient(135deg,hsl(${hue},26%,84%),hsl(${hue},30%,70%))`;
    return `<div class="ev g-${g}" data-key="${key}">
      <div class="thumb" data-term="${esc(term)}" data-uid="${id}" data-vi="${esc(initialsOf(e.venue))}" style="background-image:${vbg}">
        <button class="heart" aria-label="Save show">&#9825;</button>
        <button class="play" id="p${id}" disabled aria-label="Preview ${esc(term)}">&#9654;</button>
      </div>
      <a class="ea" href="${esc(e.url || '#')}" target="_blank" rel="noopener">${esc(e.title)}</a>
      <div class="cm">${esc(meta)}</div>
    </div>`;
  };

  let content = '';
  for (const d of days) {
    const evs = byDay[d].slice().sort((a, b) =>
      (GORDER[groupOf(a.category)] - GORDER[groupOf(b.category)]) || (a.time || '').localeCompare(b.time || ''));
    content += `<div class="daysec"><div class="daylabel">${esc(fmtDay(d))}</div><div class="cardrow">${evs.map(card).join('')}</div></div>`;
  }
  if (!days.length) content = '<p class="empty">No shows in the current window yet.</p>';

  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Your Lineup — San Francisco</title><meta name="robots" content="noindex">
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#F7F5F0;--bg2:#EEEAE1;--line:rgba(28,32,38,.14);--text:#191D23;
    --dim:rgba(25,29,35,.62);--faint:rgba(25,29,35,.40);--accent:#4A6E8F;--accent-hi:#33556F;
    --gold:#A8761E;--pick:#3B7A5C;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--cw:82px}
  html{-webkit-text-size-adjust:100%}
  body{background:var(--bg);color:var(--text);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;padding-bottom:78px}
  .top{position:sticky;top:0;z-index:40;background:var(--bg);padding:.85rem 1.1rem .5rem;border-bottom:2px solid var(--text);
    display:flex;align-items:center;justify-content:space-between;gap:.6rem}
  h1{font-size:1.3rem;font-weight:700}
  .rbtn{flex:none;font-family:var(--mono);font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;
    padding:.5rem .9rem;border-radius:20px;border:1px solid var(--pick);background:var(--pick);color:#fff;cursor:pointer}
  .rbtn.on{background:transparent;color:var(--pick)}
  .rbtn.heartbtn{border-color:#c0324b;background:transparent;color:#c0324b}
  .rbtn.heartbtn.on{background:#c0324b;color:#fff}
  .content{max-width:1120px;margin:0 auto;padding:0 1.1rem}
  .daysec{margin:.5rem 0 0}
  .daylabel{position:sticky;top:52px;z-index:15;background:var(--bg);
    font-family:var(--mono);font-size:.66rem;letter-spacing:.03em;text-transform:uppercase;color:var(--dim);
    padding:.55rem 0 .35rem;border-bottom:1px solid var(--line);margin-bottom:.55rem}
  .cardrow{display:flex;flex-wrap:wrap;gap:.75rem}
  .ev{width:var(--cw);display:flex;flex-direction:column;padding-left:6px;border-left:3px solid var(--line)}
  .g-Music{border-left-color:var(--accent)} .g-Comedy{border-left-color:var(--pick)} .g-Sports{border-left-color:var(--gold)}
  .thumb{position:relative;width:100%;aspect-ratio:1;border-radius:7px;overflow:hidden;
    background-size:cover;background-position:center;border:1px solid var(--line)}
  /* venue initials on the venue-tinted background until real art loads */
  .thumb::after{content:attr(data-vi);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-family:var(--mono);font-weight:700;font-size:1.05rem;letter-spacing:.06em;color:rgba(25,29,35,.42)}
  .thumb.hasart::after{display:none}
  .heart{position:absolute;top:4px;left:4px;width:30px;height:20px;border:0;border-radius:10px;
    background:rgba(255,255,255,.85);color:#c0324b;font-size:.72rem;cursor:pointer;display:grid;place-items:center;line-height:1;opacity:1;z-index:2}
  .ev.hearted .heart{opacity:1;background:#c0324b;color:#fff}
  .play{position:absolute;right:4px;bottom:4px;width:22px;height:22px;border-radius:50%;border:0;
    background:rgba(255,255,255,.94);color:var(--text);font-size:.52rem;cursor:pointer;display:grid;place-items:center;
    box-shadow:0 1px 3px rgba(0,0,0,.3);opacity:0;transition:opacity .15s}
  .thumb.ready .play{opacity:1}
  .play.playing,.thumb.now .play{background:var(--pick);color:#fff}
  .thumb.now{box-shadow:0 0 0 2px var(--pick)}
  .ea{font-size:.66rem;font-weight:600;line-height:1.12;margin-top:3px;color:inherit;text-decoration:none;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .ea:hover{text-decoration:underline}
  .filters{display:flex;gap:.35rem;flex:1;justify-content:center}
  .fbtn{font-family:var(--mono);font-size:.62rem;letter-spacing:.05em;text-transform:uppercase;
    padding:.35rem .7rem;border-radius:16px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer}
  .fbtn.on.fb-Music{background:var(--accent);border-color:var(--accent);color:#fff}
  .fbtn.on.fb-Comedy{background:var(--pick);border-color:var(--pick);color:#fff}
  .fbtn.on.fb-Sports{background:var(--gold);border-color:var(--gold);color:#fff}
  body[data-filter="Music"] .ev:not(.g-Music){display:none}
  body[data-filter="Comedy"] .ev:not(.g-Comedy){display:none}
  body[data-filter="Sports"] .ev:not(.g-Sports){display:none}
  .cm{font-size:.58rem;color:var(--faint);margin-top:1px;line-height:1.2;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .empty{padding:2rem 0;color:var(--dim)}
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
  /* touch devices: hover-revealed controls must always be visible + tappable */
  @media (hover:none){
    .heart{opacity:.92;width:24px;height:24px;font-size:.7rem}
    .thumb.ready .play{opacity:1;width:26px;height:26px;font-size:.6rem}
  }
  @media (max-width:560px){
    :root{--cw:27vw}
    h1{font-size:1.05rem}
    .top{padding:.6rem .8rem .45rem;flex-wrap:wrap}
    .filters{order:3;flex-basis:100%;justify-content:flex-start;margin-top:.4rem}
    .content{padding:0 .8rem}
    .cardrow{gap:.6rem}
    .daylabel{top:84px}  /* header wraps to two rows on mobile */
    .ea{font-size:.72rem}.cm{font-size:.62rem}
  }
</style></head>
<body>
  <div class="top">
    <h1>Your Lineup</h1>
    <div class="filters">
      <button class="fbtn fb-Music" onclick="setFilter('Music')">Music</button>
      <button class="fbtn fb-Sports" onclick="setFilter('Sports')">Sports</button>
      <button class="fbtn fb-Comedy" onclick="setFilter('Comedy')">Comedy</button>
    </div>
    <div style="display:flex;gap:.5rem;flex:none">
      <button class="rbtn heartbtn" id="heartsBtn" onclick="toggleHeartsOnly()">&#9829; <span id="hc">0</span></button>
      <button class="rbtn" id="rbtn" onclick="toggleRadio()">&#9654; Play</button>
    </div>
  </div>
  <div class="content">${content}</div>
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
function markNow(uid, scroll){
  document.querySelectorAll('.thumb.now').forEach(e=>{ e.classList.remove('now'); const p=e.querySelector('.play'); if(p) p.innerHTML='&#9654;'; });
  const el=document.querySelector('.thumb[data-uid="'+uid+'"]');
  if(el){ el.classList.add('now'); const p=el.querySelector('.play'); if(p) p.innerHTML='&#10073;&#10073;';
    if(scroll) el.scrollIntoView({block:'nearest',behavior:'smooth'}); } }
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
function stopAll(){ audio.pause();
  document.querySelectorAll('.thumb.now').forEach(e=>{ e.classList.remove('now'); const p=e.querySelector('.play'); if(p) p.innerHTML='&#9654;'; });
  $('now').classList.remove('on'); qi = null; current = null; setRbtn(false); }
document.addEventListener('click', (ev)=>{ const b = ev.target.closest('.play'); if(!b) return;
  ev.preventDefault(); b.blur();
  const uid = b.closest('.thumb').dataset.uid; const i = uidIndex[uid]; if(i != null){
    if (current === uid && !audio.paused){ audio.pause(); setRbtn(false); const p=b; p.innerHTML='&#9654;'; return; } // tap again = pause
    playIndex(i, false);
  } });
// buttons drop focus after click so space/enter can't accidentally re-trigger them
document.addEventListener('click', (e)=>{ const b = e.target.closest('button'); if(b) b.blur(); });
document.addEventListener('keydown', (e)=>{
  if (e.target.matches('input,textarea,select,button')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space'){ e.preventDefault(); toggleRadio(); }
  else if (e.key === 'ArrowRight' || k === 's' || k === 'n'){ e.preventDefault(); skip(); }
  else if (e.key === 'Escape'){ stopAll(); }
});
audio.addEventListener('ended', skip);
const HK = 'lineup_sf_hearts';
let hearts; try { hearts = new Set(JSON.parse(localStorage.getItem(HK) || '[]')); } catch(e){ hearts = new Set(); }
function updateHc(){ const el = $('hc'); if(el) el.textContent = hearts.size; }
function saveHearts(){ try { localStorage.setItem(HK, JSON.stringify([...hearts])); } catch(e){} updateHc();
  if (hearts.size === 0 && document.body.classList.contains('hearts-only')){ document.body.classList.remove('hearts-only'); $('heartsBtn').classList.remove('on'); } }
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
function toggleHeartsOnly(){
  // never strand the user on an empty page: with no hearts the filter is a no-op
  if (!document.body.classList.contains('hearts-only') && hearts.size === 0){
    const b=$('heartsBtn'); b.style.transform='scale(1.15)'; setTimeout(()=>{b.style.transform='';},180); return;
  }
  const on = document.body.classList.toggle('hearts-only'); $('heartsBtn').classList.toggle('on', on);
  refreshDays();
}
// type filter: one of Music/Sports/Comedy, click again to clear
let gFilter = null;
function setFilter(g){
  gFilter = (gFilter === g ? null : g);
  if (gFilter) document.body.dataset.filter = gFilter; else delete document.body.dataset.filter;
  document.querySelectorAll('.fbtn').forEach(b => b.classList.toggle('on', b.textContent === gFilter));
  refreshDays();
}
// hide day rows left empty by the active filters
function refreshDays(){
  document.querySelectorAll('.daysec').forEach(d => {
    const any = [...d.querySelectorAll('.ev')].some(e => e.offsetParent !== null);
    d.style.display = any ? '' : 'none';
  });
}
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
