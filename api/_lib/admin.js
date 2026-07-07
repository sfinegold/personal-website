// Lineup — shared admin page for a profile. The two API entry points
// (lineup-milton.js, lineup-me.js) just call handleAdmin(req, res, profileId).
//
// Shows the crawled-source list (add / remove / enable / disable), the active
// filter rules, buttons to preview or send-test the digest, and recent run logs.

const { getProfile, recipientList } = require('./profiles');
const store = require('./store');
const { runProfile } = require('./engine');
const { isAuthed, setAuthCookie, readForm, loginPage } = require('./auth');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function send(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(html);
}

function redirect(res, path) {
  res.statusCode = 302;
  res.setHeader('Location', path);
  res.end();
}

async function mergedSources(profile) {
  const edits = await store.loadSourceEdits(profile.id);
  return store.mergeSources(profile.sources, edits);
}

function filterSummary(profile) {
  const f = profile.filters;
  const bits = [`Look-ahead: ${f.lookaheadDays} days`];
  if (f.cool) bits.push(`Cool: outdoor events dropped if forecast ≥ ${f.cool.maxTempF}°F`);
  if (f.maxEffort) bits.push(`Effort: drop above "${f.maxEffort}"`);
  if ((f.blackout || []).length) bits.push('Blackout: ' + f.blackout.map((b) => `${b.weekday} ${b.afterHour}:00+`).join(', '));
  if (f.weekendPreferred) bits.push('Weekend-preferred ranking');
  if (f.freeBoost) bits.push('Free events boosted');
  return bits;
}

function dashboard(profile, sources, log, flash) {
  const path = `/lineup/${profile.id}`;
  const rows = sources.map((s) => `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:8px 6px;">
        <form method="POST" style="margin:0;">
          <input type="hidden" name="action" value="toggle">
          <input type="hidden" name="id" value="${esc(s.id)}">
          <input type="hidden" name="enabled" value="${s.enabled === false ? '1' : '0'}">
          <button type="submit" title="Toggle" style="cursor:pointer;border:none;background:none;font-size:18px;">${s.enabled === false ? '⚪️' : '🟢'}</button>
        </form>
      </td>
      <td style="padding:8px 6px;"><a href="${esc(s.url)}" style="color:#1d4ed8;text-decoration:none;">${esc(s.name)}</a>${s.membership ? ' <span style="font-size:11px;color:#7c3aed;font-weight:700;">MEMBER</span>' : ''}</td>
      <td style="padding:8px 6px;color:#555;">${esc(s.category)}</td>
      <td style="padding:8px 6px;color:#555;">${esc(s.setting)}</td>
      <td style="padding:8px 6px;">
        <form method="POST" style="margin:0;" onsubmit="return confirm('Remove ${esc(s.name)}?');">
          <input type="hidden" name="action" value="remove">
          <input type="hidden" name="id" value="${esc(s.id)}">
          <button type="submit" style="cursor:pointer;border:none;background:none;color:#b91c1c;">✕</button>
        </form>
      </td>
    </tr>`).join('');

  const logRows = (log || []).slice(0, 8).map((l) =>
    `<li style="margin:3px 0;color:#666;">${esc(l.at)} — ${l.kept} kept / ${l.extracted} found${l.sent ? ` → sent ${esc(l.sent)}` : ' (not sent)'}${l.test ? ' [test]' : ''}</li>`
  ).join('') || '<li style="color:#999;">No runs yet.</li>';

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Lineup · ${esc(profile.name)}</title></head>
  <body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px;">
    <div style="max-width:760px;margin:0 auto;">
      <div style="font-size:28px;font-weight:800;">Lineup · ${esc(profile.name)}</div>
      <div style="color:#666;margin:2px 0 18px;">${esc(profile.city)} · sends to <code>${esc(profile.recipientEnv)}</code> env</div>

      ${flash ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:10px 14px;border-radius:8px;margin-bottom:16px;">${flash}</div>` : ''}

      <div style="background:#fff;border-radius:12px;padding:18px 20px;margin-bottom:18px;">
        <div style="font-weight:700;margin-bottom:8px;">Filter rules</div>
        <ul style="margin:0;padding-left:18px;color:#444;">${filterSummary(profile).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      </div>

      <div style="background:#fff;border-radius:12px;padding:18px 20px;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:700;">Sources Lineup crawls (${sources.filter((s) => s.enabled !== false).length} active / ${sources.length})</div>
        </div>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:15px;">
          <thead><tr style="text-align:left;color:#888;font-size:13px;"><th></th><th>Venue</th><th>Category</th><th>Setting</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <form method="POST" style="margin-top:16px;display:grid;grid-template-columns:1.4fr 2fr 1fr 1fr auto;gap:8px;align-items:center;">
          <input type="hidden" name="action" value="add">
          <input name="name" placeholder="Venue name" required style="padding:8px;border:1px solid #ccc;border-radius:6px;">
          <input name="url" placeholder="https://…" required style="padding:8px;border:1px solid #ccc;border-radius:6px;">
          <select name="category" style="padding:8px;border:1px solid #ccc;border-radius:6px;">${profile.interests.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
          <select name="setting" style="padding:8px;border:1px solid #ccc;border-radius:6px;"><option>indoor</option><option>outdoor</option></select>
          <button type="submit" style="padding:8px 12px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer;">Add</button>
        </form>
      </div>

      <div style="background:#fff;border-radius:12px;padding:18px 20px;margin-bottom:18px;">
        <div style="font-weight:700;margin-bottom:10px;">Digest</div>
        <form method="POST" style="display:inline;"><input type="hidden" name="action" value="preview"><button type="submit" style="padding:10px 16px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Preview next digest</button></form>
        <form method="POST" style="display:inline;margin-left:8px;"><input type="hidden" name="action" value="sendtest"><button type="submit" style="padding:10px 16px;background:#059669;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Send test to me</button></form>
        <div style="color:#999;font-size:13px;margin-top:8px;">Preview runs a live crawl (may take ~30s). Test sends to <code>SAM_EMAIL</code>.</div>
      </div>

      <div style="background:#fff;border-radius:12px;padding:18px 20px;">
        <div style="font-weight:700;margin-bottom:8px;">Recent runs</div>
        <ul style="margin:0;padding-left:18px;font-size:14px;">${logRows}</ul>
      </div>
    </div>
  </body></html>`;
}

async function handleAdmin(req, res, profileId) {
  const profile = getProfile(profileId);
  if (!profile) return send(res, 404, '<h1>Unknown profile</h1>');

  const password = process.env[profile.passwordEnv];
  const cookieName = `lineup_${profileId}`;
  const path = `/lineup/${profileId}`;

  if (req.method === 'POST') {
    const form = await readForm(req);

    // Login
    if (form.action === 'login') {
      if (password && form.password === password) {
        setAuthCookie(res, cookieName, password);
        return redirect(res, path);
      }
      return send(res, 401, loginPage(`Lineup · ${profile.name}`, 'Incorrect password.'));
    }

    // All other actions require auth
    if (!isAuthed(req, cookieName, password)) {
      return send(res, 401, loginPage(`Lineup · ${profile.name}`, ''));
    }

    const edits = await store.loadSourceEdits(profile.id);
    edits.overrides = edits.overrides || {};
    edits.added = edits.added || [];
    edits.removed = edits.removed || [];

    if (form.action === 'toggle') {
      const enabled = form.enabled === '1'; // value carries the DESIRED new state
      edits.overrides[form.id] = { ...(edits.overrides[form.id] || {}), enabled };
      await store.saveSourceEdits(profile.id, edits);
      return redirect(res, path);
    }

    if (form.action === 'add' && form.name && form.url) {
      const id = 'x-' + form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) + '-' + Math.abs(hashStr(form.url)).toString(36).slice(0, 4);
      edits.added.push({
        id,
        name: form.name.trim(),
        url: form.url.trim(),
        category: form.category || profile.interests[0],
        setting: form.setting === 'outdoor' ? 'outdoor' : 'indoor',
        enabled: true,
      });
      await store.saveSourceEdits(profile.id, edits);
      return redirect(res, path);
    }

    if (form.action === 'remove') {
      // Remove added ones outright; mark seed ones as removed.
      const wasAdded = edits.added.some((s) => s.id === form.id);
      if (wasAdded) edits.added = edits.added.filter((s) => s.id !== form.id);
      else if (!edits.removed.includes(form.id)) edits.removed.push(form.id);
      delete edits.overrides[form.id];
      await store.saveSourceEdits(profile.id, edits);
      return redirect(res, path);
    }

    if (form.action === 'preview') {
      const result = await runProfile(profile.id, { dryRun: true });
      // Return the digest itself so you see exactly what would send.
      return send(res, 200, result.html + diagnosticsFooter(result.diagnostics));
    }

    if (form.action === 'sendtest') {
      const testTo = process.env.SAM_EMAIL || recipientList(getProfile('me'));
      if (!testTo) return send(res, 200, wrapFlash(profile, 'No test recipient configured.'));
      const result = await runProfile(profile.id, { testTo });
      return send(res, 200, wrapFlash(profile, `Test digest sent to ${esc(testTo)} — ${result.kept.length} events.`));
    }

    return redirect(res, path);
  }

  // GET
  if (password && !isAuthed(req, cookieName, password)) {
    return send(res, 200, loginPage(`Lineup · ${profile.name}`, ''));
  }
  const sources = await mergedSources(profile);
  const log = await store.getLog(profile.id);
  return send(res, 200, dashboard(profile, sources, log, null));
}

function diagnosticsFooter(d) {
  const errs = d.sources.filter((s) => s.error).map((s) => `${esc(s.name)}: ${esc(s.error)}`);
  const perSource = d.sources
    .map((s) => `${esc(s.name)}: ${s.found} (${esc(s.method || (s.error ? 'err' : '—'))})`)
    .join(' · ');
  return `<div style="max-width:600px;margin:16px auto;font-family:monospace;font-size:12px;color:#888;line-height:1.6;">
    window ${esc(d.window.start)}→${esc(d.window.end)} · extracted ${d.totalExtracted} · kept ${d.kept} · dropped ${d.dropped.length}
    <br><br>per source: ${perSource}
    ${errs.length ? '<br><br>errors: ' + errs.join(' | ') : ''}
  </div>`;
}

function wrapFlash(profile, msg) {
  return `<!doctype html><meta http-equiv="refresh" content="2;url=/lineup/${profile.id}"><body style="font-family:sans-serif;padding:40px;">${msg}<br><br><a href="/lineup/${profile.id}">Back</a></body>`;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

module.exports = { handleAdmin, dashboard, mergedSources };
