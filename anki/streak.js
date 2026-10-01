/* streak.js — streak and creature-health rules. Pure functions, loads in node
 * (module.exports) and the browser (window.AnkiStreak).
 *
 * Streak: a day counts once 10 cards are answered that day, or the queue is
 * cleared. One missed day is forgiven when the streak is already 7 or more
 * (a rest day), and it is only forgiven once per week of streak.
 * Creature health: 100, minus 15 per day since the deck was last studied, minus
 * the number of cards due now (capped at 40). Never studied = asleep.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnkiStreak = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var GOAL = 10;
  var MILESTONES = [3, 7, 14, 30, 60, 100, 365];

  function fresh() { return { current: 0, best: 0, lastDay: 0, rests: 0, today: { day: 0, n: 0 } }; }

  // Count one answer; returns { streak, credited: true when this answer completed the day }.
  function answer(streak, today, queueCleared) {
    var s = Object.assign(fresh(), streak || {});
    s.today = s.today && s.today.day === today ? { day: today, n: s.today.n + 1 } : { day: today, n: 1 };
    var credited = false;
    if (s.lastDay !== today && (s.today.n >= GOAL || queueCleared)) { s = credit(s, today); credited = true; }
    return { streak: s, credited: credited };
  }
  function credit(streak, today) {
    var s = Object.assign(fresh(), streak || {});
    if (s.lastDay === today) return s;
    var gap = s.lastDay ? today - s.lastDay : Infinity;
    if (gap === 1) s.current += 1;
    else if (gap === 2 && s.current >= 7 && s.rests < Math.floor(s.current / 7)) { s.current += 1; s.rests += 1; }
    else { s.current = 1; s.rests = 0; }
    s.lastDay = today;
    s.best = Math.max(s.best, s.current);
    return s;
  }
  // What the streak is worth right now (a streak dies after a missed day, or two with a rest).
  function status(streak, today) {
    var s = Object.assign(fresh(), streak || {});
    if (!s.lastDay) return { current: 0, best: s.best, state: 'none', doneToday: false, left: GOAL };
    var gap = today - s.lastDay;
    var doneToday = gap === 0;
    var alive = gap <= 1 || (gap === 2 && s.current >= 7 && s.rests < Math.floor(s.current / 7));
    var n = s.today && s.today.day === today ? s.today.n : 0;
    return { current: alive ? s.current : 0, best: s.best, state: doneToday ? 'done' : alive ? 'risk' : 'lost', doneToday: doneToday, left: Math.max(0, GOAL - n) };
  }
  function isMilestone(n) { return MILESTONES.indexOf(n) >= 0; }

  function health(lastStudiedMs, dueNow, nowMs) {
    if (!lastStudiedMs) return null;   // asleep: never studied
    var days = Math.max(0, Math.floor((nowMs - lastStudiedMs) / 86400000));
    return Math.max(0, Math.min(100, 100 - 15 * days - Math.min(40, dueNow || 0)));
  }
  function mood(h) {
    if (h === null || h === undefined) return 'asleep';
    if (h >= 80) return 'happy';
    if (h >= 50) return 'fine';
    if (h >= 20) return 'hungry';
    return 'sick';
  }
  function moodLine(name, m, dueNow, daysSince) {
    if (m === 'asleep') return name + ' is asleep. Start the deck to wake ' + name + ' up.';
    if (m === 'happy') return name + ' is happy.';
    if (m === 'fine') return name + ' is fine' + (dueNow ? ', ' + dueNow + ' due' : '') + '.';
    if (m === 'hungry') return name + ' is hungry: ' + (dueNow ? dueNow + ' cards due' : daysSince + ' days without study') + '.';
    return name + ' is sick: ' + (daysSince >= 3 ? daysSince + ' days without study' : dueNow + ' cards due') + '. A short session helps.';
  }

  return { GOAL: GOAL, MILESTONES: MILESTONES, fresh: fresh, answer: answer, credit: credit, status: status, isMilestone: isMilestone, health: health, mood: mood, moodLine: moodLine };
}));
