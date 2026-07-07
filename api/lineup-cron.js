// /api/lineup-cron — the scheduled engine trigger (declared in vercel.json crons).
//
// Runs one or all profiles and emails the digest. Secured so randoms can't spam
// it: allow Vercel's own cron invocations (they carry an `x-vercel-cron` header),
// or a manual call with ?key=<LINEUP_CRON_SECRET>.
//
// Query: ?profile=milton|me|all (default all) · ?dryRun=1 (render, don't send)

const { runProfile } = require('./_lib/engine');
const { allProfiles } = require('./_lib/profiles');

function authorized(req) {
  if (req.headers['x-vercel-cron']) return true; // Vercel's scheduler
  const secret = process.env.LINEUP_CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('key') === secret) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
  if (!authorized(req)) {
    res.statusCode = 401;
    return res.end('unauthorized');
  }
  const url = new URL(req.url, 'http://x');
  const which = url.searchParams.get('profile') || 'all';
  const dryRun = url.searchParams.get('dryRun') === '1';

  const targets = which === 'all' ? allProfiles().map((p) => p.id) : [which];
  const results = [];
  for (const id of targets) {
    try {
      const r = await runProfile(id, { dryRun });
      results.push({ profile: id, kept: r.kept.length, sent: r.sent, extracted: r.diagnostics.totalExtracted });
    } catch (err) {
      results.push({ profile: id, error: String(err.message || err) });
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ran: results, dryRun }, null, 2));
};
