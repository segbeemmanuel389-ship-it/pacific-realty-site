// Runs on Netlify before publishing. It copies PUBLIC settings from Netlify's
// environment variables into site/config.js. Never put secret keys here.
import { writeFileSync } from 'node:fs';

const e = process.env;
const cfg = {
  SUPABASE_URL: (e.SUPABASE_URL || '').trim(),
  SUPABASE_ANON_KEY: (e.SUPABASE_ANON_KEY || '').trim(),
  WHATSAPP_NUMBER: (e.WHATSAPP_NUMBER || '').trim(),
};

if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  console.warn('WARNING: SUPABASE_URL or SUPABASE_ANON_KEY is not set. The site will use its built-in listings and accounts will be switched off.');
}
writeFileSync('site/config.js', 'window.PRS_CONFIG = ' + JSON.stringify(cfg) + ';\n');
console.log('site/config.js written.');
