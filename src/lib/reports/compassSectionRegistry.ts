/**
 * Compass-40 Section Registry — Frontend mirror
 * --------------------------------------------------
 * KEEP IN SYNC with `supabase/functions/_shared/compassSectionRegistry.ts`.
 * Edge functions cannot import from `src/`, so the two files are duplicated
 * by design. Any structural change must be made in BOTH files.
 *
 * See docs/COMPASS_40_PAGE_ARCHITECTURE.md for the design brief.
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

// ─── 40-page Compass architecture (21 sections, 40pt total) ─────────────────

export const COMPASS_40_SECTIONS: CompassSectionDefinition[] = [
  { id: 'compass.cover', ordinal: 1, name: 'Cover Page', sourceHeadings: ['Cover'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 60, visualComponents: [], allowDecisionBox: false, purpose: 'NPC branding, report name, property address, report date.' },
  { id: 'compass.contents', ordinal: 2, name: 'Contents & Reading Guide', sourceHeadings: ['Contents', 'Reading Guide'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 120, visualComponents: [], allowDecisionBox: false, purpose: 'Simple structure with one-line section descriptors. No multi-page micro TOC.' },
  { id: 'compass.executiveSummary', ordinal: 3, name: 'Executive Summary', sourceHeadings: ['Executive Summary'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 600, visualComponents: ['kpiTiles', 'decisionBox'], allowDecisionBox: true, purpose: 'Macro position, property fit, top risks, strategic conclusion. 450–600 words total.' },
  { id: 'compass.propertySnapshot', ordinal: 4, name: 'Property Snapshot — Non-Financial', sourceHeadings: ['Property Snapshot', 'Property-Level Information'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 180, visualComponents: ['attributeTable'], allowDecisionBox: false, purpose: 'Property identity, configuration, estate, LGA, target occupier. No finance fields.' },
  { id: 'compass.macroScorecard', ordinal: 5, name: 'Macro Investment Scorecard', sourceHeadings: ['Investment Score Analysis', 'Strategic Assessment'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 220, visualComponents: ['scorecard'], allowDecisionBox: false, purpose: '8 categories (location, infrastructure, demand, planning, environmental, supply, owner-occupier, property fit). Rating + 8–12 word reason.' },
  { id: 'compass.strengthsWatchPoints', ordinal: 6, name: 'Key Strengths & Watch Points', sourceHeadings: ['Investment Highlights', 'Key Findings', 'SWOT Analysis Summary'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 250, visualComponents: ['strengthsWatchPoints'], allowDecisionBox: false, purpose: 'Two-column side-by-side: strongest arguments vs key cautions. Max 5 bullets per side.' },
  { id: 'compass.locationOverview', ordinal: 7, name: 'Location Overview', sourceHeadings: ['Location Overview', 'Employment Hubs'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 700, visualComponents: ['narrative', 'attributeTable', 'decisionBox'], allowDecisionBox: true, purpose: 'Suburb, corridor, LGA, estate, economic links, investment context.' },
  { id: 'compass.futureInfrastructure', ordinal: 8, name: 'Future Infrastructure & Growth Pipeline', sourceHeadings: ['Future Infrastructure', 'Infrastructure & Development'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 350, visualComponents: ['infrastructureTimeline', 'confidenceChip', 'decisionBox'], allowDecisionBox: true, purpose: 'Staged delivery: schools, town centre, transport, road, health, parks. Confidence tags mandatory.' },
  { id: 'compass.populationTrends', ordinal: 9, name: 'Population & Development Trends', sourceHeadings: ['Population and Development Trends', 'Supply & Development Pipeline'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 400, visualComponents: ['trendTable', 'decisionBox'], allowDecisionBox: true, purpose: 'Population growth, household formation, estate release pipeline, supply absorption.' },
  { id: 'compass.suburbCharacter', ordinal: 10, name: 'Suburb Character & Lifestyle', sourceHeadings: ['Suburb Character', 'Lifestyle'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Medium', maxWordCount: 250, visualComponents: ['strengthsWatchPoints'], allowDecisionBox: false, purpose: 'Lifestyle Strengths vs Lifestyle Trade-Offs — two columns.' },
  { id: 'compass.marketPerformance', ordinal: 11, name: 'Market Performance & Macro Demand', sourceHeadings: ['Current Market Performance', 'Market Analysis'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 650, visualComponents: ['chart', 'trendTable', 'kpiTiles', 'decisionBox'], allowDecisionBox: true, purpose: 'Growth-cycle position, demand drivers, buyer appeal, supply risk. No yield/cashflow math.' },
  { id: 'compass.economicContext', ordinal: 12, name: 'Economic Context', sourceHeadings: ['Current Economic Context'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Medium', maxWordCount: 200, visualComponents: ['kpiTiles'], allowDecisionBox: false, purpose: 'Macro backdrop only: cash rate, inflation, employment, construction cost, buyer confidence.' },
  { id: 'compass.demographics', ordinal: 13, name: 'Demographics, SEIFA, Employment & Demand', sourceHeadings: ['Demographics & Demand Drivers', 'Demographics & Economics', 'Sustained Employment Growth'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 700, visualComponents: ['trendTable', 'kpiTiles', 'decisionBox'], allowDecisionBox: true, purpose: 'SEIFA, income, workforce, industries, target tenant, demand implications. Rendered once only.' },
  { id: 'compass.education', ordinal: 14, name: 'Education & Family Demand', sourceHeadings: ['Schools & Education', 'Education Infrastructure', 'Education Profile', 'Education Lifecycle', 'Key Local Schools'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: true, isInternalOnly: false, sectionPriority: 'Medium', maxWordCount: 350, visualComponents: ['amenityMatrix', 'decisionBox'], allowDecisionBox: true, purpose: 'Merged: nearest childcare/school, top 3–5 schools, density/quality, family demand implication. Full list to appendix.' },
  { id: 'compass.amenity', ordinal: 15, name: 'Amenity & Livability Matrix', sourceHeadings: ['Healthcare & Shopping', 'Recreational Amenities'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: true, isInternalOnly: false, sectionPriority: 'Medium', maxWordCount: 380, visualComponents: ['amenityMatrix'], allowDecisionBox: false, purpose: 'Columns: Amenity / Current Access / Future Outlook / Investor Relevance. Top 3–5 per category.' },
  { id: 'compass.transport', ordinal: 16, name: 'Connectivity & Transport', sourceHeadings: ['Transport & Accessibility', 'Public Transport Access'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 380, visualComponents: ['attributeTable', 'decisionBox'], allowDecisionBox: true, purpose: 'Station, road, bus, commute, CBD/employment access, future upgrades. Merged transport sections.' },
  { id: 'compass.riskRegister', ordinal: 17, name: 'Crime, Climate & Environmental Risk Register', sourceHeadings: ['Environmental Risks & Climate', 'Crime & Safety', 'Environmental Risk'], pageBudget: 4, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: true, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 700, visualComponents: ['riskRegister', 'confidenceChip', 'decisionBox'], allowDecisionBox: true, purpose: 'Risk rating, confidence, evidence, required DD action. Action mandatory on every risk.' },
  { id: 'compass.propertyAssessment', ordinal: 18, name: 'Property-Level Non-Financial Assessment', sourceHeadings: ['Property-Level Information', 'Strategic Assessment'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 420, visualComponents: ['strengthsWatchPoints', 'attributeTable', 'decisionBox'], allowDecisionBox: true, purpose: 'Lot position, layout, land/build balance, tenant appeal, resale, limitations. No valuation/yield.' },
  { id: 'compass.zoningPlanning', ordinal: 19, name: 'Zoning & Planning Analysis', sourceHeadings: ['Zoning', 'Planning'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: true, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 600, visualComponents: ['planningActionTable', 'confidenceChip', 'decisionBox'], allowDecisionBox: true, purpose: 'Zoning, overlays, covenants, DCP/residual contributions, development potential, planning certificate checks.' },
  { id: 'compass.dueDiligence', ordinal: 20, name: 'Due Diligence & Final Recommendation', sourceHeadings: ['Investment Recommendations', 'Final Conclusion'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 400, visualComponents: ['dueDiligenceChecklist', 'decisionBox'], allowDecisionBox: true, purpose: 'Council planning cert, title/covenant, overlays, insurance, infra status, comps, rental demand. Macro recommendation only — 150–250 words.' },
  { id: 'compass.disclaimer', ordinal: 21, name: 'Disclaimer & Source Appendix', sourceHeadings: ['PROFESSIONAL DISCLAIMER', 'Disclaimer'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 250, visualComponents: ['narrative'], allowDecisionBox: false, purpose: 'Brief disclaimer + data-source summary. Macro recommendation does not constitute financial advice.' },
];

// ─── Financial Analysis Report architecture (separate document) ─────────────

export const FINANCIAL_ANALYSIS_SECTIONS: CompassSectionDefinition[] = [
  { id: 'financial.cover', ordinal: 1, name: 'Cover Page', sourceHeadings: ['Cover'], pageBudget: 1, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 60, visualComponents: [], allowDecisionBox: false, purpose: 'NPC branding, "Financial Analysis Report", property address, report date.' },
  { id: 'financial.propertySnapshot', ordinal: 2, name: 'Property & Inputs Snapshot', sourceHeadings: ['Property Snapshot'], pageBudget: 1, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 220, visualComponents: ['attributeTable', 'kpiTiles'], allowDecisionBox: false, purpose: 'Address, type, configuration, purchase price, deposit, loan, rate, term assumptions.' },
  { id: 'financial.purchaseCosts', ordinal: 3, name: 'Purchase & Ongoing Costs', sourceHeadings: ['Purchase & Ongoing Costs (Annual)'], pageBudget: 2, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 350, visualComponents: ['attributeTable', 'kpiTiles'], allowDecisionBox: true, purpose: 'Stamp duty, conveyancing, building/pest, LMI, annual property expenses, land tax breakdown.' },
  { id: 'financial.yield', ordinal: 4, name: 'Rental Assessment & Yield Calculation', sourceHeadings: ['Rental Assessment & Yield Calculation'], pageBudget: 2, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 350, visualComponents: ['kpiTiles', 'trendTable'], allowDecisionBox: true, purpose: 'Weekly rent, gross yield, net yield, vacancy, management costs, yield benchmark commentary.' },
  { id: 'financial.loan', ordinal: 5, name: 'Loan Structure & Repayment Analysis', sourceHeadings: ['Loan Structure & Repayment Analysis'], pageBudget: 2, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 400, visualComponents: ['attributeTable', 'kpiTiles'], allowDecisionBox: true, purpose: 'LVR, loan amount, interest rate, product type, IO vs P&I, monthly/annual repayments.' },
  { id: 'financial.cashflow', ordinal: 6, name: 'Year-1 Cashflow & Sensitivity', sourceHeadings: ['Sensitivity Analysis', 'Interest Rate Sensitivity', 'Structural Cashflow Deficit'], pageBudget: 3, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 600, visualComponents: ['trendTable', 'chart', 'decisionBox'], allowDecisionBox: true, purpose: 'Year-1 net cashflow pre/post tax, monthly shortfall, ±1% / ±2% interest rate sensitivity.' },
  { id: 'financial.tenYear', ordinal: 7, name: '10-Year Cashflow & Equity Projections', sourceHeadings: ['10-Year Investment Projections', 'Capital Appreciation Potential', 'Leveraged Equity Accumulation'], pageBudget: 4, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 700, visualComponents: ['trendTable', 'chart', 'decisionBox'], allowDecisionBox: true, purpose: '10-year cashflow, rental projections, loan balance, equity growth, cumulative cash contributions.' },
  { id: 'financial.tax', ordinal: 8, name: 'Tax Treatment & Land Tax', sourceHeadings: ['Land Tax', 'Tax Treatment'], pageBudget: 2, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 400, visualComponents: ['attributeTable', 'decisionBox'], allowDecisionBox: true, purpose: 'Negative gearing, depreciation outline, land tax thresholds, client-specific assumptions and disclaimers.' },
  { id: 'financial.serviceability', ordinal: 9, name: 'Serviceability & Buffer', sourceHeadings: ['Borrowing Capacity', 'Serviceability'], pageBudget: 2, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 400, visualComponents: ['kpiTiles', 'attributeTable'], allowDecisionBox: true, purpose: 'Client serviceability headroom, recommended cash buffer, lender stress test assumptions.' },
  { id: 'financial.recommendation', ordinal: 10, name: 'Financial Recommendation', sourceHeadings: ['Financial Recommendation'], pageBudget: 1, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 280, visualComponents: ['decisionBox'], allowDecisionBox: true, purpose: 'Financial suitability verdict tied to client serviceability, buffers and cashflow capacity.' },
  { id: 'financial.disclaimer', ordinal: 11, name: 'Disclaimer & Source Appendix', sourceHeadings: ['PROFESSIONAL DISCLAIMER', 'Disclaimer'], pageBudget: 1, includeInCompass: false, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 300, visualComponents: ['narrative'], allowDecisionBox: false, purpose: 'General advice warning, source data, methodology notes. Not personal financial advice.' },
];

export const COMPASS_WORD_CAPS = {
  executiveSummaryTotal:    { min: 450, max: 600 },
  sectionOpeningTakeaway:   { min:  35, max:  50 },
  standardParagraph:        { min:  45, max:  80 },
  whatThisMeansBox:         { min:  40, max:  60 },
  amenityCategorySummary:   { min:  40, max:  70 },
  riskItemExplanation:      { min:  25, max:  45 },
  planningItemExplanation:  { min:  40, max:  70 },
  finalRecommendation:      { min: 150, max: 250 },
} as const;

export const PAGE_PRESSURE_TRIM_ORDER = [
  { id: 'transitions',                description: 'Strip repeated transition paragraphs ("As we move into…").' },
  { id: 'collapseDecisionBoxes',      description: 'Collapse duplicate "What This Means" boxes into one per section.' },
  { id: 'capListsToTop5',             description: 'Cap school / amenity / transport lists to top 5 records.' },
  { id: 'mergeDuplicateDemographics', description: 'Merge duplicate demographic/employment commentary.' },
  { id: 'moveListsToAppendix',        description: 'Move long lists to appendix / internal view.' },
  { id: 'reduceEconomicContext',      description: 'Reduce economic context to one page.' },
  { id: 'reduceLifestyle',            description: 'Reduce lifestyle narrative to one page.' },
] as const;

export const PROTECTED_SECTION_IDS: ReadonlySet<string> = new Set([
  'compass.futureInfrastructure',
  'compass.riskRegister',
  'compass.zoningPlanning',
  'compass.dueDiligence',
  'compass.propertyAssessment',
]);

export const COMPASS_FINANCIAL_HANDOFF_COPY =
  'This Compass Report focuses on macro suitability, suburb fundamentals, planning considerations and property-positioning factors. Detailed cashflow, lending structure, tax position, yield and 10-year financial modelling should be reviewed separately in the Financial Analysis Report.';

export const COMPASS_PAGE_BAND = { min: 38, max: 42 } as const;

export const COMPASS_40_PAGE_BUDGET = COMPASS_40_SECTIONS.reduce((s, x) => s + x.pageBudget, 0);
export const FINANCIAL_PAGE_BUDGET  = FINANCIAL_ANALYSIS_SECTIONS.reduce((s, x) => s + x.pageBudget, 0);

export const compassSections = (): CompassSectionDefinition[] =>
  COMPASS_40_SECTIONS.filter((s) => s.includeInCompass).sort((a, b) => a.ordinal - b.ordinal);

export const financialSections = (): CompassSectionDefinition[] =>
  FINANCIAL_ANALYSIS_SECTIONS.filter((s) => s.includeInFinancialReport).sort((a, b) => a.ordinal - b.ordinal);

export function totalWordBudget(tier: 'compass-40' | 'financial-analysis'): number {
  const list = tier === 'compass-40' ? compassSections() : financialSections();
  return list.reduce((sum, s) => sum + s.maxWordCount, 0);
}

/**
 * Normalise the many tier aliases used across the codebase
 * (`compass`, `compass-40`, `strategic`, `briefing`, `snapshot`, `financial`,
 *  `financial-analysis`) to one of the two registry tiers.
 */
export type NormalisedTier = 'compass-40' | 'financial-analysis';

export function normaliseReportTier(raw: unknown): NormalisedTier {
  const t = String(raw ?? '').toLowerCase().trim();
  if (t.startsWith('financial')) return 'financial-analysis';
  // Everything else (compass / strategic / briefing / snapshot / unknown) maps to Compass.
  return 'compass-40';
}

/**
 * Number of generation chunks the chunked-regeneration loop should run
 * for a given tier. This is intentionally NOT the final rendered section/page
 * count: the generator still emits larger source chunks, then the Compass
 * post-processor maps them into the 40-page architecture.
 */
export function sectionCountForTier(raw: unknown): number {
  return normaliseReportTier(raw) === 'financial-analysis'
    ? FINANCIAL_ANALYSIS_SECTIONS.length
    : COMPASS_40_SECTIONS.length;
}
