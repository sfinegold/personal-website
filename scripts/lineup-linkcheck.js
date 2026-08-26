// Weekly ticket-link health check. Probes every unique url in the snapshot grid;
// 404/410 or a "page not found" body marks it dead. Bot walls (401/403) and
// network errors count as UNKNOWN — never dead — so we only swap links we are
// sure about. Dead set is stored at lineup:deadlinks; the engine swaps dead
// urls to the venue's official site at snapshot build.
// Run: node scripts/lineup-linkcheck.js   (weekly, before the Monday send)
require('../api/_lib/loadenv.js').loadEnv();
const store = require('../api/_lib/store');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

async function probe(u) {
  try {
    const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(9000) });
    if (r.status === 404 || r.status === 410) return 'dead';
    if (r.status >= 200 && r.status < 300) {
      const t = (await r.text()).slice(0, 30000);
      if (/page not found|event not found|no longer available/i.test(t)) return 'dead';
      return 'ok';
    }
    return 'unknown';
  } catch (e) { return 'unknown'; }
}

(async () => {
  const snap = await store.getSnapshot('me');
  const urls = [...new Set((snap.grid || []).map((e) => e.url).filter(Boolean))];
  const dead = []; let ok = 0, unknown = 0;
  const queue = urls.slice();
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (queue.length) {
      const u = queue.pop();
      const v = await probe(u);
      if (v === 'dead') dead.push(u); else if (v === 'ok') ok++; else unknown++;
    }
  }));
  await store.setJSON('lineup:deadlinks', { urls: dead, at: new Date().toISOString() });
  console.log(`checked ${urls.length}: ok ${ok}, dead ${dead.length}, unknown ${unknown}`);
  dead.slice(0, 20).forEach((u) => console.log('  dead:', u));
})();
