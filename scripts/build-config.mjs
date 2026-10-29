import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const siteDir = resolve(root, 'site');
const env = process.env;
const cfg = {
  SUPABASE_URL: (env.SUPABASE_URL || '').trim(),
  SUPABASE_ANON_KEY: (env.SUPABASE_ANON_KEY || '').trim(),
  WHATSAPP_NUMBER: (env.WHATSAPP_NUMBER || '').replace(/\D/g, ''),
};

const missing = Object.entries(cfg)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  throw new Error(`Missing required build environment variable(s): ${missing.join(', ')}. No output was changed.`);
}

function isValidSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

function isPublicAnonKey(value) {
  if (value.startsWith('sb_publishable_')) return true;
  if (value.startsWith('sb_secret_')) return false;

  const parts = value.split('.');
  if (parts.length !== 3) return false;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

if (!isValidSupabaseUrl(cfg.SUPABASE_URL)) {
  throw new Error('SUPABASE_URL must be a valid HTTPS Supabase project URL (HTTP is allowed only for localhost). No output was changed.');
}
if (!isPublicAnonKey(cfg.SUPABASE_ANON_KEY)) {
  throw new Error('SUPABASE_ANON_KEY must be the public anon/publishable key. Secret and service_role keys are not allowed. No output was changed.');
}
if (!/^\d{7,15}$/.test(cfg.WHATSAPP_NUMBER)) {
  throw new Error('WHATSAPP_NUMBER must contain 7 to 15 digits, optionally formatted with spaces or a leading +. No output was changed.');
}
if (!existsSync(resolve(siteDir, 'admin.html'))) {
  throw new Error('site/admin.html is missing; the admin dashboard cannot be included in the deployment.');
}

writeFileSync(
  resolve(siteDir, 'config.js'),
  `window.PRS_CONFIG = ${JSON.stringify(cfg)};\n`,
  'utf8',
);

console.log('Build complete: site/config.js generated; admin.html is included in the Pages output.');
