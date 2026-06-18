/**
 * Global Readiness & Warning System
 * ---------------------------------------------------------------------------
 * Single source of truth for "where is this property in the calculator
 * lifecycle?" and "what should the user do next?".
 *
 * Readiness is derived from:
 *   - active property signals (set by the property injection pipeline)
 *   - Master Property Assumption Store contents
 *   - Report Freshness store
 *   - Pending AI estimate review queue
 *
 * Warnings are produced per category, each carrying a priority (1 = highest),
 * a "next action" string, and a `tab` deep-link. The overview surface shows
 * the top 5; the full list is shown in the Assumption Status panel.
 */

import { create } from 'zustand';
import {
  useMasterAssumptionStore,
  type CalculatorTabKey,
  type MasterAssumptionRecord,
} from './masterPropertyAssumptionStore';
import { useReportFreshnessStore } from './reportFreshnessStore';

// ---------------------------------------------------------------------------
// Readiness statuses + category vocabulary
// ---------------------------------------------------------------------------
export type GlobalReadinessStatus =
  | 'No Property Linked'
  | 'Property Linked'
  | 'Data Extraction Pending'
  | 'AI Estimates Available'
  | 'AI Estimates Pending Review'
  | 'Assumptions Partially Complete'
  | 'Calculators Ready'
  | 'Review Required'
  | 'Report Ready'
  | 'Report Generated'
  | 'Verified';

export type WarningCategory =
  | 'Property Data'
  | 'Income / NOI'
  | 'Valuation / Cap Rate'
  | 'Debt / Lending'
  | 'GST'
  | 'DCF'
  | '10-Year Cash Flow'
  | 'Industrial Metrics'
  | 'Tax'
  | 'AI Estimates'
  | 'Manual Overrides'
  | 'Report Export';

export type WarningSeverity = 'info' | 'caution' | 'critical';

export interface GlobalWarning {
  id: string;
  category: WarningCategory;
  /** 1 = highest priority. Drives default-overview cap of 5. */
  priority: number;
  severity: WarningSeverity;
  title: string;
  /** Short actionable next step shown inline. */
  nextAction: string;
  /** Deep-link target — calculator tab or 'overview'. */
  tab: CalculatorTabKey | 'overview' | 'report';
  /** Optional master-store assumption key for the user to jump straight to. */
  assumptionKey?: string;
}

// ---------------------------------------------------------------------------
// Lifecycle signals (set by upstream surfaces — property header, AI panel, etc.)
// ---------------------------------------------------------------------------
interface GlobalSignalsState {
  hasProperty: boolean;
  /** True while extraction (scrape/contract/lease/PDF) is in flight. */
  extractionInFlight: boolean;
  /** AI estimates have been generated and are waiting for user review. */
  pendingAiReviewCount: number;
  /** AI estimates are available to generate but haven't been requested. */
  aiEstimatesAvailable: boolean;
  /** A final report has been generated for the current property. */
  reportGenerated: boolean;
  /** A final report is ready to generate (all critical inputs in place). */
  reportReady: boolean;

  setSignal: <K extends keyof Omit<GlobalSignalsState, 'setSignal' | 'reset'>>(
    key: K,
    value: GlobalSignalsState[K],
  ) => void;
  reset: () => void;
}

export const useGlobalSignalsStore = create<GlobalSignalsState>((set) => ({
  hasProperty: false,
  extractionInFlight: false,
  pendingAiReviewCount: 0,
  aiEstimatesAvailable: false,
  reportGenerated: false,
  reportReady: false,

  setSignal: (key, value) => set({ [key]: value } as Partial<GlobalSignalsState>),
  reset: () =>
    set({
      hasProperty: false,
      extractionInFlight: false,
      pendingAiReviewCount: 0,
      aiEstimatesAvailable: false,
      reportGenerated: false,
      reportReady: false,
    }),
}));

// ---------------------------------------------------------------------------
// Key → category routing for warnings derived from master store records
// ---------------------------------------------------------------------------
const KEY_CATEGORY_RULES: Array<{ test: RegExp; category: WarningCategory; tab: CalculatorTabKey | 'overview' }> = [
  { test: /^(address|property|valuation|nlaSqm|glaSqm|siteAreaSqm|zoning|yearBuilt)/i, category: 'Property Data', tab: 'overview' },
  { test: /^(lease|noi)\./i, category: 'Income / NOI', tab: 'noi' },
  { test: /^capRate\./i, category: 'Valuation / Cap Rate', tab: 'capRate' },
  { test: /^(borrowing|icrDscr)\./i, category: 'Debt / Lending', tab: 'borrowing' },
  { test: /^gst\./i, category: 'GST', tab: 'gst' },
  { test: /^dcf\./i, category: 'DCF', tab: 'dcf' },
  { test: /^tenYear/i, category: '10-Year Cash Flow', tab: 'tenYearCashFlow' },
  { test: /^industrial\./i, category: 'Industrial Metrics', tab: 'industrialMetrics' },
  { test: /tax/i, category: 'Tax', tab: 'overview' },
];

function routeKey(key: string): { category: WarningCategory; tab: CalculatorTabKey | 'overview' } {
  for (const r of KEY_CATEGORY_RULES) {
    if (r.test.test(key)) return { category: r.category, tab: r.tab };
  }
  return { category: 'Property Data', tab: 'overview' };
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------
export interface ReadinessDerivation {
  status: GlobalReadinessStatus;
  warnings: GlobalWarning[];
  topWarnings: GlobalWarning[];
  groupedWarnings: Record<WarningCategory, GlobalWarning[]>;
  counts: { total: number; critical: number; caution: number; info: number };
}

const MAX_OVERVIEW_WARNINGS = 5;

function deriveStatus(
  signals: GlobalSignalsState,
  assumptions: Record<string, MasterAssumptionRecord>,
  reportsOutOfDate: boolean,
): GlobalReadinessStatus {
  if (!signals.hasProperty) return 'No Property Linked';
  if (signals.extractionInFlight) return 'Data Extraction Pending';
  if (signals.pendingAiReviewCount > 0) return 'AI Estimates Pending Review';

  const records = Object.values(assumptions);
  if (records.length === 0) return 'Property Linked';

  const anyCritical = records.some(r => r.warningStatus === 'critical');
  const anyCaution = records.some(r => r.warningStatus === 'caution');
  const allVerified = records.length > 0 && records.every(r => r.verificationStatus === 'verified');
  const hasBlank = records.some(r => r.value === null || r.value === undefined);

  if (signals.reportGenerated && reportsOutOfDate) return 'Review Required';
  if (signals.reportGenerated) return 'Report Generated';
  if (allVerified && !hasBlank) return 'Verified';
  if (signals.reportReady && !anyCritical) return 'Report Ready';
  if (anyCritical || anyCaution) return 'Review Required';
  if (hasBlank) {
    return signals.aiEstimatesAvailable ? 'AI Estimates Available' : 'Assumptions Partially Complete';
  }
  return 'Calculators Ready';
}

function buildWarnings(
  signals: GlobalSignalsState,
  assumptions: Record<string, MasterAssumptionRecord>,
  reportsOutOfDate: boolean,
): GlobalWarning[] {
  const out: GlobalWarning[] = [];

  // Lifecycle warnings
  if (!signals.hasProperty) {
    out.push({
      id: 'lifecycle.noProperty',
      category: 'Property Data',
      priority: 1,
      severity: 'critical',
      title: 'No property linked',
      nextAction: 'Use "Add property to Calculators" to inject a property.',
      tab: 'overview',
    });
  }
  if (signals.extractionInFlight) {
    out.push({
      id: 'lifecycle.extraction',
      category: 'Property Data',
      priority: 2,
      severity: 'info',
      title: 'Data extraction in progress',
      nextAction: 'Wait for extraction to finish, then review the inputs.',
      tab: 'overview',
    });
  }
  if (signals.pendingAiReviewCount > 0) {
    out.push({
      id: 'lifecycle.aiPending',
      category: 'AI Estimates',
      priority: 2,
      severity: 'caution',
      title: `${signals.pendingAiReviewCount} AI estimate${signals.pendingAiReviewCount === 1 ? '' : 's'} awaiting review`,
      nextAction: 'Open the AI Estimate Review Panel to accept, edit or reject.',
      tab: 'overview',
    });
  }
  if (signals.reportGenerated && reportsOutOfDate) {
    out.push({
      id: 'lifecycle.reportStale',
      category: 'Report Export',
      priority: 1,
      severity: 'critical',
      title: 'Generated report is out of date',
      nextAction: 'Re-generate the client report to capture the latest assumptions.',
      tab: 'report',
    });
  }

  // Per-assumption warnings sourced from master store
  for (const rec of Object.values(assumptions)) {
    if (rec.warningStatus === 'none') continue;
    const { category, tab } = routeKey(rec.key);
    const severity: WarningSeverity =
      rec.warningStatus === 'critical' ? 'critical'
      : rec.warningStatus === 'caution' ? 'caution'
      : 'info';
    const overrideCategory: WarningCategory =
      rec.source === 'AI Estimate' ? 'AI Estimates'
      : rec.source === 'User Override' || rec.source === 'Manual' ? 'Manual Overrides'
      : category;
    out.push({
      id: `assumption.${rec.key}`,
      category: overrideCategory,
      priority: severity === 'critical' ? 2 : severity === 'caution' ? 3 : 4,
      severity,
      title: `${rec.label ?? rec.key}: ${rec.warningMessage ?? 'Needs attention'}`,
      nextAction:
        rec.source === 'AI Estimate'
          ? 'Verify against contract, lease, valuation or comparable evidence.'
          : rec.source === 'User Override'
          ? 'Confirm override is intentional; document the rationale.'
          : 'Open the source tab and supply or verify the value.',
      tab,
      assumptionKey: rec.key,
    });
  }

  // Sort: priority asc, then critical > caution > info
  const sevRank: Record<WarningSeverity, number> = { critical: 0, caution: 1, info: 2 };
  out.sort((a, b) => a.priority - b.priority || sevRank[a.severity] - sevRank[b.severity]);

  return out;
}

const EMPTY_GROUP = (): Record<WarningCategory, GlobalWarning[]> => ({
  'Property Data': [],
  'Income / NOI': [],
  'Valuation / Cap Rate': [],
  'Debt / Lending': [],
  GST: [],
  DCF: [],
  '10-Year Cash Flow': [],
  'Industrial Metrics': [],
  Tax: [],
  'AI Estimates': [],
  'Manual Overrides': [],
  'Report Export': [],
});

/** Pure derivation — usable in selectors, tests, edge functions. */
export function deriveGlobalReadiness(
  signals: GlobalSignalsState,
  assumptions: Record<string, MasterAssumptionRecord>,
  reportsOutOfDate: boolean,
): ReadinessDerivation {
  const status = deriveStatus(signals, assumptions, reportsOutOfDate);
  const warnings = buildWarnings(signals, assumptions, reportsOutOfDate);
  const grouped = EMPTY_GROUP();
  for (const w of warnings) grouped[w.category].push(w);
  const counts = {
    total: warnings.length,
    critical: warnings.filter(w => w.severity === 'critical').length,
    caution: warnings.filter(w => w.severity === 'caution').length,
    info: warnings.filter(w => w.severity === 'info').length,
  };
  return {
    status,
    warnings,
    topWarnings: warnings.slice(0, MAX_OVERVIEW_WARNINGS),
    groupedWarnings: grouped,
    counts,
  };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------
export function useGlobalReadiness(): ReadinessDerivation {
  const signals = useGlobalSignalsStore();
  const assumptions = useMasterAssumptionStore(s => s.assumptions);
  const reportsOutOfDate = useReportFreshnessStore(s => s.reportsOutOfDate);
  return deriveGlobalReadiness(signals, assumptions, reportsOutOfDate);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
export const READINESS_TONE: Record<GlobalReadinessStatus, 'neutral' | 'info' | 'warning' | 'success' | 'critical'> = {
  'No Property Linked': 'neutral',
  'Property Linked': 'info',
  'Data Extraction Pending': 'info',
  'AI Estimates Available': 'info',
  'AI Estimates Pending Review': 'warning',
  'Assumptions Partially Complete': 'warning',
  'Calculators Ready': 'success',
  'Review Required': 'critical',
  'Report Ready': 'success',
  'Report Generated': 'success',
  Verified: 'success',
};

export const SEVERITY_BADGE_CLASS: Record<WarningSeverity, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/40',
  caution: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
  info: 'bg-sky-500/10 text-sky-300 border-sky-500/40',
};

export const READINESS_BADGE_CLASS: Record<GlobalReadinessStatus, string> = {
  'No Property Linked': 'bg-slate-500/10 text-slate-300 border-slate-500/40',
  'Property Linked': 'bg-sky-500/10 text-sky-300 border-sky-500/40',
  'Data Extraction Pending': 'bg-sky-500/10 text-sky-300 border-sky-500/40',
  'AI Estimates Available': 'bg-sky-500/10 text-sky-300 border-sky-500/40',
  'AI Estimates Pending Review': 'bg-amber-500/10 text-amber-300 border-amber-500/40',
  'Assumptions Partially Complete': 'bg-amber-500/10 text-amber-300 border-amber-500/40',
  'Calculators Ready': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  'Review Required': 'bg-destructive/10 text-destructive border-destructive/40',
  'Report Ready': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  'Report Generated': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  Verified: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/50',
};
