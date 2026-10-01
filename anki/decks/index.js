/* index.js — the deck registry for /anki.
 *
 * Every deck is one file in this folder that registers itself:
 *     window.DECKS = window.DECKS || {};
 *     window.DECKS.<id> = { id, name, version, updated, notes:[...] };
 * The page loads every deck listed here at start, so a deck is live as soon
 * as it is listed. Progress is stored per deck id, so note ids only need to
 * be unique within their own deck.
 *
 * TO ADD A DECK (Claude: follow this exactly)
 *   1. Create anki/decks/<id>.js in the shape of greek.js. Read its header first.
 *   2. Add an entry below. Fields:
 *        id        matches the file name and window.DECKS.<id>
 *        file      the file name in this folder
 *        name      shown in the deck list and the top bar
 *        lang      BCP-47 language tag used to pick a speech voice (e.g. 'el', 'es', 'ja')
 *        langName  the language, for labels ("Greek")
 *        code      short code for direction labels ("EL → EN")
 *        translit  true if notes carry a `tr` transliteration line (Greek, Japanese,
 *                  Russian...), false for Latin-script languages (then `tr` is omitted
 *                  and `term` is the main line)
 *   3. Run `node anki/deck.test.js`, commit, push. Never change an existing id.
 *
 * Note fields in a deck file: { id, term, tr?, en, tags, note?, ex?:{term, tr?, en} }
 *   term  the phrase in the target language's own script
 *   tr    transliteration (only when translit is true)
 *   en    English
 */
window.DECK_INDEX = [
  { id: 'greek', file: 'greek.js', name: 'Conversational Greek', lang: 'el', langName: 'Greek', code: 'EL', translit: true },
  { id: 'japanese', file: 'japanese.js', name: 'Conversational Japanese', lang: 'ja', langName: 'Japanese', code: 'JA', translit: true },
  { id: 'farsi', file: 'farsi.js', name: 'Conversational Farsi', lang: 'fa', langName: 'Farsi', code: 'FA', translit: true },
];
