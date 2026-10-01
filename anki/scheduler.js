/* scheduler.js — Anki's SM-2 scheduler, ported from Anki's Rust source
 * (rslib/src/scheduler/states/{learning,review,relearning,steps,fuzz}.rs and
 * rslib/src/deckconfig/mod.rs). Pure functions, no DOM, no clock: `now` is
 * always passed in as milliseconds. Loads in the browser as window.AnkiSched
 * and in node via require() so the same code is unit-tested and shipped.
 *
 * Card state shape (absence of state means "new"):
 *   { type:'learn'|'review'|'relearn', step, due, ivl, ease, reps, lapses, leech, last }
 *   due  — ms. learn/relearn: absolute timestamp. review: 4am local on the due day.
 *   ivl  — days. On a relearn card it is the interval the card returns to review with.
 *   ease — multiplier (2.5 = 250%). Floor 1.3.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnkiSched = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_MS = 86400000;
  var DAY_SECS = 86400;

  // Anki's defaults, verified against DEFAULT_DECK_CONFIG_INNER / DeckConfig::default().
  var DEFAULTS = {
    learnSteps: [60, 600],      // seconds: 1m, 10m
    relearnSteps: [600],        // seconds: 10m
    newPerDay: 20,
    revPerDay: 200,
    initialEase: 2.5,
    easyMult: 1.3,
    hardMult: 1.2,
    lapseMult: 0.0,
    ivlMult: 1.0,
    maxIvl: 36500,              // days
    minLapseIvl: 1,             // days
    gradGood: 1,                // days
    gradEasy: 4,                // days
    leechThreshold: 8,
    learnAhead: 20,             // minutes
    rolloverHour: 4,            // "next day starts at" 4am local
    fuzz: true,
  };
  var MIN_EASE = 1.3;
  var EASE_AGAIN = -0.20, EASE_HARD = -0.15, EASE_EASY = 0.15;

  function cfgOf(c) { return Object.assign({}, DEFAULTS, c || {}); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* ---------- days with a 4am rollover ---------- */

  function dayNum(ms, cfg) {
    var h = (cfg && cfg.rolloverHour != null) ? cfg.rolloverHour : DEFAULTS.rolloverHour;
    var d = new Date(ms);
    d.setHours(d.getHours() - h);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  }
  function dayStartMs(day, cfg) {
    var h = (cfg && cfg.rolloverHour != null) ? cfg.rolloverHour : DEFAULTS.rolloverHour;
    var d = new Date(1970, 0, 1, h, 0, 0, 0);
    d.setDate(1 + day);
    return d.getTime();
  }

  /* ---------- deterministic RNG (mulberry32) ---------- */

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seededRng(seed) {
    var a = typeof seed === 'string' ? hashStr(seed) : (seed >>> 0);
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- fuzz (fuzz.rs) ---------- */

  var FUZZ_RANGES = [
    { start: 2.5, end: 7.0, factor: 0.15 },
    { start: 7.0, end: 20.0, factor: 0.10 },
    { start: 20.0, end: Infinity, factor: 0.05 },
  ];
  function fuzzDelta(ivl) {
    if (ivl < 2.5) return 0;
    var delta = 1;
    for (var i = 0; i < FUZZ_RANGES.length; i++) {
      var r = FUZZ_RANGES[i];
      delta += r.factor * Math.max(0, Math.min(ivl, r.end) - r.start);
    }
    return delta;
  }
  // Mirrors constrained_fuzz_bounds + with_review_fuzz. rng=null means no fuzz.
  function fuzzIvl(ivl, minIvl, maxIvl, rng) {
    minIvl = Math.min(minIvl, maxIvl);
    ivl = clamp(ivl, minIvl, maxIvl);
    if (!rng) return clamp(Math.round(ivl), minIvl, maxIvl);
    var delta = fuzzDelta(ivl);
    var lower = clamp(Math.round(ivl - delta), minIvl, maxIvl);
    var upper = clamp(Math.round(ivl + delta), minIvl, maxIvl);
    if (upper === lower && upper > 2 && upper < maxIvl) upper = lower + 1;
    return clamp(Math.floor(lower + rng() * (1 + upper - lower)), minIvl, maxIvl);
  }

  /* ---------- learning steps (steps.rs) ---------- */

  // Hard on the first step averages it with the next; with a single step it is
  // 1.5x that step (capped at step + 1 day); on later steps it repeats the step.
  function hardDelay(steps, step) {
    if (!steps.length) return 0;
    var cur = steps[Math.min(step, steps.length - 1)];
    if (step === 0) {
      var next = steps[1];
      if (next != null) return (cur + next) / 2;
      return Math.min(cur * 1.5, cur + DAY_SECS);
    }
    return cur;
  }

  /* ---------- labels ---------- */

  function fmtSecs(s) {
    if (s < 60) return '<1m';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < DAY_SECS) return Math.round(s / 3600) + 'h';
    return fmtDays(s / DAY_SECS);
  }
  function trim(n) { var t = n.toFixed(1); return t.replace(/\.0$/, ''); }
  function fmtDays(d) {
    if (d < 30) return Math.round(d) + 'd';
    if (d < 365) return trim(d / 30) + 'mo';
    return trim(d / 365) + 'y';
  }

  /* ---------- state transitions ---------- */

  function newState(cfg) {
    cfg = cfgOf(cfg);
    return { type: 'new', step: 0, due: 0, ivl: 0, ease: cfg.initialEase, reps: 0, lapses: 0, leech: false, last: 0 };
  }
  function base(s, cfg) {
    s = s || newState(cfg);
    return {
      type: s.type || 'new', step: s.step || 0, due: s.due || 0, ivl: s.ivl || 0,
      ease: s.ease || cfgOf(cfg).initialEase, reps: s.reps || 0, lapses: s.lapses || 0,
      leech: !!s.leech, last: s.last || 0,
    };
  }

  function learnStep(s, step, delaySecs, now) {
    return Object.assign({}, s, { type: s.type === 'relearn' ? 'relearn' : 'learn', step: step, due: now + delaySecs * 1000 });
  }
  function reviewFrom(s, ivl, now, cfg) {
    return Object.assign({}, s, { type: 'review', step: 0, ivl: ivl, due: dayStartMs(dayNum(now, cfg) + ivl, cfg) });
  }
  function leechMet(lapses, threshold) {
    if (!threshold) return false;
    var half = Math.max(threshold >> 1, 1);
    return lapses >= threshold && (lapses - threshold) % half === 0;
  }

  // Returns {again, hard, good, easy}, each {state, label}.
  function nextStates(state, now, cfg, rng, cardId) {
    cfg = cfgOf(cfg);
    var s = base(state, cfg);
    if (rng === undefined) rng = cfg.fuzz ? seededRng((cardId || '') + ':' + s.reps) : null;
    if (!cfg.fuzz) rng = null;
    var nxt = Object.assign({}, s, { reps: s.reps + 1 });
    var out = {};

    if (s.type === 'new' || s.type === 'learn') {
      var steps = cfg.learnSteps;
      if (!steps.length) {
        // No learning steps: every answer graduates.
        var g1 = reviewFrom(nxt, fuzzIvl(cfg.gradGood, 1, cfg.maxIvl, rng), now, cfg);
        var e1 = reviewFrom(nxt, fuzzIvl(cfg.gradEasy, 1, cfg.maxIvl, rng), now, cfg);
        out.again = { state: g1, label: fmtDays(g1.ivl) };
        out.hard = { state: g1, label: fmtDays(g1.ivl) };
        out.good = { state: g1, label: fmtDays(g1.ivl) };
        out.easy = { state: e1, label: fmtDays(e1.ivl) };
        return out;
      }
      var step = Math.min(s.step, steps.length - 1);
      var again = learnStep(Object.assign({}, nxt, { type: 'learn' }), 0, steps[0], now);
      var hd = hardDelay(steps, step);
      var hard = learnStep(Object.assign({}, nxt, { type: 'learn' }), step, hd, now);
      var good, goodLabel;
      if (step + 1 < steps.length) {
        good = learnStep(Object.assign({}, nxt, { type: 'learn' }), step + 1, steps[step + 1], now);
        goodLabel = fmtSecs(steps[step + 1]);
      } else {
        good = reviewFrom(nxt, fuzzIvl(cfg.gradGood, 1, cfg.maxIvl, rng), now, cfg);
        goodLabel = fmtDays(good.ivl);
      }
      var easy = reviewFrom(nxt, fuzzIvl(cfg.gradEasy, 1, cfg.maxIvl, rng), now, cfg);
      out.again = { state: again, label: fmtSecs(steps[0]) };
      out.hard = { state: hard, label: fmtSecs(hd) };
      out.good = { state: good, label: goodLabel };
      out.easy = { state: easy, label: fmtDays(easy.ivl) };
      return out;
    }

    if (s.type === 'review') {
      var late = Math.max(0, dayNum(now, cfg) - dayNum(s.due, cfg));
      var ivl = s.ivl;
      var hardIvl = fuzzIvl(ivl * cfg.hardMult * cfg.ivlMult, ivl + 1, cfg.maxIvl, rng);
      var goodIvl = fuzzIvl((ivl + late / 2) * s.ease * cfg.ivlMult, hardIvl + 1, cfg.maxIvl, rng);
      var easyIvl = fuzzIvl((ivl + late) * s.ease * cfg.easyMult * cfg.ivlMult, goodIvl + 1, cfg.maxIvl, rng);

      var lapses = s.lapses + 1;
      var lapseIvl = Math.max(Math.floor(ivl * cfg.lapseMult), cfg.minLapseIvl);
      lapseIvl = clamp(lapseIvl, 1, cfg.maxIvl);
      var againBase = Object.assign({}, nxt, {
        ease: Math.max(MIN_EASE, s.ease + EASE_AGAIN), lapses: lapses,
        leech: s.leech || leechMet(lapses, cfg.leechThreshold),
      });
      var againState, againLabel;
      if (cfg.relearnSteps.length) {
        againState = Object.assign({}, againBase, { type: 'relearn', step: 0, ivl: lapseIvl, due: now + cfg.relearnSteps[0] * 1000 });
        againLabel = fmtSecs(cfg.relearnSteps[0]);
      } else {
        againState = reviewFrom(againBase, lapseIvl, now, cfg);
        againLabel = fmtDays(lapseIvl);
      }
      out.again = { state: againState, label: againLabel };
      out.hard = { state: reviewFrom(Object.assign({}, nxt, { ease: Math.max(MIN_EASE, s.ease + EASE_HARD) }), hardIvl, now, cfg), label: fmtDays(hardIvl) };
      out.good = { state: reviewFrom(nxt, goodIvl, now, cfg), label: fmtDays(goodIvl) };
      out.easy = { state: reviewFrom(Object.assign({}, nxt, { ease: s.ease + EASE_EASY }), easyIvl, now, cfg), label: fmtDays(easyIvl) };
      return out;
    }

    // relearn: ease never changes here (relearning.rs).
    var rsteps = cfg.relearnSteps;
    var rstep = Math.min(s.step, Math.max(rsteps.length - 1, 0));
    var backIvl = clamp(s.ivl || cfg.minLapseIvl, 1, cfg.maxIvl);
    var backGood = reviewFrom(nxt, backIvl, now, cfg);
    var backEasy = reviewFrom(nxt, clamp(backIvl + 1, 1, cfg.maxIvl), now, cfg);
    if (!rsteps.length) {
      out.again = { state: backGood, label: fmtDays(backIvl) };
      out.hard = { state: backGood, label: fmtDays(backIvl) };
      out.good = { state: backGood, label: fmtDays(backIvl) };
      out.easy = { state: backEasy, label: fmtDays(backEasy.ivl) };
      return out;
    }
    var rhd = hardDelay(rsteps, rstep);
    out.again = { state: learnStep(nxt, 0, rsteps[0], now), label: fmtSecs(rsteps[0]) };
    out.hard = { state: learnStep(nxt, rstep, rhd, now), label: fmtSecs(rhd) };
    if (rstep + 1 < rsteps.length) {
      out.good = { state: learnStep(nxt, rstep + 1, rsteps[rstep + 1], now), label: fmtSecs(rsteps[rstep + 1]) };
    } else {
      out.good = { state: backGood, label: fmtDays(backIvl) };
    }
    out.easy = { state: backEasy, label: fmtDays(backEasy.ivl) };
    return out;
  }

  function answer(state, rating, now, cfg, rng, cardId) {
    var n = nextStates(state, now, cfg, rng, cardId)[rating];
    if (!n) throw new Error('bad rating: ' + rating);
    return Object.assign({}, n.state, { last: now });
  }

  /* ---------- queue ---------- */

  function isLearning(st) { return !!st && (st.type === 'learn' || st.type === 'relearn'); }
  function isMature(st) { return !!st && st.type === 'review' && st.ivl >= 21; }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // Spread `news` evenly through `reviews` (v3 "mix new cards with reviews").
  function interleave(reviews, news) {
    if (!news.length) return reviews.slice();
    if (!reviews.length) return news.slice();
    var total = reviews.length + news.length, out = [], ri = 0, ni = 0;
    for (var i = 0; i < total; i++) {
      var wantNew = ni < news.length && Math.floor((ni + 0.5) * total / news.length) <= i;
      if (wantNew || ri >= reviews.length) out.push(news[ni++]);
      else out.push(reviews[ri++]);
    }
    return out;
  }

  // cards: [{id, state|null, order}]; day: {newDone, revDone}
  function buildQueue(cards, now, day, cfg) {
    cfg = cfgOf(cfg);
    day = day || { newDone: 0, revDone: 0 };
    var today = dayNum(now, cfg);
    var tomorrowMs = dayStartMs(today + 1, cfg);

    var learnDue = [], learnLater = [], reviews = [], news = [], learnToday = 0;
    cards.forEach(function (c) {
      var st = c.state;
      if (!st || st.type === 'new') { news.push(c); return; }
      if (isLearning(st)) {
        if (st.due < tomorrowMs) learnToday++;
        if (st.due <= now) learnDue.push(c); else learnLater.push(c);
        return;
      }
      if (st.type === 'review' && dayNum(st.due, cfg) <= today) reviews.push(c);
    });
    learnDue.sort(function (a, b) { return a.state.due - b.state.due; });
    learnLater.sort(function (a, b) { return a.state.due - b.state.due; });
    reviews.sort(function (a, b) { return a.state.due - b.state.due; });
    shuffle(reviews, seededRng('rev:' + today));
    reviews = reviews.slice(0, Math.max(0, cfg.revPerDay - (day.revDone || 0)));
    news.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    news = news.slice(0, Math.max(0, cfg.newPerDay - (day.newDone || 0)));

    var queue = learnDue.concat(interleave(reviews, news)).map(function (c) { return c.id; });
    var ahead = false;
    if (!queue.length && learnLater.length) {
      var limit = now + cfg.learnAhead * 60000;
      var soon = learnLater.filter(function (c) { return c.state.due <= limit; });
      if (soon.length) { ahead = true; queue = soon.map(function (c) { return c.id; }); }
    }
    var nextLearnDue = learnLater.length ? learnLater[0].state.due : null;
    return {
      queue: queue,
      counts: { new: news.length, learn: learnToday, due: reviews.length },
      nextLearnDue: nextLearnDue,
      ahead: ahead,
    };
  }

  function stats(cards, now, cfg) {
    cfg = cfgOf(cfg);
    var today = dayNum(now, cfg);
    var o = { total: cards.length, new: 0, learn: 0, review: 0, dueToday: 0, mature: 0, leech: 0 };
    cards.forEach(function (c) {
      var st = c.state;
      if (!st || st.type === 'new') { o.new++; return; }
      if (st.leech) o.leech++;
      if (isLearning(st)) { o.learn++; if (st.due < dayStartMs(today + 1, cfg)) o.dueToday++; return; }
      o.review++;
      if (isMature(st)) o.mature++;
      if (dayNum(st.due, cfg) <= today) o.dueToday++;
    });
    return o;
  }

  return {
    DEFAULTS: DEFAULTS, MIN_EASE: MIN_EASE,
    dayNum: dayNum, dayStartMs: dayStartMs,
    seededRng: seededRng, hashStr: hashStr,
    fuzzDelta: fuzzDelta, fuzzIvl: fuzzIvl, hardDelay: hardDelay,
    fmtSecs: fmtSecs, fmtDays: fmtDays,
    newState: newState, nextStates: nextStates, answer: answer,
    buildQueue: buildQueue, stats: stats, isMature: isMature, isLearning: isLearning,
    interleave: interleave,
  };
}));
