/* merge.js — merges two copies of a profile's progress document (the v2 store
 * shape: { v:2, settings, decks:{ <deckId>:{cards, day, undo, stamp, boost} }, streak }).
 * Used by api/anki.js on every save and by the page when it loads the server copy,
 * so two devices can both study and neither overwrites the other.
 *
 * Rules (pure, order-independent except where noted):
 *   cards   per card: the state whose `last` is later wins; a stored state beats absence.
 *   day     same day number: max of each counter; different days: the newer day.
 *   boost   union, order preserved (a's first).
 *   stamp   the one with the higher version, else the newer `updated`.
 *   undo    a's (the local device's); undo never travels.
 *   settings from the document with the later `updated` (b when equal).
 *   streak  the one with the later `lastDay`, best = max of both.
 * Loads in node (module.exports) and the browser (window.AnkiMerge).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnkiMerge = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function ts(doc) { return doc && doc.updated ? Date.parse(doc.updated) || 0 : 0; }

  function mergeCards(a, b) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    var out = {}, ids = Object.keys(a).concat(Object.keys(b).filter(function (k) { return !(k in a); }));
    ids.forEach(function (id) {
      var x = a[id], y = b[id];
      if (!x) { out[id] = y; return; }
      if (!y) { out[id] = x; return; }
      out[id] = (y.last || 0) > (x.last || 0) ? y : x;
    });
    return out;
  }
  function mergeDay(a, b) {
    a = isObj(a) ? a : null; b = isObj(b) ? b : null;
    if (!a) return b ? Object.assign({}, b) : { day: 0, newDone: 0, revDone: 0, extraNew: 0 };
    if (!b) return Object.assign({}, a);
    if ((a.day || 0) !== (b.day || 0)) return Object.assign({}, (a.day || 0) > (b.day || 0) ? a : b);
    return { day: a.day || 0, newDone: Math.max(a.newDone || 0, b.newDone || 0), revDone: Math.max(a.revDone || 0, b.revDone || 0), extraNew: Math.max(a.extraNew || 0, b.extraNew || 0) };
  }
  function mergeBoost(a, b) {
    var out = (Array.isArray(a) ? a : []).slice();
    (Array.isArray(b) ? b : []).forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
    return out;
  }
  function mergeStamp(a, b) {
    if (!a) return b || null; if (!b) return a;
    if ((a.version || 0) !== (b.version || 0)) return (a.version || 0) > (b.version || 0) ? a : b;
    return String(b.updated || '') > String(a.updated || '') ? b : a;
  }
  function mergeBucket(a, b) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    return { cards: mergeCards(a.cards, b.cards), day: mergeDay(a.day, b.day), undo: Array.isArray(a.undo) ? a.undo : [], stamp: mergeStamp(a.stamp, b.stamp), boost: mergeBoost(a.boost, b.boost) };
  }
  function mergeStreak(a, b) {
    a = isObj(a) ? a : null; b = isObj(b) ? b : null;
    if (!a) return b ? Object.assign({}, b) : null;
    if (!b) return Object.assign({}, a);
    var w = (b.lastDay || 0) > (a.lastDay || 0) ? b : a;
    return Object.assign({}, w, { best: Math.max(a.best || 0, b.best || 0, w.current || 0) });
  }

  // a = local / stored, b = incoming. Returns a new document; neither input is modified.
  function mergeState(a, b) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    var decks = {}, ids = Object.keys(a.decks || {}).concat(Object.keys(b.decks || {}).filter(function (k) { return !(a.decks && k in a.decks); }));
    ids.forEach(function (id) { decks[id] = mergeBucket(a.decks && a.decks[id], b.decks && b.decks[id]); });
    var newer = ts(b) >= ts(a) ? b : a;
    var out = { v: 2, decks: decks };
    var settings = newer.settings || a.settings || b.settings || null;
    if (settings) out.settings = settings;
    var streak = mergeStreak(a.streak, b.streak);
    if (streak) out.streak = streak;
    if (a.deck || b.deck) out.deck = newer.deck || a.deck || b.deck;
    out.updated = ts(a) >= ts(b) ? (a.updated || null) : (b.updated || null);
    return out;
  }

  // True when merging b into a would change a (so the page knows whether to push).
  function differs(a, b) { return JSON.stringify(stripUndo(a)) !== JSON.stringify(stripUndo(b)); }
  function stripUndo(doc) {
    var d = { v: 2, decks: {}, settings: doc.settings || null, streak: doc.streak || null };
    Object.keys(doc.decks || {}).forEach(function (id) { var b = doc.decks[id]; d.decks[id] = { cards: b.cards, day: b.day, stamp: b.stamp, boost: b.boost }; });
    return d;
  }

  return { mergeState: mergeState, mergeCards: mergeCards, mergeDay: mergeDay, mergeBoost: mergeBoost, mergeStreak: mergeStreak, differs: differs };
}));
