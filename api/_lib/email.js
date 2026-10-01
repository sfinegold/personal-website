// Send an email. Transport is pluggable and chosen from env:
//
//   Resend (preferred when RESEND_API_KEY is set; needs a verified domain):
//     RESEND_API_KEY
//     LINEUP_FROM           default "Lineup <lineup@samfinegold.me>"; callers can pass their own `from`
//
//   Gmail SMTP (fallback, no domain/DNS needed):
//     GMAIL_USER            e.g. sjfinegold@gmail.com
//     GMAIL_APP_PASSWORD    a Google App Password (needs 2FA on the account)
//     LINEUP_FROM_NAME      display name, default "Lineup"
//     → mail is sent from, and appears as coming from, GMAIL_USER.
//
// Errors carry `code`: 'EAUTH' (Gmail rejected the login), 'RESEND' (the Resend API
// said no; `status` and `detail` hold the reply), so callers can show one plain line.
// nodemailer is lazy-required so this module loads even where it isn't installed
// (local tooling, tests); it's only needed at actual send time on Vercel.

const RESEND_URL = 'https://api.resend.com/emails';

function transport() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail';
  return null;
}

// "Name <addr>" -> { name, addr }; a bare address gives name ''.
function parseFrom(from) {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: (m[1] || '').trim(), addr: m[2].trim() } : { name: '', addr: (from || '').trim() };
}

async function sendViaGmail({ to, subject, html, text, from }) {
  const user = process.env.GMAIL_USER;
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');   // Google shows app passwords with spaces
  const name = parseFrom(from).name || process.env.LINEUP_FROM_NAME || 'Lineup';
  // Gmail only lets you send as the authenticated user (or a verified alias).
  const sender = `"${name}" <${user}>`;

  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  const tx = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  let info;
  try {
    info = await tx.sendMail({ from: sender, to, subject, html, text });
  } catch (err) {
    const auth = (err && (err.code === 'EAUTH' || err.responseCode === 535));
    const e = new Error(auth ? 'Gmail rejected the login (GMAIL_USER / GMAIL_APP_PASSWORD).' : 'Gmail could not send the email.');
    e.code = auth ? 'EAUTH' : 'ESMTP';
    e.detail = String((err && err.message) || err).slice(0, 300);
    throw e;
  }
  return { id: info.messageId, transport: 'gmail' };
}

async function sendViaResend({ to, subject, html, text, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = from || process.env.LINEUP_FROM || 'Lineup <lineup@samfinegold.me>';
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: sender, to, subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let message = '';
    try { message = JSON.parse(detail).message || ''; } catch (err) { /* not JSON */ }
    const e = new Error(message || `Resend replied ${res.status}.`);
    e.code = 'RESEND'; e.status = res.status; e.detail = detail.slice(0, 300);
    throw e;
  }
  const data = await res.json();
  return { id: data.id, transport: 'resend' };
}

async function sendEmail({ to, subject, html, text, from }) {
  if (!to) throw new Error('no recipient');
  const kind = transport();
  if (kind === 'resend') return sendViaResend({ to, subject, html, text, from });
  if (kind === 'gmail') return sendViaGmail({ to, subject, html, text, from });
  throw new Error('no email transport configured (set RESEND_API_KEY, or GMAIL_USER + GMAIL_APP_PASSWORD)');
}

module.exports = { sendEmail, transport, parseFrom };
