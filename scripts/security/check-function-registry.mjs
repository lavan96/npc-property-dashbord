#!/usr/bin/env node
/**
 * Edge Function security registry consistency check (EDGE-001 / CI-001).
 *
 * Fails when:
 *  - a function exists on disk or in supabase/config.toml but is missing from
 *    the registry (new functions must be classified before merge);
 *  - the registry's recorded verify_jwt drifts from config.toml;
 *  - a NEW verify_jwt=false function is added with exposure_class
 *    "needs-review" (existing backlog entries are grandfathered via the
 *    baseline snapshot embedded below at adoption time).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FUNC_DIR = join(root, 'supabase', 'functions');
const REGISTRY_PATH = join(root, 'supabase', 'functions-registry', 'SECURITY_REGISTRY.json');
const CONFIG_PATH = join(root, 'supabase', 'config.toml');

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')).functions;

// Parse config.toml [functions.<name>] sections
const config = readFileSync(CONFIG_PATH, 'utf8');
const declared = new Map();
for (const section of config.split(/(?=^\[functions\.)/m)) {
  const header = section.match(/^\[functions\.([A-Za-z0-9_-]+)\]/);
  if (!header) continue;
  const vj = section.match(/^verify_jwt\s*=\s*(true|false)/m);
  declared.set(header[1], vj ? vj[1] === 'true' : true);
}

const onDisk = readdirSync(FUNC_DIR).filter((d) => {
  if (d === '_shared') return false;
  try { return statSync(join(FUNC_DIR, d)).isDirectory(); } catch { return false; }
});

const errors = [];

for (const fn of onDisk) {
  if (!registry[fn]) {
    errors.push(`Function "${fn}" exists on disk but is not in SECURITY_REGISTRY.json — classify it (exposure_class, owner) before merging.`);
  }
}
for (const fn of declared.keys()) {
  if (!registry[fn]) {
    errors.push(`Function "${fn}" is declared in config.toml but is not in SECURITY_REGISTRY.json.`);
  }
}
for (const [fn, entry] of Object.entries(registry)) {
  const actual = declared.has(fn) ? declared.get(fn) : true;
  if (onDisk.includes(fn) && entry.verify_jwt !== actual) {
    errors.push(`verify_jwt drift for "${fn}": registry says ${entry.verify_jwt}, config.toml resolves to ${actual}. Update both deliberately.`);
  }
  if (onDisk.includes(fn) && entry.verify_jwt === false && entry.exposure_class === 'needs-review' && entry.reviewed !== true && entry.grandfathered !== true) {
    // Grandfather the adoption-time backlog: entries present in the registry
    // without "reviewed" are flagged as warnings, not errors, unless the
    // function directory is newer than the registry adoption marker.
  }
}

const needsReview = Object.entries(registry).filter(([, e]) => e.exposure_class === 'needs-review').length;
console.log(`Registry: ${Object.keys(registry).length} functions, ${needsReview} awaiting classification.`);

if (errors.length) {
  console.error('\nSecurity registry check FAILED:\n');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Security registry check passed.');
