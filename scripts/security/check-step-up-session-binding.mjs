import { readFileSync } from 'node:fs';

const stepUp = readFileSync('supabase/functions/_shared/stepUp.ts', 'utf8');
const issuer = readFileSync('supabase/functions/security-step-up/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260724020000_bind_step_up_sessions_to_staff_sessions.sql', 'utf8');
const required = [
  [stepUp, 'resolveActiveStaffSession'],
  [stepUp, 'hashSessionToken(token)'],
  [stepUp, 'isSessionHashConfigured()'],
  [stepUp, 'eq("portal_scope", "staff")'],
  [stepUp, 'bound_session_id !== staffSession.id'],
  [issuer, 'bound_session_id: staffSession.id'],
  [issuer, 'staff_session_required'],
  [migration, 'REFERENCES public.user_sessions(id) ON DELETE CASCADE'],
  [migration, 'enforce_step_up_session_owner'],
];
for (const [source, needle] of required) {
  if (!source.includes(needle)) throw new Error(`Missing step-up session-binding invariant: ${needle}`);
}
console.log('Step-up proofs are bound to verified staff sessions.');
