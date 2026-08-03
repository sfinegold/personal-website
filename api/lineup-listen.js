// /lineup/sf — San Francisco listen view. Dense, day-grouped card flow: two
// sections (Music, Comedy — Sports if present); within each, only days that have
// shows, each a wrapping grid of cards (up to 5 across). Each card = album art +
// a 30-second Apple Music preview, with the venue shown next to the time.
// Reads a stored snapshot, so it never re-crawls.

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
function fmtDayFull(ymd) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function groupOf(cat) {
  return cat === 'comedy' ? 'Comedy' : cat === 'sports' ? 'Sports' : 'Music';
}
const GROUPS = ['Music', 'Comedy', 'Sports'];

function page(snap) {
  const events = (snap && snap.grid) || [];
  const rec = snap && snap.recommendation ? snap.recommendation : null;

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

  // group -> events; then by day (only non-empty days)
  const byGroup = {};
  events.forEach((e) => { const g = groupOf(e.category); (byGroup[g] = byGroup[g] || []).push(e); });

  let content = '';
  for (const g of GROUPS) {
    const evs = (byGroup[g] || []).slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    if (!evs.length) continue;
    content += `<div class="grouphdr gb-${g}">${g}</div>`;
    const days = {};
    evs.forEach((e) => { (days[e.date] = days[e.date] || []).push(e); });
    Object.keys(days).sort().forEach((d) => {
      content += `<div class="daysec"><div class="daylabel">${esc(fmtDayFull(d))}</div><div class="cardgrid">${days[d].map(card).join('')}</div></div>`;
    });
  }
  if (!content) content = '<p class="empty">No shows in the current window yet.</p>';

  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Your Lineup — San Francisco</title><meta name="robots" content="noindex">
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#F7F5F0;--bg2:#EEEAE1;--line:rgba(28,32,38,.14);--text:#191D23;
    --dim:rgba(25,29,35,.62);--faint:rgba(25,29,35,.40);--accent:#4A6E8F;--accent-hi:#33556F;
    --gold:#A8761E;--pick:#3B7A5C;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
  html{-webkit-text-size-adjust:100%}
  body{background:var(--bg);color:var(--text);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;padding-bottom:84px}
  .top{position:sticky;top:0;z-index:30;background:var(--bg);padding:.9rem 1.1rem .55rem;border-bottom:2px solid var(--text);
    display:flex;align-items:center;justify-content:space-between;gap:.6rem}
  h1{font-size:1.35rem;font-weight:700;display:inline}
  .sfx{font-family:var(--mono);font-size:.66rem;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);margin-left:.5rem}
  .rbtn{flex:none;font-family:var(--mono);font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;
    padding:.5rem .9rem;border-radius:20px;border:1px solid var(--pick);background:var(--pick);color:#fff;cursor:pointer}
  .rbtn.on{background:transparent;color:var(--pick)}
  .rbtn.heartbtn{border-color:#c0324b;background:transparent;color:#c0324b}
  .rbtn.heartbtn.on{background:#c0324b;color:#fff}
  .rec{margin:.7rem auto 0;max-width:1100px;padding:0 1.1rem}
  .rec .inner{background:rgba(74,110,143,.09);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;
    padding:.7rem .9rem;font-size:.9rem;line-height:1.5}
  .rec b{font-family:var(--mono);font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-hi);display:block;margin-bottom:.2rem}
  .content{max-width:1100px;margin:0 auto;padding:0 1.1rem}
  .grouphdr{position:sticky;top:54px;z-index:20;color:#fff;font-family:var(--mono);font-size:.62rem;
    letter-spacing:.14em;text-transform:uppercase;padding:6px 12px;border-radius:6px;margin:1.3rem 0 .4rem}
  .gb-Music{background:var(--accent)}.gb-Comedy{background:var(--gold)}.gb-Sports{background:var(--pick)}
  .daysec{margin:0 0 1rem}
  .daylabel{font-family:var(--mono);font-size:.68rem;letter-spacing:.03em;text-transform:uppercase;color:var(--dim);
    margin:.7rem 0 .5rem;padding-bottom:.3rem;border-bottom:1px solid var(--line)}
  .cardgrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1rem .9rem}
  .ev{display:flex;flex-direction:column;min-width:0}
  .thumb{position:relative;width:100%;aspect-ratio:1;border-radius:10px;overflow:hidden;
    background:linear-gradient(135deg,#e4e0d6,#d3ccbe);background-size:cover;background-position:center;border:1px solid var(--line)}
  .thumb::after{content:"\\266A";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-size:1.9rem;color:rgba(25,29,35,.22)}
  .thumb.hasart::after{display:none}
  .heart{position:absolute;top:6px;left:6px;width:26px;height:26px;border:0;border-radius:50%;
    background:rgba(255,255,255,.85);color:#c0324b;font-size:.85rem;cursor:pointer;display:grid;place-items:center;
    line-height:1;opacity:0;transition:opacity .12s;z-index:2}
  .thumb:hover .heart{opacity:1}
  .ev.hearted .heart{opacity:1;background:#c0324b;color:#fff}
  .play{position:absolute;right:6px;bottom:6px;width:30px;height:30px;border-radius:50%;border:0;
    background:rgba(255,255,255,.94);color:var(--text);font-size:.66rem;cursor:pointer;display:grid;place-items:center;
    box-shadow:0 1px 5px rgba(0,0,0,.3);opacity:0;transition:opacity .15s}
  .thumb.ready .play{opacity:1}
  .play.playing,.thumb.now .play{background:var(--pick);color:#fff}
  .thumb.now{box-shadow:0 0 0 3px var(--pick)}
  .ea{font-size:.88rem;font-weight:600;line-height:1.2;margin-top:.4rem;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .cm{font-size:.78rem;color:var(--dim);margin-top:2px;line-height:1.25;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .empty{padding:2rem 0;color:var(--dim)}
  body.hearts-only .ev:not(.hearted){display:none}
  .now{position:fixed;left:0;right:0;bottom:0;background:var(--bg2);border-top:1px solid var(--line);
    padding:.55rem .9rem calc(.55rem + env(safe-area-inset-bottom));display:none;align-items:center;gap:.7rem;z-index:60}
  .now.on{display:flex}
  .now .a{width:40px;height:40px;border-radius:6px;background:#ccc;background-size:cover;background-position:center;flex:none}
  .now .n{font-size:.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .now .s{font-family:var(--mono);font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .now button{border:1px solid var(--line);background:var(--bg);border-radius:18px;
    padding:.4rem .85rem;font-family:var(--mono);font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);cursor:pointer}
  .now .sk{margin-left:auto}
  .foot{max-width:1100px;margin:1rem auto 0;padding:.4rem 1.1rem 1rem;font-family:var(--mono);font-size:.6rem;
    letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .foot a{color:var(--accent-hi)}
  @media (max-width:900px){ .cardgrid{grid-template-columns:repeat(3,minmax(0,1fr))} }
  @media (max-width:560px){
    .cardgrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem .7rem}
    h1{font-size:1.1rem} .top{padding:.7rem .8rem .45rem}
    .rec,.content,.foot{padding-left:.8rem;padding-right:.8rem}
    .grouphdr{top:50px}
  }
</style></head>
<body>
  <div class="top">
    <div><h1>Your Lineup</h1> <span class="sfx">San Francisco · next 5 weeks</span></div>
    <div style="display:flex;gap:.5rem;flex:none">
      <button class="rbtn heartbtn" id="heartsBtn" onclick="toggleHeartsOnly()">&#9829; <span id="hc">0</span></button>
      <button class="rbtn" id="rbtn" onclick="toggleRadio()">&#9654; Play</button>
    </div>
  </div>
  ${rec ? `<div class="rec"><div class="inner"><b>This week's top pick</b>${esc(rec)}</div></div>` : ''}
  <div class="content">${content}</div>
  <div class="foot">Play = auto-preview every act · space = play/pause · &rarr; or S = skip · tap &#9825; to save · <a href="/lineup/me">edit venues</a></div>
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
function markNow(uid){ document.querySelectorAll('.thumb.now').forEach(e=>e.classList.remove('now'));
  const el=document.querySelector('.thumb[data-uid="'+uid+'"]'); if(el){ el.classList.add('now'); el.scrollIntoView({block:'center',behavior:'smooth'}); } }
function playIndex(i){
  if (i < 0 || i >= queue.length){ stopAll(); return; }
  const it = queue[i];
  loadPreview(it.uid, it.term).then(rec=>{
    if (rec.previewUrl){
      qi = i; current = it.uid;
      audio.src = rec.previewUrl; audio.play().catch(()=>{});
      markNow(it.uid); setRbtn(true);
      const el = document.querySelector('.thumb[data-uid="'+it.uid+'"]');
      $('nN').textContent = el ? el.closest('.ev').querySelector('.ea').textContent : it.term;
      $('nS').textContent = 'now playing · 30s preview';
      $('nA').style.backgroundImage = rec.art ? 'url("'+rec.art+'")' : '';
      $('now').classList.add('on');
    } else { playIndex(i + 1); }
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
document.addEventListener('click', (ev)=>{ const b = ev.target.closest('.play'); if(!b) return;
  ev.preventDefault(); const uid = b.closest('.thumb').dataset.uid; const i = uidIndex[uid]; if(i != null) playIndex(i); });
document.addEventListener('keydown', (e)=>{
  if (e.target.matches('input,textarea,select')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space'){ e.preventDefault(); toggleRadio(); }
  else if (e.key === 'ArrowRight' || k === 's' || k === 'n'){ e.preventDefault(); skip(); }
  else if (e.key === 'Escape'){ stopAll(); }
});
audio.addEventListener('ended', skip);

// ---- hearts: save shows to this browser (localStorage) ----
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
