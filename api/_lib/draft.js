// Claude drafts flashcards for /anki. Two jobs:
//   draftCard({ meta, input, examples, tags })  -> one note in the deck's format
//   draftDeck({ input })                        -> deck meta plus starter notes
// The caller (api/anki.js) checks the session and the daily quota; this module
// only talks to the model. The key is ANTHROPIC_API_KEY on the deployment.

'use strict';
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-5-5';
const MAX_INPUT = 600;

const PART = {
  type: 'object',
  properties: {
    t: { type: 'string', description: 'The piece, in the target script for a language deck.' },
    tr: { type: 'string', description: 'Transliteration of the piece, or "" when the deck has none.' },
    m: { type: 'string', description: 'What the piece means, a few words.' },
  },
  required: ['t', 'tr', 'm'],
  additionalProperties: false,
};
const NOTE = {
  type: 'object',
  properties: {
    term: { type: 'string', description: 'Front of the card. For a language deck: the phrase in the target script. For a fact deck: the name, question or problem.' },
    tr: { type: 'string', description: 'Transliteration of term in plain Latin letters with stress marks where helpful, or "" when the deck has no transliteration.' },
    en: { type: 'string', description: 'Back of the card: the English meaning, or the answer and key facts for a fact deck.' },
    memo: { type: 'string', description: 'How to remember it: a hook, a cognate, a picture or a pattern. One or two sentences.' },
    parts: { type: 'array', description: 'The pieces of the phrase or fact and what each means, in order. 1 to 6 items.', items: PART },
    tags: { type: 'array', description: 'Lowercase theme tags, 1 to 3. Reuse the deck\'s existing tags whenever one fits.', items: { type: 'string' } },
    ex: {
      type: 'object',
      description: 'A short example sentence using the phrase, for language decks. All fields "" for fact decks.',
      properties: { term: { type: 'string' }, tr: { type: 'string' }, en: { type: 'string' } },
      required: ['term', 'tr', 'en'],
      additionalProperties: false,
    },
    note: { type: 'string', description: 'Usage or register note, or "" if nothing is worth saying.' },
  },
  required: ['term', 'tr', 'en', 'memo', 'parts', 'tags', 'ex', 'note'],
  additionalProperties: false,
};
const DECK = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Deck name, 2 to 5 words.' },
    langName: { type: 'string', description: 'The language name for a language deck, or the subject (History, Maths, Science) for a fact deck.' },
    lang: { type: 'string', description: 'BCP 47 language code of the target language (el, ja, fa, it, es, zh), or "en" for a fact deck.' },
    locale: { type: 'string', description: 'Locale for speech, like el-GR, ja-JP, it-IT; en-US for a fact deck.' },
    code: { type: 'string', description: '2 or 3 uppercase letters shown in the direction label: EL, JA, IT, or Q for a fact deck.' },
    translit: { type: 'boolean', description: 'True when the target language uses a non-Latin script and cards need a transliteration line.' },
    speech: { type: 'boolean', description: 'True for a language deck where hearing the phrase matters; false for a fact deck.' },
    dirs: { type: 'string', enum: ['both', 'fwd'], description: '"both" when the card makes sense in both directions; "fwd" for problems with one answer, like arithmetic.' },
    labels: {
      type: 'object',
      description: 'Only for fact decks. Short labels for the two directions and the two sides, like "Name → Who", "Who → Name", "Name", "Who or what". All "" for a language deck.',
      properties: { fwd: { type: 'string' }, rev: { type: 'string' }, front: { type: 'string' }, back: { type: 'string' } },
      required: ['fwd', 'rev', 'front', 'back'],
      additionalProperties: false,
    },
    creature: {
      type: 'object',
      description: 'The deck\'s mascot: one emoji that fits the topic or culture, and a short friendly name.',
      properties: { emoji: { type: 'string' }, name: { type: 'string' } },
      required: ['emoji', 'name'],
      additionalProperties: false,
    },
    notes: { type: 'array', description: 'Starter cards, 12 to 20, the most useful things to learn first.', items: NOTE },
  },
  required: ['name', 'langName', 'lang', 'locale', 'code', 'translit', 'speech', 'dirs', 'labels', 'creature', 'notes'],
  additionalProperties: false,
};

const RULES = `You write flashcards for a spaced-repetition app. Every card has:
- term: the front. Language deck: the phrase in the target script, natural and idiomatic, as a native speaker says it. Fact deck: the name, question or problem.
- tr: transliteration in plain Latin letters with stress accents where the language has them (e.g. "kaliméra", "ohayō gozaimasu", "salām"), only when the deck uses transliteration; otherwise "".
- en: the back. Language deck: the English meaning, with a literal gloss in brackets when it differs. Fact deck: the answer and the two or three facts worth knowing.
- memo: how to remember it. Draw on cognates and English loanwords, shared roots, a picture, or a pattern the learner has seen in similar cards. Be concrete and short.
- parts: the pieces in order, each with its meaning, so the learner sees how the phrase is built (for a fact: the key facts broken into labelled pieces).
- tags: one to three lowercase theme tags; reuse the deck's existing tags when one fits.
- ex: one short example sentence for a language deck (term, tr, en); all "" for a fact deck.
- note: register or usage (formal/informal, when to use), or "".
Match the style of the examples exactly. Never invent facts; if the input is wrong or impossible, make the card about the correct version and say so in note. Keep everything concise.`;

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { const e = new Error('Card drafting is not configured on the server (ANTHROPIC_API_KEY).'); e.status = 503; throw e; }
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 90000 });
}

async function ask({ system, user, schema, maxTokens }) {
  const c = client();
  let r;
  try {
    r = await c.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }],
    });
  } catch (err) {
    const e = new Error(err instanceof Anthropic.RateLimitError ? 'The drafting service is busy. Try again in a minute.' : 'The drafting service failed: ' + (err && err.message ? err.message.slice(0, 160) : 'unknown error'));
    e.status = err instanceof Anthropic.RateLimitError ? 429 : 502;
    throw e;
  }
  if (r.stop_reason === 'refusal') { const e = new Error('The model declined to draft that.'); e.status = 422; throw e; }
  if (r.stop_reason === 'max_tokens') { const e = new Error('The draft ran too long. Try a shorter request.'); e.status = 502; throw e; }
  const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(text); } catch (err) { const e = new Error('The model returned something unreadable.'); e.status = 502; throw e; }
}

function cleanInput(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT); }

function describeDeck(meta) {
  meta = meta || {};
  const fact = !!(meta.labels && meta.labels.front);
  const lines = ['Deck: ' + (meta.name || 'untitled')];
  if (fact) {
    lines.push('Kind: fact deck (' + (meta.langName || 'facts') + '). Front = ' + meta.labels.front + ', back = ' + meta.labels.back + '. tr and ex are "". No transliteration.');
  } else {
    lines.push('Kind: language deck. Target language: ' + (meta.langName || meta.lang || 'unknown') + ' (' + (meta.lang || '') + ').');
    lines.push(meta.translit ? 'Transliteration: required in tr and in every part.' : 'Transliteration: none, tr is "" everywhere.');
  }
  return lines.join('\n');
}

async function draftCard({ meta, input, examples, tags }) {
  input = cleanInput(input);
  if (!input) { const e = new Error('Say what the card should teach.'); e.status = 400; throw e; }
  const ex = (Array.isArray(examples) ? examples : []).slice(0, 3).map((n) => JSON.stringify(n));
  const user = [
    describeDeck(meta),
    'Existing tags: ' + ((Array.isArray(tags) ? tags : []).slice(0, 40).join(', ') || 'none yet'),
    ex.length ? 'Examples of cards in this deck, match their style:\n' + ex.join('\n') : '',
    'Make one card from this request. The request may be in English (give the phrase in the target language) or in the target language (explain it):\n' + input,
  ].filter(Boolean).join('\n\n');
  const note = await ask({ system: RULES, user, schema: NOTE, maxTokens: 4000 });
  return tidyNote(note, meta);
}

async function draftDeck({ input }) {
  input = cleanInput(input);
  if (!input) { const e = new Error('Describe the deck you want.'); e.status = 400; throw e; }
  const system = RULES + `

You are also designing a new deck from a one-line description. Decide whether it is a language deck (phrases in a target language, with transliteration when the script is not Latin) or a fact deck (names, dates, problems, definitions). Pick a mascot emoji that fits the culture or topic. Write 12 to 20 starter cards: the most useful first things, varied, each with memo and parts. For a fact deck give short labels for the two directions.`;
  const user = 'Design a deck for: ' + input;
  const d = await ask({ system, user, schema: DECK, maxTokens: 16000 });
  const fact = !d.speech && d.labels && d.labels.front;
  const meta = {
    name: String(d.name || 'New deck').slice(0, 40),
    langName: String(d.langName || '').slice(0, 24),
    lang: String(d.lang || 'en').toLowerCase().slice(0, 8),
    locale: String(d.locale || '').slice(0, 12),
    code: String(d.code || 'Q').toUpperCase().slice(0, 3),
    translit: !!d.translit && !fact,
    speech: !!d.speech && !fact,
    dirs: d.dirs === 'fwd' ? 'fwd' : 'both',
    creature: { emoji: String((d.creature && d.creature.emoji) || '🐣').slice(0, 8), name: String((d.creature && d.creature.name) || 'Pip').slice(0, 16), kind: 'emoji' },
  };
  if (fact) meta.labels = { fwd: d.labels.fwd.slice(0, 24), rev: d.labels.rev.slice(0, 24), front: d.labels.front.slice(0, 16), back: d.labels.back.slice(0, 16) };
  const notes = (Array.isArray(d.notes) ? d.notes : []).map((n) => tidyNote(n, meta));
  return { meta, notes };
}

// Trim fields to the deck's shape: drop empty strings, cap lengths, keep tags clean.
function tidyNote(n, meta) {
  n = n || {};
  const translit = !!(meta && meta.translit);
  const str = (s, max) => String(s == null ? '' : s).trim().slice(0, max);
  const out = { term: str(n.term, 160), en: str(n.en, 400) };
  if (translit && str(n.tr, 160)) out.tr = str(n.tr, 160);
  if (str(n.note, 240)) out.note = str(n.note, 240);
  if (str(n.memo, 400)) out.memo = str(n.memo, 400);
  const parts = (Array.isArray(n.parts) ? n.parts : []).map((p) => {
    const q = { t: str(p && p.t, 80), m: str(p && p.m, 120) };
    if (translit && str(p && p.tr, 80)) q.tr = str(p && p.tr, 80);
    return q;
  }).filter((p) => p.t && p.m).slice(0, 8);
  if (parts.length) out.parts = parts;
  const tags = (Array.isArray(n.tags) ? n.tags : []).map((t) => str(t, 24).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')).filter(Boolean).slice(0, 3);
  out.tags = tags.length ? tags : ['added'];
  if (n.ex && str(n.ex.term, 200) && str(n.ex.en, 200)) {
    out.ex = { term: str(n.ex.term, 200), en: str(n.ex.en, 200) };
    if (translit && str(n.ex.tr, 200)) out.ex.tr = str(n.ex.tr, 200);
  }
  return out;
}

module.exports = { draftCard, draftDeck, tidyNote, MAX_INPUT };
