#!/usr/bin/env node
/**
 * WP-15 — Launch-gate aggregator.
 *
 * Runs the local, reproducible checks that WP-15 §22.5 requires *before* any
 * live-environment verification (secrets, SQL, negative tests). Anything that
 * needs the deployed Supabase project lives in docs/security/WP15_*.md and is
 * exercised by the operator.
 *
 * Checks:
 *   1. `needs-review` count in SECURITY_REGISTRY.json must be zero.
 *   2. Every registry entry must be `reviewed:true` with an exposure class
 *      that isn't `needs-review`.
 *   3. `docs/security/live-verification.sql` must exist.
 *   4. `docs/security/WP15_DEPLOYMENT_CHECKLIST.md` must exist.
 *   5. `docs/security/WP15_NEGATIVE_TEST_MATRIX.md` must exist.
 *   6. Remediation tracker must have a WP-15 entry.
 *
 * Fails CI on any violation. Read-only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];

function must(path, label) {
  if (!existsSync(join(root, path))) errors.push(`Missing artefact: ${label} (${path})`);
}

// 1 + 2. Registry cleanliness — WP-14 already guarantees this, we re-check as
// a launch-time invariant so a regression can't slip in without WP-15 noticing.
try {
  const registryPath = join(root, 'supabase/functions-registry/SECURITY_REGISTRY.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const entries = Array.isArray(registry?.functions) ? registry.functions : [];
  const needsReview = entries.filter((e) => e?.exposure_class === 'needs-review');
  const unreviewed  = entries.filter((e) => e?.reviewed !== true);
  if (needsReview.length) errors.push(`SECURITY_REGISTRY has ${needsReview.length} needs-review entries.`);
  if (unreviewed.length)  errors.push(`SECURITY_REGISTRY has ${unreviewed.length} entries with reviewed !== true.`);
} catch (e) {
  errors.push(`Failed to read SECURITY_REGISTRY.json: ${e.message}`);
}

// 3–5. WP-15 artefacts.
must('docs/security/live-verification.sql',           'live verification SQL');
must('docs/security/WP15_DEPLOYMENT_CHECKLIST.md',    'WP-15 deployment checklist');
must('docs/security/WP15_NEGATIVE_TEST_MATRIX.md',    'WP-15 negative-test matrix');

// 6. Tracker entry.
try {
  const tracker = readFileSync(join(root, 'docs/security/CODEX_SECURITY_REMEDIATION_TRACKER.md'), 'utf8');
  if (!/WP-15-DEPLOY-VERIFICATION/.test(tracker)) {
    errors.push('CODEX_SECURITY_REMEDIATION_TRACKER.md is missing the WP-15-DEPLOY-VERIFICATION entry.');
  }
} catch (e) {
  errors.push(`Failed to read remediation tracker: ${e.message}`);
}

if (errors.length) {
  console.error('WP-15 launch gate FAILED:');
  for (const err of errors) console.error(` - ${err}`);
  process.exit(1);
}
console.log('WP-15 launch gate: OK');
