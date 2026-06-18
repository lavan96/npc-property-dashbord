/**
 * Master Property Assumption Store
 * -----------------------------------------------------------------------------
 * Single source of truth for every assumption used by Commercial & Industrial
 * calculator tabs (NOI, Cap Rate, ICR/DSCR, GST, Borrowing Capacity, DCF,
 * 10-Year Cash Flow, Industrial Metrics, Overview).
 *
 * All calculator tabs MUST read from this store first before relying on local
 * tab state. Writes are tracked with full provenance for audit + report use.
 */

import { create } from 'zustand';

// -----------------------------------------------------------------------------
// Source / confidence / verification taxonomy
// -----------------------------------------------------------------------------

export type AssumptionSource =
  | 'Blank'
  | 'Property Profile'
  | 'Scraped'
  | 'Contract Extracted'
  | 'Lease Extracted'
  | 'Research Engine'
  | 'AI Estimate'
  | 'Manual'
  | 'User Override'
  | 'Verified'
  | 'NOI Tab'
  | 'Cap Rate Tab'
  | 'GST Tab'
  | 'ICR / DSCR Tab'
  | 'Borrowing Capacity'
  | 'DCF Tab'
  | '10-Year Cash Flow'
  | 'Industrial Metrics';

export type AssumptionConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'documentRequested'
  | 'documentReceived'
  | 'verified'
  | 'rejected';

export type WarningStatus = 'none' | 'info' | 'caution' | 'critical';

export type CalculatorTabKey =
  | 'overview'
  | 'noi'
  | 'capRate'
  | 'icrDscr'
  | 'gst'
  | 'borrowing'
  | 'dcf'
  | 'tenYearCashFlow'
  | 'industrialMetrics';

export type AssumptionValue = number | string | boolean | null;

// -----------------------------------------------------------------------------
// Record shape
// -----------------------------------------------------------------------------

export interface MasterAssumptionRecord<V extends AssumptionValue = AssumptionValue> {
  /** Stable dotted key e.g. `lease.netRentPa`, `valuation.purchasePrice` */
  key: string;
  /** Human label for surfaces / PDF */
  label?: string;
  /** Effective value used by downstream calculators */
  value: V;
  /** Where the effective value came from */
  source: AssumptionSource;
  /** Confidence in the effective value */
  confidence: AssumptionConfidence;
  /** Verification lifecycle */
  verificationStatus: VerificationStatus;
  /** First-known value (e.g. scraped / contract extracted) - never mutated after seeding */
  originalSourceValue: V | null;
  /** Latest manual user override value, if any */
  userOverrideValue: V | null;
  /** Latest AI estimate the user explicitly accepted, if any */
  acceptedAiEstimateValue: V | null;
  /** Which calculator tabs consume this assumption */
  tabDependencies: CalculatorTabKey[];
  /** ISO timestamp of last write */
  lastUpdated: string;
  /** Monotonic version - incremented on every write */
  calculationVersion: number;
  /** Warning gate for downstream rendering */
  warningStatus: WarningStatus;
  /** Optional message paired with warning / verification */
  warningMessage?: string;
  /** Document(s) required to move to `verified` */
  requiredDocuments?: string[];
  /** Free-form notes for audit */
  notes?: string;
}

// -----------------------------------------------------------------------------
// Write payloads
// -----------------------------------------------------------------------------

export interface SetAssumptionInput<V extends AssumptionValue = AssumptionValue> {
  key: string;
  value: V;
  source: AssumptionSource;
  label?: string;
  confidence?: AssumptionConfidence;
  verificationStatus?: VerificationStatus;
  tabDependencies?: CalculatorTabKey[];
  warningStatus?: WarningStatus;
  warningMessage?: string;
  requiredDocuments?: string[];
  notes?: string;
}

export interface AcceptAiEstimateInput<V extends AssumptionValue = AssumptionValue> {
  key: string;
  estimatedValue: V;
  confidence?: AssumptionConfidence;
  label?: string;
  tabDependencies?: CalculatorTabKey[];
  requiredDocuments?: string[];
  notes?: string;
}

export interface UserOverrideInput<V extends AssumptionValue = AssumptionValue> {
  key: string;
  value: V;
  label?: string;
  tabDependencies?: CalculatorTabKey[];
  notes?: string;
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

interface MasterAssumptionStoreState {
  assumptions: Record<string, MasterAssumptionRecord>;

  /** Read effective value (or fallback if missing) */
  getValue: <V extends AssumptionValue = AssumptionValue>(key: string, fallback?: V) => V | null;
  /** Read the full record */
  getRecord: <V extends AssumptionValue = AssumptionValue>(key: string) => MasterAssumptionRecord<V> | undefined;
  /** Read every assumption a given tab depends on */
  getByTab: (tab: CalculatorTabKey) => MasterAssumptionRecord[];

  /** Generic write (seeds originalSourceValue on first write) */
  setAssumption: <V extends AssumptionValue = AssumptionValue>(input: SetAssumptionInput<V>) => void;
  /** Convenience: accept an AI estimate as effective value (source = 'AI Estimate') */
  acceptAiEstimate: <V extends AssumptionValue = AssumptionValue>(input: AcceptAiEstimateInput<V>) => void;
  /** Convenience: user override (source = 'User Override', confidence = medium) */
  applyUserOverride: <V extends AssumptionValue = AssumptionValue>(input: UserOverrideInput<V>) => void;
  /** Mark verified (clears warning, locks confidence high) */
  markVerified: (key: string, notes?: string) => void;
  /** Update verification lifecycle without changing value */
  setVerificationStatus: (key: string, status: VerificationStatus, notes?: string) => void;
  /** Update warning state without changing value */
  setWarning: (key: string, status: WarningStatus, message?: string) => void;
  /** Reset a single assumption */
  clearAssumption: (key: string) => void;
  /** Reset the entire store (e.g. switching properties) */
  resetStore: () => void;
}

const nowIso = () => new Date().toISOString();

const TAB_SOURCE_LOOKUP: Record<string, CalculatorTabKey> = {
  'NOI Tab': 'noi',
  'Cap Rate Tab': 'capRate',
  'GST Tab': 'gst',
  'ICR / DSCR Tab': 'icrDscr',
  'Borrowing Capacity': 'borrowing',
  'DCF Tab': 'dcf',
  '10-Year Cash Flow': 'tenYearCashFlow',
  'Industrial Metrics': 'industrialMetrics',
};

function inferConfidence(source: AssumptionSource, explicit?: AssumptionConfidence): AssumptionConfidence {
  if (explicit) return explicit;
  switch (source) {
    case 'Verified':
    case 'Contract Extracted':
    case 'Lease Extracted':
      return 'high';
    case 'Property Profile':
    case 'Research Engine':
    case 'Scraped':
    case 'User Override':
    case 'Manual':
      return 'medium';
    case 'AI Estimate':
      return 'low';
    case 'Blank':
      return 'unknown';
    default:
      return 'medium';
  }
}

function inferVerification(source: AssumptionSource, explicit?: VerificationStatus): VerificationStatus {
  if (explicit) return explicit;
  if (source === 'Verified') return 'verified';
  if (source === 'Blank') return 'unverified';
  return 'unverified';
}

export const useMasterAssumptionStore = create<MasterAssumptionStoreState>((set, get) => ({
  assumptions: {},

  getValue: (key, fallback) => {
    const rec = get().assumptions[key];
    if (!rec) return (fallback ?? null) as never;
    return rec.value as never;
  },

  getRecord: (key) => get().assumptions[key] as never,

  getByTab: (tab) =>
    Object.values(get().assumptions).filter((rec) => rec.tabDependencies.includes(tab)),

  setAssumption: (input) =>
    set((state) => {
      const prev = state.assumptions[input.key];
      const inferredTabFromSource = TAB_SOURCE_LOOKUP[input.source];
      const mergedTabs = Array.from(
        new Set([
          ...(prev?.tabDependencies ?? []),
          ...(input.tabDependencies ?? []),
          ...(inferredTabFromSource ? [inferredTabFromSource] : []),
        ]),
      );

      const record: MasterAssumptionRecord = {
        key: input.key,
        label: input.label ?? prev?.label,
        value: input.value,
        source: input.source,
        confidence: inferConfidence(input.source, input.confidence),
        verificationStatus: inferVerification(input.source, input.verificationStatus),
        originalSourceValue: prev?.originalSourceValue ?? input.value,
        userOverrideValue:
          input.source === 'User Override' || input.source === 'Manual'
            ? input.value
            : prev?.userOverrideValue ?? null,
        acceptedAiEstimateValue:
          input.source === 'AI Estimate' ? input.value : prev?.acceptedAiEstimateValue ?? null,
        tabDependencies: mergedTabs,
        lastUpdated: nowIso(),
        calculationVersion: (prev?.calculationVersion ?? 0) + 1,
        warningStatus: input.warningStatus ?? prev?.warningStatus ?? 'none',
        warningMessage: input.warningMessage ?? prev?.warningMessage,
        requiredDocuments: input.requiredDocuments ?? prev?.requiredDocuments,
        notes: input.notes ?? prev?.notes,
      };

      return { assumptions: { ...state.assumptions, [input.key]: record } };
    }),

  acceptAiEstimate: (input) =>
    get().setAssumption({
      key: input.key,
      value: input.estimatedValue,
      source: 'AI Estimate',
      label: input.label,
      confidence: input.confidence ?? 'low',
      verificationStatus: 'pending',
      tabDependencies: input.tabDependencies,
      warningStatus: 'caution',
      warningMessage: 'AI estimate accepted — verification required before final use.',
      requiredDocuments: input.requiredDocuments,
      notes: input.notes,
    }),

  applyUserOverride: (input) =>
    get().setAssumption({
      key: input.key,
      value: input.value,
      source: 'User Override',
      label: input.label,
      confidence: 'medium',
      verificationStatus: 'unverified',
      tabDependencies: input.tabDependencies,
      warningStatus: 'info',
      warningMessage: 'Manual override — original source value retained for audit.',
      notes: input.notes,
    }),

  markVerified: (key, notes) =>
    set((state) => {
      const prev = state.assumptions[key];
      if (!prev) return state;
      const record: MasterAssumptionRecord = {
        ...prev,
        source: 'Verified',
        confidence: 'high',
        verificationStatus: 'verified',
        warningStatus: 'none',
        warningMessage: undefined,
        lastUpdated: nowIso(),
        calculationVersion: prev.calculationVersion + 1,
        notes: notes ?? prev.notes,
      };
      return { assumptions: { ...state.assumptions, [key]: record } };
    }),

  setVerificationStatus: (key, status, notes) =>
    set((state) => {
      const prev = state.assumptions[key];
      if (!prev) return state;
      return {
        assumptions: {
          ...state.assumptions,
          [key]: {
            ...prev,
            verificationStatus: status,
            notes: notes ?? prev.notes,
            lastUpdated: nowIso(),
            calculationVersion: prev.calculationVersion + 1,
          },
        },
      };
    }),

  setWarning: (key, status, message) =>
    set((state) => {
      const prev = state.assumptions[key];
      if (!prev) return state;
      return {
        assumptions: {
          ...state.assumptions,
          [key]: {
            ...prev,
            warningStatus: status,
            warningMessage: message,
            lastUpdated: nowIso(),
            calculationVersion: prev.calculationVersion + 1,
          },
        },
      };
    }),

  clearAssumption: (key) =>
    set((state) => {
      const next = { ...state.assumptions };
      delete next[key];
      return { assumptions: next };
    }),

  resetStore: () => set({ assumptions: {} }),
}));

// -----------------------------------------------------------------------------
// Hook helper: tab-scoped reader
// -----------------------------------------------------------------------------

/**
 * Read an assumption from the master store with an optional local fallback.
 * Tabs should ALWAYS call this before reading their own local state.
 *
 * Example:
 *   const netRent = readMasterAssumption('lease.netRentPa', localState.netRent);
 */
export function readMasterAssumption<V extends AssumptionValue = AssumptionValue>(
  key: string,
  fallback?: V,
): V | null {
  const rec = useMasterAssumptionStore.getState().assumptions[key];
  if (!rec || rec.value === null || rec.value === undefined) {
    return (fallback ?? null) as V | null;
  }
  return rec.value as V;
}

/** Convenience accessor for the full record (e.g. to render source badges). */
export function readMasterAssumptionRecord<V extends AssumptionValue = AssumptionValue>(
  key: string,
): MasterAssumptionRecord<V> | undefined {
  return useMasterAssumptionStore.getState().assumptions[key] as MasterAssumptionRecord<V> | undefined;
}
