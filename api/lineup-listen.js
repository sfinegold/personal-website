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
      rowsHtml += `<tr class="week"><td colspan="6"><span class="wcaret">&#9662;</span> Week of ${esc(fmtRange(weekStart, addDays(weekStart, 6)))}</td></tr>`;
      weekShown = true;
    }
    rowsHtml += `<tr class="day" id="d-${d}"><td colspan="6">${esc(fmtDay(d))}</td></tr>`;
    const evs = byDay[d].slice().sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz'));
    for (const e of evs) {
      const id = uid++;
      const g = groupOf(e.category);
      const key = esc(`${e.sourceId}|${e.title}|${e.date}`);
      rowsHtml += `<tr class="row g-${g}" id="r${id}" data-uid="${id}" data-key="${key}" data-term="${esc(artistTerm(e.title))}" data-url="${esc(e.url || '')}" data-vid="${esc(e.sourceId || '')}" data-venue="${esc(e.venue || '')}" data-when="${esc(fmtDay(e.date))} · ${esc(fmtTime(e.time))}" data-genre="${esc(e.note && e.note.length <= 24 && !/[<&]/.test(e.note) && e.note.split(/\s+/).length <= 3 && !/resident advisor|undefined/i.test(e.note) ? e.note : '')}" data-hint="${esc((e.note && !/resident advisor/i.test(e.note) ? e.note : ({electronic:'dj set','live-music':'band',jazz:'jazz',comedy:'stand up comedy',classical:'classical'})[e.category] || '')).slice(0,40)}">
        <td class="c-name">${esc(e.title)}</td>
        <td class="c-venue"><a href="/lineup/venue/${esc(e.sourceId || '')}" onclick="event.stopPropagation()">${esc(e.venue || '')}</a></td>
        <td class="c-time">${esc(fmtTime(e.time))}</td>
        <td class="c-price">${esc(fmtPrice(e.price))}</td>
        <td class="c-tix">${e.url ? `<a class="tix" href="${esc(e.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Tickets</a>` : ''}</td>
        <td class="c-act"><button class="pbtn" id="p${id}" aria-label="Play preview">&#9654;</button><button class="heart" aria-label="Save">&#9829;</button><button class="share" aria-label="Share">&#128279;</button></td>
      </tr>`;
    }
  }
  if (!days.length) rowsHtml = '<tr><td colspan="6" class="empty">No shows in the current window.</td></tr>';

  // Airbnb-style filter pills: top genres present in the data + a Liked filter
  const isGenre = (t) => t && t.length <= 24 && !/[<&]/.test(t) && t.split(/\s+/).length <= 3 && !/resident advisor|undefined/i.test(t);
  const gc = {};
  events.forEach((e) => { if (isGenre(e.note)) gc[e.note] = (gc[e.note] || 0) + 1; });
  const allGenres = Object.entries(gc).sort((a, b) => b[1] - a[1]);
  const fbar = `<div class="fbar">
    <button class="gp" id="genresBtn" onclick="openGenres()">&#9776; Genres</button>
    <button class="gp liked" id="likedPill" onclick="toggleHeartsOnly()">&#9829; Liked</button>
  </div>
  <div class="fmask" id="fmask" onclick="closeGenres()"></div>
  <div class="fmodal" id="fmodal" role="dialog" aria-label="Genre filters">
    <div class="fmh">Genres<button onclick="closeGenres()">&#10005;</button></div>
    <div class="fml">` + allGenres.map(([g, n]) => `<button class="gp" data-g="${esc(g)}" onclick="setGenre(this.dataset.g)">${esc(g)} <span>${n}</span></button>`).join('') + `</div>
    <div class="fmf"><button class="clr" onclick="setGenre(gSel)">Clear</button><button class="done" onclick="closeGenres()">Done</button></div>
  </div>`;

  // right-rail mini calendar: months spanned by the window, event days clickable
  const daySet2 = new Set(days);
  const months = [];
  { const endYmd = (snap && snap.window && snap.window.end) || start;
    const [sy, sm] = start.split('-').map(Number);
    for (let k = 0; k < 12; k++) {
      const mm = sm - 1 + k;
      const key = `${sy + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, '0')}`;
      if (key > endYmd.slice(0, 7)) break;
      if (days.some((d) => d.slice(0, 7) === key)) months.push(key);
    } }
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let calHtml = '';
  for (const m of months) {
    const [Y, M] = m.split('-').map(Number);
    const first = new Date(Date.UTC(Y, M - 1, 1));
    const dow = first.getUTCDay();
    const dim = new Date(Date.UTC(Y, M, 0)).getUTCDate();
    let cells = '';
    for (let i = 0; i < dow; i++) cells += '<span></span>';
    for (let dd = 1; dd <= dim; dd++) {
      const ymd = m + '-' + String(dd).padStart(2, '0');
      cells += daySet2.has(ymd)
        ? `<button class="cd has" onclick="jumpTo('${ymd}')">${dd}</button>`
        : `<span class="cd off">${dd}</span>`;
    }
    calHtml += `<div class="cm2"><div class="cmh">${MN[M - 1]} ${Y}</div><div class="cg">${cells}</div></div>`;
  }

  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Your Lineup — San Francisco</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23635BFF'/%3E%3Ctext x='32' y='46' font-family='Helvetica,Arial,sans-serif' font-size='40' font-weight='800' fill='white' text-anchor='middle'%3EL%3C/text%3E%3C/svg%3E"><meta name="robots" content="noindex">
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#F7F3EA;--bg2:#EFE8D8;--line:rgba(10,37,64,.16);--text:#0A2540;--dim:rgba(10,37,64,.64);
    --faint:rgba(10,37,64,.42);--accent:#635BFF;--gold:#EDA33B;--pick:#17877B;--pop:#E4572E;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
  body{background:var(--bg);color:var(--text);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;padding-bottom:84px}
  .top{position:sticky;top:0;z-index:40;background:var(--bg);padding:.8rem 1rem .5rem;
    background-image:linear-gradient(90deg,#635BFF,#00D4FF 45%,#E4572E);background-size:100% 4px;background-repeat:no-repeat;background-position:top;
    display:flex;align-items:center;justify-content:space-between;gap:.6rem;flex-wrap:wrap}
  h1{font-size:1.25rem;font-weight:700}
  .rbtn{font-family:var(--mono);font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;
    padding:.45rem .85rem;border-radius:18px;border:1px solid var(--text);background:var(--pick);color:#fff;cursor:pointer;
    box-shadow:2px 2px 0 var(--text)}
  .rbtn.on{background:transparent;color:var(--pick)}
  .rbtn.heartbtn{border-color:var(--text);background:transparent;color:var(--pop);box-shadow:2px 2px 0 var(--text)}
  .rbtn.heartbtn.on{background:var(--pop);color:#fff}
  .filters{display:flex;gap:.35rem}
  .fbtn{font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;
    padding:.32rem .65rem;border-radius:15px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer}
  .fbtn.on.fb-Music{background:var(--accent);border-color:var(--accent);color:#fff}
  .fbtn.on.fb-Comedy{background:var(--pick);border-color:var(--pick);color:#fff}
  .fbtn.on.fb-Sports{background:var(--gold);border-color:var(--gold);color:#fff}
  .main{max-width:1080px;margin:0 auto;display:flex;gap:14px;align-items:flex-start}
  table{width:100%;border-collapse:collapse;font-size:.84rem;min-width:0}
  .cal{flex:none;width:196px;position:sticky;top:calc(var(--topH,52px) + 8px);padding:8px 0}
  .cm2{background:#fff;border:1px solid var(--text);border-radius:10px;box-shadow:3px 3px 0 var(--text);
    padding:8px 10px;margin-bottom:10px}
  .cmh{font-family:var(--mono);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-bottom:4px}
  .cg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
  .cd{font-size:.62rem;text-align:center;padding:2px 0;border-radius:4px}
  .cd.off{color:var(--faint)}
  button.cd.has{border:0;background:var(--accent);color:#fff;cursor:pointer;font-weight:700}
  button.cd.has:hover{background:var(--pop)}
  tr.day{scroll-margin-top:calc(var(--topH,52px) + 44px)}
  @media (max-width:900px){ .cal{display:none} }
  tr.week td{cursor:pointer;user-select:none;position:sticky;top:calc(var(--topH,52px) - 1px);z-index:20;background:linear-gradient(90deg,#0A2540,#635BFF);color:#fff;
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
  .c-act{width:104px;text-align:right}
  .c-act{white-space:nowrap}
  .c-act button{vertical-align:middle}
  .pbtn{width:22px;height:22px;border-radius:50%;border:1px solid var(--text);background:#fff;font-size:.48rem;
    cursor:pointer;color:var(--text);display:inline-flex;align-items:center;justify-content:center;margin-right:6px;visibility:hidden}
  tr.row.ready .pbtn{visibility:visible}
  tr.row.nomusic .pbtn{display:none}
  .c-name{font-weight:600}
  .c-venue a{color:var(--accent);text-decoration:none}
  .c-venue a:hover{text-decoration:underline}
  .c-time,.c-price{font-family:var(--mono);font-size:.72rem;color:var(--dim);white-space:nowrap}
  .tix{font-family:var(--mono);font-size:.62rem;letter-spacing:.04em;text-transform:uppercase;color:var(--pick);
    border:1px solid var(--pick);border-radius:11px;height:22px;display:inline-flex;align-items:center;padding:0 9px;
    text-decoration:none;white-space:nowrap;vertical-align:middle}
  .tix:hover{background:var(--pick);color:#fff}
  .share{width:26px;height:22px;border:1px solid var(--accent);border-radius:11px;background:none;color:var(--accent);
    font-size:.62rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-left:6px}
  .heart{width:30px;height:22px;border:1px solid var(--pop);border-radius:11px;background:none;
    font-size:.78rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:1;padding:0;
    color:transparent;-webkit-text-stroke:1.1px var(--pop)}
  tr.row.hearted .heart{color:var(--pop);-webkit-text-stroke:0}
  .ev.hearted .heart,tr.row.hearted .heart{background:none;color:var(--pop)}
  tr.detail td{background:var(--bg2);padding:12px;border-bottom:1px solid var(--line)}
  .dwrap{display:flex;gap:14px;align-items:center}
  .dart{width:110px;height:110px;border-radius:8px;background-size:cover;background-position:center;flex:none;
    border:1px solid var(--line);display:flex;align-items:center;justify-content:center}
  .dart .di{font-family:var(--mono);font-weight:700;font-size:1.4rem;letter-spacing:.06em;color:rgba(10,37,64,.42)}
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
  .yt{position:fixed;right:12px;bottom:64px;z-index:70;width:336px;background:#fff;border:1px solid var(--text);
    border-radius:10px;box-shadow:4px 4px 0 var(--text);display:none;overflow:hidden}
  .yt.on{display:block}
  .yt iframe{width:100%;height:189px;border:0;display:block}
  .yt .tl{max-height:150px;overflow:auto}
  .yt .tl button{display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--line);background:#fff;
    padding:6px 10px;font-size:.72rem;cursor:pointer;color:var(--text)}
  .yt .tl button.on{background:var(--bg2);font-weight:700}
  .yt .hd{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg2);
    font-family:var(--mono);font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
  .yt .hd button{border:0;background:none;cursor:pointer;font-size:.8rem;color:var(--text)}
  @media (max-width:560px){ .yt{left:8px;right:8px;width:auto;bottom:70px} }
  .wcaret{display:inline-block;width:1em;transition:transform .12s}
  tr.week.collapsed .wcaret{transform:rotate(-90deg)}
  .fbar{display:flex;gap:.45rem;overflow-x:auto;padding:.55rem 1rem;max-width:1080px;margin:0 auto;
    -webkit-overflow-scrolling:touch;scrollbar-width:none}
  .fbar::-webkit-scrollbar{display:none}
  .gp{flex:none;font-size:.74rem;padding:.38rem .8rem;border-radius:18px;border:1px solid var(--line);
    background:#fff;color:var(--text);cursor:pointer;white-space:nowrap}
  .gp span{color:var(--faint);font-size:.64rem}
  .gp:hover{border-color:var(--text)}
  .gp.on{background:var(--text);color:#fff;border-color:var(--text)}
  .gp.on span{color:rgba(255,255,255,.6)}
  .gp.liked{color:var(--pop);border-color:var(--pop)}
  .gp.liked.on{background:var(--pop);color:#fff}
  tr.row.ghide{display:none}
  .fmask{display:none;position:fixed;inset:0;background:rgba(10,37,64,.45);z-index:80}
  .fmodal{display:none;position:fixed;left:50%;top:14%;transform:translateX(-50%);width:min(480px,92vw);
    background:#fff;border:1px solid var(--text);border-radius:14px;box-shadow:5px 5px 0 var(--text);z-index:81;overflow:hidden}
  body.fopen .fmask,body.fopen .fmodal{display:block}
  .fmh{display:flex;justify-content:space-between;align-items:center;padding:.7rem 1rem;font-weight:700;border-bottom:1px solid var(--line)}
  .fmh button{border:0;background:none;font-size:.95rem;cursor:pointer;color:var(--text)}
  .fml{display:flex;flex-wrap:wrap;gap:.45rem;padding:1rem;max-height:46vh;overflow:auto}
  .fmf{display:flex;justify-content:space-between;padding:.6rem 1rem;border-top:1px solid var(--line)}
  .fmf .clr{border:0;background:none;text-decoration:underline;cursor:pointer;color:var(--text)}
  .fmf .done{border:1px solid var(--text);background:var(--text);color:#fff;border-radius:9px;padding:.5rem 1.1rem;cursor:pointer}
  .hints{position:fixed;left:14px;width:104px;top:calc(var(--topH,52px) + 16px);
    font-family:var(--mono);font-size:.56rem;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);line-height:1.5}
  .hints div{margin-bottom:.45rem}
  .hints a{color:var(--faint)}
  @media (max-width:900px){ .hints{display:none} }
  .foot{max-width:1080px;margin:.8rem auto;padding:0 1rem;font-family:var(--mono);font-size:.58rem;
    letter-spacing:.05em;text-transform:uppercase;color:var(--faint)}
  .foot a{color:var(--accent)}
  @media (max-width:560px){ .c-price,.c-time{display:none} table{font-size:.76rem} h1{font-size:1.05rem} tr.row td{padding:6px 3px} .tix{padding:0 5px;font-size:.54rem;height:20px} .c-act{width:88px} .heart{width:26px;height:20px} .pbtn{width:20px;height:20px} }
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
  ${fbar}
  <div class="main"><aside class="hints"><div>&#8593;&#8595; select</div><div>space play/stop</div><div>&#8592;&#8594; skip</div><div>enter opens</div><div><a href="/lineup/me">edit venues</a></div></aside><table><tbody id="tb">${rowsHtml}</tbody></table><aside class="cal">${calHtml}</aside></div>
  <div class="yt" id="yt"><div class="hd"><span id="ytTitle">—</span>
  <span><button onclick="ytStep(-1)">&#9198;</button> <button onclick="ytStep(1)">&#9197;</button> <button onclick="closeYT()">&#10005;</button></span></div>
  <iframe id="ytFrame" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>
  <div class="tl" id="ytList"></div></div>
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
function playRow(i, scroll, manual){
  if (i==null || i<0 || i>=rows.length) return;
  loadPreview(i).then(rec=>{
    if (!rec.previewUrl){
      if (manual){ $('nN').textContent = rows[i].querySelector('.c-name').textContent;
        $('nS').textContent = 'no preview available'; $('now').classList.add('on'); return; }
      playStep(i, 1); return; }
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
  const hueOf2 = (t)=>{let h=0;for(let k=0;k<t.length;k++)h=(h*31+t.charCodeAt(k))%360;return h;};
  const vin = (r.dataset.venue||'').replace(/^The\s+/i,'').split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  const vhue = hueOf2(r.dataset.venue||'');
  tr.innerHTML = '<td colspan="6"><div class="dwrap"><div class="dart" id="dart" style="background:linear-gradient(135deg,hsl(' + vhue + ',26%,84%),hsl(' + vhue + ',30%,70%))"><span class="di">' + vin + '</span></div><div>' +
    '<div class="dt">' + r.querySelector('.c-name').textContent + '</div>' +
    '<div class="dm">' + r.dataset.when + ' · ' + r.dataset.venue + '</div>' +
    '<div class="dl">' + (r.dataset.url ? '<a href="'+r.dataset.url+'" target="_blank" rel="noopener">Tickets</a>' : '') +
    '<a href="/lineup/venue/' + r.dataset.vid + '">Venue page</a>' +
    '<a href="#" onclick="event.preventDefault();openYT(' + i + ')">&#9654; Top tracks</a>' +
    '<a href="#" id="shareBtn" onclick="event.preventDefault();shareEvent(' + i + ')">&#128279; Share</a></div></div></div></td>';
  r.after(tr);
  loadPreview(i).then(rec=>{ const d=$('dart'); if(d && rec.art){ d.style.background='url("'+rec.art+'") center/cover'; const sp=d.querySelector('.di'); if(sp) sp.remove(); } });
}
rows.forEach((r,i)=>{
  r.addEventListener('click', ()=>{ setSel(i); toggleDetail(i); });
  r.querySelector('.share').addEventListener('click', (e)=>{ e.stopPropagation();
    const u = location.origin + '/lineup/sf?e=' + encodeURIComponent(r.dataset.key);
    const b = e.currentTarget;
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject())
      .then(()=>{ b.innerHTML='&#10003;'; setTimeout(()=>{ b.innerHTML='&#128279;'; }, 1200); })
      .catch(()=>prompt('Copy this link:', u));
  });
  r.querySelector('.pbtn').addEventListener('click', (e)=>{ e.stopPropagation(); setSel(i); (playIdx===i && !audio.paused) ? togglePlay() : playRow(i, false, true); });
});
document.addEventListener('keydown', (e)=>{
  if (e.target.matches('input,textarea,select')) return;
  if (e.code==='Space'){ e.preventDefault(); togglePlay(); }
  else if (e.key==='ArrowDown'){ e.preventDefault(); move(1); }
  else if (e.key==='ArrowUp'){ e.preventDefault(); move(-1); }
  else if (e.key==='ArrowRight'){ e.preventDefault(); arrowFlow(1); }
  else if (e.key==='ArrowLeft'){ e.preventDefault(); arrowFlow(-1); }
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
function markHeart(r,on){ r.classList.toggle('hearted',on); }
function pushHearts(){ if(me) fetch('/lineup/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'hearts',keys:[...hearts]})}).catch(()=>{}); }
function saveHearts(){ try{ localStorage.setItem(HK, JSON.stringify([...hearts])); }catch(e){} updateHc(); pushHearts(); }
rows.forEach(r=>{ if(hearts.has(r.dataset.key)) markHeart(r,true);
  r.querySelector('.heart').addEventListener('click',(e)=>{ e.stopPropagation();
    const k=r.dataset.key; hearts.has(k)? (hearts.delete(k),markHeart(r,false)) : (hearts.add(k),markHeart(r,true)); saveHearts(); }); });
updateHc();
function toggleHeartsOnly(){
  if (!document.body.classList.contains('hearts-only') && hearts.size===0) return;
  const on=document.body.classList.toggle('hearts-only'); $('heartsBtn').classList.toggle('on',on);
  const lp=$('likedPill'); if(lp) lp.classList.toggle('on',on);
  refreshHeaders();
}
let gSel = null;
function setGenre(g){
  gSel = (gSel === g ? null : g);
  document.querySelectorAll('.gp[data-g]').forEach(b => b.classList.toggle('on', b.dataset.g === gSel));
  const gb = $('genresBtn');
  gb.innerHTML = gSel ? '&#9776; ' + gSel : '&#9776; Genres';
  gb.classList.toggle('on', !!gSel);
  rows.forEach(r => r.classList.toggle('ghide', !!gSel && r.dataset.genre !== gSel));
  refreshHeaders();
}
function openGenres(){ document.body.classList.add('fopen'); }
function closeGenres(){ document.body.classList.remove('fopen'); }
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

// ---- YouTube browse player (top-5 per artist, opt-in) ----
let ytTracks = [], ytIdx = 0;
function openYT(i, auto){
  const term = rows[i].dataset.term;
  audio.pause(); setRbtn(false); if(playIdx!=null) setPlaying(playIdx,false);
  fetch('/lineup/yt?artist=' + encodeURIComponent(term) + '&hint=' + encodeURIComponent(rows[i].dataset.hint || '')).then(r=>r.json()).then(d=>{
    if (!d.tracks || !d.tracks.length){ if (auto) { playRow(i, true); } else alert('No YouTube tracks found for ' + term); return; }
    ytTracks = d.tracks; ytIdx = 0;
    $('ytTitle').textContent = term;
    renderYT();
    $('yt').classList.add('on');
  }).catch(()=>alert('YouTube lookup failed'));
}
function renderYT(){
  const t = ytTracks[ytIdx];
  $('ytFrame').src = 'https://www.youtube-nocookie.com/embed/' + t.id + '?autoplay=1';
  const tl = $('ytList'); tl.innerHTML = '';
  ytTracks.forEach((x,j)=>{ const b=document.createElement('button'); b.textContent=(j+1)+'. '+x.title;
    b.className = j===ytIdx?'on':''; b.onclick=()=>{ ytIdx=j; renderYT(); }; tl.appendChild(b); });
}
function ytStep(d){ if(!ytTracks.length) return; ytIdx=(ytIdx+d+ytTracks.length)%ytTracks.length; renderYT(); }
// arrow flow: first listen is the 30s preview; from then on, arrows move artist-to-artist
// in the full-song YouTube player (open panel steps tracks handled in openYT rows)
let heardPreview = false;
function nextRowFrom(i, d){ let j = (i==null? (d>0?-1:rows.length) : i); do { j += d; } while (j>=0 && j<rows.length && !visible(j)); return (j>=0 && j<rows.length) ? j : null; }
function arrowFlow(d){
  if ($('yt').classList.contains('on')){ ytStep(d); return; } // pan tracks within the open artist
  d > 0 ? nextSong() : prevSong();
}
function closeYT(){ $('yt').classList.remove('on'); $('ytFrame').src=''; ytTracks=[]; }

// collapsible week bands: click a week header to fold/unfold its rows
document.querySelectorAll('tr.week').forEach(w => {
  w.addEventListener('click', () => {
    const on = w.classList.toggle('collapsed');
    let el = w.nextElementSibling;
    while (el && !el.classList.contains('week')) { el.style.display = on ? 'none' : ''; el = el.nextElementSibling; }
    if (!on) refreshHeaders(); // re-apply filter-driven hiding after expand
  });
});

function jumpTo(ymd){
  const el = document.getElementById('d-' + ymd);
  if (!el) return;
  // if inside a collapsed week, expand it first
  let w = el.previousElementSibling;
  while (w && !w.classList.contains('week')) w = w.previousElementSibling;
  if (w && w.classList.contains('collapsed')) w.click();
  el.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function shareEvent(i){
  const u = location.origin + '/lineup/sf?e=' + encodeURIComponent(rows[i].dataset.key);
  (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(()=>{
    const b = document.getElementById('shareBtn'); if (b) b.textContent = 'Link copied!';
  }).catch(()=>prompt('Copy this link:', u));
}

// lazily check preview availability: show play only where music exists
const rio = new IntersectionObserver((ents)=>{ ents.forEach(en=>{ if(!en.isIntersecting) return;
  rio.unobserve(en.target); const i = +en.target.dataset.uid;
  loadPreview(i).then(rec=>{ en.target.classList.add(rec.previewUrl ? 'ready' : 'nomusic'); });
}); }, { rootMargin: '300px' });
rows.forEach(r => rio.observe(r));

// pin sticky week bands flush under the real header height (it varies by viewport)
function setTopH(){ const t=document.querySelector('.top'); if(t) document.documentElement.style.setProperty('--topH', Math.ceil(t.getBoundingClientRect().height) + 'px'); }
setTopH(); window.addEventListener('resize', setTopH);

setFilter('Music'); // default view

// deep link: ?e=<key> opens that event's row ready to play
(function(){
  const k = new URLSearchParams(location.search).get('e');
  if (!k) return;
  const i = rows.findIndex(r => r.dataset.key === k);
  if (i < 0) return;
  if (rows[i].offsetParent === null) setFilter(gFilter); // clear default filter if it hides the shared row
  // expand any collapsed week containing it
  let w = rows[i].previousElementSibling;
  while (w && !w.classList.contains('week')) w = w.previousElementSibling;
  if (w && w.classList.contains('collapsed')) w.click();
  setSel(i); toggleDetail(i);
  rows[i].scrollIntoView({ block: 'center' });
  playRow(i, false, true); // browsers may require one tap; the play button is focused in view
})();
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
