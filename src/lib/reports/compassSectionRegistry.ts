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

// ─── Investment Location & Property Fit Report (≈38 pages, 17 sections) ─────
// v2.0 — restructured per NPC client-decision brief. Macro / locality / property
// fit only. All detailed financial modelling lives in the Financial Analysis
// Report and must not appear here. Writing style for every narrative section:
//   1. Key takeaway   2. Why this matters   3. What to watch   4. NPC view

export const COMPASS_40_SECTIONS: CompassSectionDefinition[] = [
  { id: 'compass.cover', ordinal: 1, name: 'Cover Page', sourceHeadings: ['Cover'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 60, visualComponents: [], allowDecisionBox: false, purpose: 'NPC branding, report name ("Investment Location & Property Fit Report"), property address, report date.' },
  { id: 'compass.readingGuide', ordinal: 2, name: 'Client Reading Guide', sourceHeadings: ['Contents', 'Reading Guide', 'Client Reading Guide'], pageBudget: 1, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 160, visualComponents: ['narrative'], allowDecisionBox: false, purpose: 'One-page contents + short note that detailed cashflow, loan, yield and 10-year financial modelling are provided separately in the Financial Analysis Report.' },
  { id: 'compass.executiveVerdict', ordinal: 3, name: 'Executive Verdict', sourceHeadings: ['Executive Summary', 'Executive Verdict', 'Overall Assessment', 'Investment Recommendation'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 550, visualComponents: ['decisionBox'], allowDecisionBox: true, purpose: 'One-page plain-English verdict: location call, property fit, tenant demand, top 2–3 risks, Proceed / Proceed with caution / Not suitable. NO financial figures.' },
  { id: 'compass.propertyLocalitySnapshot', ordinal: 4, name: 'Property & Locality Snapshot', sourceHeadings: ['Property Snapshot', 'Property-Level Information', 'Locality Snapshot'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 500, visualComponents: ['attributeTable', 'decisionBox'], allowDecisionBox: true, purpose: 'Physical and strategic facts only: type, bed/bath/car, land size, estate, suburb, LGA, target occupier, locality fit. Bed/bath/car must stay consistent throughout. No finance.' },
  { id: 'compass.whyLocationMatters', ordinal: 5, name: 'Why This Location Matters', sourceHeadings: ['Location Overview', 'Why This Location Matters', 'Future Infrastructure', 'Infrastructure & Development', 'Growth Corridor'], pageBudget: 4, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 900, visualComponents: ['narrative', 'infrastructureTimeline', 'confidenceChip', 'decisionBox'], allowDecisionBox: true, purpose: 'Growth corridor, estate, LGA, economic links and staged infrastructure pipeline. Each infrastructure item carries a confidence chip.' },
  { id: 'compass.populationHousingDemand', ordinal: 6, name: 'Population & Housing Demand', sourceHeadings: ['Population and Development Trends', 'Population & Housing Demand', 'Supply & Development Pipeline'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 650, visualComponents: ['trendTable', 'decisionBox'], allowDecisionBox: true, purpose: 'Population growth, household formation, in-migration, supply pipeline. No rent or yield numbers.' },
  { id: 'compass.tenantBuyerProfile', ordinal: 7, name: 'Tenant & Buyer Profile', sourceHeadings: ['Tenant & Buyer Profile', 'Demand Drivers', 'Demographics & Demand Drivers', 'Target Tenant'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 650, visualComponents: ['kpiTiles', 'decisionBox'], allowDecisionBox: true, purpose: 'Who would rent and buy this property: family formation, household types, income brackets, SEIFA snapshot, tenant stickiness.' },
  { id: 'compass.employmentEconomic', ordinal: 8, name: 'Employment & Economic Linkages', sourceHeadings: ['Employment & Economic Linkages', 'Employment Hubs', 'Sustained Employment Growth', 'Employment & Industry', 'Economic Context'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 650, visualComponents: ['attributeTable', 'decisionBox'], allowDecisionBox: true, purpose: 'Single consolidated employment section. Render ONCE — no duplicate employment content elsewhere.' },
  { id: 'compass.educationFamilyAmenity', ordinal: 9, name: 'Education & Family Amenity', sourceHeadings: ['Schools & Education', 'Education Infrastructure', 'Education Profile', 'Education Lifecycle', 'Key Local Schools', 'Education & Family Amenity'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: true, isInternalOnly: false, sectionPriority: 'Medium', maxWordCount: 650, visualComponents: ['amenityMatrix', 'decisionBox'], allowDecisionBox: true, purpose: 'All education merged: childcare, top 3–5 schools, family retention implication. Full lists to appendix.' },
  { id: 'compass.retailHealthLifestyle', ordinal: 10, name: 'Retail, Healthcare & Lifestyle Amenity', sourceHeadings: ['Healthcare & Shopping', 'Recreational Amenities', 'Suburb Character', 'Lifestyle', 'Retail, Healthcare & Lifestyle Amenity'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: true, isInternalOnly: false, sectionPriority: 'Medium', maxWordCount: 650, visualComponents: ['amenityMatrix', 'decisionBox'], allowDecisionBox: true, purpose: 'Consolidated lifestyle and convenience: healthcare, shopping, parks, suburb character. Top 3–5 per category.' },
  { id: 'compass.transportConnectivity', ordinal: 11, name: 'Transport & Connectivity', sourceHeadings: ['Transport & Accessibility', 'Public Transport Access', 'Public Transport Network', 'Commute Metrics', 'Connectivity & Transport', 'Transport & Connectivity'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 650, visualComponents: ['attributeTable', 'decisionBox'], allowDecisionBox: true, purpose: 'Single transport section — rail, road, bus, commute reality, future upgrades. Render ONCE.' },
  { id: 'compass.marketPositioning', ordinal: 12, name: 'Market Positioning', sourceHeadings: ['Market Positioning', 'Current Market Performance', 'Market Analysis'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'High', maxWordCount: 650, visualComponents: ['trendTable', 'kpiTiles', 'decisionBox'], allowDecisionBox: true, purpose: 'Where the property sits in the market: estate context, owner-occupier appeal, supply. Qualitative only — no yield, cashflow, capital growth %, loan or repayment numbers.' },
  { id: 'compass.propertyFit', ordinal: 13, name: 'Property Fit Within the Suburb', sourceHeadings: ['Property Fit Within the Suburb', 'Property-Level Information', 'Strategic Assessment', 'Property Fit'], pageBudget: 3, includeInCompass: true, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 650, visualComponents: ['strengthsWatchPoints', 'attributeTable', 'decisionBox'], allowDecisionBox: true, purpose: 'How this dwelling aligns with local demand. Bed/bath/car must match Section 4. No valuation or yield.' },
  { id: 'compass.riskDashboard', ordinal: 14, name: 'Risk Dashboard', sourceHeadings: ['Risk Dashboard', 'Risk Summary', 'Environmental Risks & Climate', 'Crime & Safety', 'Environmental Risk', 'Zoning', 'Planning', 'Key Risks Before Proceeding'], pageBudget: 4, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: true, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 800, visualComponents: ['riskRegister', 'confidenceChip', 'decisionBox'], allowDecisionBox: true, purpose: 'Single risk dashboard table: Risk / Level / Why It Matters / Required Check. Covers crime, env, planning, supply, transport reliance, infra timing.' },
  { id: 'compass.dueDiligenceChecklist', ordinal: 15, name: 'Due Diligence Checklist', sourceHeadings: ['Due Diligence Checklist', 'Due Diligence', 'Investment Recommendations'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 400, visualComponents: ['dueDiligenceChecklist', 'decisionBox'], allowDecisionBox: true, purpose: 'Plain checklist: planning cert, title/covenant, overlays, insurance/BAL, comps, rent, contract.' },
  { id: 'compass.finalRecommendation', ordinal: 16, name: 'Final Recommendation', sourceHeadings: ['Final Recommendation', 'Final Conclusion', 'Investment Recommendation'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: false, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 350, visualComponents: ['decisionBox'], allowDecisionBox: true, purpose: 'Proceed / Proceed with caution / Not suitable — 150–250 words. No financial figures.' },
  { id: 'compass.disclaimer', ordinal: 17, name: 'Appendix, Source Notes & Disclaimer', sourceHeadings: ['PROFESSIONAL DISCLAIMER', 'Disclaimer', 'Source Appendix', 'Appendix'], pageBudget: 2, includeInCompass: true, includeInFinancialReport: true, includeInAppendix: false, isInternalOnly: false, sectionPriority: 'Protected', maxWordCount: 300, visualComponents: ['narrative'], allowDecisionBox: false, purpose: 'Data sources, appendix listings, general advice warning. Replaces any inline "[citation]" placeholders.' },
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
