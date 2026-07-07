// Lineup — send the digest. Transport is pluggable and chosen from env:
//
//   Gmail SMTP (default, no domain/DNS needed):
//     GMAIL_USER            e.g. sjfinegold@gmail.com
//     GMAIL_APP_PASSWORD    a Google App Password (needs 2FA on the account)
//     LINEUP_FROM_NAME      display name, default "Lineup"
//     → mail is sent from, and appears as coming from, GMAIL_USER.
//
//   Resend (optional fallback, needs a verified domain):
//     RESEND_API_KEY, LINEUP_FROM
//
// nodemailer is lazy-required so this module loads even where it isn't installed
// (local tooling, tests); it's only needed at actual send time on Vercel.

const RESEND_URL = 'https://api.resend.com/emails';

function transport() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail';
  if (process.env.RESEND_API_KEY) return 'resend';
  return null;
}

async function sendViaGmail({ to, subject, html, text }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const name = process.env.LINEUP_FROM_NAME || 'Lineup';
  // Gmail only lets you send as the authenticated user (or a verified alias).
  const from = `"${name}" <${user}>`;

  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  const tx = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  const info = await tx.sendMail({ from, to, subject, html, text });
  return { id: info.messageId, transport: 'gmail' };
}

async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LINEUP_FROM || 'Lineup <lineup@samfinegold.me>';
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return { id: data.id, transport: 'resend' };
}

async function sendEmail({ to, subject, html, text }) {
  if (!to) throw new Error('no recipient');
  const kind = transport();
  if (kind === 'gmail') return sendViaGmail({ to, subject, html, text });
  if (kind === 'resend') return sendViaResend({ to, subject, html, text });
  throw new Error('no email transport configured (set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY)');
}

module.exports = { sendEmail, transport };
