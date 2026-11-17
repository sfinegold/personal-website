/* Account-scoped cache with an offline mutation queue. Session stays in an HttpOnly cookie. */
(() => {
  const PROFILE = 'workout_account';
  const cacheKey = uid => 'workout_account_data:' + uid;
  const collections = { sam_workout_log: 'log:', sam_saved_workouts: 'workout:', sam_saved_exercises: 'exercise:' };
  const settings = ['sam_default_workout', 'sam_rest_mode', 'sam_round_rest'];
  let user = parse(localStorage.getItem(PROFILE), null);
  let cache = user ? parse(localStorage.getItem(cacheKey(user.uid)), { records: {}, pending: {} }) : { records: {}, pending: {} };
  let timeout, syncing = false, syncAgain = false;
  function parse(value, fallback) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }
  const accepted = key => Object.hasOwn(collections, key) || settings.includes(key) || key.startsWith('sam_rehab_');
  function toRecords(key, value) {
    if (Object.hasOwn(collections, key)) {
      const entries = parse(value, []);
      return Object.fromEntries((Array.isArray(entries) ? entries : []).map(entry => [collections[key] + encodeURIComponent(key === 'sam_workout_log' ? String(entry.id) : String(entry.name).toLowerCase()), JSON.stringify(entry)]));
    }
    return value === null ? {} : { [(key.startsWith('sam_rehab_') ? 'rehab:' : 'setting:') + key]: value };
  }
  function allRecords() { return { ...cache.records, ...cache.pending }; }
  function persist() { if (user) localStorage.setItem(cacheKey(user.uid), JSON.stringify(cache)); }
  function fromRecords(key) {
    const records = allRecords();
    if (Object.hasOwn(collections, key)) {
      let entries = Object.entries(records).filter(([k, v]) => k.startsWith(collections[key]) && v !== null).map(([, v]) => parse(v, null)).filter(Boolean);
      if (key === 'sam_workout_log') entries.sort((a, b) => new Date(a.date) - new Date(b.date));
      return JSON.stringify(entries);
    }
    return records[(key.startsWith('sam_rehab_') ? 'rehab:' : 'setting:') + key] ?? null;
  }
  const store = window.WorkoutStore = {
    getItem(key) { return user && accepted(key) ? fromRecords(key) : localStorage.getItem(key); },
    setItem(key, value) {
      if (!user || !accepted(key)) { localStorage.setItem(key, value); return; }
      const previous = toRecords(key, fromRecords(key));
      const next = toRecords(key, String(value));
      for (const id of new Set([...Object.keys(previous), ...Object.keys(next)])) {
        if (previous[id] !== next[id]) cache.pending[id] = next[id] ?? null;
      }
      persist(); scheduleSync();
    },
    removeItem(key) {
      if (!user || !accepted(key)) { localStorage.removeItem(key); return; }
      for (const id of Object.keys(toRecords(key, fromRecords(key)))) cache.pending[id] = null;
      persist(); scheduleSync();
    }
  };
  function changed(switched = false) { window.dispatchEvent(new CustomEvent('workout-data-changed', { detail: { switched } })); }
  function status(text) { const el = document.getElementById('account-status'); if (el) el.textContent = text; }
  function renderAccount() {
    const name = document.getElementById('account-name');
    if (name) name.textContent = user ? user.email : 'Workouts on this device';
    document.getElementById('account-signin').hidden = !!user;
    document.getElementById('account-signout').hidden = !user;
    document.getElementById('account-sync').hidden = !user;
  }
  async function api(body) {
    const response = await fetch('/api/workout', { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || 'Account service unavailable.'); error.status = response.status; throw error; }
    return data;
  }
  function scheduleSync() { clearTimeout(timeout); timeout = setTimeout(() => sync().catch(() => {}), 700); }
  async function sync() {
    if (!user) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    const uid = user.uid;
    const mutations = { ...cache.pending };
    status('Syncing…');
    try {
      const data = Object.keys(mutations).length ? await api({ op: 'sync', mutations }) : await api();
      if (!user || user.uid !== uid || data.user.uid !== uid) return;
      cache.records = data.state.records;
      for (const [key, value] of Object.entries(mutations)) if (cache.pending[key] === value) delete cache.pending[key];
      persist();
      const recordKeys = Object.keys(cache.records);
      status(`Saved to your account · ${recordKeys.filter(k => k.startsWith('log:')).length} workouts · ${recordKeys.filter(k => k.startsWith('workout:')).length} routines`); changed();
    } catch (error) {
      status(error.status === 401 ? 'Session expired. Sign in again.' : 'Offline · edits saved on this device');
      if (error.status === 401) document.getElementById('account-signin').hidden = false;
      throw error;
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; scheduleSync(); }
    }
  }
  function guestRecords() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (accepted(key)) Object.assign(result, toRecords(key, localStorage.getItem(key)));
    }
    return result;
  }
  function importGuest() {
    const records = allRecords();
    for (let [key, value] of Object.entries(guestRecords())) {
      if (records[key] && records[key] !== value && key.startsWith('workout:')) {
        const workout = parse(value, null);
        workout.name += ' (from this device)'; key = 'workout:' + encodeURIComponent(workout.name.toLowerCase()); value = JSON.stringify(workout);
      }
      if (!records[key] || key.startsWith('setting:')) cache.pending[key] = value;
    }
    persist();
  }
  async function boot() {
    const bar = document.createElement('div');
    bar.className = 'account-bar';
    bar.innerHTML = `<div class="account-info"><strong id="account-name"></strong><span id="account-status"></span></div><div class="account-actions"><button id="account-signin" type="button">Log in</button><button id="account-sync" type="button" hidden>Sync</button><button id="account-signout" type="button" hidden>Log out</button></div>`;
    (document.querySelector('.account-slot') || document.querySelector('.app')).prepend(bar);
    const access = document.querySelector('.account-access');
    if (access) access.append(document.getElementById('account-signin'), document.getElementById('account-signout'));
    const dialog = document.createElement('dialog'); dialog.className = 'account-dialog';
    dialog.innerHTML = `<form id="account-form"><div class="account-heading"><h2>Your workout account</h2><button type="button" id="account-close" aria-label="Close login">×</button></div><p>Save routines and workout history across your devices.</p><label>Email<input type="email" name="email" required autocomplete="email" maxlength="120"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><label class="account-import"><input type="checkbox" name="import"> Add this device’s existing workouts to my account</label><p id="account-error" role="alert"></p><button type="submit" id="account-submit">Log in / create account</button></form>`;
    document.body.append(dialog);
    document.getElementById('account-signin').onclick = () => { if (window.WorkoutSessionActive?.()) { status('Stop your workout before changing accounts.'); return; } dialog.showModal(); };
    document.getElementById('account-close').onclick = () => dialog.close();
    document.getElementById('account-sync').onclick = () => sync().catch(() => {});
    document.getElementById('account-signout').onclick = async () => {
      try {
        if (window.WorkoutSessionActive?.()) { status('Stop your workout before signing out.'); return; }
        if (syncing) { status('Finishing sync. Try signing out again in a moment.'); return; }
        await sync();
        if (Object.keys(cache.pending).length) { status('Sync your changes before signing out.'); return; }
        await api({ op: 'logout' }); user = null; cache = { records: {}, pending: {} }; localStorage.removeItem(PROFILE); renderAccount(); status('Saved on this device'); changed(true);
      } catch { status('Could not sign out. Connect and try again.'); }
    };
    document.getElementById('account-form').onsubmit = async event => {
      event.preventDefault();
      const form = event.target, submit = document.getElementById('account-submit');
      const error = document.getElementById('account-error'); error.textContent = ''; submit.disabled = true;
      try {
        const result = await api({ op: 'login', email: form.elements.email.value, password: form.elements.password.value });
        user = result.user; localStorage.setItem(PROFILE, JSON.stringify(user));
        cache = parse(localStorage.getItem(cacheKey(user.uid)), { records: {}, pending: {} });
        renderAccount();
        await sync();
        if (form.elements.import.checked) { importGuest(); await sync(); changed(true); }
        changed(true); dialog.close(); form.reset();
      } catch (failure) { error.textContent = failure.message; if (user) changed(true); }
      finally { submit.disabled = false; }
    };
    renderAccount(); status(user ? 'Connecting…' : 'Sign in to sync across devices');
    if (user) await sync().catch(() => {});
    window.addEventListener('online', () => sync().catch(() => {}));
    window.addEventListener('focus', () => sync().catch(() => {}));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync().catch(() => {}); });
    setInterval(() => sync().catch(() => {}), 60000);
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
