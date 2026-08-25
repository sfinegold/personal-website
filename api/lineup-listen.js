// /lineup/sf — table view. One row per show, week + day header rows, empty days
// omitted. Selection (↑/↓) is independent of playback (space start/stop, ←/→ or
// skip = change song). Enter/click expands a detail row (image + links). Columns:
// name, venue (→ /lineup/venue/<id>), time, price, tickets. Reads the snapshot.

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
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDay(ymd) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtRange(a, b) {
  const f = (y) => new Date(`${y}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${f(a)} – ${f(b)}`;
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtPrice(p) {
  if (p === 'free' || p === 0) return 'Free';
  if (typeof p === 'number') return '$' + p;
  return '—';
}
const groupOf = (c) => (c === 'comedy' ? 'Comedy' : c === 'sports' ? 'Sports' : 'Music');

function page(snap) {
  const events = (snap && snap.grid) || [];
  const start = (snap && snap.window && snap.window.start) || new Date().toISOString().slice(0, 10);
  const byDay = {};
  events.forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); });
  const days = Object.keys(byDay).sort();

  let uid = 0, rowsHtml = '';
  let weekStart = start;
  let weekShown = false;
  for (const d of days) {
    while (d >= addDays(weekStart, 7)) { weekStart = addDays(weekStart, 7); weekShown = false; }
    if (!weekShown) {
      rowsHtml += `<tr class="week"><td colspan="7">Week of ${esc(fmtRange(weekStart, addDays(weekStart, 6)))}</td></tr>`;
      weekShown = true;
    }
    rowsHtml += `<tr class="day"><td colspan="7">${esc(fmtDay(d))}</td></tr>`;
    const evs = byDay[d].slice().sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz'));
    for (const e of evs) {
      const id = uid++;
      const g = groupOf(e.category);
      const key = esc(`${e.sourceId}|${e.title}|${e.date}`);
      rowsHtml += `<tr class="row g-${g}" id="r${id}" data-uid="${id}" data-key="${key}" data-term="${esc(artistTerm(e.title))}" data-url="${esc(e.url || '')}" data-vid="${esc(e.sourceId || '')}" data-venue="${esc(e.venue || '')}" data-when="${esc(fmtDay(e.date))} · ${esc(fmtTime(e.time))}">
        <td class="c-play"><button class="pbtn" id="p${id}" aria-label="Play preview">&#9654;</button></td>
        <td class="c-name">${esc(e.title)}</td>
        <td class="c-venue"><a href="/lineup/venue/${esc(e.sourceId || '')}" onclick="event.stopPropagation()">${esc(e.venue || '')}</a></td>
        <td class="c-time">${esc(fmtTime(e.time))}</td>
        <td class="c-price">${esc(fmtPrice(e.price))}</td>
        <td class="c-tix">${e.url ? `<a class="tix" href="${esc(e.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Tickets</a>` : ''}</td>
        <td class="c-heart"><button class="heart" aria-label="Save">&#9825;</button></td>
      </tr>`;
    }
  }
  if (!days.length) rowsHtml = '<tr><td colspan="7" class="empty">No shows in the current window.</td></tr>';

  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Your Lineup — San Francisco</title><meta name="robots" content="noindex">
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#F7F5F0;--bg2:#EEEAE1;--line:rgba(28,32,38,.14);--text:#191D23;--dim:rgba(25,29,35,.62);
    --faint:rgba(25,29,35,.40);--accent:#4A6E8F;--gold:#A8761E;--pick:#3B7A5C;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
  body{background:var(--bg);color:var(--text);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;padding-bottom:84px}
  .top{position:sticky;top:0;z-index:40;background:var(--bg);padding:.8rem 1rem .5rem;border-bottom:2px solid var(--text);
    display:flex;align-items:center;justify-content:space-between;gap:.6rem;flex-wrap:wrap}
  h1{font-size:1.25rem;font-weight:700}
  .rbtn{font-family:var(--mono);font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;
    padding:.45rem .85rem;border-radius:18px;border:1px solid var(--pick);background:var(--pick);color:#fff;cursor:pointer}
  .rbtn.on{background:transparent;color:var(--pick)}
  .rbtn.heartbtn{border-color:#c0324b;background:transparent;color:#c0324b}
  .rbtn.heartbtn.on{background:#c0324b;color:#fff}
  .filters{display:flex;gap:.35rem}
  .fbtn{font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;
    padding:.32rem .65rem;border-radius:15px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer}
  .fbtn.on.fb-Music{background:var(--accent);border-color:var(--accent);color:#fff}
  .fbtn.on.fb-Comedy{background:var(--pick);border-color:var(--pick);color:#fff}
  .fbtn.on.fb-Sports{background:var(--gold);border-color:var(--gold);color:#fff}
  table{width:100%;max-width:1080px;margin:0 auto;border-collapse:collapse;font-size:.84rem}
  tr.week td{position:sticky;top:52px;z-index:20;background:var(--text);color:var(--bg);
    font-family:var(--mono);font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;padding:7px 12px}
  tr.day td{font-family:var(--mono);font-size:.62rem;letter-spacing:.04em;text-transform:uppercase;
    color:var(--dim);background:var(--bg2);padding:5px 12px;border-bottom:1px solid var(--line)}
  tr.row td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
  tr.row{cursor:pointer;border-left:3px solid transparent}
  tr.g-Music td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
  tr.g-Comedy td:first-child{box-shadow:inset 3px 0 0 var(--pick)}
  tr.g-Sports td:first-child{box-shadow:inset 3px 0 0 var(--gold)}
  tr.row.selected{background:rgba(28,32,38,.06)}
  tr.row.playing td:first-child{box-shadow:inset 3px 0 0 var(--pick)}
  tr.row.playing .pbtn{background:var(--pick);color:#fff;border-color:var(--pick)}
  .c-play{width:34px}
  .pbtn{width:24px;height:24px;border-radius:50%;border:1px solid var(--line);background:#fff;font-size:.5rem;
    cursor:pointer;color:var(--text)}
  .c-name{font-weight:600}
  .c-venue a{color:var(--accent);text-decoration:none}
  .c-venue a:hover{text-decoration:underline}
  .c-time,.c-price{font-family:var(--mono);font-size:.72rem;color:var(--dim);white-space:nowrap}
  .tix{font-family:var(--mono);font-size:.62rem;letter-spacing:.04em;text-transform:uppercase;color:var(--pick);
    border:1px solid var(--pick);border-radius:12px;padding:2px 9px;text-decoration:none;white-space:nowrap}
  .tix:hover{background:var(--pick);color:#fff}
  .c-heart{width:34px;text-align:center}
  .heart{border:0;background:none;color:#c0324b;font-size:.95rem;cursor:pointer}
  tr.detail td{background:var(--bg2);padding:12px;border-bottom:1px solid var(--line)}
  .dwrap{display:flex;gap:14px;align-items:center}
  .dart{width:110px;height:110px;border-radius:8px;background:linear-gradient(135deg,#e4e0d6,#d3ccbe);
    background-size:cover;background-position:center;flex:none;border:1px solid var(--line)}
  .dt{font-size:1rem;font-weight:700}
  .dm{font-family:var(--mono);font-size:.7rem;color:var(--dim);margin:4px 0 8px}
  .dl{display:flex;gap:.5rem;flex-wrap:wrap}
  .dl a{font-family:var(--mono);font-size:.64rem;letter-spacing:.04em;text-transform:uppercase;color:var(--accent);
    border:1px solid var(--accent);border-radius:12px;padding:3px 10px;text-decoration:none}
  body[data-filter="Music"] tr.row:not(.g-Music){display:none}
  body[data-filter="Comedy"] tr.row:not(.g-Comedy){display:none}
  body[data-filter="Sports"] tr.row:not(.g-Sports){display:none}
  body.hearts-only tr.row:not(.hearted){display:none}
  .empty{padding:2rem;color:var(--dim)}
  .now{position:fixed;left:0;right:0;bottom:0;background:var(--bg2);border-top:1px solid var(--line);
    padding:.5rem .9rem calc(.5rem + env(safe-area-inset-bottom));display:none;align-items:center;gap:.7rem;z-index:60}
  .now.on{display:flex}
  .now .a{width:36px;height:36px;border-radius:6px;background:#ccc;background-size:cover;background-position:center;flex:none}
  .now .n{font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .now .s{font-family:var(--mono);font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .now button{border:1px solid var(--line);background:var(--bg);border-radius:16px;padding:.35rem .7rem;
    font-family:var(--mono);font-size:.58rem;text-transform:uppercase;cursor:pointer;color:var(--dim)}
  .now .grp{margin-left:auto;display:flex;gap:.4rem}
  .foot{max-width:1080px;margin:.8rem auto;padding:0 1rem;font-family:var(--mono);font-size:.58rem;
    letter-spacing:.05em;text-transform:uppercase;color:var(--faint)}
  .foot a{color:var(--accent)}
  @media (max-width:560px){ .c-price,.c-time{display:none} table{font-size:.76rem} h1{font-size:1.05rem} tr.row td{padding:6px 3px} .tix{padding:2px 5px;font-size:.54rem} .c-play{width:28px} .c-heart{width:26px} .pbtn{width:22px;height:22px} }
</style></head>
<body>
  <div class="top">
    <h1>Your Lineup</h1>
    <div class="filters">
      <button class="fbtn fb-Music" onclick="setFilter('Music')">Music</button>
      <button class="fbtn fb-Sports" onclick="setFilter('Sports')">Sports</button>
      <button class="fbtn fb-Comedy" onclick="setFilter('Comedy')">Comedy</button>
    </div>
    <div style="display:flex;gap:.4rem">
      <button class="rbtn heartbtn" id="authBtn" onclick="authClick()" style="border-color:var(--line);color:var(--dim)">Sign in</button>
      <button class="rbtn heartbtn" id="heartsBtn" onclick="toggleHeartsOnly()">&#9829; <span id="hc">0</span></button>
      <button class="rbtn" id="rbtn" onclick="togglePlay()">&#9654; Play</button>
    </div>
  </div>
  <table><tbody id="tb">${rowsHtml}</tbody></table>
  <div class="foot">&#8593;&#8595; select · space play/stop · &#8592;&#8594; skip · enter opens · <a href="/lineup/me">edit venues</a></div>
  <div class="now" id="now"><div class="a" id="nA"></div><div><div class="n" id="nN">—</div><div class="s" id="nS">now playing</div></div>
    <div class="grp"><button onclick="prevSong()">&#9198; Prev</button><button onclick="nextSong()">Skip &#9197;</button><button onclick="stopAll()">Stop</button></div></div>
<script>
const audio = new Audio();
const cache = {};
const $ = (id) => document.getElementById(id);
const rows = [...document.querySelectorAll('tr.row')];
let sel = -1, playIdx = null, openIdx = null;
function big(u){ return u ? u.replace(/\\/[0-9]+x[0-9]+bb?\\./,'/300x300bb.') : u; }
function visible(i){ return rows[i] && rows[i].offsetParent !== null; }

function loadPreview(i){
  const r = rows[i]; const uid = r.dataset.uid;
  if (cache[uid]) return cache[uid].p ? cache[uid].p : Promise.resolve(cache[uid]);
  cache[uid] = {};
  cache[uid].p = fetch('/api/outside-lands?preview=' + encodeURIComponent(r.dataset.term)).then(x=>x.json()).then(p=>{
    const rec = { previewUrl:(p&&p.previewUrl)||null, art:(p&&p.artwork)?big(p.artwork):null };
    cache[uid] = rec; return rec;
  }).catch(()=>{ cache[uid]={previewUrl:null,art:null}; return cache[uid]; });
  return cache[uid].p;
}
function setSel(i){
  if (sel>=0 && rows[sel]) rows[sel].classList.remove('selected');
  sel = i; if (sel<0) return;
  rows[sel].classList.add('selected');
  rows[sel].scrollIntoView({block:'nearest',behavior:'smooth'});
}
function move(d){
  let i = sel < 0 ? (d>0? -1 : rows.length) : sel;
  do { i += d; } while (i>=0 && i<rows.length && !visible(i));
  if (i>=0 && i<rows.length) setSel(i);
}
function setPlaying(i, on){
  if (i==null || !rows[i]) return;
  rows[i].classList.toggle('playing', on);
  const b = rows[i].querySelector('.pbtn'); if (b) b.innerHTML = on ? '&#10073;&#10073;' : '&#9654;';
}
function playRow(i){
  if (i==null || i<0 || i>=rows.length) return;
  loadPreview(i).then(rec=>{
    if (!rec.previewUrl){ playStep(i, 1); return; }
    if (playIdx!=null) setPlaying(playIdx, false);
    playIdx = i;
    audio.src = rec.previewUrl; audio.play().catch(()=>{});
    setPlaying(i, true); setRbtn(true);
    $('nN').textContent = rows[i].querySelector('.c-name').textContent;
    $('nS').textContent = rows[i].dataset.venue + ' · 30s preview';
    $('nA').style.backgroundImage = rec.art ? 'url("'+rec.art+'")' : '';
    $('now').classList.add('on');
  });
}
function playStep(from, d){
  let i = from;
  do { i += d; } while (i>=0 && i<rows.length && !visible(i));
  if (i>=0 && i<rows.length) playRow(i); else stopAll();
}
function nextSong(){ playStep(playIdx==null? -1 : playIdx, 1); }
function prevSong(){ playStep(playIdx==null? rows.length : playIdx, -1); }
function togglePlay(){
  if (playIdx!=null && !audio.paused){ audio.pause(); setRbtn(false); setPlaying(playIdx,false); return; }
  if (playIdx!=null && audio.src){ audio.play(); setRbtn(true); setPlaying(playIdx,true); return; }
  playRow(sel>=0? sel : 0);
}
function stopAll(){ audio.pause(); if(playIdx!=null) setPlaying(playIdx,false); playIdx=null; $('now').classList.remove('on'); setRbtn(false); }
function setRbtn(on){ $('rbtn').innerHTML = on ? '&#10073;&#10073; Pause' : '&#9654; Play'; $('rbtn').classList.toggle('on', on); }
audio.addEventListener('ended', nextSong);

function toggleDetail(i){
  const old = document.querySelector('tr.detail');
  if (old){ old.remove(); if (openIdx === i){ openIdx = null; return; } }
  openIdx = i;
  const r = rows[i];
  const tr = document.createElement('tr'); tr.className = 'detail';
  tr.innerHTML = '<td colspan="7"><div class="dwrap"><div class="dart" id="dart"></div><div>' +
    '<div class="dt">' + r.querySelector('.c-name').textContent + '</div>' +
    '<div class="dm">' + r.dataset.when + ' · ' + r.dataset.venue + '</div>' +
    '<div class="dl">' + (r.dataset.url ? '<a href="'+r.dataset.url+'" target="_blank" rel="noopener">Tickets</a>' : '') +
    '<a href="/lineup/venue/' + r.dataset.vid + '">Venue page</a></div></div></div></td>';
  r.after(tr);
  loadPreview(i).then(rec=>{ const d=$('dart'); if(d && rec.art) d.style.backgroundImage='url("'+rec.art+'")'; });
}
rows.forEach((r,i)=>{
  r.addEventListener('click', ()=>{ setSel(i); toggleDetail(i); });
  r.querySelector('.pbtn').addEventListener('click', (e)=>{ e.stopPropagation(); setSel(i); (playIdx===i && !audio.paused) ? togglePlay() : playRow(i, false, true); });
});
document.addEventListener('keydown', (e)=>{
  if (e.target.matches('input,textarea,select')) return;
  if (e.code==='Space'){ e.preventDefault(); togglePlay(); }
  else if (e.key==='ArrowDown'){ e.preventDefault(); move(1); }
  else if (e.key==='ArrowUp'){ e.preventDefault(); move(-1); }
  else if (e.key==='ArrowRight'){ e.preventDefault(); nextSong(); }
  else if (e.key==='ArrowLeft'){ e.preventDefault(); prevSong(); }
  else if (e.key==='Enter'){ e.preventDefault(); if (sel>=0) toggleDetail(sel); }
  else if (e.key==='Escape'){ const d=document.querySelector('tr.detail'); if(d){d.remove(); openIdx=null;} else stopAll(); }
});

// filters
let gFilter = null;
function setFilter(g){
  gFilter = (gFilter===g? null : g);
  if (gFilter) document.body.dataset.filter = gFilter; else delete document.body.dataset.filter;
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.toggle('on', b.textContent===gFilter));
  refreshHeaders();
}
function refreshHeaders(){
  const all = [...document.querySelectorAll('#tb tr')];
  for (let i=0;i<all.length;i++){
    const t = all[i];
    if (!t.classList.contains('day') && !t.classList.contains('week')) continue;
    let any=false;
    for (let j=i+1;j<all.length;j++){
      const u=all[j];
      if (u.classList.contains(t.classList.contains('week')?'week':'day') && !t.classList.contains('week')) break;
      if (t.classList.contains('week') && u.classList.contains('week')) break;
      if (u.classList.contains('row') && u.offsetParent!==null){ any=true; break; }
    }
    t.style.display = any ? '' : 'none';
  }
}

// hearts + auth (same endpoints as before)
const HK='lineup_sf_hearts';
let hearts; try{ hearts=new Set(JSON.parse(localStorage.getItem(HK)||'[]')); }catch(e){ hearts=new Set(); }
let me=null;
function updateHc(){ $('hc').textContent = hearts.size; }
function markHeart(r,on){ r.classList.toggle('hearted',on); const h=r.querySelector('.heart'); if(h) h.innerHTML=on?'&#9829;':'&#9825;'; }
function pushHearts(){ if(me) fetch('/lineup/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'hearts',keys:[...hearts]})}).catch(()=>{}); }
function saveHearts(){ try{ localStorage.setItem(HK, JSON.stringify([...hearts])); }catch(e){} updateHc(); pushHearts(); }
rows.forEach(r=>{ if(hearts.has(r.dataset.key)) markHeart(r,true);
  r.querySelector('.heart').addEventListener('click',(e)=>{ e.stopPropagation();
    const k=r.dataset.key; hearts.has(k)? (hearts.delete(k),markHeart(r,false)) : (hearts.add(k),markHeart(r,true)); saveHearts(); }); });
updateHc();
function toggleHeartsOnly(){
  if (!document.body.classList.contains('hearts-only') && hearts.size===0) return;
  const on=document.body.classList.toggle('hearts-only'); $('heartsBtn').classList.toggle('on',on); refreshHeaders();
}
function authClick(){
  if (me){ if(confirm('Sign out of '+me+'?')) fetch('/lineup/auth',{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"logout"}'}).then(()=>location.reload()); return; }
  const email=prompt('Email for your sign-in link:'); if(!email) return;
  fetch('/lineup/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'request',email})})
    .then(r=>r.json()).then(d=>alert(d.sent?'Check your email for the sign-in link.':'Could not send — check the address.'));
}
fetch('/lineup/auth?whoami=1').then(r=>r.json()).then(d=>{
  if(!d.email) return; me=d.email; $('authBtn').textContent=me.split('@')[0];
  fetch('/lineup/auth?hearts=1').then(r=>r.json()).then(h=>{ if(!h.keys) return;
    h.keys.forEach(k=>hearts.add(k)); rows.forEach(r=>{ if(hearts.has(r.dataset.key)) markHeart(r,true); }); saveHearts(); });
}).catch(()=>{});

setFilter('Music'); // default view
setSel(rows.findIndex((_,i)=>visible(i)));
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
