// Minimal .env loader (no dependency). Reads KEY=VALUE lines from the repo-root
// .env into process.env WITHOUT overwriting already-set vars. Called at the top
// of the CLI scripts so `node scripts/lineup-*.js` picks up local config. On
// Vercel this is unused (real env vars are set in the dashboard; no .env exists).

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const p = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

module.exports = { loadEnv };
