/* node anki/deck.test.js — validates anki/decks/greek.js before a push. */
'use strict';
const assert = require('node:assert/strict');
global.window = {};
require('./decks/greek.js');
const deck = global.window.DECKS.greek;

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

check(deck && deck.id === 'greek', 'deck.id must be "greek"');
check(typeof deck.version === 'number' && deck.version >= 1, 'deck.version must be a number >= 1');
check(/^\d{4}-\d{2}-\d{2}$/.test(deck.updated), 'deck.updated must be YYYY-MM-DD');
check(Array.isArray(deck.notes) && deck.notes.length >= 100, 'deck needs at least 100 notes, has ' + (deck.notes || []).length);

const seen = new Set();
const str = (v) => typeof v === 'string' && v.trim().length > 0;
deck.notes.forEach((n, i) => {
  const where = 'note #' + i + ' (' + (n && n.id) + ')';
  check(n && typeof n === 'object', where + ': not an object');
  if (!n) return;
  check(/^[a-z0-9]+(-[a-z0-9]+)+$/.test(n.id || ''), where + ': bad id (use theme-slug, lowercase)');
  check(!seen.has(n.id), where + ': duplicate id'); seen.add(n.id);
  check(str(n.el), where + ': el missing');
  check(str(n.tr), where + ': tr missing');
  check(str(n.en), where + ': en missing');
  check(Array.isArray(n.tags) && n.tags.length > 0 && n.tags.every(str), where + ': tags must be a non-empty array of strings');
  if (n.note !== undefined) check(str(n.note), where + ': note must be a non-empty string if present');
  if (n.ex !== undefined) check(n.ex && str(n.ex.el) && str(n.ex.tr) && str(n.ex.en), where + ': ex needs el, tr and en');
  if (str(n.el)) check(/[Ͱ-Ͽἀ-῿]/.test(n.el), where + ': el should contain Greek script');
  if (str(n.tr)) check(!/[Ͱ-Ͽἀ-῿;]/.test(n.tr), where + ': tr should be Latin only, with ? not ;');
});

if (errors.length) { console.log(errors.join('\n')); console.log('\n' + errors.length + ' problem(s)'); process.exit(1); }
const tags = {};
deck.notes.forEach(n => n.tags.forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
console.log('deck ok: ' + deck.notes.length + ' notes, version ' + deck.version + ', updated ' + deck.updated);
console.log('tags: ' + Object.entries(tags).map(([k, v]) => k + ' ' + v).join(', '));
