// /lineup/yt?artist=NAME — top-5 music videos for an artist, for the in-page
// YouTube browse player. Cached forever in Supabase (search costs 100 quota
// units; cache hits cost none). Env: YOUTUBE_API_KEY or YOUTUBE_KEY.

const { getJSON, setJSON } = require('./_lib/store');

const dec = (t) => String(t).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&apos;|&#39;/g, "'");

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const url = new URL(req.url, 'http://x');
  const artist = (url.searchParams.get('artist') || '').trim().slice(0, 80);
  const hint = (url.searchParams.get('hint') || '').trim().slice(0, 40);
  if (!artist) { res.statusCode = 400; return res.end('{"error":"no artist"}'); }
  const key = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_KEY;
  const ck = 'lineup:yt2:' + (artist + '|' + hint).toLowerCase();
  try {
    const cached = await getJSON(ck, null);
    if (cached) return res.end(JSON.stringify({ artist, tracks: cached, cached: true }));
    if (!key) { res.statusCode = 503; return res.end('{"error":"no key"}'); }
    // manual per-artist override: pin to a specific channel's top videos
    const ov = await getJSON('lineup:ytoverride:' + artist.toLowerCase(), null);
    const q = ov && ov.channelId
      ? 'channelId=' + ov.channelId + '&order=viewCount&q='
      : 'videoCategoryId=10&q=' + encodeURIComponent(hint ? artist + ' ' + hint : artist);
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&' + q + '&key=' + key);
    const d = await r.json();
    if (d.error) { res.statusCode = 502; return res.end(JSON.stringify({ error: d.error.message })); }
    const tracks = (d.items || [])
      .filter((i) => i.id && i.id.videoId)
      .slice(0, 5)
      .map((i) => ({ id: i.id.videoId, title: dec(i.snippet.title) }));
    await setJSON(ck, tracks);
    res.end(JSON.stringify({ artist, tracks, cached: false }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
};
