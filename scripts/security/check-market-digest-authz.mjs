import { readFileSync } from 'node:fs';
const source = readFileSync('supabase/functions/market-updates-digest/index.ts', 'utf8');
const failures = [];
for (const required of [
  "requireModulePermission(sb, { userId: auth.userId, authMethod: auth.authMethod }, 'market_updates', 'can_edit')",
  'consumeRateLimit(sb, `market-digest:user:${interactiveUserId}`',
  "consumeRateLimit(sb, 'market-digest:global'",
  ".eq('period', period).eq('period_start', start.toISOString()).maybeSingle()",
  'if (existingDigest) return json',
]) if (!source.includes(required)) failures.push(`missing digest control: ${required}`);
const provider = source.indexOf('ai = await synthesizeWithAI(period');
const idempotency = source.indexOf('if (existingDigest) return json');
if (idempotency < 0 || provider < 0 || idempotency > provider) failures.push('idempotency check does not precede provider call');
if (failures.length) { console.error(`Market digest authorization FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('Market digest authorization check passed.');
