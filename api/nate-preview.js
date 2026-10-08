// /api/nate-preview?u=<soundeo track path or URL> — resolves the track's
// 2-minute preview MP3 (Beatport sample or a short-lived signed sndstatic
// link) from the public soundeo track page and redirects to it. Used by
// /nate-playlist for inline playback. Cached an hour at the edge, well
// inside the signed link's lifetime.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let u = (url.searchParams.get('u') || '').trim();
  const m = u.match(/^(?:https?:\/\/soundeo\.com)?(\/track\/[a-z0-9-]+\.html)$/i);
  if (!m) { res.statusCode = 400; return res.end('bad track'); }
  try {
    const r = await fetch('https://soundeo.com' + m[1], { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
    const html = await r.text();
    const p = html.match(/data-track-url="([^"]+)"/);
    if (!p) { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); return res.end('no preview'); }
    const preview = p[1].replace(/&amp;/g, '&');
    if (url.searchParams.get('json')) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=600');
      return res.end(JSON.stringify({ preview }));
    }
    res.statusCode = 302;
    res.setHeader('Location', preview);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=600');
    res.end();
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Cache-Control', 'no-store');
    res.end(String(e.message || e));
  }
};
