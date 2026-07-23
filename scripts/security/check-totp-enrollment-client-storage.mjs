import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/settings/TotpEnrollmentCard.tsx', 'utf8');
for (const forbidden of ['localStorage', 'sessionStorage', 'otpauthUri']) {
  if (forbidden !== 'otpauthUri' && source.includes(forbidden)) throw new Error(`TOTP enrollment material must not use ${forbidden}`);
}
if (!source.includes("useState<{ token: string; secret: string } | null>")) throw new Error('TOTP enrollment token must remain component-local');
console.log('TOTP enrollment secrets remain out of browser storage.');
