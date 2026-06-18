/**
 * Property Injection Pipeline
 * ---------------------------------------------------------------------------
 * Unified entry point for getting a property into the Commercial & Industrial
 * calculator suite, regardless of source:
 *
 *   - Manual address entry
 *   - New Commercial (form)
 *   - New Industrial (form)
 *   - URL scrape (scrape-property-listing)
 *   - PDF / IM upload (parse-property-pdf)
 *   - Contract upload (parse-property-pdf + 'contract' hint)
 *   - Lease upload (parse-property-pdf + 'lease' hint)
 *   - Existing saved property
 *
 * Responsibilities:
 *   1. Create / load the property record (commercial_properties or industrial_properties)
 *   2. Build a CalculatorPrefill payload
 *   3. Seed the Master Property Assumption Store with provenance
 *   4. Compute data completeness + missing assumption list
 *   5. Leave unknown fields blank (never invent values)
 *
 * AI estimates run separately via the commercial-property-ai-estimates edge fn.
 */
import { commercialApi, type CommercialProperty } from '@/hooks/useCommercialProperties';
import { industrialApi, type IndustrialProperty } from '@/hooks/useIndustrialProperties';
import type { CalculatorPrefill, CalculatorDomain } from '@/contexts/CalculatorPrefillContext';
import {
  useMasterAssumptionStore,
  type AssumptionSource,
  type AssumptionValue,
  type CalculatorTabKey,
} from './masterPropertyAssumptionStore';

// ----------------------------------------------------------------------------
// Source → assumption-source mapping
// ----------------------------------------------------------------------------

export type PropertyInputMethod =
  | 'manual_address'
  | 'new_commercial'
  | 'new_industrial'
  | 'url_scrape'
  | 'pdf_upload'
  | 'contract_upload'
  | 'lease_upload'
  | 'existing_saved';

export const INPUT_METHOD_TO_SOURCE: Record<PropertyInputMethod, AssumptionSource> = {
  manual_address: 'Manual',
  new_commercial: 'Property Profile',
  new_industrial: 'Property Profile',
  url_scrape: 'Scraped',
  pdf_upload: 'Scraped',
  contract_upload: 'Contract Extracted',
  lease_upload: 'Lease Extracted',
  existing_saved: 'Property Profile',
};

export const INPUT_METHOD_LABEL: Record<PropertyInputMethod, string> = {
  manual_address: 'Manual address entry',
  new_commercial: 'New Commercial',
  new_industrial: 'New Industrial',
  url_scrape: 'URL scrape',
  pdf_upload: 'PDF / IM upload',
  contract_upload: 'Contract upload',
  lease_upload: 'Lease upload',
  existing_saved: 'Existing saved property',
};

// ----------------------------------------------------------------------------
// Required-assumption registry
// Drives completeness score + missing list + AI-estimate request
// ----------------------------------------------------------------------------

export interface RequiredAssumption {
  key: keyof CalculatorPrefill | string;
  label: string;
  tabs: CalculatorTabKey[];
  appliesTo: 'both' | 'commercial' | 'industrial';
}

export const REQUIRED_ASSUMPTIONS: RequiredAssumption[] = [
  { key: 'address',              label: 'Property address',              tabs: ['overview'],                  appliesTo: 'both' },
  { key: 'state',                label: 'State',                         tabs: ['overview', 'gst'],           appliesTo: 'both' },
  { key: 'assetSubtype',         label: 'Asset sub-type',                tabs: ['overview', 'capRate'],       appliesTo: 'both' },
  { key: 'purchasePrice',        label: 'Purchase price',                tabs: ['overview', 'gst', 'borrowing', 'capRate'], appliesTo: 'both' },
  { key: 'valuation',            label: 'Estimated market value',        tabs: ['capRate', 'borrowing'],      appliesTo: 'both' },
  { key: 'gstTreatment',         label: 'GST treatment',                 tabs: ['gst'],                       appliesTo: 'both' },
  { key: 'nlaSqm',               label: 'Net lettable area (NLA)',       tabs: ['overview', 'noi'],           appliesTo: 'commercial' },
  { key: 'glaSqm',               label: 'Gross lettable area (GLA)',     tabs: ['overview', 'noi'],           appliesTo: 'industrial' },
  { key: 'siteAreaSqm',          label: 'Site area',                     tabs: ['overview', 'industrialMetrics'], appliesTo: 'both' },
  { key: 'siteCoverPct',         label: 'Site cover %',                  tabs: ['industrialMetrics'],         appliesTo: 'industrial' },
  { key: 'clearanceMetres',      label: 'Internal clearance (m)',        tabs: ['industrialMetrics'],         appliesTo: 'industrial' },
  { key: 'powerKva',             label: 'Power supply (kVA)',            tabs: ['industrialMetrics'],         appliesTo: 'industrial' },
  { key: 'grossPassingRentPa',   label: 'Gross passing rent (p.a.)',     tabs: ['noi', 'icrDscr'],            appliesTo: 'both' },
  { key: 'marketRentPa',         label: 'Market rent (p.a.)',            tabs: ['noi', 'capRate'],            appliesTo: 'both' },
  { key: 'recoveredOutgoingsPa', label: 'Recovered outgoings (p.a.)',    tabs: ['noi'],                       appliesTo: 'both' },
  { key: 'walesYears',           label: 'WALE (years)',                  tabs: ['dcf'],                       appliesTo: 'both' },
  { key: 'yearBuilt',            label: 'Year built',                    tabs: ['overview'],                  appliesTo: 'both' },
  { key: 'zoning',               label: 'Zoning',                        tabs: ['overview'],                  appliesTo: 'both' },
];

export function getRequiredAssumptionsFor(domain: CalculatorDomain): RequiredAssumption[] {
  return REQUIRED_ASSUMPTIONS.filter(r => r.appliesTo === 'both' || r.appliesTo === domain);
}

// ----------------------------------------------------------------------------
// Prefill builders (for sources that haven't yet hit the DB-backed prefill)
// ----------------------------------------------------------------------------

export interface InjectionDraft {
  domain: CalculatorDomain;
  method: PropertyInputMethod;
  /** Stub partial values gathered from the source. Unknown fields stay omitted. */
  values: Partial<CalculatorPrefill>;
  /** Raw payload reference (e.g. scrape result) for audit. */
  raw?: Record<string, unknown>;
}

// Map a normalized scrape/parse payload onto a CalculatorPrefill partial.
// Unknown fields are left blank.
export function normaliseExtractedToPrefill(
  data: Record<string, any>,
  domain: CalculatorDomain,
): Partial<CalculatorPrefill> {
  const num = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 ? n : (n === 0 ? 0 : null);
  };
  const str = (v: any): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

  return {
    address: str(data.address) ?? str(data.fullAddress) ?? '',
    state: str(data.state),
    assetSubtype: str(data.assetSubType) ?? str(data.asset_subtype) ?? str(data.assetClass) ?? str(data.propertyType),
    purchasePrice: num(data.price) ?? num(data.purchase_price),
    valuation: num(data.currentValuation) ?? num(data.valuation),
    nlaSqm: num(data.nlaSqm) ?? num(data.nla_sqm),
    glaSqm: num(data.glaSqm) ?? num(data.gla_sqm) ?? num(data.buildSize),
    gfaSqm: num(data.gfaSqm) ?? num(data.gfa_sqm),
    siteAreaSqm: num(data.siteAreaSqm) ?? num(data.landSize) ?? num(data.land_size_sqm),
    hardstandSqm: num(data.hardstandSqm) ?? num(data.hardstand_sqm),
    officePct: num(data.officePct) ?? num(data.office_pct),
    siteCoverPct: num(data.siteCoverPct) ?? num(data.site_cover_pct),
    parkingBays: num(data.parkingBays) ?? num(data.parking_bays) ?? num(data.carSpaces),
    clearanceMetres: num(data.clearanceMetres) ?? num(data.clearance_metres),
    powerKva: num(data.powerKva) ?? num(data.power_kva),
    dockDoors: num(data.dockDoors) ?? num(data.dock_doors),
    groundFloorLoadKpa: num(data.groundFloorLoadKpa) ?? num(data.ground_floor_load_kpa),
    grossPassingRentPa: num(data.grossPassingRentPa) ?? num(data.weeklyRent ? data.weeklyRent * 52 : null),
    marketRentPa: num(data.marketRentPa),
    yearBuilt: num(data.yearBuilt) ?? num(data.year_built),
    zoning: str(data.zoning),
  };
}

// Persist a draft to the appropriate properties table and return the saved record id.
export async function persistDraftAsProperty(draft: InjectionDraft): Promise<{ id: string; domain: CalculatorDomain }> {
  const { domain, values } = draft;
  if (domain === 'commercial') {
    const payload: Partial<CommercialProperty> = {
      address: values.address || 'New commercial property',
      state: values.state ?? undefined,
      asset_class: (values.assetSubtype as any) ?? 'other',
      asset_sub_type: values.assetSubtype ?? undefined,
      purchase_price: values.purchasePrice ?? undefined,
      valuation: values.valuation ?? undefined,
      gfa_sqm: values.gfaSqm ?? undefined,
      nla_sqm: values.nlaSqm ?? values.glaSqm ?? undefined,
      site_area_sqm: values.siteAreaSqm ?? undefined,
      parking_bays: values.parkingBays ?? undefined,
      year_built: values.yearBuilt ?? undefined,
      zoning: values.zoning ?? undefined,
      gst_treatment: (values.gstTreatment as any) ?? undefined,
    };
    const res = await commercialApi.createProperty(payload);
    if (res.error || !res.data) throw new Error(res.error?.message || 'Failed to create commercial property');
    return { id: (res.data as CommercialProperty).id, domain: 'commercial' };
  }

  const payload: Partial<IndustrialProperty> = {
    property_name: (values.address || 'New industrial property').split(',')[0] || undefined,
    street: values.address ?? undefined,
    state: values.state ?? undefined,
    asset_subtype: (values.assetSubtype as any) ?? 'other',
    purchase_price: values.purchasePrice ?? undefined,
    current_valuation: values.valuation ?? undefined,
    gla_sqm: values.glaSqm ?? values.nlaSqm ?? undefined,
    site_area_sqm: values.siteAreaSqm ?? undefined,
    site_cover_pct: values.siteCoverPct ?? undefined,
    office_pct: values.officePct ?? undefined,
    hardstand_sqm: values.hardstandSqm ?? undefined,
    clearance_metres: values.clearanceMetres ?? undefined,
    power_kva: values.powerKva ?? undefined,
    dock_doors: values.dockDoors ?? undefined,
    ground_floor_load_kpa: values.groundFloorLoadKpa ?? undefined,
    year_built: values.yearBuilt ?? undefined,
    zoning: values.zoning ?? undefined,
  };
  const res = await industrialApi.createProperty(payload);
  if (res.error || !res.data) throw new Error(res.error?.message || 'Failed to create industrial property');
  return { id: (res.data as IndustrialProperty).id, domain: 'industrial' };
}

// ----------------------------------------------------------------------------
// Cascade prefill → master assumption store
// ----------------------------------------------------------------------------

export function cascadePrefillIntoMasterStore(
  prefill: CalculatorPrefill,
  source: AssumptionSource,
): { seeded: string[]; blank: string[] } {
  const setAssumption = useMasterAssumptionStore.getState().setAssumption;
  const seeded: string[] = [];
  const blank: string[] = [];

  for (const req of getRequiredAssumptionsFor(prefill.domain)) {
    const raw = (prefill as unknown as Record<string, unknown>)[req.key];
    const value = raw === undefined || raw === null || raw === '' ? null : (raw as AssumptionValue);

    if (value === null) {
      // Leave unknown fields blank — do not invent.
      setAssumption({
        key: req.key,
        value: null,
        source: 'Blank',
        label: req.label,
        tabDependencies: req.tabs,
        confidence: 'unknown',
      });
      blank.push(req.key);
    } else {
      setAssumption({
        key: req.key,
        value,
        source,
        label: req.label,
        tabDependencies: req.tabs,
      });
      seeded.push(req.key);
    }
  }

  return { seeded, blank };
}

// ----------------------------------------------------------------------------
// Completeness scoring
// ----------------------------------------------------------------------------

export interface CompletenessReport {
  domain: CalculatorDomain;
  totalRequired: number;
  totalKnown: number;
  totalBlank: number;
  totalEstimated: number;
  totalVerified: number;
  scorePct: number;
  missing: Array<{ key: string; label: string; tabs: CalculatorTabKey[] }>;
  estimated: Array<{ key: string; label: string }>;
}

export function computeCompleteness(domain: CalculatorDomain): CompletenessReport {
  const store = useMasterAssumptionStore.getState();
  const required = getRequiredAssumptionsFor(domain);

  let known = 0;
  let blank = 0;
  let estimated = 0;
  let verified = 0;
  const missing: CompletenessReport['missing'] = [];
  const estimatedList: CompletenessReport['estimated'] = [];

  for (const req of required) {
    const rec = store.getRecord(String(req.key));
    const isBlank =
      !rec ||
      rec.source === 'Blank' ||
      rec.value === null ||
      rec.value === '' ||
      rec.value === undefined;

    if (isBlank) {
      blank++;
      missing.push({ key: String(req.key), label: req.label, tabs: req.tabs });
    } else {
      known++;
      if (rec.source === 'AI Estimate') {
        estimated++;
        estimatedList.push({ key: String(req.key), label: req.label });
      }
      if (rec.verificationStatus === 'verified' || rec.source === 'Verified') verified++;
    }
  }

  const total = required.length;
  const scorePct = total === 0 ? 0 : Math.round((known / total) * 100);

  return {
    domain,
    totalRequired: total,
    totalKnown: known,
    totalBlank: blank,
    totalEstimated: estimated,
    totalVerified: verified,
    scorePct,
    missing,
    estimated: estimatedList,
  };
}
