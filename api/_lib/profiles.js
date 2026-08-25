// Lineup — profile definitions.
//
// Everything person-specific lives here. The engine is generic and loops over
// these. Source lists are SEED defaults; live edits from the admin page are
// stored in KV (see store.js) and merged over these at run time.
//
// A profile:
//   id         short slug, also the admin path (/lineup/<id>)
//   name       display name
//   city       human string
//   coords     {lat, lon} for the weather lookup (NWS)
//   timezone   IANA tz — all day-of-week / hour math happens in this zone
//   recipientEnv  name of the env var holding the recipient email
//   passwordEnv   name of the env var holding the admin password (optional gate)
//   interests  allowed category vocabulary for this person
//   favorites  categories to boost in ranking
//   filters    the "is this good for them?" rules (see filter.js)
//   sources    seed venue list: {id,name,url,category,setting,enabled,membership?}
//
// setting: 'indoor' | 'outdoor'  — the cool<80 rule only applies to 'outdoor'.

const bayAreaVenues = require('./venues/bayarea.json');

const MILTON = {
  id: 'milton',
  name: 'Milton',
  city: 'Houston, TX',
  coords: { lat: 29.7604, lon: -95.3698 },
  timezone: 'America/Chicago',
  recipients: ['miltonfinegold@gmail.com', 'julimf7@gmail.com'], // Milton + his caretaker
  recipientEnv: 'MILTON_EMAIL', // comma-separated env var, if set, overrides `recipients`
  passwordEnv: 'LINEUP_MILTON_PASSWORD', // optional; if unset the page is open
  schedule: { days: ['Mon'], hour: 8 }, // weekly, 8am Monday in `timezone`
  interests: ['opera', 'classical', 'lecture', 'exhibit', 'art', 'natural-history', 'zoo', 'tennis'],
  favorites: ['lecture', 'natural-history', 'opera', 'classical'],
  // Houston average monthly high °F (Jan→Dec) — fallback for the "cool" rule when
  // the 7-day forecast doesn't reach an event (needed for the month-long window).
  climate: [63, 67, 73, 79, 86, 91, 94, 94, 90, 82, 72, 65],
  filters: {
    lookaheadDays: 30,     // show top events for the next month, not just the week
    maxPicks: 12,          // cap the digest to the best N
    maxPerVenue: 3,        // no more than 3 events from any one venue (diversity guardrail)
    preferEvents: true,    // dated happenings (lectures/talks/performances) over standing exhibits
    cool: { maxTempF: 80, appliesTo: 'outdoor' }, // ignored for indoor (air-conditioned) venues
    maxEffort: 'medium',                          // drop 'high' physical-exertion events
    // No events during his tennis evenings:
    blackout: [
      { weekday: 'Tue', afterHour: 16 },
      { weekday: 'Thu', afterHour: 16 },
    ],
    freeBoost: true,
  },
  sources: [
    // Opera & classical
    { id: 'oith', name: 'Opera in the Heights', url: 'https://operaintheheights.org/', category: 'opera', setting: 'indoor', enabled: true, membership: true },
    { id: 'hgo', name: 'Houston Grand Opera', url: 'https://www.houstongrandopera.org/', category: 'opera', setting: 'indoor', enabled: true },
    { id: 'symphony', name: 'Houston Symphony', url: 'https://www.houstonsymphony.org/', category: 'classical', setting: 'indoor', enabled: true },
    { id: 'dacamera', name: 'Da Camera', url: 'https://www.dacamera.com/', category: 'classical', setting: 'indoor', enabled: true },
    { id: 'roco', name: 'River Oaks Chamber Orchestra', url: 'https://rocohouston.org/', category: 'classical', setting: 'indoor', enabled: true },
    { id: 'rice-music', name: 'Rice Shepherd School of Music', url: 'https://music.rice.edu/', category: 'classical', setting: 'indoor', enabled: true },
    { id: 'uh-music', name: 'UH Moores School of Music', url: 'https://www.uh.edu/kgmca/music/', category: 'classical', setting: 'indoor', enabled: true },
    // Museums, art & lectures
    { id: 'mfah', name: 'Museum of Fine Arts Houston', url: 'https://www.mfah.org/', category: 'art', setting: 'indoor', enabled: true },
    { id: 'hmns', name: 'Houston Museum of Natural Science', url: 'https://www.hmns.org/', category: 'natural-history', setting: 'indoor', enabled: true },
    { id: 'menil', name: 'The Menil Collection', url: 'https://www.menil.org/', category: 'art', setting: 'indoor', enabled: true },
    { id: 'camh', name: 'Contemporary Arts Museum Houston', url: 'https://camh.org/', category: 'art', setting: 'indoor', enabled: true },
    { id: 'asia', name: 'Asia Society Texas', url: 'https://asiasociety.org/texas', category: 'lecture', setting: 'indoor', enabled: true },
    { id: 'hmh', name: 'Holocaust Museum Houston', url: 'https://hmh.org/', category: 'lecture', setting: 'indoor', enabled: true },
    { id: 'library', name: 'Houston Public Library', url: 'https://houstonlibrary.org/', category: 'lecture', setting: 'indoor', enabled: true },
    // Zoo & outdoor
    { id: 'zoo', name: 'Houston Zoo', url: 'https://www.houstonzoo.org/', category: 'zoo', setting: 'outdoor', enabled: true },
    { id: 'miller', name: 'Miller Outdoor Theatre', url: 'https://www.milleroutdoortheatre.com/', category: 'classical', setting: 'outdoor', enabled: true },
    // Tennis (spectator)
    { id: 'claycourt', name: "US Men's Clay Court Championship", url: 'https://mensclaycourt.com/', category: 'tennis', setting: 'outdoor', enabled: true },
  ],
};

const SAM = {
  id: 'me',
  name: 'Sam',
  city: 'San Francisco, CA',
  coords: { lat: 37.7749, lon: -122.4194 },
  timezone: 'America/Los_Angeles',
  recipients: ['sjfinegold@gmail.com'],
  recipientEnv: 'SAM_EMAIL', // comma-separated env var, if set, overrides `recipients`
  passwordEnv: 'LINEUP_ME_PASSWORD',
  schedule: { days: ['Mon'], hour: 8 }, // weekly, 8am Monday in `timezone`
  listen: true, // music-forward: link the Apple-Music-preview view (/lineup/sf) in the email
  interests: ['comedy', 'live-music', 'electronic', 'jazz', 'sports', 'theater'],
  favorites: ['electronic', 'live-music'],
  filters: {
    lookaheadDays: 130,  // through end of year (site indexes all upcoming concerts)
    maxPicks: 12,
    maxPerVenue: 3,   // no more than 3 events from any one venue in the digest
    preferEvents: true,
    // No temperature / exertion gates for Sam.
    cool: null,
    maxEffort: null,
    blackout: [],
    weekendPreferred: true, // small boost to Fri/Sat/Sun events
    freeBoost: false,
  },
  // Exhaustive Bay Area music-venue list (SF, East Bay, Peninsula, South Bay,
  // Marin) + free newsletters/aggregators. Editable data file — see venues/bayarea.json.
  sources: bayAreaVenues,
};

const PROFILES = { milton: MILTON, me: SAM };

function getProfile(id) {
  return PROFILES[id] || null;
}

// Comma-separated recipient list for a profile: env override, else `recipients`.
function recipientList(profile) {
  const env = process.env[profile.recipientEnv];
  if (env) return env;
  if (profile.recipients && profile.recipients.length) return profile.recipients.join(', ');
  return profile.recipient || null;
}

function allProfiles() {
  return Object.values(PROFILES);
}

module.exports = { PROFILES, getProfile, allProfiles, recipientList };
