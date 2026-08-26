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

function page(snap, og) {
  const events = (snap && snap.grid) || [];
  const start = (snap && snap.window && snap.window.start) || new Date().toISOString().slice(0, 10);
  const byDay = {};
  events.forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); });
  const days = Object.keys(byDay).sort();

  let uid = 0, rowsHtml = '';
  const mondayOf = (ymd) => addDays(ymd, -((new Date(ymd + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const todayYMD = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const thisMonday = mondayOf(todayYMD);
  const weekTag = (monday) => {
    const n = Math.round((Date.parse(monday) - Date.parse(thisMonday)) / 6048e5);
    return n <= 0 ? 'This week' : n === 1 ? 'Next week' : `In ${n} weeks`;
  };
  let weekStart = mondayOf(start);
  let weekShown = false;
  for (const d of days) {
    while (d >= addDays(weekStart, 7)) { weekStart = addDays(weekStart, 7); weekShown = false; }
    if (!weekShown) {
      rowsHtml += `<tr class="week"><td colspan="6"><span class="wcaret">&#9662;</span> Week of ${esc(fmtRange(weekStart, addDays(weekStart, 6)))}<span class="wtag">${esc(weekTag(weekStart))}</span></td></tr>`;
      weekShown = true;
    }
    rowsHtml += `<tr class="day" id="d-${d}"><td colspan="6">${esc(fmtDay(d))}</td></tr>`;
    const evs = byDay[d].slice().sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz'));
    for (const e of evs) {
      const id = uid++;
      const g = groupOf(e.category);
      const key = esc(`${e.sourceId}|${e.title}|${e.date}`);
      // event-noun titles (festivals, themed parties, raves, karaoke...) have no artist to
      // look up: suppress the preview rather than fuzzy-match a wrong song
      const NOARTIST = /\b(festival|fest|party|rave|prom|gala|takeover|block party)\s*$|\b(karaoke|open mic|silent disco|trivia|bingo|night market)\b/i;
      const fest = e.note === 'Festival' || NOARTIST.test(artistTerm(e.title)) || NOARTIST.test(String(e.title || '').replace(/[!.\s]+$/, ''));
      rowsHtml += `<tr class="row g-${g}${fest ? ' nomusic' : ''}" id="r${id}" data-uid="${id}" data-key="${key}" data-term="${esc(artistTerm(e.title))}" data-url="${esc(e.url || '')}" data-vid="${esc(e.sourceId || '')}" data-venue="${esc(e.venue || '')}" data-when="${esc(fmtDay(e.date))} · ${esc(fmtTime(e.time))}" data-genre="${esc(e.note && e.note.length <= 24 && !/[<&]/.test(e.note) && e.note.split(/\s+/).length <= 3 && !/resident advisor|undefined/i.test(e.note) ? e.note : '')}" data-hint="${esc((e.note && !/resident advisor/i.test(e.note) ? e.note : ({electronic:'dj set','live-music':'band',jazz:'jazz',comedy:'stand up comedy',classical:'classical'})[e.category] || '')).slice(0,40)}">
        <td class="c-name">${esc(e.title)}</td>
        <td class="c-venue"><a href="/lineup/venue/${esc(e.sourceId || '')}" onclick="event.stopPropagation()">${esc(e.venue || '')}</a></td>
        <td class="c-time">${esc(fmtTime(e.time))}</td>
        <td class="c-price">${esc(fmtPrice(e.price))}</td>
        <td class="c-tix">${e.url ? `<a class="tix" href="${esc(e.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Tickets</a>` : ''}</td>
        <td class="c-act"><button class="pbtn" id="p${id}" aria-label="Play preview">&#9654;</button><button class="heart" aria-label="Save"><svg class="hico" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button><button class="share" aria-label="Share">&#128279;</button></td>
      </tr>`;
    }
  }
  if (!days.length) rowsHtml = '<tr><td colspan="6" class="empty">No shows in the current window.</td></tr>';

  // Airbnb-style filter pills: top genres present in the data + a Liked filter
  const isGenre = (t) => t && t.length <= 24 && !/[<&]/.test(t) && t.split(/\s+/).length <= 3 && !/resident advisor|undefined/i.test(t);
  const gg = {};
  events.forEach((e) => { if (isGenre(e.note)) { const grp = groupOf(e.category); (gg[grp] = gg[grp] || {})[e.note] = (gg[grp][e.note] || 0) + 1; } });
  const sections = ['Music', 'Sports', 'Comedy']
    .filter((grp) => gg[grp])
    .map((grp) => `<div class="fsec gb-${grp}">${grp}</div>` +
      Object.entries(gg[grp]).sort((a, b) => b[1] - a[1])
        .map(([g, n]) => `<button class="gp" data-g="${esc(g)}" onclick="setGenre(this.dataset.g)">${esc(g)} <span>${n}</span></button>`).join(''))
    .join('');
  const fbar = `<div class="fmask" id="fmask" onclick="closeGenres()"></div>
  <div class="fmodal" id="fmodal" role="dialog" aria-label="Genre filters">
    <div class="fmh">Genres<button onclick="closeGenres()">&#10005;</button></div>
    <div class="fml">` + sections + `</div>
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
    const dow = (first.getUTCDay() + 6) % 7; // Monday-first columns
    const dim = new Date(Date.UTC(Y, M, 0)).getUTCDate();
    let cells = ['M','T','W','T','F','S','S'].map((w) => `<span class="cwd">${w}</span>`).join('');
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
<title>${esc((og && og.title) || 'Your Lineup — San Francisco')}</title>
<meta property="og:title" content="${esc((og && og.title) || 'Your Lineup — San Francisco')}">
<meta property="og:description" content="${esc((og && og.desc) || 'Live music, comedy and sports around the Bay — with 30-second previews.')}">
<meta property="og:type" content="website">
${og && og.image ? `<meta property="og:image" content="${esc(og.image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(og.image)}">` : ''}
<meta name="theme-color" content="#2440a8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@700;800&family=Instrument+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232440a8'/%3E%3Ctext x='32' y='46' font-family='Helvetica,Arial,sans-serif' font-size='40' font-weight='800' fill='white' text-anchor='middle'%3EL%3C/text%3E%3C/svg%3E"><meta name="robots" content="noindex">
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{--bg:#fafafa;--bg2:#f0f0f1;--card:#ffffff;--line:#e4e4e7;--text:#111113;--dim:#52525b;
    --faint:#71717a;--accent:#2440a8;--accent7:#1a2f7d;--soft:#e1e6f8;--gold:#52525b;--gold7:#3f3f46;
    --cobalt:#2440a8;--pick:#2440a8;--pop:#2440a8;
    --mono:"IBM Plex Mono","SF Mono",ui-monospace,Menlo,monospace}
  body{background:var(--bg);color:var(--text);font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-.012em;
    -webkit-font-smoothing:antialiased;padding-bottom:84px}
  .top{position:sticky;top:0;z-index:40;background:var(--bg);padding:.8rem 1rem .5rem;
    background-image:linear-gradient(90deg,#1a2f7d 0%,#2440a8 52%,#7c96f4 100%);background-size:100% 3px;background-repeat:no-repeat;background-position:top;
    display:flex;align-items:center;justify-content:space-between;gap:.6rem;flex-wrap:wrap}
  h1{font-family:Jost,'Trebuchet MS',sans-serif;font-size:1.3rem;font-weight:800;letter-spacing:-.025em}
  .rbtn{font-family:var(--mono);font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;
    padding:.45rem .85rem;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
  .rbtn.on{background:transparent;color:var(--accent7)}
  .rbtn.heartbtn{border-color:var(--pop);background:transparent;color:var(--pop)}
  .rbtn.heartbtn.on{background:var(--pop);color:#fff}
  .filters{display:flex;gap:.35rem;flex-wrap:wrap;min-width:0}
  .fbtn{font-family:var(--mono);font-size:.6rem;letter-spacing:.05em;text-transform:uppercase;
    padding:.32rem .65rem;border-radius:15px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer}
  .fbtn.on.fb-Music{background:var(--accent);border-color:var(--accent);color:#fff}
  .fbtn.on.fb-Comedy{background:var(--dim);border-color:var(--dim);color:#fff}
  .fbtn.on.fb-Sports{background:var(--text);border-color:var(--text);color:#fff}
  .main{max-width:1080px;margin:0 auto;display:flex;gap:14px;align-items:flex-start}
  table{width:100%;border-collapse:collapse;font-size:.84rem;min-width:0;overflow-anchor:none}
  body{overflow-anchor:none}
  .cal{flex:none;width:196px;position:sticky;top:calc(var(--topH,52px) + 8px);padding:8px 0}
  .cm2{background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:0 1px 2px rgba(17,17,19,.05),0 1px 1px rgba(17,17,19,.04);
    padding:8px 10px;margin-bottom:10px}
  .cmh{font-family:var(--mono);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-bottom:4px}
  .cg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
  .cd{font-size:.62rem;text-align:center;padding:2px 0;border-radius:4px}
  .cd.off{color:var(--faint)}
  button.cd.has{border:0;background:var(--accent);color:#fff;cursor:pointer;font-weight:700}
  button.cd.has:hover{background:var(--accent7)}
  tr.day{scroll-margin-top:calc(var(--topH,52px) + var(--wbH,32px) - 2px)}
  tr.row{scroll-margin-top:calc(var(--topH,52px) + var(--wbH,32px) - 2px)}
  @media (max-width:900px){ .cal{display:none} }
  tr.week td{cursor:pointer;user-select:none;position:sticky;top:calc(var(--topH,52px) - 1px);z-index:20;background:var(--text);color:var(--bg);
    font-family:var(--mono);font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;padding:7px 12px}
  tr.day td{font-family:var(--mono);font-size:.62rem;letter-spacing:.04em;text-transform:uppercase;
    color:var(--dim);background:var(--bg2);padding:5px 12px;border-bottom:1px solid var(--line)}
  tr.row td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
  tr.row{cursor:pointer}
  tr.row.selected{background:var(--soft)}
  tr.row:hover{background:rgba(17,17,19,.03)}
  tr.row.playing td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
  tr.row.playing .pbtn{background:var(--accent);color:#fff;border-color:var(--accent)}
  .c-act{width:104px;text-align:right}
  .c-act{white-space:nowrap}
  .c-act button{vertical-align:middle}
  .pbtn{width:22px;height:22px;border-radius:50%;border:1px solid #d4d4d8;background:var(--card);font-size:.48rem;
    cursor:pointer;color:var(--text);display:inline-flex;align-items:center;justify-content:center;margin-right:6px;visibility:hidden}
  tr.row.ready .pbtn{visibility:visible}
  tr.row.nomusic .pbtn{display:none}
  .c-name{font-weight:600}
  .c-venue a{color:var(--accent7);text-decoration:none}
  .c-venue a:hover{text-decoration:underline}
  .c-time,.c-price{font-family:var(--mono);font-size:.72rem;color:var(--dim);white-space:nowrap;font-variant-numeric:tabular-nums}
  .tix{font-family:var(--mono);font-size:.62rem;letter-spacing:.04em;text-transform:uppercase;color:var(--pick);
    border:1px solid var(--pick);border-radius:11px;height:22px;display:inline-flex;align-items:center;padding:0 9px;
    text-decoration:none;white-space:nowrap;vertical-align:middle}
  .tix:hover{background:var(--pick);color:#fff}
  .share{width:26px;height:22px;border:1px solid var(--accent);border-radius:11px;background:none;color:var(--accent);
    font-size:.62rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-left:6px}
  .heart{width:30px;height:22px;border:1px solid var(--pop);border-radius:11px;background:none;
    cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:1;padding:0;color:var(--pop)}
  .hico{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-2px;flex:none}
  tr.row.hearted .heart .hico{fill:currentColor}
  .gp.liked.on .hico,.rbtn.heartbtn.on .hico{fill:currentColor}
  tr.detail td{background:var(--bg2);padding:12px;border-bottom:1px solid var(--line)}
  .dwrap{display:flex;gap:14px;align-items:center}
  .dart{width:110px;height:110px;border-radius:8px;background-size:cover;background-position:center;flex:none;
    border:1px solid var(--line);display:flex;align-items:center;justify-content:center}
  .dart .di{font-family:var(--mono);font-weight:700;font-size:1.4rem;letter-spacing:.06em;color:#a1a1aa}
  .dt{font-size:1rem;font-weight:700}
  .dm{font-family:var(--mono);font-size:.7rem;color:var(--dim);margin:4px 0 8px}
  .dl{display:flex;gap:.5rem;flex-wrap:wrap}
  .dl a{font-family:var(--mono);font-size:.64rem;letter-spacing:.04em;text-transform:uppercase;color:var(--accent7);
    border:1px solid var(--accent7);border-radius:12px;height:24px;padding:0 10px;text-decoration:none;
    display:inline-flex;align-items:center;line-height:1}
  body.shared-view tr.row:not(.sharedlike){display:none}
  .sharedbar{flex-basis:100%;order:9;margin:.35rem 0 .1rem;padding:.5rem .9rem;background:var(--card);border:1px solid var(--line);
    box-shadow:0 1px 2px rgba(17,17,19,.05);border-radius:10px;color:var(--accent7);font-size:.85rem;font-weight:600}
  .sharedbar button{margin-left:.6rem;border:1px solid var(--line);background:var(--bg);border-radius:12px;
    padding:.25rem .7rem;font-size:.7rem;cursor:pointer;color:var(--text)}
  body[data-filter="Music"] tr.row:not(.g-Music){display:none}
  body[data-filter="Comedy"] tr.row:not(.g-Comedy){display:none}
  body[data-filter="Sports"] tr.row:not(.g-Sports){display:none}
  body.hearts-only tr.row:not(.hearted){display:none}
  .empty{padding:2rem;color:var(--dim)}
  .now{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);box-shadow:0 -2px 6px rgba(17,17,19,.06);
    padding:.5rem .9rem calc(.5rem + env(safe-area-inset-bottom));display:none;align-items:center;gap:.7rem;z-index:60}
  .now.on{display:flex}
  .now .a{width:36px;height:36px;border-radius:6px;background:var(--bg2);background-size:cover;background-position:center;flex:none}
  .now .n{font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .now .s{font-family:var(--mono);font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .now button{border:1px solid var(--line);background:var(--bg);border-radius:16px;padding:.35rem .7rem;
    font-family:var(--mono);font-size:.58rem;text-transform:uppercase;cursor:pointer;color:var(--dim)}
  .now .grp{margin-left:auto;display:flex;gap:.4rem}
  .yt{position:fixed;right:12px;bottom:64px;z-index:70;width:336px;background:var(--card);border:1px solid var(--line);
    border-radius:10px;box-shadow:0 2px 6px rgba(17,17,19,.06),0 14px 30px -16px rgba(17,17,19,.26);display:none;overflow:hidden}
  .yt.on{display:block}
  .yt iframe{width:100%;height:189px;border:0;display:block}
  .yt .tl{max-height:150px;overflow:auto}
  .yt .tl button{display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--line);background:var(--card);
    padding:6px 10px;font-size:.72rem;cursor:pointer;color:var(--text)}
  .yt .tl button.on{background:var(--bg2);font-weight:700}
  .yt .hd{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg2);
    font-family:var(--mono);font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
  .yt .hd button{border:0;background:none;cursor:pointer;font-size:.8rem;color:var(--text)}
  @media (max-width:560px){ .yt{left:8px;right:8px;width:auto;bottom:70px} }
  .wtag{float:right;opacity:.75;letter-spacing:.16em}
  .cwd{font-size:.55rem;text-align:center;color:var(--faint);font-family:var(--mono);padding:1px 0}
  .wcaret{display:inline-block;width:1em;transition:transform .12s}
  tr.week.collapsed .wcaret{transform:rotate(-90deg)}
  .fbar{display:flex;gap:.45rem;overflow-x:auto;padding:.55rem 1rem;max-width:1080px;margin:0 auto;
    -webkit-overflow-scrolling:touch;scrollbar-width:none}
  .fbar::-webkit-scrollbar{display:none}
  .gp{flex:none;font-size:.74rem;padding:.38rem .8rem;border-radius:999px;border:1px solid var(--line);
    background:var(--card);color:var(--text);cursor:pointer;white-space:nowrap}
  .gp span{color:var(--faint);font-size:.64rem}
  .gp:hover{border-color:var(--text)}
  .gp.on{background:var(--text);color:#fff;border-color:var(--text)}
  .gp.on span{color:rgba(255,255,255,.6)}
  .gp.liked{color:var(--pop);border-color:var(--pop)}
  .gp.liked.on{background:var(--pop);color:#fff}
  tr.row.ghide{display:none}
  tr.row.shide{display:none}
  .search input{font-size:.8rem;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--text);
    padding:.34rem .8rem;width:150px;outline:none;-webkit-appearance:none}
  .search input::placeholder{color:var(--faint)}
  .search input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(36,64,168,.15)}
  .calbtn{display:none}
  @media (max-width:900px){ .calbtn{display:inline-flex} }
  .cmask{display:none;position:fixed;inset:0;background:rgba(17,17,19,.4);z-index:80}
  .cmodal{display:none;position:fixed;left:50%;top:8%;transform:translateX(-50%);width:min(320px,calc(100vw - 24px));max-height:78vh;overflow:auto;
    background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 70px -28px rgba(17,17,19,.4);z-index:81}
  body.copen .cmask,body.copen .cmodal{display:block}
  .cmodal .cbody{padding:10px 12px}
  .cmodal .fmh{position:sticky;top:0;background:var(--card);z-index:1}
  .fmask{display:none;position:fixed;inset:0;background:rgba(17,17,19,.4);z-index:80}
  .fmodal{display:none;position:fixed;left:50%;top:14%;transform:translateX(-50%);width:min(480px,92vw);
    background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 70px -28px rgba(17,17,19,.4);z-index:81;overflow:hidden}
  body.fopen .fmask,body.fopen .fmodal{display:block}
  .fmh{display:flex;justify-content:space-between;align-items:center;padding:.7rem 1rem;font-weight:700;border-bottom:1px solid var(--line)}
  .fmh button{border:0;background:none;font-size:.95rem;cursor:pointer;color:var(--text)}
  .fml{display:flex;flex-wrap:wrap;gap:.45rem;padding:1rem;max-height:46vh;overflow:auto}
  .fsec{width:100%;font-family:var(--mono);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;
    margin:.5rem 0 .1rem;padding-left:.2rem;border-left:3px solid var(--line)}
  .fsec.gb-Music{border-left-color:var(--accent);color:var(--accent)}
  .fsec.gb-Sports{border-left-color:var(--text);color:var(--text)}
  .fsec.gb-Comedy{border-left-color:var(--dim);color:var(--dim)}
  .fmf{display:flex;justify-content:space-between;padding:.6rem 1rem;border-top:1px solid var(--line)}
  .fmf .clr{border:0;background:none;text-decoration:underline;cursor:pointer;color:var(--text)}
  .fmf .done{border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:6px;padding:.5rem 1.1rem;cursor:pointer}
  .hints{position:fixed;left:14px;width:104px;top:calc(var(--topH,52px) + 16px);
    font-family:var(--mono);font-size:.56rem;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);line-height:1.5}
  .hints div{margin-bottom:.45rem}
  .hints a{color:var(--faint)}
  @media (max-width:900px){ .hints{display:none} }
  .foot{max-width:1080px;margin:.8rem auto;padding:0 1rem;font-family:var(--mono);font-size:.58rem;
    letter-spacing:.05em;text-transform:uppercase;color:var(--faint)}
  .foot a{color:var(--accent7)}
  ::selection{background:var(--soft);color:var(--text)}
  @media (max-width:560px){
    .c-price,.c-time{display:none}
    .c-act .share{display:none}                 /* row share hidden on mobile (still in expanded row) */
    table{font-size:.8rem}
    h1{font-size:1.1rem}
    .top{padding:.7rem .9rem .5rem;gap:.5rem}
    tr.row td{padding:12px 6px}                  /* breathing room per row */
    tr.row td:first-child{padding-left:12px}
    tr.day td{padding:9px 12px}
    tr.week td{padding:9px 12px}
    .c-name{line-height:1.3}
    .cm{margin-top:3px}
    .tix{padding:0 8px;font-size:.56rem;height:22px}
    .c-act{width:64px}
    .heart{width:28px;height:22px}
    .pbtn{width:22px;height:22px;margin-right:8px}
    .content{padding:0 .5rem}
    .search input{width:110px;font-size:16px;padding:.24rem .7rem}
    #authBtn{position:absolute;top:.6rem;right:.9rem}   /* .top is sticky (positioned), so this pins to its corner */
  }
</style></head>
<body>
  <div class="top">
    <h1>Your Lineup</h1>
    <div class="filters">
      <span class="search"><input id="q" type="search" placeholder="Search" autocomplete="off"
        oninput="doSearch(this.value)" onkeydown="if(event.key==='Escape'){this.value='';doSearch('');this.blur()}"></span>
      <button class="gp" id="genresBtn" onclick="openGenres()">&#9776; Genres</button>
      <button class="gp calbtn" onclick="openCal()">Dates</button>
      <button class="gp liked" id="likedPill" onclick="toggleHeartsOnly()"><svg class="hico" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Lineup</button>
      <button class="gp liked" id="shareLikes" onclick="shareLiked()" style="display:none">&#128279; Share lineup</button>
      <button class="fbtn fb-Music" onclick="setFilter('Music')">Music</button>
      <button class="fbtn fb-Sports" onclick="setFilter('Sports')">Sports</button>
      <button class="fbtn fb-Comedy" onclick="setFilter('Comedy')">Comedy</button>
    </div>
    <div style="display:flex;gap:.4rem">
      <button class="rbtn heartbtn" id="authBtn" onclick="authClick()" style="border-color:var(--line);color:var(--dim)">Sign in</button>
      <button class="rbtn heartbtn" id="heartsBtn" onclick="toggleHeartsOnly()"><svg class="hico" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> <span id="hc">0</span></button>
      <button class="rbtn" id="rbtn" onclick="togglePlay()">&#9654; Play</button>
    </div>
  </div>
  ${fbar}
  <div class="main"><aside class="hints"><div>&#8593;&#8595; select</div><div>space play/stop</div><div>&#8592;&#8594; skip</div><div>enter opens</div><div>/ search</div><div><a href="/lineup/me">edit venues</a></div></aside><table><tbody id="tb">${rowsHtml}</tbody></table><aside class="cal">${calHtml}</aside></div>
  <div class="cmask" onclick="closeCal()"></div>
  <div class="cmodal" role="dialog" aria-label="Jump to a date"><div class="fmh">Jump to a date<button onclick="closeCal()">&#10005;</button></div><div class="cbody">${calHtml}</div></div>
  <div class="yt" id="yt"><div class="hd"><span id="ytTitle">—</span>
  <span><button onclick="ytStep(-1)">&#8249; Prev</button> <button onclick="ytStep(1)">Next &#8250;</button> <button onclick="closeYT()">&#10005;</button></span></div>
  <iframe id="ytFrame" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>
  <div class="tl" id="ytList"></div></div>
<div class="now" id="now"><div class="a" id="nA"></div><div><div class="n" id="nN">—</div><div class="s" id="nS">now playing</div></div>
    <div class="grp"><button onclick="prevSong()">Prev</button><button onclick="nextSong()">Skip</button><button onclick="stopAll()">Stop</button></div></div>
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
  if (sel>=0 && sel!==playIdx){ playRow(sel, false, true); return; } // space plays the selected row (re-targets playback)
  if (playIdx!=null && !audio.paused){ audio.pause(); setRbtn(false); setPlaying(playIdx,false); return; }
  if (playIdx!=null && audio.src){ audio.play(); setRbtn(true); setPlaying(playIdx,true); return; }
  playRow(sel>=0? sel : 0);
}
function stopAll(){ audio.pause(); if(playIdx!=null) setPlaying(playIdx,false); playIdx=null; $('now').classList.remove('on'); setRbtn(false); }
function setRbtn(on){ $('rbtn').innerHTML = on ? '&#10073;&#10073; Pause' : '&#9654; Play'; $('rbtn').classList.toggle('on', on); }
audio.addEventListener('ended', () => { // stay on this show when a preview ends
  if (playIdx != null) setPlaying(playIdx, false);
  setRbtn(false);
  $('nS').textContent = 'preview ended';
});

function toggleDetail(i){
  const keepY = window.scrollY;
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
    '<a href="#" id="shareBtn" onclick="event.preventDefault();shareEvent(' + i + ')">Share</a></div></div></div></td>';
  r.after(tr);
  loadPreview(i).then(rec=>{ const d=$('dart'); if(d && rec.art){ d.style.background='url("'+rec.art+'") center/cover'; const sp=d.querySelector('.di'); if(sp) sp.remove(); } });
  window.scrollTo({ top: keepY }); // expand grows downward; the row stays put
}
rows.forEach((r,i)=>{
  r.addEventListener('click', ()=>{ setSel(i); toggleDetail(i); });
  r.querySelector('.share').addEventListener('click', (e)=>{ e.stopPropagation();
    const u = shareUrl(r);
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
  else if (e.key==='/'){ e.preventDefault(); const q=$('q'); if(q) q.focus(); }
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
function updateHc(){ $('hc').textContent = hearts.size; if (typeof syncShareBtn==='function') syncShareBtn(); }
function markHeart(r,on){ r.classList.toggle('hearted',on); }
function pushHearts(){ if(me) fetch('/lineup/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'hearts',keys:[...hearts]})}).catch(()=>{}); }
function saveHearts(){ try{ localStorage.setItem(HK, JSON.stringify([...hearts])); }catch(e){} updateHc(); pushHearts(); }
rows.forEach(r=>{ if(hearts.has(r.dataset.key)) markHeart(r,true);
  r.querySelector('.heart').addEventListener('click',(e)=>{ e.stopPropagation();
    const k=r.dataset.key; hearts.has(k)? (hearts.delete(k),markHeart(r,false)) : (hearts.add(k),markHeart(r,true)); saveHearts(); }); });
updateHc();
function shareLiked(){
  fetch('/lineup/auth', {method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({action:'sharelikes', keys:[...hearts]})})
    .then(r=>r.json()).then(d=>{
      if (!d.id) return alert('Could not create link');
      const u = location.origin + '/lineup/sf?likes=' + d.id;
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject())
        .then(()=>{ const b=$('shareLikes'); b.innerHTML='&#10003; Link copied'; setTimeout(()=>{b.innerHTML='&#128279; Share lineup';},1500); })
        .catch(()=>prompt('Copy this link:', u));
    }).catch(()=>alert('Could not create link'));
}
function syncShareBtn(){ const b=$('shareLikes'); if(b) b.style.display = hearts.size ? '' : 'none'; }
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
let hay = null;
function doSearch(v){
  const q = String(v||'').trim().toLowerCase();
  if (!hay) hay = rows.map(r => (r.querySelector('.c-name').textContent + ' ' + (r.dataset.venue||'') + ' ' + (r.dataset.genre||'')).toLowerCase());
  if (q) document.querySelectorAll('tr.week.collapsed').forEach(w => w.click()); // matches inside collapsed weeks must be visible
  rows.forEach((r,i) => r.classList.toggle('shide', !!q && hay[i].indexOf(q) === -1));
  refreshHeaders();
}
function openCal(){ document.body.classList.add('copen'); }
function closeCal(){ document.body.classList.remove('copen'); }
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
  // previewing + right arrow: graduate into the artist — open the row + YT player
  if (d > 0 && playIdx != null && !audio.paused){
    const i = playIdx; setSel(i);
    if (openIdx !== i) toggleDetail(i);
    openYT(i); return;
  }
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
  closeCal();
  const el = document.getElementById('d-' + ymd);
  if (!el) return;
  // if inside a collapsed week, expand it first
  let w = el.previousElementSibling;
  while (w && !w.classList.contains('week')) w = w.previousElementSibling;
  if (w && w.classList.contains('collapsed')) w.click();
  el.scrollIntoView({ block: 'start', behavior: 'auto' }); // smooth stalls over long distances (same fix as deep links)
}

function slugify(t){ return String(t).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64).replace(/-+$/,''); }
function shareUrl(r){
  const date = r.dataset.key.split('|').pop(); // key = sourceId|title|date
  const full = r.querySelector('.c-name').textContent; // full show name in the link
  return location.origin + '/lineup/sf?e=' + slugify(full) + '--' + r.dataset.vid + '--' + date;
}
function shareEvent(i){
  const u = shareUrl(rows[i]);
  (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(()=>{
    const b = document.getElementById('shareBtn'); if (b) b.textContent = 'Link copied!';
  }).catch(()=>prompt('Copy this link:', u));
}

// lazily check preview availability: show play only where music exists
const rio = new IntersectionObserver((ents)=>{ ents.forEach(en=>{ if(!en.isIntersecting) return;
  rio.unobserve(en.target); const i = +en.target.dataset.uid;
  loadPreview(i).then(rec=>{ en.target.classList.add(rec.previewUrl ? 'ready' : 'nomusic'); });
}); }, { rootMargin: '300px' });
rows.forEach(r => { if (!r.classList.contains('nomusic')) rio.observe(r); });

// pin sticky week bands flush under the real header height (it varies by viewport)
function setTopH(){ const t=document.querySelector('.top'); if(t) document.documentElement.style.setProperty('--topH', Math.ceil(t.getBoundingClientRect().height) + 'px');
  const w=document.querySelector('tr.week td'); if(w) document.documentElement.style.setProperty('--wbH', Math.ceil(w.getBoundingClientRect().height) + 'px'); }
setTopH(); window.addEventListener('resize', setTopH);

// shared like-list view: ?likes=<id> shows a friend's hearted shows
(function(){
  const id = new URLSearchParams(location.search).get('likes');
  if (!id) return;
  fetch('/lineup/auth?likeshare=' + encodeURIComponent(id)).then(r=>r.json()).then(d=>{
    if (!d.keys || !d.keys.length) return;
    const set = new Set(d.keys);
    let n = 0;
    rows.forEach(r => { if (set.has(r.dataset.key)) { r.classList.add('sharedlike'); n++; } });
    if (!n) return;
    document.body.classList.add('shared-view');
    const bar = document.createElement('div');
    bar.className = 'sharedbar';
    bar.appendChild(document.createTextNode('\u2665 Someone sent you their lineup \u2014 ' + n + ' show' + (n===1?'':'s') + ' '));
    const btn = document.createElement('button');
    btn.textContent = 'Show everything';
    btn.onclick = () => { document.body.classList.remove('shared-view'); bar.remove(); refreshHeaders(); };
    bar.appendChild(btn);
    document.querySelector('.top').appendChild(bar); // inside the sticky header so week bands pin below it
    setTopH();
    setFilter(gFilter); // clear type filter so all shared shows are visible
    refreshHeaders();
  }).catch(()=>{});
})();

setFilter('Music'); // default view

// deep link: ?e=<key> opens that event's row ready to play
(function(){
  const k = new URLSearchParams(location.search).get('e');
  if (!k) return;
  let i = -1;
  if (k.includes('--')) {
    const parts = k.split('--');
    const date = parts.pop(), vid = parts.pop(), aslug = parts.join('--');
    let cands = rows.map((r, j) => ({ r, j })).filter(x => x.r.dataset.vid === vid);
    if (date) cands = cands.filter(x => x.r.dataset.key.endsWith('|' + date));
    const hit = cands.find(x => slugify(x.r.querySelector('.c-name').textContent).slice(0, 16) === aslug.slice(0, 16))
      || cands.find(x => slugify(x.r.dataset.term).startsWith(aslug.slice(0, 10)))
      || (date ? cands[0] : null);
    if (hit) i = hit.j;
  } else {
    i = rows.findIndex(r => r.dataset.key === decodeURIComponent(k));
  }
  if (i < 0) return;
  if (rows[i].offsetParent === null) setFilter(gFilter); // clear default filter if it hides the shared row
  // expand any collapsed week containing it
  let w = rows[i].previousElementSibling;
  while (w && !w.classList.contains('week')) w = w.previousElementSibling;
  if (w && w.classList.contains('collapsed')) w.click();
  setSel(i); toggleDetail(i);
  const land = () => rows[i].scrollIntoView({ block: 'start', behavior: 'auto' }); // row lands right under the week band
  land();
  // late layout shifts (lazy classes, sticky measurement) move the target —
  // keep re-landing until the row's position is stable for two checks
  let lastTop = null, stable = 0, tries = 0;
  const iv = setInterval(() => {
    const top = Math.round(rows[i].getBoundingClientRect().top);
    if (top === lastTop) { stable++; } else { stable = 0; land(); }
    lastTop = top; tries++;
    if (stable >= 2 || tries > 20) clearInterval(iv);
  }, 200);
  window.addEventListener('load', land);
  playRow(i, false, true); // browsers may require one tap; the play button is in view
})();
setSel(rows.findIndex((_,i)=>visible(i)));
</script>
</body></html>`;
}

const slugSrv = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
const fmtNice = (ymd) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const snap = await store.getSnapshot('me');
    // dynamic OG for shared links so iMessage previews show artist + date
    let og = null;
    const q = new URL(req.url, 'http://x').searchParams;
    const e = q.get('e');
    if (e && e.includes('--') && snap && snap.grid) {
      const parts = e.split('--');
      const date = parts.pop(), vid = parts.pop(), aslug = parts.join('--');
      let cands = snap.grid.filter((x) => x.sourceId === vid);
      if (date) cands = cands.filter((x) => x.date === date);
      const hit = cands.find((x) => slugSrv(x.title).slice(0, 16) === aslug.slice(0, 16)) || cands[0];
      if (hit) {
        og = { title: `\u{1F3B6} ${hit.title} — ${fmtNice(hit.date)}`, desc: `\u{1F49C} ${hit.venue}${hit.time ? ' · ' + fmtTime(hit.time) : ''} · Lineup SF` };
        try { // album art for the unfurl card (2s budget)
          const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 2000);
          const it = await fetch('https://itunes.apple.com/search?media=music&entity=musicTrack&limit=1&term=' + encodeURIComponent(artistTerm(hit.title)), { signal: ac.signal }).then((r) => r.json());
          clearTimeout(t);
          const art = it.results && it.results[0] && it.results[0].artworkUrl100;
          if (art) og.image = art.replace('100x100bb', '600x600bb');
        } catch (err) { /* no art — text card */ }
      }
    }
    // liked-list links unfurl with the artists inside
    const likesId = q.get('likes');
    if (!og && likesId && snap && snap.grid) {
      const rec = await store.getJSON('lineup:likeshare:' + likesId.replace(/[^a-z0-9]/gi, '').slice(0, 20), null);
      if (rec && rec.keys && rec.keys.length) {
        const set = new Set(rec.keys);
        const hits = snap.grid.filter((x) => set.has(`${x.sourceId}|${x.title}|${x.date}`));
        const names = [...new Set(hits.map((x) => artistTerm(x.title)))];
        const shown = names.slice(0, 3).join(', ');
        const n = rec.keys.length;
        og = {
          title: `\u{1F49C} A lineup for you \u2014 ${n} show${n === 1 ? '' : 's'}`,
          desc: names.length ? shown + (names.length > 3 ? ` + ${names.length - 3} more` : '') + ' \u00b7 tap to listen' : 'A friend shared their liked shows \u00b7 tap to listen',
        };
        if (hits[0]) {
          try {
            const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 2000);
            const it = await fetch('https://itunes.apple.com/search?media=music&entity=musicTrack&limit=1&term=' + encodeURIComponent(artistTerm(hits[0].title)), { signal: ac.signal }).then((r) => r.json());
            clearTimeout(t);
            const art = it.results && it.results[0] && it.results[0].artworkUrl100;
            if (art) og.image = art.replace('100x100bb', '600x600bb');
          } catch (err) { /* text card */ }
        }
      }
    }
    res.statusCode = 200;
    res.end(page(snap, og));
  } catch (err) {
    res.statusCode = 500;
    res.end('<p>listen view error: ' + esc(err.message) + '</p>');
  }
};
