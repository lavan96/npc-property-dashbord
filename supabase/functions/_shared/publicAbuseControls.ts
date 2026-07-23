/**
 * WP-10 — Shared abuse-control helpers for public / paid-provider edge functions.
 *
 * Provides:
 *   - `verifyTurnstile(token, ip)`  Cloudflare Turnstile verification, fail-closed
 *                                   when REQUIRE_TURNSTILE=true.
 *   - `enforceIpQuota` / `enforceActorQuota` / `enforceKeyQuota`   in-memory
 *                                   sliding-window counters keyed per instance.
 *   - `enforceGlobalCircuitBreaker` last-N-failure trip for paid providers.
 *   - `reserveUsage/commit/release` optimistic atomic global counters.
 *   - `killSwitchActive(name)`      env-flag gate.
 *   - `getClientIp(req)`            normalized IP extractor.
 *   - `sanitizeShortText(s, max)`   control-char stripper w/ length cap.
 *   - `fetchWithTimeout(url, opts, ms)` bounded upstream fetch.
 *   - `hashToken(token)`            SHA-256 hex for tracking-token equality.
 *   - `redactError(e)`              user-safe error message.
 *
 * NOTE: The in-memory limiters are per edge-function instance. For strict
 * global caps in production, WP-08 already documents the need for a
 * DB-backed layer; this helper leaves clear extension points but does not
 * add a new table.
 */

interface WindowState { count: number; resetAt: number }
const _windows = new Map<string, WindowState>();
const _breaker = new Map<string, { failures: number; openedAt: number }>();

function bump(key: string, windowMs: number, limit: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const w = _windows.get(key);
  if (!w || w.resetAt <= now) {
    _windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (w.count >= limit) {
    return { ok: false, retryAfterMs: w.resetAt - now };
  }
  w.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

export function enforceIpQuota(ip: string | null, scope: string, opts: { limit: number; windowMs: number }): { ok: boolean; retryAfterMs: number } {
  if (!ip) return bump(`ip:unknown:${scope}`, opts.windowMs, opts.limit);
  return bump(`ip:${ip}:${scope}`, opts.windowMs, opts.limit);
}

export function enforceActorQuota(actorId: string, scope: string, opts: { limit: number; windowMs: number }): { ok: boolean; retryAfterMs: number } {
  return bump(`actor:${actorId}:${scope}`, opts.windowMs, opts.limit);
}

export function enforceKeyQuota(key: string, scope: string, opts: { limit: number; windowMs: number }): { ok: boolean; retryAfterMs: number } {
  return bump(`key:${key}:${scope}`, opts.windowMs, opts.limit);
}

export function enforceGlobalDailyQuota(scope: string, limit: number): { ok: boolean; retryAfterMs: number } {
  return bump(`global:${scope}:daily`, 24 * 60 * 60 * 1000, limit);
}

// ---------------------------------------------------------------- Circuit breaker
export function enforceGlobalCircuitBreaker(scope: string, opts: { failureThreshold: number; openMs: number }): { ok: boolean; reason?: string } {
  const now = Date.now();
  const s = _breaker.get(scope);
  if (!s) return { ok: true };
  if (s.openedAt + opts.openMs < now) {
    _breaker.delete(scope);
    return { ok: true };
  }
  if (s.failures >= opts.failureThreshold) {
    return { ok: false, reason: 'circuit_open' };
  }
  return { ok: true };
}

export function recordProviderFailure(scope: string, opts: { failureThreshold: number; openMs: number }): void {
  const s = _breaker.get(scope) ?? { failures: 0, openedAt: Date.now() };
  s.failures += 1;
  if (s.failures >= opts.failureThreshold) s.openedAt = Date.now();
  _breaker.set(scope, s);
}

export function recordProviderSuccess(scope: string): void {
  _breaker.delete(scope);
}

// ---------------------------------------------------------------- Usage reserve/commit
const _reservations = new Map<string, number>();
export function reserveUsage(scope: string, dailyLimit: number, amount = 1): { ok: boolean; remaining: number } {
  const key = `reserve:${scope}:${new Date().toISOString().slice(0, 10)}`;
  const current = _reservations.get(key) ?? 0;
  if (current + amount > dailyLimit) return { ok: false, remaining: Math.max(0, dailyLimit - current) };
  _reservations.set(key, current + amount);
  return { ok: true, remaining: dailyLimit - (current + amount) };
}
export function releaseUsage(scope: string, amount = 1): void {
  const key = `reserve:${scope}:${new Date().toISOString().slice(0, 10)}`;
  const current = _reservations.get(key) ?? 0;
  _reservations.set(key, Math.max(0, current - amount));
}
export function commitUsage(_scope: string, _amount = 1): void { /* reservation is already deducted */ }

// ---------------------------------------------------------------- Env / flags
export function killSwitchActive(name: string): boolean {
  const v = Deno.env.get(name);
  return v === '1' || v === 'true' || v === 'TRUE';
}

// ---------------------------------------------------------------- Request helpers
export function getClientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
export function sanitizeShortText(s: unknown, max = 200): string {
  const v = typeof s === 'string' ? s : '';
  return v.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function redactError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  // Never expose provider/db internals to public callers.
  if (!msg) return 'internal_error';
  if (/service_role|supabase|postgres|jwt|bearer|secret|api[_-]?key|token/i.test(msg)) return 'internal_error';
  return msg.slice(0, 200);
}

// ---------------------------------------------------------------- Turnstile
export interface TurnstileResult { ok: boolean; failClosed: boolean; reason?: string }

export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<TurnstileResult> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  const required = Deno.env.get('REQUIRE_TURNSTILE') === 'true';

  if (!secret) {
    if (required) return { ok: false, failClosed: true, reason: 'turnstile_unavailable' };
    return { ok: true, failClosed: false };
  }
  if (!token) return { ok: false, failClosed: required, reason: 'turnstile_missing' };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetchWithTimeout(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
      5000,
    );
    const data = await res.json().catch(() => ({}));
    if (data?.success) return { ok: true, failClosed: false };
    return { ok: false, failClosed: required, reason: 'turnstile_failed' };
  } catch (_e) {
    return { ok: false, failClosed: required, reason: 'turnstile_error' };
  }
}

// ---------------------------------------------------------------- Honeypot + timing
export function honeypotTripped(body: Record<string, unknown>, fields: string[] = ['website', 'company_url', 'hp']): boolean {
  return fields.some((f) => {
    const v = body[f];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

/** Minimum form-fill time — client sends `form_started_at` (unix ms). */
export function tooFastSubmission(body: Record<string, unknown>, minMs = 1200): boolean {
  const started = Number(body.form_started_at);
  if (!Number.isFinite(started) || started <= 0) return false;
  const elapsed = Date.now() - started;
  return elapsed >= 0 && elapsed < minMs;
}

export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const [local, domain] = e.split('@');
  if (!local || !domain) return e;
  // strip +tag and (for gmail) dots — reduces trivial duplicate captures
  let normLocal = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') normLocal = normLocal.replace(/\./g, '');
  return `${normLocal}@${domain}`;
}
