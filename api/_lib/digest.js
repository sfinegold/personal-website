// Lineup — render kept events into a wide, dense, tag-free HTML email grouped by
// day. Metadata (time, venue, category, price, membership, outdoor temp) is shown
// as one compact inline line rather than pill badges. Newly-added events (not in
// the previous digest) get a small "New" flag — the only visual marker used.

const { formatClock } = require('./util');

const CATEGORY_LABEL = {
  opera: 'Opera', classical: 'Classical', lecture: 'Lecture', exhibit: 'Exhibit',
  art: 'Art', 'natural-history': 'Natural History', zoo: 'Zoo', tennis: 'Tennis',
  comedy: 'Comedy', 'live-music': 'Live Music', electronic: 'Electronic', sports: 'Sports',
  theater: 'Theater', other: 'Event',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtDayHeading(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function fmtTime(ev) {
  return formatClock(ev.time);
}

function priceLabel(price) {
  if (price === 'free' || price === 0) return 'Free';
  if (typeof price === 'number') return `$${price}`;
  return '';
}

function groupByDay(kept) {
  const groups = new Map();
  for (const ev of kept) {
    if (!groups.has(ev.date)) groups.set(ev.date, []);
    groups.get(ev.date).push(ev);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// Compact inline metadata line: "1:30 PM · MFAH · Lecture · Free"
function metaLine(ev) {
  const parts = [];
  const t = fmtTime(ev);
  if (t) parts.push(t);
  if (ev.venue) parts.push(esc(ev.venue));
  parts.push(CATEGORY_LABEL[ev.category] || 'Event');
  if (ev.membership) parts.push('Member event');
  const price = priceLabel(ev.price);
  if (price) parts.push(price);
  if (ev.setting === 'outdoor') parts.push('Outdoor' + (ev.forecastHigh != null ? ` ${ev.forecastHigh}°F` : ''));
  if (ev.ongoing) parts.push('on view');
  return parts.join(' &middot; ');
}

function eventRow(ev) {
  const link = ev.url
    ? `<a href="${esc(ev.url)}" style="color:#1a1a1a;text-decoration:none;">${esc(ev.title)}</a>`
    : esc(ev.title);
  const newFlag = ev.isNew
    ? `<span style="color:#c026d3;font-weight:700;font-size:11px;letter-spacing:.04em;vertical-align:1px;">NEW</span> `
    : '';
  return `
    <tr><td style="padding:7px 0;border-bottom:1px solid #efefef;">
      <div style="font-size:16px;font-weight:600;color:#1a1a1a;line-height:1.35;">${newFlag}${link}</div>
      <div style="font-size:13px;color:#777;margin-top:2px;">${metaLine(ev)}</div>
      ${ev.note ? `<div style="font-size:13px;color:#444;margin-top:2px;line-height:1.4;">${esc(ev.note)}</div>` : ''}
    </td></tr>`;
}

function renderHTML(profile, kept, meta) {
  const newCount = kept.filter((e) => e.isNew).length;
  const dayBlocks = groupByDay(kept).map(([ymd, evs]) => `
    <tr><td style="padding:16px 0 4px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8b5cf6;border-bottom:2px solid #f0f0f0;padding-bottom:4px;">${esc(fmtDayHeading(ymd))}</div>
    </td></tr>
    <tr><td><table width="100%" cellpadding="0" cellspacing="0" role="presentation">${evs.map(eventRow).join('')}</table></td></tr>
  `).join('');

  const empty = `<tr><td style="padding:20px 0;font-size:15px;color:#666;">No matching events in the next ${profile.filters.lookaheadDays} days. The venues Lineup checks can be adjusted anytime.</td></tr>`;

  return `<!doctype html><html><body style="margin:0;background:#f0f0f0;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0f0f0;padding:16px 0;">
    <tr><td align="center">
      <table width="720" cellpadding="0" cellspacing="0" role="presentation" style="max-width:720px;width:100%;background:#fff;border-radius:8px;padding:22px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding-bottom:6px;border-bottom:2px solid #1a1a1a;">
          <span style="font-size:23px;font-weight:800;color:#1a1a1a;">Your Lineup</span>
          <span style="font-size:14px;color:#777;"> &nbsp;${esc(profile.city)} &middot; next ${profile.filters.lookaheadDays} days${newCount ? ` &middot; ${newCount} new` : ''}</span>
        </td></tr>
        ${meta.recommendation ? `<tr><td style="padding-top:14px;">
          <div style="background:#faf5ff;border-left:3px solid #8b5cf6;border-radius:0 6px 6px 0;padding:12px 16px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#7c3aed;margin-bottom:4px;">This week's top pick</div>
            <div style="font-size:15px;color:#2a2a2a;line-height:1.5;">${esc(meta.recommendation)}</div>
          </div>
        </td></tr>` : ''}
        ${kept.length ? dayBlocks : empty}
        <tr><td style="padding-top:16px;border-top:1px solid #eee;">
          ${meta.adminUrl ? `<div style="font-size:13px;margin-bottom:6px;"><a href="${esc(meta.adminUrl)}" style="color:#7c3aed;text-decoration:none;font-weight:600;">See or edit the venues Lineup checks &rarr;</a></div>` : ''}
          <div style="font-size:12px;color:#aaa;">${kept.length} pick${kept.length === 1 ? '' : 's'} for ${esc(profile.name)}${meta.tennisNote ? ' &middot; Tue &amp; Thu evenings kept clear for tennis' : ''}</div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function renderText(profile, kept, meta) {
  if (!kept.length) return `Your Lineup — ${profile.city} — next ${profile.filters.lookaheadDays} days\n\nNo matching events.`;
  const lines = [`Your Lineup — ${profile.city} — next ${profile.filters.lookaheadDays} days`, ''];
  if (meta.recommendation) { lines.push('THIS WEEK\'S TOP PICK', meta.recommendation, ''); }
  for (const [ymd, evs] of groupByDay(kept)) {
    lines.push(fmtDayHeading(ymd).toUpperCase());
    for (const ev of evs) {
      const t = fmtTime(ev);
      const price = priceLabel(ev.price);
      lines.push(`  ${ev.isNew ? '[NEW] ' : ''}${t ? t + ' — ' : ''}${ev.title} @ ${ev.venue}${price ? ` (${price})` : ''}`);
      if (ev.note) lines.push(`      ${ev.note}`);
    }
    lines.push('');
  }
  if (meta.adminUrl) lines.push(`See or edit the venues Lineup checks: ${meta.adminUrl}`, '');
  return lines.join('\n');
}

function subjectLine(profile, kept, meta) {
  const n = kept.length;
  if (!n) return `Your ${profile.city} Lineup — nothing coming up`;
  const newCount = kept.filter((e) => e.isNew).length;
  const newBit = newCount ? ` (${newCount} new)` : '';
  return `Your ${profile.city} Lineup — ${n} pick${n === 1 ? '' : 's'}${newBit}`;
}

module.exports = { renderHTML, renderText, subjectLine, groupByDay };
