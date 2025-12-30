import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

async function extractWithPerplexity(url: string) {
  const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      error: "PERPLEXITY_API_KEY not configured. Please set it in Supabase secrets.",
    };
  }

  const system =
    "You extract structured property listing details for Australian real estate listings. Be precise; return null when unknown. Do not invent values.";

  const user = `Extract property listing details from this URL: ${url}

Rules:
- Prefer the exact street address as written on the listing.
- If the listing is for a suburb-only page or an area overview (not a single property), set address to null and capture suburb/state/postcode if available.
- Price: return a number in AUD (e.g., 1250000). If only ranges or guides exist, choose the best single estimate.
- Sizes must be in square metres.
- property_type should be one of: house, apartment, townhouse, land, acreage, rural, duplex, villa, other.
- weekly_rent: if the listing mentions rental return, rental estimate, or current lease, extract the weekly amount.
- is_new_build: true if listing mentions "new build", "house & land", "off the plan", "brand new", builder names, or construction terms.
- land_price / build_price: for house & land packages, extract separate land and build components if shown.
- council_rates, water_rates, strata_fees: extract annual amounts if mentioned in the listing.
- insurance_estimate: extract if landlord/building insurance is mentioned.
- property_management_percent: extract if management fees are mentioned (usually 6-10%).
- year_built: extract construction year if mentioned.
- listing_text: include the most relevant summary/excerpt.`;

  const body = {
    model: "sonar-pro",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: 1500,
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
          ],
          additionalProperties: false,
        },
      },
    },
  };

  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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

serve(async (req) => {
  console.log("scrape-property-listing invoked", { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

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

    const result = await extractWithPerplexity(formattedUrl);

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
