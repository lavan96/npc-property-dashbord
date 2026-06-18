/**
 * commercial-global-ai-estimate-engine
 * ---------------------------------------------------------------------------
 * Global AI Estimate Engine for Commercial & Industrial calculators.
 *
 * Returns a rich estimate per requested field including suggested value,
 * range, confidence, data used, missing data, risk notes, source basis,
 * affected tabs and a specialist-review flag.
 *
 * All estimates remain unverified — the caller is responsible for tagging
 * each accepted value with source = 'AI Estimate' in the master store.
 */
import { verifyAuth, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestField {
  key: string;
  label?: string;
  /** Optional hint about expected unit (e.g. 'percent', 'aud', 'sqm') */
  unit?: string;
  /** Optional list of tabs that consume this field */
  affectedTabs?: string[];
}

interface RequestBody {
  domain: 'commercial' | 'industrial';
  propertyId?: string;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  assetType?: string | null;
  assetSubtype?: string | null;
  /** Already-known assumptions the model must NOT re-estimate */
  knownFields?: Record<string, unknown>;
  /** Scraped listing / contract / lease / research extracts */
  context?: {
    scraped?: Record<string, unknown>;
    contract?: Record<string, unknown>;
    lease?: Record<string, unknown>;
    research?: Record<string, unknown>;
    tabOutputs?: Record<string, unknown>;
    comparables?: Array<Record<string, unknown>>;
  };
  /** Fields the caller wants estimated */
  fields: RequestField[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated) return createUnauthorizedResponse(auth.error);

    const body = (await req.json()) as RequestBody;
    if (!Array.isArray(body?.fields) || body.fields.length === 0) {
      return json({ success: true, estimates: [] });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json({ success: false, error: 'LOVABLE_API_KEY not configured' }, 500);

    const systemPrompt = `You are a senior Australian commercial & industrial property analyst.
You generate best-effort ESTIMATES for missing valuation, leasing, finance, tax and physical
attributes for a specific property. You MUST respect these rules:

  1. Use Australian market context (typical AU yields, rents, GST treatment, lending norms).
  2. Use only the supplied context (address, suburb, state, asset type/subtype, known fields,
     scraped, contract, lease, research and comparable data, and prior tab outputs).
  3. Never re-estimate a value already present in knownFields — echo nothing for those keys.
  4. For each requested field produce a structured estimate (see schema below).
  5. Numeric fields: plain numbers (no symbols/commas). Percent fields: decimal e.g. 0.0625.
  6. If you cannot reasonably estimate, return value=null with confidence='low' and explain why
     in riskNotes.
  7. Always flag specialistReview=true for: GST treatment, GST claimability risk, loan
     assumptions, ICR/DSCR thresholds, terminal cap rate, discount rate, contamination/
     environmental, or any field where uncertainty is material.
  8. Return JSON ONLY matching the schema. No prose.`;

    const schemaDescription = `Schema:
{
  "estimates": [
    {
      "key": "<field key>",
      "value": <number|string|boolean|null>,
      "range": { "low": <number|null>, "high": <number|null> },
      "unit": "<percent|aud|aud_per_sqm|sqm|months|ratio|text|null>",
      "confidence": "low"|"medium"|"high",
      "dataUsed": [ "<short bullets of inputs that drove the estimate>" ],
      "missingData": [ "<short bullets of inputs that, if supplied, would tighten the estimate>" ],
      "riskNotes": [ "<short bullets of risks / caveats>" ],
      "sourceBasis": [ "<e.g. AU market benchmark, comparable lease, research engine>" ],
      "affectedTabs": [ "<noi|capRate|icrDscr|gst|borrowing|dcf|tenYearCashFlow|industrialMetrics|overview>" ],
      "specialistReview": true|false,
      "rationale": "<one-line summary>"
    }
  ]
}`;

    const userPrompt = `Domain: ${body.domain}
Asset type: ${body.assetType ?? 'unknown'}
Asset subtype: ${body.assetSubtype ?? 'unknown'}
Address: ${body.address ?? 'unknown'}
Suburb: ${body.suburb ?? 'unknown'}
State: ${body.state ?? 'unknown'}
Postcode: ${body.postcode ?? 'unknown'}

Known fields (do NOT re-estimate):
${JSON.stringify(body.knownFields ?? {}, null, 2)}

Supplementary context:
${JSON.stringify(body.context ?? {}, null, 2)}

Fields to estimate:
${body.fields
  .map(
    (f) =>
      `  - ${f.key}${f.label ? ` (${f.label})` : ''}${f.unit ? ` [unit:${f.unit}]` : ''}${
        f.affectedTabs?.length ? ` [tabs:${f.affectedTabs.join(',')}]` : ''
      }`,
  )
  .join('\n')}

${schemaDescription}`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      if (aiResp.status === 429) return json({ success: false, error: 'Rate limited by AI gateway. Please retry shortly.' }, 429);
      if (aiResp.status === 402) return json({ success: false, error: 'AI credits exhausted. Please top up to continue.' }, 402);
      return json({ success: false, error: `AI gateway error ${aiResp.status}: ${text}` }, 500);
    }

    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? '{}';

    let parsed: { estimates?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(content);
    } catch {
      return json({ success: false, error: 'AI returned malformed JSON', raw: content }, 502);
    }

    const allowed = new Set(body.fields.map((f) => f.key));
    const fieldLookup = new Map(body.fields.map((f) => [f.key, f]));
    const estimates = (parsed.estimates ?? [])
      .filter((e) => e && typeof (e as any).key === 'string' && allowed.has((e as any).key as string))
      .map((e) => {
        const key = (e as any).key as string;
        const reqField = fieldLookup.get(key);
        const conf = String((e as any).confidence ?? 'low').toLowerCase();
        return {
          key,
          value: (e as any).value ?? null,
          range: sanitiseRange((e as any).range),
          unit: typeof (e as any).unit === 'string' ? (e as any).unit : reqField?.unit ?? null,
          confidence: (['low', 'medium', 'high'].includes(conf) ? conf : 'low') as 'low' | 'medium' | 'high',
          dataUsed: arrStr((e as any).dataUsed),
          missingData: arrStr((e as any).missingData),
          riskNotes: arrStr((e as any).riskNotes),
          sourceBasis: arrStr((e as any).sourceBasis, ['AI estimate based on supplied context']),
          affectedTabs: arrStr((e as any).affectedTabs, reqField?.affectedTabs ?? []),
          specialistReview: Boolean((e as any).specialistReview),
          rationale: typeof (e as any).rationale === 'string' ? String((e as any).rationale).slice(0, 320) : null,
        };
      });

    return json({ success: true, estimates });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function arrStr(input: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(input)) return fallback;
  return input
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .map((x) => String(x).slice(0, 240));
}

function sanitiseRange(input: unknown): { low: number | null; high: number | null } {
  if (!input || typeof input !== 'object') return { low: null, high: null };
  const low = (input as any).low;
  const high = (input as any).high;
  return {
    low: typeof low === 'number' && Number.isFinite(low) ? low : null,
    high: typeof high === 'number' && Number.isFinite(high) ? high : null,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
