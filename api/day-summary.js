// Claude-backed note synthesizer for /paraform-day.
//
// The day page is a public static file, so the Anthropic key can never live in
// it. This function holds the key server-side (ANTHROPIC_API_KEY, already set
// for the lineup extractor) and the page posts its notes here.
//
// A shared passphrase keeps the endpoint from being an open Claude proxy on my
// key. It is not a secret — it is a rate gate. Same hardcoded-password pattern
// as api/milton-finance-review.js.

const PASS = 'daybook';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-opus-5';

const SCHEMA = {
  type: 'object',
  properties: {
    headline: {
      type: 'string',
      description: 'One sentence: where the day stands and what it is adding up to.',
    },
    themes: {
      type: 'array',
      description: 'The 2-4 patterns showing up across the notes.',
      items: {
        type: 'object',
        properties: {
          t: { type: 'string', description: 'The theme, 8 words max.' },
          why: { type: 'string', description: 'One sentence on the evidence behind it.' },
        },
        required: ['t', 'why'],
        additionalProperties: false,
      },
    },
    quotes: {
      type: 'array',
      description: 'Verbatim lines from the notes worth putting in the 7pm deck. Empty array if none yet.',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The quote, verbatim from the notes. Never invent one.' },
          who: { type: 'string', description: 'Who said it, or "unattributed".' },
          use: { type: 'string', description: 'Which deck slide it supports.' },
        },
        required: ['text', 'who', 'use'],
        additionalProperties: false,
      },
    },
    gaps: {
      type: 'array',
      description: 'What the 7pm deck still needs that the notes do not yet cover.',
      items: { type: 'string' },
    },
    next: {
      type: 'array',
      description: 'Two or three concrete moves for the next hour.',
      items: { type: 'string' },
    },
  },
  required: ['headline', 'themes', 'quotes', 'gaps', 'next'],
  additionalProperties: false,
};

const SYSTEM = `You help Sam during a one-day product-manager work trial at Paraform, a recruiting marketplace. He takes notes through the day. You read those notes and tell him where he stands.

Everything he must deliver funnels into a 25-minute presentation at 7:00 PM with six parts:
1. The problem and why it matters, to whom
2. What he learned today, in someone else's words
3. The decision he made and the options he rejected
4. A prototype demo
5. How he would measure it
6. What is next and what he deliberately cut

How to read the notes:
- Work only from what is written. Never invent a quote, a name, or a finding.
- Say what the notes actually support. If they are thin, say they are thin.
- Name contradictions between notes. They are the most useful thing you can find.
- Point at the deck part each observation serves.
- Weigh the general notes and the timed notes the same.

How to write:
- Address Sam as "you". Never write his name or refer to him in the third person.
- Short words. Short sentences. Active voice.
- One idea per sentence. Cut every word that does not work.
- No praise, no hedging, no preamble.
- He reads this between meetings. Make it scannable.`;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 400000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function buildPrompt({ blocks, general, clock }) {
  const timed = (blocks || [])
    .filter((b) => b && b.text && b.text.trim())
    .map((b) => `## ${b.when || ''} — ${b.name || ''}\n${b.text.trim()}`)
    .join('\n\n');

  const parts = [`Local time is ${clock || 'unknown'}.`];
  parts.push(timed ? `\n# Notes by time block\n\n${timed}` : '\n# Notes by time block\n\n(none written yet)');
  parts.push(
    general && general.trim()
      ? `\n# General notes\n\n${general.trim()}`
      : '\n# General notes\n\n(none written yet)'
  );
  parts.push('\nRead the notes above. Give me the running picture.');
  return parts.join('\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.status(400).json({ error: 'bad JSON' });
    return;
  }

  if (body.pass !== PASS) {
    res.status(401).json({ error: 'wrong passphrase' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on this deployment' });
    return;
  }

  const prompt = buildPrompt(body);
  if (prompt.length < 60) {
    res.status(400).json({ error: 'no notes yet' });
    return;
  }

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: SCHEMA },
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      res.status(502).json({ error: `anthropic ${r.status}`, detail: detail.slice(0, 300) });
      return;
    }

    const data = await r.json();
    if (data.stop_reason === 'refusal') {
      res.status(502).json({ error: 'model declined' });
      return;
    }
    if (data.stop_reason === 'max_tokens') {
      res.status(502).json({ error: 'ran out of room — trim the notes and try again' });
      return;
    }

    const text = (data.content || []).map((b) => b.text || '').join('');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      res.status(502).json({ error: 'model returned unparseable output' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
};
