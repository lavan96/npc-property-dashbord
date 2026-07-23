import { readFileSync } from 'node:fs';

const storage = readFileSync('supabase/functions/secure-storage/index.ts', 'utf8');
const authz = readFileSync('supabase/functions/_shared/storageAuthz.ts', 'utf8');
const failures = [];

for (const bucket of ['investment-reports', 'quantitative-reports', 'qa_exports', 'branding-assets']) {
  const row = storage.match(new RegExp(`'${bucket}':\\s*\\{([^}]+)\\}`));
  if (!row?.[1].includes('permissionTable:')) failures.push(`${bucket} lacks explicit mutation permission table`);
}
for (const required of [
  'if (upsert === true) return createForbiddenResponse',
  'uploadPath = `${uploadBinding.clientId || uploadBinding.ownerUserId || actorId}/${crypto.randomUUID()}',
  'resource_type: isInternal',
  'upsert: isInternal ? upsert === true : false',
]) if (!storage.includes(required)) failures.push(`missing human upload control: ${required}`);
if (/LEGACY_FALLBACK_BUCKETS = new Set<string>\(\[\s*['"]/.test(authz)) failures.push('sensitive legacy fallback buckets remain enabled');
if (!authz.includes(".insert(\n      {")) failures.push('binding creation is not immutable insert-only');
if (failures.length) { console.error(`Storage upload hardening FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('Storage upload hardening check passed.');
