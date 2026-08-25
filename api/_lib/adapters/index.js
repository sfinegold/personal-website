// Adapter registry — custom per-venue scrapers ("expedited scraping") for sites
// the generic deterministic parser (JSON-LD / iCal / RSS) can't read.
//
// A source opts in with `adapter: '<name>'`. The engine tries the adapter FIRST
// (it's tailored and fast); if it finds nothing or throws, it falls back to the
// generic deterministic parse, then the optional LLM.
//
// Adapter contract:  async (source, ctx) => normalizedEvents[]
//   ctx = { todayYMD, windowEndYMD }
//   use parse.normalizeEvent(raw, source) to produce engine-ready events.
//
// To add one: drop a module in this folder and register it below.

const registry = {
  tribe: require('./tribe'), // The Events Calendar (WordPress plugin) JSON API
  eventdiscovery: require('./eventdiscovery'), // TicketWeb "event-discovery" plugin (The Independent, The New Parish)
  ticketmaster: require('./ticketmaster'),
  tmfestivals: require('./tmfestivals'), // Discovery API (TICKETMASTER_API_KEY) — Shoreline/Fox/Warfield/Greek/arenas
};

function getAdapter(name) {
  return name && registry[name] ? registry[name] : null;
}

function adapterNames() {
  return Object.keys(registry);
}

module.exports = { getAdapter, adapterNames };
