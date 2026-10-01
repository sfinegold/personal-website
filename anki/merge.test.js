'use strict';
const assert = require('node:assert/strict');
const M = require('./merge.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e.message || e)); } }
const card = (last, extra) => Object.assign({ type: 'review', step: 0, due: 0, ivl: 3, ease: 2.5, reps: 3, lapses: 0, leech: false, last }, extra || {});

test('cards: later last wins, stored beats absent, both sides kept', () => {
  const out = M.mergeCards({ a: card(10, { ivl: 1 }), b: card(5) }, { a: card(20, { ivl: 9 }), c: card(1) });
  assert.equal(out.a.ivl, 9); assert.equal(out.b.last, 5); assert.equal(out.c.last, 1);
  const out2 = M.mergeCards({ a: card(30, { ivl: 7 }) }, { a: card(20, { ivl: 2 }) });
  assert.equal(out2.a.ivl, 7);
});
test('day: same day takes max of each counter; different days take the newer', () => {
  assert.deepEqual(M.mergeDay({ day: 5, newDone: 3, revDone: 10, extraNew: 0 }, { day: 5, newDone: 8, revDone: 2, extraNew: 20 }), { day: 5, newDone: 8, revDone: 10, extraNew: 20 });
  assert.deepEqual(M.mergeDay({ day: 5, newDone: 3, revDone: 10, extraNew: 0 }, { day: 6, newDone: 1, revDone: 0, extraNew: 0 }), { day: 6, newDone: 1, revDone: 0, extraNew: 0 });
  assert.deepEqual(M.mergeDay(null, { day: 2, newDone: 1, revDone: 0, extraNew: 0 }), { day: 2, newDone: 1, revDone: 0, extraNew: 0 });
});
test('boost: union, order kept', () => { assert.deepEqual(M.mergeBoost(['x', 'y'], ['y', 'z']), ['x', 'y', 'z']); });
test('streak: later lastDay wins, best is the max', () => {
  assert.deepEqual(M.mergeStreak({ current: 3, best: 3, lastDay: 10 }, { current: 1, best: 9, lastDay: 11 }), { current: 1, best: 9, lastDay: 11 });
});
test('library: per entry the later t wins; deleted and hidden tombstones carry across', () => {
  const a = { decks: { 'u-it': { t: 10, meta: { name: 'Italian' } } }, notes: { greek: { x1: { t: 5, note: { id: 'x1', term: 'a' } } } }, hidden: { greek: { 'gr-1': { t: 3, on: true } } }, shelf: { farsi: { t: 1, on: false } } };
  const b = { decks: { 'u-it': { t: 20, meta: { name: 'Italian' }, deleted: true }, 'u-de': { t: 2, meta: { name: 'German' } } }, notes: { greek: { x1: { t: 4, note: { id: 'x1', term: 'b' } }, x2: { t: 6, note: { id: 'x2', term: 'c' } } } }, hidden: { greek: { 'gr-1': { t: 9, on: false } } }, shelf: { farsi: { t: 1, on: true } } };
  const out = M.mergeLibrary(a, b);
  assert.equal(out.decks['u-it'].deleted, true);
  assert.equal(out.decks['u-de'].meta.name, 'German');
  assert.equal(out.notes.greek.x1.note.term, 'a');
  assert.equal(out.notes.greek.x2.note.term, 'c');
  assert.equal(out.hidden.greek['gr-1'].on, false);
  assert.equal(out.shelf.farsi.on, false, 'ties keep the stored side');
  assert.equal(M.mergeLibrary(null, null), null);
  assert.ok(M.mergeState({ v: 2, decks: {} }, { v: 2, decks: {}, library: b }).library.decks['u-de']);
  assert.ok(M.differs({ v: 2, decks: {} }, { v: 2, decks: {}, library: b }), 'a library change counts as a change');
});
test('state: per-deck buckets merge, settings from the later document, undo stays local', () => {
  const local = { v: 2, updated: '2026-10-01T10:00:00Z', settings: { newPerDay: 5 }, decks: { greek: { cards: { 'a:fwd': card(10, { ivl: 1 }) }, day: { day: 1, newDone: 1, revDone: 0, extraNew: 0 }, undo: [{ id: 'a:fwd' }], stamp: { version: 3, updated: '2026-10-01' }, boost: ['a'] } } };
  const server = { v: 2, updated: '2026-10-01T11:00:00Z', settings: { newPerDay: 20 }, decks: { greek: { cards: { 'a:fwd': card(20, { ivl: 4 }), 'b:rev': card(2) }, day: { day: 1, newDone: 0, revDone: 7, extraNew: 0 }, undo: [{ id: 'zzz' }], stamp: { version: 4, updated: '2026-10-01' }, boost: ['b'] }, farsi: { cards: {}, day: { day: 0, newDone: 0, revDone: 0, extraNew: 0 }, undo: [], stamp: null, boost: [] } } };
  const out = M.mergeState(local, server);
  assert.equal(out.decks.greek.cards['a:fwd'].ivl, 4);
  assert.equal(out.decks.greek.cards['b:rev'].last, 2);
  assert.deepEqual(out.decks.greek.day, { day: 1, newDone: 1, revDone: 7, extraNew: 0 });
  assert.deepEqual(out.decks.greek.undo, [{ id: 'a:fwd' }]);
  assert.equal(out.decks.greek.stamp.version, 4);
  assert.deepEqual(out.decks.greek.boost, ['a', 'b']);
  assert.equal(out.settings.newPerDay, 20);
  assert.ok(out.decks.farsi);
  assert.equal(out.updated, '2026-10-01T11:00:00Z');
  // inputs untouched
  assert.equal(local.decks.greek.cards['a:fwd'].ivl, 1);
});
test('differs ignores undo', () => {
  const a = { v: 2, decks: { g: { cards: { x: card(1) }, day: { day: 1 }, undo: [1, 2], stamp: null, boost: [] } } };
  const b = { v: 2, decks: { g: { cards: { x: card(1) }, day: { day: 1 }, undo: [], stamp: null, boost: [] } } };
  assert.equal(M.differs(a, b), false);
  b.decks.g.cards.x = card(2); assert.equal(M.differs(a, b), true);
});
console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
