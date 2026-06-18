/**
 * Pending / Insufficient-Information Field Display
 * ---------------------------------------------------------------------------
 * Used by every Commercial & Industrial calculator surface to ensure we never
 * fabricate certainty when property data is minimal.
 *
 * Rules (enforced here):
 *   - Never render `$0`, `N/A`, `NaN`, `undefined`, or hardcoded placeholders
 *     for unknown values.
 *   - Never tag an unverified value as `verified`.
 *   - When a value is missing AND no reasonable basis exists, show the exact
 *     `INSUFFICIENT_INFORMATION_COPY` message.
 *   - When a value is missing but estimable, show `PENDING_COPY`.
 */

import {
  useMasterAssumptionStore,
  type AssumptionValue,
  type CalculatorTabKey,
  type MasterAssumptionRecord,
} from './masterPropertyAssumptionStore';

// Exact user-facing copy required by spec — do not edit without product approval.
export const INSUFFICIENT_INFORMATION_COPY =
  'Insufficient information to estimate this field. Please add property details, lease information, contract data or market evidence.';

export const PENDING_COPY = 'Pending — awaiting property, lease, contract or market evidence.';

export type DisplayState =
  | { state: 'value'; display: string }
  | { state: 'pending'; display: string }
  | { state: 'insufficient'; display: string };

const NUMERIC_BLOCKLIST_STRINGS = new Set(['NaN', 'null', 'undefined', 'Infinity', '-Infinity']);

/** True if the value should be treated as "no data" (never rendered as a number). */
export function isBlankValue(value: AssumptionValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || NUMERIC_BLOCKLIST_STRINGS.has(trimmed) || trimmed.toLowerCase() === 'n/a') {
      return true;
    }
    return false;
  }
  if (typeof value === 'number') return !Number.isFinite(value);
  return false;
}

export interface FormatOptions {
  unit?: 'percent' | 'aud' | 'aud_per_sqm' | 'sqm' | 'months' | 'ratio' | 'text' | null;
  /** Set true if a real-money $0 is meaningful (e.g. waived fee). Default false. */
  allowZero?: boolean;
  /** When no value, return 'insufficient' instead of 'pending'. */
  basisAvailable?: boolean;
}

/**
 * Format an assumption value for display. Refuses to emit any blocked string
 * (`$0`, `N/A`, `NaN`, `undefined`) and routes blank/unknown values to the
 * Pending or Insufficient-Information state.
 */
export function formatAssumptionDisplay(
  value: AssumptionValue | undefined,
  options: FormatOptions = {},
): DisplayState {
  const { unit, allowZero = false, basisAvailable = true } = options;

  if (isBlankValue(value)) {
    return basisAvailable
      ? { state: 'pending', display: PENDING_COPY }
      : { state: 'insufficient', display: INSUFFICIENT_INFORMATION_COPY };
  }

  if (typeof value === 'number') {
    if (value === 0 && !allowZero) {
      // A bare zero is treated as "no data" unless the caller explicitly opts in.
      return basisAvailable
        ? { state: 'pending', display: PENDING_COPY }
        : { state: 'insufficient', display: INSUFFICIENT_INFORMATION_COPY };
    }
    switch (unit) {
      case 'percent':
        return { state: 'value', display: `${value}%` };
      case 'aud':
        return {
          state: 'value',
          display: new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: 'AUD',
            maximumFractionDigits: 0,
          }).format(value),
        };
      case 'aud_per_sqm':
        return { state: 'value', display: `$${value.toLocaleString('en-AU')}/m²` };
      case 'sqm':
        return { state: 'value', display: `${value.toLocaleString('en-AU')} m²` };
      case 'months':
        return { state: 'value', display: `${value} mo` };
      case 'ratio':
        return { state: 'value', display: value.toFixed(2) };
      default:
        return { state: 'value', display: value.toLocaleString('en-AU') };
    }
  }

  if (typeof value === 'boolean') return { state: 'value', display: value ? 'Yes' : 'No' };
  return { state: 'value', display: String(value) };
}

/**
 * Read a master-store record and produce a safe display state. Inspects
 * verificationStatus + warning to decide between Pending vs Insufficient.
 */
export function describeMasterAssumption(
  key: string,
  options: FormatOptions = {},
): DisplayState & { record?: MasterAssumptionRecord } {
  const rec = useMasterAssumptionStore.getState().assumptions[key];
  if (!rec) {
    return {
      state: options.basisAvailable === false ? 'insufficient' : 'pending',
      display: options.basisAvailable === false ? INSUFFICIENT_INFORMATION_COPY : PENDING_COPY,
    };
  }
  const basisAvailable =
    options.basisAvailable !== undefined
      ? options.basisAvailable
      : rec.verificationStatus !== 'rejected';
  const display = formatAssumptionDisplay(rec.value, { ...options, basisAvailable });
  return { ...display, record: rec };
}

/**
 * Mark a field as Pending (no value yet, basis may emerge). Verification
 * status is forced to 'pending'; we never elevate to 'verified' here.
 */
export function markFieldPending(
  key: string,
  options: { label?: string; tabDependencies?: CalculatorTabKey[]; note?: string } = {},
): void {
  const store = useMasterAssumptionStore.getState();
  store.setAssumption({
    key,
    value: null,
    source: 'Blank',
    label: options.label,
    confidence: 'unknown',
    verificationStatus: 'pending',
    tabDependencies: options.tabDependencies,
    warningStatus: 'info',
    warningMessage: PENDING_COPY,
    notes: options.note,
  });
}

/**
 * Mark a field as Insufficient — no reasonable basis exists for an estimate
 * (e.g. AI returned null with reason). Keeps verification 'unverified', adds
 * a critical warning that downstream surfaces render via the canned copy.
 */
export function markFieldInsufficient(
  key: string,
  options: { label?: string; tabDependencies?: CalculatorTabKey[]; reason?: string } = {},
): void {
  const store = useMasterAssumptionStore.getState();
  store.setAssumption({
    key,
    value: null,
    source: 'Blank',
    label: options.label,
    confidence: 'unknown',
    verificationStatus: 'unverified',
    tabDependencies: options.tabDependencies,
    warningStatus: 'caution',
    warningMessage: INSUFFICIENT_INFORMATION_COPY,
    notes: options.reason,
  });
}

/** Convenience guard for rendering: emit canned copy or formatted value. */
export function safeRenderAssumption(key: string, options: FormatOptions = {}): string {
  return describeMasterAssumption(key, options).display;
}
