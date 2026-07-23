#!/usr/bin/env node
/**
 * Edge Function security registry consistency check (WP-00).
 *
 * Fails on missing registry entries, duplicate config declarations, registry /
 * config verify_jwt drift, invalid exposure classes, new unreviewed functions,
 * and growth of the exact grandfathered needs-review backlog.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const functionsDir = join(root, 'supabase', 'functions');
const registryPath = join(root, 'supabase', 'functions-registry', 'SECURITY_REGISTRY.json');
const baselinePath = join(root, 'supabase', 'functions-registry', 'needs-review-baseline.json');
const configPath = join(root, 'supabase', 'config.toml');
const exposureClasses = new Set([
  'public-auth', 'human-authenticated', 'portal-authenticated', 'internal-service',
  'webhook', 'cron-worker', 'public', 'needs-review', 'authenticated-staff',
  'module-gated', 'webhook-secret', 'authenticated-or-service',
  'webhook-clientstate', 'superadmin-only',
]);

const registry = JSON.parse(readFileSync(registryPath, 'utf8')).functions;
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
if (!Array.isArray(baseline.needs_review_functions) || !Array.isArray(baseline.unreviewed_functions)) {
  throw new Error('Invalid needs-review baseline: expected needs_review_functions and unreviewed_functions arrays.');
}
const config = readFileSync(configPath, 'utf8');
const declared = new Map();
const duplicateDeclarations = [];
for (const section of config.split(/(?=^\[functions\.)/m)) {
  const header = section.match(/^\[functions\.([A-Za-z0-9_-]+)\]/);
  if (!header) continue;
  const name = header[1];
  const verifyJwt = section.match(/^verify_jwt\s*=\s*(true|false)/m);
  if (declared.has(name)) duplicateDeclarations.push(name);
  declared.set(name, verifyJwt ? verifyJwt[1] === 'true' : true);
}
const onDisk = readdirSync(functionsDir).filter((name) => name !== '_shared' && statSync(join(functionsDir, name)).isDirectory());
const errors = [];
for (const name of duplicateDeclarations) errors.push(`Function "${name}" is declared more than once in config.toml.`);
for (const name of onDisk) if (!registry[name]) errors.push(`Function "${name}" exists on disk but is not in SECURITY_REGISTRY.json.`);
for (const name of declared.keys()) if (!registry[name]) errors.push(`Function "${name}" is declared in config.toml but is not in SECURITY_REGISTRY.json.`);
for (const [name, entry] of Object.entries(registry)) {
  if (typeof entry.exposure_class !== 'string' || !exposureClasses.has(entry.exposure_class)) errors.push(`Function "${name}" has an empty or invalid exposure_class.`);
  if (typeof entry.owner !== 'string' || entry.owner.trim() === '') errors.push(`Function "${name}" has an empty owner.`);
  if (typeof entry.verify_jwt !== 'boolean') errors.push(`Function "${name}" must record verify_jwt as a boolean.`);
  if (onDisk.includes(name) && entry.verify_jwt !== (declared.get(name) ?? true)) errors.push(`verify_jwt drift for "${name}": registry says ${entry.verify_jwt}, config.toml resolves to ${declared.get(name) ?? true}.`);
}
const needsReview = Object.entries(registry).filter(([, entry]) => entry.exposure_class === 'needs-review').map(([name]) => name).sort();
const unreviewed = Object.entries(registry).filter(([, entry]) => entry.reviewed !== true).map(([name]) => name).sort();
const baselineNeedsReview = new Set(baseline.needs_review_functions);
const baselineUnreviewed = new Set(baseline.unreviewed_functions);
const newNeedsReview = needsReview.filter((name) => !baselineNeedsReview.has(name));
const newUnreviewed = unreviewed.filter((name) => !baselineUnreviewed.has(name));
if (needsReview.length > baseline.needs_review_functions.length) errors.push(`needs-review backlog increased from ${baseline.needs_review_functions.length} to ${needsReview.length}: ${newNeedsReview.join(', ') || 'unknown entry'}.`);
if (newNeedsReview.length) errors.push(`New needs-review function(s) are not allowed: ${newNeedsReview.join(', ')}.`);
if (newUnreviewed.length) errors.push(`New unreviewed function(s) are not allowed: ${newUnreviewed.join(', ')}. Set reviewed: true only after a security review.`);
console.log(`Registry: ${Object.keys(registry).length} entries; ${onDisk.length} functions on disk; ${needsReview.length}/${baseline.needs_review_functions.length} needs-review; ${unreviewed.length}/${baseline.unreviewed_functions.length} unreviewed.`);
if (errors.length) {
  console.error('\nSecurity registry check FAILED:\n');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('Security registry check passed.');
