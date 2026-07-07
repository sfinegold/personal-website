// Local test: send a sample Lineup digest through the real email path (Gmail SMTP).
//
// Reads credentials from ENV ONLY (never type secrets as arguments). Run it in
// YOUR OWN terminal so the app password isn't captured anywhere:
//
//   export GMAIL_USER="sjfinegold@gmail.com"
//   export GMAIL_APP_PASSWORD="xxxxxxxxxxxxxxxx"   # 16-char app password
//   node scripts/lineup-send-test.js you@example.com
//
// If no recipient arg is given, it sends to GMAIL_USER (email yourself).

const path = require('path');
const LIB = path.join(__dirname, '..', 'api', '_lib');
require(path.join(LIB, 'loadenv.js')).loadEnv();
const { getProfile } = require(path.join(LIB, 'profiles.js'));
const { renderHTML, renderText, subjectLine } = require(path.join(LIB, 'digest.js'));
const { sendEmail, transport } = require(path.join(LIB, 'email.js'));

const to = (process.argv[2] || process.env.GMAIL_USER || '').trim();

if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.error('Set GMAIL_USER and GMAIL_APP_PASSWORD in your environment first.');
  process.exit(1);
}
if (!to.includes('@')) {
  console.error(`Recipient "${to}" is not a full email address.`);
  console.error('Pass one explicitly, e.g.:  node scripts/lineup-send-test.js you@gmail.com');
  console.error('(This usually means GMAIL_USER is missing the @gmail.com part.)');
  process.exit(1);
}

const profile = getProfile('milton');
const meta = { rangeLabel: 'Jul 6 – 13', short: 'week', tennisNote: true };
const kept = [
  { title: "La Bohème", venue: 'Opera in the Heights', date: '2026-07-08', time: '19:30', category: 'opera', membership: true, price: 'free', setting: 'indoor', note: 'Puccini — your membership covers this', score: 80 },
  { title: 'Morning at the Zoo', venue: 'Houston Zoo', date: '2026-07-08', time: '10:00', category: 'zoo', setting: 'outdoor', forecastHigh: 74, price: 26, note: 'Cool morning, easy loop', score: 20 },
  { title: 'Lecture: Ancient Egypt', venue: 'Houston Public Library', date: '2026-07-09', time: '14:00', category: 'lecture', setting: 'indoor', price: 'free', note: 'Free seated talk', score: 35 },
  { title: 'New Paleontology Hall', venue: 'HMNS', date: '2026-07-11', time: '11:00', category: 'natural-history', setting: 'indoor', price: 25, note: 'Just opened', score: 45 },
];

(async () => {
  console.log(`transport: ${transport()}  →  sending sample digest to ${to} ...`);
  try {
    const res = await sendEmail({
      to,
      subject: '[TEST] ' + subjectLine(profile, kept, meta),
      html: renderHTML(profile, kept, meta),
      text: renderText(profile, kept, meta),
    });
    console.log('✓ sent:', res);
    console.log('Check the inbox (and Spam, just in case) for the sample.');
  } catch (err) {
    console.error('✗ send failed:', err.message);
    process.exit(1);
  }
})();
