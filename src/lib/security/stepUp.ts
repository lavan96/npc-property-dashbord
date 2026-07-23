/**
 * WP-11C — Frontend step-up token store & challenge invoker.
 *
 * Tokens live in sessionStorage under `step_up:<capability>` and are attached
 * to secureInvoke calls that pass a `stepUpCapability` option. Consumers use
 * `ensureStepUp(capability)` which either returns the live token or opens the
 * <StepUpDialog/> to obtain one.
 */
import { invokeSecureFunction } from '@/lib/secureInvoke';

export type StepUpCapability =
  | 'role.change'
  | 'role.remove'
  | 'aml.role.set'
  | 'secrets.update'
  | 'commission.payout.generate'
  | 'commission.payout.mark_paid'
  | 'commission.payout.cancel'
  | 'docusign.send'
  | 'docusign.void'
  | 'storage.destructive'
  | 'mailbox.destructive';

interface Stored { token: string; expires_at: string; }

const KEY = (cap: string) => `step_up:${cap}`;

export function getStepUpToken(capability: string): string | null {
  try {
    const raw = sessionStorage.getItem(KEY(capability));
    if (!raw) return null;
    const p = JSON.parse(raw) as Stored;
    if (!p?.token || !p?.expires_at) return null;
    if (new Date(p.expires_at).getTime() <= Date.now() + 5_000) return null;
    return p.token;
  } catch { return null; }
}

export function storeStepUpToken(capability: string, token: string, expires_at: string) {
  try { sessionStorage.setItem(KEY(capability), JSON.stringify({ token, expires_at })); } catch {}
}

export function clearStepUpToken(capability?: string) {
  try {
    if (capability) sessionStorage.removeItem(KEY(capability));
    else {
      Object.keys(sessionStorage).forEach((k) => k.startsWith('step_up:') && sessionStorage.removeItem(k));
    }
  } catch {}
}

export async function requestStepUpChallenge(
  capability: string,
  password: string,
): Promise<{ ok: true; token: string; expires_at: string } | { ok: false; error: string }> {
  const { data, error } = await invokeSecureFunction<any>('security-step-up', {
    action: 'challenge',
    capability,
    password,
  });
  if (error) return { ok: false, error: error.message ?? 'challenge_failed' };
  if (!data?.success) return { ok: false, error: data?.error ?? 'challenge_failed' };
  storeStepUpToken(capability, data.token, data.expires_at);
  return { ok: true, token: data.token, expires_at: data.expires_at };
}

export async function revokeStepUpSessions(capability?: string) {
  clearStepUpToken(capability);
  await invokeSecureFunction('security-step-up', { action: 'revoke', capability }).catch(() => {});
}
