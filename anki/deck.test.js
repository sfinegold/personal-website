/* node anki/deck.test.js — validates anki/decks/index.js and every deck it lists. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
global.window = {};
require('./decks/index.js');
const index = global.window.DECK_INDEX;

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };
const str = (v) => typeof v === 'string' && v.trim().length > 0;

check(Array.isArray(index) && index.length >= 1, 'DECK_INDEX must be a non-empty array');
const ids = new Set();
(index || []).forEach((d, i) => {
  const w = 'index entry #' + i + ' (' + (d && d.id) + ')';
  check(/^[a-z][a-z0-9-]*$/.test(d.id || ''), w + ': bad id');
  check(!ids.has(d.id), w + ': duplicate id'); ids.add(d.id);
  check(d.file === d.id + '.js', w + ': file must be <id>.js');
  ['name', 'lang', 'langName', 'code'].forEach(k => check(str(d[k]), w + ': ' + k + ' missing'));
  check(typeof d.translit === 'boolean', w + ': translit must be true or false');
  const file = path.join(__dirname, 'decks', d.file || '');
  check(fs.existsSync(file), w + ': file not found');
  if (!fs.existsSync(file)) return;
  require(file);
  const deck = global.window.DECKS && global.window.DECKS[d.id];
  check(deck, w + ': file does not register window.DECKS.' + d.id);
  if (deck) validateDeck(deck, d);
});

function validateDeck(deck, meta) {
  const w0 = 'deck ' + meta.id;
  check(deck.id === meta.id, w0 + ': deck.id must equal the index id');
  check(typeof deck.version === 'number' && deck.version >= 1, w0 + ': version must be a number >= 1');
  check(/^\d{4}-\d{2}-\d{2}$/.test(deck.updated), w0 + ': updated must be YYYY-MM-DD');
  check(Array.isArray(deck.notes) && deck.notes.length >= 1, w0 + ': needs notes');
  const seen = new Set();
  (deck.notes || []).forEach((n, i) => {
    const w = w0 + ' note #' + i + ' (' + (n && n.id) + ')';
    if (!n || typeof n !== 'object') { check(false, w + ': not an object'); return; }
    check(/^[a-z0-9]+(-[a-z0-9]+)+$/.test(n.id || ''), w + ': bad id (use theme-slug, lowercase)');
    check(!seen.has(n.id), w + ': duplicate id'); seen.add(n.id);
    check(str(n.term), w + ': term missing');
    check(str(n.en), w + ': en missing');
    if (meta.translit) check(str(n.tr), w + ': tr missing (deck is translit)');
    else check(n.tr === undefined, w + ': tr not allowed (deck is not translit)');
    check(Array.isArray(n.tags) && n.tags.length > 0 && n.tags.every(str), w + ': tags must be a non-empty array of strings');
    if (n.note !== undefined) check(str(n.note), w + ': note must be a non-empty string if present');
    if (n.ex !== undefined) {
      check(n.ex && str(n.ex.term) && str(n.ex.en), w + ': ex needs term and en');
      if (meta.translit) check(n.ex && str(n.ex.tr), w + ': ex needs tr');
    }
    if (n.el !== undefined) check(false, w + ': field "el" is obsolete, use "term"');
    if (meta.lang === 'el' && str(n.term)) check(/[Ͱ-Ͽἀ-῿]/.test(n.term), w + ': term should contain Greek script');
    if (str(n.tr)) check(!/[Ͱ-Ͽἀ-῿;]/.test(n.tr), w + ': tr should be Latin only, with ? not ;');
  });
}

if (errors.length) { console.log(errors.join('\n')); console.log('\n' + errors.length + ' problem(s)'); process.exit(1); }
index.forEach(d => {
  const deck = global.window.DECKS[d.id];
  const tags = {};
  deck.notes.forEach(n => n.tags.forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
  console.log(d.id + ' ok: ' + deck.notes.length + ' notes, version ' + deck.version + ', updated ' + deck.updated);
  console.log('  tags: ' + Object.entries(tags).map(([k, v]) => k + ' ' + v).join(', '));
});
