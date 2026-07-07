# Lineup — setup & deploy

Curated local-events email. Two profiles: **Milton** (Houston) at `/lineup/milton`,
**Sam** (SF) at `/lineup/me`. Built into this repo as Vercel serverless functions —
no framework, pure Node + `fetch` — one dependency, `nodemailer`, for Gmail SMTP.

## Files

```
scripts/lineup-run.js    LOCAL scheduled runner — deterministic + curated, sends digest
scripts/lineup-curate.js writes Claude-curated events to the store (see LINEUP_CURATION.md)
scripts/lineup-send-test.js  one-off Gmail send test
api/lineup-milton.js     /lineup/milton  — Milton's admin page (hosted)
api/lineup-me.js         /lineup/me      — Sam's admin page (hosted)
api/lineup-cron.js       /api/lineup-cron — optional manual/HTTP trigger (not scheduled)
api/_lib/                shared modules (not routed, not served publicly)
  profiles.js   profiles + seed sources + schedule   ← edit interests/sources here
  engine.js     crawl → (deterministic + curated) → filter → rank → digest
  crawl.js      fetch + clean page text
  parse.js      deterministic extraction: JSON-LD / iCal / RSS
  extract.js    orchestrator; optional LLM fallback (only if a key is set)
  weather.js    NWS forecast highs (free, no key)
  filter.js     interest / blackout / temp / effort rules + ranking
  digest.js     HTML + text email
  email.js      email send — Gmail SMTP (nodemailer), Resend fallback
  store.js      Supabase (sources, curated events, logs), in-memory fallback
  auth.js       password gate (httpOnly cookie)
  admin.js      shared admin page
  util.js       date/timezone helpers + send-window logic
vercel.json     rewrites + function timeouts (no cron — the local job sends)
```

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Var | Required | What |
|---|---|---|
| `ANTHROPIC_API_KEY` | **optional** | LLM *fallback* extractor — only runs on sites where deterministic parsing (JSON-LD/iCal/RSS) finds nothing. Unset ⇒ deterministic-only. |
| `LINEUP_USE_LLM` | optional | set to `0` to force-disable the LLM fallback even if a key exists |
| `GMAIL_USER` | yes | Gmail address mail is sent from, e.g. `sjfinegold@gmail.com` |
| `GMAIL_APP_PASSWORD` | yes | Google **App Password** (16 chars) — requires 2FA on the account |
| `LINEUP_FROM_NAME` | optional | display name on the email, default `Lineup` |
| `RESEND_API_KEY` / `LINEUP_FROM` | optional | only if you later switch back to Resend (domain-verified) instead of Gmail |
| `MILTON_EMAIL` / `SAM_EMAIL` | optional | recipient overrides (defaults are set in `profiles.js`) |
| `SUPABASE_URL` | yes | your Supabase project URL, e.g. `https://abcd.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | service role key (server-side; bypasses RLS) |
| `LINEUP_ME_PASSWORD` | recommended | password for `/lineup/me` |
| `LINEUP_MILTON_PASSWORD` | optional | if unset, `/lineup/milton` is open (fine — no secrets there) |
| `LINEUP_MODEL` | optional | LLM-fallback model if you ever set an API key, default `claude-sonnet-5` |

Set the same `SUPABASE_*` and `GMAIL_*` vars **both** in Vercel (for the admin page) and
in your local shell/launchd env (for the send job), so both reach the same store.

## Email (Gmail SMTP)

Mail is sent through your Google account — no domain, no DNS, no per-domain fee.
It arrives **from your Gmail address** (fine for a personal digest; Milton sees it's you).

1. On the Google account (`GMAIL_USER`), enable **2-Step Verification**.
2. Create an **App Password**: Google Account → Security → App passwords → generate one
   for "Mail". You get a 16-character password.
3. Set env vars `GMAIL_USER` and `GMAIL_APP_PASSWORD` (the 16-char value, spaces optional).
4. That's it — `sendEmail` uses `smtp.gmail.com:465`. No DNS or verification step.

Volume limits are generous (consumer Gmail ~500 recipients/day; Workspace ~2,000) —
this app sends a handful per week, so you're nowhere near them.

Switching to `samfinegold.me` branding later: set up Resend (or SES) with a verified
domain and set `RESEND_API_KEY` + `LINEUP_FROM`; the code auto-prefers Gmail when its
vars are present, so unset those to fall back to Resend. Transport logic lives in
`api/_lib/email.js`.

## Storage (Supabase)

Create a Supabase project, then run this once in the SQL editor:

```sql
create table if not exists lineup_state (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);
```

Copy the project URL and the **service role** key into `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` (in Vercel and in your local env). One tiny key/value table
holds the editable source list, the curated-events bucket, and run logs for both profiles.
Without these vars the app still runs on an in-memory store (fine for a dry run; nothing
persists).

## Sending — the local scheduled job

Sending runs from your machine (no cloud cron, no key). The runner is schedule-aware: it
only sends on a scheduled day (**weekly, Monday**) after 08:00 in the profile's timezone,
and at most once per send-day (a `lastsent` guard in Supabase). Each digest looks **30 days
ahead** and flags **newly-added** events (not in the previous week's send). Run it on a loop
while the laptop is open and it "catches" the window whenever the Mac is awake.

```bash
node scripts/lineup-run.js          # both profiles; sends if in window
node scripts/lineup-run.js --dry    # run + print, never send
node scripts/lineup-run.js me --send  # force send now
```

Schedule it with launchd (or `cron`) — e.g. every 2 hours:

```
0 */2 * * *  cd /path/to/personal-website && \
  GMAIL_USER=… GMAIL_APP_PASSWORD=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  node scripts/lineup-run.js >> /tmp/lineup.log 2>&1
```

Milton's JS-rendered venues need a **curation pass** to have content — see
[LINEUP_CURATION.md](LINEUP_CURATION.md). Sam needs none (deterministic covers him).

## Try it

1. **Email path:** `export GMAIL_USER` + `GMAIL_APP_PASSWORD`, then
   `node scripts/lineup-send-test.js you@example.com` (already verified working).
2. **Full dry run:** `node scripts/lineup-run.js --dry` — shows per-profile event counts
   without sending.
3. **Force a real send:** `node scripts/lineup-run.js me --send`.
4. **Admin (after deploy):** visit `/lineup/me`, **Preview next digest**, **Send test**.

## How extraction works (deterministic-first)

Per source, in order — first hit wins:
1. **JSON-LD** (`schema.org/Event`) embedded in the page — free, exact.
2. **iCal** (`BEGIN:VCALENDAR`) if the URL is an `.ics` feed.
3. **RSS/Atom** items that carry a real event date.
4. **LLM fallback** (only if `ANTHROPIC_API_KEY` set) for pages with no structured data.

The admin **Preview** shows a per-source `method:` (json-ld / ical / rss / llm / —) so you
can see how each venue was read and where coverage is thin.

**Empirical reality (measured):** platform-hosted venues (Live Nation/Ticketmaster,
DICE, Eventbrite, AXS, Bandsintown) reliably expose JSON-LD — Cobb's returned 25 events
with zero AI. Bespoke arts-org sites (opera/symphony/museum) often expose only
Organization schema, render events via JS, or block bots (MFAH → 403). Those are where
the LLM fallback earns its keep. **To improve deterministic coverage, point a source at
its actual events/calendar page** (not the homepage) via the admin.

## Notes / known limits

- Some venues (e.g. MFAH) block non-browser requests with a 403. A per-source parser or
  an official feed URL is the fix; the crawler already sends a descriptive UA.
- Aggregator sites (Songkick, Do415) can be heavily JS-rendered; deterministic parsing
  may get thin results. Prefer the platform/venue page that carries JSON-LD, or handle
  them in the Claude curation pass.
- Milton's opera/classical/museum venues render events in JS → the deterministic parser
  reads ~0 events from them. That's expected; the curation routine covers them.
- The local send job depends on the laptop being open on a send-day. If it was asleep all
  Mon/Thu, that send is missed — run `node scripts/lineup-run.js --send` to catch up.
- No cross-run de-duplication yet: an event can appear in both Mon and Thu emails.
