/**
 * Report Freshness Store
 * ---------------------------------------------------------------------------
 * Tracks which calculator tabs have been updated since the last final report
 * was generated, and whether that report is now out of date.
 *
 * Wired from the AI Estimate Review Panel + Master Assumption Store cascade.
 */
import { create } from 'zustand';
import type { CalculatorTabKey } from './masterPropertyAssumptionStore';

interface ReportFreshnessState {
  lastReportGeneratedAt: string | null;
  reportsOutOfDate: boolean;
  updatedTabs: CalculatorTabKey[];
  /** Reasons surfaced to the user (most recent first) */
  reasons: string[];

  markReportGenerated: () => void;
  markTabsUpdated: (tabs: CalculatorTabKey[], reason?: string) => void;
  reset: () => void;
}

export const useReportFreshnessStore = create<ReportFreshnessState>((set) => ({
  lastReportGeneratedAt: null,
  reportsOutOfDate: false,
  updatedTabs: [],
  reasons: [],

  markReportGenerated: () =>
    set({
      lastReportGeneratedAt: new Date().toISOString(),
      reportsOutOfDate: false,
      updatedTabs: [],
      reasons: [],
    }),

  markTabsUpdated: (tabs, reason) =>
    set((state) => {
      const merged = Array.from(new Set([...state.updatedTabs, ...tabs]));
      const reasons = reason
        ? [reason, ...state.reasons].slice(0, 20)
        : state.reasons;
      // Only flag out-of-date if a report has already been generated once.
      const reportsOutOfDate = state.lastReportGeneratedAt
        ? true
        : state.reportsOutOfDate;
      return { updatedTabs: merged, reasons, reportsOutOfDate };
    }),

  reset: () =>
    set({
      lastReportGeneratedAt: null,
      reportsOutOfDate: false,
      updatedTabs: [],
      reasons: [],
    }),
}));
