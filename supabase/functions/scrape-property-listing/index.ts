import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';
import { logApiUsage } from '../_shared/logApiUsage.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PerplexityListingExtraction = {
  title: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  price_aud: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  car_spaces: number | null;
  land_size_sqm: number | null;
  build_size_sqm: number | null;
  property_type: string | null;
  key_features: string[] | null;
  agent_name: string | null;
  agency: string | null;
  listing_text: string | null;
  confidence: number | null;
  // Extended fields for pre-generation overrides
  weekly_rent: number | null;
  is_new_build: boolean | null;
  land_price: number | null;
  build_price: number | null;
  council_rates: number | null;
  water_rates: number | null;
  strata_fees: number | null;
  insurance_estimate: number | null;
  property_management_percent: number | null;
  year_built: number | null;
  asset_class: string | null;
  asset_sub_type: string | null;
  tenure: string | null;
  zoning: string | null;
  gfa_sqm: number | null;
  nla_sqm: number | null;
  gla_sqm: number | null;
  site_area_sqm: number | null;
  parking_bays: number | null;
  current_valuation: number | null;
  property_name: string | null;
  site_cover_pct: number | null;
  office_pct: number | null;
  hardstand_sqm: number | null;
  clearance_metres: number | null;
  power_kva: number | null;
  dock_doors: number | null;
  ground_floor_load_kpa: number | null;
  condition_rating: string | null;
  // ---- Phase: commercial/industrial financial & lease enrichment ----
  detected_asset_class: 'residential' | 'commercial' | 'industrial' | null;
  detected_asset_confidence: number | null;
  passing_noi_pa: number | null;
  market_noi_pa: number | null;
  passing_cap_rate_pct: number | null;
  market_cap_rate_pct: number | null;
  vendor_advised_rent_pa: number | null;
  vendor_advised_outgoings_pa: number | null;
  outgoings_total_pa: number | null;
  outgoings_recoverable_pa: number | null;
  lease_type: string | null;
  lease_expiry_date: string | null;
  lease_options: string | null;
  wale_years: number | null;
  tenant_names: string[] | null;
  gst_treatment: string | null;
  truck_access: string | null;
  vendor_advised_yield_pct: number | null;
};

function normalizeUrl(input: string): string {
  let formattedUrl = input.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }
  // Throws if invalid
  new URL(formattedUrl);
  return formattedUrl;
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function toExtractedDetails(extracted: PerplexityListingExtraction, fallbackTitle?: string | null) {
  const details: any = {};

  const title = extracted.title ?? fallbackTitle ?? null;
  if (title) details.title = title;

  if (extracted.address) details.extractedAddress = extracted.address;
  if (extracted.suburb) details.extractedSuburb = extracted.suburb;
  if (extracted.state) details.extractedState = extracted.state.toUpperCase();
  if (extracted.postcode) details.extractedPostcode = extracted.postcode;

  if (typeof extracted.price_aud === "number") details.extractedPrice = extracted.price_aud;
  if (typeof extracted.bedrooms === "number") details.extractedBedrooms = extracted.bedrooms;
  if (typeof extracted.bathrooms === "number") details.extractedBathrooms = extracted.bathrooms;
  if (typeof extracted.car_spaces === "number") details.extractedCarSpaces = extracted.car_spaces;
  if (typeof extracted.land_size_sqm === "number") details.extractedLandSize = extracted.land_size_sqm;
  if (typeof extracted.build_size_sqm === "number") details.extractedBuildSize = extracted.build_size_sqm;
  if (extracted.property_type) details.extractedPropertyType = extracted.property_type;

  // Extended pre-generation override fields
  if (typeof extracted.weekly_rent === "number") details.extractedWeeklyRent = extracted.weekly_rent;
  if (extracted.is_new_build !== null) details.extractedIsNewBuild = extracted.is_new_build;
  if (typeof extracted.land_price === "number") details.extractedLandPrice = extracted.land_price;
  if (typeof extracted.build_price === "number") details.extractedBuildPrice = extracted.build_price;
  if (typeof extracted.council_rates === "number") details.extractedCouncilRates = extracted.council_rates;
  if (typeof extracted.water_rates === "number") details.extractedWaterRates = extracted.water_rates;
  if (typeof extracted.strata_fees === "number") details.extractedStrataFees = extracted.strata_fees;
  if (typeof extracted.insurance_estimate === "number") details.extractedInsurance = extracted.insurance_estimate;
  if (typeof extracted.property_management_percent === "number") details.extractedPropertyManagementPercent = extracted.property_management_percent;
  if (typeof extracted.year_built === "number") details.extractedYearBuilt = extracted.year_built;

  if (extracted.asset_class) details.extractedAssetClass = extracted.asset_class;
  if (extracted.asset_sub_type) details.extractedAssetSubType = extracted.asset_sub_type;
  if (extracted.tenure) details.extractedTenure = extracted.tenure;
  if (extracted.zoning) details.extractedZoning = extracted.zoning;
  if (typeof extracted.gfa_sqm === "number") details.extractedGfaSqm = extracted.gfa_sqm;
  if (typeof extracted.nla_sqm === "number") details.extractedNlaSqm = extracted.nla_sqm;
  if (typeof extracted.gla_sqm === "number") details.extractedGlaSqm = extracted.gla_sqm;
  if (typeof extracted.site_area_sqm === "number") details.extractedSiteAreaSqm = extracted.site_area_sqm;
  if (typeof extracted.parking_bays === "number") details.extractedParkingBays = extracted.parking_bays;
  if (typeof extracted.current_valuation === "number") details.extractedValuation = extracted.current_valuation;
  if (extracted.property_name) details.extractedPropertyName = extracted.property_name;
  if (typeof extracted.site_cover_pct === "number") details.extractedSiteCoverPct = extracted.site_cover_pct;
  if (typeof extracted.office_pct === "number") details.extractedOfficePct = extracted.office_pct;
  if (typeof extracted.hardstand_sqm === "number") details.extractedHardstandSqm = extracted.hardstand_sqm;
  if (typeof extracted.clearance_metres === "number") details.extractedClearanceMetres = extracted.clearance_metres;
  if (typeof extracted.power_kva === "number") details.extractedPowerKva = extracted.power_kva;
  if (typeof extracted.dock_doors === "number") details.extractedDockDoors = extracted.dock_doors;
  if (typeof extracted.ground_floor_load_kpa === "number") details.extractedGroundFloorLoadKpa = extracted.ground_floor_load_kpa;
  if (extracted.condition_rating) details.extractedConditionRating = extracted.condition_rating;
  // Commercial/industrial enrichment passthrough
  if (extracted.detected_asset_class) details.detectedAssetClass = extracted.detected_asset_class;
  if (typeof extracted.detected_asset_confidence === 'number') details.detectedAssetConfidence = extracted.detected_asset_confidence;
  if (typeof extracted.passing_noi_pa === 'number') details.extractedPassingNoiPa = extracted.passing_noi_pa;
  if (typeof extracted.market_noi_pa === 'number') details.extractedMarketNoiPa = extracted.market_noi_pa;
  if (typeof extracted.passing_cap_rate_pct === 'number') details.extractedPassingCapRatePct = extracted.passing_cap_rate_pct;
  if (typeof extracted.market_cap_rate_pct === 'number') details.extractedMarketCapRatePct = extracted.market_cap_rate_pct;
  if (typeof extracted.vendor_advised_rent_pa === 'number') details.extractedVendorRentPa = extracted.vendor_advised_rent_pa;
  if (typeof extracted.vendor_advised_outgoings_pa === 'number') details.extractedVendorOutgoingsPa = extracted.vendor_advised_outgoings_pa;
  if (typeof extracted.outgoings_total_pa === 'number') details.extractedOutgoingsTotalPa = extracted.outgoings_total_pa;
  if (typeof extracted.outgoings_recoverable_pa === 'number') details.extractedOutgoingsRecoverablePa = extracted.outgoings_recoverable_pa;
  if (extracted.lease_type) details.extractedLeaseType = extracted.lease_type;
  if (extracted.lease_expiry_date) details.extractedLeaseExpiryDate = extracted.lease_expiry_date;
  if (extracted.lease_options) details.extractedLeaseOptions = extracted.lease_options;
  if (typeof extracted.wale_years === 'number') details.extractedWaleYears = extracted.wale_years;
  if (Array.isArray(extracted.tenant_names) && extracted.tenant_names.length) details.extractedTenantNames = extracted.tenant_names;
  if (extracted.gst_treatment) details.extractedGstTreatment = extracted.gst_treatment;
  if (extracted.truck_access) details.extractedTruckAccess = extracted.truck_access;
  if (typeof extracted.vendor_advised_yield_pct === 'number') details.extractedVendorYieldPct = extracted.vendor_advised_yield_pct;

  // If we have suburb/state/postcode but no address, build a partial address.
  if (!details.extractedAddress && details.extractedSuburb && details.extractedState) {
    details.extractedAddress = `${details.extractedSuburb}, ${details.extractedState}${details.extractedPostcode ? " " + details.extractedPostcode : ""}`;
  }

  return details;
}

function buildListingMarkdown(inputUrl: string, extracted: PerplexityListingExtraction, citations: string[] | undefined) {
  const lines: string[] = [];
  lines.push(`# Property Listing (AI extracted)`);
  lines.push(`Source URL: ${inputUrl}`);
  if (citations?.length) {
    lines.push(``);
    lines.push(`## Citations`);
    for (const c of citations) lines.push(`- ${c}`);
  }

  lines.push(``);
  lines.push(`## Extracted Details`);
  const add = (label: string, value: any) => {
    if (value === null || value === undefined || value === "") return;
    lines.push(`- **${label}:** ${value}`);
  };

  add("Title", extracted.title);
  add("Address", extracted.address);
  add("Suburb", extracted.suburb);
  add("State", extracted.state);
  add("Postcode", extracted.postcode);
  add("Price (AUD)", extracted.price_aud ? `$${Math.round(extracted.price_aud).toLocaleString("en-AU")}` : null);
  add("Bedrooms", extracted.bedrooms);
  add("Bathrooms", extracted.bathrooms);
  add("Car spaces", extracted.car_spaces);
  add("Land size (sqm)", extracted.land_size_sqm);
  add("Build size (sqm)", extracted.build_size_sqm);
  add("Property type", extracted.property_type);
  add("Agent", extracted.agent_name);
  add("Agency", extracted.agency);
  add("Confidence", extracted.confidence);

  if (extracted.key_features?.length) {
    lines.push(``);
    lines.push(`## Key Features`);
    for (const f of extracted.key_features) lines.push(`- ${f}`);
  }

  if (extracted.listing_text) {
    lines.push(``);
    lines.push(`## Listing Text (summary / relevant excerpt)`);
    lines.push(extracted.listing_text);
  }

  return lines.join("\n");
}

async function scrapeWithFirecrawl(url: string): Promise<{ markdown: string; title?: string; description?: string } | null> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    console.warn("[scrape-property-listing] FIRECRAWL_API_KEY not set — skipping page scrape, falling back to URL-only extraction.");
    return null;
  }
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html", "links"],
        onlyMainContent: false,
        waitFor: 5000,
        timeout: 45000,
        mobile: false,
        location: { country: "AU", languages: ["en-AU", "en"] },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[scrape-property-listing] Firecrawl failed", resp.status, t.slice(0, 300));
      return null;
    }
    const j = await resp.json();
    const root = j?.data ?? j;
    const markdownParts = [root?.markdown, root?.html ? `\n\n## Raw HTML text fallback\n${String(root.html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}` : ''].filter(Boolean);
    const markdown: string = markdownParts.join('\n\n');
    const title: string | undefined = root?.metadata?.title;
    const description: string | undefined = root?.metadata?.description;
    if (!markdown || markdown.length < 80) {
      console.warn("[scrape-property-listing] Firecrawl returned empty/short markdown:", markdown.length);
      return null;
    }
    return { markdown, title, description };
  } catch (e) {
    console.error("[scrape-property-listing] Firecrawl exception", e);
    return null;
  }
}

async function extractWithPerplexity(url: string, propertyCategory = 'auto') {
  const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      error: "PERPLEXITY_API_KEY not configured. Please set it in Supabase secrets.",
    };
  }

  // Step 1: scrape the actual page so the model extracts from real content
  // instead of hallucinating from a URL slug.
  const scraped = await scrapeWithFirecrawl(url);
  const pageContent = scraped?.markdown ?? null;
  if (pageContent) {
    console.log(`[scrape-property-listing] Firecrawl markdown length: ${pageContent.length}`);
  }

  const system = [
    "You extract structured property listing details for Australian real estate listings across RESIDENTIAL, COMMERCIAL and INDUSTRIAL asset classes.",
    "STEP 1 — DETECT ASSET CLASS: First determine detected_asset_class ∈ {residential | commercial | industrial} from explicit signals in the source (zoning code like B6/IN1/IN2, terms like 'NLA', 'GFA', 'cap rate', 'WALE', 'outgoings', 'going concern', 'tenant', 'lease', 'warehouse', 'office', 'retail', 'industrial estate', dock doors, clearance, kVA). Set detected_asset_confidence 0–1. If the user-provided hint says 'auto' (default), trust your detection. If the hint is a specific class, you may still override when evidence clearly contradicts it.",
    "STEP 2 — STRICT EXTRACTION: Only extract values explicitly stated in the source. NEVER guess, NEVER infer from URL slugs, NEVER carry over examples.",
    "STEP 3 — NUMBER FORMATTING: Raw integers/decimals only (no $, commas, % signs). Convert sqft→sqm (×0.0929), ha→sqm (×10000), psm/pa rent to total pa when GLA/NLA given.",
    "STEP 4 — DO NOT FABRICATE agents, prices, sizes, features, tenants, cap rates, NOI, WALE, or yields. Return null when uncertain.",
  ].join('\n');

  const sourceBlock = pageContent
    ? `SOURCE CONTENT (scraped from the listing page — extract ONLY from this text):\n\n---\n${pageContent.slice(0, 32000)}\n---\n\n`
    : `NOTE: The listing page could not be scraped directly. Use web search to locate the listing at the exact URL below. If you cannot confirm a value from the actual listing, return null for that field — do not guess.\n\n`;

  const user = `${sourceBlock}URL: ${url}
Property category hint: ${propertyCategory} ${propertyCategory === 'auto' ? '(auto-detect from content)' : ''}

============= UNIVERSAL FIELDS =============
- address: exact street address as written on the listing. For suburb-only/area pages, set null and only fill suburb/state/postcode.
- price_aud: raw integer in AUD. Skip "Contact Agent"/"Offers over"/"Auction" unless an explicit number is shown. If a range is given, use the midpoint.
- Sizes (land_size_sqm, build_size_sqm, gfa_sqm, nla_sqm, gla_sqm, site_area_sqm, hardstand_sqm): convert to sqm. Only if explicitly stated.
- property_type: residential => house/apartment/townhouse/villa/unit/land/duplex; commercial/industrial => office/retail/warehouse/logistics/manufacturing/mixed_use/medical/childcare/hospitality/other.
- detected_asset_class & detected_asset_confidence: per STEP 1.
- agent_name, agency, key_features (max 10), listing_text (2–4 sentence neutral summary), confidence (0–1).

============= RESIDENTIAL ONLY =============
- bedrooms / bathrooms / car_spaces: integers shown on the listing.
- weekly_rent: only if listing states rental return / current lease / rental estimate. Convert monthly (×12/52) or annual (÷52).
- is_new_build: true ONLY if "brand new", "new build", "house & land", "off the plan", or a builder is explicitly named.
- land_price / build_price: only for explicit H&L packages with split pricing.
- council_rates / water_rates / strata_fees / insurance_estimate (annual AUD); property_management_percent; year_built. Only if explicit.

============= COMMERCIAL & INDUSTRIAL =============
Structure:
- asset_class: office | retail | industrial | mixed_use | medical | childcare | hospitality | other.
- asset_sub_type: free-text (e.g. "Distribution Warehouse", "A-Grade Office", "Childcare").
- tenure: freehold | leasehold | strata. zoning: planning code as printed.
- property_name (estate/building name), parking_bays, current_valuation (only if explicit).

Areas:
- gfa_sqm (Gross Floor Area), nla_sqm (Net Lettable Area — offices/retail), gla_sqm (Gross Lettable Area — industrial), site_area_sqm, hardstand_sqm.
- site_cover_pct, office_pct.

Industrial specs:
- clearance_metres (eaves height / internal clearance), power_kva (or convert amps×0.69 if voltage given), dock_doors (recessed loading docks + roller doors), ground_floor_load_kpa, truck_access (poor/average/good/excellent if stated), condition_rating (A/B/C/D if explicitly graded).

Lease & income (CRITICAL — only when explicitly stated in source):
- passing_noi_pa: net operating income p.a. as stated.
- market_noi_pa: vendor-quoted "market" or "estimated" NOI.
- passing_cap_rate_pct & market_cap_rate_pct: as a percent number (e.g. 6.25).
- vendor_advised_rent_pa: vendor-quoted gross or net rent p.a.
- vendor_advised_outgoings_pa: total outgoings stated.
- outgoings_total_pa & outgoings_recoverable_pa: separate if both shown.
- lease_type: gross | net | semi_gross | triple_net | NNN | as printed.
- lease_expiry_date: ISO format yyyy-mm-dd if stated.
- lease_options: e.g. "3 + 3 + 3 years" or "two 5-year options".
- wale_years: weighted average lease expiry in years (numeric).
- tenant_names: array of named tenants (max 5).
- vendor_advised_yield_pct: vendor-quoted yield as percent.
- gst_treatment: going_concern | margin_scheme | standard | input_taxed (lowercase snake_case).

Return null for any field not present in the source.`;

  const body = {
    model: "sonar-pro",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.05,
    max_tokens: 4000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "property_listing_extraction",
        schema: {
          type: "object",
          properties: {
            title: { type: ["string", "null"] },
            address: { type: ["string", "null"] },
            suburb: { type: ["string", "null"] },
            state: { type: ["string", "null"] },
            postcode: { type: ["string", "null"] },
            price_aud: { type: ["number", "null"] },
            bedrooms: { type: ["number", "null"] },
            bathrooms: { type: ["number", "null"] },
            car_spaces: { type: ["number", "null"] },
            land_size_sqm: { type: ["number", "null"] },
            build_size_sqm: { type: ["number", "null"] },
            property_type: { type: ["string", "null"] },
            key_features: { type: ["array", "null"], items: { type: "string" } },
            agent_name: { type: ["string", "null"] },
            agency: { type: ["string", "null"] },
            listing_text: { type: ["string", "null"] },
            confidence: { type: ["number", "null"] },
            // Extended fields
            weekly_rent: { type: ["number", "null"] },
            is_new_build: { type: ["boolean", "null"] },
            land_price: { type: ["number", "null"] },
            build_price: { type: ["number", "null"] },
            council_rates: { type: ["number", "null"] },
            water_rates: { type: ["number", "null"] },
            strata_fees: { type: ["number", "null"] },
            insurance_estimate: { type: ["number", "null"] },
            property_management_percent: { type: ["number", "null"] },
            year_built: { type: ["number", "null"] },
            asset_class: { type: ["string", "null"] },
            asset_sub_type: { type: ["string", "null"] },
            tenure: { type: ["string", "null"] },
            zoning: { type: ["string", "null"] },
            gfa_sqm: { type: ["number", "null"] },
            nla_sqm: { type: ["number", "null"] },
            gla_sqm: { type: ["number", "null"] },
            site_area_sqm: { type: ["number", "null"] },
            parking_bays: { type: ["number", "null"] },
            current_valuation: { type: ["number", "null"] },
            property_name: { type: ["string", "null"] },
            site_cover_pct: { type: ["number", "null"] },
            office_pct: { type: ["number", "null"] },
            hardstand_sqm: { type: ["number", "null"] },
            clearance_metres: { type: ["number", "null"] },
            power_kva: { type: ["number", "null"] },
            dock_doors: { type: ["number", "null"] },
            ground_floor_load_kpa: { type: ["number", "null"] },
            condition_rating: { type: ["string", "null"] },
            detected_asset_class: { type: ["string", "null"] },
            detected_asset_confidence: { type: ["number", "null"] },
            passing_noi_pa: { type: ["number", "null"] },
            market_noi_pa: { type: ["number", "null"] },
            passing_cap_rate_pct: { type: ["number", "null"] },
            market_cap_rate_pct: { type: ["number", "null"] },
            vendor_advised_rent_pa: { type: ["number", "null"] },
            vendor_advised_outgoings_pa: { type: ["number", "null"] },
            outgoings_total_pa: { type: ["number", "null"] },
            outgoings_recoverable_pa: { type: ["number", "null"] },
            lease_type: { type: ["string", "null"] },
            lease_expiry_date: { type: ["string", "null"] },
            lease_options: { type: ["string", "null"] },
            wale_years: { type: ["number", "null"] },
            tenant_names: { type: ["array", "null"], items: { type: "string" } },
            gst_treatment: { type: ["string", "null"] },
            truck_access: { type: ["string", "null"] },
            vendor_advised_yield_pct: { type: ["number", "null"] },
          },
          required: [
            "title",
            "address",
            "suburb",
            "state",
            "postcode",
            "price_aud",
            "bedrooms",
            "bathrooms",
            "car_spaces",
            "land_size_sqm",
            "build_size_sqm",
            "property_type",
            "key_features",
            "agent_name",
            "agency",
            "listing_text",
            "confidence",
            "weekly_rent",
            "is_new_build",
            "land_price",
            "build_price",
            "council_rates",
            "water_rates",
            "strata_fees",
            "insurance_estimate",
            "property_management_percent",
            "year_built",
            "asset_class",
            "asset_sub_type",
            "tenure",
            "zoning",
            "gfa_sqm",
            "nla_sqm",
            "gla_sqm",
            "site_area_sqm",
            "parking_bays",
            "current_valuation",
            "property_name",
            "site_cover_pct",
            "office_pct",
            "hardstand_sqm",
            "clearance_metres",
            "power_kva",
            "dock_doors",
            "ground_floor_load_kpa",
            "condition_rating",
            "detected_asset_class",
            "detected_asset_confidence",
            "passing_noi_pa",
            "market_noi_pa",
            "passing_cap_rate_pct",
            "market_cap_rate_pct",
            "vendor_advised_rent_pa",
            "vendor_advised_outgoings_pa",
            "outgoings_total_pa",
            "outgoings_recoverable_pa",
            "lease_type",
            "lease_expiry_date",
            "lease_options",
            "wale_years",
            "tenant_names",
            "gst_treatment",
            "truck_access",
            "vendor_advised_yield_pct",
          ],
          additionalProperties: false,
        },
      },
    },
  };

  // Call Perplexity DIRECTLY (bypass router) so structured JSON schema is preserved
  // and we guarantee sonar-pro is used. The LLM router's native Perplexity caller
  // drops `response_format`, which would lose DB-schema-aligned JSON enforcement.
  const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
  if (!perplexityKey) {
    return { ok: false as const, status: 500, error: 'PERPLEXITY_API_KEY not configured', raw: '' };
  }

  const pplxResp = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${perplexityKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const rawText = await pplxResp.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // keep raw
  }

  if (!pplxResp.ok) {
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      `Perplexity request failed with status ${pplxResp.status}`;

    return { ok: false as const, status: pplxResp.status, error: message, raw: rawText };
  }

  const content = parsed?.choices?.[0]?.message?.content as string | undefined;
  const finishReason = parsed?.choices?.[0]?.finish_reason;
  if (finishReason && finishReason !== "stop") {
    console.warn(`[scrape-property-listing] LLM finish_reason=${finishReason} (possible truncation)`);
  }
  const extracted = content ? safeJsonParse<PerplexityListingExtraction>(content) : null;

  if (!extracted) {
    return {
      ok: false as const,
      status: 500,
      error: "Perplexity response could not be parsed as structured extraction.",
      raw: rawText,
    };
  }

  const citations = (parsed?.citations as string[] | undefined) ?? [];

  return {
    ok: true as const,
    extracted,
    citations,
    raw: parsed,
    scrapedFromPage: !!pageContent,
  };
}

async function runScrapeJob(
  supabase: any,
  jobId: string,
  formattedUrl: string,
  propertyCategory: string,
  userId: string | null,
) {
  try {
    await supabase.from('property_scrape_jobs').update({
      status: 'processing',
      started_at: new Date().toISOString(),
    }).eq('id', jobId);

    const result = await extractWithPerplexity(formattedUrl, propertyCategory);

    if (!result.ok) {
      const status = result.status;
      const friendly =
        status === 429
          ? "Perplexity rate limit exceeded (429). Please wait and try again."
          : status === 402
            ? "Perplexity credits exhausted (402). Please top up or change plan."
            : result.error;
      await supabase.from('property_scrape_jobs').update({
        status: 'failed',
        error: friendly,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      return;
    }

    const extractedDetails = toExtractedDetails(result.extracted, result.extracted.title);
    const markdown = buildListingMarkdown(formattedUrl, result.extracted, result.citations);
    const metadata = {
      title: result.extracted.title,
      description: result.extracted.listing_text,
      provider: result.scrapedFromPage ? "firecrawl+perplexity" : "perplexity",
      scrapedFromPage: result.scrapedFromPage,
      citations: result.citations,
      confidence: result.extracted.confidence,
    };

    const rawUsage = result.raw?.usage;
    try {
      await logApiUsage(supabase, {
        service_name: 'perplexity',
        endpoint: '/chat/completions',
        model_used: 'sonar-pro',
        prompt_tokens: rawUsage?.prompt_tokens || 0,
        completion_tokens: rawUsage?.completion_tokens || 0,
        tokens_used: rawUsage?.total_tokens || 0,
        status: 'success',
        user_id: userId || undefined,
        metadata: { function: 'scrape-property-listing', url: formattedUrl, jobId },
      });
    } catch (_) { /* non-fatal */ }

    await supabase.from('property_scrape_jobs').update({
      status: 'succeeded',
      result: { markdown, metadata, extractedDetails, sourceUrl: formattedUrl },
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scrape job failed unexpectedly';
    console.error('[scrape-property-listing] background job error:', message);
    await supabase.from('property_scrape_jobs').update({
      status: 'failed',
      error: message,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  console.log("scrape-property-listing invoked", { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { url, propertyCategory = 'auto', jobId } = body ?? {};

    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[scrape-property-listing] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    // ── STATUS POLL ──────────────────────────────────────────────
    if (jobId && typeof jobId === 'string') {
      const { data: job, error: jobErr } = await supabase
        .from('property_scrape_jobs')
        .select('id, status, error, result, url, property_category, created_at, started_at, completed_at, user_id')
        .eq('id', jobId)
        .maybeSingle();

      if (jobErr || !job) {
        return new Response(JSON.stringify({ success: false, error: 'Job not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (job.user_id && userId && job.user_id !== userId) {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const payload: any = {
        success: true,
        jobId: job.id,
        status: job.status,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
      };
      if (job.status === 'succeeded') payload.data = job.result;
      if (job.status === 'failed') payload.error = job.error || 'Scrape failed';
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── START NEW JOB ───────────────────────────────────────────
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ success: false, error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let formattedUrl: string;
    try {
      formattedUrl = normalizeUrl(url);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: insertErr } = await supabase
      .from('property_scrape_jobs')
      .insert({
        user_id: userId,
        url: formattedUrl,
        property_category: propertyCategory,
        status: 'queued',
      })
      .select('id')
      .single();

    if (insertErr || !job) {
      console.error('[scrape-property-listing] failed to enqueue job:', insertErr);
      return new Response(JSON.stringify({ success: false, error: insertErr?.message || 'Failed to enqueue scrape job' }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget background processing — survives past the HTTP response.
    const bg = runScrapeJob(supabase, job.id, formattedUrl, propertyCategory, userId ?? null);
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) {
      // @ts-ignore
      (EdgeRuntime as any).waitUntil(bg);
    } else {
      bg.catch((e) => console.error('[scrape-property-listing] detached bg error:', e));
    }

    return new Response(JSON.stringify({
      success: true,
      jobId: job.id,
      status: 'queued',
      message: 'Scrape job accepted. Poll with { jobId } for status.',
    }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in scrape-property-listing:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to scrape property listing";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
