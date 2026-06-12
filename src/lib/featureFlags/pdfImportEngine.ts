/**
 * Resolve which PDF import engine to use for the current user.
 *
 * Order of precedence:
 *   1. `localStorage.lovable.pdf_import.engine` override (developer escape hatch)
 *   2. URL `?pdfEngine=legacy|docling`
 *   3. `feature_flags` row keyed `pdf_import.engine`:
 *        { default: 'legacy'|'docling',
 *          superadmin: 'legacy'|'docling',
 *          allowlist: string[] (user ids opted-in early) }
 *   4. Fallback: `'legacy'`
 */
import { supabase } from '@/integrations/supabase/client';

export type PdfImportEngine = 'legacy' | 'docling';

const LS_KEY = 'lovable.pdf_import.engine';
const FLAG_KEY = 'pdf_import.engine';

let cached: { value: Record<string, unknown> | null; ts: number } | null = null;
const TTL_MS = 60_000;

function readOverride(): PdfImportEngine | null {
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage?.getItem(LS_KEY) : null;
    if (ls === 'legacy' || ls === 'docling') return ls;
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search).get('pdfEngine');
      if (sp === 'legacy' || sp === 'docling') return sp;
    }
  } catch { /* ignore */ }
  return null;
}

async function fetchFlag(): Promise<Record<string, unknown> | null> {
  const now = Date.now();
  if (cached && now - cached.ts < TTL_MS) return cached.value;
  const { data, error } = await supabase
    .from('feature_flags')
    .select('value')
    .eq('key', FLAG_KEY)
    .maybeSingle();
  const value = error || !data ? null : (data.value as Record<string, unknown>);
  cached = { value, ts: now };
  return value;
}

export async function resolvePdfImportEngine(args: {
  userId?: string | null;
  isSuperadmin?: boolean;
} = {}): Promise<PdfImportEngine> {
  const override = readOverride();
  if (override) return override;
  const flag = await fetchFlag();
  if (!flag) return 'legacy';
  if (args.isSuperadmin && (flag.superadmin === 'legacy' || flag.superadmin === 'docling')) {
    return flag.superadmin as PdfImportEngine;
  }
  const allow = Array.isArray(flag.allowlist) ? (flag.allowlist as string[]) : [];
  if (args.userId && allow.includes(args.userId)) return 'docling';
  return (flag.default === 'docling' ? 'docling' : 'legacy');
}

/** Synchronous quick check from override only — useful for non-async UI. */
export function pdfImportEngineOverride(): PdfImportEngine | null {
  return readOverride();
}

/** Clear cached flag (e.g. after admin toggles it). */
export function invalidatePdfImportEngineCache() {
  cached = null;
}
