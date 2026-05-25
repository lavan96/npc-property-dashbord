/**
 * Compass-40 Section Registry — Frontend mirror
 * --------------------------------------------------
 * KEEP IN SYNC with `supabase/functions/_shared/compassSectionRegistry.ts`.
 * Edge functions cannot import from `src/`, so the two files are duplicated
 * by design. Any structural change must be made in BOTH files.
 */

export type SectionPriority =
  | 'Protected'
  | 'High'
  | 'Medium'
  | 'Low'
  | 'Excluded';

export type ConfidenceTag =
  | 'Verified'
  | 'Indicative'
  | 'Planned'
  | 'UnderConstruction'
  | 'Unverified'
  | 'NotAvailable';

export type SectionVisualComponent =
  | 'kpiTiles'
  | 'scorecard'
  | 'strengthsWatchPoints'
  | 'infrastructureTimeline'
  | 'amenityMatrix'
  | 'riskRegister'
  | 'planningActionTable'
  | 'dueDiligenceChecklist'
  | 'decisionBox'
  | 'confidenceChip'
  | 'narrative'
  | 'attributeTable'
  | 'trendTable'
  | 'chart';

export interface CompassSectionDefinition {
  id: string;
  ordinal: number;
  name: string;
  sourceHeadings: string[];
  pageBudget: number;
  includeInCompass: boolean;
  includeInFinancialReport: boolean;
  includeInAppendix: boolean;
  isInternalOnly: boolean;
  sectionPriority: SectionPriority;
  maxWordCount: number;
  visualComponents: SectionVisualComponent[];
  allowDecisionBox: boolean;
  purpose: string;
}

// Structural data lives in JSON so the FE and edge module can be diffed quickly.
import COMPASS_40_DATA from './compassSectionRegistry.data.json';

interface RegistryFile {
  compass40: CompassSectionDefinition[];
  financialAnalysis: CompassSectionDefinition[];
  pageBand: { min: number; max: number };
  wordCaps: Record<string, { min: number; max: number }>;
  pagePressureTrimOrder: Array<{ id: string; description: string }>;
  protectedSectionIds: string[];
  financialHandoffCopy: string;
}

const data = COMPASS_40_DATA as RegistryFile;

export const COMPASS_40_SECTIONS: CompassSectionDefinition[] = data.compass40;
export const FINANCIAL_ANALYSIS_SECTIONS: CompassSectionDefinition[] = data.financialAnalysis;
export const COMPASS_WORD_CAPS = data.wordCaps;
export const PAGE_PRESSURE_TRIM_ORDER = data.pagePressureTrimOrder;
export const PROTECTED_SECTION_IDS: ReadonlySet<string> = new Set(data.protectedSectionIds);
export const COMPASS_FINANCIAL_HANDOFF_COPY = data.financialHandoffCopy;
export const COMPASS_PAGE_BAND = data.pageBand;

export const COMPASS_40_PAGE_BUDGET = COMPASS_40_SECTIONS.reduce(
  (s, x) => s + x.pageBudget,
  0,
);
export const FINANCIAL_PAGE_BUDGET = FINANCIAL_ANALYSIS_SECTIONS.reduce(
  (s, x) => s + x.pageBudget,
  0,
);

export const compassSections = (): CompassSectionDefinition[] =>
  COMPASS_40_SECTIONS.filter((s) => s.includeInCompass).sort(
    (a, b) => a.ordinal - b.ordinal,
  );

export const financialSections = (): CompassSectionDefinition[] =>
  FINANCIAL_ANALYSIS_SECTIONS.filter((s) => s.includeInFinancialReport).sort(
    (a, b) => a.ordinal - b.ordinal,
  );

export function totalWordBudget(
  tier: 'compass-40' | 'financial-analysis',
): number {
  const list = tier === 'compass-40' ? compassSections() : financialSections();
  return list.reduce((sum, s) => sum + s.maxWordCount, 0);
}
