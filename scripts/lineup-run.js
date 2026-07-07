#!/usr/bin/env node
// Lineup — the local, schedule-aware runner. Deterministic + curated events,
// no API key. Meant to run on a loop while your laptop is open (launchd/cron):
// it only actually sends on a scheduled day (Mon/Thu) after the send hour, and
// at most once per send-day, so it "catches" the window whenever the Mac is awake.
//
// Usage:
//   node scripts/lineup-run.js               # both profiles, send if in window
//   node scripts/lineup-run.js milton        # one profile
//   node scripts/lineup-run.js --dry         # run + print, never send
//   node scripts/lineup-run.js me --send     # force send now, ignore schedule/guard
//
// Env: GMAIL_USER + GMAIL_APP_PASSWORD (send), SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// (shared store; without them it runs on an in-memory store — fine for a dry run).

const path = require('path');
const LIB = path.join(__dirname, '..', 'api', '_lib');
require(path.join(LIB, 'loadenv.js')).loadEnv(); // load repo-root .env before modules read env
const { getProfile, allProfiles, recipientList } = require(path.join(LIB, 'profiles.js'));
const { runProfile } = require(path.join(LIB, 'engine.js'));
const { sendEmail } = require(path.join(LIB, 'email.js'));
const { eventKey } = require(path.join(LIB, 'filter.js'));
const store = require(path.join(LIB, 'store.js'));
const { isSendWindow, todayYMD } = require(path.join(LIB, 'util.js'));

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const ids = args.filter((a) => !a.startsWith('--'));
const dry = flags.has('--dry');
const forceSend = flags.has('--send') || flags.has('--force');

const targets = ids.length ? ids : allProfiles().map((p) => p.id);

async function one(id) {
  const profile = getProfile(id);
  if (!profile) return console.log(`? unknown profile: ${id}`);

  const now = new Date();
  const today = todayYMD(profile.timezone, now);
  const result = await runProfile(id, { dryRun: true }); // build digest, don't send
  const { kept, diagnostics } = result;

  const already = (await store.getLastSent(id)) === today;
  const inWindow = isSendWindow(now, profile);
  const shouldSend = !dry && (forceSend || (inWindow && !already));

  const tag = `[${id}]`;
  console.log(`${tag} ${kept.length} events (of ${diagnostics.totalExtracted}; ${diagnostics.curated} curated) · window=${inWindow} sentToday=${already}`);

  if (!shouldSend) {
    console.log(`${tag} not sending (${dry ? 'dry run' : already ? 'already sent today' : !inWindow ? 'outside send window' : 'ok'}).`);
    return;
  }

  const to = recipientList(profile);
  const info = await sendEmail({ to, subject: result.subject, html: result.html, text: result.text });
  await store.setLastSent(id, today);
  await store.setSentKeys(id, kept.map(eventKey)); // remember what went out, to flag "newly added" next week
  await store.appendLog(id, { at: now.toISOString(), kept: kept.length, extracted: diagnostics.totalExtracted, sent: to });
  console.log(`${tag} SENT to ${to} via ${info.transport} (${kept.length} events).`);
}

(async () => {
  for (const id of targets) {
    try {
      await one(id);
    } catch (err) {
      console.error(`[${id}] ERROR: ${err.message}`);
      process.exitCode = 1;
    }
  }
})();
