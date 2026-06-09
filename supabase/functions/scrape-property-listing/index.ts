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
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 2500,
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
    const markdown: string = root?.markdown || "";
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

async function extractWithPerplexity(url: string, propertyCategory = 'residential') {
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

  const system =
    "You extract structured property listing details for Australian real estate listings. CRITICAL RULES: (1) Only extract values explicitly stated in the provided source content. (2) When a field is not clearly present, return null — never guess, never infer from URL slugs, never carry over examples. (3) Numbers must be raw integers/decimals without thousands separators or currency symbols (e.g. 1250000 not \"$1,250,000\"). (4) Never invent agents, prices, sizes, or features.";

  const sourceBlock = pageContent
    ? `SOURCE CONTENT (scraped from the listing page — extract ONLY from this text):\n\n---\n${pageContent.slice(0, 18000)}\n---\n\n`
    : `NOTE: The listing page could not be scraped directly. Use web search to locate the listing at the exact URL below. If you cannot confirm a value from the actual listing, return null for that field — do not guess.\n\n`;

  const user = `${sourceBlock}URL: ${url}
Property category hint: ${propertyCategory}

Extraction rules:
- address: exact street address as written on the listing. For suburb-only/area pages, set null and only fill suburb/state/postcode.
- price_aud: raw integer in AUD (e.g. 1250000). Skip "Contact Agent"/"Offers over"/"Auction" unless an explicit number is shown. If a range is given, use the midpoint.
- bedrooms/bathrooms/car_spaces: only the integers shown on the listing specs.
- Sizes (land_size_sqm, build_size_sqm, gfa_sqm, nla_sqm, gla_sqm, site_area_sqm, hardstand_sqm): convert to sqm (1 ha = 10000 sqm; 1 sqft = 0.0929 sqm). Only if explicitly stated.
- property_type: residential => house/apartment/townhouse/villa/unit/land/duplex; commercial/industrial => office/retail/warehouse/logistics/manufacturing/mixed_use/medical/childcare/hospitality/other.
- For commercial/industrial: only extract asset_class, asset_sub_type, tenure, zoning, GFA/NLA/GLA, site_area_sqm, parking_bays, current_valuation, property_name, site_cover_pct, office_pct, hardstand_sqm, clearance_metres, power_kva, dock_doors, ground_floor_load_kpa, condition_rating when explicitly stated.
- weekly_rent: only if listing states rental return / current lease / rental estimate. Convert monthly (×12/52) or annual (÷52) only for the same property.
- is_new_build: true ONLY if "brand new", "new build", "house & land", "off the plan", or a builder is explicitly named.
- land_price / build_price: only for explicit H&L packages with split pricing.
- council_rates, water_rates, strata_fees: annual AUD amounts, only if explicitly stated.
- insurance_estimate, property_management_percent, year_built: only if explicitly stated.
- agent_name, agency: only if visible.
- key_features: short bullet list from the listing's features section (max 10).
- listing_text: 2–4 sentence summary using only facts from the source.
- confidence: 0.0–1.0 self-rating of extraction accuracy.

Return null for any field not present in the source.`;

  const body = {
    model: "sonar-pro",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: 2200,
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
          ],
          additionalProperties: false,
        },
      },
    },
  };

  const { callLLMRaw } = await import('../_shared/llmRouter.ts');
  const routerResp = await callLLMRaw({
    agentKey: 'listing_scrape',
    messages: body.messages as any,
    temperature: body.temperature,
    maxTokens: body.max_tokens,
    responseFormat: body.response_format,
  });
  const resp = { ok: routerResp.ok, status: routerResp.status, json: routerResp.json, text: routerResp.text } as any;

  const rawText = await resp.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // keep raw
  }

  if (!resp.ok) {
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      `Perplexity request failed with status ${resp.status}`;

    return { ok: false as const, status: resp.status, error: message, raw: rawText };
  }

  const content = parsed?.choices?.[0]?.message?.content as string | undefined;
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
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  console.log("scrape-property-listing invoked", { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const body = await req.json();
    const { url, propertyCategory = 'residential' } = body;
    
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[scrape-property-listing] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[scrape-property-listing] Authenticated user: ${userId}`);

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

    console.log("Using Perplexity macro extraction for URL:", formattedUrl);

    const result = await extractWithPerplexity(formattedUrl, propertyCategory);

    if (!result.ok) {
      console.error("Perplexity extraction error:", result.status, result.error);

      // Surface rate-limit/credits cleanly
      const status = result.status;
      const friendly =
        status === 429
          ? "Perplexity rate limit exceeded (429). Please wait and try again."
          : status === 402
            ? "Perplexity credits exhausted (402). Please top up or change plan."
            : result.error;

      return new Response(JSON.stringify({ success: false, error: friendly }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extractedDetails = toExtractedDetails(result.extracted, result.extracted.title);

    const markdown = buildListingMarkdown(formattedUrl, result.extracted, result.citations);

    const metadata = {
      title: result.extracted.title,
      description: result.extracted.listing_text,
      provider: "perplexity",
      citations: result.citations,
      confidence: result.extracted.confidence,
    };

    console.log("Perplexity extraction success", {
      hasAddress: !!extractedDetails.extractedAddress,
      hasPrice: typeof extractedDetails.extractedPrice === "number",
      markdownLength: markdown.length,
      citations: result.citations.length,
    });

    // Log Perplexity API usage
    const rawUsage = result.raw?.usage;
    await logApiUsage(supabase, {
      service_name: 'perplexity',
      endpoint: '/chat/completions',
      model_used: 'sonar-pro',
      prompt_tokens: rawUsage?.prompt_tokens || 0,
      completion_tokens: rawUsage?.completion_tokens || 0,
      tokens_used: rawUsage?.total_tokens || 0,
      status: 'success',
      user_id: userId || undefined,
      metadata: { function: 'scrape-property-listing', url: formattedUrl },
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          markdown,
          metadata,
          extractedDetails,
          sourceUrl: formattedUrl,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in scrape-property-listing:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to scrape property listing";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
