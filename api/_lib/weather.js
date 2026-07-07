// Lineup — forecast lookup via the National Weather Service API (free, no key).
//
// Flow: /points/{lat},{lon} -> forecast URL -> periods (each has a day/night
// temperature in °F). We map an event's date to that day's DAYTIME high, which
// is the relevant number for "is it cool enough to be outside".
//
// NWS only forecasts ~7 days out. Beyond that (or on any error) we return null,
// and the filter treats "unknown forecast" as non-blocking (keep the event).

const UA = 'LineupBot/1.0 (+https://samfinegold.me/lineup; contact sjfinegold@gmail.com)';

async function nwsFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' } });
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  return res.json();
}

// Returns a map { 'YYYY-MM-DD': daytimeHighF } for the coords, or {} on failure.
async function getForecastHighs(coords) {
  try {
    const points = await nwsFetch(`https://api.weather.gov/points/${coords.lat},${coords.lon}`);
    const forecastUrl = points?.properties?.forecast;
    if (!forecastUrl) return {};
    const forecast = await nwsFetch(forecastUrl);
    const periods = forecast?.properties?.periods || [];
    const highs = {};
    for (const p of periods) {
      if (!p.isDaytime) continue; // daytime period carries the day's high
      const ymd = (p.startTime || '').slice(0, 10);
      if (ymd && p.temperature != null && highs[ymd] == null) {
        highs[ymd] = p.temperature; // NWS returns °F for US points
      }
    }
    return highs;
  } catch {
    return {};
  }
}

module.exports = { getForecastHighs };
