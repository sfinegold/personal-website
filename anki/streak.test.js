'use strict';
const assert = require('node:assert/strict');
const K = require('./streak.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e.message || e)); } }
test('ten answers credit the day once; the queue clearing credits early', () => {
  let s = null, r;
  for (let i = 0; i < 9; i++) { r = K.answer(s, 100, false); s = r.streak; assert.equal(r.credited, false); }
  r = K.answer(s, 100, false); assert.equal(r.credited, true); assert.equal(r.streak.current, 1); assert.equal(r.streak.lastDay, 100);
  r = K.answer(r.streak, 100, false); assert.equal(r.credited, false); assert.equal(r.streak.current, 1);
  const early = K.answer(null, 101, true); assert.equal(early.credited, true);
});
test('consecutive days grow the streak; a gap resets it; best is kept', () => {
  let s = K.credit(null, 10); s = K.credit(s, 11); s = K.credit(s, 12);
  assert.equal(s.current, 3); assert.equal(s.best, 3);
  s = K.credit(s, 14); assert.equal(s.current, 1); assert.equal(s.best, 3);
});
test('one rest day is forgiven at 7+, once per week of streak', () => {
  let s = null; for (let d = 1; d <= 7; d++) s = K.credit(s, d);
  s = K.credit(s, 9); assert.equal(s.current, 8); assert.equal(s.rests, 1);
  s = K.credit(s, 11); assert.equal(s.current, 1, 'second rest within the same week is not forgiven');
});
test('status: done today, at risk tomorrow, lost after', () => {
  let s = K.credit(null, 20); s = K.credit(s, 21);
  assert.equal(K.status(s, 21).state, 'done'); assert.equal(K.status(s, 21).current, 2);
  assert.equal(K.status(s, 22).state, 'risk'); assert.equal(K.status(s, 22).current, 2);
  assert.equal(K.status(s, 23).state, 'lost'); assert.equal(K.status(s, 23).current, 0);
  assert.equal(K.status(null, 1).state, 'none'); assert.equal(K.status(null, 1).left, 10);
});
test('milestones', () => { assert.equal(K.isMilestone(7), true); assert.equal(K.isMilestone(8), false); });
test('health and mood', () => {
  const now = Date.now(), day = 86400000;
  assert.equal(K.health(null, 0, now), null); assert.equal(K.mood(null), 'asleep');
  assert.equal(K.health(now - 1000, 0, now), 100); assert.equal(K.mood(100), 'happy');
  assert.equal(K.health(now - 2 * day, 5, now), 65); assert.equal(K.mood(65), 'fine');
  assert.equal(K.health(now - 3 * day, 30, now), 25); assert.equal(K.mood(25), 'hungry');
  assert.equal(K.health(now - 6 * day, 50, now), 0); assert.equal(K.mood(0), 'sick');
  assert.match(K.moodLine('Sophia', 'hungry', 23, 1), /hungry: 23 cards due/);
});
console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
