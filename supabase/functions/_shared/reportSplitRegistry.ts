/**
 * Composite → Fork Split Registry
 * --------------------------------
 * Source of truth for how a composite Investment Report's H2 sections are
 * routed and re-titled when forked into the two client-facing variants:
 *
 *   1. Client Investment Feasibility & Financial Performance Report  (FIN)
 *   2. Property & Location Due Diligence Report                       (PLDD)
 *
 * The composite registry (compassSectionRegistry.ts) is unchanged — composite
 * generation continues as the single source of truth. This module only
 * controls the deterministic split applied AFTER generation by the
 * `fork-investment-report` edge function.
 *
 * Frontend mirror: src/lib/reports/reportSplitRegistry.ts — keep in sync.
 *
 * Routing rule semantics
 *   - target: 'financial'      → emit only into FIN
 *   - target: 'due_diligence'  → emit only into PLDD
 *   - target: 'both'           → emit into both, with the variant-specific
 *                                heading and a lens hint pre-pended
 *   - rule:   'verbatim'       → keep section body unchanged
 *             'financial_lens' → prepend the financial lens framing line
 *             'property_lens'  → prepend the property/DD lens framing line
 *             'summarise_only' → cap to first ~200 words + "see other report"
 *             'drop'           → omit entirely
 */

export type ForkVariant = 'financial' | 'due_diligence';
export type SplitTarget = ForkVariant | 'both';
export type ReframeRule =
  | 'verbatim'
  | 'financial_lens'
  | 'property_lens'
  | 'summarise_only'
  | 'drop';

export interface SplitRoute {
  /** Lowercase pattern matched against the composite H2 heading text. */
  match: string[];
  target: SplitTarget;
  /** Heading title used in the FIN report (when target is 'financial' or 'both'). */
  newHeadingFinancial?: string;
  /** Heading title used in the PLDD report (when target is 'due_diligence' or 'both'). */
  newHeadingDueDiligence?: string;
  /** Ordinal in FIN (1-based). */
  ordinalFinancial?: number;
  /** Ordinal in PLDD (1-based). */
  ordinalDueDiligence?: number;
  /** How to transform the body. */
  rule: ReframeRule;
  notes?: string;
}

// ─── FIN report structure (Report 1 — 16 sections) ──────────────────────────
export const FIN_REPORT_TITLE = 'Client Investment Feasibility & Financial Performance Report';
export const FIN_REPORT_SUBTITLE =
  'Cashflow, lending, yield, sensitivity, projections and portfolio suitability assessment.';

export const FIN_SECTION_ORDER: { ordinal: number; heading: string }[] = [
  { ordinal: 1,  heading: 'Client Investment Decision Summary' },
  { ordinal: 2,  heading: 'Financial Input Snapshot' },
  { ordinal: 3,  heading: 'Price, Rent & Yield Market Positioning' },
  { ordinal: 4,  heading: 'Purchase Costs & Annual Holding Cost Breakdown' },
  { ordinal: 5,  heading: 'Rental Assessment, Gross Yield & Net Yield' },
  { ordinal: 6,  heading: 'Loan Structure, Repayments & Cashflow Impact' },
  { ordinal: 7,  heading: 'Vacancy Risk, Tenant Income & Rent Sustainability' },
  { ordinal: 8,  heading: 'Sensitivity & Scenario Testing' },
  { ordinal: 9,  heading: '10-Year Cashflow, Equity & Growth Projection' },
  { ordinal: 10, heading: 'Resale Liquidity & Exit Strategy' },
  { ordinal: 11, heading: 'Financial Risk Dashboard' },
  { ordinal: 12, heading: 'Financial Investment Scorecard' },
  { ordinal: 13, heading: 'Investor Suitability Profile' },
  { ordinal: 14, heading: 'Financial SWOT: Returns, Risk & Holding Capacity' },
  { ordinal: 15, heading: 'Financial Recommendation & Portfolio Fit' },
  { ordinal: 16, heading: 'Assumptions, Verification Items & Adviser Disclaimer' },
];

// ─── PLDD report structure (Report 2 — 17 sections) ─────────────────────────
export const PLDD_REPORT_TITLE = 'Property & Location Due Diligence Report';
export const PLDD_REPORT_SUBTITLE =
  'Property fundamentals, suburb profile, tenant demand, planning context and local risk assessment.';

export const PLDD_SECTION_ORDER: { ordinal: number; heading: string }[] = [
  { ordinal: 1,  heading: 'Client Property & Location Snapshot' },
  { ordinal: 2,  heading: 'Core Property Facts & Physical Profile' },
  { ordinal: 3,  heading: 'Dwelling Layout & Functional Fit' },
  { ordinal: 4,  heading: 'Position Within the Locality' },
  { ordinal: 5,  heading: 'Suburb Character, Lifestyle & Occupier Appeal' },
  { ordinal: 6,  heading: 'Amenity Maturity & Daily Liveability' },
  { ordinal: 7,  heading: 'Transport, Commute & Daily Movement' },
  { ordinal: 8,  heading: 'Socioeconomic Profile & SEIFA Interpretation' },
  { ordinal: 9,  heading: 'Population, Household Growth & Demographic Fit' },
  { ordinal: 10, heading: 'Employment, Income & Affordability Profile' },
  { ordinal: 11, heading: 'Tenant Demand and Occupier Personas' },
  { ordinal: 12, heading: 'Future Buyer and Resale Appeal' },
  { ordinal: 13, heading: 'Planning, Zoning and Title Due Diligence' },
  { ordinal: 14, heading: 'Infrastructure and Growth Context' },
  { ordinal: 15, heading: 'Climate, Environmental, Insurance, Crime and Safety Risk' },
  { ordinal: 16, heading: 'Competitive Landscape and Supply Pipeline' },
  { ordinal: 17, heading: 'Property & Location Risk Dashboard' },
];

// ─── Lens framing strings ───────────────────────────────────────────────────
export const FIN_LENS_PREAMBLE =
  '_Reading this through a financial lens — focus on contribution, yield, repayments, serviceability and exit. The full property and locality narrative lives in the **Property & Location Due Diligence Report**._';

export const PLDD_LENS_PREAMBLE =
  '_Reading this through a property and locality lens — focus on liveability, planning, demand and resale appeal. The full cashflow, lending and projection modelling lives in the **Client Investment Feasibility & Financial Performance Report**._';

// ─── Per-variant footers / disclaimers ──────────────────────────────────────
export const FIN_FOOTER_DISCLAIMER =
  'This Financial Performance Report contains indicative figures based on assumptions disclosed in the Assumptions & Verification section. Numbers are subject to client-specific verification by a licensed mortgage broker, accountant and conveyancer before any commitment. This document is not personal financial product advice.';

export const PLDD_FOOTER_DISCLAIMER =
  'This Due Diligence Report summarises publicly available property, locality, planning, demographic and risk information at the time of writing. All items flagged for verification must be independently confirmed (planning certificate, title, overlays, building inspection, insurance) before contract. This document is not legal or financial advice.';

// ─── Routing table (composite H2 → variant routing) ─────────────────────────
// match[] entries are lowercased substring matches applied to the H2 heading.
// First matching rule wins, so order is meaningful.

export const SPLIT_ROUTES: SplitRoute[] = [
  // ── Executive / verdict ──
  {
    match: ['executive summary', 'executive verdict', 'executive strengths', 'overall recommendation', 'overall assessment', 'investment recommendation'],
    target: 'both',
    newHeadingFinancial: 'Client Investment Decision Summary',
    newHeadingDueDiligence: 'Client Property & Location Snapshot',
    ordinalFinancial: 1,
    ordinalDueDiligence: 1,
    rule: 'verbatim',
    notes: 'Replaces generic executive content — both reports lead with a tailored summary.',
  },

  // ── Property snapshot / core facts ──
  {
    match: ['property snapshot', 'property-level information', 'property & locality snapshot', 'property and locality snapshot', 'core property facts'],
    target: 'both',
    newHeadingFinancial: 'Financial Input Snapshot',
    newHeadingDueDiligence: 'Core Property Facts & Physical Profile',
    ordinalFinancial: 2,
    ordinalDueDiligence: 2,
    rule: 'verbatim',
  },
  {
    match: ['dwelling layout', 'functional fit', 'property fit within the suburb', 'property fit'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Dwelling Layout & Functional Fit',
    ordinalDueDiligence: 3,
    rule: 'property_lens',
  },

  // ── Locality / position ──
  {
    match: ['position within', 'road access', 'why this location matters', 'location overview'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Position Within the Locality',
    ordinalDueDiligence: 4,
    rule: 'property_lens',
  },
  {
    match: ['suburb character', 'community identity', 'lifestyle', 'retail, healthcare & lifestyle amenity'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Suburb Character, Lifestyle & Occupier Appeal',
    ordinalDueDiligence: 5,
    rule: 'property_lens',
  },

  // ── Amenity / education / healthcare ──
  {
    match: ['amenity', 'education', 'schools', 'healthcare', 'parks', 'community facilities', 'education & family amenity'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Amenity Maturity & Daily Liveability',
    ordinalDueDiligence: 6,
    rule: 'property_lens',
  },

  // ── Transport ──
  {
    match: ['transport', 'commute', 'public transport', 'connectivity & transport', 'transport & connectivity'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Transport, Commute & Daily Movement',
    ordinalDueDiligence: 7,
    rule: 'property_lens',
  },

  // ── Socioeconomic / SEIFA ──
  {
    match: ['seifa', 'socioeconomic', 'tenant & buyer profile', 'demographics & demand drivers'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Socioeconomic Profile & SEIFA Interpretation',
    ordinalDueDiligence: 8,
    rule: 'property_lens',
  },

  // ── Population / household ──
  {
    match: ['population', 'household', 'demographic', 'population & housing demand'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Population, Household Growth & Demographic Fit',
    ordinalDueDiligence: 9,
    rule: 'property_lens',
  },

  // ── Employment / income ──
  {
    match: ['employment', 'job growth', 'income', 'employment & economic linkages', 'employment hubs'],
    target: 'both',
    newHeadingFinancial: 'Vacancy Risk, Tenant Income & Rent Sustainability',
    newHeadingDueDiligence: 'Employment, Income & Affordability Profile',
    ordinalFinancial: 7,
    ordinalDueDiligence: 10,
    rule: 'verbatim',
    notes: 'Same employment data, two lenses — financial framing for FIN, demand framing for PLDD.',
  },

  // ── Tenant persona ──
  {
    match: ['target tenant', 'tenant persona', 'tenant stickiness', 'occupier personas', 'primary and secondary tenant'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Tenant Demand and Occupier Personas',
    ordinalDueDiligence: 11,
    rule: 'property_lens',
  },

  // ── Future buyer / resale ──
  {
    match: ['future buyer', 'buyer comparison', 'resale appeal'],
    target: 'both',
    newHeadingFinancial: 'Resale Liquidity & Exit Strategy',
    newHeadingDueDiligence: 'Future Buyer and Resale Appeal',
    ordinalFinancial: 10,
    ordinalDueDiligence: 12,
    rule: 'verbatim',
  },

  // ── Planning / zoning ──
  {
    match: ['planning', 'zoning', 'overlay', 'covenant', 'title'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Planning, Zoning and Title Due Diligence',
    ordinalDueDiligence: 13,
    rule: 'property_lens',
  },

  // ── Infrastructure / growth ──
  {
    match: ['infrastructure', 'growth corridor', 'future infrastructure', 'suburb/corridor context'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Infrastructure and Growth Context',
    ordinalDueDiligence: 14,
    rule: 'property_lens',
  },

  // ── Environmental / climate / crime ──
  {
    match: ['climate', 'environmental', 'bushfire', 'flood', 'crime', 'safety', 'insurance'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Climate, Environmental, Insurance, Crime and Safety Risk',
    ordinalDueDiligence: 15,
    rule: 'property_lens',
  },

  // ── Supply / competitive ──
  {
    match: ['competitive landscape', 'supply pipeline', 'supply & development pipeline'],
    target: 'due_diligence',
    newHeadingDueDiligence: 'Competitive Landscape and Supply Pipeline',
    ordinalDueDiligence: 16,
    rule: 'property_lens',
  },

  // ── Risk dashboard split ──
  {
    match: ['risk dashboard', 'risk summary', 'key risks before proceeding'],
    target: 'both',
    newHeadingFinancial: 'Financial Risk Dashboard',
    newHeadingDueDiligence: 'Property & Location Risk Dashboard',
    ordinalFinancial: 11,
    ordinalDueDiligence: 17,
    rule: 'verbatim',
    notes: 'Same source dashboard, two views — FIN keeps financial rows, PLDD keeps property/location rows.',
  },

  // ── FIN-only: market positioning / rental ──
  {
    match: ['market positioning', 'how the property sits in the local market', 'current market performance', 'market analysis'],
    target: 'financial',
    newHeadingFinancial: 'Price, Rent & Yield Market Positioning',
    ordinalFinancial: 3,
    rule: 'financial_lens',
  },
  {
    match: ['purchase & ongoing costs', 'purchase and ongoing costs'],
    target: 'financial',
    newHeadingFinancial: 'Purchase Costs & Annual Holding Cost Breakdown',
    ordinalFinancial: 4,
    rule: 'financial_lens',
  },
  {
    match: ['rental assessment', 'yield calculation'],
    target: 'financial',
    newHeadingFinancial: 'Rental Assessment, Gross Yield & Net Yield',
    ordinalFinancial: 5,
    rule: 'financial_lens',
  },
  {
    match: ['loan structure', 'repayment analysis'],
    target: 'financial',
    newHeadingFinancial: 'Loan Structure, Repayments & Cashflow Impact',
    ordinalFinancial: 6,
    rule: 'financial_lens',
  },
  {
    match: ['sensitivity analysis', 'interest rate sensitivity', 'structural cashflow deficit', 'scenario testing'],
    target: 'financial',
    newHeadingFinancial: 'Sensitivity & Scenario Testing',
    ordinalFinancial: 8,
    rule: 'financial_lens',
  },
  {
    match: ['10-year investment projection', 'capital appreciation potential', 'leveraged equity', '10-year cashflow'],
    target: 'financial',
    newHeadingFinancial: '10-Year Cashflow, Equity & Growth Projection',
    ordinalFinancial: 9,
    rule: 'financial_lens',
  },
  {
    match: ['investor suitability', 'who this property suits'],
    target: 'financial',
    newHeadingFinancial: 'Investor Suitability Profile',
    ordinalFinancial: 13,
    rule: 'financial_lens',
  },
  {
    match: ['swot analysis', 'swot'],
    target: 'financial',
    newHeadingFinancial: 'Financial SWOT: Returns, Risk & Holding Capacity',
    ordinalFinancial: 14,
    rule: 'financial_lens',
  },
  {
    match: ['financial recommendation', 'final recommendation', 'final conclusion'],
    target: 'financial',
    newHeadingFinancial: 'Financial Recommendation & Portfolio Fit',
    ordinalFinancial: 15,
    rule: 'verbatim',
  },

  // ── Due diligence checklist → FIN verification page (also retained in PLDD risk) ──
  {
    match: ['due diligence checklist', 'due diligence'],
    target: 'both',
    newHeadingFinancial: 'Assumptions, Verification Items & Adviser Disclaimer',
    newHeadingDueDiligence: 'Property & Location Risk Dashboard',
    ordinalFinancial: 16,
    ordinalDueDiligence: 17,
    rule: 'verbatim',
  },

  // ── Disclaimer / appendix ──
  {
    match: ['professional disclaimer', 'disclaimer', 'source appendix', 'appendix'],
    target: 'both',
    newHeadingFinancial: 'Assumptions, Verification Items & Adviser Disclaimer',
    newHeadingDueDiligence: 'Property & Location Risk Dashboard',
    ordinalFinancial: 16,
    ordinalDueDiligence: 17,
    rule: 'verbatim',
  },
];

export interface RoutingDecision {
  route: SplitRoute | null;
  matchedHeading: string;
}

export function routeCompositeSection(heading: string): RoutingDecision {
  const norm = (heading || '').toLowerCase().trim().replace(/^#+\s*/, '');
  for (const route of SPLIT_ROUTES) {
    for (const pattern of route.match) {
      if (norm.includes(pattern)) return { route, matchedHeading: heading };
    }
  }
  return { route: null, matchedHeading: heading };
}

/** Normalise structural numbering glitches (e.g. TOC "01 Executive Strengths" vs body "01 Executive Summary"). */
export function normaliseStructuralHeading(raw: string): string {
  return raw.replace(/^\s*\d+\s*[—\-:.]?\s*/, '').trim();
}
