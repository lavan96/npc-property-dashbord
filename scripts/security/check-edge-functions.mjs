#!/usr/bin/env node
/** Type-check every Edge Function and shared module without changing runtime behavior. */
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const functionsDir = join(root, 'supabase', 'functions');
const entries = readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const index = join(functionsDir, entry.name, 'index.ts');
    try { return statSync(index).isFile() ? [index] : []; } catch { return []; }
  }).sort();
const result = spawnSync('deno', ['check', ...entries], { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error(`Edge Function check could not start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
