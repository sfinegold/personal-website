// /api/spotify-auth — one-time Spotify connect for the site owner.
//
// Register this exact URL as the app's Redirect URI in the Spotify dashboard;
// it serves both halves of the flow:
//
//   GET /api/spotify-auth?key=<SPOTIFY_SETUP_KEY>   -> redirect to Spotify
//   GET /api/spotify-auth?code=...&state=...        -> Spotify sends you back
//
// The key exists so a passer-by can't start an OAuth round trip against the
// app, and is echoed through `state` so the callback can check it came from us.
// Once this has been run once, the refresh token lives in lineup_state and the
// export works forever without touching this route again.

const { getJSON, setJSON } = require('./_lib/store');

const AUTH_KEY = 'spotify:auth';
const SCOPES = 'playlist-modify-public playlist-modify-private';

const redirectUri = (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = host && host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/spotify-auth`;
};

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{font:16px/1.6 -apple-system,Helvetica,Arial,sans-serif;
background:#F7F5F0;color:#191D23;margin:0;display:grid;place-items:center;min-height:100vh;padding:2rem}
main{max-width:34rem}h1{font-size:1.2rem;margin:0 0 .8rem}code{background:#EEEAE1;padding:.1rem .35rem;
border-radius:4px;font-size:.9em}a{color:#33556F}</style><main><h1>${title}</h1>${body}</main>`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const setupKey = process.env.SPOTIFY_SETUP_KEY;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const q = req.query || {};

  try {
    if (!clientId || !clientSecret || !setupKey) {
      return res.status(500).send(page('Not configured',
        '<p>Set <code>SPOTIFY_CLIENT_ID</code>, <code>SPOTIFY_CLIENT_SECRET</code> and ' +
        '<code>SPOTIFY_SETUP_KEY</code> in the Vercel project, then redeploy.</p>'));
    }

    // ---- leg 2: back from Spotify ----
    if (q.code || q.error) {
      if (q.error) return res.status(400).send(page('Spotify declined', `<p>${String(q.error)}</p>`));
      if (q.state !== setupKey) return res.status(403).send(page('Bad state', '<p>Start again from the setup link.</p>'));

      const r = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(q.code),
          redirect_uri: redirectUri(req),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.refresh_token) {
        return res.status(400).send(page('Token exchange failed',
          `<p><code>${(j.error_description || j.error || r.status)}</code></p>`));
      }

      let who = '';
      try {
        const me = await fetch('https://api.spotify.com/v1/me',
          { headers: { Authorization: `Bearer ${j.access_token}` } }).then((x) => x.json());
        who = me && (me.display_name || me.id) ? ` as <b>${me.display_name || me.id}</b>` : '';
      } catch { /* cosmetic only */ }

      await setJSON(AUTH_KEY, {
        refresh_token: j.refresh_token,
        scope: j.scope || SCOPES,
        connected: new Date().toISOString(),
      });
      return res.status(200).send(page('Spotify connected',
        `<p>Connected${who}. Playlists will be created in this account.</p>
         <p>Nothing else to do — <a href="/outside-lands">back to the planner</a>.</p>`));
    }

    // ---- leg 1: send the owner to Spotify ----
    if (q.key !== setupKey) {
      const saved = await getJSON(AUTH_KEY, null);
      return res.status(403).send(page('Spotify setup',
        `<p>${saved && saved.refresh_token ? 'Already connected.' : 'Not connected yet.'}
         Append <code>?key=…</code> to this URL to ${saved ? 're-connect' : 'connect'}.</p>`));
    }
    const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri(req),
      scope: SCOPES,
      state: setupKey,
      show_dialog: 'true',
    });
    res.writeHead(302, { Location: url });
    return res.end();
  } catch (err) {
    return res.status(500).send(page('Error', `<p><code>${String((err && err.message) || err)}</code></p>`));
  }
};
