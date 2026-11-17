const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const createHandler = require('../api/_workout/handler');
function backend() {
  const rows = new Map();
  const clone = x => x == null ? x : structuredClone(x);
  const db = {
    enabled: true, conflict: null,
    async get(key, fallback) { return clone(rows.has(key) ? rows.get(key) : fallback); },
    async set(key, value) { rows.set(key, clone(value)); },
    async compareSet(key, revision, value) {
      if (this.conflict) { const apply = this.conflict; this.conflict = null; apply(rows, key); return false; }
      const current = rows.get(key);
      if (revision === null ? current != null : current?.revision !== revision) return false;
      rows.set(key, clone(value)); return true;
    }
  };
  const handler = createHandler(db, 'test-shared-password');
  async function call(body, cookie, extra = {}) {
    const result = { status: 200, headers: {}, data: null };
    const res = { setHeader(k, v) { result.headers[k] = v; }, status(n) { result.status = n; return this; }, json(data) { result.data = data; return this; } };
    await handler({ method: body ? 'POST' : 'GET', body, headers: { host: 'samfinegold.me', cookie, ...extra } }, res);
    return result;
  }
  async function login(email) {
    const result = await call({ op: 'login', email, password: 'test-shared-password' });
    assert.equal(result.status, 200); return result.headers['Set-Cookie'].split(';')[0];
  }
  return { rows, db, call, login };
}
test('password sessions are isolated, secure, revocable, and reject cross-site updates', async () => {
  const { call, login, rows } = backend();
  assert.equal((await call()).status, 401);
  assert.equal((await call({ op: 'login', email: 'bad', password: 'wrong' })).status, 400);
  assert.equal((await call({ op: 'login', email: 'a@example.com', password: 'wrong' })).status, 401);
  const a = await login(' A@Example.com '), b = await login('b@example.com');
  assert.equal((await call(null, a)).data.user.email, 'a@example.com');
  assert.equal((await call({ op: 'sync', mutations: { 'workout:mine': '{"name":"Mine"}' } }, a)).status, 200);
  assert.deepEqual((await call(null, b)).data.state.records, {});
  assert.equal((await call({ op: 'sync', mutations: {} }, a, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ op: 'sync', mutations: { '__proto__hack': '{}' } }, a)).status, 400);
  assert.equal((await call({ op: 'sync', mutations: { 'workout:mine': null } }, a)).status, 200);
  assert.deepEqual((await call(null, a)).data.state.records, {});
  await call({ op: 'logout' }, a);
  assert.equal((await call(null, a)).status, 401);
  assert.equal((await call(null, b)).status, 200);
  for (const [k, value] of rows) if (k.startsWith('workout:session:') && value) rows.set(k, { ...value, expires: 0 });
  assert.equal((await call(null, b)).status, 401);
});
test('parallel device changes retry without discarding new records or resurrecting deletions', async () => {
  const { login, call, db } = backend(); const cookie = await login('a@example.com');
  await call({ op: 'sync', mutations: { 'log:1': 'first' } }, cookie);
  db.conflict = (rows, key) => { const state = rows.get(key); rows.set(key, { revision: state.revision + 1, records: { ...state.records, 'log:2': 'second' } }); };
  const result = await call({ op: 'sync', mutations: { 'log:1': null, 'workout:a': 'new' } }, cookie);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.state.records, { 'log:2': 'second', 'workout:a': 'new' });
});
test('sign-in attempts are rate limited', async () => {
  const { call } = backend();
  for (let i = 0; i < 20; i++) assert.equal((await call({ op: 'login', email: 'a@example.com', password: 'wrong' })).status, 401);
  assert.equal((await call({ op: 'login', email: 'a@example.com', password: 'wrong' })).status, 429);
});
test('device import, offline retry, account switching and cross-device deletion stay isolated', async () => {
  const { call, login: loginServer } = backend(); let cookie = '', offline = false;
  const priorSession = await loginServer('a@example.com');
  await call({op:'sync',mutations:{'setting:sam_rest_mode':'exercise'}}, priorSession);
  const raw = new Map([['sam_rest_mode','round'],['sam_workout_log', JSON.stringify([{ id: 1, name: 'Existing', completed: true }])], ['sam_saved_workouts', JSON.stringify([{name:'Device routine',exercises:[]}])]]);
  const elements = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, { hidden:false, textContent:'', reset() {}, showModal() {}, close() {} }); return elements.get(id); };
  let boot;
  const ctx = vm.createContext({
    console, setTimeout: () => 0, clearTimeout() {}, setInterval() {}, CustomEvent: class { constructor(name, value) { Object.assign(this, value); } },
    localStorage: { getItem:k=>raw.get(k)??null, setItem:(k,v)=>raw.set(k,String(v)), removeItem:k=>raw.delete(k), key:i=>[...raw.keys()][i], get length(){return raw.size;} },
    document: { getElementById:el, createElement:()=>({innerHTML:'',showModal(){},close(){}}), body:{append(){}}, querySelector:selector=>selector === '.account-access' ? null : ({prepend(){}}), addEventListener:(name, cb)=>{if(name==='DOMContentLoaded')boot=cb;} },
    window: { addEventListener(){}, dispatchEvent(){} },
    async fetch(url, options) {
      if (offline) throw new Error('Offline');
      const result = await call(options.body ? JSON.parse(options.body) : undefined, cookie);
      if (result.headers['Set-Cookie']) cookie=result.headers['Set-Cookie'].split(';')[0];
      return {ok:result.status===200,status:result.status,json:async()=>result.data};
    }
  });
  vm.runInContext(fs.readFileSync(__dirname+'/account.js','utf8'),ctx); await boot();
  const store = ctx.window.WorkoutStore;
  const login = async (email, importData=false) => {
    const form = {elements:{email:{value:email},password:{value:'test-shared-password'},import:{checked:importData}},reset(){}};
    await el('account-form').onsubmit({preventDefault(){},target:form});
    assert.equal(el('account-error').textContent,'');
  };
  await login('a@example.com',true);
  assert.equal(JSON.parse(store.getItem('sam_workout_log'))[0].name,'Existing');
  assert.equal(store.getItem('sam_rest_mode'),'round','explicit import preserves the source device rest preference');
  assert.match(el('account-status').textContent,/Saved/);
  offline=true;
  store.setItem('sam_saved_workouts',JSON.stringify([{name:'Offline routine',exercises:[]}]));
  offline=false;
  await el('account-sync').onclick();
  assert.ok(Object.keys((await call(null,cookie)).data.state.records).some(k=>k==='workout:offline%20routine'));
  await login('b@example.com');
  assert.deepEqual(JSON.parse(store.getItem('sam_workout_log')),[]);
  store.setItem('sam_workout_log',JSON.stringify([{id:2,name:'B only'}])); await el('account-sync').onclick();
  await login('a@example.com');
  assert.equal(JSON.parse(store.getItem('sam_workout_log'))[0].id,1);
  store.setItem('sam_workout_log','[]'); await el('account-sync').onclick();
  assert.equal((await call(null,cookie)).data.state.records['log:1'],undefined);
  // Signing out restores the untouched original guest data, never another account's cache.
  await el('account-signout').onclick();
  assert.equal(JSON.parse(store.getItem('sam_workout_log'))[0].id,1);
});
