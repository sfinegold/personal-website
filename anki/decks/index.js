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
 *        locale    full tag for speech (e.g. 'el-GR'); the voice must match `lang`
 *        langName  the language, for labels ("Greek")
 *        code      short code for direction labels ("EL → EN")
 *        translit  true if notes carry a `tr` transliteration line (Greek, Japanese,
 *                  Russian...), false for Latin-script languages (then `tr` is omitted
 *                  and `term` is the main line)
 *        creature  { emoji, name, kind }: the deck's companion. Its health follows how
 *                  recently the deck was studied and how many cards are due. Pick an
 *                  animal tied to the language's culture (owl for Greek, fox for
 *                  Japanese, Persian cat for Farsi). Without one the deck gets 🐣.
 *   3. Run `node anki/deck.test.js`, commit, push. Never change an existing id.
 *
 * Note fields in a deck file: { id, term, tr?, en, tags, note?, ex?:{term, tr?, en}, priority? }
 *   priority: true  puts the note's cards at the front of the new-card queue, ahead of
 *             unseen notes without the flag. Use it when Sam asks for a set "next".
 *             Remove the flag later (or leave it; it only affects unseen cards).
 *   memo      one or two sentences (under 160 chars) on how to remember the phrase. Lean on,
 *             in this order: an English word that shares the root or was borrowed; a pattern
 *             already in the deck (verb endings, particles, markers); a sound-alike picture.
 *   parts     the phrase in order, one item per meaning-bearing piece, including endings,
 *             particles and link words: [{t:'Καλη-', tr:'kali', m:'good'}, {t:'-μέρα', tr:'méra', m:'day'}]
 *             t = piece in the language's script, tr = its transliteration (translit decks only),
 *             m = meaning or function. A hyphen marks a bound piece. Every note should carry
 *             both fields; the validator prints coverage per deck.
 *   term  the phrase in the target language's own script
 *   tr    transliteration (only when translit is true)
 *   en    English
 */
window.DECK_INDEX = [
  { id: 'greek', file: 'greek.js', name: 'Conversational Greek', lang: 'el', locale: 'el-GR', langName: 'Greek', code: 'EL', translit: true,
    creature: { emoji: '🦉', name: 'Sophia', kind: 'owl' } },
  { id: 'japanese', file: 'japanese.js', name: 'Conversational Japanese', lang: 'ja', locale: 'ja-JP', langName: 'Japanese', code: 'JA', translit: true,
    creature: { emoji: '🦊', name: 'Kitsu', kind: 'fox' } },
  { id: 'farsi', file: 'farsi.js', name: 'Conversational Farsi', lang: 'fa', locale: 'fa-IR', langName: 'Farsi', code: 'FA', translit: true,
    creature: { emoji: '🐈', name: 'Pari', kind: 'cat' } },
];
