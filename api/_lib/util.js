// Lineup — small date/timezone helpers. All event-time reasoning happens in the
// profile's timezone, so these wrap Intl.DateTimeFormat to extract fields in a
// given zone from an ISO string.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// An event's date (YYYY-MM-DD) and time (HH:mm) are already in the VENUE's local
// wall-clock. So weekday/hour come straight from the strings — no timezone
// conversion (which would wrongly depend on where this code runs).

// Weekday label ('Mon'…) for a YYYY-MM-DD calendar date, runner-tz-independent.
function weekdayOfYMD(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// Hour (0–23) from an "HH:mm" string, or null if absent/unparseable.
function hourOf(time) {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  return parseInt(time.split(':')[0], 10);
}

// Format an "HH:mm" 24h string as "7:00 PM".
function formatClock(time) {
  const h = hourOf(time);
  if (h == null) return '';
  const min = time.split(':')[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${ampm}`;
}

// Fields of a Date as seen in a specific IANA timezone.
function zoned(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // some environments emit 24 for midnight
  return {
    weekday: get('weekday'),
    hour,
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

// Today's date (YYYY-MM-DD) in a timezone.
function todayYMD(timeZone, now) {
  return zoned(now || new Date(), timeZone).ymd;
}

// Add days to a YYYY-MM-DD string (UTC-safe arithmetic).
function addDaysYMD(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Days between two YYYY-MM-DD strings (b - a).
function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86400000);
}

// Is `now` inside a profile's send window? True on a scheduled weekday once the
// local clock (in the profile's tz) has reached the send hour.
function isSendWindow(now, profile) {
  const sched = profile.schedule;
  if (!sched) return false;
  const { weekday, hour } = zoned(now, profile.timezone);
  return sched.days.includes(weekday) && hour >= sched.hour;
}

module.exports = { WEEKDAYS, weekdayOfYMD, hourOf, formatClock, zoned, todayYMD, addDaysYMD, daysBetween, isSendWindow };
