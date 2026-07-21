#!/usr/bin/env node
/**
 * Static security rules for Edge Functions (Phase 12 / CI-001, section 17.2).
 *
 * Blocks reintroduction of the audited vulnerability classes:
 *  R1: JSON.parse(atob(...)) JWT-payload parsing used for authentication
 *      decisions (decoded-claim trust — finding F-01).
 *  R2: Math.random() in login/reset/invite/token code paths (weak
 *      credentials — finding F-06).
 *  R3: wildcard Access-Control-Allow-Origin in a function that also sets or
 *      reads session cookies (credentialed wildcard CORS).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FUNC_DIR = join(root, 'supabase', 'functions');

// Files where decoded-claim parsing is acceptable (diagnostics / logging only,
// never authorization). Keep this list short and justified.
const R1_ALLOWLIST = new Set([
  '_shared/jwt.ts',             // extractUserIdFromJWT: logging helper, never authorizes
  '_shared/ghl-account.ts',     // decodes GHL provider token for format diagnostics only
  'ghl-calendar-test/index.ts'  // decodes a GHL API key for diagnostics output
]);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js)$/.test(name)) files.push(p);
  }
})(FUNC_DIR);

const errors = [];

for (const file of files) {
  const rel = relative(FUNC_DIR, file).replace(/\\/g, '/');
  const src = readFileSync(file, 'utf8');

  // R1: decoded JWT payload trust
  if (/JSON\.parse\(\s*atob\(/.test(src) && !R1_ALLOWLIST.has(rel)) {
    errors.push(`[R1] ${rel}: JSON.parse(atob(...)) — JWT/base64 payload decoding in a function. ` +
      `Claims must be cryptographically verified (use _shared/jwt.ts verifySupabaseJWT or _shared/auth_v2.ts). ` +
      `If this is diagnostics-only, add the file to R1_ALLOWLIST with a justification.`);
  }

  // R2: weak randomness in credential paths
  if (/(login|reset|invite|token|otp|password)/i.test(rel) && /Math\.random\(\)/.test(src)) {
    errors.push(`[R2] ${rel}: Math.random() in an auth/credential code path — use crypto.getRandomValues (see _shared/resetTokens.ts).`);
  }

  // R3: wildcard CORS + cookies in the same function. _shared/auth.ts is
  // excluded: it defines BOTH the cookie helpers and the token-only wildcard
  // CORS helper; the dangerous combination is a single function using both.
  if (!rel.startsWith('_shared/') && /['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/.test(src) && /Set-Cookie|session_token=/.test(src)) {
    errors.push(`[R3] ${rel}: wildcard Access-Control-Allow-Origin combined with session cookies — use the origin allowlist (createCorsHeaders).`);
  }
}

if (errors.length) {
  console.error('Static auth-pattern scan FAILED:\n');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log(`Static auth-pattern scan passed (${files.length} files).`);
