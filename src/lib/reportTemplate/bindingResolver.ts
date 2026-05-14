/**
 * Binding & token resolution for report templates.
 *
 * Supports:
 *   "literal value"                          → returned as-is
 *   "token:primary"                          → tokens.colors.primary or tokens.fonts.primary etc.
 *   "{{property.address}}"                   → data.property.address
 *   "{{financials.weeklyRent | currency}}"   → with filter
 *   "Hello {{name}}, you owe {{amt | currency}}" → mixed
 *
 * Conditional expressions (`block.conditional`, `page.conditional`) are
 * evaluated via a tiny safe-ish expression evaluator: only a small allow-list
 * of operators is supported. NEVER pass user input to this function unsanitised.
 */
import type { Tokens } from './templateSchema';

export interface ResolveContext {
  data: Record<string, any>;
  tokens: Tokens;
}

// ─── Filters ──────────────────────────────────────────────────────────────────
type Filter = (value: any, ...args: string[]) => string;

const FILTERS: Record<string, Filter> = {
  currency: (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? '');
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
  },
  number: (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? '');
    return new Intl.NumberFormat('en-AU').format(n);
  },
  percent: (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? '');
    return `${n.toFixed(2)}%`;
  },
  date: (v) => {
    if (!v) return '';
    const d = new Date(v as any);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  upper: (v) => String(v ?? '').toUpperCase(),
  lower: (v) => String(v ?? '').toLowerCase(),
  default: (v, fallback) => (v === null || v === undefined || v === '' ? (fallback ?? '') : String(v)),
};

// ─── Path access ──────────────────────────────────────────────────────────────
function getByPath(obj: any, path: string): any {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key.trim()]), obj);
}

// ─── Bindable string resolution ───────────────────────────────────────────────
const BINDING_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function resolveBindable(input: unknown, ctx: ResolveContext): string {
  if (input == null) return '';
  const s = String(input);

  // token:xxx → look up in tokens (colors > fonts > spacing)
  if (s.startsWith('token:')) {
    const key = s.slice(6);
    return (
      ctx.tokens.colors[key] ??
      ctx.tokens.fonts[key] ??
      (ctx.tokens.spacing[key] != null ? String(ctx.tokens.spacing[key]) : s)
    );
  }

  // Mustache-style interpolation
  if (!s.includes('{{')) return s;

  return s.replace(BINDING_RE, (_match, expr: string) => {
    const [pathPart, ...filterParts] = expr.split('|').map((p) => p.trim());
    let value: any = getByPath(ctx.data, pathPart);
    for (const f of filterParts) {
      const [name, ...args] = f.split(':').map((p) => p.trim());
      const fn = FILTERS[name];
      if (fn) value = fn(value, ...args);
    }
    return value == null ? '' : String(value);
  });
}

/** Resolve a numeric bindable (font sizes, etc.). */
export function resolveBindableNumber(input: unknown, ctx: ResolveContext, fallback = 0): number {
  if (typeof input === 'number') return input;
  const resolved = resolveBindable(input, ctx);
  const n = Number(resolved);
  return Number.isFinite(n) ? n : fallback;
}

/** Resolve a colour, returning a normalised hex. */
export function resolveBindableColor(input: unknown, ctx: ResolveContext, fallback = '#000000'): string {
  const v = resolveBindable(input, ctx);
  if (!v) return fallback;
  if (v.startsWith('#')) return v;
  // already token-resolved by resolveBindable; if it doesn't look like a colour, return fallback
  return /^#?[0-9a-fA-F]{3,8}$/.test(v) ? (v.startsWith('#') ? v : `#${v}`) : fallback;
}

// ─── Conditional expressions ──────────────────────────────────────────────────
// VERY small evaluator. Allowed: identifiers, dot access, ===, !==, ==, !=, >, <, >=, <=, &&, ||, !, parens, numbers, strings.
// No function calls, no template strings, no statements.
const SAFE_EXPR = /^[\s\w.'"=!<>&|()+\-*/%?:,]*$/;

export function evalConditional(expr: string | undefined, ctx: ResolveContext): boolean {
  if (!expr) return true;
  if (!SAFE_EXPR.test(expr)) {
    console.warn('[conditional] Rejected unsafe expression:', expr);
    return false;
  }
  try {
    // Build a sandboxed function whose only scope is `data` + `tokens`.
    // eslint-disable-next-line no-new-func
    const fn = new Function('data', 'tokens', `"use strict"; with (data) { return (${expr}); }`);
    return Boolean(fn(ctx.data, ctx.tokens));
  } catch (e) {
    console.warn('[conditional] Eval failed:', expr, e);
    return false;
  }
}
