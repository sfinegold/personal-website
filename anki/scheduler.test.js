/* node anki/scheduler.test.js — assertions against Anki's documented behaviour. */
'use strict';
const assert = require('node:assert/strict');
const S = require('./scheduler.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e.message || e).split('\n').join('\n      ')); }
}
const NOW = new Date(2026, 9, 1, 12, 0, 0).getTime();   // 1 Oct 2026, noon local
const TODAY = S.dayNum(NOW);
const NOFUZZ = { fuzz: false };
const review = (o) => Object.assign({ type: 'review', step: 0, due: S.dayStartMs(TODAY), ivl: 10, ease: 2.5, reps: 5, lapses: 0, leech: false }, o);
const round2 = (x) => Math.round(x * 100) / 100;

test('new card: again 1m, hard 6m (avg of 1m and 10m), good 10m, easy 4d', () => {
  const n = S.nextStates(null, NOW, NOFUZZ);
  assert.equal(n.again.state.type, 'learn'); assert.equal(n.again.state.step, 0);
  assert.equal(n.again.state.due, NOW + 60000); assert.equal(n.again.label, '1m');
  assert.equal(n.hard.state.step, 0); assert.equal(n.hard.state.due, NOW + 330000); assert.equal(n.hard.label, '6m');
  assert.equal(n.good.state.type, 'learn'); assert.equal(n.good.state.step, 1);
  assert.equal(n.good.state.due, NOW + 600000); assert.equal(n.good.label, '10m');
  assert.equal(n.easy.state.type, 'review'); assert.equal(n.easy.state.ivl, 4); assert.equal(n.easy.state.ease, 2.5);
  assert.equal(n.easy.state.due, S.dayStartMs(TODAY + 4)); assert.equal(n.easy.label, '4d');
  assert.equal(n.good.state.reps, 1);
});

test('learning on last step: hard repeats 10m, good graduates to 1d, easy 4d', () => {
  const st = { type: 'learn', step: 1, due: NOW - 1000, ivl: 0, ease: 2.5, reps: 1, lapses: 0 };
  const n = S.nextStates(st, NOW, NOFUZZ);
  assert.equal(n.hard.state.due, NOW + 600000); assert.equal(n.hard.label, '10m');
  assert.equal(n.good.state.type, 'review'); assert.equal(n.good.state.ivl, 1);
  assert.equal(n.good.state.due, S.dayStartMs(TODAY + 1)); assert.equal(n.good.label, '1d');
  assert.equal(n.easy.state.ivl, 4);
  assert.equal(n.again.state.step, 0); assert.equal(n.again.state.due, NOW + 60000);
});

test('review ivl 10, ease 2.5, on time: hard 12d/2.35, good 25d, easy 33d/2.65, again -> relearn 10m', () => {
  const n = S.nextStates(review(), NOW, NOFUZZ);
  assert.equal(n.hard.state.ivl, 12); assert.equal(round2(n.hard.state.ease), 2.35); assert.equal(n.hard.label, '12d');
  assert.equal(n.good.state.ivl, 25); assert.equal(n.good.state.ease, 2.5); assert.equal(n.good.label, '25d');
  assert.equal(n.good.state.due, S.dayStartMs(TODAY + 25));
  assert.equal(n.easy.state.ivl, 33); assert.equal(round2(n.easy.state.ease), 2.65);
  const a = n.again.state;
  assert.equal(a.type, 'relearn'); assert.equal(a.step, 0); assert.equal(a.due, NOW + 600000);
  assert.equal(a.ivl, 1); assert.equal(round2(a.ease), 2.3); assert.equal(a.lapses, 1); assert.equal(n.again.label, '10m');
});

test('review 4 days late: good (10+2)*2.5 = 30d, easy (10+4)*2.5*1.3 = 46d', () => {
  const n = S.nextStates(review({ due: S.dayStartMs(TODAY - 4) }), NOW, NOFUZZ);
  assert.equal(n.good.state.ivl, 30);
  assert.equal(n.easy.state.ivl, 46);
  assert.equal(n.hard.state.ivl, 12);   // hard ignores lateness
});

test('ease never drops below 1.3', () => {
  const n = S.nextStates(review({ ease: 1.3 }), NOW, NOFUZZ);
  assert.equal(n.again.state.ease, 1.3); assert.equal(n.hard.state.ease, 1.3);
});

test('intervals stay strictly increasing: ivl 1, ease 1.3 -> hard 2, good 3, easy 4', () => {
  const n = S.nextStates(review({ ivl: 1, ease: 1.3 }), NOW, NOFUZZ);
  assert.equal(n.hard.state.ivl, 2); assert.equal(n.good.state.ivl, 3); assert.equal(n.easy.state.ivl, 4);
});

test('maximum interval clamps at 36500 days', () => {
  const n = S.nextStates(review({ ivl: 36500 }), NOW, NOFUZZ);
  assert.equal(n.hard.state.ivl, 36500); assert.equal(n.good.state.ivl, 36500); assert.equal(n.easy.state.ivl, 36500);
});

test('leech at 8 lapses, then every 4; sticky once set', () => {
  assert.equal(S.nextStates(review({ lapses: 7 }), NOW, NOFUZZ).again.state.leech, true);
  assert.equal(S.nextStates(review({ lapses: 6 }), NOW, NOFUZZ).again.state.leech, false);
  assert.equal(S.nextStates(review({ lapses: 11 }), NOW, NOFUZZ).again.state.leech, true);
  assert.equal(S.nextStates(review({ lapses: 9 }), NOW, NOFUZZ).again.state.leech, false);
  assert.equal(S.nextStates(review({ lapses: 8, leech: true }), NOW, NOFUZZ).again.state.leech, true);
  assert.equal(S.nextStates(review({ lapses: 8, leech: true }), NOW, NOFUZZ).good.state.leech, true);
});

test('relearning (single 10m step): again 10m, hard 15m, good -> 1d review, easy -> 2d, ease unchanged', () => {
  const st = { type: 'relearn', step: 0, due: NOW - 1, ivl: 1, ease: 2.3, reps: 6, lapses: 1 };
  const n = S.nextStates(st, NOW, NOFUZZ);
  assert.equal(n.again.state.type, 'relearn'); assert.equal(n.again.state.due, NOW + 600000);
  assert.equal(n.hard.state.due, NOW + 900000); assert.equal(n.hard.label, '15m');
  assert.equal(n.good.state.type, 'review'); assert.equal(n.good.state.ivl, 1);
  assert.equal(n.good.state.due, S.dayStartMs(TODAY + 1)); assert.equal(n.good.label, '1d');
  assert.equal(n.easy.state.ivl, 2); assert.equal(n.easy.label, '2d');
  ['again', 'hard', 'good', 'easy'].forEach(r => assert.equal(n[r].state.ease, 2.3));
});

test('fuzz: none below 2.5d; delta(5)=1.375; bounds round and respect the minimum', () => {
  assert.equal(S.fuzzDelta(2), 0);
  assert.equal(S.fuzzDelta(5), 1.375);
  assert.equal(S.fuzzDelta(25), 1 + 0.15 * 4.5 + 0.10 * 13 + 0.05 * 5);
  assert.equal(S.fuzzIvl(5, 1, 36500, () => 0), 4);        // round(5-1.375)
  assert.equal(S.fuzzIvl(5, 1, 36500, () => 0.999), 6);    // round(5+1.375)
  assert.equal(S.fuzzIvl(5, 6, 36500, () => 0), 6);        // minimum wins
  assert.equal(S.fuzzIvl(1, 1, 36500, () => 0.999), 1);    // no fuzz on 1d
  assert.equal(S.fuzzIvl(50, 1, 36500, null), 50);         // rng=null -> no fuzz
  for (let i = 0; i < 200; i++) {
    const v = S.fuzzIvl(25, 1, 36500, Math.random);
    assert.ok(v >= 22 && v <= 28, 'fuzzed 25d must land in 22..28, got ' + v);
  }
});

test('day boundary is 4am local', () => {
  const t359 = new Date(2026, 9, 1, 3, 59).getTime();
  const t400 = new Date(2026, 9, 1, 4, 0).getTime();
  const prevNoon = new Date(2026, 8, 30, 12, 0).getTime();
  assert.equal(S.dayNum(t359), S.dayNum(prevNoon));
  assert.equal(S.dayNum(t400), S.dayNum(prevNoon) + 1);
  const ds = new Date(S.dayStartMs(S.dayNum(NOW)));
  assert.equal(ds.getHours(), 4); assert.equal(ds.getDate(), 1); assert.equal(ds.getMonth(), 9);
  assert.equal(S.dayNum(S.dayStartMs(TODAY + 25)), TODAY + 25);
});

test('labels', () => {
  assert.equal(S.fmtSecs(30), '<1m'); assert.equal(S.fmtSecs(330), '6m'); assert.equal(S.fmtSecs(3600 * 2), '2h');
  assert.equal(S.fmtDays(1), '1d'); assert.equal(S.fmtDays(29), '29d'); assert.equal(S.fmtDays(45), '1.5mo');
  assert.equal(S.fmtDays(60), '2mo'); assert.equal(S.fmtDays(400), '1.1y');
});

test('buildQueue: learning due first, reviews mixed with new, caps, counts, learn-ahead', () => {
  const cards = [
    { id: 'n1', state: null, order: 1 }, { id: 'n0', state: null, order: 0 }, { id: 'n2', state: null, order: 2 },
    { id: 'l1', state: { type: 'learn', step: 0, due: NOW - 5000 }, order: 9 },
    { id: 'l2', state: { type: 'relearn', step: 0, due: NOW + 5 * 60000, ivl: 1 }, order: 9 },   // due in 5 min
    { id: 'l3', state: { type: 'learn', step: 1, due: NOW + 3 * 3600000 }, order: 9 },           // due in 3 h
    { id: 'r1', state: review({ due: S.dayStartMs(TODAY) }), order: 9 },
    { id: 'r2', state: review({ due: S.dayStartMs(TODAY - 3) }), order: 9 },
    { id: 'r3', state: review({ due: S.dayStartMs(TODAY + 1) }), order: 9 },                      // not due
  ];
  const q = S.buildQueue(cards, NOW, { newDone: 0, revDone: 0 }, { newPerDay: 2 });
  assert.equal(q.queue[0], 'l1');
  assert.ok(!q.queue.includes('l2') && !q.queue.includes('l3') && !q.queue.includes('r3'));
  assert.deepEqual(q.queue.filter(id => id[0] === 'n'), ['n0', 'n1']);   // ordered, capped at 2
  assert.equal(q.queue.length, 5);
  assert.deepEqual(q.counts, { new: 2, learn: 3, due: 2 });
  assert.equal(q.nextLearnDue, NOW + 5 * 60000);
  assert.equal(q.ahead, false);

  const q2 = S.buildQueue(cards, NOW, { newDone: 2, revDone: 200 }, { newPerDay: 2 });
  assert.equal(q2.counts.new, 0); assert.equal(q2.counts.due, 0);
  assert.deepEqual(q2.queue, ['l1']);

  const q3 = S.buildQueue(cards.filter(c => c.id !== 'l1'), NOW, { newDone: 2, revDone: 200 }, { newPerDay: 2 });
  assert.equal(q3.ahead, true); assert.deepEqual(q3.queue, ['l2']);   // learn-ahead: within 20 min only

  const q4 = S.buildQueue(cards.filter(c => c.id === 'l3'), NOW, { newDone: 0, revDone: 0 });
  assert.deepEqual(q4.queue, []); assert.equal(q4.ahead, false); assert.equal(q4.nextLearnDue, NOW + 3 * 3600000);
});

test('interleave spreads new cards evenly', () => {
  const out = S.interleave(['r', 'r', 'r', 'r'], ['n', 'n']);
  assert.equal(out.length, 6); assert.equal(out.filter(x => x === 'n').length, 2);
  assert.notEqual(out[0] + out[1], 'nn');
  assert.deepEqual(S.interleave([], ['n']), ['n']); assert.deepEqual(S.interleave(['r'], []), ['r']);
});

test('deterministic fuzz: shown label equals applied interval; same seed, same sequence', () => {
  const a = S.seededRng('x:3'), b = S.seededRng('x:3');
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const st = review({ ivl: 40, reps: 7 });
  const shown = S.nextStates(st, NOW, undefined, undefined, 'card:fwd').good.label;
  const applied = S.answer(st, 'good', NOW, undefined, undefined, 'card:fwd');
  assert.equal(shown, S.fmtDays(applied.ivl));
  assert.equal(applied.last, NOW);
});

test('stats', () => {
  const o = S.stats([
    { state: null }, { state: review({ ivl: 30 }) }, { state: review({ ivl: 5, due: S.dayStartMs(TODAY + 2) }) },
    { state: { type: 'learn', step: 0, due: NOW + 60000 } }, { state: review({ leech: true }) },
  ], NOW);
  assert.deepEqual(o, { total: 5, new: 1, learn: 1, review: 3, dueToday: 3, mature: 1, leech: 1 });
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
