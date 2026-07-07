# Lineup — Claude curation routine (no API key)

Milton's opera/classical/museum venues render their events in JavaScript, so the
deterministic parser reads 0 events from them. This routine closes that gap using
**Claude Code** (your subscription — not the paid API): a Claude session reads the
rendered pages, extracts the events, and writes them to the shared store. The engine
then merges them with the deterministic events at send time.

Run it **while your laptop is open**, before/independent of the send window — the
digest picks up whatever curated events are in the store.

## How to run it

Open Claude Code in the `personal-website` repo and give it this task:

> **Curate Lineup events for `milton`.**
> For each enabled source in Milton's list (`api/_lib/profiles.js`), open the venue's
> events/calendar page and read the actual events (use the browser tools for
> JS-rendered pages). Collect events dated within the next 7 days that match Milton's
> interests (opera, classical, free lectures, museum art/exhibits, natural history,
> zoo, tennis). For each event capture: title, date (YYYY-MM-DD), time (24h or null),
> category (from his interest list), setting (indoor/outdoor), price ("free"/number/
> null), effort (low/medium/high — seated concert/lecture = low, museum stroll =
> medium, long walking = high), a short note, url, venue, and sourceId.
> Then, acting as the **judge**, write one short paragraph (2–4 sentences) recommending
> the single best event for Milton this week — factor in his tastes (favors lectures,
> natural history, opera/classical), that he wants something cool, low-effort, and seated,
> and that his Tue/Thu evenings are tennis. Name a specific pick and a lighter alternative.
> Write `/tmp/milton-curated.json` as `{"events":[...], "recommendation":"...paragraph..."}`,
> then run:
> `node scripts/lineup-curate.js milton /tmp/milton-curated.json`

Claude fills the `curated` bucket and the `recommendation` (top-of-email write-up); you
don't touch JSON by hand. The digest renders the recommendation as "This week's top pick".
(Array-only JSON updates events without touching the recommendation.)

## What the pieces do

- `scripts/lineup-curate.js milton events.json` — validates + writes the curated set
  to Supabase (replaces the previous set). `--show` prints what's stored.
- The engine (`api/_lib/engine.js`) reads `getCurated(profileId)` and merges those
  events with deterministic ones, then applies Milton's filters + ranking as usual.
- Curated events flow through the exact same filters (tennis blackout, outdoor temp,
  effort, dedupe), so anything Claude collects still gets vetted by the rules.

## Cadence

- **Sam** needs no curation — his venues are on ticketing platforms that expose clean
  JSON-LD, so the deterministic path covers him.
- **Milton** benefits from a curation pass shortly before each send (Mon/Thu). Run the
  routine when convenient while the laptop is open; the send job uses the latest set.
- Curated events are dated, so a slightly stale set self-cleans (past dates fall out of
  the window). Re-running replaces the set.
